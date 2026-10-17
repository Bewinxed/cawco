import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

/// A session's plan (plan/PlanPane.svelte, PRD §5.2 "Every session's plan,
/// in a panel"), as the hub keeps it (`hub.plans`): its steps as a tree on
/// the app's nesting line, each ticked as it completes (the tick drawn along
/// its stroke) or breathing while it is under way; its spec, read-only,
/// whole, as running text; and on a task attempt the task's to-dos the same
/// way. One column; a part after the first is headed on a seam. The peek
/// and the plan's sheet draw it alike.
final class PlanView: UIStackView {
    private let hub: HubConnection
    private let instanceId: String
    private var drawn: SessionPlan?
    /// The steps ticked when last drawn: a step completing since draws its tick in.
    private var ticked: Set<String> = []
    /// Its height changed.
    var onResize: () -> Void = {}

    init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        translatesAutoresizingMaskIntoConstraints = false
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("PlanView is built in code") }

    /// The plan as the hub holds it now; read under the caller's observation.
    var plan: SessionPlan? { hub.plans.plans[instanceId] }

    /// Draws the plan when it changed.
    func refresh() {
        let plan = plan
        guard plan != drawn || arrangedSubviews.isEmpty else { return }
        drawn = plan
        draw(plan)
        onResize()
    }

    private func draw(_ plan: SessionPlan?) {
        arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard let plan else { return }
        let done = Set(plan.steps.filter { $0.status == "completed" }.map(\.id))
        let landing = done.subtracting(ticked)
        ticked = done
        let headed = plan.spec != nil || plan.showsTodos
        if !plan.steps.isEmpty {
            if headed { addPart(Self.head(Words.Plan.steps)) }
            addArrangedSubview(PlanTree(Self.tree(plan.steps.map { ($0.id, $0.depth, $0.status, $0.content) }), landing: landing))
        }
        if let spec = plan.spec {
            addPart(Self.head(Words.Plan.spec))
            let document = MarkdownDocumentView()
            document.setSource(spec)
            addArrangedSubview(document)
        }
        if plan.showsTodos, let taskId = plan.taskId {
            if !plan.onlyTodos { addPart(Self.head(Words.Plan.todos, ref: taskId)) }
            let todos = plan.todos.map { ($0.id, $0.depth, $0.done ? "completed" : "pending", $0.text) }
            addArrangedSubview(PlanTree(Self.tree(todos), landing: []))
        }
        #if DEBUG
        PreviewProbe.say("plan drawn \(instanceId) steps=\(plan.steps.map { "\($0.id):\($0.depth):\($0.status)" }.joined(separator: ",")) spec=\(plan.spec != nil) todos=\(plan.todos.count)")
        #endif
    }

    /// A part after the first starts on a seam: more room above its heading than below.
    private func addPart(_ head: UIView) {
        if let last = arrangedSubviews.last {
            setCustomSpacing(Space.space3, after: last)
            let seam = UIView()
            seam.backgroundColor = Palette.borderHairline
            seam.heightAnchor.constraint(equalToConstant: 1).isActive = true
            addArrangedSubview(seam)
            setCustomSpacing(Space.space4, after: seam)
        }
        addArrangedSubview(head)
    }

    /// A part's heading: body at the strong weight in the strong ink, and a task's ref in the code face.
    static func head(_ words: String, ref: String? = nil) -> UIView {
        let label = KitLabel(TypeScale.typeBody.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
        let said = NSMutableAttributedString(string: words, attributes: [.font: label.role.font, .foregroundColor: Palette.inkStrong])
        if let ref {
            said.append(NSAttributedString(string: " " + ref, attributes: [.font: TypeScale.typeCode.font, .foregroundColor: Palette.inkSubtle]))
        }
        label.attributedText = said
        label.accessibilityTraits = .header
        return label
    }

    /// One row of a plan's tree: a step or a to-do, its children under it.
    struct Node {
        let id: String
        let status: String
        let text: String
        var children: [Node] = []
    }

    /// Rows written flat with a nesting depth, as the tree they are: each row
    /// hangs under the nearest row before it that stands one level up (PlanPane.svelte `treeOf`).
    static func tree(_ rows: [(id: String, depth: Int, status: String, text: String)]) -> [Node] {
        var roots: [Node] = []
        // The path of open nodes, as indices into their parents' children.
        var open: [(depth: Int, path: [Int])] = []
        for row in rows {
            while let last = open.last, last.depth >= row.depth { open.removeLast() }
            let node = Node(id: row.id, status: row.status, text: row.text)
            if let parent = open.last {
                var path = parent.path
                insert(node, at: path, in: &roots)
                path.append(child(at: parent.path, in: roots).count - 1)
                open.append((row.depth, path))
            } else {
                roots.append(node)
                open.append((row.depth, [roots.count - 1]))
            }
        }
        return roots
    }

    private static func child(at path: [Int], in roots: [Node]) -> [Node] {
        var node = roots[path[0]]
        for index in path.dropFirst() { node = node.children[index] }
        return node.children
    }

    private static func insert(_ node: Node, at path: [Int], in nodes: inout [Node]) {
        if path.count == 1 {
            nodes[path[0]].children.append(node)
        } else {
            insert(node, at: Array(path.dropFirst()), in: &nodes[path[0]].children)
        }
    }
}

/// A plan's rows, children nested under their parent on its own rail
/// (app.css `.kit-nest`, `--nest-pad` in): the line runs from the parent's
/// mark down to each child's, as the rail's other lists draw it.
private final class PlanTree: UIStackView {
    private let rail = NestRailView()
    private let nested: Bool
    private var rows: [PlanRow] = []

    init(_ nodes: [PlanView.Node], landing: Set<String>, nested: Bool = false) {
        self.nested = nested
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space1
        for node in nodes {
            let row = PlanRow(node, lands: landing.contains(node.id))
            rows.append(row)
            let item = UIStackView(arrangedSubviews: [row])
            item.axis = .vertical
            if !node.children.isEmpty {
                // `.rows.nested`: `space-1` under its parent, `--nest-pad` in.
                let box = UIView()
                let children = PlanTree(node.children, landing: landing, nested: true)
                children.translatesAutoresizingMaskIntoConstraints = false
                box.addSubview(children)
                NSLayoutConstraint.activate([
                    children.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space1),
                    children.bottomAnchor.constraint(equalTo: box.bottomAnchor),
                    children.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space5),
                    children.trailingAnchor.constraint(equalTo: box.trailingAnchor),
                ])
                children.drawsRail(in: box)
                item.addArrangedSubview(box)
            }
            addArrangedSubview(item)
        }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("PlanTree is built in code") }

    /// The rail from the parent's mark to each of these rows' marks, drawn in the box that holds them.
    func drawsRail(in box: UIView) {
        rail.translatesAutoresizingMaskIntoConstraints = false
        box.insertSubview(rail, at: 0)
        NSLayoutConstraint.activate([
            rail.topAnchor.constraint(equalTo: box.topAnchor),
            rail.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            rail.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            rail.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        ])
        // The parent's mark's centre, from the box's left; its foot to the list's top.
        rail.railX = Size.iconMd / 2
        rail.lead = (PlanRow.lineHeight - Size.iconMd) / 2
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard nested, let box = superview else { return }
        let children = rows.map { row -> (glyphY: Double, armEnd: Double) in
            let mark = row.mark.convert(row.mark.bounds, to: box)
            return (Double(mark.midY), Double(mark.minX) - 2)
        }
        if children.map(\.glyphY) != rail.children.map(\.glyphY) || children.map(\.armEnd) != rail.children.map(\.armEnd) {
            rail.children = children
        }
    }
}

/// One step's or to-do's row: its mark, then its words in the label role,
/// muted once done, at the strong weight while under way.
private final class PlanRow: UIStackView {
    /// The label role's line: the mark stands in the first line's box (`block-size: 1lh`).
    static let lineHeight = TypeScale.typeLabel.lineHeight
    let mark: PlanMark

    init(_ node: PlanView.Node, lands: Bool) {
        mark = PlanMark(node.status, lands: lands)
        super.init(frame: .zero)
        alignment = .top
        spacing = Space.space2
        let words = KitLabel(node.status == "in_progress" ? TypeScale.typeLabel.with(weight: TypeScale.weightStrong) : TypeScale.typeLabel,
                             ink: node.status == "completed" ? Palette.inkMuted : Palette.inkStrong, lines: 0)
        words.text = node.text
        addArrangedSubview(mark)
        addArrangedSubview(words)
        isAccessibilityElement = true
        let state = switch node.status {
        case "completed": "done"
        case "in_progress": "in progress"
        default: "to do"
        }
        accessibilityLabel = "\(node.text), \(state)"
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("PlanRow is built in code") }
}

/// A row's mark, `--icon-md` wide and a line tall: done, the house tick
/// (Tick.svelte, its 1.5 stroke on a 24 grid), drawn along its stroke as it
/// lands; to come, an open ring in the subtle ink; under way, the live dot,
/// breathing in scale, never fading below its contrast.
private final class PlanMark: UIView {
    private let status: String
    private let shape = CAShapeLayer()
    private let lands: Bool

    init(_ status: String, lands: Bool) {
        self.status = status
        self.lands = lands
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.iconMd),
            heightAnchor.constraint(equalToConstant: PlanRow.lineHeight),
        ])
        layer.addSublayer(shape)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: PlanMark, _: UITraitCollection) in view.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PlanMark is built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let box = CGRect(x: 0, y: (bounds.height - Size.iconMd) / 2, width: Size.iconMd, height: Size.iconMd)
        shape.frame = box
        let unit = Size.iconMd / 24
        if status == "completed" {
            let tick = UIBezierPath()
            tick.move(to: CGPoint(x: 5 * unit, y: 12.5 * unit))
            tick.addLine(to: CGPoint(x: 9.5 * unit, y: 17 * unit))
            tick.addLine(to: CGPoint(x: 19 * unit, y: 7.5 * unit))
            shape.path = tick.cgPath
            shape.lineWidth = 1.5 * unit
            shape.lineCap = .round
            shape.lineJoin = .round
        } else {
            let side = Size.statusDotSize
            let dot = CGRect(x: (Size.iconMd - side) / 2, y: (Size.iconMd - side) / 2, width: side, height: side)
            // The ring's 1px inset shadow, as a stroke half a point in.
            shape.path = UIBezierPath(ovalIn: status == "in_progress" ? dot : dot.insetBy(dx: 0.5, dy: 0.5)).cgPath
            shape.lineWidth = 1
        }
        paint()
    }

    private func paint() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        switch status {
        case "completed":
            shape.fillColor = nil
            shape.strokeColor = Palette.statusDoneGlyph.resolvedColor(with: traitCollection).cgColor
        case "in_progress":
            shape.fillColor = Palette.statusLiveGlyph.resolvedColor(with: traitCollection).cgColor
            shape.strokeColor = nil
        default:
            shape.fillColor = nil
            shape.strokeColor = Palette.inkSubtle.resolvedColor(with: traitCollection).cgColor
        }
        CATransaction.commit()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        if status == "completed", lands {
            // `plan-tick`: the stroke drawn in over `--dur-toggle` on the out curve.
            let draw = CABasicAnimation(keyPath: "strokeEnd")
            draw.fromValue = 0
            draw.toValue = 1
            draw.duration = Motion.durToggle
            draw.timingFunction = Motion.easeOut.function
            shape.add(draw, forKey: "tick")
        } else if status == "in_progress", shape.animation(forKey: "breath") == nil {
            // `plan-breath`: to 0.7 at the half, over `--breath`, on the in-out curve, forever.
            let breath = CAKeyframeAnimation(keyPath: "transform.scale")
            breath.values = [1, 0.7, 1]
            breath.keyTimes = [0, 0.5, 1]
            breath.duration = Motion.breath
            breath.timingFunctions = [Motion.easeInOut.function, Motion.easeInOut.function]
            breath.repeatCount = .infinity
            shape.add(breath, forKey: "breath")
        }
    }
}
