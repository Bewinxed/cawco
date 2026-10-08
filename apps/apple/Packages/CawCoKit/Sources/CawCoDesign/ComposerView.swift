import CawCoCore
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import UniformTypeIdentifiers

/// Something the turn carries beside its typed words (Composer.svelte
/// `draft.images` / `draft.texts` / `draft.files`): an image, a text the
/// reader attached or pasted at length, or any other file, which uploads to
/// the hub as soon as it is attached and rides the send as its reference.
public enum ComposerAttachment: Sendable, Equatable {
    case image(name: String, mediaType: String, data: Data)
    case text(name: String, content: String)
    /// `id` follows the file through its upload.
    case file(id: String, name: String, mediaType: String, size: Int, state: FileState)
    /// A pick or a paste still being read off its source: it holds its place
    /// in the draft, under its own `id`, until what it becomes takes that
    /// place (`SessionComposerBinding.resolve`). Nothing sends meanwhile, and
    /// a read that lands after its place has gone (removed, or sent) is dropped.
    case pending(id: String, name: String)

    /// Where a file's upload stands.
    public enum FileState: Sendable, Equatable {
        /// How far it has gone, 0 to 1.
        case uploading(Double)
        /// The hub has it, under this reference.
        case ready(String)
        case failed(String)
    }

    public var name: String {
        switch self {
        case let .image(name, _, _), let .text(name, _), let .file(_, name, _, _, _), let .pending(_, name): name
        }
    }

    /// Its own place in the draft, for a file or a pick still being read.
    var slot: String? {
        switch self {
        case let .file(id, _, _, _, _), let .pending(id, _): id
        case .image, .text: nil
        }
    }

    /// Not yet something a send can carry: a pick still being read, or a
    /// file the hub does not have (uploading, or failed).
    var isUnready: Bool {
        switch self {
        case .pending: true
        case .file(_, _, _, _, .ready): false
        case .file: true
        case .image, .text: false
        }
    }

    /// The same chip as `other`: the same kind of attachment, and for a file the same file.
    func sameChip(as other: ComposerAttachment) -> Bool {
        switch (self, other) {
        case let (.file(a, _, _, _, _), .file(b, _, _, _, _)): a == b
        default: self == other
        }
    }
}

/// The floating composer (transcript/Composer.svelte), one shape always:
///
/// - The pill (`.cin`): radius 12, a 1pt control border and the tile shadow,
///   on the panel material (the raised surface at 72% over a blur), opaque
///   raised under Reduce Transparency. 7pt in, 11pt at the start.
/// - The field grows a line at a time from 34pt to 200pt over `durControl`
///   and scrolls past that with its edges fading; it never changes the pill's
///   radius or padding on focus. A draft of several lines folds to its first
///   line, "+N lines" on its faded end, when the field is not being written
///   in, and opens again over `durMorph`.
/// - History, Attach and Send/Stop are 34pt boxes (radius 12 − 7),
///   bottom-aligned, 10pt apart. History opens the recall wheel
///   (ComposerRecall.swift). Send and Stop are one box: its glyph swaps (`icon-swap`:
///   opacity, scale 0.25→1, a 4pt blur clearing) over `durControl`, a spinner
///   while the send is in flight; empty and idle it rests at 55% with no
///   gradient. Both scale to `pressScale` under the finger.
/// - Parked prompts stand in their own column above (`prompts`), 11pt apart,
///   so a card coming or going never moves the pill.
/// - Recall (composer-recall, "Wheel"): ↑ in an empty field or with the
///   caret at its start, the history button, or a hold on the composer while
///   the keyboard is down brings up what the reader sent here; ↑ in an empty
///   field while their newest message is queued and can be withdrawn lifts
///   that message's words into the field to edit instead (ComposerQueuedEdit.swift).
@MainActor
public final class ComposerView: UIView, UITextViewDelegate, UIGestureRecognizerDelegate {
    /// What the action box does now.
    public enum Action: Equatable, Sendable {
        case send
        case stop
        /// The last send is still out: the box spins and takes no press.
        case sending
    }

    public static let hintShort = "Message the agent…"

    /// The conversation this composer writes to: the group's active tab.
    public private(set) var binding: SessionComposerBinding?
    /// The composer's height changed (a line, a fold, a card, a chip).
    public var onHeight: () -> Void = {}
    /// A swipe is carrying the conversation: nothing sends until it lands.
    public var held = false {
        didSet { if held != oldValue { renderAction(animated: window != nil) } }
    }

    public var isWriting: Bool { field.isFirstResponder }

    /// The row standing on the composer, outside its box (Composer.svelte
    /// `.lift`): the delegate tray's fixed row. Prompts stand on top of it.
    /// Its host puts the row in and shows it; it is kept clear at every
    /// transcript's foot with the rest of the composer's height.
    public let lift = UIView()

    /// The parked permission and question cards, standing on the pill.
    private let prompts = UIStackView()
    private var action: Action = .send
    private var writable = false
    /// Why Send cannot work now; the box wears the warning state meanwhile.
    private var block: SendBlock?
    /// The reason whose menu the action box holds, if it holds one.
    private var shownMenuReason: String?
    private var attachments: [ComposerAttachment] = [] {
        didSet { renderAttachments() }
    }

    private let column = UIStackView()
    private let error = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var errorBox: UIView?
    private let chips = UIStackView()
    private let chipsRow = UIScrollView()
    let ring = UIView()
    let pill = UIView()
    private let material = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
    private let tint = UIView()
    let field = ComposerField(usingTextLayoutManager: true)
    private let hint = KitLabel(ComposerView.fieldRole, ink: Palette.inkMuted, tracking: -0.01)
    private let more = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let attach = PressBox()
    /// Opens the recall wheel (composer-recall `#history-btn`).
    let historyBox = PressBox()
    private let actionBox = PressBox()
    private let gradient = CAGradientLayer()
    private var glyph: SwapGlyph?
    private var fieldHeight: NSLayoutConstraint!
    private var folded = false
    private var lines = 1

    /// The recall wheel, while it is up (and while it folds away).
    private(set) var wheel: RecallWheel?
    /// A queued message being edited, while its words are in the field.
    private(set) var edit: QueuedEdit?
    /// While it is grown, the grown shape is the composer: the pill's own
    /// surface steps aside (`.cin.wheeling`, `.cin.grown`).
    var grown = false {
        didSet { if grown != oldValue { paint() } }
    }
    private let holdPress = UILongPressGestureRecognizer()

    /// The field's face: the body face at 16pt on the UI leading (20pt lines).
    static let fieldRole = TypeRole(weight: .regular, size: 16 ... 16, leading: TypeScale.leadingUi, family: FontFamily.fontBody)
    static let ceiling = 200.0

    /// What the field types in: the role's face and line height, wrapping by word.
    static var typing: [NSAttributedString.Key: Any] {
        let font = fieldRole.font
        return [
            .font: font,
            .foregroundColor: Palette.inkStrong,
            .paragraphStyle: LineBox.textView(font, height: fieldRole.lineHeight),
        ]
    }
    /// The folded line's end that "+N lines" stands on (`--more-room`, 4.5rem).
    static let moreRoom = 72.0
    private static let control = Size.cComposerField
    private static let inset = Size.cComposerInset

    override public init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        column.axis = .vertical
        column.spacing = Space.space3
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        prompts.axis = .vertical
        prompts.spacing = Space.space3
        prompts.isHidden = true
        column.addArrangedSubview(prompts)
        column.addArrangedSubview(lift)
        // The row stands on the composer itself, with nothing between.
        column.setCustomSpacing(0, after: lift)
        lift.isHidden = true
        // The cards keep a step off the pill (`.stack` padding, `.prompts` margin).
        column.setCustomSpacing(Space.space3 + Space.space4 - Space.space2, after: prompts)

        error.isHidden = true
        error.wrap = .pretty
        error.accessibilityTraits = .updatesFrequently
        let errorBox = UIView()
        errorBox.addSubview(error)
        NSLayoutConstraint.activate([
            error.leadingAnchor.constraint(equalTo: errorBox.leadingAnchor, constant: Space.space3),
            error.trailingAnchor.constraint(equalTo: errorBox.trailingAnchor, constant: -Space.space3),
            error.topAnchor.constraint(equalTo: errorBox.topAnchor),
            error.bottomAnchor.constraint(equalTo: errorBox.bottomAnchor),
        ])
        errorBox.isHidden = true
        column.addArrangedSubview(errorBox)
        self.errorBox = errorBox

        chips.axis = .horizontal
        chips.spacing = Space.space2
        chips.alignment = .center
        chips.translatesAutoresizingMaskIntoConstraints = false
        chipsRow.showsHorizontalScrollIndicator = false
        chipsRow.addSubview(chips)
        chipsRow.isHidden = true
        // With no chip in it the row has no width of its own: none, rather than any.
        let empty = chips.widthAnchor.constraint(equalToConstant: 0)
        empty.priority = .fittingSizeLevel
        NSLayoutConstraint.activate([
            empty,
            chips.leadingAnchor.constraint(equalTo: chipsRow.contentLayoutGuide.leadingAnchor, constant: Space.space1),
            chips.trailingAnchor.constraint(equalTo: chipsRow.contentLayoutGuide.trailingAnchor, constant: -Space.space1),
            chips.topAnchor.constraint(equalTo: chipsRow.contentLayoutGuide.topAnchor, constant: Space.space1),
            chips.bottomAnchor.constraint(equalTo: chipsRow.contentLayoutGuide.bottomAnchor, constant: -Space.space1),
            chipsRow.heightAnchor.constraint(equalTo: chips.heightAnchor, constant: Space.space1 * 2),
        ])
        column.addArrangedSubview(chipsRow)

        buildPill()
        column.addArrangedSubview(ring)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ComposerView, _: UITraitCollection) in
            view.paint()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(transparencyChanged), name: UIAccessibility.reduceTransparencyStatusDidChangeNotification, object: nil)
        paint()
        renderAction(animated: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ComposerView is built in code")
    }

    // MARK: The pill

    private func buildPill() {
        // The pill's border box, unclipped, so the tile shadow it casts
        // (`.pill { box-shadow: var(--shadow-tile) }`) stands outside it while
        // the pill clips its own content.
        ring.translatesAutoresizingMaskIntoConstraints = false
        ring.layer.cornerRadius = Radius.radiusLg
        ring.layer.cornerCurve = .continuous
        ring.boxShadow = Shadow.shadowTile
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = Radius.radiusLg
        pill.layer.cornerCurve = .continuous
        pill.layer.borderWidth = 1
        pill.clipsToBounds = true
        ring.addSubview(pill)
        for backdrop in [material, tint] as [UIView] {
            backdrop.translatesAutoresizingMaskIntoConstraints = false
            backdrop.isUserInteractionEnabled = false
            pill.addSubview(backdrop)
            NSLayoutConstraint.activate([
                backdrop.leadingAnchor.constraint(equalTo: pill.leadingAnchor),
                backdrop.trailingAnchor.constraint(equalTo: pill.trailingAnchor),
                backdrop.topAnchor.constraint(equalTo: pill.topAnchor),
                backdrop.bottomAnchor.constraint(equalTo: pill.bottomAnchor),
            ])
        }

        field.font = Self.fieldRole.font
        field.adjustsFontForContentSizeCategory = true
        field.backgroundColor = .clear
        field.textColor = Palette.inkStrong
        field.tintColor = Palette.inkStrong
        field.textContainer.lineFragmentPadding = 0
        let pad = (Self.control - Self.fieldRole.lineHeight) / 2
        // The last line's leading below it, which TextKit 2 leaves off: the
        // line's own spacing, by the rule the field's lines are set with (LineBox).
        let below = LineBox.textView(Self.fieldRole.font, height: Self.fieldRole.lineHeight).lineSpacing
        field.textContainerInset = UIEdgeInsets(top: pad, left: 0, bottom: pad + below, right: 0)
        field.typingAttributes = Self.typing
        field.isScrollEnabled = false
        field.showsVerticalScrollIndicator = false
        field.delegate = self
        field.accessibilityLabel = "Message the agent"
        field.accessibilityIdentifier = "steer-message"
        field.translatesAutoresizingMaskIntoConstraints = false
        field.onPaste = { [weak self] long in self?.attachPaste(long) }
        field.onPasteItems = { [weak self] items in self?.binding?.onPasteItems(items) }
        field.onReturn = { [weak self] in self?.returned() }
        hint.text = Self.hintShort
        hint.isUserInteractionEnabled = false
        hint.translatesAutoresizingMaskIntoConstraints = false
        more.tabular = true
        more.textAlignment = .right
        more.isHidden = true
        more.translatesAutoresizingMaskIntoConstraints = false

        attach.configure(glyph: .plus, accessibility: "Attach a file or image")
        historyBox.configure(glyph: .history, accessibility: "Show what you sent")
        historyBox.addAction(UIAction { [weak self] _ in self?.historyPressed() }, for: .primaryActionTriggered)
        historyBox.addAction(UIAction { _ in Feel.prepare() }, for: .touchDown)
        historyBox.accessibilityIdentifier = "composer-history"
        actionBox.addAction(UIAction { [weak self] _ in self?.pressAction() }, for: .primaryActionTriggered)
        actionBox.accessibilityIdentifier = "send-steer"
        gradient.cornerRadius = Radius.radiusLg - Self.inset
        gradient.cornerCurve = .continuous
        actionBox.layer.insertSublayer(gradient, at: 0)

        let controls = UIStackView(arrangedSubviews: [historyBox, attach, actionBox])
        // A coarse pointer's gap, so each 34pt box's 44pt touch area meets its neighbour's.
        controls.spacing = 10
        controls.alignment = .center
        controls.translatesAutoresizingMaskIntoConstraints = false
        for view in [field, hint, more, controls] as [UIView] {
            pill.addSubview(view)
        }
        fieldHeight = field.heightAnchor.constraint(equalToConstant: Self.control)
        NSLayoutConstraint.activate([
            pill.leadingAnchor.constraint(equalTo: ring.leadingAnchor),
            pill.trailingAnchor.constraint(equalTo: ring.trailingAnchor),
            pill.topAnchor.constraint(equalTo: ring.topAnchor),
            pill.bottomAnchor.constraint(equalTo: ring.bottomAnchor),
            field.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: Space.space3),
            field.topAnchor.constraint(equalTo: pill.topAnchor, constant: Self.inset - 1),
            field.bottomAnchor.constraint(equalTo: pill.bottomAnchor, constant: -(Self.inset - 1)),
            fieldHeight,
            controls.leadingAnchor.constraint(equalTo: field.trailingAnchor, constant: Space.space2),
            controls.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -(Self.inset - 1)),
            controls.bottomAnchor.constraint(equalTo: field.bottomAnchor),
            attach.widthAnchor.constraint(equalToConstant: Self.control),
            attach.heightAnchor.constraint(equalToConstant: Self.control),
            historyBox.widthAnchor.constraint(equalToConstant: Self.control),
            historyBox.heightAnchor.constraint(equalToConstant: Self.control),
            actionBox.widthAnchor.constraint(equalToConstant: Self.control),
            actionBox.heightAnchor.constraint(equalToConstant: Self.control),
            hint.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            hint.trailingAnchor.constraint(lessThanOrEqualTo: field.trailingAnchor),
            hint.bottomAnchor.constraint(equalTo: field.bottomAnchor, constant: -pad),
            more.trailingAnchor.constraint(equalTo: field.trailingAnchor),
            more.widthAnchor.constraint(equalToConstant: Self.moreRoom),
            more.bottomAnchor.constraint(equalTo: field.bottomAnchor),
            more.heightAnchor.constraint(equalToConstant: Self.control),
        ])
        controls.setContentHuggingPriority(.required, for: .horizontal)
        controls.setContentCompressionResistancePriority(.required, for: .horizontal)

        // A hold on the composer, keyboard down, brings the wheel up under the finger; a touch or a pen, never a pointer.
        holdPress.minimumPressDuration = Motion.durPressHold
        holdPress.allowableMovement = 8
        holdPress.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue), NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        holdPress.delegate = self
        holdPress.addTarget(self, action: #selector(held(_:)))
        pill.addGestureRecognizer(holdPress)
        field.onDeleteBackward = { [weak self] in self?.wheelBackspace() ?? true }
    }

    private func paint() {
        let traits = traitCollection
        pill.layer.borderColor = grown ? UIColor.clear.cgColor : Palette.borderControl.resolvedColor(with: traits).cgColor
        attach.layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
        historyBox.layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
        // The warning state's edge, a CGColor, follows the appearance by hand.
        actionBox.layer.borderColor = Palette.warning9.resolvedColor(with: traits).cgColor
        gradient.colors = Palette.actionSurface.colors(for: traits)
        let opaque = UIAccessibility.isReduceTransparencyEnabled
        material.isHidden = opaque || grown
        tint.backgroundColor = grown ? .clear : opaque ? Palette.surfaceRaised : Palette.materialPanel
        if grown { ring.boxShadow = [] } else if ring.boxShadow.isEmpty { ring.boxShadow = Shadow.shadowTile }
    }

    @objc private func transparencyChanged() {
        paint()
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = actionBox.bounds
        CATransaction.commit()
        fitHint()
        maskField()
        edit?.relayout()
    }

    // MARK: The binding

    /// Draws `binding`, the group's newly active conversation. Focus and the
    /// keyboard stay; the box shows the new draft and sends to its session.
    /// `direction` is which way the switch went along the strip (1 right, -1
    /// left, 0 neither); `landing` is how long the transcript's switch motion
    /// has left. The field keeps its height until that motion lands, then
    /// glides to the new draft's, and the words arriving slide in from the
    /// switch's side and type across the field until its glide ends, while
    /// the words leaving slide out the other way (Composer.svelte `fly`).
    public func bind(_ next: SessionComposerBinding?, direction: Int, landing: TimeInterval) {
        guard next !== binding else {
            if let next { render(next) }
            return
        }
        // The wheel and a queued message's words belong to the conversation they came from.
        wheel?.dismiss()
        edit?.dismiss()
        let shown = field.text ?? ""
        binding?.composer = nil
        binding = next
        next?.composer = self
        guard let next else {
            endFlight()
            writable = false
            syncPrompts([])
            renderAction(animated: false)
            return
        }
        holdUntil(landing)
        if direction != 0, window != nil, !UIAccessibility.isReduceMotionEnabled, flight != nil || next.draft != shown {
            fly(to: next.draft, direction: direction, landing: landing)
        } else {
            endFlight()
            setField(next.draft)
        }
        attachments = next.attachments
        render(next)
    }

    /// What the pane changed: its action, whether it can be written to, its
    /// error, its attach sources and its parked prompts.
    func render(_ source: SessionComposerBinding) {
        guard source === binding else { return }
        action = source.action
        writable = source.writable
        block = source.sendBlock
        attach.menu = source.attachMenu
        attach.showsMenuAsPrimaryAction = true
        let message = source.sendError ?? ""
        if error.text != message || errorBox?.isHidden != message.isEmpty {
            error.text = message
            errorBox?.isHidden = message.isEmpty
            onHeight()
        }
        syncPrompts(source.prompts)
        renderAction(animated: window != nil)
    }

    /// The draft as the pane set it (restored, sent, an attachment added).
    func loadDraft(of source: SessionComposerBinding) {
        guard source === binding else { return }
        // While a queued message's words are in the field, the draft that
        // stepped aside is what changed: it comes back when they go.
        if let edit {
            edit.draft = source.draft
            edit.attachments = source.attachments
            return
        }
        wheel?.dismiss()
        endFlight()
        setField(source.draft)
        attachments = source.attachments
    }

    /// Only the attachments changed (a file's upload moved along): the
    /// field, its caret and the wheel stay as they are.
    func attachmentsChanged(of source: SessionComposerBinding) {
        guard source === binding else { return }
        if let edit {
            edit.attachments = source.attachments
            return
        }
        attachments = source.attachments
    }

    /// Writes the field without it counting as the reader's typing.
    private func setField(_ text: String) {
        field.text = text
        textChanged(animated: window != nil)
    }

    /// The cards standing on the pill, as the binding lists them: one that
    /// leaves fades out and gives its room back over `durExit`; one that
    /// arrives settles in on its own (PromptCardView `arriving`).
    private func syncPrompts(_ cards: [UIView]) {
        for card in prompts.arrangedSubviews where !cards.contains(card) {
            leave(card)
        }
        for (index, card) in cards.enumerated() where card.superview !== prompts || card.isHidden {
            card.isHidden = false
            card.alpha = 1
            prompts.insertArrangedSubview(card, at: min(index, prompts.arrangedSubviews.count))
        }
        let empty = cards.isEmpty
        if prompts.isHidden != empty {
            prompts.isHidden = empty
            onHeight()
        }
    }

    private func leave(_ card: UIView) {
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else {
            card.removeFromSuperview()
            onHeight()
            return
        }
        let host = superview ?? self
        let out = Motion.easeOut.animator(Motion.durExit) {
            card.alpha = 0
            card.isHidden = true
            host.layoutIfNeeded()
        }
        out.addCompletion { [weak self] _ in
            // Re-bound meanwhile: a card the binding lists again stays.
            guard let self, card.superview === prompts, !(binding?.prompts.contains(card) ?? false) else { return }
            card.removeFromSuperview()
            onHeight()
        }
        out.startAnimation()
    }

    // MARK: The hold and the flight

    /// How far the words travel: a cue, not a page turn.
    private static let flightTravel = 16.0
    private var holding = false
    private var hold: DispatchWorkItem?

    /// The field keeps its height until the transcript's switch lands.
    private func holdUntil(_ landing: TimeInterval) {
        hold?.cancel()
        guard landing > 0 else {
            holding = false
            return
        }
        holding = true
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            holding = false
            fit(animated: window != nil, duration: Motion.durControl)
        }
        hold = work
        DispatchQueue.main.asyncAfter(deadline: .now() + landing, execute: work)
    }

    private struct Flight {
        let text: String
        let began: CFTimeInterval
        let end: CFTimeInterval
    }

    private var flight: Flight?
    private var flightLink: CADisplayLink?
    private var flightOut: UIView?

    private func fly(to text: String, direction: Int, landing: TimeInterval) {
        let dir = Double(direction)
        // The words leaving, as they stand: they slide out the other way.
        flightOut?.removeFromSuperview()
        if let leaving = field.snapshotView(afterScreenUpdates: false) {
            leaving.frame = field.frame
            leaving.isUserInteractionEnabled = false
            pill.addSubview(leaving)
            flightOut = leaving
            let out = Motion.easeOut.animator(Motion.durControl) {
                leaving.transform = CGAffineTransform(translationX: -dir * Self.flightTravel, y: 0)
                leaving.alpha = 0
            }
            out.addCompletion { _ in leaving.removeFromSuperview() }
            out.startAnimation()
        }
        // The words arriving type across from the start of the slide to the
        // end of the field's glide, which starts when the transcript lands.
        let began = CACurrentMediaTime()
        flight = Flight(text: text, began: began, end: began + landing + Motion.durControl)
        field.text = ""
        field.transform = CGAffineTransform(translationX: dir * Self.flightTravel, y: 0)
        field.alpha = 0
        Motion.easeOut.animator(Motion.durControl) {
            self.field.transform = .identity
            self.field.alpha = 1
        }.startAnimation()
        flightLink?.invalidate()
        let link = CADisplayLink(target: self, selector: #selector(typeFlight))
        link.add(to: .main, forMode: .common)
        flightLink = link
        typeFlight()
    }

    @objc private func typeFlight() {
        guard let flight else { return }
        let now = CACurrentMediaTime()
        let progress = flight.end > flight.began ? min(1, (now - flight.began) / (flight.end - flight.began)) : 1
        let characters = Array(flight.text)
        let count = Int((Double(characters.count) * Motion.easeOut.value(at: progress)).rounded(.down))
        field.text = String(characters.prefix(count))
        hint.isHidden = !(field.text ?? "").isEmpty || !flight.text.isEmpty
        if progress >= 1 { endFlight() }
    }

    /// Lands any flight at once: the field shows its draft whole.
    private func endFlight() {
        flightLink?.invalidate()
        flightLink = nil
        guard let flight else { return }
        self.flight = nil
        field.layer.removeAllAnimations()
        field.transform = .identity
        field.alpha = 1
        setField(flight.text)
    }

    // MARK: The field

    public func focus() {
        field.becomeFirstResponder()
    }

    /// A keystroke mid-flight lands the flight first, then goes at the end
    /// of the whole draft, never into the half-typed one.
    public func textView(_: UITextView, shouldChangeTextIn _: NSRange, replacementText text: String) -> Bool {
        // While the wheel is up, what is typed filters it, or takes the reader back to their draft.
        if let wheel, !wheel.closing { return text.isEmpty ? wheel.backspace() : wheel.typed(text) }
        guard flight != nil else { return true }
        endFlight()
        field.insertText(text)
        return false
    }

    public func textViewDidChange(_: UITextView) {
        // Typed in place: the text is the reader's, and any hold lets go. A
        // queued message's words being edited are not the draft.
        if edit == nil { binding?.draft = field.text ?? "" }
        hold?.cancel()
        holding = false
        textChanged(animated: true)
    }

    public func textViewDidBeginEditing(_: UITextView) {
        refold(animated: true)
    }

    public func textViewDidEndEditing(_: UITextView) {
        refold(animated: true)
    }

    public func scrollViewDidScroll(_: UIScrollView) {
        maskField()
    }

    private func textChanged(animated: Bool) {
        hint.isHidden = !field.text.isEmpty
        renderAction(animated: animated)
        // A switch still landing keeps the field's height until it lands.
        if !holding { fit(animated: animated, duration: Motion.durControl) }
    }

    /// The hint in full where the field holds it on one line, else its first
    /// part. Commands and mentions are not on this composer yet, so only the
    /// first part ever names what the field does.
    private func fitHint() {
        hint.text = Self.hintShort
    }

    /// Lines the draft runs to at the field's width, and the height it wants.
    private func measure() -> (lines: Int, height: Double) {
        let width = field.bounds.width
        guard width > 0 else { return (1, Self.control) }
        let pad = field.textContainerInset.top + field.textContainerInset.bottom
        let natural = field.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
        let line = Self.fieldRole.lineHeight
        let count = max(1, Int(((natural - pad) / line).rounded()))
        return (count, max(Self.control, natural))
    }

    private func refold(animated: Bool) {
        fit(animated: animated, duration: Motion.durMorph)
    }

    /// Fits the field to its draft: a line at a time up to the ceiling, or
    /// folded to its first line when the field is not being written in.
    private func fit(animated: Bool, duration: TimeInterval) {
        let (count, natural) = measure()
        lines = count
        folded = !field.isFirstResponder && count > 1
        let target = folded ? Self.control : min(Self.ceiling, natural)
        field.isScrollEnabled = !folded && natural > Self.ceiling + 0.5
        more.text = "+\(count - 1) \(count == 2 ? "line" : "lines")"
        more.isHidden = !folded
        if folded { field.setContentOffset(.zero, animated: false) }
        guard abs(fieldHeight.constant - target) > 0.5 else {
            maskField()
            return
        }
        fieldHeight.constant = target
        let host = superview ?? self
        if animated, window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(duration) {
                host.layoutIfNeeded()
            }.startAnimation()
        } else {
            host.layoutIfNeeded()
        }
        onHeight()
        maskField()
    }

    /// The scroll cue: the edge with text out of sight fades over a line; a
    /// folded draft fades out where its line ends instead.
    private func maskField() {
        let bounds = field.bounds
        guard bounds.width > 0 else { return }
        let line = Self.fieldRole.lineHeight
        if folded {
            let fade = CAGradientLayer()
            fade.frame = CGRect(x: field.contentOffset.x, y: field.contentOffset.y, width: bounds.width, height: bounds.height)
            fade.startPoint = CGPoint(x: 0, y: 0.5)
            fade.endPoint = CGPoint(x: 1, y: 0.5)
            let solidEnd = max(0, (bounds.width - Self.moreRoom - Space.space8) / bounds.width)
            let clearAt = max(solidEnd, (bounds.width - Self.moreRoom) / bounds.width)
            fade.colors = [UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
            fade.locations = [0, NSNumber(value: solidEnd), NSNumber(value: clearAt)]
            field.layer.mask = fade
            return
        }
        let hidden = field.contentSize.height - bounds.height
        let top = hidden > 1 && field.contentOffset.y > 1
        let bottom = hidden > 1 && field.contentOffset.y < hidden - 1
        guard top || bottom else {
            field.layer.mask = nil
            return
        }
        let fade = CAGradientLayer()
        fade.frame = CGRect(x: 0, y: field.contentOffset.y, width: bounds.width, height: bounds.height)
        let edge = NSNumber(value: line / bounds.height)
        let foot = NSNumber(value: 1 - line / bounds.height)
        fade.colors = [top ? UIColor.clear.cgColor : UIColor.black.cgColor, UIColor.black.cgColor, UIColor.black.cgColor, bottom ? UIColor.clear.cgColor : UIColor.black.cgColor]
        fade.locations = [0, edge, foot, 1]
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        field.layer.mask = fade
        CATransaction.commit()
    }

    // MARK: Send and Stop

    private var hasContent: Bool {
        !field.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }

    /// A file the hub does not have yet: nothing sends until it is there,
    /// or the reader removes it.
    private var unready: Bool {
        attachments.contains(where: \.isUnready)
    }

    /// What the button does now. While a queued message is being edited it
    /// puts the edit in its place, even mid-turn, when the agent is working.
    /// While the agent works, words or attachments in the field make it Send,
    /// which queues the message as the web's Enter does (a phone has no
    /// Enter to send with); an empty field leaves it Stop.
    private var shownAction: Action {
        if edit != nil { return .send }
        if action == .stop, hasContent { return .send }
        return action
    }

    /// The warning state shows, rather than a dimmed box, while a reason
    /// other than an empty field keeps Send from working (never during a
    /// swipe, which is over before anyone could read it).
    private var shownBlock: SendBlock? {
        held || action == .sending ? nil : block
    }

    /// The dashboard's order (Composer.svelte `onaction`): an edit replaces,
    /// a working agent stops (unless there is something to queue), then the
    /// wheel sends the row on its line.
    private func pressAction() {
        guard !held else { return }
        // A blocked box explains why; its menu, when it has one, opens on its own.
        if let block = shownBlock {
            block.explain?()
            return
        }
        if edit != nil {
            submit()
            return
        }
        if action == .stop, !hasContent {
            binding?.onStop()
            return
        }
        // While the wheel is up, Send sends the row on the field's line as it is (⌘Return).
        if let wheel, !wheel.closing {
            wheel.take(send: true)
            return
        }
        // Send, or a working agent's queue: the hub holds the message until it is read.
        if action != .sending { submit() }
    }

    /// A refused send never eats what was typed: nothing to send, the last
    /// one still out, or a swipe still carrying the conversation leaves the
    /// draft as it is. The pane clears it once it has the message.
    private func submit() {
        // A queued message's words go back in its place.
        if let edit {
            let words = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
            // Unchanged, it simply goes back: nothing to withdraw and send again.
            if words == edit.entry.text.trimmingCharacters(in: .whitespacesAndNewlines) {
                edit.giveBack(nil)
            } else if !words.isEmpty {
                edit.giveBack(words)
            }
            return
        }
        guard let binding, writable, !held, action != .sending, hasContent, !unready, flight == nil else { return }
        let words = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
        binding.onSend(words, attachments)
    }

    private func renderAction(animated: Bool) {
        let action = shownAction
        let block = shownBlock
        let enabled = writable && !held && (action != .send || (hasContent && !unready) || wheel != nil)
        actionBox.layer.cornerRadius = Radius.radiusLg - Self.inset
        actionBox.layer.cornerCurve = .continuous
        // Blocked: the warning pair (the design's warning variant: tint, edge
        // and ink), at full presence and pressable, because a press is how
        // the reader learns why and what fixes it.
        // Set again only when the reason changes: the pane renders on every
        // change the hub reports, and a menu replaced while it is open closes.
        // Keyed by the conversation too: two tabs can share a reason, never a menu.
        let menuReason = block?.menu == nil ? nil : block.map { "\(binding?.sessionId ?? ""):\($0.reason)" }
        if menuReason != shownMenuReason {
            actionBox.menu = block?.menu
            actionBox.showsMenuAsPrimaryAction = block?.menu != nil
            shownMenuReason = menuReason
        }
        if let block {
            actionBox.isEnabled = true
            actionBox.isUserInteractionEnabled = true
            actionBox.alpha = 1
            gradient.isHidden = true
            actionBox.backgroundColor = Palette.warning3
            actionBox.layer.borderWidth = 1
            actionBox.layer.borderColor = Palette.warning9.resolvedColor(with: traitCollection).cgColor
            actionBox.accessibilityLabel = "Can't send: \(block.reason)"
            actionBox.accessibilityTraits = .button
        } else {
            actionBox.isEnabled = enabled && action != .sending
            actionBox.isUserInteractionEnabled = action != .sending
            actionBox.alpha = enabled || action == .sending ? 1 : 0.55
            gradient.isHidden = !enabled && action == .send
            actionBox.backgroundColor = Palette.actionSolid
            actionBox.layer.borderWidth = 0
            actionBox.accessibilityLabel = action == .stop ? "Stop the agent" : "Send message"
            actionBox.accessibilityTraits = action == .sending ? [.button, .notEnabled] : .button
        }
        let next: SwapGlyph.Face = if block != nil {
            .glyph(.warning)
        } else {
            switch action {
            case .send: .glyph(Glyph.send)
            case .stop: .glyph(.stop)
            case .sending: .spinner
            }
        }
        // The send plane's mass sits low-left: nudged up and right while it can be pressed.
        let nudge = block == nil && action == .send && enabled ? CGAffineTransform(translationX: 0.5, y: -0.5) : .identity
        if let glyph, glyph.face == next {
            glyph.transform = nudge
            return
        }
        let incoming = SwapGlyph(next, tint: block == nil ? Palette.onAction : Palette.warning11)
        incoming.translatesAutoresizingMaskIntoConstraints = false
        actionBox.addSubview(incoming)
        // Centred by constraint, so the box's size arriving later can't strand it.
        NSLayoutConstraint.activate([
            incoming.centerXAnchor.constraint(equalTo: actionBox.centerXAnchor),
            incoming.centerYAnchor.constraint(equalTo: actionBox.centerYAnchor),
            incoming.widthAnchor.constraint(equalToConstant: Size.iconMd),
            incoming.heightAnchor.constraint(equalToConstant: Size.iconMd),
        ])
        let outgoing = glyph
        glyph = incoming
        incoming.swapIn(animated: animated, rest: nudge)
        outgoing?.swapOut(animated: animated)
    }

    // MARK: Attachments

    /// A paste past this many characters rides as a named attachment.
    static let largePaste = 1200

    private func attachPaste(_ text: String) {
        attachments.append(.text(name: "Pasted text · \(text.count.formatted()) chars", content: text))
    }

    override public var keyCommands: [UIKeyCommand]? {
        recallKeys
    }

    override public func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        grownHit(point, with: event) ?? super.hitTest(point, with: event)
    }

    private func renderAttachments() {
        if edit == nil { binding?.attachments = attachments }
        let shown = chips.arrangedSubviews.compactMap { $0 as? AttachmentChip }
        // The same chips as before, a file's upload having moved along: each
        // takes its new state in place, so its ring fills rather than restarts.
        if shown.count == attachments.count, zip(shown, attachments).allSatisfy({ $0.attachment.sameChip(as: $1) }) {
            for (chip, attachment) in zip(shown, attachments) { chip.update(attachment) }
            renderAction(animated: true)
            return
        }
        chips.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for attachment in attachments {
            let chip = AttachmentChip(attachment) { [weak self] chip in
                guard let self, let index = chips.arrangedSubviews.firstIndex(of: chip), index < attachments.count else { return }
                attachments.remove(at: index)
            } onRetry: { [weak self] id in
                self?.binding?.onRetryFile(id)
            }
            chips.addArrangedSubview(chip)
        }
        let hide = attachments.isEmpty
        if chipsRow.isHidden != hide {
            chipsRow.isHidden = hide
            onHeight()
        }
        renderAction(animated: true)
    }
}

// MARK: Recall and the queued message

extension ComposerView {
    /// Recall starts only from an empty field or with the caret at its very
    /// start, so ↑ in a draft still moves the caret.
    private var canStartRecall: Bool {
        let range = field.selectedRange
        return binding != nil && range.length == 0 && (field.text.isEmpty || range.location == 0)
    }

    /// ↑ to start, and while the wheel or a queued edit is up, its keys.
    fileprivate var recallKeys: [UIKeyCommand] {
        guard field.isFirstResponder else { return [] }
        var keys: [UIKeyCommand] = []
        if let wheel, !wheel.closing {
            keys = [
                UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(recallUp)),
                UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(recallDown)),
                UIKeyCommand(input: "\r", modifierFlags: [], action: #selector(recallTake)),
                UIKeyCommand(input: "\r", modifierFlags: .command, action: #selector(recallSend)),
                UIKeyCommand(input: "\r", modifierFlags: .control, action: #selector(recallSend)),
                UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(recallEscape)),
            ]
        } else if edit != nil {
            keys = [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(recallEscape))]
        } else if canStartRecall, flight == nil {
            keys = [UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(recallUp))]
        }
        for key in keys { key.wantsPriorityOverSystemBehavior = true }
        return keys
    }

    /// ↑: rolls the wheel back; or, in an empty field, lifts out the queued
    /// message when it can be edited, and otherwise brings the wheel up.
    @objc private func recallUp() {
        if let wheel {
            wheel.up()
            return
        }
        guard edit == nil, canStartRecall, let binding else { return }
        if field.text.isEmpty, let queued = binding.editableQueued() {
            editQueued(queued)
        } else {
            openWheel(keys: true)
        }
    }

    @objc private func recallDown() { wheel?.down() }
    @objc private func recallTake() { wheel?.take(send: false) }
    @objc private func recallSend() { wheel?.take(send: true) }

    @objc private func recallEscape() {
        if let wheel { wheel.escape() } else { edit?.giveBack(nil) }
    }

    /// Return from the field (the software keyboard's too).
    func returned() {
        if let wheel, !wheel.closing { wheel.take(send: false) } else { submit() }
    }

    /// A backspace the field is about to take; false keeps it from the field.
    private func wheelBackspace() -> Bool {
        guard let wheel, !wheel.closing else { return true }
        return wheel.backspace()
    }

    private func historyPressed() {
        if let wheel {
            wheel.backToDraft()
        } else if let edit {
            edit.giveBack(nil)
        } else if binding != nil {
            openWheel(keys: true)
        }
    }

    /// Brings the wheel up. `keys`: the field takes focus, so keys reach the
    /// wheel; a hold leaves the keyboard down.
    private func openWheel(keys: Bool) {
        guard let binding, wheel == nil, edit == nil else { return }
        endFlight()
        // Focus first, so a folded draft opens to its height before anything is measured.
        if keys { field.becomeFirstResponder() }
        (superview ?? self).layoutIfNeeded()
        let wheel = RecallWheel(composer: self, entries: binding.recall(), draft: field.text ?? "", caret: field.selectedRange, keys: keys)
        self.wheel = wheel
        wheel.open()
        renderAction(animated: true)
    }

    /// The field's own words and surface step aside while the wheel is up.
    func wheelStepsIn() {
        grown = true
        field.alpha = 0
        hint.alpha = 0
        more.alpha = 0
    }

    /// The field takes what the wheel took, as the reader's draft.
    func wheelLanded(_ text: String) {
        field.text = text
        binding?.draft = text
        textChanged(animated: false)
    }

    /// The draft, with the caret where the reader left it, so a key typed lands there.
    func wheelReturned(caret: NSRange) {
        if caret.location + caret.length <= (field.text as NSString).length { field.selectedRange = caret }
    }

    /// The wheel is folding away: the field and its surface are back.
    func wheelStepsOut() {
        field.alpha = 1
        hint.alpha = 1
        more.alpha = 1
        if edit == nil { grown = false }
    }

    func wheelEnded(_ ended: RecallWheel, focus: Bool, caretAtEnd: Bool, send: Bool) {
        guard wheel === ended else { return }
        wheel = nil
        renderAction(animated: true)
        // Back to the field when the reader was typing in it, or to edit what they took.
        if focus { field.becomeFirstResponder() }
        if caretAtEnd { field.selectedRange = NSRange(location: (field.text as NSString).length, length: 0) }
        if send { submit() }
    }

    /// A grown shape finished folding: the pill's surface comes back unless
    /// another has grown meanwhile.
    func stepOutIfIdle() {
        if wheel == nil, edit == nil { grown = false }
    }

    // MARK: The queued message

    /// Lifts `entry`'s words into the field (↑, or a tap on its bubble). The
    /// draft, if there is one, steps aside until they go back.
    func editQueued(_ entry: RecallEntry) {
        guard let binding, edit == nil, wheel == nil else { return }
        endFlight()
        let words = binding.queuedWords(entry.id)
        let edit = QueuedEdit(entry, composer: self, binding: binding, draft: field.text ?? "", attachments: attachments, caret: field.selectedRange)
        self.edit = edit
        edit.begin(from: words)
    }

    /// The queued message's words are in the field now, the draft's
    /// attachments set aside with it.
    func editEnters(_ text: String) {
        attachments = []
        field.text = text
        textChanged(animated: false)
        field.selectedRange = NSRange(location: (text as NSString).length, length: 0)
        (superview ?? self).layoutIfNeeded()
    }

    /// The words went back: the draft returns as it was, caret and all,
    /// and the field keeps the keys when `focus`.
    func editLeaves(_ left: QueuedEdit, focus: Bool) {
        guard edit === left else { return }
        edit = nil
        field.text = left.draft
        attachments = left.attachments
        textChanged(animated: false)
        let caret = left.caret
        if caret.location + caret.length <= (left.draft as NSString).length { field.selectedRange = caret }
        if focus { field.becomeFirstResponder() }
    }

    func scrollFieldToEnd() {
        field.layoutIfNeeded()
        let bottom = max(0, field.contentSize.height - field.bounds.height)
        field.setContentOffset(CGPoint(x: 0, y: bottom), animated: false)
    }

    /// The part of the field the reader can see, where words land: inside
    /// its padding, at its scroll.
    func fieldEnd() -> LiftEnd {
        let inset = field.textContainerInset
        let box = field.convert(CGRect(x: 0, y: field.contentOffset.y + inset.top, width: field.bounds.width,
                                       height: max(0, field.bounds.height - inset.top - inset.bottom)), to: nil)
        return LiftEnd(box: box, scroll: field.contentOffset.y, attributes: LiftEnd.wrapping(Self.fieldRole.attributes(color: Palette.inkStrong)))
    }

    // MARK: The hold

    /// Only a hold that starts off the field while it is being written in,
    /// and off the attach and send boxes, with nothing else up.
    public func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard recognizer === holdPress else { return true }
        guard binding != nil, wheel == nil, edit == nil, let view = touch.view else { return false }
        if view.isDescendant(of: actionBox) || view.isDescendant(of: attach) { return false }
        if field.isFirstResponder, view.isDescendant(of: field) { return false }
        Feel.prepare()
        return true
    }

    /// The field's own presses wait for the hold to fail while it is not
    /// being written in, so a hold never starts editing or a selection.
    public func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        recognizer === holdPress && !field.isFirstResponder && (other.view?.isDescendant(of: field) ?? false)
    }

    @objc private func held(_ press: UILongPressGestureRecognizer) {
        let y = press.location(in: self).y
        switch press.state {
        case .began:
            guard wheel == nil, edit == nil else { return }
            Feel.hold()
            openWheel(keys: false)
            wheel?.holdBegan(at: y)
        case .changed:
            wheel?.holdMoved(to: y)
        case .ended, .cancelled, .failed:
            wheel?.holdEnded()
        default:
            break
        }
    }

    /// The rows above the pill and the edit row's Keep it, which stand
    /// outside the composer's bounds, where a touch lands on them.
    fileprivate func grownHit(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        for view in [wheel?.ghostsView, edit?.keepButton].compactMap(\.self) where view.window != nil && !view.isHidden {
            let inside = convert(point, to: view)
            if view.point(inside: inside, with: event), let hit = view.hitTest(inside, with: event) { return hit }
        }
        return nil
    }
}

// MARK: The field

/// The composer's text view: Return sends (Shift-Return is a new line on a
/// keyboard), a long paste becomes an attachment, and a pasted picture or
/// file (a screenshot copied in Photos, a file copied in Files) is attached.
final class ComposerField: UITextView {
    var onReturn: () -> Void = {}
    var onPaste: (String) -> Void = { _ in }
    /// Pictures and files pasted in, as the pasteboard's item providers.
    var onPasteItems: ([NSItemProvider]) -> Void = { _ in }
    /// Asked before a backspace; false keeps it from the text (the wheel's filter took it).
    var onDeleteBackward: () -> Bool = { true }

    override func deleteBackward() {
        if onDeleteBackward() { super.deleteBackward() }
    }

    /// Paste is offered for pictures and files as well as words. Reading
    /// what kinds the pasteboard holds asks the reader nothing.
    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)) {
            let board = UIPasteboard.general
            if board.hasImages || board.numberOfItems > 0 { return true }
        }
        return super.canPerformAction(action, withSender: sender)
    }

    override func paste(_ sender: Any?) {
        let board = UIPasteboard.general
        let providers = board.itemProviders
        let attached = providers.filter { Self.isAttachment($0) }
        if !attached.isEmpty {
            onPasteItems(attached)
            // Words pasted along with them go where words go.
            let words = zip(board.items, providers).filter { !Self.isAttachment($0.1) }.compactMap { item, _ in
                item[UTType.utf8PlainText.identifier] as? String ?? item[UTType.plainText.identifier] as? String
            }.joined(separator: "\n")
            if words.count > ComposerView.largePaste {
                onPaste(words)
            } else if !words.isEmpty {
                insertText(words)
            }
            return
        }
        if let text = board.string, text.count > ComposerView.largePaste {
            onPaste(text)
            return
        }
        super.paste(sender)
    }

    /// A pasted item that is a picture or a file rather than words: anything
    /// at all (a PDF, a zip, audio, video, any data), unless it carries plain
    /// text or a web link, which are words (a page's selection comes as text
    /// beside its markup and archive, and stays words). A file's own link
    /// (Files copies one beside the file) is the file, not words.
    static func isAttachment(_ provider: NSItemProvider) -> Bool {
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) { return true }
        let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
        if types.contains(where: { $0.conforms(to: .plainText) || ($0.conforms(to: .url) && !$0.conforms(to: .fileURL)) }) { return false }
        return !types.isEmpty
    }

    override func insertText(_ text: String) {
        if text == "\n" {
            onReturn()
            return
        }
        super.insertText(text)
    }

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: "\r", modifierFlags: .shift, action: #selector(newLine))]
    }

    @objc private func newLine() {
        super.insertText("\n")
    }
}

// MARK: The 34pt boxes

/// A 34pt control in the pill: scales to `pressScale` under the finger over
/// `durControl` (the web's `:active` transform), none with Reduce Motion.
final class PressBox: UIButton {
    private var glyphView: GlyphView?

    init() {
        super.init(frame: .zero)
        configuration = nil
        translatesAutoresizingMaskIntoConstraints = false
        isPointerInteractionEnabled = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PressBox is built in code")
    }

    /// The attach box: raised, on the control border, a 16pt muted glyph.
    func configure(glyph: Glyph, accessibility: String) {
        backgroundColor = Palette.surfaceRaised
        layer.borderWidth = 1
        layer.cornerRadius = Radius.radiusLg - Size.cComposerInset
        layer.cornerCurve = .continuous
        let view = GlyphView(glyph, size: Size.iconMd, tint: Palette.inkMuted)
        view.isUserInteractionEnabled = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.centerXAnchor.constraint(equalTo: centerXAnchor),
            view.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        glyphView = view
        isAccessibilityElement = true
        accessibilityLabel = accessibility
        accessibilityTraits = .button
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            let scale = isHighlighted && isEnabled && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                self.transform = CGAffineTransform(scaleX: scale, y: scale)
            }.startAnimation()
        }
    }

    /// The touch area reaches 44pt round the 34pt box.
    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        bounds.insetBy(dx: -5, dy: -5).contains(point)
    }
}

/// The action box's face, swapped in and out (`icon-swap`): fading, scaling
/// from 0.25 and clearing a 4pt blur over `durControl` on the out curve.
final class SwapGlyph: UIView {
    enum Face: Equatable {
        case glyph(Glyph)
        case spinner
    }

    let face: Face
    private let sharp = UIImageView()
    private let soft = UIImageView()
    private let spinner = SpinnerView()

    init(_ face: Face, tint: UIColor) {
        self.face = face
        super.init(frame: CGRect(x: 0, y: 0, width: Size.iconMd, height: Size.iconMd))
        isUserInteractionEnabled = false
        switch face {
        case let .glyph(glyph):
            for view in [soft, sharp] {
                view.frame = bounds
                view.tintColor = tint
                addSubview(view)
            }
            let image = glyph.image.resized(to: Size.iconMd)
            sharp.image = image
            soft.image = image.blurredGlyph()
        case .spinner:
            spinner.frame = bounds
            spinner.tintColor = tint
            addSubview(spinner)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SwapGlyph is built in code")
    }

    func swapIn(animated: Bool, rest: CGAffineTransform) {
        guard animated, !UIAccessibility.isReduceMotionEnabled else {
            transform = rest
            soft.alpha = 0
            return
        }
        alpha = 0
        soft.alpha = 1
        sharp.alpha = 0
        transform = CGAffineTransform(scaleX: 0.25, y: 0.25)
        Motion.easeOut.animator(Motion.durControl) {
            self.alpha = 1
            self.soft.alpha = 0
            self.sharp.alpha = 1
            self.transform = rest
        }.startAnimation()
    }

    func swapOut(animated: Bool) {
        guard animated, !UIAccessibility.isReduceMotionEnabled else {
            removeFromSuperview()
            return
        }
        let leave = Motion.easeOut.animator(Motion.durControl) {
            self.alpha = 0
            self.soft.alpha = 1
            self.sharp.alpha = 0
            self.transform = CGAffineTransform(scaleX: 0.25, y: 0.25)
        }
        leave.addCompletion { _ in self.removeFromSuperview() }
        leave.startAnimation()
    }
}

/// The kit spinner (components/ui/spinner): a 16pt ring at 25% with a
/// quarter arc turning on it, in the tint.
public final class SpinnerView: UIView {
    private let track = CAShapeLayer()
    private let arc = CAShapeLayer()

    override public init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = true
        accessibilityLabel = "Loading"
        for layer in [track, arc] {
            layer.fillColor = nil
            layer.lineWidth = 2.5 * frame.width / 24
            layer.lineCap = .round
            self.layer.addSublayer(layer)
        }
        track.opacity = 0.25
        arc.strokeEnd = 0.25
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("SpinnerView is built in code")
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: bounds.width * 9 / 24, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true).cgPath
        for layer in [track, arc] {
            layer.frame = bounds
            layer.path = path
        }
    }

    override public func tintColorDidChange() {
        super.tintColorDidChange()
        track.strokeColor = tintColor.cgColor
        arc.strokeColor = tintColor.cgColor
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        tintColorDidChange()
        guard window != nil, arc.animation(forKey: "spin") == nil else { return }
        // Tailwind's animate-spin: a turn a second, linear.
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = Double.pi * 2
        spin.duration = 1
        spin.repeatCount = .infinity
        layer.add(spin, forKey: "spin")
    }
}

// MARK: Attachment chips

/// A pending attachment above the pill (`.att`): raised, on a hairline, the
/// tile shadow, its 20pt thumbnail or document glyph, its name in the label
/// role, and its 20pt remove.
///
/// A file says its size after its name. While it uploads, a 16pt ring (the
/// kit spinner's, filled as far as the upload has gone) stands in its
/// glyph's place and gives way to the glyph in a fade once the hub has it.
/// If the upload failed it says "Couldn't upload" in the failure ink, and a
/// tap on it tries again.
final class AttachmentChip: UIView {
    private(set) var attachment: ComposerAttachment
    private let onRemove: (AttachmentChip) -> Void
    private let onRetry: (String) -> Void
    private let progress = ProgressRing()
    private let glyph = GlyphView(.document, size: Size.iconMd, tint: Palette.inkMuted)
    private let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)

    init(_ attachment: ComposerAttachment, onRemove: @escaping (AttachmentChip) -> Void, onRetry: @escaping (String) -> Void) {
        self.attachment = attachment
        self.onRemove = onRemove
        self.onRetry = onRetry
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let thumb: UIView
        switch attachment {
        case let .image(_, _, data):
            let image = UIImageView(image: UIImage(data: data))
            image.contentMode = .scaleAspectFill
            image.clipsToBounds = true
            image.layer.cornerRadius = Radius.radiusXs
            thumb = image
        case .text:
            thumb = glyph
        case .file:
            // The glyph and the ring share the thumb's place; one shows at a time.
            let slot = UIView()
            for view in [glyph, progress] as [UIView] {
                view.translatesAutoresizingMaskIntoConstraints = false
                slot.addSubview(view)
                NSLayoutConstraint.activate([
                    view.centerXAnchor.constraint(equalTo: slot.centerXAnchor),
                    view.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
                ])
            }
            NSLayoutConstraint.activate([
                progress.widthAnchor.constraint(equalToConstant: Size.iconMd),
                progress.heightAnchor.constraint(equalToConstant: Size.iconMd),
            ])
            thumb = slot
        case .pending:
            // The kit spinner while the pick is read off its source.
            let slot = UIView()
            let spinner = SpinnerView(frame: CGRect(x: 0, y: 0, width: Size.iconMd, height: Size.iconMd))
            spinner.tintColor = Palette.inkMuted
            spinner.accessibilityLabel = "Reading \(attachment.name)"
            spinner.translatesAutoresizingMaskIntoConstraints = false
            slot.addSubview(spinner)
            NSLayoutConstraint.activate([
                spinner.centerXAnchor.constraint(equalTo: slot.centerXAnchor),
                spinner.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
                spinner.widthAnchor.constraint(equalToConstant: Size.iconMd),
                spinner.heightAnchor.constraint(equalToConstant: Size.iconMd),
            ])
            thumb = slot
        }
        thumb.translatesAutoresizingMaskIntoConstraints = false
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = attachment.name
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        meta.tabular = true
        meta.setContentCompressionResistancePriority(.required, for: .horizontal)
        meta.setContentHuggingPriority(.required, for: .horizontal)
        var config = UIButton.Configuration.plain()
        config.image = Glyph.close.image.resized(to: Size.iconMd)
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusXs
        let remove = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            guard let self else { return }
            onRemove(self)
        })
        remove.accessibilityLabel = "Remove \(attachment.name)"
        remove.houseStyle()
        var parts: [UIView] = [thumb, name]
        if case .file = attachment {
            parts.append(meta)
            addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        }
        parts.append(remove)
        let row = UIStackView(arrangedSubviews: parts)
        row.spacing = Space.space2
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            thumb.widthAnchor.constraint(equalToConstant: 20),
            thumb.heightAnchor.constraint(equalToConstant: 20),
            remove.widthAnchor.constraint(equalToConstant: 20),
            remove.heightAnchor.constraint(equalToConstant: 20),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space1),
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            widthAnchor.constraint(lessThanOrEqualToConstant: 280),
        ])
        boxShadow = Shadow.shadowTile
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: AttachmentChip, _: UITraitCollection) in
            chip.paint()
        }
        paint()
        renderFile(animated: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AttachmentChip is built in code")
    }

    /// The same attachment as it stands now: a file's upload moved along.
    func update(_ next: ComposerAttachment) {
        guard next != attachment else { return }
        attachment = next
        renderFile(animated: window != nil)
    }

    /// A file's face for where its upload stands.
    private func renderFile(animated: Bool) {
        guard case let .file(_, name, _, size, state) = attachment else { return }
        let uploading: Bool
        switch state {
        case let .uploading(fraction):
            uploading = true
            progress.set(fraction, animated: animated)
            meta.text = humanSize(size)
            meta.ink = Palette.inkMuted
            accessibilityHint = nil
            meta.accessibilityLabel = "Uploading, \(Int((fraction * 100).rounded())) percent"
        case .ready:
            uploading = false
            meta.text = humanSize(size)
            meta.ink = Palette.inkMuted
            meta.accessibilityLabel = nil
        case .failed:
            uploading = false
            meta.text = "Couldn't upload"
            meta.ink = Palette.statusFailInk
            meta.accessibilityLabel = "Couldn't upload \(name). Tap to try again."
        }
        meta.accessibilityTraits = isFailed ? .button : .staticText
        // The ring gives way to the glyph (and back, for a retry) in a fade;
        // opacity alone, so it keeps under Reduce Motion.
        let show = { [progress, glyph] in
            progress.alpha = uploading ? 1 : 0
            glyph.alpha = uploading ? 0 : 1
        }
        if animated {
            Motion.easeOut.animator(Motion.durControl) { show() }.startAnimation()
        } else {
            show()
        }
    }

    private var isFailed: Bool {
        if case .file(_, _, _, _, .failed) = attachment { return true }
        return false
    }

    @objc private func tapped() {
        guard isFailed, case let .file(id, _, _, _, _) = attachment else { return }
        Feel.prepare()
        onRetry(id)
    }

    private func paint() {
        layer.borderWidth = 1
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}

/// The kit spinner's ring (`SpinnerView`), still and filled as far as an
/// upload has gone: a 16pt ring at 25% in the tint, the arc from the top.
/// A new fraction eases the arc on from where it stands, never from empty.
final class ProgressRing: UIView {
    private let track = CAShapeLayer()
    private let arc = CAShapeLayer()

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        tintColor = Palette.inkMuted
        for layer in [track, arc] {
            layer.fillColor = nil
            layer.lineWidth = 2.5 * Size.iconMd / 24
            layer.lineCap = .round
            self.layer.addSublayer(layer)
        }
        track.opacity = 0.25
        arc.strokeEnd = 0
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProgressRing is built in code")
    }

    func set(_ fraction: Double, animated: Bool) {
        let to = min(1, max(0, fraction))
        let from = arc.presentation()?.strokeEnd ?? arc.strokeEnd
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        arc.strokeEnd = to
        CATransaction.commit()
        guard animated, !UIAccessibility.isReduceMotionEnabled else {
            arc.removeAnimation(forKey: "fill")
            return
        }
        let fill = CABasicAnimation(keyPath: "strokeEnd")
        fill.fromValue = from
        fill.toValue = to
        fill.duration = Motion.durControl
        fill.timingFunction = Motion.easeOut.function
        arc.add(fill, forKey: "fill")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: bounds.width * 9 / 24,
                                startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true).cgPath
        for layer in [track, arc] {
            layer.frame = bounds
            layer.path = path
        }
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        track.strokeColor = tintColor.cgColor
        arc.strokeColor = tintColor.cgColor
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        tintColorDidChange()
    }
}
