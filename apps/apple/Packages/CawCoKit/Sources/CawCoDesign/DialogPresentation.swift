import UIKit

/// The scrim (`kit-scrim`: `--scrim` with its blur), fading in over
/// `durPanel` and out over `durExit`; a tap on it closes what it holds.
///
/// The blur is the token's `scrimBlur` (2pt), which no system material is:
/// those blur by tens of points and bring a tint of their own, and at night
/// that tint over `--scrim` hid the page altogether. So the effect view's
/// blur is held at the fraction of the way in that gives 2pt, taking the
/// full effect's radius as 30pt.
public final class ScrimPresentation: UIPresentationController, UIGestureRecognizerDelegate {
    private let scrim = UIVisualEffectView(effect: nil)
    private let onTap: () -> Void
    private var blur: UIViewPropertyAnimator?
    private var tap: UITapGestureRecognizer?
    private static let fullBlur = 30.0

    public init(presentedViewController: UIViewController, presenting: UIViewController?, onTap: @escaping () -> Void) {
        self.onTap = onTap
        super.init(presentedViewController: presentedViewController, presenting: presenting)
    }

    override public func presentationTransitionWillBegin() {
        guard let container = containerView else { return }
        scrim.frame = container.bounds
        scrim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let tint = UIView(frame: scrim.bounds)
        tint.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        tint.backgroundColor = Palette.scrim
        scrim.contentView.addSubview(tint)
        let blur = UIViewPropertyAnimator(duration: 1, curve: .linear) { [scrim] in scrim.effect = UIBlurEffect(style: .regular) }
        blur.pausesOnCompletion = true
        blur.fractionComplete = Size.scrimBlur / Self.fullBlur
        self.blur = blur
        scrim.alpha = 0
        container.insertSubview(scrim, at: 0)
        // On the container, since what is presented fills it with a clear
        // root that stands over the scrim: a tap that lands on that root, or
        // on the scrim, is a tap outside the panel.
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.delegate = self
        container.addGestureRecognizer(tap)
        self.tap = tap
        Motion.easeOut.animator(Motion.durPanel) { self.scrim.alpha = 1 }.startAnimation()
    }

    override public func presentationTransitionDidEnd(_ completed: Bool) {
        if !completed { release() }
    }

    override public func dismissalTransitionWillBegin() {
        // The scrim goes in step with what is presented: over that transition's own duration.
        Motion.easeOut.animator(presentedViewController.transitionCoordinator?.transitionDuration ?? Motion.durExit) { self.scrim.alpha = 0 }.startAnimation()
    }

    override public func dismissalTransitionDidEnd(_ completed: Bool) {
        if completed { release() }
    }

    /// A held animator has to be stopped before it is let go.
    private func release() {
        blur?.stopAnimation(true)
        blur = nil
        if let tap { tap.view?.removeGestureRecognizer(tap) }
        tap = nil
        scrim.removeFromSuperview()
    }

    @objc private func tapped() { onTap() }

    public func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let hit = touch.view else { return false }
        return hit === presentedViewController.view || hit.isDescendant(of: scrim)
    }
}

/// `kit-dialog-in` / `-out`: 6pt of rise and a fade.
final class DialogAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool
    /// The control the dialog grows from and goes back into (WorkflowLaunch.svelte `fromButton`).
    private weak var origin: UIView?

    init(presenting: Bool, origin: UIView? = nil) {
        self.presenting = presenting
        self.origin = origin
    }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        presenting ? Motion.durPanel : Motion.durExit
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        let key: UITransitionContextViewKey = presenting ? .to : .from
        guard let view = context.view(forKey: key) else {
            context.completeTransition(true)
            return
        }
        let still = UIAccessibility.isReduceMotionEnabled
        if presenting {
            view.frame = context.containerView.bounds
            context.containerView.addSubview(view)
            view.layoutIfNeeded()
        }
        var away = still ? CGAffineTransform.identity : CGAffineTransform(translationX: 0, y: 6)
        var curve = Motion.easeOut
        let dialog = context.viewController(forKey: presenting ? .to : .from) as? KitDialogController
        if !still, let origin, origin.window != nil, let box = dialog?.cardFrame, box.width > 0 {
            // The card's centre on the button's, scaled toward the button's
            // width and no smaller than half, about the card's own centre.
            let at = origin.convert(origin.bounds, to: context.containerView)
            let scale = max(0.5, at.width / box.width)
            let offset = CGPoint(x: box.midX - view.bounds.midX, y: box.midY - view.bounds.midY)
            away = CGAffineTransform(translationX: at.midX - view.bounds.midX, y: at.midY - view.bounds.midY)
                .scaledBy(x: scale, y: scale)
                .translatedBy(x: -offset.x, y: -offset.y)
            curve = presenting ? Motion.easeDrawer : Motion.easeOut
        }
        if presenting {
            view.alpha = 0
            view.transform = away
        }
        let animator = curve.animator(transitionDuration(using: context)) { [presenting] in
            view.alpha = presenting ? 1 : 0
            view.transform = presenting ? .identity : away
        }
        animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
        animator.startAnimation()
    }
}
