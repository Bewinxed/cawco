import CawCoDesign
import UIKit

/// The web's list motion (motion/rows.svelte `reflow`, motion/list-swap,
/// motion/branch), on UIKit's own machinery: the diffable data source's
/// batch updates run inside an animation on the tokens' curve, and the
/// layout's appearing and disappearing attributes carry the arrivals and
/// departures. With Reduce Motion only the fades run.
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

    // MARK: The tab relay (motion/list-swap.svelte)

    /// The relay's timings: the web keeps them in list-swap.svelte rather than the token file.
    enum Relay {
        static let outMs = 0.2
        static let outStagger = 0.018
        static let inMs = 0.3
        static let inStagger = 0.04
        static let staggerCap = 9
        static let leaving = 8
        static let travel = 18.0

        static func enterAt(_ i: Int) -> Double { outMs + Double(min(i, staggerCap)) * inStagger }
        static func leaveAt(_ i: Int) -> Double { Double(min(i, staggerCap)) * outStagger }
    }

    /// The old lines leave toward the side the choice moved away from, 18pt
    /// and a fade over `outMs`, `outStagger` apart, top down: drawn as
    /// copies over the list, so the list itself is free to change under them.
    static func leave(_ views: [UIView], in host: UIView, direction: Double) {
        for (index, view) in views.prefix(Relay.leaving).enumerated() {
            guard let copy = view.snapshotView(afterScreenUpdates: false) else {
                continue
            }
            copy.frame = view.convert(view.bounds, to: host)
            copy.isUserInteractionEnabled = false
            host.addSubview(copy)
            let animator = Motion.easeOut.animator(Relay.outMs) {
                copy.alpha = 0
                copy.transform = CGAffineTransform(translationX: -direction * Relay.travel, y: 0)
            }
            animator.addCompletion { _ in copy.removeFromSuperview() }
            animator.startAnimation(afterDelay: Relay.leaveAt(index))
        }
    }

    /// The new lines arrive from the side the choice moved toward over
    /// `inMs`: the first once the first old line has gone, each next
    /// `inStagger` later, capped at `staggerCap`.
    static func enter(_ views: [UIView], direction: Double) {
        for (index, view) in views.enumerated() {
            view.alpha = 0
            view.transform = CGAffineTransform(translationX: direction * Relay.travel, y: 0)
            Motion.easeOut.animator(Relay.inMs) {
                view.alpha = 1
                view.transform = .identity
            }.startAnimation(afterDelay: Relay.enterAt(index))
        }
    }

    // MARK: A tree's fold (motion/branch.svelte)

    /// The room under a parent opens at the pace its line reaches the rows:
    /// one row per `durStagger`, the whole never longer than `durCascade`, at
    /// one steady speed. It folds quicker: over `durExit` on the in-out curve.
    static func branch(opening rows: Int, in view: UIView, _ changes: @escaping @MainActor () -> Void) {
        guard !UIAccessibility.isReduceMotionEnabled else {
            travel(in: view, changes)
            return
        }
        if rows > 0 {
            let duration = min(Motion.durCascade, Double(rows) * Motion.durStagger + Motion.durStagger)
            let animator = UIViewPropertyAnimator(duration: duration, curve: .linear)
            animator.addAnimations(changes)
            animator.startAnimation()
        } else {
            Motion.easeInOut.animator(Motion.durExit, animations: changes).startAnimation()
        }
    }

    /// A tree opening: each row under the parent is reached `durStagger`
    /// after the one above it (closer in a tree too tall to open within
    /// `durCascade`), its title wiping in left to right over `durRail`.
    static func branchOpen(_ views: [UIView]) {
        guard !views.isEmpty else {
            return
        }
        let step = min(Motion.durStagger, Motion.durCascade / Double(views.count))
        for (index, view) in views.enumerated() {
            let mask = CALayer()
            mask.backgroundColor = UIColor.black.cgColor
            mask.anchorPoint = CGPoint(x: 0, y: 0.5)
            mask.bounds = view.bounds
            mask.position = CGPoint(x: 0, y: view.bounds.midY)
            mask.transform = CATransform3DMakeScale(0.0001, 1, 1)
            view.layer.mask = mask
            let wipe = CABasicAnimation(keyPath: "transform.scale.x")
            wipe.fromValue = 0.0001
            wipe.toValue = 1
            wipe.duration = Motion.durRail
            wipe.beginTime = CACurrentMediaTime() + Double(index) * step
            wipe.timingFunction = Motion.easeOut.function
            wipe.fillMode = .both
            CATransaction.begin()
            CATransaction.setCompletionBlock { [weak view] in
                view?.layer.mask = nil
            }
            mask.transform = CATransform3DIdentity
            mask.add(wipe, forKey: "wipe")
            CATransaction.commit()
        }
    }
}

/// The home's list layout: a vertical list per section, every item its own
/// self-sized height. Arrivals fade in while the rows after them make room;
/// departures fade where they stood while the rows after them close over.
final class HomeLayout: UICollectionViewCompositionalLayout {
    /// An arriving row sits beneath the rows that stay: they are drawn on the
    /// page's own ground, so as they slide down they uncover it, the way the
    /// web's growing box uncovers a row (no row is ever drawn over another).
    override func initialLayoutAttributesForAppearingItem(at itemIndexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        let attributes = super.initialLayoutAttributesForAppearingItem(at: itemIndexPath)?.copy() as? UICollectionViewLayoutAttributes
        attributes?.alpha = 0
        attributes?.zIndex = -1
        return attributes
    }

    /// A row that leaves closes to nothing while it fades, as the web's does,
    /// so the rows sliding up over its place never show through it.
    override func finalLayoutAttributesForDisappearingItem(at itemIndexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        let attributes = super.finalLayoutAttributesForDisappearingItem(at: itemIndexPath)?.copy() as? UICollectionViewLayoutAttributes
        attributes?.alpha = 0
        attributes?.zIndex = -1
        return attributes
    }
}
