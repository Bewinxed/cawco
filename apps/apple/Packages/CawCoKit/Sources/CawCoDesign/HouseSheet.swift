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
    }

    private let content: UIViewController
    private let style: Style
    private let titleText: String?
    let card = UIView()
    private let handle = UIView()
    private weak var scroller: UIScrollView?
    private var dragging = false

    /// `scroller`: the content's own scroll view, which hands a downward pull
    /// to the sheet once it is at its top (vaul's `lockAtTop`).
    public init(_ content: UIViewController, title: String? = nil, style: Style = .card, scroller: UIScrollView? = nil) {
        self.content = content
        self.style = style
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
        let inset = style == .card ? 8.0 : 0
        let pad = style == .card ? 16 - inset : 0
        footPad = column.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -pad)
        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: inset),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -inset),
            card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -inset),
            card.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: style == .card ? 0.8 : 0.88),
            // The grabber's `mt-4`, under the content box's `p-4` on the drawer.
            handle.topAnchor.constraint(equalTo: card.topAnchor, constant: style == .card ? 16 + 16 - inset : 16),
            handle.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            handle.widthAnchor.constraint(equalToConstant: 100),
            handle.heightAnchor.constraint(equalToConstant: 6),
            column.topAnchor.constraint(equalTo: handle.bottomAnchor, constant: style == .card ? 0 : Space.space2),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: pad),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -pad),
            footPad,
        ])
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
    /// (`pb-[calc(1rem+env(safe-area-inset-bottom))]`), unless the keyboard
    /// already holds the card above it.
    override public func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let keyboard = view.keyboardLayoutGuide.layoutFrame.height > view.safeAreaInsets.bottom + 1
        let foot = -(pad + (keyboard ? 0 : max(0, view.safeAreaInsets.bottom - inset)))
        if footPad != nil, footPad.constant != foot {
            footPad.constant = foot
        }
    }

    private func paint() {
        card.layer.borderColor = (style == .card ? Palette.border : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
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

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        let height = max(1, card.bounds.height)
        let dy = pan.translation(in: view).y
        switch pan.state {
        case .began:
            dragging = scroller.map { $0.contentOffset.y <= -$0.adjustedContentInset.top + 0.5 } ?? true
        case .changed:
            guard dragging else { return }
            if let scroller {
                scroller.contentOffset.y = -scroller.adjustedContentInset.top
            }
            let y = dy >= 0 ? dy : -min(-dy * Self.resist, height * Self.resistMax)
            card.transform = CGAffineTransform(translationX: 0, y: y)
            (presentationController as? HouseSheetPresentation)?.scrim.alpha = 1 - max(0, y) / height
        case .ended, .cancelled, .failed:
            guard dragging else { return }
            dragging = false
            let velocity = pan.velocity(in: view).y / 1000
            let y = card.transform.ty
            let leaves = pan.state == .ended && (y > height * Self.commit || velocity > Self.flick)
            settle(leaving: leaves, from: y, height: height, velocity: velocity * 1000)
        default:
            break
        }
    }

    private func settle(leaving: Bool, from y: Double, height: Double, velocity: Double) {
        let target = leaving ? height + Space.space2 : 0
        let distance = target - y
        let spring = UISpringTimingParameters(duration: TabSwipe.settle, bounce: 0,
            initialVelocity: CGVector(dx: 0, dy: abs(distance) > 0.5 ? velocity / distance : 0))
        let scrim = (presentationController as? HouseSheetPresentation)?.scrim
        let animator = UIViewPropertyAnimator(duration: TabSwipe.settle, timingParameters: spring)
        animator.addAnimations {
            self.card.transform = CGAffineTransform(translationX: 0, y: target)
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
        let away = CGAffineTransform(translationX: 0, y: sheet.card.frame.height + Space.space2)
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
