import UIKit

/// The house bottom sheet (vaul, components/ui/drawer; DESIGN.md "Dialog,
/// sheet and drawer"), presented over the scrim:
///
/// - `.card`: the drawer. A raised card inset 8pt from the screen's edges
///   (radius 12, 1pt border), its 100×6 grabber, a leading title in the label
///   role, its content 8pt inside the card, at most 80% of the screen tall.
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

    private let content: UIViewController
    private let style: Style
    private let titleText: String?
    let card = UIView()
    private let handle = UIView()
    private weak var scroller: UIScrollView?
    private var dragging = false

    /// The most of the screen it stands tall, where a sheet sets its own
    /// (the assistant's `max-height: 85dvh`); nil, the style's (80%, 88%).
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
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            title.text = titleText
            title.accessibilityTraits = .header
            column.addArrangedSubview(title)
            column.setCustomSpacing(Space.space1, after: title)
        }
        addChild(content)
        column.addArrangedSubview(content.view)
        content.didMove(toParent: self)
        card.addSubview(column)

        // vaul's content box: the card is inset 8 inside it (`before:inset-2`)
        // and the content padded 16 (`p-4`), so 8 inside the card.
        // DESIGN.md: "a raised inner card (12px radius, inset 8px)".
        let inset = style == .edge ? 0 : 8.0
        let pad = style == .edge ? 0 : 16 - inset
        footPad = column.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -pad)
        // The edge sheet's 1pt border is part of its box on the web: its
        // content stands inside it at the sides (the foot's is open).
        let side = style == .edge ? 1 : pad
        NSLayoutConstraint.activate([
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -inset),
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
                card.topAnchor.constraint(equalTo: view.topAnchor, constant: inset),
                card.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -inset),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 384 - inset * 2),
                wide,
                column.topAnchor.constraint(equalTo: card.topAnchor, constant: pad),
            ])
        } else {
            NSLayoutConstraint.activate([
                card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: inset),
                card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -inset),
                card.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: cap ?? (style == .card ? 0.8 : 0.88), constant: -inset * 2),
                // The grabber's `mt-4`, under the content box's `p-4` on the
                // drawer, and inside the edge sheet's 1pt border on it.
                handle.topAnchor.constraint(equalTo: card.topAnchor, constant: style == .card ? 16 + 16 - inset : 1 + 16),
                handle.centerXAnchor.constraint(equalTo: card.centerXAnchor),
                handle.widthAnchor.constraint(equalToConstant: 100),
                handle.heightAnchor.constraint(equalToConstant: 6),
                // The content starts at the grabber's foot (vaul's column holds no gap).
                column.topAnchor.constraint(equalTo: handle.bottomAnchor),
            ])
        }
        self.pad = pad
        self.inset = inset
        view.keyboardLayoutGuide.followsUndockedKeyboard = true
        view.keyboardLayoutGuide.usesBottomSafeArea = false

        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        card.addGestureRecognizer(pan)
        accessibilityViewIsModal = true
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
    }

    private func paint() {
        card.layer.borderColor = (style == .edge ? Palette.borderControl : Palette.border).resolvedColor(with: traitCollection).cgColor
        card.layer.borderWidth = 1
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
    private var travel: Double { max(1, style == .side ? card.bounds.width : card.bounds.height) }

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
