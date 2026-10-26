import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// What the project's tasks made (ViewMade.svelte; PRD §5.3, outputs into
/// assets): each task with outputs, most recently changed first, as a tile
/// headed by the task (its id, title and stage, which opens it) over its
/// outputs drawn small by kind (TaskOutputView). The tiles stand in as many
/// columns of at least 18rem as the width holds (`auto-fill`), each at its
/// own height. A tile keeps its outputs while the list moves: a player or a
/// read file is never drawn twice.
final class MadePane: UIView {
    var onOpenTask: (String) -> Void = { _ in }

    private let hub: HubConnection
    private let projectId: String
    private let scroll = UIScrollView()
    private let rows = UIStackView()
    private var tiles: [String: MadeTile] = [:]
    private var laid = ""
    private var tasks: [TaskSummary] = []
    private var edges: [NSLayoutConstraint] = []
    private var leading = 0.0
    private var trailing = 0.0

    init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scroll)
        rows.axis = .vertical
        rows.spacing = Space.space3
        rows.alignment = .fill
        rows.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(rows)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
        ])
        accessibilityLabel = Words.Made.tab
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MadePane is built in code")
    }

    func inset(leading: Double, trailing: Double) {
        self.leading = leading
        self.trailing = trailing
        NSLayoutConstraint.deactivate(edges)
        edges = [
            rows.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: leading),
            rows.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(edges)
        laid = ""
        setNeedsLayout()
    }

    func show(_ tasks: [TaskSummary]) {
        self.tasks = tasks.filter { !$0.outputs.isEmpty }.sorted { $0.updatedAt > $1.updatedAt }
        lay()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        lay()
    }

    /// `repeat(auto-fill, minmax(18rem, 1fr))`, `space-3` apart, each tile at its own height.
    private func lay() {
        let width = bounds.width - leading - trailing
        guard width > 0 else { return }
        let gap = Space.space3
        let columns = max(1, Int((width + gap) / (288 + gap)))
        for task in tasks {
            let tile = tiles[task.id] ?? MadeTile(hub: hub, projectId: projectId)
            tiles[task.id] = tile
            tile.onOpen = { [weak self] in self?.onOpenTask(task.id) }
            tile.onDrawn = { [weak self] in self?.say() }
            tile.show(task)
        }
        let ids = Set(tasks.map(\.id))
        for (id, tile) in tiles where !ids.contains(id) {
            tile.removeFromSuperview()
            tiles[id] = nil
        }
        let key = "\(columns)|" + tasks.map(\.id).joined(separator: ",")
        guard key != laid else { return }
        laid = key
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for start in stride(from: 0, to: tasks.count, by: columns) {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = gap
            row.alignment = .top
            row.distribution = .fillEqually
            for task in tasks[start ..< min(start + columns, tasks.count)] {
                if let tile = tiles[task.id] { row.addArrangedSubview(tile) }
            }
            // Room left at a row's end stays empty.
            for _ in row.arrangedSubviews.count ..< columns { row.addArrangedSubview(UIView()) }
            rows.addArrangedSubview(row)
        }
    }


    #if DEBUG
    private var said = ""
    #endif
}

/// One task's tile (`.tile`): the band surface inside a hairline, `radius-lg`,
/// `space-2` in; its head a press that opens the task, then its outputs.
private final class MadeTile: UIView {
    var onOpen: () -> Void = {}
    /// One of its outputs drew its body.
    var onDrawn: () -> Void = {}

    private let hub: HubConnection
    private let projectId: String
    private let head = UIControl()
    private let number = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let stage = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let you = GlyphView(.attention, size: Size.iconSm, tint: Palette.statusAttnGlyph)
    private let outputs = UIStackView()
    private var views: [String: TaskOutputView] = [:]
    private var taskId = ""

    init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceBand
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        number.setContentCompressionResistancePriority(.required, for: .horizontal)
        let stageRow = UIStackView(arrangedSubviews: [you, stage])
        stageRow.spacing = Space.space1
        stageRow.alignment = .center
        stageRow.setContentCompressionResistancePriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [number, title, stageRow])
        line.spacing = Space.space2
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        head.addSubview(line)
        head.layer.cornerRadius = Radius.radiusSm
        head.layer.cornerCurve = .continuous
        head.isAccessibilityElement = true
        head.accessibilityTraits = .link
        head.addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        head.addAction(UIAction { [weak self] _ in self?.press(true) }, for: [.touchDown, .touchDragEnter])
        head.addAction(UIAction { [weak self] _ in self?.press(false) }, for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
        head.addInteraction(UIPointerInteraction(delegate: nil))
        NSLayoutConstraint.activate([
            head.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm),
            line.leadingAnchor.constraint(equalTo: head.leadingAnchor, constant: Space.space2),
            line.trailingAnchor.constraint(equalTo: head.trailingAnchor, constant: -Space.space2),
            line.centerYAnchor.constraint(equalTo: head.centerYAnchor),
            line.topAnchor.constraint(greaterThanOrEqualTo: head.topAnchor),
        ])
        outputs.axis = .vertical
        outputs.spacing = Space.space2
        let column = UIStackView(arrangedSubviews: [head, outputs])
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (tile: MadeTile, _: UITraitCollection) in tile.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MadeTile is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// `.press-tint`: surface-fill at night, the stronger step by day.
    private func press(_ held: Bool) {
        let dark = traitCollection.userInterfaceStyle == .dark
        head.backgroundColor = held ? (dark ? Palette.surfaceFill : Palette.surfaceFillStrong) : .clear
    }

    func show(_ task: TaskSummary) {
        taskId = task.id
        number.text = task.id
        title.text = task.title
        let waits = task.kind == .you
        you.isHidden = !waits
        stage.text = TaskWords.stage(task.stage)
        stage.ink = waits ? Palette.statusAttnInk : Palette.inkMuted
        head.accessibilityLabel = "\(task.id), \(task.title), \(TaskWords.stage(task.stage))"
        // Its outputs in the task's order, each kept while it stays listed.
        let paths = task.outputs
        if outputs.arrangedSubviews.count != paths.count || paths.contains(where: { views[$0] == nil }) {
            outputs.arrangedSubviews.forEach { $0.removeFromSuperview() }
            for path in paths {
                let view = views[path] ?? TaskOutputView(hub: hub, projectId: projectId, taskId: task.id, path: path)
                view.onDrawn = { [weak self] in self?.onDrawn() }
                views[path] = view
                outputs.addArrangedSubview(view)
            }
            for path in views.keys where !paths.contains(path) { views[path] = nil }
        }
        for view in views.values { view.show(version: task.updatedAt) }
    }

}
