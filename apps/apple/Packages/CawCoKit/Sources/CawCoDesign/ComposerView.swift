import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

/// Something the turn carries beside its typed words (Composer.svelte
/// `draft.images` / `draft.texts`): an image, or a text the reader attached
/// or pasted at length.
public enum ComposerAttachment: Sendable, Equatable {
    case image(name: String, mediaType: String, data: Data)
    case text(name: String, content: String)

    public var name: String {
        switch self {
        case let .image(name, _, _), let .text(name, _): name
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
/// - Attach and Send/Stop are 34pt boxes (radius 12 − 7), bottom-aligned,
///   10pt apart. Send and Stop are one box: its glyph swaps (`icon-swap`:
///   opacity, scale 0.25→1, a 4pt blur clearing) over `durControl`, a spinner
///   while the send is in flight; empty and idle it rests at 55% with no
///   gradient. Both scale to `pressScale` under the finger.
/// - Parked prompts stand in their own column above (`prompts`), 11pt apart,
///   so a card coming or going never moves the pill.
@MainActor
public final class ComposerView: UIView, UITextViewDelegate {
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
    private var attachments: [ComposerAttachment] = [] {
        didSet { renderAttachments() }
    }

    private let column = UIStackView()
    private let error = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var errorBox: UIView?
    private let chips = UIStackView()
    private let chipsRow = UIScrollView()
    private let ring = UIView()
    private let pill = UIView()
    private let material = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
    private let tint = UIView()
    let field = ComposerField(usingTextLayoutManager: true)
    private let hint = KitLabel(ComposerView.fieldRole, ink: Palette.inkMuted, tracking: -0.01)
    private let more = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let attach = PressBox()
    private let actionBox = PressBox()
    private let gradient = CAGradientLayer()
    private var glyph: SwapGlyph?
    private var fieldHeight: NSLayoutConstraint!
    private var folded = false
    private var lines = 1

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
        field.onReturn = { [weak self] in self?.submit() }
        hint.text = Self.hintShort
        hint.isUserInteractionEnabled = false
        hint.translatesAutoresizingMaskIntoConstraints = false
        more.tabular = true
        more.textAlignment = .right
        more.isHidden = true
        more.translatesAutoresizingMaskIntoConstraints = false

        attach.configure(glyph: .plus, accessibility: "Attach a file or image")
        actionBox.addAction(UIAction { [weak self] _ in self?.pressAction() }, for: .primaryActionTriggered)
        actionBox.accessibilityIdentifier = "send-steer"
        gradient.cornerRadius = Radius.radiusLg - Self.inset
        gradient.cornerCurve = .continuous
        actionBox.layer.insertSublayer(gradient, at: 0)

        let controls = UIStackView(arrangedSubviews: [attach, actionBox])
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
    }

    private func paint() {
        let traits = traitCollection
        pill.layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
        attach.layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
        gradient.colors = Palette.actionSurface.colors(for: traits)
        let opaque = UIAccessibility.isReduceTransparencyEnabled
        material.isHidden = opaque
        tint.backgroundColor = opaque ? Palette.surfaceRaised : Palette.materialPanel
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
        endFlight()
        setField(source.draft)
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
        guard flight != nil else { return true }
        endFlight()
        field.insertText(text)
        return false
    }

    public func textViewDidChange(_: UITextView) {
        // Typed in place: the text is the reader's, and any hold lets go.
        binding?.draft = field.text ?? ""
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

    private func pressAction() {
        guard !held else { return }
        switch action {
        case .stop: binding?.onStop()
        case .send: submit()
        case .sending: break
        }
    }

    /// A refused send never eats what was typed: nothing to send, the last
    /// one still out, or a swipe still carrying the conversation leaves the
    /// draft as it is. The pane clears it once it has the message.
    private func submit() {
        guard let binding, writable, !held, action != .sending, hasContent, flight == nil else { return }
        let words = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
        binding.onSend(words, attachments)
    }

    private func renderAction(animated: Bool) {
        let enabled = writable && !held && (action != .send || hasContent)
        actionBox.isEnabled = enabled && action != .sending
        actionBox.isUserInteractionEnabled = action != .sending
        actionBox.alpha = enabled || action == .sending ? 1 : 0.55
        gradient.isHidden = !enabled && action == .send
        actionBox.backgroundColor = Palette.actionSolid
        actionBox.layer.cornerRadius = Radius.radiusLg - Self.inset
        actionBox.layer.cornerCurve = .continuous
        actionBox.accessibilityLabel = action == .stop ? "Stop the agent" : "Send message"
        actionBox.accessibilityTraits = action == .sending ? [.button, .notEnabled] : .button
        let next: SwapGlyph.Face = switch action {
        case .send: .glyph(Glyph.send)
        case .stop: .glyph(.stop)
        case .sending: .spinner
        }
        // The send plane's mass sits low-left: nudged up and right while it can be pressed.
        let nudge = action == .send && enabled ? CGAffineTransform(translationX: 0.5, y: -0.5) : .identity
        if let glyph, glyph.face == next {
            glyph.transform = nudge
            return
        }
        let incoming = SwapGlyph(next, tint: Palette.onAction)
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

    private func renderAttachments() {
        binding?.attachments = attachments
        chips.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (index, attachment) in attachments.enumerated() {
            let chip = AttachmentChip(attachment) { [weak self] in
                guard let self, index < attachments.count else { return }
                attachments.remove(at: index)
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

// MARK: The field

/// The composer's text view: Return sends (Shift-Return is a new line on a
/// keyboard), and a long paste becomes an attachment.
final class ComposerField: UITextView {
    var onReturn: () -> Void = {}
    var onPaste: (String) -> Void = { _ in }

    override func paste(_ sender: Any?) {
        if let text = UIPasteboard.general.string, text.count > ComposerView.largePaste {
            onPaste(text)
            return
        }
        super.paste(sender)
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
final class AttachmentChip: UIView {
    private let onRemove: () -> Void

    init(_ attachment: ComposerAttachment, onRemove: @escaping () -> Void) {
        self.onRemove = onRemove
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
            thumb = GlyphView(.document, size: Size.iconMd, tint: Palette.inkMuted)
        }
        thumb.translatesAutoresizingMaskIntoConstraints = false
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = attachment.name
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        var config = UIButton.Configuration.plain()
        config.image = Glyph.close.image.resized(to: Size.iconMd)
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusXs
        let remove = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.onRemove() })
        remove.accessibilityLabel = "Remove \(attachment.name)"
        remove.houseStyle()
        let row = UIStackView(arrangedSubviews: [thumb, name, remove])
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
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AttachmentChip is built in code")
    }

    private func paint() {
        layer.borderWidth = 1
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}
