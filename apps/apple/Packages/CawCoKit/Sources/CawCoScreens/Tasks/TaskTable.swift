import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The table view (tasks/TaskTable.svelte): the same tasks as a ledger — id,
/// title, stage, labels, to-dos, and when the task was created and last
/// updated — in stage order, then the board's own order inside a stage,
/// until Created or Updated is picked to sort by (newest first, then oldest,
/// then back to stage order). Labels and To-dos stand only while some task
/// has one; Created only while the ledger is 900pt wide or more. A row opens
/// the task. Under 640pt of window each row is the board's two-line card:
/// the title, then id · stage · to-dos · updated, and the header goes.
final class TaskTableView: UIView {
    enum Sort: Equatable {
        case created(descending: Bool), updated(descending: Bool)
    }

    private let card = TileView(radius: Radius.radiusLg)
    private let stack = UIStackView()
    private(set) var sort: Sort?
    var onOpen: (String) -> Void = { _ in }

    private var stages: [TaskStage] = []
    private var tasks: [TaskSummary] = []
    private var clock: Timer?

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        card.clipsToBounds = false
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.layer.cornerRadius = Radius.radiusLg
        stack.layer.cornerCurve = .continuous
        stack.clipsToBounds = true
        card.addSubview(stack)
        addSubview(card)
        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: topAnchor),
            card.bottomAnchor.constraint(equalTo: bottomAnchor),
            card.leadingAnchor.constraint(equalTo: leadingAnchor),
            card.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: card.topAnchor),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskTableView is built in code")
    }

    func show(stages: [TaskStage], tasks: [TaskSummary]) {
        self.stages = stages
        self.tasks = tasks
        render()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        clock?.invalidate()
        clock = nil
        guard window != nil else { return }
        // Re-read once a minute, so an age does not go stale on an open page.
        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.render() }
        }
    }

    private var drawnShape = ""

    override func layoutSubviews() {
        super.layoutSubviews()
        let shape = "\(phone):\(full)"
        if shape != drawnShape { render() }
    }

    /// Under 640pt of window: the rows are cards.
    private var phone: Bool { Double(window?.bounds.width ?? bounds.width) < 640 }
    /// The ledger is 900pt wide or more: Created stands.
    private var full: Bool { bounds.width >= 900 }

    /// Stage order, then the hub's (rank, then number); a stray stage last; or the sort picked.
    private var rows: [TaskSummary] {
        let order = Dictionary(stages.enumerated().map { ($1.name, $0) }, uniquingKeysWith: { first, _ in first })
        let staged = tasks.enumerated().sorted { a, b in
            let left = order[a.element.stage] ?? stages.count, right = order[b.element.stage] ?? stages.count
            return left != right ? left < right : a.offset < b.offset
        }.map(\.element)
        switch sort {
        case nil: return staged
        case let .created(descending): return staged.sorted { descending ? $0.createdAt > $1.createdAt : $0.createdAt < $1.createdAt }
        case let .updated(descending): return staged.sorted { descending ? $0.updatedAt > $1.updatedAt : $0.updatedAt < $1.updatedAt }
        }
    }

    /// A time column's head: newest first on the first pick, then oldest, then back to stage order.
    private func toggle(created: Bool) {
        switch (sort, created) {
        case (.created(true), true): sort = .created(descending: false)
        case (.created(false), true): sort = nil
        case (_, true): sort = .created(descending: true)
        case (.updated(true), false): sort = .updated(descending: false)
        case (.updated(false), false): sort = nil
        case (_, false): sort = .updated(descending: true)
        }
        render()
    }

    private func render() {
        drawnShape = "\(phone):\(full)"
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let labelled = tasks.contains { !$0.labels.isEmpty }
        let planned = tasks.contains { $0.todos.total > 0 }
        let now = Date.now.timeIntervalSince1970 * 1000
        if !phone { stack.addArrangedSubview(header(labelled: labelled, planned: planned)) }
        let shown = rows
        for (index, task) in shown.enumerated() {
            let row = phone ? cardRow(task, now: now) : ledgerRow(task, labelled: labelled, planned: planned, now: now)
            row.addAction(UIAction { [weak self] _ in self?.onOpen(task.id) }, for: .touchUpInside)
            row.rule.isHidden = index == shown.count - 1
            stack.addArrangedSubview(row)
        }
    }

    // MARK: The wide ledger

    private static let idWidth = 104.0
    private static let stageWidth = 192.0
    private static let labelsWidth = 224.0
    private static let todosWidth = 96.0
    private static let timeWidth = 112.0

    private func header(labelled: Bool, planned: Bool) -> UIView {
        let band = UIStackView()
        band.backgroundColor = Palette.surfaceBand
        band.alignment = .center
        band.isLayoutMarginsRelativeArrangement = true
        band.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
        band.heightAnchor.constraint(equalToConstant: Size.cToolbarCtl).isActive = true
        func head(_ text: String, width: Double?, end: Bool = false) -> UIView {
            let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, tracking: TypeScale.trackCaps)
            label.text = text.uppercased()
            label.accessibilityLabel = text
            label.textAlignment = end ? .right : .natural
            return cell(label, width: width)
        }
        func sorter(_ text: String, created: Bool) -> UIView {
            let state: Bool? = switch sort {
            case let .created(descending) where created: descending
            case let .updated(descending) where !created: descending
            default: nil
            }
            let glyph: Glyph? = state.map { $0 ? .chevronDown : .chevronUp }
            var config = UIButton.Configuration.plain()
            config.attributedTitle = AttributedString(text.uppercased(), attributes: TypeScale.typeLabel.container(color: Palette.inkMuted, tracking: TypeScale.trackCaps))
            config.image = glyph?.image.resized(to: Size.iconSm)
            config.imagePlacement = .trailing
            config.imagePadding = Space.space1
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
            config.contentInsets = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space1, bottom: Space.space1, trailing: Space.space1)
            config.background.cornerRadius = Radius.radiusSm
            let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.toggle(created: created) })
            button.accessibilityLabel = "Sort by \(text.lowercased())"
            button.accessibilityValue = state.map { $0 ? "newest first" : "oldest first" }
            button.contentHorizontalAlignment = .trailing
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cToolbarCtl).isActive = true
            return cell(button, width: Self.timeWidth, end: true)
        }
        band.addArrangedSubview(head("Id", width: Self.idWidth))
        band.addArrangedSubview(head("Task", width: nil))
        band.addArrangedSubview(head("Stage", width: Self.stageWidth))
        if labelled { band.addArrangedSubview(head("Labels", width: Self.labelsWidth)) }
        if planned { band.addArrangedSubview(head("To-dos", width: Self.todosWidth)) }
        if full { band.addArrangedSubview(sorter("Created", created: true)) }
        band.addArrangedSubview(sorter("Updated", created: false))
        return band
    }

    /// A cell `space-3` in from each side; `width` nil takes what is left.
    private func cell(_ content: UIView, width: Double?, end: Bool = false) -> UIView {
        let holder = UIView()
        holder.isUserInteractionEnabled = content is UIButton
        content.translatesAutoresizingMaskIntoConstraints = false
        holder.addSubview(content)
        var pins = [
            content.leadingAnchor.constraint(greaterThanOrEqualTo: holder.leadingAnchor, constant: Space.space3),
            content.trailingAnchor.constraint(lessThanOrEqualTo: holder.trailingAnchor, constant: -Space.space3),
            content.centerYAnchor.constraint(equalTo: holder.centerYAnchor),
            content.topAnchor.constraint(greaterThanOrEqualTo: holder.topAnchor),
            content.bottomAnchor.constraint(lessThanOrEqualTo: holder.bottomAnchor),
            (end ? content.trailingAnchor.constraint(equalTo: holder.trailingAnchor, constant: -Space.space3)
                : content.leadingAnchor.constraint(equalTo: holder.leadingAnchor, constant: Space.space3)),
        ]
        if let width {
            pins.append(holder.widthAnchor.constraint(equalToConstant: width))
            holder.setContentHuggingPriority(.required, for: .horizontal)
        } else {
            holder.setContentHuggingPriority(.init(1), for: .horizontal)
            holder.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        }
        NSLayoutConstraint.activate(pins)
        return holder
    }

    private func ledgerRow(_ task: TaskSummary, labelled: Bool, planned: Bool, now: Double) -> TaskTableRow {
        let row = TaskTableRow()
        let line = UIStackView()
        line.alignment = .fill
        let id = KitLabel(TypeScale.typeCode, ink: Palette.inkSubtle)
        id.text = task.id
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        title.text = task.title
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        line.addArrangedSubview(cell(id, width: Self.idWidth))
        line.addArrangedSubview(cell(title, width: nil))
        line.addArrangedSubview(cell(stageMark(task), width: Self.stageWidth))
        if labelled {
            let labels = UIStackView(arrangedSubviews: task.labels.map { KitBadge($0, variant: .secondary) })
            labels.spacing = Space.space1
            labels.clipsToBounds = true
            line.addArrangedSubview(cell(labels, width: Self.labelsWidth))
        }
        if planned { line.addArrangedSubview(cell(todos(task) ?? UIView(), width: Self.todosWidth)) }
        if full { line.addArrangedSubview(cell(age(task.createdAt, now: now), width: Self.timeWidth, end: true)) }
        line.addArrangedSubview(cell(age(task.updatedAt, now: now), width: Self.timeWidth, end: true))
        row.hold(line, padded: false)
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        row.accessibilityLabel = said(task, now: now)
        return row
    }

    // MARK: The phone's cards

    private func cardRow(_ task: TaskSummary, now: Double) -> TaskTableRow {
        let row = TaskTableRow()
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        title.text = task.title
        title.lineBreakMode = .byTruncatingTail
        let id = KitLabel(TypeScale.typeCode, ink: Palette.inkSubtle)
        id.text = task.id
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        var under: [UIView] = [id, stageMark(task)]
        if let todos = todos(task) { under.append(todos) }
        under += [rest, age(task.updatedAt, now: now)]
        let meta = UIStackView(arrangedSubviews: under)
        meta.spacing = Space.space2
        meta.alignment = .center
        let lines = UIStackView(arrangedSubviews: [title, meta])
        lines.axis = .vertical
        lines.spacing = Space.space1
        row.hold(lines, padded: true)
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        row.accessibilityLabel = said(task, now: now)
        return row
    }

    // MARK: Cells

    private func stageMark(_ task: TaskSummary) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = TaskWords.stage(task.stage)
        name.lineBreakMode = .byTruncatingTail
        let mark = UIStackView(arrangedSubviews: [name])
        mark.spacing = Space.space1
        mark.alignment = .center
        if task.kind == .you { mark.insertArrangedSubview(GlyphView(.attention, size: Size.iconSm, tint: Palette.statusAttnGlyph), at: 0) }
        return mark
    }

    private func todos(_ task: TaskSummary) -> UIView? {
        let total = Int(task.todos.total), done = Int(task.todos.done)
        guard total > 0 else { return nil }
        let ring = TaskRingView(size: .sm)
        ring.configure(done: done, total: total)
        let count = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        count.tabular = true
        count.text = "\(done)/\(total)"
        let both = UIStackView(arrangedSubviews: [ring, count])
        both.spacing = Space.space1
        both.alignment = .center
        return both
    }

    private func age(_ at: Double, now: Double) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.tabular = true
        label.text = RailAge.short(at, now: now)
        label.textAlignment = .right
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        return label
    }

    private func said(_ task: TaskSummary, now: Double) -> String {
        var parts = [task.title, task.id, TaskWords.stage(task.stage)]
        if task.todos.total > 0 { parts.append("\(Int(task.todos.done)) of \(Int(task.todos.total)) to-dos done") }
        parts.append("updated \(RailAge.ago(task.updatedAt, now: now))")
        return parts.joined(separator: ", ")
    }
}

/// One row of the ledger: the task's link, its whole width; a hairline under it but the last.
final class TaskTableRow: UIControl {
    let rule = UIView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rule)
        NSLayoutConstraint.activate([
            rule.leadingAnchor.constraint(equalTo: leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: trailingAnchor),
            rule.bottomAnchor.constraint(equalTo: bottomAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskTableRow is built in code")
    }

    /// `padded`: the phone's card row, `space-2 space-3` in.
    func hold(_ content: UIView, padded: Bool) {
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        insertSubview(content, belowSubview: rule)
        let vertical = padded ? Space.space2 : 0, horizontal = padded ? Space.space3 : 0
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: topAnchor, constant: vertical),
            content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -vertical),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: horizontal),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -horizontal),
        ])
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }
}

/// The pipeline view (views/ViewPipeline.svelte): one recessed row per
/// stage, in the stages file's order, with its name, its kind, a bar sized
/// by its share of the largest stage, and its count. The `you` row takes the
/// brand wash and a brand bar; done bars take the done pair; dropped stages
/// sit apart under a dashed hairline, quiet, their bars outlined. Widths
/// ease over `durPop` on the out curve.
final class PipelineView: UIStackView {
    private var bars: [String: PipelineBar] = [:]

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("PipelineView is built in code")
    }

    private var drawn: [String] = []
    private var phone = false

    func show(stages: [TaskStage], tasks: [TaskSummary], phone: Bool) {
        var counts: [String: Int] = [:]
        for task in tasks { counts[task.stage, default: 0] += 1 }
        let most = max(1, counts.values.max() ?? 0)
        let shape = stages.map { "\($0.name):\($0.kind.rawValue)" }
        if shape != drawn || phone != self.phone {
            drawn = shape
            self.phone = phone
            arrangedSubviews.forEach { $0.removeFromSuperview() }
            bars = [:]
            let open = stages.filter { $0.kind != .dropped }
            let dropped = stages.filter { $0.kind == .dropped }
            addArrangedSubview(rows(open, phone: phone))
            if !dropped.isEmpty {
                let apart = UIStackView(arrangedSubviews: [DashedRule(), rows(dropped, phone: phone)])
                apart.axis = .vertical
                apart.spacing = Space.space3
                addArrangedSubview(apart)
            }
        }
        for stage in stages {
            bars[stage.name]?.set(count: counts[stage.name] ?? 0, of: most)
        }
    }

    private func rows(_ stages: [TaskStage], phone: Bool) -> UIStackView {
        let list = UIStackView(arrangedSubviews: stages.map { stage in
            let bar = PipelineBar(stage: stage, phone: phone)
            bars[stage.name] = bar
            return bar
        })
        list.axis = .vertical
        list.spacing = Space.space1
        return list
    }
}

/// One stage's row: name, kind, track and count; under 640pt the name and
/// count on a line and the track under them.
private final class PipelineBar: UIView {
    private let track = UIView()
    private let bar = UIView()
    private let count = MorphLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let kind: Components.Schemas.StageKind
    private let name: String
    private var share = 0.0
    private let dash = CAShapeLayer()

    init(stage: TaskStage, phone: Bool) {
        kind = stage.kind
        name = TaskWords.stage(stage.name)
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        backgroundColor = kind == .you ? Palette.brandWash : Palette.surfaceRecess

        let label = KitLabel(TypeScale.typeLabel, ink: kind == .you ? Palette.brandInk : (kind == .dropped ? Palette.inkMuted : Palette.inkStrong))
        label.text = name
        label.lineBreakMode = .byTruncatingTail
        let nameRow = UIStackView(arrangedSubviews: [label])
        nameRow.spacing = Space.space1
        nameRow.alignment = .center
        if kind == .you { nameRow.insertArrangedSubview(GlyphView(.attention, size: Size.iconSm, tint: Palette.statusAttnGlyph), at: 0) }
        let kindLabel = KitLabel(TypeScale.typeCode, ink: Palette.inkSubtle)
        kindLabel.text = TaskWords.kind(kind)
        count.tabular = true

        track.translatesAutoresizingMaskIntoConstraints = false
        track.heightAnchor.constraint(equalToConstant: 8).isActive = true
        bar.layer.cornerRadius = 4
        bar.backgroundColor = switch kind {
        case .you: Palette.brandSolid
        case .done: Palette.statusDoneBg
        case .dropped: .clear
        default: Palette.borderControl
        }
        if kind == .dropped {
            dash.fillColor = nil
            dash.lineWidth = 1
            dash.lineDashPattern = [3, 3]
            bar.layer.addSublayer(dash)
        }
        track.addSubview(bar)

        let content: UIStackView
        if phone {
            let top = UIStackView(arrangedSubviews: [nameRow, UIView(), count])
            top.alignment = .center
            content = UIStackView(arrangedSubviews: [top, track])
            content.axis = .vertical
            content.spacing = Space.space1
        } else {
            nameRow.widthAnchor.constraint(equalToConstant: 160).isActive = true
            kindLabel.widthAnchor.constraint(equalToConstant: 96).isActive = true
            count.widthAnchor.constraint(equalToConstant: 48).isActive = true
            content = UIStackView(arrangedSubviews: [nameRow, kindLabel, track, count])
            content.spacing = Space.space3
            content.alignment = .center
        }
        content.isLayoutMarginsRelativeArrangement = true
        let vertical = phone ? Space.space2 : 0
        content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: vertical, leading: Space.space3, bottom: vertical, trailing: Space.space3)
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: topAnchor),
            content.bottomAnchor.constraint(equalTo: bottomAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
        ])
        isAccessibilityElement = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (row: PipelineBar, _: UITraitCollection) in row.setNeedsLayout() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PipelineBar is built in code")
    }

    func set(count value: Int, of most: Int) {
        count.text = "\(value)"
        accessibilityLabel = "\(name), \(TaskWords.kind(kind)), \(value) \(value == 1 ? "task" : "tasks")"
        let next = Double(value) / Double(most)
        guard next != share else { return }
        share = next
        setNeedsLayout()
        if window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durPop) { self.layoutIfNeeded() }.startAnimation()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // `min-inline-size: 2px`.
        bar.frame = CGRect(x: 0, y: 0, width: max(2, track.bounds.width * share), height: track.bounds.height)
        dash.frame = bar.bounds
        dash.path = UIBezierPath(roundedRect: bar.bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 3.5).cgPath
        dash.strokeColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }
}

/// `border-block-start: 1px dashed var(--border-hairline)`.
private final class DashedRule: UIView {
    private let line = CAShapeLayer()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 1).isActive = true
        line.lineWidth = 1
        line.lineDashPattern = [3, 3]
        layer.addSublayer(line)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DashedRule is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 0, y: 0.5))
        path.addLine(to: CGPoint(x: bounds.width, y: 0.5))
        line.path = path.cgPath
        line.strokeColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}
