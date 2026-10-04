import CawCoCore
import CawCoDesign
import UIKit

/// A project in the rail: its row (`LIST_ROW`: 30pt, mark, name, what is
/// running in it), and while open its sessions under it, set in a step
/// (`MenuSub` at `pl-(--space-4)`, rows 4pt apart, 2pt above and below).
final class ProjectBlock: UIStackView, UIContextMenuInteractionDelegate {
    let project: ProjectRow
    let row = RailRow(height: 30, leading: 10, trailing: 8, gap: 10)
    let sessionsBox = UIView()
    let sessions = UIStackView()
    let olderRow = RailTextRow()
    let emptyRow = RailTextRow()
    var onMenu: () -> UIMenu = { UIMenu() }
    private let name = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground)
    private let count = TreeCountButton()

    init(project: ProjectRow) {
        self.project = project
        super.init(frame: .zero)
        axis = .vertical
        let mark = ProjectMarkView(cwd: project.cwd)
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        count.isUserInteractionEnabled = false
        row.content.addArrangedSubview(mark)
        row.content.addArrangedSubview(name)
        row.content.addArrangedSubview(UIView())
        row.content.addArrangedSubview(count)
        row.inks = [name]
        row.addInteraction(UIContextMenuInteraction(delegate: self))
        sessions.axis = .vertical
        sessions.spacing = 4
        sessions.translatesAutoresizingMaskIntoConstraints = false
        sessionsBox.addSubview(sessions)
        NSLayoutConstraint.activate([
            sessions.topAnchor.constraint(equalTo: sessionsBox.topAnchor, constant: 2),
            sessions.bottomAnchor.constraint(equalTo: sessionsBox.bottomAnchor, constant: -2),
            sessions.leadingAnchor.constraint(equalTo: sessionsBox.leadingAnchor, constant: Space.space4),
            sessions.trailingAnchor.constraint(equalTo: sessionsBox.trailingAnchor),
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
        count.isHidden = running == 0
        count.configure(count: running, failed: 0, open: open)
        row.accessibilityLabel = text
        row.accessibilityValue = running > 0 ? "\(running) running session\(running == 1 ? "" : "s")" : nil
        row.accessibilityTraits = [.button]
        row.accessibilityHint = open ? "Folds its sessions" : "Opens its sessions"
    }

    func clearSessions() {
        for view in sessions.arrangedSubviews {
            sessions.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    func showSessions(_ shown: Bool) {
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
final class SessionRailRow: RailRow {
    let id: String
    let mark = SessionMarkView()
    let name = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground)
    private let age = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let count = TreeCountButton()
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
        count.onToggle = { [weak self] in
            guard let self else { return }
            onToggle(self.id)
        }
        content.isUserInteractionEnabled = true
        for view in [mark, name, age] { view.isUserInteractionEnabled = false }
        content.addArrangedSubview(mark)
        content.addArrangedSubview(name)
        content.addArrangedSubview(age)
        content.addArrangedSubview(count)
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

    func configure(title: String, status: MarkStatus, place: String, age text: String, count total: Int, failed: Int, open: Bool) {
        name.text = title
        mark.configure(id: id, place: place, status: status)
        age.text = text
        count.isHidden = total == 0
        count.configure(count: total, failed: failed, open: open)
        accessibilityLabel = "\(status.word): \(title)"
        accessibilityValue = text.isEmpty ? nil : text
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // The count is its own switch; the rest of the row opens the session.
        let local = count.convert(point, from: self)
        if !count.isHidden, count.bounds.insetBy(dx: -4, dy: -4).contains(local) { return count }
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
    let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted)
    var onTap: () -> Void = {}
    var isOpen = false { didSet { accessibilityValue = isOpen ? "Shown" : nil } }

    init() {
        super.init(height: 28, leading: 6, trailing: 8, gap: 6)
        label.tabular = true
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
        // Each child's glyph centre (its row's middle) and the arm's end at its glyph's left edge.
        rail.children = stack.arrangedSubviews.map { view in
            (glyphY: stack.frame.minY + view.frame.minY + 14, armEnd: Self.pad + 6)
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
    private var held: NSLayoutConstraint?

    func open(_ box: UIView, glyphs: [Child], rail: NestRailView? = nil, in root: UIView) {
        end()
        let height = box.bounds.height
        guard height > 0, !glyphs.isEmpty else { return }
        if UIAccessibility.isReduceMotionEnabled {
            for child in glyphs { child.row.alpha = 0 }
            Motion.easeOut.animator(Motion.durPop) { for child in glyphs { child.row.alpha = 1 } }.startAnimation()
            return
        }
        let lead = rail.map { $0.lead } ?? 0
        let glide = Glide(height + lead, speed: Glide.speed(height + lead, stops: glyphs.count))
        let centres = glyphs.map { $0.row.convert(CGPoint(x: 0, y: $0.row.bounds.midY), to: box).y }
        var started = Array(repeating: false, count: glyphs.count)
        for child in glyphs {
            child.glyph?.alpha = 0
            child.glyph?.transform = CGAffineTransform(translationX: -(child.glyph?.frame.minX ?? 0), y: 0)
            wipe(child.title, shown: false)
        }
        box.clipsToBounds = true
        let constraint = box.heightAnchor.constraint(equalToConstant: 0)
        constraint.priority = .required
        constraint.isActive = true
        held = constraint
        rail?.head = 0
        root.layoutIfNeeded()
        clock.run { [weak self] ms in
            let covered = glide.covered(ms)
            constraint.constant = min(height, max(0, covered - lead))
            rail?.head = covered
            for (index, child) in glyphs.enumerated() where !started[index] && covered >= centres[index] + lead {
                started[index] = true
                Motion.easeOut.animator(Motion.durRail) {
                    child.glyph?.alpha = 1
                    child.glyph?.transform = .identity
                }.startAnimation()
                self?.wipe(child.title, shown: true, over: Motion.durRail)
            }
            root.layoutIfNeeded()
            guard ms < glide.duration else {
                self?.end()
                box.clipsToBounds = false
                rail?.head = .infinity
                return false
            }
            return true
        }
    }

    func close(_ box: UIView, glyphs: [Child], rail: NestRailView? = nil, done: @escaping () -> Void) {
        end()
        let height = box.bounds.height
        guard height > 0, let root = box.window else {
            done()
            return
        }
        if UIAccessibility.isReduceMotionEnabled {
            let out = Motion.easeOut.animator(Motion.durExit) { for child in glyphs { child.row.alpha = 0 } }
            out.addCompletion { _ in done() }
            out.startAnimation()
            return
        }
        let lead = rail.map { $0.lead } ?? 0
        let total = height + lead
        let centres = glyphs.map { $0.row.convert(CGPoint(x: 0, y: $0.row.bounds.midY), to: box).y }
        var left = Array(repeating: false, count: glyphs.count)
        box.clipsToBounds = true
        let constraint = box.heightAnchor.constraint(equalToConstant: height)
        constraint.isActive = true
        held = constraint
        let duration = Motion.durExit * 1000
        clock.run { [weak self] ms in
            let t = min(1, ms / duration)
            constraint.constant = height * (1 - Motion.easeInOut.value(at: t))
            let head = total * (1 - Motion.easeOut.value(at: t))
            rail?.head = head
            for (index, child) in glyphs.enumerated() where !left[index] && head < centres[index] + lead {
                left[index] = true
                self?.wipe(child.title, shown: false, over: Motion.durExit / 2)
                Motion.easeOut.animator(Motion.durExit / 2) {
                    child.glyph?.alpha = 0
                    child.glyph?.transform = CGAffineTransform(translationX: -(child.glyph?.frame.minX ?? 0), y: 0)
                }.startAnimation()
            }
            root.layoutIfNeeded()
            guard t < 1 else {
                self?.clock.stop()
                done()
                return false
            }
            return true
        }
    }

    private func end() {
        clock.stop()
        held?.isActive = false
        held = nil
    }

    /// A title wiping in (left to right) or out (right to left) under a mask.
    private func wipe(_ view: UIView, shown: Bool, over duration: TimeInterval = 0) {
        let mask = (view.layer.mask as? CAShapeLayer) ?? CAShapeLayer()
        view.layer.mask = mask
        let full = UIBezierPath(rect: view.bounds).cgPath
        let none = UIBezierPath(rect: CGRect(x: 0, y: 0, width: 0, height: view.bounds.height)).cgPath
        let to = shown ? full : none
        if duration > 0 {
            let animation = CABasicAnimation(keyPath: "path")
            animation.fromValue = mask.presentation()?.path ?? mask.path ?? (shown ? none : full)
            animation.toValue = to
            animation.duration = duration
            animation.timingFunction = Motion.easeOut.function
            mask.add(animation, forKey: "wipe")
        }
        mask.path = to
        if shown, duration > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) { if mask.path == full { view.layer.mask = nil } }
        }
    }
}
