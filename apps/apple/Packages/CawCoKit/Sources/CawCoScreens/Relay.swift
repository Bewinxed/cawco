import CawCoDesign
import UIKit

/// The relay the home runs when what a tab's list shows changes (Working ↔
/// Finished, a machine's "Show N more" / "Show fewer"), as the web runs it
/// (home/relay-plan.ts, on motion/list-swap.svelte.ts and
/// motion/relay-boxes.ts, with their timings):
///
/// - Whatever both lists share stays put: a machine in both keeps its header,
///   the same line, which only ever glides with the boxes above it.
/// - The lines only the old list has leave top down, OUT 200 ms, 18 ms apart,
///   toward the side the choice moved away from.
/// - Each line only the new list has arrives from the side the choice moved
///   toward, IN 300 ms, 40 ms apart from the first old line's end, and never
///   before the old line in its place has gone (its baton). A machine new to
///   the list brings its header first; one the list lost takes it with it.
/// - Each machine's box is driven: one that grows opens at once, one that
///   shrinks holds until its last old line has gone and then closes, one that
///   goes closes to nothing, each on the drawer curve over `tweenMs` of its
///   change. What is below glides with them, and a line arriving in an opening
///   box waits until the box's edge reaches its foot.
enum RelayPlan {
    static let outMs = 200.0
    static let outStagger = 18.0
    /// The entrance waits for the exit's first line: never both in one place.
    static let inLead = outMs
    static let inMs = 300.0
    static let inStagger = 40.0
    /// Lines past this move together: a stagger down a forty-line list is a wait.
    static let staggerCap = 9
    static let travel = 18.0

    /// When the i-th leaving line has gone, from the change.
    static func leaveEnd(_ i: Int) -> Double {
        Double(min(i, staggerCap)) * outStagger + outMs
    }

    /// When the i-th leaving line starts.
    static func leaveAt(_ i: Int) -> Double {
        Double(min(i, staggerCap)) * outStagger
    }

    /// When the i-th arriving line starts, no sooner than `notBefore`.
    static func enterAt(_ i: Int, notBefore: Double) -> Double {
        max(inLead + Double(min(i, staggerCap)) * inStagger, notBefore)
    }

    /// How long a box's height travels `delta`: `durPanel`, longer for a long
    /// way (2.5 ms a point), never past 480 ms.
    static func tweenMs(_ delta: Double) -> Double {
        min(480, max(Motion.durPanel * 1000, (abs(delta) * 2.5).rounded(.up)))
    }

    static func head(_ machineId: String) -> String { "head:\(machineId)" }
    static func more(_ machineId: String) -> String { "more:\(machineId)" }

    struct Group {
        let id: String
        let rows: [String]
        /// Its "N more" line's words, when it has one.
        let more: String?
        /// Its place in the fleet's machine order, the one every list keeps.
        let order: Int
    }

    struct Arrival {
        /// Its place in the entrance cascade.
        let i: Int
        /// The earliest it may start, in ms from the change.
        var notBefore: Double
    }

    struct Plan {
        var enter: [String: Arrival] = [:]
        /// When each box's last leaving line is gone, by machine.
        var lastOut: [String: Double] = [:]
        /// Each leaving line's place in the exit cascade.
        var leave: [String: Int] = [:]
    }

    /// The whole relay from `old` (what is drawn) to `fresh`, each "N more"
    /// line coming or going after the rows (`planRelay`).
    static func plan(old: [Group], fresh: [Group]) -> Plan {
        var plan = Plan()
        let freshRows = Set(fresh.flatMap(\.rows))
        let freshIds = Set(fresh.map(\.id))
        var leaving = 0
        var batons: [String: [Double]] = [:]
        for group in old {
            func out(_ key: String) -> Double {
                let end = leaveEnd(leaving)
                plan.leave[key] = leaving
                leaving += 1
                plan.lastOut[group.id] = end
                return end
            }
            if !freshIds.contains(group.id) {
                _ = out(head(group.id))
            }
            batons[group.id] = group.rows.filter { !freshRows.contains($0) }.map(out)
        }
        let oldIds = Set(old.map(\.id))
        let oldRows = Set(old.flatMap(\.rows))
        func arrive(_ key: String, _ notBefore: Double) {
            plan.enter[key] = Arrival(i: plan.enter.count, notBefore: notBefore)
        }
        for group in fresh {
            if !oldIds.contains(group.id) {
                arrive(head(group.id), 0)
            }
            let ends = oldIds.contains(group.id) ? batons[group.id] ?? [] : []
            for (place, row) in group.rows.filter({ !oldRows.contains($0) }).enumerated() {
                arrive(row, place < ends.count ? ends[place] : 0)
            }
        }
        let before = Dictionary(old.map { ($0.id, $0.more) }, uniquingKeysWith: { a, _ in a })
        let after = Dictionary(fresh.map { ($0.id, $0.more) }, uniquingKeysWith: { a, _ in a })
        var seen = Set<String>()
        for id in (old + fresh).map(\.id) where seen.insert(id).inserted {
            let was = before[id] ?? nil
            let now = after[id] ?? nil
            if was != nil, now == nil {
                plan.leave[more(id)] = leaving
                plan.lastOut[id] = max(plan.lastOut[id] ?? 0, leaveEnd(leaving))
                leaving += 1
            } else if now != nil, was == nil {
                arrive(more(id), 0)
            }
        }
        return plan
    }
}

/// Where a line of the home stands for a relay.
enum RelayPlace {
    /// A line of the work list: its key (`head:`, a row id, `more:`) and its machine.
    case line(key: String, group: String)
    /// A line after the work list, carried by the boxes above it.
    case tail
    case none
}

/// What the work list draws at one moment: its machines in order, and every
/// line's laid-out frame and loaded cell by key.
struct RelayLines {
    var groups: [RelayPlan.Group] = []
    var frames: [String: CGRect] = [:]
    var cells: [String: UIView] = [:]

    /// A machine's box: from its header's top to its last line's foot.
    func box(_ id: String) -> (top: Double, height: Double)? {
        guard let group = groups.first(where: { $0.id == id }), let head = frames[RelayPlan.head(id)] else {
            return nil
        }
        var foot = head.maxY
        for key in group.rows + [RelayPlan.more(id)] {
            if let frame = frames[key] {
                foot = max(foot, frame.maxY)
            }
        }
        return (head.minY, foot - head.minY)
    }
}

@MainActor
protocol RelayHost: AnyObject {
    var collectionView: UICollectionView! { get }
    var layout: HomeLayout { get }
    /// What the work list draws now.
    func workLines() -> RelayLines
    /// The line an index path draws now.
    func place(at indexPath: IndexPath) -> RelayPlace
}

/// One relay, driven a frame at a time from the plan.
@MainActor
final class RelayMotion {
    private let clock = Frames()
    private var copies: [UIView] = []
    private var finish: (() -> Void)?

    var running: Bool { clock.running }

    /// Runs `change` (which applies the new list at once, unanimated) as a
    /// relay toward `direction` (1: forward, rows arrive from the right).
    func run(on host: RelayHost, direction: Double, change: () -> Void, done: @escaping () -> Void) {
        end()
        guard let view = host.collectionView else {
            change()
            done()
            return
        }
        let before = host.workLines()
        var shots: [String: UIView] = [:]
        for (key, cell) in before.cells {
            shots[key] = cell.snapshotView(afterScreenUpdates: false)
        }
        change()
        view.layoutIfNeeded()
        let after = host.workLines()
        let plan = RelayPlan.plan(old: before.groups, fresh: after.groups)

        // Every machine either side of the change, in the one order.
        var order: [String: Int] = [:]
        for group in before.groups + after.groups {
            order[group.id] = group.order
        }
        let ids = order.keys.sorted { (order[$0] ?? 0, $0) < (order[$1] ?? 0, $1) }
        let top = (before.groups.first.flatMap { before.box($0.id) } ?? after.groups.first.flatMap { after.box($0.id) })?.top ?? 0

        struct Box {
            let from: Double
            let to: Double
            let wait: Double
            let ms: Double

            func height(_ t: Double) -> Double {
                guard abs(to - from) >= 0.5 else {
                    return to
                }
                let share = min(1, max(0, (t - wait) / ms))
                return from + (to - from) * Motion.easeDrawer.value(at: share)
            }
        }
        var boxes: [String: Box] = [:]
        var enter = plan.enter
        var total = 0.0
        for id in ids {
            let from = before.box(id)?.height ?? 0
            let to = after.box(id)?.height ?? 0
            let ms = RelayPlan.tweenMs(to - from)
            let wait = to > from ? 0 : plan.lastOut[id] ?? 0
            boxes[id] = Box(from: from, to: to, wait: wait, ms: ms)
            if abs(to - from) >= 0.5 {
                total = max(total, wait + ms)
            }
            // An arriving line in an opening box waits for the box's edge to reach its foot.
            guard to > from + 0.5, let group = after.groups.first(where: { $0.id == id }), let boxTop = after.box(id)?.top else {
                continue
            }
            for key in [RelayPlan.head(id)] + group.rows + [RelayPlan.more(id)] {
                guard var arrival = enter[key], let frame = after.frames[key] else {
                    continue
                }
                let share = (frame.maxY - boxTop - from) / (to - from)
                let wait = (ms * Motion.easeDrawer.time(reaching: share)).rounded(.up)
                if wait > arrival.notBefore {
                    arrival.notBefore = wait
                    enter[key] = arrival
                }
            }
        }
        for at in plan.lastOut.values {
            total = max(total, at)
        }
        for arrival in enter.values {
            total = max(total, RelayPlan.enterAt(arrival.i, notBefore: arrival.notBefore) + RelayPlan.inMs)
        }
        let afterTops = Dictionary(uniqueKeysWithValues: after.groups.compactMap { group in after.box(group.id).map { (group.id, $0.top) } })
        let afterTotal = ids.reduce(0) { $0 + (boxes[$1]?.to ?? 0) }

        // The leaving lines, as copies where they stood, carried with their box.
        struct Leaving {
            let view: UIView
            let group: String
            let offset: Double
            let index: Int
            let frame: CGRect
        }
        var leaving: [Leaving] = []
        for group in before.groups {
            guard let boxTop = before.box(group.id)?.top else {
                continue
            }
            for key in [RelayPlan.head(group.id)] + group.rows + [RelayPlan.more(group.id)] {
                guard let index = plan.leave[key], let shot = shots[key], let frame = before.frames[key] else {
                    continue
                }
                shot.frame = frame
                shot.isUserInteractionEnabled = false
                view.addSubview(shot)
                copies.append(shot)
                leaving.append(Leaving(view: shot, group: group.id, offset: frame.minY - boxTop, index: index, frame: frame))
            }
        }

        // This frame's tops, read by the layout's `adjust` and by the copies.
        var now = 0.0
        var tops: [String: Double] = [:]
        var tail = 0.0
        func step(_ t: Double) {
            now = t
            var y = top
            var sum = 0.0
            for id in ids {
                tops[id] = y
                let height = boxes[id]?.height(t) ?? 0
                y += height
                sum += height
            }
            tail = sum - afterTotal
        }
        let adjust: (IndexPath) -> Adjust? = { indexPath in
            switch host.place(at: indexPath) {
            case let .line(key, group):
                var moved = Adjust(dy: (tops[group] ?? 0) - (afterTops[group] ?? 0))
                if let arrival = enter[key] {
                    let start = RelayPlan.enterAt(arrival.i, notBefore: arrival.notBefore)
                    let p = Motion.easeOut.value(at: (now - start) / RelayPlan.inMs)
                    moved.alpha = p
                    moved.dx = direction * RelayPlan.travel * (1 - p)
                }
                return moved
            case .tail:
                return Adjust(dy: tail)
            case .none:
                return nil
            }
        }
        let layout = host.layout
        let frames = layout.frames(in: view)
        layout.reach = boxes.values.reduce(0) { $0 + abs($1.to - $1.from) } + RelayPlan.travel
        layout.adjust = adjust
        finish = { [weak self] in
            layout.adjust = nil
            view.settleFrame()
            self?.copies.forEach { $0.removeFromSuperview() }
            self?.copies = []
            done()
        }
        clock.run { [weak self] t in
            guard t < total else {
                self?.end()
                return false
            }
            step(t)
            view.drawFrame(adjust, frames: frames)
            for line in leaving {
                let p = Motion.easeOut.value(at: (t - RelayPlan.leaveAt(line.index)) / RelayPlan.outMs)
                line.view.frame.origin.y = (tops[line.group] ?? 0) + line.offset
                line.view.alpha = 1 - p
                line.view.transform = CGAffineTransform(translationX: -direction * RelayPlan.travel * p, y: 0)
            }
            return true
        }
    }

    /// Lands a relay in flight where it ends.
    func end() {
        clock.stop()
        let finish = finish
        self.finish = nil
        finish?()
    }
}
