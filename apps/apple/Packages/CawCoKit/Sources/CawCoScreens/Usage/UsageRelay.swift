import CawCoDesign
import UIKit

/// The Usage list's boxes use the home's relay plan and display-link clock.
/// Lines retain their views, including while leaving, so a second choice
/// starts from what is drawn rather than from either end of the first choice.
final class UsageRelayView: UIView {
    struct Line {
        let key: String
        let view: UIView
        var gap = 0.0
    }

    struct Group {
        let id: String
        let order: Int
        let head: Line?
        let rows: [Line]
        let more: Line?
        var gap = 0.0
    }

    enum Style { case rows, body(Int) }

    private struct Placed {
        let group: String
        let view: UIView
        var frame: CGRect
        var alpha: Double
    }

    private struct Box {
        var top: Double
        var height: Double
    }

    private let clock = Frames()
    private var height: NSLayoutConstraint!
    private var groups: [Group] = []
    private var drawn: [String: Placed] = [:]
    private var boxes: [String: Box] = [:]
    private var orders: [String: Int] = [:]
    private var accessible: [String: Bool] = [:]
    private var measuredWidth = 0.0

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        height = heightAnchor.constraint(equalToConstant: 0)
        height.isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("UsageRelayView is built in code") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { clock.stop() }
    }

    func reset() {
        clock.stop()
        for (key, line) in drawn {
            line.view.isAccessibilityElement = accessible[key] ?? line.view.isAccessibilityElement
            line.view.accessibilityElementsHidden = false
            line.view.removeFromSuperview()
        }
        drawn = [:]
        boxes = [:]
        groups = []
        orders = [:]
        accessible = [:]
        height.constant = 0
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width > 0, measuredWidth != bounds.width {
            clock.stop()
            measuredWidth = bounds.width
            let (lines, boxes) = place(groups)
            land(lines, boxes: boxes)
        }
    }

    /// nil direction is a range change: retained rows move in place. A
    /// harness/grouping choice is the same top-down relay the home runs.
    func show(_ next: [Group], direction: Double?, style: Style = .rows) {
        clock.stop()
        groups = next
        for group in next { orders[group.id] = group.order }
        guard bounds.width > 0 else { setNeedsLayout(); return }
        let old = drawn
        let oldBoxes = boxes
        let (fresh, targetBoxes) = place(next)
        if old.isEmpty || window == nil {
            land(fresh, boxes: targetBoxes)
            return
        }
        if UIAccessibility.isReduceMotionEnabled {
            UIView.transition(with: self, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                self.land(fresh, boxes: targetBoxes)
            }
            return
        }
        let ids = Set(oldBoxes.keys).union(targetBoxes.keys).sorted { (orders[$0]!, $0) < (orders[$1]!, $1) }
        let was = ids.filter { oldBoxes[$0] != nil }.map { id in
            let lines = old.filter { $0.value.group == id && $0.value.alpha > 0 }
                .sorted { $0.value.frame.minY < $1.value.frame.minY }
            return RelayPlan.Group(id: id,
                            rows: lines.map(\.key).filter { $0 != RelayPlan.head(id) && $0 != RelayPlan.more(id) },
                            more: lines.contains { $0.key == RelayPlan.more(id) } ? "more" : nil, order: orders[id]!)
        }
        let to = next.map { RelayPlan.Group(id: $0.id, rows: $0.rows.map(\.key), more: $0.more.map { _ in "more" }, order: $0.order) }
        let bodyIndex: Int?
        switch style {
        case .rows: bodyIndex = nil
        case let .body(index): bodyIndex = index
        }
        var plan = RelayPlan.plan(old: was, fresh: to)
        if let index = bodyIndex {
            plan.leave = plan.leave.mapValues { $0 + index }
            plan.lastOut = plan.lastOut.mapValues { $0 + Double(index) * RelayPlan.outStagger }
            plan.enter = plan.enter.mapValues { .init(i: $0.i + index, notBefore: $0.notBefore + Double(index) * RelayPlan.outStagger) }
        }
        var enter = plan.enter
        // An arriving row waits until its opening box reaches its foot.
        for (key, line) in fresh where old[key] == nil && bodyIndex == nil {
            guard var arrival = enter[key], let box = targetBoxes[line.group] else { continue }
            let from = oldBoxes[line.group]?.height ?? 0
            if box.height > from {
                let delta = box.height - from
                let share = (line.frame.maxY - box.top - from) / delta
                arrival.notBefore = max(arrival.notBefore, RelayPlan.tweenMs(delta) * Motion.easeDrawer.time(reaching: share))
                enter[key] = arrival
            }
        }
        var total = (bodyIndex == nil ? Motion.durPanel : Motion.durMorph) * 1000
        if direction != nil {
            for at in plan.lastOut.values { total = max(total, at) }
            for at in enter.values { total = max(total, RelayPlan.enterAt(at.i, notBefore: at.notBefore) + RelayPlan.inMs) }
            for id in ids {
                let from = oldBoxes[id]?.height ?? 0
                let target = targetBoxes[id]?.height ?? 0
                total = max(total, bodyIndex != nil ? Motion.durMorph * 1000 : (target < from ? plan.lastOut[id] ?? 0 : 0) + RelayPlan.tweenMs(target - from))
            }
        }
        for (key, line) in old where fresh[key] == nil {
            line.view.isUserInteractionEnabled = false
            line.view.isAccessibilityElement = false
            line.view.accessibilityElementsHidden = true
        }
        for (key, line) in old {
            if let next = fresh[key], next.view !== line.view { line.view.removeFromSuperview() }
        }
        for (key, line) in fresh {
            if accessible[key] == nil { accessible[key] = line.view.isAccessibilityElement }
            line.view.isAccessibilityElement = accessible[key]!
            line.view.accessibilityElementsHidden = false
            line.view.isUserInteractionEnabled = true
            if line.view.superview !== self { addSubview(line.view) }
        }
        clock.run { [weak self] elapsed in
            guard let self else { return false }
            if elapsed >= total { land(fresh, boxes: targetBoxes); return false }
            var nowBoxes: [String: Box] = [:]
            var y = 0.0
            for id in ids {
                let from = oldBoxes[id]?.height ?? 0
                let target = targetBoxes[id]?.height ?? 0
                let wait = bodyIndex == nil && direction != nil && target < from ? plan.lastOut[id] ?? 0 : 0
                let ms = bodyIndex != nil ? Motion.durMorph * 1000 : direction == nil ? Motion.durPanel * 1000 : RelayPlan.tweenMs(target - from)
                let p = (direction == nil && bodyIndex == nil ? Motion.easeInOut : Motion.easeDrawer).value(at: (elapsed - wait) / ms)
                let size = from + (target - from) * p
                nowBoxes[id] = Box(top: y, height: size)
                y += size
            }
            var now: [String: Placed] = [:]
            for (key, target) in fresh {
                var line = target
                if let direction, let box = nowBoxes[target.group], let targetBox = targetBoxes[target.group] {
                    line.frame.origin.y += box.top - targetBox.top
                    if let arrival = enter[key] {
                        let start = RelayPlan.enterAt(arrival.i, notBefore: arrival.notBefore)
                        let p = Motion.easeOut.value(at: (elapsed - start) / RelayPlan.inMs)
                        line.frame.origin.x += direction * RelayPlan.travel * (1 - p)
                        line.alpha = p
                    } else if let before = old[key], let previousBox = oldBoxes[target.group] {
                        let p = Motion.easeInOut.value(at: elapsed / (Motion.durPanel * 1000))
                        let previousOffset = before.frame.minY - previousBox.top
                        let nextOffset = target.frame.minY - targetBox.top
                        line.frame.origin.y = box.top + previousOffset + (nextOffset - previousOffset) * p
                        line.alpha = before.alpha + (1 - before.alpha) * p
                    }
                } else if let before = old[key] {
                    let p = Motion.easeInOut.value(at: elapsed / (Motion.durPanel * 1000))
                    line.frame.origin.y = before.frame.minY + (target.frame.minY - before.frame.minY) * p
                    line.alpha = before.alpha + (1 - before.alpha) * p
                } else {
                    line.alpha = Motion.easeOut.value(at: elapsed / (Motion.durPop * 1000))
                }
                now[key] = line
            }
            for (key, before) in old where fresh[key] == nil {
                var line = before
                let start = direction == nil ? 0 : RelayPlan.leaveAt(plan.leave[key] ?? 0)
                let ms = direction == nil ? Motion.durExit * 1000 : RelayPlan.outMs
                let p = Motion.easeOut.value(at: (elapsed - start) / ms)
                line.alpha = before.alpha * (1 - p)
                if let direction {
                    line.frame.origin.x -= direction * RelayPlan.travel * p
                    if let box = nowBoxes[before.group], let original = oldBoxes[before.group] {
                        line.frame.origin.y += box.top - original.top
                    }
                }
                now[key] = line
            }
            draw(now, boxes: nowBoxes)
            return true
        }
    }

    private func place(_ groups: [Group]) -> ([String: Placed], [String: Box]) {
        var lines: [String: Placed] = [:]
        var boxes: [String: Box] = [:]
        var y = 0.0
        for group in groups.sorted(by: { ($0.order, $0.id) < ($1.order, $1.id) }) {
            let top = y
            y += group.gap
            for item in [group.head].compactMap(\.self) + group.rows + [group.more].compactMap(\.self) {
                y += item.gap
                item.view.translatesAutoresizingMaskIntoConstraints = true
                let size = item.view.systemLayoutSizeFitting(CGSize(width: bounds.width, height: 0),
                                                             withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
                lines[item.key] = Placed(group: group.id, view: item.view,
                                         frame: CGRect(x: 0, y: y, width: bounds.width, height: size.height), alpha: 1)
                y += size.height
            }
            boxes[group.id] = Box(top: top, height: y - top)
        }
        return (lines, boxes)
    }

    private func draw(_ lines: [String: Placed], boxes: [String: Box]) {
        drawn = lines
        self.boxes = boxes
        for (_, line) in lines {
            line.view.frame = line.frame
            line.view.alpha = line.alpha
        }
        height.constant = boxes.values.reduce(0) { $0 + $1.height }
        window?.layoutIfNeeded()
    }

    private func land(_ lines: [String: Placed], boxes: [String: Box]) {
        for (key, old) in drawn where lines[key] == nil { old.view.removeFromSuperview() }
        for (key, line) in lines {
            if line.view.superview !== self { addSubview(line.view) }
            line.view.isUserInteractionEnabled = true
            if accessible[key] == nil { accessible[key] = line.view.isAccessibilityElement }
            line.view.isAccessibilityElement = accessible[key]!
            line.view.accessibilityElementsHidden = false
        }
        draw(lines, boxes: boxes)
    }
}
