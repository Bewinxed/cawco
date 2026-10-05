import CawCoCore
import CawCoDesign
import UIKit

/// A project in the rail: its row (`LIST_ROW`: 30pt, mark, name, what is
/// running in it), and while open its sessions under it on a rail of their
/// own (`.kit-nest`: `--nest-pad` in, `--tree-gap` apart and under the row,
/// the line from the project's mark down to each one).
final class ProjectBlock: UIStackView, UIContextMenuInteractionDelegate {
    let project: ProjectRow
    let row = RailRow(height: 30, leading: 10, trailing: 8, gap: 10)
    let sessionsBox = UIView()
    let sessions = UIStackView()
    let rail = NestRailView()
    /// The project mark's centre from the block's left edge (the row's 10pt lead and half its 18pt mark): `--nest-x`.
    private static let railX = 10.0 + 9
    /// `--nest-pad`: the rail's x, then a tree step less half a mark and the sub row's own lead.
    private static let pad = railX + (Space.space1 + Space.space2 + Space.space3) - 9 - 6
    /// The mark's foot to the list's top: 6pt left in its 30pt row, then `--tree-gap`.
    private static let lead = 6.0 + Space.space1
    let olderRow = RailTextRow()
    let emptyRow = RailTextRow()
    var onMenu: () -> UIMenu = { UIMenu() }
    private let name = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground)
    let mark: ProjectMarkView

    init(project: ProjectRow) {
        self.project = project
        mark = ProjectMarkView(cwd: project.cwd)
        super.init(frame: .zero)
        axis = .vertical
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        row.content.addArrangedSubview(mark)
        row.content.addArrangedSubview(name)
        row.content.addArrangedSubview(UIView())
        row.inks = [name]
        row.addInteraction(UIContextMenuInteraction(delegate: self))
        sessions.axis = .vertical
        sessions.spacing = 4
        sessions.translatesAutoresizingMaskIntoConstraints = false
        sessionsBox.addSubview(sessions)
        rail.translatesAutoresizingMaskIntoConstraints = false
        rail.railX = Self.railX
        rail.lead = Self.lead
        sessionsBox.addSubview(rail)
        sessionsBox.clipsToBounds = false
        NSLayoutConstraint.activate([
            sessions.topAnchor.constraint(equalTo: sessionsBox.topAnchor, constant: Space.space1),
            sessions.bottomAnchor.constraint(equalTo: sessionsBox.bottomAnchor),
            sessions.leadingAnchor.constraint(equalTo: sessionsBox.leadingAnchor, constant: Self.pad),
            sessions.trailingAnchor.constraint(equalTo: sessionsBox.trailingAnchor),
            rail.topAnchor.constraint(equalTo: sessionsBox.topAnchor),
            rail.bottomAnchor.constraint(equalTo: sessionsBox.bottomAnchor),
            rail.leadingAnchor.constraint(equalTo: sessionsBox.leadingAnchor),
            rail.trailingAnchor.constraint(equalTo: sessionsBox.trailingAnchor),
        ])
        addArrangedSubview(row)
        addArrangedSubview(sessionsBox)
        emptyRow.setTitle("No sessions — start one")
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ProjectBlock is built in code")
    }

    func configure(name text: String, running: Int, open: Bool) {
        name.text = text
        mark.configure(count: running)
        row.accessibilityLabel = text
        row.accessibilityValue = running > 0 ? "\(running) running session\(running == 1 ? "" : "s")" : nil
        row.accessibilityTraits = [.button]
        row.accessibilityHint = open ? "Folds its sessions" : "Opens its sessions"
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        sessionsBox.layoutIfNeeded()
        measureRail()
    }

    func measureRail() {
        rail.marks = sessions.arrangedSubviews.compactMap { view in
            RailFold.lead(in: view).map { $0.convert($0.bounds, to: rail) }
        }
        rail.children = sessions.arrangedSubviews.filter { !$0.isHidden }.compactMap { view in
            guard let glyph = RailFold.lead(in: view) else { return nil }
            let centre = glyph.superview!.convert(glyph.center, to: rail)
            return (glyphY: centre.y, armEnd: centre.x - glyph.bounds.width / 2)
        }
    }

    func clearSessions() {
        for view in sessions.arrangedSubviews {
            sessions.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    func showSessions(_ shown: Bool) {
        if shown && !arrangedSubviews.contains(sessionsBox) {
            sessionsBox.translatesAutoresizingMaskIntoConstraints = false
            addArrangedSubview(sessionsBox)
        }
        sessionsBox.isHidden = !shown
    }

    /// The top-level rows' glyph and title, for the fold.
    func sessionGlyphs() -> [RailFold.Child] {
        sessions.arrangedSubviews.compactMap { view in
            let row = (view as? SessionRailRow) ?? (view as? UIStackView)?.arrangedSubviews.first as? SessionRailRow
            return row.map { RailFold.Child(row: $0, glyph: $0.mark, title: $0.name) }
                ?? (view as? RailTextRow).map { RailFold.Child(row: $0, glyph: nil, title: $0.label) }
        }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in self?.onMenu() }
    }
}

/// A session under its project (`SUB_ROW`: 28pt, its mark, its name, when it
/// last moved, and its delegates' count when it has any).
final class SessionRailRow: RailRow, HoverSessionRow {
    let id: String
    var hoverSessionId: String? { id }
    let mark = SessionMarkView()
    let name = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground)
    private let age = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    var onOpen: (String) -> Void = { _ in }
    var onToggle: (String) -> Void = { _ in }

    init(id: String) {
        self.id = id
        super.init(height: 28, leading: 6, trailing: 8, gap: 6)
        mark.translatesAutoresizingMaskIntoConstraints = false
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        name.setContentHuggingPriority(.defaultLow, for: .horizontal)
        age.tabular = true
        age.textAlignment = .right
        // `kit-age-col`: as wide as its longest word, "59m".
        age.widthAnchor.constraint(equalToConstant: 24).isActive = true
        mark.showsNestingChevron = false
        mark.onToggle = { [weak self] in
            guard let self else { return }
            onToggle(self.id)
        }
        content.isUserInteractionEnabled = true
        for view in [name, age] { view.isUserInteractionEnabled = false }
        content.addArrangedSubview(mark)
        content.addArrangedSubview(name)
        content.addArrangedSubview(age)
        inks = [name]
        addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onOpen(self.id)
        }, for: .primaryActionTriggered)
        let hint = UIToolTipInteraction()
        hint.delegate = self
        addInteraction(hint)
    }

    /// The age's `title`: when it last moved, in words.
    var ageHint = ""

    func configure(title: String, status: MarkStatus, word: String, place: String, age text: String, count total: Int, failed: Int, open: Bool) {
        name.text = title
        mark.configure(id: id, place: place, status: status, count: total, open: open)
        age.text = text
        accessibilityLabel = "\(word): \(title)"
        accessibilityValue = text.isEmpty ? nil : text
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // The mark's switch owns only the lead column; the title opens the session.
        let local = mark.convert(point, from: self)
        if let hit = mark.switchElement, mark.point(inside: local, with: event) {
            return hit.hitTest(hit.convert(point, from: self), with: event)
        }
        return super.hitTest(point, with: event).map { _ in self }
    }
}

extension SessionRailRow: UIToolTipInteractionDelegate {
    /// Only over the age, as the web's `title` sits on that span.
    func toolTipInteraction(_: UIToolTipInteraction, configurationAt point: CGPoint) -> UIToolTipConfiguration? {
        let box = age.convert(age.bounds, to: self)
        guard !ageHint.isEmpty, box.contains(point) else { return nil }
        return UIToolTipConfiguration(toolTip: ageHint, in: box)
    }
}

/// A row that only says something and acts on a tap ("N older", "No sessions — start one").
final class RailTextRow: RailRow {
    let mark = GlyphView(.archive, size: 12, tint: Palette.inkMuted)
    let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted)
    var onTap: () -> Void = {}
    var isOpen = false { didSet { accessibilityValue = isOpen ? "Shown" : nil } }

    init() {
        super.init(height: 28, leading: 6, trailing: 8, gap: 6)
        label.tabular = true
        content.addArrangedSubview(RailRow.slot(mark))
        content.addArrangedSubview(label)
        restInk = Palette.inkMuted
        inks = [label]
        addAction(UIAction { [weak self] _ in self?.onTap() }, for: .primaryActionTriggered)
    }

    func setTitle(_ text: String) {
        label.text = text
        accessibilityLabel = text
    }
}

/// A session's delegates on a rail of their own (`.kit-nest`): set in past
/// the parent's glyph by `--nest-in`, 4pt apart, 4pt below the parent, the
/// line from the parent's glyph down to each child's.
final class NestList: UIView {
    let stack = UIStackView()
    let rail = NestRailView()
    /// The parent glyph's centre from the row's left edge (`pl-1.5` + 9).
    static let railX = 6.0 + 9
    static var pad: Double { railX + Space.space2 }
    /// The parent glyph's foot to this list's top: 5pt left in its row, then `pt-1`.
    static let lead = 5.0 + 4

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        rail.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = Space.space1
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        addSubview(rail)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Self.pad),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            rail.topAnchor.constraint(equalTo: topAnchor),
            rail.bottomAnchor.constraint(equalTo: bottomAnchor),
            rail.leadingAnchor.constraint(equalTo: leadingAnchor),
            rail.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        rail.railX = Self.railX
        rail.lead = Self.lead
        clipsToBounds = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NestList is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        stack.layoutIfNeeded()
        measureRail()
    }

    func measureRail() {
        rail.marks = stack.arrangedSubviews.compactMap { view in
            RailFold.lead(in: view).map { $0.convert($0.bounds, to: rail) }
        }
        rail.children = stack.arrangedSubviews.compactMap { view in
            guard let glyph = RailFold.lead(in: view) else { return nil }
            let centre = glyph.superview!.convert(glyph.center, to: rail)
            return (glyphY: centre.y, armEnd: centre.x - glyph.bounds.width / 2)
        }
    }

    func glyphs() -> [RailFold.Child] {
        stack.arrangedSubviews.compactMap { view in
            let row = (view as? SessionRailRow) ?? (view as? UIStackView)?.arrangedSubviews.first as? SessionRailRow
            return row.map { RailFold.Child(row: $0, glyph: $0.mark, title: $0.name) }
        }
    }
}

/// A project's older sessions (`.older`): six rows tall at most, scrolling in
/// place, its edges fading over `--space-4` only while there is more past them.
final class OlderBox: UIView, UIScrollViewDelegate {
    let stack = UIStackView()
    private let scroll = UIScrollView()
    private let fade = CAGradientLayer()
    private var height: NSLayoutConstraint!

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsVerticalScrollIndicator = true
        scroll.delegate = self
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        addSubview(scroll)
        height = heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
            height,
        ])
        layer.mask = fade
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("OlderBox is built in code")
    }

    /// Six sub-rows (28pt, 2pt apart).
    static let cap = 6.0 * 28 + 5 * 2

    override func layoutSubviews() {
        stack.layoutIfNeeded()
        let content = stack.systemLayoutSizeFitting(CGSize(width: bounds.width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        height.constant = min(Self.cap, content)
        super.layoutSubviews()
        edges()
    }

    func scrollViewDidScroll(_: UIScrollView) { edges() }

    private func edges() {
        let above = scroll.contentOffset.y > 0
        let below = scroll.contentOffset.y + scroll.bounds.height < scroll.contentSize.height - 1
        let share = bounds.height > 0 ? Space.space4 / bounds.height : 0
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = bounds
        let solid = UIColor.black.cgColor, clear = UIColor.clear.cgColor
        fade.colors = [above ? clear : solid, solid, solid, below ? clear : solid]
        fade.locations = [0, NSNumber(value: share), NSNumber(value: 1 - share), 1]
        CATransaction.commit()
    }
}

/// A tree's fold in the rail (motion/branch.svelte.ts, on a stack): opening,
/// the room opens down from the parent at the line head's steady pace
/// (`Glide`), and as the head reaches each child its glyph flies in from the
/// row's left edge as it fades in and its title wipes in left to right, on
/// the out curve over `durRail`. Folding, quicker: the room closes over
/// `durExit` on the in-out curve while the line runs back ahead of it, each
/// title wiping out and its glyph flying out as the head leaves it. Reduce
/// Motion: the room lands at once and the children fade (in over `durPop`,
/// out over `durExit`).
@MainActor
final class RailFold {
    struct Child {
        let row: UIView
        let glyph: UIView?
        let title: UIView
    }

    private let clock = Frames()
    private var before: [ObjectIdentifier: Double] = [:]
    private var moved: [(UIView, Double)] = []
    private var activeBox: UIView?
    private(set) var closingBox: UIView?
    private var room = 0.0
    private var head = 0.0
    private var titles: [ObjectIdentifier: Double] = [:]
    private var railBases: [ObjectIdentifier: Double] = [:]
    private var detached: (stack: UIStackView, index: Int)?
    private var boxShift = 0.0
    var onSettled: () -> Void = {}
    var running: Bool { activeBox != nil }

    static func lead(in view: UIView) -> UIView? {
        if let row = view as? SessionRailRow { return row.mark }
        if let row = view as? RailTextRow { return row.mark }
        if let stack = view as? UIStackView, let first = stack.arrangedSubviews.first { return lead(in: first) }
        return nil
    }

    private static func rows(in root: UIView) -> [RailRow] {
        var rows: [RailRow] = []
        func visit(_ view: UIView) {
            if let row = view as? RailRow { rows.append(row) } else { view.subviews.forEach(visit) }
        }
        visit(root)
        return rows
    }

    /// FLIP's before read, before mounting a branch. Its rows will be laid out
    /// once at their final frames; the fold never asks Auto Layout for a frame.
    func capture(in root: UIView) {
        settle()
        before = Dictionary(uniqueKeysWithValues: Self.rows(in: root).map {
            (ObjectIdentifier($0), Double($0.convert($0.bounds, to: root).minY))
        })
    }

    private func measureRails(in root: UIView) {
        func visit(_ view: UIView) {
            if let block = view as? ProjectBlock { block.measureRail() }
            if let list = view as? NestList { list.measureRail() }
            view.subviews.forEach(visit)
        }
        visit(root)
    }

    func open(_ box: UIView, glyphs: [Child], rail: NestRailView? = nil, in root: UIView) {
        let turning = activeBox === box
        clock.stop()
        let height = box.bounds.height
        if turning, let detached {
            let was = drawnRows(in: root, outside: box)
            let top = box.convert(box.bounds, to: root).minY
            moved.forEach { $0.0.transform = .identity }
            box.transform = .identity
            box.translatesAutoresizingMaskIntoConstraints = false
            detached.stack.insertArrangedSubview(box, at: detached.index)
            self.detached = nil
            root.layoutIfNeeded()
            moved = shifts(was, in: root, outside: box)
            boxShift = Double(top - box.convert(box.bounds, to: root).minY)
        }
        if !turning {
            settle()
            room = 0
            head = 0
            titles = [:]
            boxShift = 0
            moved = Self.rows(in: root).compactMap { row in
                guard !row.isDescendant(of: box), let was = before[ObjectIdentifier(row)] else { return nil }
                let dy = was - Double(row.convert(row.bounds, to: root).minY)
                return abs(dy) > 0.01 ? (row, dy) : nil
            }
            before = [:]
        }
        activeBox = box
        closingBox = nil
        measureRails(in: root)
        let children = descendants(in: box, supplied: glyphs)
        let rides = rides(children, in: box, rail: rail)
        let distance = rides.map { $0.base + $0.length }.max() ?? height
        let speed = Glide.speed(height, stops: children.count)
        let fromRoom = room, fromHead = head
        let line = Glide(max(0, distance - fromHead), speed: speed)
        let grow = Glide(max(0, height - fromRoom), speed: speed)
        let starts = children.map { titles[ObjectIdentifier($0.row)] ?? 0 }
        let still = UIAccessibility.isReduceMotionEnabled
        let total = still ? Motion.durPop * 1000 : max(grow.duration, line.duration + Motion.durRail * 1000)
        let mask = CAShapeLayer()
        box.layer.mask = mask
        clock.run { [weak self] ms in
            guard let self else { return false }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            room = UIAccessibility.isReduceMotionEnabled ? height : fromRoom + grow.covered(ms)
            head = UIAccessibility.isReduceMotionEnabled ? distance : fromHead + line.covered(ms)
            mask.path = UIBezierPath(rect: CGRect(x: -Space.space8, y: -(rail?.lead ?? 0) - Size.rowMarkBox,
                                                 width: box.bounds.width + Space.space8 * 2,
                                                 height: room + (rail?.lead ?? 0) + Size.rowMarkBox)).cgPath
            let progress = height > fromRoom ? (room - fromRoom) / (height - fromRoom) : 1
            for (view, dy) in moved { view.transform = CGAffineTransform(translationX: 0, y: dy * (1 - progress)) }
            box.transform = CGAffineTransform(translationX: 0, y: boxShift * (1 - progress))
            for (index, child) in children.enumerated() {
                let arrival = still ? 0 : line.reached(max(0, rides[index].base + rides[index].length - fromHead))
                let t = min(1, max(0, (ms - arrival) / ((still ? Motion.durPop : Motion.durRail) * 1000)))
                let shown = starts[index] + (1 - starts[index]) * Motion.easeOut.value(at: t)
                draw(child, ride: rides[index], head: head, title: shown)
            }
            measureRails(in: root)
            drawLines(in: box, head: head, base: 0)
            CATransaction.commit()
            if ms >= total { settle(); return false }
            return true
        }
    }

    func close(_ box: UIView, glyphs: [Child], rail: NestRailView? = nil, done: @escaping () -> Void) {
        clock.stop()
        let turning = activeBox === box
        if !turning { settle() }
        let root = box.window!
        let height = box.bounds.height
        let was = drawnRows(in: root, outside: box)
        let top = box.convert(box.bounds, to: root).minY
        let stack = box.superview as! UIStackView
        let index = stack.arrangedSubviews.firstIndex(of: box)!
        moved.forEach { $0.0.transform = .identity }
        box.transform = .identity
        let frame = box.frame
        activeBox = box
        stack.removeArrangedSubview(box)
        box.translatesAutoresizingMaskIntoConstraints = true
        box.frame = frame
        detached = (stack, index)
        // Collapse takes its final room now, just as the web's outOfFlow.
        // Read scroll clamping before constructing any transform, not at the end.
        root.layoutIfNeeded()
        moved = shifts(was, in: root, outside: box)
        boxShift = Double(top - box.convert(box.bounds, to: root).minY)
        measureRails(in: root)
        let children = descendants(in: box, supplied: glyphs)
        let rides = rides(children, in: box, rail: rail)
        let distance = rides.map { $0.base + $0.length }.max() ?? height
        if !turning {
            room = height
            head = distance
            titles = Dictionary(uniqueKeysWithValues: children.map { (ObjectIdentifier($0.row), 1) })
        }
        activeBox = box
        closingBox = box
        let fromRoom = room, fromHead = head
        let starts = children.map { titles[ObjectIdentifier($0.row)] ?? 1 }
        let exit = Motion.durExit * 1000
        let mask = CAShapeLayer()
        box.layer.mask = mask
        clock.run { [weak self] ms in
            guard let self else { return false }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            room = UIAccessibility.isReduceMotionEnabled ? height : fromRoom * (1 - Motion.easeInOut.value(at: min(1, ms / exit)))
            head = fromHead * (1 - min(1, ms / (exit * 0.65)))
            mask.path = UIBezierPath(rect: CGRect(x: -Space.space8, y: -(rail?.lead ?? 0) - Size.rowMarkBox,
                                                 width: box.bounds.width + Space.space8 * 2,
                                                 height: room + (rail?.lead ?? 0) + Size.rowMarkBox)).cgPath
            let progress = UIAccessibility.isReduceMotionEnabled ? 1 : (fromRoom > 0 ? room / fromRoom : 0)
            for (row, dy) in moved { row.transform = CGAffineTransform(translationX: 0, y: dy * progress) }
            box.transform = CGAffineTransform(translationX: 0, y: boxShift * progress)
            for (index, child) in children.enumerated() {
                let departure = fromHead > 0 ? exit * 0.65 * max(0, 1 - (rides[index].base + rides[index].length) / fromHead) : 0
                let t = min(1, max(0, (ms - departure) / (exit / 2)))
                draw(child, ride: rides[index], head: head, title: starts[index] * (1 - Motion.easeOut.value(at: t)))
            }
            measureRails(in: root)
            drawLines(in: box, head: head, base: 0)
            if ms >= exit {
                detached = nil
                settle()
                done()
                CATransaction.commit()
                return false
            }
            CATransaction.commit()
            return true
        }
    }

    private struct Ride {
        let base: Double
        let start: CGPoint
        let centre: CGPoint
        let radius: Double
        let length: Double
        let down: Double
        func point(_ head: Double) -> CGPoint {
            let d = min(length, max(0, head))
            if d <= down { return CGPoint(x: start.x, y: start.y + d) }
            let arc = Double.pi / 2 * radius
            if d < down + arc {
                let angle = (d - down) / radius
                return CGPoint(x: start.x + radius * (1 - cos(angle)), y: centre.y - radius + radius * sin(angle))
            }
            return CGPoint(x: start.x + radius + d - down - arc, y: centre.y)
        }
    }

    private func drawnRows(in root: UIView, outside box: UIView) -> [ObjectIdentifier: Double] {
        Dictionary(uniqueKeysWithValues: Self.rows(in: root).filter { !$0.isDescendant(of: box) }.map {
            (ObjectIdentifier($0), Double($0.convert($0.bounds, to: root).minY))
        })
    }

    private func shifts(_ was: [ObjectIdentifier: Double], in root: UIView, outside box: UIView) -> [(UIView, Double)] {
        Self.rows(in: root).compactMap { row in
            guard !row.isDescendant(of: box), let y = was[ObjectIdentifier(row)] else { return nil }
            let dy = y - Double(row.convert(row.bounds, to: root).minY)
            return abs(dy) > 0.01 ? (row, dy) : nil
        }
    }

    private func rides(_ children: [Child], in box: UIView, rail: NestRailView?) -> [Ride] {
        railBases = [:]
        var arrivals: [ObjectIdentifier: Double] = [:]
        return children.map { child in
            var own = rail
            var parent: UIView?
            var at = child.row.superview
            while let view = at, view !== box {
                if let list = view as? NestList {
                    own = list.rail
                    parent = (list.superview as? UIStackView)?.arrangedSubviews.first
                    break
                }
                at = view.superview
            }
            let base = parent.flatMap { arrivals[ObjectIdentifier($0)] } ?? 0
            if let own { railBases[ObjectIdentifier(own)] = base }
            let held = ride(child, in: box, rail: own, base: base)
            arrivals[ObjectIdentifier(child.row)] = base + held.length
            return held
        }
    }

    private func ride(_ child: Child, in box: UIView, rail: NestRailView?, base: Double) -> Ride {
        let centre = child.glyph.map { $0.superview!.convert($0.center, to: box) }
            ?? child.row.convert(CGPoint(x: 0, y: child.row.bounds.midY), to: box)
        let start = rail.map { $0.convert(CGPoint(x: $0.railX, y: -$0.lead - Size.rowMarkBox / 2), to: box) }
            ?? CGPoint(x: centre.x, y: 0)
        let radius = min(Radius.radiusSm, max(0, centre.x - start.x))
        let down = max(0, centre.y - radius - start.y)
        let length = down + .pi / 2 * radius + max(0, centre.x - start.x - radius)
        return Ride(base: base, start: start, centre: centre, radius: radius, length: length, down: down)
    }

    private func descendants(in box: UIView, supplied: [Child]) -> [Child] {
        let rows = Self.rows(in: box)
        return rows.compactMap { row in
            if let row = row as? SessionRailRow { return Child(row: row, glyph: row.mark, title: row.name) }
            if let row = row as? RailTextRow { return Child(row: row, glyph: row.mark, title: row.label) }
            return supplied.first { $0.row === row }
        }
    }

    private func draw(_ child: Child, ride: Ride, head: Double, title: Double) {
        let along = head - ride.base
        let point = ride.point(along)
        child.glyph?.transform = CGAffineTransform(translationX: point.x - ride.centre.x, y: point.y - ride.centre.y)
        child.glyph?.alpha = UIAccessibility.isReduceMotionEnabled ? title : min(1, max(0, along / Motion.rideFade))
        let mask = (child.title.layer.mask as? CAShapeLayer) ?? CAShapeLayer()
        child.title.layer.mask = mask
        mask.path = UIBezierPath(rect: CGRect(x: 0, y: 0, width: child.title.bounds.width * title, height: child.title.bounds.height)).cgPath
        titles[ObjectIdentifier(child.row)] = title
    }

    private func drawLines(in box: UIView, head: Double, base: Double) {
        func visit(_ view: UIView) {
            if let rail = view as? NestRailView { rail.head = max(0, head - (railBases[ObjectIdentifier(rail)] ?? base) - Size.rowMarkBox / 2) }
            view.subviews.forEach(visit)
        }
        visit(box)
    }

    private func settle() {
        clock.stop()
        moved.forEach { $0.0.transform = .identity }
        moved = []
        if let box = activeBox {
            if let detached {
                box.translatesAutoresizingMaskIntoConstraints = false
                detached.stack.insertArrangedSubview(box, at: detached.index)
            }
            box.transform = .identity
            box.layer.mask = nil
            for row in Self.rows(in: box) {
                row.alpha = 1
                if let glyph = Self.lead(in: row) { glyph.transform = .identity; glyph.alpha = 1 }
                if let row = row as? SessionRailRow { row.name.layer.mask = nil }
                if let row = row as? RailTextRow { row.label.layer.mask = nil }
            }
            drawLines(in: box, head: .infinity, base: 0)
        }
        activeBox = nil
        closingBox = nil
        detached = nil
        onSettled()
    }

}
