import CawCoDesign
import UIKit

/// The web's live list motion (motion/rows.svelte `reflow`): a row arriving,
/// leaving or re-sorting on its own, on UIKit's own machinery. The diffable
/// data source's batch updates run inside an animation on the tokens' curve,
/// and HomeLayout's appearing and disappearing attributes carry the arrivals
/// and departures. The relay (Relay.swift) and a tree's fold (Branch.swift)
/// are driven motions of their own. With Reduce Motion only the fades run.
enum Reflow {
    /// Rows that stay slide to their new places over `durPanel` on the in-out
    /// curve; a row that arrives fades in as the rows after it make room; a
    /// row that leaves fades as the rows after it close over it.
    static func travel(in view: UIView? = nil, _ changes: @escaping () -> Void) {
        guard !UIAccessibility.isReduceMotionEnabled else {
            // Less motion is not no motion: nothing travels, the change fades.
            if let view {
                UIView.transition(with: view, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction], animations: {
                    UIView.performWithoutAnimation(changes)
                })
            } else {
                UIView.performWithoutAnimation(changes)
            }
            return
        }
        CATransaction.begin()
        CATransaction.setAnimationTimingFunction(Motion.easeInOut.function)
        UIView.animate(withDuration: Motion.durPanel, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: changes)
        CATransaction.commit()
    }

    /// A count's figure popping as it changes (`data-flip="pop"`): from the
    /// pop scale as it fades in, over `durPop`.
    static func pop(_ view: UIView) {
        view.alpha = 0
        view.transform = CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale)
        Motion.easeOut.animator(Motion.durPop) {
            view.alpha = 1
            view.transform = .identity
        }.startAnimation()
    }
}
