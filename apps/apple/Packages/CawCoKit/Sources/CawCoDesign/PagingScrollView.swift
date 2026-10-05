import OSLog
import UIKit

/// UIKit owns the drag, edge elasticity, velocity and page settlement.
/// Hosts supply page content and observe offsets for their own appearance.
public final class PagingScrollView: UIScrollView, UIScrollViewDelegate {
    public enum Axis { case horizontal, vertical }
    public let axis: Axis
    public var onBegin: () -> Void = {}
    public var onScroll: (Double) -> Void = { _ in }
    public var onLand: (Int) -> Void = { _ in }
    /// The page the system will settle on, told the moment the finger lets go.
    public var onTarget: (Int) -> Void = { _ in }
    public var mayBegin: (CGPoint) -> Bool = { _ in true }
    public var traceName = "pages"
    private var moving = false
    private var count = 0
    private var serial = 0
    private var reducing = false

    public var active: Bool { moving || isTracking || isDragging || isDecelerating }
    public var length: Double { axis == .horizontal ? bounds.width : bounds.height }
    public var position: Double { length > 0 ? (axis == .horizontal ? contentOffset.x : contentOffset.y) / length : 0 }
    public static let slope = 0.7

    public init(axis: Axis = .horizontal, touches: Int = 1) {
        self.axis = axis
        super.init(frame: .zero)
        delegate = self
        isPagingEnabled = true
        isDirectionalLockEnabled = true
        bounces = true
        alwaysBounceHorizontal = axis == .horizontal
        alwaysBounceVertical = axis == .vertical
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        scrollsToTop = false
        panGestureRecognizer.minimumNumberOfTouches = touches
        panGestureRecognizer.maximumNumberOfTouches = touches
        panGestureRecognizer.allowedScrollTypesMask = .all
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("PagingScrollView is built in code") }

    public func configure(count: Int, selected: Int) {
        self.count = count
        let size = axis == .horizontal
            ? CGSize(width: bounds.width * Double(count), height: bounds.height)
            : CGSize(width: bounds.width, height: bounds.height * Double(count))
        if contentSize != size { contentSize = size }
        if !active, contentOffset != offset(for: selected) { setContentOffset(offset(for: selected), animated: false) }
    }

    public func choose(_ page: Int, animated: Bool) {
        let target = offset(for: page)
        guard target != contentOffset else { return }
        begin()
        if animated && !UIAccessibility.isReduceMotionEnabled {
            setContentOffset(target, animated: true)
        } else {
            crossFade(to: target)
        }
    }

    private func offset(for page: Int) -> CGPoint {
        axis == .horizontal ? CGPoint(x: Double(page) * length, y: 0) : CGPoint(x: 0, y: Double(page) * length)
    }

    override public func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        if recognizer === panGestureRecognizer {
            let v = panGestureRecognizer.velocity(in: self)
            let along = axis == .horizontal ? v.x : v.y
            let across = axis == .horizontal ? v.y : v.x
            if abs(across) > abs(along) * Self.slope || !mayBegin(panGestureRecognizer.location(in: self)) { return false }
        }
        return super.gestureRecognizerShouldBegin(recognizer)
    }

    private func begin() {
        if !moving { serial += 1; moving = true; onBegin(); trace("began") }
    }

    private func land() {
        guard moving, !reducing, length > 0, count > 0 else { return }
        moving = false
        let page = min(count - 1, max(0, Int(position.rounded())))
        trace("landed")
        onLand(page)
    }

    public func scrollViewWillBeginDragging(_ scrollView: UIScrollView) { begin() }
    public func scrollViewDidScroll(_ scrollView: UIScrollView) { onScroll(position); trace(moving ? "offset" : "rest") }
    public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate: Bool) { trace("released"); if !willDecelerate { land() } }
    public func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { land() }
    public func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { land() }

    public func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
        let target = axis == .horizontal ? targetContentOffset.pointee.x : targetContentOffset.pointee.y
        trace("target", target: target)
        if !UIAccessibility.isReduceMotionEnabled, length > 0, count > 0 {
            onTarget(min(count - 1, max(0, Int((target / length).rounded()))))
        }
        if UIAccessibility.isReduceMotionEnabled {
            let target = targetContentOffset.pointee
            targetContentOffset.pointee = contentOffset
            reducing = true
            DispatchQueue.main.async { [weak self] in self?.crossFade(to: target) }
        }
    }

    private func crossFade(to target: CGPoint) {
        let old = snapshotView(afterScreenUpdates: false)
        if let old, let parent = superview { old.frame = frame; parent.addSubview(old) }
        setContentOffset(target, animated: false)
        reducing = false
        land()
        if let old {
            let fade = Motion.easeOut.animator(Motion.durControl) { old.alpha = 0 }
            fade.addCompletion { _ in old.removeFromSuperview() }
            fade.startAnimation()
        }
    }

    private func trace(_ phase: String, target: Double = .nan) {
        #if DEBUG
        Logger(subsystem: "dev.cawco.app", category: "Paging").debug("paging \(self.traceName, privacy: .public) \(self.serial) \(phase, privacy: .public) offset=\(self.axis == .horizontal ? self.contentOffset.x : self.contentOffset.y) length=\(self.length) target=\(target)")
        #endif
    }
}
