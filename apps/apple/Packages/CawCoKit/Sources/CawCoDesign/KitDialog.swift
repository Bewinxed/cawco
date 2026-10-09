import UIKit

/// The kit's dialog (ui/dialog/dialog-content.svelte on `.kit-dialog`): a
/// card centred over the scrim, `--radius-modal` on the recess with the
/// overlay shadow and 6pt of frame round the raised body (`--radius-lg`,
/// 18pt in), its parts 24pt apart, and the ghost close button 12pt in from
/// the body's top right. As wide as `width` and 16pt clear of each side of
/// the screen. It keeps above the keyboard; content taller than the room
/// left scrolls inside the body. Whatever changes its height moves it over
/// `durMorph` on the drawer curve (`morph()`). It rises 6pt as it fades in
/// over `durPanel`, and leaves over `durExit`. A tap on the scrim, Escape
/// or the close button closes it, unless `holdsOpen`.
open class KitDialogController: UIViewController, UIViewControllerTransitioningDelegate {
    /// `max-w-xs` (the alert dialog below `sm`), `sm:max-w-md`, `-lg`, `-xl`, `-2xl`.
    public enum Width: Sendable {
        case xs, md, lg, xl, xl2

        var points: Double {
            switch self {
            case .xs: 320
            case .md: 448
            case .lg: 512
            case .xl: 576
            case .xl2: 672
            }
        }
    }

    /// The dialog's parts, top to bottom, 24pt apart (`grid gap-6`).
    public let body = UIStackView()
    /// While true the scrim, Escape and the close button leave it up.
    public var holdsOpen = false
    /// The control that opened it: the dialog grows out of it over `durPanel`
    /// on the drawer curve and shrinks back into it over `durExit`
    /// (WorkflowLaunch.svelte). Without one it rises 6pt as it fades in.
    public weak var origin: UIView?
    /// Where the card stands in the dialog's view.
    var cardFrame: CGRect { frameView.frame }
    private let width: Width
    private let closable: Bool
    private let frameView = UIView()
    private let card = UIView()
    private let scroll = UIScrollView()

    public init(width: Width = .md, closable: Bool = true) {
        self.width = width
        self.closable = closable
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("KitDialogController is built in code")
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        frameView.backgroundColor = Palette.surfaceRecess
        frameView.layer.cornerRadius = Radius.radiusModal
        frameView.layer.cornerCurve = .continuous
        frameView.boxShadow = Shadow.shadowOverlay
        frameView.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.clipsToBounds = true
        card.translatesAutoresizingMaskIntoConstraints = false
        frameView.addSubview(card)
        view.addSubview(frameView)

        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        card.addSubview(scroll)
        body.axis = .vertical
        body.spacing = 24
        body.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(body)

        let wanted = frameView.widthAnchor.constraint(equalToConstant: width.points)
        // Under the screen's own edge (the required cap below), over anything
        // the content asks for: at `.defaultHigh` it tied with a label's pull
        // to stand on one line (its compression resistance), so on a wide
        // screen a body's lines were laid out one line tall and cut.
        wanted.priority = .required - 1
        // As tall as what it holds, until the screen (or the keyboard) stops it;
        // centred only where that leaves it room. Its height outranks its
        // centring: a tall dialog rises above the keyboard whole instead of
        // shrinking round the screen's middle, behind the keys.
        let fits = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        // Under a label's resistance to being squeezed, so a body too tall for the room scrolls and keeps its lines.
        fits.priority = .defaultHigh - 1
        let centred = frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        centred.priority = .defaultHigh - 2
        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            wanted,
            frameView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -32),
            centred,
            frameView.topAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            frameView.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -16),
            frameView.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            card.topAnchor.constraint(equalTo: frameView.topAnchor, constant: 6),
            card.bottomAnchor.constraint(equalTo: frameView.bottomAnchor, constant: -6),
            card.leadingAnchor.constraint(equalTo: frameView.leadingAnchor, constant: 6),
            card.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -6),
            scroll.topAnchor.constraint(equalTo: card.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            fits,
            body.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space5),
            body.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space5),
            body.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space5),
            body.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space5),
        ])
        view.keyboardLayoutGuide.followsUndockedKeyboard = true
        // The field being typed in stays in view: when one takes the keyboard,
        // and again once the keyboard has taken its room from the dialog.
        let centre = NotificationCenter.default
        for name in [UITextField.textDidBeginEditingNotification, UITextView.textDidBeginEditingNotification] {
            centre.addObserver(self, selector: #selector(fieldTookKeyboard(_:)), name: name, object: nil)
        }
        centre.addObserver(self, selector: #selector(keyboardSettled), name: UIResponder.keyboardDidShowNotification, object: nil)

        if closable {
            let close = KitGhostButton(.close, label: "Close")
            close.addAction(UIAction { [weak self] _ in self?.requestClose() }, for: .primaryActionTriggered)
            card.addSubview(close)
            NSLayoutConstraint.activate([
                close.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),
                close.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
            ])
        }
    }

    private weak var typing: UIView?

    @objc private func fieldTookKeyboard(_ note: Notification) {
        guard let field = note.object as? UIView, field.isDescendant(of: body) else { return }
        typing = field
        reveal(animated: true)
    }

    @objc private func keyboardSettled() {
        reveal(animated: true)
    }

    /// Scrolls the field being typed in into the body, 12pt clear of its edges.
    private func reveal(animated: Bool) {
        guard let typing, typing.window != nil else { return }
        view.layoutIfNeeded()
        scroll.scrollRectToVisible(typing.convert(typing.bounds, to: scroll).insetBy(dx: 0, dy: -12), animated: animated && !UIAccessibility.isReduceMotionEnabled)
    }

    /// Runs `change`, then moves the dialog to its new height (`morph()`:
    /// `durMorph` on the drawer curve; at once with less motion).
    public func morph(_ change: () -> Void) {
        view.layoutIfNeeded()
        change()
        guard !UIAccessibility.isReduceMotionEnabled, view.window != nil else {
            view.layoutIfNeeded()
            return
        }
        Motion.easeDrawer.animator(Motion.durMorph) { self.view.layoutIfNeeded() }.startAnimation()
    }

    /// The close every way out of the dialog takes.
    open func requestClose() {
        guard !holdsOpen else { return }
        dismiss(animated: true)
    }

    // MARK: Presentation

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        ScrimPresentation(presentedViewController: presented, presenting: presenting) { [weak self] in self?.requestClose() }
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        DialogAnimator(presenting: true, origin: origin)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        DialogAnimator(presenting: false, origin: origin)
    }

    override open func accessibilityPerformEscape() -> Bool {
        guard !holdsOpen else { return false }
        requestClose()
        return true
    }

    override open var keyCommands: [UIKeyCommand]? {
        let escape = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escapePressed))
        escape.wantsPriorityOverSystemBehavior = true
        return [escape]
    }

    @objc private func escapePressed() { requestClose() }

    /// The kit's dialog header (`dialog-header`): the title in title type,
    /// the description under it in label type and muted ink, 8pt apart; a
    /// glyph leads the title when given (`flex items-center gap-2`).
    public static func header(title: String, description: String? = nil, glyph: Glyph? = nil, glyphTint: UIColor = Palette.inkStrong) -> UIStackView {
        let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
        titleLabel.text = title
        titleLabel.accessibilityTraits = .header
        var top: UIView = titleLabel
        if let glyph {
            let row = UIStackView(arrangedSubviews: [GlyphView(glyph, size: 16, tint: glyphTint), titleLabel])
            row.spacing = 8
            row.alignment = .center
            top = row
        }
        // The title clears the close button; the description runs the full width.
        let titleRow = UIStackView(arrangedSubviews: [top])
        titleRow.isLayoutMarginsRelativeArrangement = true
        titleRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 28)
        let stack = UIStackView(arrangedSubviews: [titleRow])
        stack.axis = .vertical
        stack.spacing = 8
        if let description {
            let label = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground, lines: 0)
            label.text = description
            stack.addArrangedSubview(label)
        }
        return stack
    }

    /// The kit's `sm` breakpoint (640pt), where a dialog's footer turns from a
    /// stack into a row. Decided from the screen the dialog opens on.
    public static var wide: Bool { UIScreen.main.bounds.width >= 640 }

    /// The kit's dialog footer (`dialog-footer`): the buttons at the end in
    /// a row from 640pt, stacked below it with the last one on top. Every
    /// button keeps its own height: a footer given more room than its buttons
    /// (a dialog holding its height while it works) never stretches them.
    public static func footer(_ buttons: [UIView]) -> UIStackView {
        guard wide else {
            let stack = UIStackView(arrangedSubviews: buttons.reversed())
            stack.axis = .vertical
            stack.spacing = 8
            return stack
        }
        return actions(buttons)
    }

    /// A form's own button row (`flex justify-end gap-2`): the buttons at the
    /// end, in reading order, at every width, each at its own height.
    public static func actions(_ buttons: [UIView]) -> UIStackView {
        let stack = UIStackView(arrangedSubviews: [UIView()] + buttons)
        stack.spacing = 8
        stack.alignment = .center
        return stack
    }
}

/// A block of preformatted text in a dialog (`<pre>`): monospaced at meta
/// size, selectable, in a bordered box as tall as its text up to `maxHeight`,
/// then scrolling. `follow` keeps the last line in view as text arrives.
public final class KitPre: UITextView {
    private let maxHeight: Double
    private let border: UIColor
    private let follow: Bool

    /// `leading` is the box's line height over its font size (`line-height`).
    public init(_ text: String, fill: UIColor, border: UIColor, radius: Double, inset: NSDirectionalEdgeInsets,
                leading: Double, maxHeight: Double, follow: Bool = false) {
        self.maxHeight = maxHeight
        self.border = border
        self.follow = follow
        super.init(frame: .zero, textContainer: nil)
        translatesAutoresizingMaskIntoConstraints = false
        isEditable = false
        isSelectable = true
        let font = TypeScale.typeCode.with(points: TypeScale.typeMeta.points).font
        let line = NSMutableParagraphStyle()
        line.minimumLineHeight = font.pointSize * leading
        line.maximumLineHeight = font.pointSize * leading
        attributedText = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: Palette.inkStrong, .paragraphStyle: line])
        backgroundColor = fill
        layer.cornerRadius = radius
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        textContainerInset = UIEdgeInsets(top: inset.top, left: inset.leading, bottom: inset.bottom, right: inset.trailing)
        textContainer.lineFragmentPadding = 0
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (pre: KitPre, _: UITraitCollection) in pre.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitPre is built in code")
    }

    private func paint() {
        layer.borderColor = border.resolvedColor(with: traitCollection).cgColor
    }

    override public var contentSize: CGSize {
        didSet {
            guard contentSize.height != oldValue.height else { return }
            invalidateIntrinsicContentSize()
            if follow { setContentOffset(CGPoint(x: 0, y: max(0, contentSize.height - bounds.height)), animated: false) }
        }
    }

    override public var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: min(maxHeight, contentSize.height))
    }
}

/// The kit's ghost icon button at `icon-sm` (30pt, `--c-btn-h-sm`; `--radius-sm`): no fill
/// at rest, `--surface-hover` under a pointer, `--surface-fill` pressed, a
/// 16pt glyph in muted ink.
public final class KitGhostButton: UIButton {
    public init(_ glyph: Glyph, label: String, side: Double = Size.cBtnHSm, tint: UIColor = Palette.inkMuted) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = glyph.image.resized(to: Size.iconMd)
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusSm
        configuration = config
        tintColor = tint
        accessibilityLabel = label
        houseStyle()
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: side),
            heightAnchor.constraint(equalToConstant: side),
        ])
        configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : (button.isHovered ? Palette.surfaceHover : .clear)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitGhostButton is built in code")
    }
}

/// One view at a time, swapped by a cross-fade (`{#key}` with crossIn /
/// crossOut): the leaving view is pinned where it stood and fades out over
/// `durControl` while the arriving one fades in on the out curve. `held`
/// keeps the box at least as tall as the view it replaced, so an answer
/// lands where the form's submit was.
public final class CrossView: UIView {
    public private(set) var current: UIView?
    private var floor: NSLayoutConstraint?

    public init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CrossView is built in code")
    }

    /// Lets go of the height `show(_:holdHeight:)` held: the box is as tall
    /// as what it now shows (in the caller's `morph`).
    public func release() {
        floor?.isActive = false
        floor = nil
    }

    public func show(_ next: UIView, holdHeight: Bool = false) {
        let leaving = current
        let height = bounds.height
        current = next
        next.translatesAutoresizingMaskIntoConstraints = false
        addSubview(next)
        NSLayoutConstraint.activate([
            next.topAnchor.constraint(equalTo: topAnchor),
            next.leadingAnchor.constraint(equalTo: leadingAnchor),
            next.trailingAnchor.constraint(equalTo: trailingAnchor),
            next.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor),
        ])
        let fill = next.bottomAnchor.constraint(equalTo: bottomAnchor)
        fill.priority = .defaultHigh
        fill.isActive = true
        floor?.isActive = false
        floor = nil
        if holdHeight, height > 0 {
            floor = heightAnchor.constraint(greaterThanOrEqualToConstant: height)
            floor?.isActive = true
        }
        guard let leaving, window != nil, !UIAccessibility.isReduceMotionEnabled else {
            leaving?.removeFromSuperview()
            return
        }
        // Pinned where it stood: it no longer sizes the box.
        let frame = leaving.frame
        leaving.removeFromSuperview()
        leaving.translatesAutoresizingMaskIntoConstraints = true
        leaving.frame = frame
        leaving.isUserInteractionEnabled = false
        addSubview(leaving)
        next.alpha = 0
        let animator = Motion.easeOut.animator(Motion.durControl) {
            next.alpha = 1
            leaving.alpha = 0
        }
        animator.addCompletion { _ in leaving.removeFromSuperview() }
        animator.startAnimation()
    }
}
