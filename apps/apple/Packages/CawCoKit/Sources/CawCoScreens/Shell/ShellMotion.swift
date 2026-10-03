import CawCoDesign
import UIKit

// MARK: Travel

/// How a page swap moves (route.svelte.ts `Travel`, SessionSurface.svelte
/// `push`): where the incoming page starts and the outgoing one ends, as a
/// share of the page's own size, with their opacities, and how long.
struct Travel {
    var enter: (x: Double, y: Double, alpha: Double)
    var leave: (x: Double, y: Double, alpha: Double)
    var duration: TimeInterval
    /// A pop keeps the page being taken off on top of the one it uncovers.
    var leavingOnTop = false

    /// The board pushing a conversation in (SessionSurface.svelte `push`):
    /// the groups in from +8% at 0, the board to −8% dimmed to 0.6, over
    /// `durPop` on the drawer curve.
    static let push = Travel(enter: (0.08, 0, 0), leave: (-0.08, 0, 0.6), duration: Motion.durPop)
    /// Back to the board: the groups off the way they came, the board back.
    static let pop = Travel(enter: (-0.08, 0, 0.6), leave: (0.08, 0, 0), duration: Motion.durPop, leavingOnTop: true)

    /// route.svelte.ts `plan`: between two spokes ±8% vertically, the way
    /// the sidebar runs; anything else a horizontal ±8% nudge, both over
    /// `durControl`.
    static func route(from: ShellDestination, to: ShellDestination) -> Travel {
        if let a = from.spoke, let b = to.spoke, a != b {
            let y = b > a ? 0.08 : -0.08
            return Travel(enter: (0, y, 0), leave: (0, -y, 0), duration: Motion.durControl)
        }
        // A project home is a step deeper than the spoke it was opened from.
        let deeper: Bool = if case .project = to { true } else { false }
        let x = deeper ? 0.08 : -0.08
        return Travel(enter: (x, 0, 0), leave: (-x, 0, 0), duration: Motion.durControl)
    }

    /// Reduced motion: a `durControl` cross-fade in place, nothing travels.
    static let still = Travel(enter: (0, 0, 0), leave: (0, 0, 0), duration: Motion.durControl)

    var reduced: Travel { UIAccessibility.isReduceMotionEnabled ? .still : self }

    func transform(_ end: (x: Double, y: Double, alpha: Double), in size: CGSize) -> CGAffineTransform {
        let rtl = UIView.userInterfaceLayoutDirection(for: .unspecified) == .rightToLeft ? -1.0 : 1
        return CGAffineTransform(translationX: end.x * size.width * rtl, y: end.y * size.height)
    }
}

/// Plays one `Travel` between two controllers' views, on the drawer curve.
final class TravelAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    let travel: Travel
    private var running: UIViewPropertyAnimator?

    init(_ travel: Travel) {
        self.travel = travel.reduced
    }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        travel.duration
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        interruptibleAnimator(using: context).startAnimation()
    }

    func interruptibleAnimator(using context: any UIViewControllerContextTransitioning) -> any UIViewImplicitlyAnimating {
        if let running { return running }
        let container = context.containerView
        guard let from = context.view(forKey: .from), let to = context.view(forKey: .to) else {
            let empty = UIViewPropertyAnimator(duration: 0, curve: .linear)
            empty.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
            running = empty
            return empty
        }
        let size = container.bounds.size
        to.frame = context.finalFrame(for: context.viewController(forKey: .to)!)
        if travel.leavingOnTop { container.insertSubview(to, belowSubview: from) } else { container.addSubview(to) }
        to.transform = travel.transform(travel.enter, in: size)
        to.alpha = travel.enter.alpha
        let animator = Motion.easeDrawer.animator(travel.duration) { [travel] in
            to.transform = .identity
            to.alpha = 1
            from.transform = travel.transform(travel.leave, in: size)
            from.alpha = travel.leave.alpha
        }
        animator.addCompletion { _ in
            from.transform = .identity
            from.alpha = 1
            to.transform = .identity
            to.alpha = 1
            context.completeTransition(!context.transitionWasCancelled)
        }
        running = animator
        return animator
    }

    func animationEnded(_: Bool) {
        running = nil
    }
}

/// The navigation stacks' motion: a conversation pushed from the board and
/// popped back to it travels as SessionSurface.svelte's `push`, a place
/// swapped in at the root as route.svelte.ts says. The back swipe works as
/// the system's does (from anywhere on the page, a mostly sideways drag to
/// the trailing side) but drives this pop by hand: the finger moves it 1:1,
/// and a release past half the way, or a flick, finishes it. The system's
/// own pop recognizers are off for these stacks; they cannot drive a custom
/// pop interactively.
@MainActor
final class ShellNavigationMotion: NSObject, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
    /// Set just before a root swap, read by the next transition.
    var route: Travel?
    private var interaction: UIPercentDrivenInteractiveTransition?
    private weak var navigation: UINavigationController?
    private var transitioning = false

    func attach(to navigation: UINavigationController) {
        self.navigation = navigation
        navigation.delegate = self
        navigation.interactivePopGestureRecognizer?.isEnabled = false
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            navigation.interactiveContentPopGestureRecognizer?.isEnabled = false
        }
        let back = UIPanGestureRecognizer(target: self, action: #selector(backSwipe(_:)))
        back.delegate = self
        back.maximumNumberOfTouches = 1
        navigation.view.addGestureRecognizer(back)
    }

    func gestureRecognizerShouldBegin(_ pan: UIGestureRecognizer) -> Bool {
        guard let pan = pan as? UIPanGestureRecognizer, let navigation, !transitioning,
              navigation.viewControllers.count > 1, let view = pan.view else { return false }
        let v = pan.velocity(in: view)
        let rtl = view.effectiveUserInterfaceLayoutDirection == .rightToLeft ? -1.0 : 1
        // Mostly sideways, toward the trailing side: anything else is the page's own.
        return v.x * rtl > 0 && abs(v.x) > abs(v.y) * 1.2
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        false
    }

    func navigationController(_: UINavigationController, willShow _: UIViewController, animated _: Bool) {
        transitioning = true
    }

    func navigationController(_: UINavigationController, didShow _: UIViewController, animated _: Bool) {
        transitioning = false
    }

    func navigationController(_: UINavigationController, animationControllerFor operation: UINavigationController.Operation, from _: UIViewController, to _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        if let route {
            self.route = nil
            return TravelAnimator(route)
        }
        switch operation {
        case .push: return TravelAnimator(.push)
        case .pop: return TravelAnimator(.pop)
        default: return nil
        }
    }

    func navigationController(_: UINavigationController, interactionControllerFor _: any UIViewControllerAnimatedTransitioning) -> (any UIViewControllerInteractiveTransitioning)? {
        interaction
    }

    @objc private func backSwipe(_ pan: UIPanGestureRecognizer) {
        guard let view = pan.view else { return }
        let width = max(1, view.bounds.width)
        let dx = pan.translation(in: view).x
        let progress = min(1, max(0, dx / width))
        switch pan.state {
        case .began:
            // The driver first, so the pop it starts is driven by the finger.
            let driver = UIPercentDrivenInteractiveTransition()
            driver.completionCurve = .easeOut
            interaction = driver
            navigation?.popViewController(animated: true)
        case .changed:
            interaction?.update(progress)
        case .ended, .cancelled, .failed:
            let speed = pan.velocity(in: view).x
            // The release velocity projected like a scroll view's deceleration.
            let projected = dx + speed * 0.998 / (1 - 0.998) / 1000
            if pan.state == .ended, projected > width / 2 || speed > 300 {
                interaction?.completionSpeed = max(1, abs(speed) / width)
                interaction?.finish()
            } else {
                interaction?.cancel()
            }
            interaction = nil
        default:
            break
        }
    }
}

// MARK: Rail sheet

/// The phone's rail (Shell.svelte `Sheet.Content side="left"`): three
/// quarters of the screen (the sheet's `data-[side=left]:w-3/4` outranks the
/// shell's `w-[284px]`), no wider than 384pt from 640pt up (`sm:max-w-sm`); in
/// from the left edge over `durPanel` on the drawer curve, out over
/// `durExit`, over the scrim (`--scrim` with its blur) that fades in over
/// `durPanel` and out over `durExit`. A finger drags it back out the edge it
/// came from (motion/drag.svelte.ts): past 30% or a flick past 0.3pt/ms it
/// goes, else it springs back; dragged the other way it gives a little.
/// Reduce Motion fades it in place over `durControl`.
final class RailSheetTransition: NSObject, UIViewControllerTransitioningDelegate {
    static func width(in container: Double) -> Double {
        container >= 640 ? min(384, container * 0.75) : container * 0.75
    }

    func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        RailSheetPresentation(presentedViewController: presented, presenting: presenting)
    }

    func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        RailSheetAnimator(presenting: true)
    }

    func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        RailSheetAnimator(presenting: false)
    }
}

final class RailSheetPresentation: UIPresentationController {
    private let scrim = UIVisualEffectView(effect: nil)
    private let tint = UIView()
    private var startX = 0.0
    private var dragging = false

    override var frameOfPresentedViewInContainerView: CGRect {
        guard let container = containerView else { return .zero }
        return CGRect(x: 0, y: 0, width: RailSheetTransition.width(in: container.bounds.width), height: container.bounds.height)
    }

    override func presentationTransitionWillBegin() {
        guard let container = containerView else { return }
        scrim.frame = container.bounds
        scrim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        tint.frame = scrim.bounds
        tint.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        tint.backgroundColor = Palette.scrim
        scrim.contentView.addSubview(tint)
        scrim.alpha = 0
        scrim.effect = UIBlurEffect(style: .systemUltraThinMaterial)
        container.insertSubview(scrim, at: 0)
        scrim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        if let view = presentedView {
            view.layer.shadowColor = UIColor.black.cgColor
            view.layer.draw(Shadow.shadowDrawer, in: view.traitCollection)
            view.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
        }
        Motion.easeOut.animator(Motion.durPanel) { self.scrim.alpha = 1 }.startAnimation()
    }

    override func dismissalTransitionWillBegin() {
        Motion.easeOut.animator(Motion.durExit) { self.scrim.alpha = 0 }.startAnimation()
    }

    override func containerViewWillLayoutSubviews() {
        presentedView?.frame = frameOfPresentedViewInContainerView
    }

    @objc private func tapped() {
        presentedViewController.dismiss(animated: true)
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        guard let view = presentedView else { return }
        let width = view.bounds.width
        let dx = pan.translation(in: view.superview).x
        switch pan.state {
        case .began:
            dragging = true
        case .changed:
            // Toward the edge 1:1; the other way a third shows, never more than a quarter.
            let at = dx < 0 ? dx : min(width * 0.25, dx * 0.35)
            view.transform = CGAffineTransform(translationX: at, y: 0)
            scrim.alpha = 1 - max(0, -at) / width
        case .ended, .cancelled:
            dragging = false
            let speed = pan.velocity(in: view.superview).x
            let gone = -dx > width * 0.3 || speed < -300
            let travel = gone ? -width - view.transform.tx : -view.transform.tx
            let spring = UISpringTimingParameters(dampingRatio: 1, initialVelocity: CGVector(dx: travel == 0 ? 0 : speed / travel, dy: 0))
            let settle = UIViewPropertyAnimator(duration: 0.4, timingParameters: spring)
            settle.addAnimations {
                view.transform = gone ? CGAffineTransform(translationX: -width, y: 0) : .identity
                self.scrim.alpha = gone ? 0 : 1
            }
            if gone {
                // Closed at once, while it travels.
                settle.addCompletion { _ in self.presentedViewController.dismiss(animated: false) }
            }
            settle.startAnimation()
        default:
            break
        }
    }
}

final class RailSheetAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool

    init(presenting: Bool) {
        self.presenting = presenting
    }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        UIAccessibility.isReduceMotionEnabled ? Motion.durControl : (presenting ? Motion.durPanel : Motion.durExit)
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        let key: UITransitionContextViewKey = presenting ? .to : .from
        guard let sheet = context.view(forKey: key) else {
            context.completeTransition(true)
            return
        }
        let still = UIAccessibility.isReduceMotionEnabled
        let away = CGAffineTransform(translationX: -sheet.bounds.width - 1, y: 0)
        if presenting {
            context.containerView.addSubview(sheet)
            sheet.frame = context.finalFrame(for: context.viewController(forKey: .to)!)
            if still { sheet.alpha = 0 } else { sheet.transform = away }
        }
        let curve = still ? Motion.easeOut : Motion.easeDrawer
        let animator = curve.animator(transitionDuration(using: context)) { [presenting] in
            if still { sheet.alpha = presenting ? 1 : 0 } else { sheet.transform = presenting ? .identity : away }
        }
        animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
        animator.startAnimation()
    }
}
