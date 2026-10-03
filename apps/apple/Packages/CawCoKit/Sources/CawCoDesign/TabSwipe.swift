import UIKit

/// What a tab swipe moves: the host owns its panes and its tabs, the swipe
/// owns the finger and the settle.
@MainActor
public protocol TabSwipeHost: AnyObject {
    /// Whether there is a tab on that side: 1 the next one (the finger
    /// moving left), -1 the previous.
    func swipeHasTab(_ side: Int) -> Bool
    /// Whether a finger landing at `point` (in the swipe's view) may swipe:
    /// the region under the tab row, never the chrome, and nothing there that
    /// keeps a sideways drag of its own.
    func swipeMayBegin(at point: CGPoint, side: Int) -> Bool
    /// The neighbour on `side` is about to be uncovered: lay it beside the
    /// current pane.
    func swipeOpen(_ side: Int)
    /// Paint the panes `offset` points from rest (negative: the current pane
    /// moved left), the neighbour on `side` a width beyond it; `progress`
    /// (0–1) is how far it is uncovered, for the tab strip's sheet.
    func swipeDraw(offset: Double, side: Int, progress: Double)
    /// The settle landed on the neighbour on `side`.
    func swipeLanded(_ side: Int)
    /// The settle went back to the current pane (or never left it).
    func swipeReturned(_ side: Int)
}

/// The one-finger swipe between neighbouring tabs, as the web's session tabs
/// run it (workspace/gesture.svelte.ts `createSwipe`) and as UIKit runs an
/// interruptible transition (WWDC17 "Advanced Animations with UIKit"):
///
/// - Past the slop, the way the finger went decides: mostly vertical is a
///   scroll and never reaches here; mostly horizontal is the swipe, and the
///   panes follow the finger 1:1 from then on. Further fingers are ignored.
/// - The drag scrubs a paused `UIViewPropertyAnimator` (`fractionComplete`).
///   Past the first or last tab it rubber-bands the way `UIScrollView` does.
/// - On release the velocity is projected the way `UIScrollView` decelerates;
///   a drag past `commit` of the width, or a projection past half of it,
///   lands on the neighbour. The settle is a spring with no bounce, seeded
///   with the finger's velocity, on the web's settle (motion/spring.ts:
///   0.4 s, no bounce).
/// - A finger landing on a settle in flight picks the panes up where they
///   are; a tap retargets it (`retarget`). Neither restarts it.
/// - A selection tick plays when the tab a release would land on changes.
@MainActor
public final class TabSwipe: NSObject, UIGestureRecognizerDelegate {
    /// How far across counts as "meant it" (gesture.svelte.ts COMMIT).
    public static let commit = 0.3
    /// Beyond this share of vertical travel it is a scroll (SLOPE).
    public static let slope = 0.7
    /// The web's settle (motion/spring.ts SETTLE, BOUNCE).
    static let settle = 0.4
    /// UIScrollView's rubber band constant.
    static let band = 0.55

    public private(set) var pan: UIPanGestureRecognizer!
    private weak var host: TabSwipeHost?
    private weak var view: UIView?
    private let probe = UIView(frame: CGRect(x: 0, y: -2, width: 1, height: 1))
    private var animator: UIViewPropertyAnimator?
    private var link: CADisplayLink?
    private let tick = UISelectionFeedbackGenerator()

    /// The side the panes are open toward (0: none), the offset they are
    /// drawn at, and where the finger took them from.
    public private(set) var side = 0
    private var offset = 0.0
    private var base = 0.0
    private var past = false

    /// The panes are off their rest: under a finger or settling.
    public var active: Bool { side != 0 || animator != nil }

    public init(host: TabSwipeHost, in view: UIView) {
        self.host = host
        self.view = view
        super.init()
        probe.isUserInteractionEnabled = false
        probe.alpha = 0
        view.addSubview(probe)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(moved(_:)))
        pan.maximumNumberOfTouches = 1
        pan.allowedScrollTypesMask = .continuous
        pan.delegate = self
        view.addGestureRecognizer(pan)
        self.pan = pan
    }

    private var width: Double { max(1, view?.bounds.width ?? 1) }

    // MARK: The finger

    @objc private func moved(_ pan: UIPanGestureRecognizer) {
        guard let view, let host else {
            return
        }
        let dx = pan.translation(in: view).x
        if UIAccessibility.isReduceMotionEnabled, animator == nil {
            // Less motion: nothing follows the finger; a swipe that would
            // land switches at once and the host cross-fades.
            guard pan.state == .ended else {
                return
            }
            let toward = dx < 0 ? 1 : -1
            let flick = abs(pan.velocity(in: view).x) / 1000 > 0.3
            if host.swipeHasTab(toward), abs(dx) / width > Self.commit || flick {
                host.swipeOpen(toward)
                host.swipeLanded(toward)
            }
            return
        }
        switch pan.state {
        case .began:
            hold()
            base = offset
            tick.prepare()
            if side == 0 {
                // A fresh drag opens the side the finger is heading to.
                let toward = pan.velocity(in: view).x < 0 ? 1 : -1
                if host.swipeHasTab(toward) { open(toward) }
            }
        case .changed:
            follow(base + dx)
        case .ended, .cancelled, .failed:
            follow(base + dx)
            release(velocity: pan.state == .ended ? pan.velocity(in: view).x / 1000 : 0)
        default:
            break
        }
    }

    /// The panes drawn at `raw` points from rest: 1:1 toward an open
    /// neighbour, banded past the edge.
    private func follow(_ raw: Double) {
        guard let host else {
            return
        }
        if side != 0, raw * Double(-side) >= 0 {
            offset = max(-width, min(width, raw))
            animator?.fractionComplete = abs(offset) / width
        } else {
            offset = Self.rubber(raw, width)
            animator?.fractionComplete = 0
        }
        let now = side != 0 && abs(offset) / width > Self.commit && offset * Double(-side) > 0
        if now != past {
            past = now
            tick.selectionChanged()
            tick.prepare()
        }
        host.swipeDraw(offset: offset, side: side, progress: progress)
    }

    private var progress: Double {
        side == 0 ? 0 : max(0, min(1, offset * Double(-side) / width))
    }

    /// UIScrollView's band: the further past the edge, the less it gives.
    static func rubber(_ x: Double, _ width: Double) -> Double {
        let d = abs(x)
        return (x < 0 ? -1 : 1) * (1 - 1 / (d * band / width + 1)) * width
    }

    /// `velocity` in points a ms, as the web reads it.
    private func release(velocity: Double) {
        // UIScrollView's projection of where a flick would come to rest.
        let rate = UIScrollView.DecelerationRate.normal.rawValue
        let projected = offset + velocity * rate / (1 - rate)
        let toward = Double(-side)
        let lands = side != 0 && offset * toward > 0
            && (abs(offset) / width > Self.commit || projected * toward > width / 2)
            && velocity * toward > -0.3
        settle(lands: lands, velocity: velocity * 1000)
    }

    // MARK: Tap

    /// A tap on a tab while the panes are off rest: settles on `side` (0:
    /// the current tab) from wherever the panes are, never restarting.
    public func retarget(_ side: Int) {
        guard active else {
            return
        }
        hold()
        if side != 0, self.side != side {
            return
        }
        settle(lands: side != 0, velocity: 0)
    }

    // MARK: The settle

    private func open(_ side: Int) {
        self.side = side
        host?.swipeOpen(side)
        past = false
        scrubber(at: 0)
    }

    /// The paused animator the finger scrubs: the panes from rest (0) to
    /// the neighbour (1), its `fractionComplete` set from the drag.
    private func scrubber(at fraction: Double) {
        probe.center.x = 0
        let target = Double(-side) * width
        let animator = UIViewPropertyAnimator(duration: Self.settle, curve: .linear) { [probe] in
            probe.center.x = target
        }
        animator.addCompletion { [weak self] position in
            self?.landed(on: position == .end)
        }
        animator.pauseAnimation()
        animator.fractionComplete = fraction
        self.animator = animator
    }

    /// Stops a settle in flight where it is drawn, and hands the panes back
    /// to a paused scrubber there.
    private func hold() {
        guard let animator, animator.isRunning else {
            return
        }
        if let x = probe.layer.presentation()?.position.x {
            offset = x
        }
        stopLink()
        self.animator = nil
        animator.stopAnimation(true)
        if side != 0 {
            scrubber(at: progress)
        }
        probe.center.x = offset
    }

    private func settle(lands: Bool, velocity: Double) {
        let target = lands ? Double(-side) * width : 0
        let distance = target - offset
        guard abs(distance) >= 0.5 else {
            // Already where it would settle: a spring over no distance has no path.
            animator?.stopAnimation(true)
            probe.center.x = target
            landed(on: lands)
            return
        }
        let spring = UISpringTimingParameters(duration: Self.settle, bounce: 0,
            initialVelocity: CGVector(dx: abs(distance) > 0.5 ? velocity / distance : 0, dy: 0))
        startLink()
        if let animator, side != 0, offset * Double(-side) >= 0 {
            // The scrubbed animator carries on from where the finger left it.
            animator.isReversed = !lands
            animator.continueAnimation(withTimingParameters: spring, durationFactor: 1)
            return
        }
        // Banded past the edge: spring back to rest from the band.
        animator?.stopAnimation(true)
        probe.center.x = offset
        let back = UIViewPropertyAnimator(duration: Self.settle, timingParameters: spring)
        back.addAnimations { [probe] in probe.center.x = target }
        back.addCompletion { [weak self] _ in self?.landed(on: false) }
        animator = back
        back.startAnimation()
    }

    private func landed(on lands: Bool) {
        stopLink()
        animator = nil
        let side = side
        offset = 0
        past = false
        self.side = 0
        guard side != 0 else {
            host?.swipeDraw(offset: 0, side: 0, progress: 0)
            return
        }
        if lands { host?.swipeLanded(side) } else { host?.swipeReturned(side) }
    }

    private func startLink() {
        stopLink()
        let link = CADisplayLink(target: self, selector: #selector(frame))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    private func stopLink() {
        link?.invalidate()
        link = nil
    }

    @objc private func frame() {
        guard let x = probe.layer.presentation()?.position.x else {
            return
        }
        offset = x
        host?.swipeDraw(offset: offset, side: side, progress: progress)
    }

    // MARK: UIGestureRecognizerDelegate

    public func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === pan, let view, let host else {
            return true
        }
        let v = pan.velocity(in: view)
        guard abs(v.y) <= abs(v.x) * Self.slope else {
            return false
        }
        let toward = side != 0 ? side : (v.x < 0 ? 1 : -1)
        return host.swipeMayBegin(at: pan.location(in: view), side: toward)
    }

    /// The system's back swipe wins wherever it can go back: never deferred.
    public func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldRequireFailureOf other: UIGestureRecognizer) -> Bool {
        if #available(iOS 26.0, macCatalyst 26.0, *),
           let navigation = view?.next(of: UINavigationController.self),
           other === navigation.interactiveContentPopGestureRecognizer {
            return navigation.viewControllers.count > 1
        }
        return false
    }
}

extension UIResponder {
    func next<T: UIResponder>(of _: T.Type) -> T? {
        var at = next
        while let responder = at {
            if let found = responder as? T { return found }
            at = responder.next
        }
        return nil
    }
}
