import CawCoCore
import CawCoDesign
import UIKit

// A project home's session rows (LiveSessionRow.svelte, StoredSessionRow.svelte)
// and the list that keeps them: every row is made once and updated in place.

/// What a live row says, read from the fleet: compared before it is drawn.
struct LiveRowModel: Equatable {
    var id: String
    var title: String
    var status: MarkStatus
    /// The status's word for the row's name (`statusWord`): "Stopped" for one the operator ended.
    var word: String
    /// Where it runs, for the mark's hue.
    var place: String
    /// Asleep or unreachable: the mark steps back.
    var dim: Bool
    var quest: Bool
    var leaf: Bool
    /// The path, where it is not the card's own and the page is wide enough.
    var cwd: String?
    /// Failed, or waiting on the operator: the row's wash.
    var alarmed: Bool
    var done: Int?
    var total: Int?
    /// Working with no plan to measure: the turning arc's stand-in and a time.
    var unmeasured: Bool
    var pulseAt: Double?
    var toolName: String?
    var toolGlance: String?
    var hint: String?
    var hue: Double
}

/// One live session: its mark with the state's rim, its title, a side
/// quest's and a leaf's badge, where it runs, and at the row's end how far
/// its plan has got or how long it has been on this step; under it, while it
/// works, the tool it is in.
final class LiveSessionRowView: RailRow, UIToolTipInteractionDelegate {
    private let mark = SessionMarkView(tile: 20)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.foreground)
    private let quest = KitBadge("side quest", variant: .secondary)
    private let leaf = KitBadge("leaf", variant: .outline)
    private let path = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeLabel.points), ink: Palette.mutedForeground)
    private let ring = TaskRingView(size: .sm)
    private let figure = MorphLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private let meter = UIStackView()
    private let toolName = MorphLabel(TypeScale.typeLabel, ink: Palette.mutedForeground)
    private let toolGlance = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeLabel.points), ink: Palette.mutedForeground)
    private let toolLine = UIStackView()
    private(set) var model: LiveRowModel?

    init() {
        // `px-4`.
        super.init(height: nil, leading: 16, trailing: 16, gap: 0)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        // The path yields before the title does, and gives up from the left: the leaf tells two checkouts apart.
        path.lineBreakMode = .byTruncatingHead
        path.setContentCompressionResistancePriority(.defaultLow - 10, for: .horizontal)
        path.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        let pathFloor = path.widthAnchor.constraint(greaterThanOrEqualToConstant: 96)
        pathFloor.priority = .defaultLow - 5
        figure.tabular = true
        meter.addArrangedSubview(ring)
        meter.addArrangedSubview(figure)
        meter.spacing = 6
        meter.alignment = .center
        meter.setContentHuggingPriority(.required, for: .horizontal)
        meter.setContentCompressionResistancePriority(.required, for: .horizontal)
        for badge in [quest, leaf] {
            badge.setContentCompressionResistancePriority(.required, for: .horizontal)
            badge.setContentHuggingPriority(.required, for: .horizontal)
        }
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        // `gap-3` between what the row says; the meter stands at its end (`ml-auto`), a gap clear of it.
        let says = UIStackView(arrangedSubviews: [mark, title, quest, leaf, path])
        says.spacing = Space.space3
        says.alignment = .center
        let first = UIStackView(arrangedSubviews: [says, rest, meter])
        first.setCustomSpacing(Space.space3, after: rest)
        first.alignment = .center

        toolGlance.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let toolRest = UIView()
        toolRest.setContentHuggingPriority(.init(1), for: .horizontal)
        toolLine.addArrangedSubview(toolName)
        toolLine.addArrangedSubview(toolGlance)
        toolLine.addArrangedSubview(toolRest)
        toolLine.spacing = Space.space2
        toolLine.alignment = .firstBaseline
        toolLine.isLayoutMarginsRelativeArrangement = true
        // `pl-8`: under the title, past the mark's column.
        toolLine.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 32, bottom: 0, trailing: 0)
        toolLine.isHidden = true

        let lines = UIStackView(arrangedSubviews: [first, toolLine])
        lines.axis = .vertical
        lines.spacing = 2
        let slack = UIView()
        slack.setContentHuggingPriority(.init(1), for: .horizontal)
        content.addArrangedSubview(lines)
        content.addArrangedSubview(slack)
        // What it says stops at a scannable measure (`max-w-3xl`); the band is the card's width.
        let measure = lines.widthAnchor.constraint(equalToConstant: 768)
        measure.priority = .defaultHigh - 10
        let rowHeight = heightAnchor.constraint(equalToConstant: 36)
        rowHeight.priority = .defaultLow
        NSLayoutConstraint.activate([
            measure, pathFloor, rowHeight,
            lines.widthAnchor.constraint(lessThanOrEqualToConstant: 768),
            title.widthAnchor.constraint(lessThanOrEqualToConstant: 576),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
            content.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 6),
            content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -6),
        ])
        let hint = UIToolTipInteraction()
        hint.delegate = self
        addInteraction(hint)
    }

    func configure(_ next: LiveRowModel, now: Double) {
        let first = model == nil
        defer { tick(now) }
        guard next != model else { return }
        let old = model
        model = next
        // One line (`truncate`): a title's line breaks are spaces.
        title.text = next.title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        mark.configure(id: next.id, place: next.place, status: next.status)
        mark.alpha = next.dim ? 0.6 : 1
        quest.isHidden = !next.quest
        leaf.isHidden = !next.leaf
        path.isHidden = next.cwd == nil
        path.text = next.cwd
        restFill = next.alarmed ? Palette.error.withAlphaComponent(0.1) : .clear
        ring.tintColor = IdentityInk.color(hue: next.hue)
        ring.configure(done: next.done ?? 0, total: next.total ?? 0, indeterminate: next.total == nil && next.unmeasured)
        let metered = next.total != nil || next.unmeasured
        let tooled = next.toolName != nil
        toolName.text = next.toolName ?? toolName.text
        toolGlance.text = next.toolGlance ?? toolGlance.text
        accessibilityLabel = "\(next.word): \(next.title)"
        // The meter and the tool's line fade in and out as a whole (`crossIn`).
        let wasMetered = old.map { $0.total != nil || $0.unmeasured } ?? false
        let wasTooled = old?.toolName != nil
        guard !first, window != nil, metered != wasMetered || tooled != wasTooled else {
            meter.isHidden = !metered
            meter.alpha = metered ? 1 : 0
            toolLine.isHidden = !tooled
            toolLine.alpha = tooled ? 1 : 0
            return
        }
        Motion.easeOut.animator(Motion.durControl) {
            self.meter.isHidden = !metered
            self.meter.alpha = metered ? 1 : 0
            self.toolLine.isHidden = !tooled
            self.toolLine.alpha = tooled ? 1 : 0
            self.superview?.layoutIfNeeded()
        }.startAnimation()
    }

    /// The figure beside the ring: the plan's count, else the time on this step, once a second.
    func tick(_ now: Double) {
        guard let model else { return }
        if let total = model.total {
            figure.text = "\(model.done ?? 0)/\(total)"
        } else if model.unmeasured, let at = model.pulseAt {
            // The daemon stamps the pulse from its own clock: never a run that started in the future.
            figure.text = Self.duration(max(0, now - at))
        } else {
            figure.text = ""
        }
    }

    /// time.ts `formatDuration`.
    static func duration(_ ms: Double) -> String {
        let seconds = Int(ms / 1000), minutes = seconds / 60, hours = minutes / 60, days = hours / 24
        if days > 0 { return "\(days)d \(hours % 24)h" }
        if hours > 0 { return "\(hours)h \(minutes % 60)m" }
        if minutes > 0 { return "\(minutes)m \(seconds % 60)s" }
        return "\(seconds)s"
    }

    /// The row's hints, each where the web's `title` sits: the path over the
    /// path, the leaf's meaning over its badge, what the ring is timing over
    /// the meter, and why the row is failed, asleep or unreachable elsewhere.
    func toolTipInteraction(_: UIToolTipInteraction, configurationAt point: CGPoint) -> UIToolTipConfiguration? {
        guard let model else { return nil }
        func over(_ view: UIView) -> CGRect? {
            let box = view.convert(view.bounds, to: self)
            return !view.isHidden && box.contains(point) ? box : nil
        }
        if let box = over(path), let cwd = model.cwd { return UIToolTipConfiguration(toolTip: cwd, in: box) }
        if let box = over(leaf) { return UIToolTipConfiguration(toolTip: "Spawned with can_delegate=false — it cannot delegate or start sessions", in: box) }
        if let box = over(meter), model.total == nil, model.unmeasured {
            let time = figure.text
            return UIToolTipConfiguration(toolTip: time.isEmpty ? "Working — no task plan" : "Working — no task plan; \(time) on this step", in: box)
        }
        return model.hint.map { UIToolTipConfiguration(toolTip: $0) }
    }
}

struct StoredRowModel: Equatable {
    var id: String
    var title: String
    var place: String
    var cwd: String?
    var age: String
}

/// One stored session: its own sprite on its place's hue where a live row
/// carries its state, its title, where it ran, and when it last changed.
final class StoredSessionRowView: RailRow, UIToolTipInteractionDelegate {
    private let mark = SessionMarkView(tile: 20)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.foreground)
    private let path = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeLabel.points), ink: Palette.mutedForeground)
    private let age = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private var model: StoredRowModel?

    init() {
        // `px-4`.
        super.init(height: nil, leading: 16, trailing: 16, gap: 0)
        mark.alpha = 0.6
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        path.lineBreakMode = .byTruncatingHead
        path.setContentCompressionResistancePriority(.defaultLow - 10, for: .horizontal)
        path.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        let pathFloor = path.widthAnchor.constraint(greaterThanOrEqualToConstant: 96)
        pathFloor.priority = .defaultLow - 5
        age.tabular = true
        age.setContentHuggingPriority(.required, for: .horizontal)
        age.setContentCompressionResistancePriority(.required, for: .horizontal)
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        let says = UIStackView(arrangedSubviews: [mark, title, path])
        says.spacing = Space.space3
        says.alignment = .center
        let line = UIStackView(arrangedSubviews: [says, rest, age])
        line.setCustomSpacing(Space.space3, after: rest)
        line.alignment = .center
        let slack = UIView()
        slack.setContentHuggingPriority(.init(1), for: .horizontal)
        content.addArrangedSubview(line)
        content.addArrangedSubview(slack)
        let measure = line.widthAnchor.constraint(equalToConstant: 768)
        measure.priority = .defaultHigh - 10
        let rowHeight = heightAnchor.constraint(equalToConstant: 36)
        rowHeight.priority = .defaultLow
        NSLayoutConstraint.activate([
            measure, pathFloor, rowHeight,
            line.widthAnchor.constraint(lessThanOrEqualToConstant: 768),
            title.widthAnchor.constraint(lessThanOrEqualToConstant: 512),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
            content.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 6),
            content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -6),
        ])
        let hint = UIToolTipInteraction()
        hint.delegate = self
        addInteraction(hint)
    }

    func configure(_ next: StoredRowModel) {
        guard next != model else { return }
        model = next
        title.text = next.title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        mark.configure(id: next.id, place: next.place, status: .idle)
        path.isHidden = next.cwd == nil
        path.text = next.cwd
        age.text = next.age
        accessibilityLabel = next.title
        accessibilityValue = next.age
    }

    func toolTipInteraction(_: UIToolTipInteraction, configurationAt point: CGPoint) -> UIToolTipConfiguration? {
        let box = path.convert(path.bounds, to: self)
        guard let cwd = model?.cwd, box.contains(point) else { return nil }
        return UIToolTipConfiguration(toolTip: cwd, in: box)
    }
}

/// A column of rows kept by id: a row is made once and stays the same view
/// while its session is listed. Rows that arrive open in place and ones that
/// leave close in place while the rest slide (motion/rows `reflow`), once the
/// list is `settled`; until then it only fills.
final class KeyedRows<Row: UIView>: UIStackView {
    private(set) var rows: [String: Row] = [:]
    private var order: [String] = []
    private var leaving = Set<ObjectIdentifier>()

    init(spacing: Double) {
        super.init(frame: .zero)
        axis = .vertical
        self.spacing = spacing
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KeyedRows is built in code")
    }

    /// Puts `ids` in the column in that order; `make` builds a row the first time its id is listed.
    func set(_ ids: [String], animated: Bool, in root: UIView?, make: (String) -> Row) {
        guard ids != order else { return }
        let listed = Set(ids)
        let gone = order.filter { !listed.contains($0) }.compactMap { rows.removeValue(forKey: $0) }
        var arrived: [Row] = []
        for id in ids where rows[id] == nil {
            let row = make(id)
            rows[id] = row
            arrived.append(row)
            if animated {
                row.isHidden = true
                row.alpha = 0
            }
            addArrangedSubview(row)
        }
        order = ids
        let place = {
            // Each row to its place, stepping over the ones on their way out.
            var at = 0
            for id in ids {
                guard let row = self.rows[id] else { continue }
                while at < self.arrangedSubviews.count, self.leaving.contains(ObjectIdentifier(self.arrangedSubviews[at])) { at += 1 }
                if at >= self.arrangedSubviews.count || self.arrangedSubviews[at] !== row { self.insertArrangedSubview(row, at: at) }
                at += 1
            }
        }
        guard animated, let root else {
            for row in gone {
                removeArrangedSubview(row)
                row.removeFromSuperview()
            }
            place()
            return
        }
        for row in gone { leaving.insert(ObjectIdentifier(row)) }
        UIView.performWithoutAnimation {
            place()
            root.layoutIfNeeded()
        }
        Reflow.travel(in: self) {
            for row in gone {
                row.isHidden = true
                row.alpha = 0
            }
            for row in arrived {
                row.isHidden = false
                row.alpha = 1
            }
            root.layoutIfNeeded()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durPanel) { [weak self] in
            for row in gone {
                self?.leaving.remove(ObjectIdentifier(row))
                self?.removeArrangedSubview(row)
                row.removeFromSuperview()
            }
        }
    }
}
