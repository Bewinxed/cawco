import CawCoDesign
import QuartzCore
import UIKit

/// A driven motion's clock: one call a display frame with the ms since it
/// began, until the call says it is done. The web drives its relay and its
/// trees the same way, from one timeline every piece reads.
@MainActor
final class Frames: NSObject {
    private var link: CADisplayLink?
    private var begin: CFTimeInterval?
    private var tick: ((Double) -> Bool)?

    var running: Bool { link != nil }

    /// Starts `tick`, calling it once now for its first frame.
    func run(_ tick: @escaping (Double) -> Bool) {
        stop()
        guard tick(0) else {
            return
        }
        self.tick = tick
        begin = nil
        let link = CADisplayLink(target: self, selector: #selector(step(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
        tick = nil
    }

    @objc private func step(_ link: CADisplayLink) {
        let begin = begin ?? link.timestamp
        self.begin = begin
        guard let tick, tick((link.targetTimestamp - begin) * 1000) else {
            stop()
            return
        }
    }
}

/// A distance travelled at one steady speed (px a ms), rising evenly from
/// rest over the first `space3` and falling evenly to rest over the last
/// `space1` (curves.svelte.ts `glide`): a tree's line runs its length this
/// way, and the room it opens keeps step with it.
struct Glide {
    let distance: Double
    let speed: Double
    private let into: Double
    private let outOf: Double
    private let rising: Double
    private let steady: Double
    private let fall: Double
    let duration: Double

    private static var ends: Double { Space.space3 + Space.space1 }

    init(_ distance: Double, speed: Double) {
        self.distance = distance
        self.speed = speed
        let share = Self.ends > 0 ? min(1, distance / Self.ends) : 0
        into = Space.space3 * share
        outOf = Space.space1 * share
        rising = 2 * into / speed
        steady = max(0, distance - into - outOf) / speed
        fall = 2 * outOf / speed
        duration = rising + steady + fall
    }

    /// The speed to pass `stops` evenly spaced stops `durStagger` apart, never
    /// taking longer than `durCascade` for the whole way (`glideSpeed`).
    static func speed(_ distance: Double, stops: Int) -> Double {
        let least = (distance + ends) / (Motion.durCascade * 1000)
        let own = stops > 0
            ? distance / Double(stops) / (Motion.durStagger * 1000)
            : (distance + ends) / (Motion.durPanel * 1000)
        return max(own, least)
    }

    /// How far along it is `t` ms in.
    func covered(_ t: Double) -> Double {
        if t <= 0 {
            return 0
        }
        if t < rising {
            return speed / (2 * rising) * t * t
        }
        if t < rising + steady {
            return into + speed * (t - rising)
        }
        if t < duration {
            let left = duration - t
            return distance - speed / (2 * fall) * left * left
        }
        return distance
    }

    /// When it is `d` along.
    func reached(_ d: Double) -> Double {
        if d <= 0 {
            return 0
        }
        if d >= distance {
            return duration
        }
        if d < into {
            return (2 * rising * d / speed).squareRoot()
        }
        if d <= distance - outOf {
            return rising + (d - into) / speed
        }
        return duration - (2 * fall * (distance - d) / speed).squareRoot()
    }
}

/// Where a line stands this frame, off the place the layout gives it.
struct Adjust: Equatable {
    var dx = 0.0
    var dy = 0.0
    var alpha = 1.0

    static let none = Adjust()

    var transform: CGAffineTransform {
        dx == 0 && dy == 0 ? .identity : CGAffineTransform(translationX: dx, y: dy)
    }
}

/// The home's list layout: a vertical list per section, every item its own
/// self-sized height. While a driven motion runs (the tab relay, a tree's
/// fold), `adjust` says where each line stands this frame, so a line the
/// motion carries into view is laid out there and drawn, not left unloaded
/// at its final place out of view. Live arrivals and departures, animated by
/// the data source, fade in beneath the rows that stay and fade where they stood.
final class HomeLayout: UICollectionViewCompositionalLayout {
    /// A driven motion's word on each line; nil at rest.
    var adjust: ((IndexPath) -> Adjust?)?
    /// How far a motion carries any line from its place.
    var reach = 0.0

    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        guard let adjust else {
            return super.layoutAttributesForElements(in: rect)
        }
        return super.layoutAttributesForElements(in: rect.insetBy(dx: 0, dy: -reach))?.compactMap { attributes in
            guard attributes.representedElementCategory == .cell, let moved = adjust(attributes.indexPath), moved != .none else {
                return attributes.frame.intersects(rect) ? attributes : nil
            }
            let drawn = attributes.frame.offsetBy(dx: moved.dx, dy: moved.dy)
            guard drawn.intersects(rect), let copy = attributes.copy() as? UICollectionViewLayoutAttributes else {
                return nil
            }
            copy.transform = moved.transform
            copy.alpha = moved.alpha
            return copy
        }
    }

    override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        let attributes = super.layoutAttributesForItem(at: indexPath)
        guard let adjust, let attributes, let moved = adjust(indexPath), moved != .none,
              let copy = attributes.copy() as? UICollectionViewLayoutAttributes
        else {
            return attributes
        }
        copy.transform = moved.transform
        copy.alpha = moved.alpha
        return copy
    }

    /// A line that arrives sits beneath the lines that stay: they are drawn on
    /// the page's own ground, so as they slide they uncover it.
    override func initialLayoutAttributesForAppearingItem(at itemIndexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        let attributes = super.initialLayoutAttributesForAppearingItem(at: itemIndexPath)?.copy() as? UICollectionViewLayoutAttributes
        attributes?.alpha = 0
        attributes?.zIndex = -1
        return attributes
    }

    /// A line that leaves fades where it stood as the lines after it close over it.
    override func finalLayoutAttributesForDisappearingItem(at itemIndexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        let attributes = super.finalLayoutAttributesForDisappearingItem(at: itemIndexPath)?.copy() as? UICollectionViewLayoutAttributes
        attributes?.alpha = 0
        attributes?.zIndex = -1
        return attributes
    }

    /// Every line's laid-out frame, by index path, read with no motion applied.
    func frames(in collectionView: UICollectionView) -> [IndexPath: CGRect] {
        let held = adjust
        adjust = nil
        defer { adjust = held }
        let all = CGRect(x: 0, y: -1, width: collectionView.bounds.width, height: collectionView.contentSize.height + 2)
        var out: [IndexPath: CGRect] = [:]
        for attributes in super.layoutAttributesForElements(in: all) ?? [] where attributes.representedElementCategory == .cell {
            out[attributes.indexPath] = attributes.frame
        }
        return out
    }
}

extension UICollectionView {
    /// Draws one frame of a driven motion: every loaded line where `adjust`
    /// puts it, and a fresh layout pass when the motion carries a line into
    /// view that is not loaded yet.
    func drawFrame(_ adjust: (IndexPath) -> Adjust?, frames: [IndexPath: CGRect]) {
        let visible = Set(indexPathsForVisibleItems)
        for indexPath in visible {
            guard let cell = cellForItem(at: indexPath) else {
                continue
            }
            let moved = adjust(indexPath) ?? .none
            cell.transform = moved.transform
            cell.alpha = moved.alpha
        }
        let view = bounds
        for (indexPath, frame) in frames where !visible.contains(indexPath) {
            let moved = adjust(indexPath) ?? .none
            if frame.offsetBy(dx: moved.dx, dy: moved.dy).intersects(view) {
                collectionViewLayout.invalidateLayout()
                layoutIfNeeded()
                return
            }
        }
    }

    /// Every loaded line back at its place, as the motion leaves it.
    func settleFrame() {
        for cell in visibleCells {
            cell.transform = .identity
            cell.alpha = 1
        }
        collectionViewLayout.invalidateLayout()
    }
}
