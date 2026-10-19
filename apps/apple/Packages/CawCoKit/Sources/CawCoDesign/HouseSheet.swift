import UIKit

/// The house bottom sheet (vaul, components/ui/drawer; DESIGN.md "Dialog,
/// sheet and drawer"), presented over the scrim:
///
/// - `.card`: the drawer, one recipe for every bottom sheet. Its raised
///   surface is full-bleed: edge to edge and flush on the screen's foot,
///   rounded 12 at the top corners only, the hairline along the top edge
///   only. Its 100×6 grabber, then one header (drawer-header,
///   `.kit-sheet-head`): the title in the title role and Close at the
///   trailing edge (a 28pt ghost with a 16pt glyph, 44pt under a finger),
///   a seam under it that comes in over the first 11pt of the content's
///   scroll. The content stands on the surface 16pt in from the sides and
///   16pt plus the safe area above the foot; as tall as its content, up to
///   85% of the screen.
/// - `.edge`: the session details sheet (PaneTabs.svelte): flush to the
///   bottom and sides, rounded on top, its border open at the foot.
///
/// It slides its whole height in over `durPanel` on the drawer curve and
/// leaves over `durExit`; with Reduce Motion it fades over `durControl`. A
/// finger drags it 1:1 down, rubber-banding upward (35% of travel, at most
/// 25% of its height); let go past 30% of its height, or flicked faster than
/// 0.3 pt/ms, it leaves on the settle spring at the finger's speed as the
/// scrim fades with it; otherwise the spring puts it back. A tap on the scrim
/// closes it.
@MainActor
public final class HouseSheetController: UIViewController, UIViewControllerTransitioningDelegate, UIGestureRecognizerDelegate {
    public enum Style: Sendable {
        case card
        case edge
        /// The drawer from the right (vaul `direction="right"`): the same
        /// raised card, as tall as the screen less its 8pt inset, three
        /// quarters of the screen wide and at most `sm` (384pt), no grabber.
        /// It slides its width in and is dragged away to the right.
        case side
    }

    /// The content's foot stops at the safe area alone, without the drawer's
    /// own padding under it (the peek sheet's `padding-bottom: env(safe-area-inset-bottom)`).
    public var footAtSafeArea = false

    /// On a regular width the `.card` stands as a form this wide, centred in
    /// the window and sized to its content (the paywall's 540pt); a compact
    /// width keeps the drawer. Set before the sheet is presented.
    public var formWidth: Double?
    private var drawerPlace: [NSLayoutConstraint] = []
    private var formPlace: [NSLayoutConstraint] = []
    private var isForm: Bool { formWidth != nil && traitCollection.horizontalSizeClass == .regular }

    private let content: UIViewController
    private let style: Style
    private let titleText: String?
    let card = UIView()
    private let handle = UIView()
    private weak var scroller: UIScrollView?
    private var dragging = false

    /// The most of the screen it stands tall, where a sheet sets its own
    /// (the paywall's 90%); nil, the style's (80%, 88%).
    private let cap: Double?

    /// `scroller`: the content's own scroll view, which hands a downward pull
    /// to the sheet once it is at its top (vaul's `lockAtTop`).
    public init(_ content: UIViewController, title: String? = nil, style: Style = .card, scroller: UIScrollView? = nil, cap: Double? = nil) {
        self.content = content
        self.style = style
        self.cap = cap
        titleText = title
        self.scroller = scroller
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HouseSheetController is built in code")
    }

    override public func loadView() {
        view = SheetGround()
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        if style == .edge {
            card.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        }
        card.boxShadow = Shadow.shadowDrawer
        view.addSubview(card)
        topEdge.fillColor = nil
        topEdge.lineWidth = 1
        card.layer.addSublayer(topEdge)
        paint()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (sheet: HouseSheetController, _: UITraitCollection) in
            sheet.paint()
        }

        handle.translatesAutoresizingMaskIntoConstraints = false
        handle.backgroundColor = Palette.muted
        handle.layer.cornerRadius = 3
        handle.isAccessibilityElement = false
        card.addSubview(handle)

        let column = UIStackView()
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        if let titleText {
            // `.kit-sheet-head`: the title in the title role, Close at the trailing
            // edge, `space-2` apart; `space-3` under the grabber and over its seam.
            let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
            title.text = titleText
            title.accessibilityTraits = .header
            title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let close = SheetCloseButton()
            close.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .primaryActionTriggered)
            let head = UIStackView(arrangedSubviews: [title, close])
            head.spacing = Space.space2
            head.alignment = .center
            head.isLayoutMarginsRelativeArrangement = true
            head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: 0, bottom: Space.space3, trailing: 0)
            column.addArrangedSubview(head)
            seam.backgroundColor = Palette.borderHairline
            seam.alpha = 0
            seam.heightAnchor.constraint(equalToConstant: 1).isActive = true
            column.addArrangedSubview(seam)
            watchScroll()
        }
        addChild(content)
        column.addArrangedSubview(content.view)
        content.didMove(toParent: self)
        card.addSubview(column)

        // vaul's content box, `p-4`: the drawer's surface is full-bleed
        // (`before:inset-x-0 before:bottom-0`), its content 16 in. The side
        // drawer keeps the raised inner card, inset 8 inside its box.
        let inset = style == .side ? 8.0 : 0
        let pad = switch style {
        case .card: 16.0
        case .edge: 0.0
        case .side: 8.0
        }
        footPad = column.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -pad)
        // The edge sheet's 1pt border is part of its box on the web: its
        // content stands inside it at the sides (the foot's is open).
        let side = style == .edge ? 1 : pad
        let trailing = card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -inset)
        drawerPlace.append(trailing)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: side),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -side),
            footPad,
        ])
        if style == .side {
            handle.isHidden = true
            // `w-3/4 sm:max-w-sm` is the content box; the card stands 8pt inside it.
            let wide = card.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.75, constant: -inset * 2)
            wide.priority = .defaultHigh
            NSLayoutConstraint.activate([
                trailing,
                card.topAnchor.constraint(equalTo: view.topAnchor, constant: inset),
                card.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -inset),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 384 - inset * 2),
                wide,
                column.topAnchor.constraint(equalTo: card.topAnchor, constant: pad),
            ])
        } else {
            drawerPlace += [
                card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: inset),
                card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -inset),
            ]
            if let formWidth {
                let wide = card.widthAnchor.constraint(equalToConstant: formWidth)
                wide.priority = .defaultHigh
                formPlace = [
                    card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                    card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
                    card.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -Space.space2 * 2),
                    wide,
                ]
            }
            NSLayoutConstraint.activate([
                // As tall as its content, up to 85% of the screen (the box's 8 above the surface in it).
                card.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: cap ?? (style == .card ? 0.85 : 0.88),
                                             constant: style == .card ? -Space.space2 : 0),
                // The grabber's `mt-4`, under the content box's `p-4`, whose surface
                // stands 8 inside its top (`before:inset-2`); inside the edge sheet's 1pt border on it.
                handle.topAnchor.constraint(equalTo: card.topAnchor, constant: style == .card ? 16 + 16 - Space.space2 : 1 + 16),
                handle.centerXAnchor.constraint(equalTo: card.centerXAnchor),
                handle.widthAnchor.constraint(equalToConstant: 100),
                handle.heightAnchor.constraint(equalToConstant: 6),
                // The content starts at the grabber's foot (vaul's column holds no gap).
                column.topAnchor.constraint(equalTo: handle.bottomAnchor),
            ])
        }
        self.pad = pad
        self.inset = inset
        place()
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (sheet: HouseSheetController, _: UITraitCollection) in
            sheet.place()
        }
        view.keyboardLayoutGuide.followsUndockedKeyboard = true
        view.keyboardLayoutGuide.usesBottomSafeArea = false

        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        card.addGestureRecognizer(pan)
        accessibilityViewIsModal = true
    }

    /// The drawer's place, or on a regular width the centred form's; the form has no grabber.
    private func place() {
        let form = isForm
        NSLayoutConstraint.deactivate(form ? drawerPlace : formPlace)
        NSLayoutConstraint.activate(form ? formPlace : drawerPlace)
        handle.isHidden = style == .side || form
        // The drawer meets the screen's foot: rounded on top only, its hairline
        // along the top edge alone; the centred form keeps every corner and edge.
        if style == .card {
            card.layer.maskedCorners = form ? [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
                : [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        }
        paint()
    }

    /// The drawer's hairline: along its top edge and round its two top corners.
    private let topEdge = CAShapeLayer()
    /// Under the header: comes in as the content scrolls (`--sheet-scroll` over its first 11pt).
    private let seam = UIView()
    private var scrolled: NSKeyValueObservation?

    private func watchScroll() {
        scrolled = scroller?.observe(\.contentOffset, options: [.initial, .new]) { [weak self] scroll, _ in
            let by = scroll.contentOffset.y + scroll.adjustedContentInset.top
            MainActor.assumeIsolated { self?.seam.alpha = min(1, max(0, by / 11)) }
        }
    }

    private func drawEdge() {
        guard style == .card, !isForm else { return }
        let r = Radius.radiusLg
        let width = card.bounds.width
        let edge = UIBezierPath()
        edge.move(to: CGPoint(x: 0.5, y: r))
        edge.addArc(withCenter: CGPoint(x: r, y: r), radius: r - 0.5, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        edge.addLine(to: CGPoint(x: width - r, y: 0.5))
        edge.addArc(withCenter: CGPoint(x: width - r, y: r), radius: r - 0.5, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        topEdge.frame = card.bounds
        topEdge.path = edge.cgPath
        CATransaction.commit()
    }

    private var footPad: NSLayoutConstraint!
    private var pad = 0.0
    private var inset = 0.0

    /// The content's foot clears the home indicator as well as its padding
    /// (`pb-[calc(1rem+env(safe-area-inset-bottom))]` on the content box,
    /// which the card stands `inset` inside), unless the keyboard already
    /// holds the card above it. At the safe area alone, the content ends
    /// where the home indicator's band begins.
    override public func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let keyboard = view.keyboardLayoutGuide.layoutFrame.height > view.safeAreaInsets.bottom + 1
        let safe = keyboard ? 0 : view.safeAreaInsets.bottom
        let foot = -(footAtSafeArea ? max(0, safe - inset) : pad + safe)
        if footPad != nil, footPad.constant != foot {
            footPad.constant = foot
        }
        drawEdge()
    }

    private func paint() {
        let drawer = style == .card && !isForm
        card.layer.borderColor = (style == .edge ? Palette.borderControl : Palette.border).resolvedColor(with: traitCollection).cgColor
        card.layer.borderWidth = drawer ? 0 : 1
        topEdge.strokeColor = Palette.border.resolvedColor(with: traitCollection).cgColor
        topEdge.isHidden = !drawer
    }

    override public func accessibilityPerformEscape() -> Bool {
        dismiss(animated: true)
        return true
    }

    // MARK: Drag to dismiss

    private static let resist = 0.35
    private static let resistMax = 0.25
    private static let commit = 0.3
    private static let flick = 0.3

    /// The way the card leaves: down, or to the right for the side drawer.
    var away: CGAffineTransform { offset(travel + Space.space2) }
    /// How far the card goes to leave the screen: its own size, or for a
    /// centred form the distance from its top to the screen's foot.
    private var travel: Double {
        if style == .side { return max(1, card.bounds.width) }
        return max(1, isForm ? view.bounds.maxY - card.frame.minY : card.bounds.height)
    }

    private func offset(_ by: Double) -> CGAffineTransform {
        style == .side ? CGAffineTransform(translationX: by, y: 0) : CGAffineTransform(translationX: 0, y: by)
    }

    private func along(_ point: CGPoint) -> Double { style == .side ? point.x : point.y }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        let height = travel
        let dy = along(pan.translation(in: view))
        switch pan.state {
        case .began:
            dragging = scroller.map { $0.contentOffset.y <= -$0.adjustedContentInset.top + 0.5 } ?? true
        case .changed:
            guard dragging else { return }
            if let scroller {
                scroller.contentOffset.y = -scroller.adjustedContentInset.top
            }
            let y = dy >= 0 ? dy : -min(-dy * Self.resist, height * Self.resistMax)
            card.transform = offset(y)
            (presentationController as? HouseSheetPresentation)?.scrim.alpha = 1 - max(0, y) / height
        case .ended, .cancelled, .failed:
            guard dragging else { return }
            dragging = false
            let velocity = along(pan.velocity(in: view)) / 1000
            let y = style == .side ? card.transform.tx : card.transform.ty
            let leaves = pan.state == .ended && (y > height * Self.commit || velocity > Self.flick)
            settle(leaving: leaves, from: y, height: height, velocity: velocity * 1000)
        default:
            break
        }
    }

    private func settle(leaving: Bool, from y: Double, height: Double, velocity: Double) {
        let target = leaving ? height + Space.space2 : 0
        let distance = target - y
        let spring = UISpringTimingParameters(duration: Motion.durSettle, bounce: 0,
            initialVelocity: CGVector(dx: 0, dy: abs(distance) > 0.5 ? velocity / distance : 0))
        let scrim = (presentationController as? HouseSheetPresentation)?.scrim
        let animator = UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: spring)
        animator.addAnimations {
            self.card.transform = self.offset(target)
            scrim?.alpha = leaving ? 0 : 1
        }
        if leaving {
            animator.addCompletion { _ in self.dismiss(animated: false) }
        }
        animator.startAnimation()
    }

    public func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        other === scroller?.panGestureRecognizer
    }

    // MARK: Presentation

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        HouseSheetPresentation(presentedViewController: presented, presenting: presenting)
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        HouseSheetMotion(presenting: true)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        HouseSheetMotion(presenting: false)
    }
}

/// Close in a sheet's head (app.css `.kit-sheet-close`): a 28pt ghost, its
/// 16pt glyph in the muted ink, `--radius-sm`; under a finger it takes 44pt
/// (`.touch-hit`), and a press tints it as the hover does, in the strong ink.
final class SheetCloseButton: UIButton {
    private let glyph = GlyphView(.close, size: Size.iconMd, tint: Palette.inkMuted)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        glyph.isUserInteractionEnabled = false
        glyph.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glyph)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 28),
            heightAnchor.constraint(equalToConstant: 28),
            glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        accessibilityLabel = "Close"
        toolTip = "Close"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SheetCloseButton is built in code") }

    override var isHighlighted: Bool {
        didSet {
            backgroundColor = isHighlighted ? Palette.surfaceHover : .clear
            glyph.tintColor = isHighlighted ? Palette.inkStrong : Palette.inkMuted
        }
    }

    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        bounds.insetBy(dx: -8, dy: -8).contains(point)
    }
}

/// The sheet's full-screen ground: a touch outside the card falls through
/// to the scrim under it, which closes the sheet.
final class SheetGround: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

/// The scrim under the sheet (app.css `.kit-scrim`): it fades in with the
/// sheet over `durPanel` and out over `durExit`; a tap on it closes the sheet.
final class HouseSheetPresentation: UIPresentationController {
    let scrim = UIView()

    override func presentationTransitionWillBegin() {
        guard let container = containerView else { return }
        scrim.backgroundColor = Palette.scrim
        scrim.frame = container.bounds
        scrim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrim.alpha = 0
        scrim.isAccessibilityElement = false
        scrim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        container.insertSubview(scrim, at: 0)
        presentedViewController.transitionCoordinator?.animate { _ in self.scrim.alpha = 1 }
    }

    override func dismissalTransitionWillBegin() {
        presentedViewController.transitionCoordinator?.animate { _ in self.scrim.alpha = 0 }
    }

    override var frameOfPresentedViewInContainerView: CGRect {
        containerView?.bounds ?? .zero
    }

    @objc private func tapped() {
        presentedViewController.dismiss(animated: true)
    }
}

/// The sheet's slide: its whole height in over `durPanel` on the drawer
/// curve, out over `durExit` on the out curve; a fade over `durControl`
/// with Reduce Motion.
final class HouseSheetMotion: NSObject, UIViewControllerAnimatedTransitioning {
    let presenting: Bool

    init(presenting: Bool) {
        self.presenting = presenting
    }

    private var still: Bool { UIAccessibility.isReduceMotionEnabled }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        still ? Motion.durControl : presenting ? Motion.durPanel : Motion.durExit
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        let key: UITransitionContextViewControllerKey = presenting ? .to : .from
        guard let sheet = context.viewController(forKey: key) as? HouseSheetController else {
            context.completeTransition(false)
            return
        }
        if presenting {
            sheet.view.frame = context.finalFrame(for: sheet)
            context.containerView.addSubview(sheet.view)
            sheet.view.layoutIfNeeded()
        }
        let away = sheet.away
        if presenting {
            if still { sheet.card.alpha = 0 } else { sheet.card.transform = away }
        }
        let curve = presenting && !still ? Motion.easeDrawer : Motion.easeOut
        let animator = curve.animator(transitionDuration(using: context)) {
            if self.still {
                sheet.card.alpha = self.presenting ? 1 : 0
            } else {
                sheet.card.transform = self.presenting ? .identity : away
            }
        }
        animator.addCompletion { _ in
            context.completeTransition(!context.transitionWasCancelled)
        }
        animator.startAnimation()
    }
}
