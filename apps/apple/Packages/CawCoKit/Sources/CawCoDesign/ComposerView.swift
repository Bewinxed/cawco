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

    /// The parked permission and question cards, standing on the pill.
    public let prompts = UIStackView()
    public var onSend: (String, [ComposerAttachment]) -> Void = { _, _ in }
    public var onStop: () -> Void = {}
    /// What Attach offers (the pickers), as iOS offers a file input's sources.
    public var attachMenu: UIMenu? {
        didSet {
            attach.menu = attachMenu
            attach.showsMenuAsPrimaryAction = true
        }
    }
    /// The composer's height changed (a line, a fold, a card, a chip).
    public var onHeight: () -> Void = {}

    public var action: Action = .send {
        didSet { if action != oldValue { renderAction(animated: window != nil) } }
    }

    /// Whether the session can be written to at all.
    public var writable = true {
        didSet { renderAction(animated: false) }
    }

    public var attachments: [ComposerAttachment] = [] {
        didSet { renderAttachments() }
    }

    /// Why the last send did not go through, said over the pill.
    public var sendError: String? {
        didSet {
            error.text = sendError
            errorBox?.isHidden = (sendError ?? "").isEmpty
            onHeight()
        }
    }

    public var text: String {
        get { field.text ?? "" }
        set { field.text = newValue; textChanged(animated: false) }
    }

    public var isWriting: Bool { field.isFirstResponder }

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
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = fieldRole.lineHeight
        paragraph.maximumLineHeight = fieldRole.lineHeight
        return [
            .font: font,
            .foregroundColor: Palette.inkStrong,
            .paragraphStyle: paragraph,
            .baselineOffset: (fieldRole.lineHeight - font.lineHeight) / 4,
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
        // The cards keep a step off the pill (`.stack` padding, `.prompts` margin).
        column.setCustomSpacing(Space.space3 + Space.space4 - Space.space2, after: prompts)

        error.isHidden = true
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
        NSLayoutConstraint.activate([
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
        // The tile shadow's ring and drop stand outside the 1pt control border.
        ring.translatesAutoresizingMaskIntoConstraints = false
        ring.layer.cornerRadius = Radius.radiusLg + 1
        ring.layer.cornerCurve = .continuous
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
        field.textContainerInset = UIEdgeInsets(top: pad, left: 0, bottom: pad, right: 0)
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
            pill.leadingAnchor.constraint(equalTo: ring.leadingAnchor, constant: 1),
            pill.trailingAnchor.constraint(equalTo: ring.trailingAnchor, constant: -1),
            pill.topAnchor.constraint(equalTo: ring.topAnchor, constant: 1),
            pill.bottomAnchor.constraint(equalTo: ring.bottomAnchor, constant: -1),
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
        ring.layer.draw(Shadow.shadowTile, in: traits)
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
        for face in actionBox.subviews where face is SwapGlyph {
            face.center = CGPoint(x: actionBox.bounds.midX, y: actionBox.bounds.midY)
        }
        ring.layer.shadowPath = UIBezierPath(roundedRect: ring.bounds, cornerRadius: ring.layer.cornerRadius).cgPath
        CATransaction.commit()
        fitHint()
        maskField()
    }

    // MARK: The field

    public func focus() {
        field.becomeFirstResponder()
    }

    public func textViewDidChange(_: UITextView) {
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
        fit(animated: animated, duration: Motion.durControl)
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
        switch action {
        case .stop: onStop()
        case .send: submit()
        case .sending: break
        }
    }

    /// A refused send never eats what was typed: nothing to send, or the
    /// last one still out, leaves the draft as it is.
    private func submit() {
        guard writable, action == .send, hasContent else { return }
        let words = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
        onSend(words, attachments)
    }

    /// Clears the draft once the host has the message.
    public func sent() {
        field.text = ""
        attachments = []
        textChanged(animated: true)
    }

    private func renderAction(animated: Bool) {
        let enabled = writable && (action != .send || hasContent)
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
        actionBox.addSubview(incoming)
        incoming.center = CGPoint(x: Self.control / 2, y: Self.control / 2)
        let outgoing = glyph
        glyph = incoming
        incoming.swapIn(animated: animated, rest: nudge)
        outgoing?.swapOut(animated: animated)
    }

    // MARK: Attachments

    public func attach(_ attachment: ComposerAttachment) {
        attachments.append(attachment)
    }

    /// A paste past this many characters rides as a named attachment.
    static let largePaste = 1200

    private func attachPaste(_ text: String) {
        attach(.text(name: "Pasted text · \(text.count.formatted()) chars", content: text))
    }

    private func renderAttachments() {
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
            soft.image = Self.blurred(image)
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

    /// The glyph under a 4pt blur, drawn once: the far end of the swap.
    private static func blurred(_ image: UIImage) -> UIImage? {
        let scale = UITraitCollection.current.displayScale
        let size = CGSize(width: image.size.width + 16, height: image.size.height + 16)
        let padded = UIGraphicsImageRenderer(size: size).image { _ in
            image.withTintColor(.black).draw(at: CGPoint(x: 8, y: 8))
        }
        guard let input = CIImage(image: padded) else { return nil }
        let filter = CIFilter.gaussianBlur()
        filter.inputImage = input
        filter.radius = Float(4 * scale)
        guard let output = filter.outputImage?.cropped(to: input.extent),
              let cg = CIContext().createCGImage(output, from: input.extent)
        else { return nil }
        let soft = UIImage(cgImage: cg, scale: padded.scale, orientation: .up).withRenderingMode(.alwaysTemplate)
        return UIGraphicsImageRenderer(size: image.size).image { _ in
            soft.draw(in: CGRect(x: -8, y: -8, width: size.width, height: size.height))
        }.withRenderingMode(.alwaysTemplate)
    }
}

/// The kit spinner (components/ui/spinner): a 16pt ring at 25% with a
/// quarter arc turning on it, in the tint.
final class SpinnerView: UIView {
    private let track = CAShapeLayer()
    private let arc = CAShapeLayer()

    override init(frame: CGRect) {
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
    required init?(coder _: NSCoder) {
        fatalError("SpinnerView is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: bounds.width * 9 / 24, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true).cgPath
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
        layer.draw(Shadow.shadowTile, in: traitCollection)
        layer.borderWidth = 1
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}
