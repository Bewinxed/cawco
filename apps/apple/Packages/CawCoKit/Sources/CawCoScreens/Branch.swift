import CawCoDesign
import UIKit

/// A tree's fold, as the web's (motion/branch.svelte.ts): one moving point,
/// the head of the line that leaves the parent's glyph, read every frame.
///
/// Opening: the line leads. Its head glides at one steady speed (`Glide`),
/// so the children are reached `durStagger` apart, or closer in a tree too
/// tall to open within `durCascade`; every stretch of line (each child's
/// elbow, the rail on past it, a rail through a deeper child) is drawn as far
/// as the head has got. The room opens down from the parent row at the same
/// speed, uncovering the rows in place while everything under it slides down
/// with its edge. As the head reaches a child's glyph, the glyph flies in from
/// the row's left edge as it fades in and the title wipes in left to right,
/// on the out curve over `durRail`.
///
/// Folding: quicker, over `durExit`. The room closes on the in-out curve, the
/// rows under it sliding up with its edge, while the line runs back on the
/// out curve ahead of it; as the head leaves a child's glyph its title wipes
/// out right to left, then its glyph flies out to the left as it fades.
///
/// Reduce Motion: nothing travels. Opening, the room lands at once and the
/// children fade in over `durPop`; folding, they fade where they stand over
/// `durExit`, then the room closes at once.
enum BranchShape {
    /// A row's glyph centre from its cell's top (NestShape's).
    static var glyphY: Double { Nest.gap + Nest.rowHeight / 2 }
    /// A parent's glyph foot from its cell's top.
    static var glyphFoot: Double { glyphY + Size.rowMarkBox / 2 }
    static var radius: Double { Radius.radiusSm }
    /// An elbow's top from its cell's top: a first child's starts at its parent's glyph foot.
    static func elbowTop(first: Bool) -> Double { first ? -(Nest.rowHeight / 2 - Size.rowMarkBox / 2) : 0 }
    /// An elbow's length: down its rail, round its corner, out along its arm.
    static func elbowLength(first: Bool) -> Double {
        let down = glyphY - radius - elbowTop(first: first)
        let arc = Double.pi / 2 * radius
        let arm = Nest.nestIn + Space.space3 - radius
        return down + arc + arm
    }
}

/// One row of a tree that opens or folds, as the motion reads it.
struct BranchRow {
    let id: String
    let indexPath: IndexPath
    let frame: CGRect
    let depth: Int
    let first: Bool
    let last: Bool
    /// Its tree parent's id.
    let parent: String?
    /// The depths whose rails pass it, each with the id of the row whose sibling line it is.
    let through: [(depth: Int, list: String?)]
}

@MainActor
protocol BranchHost: AnyObject {
    var collectionView: UICollectionView! { get }
    var layout: HomeLayout { get }
}

/// One fold or opening, driven a frame at a time.
@MainActor
final class BranchMotion {
    private let clock = Frames()
    private var finish: (() -> Void)?

    var running: Bool { clock.running }

    /// `rows`: the tree's rows under `parent`, laid out (opening: after the
    /// change; folding: before it), top down. `land` runs once the motion is
    /// over (a fold applies its list then).
    func run(on host: BranchHost, parent: CGRect, parentDepth: Int, rows: [BranchRow], opening: Bool, land: @escaping () -> Void) {
        end()
        guard let view = host.collectionView, let last = rows.last, let first = rows.first else {
            land()
            return
        }
        let layout = host.layout
        let frames = layout.frames(in: view)
        let roomTop = first.frame.minY
        let roomBottom = last.frame.maxY
        let room = roomBottom - roomTop
        let ids = Set(rows.map(\.indexPath))

        if UIAccessibility.isReduceMotionEnabled {
            let cells = rows.compactMap { view.cellForItem(at: $0.indexPath) }
            for cell in cells where opening {
                cell.alpha = 0
            }
            let fade = Motion.easeOut.animator(opening ? Motion.durPop : Motion.durExit) {
                for cell in cells {
                    cell.alpha = opening ? 1 : 0
                }
            }
            finish = {
                for cell in cells {
                    cell.alpha = 1
                }
                land()
            }
            fade.addCompletion { [weak self] _ in self?.end() }
            fade.startAnimation()
            return
        }

        // Each list's line: where it leaves its parent's glyph, and how far
        // along the whole line that is.
        let byId = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        var lines: [String: (at: Double, base: Double)] = [:]
        var arrive: [String: Double] = [:]
        var length = 0.0
        func line(_ list: String?) -> (at: Double, base: Double) {
            let id = list ?? ""
            if let known = lines[id] {
                return known
            }
            let host = byId[id]
            let made = (
                at: Double(host?.frame.minY ?? parent.minY) + BranchShape.glyphFoot,
                base: host.flatMap { arrive[$0.id] } ?? 0
            )
            lines[id] = made
            return made
        }
        struct Stretches {
            var elbow: (from: Double, length: Double)
            var onward: (from: Double, length: Double)?
            /// By depth: a rail inside the tree, or nil for one the room's edge uncovers.
            var through: [Int: (from: Double, length: Double)?]
        }
        var stretches: [IndexPath: Stretches] = [:]
        let parentId = rows.first?.parent
        for row in rows {
            let own = line(row.parent == parentId ? nil : row.parent)
            let elbowTop = row.frame.minY + BranchShape.elbowTop(first: row.first)
            let elbowFrom = own.base + (elbowTop - own.at)
            let elbowLength = BranchShape.elbowLength(first: row.first)
            arrive[row.id] = elbowFrom + elbowLength
            length = max(length, elbowFrom + elbowLength)
            var drawn = Stretches(elbow: (elbowFrom, elbowLength), through: [:])
            if !row.last {
                let top = row.frame.minY + BranchShape.glyphY - BranchShape.radius
                let onward = (from: own.base + (top - own.at), length: Double(row.frame.maxY) - top)
                drawn.onward = onward
                length = max(length, onward.from + onward.length)
            }
            for rail in row.through {
                // A rail at depth d joins siblings under a row at d - 1: in the
                // tree when that row is the parent or below it.
                guard rail.depth > parentDepth else {
                    drawn.through[rail.depth] = .some(nil)
                    continue
                }
                let list = line(rail.list)
                let stretch = (from: list.base + (row.frame.minY - list.at), length: Double(row.frame.height))
                drawn.through[rail.depth] = stretch
                length = max(length, stretch.from + stretch.length)
            }
            stretches[row.indexPath] = drawn
        }

        // The plan: the room's edge, the head, and when the head passes a point.
        let rail = Motion.durRail * 1000
        let exit = Motion.durExit * 1000
        let edge: (Double) -> Double
        let head: (Double) -> Double
        let when: (Double) -> Double
        var total: Double
        if opening {
            let speed = Glide.speed(room, stops: rows.count)
            let roomGlide = Glide(room, speed: speed)
            let lineGlide = Glide(length, speed: speed)
            edge = { roomGlide.covered($0) }
            head = { lineGlide.covered($0) }
            when = { lineGlide.reached($0) }
            total = max(roomGlide.duration, lineGlide.duration)
            for row in rows {
                total = max(total, when(arrive[row.id] ?? 0) + rail)
            }
        } else {
            edge = { room * (1 - Motion.easeInOut.value(at: $0 / exit)) }
            head = { length * (1 - Motion.easeOut.value(at: $0 / exit)) }
            when = { s in s >= length || length <= 0 ? 0 : exit * Motion.easeOut.time(reaching: 1 - s / length) }
            total = exit
        }
        /// How far in (0–1) a row's title and glyph are at `t`.
        func reveal(_ row: BranchRow, _ t: Double) -> (glyph: Double, title: Double) {
            let at = when(arrive[row.id] ?? 0)
            if opening {
                let v = Motion.easeOut.value(at: (t - at) / rail)
                return (v, v)
            }
            func out(_ start: Double) -> Double {
                let start = min(exit, start)
                let span = min(exit / 2, exit - start)
                guard span > 0 else {
                    return t >= start ? 0 : 1
                }
                return 1 - Motion.easeOut.value(at: (t - start) / span)
            }
            return (out(at + exit / 4), out(at))
        }

        var now = 0.0
        let adjust: (IndexPath) -> Adjust? = { indexPath in
            guard !ids.contains(indexPath), let frame = frames[indexPath], frame.minY >= roomBottom - 0.5 else {
                return nil
            }
            return Adjust(dy: edge(now) - room)
        }
        let rowsAt = Dictionary(uniqueKeysWithValues: rows.map { ($0.indexPath, $0) })
        func draw(_ t: Double) {
            now = t
            view.drawFrame(adjust, frames: frames)
            let reach = head(t)
            let open = edge(t)
            for indexPath in view.indexPathsForVisibleItems {
                guard let row = rowsAt[indexPath], let cell = view.cellForItem(at: indexPath) as? RowCell,
                      let drawn = stretches[indexPath]
                else {
                    continue
                }
                func share(_ stretch: (from: Double, length: Double)) -> Double {
                    stretch.length <= 0 ? 1 : min(1, max(0, (reach - stretch.from) / stretch.length))
                }
                var through: [Int: Double] = [:]
                for (depth, stretch) in drawn.through {
                    through[depth] = stretch.map(share) ?? 1
                }
                cell.drawNest(elbow: share(drawn.elbow), onward: drawn.onward.map(share) ?? 1, through: through)
                let shown = reveal(row, t)
                cell.reveal(glyph: shown.glyph, title: shown.title)
                cell.clip(below: open - (row.frame.minY - roomTop))
            }
        }
        layout.reach = room + Nest.rowHeight
        layout.adjust = adjust
        finish = {
            layout.adjust = nil
            for cell in view.visibleCells {
                (cell as? RowCell)?.rest()
            }
            view.settleFrame()
            land()
        }
        clock.run { [weak self] t in
            guard t < total else {
                self?.end()
                return false
            }
            draw(t)
            return true
        }
    }

    /// Lands a fold in flight where it ends.
    func end() {
        clock.stop()
        let finish = finish
        self.finish = nil
        finish?()
    }
}
