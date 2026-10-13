import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// The board view (tasks/TaskBoard.svelte, TaskColumn.svelte, TaskCard.svelte,
// board-dnd.svelte.ts): one column per stage, in the order stages.md names
// them, each headed by its stage and count with a quiet word for its kind.
// A `you` column takes the brand wash, its name the brand ink, and its head
// the Needs-you glyph. Cards drag between columns; while one is in the air
// the columns it may not go to step back, and the hub has the last word on
// the drop. Each card's menu moves it by tap (Move to…). Tasks whose stage the
// project does not name stand in a last column, "Other stages".

/// What a drag carries: the task and the stage it left.
private final class TaskDrag: NSObject {
    let taskId: String
    let from: String

    init(taskId: String, from: String) {
        self.taskId = taskId
        self.from = from
    }
}

// MARK: Card

/// One task on the board: its id, its title, and only what it has to say
/// past that — an attempt running or failed, a wait on you, what it waits
/// on, its to-dos and labels. A task with nothing to say is two lines.
final class TaskCardView: UIControl {
    private(set) var task: TaskSummary?
    private let idLabel = KitLabel(TaskCardView.mono, ink: Palette.inkSubtle)
    private let problemGlyph = GlyphView(.warning, size: Size.iconSm, tint: Palette.inkMuted)
    private let failed = KitBadge("Failed", variant: .fail, glyph: .failed)
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow, lines: 2)
    private let liveFoot = UIStackView()
    private let liveDot = UIView()
    private let attnGlyph = GlyphView(.attention, size: Size.iconSm, tint: Palette.statusAttnGlyph)
    private let liveWords = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let foot = UIView()
    private let refusalLabel = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
    private let stack = UIStackView()

    static let mono = TypeScale.typeCode.with(points: TypeScale.typeMeta.points)

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile

        let head = UIStackView(arrangedSubviews: [idLabel, problemGlyph, UIView(), failed])
        head.spacing = Space.space1
        head.alignment = .center
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBadgeH).isActive = true
        titleLabel.lineBreakMode = .byTruncatingTail

        liveDot.backgroundColor = Palette.statusLiveGlyph
        liveDot.layer.cornerRadius = 3
        liveDot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([liveDot.widthAnchor.constraint(equalToConstant: 6), liveDot.heightAnchor.constraint(equalToConstant: 6)])
        for part in [liveDot, attnGlyph, liveWords] as [UIView] { liveFoot.addArrangedSubview(part) }
        liveFoot.spacing = Space.space2
        liveFoot.alignment = .center

        refusalLabel.isHidden = true
        for part in [head, titleLabel, liveFoot, foot, refusalLabel] as [UIView] { stack.addArrangedSubview(part) }
        stack.axis = .vertical
        stack.spacing = Space.space1
        stack.alignment = .fill
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        // `padding: space-2 space-3 space-3`; a card is never under the touch floor.
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskCardView is built in code")
    }

    /// `waitsOn`: what it waits on that has not landed.
    func configure(_ next: TaskSummary, waitsOn: [String]) {
        task = next
        idLabel.text = next.id
        problemGlyph.isHidden = next.problem == nil
        failed.isHidden = !(next.lastAttemptFailed && !next.liveAttempt)
        titleLabel.text = next.title

        let you = next.kind == .you
        liveFoot.isHidden = !(next.liveAttempt || you)
        liveDot.isHidden = !next.liveAttempt
        attnGlyph.isHidden = next.liveAttempt || !you
        if next.liveAttempt {
            liveWords.text = Self.isRetry(next) ? "retrying · attempt \(next.attempts.count)" : "\(next._type ?? "attempt") working"
        } else if you {
            liveWords.text = "waiting on you"
        }
        breathe(next.liveAttempt)

        foot.subviews.forEach { $0.removeFromSuperview() }
        var parts: [UIView] = []
        let total = Int(next.todos.total), done = Int(next.todos.done)
        if total > 0 {
            let ring = TaskRingView(size: .sm)
            ring.configure(done: done, total: total)
            let count = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            count.tabular = true
            count.text = "\(done)/\(total)"
            parts.append(Self.row([ring, count], gap: Space.space1))
        }
        if let first = waitsOn.first {
            let after = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            after.text = "after"
            let ref = KitLabel(Self.mono, ink: Palette.inkStrong)
            ref.text = first
            var bits: [UIView] = [GlyphView(.lock, size: Size.iconSm, tint: Palette.inkMuted), after, ref]
            if waitsOn.count > 1 {
                let more = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
                more.tabular = true
                more.text = "+\(waitsOn.count - 1)"
                bits.append(more)
            }
            parts.append(Self.row(bits, gap: Space.space1))
        }
        parts += next.labels.prefix(2).map { KitBadge($0, variant: .secondary) }
        if next.labels.count > 2 { parts.append(KitBadge("+\(next.labels.count - 2)", variant: .secondary)) }
        foot.isHidden = parts.isEmpty
        if !parts.isEmpty {
            let wrap = WrapLayout(parts, gap: Space.space2)
            wrap.translatesAutoresizingMaskIntoConstraints = false
            foot.addSubview(wrap)
            // `margin-block-start: space-1` over the stack's own gap.
            NSLayoutConstraint.activate([
                wrap.topAnchor.constraint(equalTo: foot.topAnchor, constant: Space.space1),
                wrap.bottomAnchor.constraint(equalTo: foot.bottomAnchor),
                wrap.leadingAnchor.constraint(equalTo: foot.leadingAnchor),
                wrap.trailingAnchor.constraint(equalTo: foot.trailingAnchor),
            ])
        }
        var words = [next.id, next.title]
        if next.lastAttemptFailed && !next.liveAttempt { words.append("Failed") }
        if !liveFoot.isHidden, let live = liveWords.text { words.append(live) }
        if total > 0 { words.append("\(done) of \(total) to-dos done") }
        if let first = waitsOn.first { words.append("after \(first)") }
        words += next.labels
        said = words.joined(separator: ", ")
        relabel()
    }

    /// A retry in flight: a live attempt whose one before failed or was stopped (`isRetry`).
    static func isRetry(_ task: TaskSummary) -> Bool {
        guard task.liveAttempt, let newest = task.attempts.first, newest.state == .starting || newest.state == .running,
              task.attempts.count > 1 else { return false }
        let before = task.attempts[1].state
        return before == .failed || before == .cancelled
    }

    private static func row(_ views: [UIView], gap: Double) -> UIStackView {
        let row = UIStackView(arrangedSubviews: views)
        row.spacing = gap
        row.alignment = .center
        return row
    }

    /// The live dot breathes (`pulse var(--breath)`), still under Reduce Motion.
    private func breathe(_ on: Bool) {
        liveDot.layer.removeAnimation(forKey: "breath")
        guard on, !UIAccessibility.isReduceMotionEnabled else { return }
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.4
        pulse.duration = Motion.breath / 2
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = Motion.easeInOut.function
        liveDot.layer.add(pulse, forKey: "breath")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { breathe(task?.liveAttempt == true) }
    }

    /// The card in the air: its place stays drawn, faint, until it lands.
    var lifted = false {
        didSet { alpha = lifted ? 0.4 : 1 }
    }

    /// Moved, and the hub has not answered yet: it breathes in its new column
    /// (Live work breathes, `--breath`), held faint under Reduce Motion, and
    /// settles when the hub confirms.
    var settling = false {
        didSet {
            guard settling != oldValue else { return }
            layer.removeAnimation(forKey: "settle")
            layer.opacity = 1
            guard settling else { return }
            guard !UIAccessibility.isReduceMotionEnabled else {
                layer.opacity = 0.6
                return
            }
            let breath = CABasicAnimation(keyPath: "opacity")
            breath.fromValue = 1
            breath.toValue = 0.6
            breath.duration = Motion.breath / 2
            breath.autoreverses = true
            breath.repeatCount = .infinity
            breath.timingFunction = Motion.easeInOut.function
            layer.add(breath, forKey: "settle")
        }
    }

    /// The hub's refusal of this card's move, said on the card that stayed.
    var refusal: String? {
        didSet {
            guard refusal != oldValue else { return }
            refusalLabel.text = refusal
            refusalLabel.isHidden = refusal == nil
            relabel()
        }
    }

    /// What VoiceOver reads: the card's words, then a refusal it carries.
    private var said = ""

    private func relabel() {
        accessibilityLabel = [said, refusal].compactMap(\.self).joined(separator: ", ")
    }

    override var isHighlighted: Bool {
        didSet {
            Motion.easeOut.animator(Motion.durControl) {
                self.backgroundColor = self.isHighlighted ? Palette.surfaceHover : Palette.surfaceRaised
            }.startAnimation()
        }
    }
}

// MARK: Column

/// One stage's column: its name and count, a quiet word for its kind under
/// them, and its cards in order, scrolling inside it; under them, in the
/// column that takes new tasks, the add form.
final class TaskColumnView: UIView {
    let stage: String
    private let nameLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let youGlyph = GlyphView(.attention, size: Size.iconMd, tint: Palette.statusAttnGlyph)
    private let count = MorphLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
    private let kindLabel = KitLabel(TypeScale.typeCode, ink: Palette.inkSubtle)
    private let head = UIStackView()
    let cards = UIScrollView()
    private let cardStack = UIStackView()
    let foot = UIStackView()
    private var kind: Components.Schemas.StageKind?

    init(stage: String) {
        self.stage = stage
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1

        nameLabel.lineBreakMode = .byTruncatingTail
        nameLabel.accessibilityTraits = .header
        count.tabular = true
        let line = UIStackView(arrangedSubviews: [youGlyph, nameLabel, UIView(), count])
        line.spacing = Space.space2
        line.alignment = .center
        line.setCustomSpacing(Space.space2 - Space.space1, after: youGlyph)
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHXs).isActive = true
        head.addArrangedSubview(line)
        head.addArrangedSubview(kindLabel)
        head.axis = .vertical
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2, bottom: Space.space1, trailing: Space.space2)
        head.isAccessibilityElement = true
        head.accessibilityTraits = .header

        cardStack.axis = .vertical
        cardStack.spacing = Space.space1
        cardStack.translatesAutoresizingMaskIntoConstraints = false
        cards.addSubview(cardStack)
        cards.translatesAutoresizingMaskIntoConstraints = false
        cards.alwaysBounceVertical = false
        cards.showsVerticalScrollIndicator = true
        // The cards' shadow shows in the column: the scrollport is the column's inside.
        cards.clipsToBounds = true
        foot.axis = .vertical

        let body = UIStackView(arrangedSubviews: [head, cards, foot])
        body.axis = .vertical
        body.spacing = Space.space1
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        let fit = cards.heightAnchor.constraint(equalTo: cardStack.heightAnchor, constant: 2)
        fit.priority = .defaultHigh
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space1),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space1),
            body.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Space.space1),
            cardStack.topAnchor.constraint(equalTo: cards.contentLayoutGuide.topAnchor, constant: 1),
            cardStack.bottomAnchor.constraint(equalTo: cards.contentLayoutGuide.bottomAnchor, constant: -1),
            cardStack.leadingAnchor.constraint(equalTo: cards.frameLayoutGuide.leadingAnchor),
            cardStack.trailingAnchor.constraint(equalTo: cards.frameLayoutGuide.trailingAnchor),
            cards.contentLayoutGuide.widthAnchor.constraint(equalTo: cards.frameLayoutGuide.widthAnchor),
            // `.cards { flex: 1 1 auto; min-block-size: var(--c-btn-h-lg) }`.
            cards.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            fit,
        ])
        paint()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (column: TaskColumnView, _: UITraitCollection) in column.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskColumnView is built in code")
    }

    func configure(label: String, kind: Components.Schemas.StageKind?, cards next: [TaskCardView]) {
        self.kind = kind
        let you = kind == .you
        nameLabel.text = label
        nameLabel.ink = you ? Palette.brandInk : Palette.inkStrong
        youGlyph.isHidden = !you
        count.text = "\(next.count)"
        kindLabel.text = kind.map(TaskWords.kind) ?? "not in stages.md"
        kindLabel.ink = you ? Palette.statusAttnInk : Palette.inkSubtle
        head.accessibilityLabel = "\(label), \(next.count) \(next.count == 1 ? "task" : "tasks")"
        let standing = cardStack.arrangedSubviews
        let wanted: [UIView] = next
        if standing != wanted {
            for view in standing where !wanted.contains(view) {
                cardStack.removeArrangedSubview(view)
                view.removeFromSuperview()
            }
            for (index, card) in next.enumerated() { cardStack.insertArrangedSubview(card, at: index) }
        }
        paint()
    }

    /// A card in the air may not come here: the column steps back.
    var closed = false {
        didSet { if closed != oldValue { Motion.easeOut.animator(Motion.durControl) { self.alpha = self.closed ? 0.5 : 1 }.startAnimation() } }
    }

    /// A drop would land here.
    var over = false {
        didSet { if over != oldValue { Motion.easeOut.animator(Motion.durControl) { self.paint() }.startAnimation() } }
    }

    private func paint() {
        backgroundColor = over ? Palette.surfaceHover : (kind == .you ? Palette.brandWash : Palette.surfaceBand)
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}

// MARK: Board

/// The columns side by side, scrolling across; each column's cards scroll
/// down inside it. Under 640pt a column is the board's width less the next
/// one's edge, and a swipe settles on a column (`scroll-snap`).
final class TaskBoardView: UIView, UIScrollViewDelegate, UIDragInteractionDelegate, UIDropInteractionDelegate {
    let scroll = UIScrollView()
    private let row = UIStackView()
    private(set) var columns: [String: TaskColumnView] = [:]
    private var order: [String] = []
    private var cards: [String: TaskCardView] = [:]
    private var widths: [NSLayoutConstraint] = []
    private var heights: [NSLayoutConstraint] = []

    /// The page's side margin: the first column starts there, the board scrolls to the screen's edge.
    var inset = Space.space5 { didSet { if inset != oldValue { setNeedsLayout() } } }
    var onOpen: (String) -> Void = { _ in }
    var onMove: (_ taskId: String, _ stage: String) -> Void = { _, _ in }
    var allowed: (String) -> Set<String> = { _ in [] }
    /// The stage names, in order, a card's Move to… lists (the project's own).
    private var stageNames: [String: String] = [:]

    /// The stage the card in the air left, while one is dragged.
    private var dragFrom: String?
    private var dropOver: String?
    private var edgeLink: CADisplayLink?
    private var edgeSpeed = 0.0

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.alwaysBounceHorizontal = true
        scroll.clipsToBounds = false
        scroll.delegate = self
        addSubview(scroll)
        row.axis = .horizontal
        row.spacing = Space.space3
        row.alignment = .top
        row.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(row)
        clipsToBounds = true
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            row.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            row.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            scroll.contentLayoutGuide.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
        ])
        scroll.addInteraction(UIDropInteraction(delegate: self))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskBoardView is built in code")
    }

    /// The board for `stages` and `tasks`; `foot` stands under the cards of the `newIn` column.
    /// `settling`: the cards whose move the hub has not answered yet; `refusals`: the hub's refusals, on the cards they refused.
    func show(stages: [TaskStage], tasks: [TaskSummary], newIn: String?, foot: UIView, kindOf: [String: Components.Schemas.StageKind?],
              settling: Set<String>, refusals: [String: String]) {
        let named = Set(stages.map(\.name))
        var byStage: [String: [TaskSummary]] = [:]
        for task in tasks { byStage[named.contains(task.stage) ? task.stage : "", default: []].append(task) }
        var lanes: [(name: String, label: String, kind: Components.Schemas.StageKind?)] = stages.map { ($0.name, TaskWords.stage($0.name), $0.kind) }
        if byStage[""]?.isEmpty == false { lanes.append(("", "Other stages", nil)) }
        stageNames = Dictionary(stages.map { ($0.name, TaskWords.stage($0.name)) }, uniquingKeysWith: { first, _ in first })

        // The cards, kept by task: a card that changes column is the same view.
        let listed = Set(tasks.map(\.id))
        for (id, card) in cards where !listed.contains(id) {
            card.removeFromSuperview()
            cards[id] = nil
        }
        for task in tasks {
            let card = cards[task.id] ?? makeCard(task.id)
            cards[task.id] = card
            // What it waits on that has not landed: the hub's word, else its `after` edges not in a done stage.
            let waits = task.blockedBy.isEmpty ? task.after.filter { id in
                let kind = kindOf[id] ?? nil
                return kind != .done && kind != .dropped
            } : task.blockedBy
            card.configure(task, waitsOn: waits)
            card.settling = settling.contains(task.id)
            card.refusal = refusals[task.id]
        }

        // The columns, kept by stage.
        let names = lanes.map(\.name)
        if names != order {
            for (name, column) in columns where !names.contains(name) {
                row.removeArrangedSubview(column)
                column.removeFromSuperview()
                columns[name] = nil
            }
            for (index, name) in names.enumerated() {
                let column = columns[name] ?? TaskColumnView(stage: name)
                columns[name] = column
                row.insertArrangedSubview(column, at: index)
            }
            order = names
            sizeColumns()
        }
        for lane in lanes {
            let column = columns[lane.name]
            column?.configure(label: lane.label, kind: lane.kind, cards: (byStage[lane.name] ?? []).compactMap { cards[$0.id] })
            if let column, lane.name == newIn, !lane.name.isEmpty {
                if foot.superview !== column.foot {
                    foot.removeFromSuperview()
                    column.foot.addArrangedSubview(foot)
                }
            }
        }
        if newIn == nil || !names.contains(newIn ?? "") { foot.removeFromSuperview() }
    }

    private func makeCard(_ id: String) -> TaskCardView {
        let card = TaskCardView()
        card.addAction(UIAction { [weak self] _ in self?.onOpen(id) }, for: .touchUpInside)
        let drag = UIDragInteraction(delegate: self)
        // Off by default on an iPhone: the board's cards move by drag there too.
        drag.isEnabled = true
        card.addInteraction(drag)
        ContextMenuHost.attach(to: card) { [weak self, weak card] _ in
            guard let self, let task = card?.task else { return nil }
            return moveMenu(task)
        }
        return card
    }

    /// Move to…: only the stages the project allows from where the task is,
    /// in the stages' order. The drag's alternative (HIG Drag and drop).
    private func moveMenu(_ task: TaskSummary) -> UIMenu? {
        let open = allowed(task.stage)
        let targets = order.filter { !$0.isEmpty && open.contains($0) }
        guard !targets.isEmpty else { return nil }
        let actions = targets.map { name in
            UIAction(title: stageNames[name] ?? TaskWords.stage(name)) { [weak self] _ in self?.onMove(task.id, name) }
        }
        return UIMenu(children: [UIMenu(title: "Move to…", image: Glyph.arrowRight.image, children: actions)])
    }

    // MARK: Size and paging

    /// Under 640pt of window.
    private var compact: Bool { Double(window?.bounds.width ?? bounds.width) < 640 }

    override func layoutSubviews() {
        super.layoutSubviews()
        sizeColumns()
    }

    private var sized: String = ""

    /// `grid-auto-columns: minmax(15rem, 22rem)`, and under 640pt the
    /// board's width less `space-8`, the next column's edge showing.
    private func sizeColumns() {
        let room = bounds.width - inset * 2
        guard room > 0 else { return }
        let count = Double(max(1, order.count))
        let width = compact ? room - Space.space8 : min(352, max(240, (room - Space.space3 * (count - 1)) / count))
        let shape = "\(width):\(order.joined(separator: ",")):\(bounds.height)"
        guard shape != sized else { return }
        sized = shape
        scroll.contentInset = UIEdgeInsets(top: 0, left: inset, bottom: 0, right: inset)
        if scroll.contentOffset.x < -inset || order.count <= 1 { scroll.contentOffset.x = -inset }
        scroll.decelerationRate = compact ? .fast : .normal
        NSLayoutConstraint.deactivate(widths + heights)
        // `padding-block-end: space-3` under the columns.
        widths = row.arrangedSubviews.map { $0.widthAnchor.constraint(equalToConstant: width) }
        heights = row.arrangedSubviews.map { $0.heightAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor, constant: -Space.space3) }
        NSLayoutConstraint.activate(widths + heights)
    }

    /// A swipe settles on a column under 640pt.
    func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
        guard compact, let first = row.arrangedSubviews.first else { return }
        let step = first.bounds.width + row.spacing
        guard step > 0 else { return }
        let now = (scrollView.contentOffset.x + inset) / step
        var page = (targetContentOffset.pointee.x + inset) / step
        page = velocity.x > 0.2 ? ceil(now) : (velocity.x < -0.2 ? floor(now) : page.rounded())
        page = min(max(0, page), Double(max(0, order.count - 1)))
        targetContentOffset.pointee.x = min(page * step - inset, scrollView.contentSize.width - scrollView.bounds.width + inset)
    }

    /// Brings `stage`'s column into view, so the card a move acts on stays in
    /// sight: the column a page under 640pt, its edge otherwise.
    func reveal(_ stage: String) {
        guard let column = columns[stage], column.window != nil else { return }
        layoutIfNeeded()
        let frame = column.convert(column.bounds, to: scroll)
        let visible = CGRect(x: scroll.contentOffset.x + inset, y: 0, width: scroll.bounds.width - inset * 2, height: scroll.bounds.height)
        guard frame.minX < visible.minX - 1 || frame.maxX > visible.maxX + 1 else { return }
        let most = max(-inset, scroll.contentSize.width - scroll.bounds.width + inset)
        let x = frame.minX < visible.minX ? frame.minX - inset : frame.maxX - scroll.bounds.width + inset
        scroll.setContentOffset(CGPoint(x: min(max(-inset, x), most), y: 0), animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func settle() {
        guard compact, let first = row.arrangedSubviews.first else { return }
        let step = first.bounds.width + row.spacing
        let page = min(max(0, ((scroll.contentOffset.x + inset) / step).rounded()), Double(max(0, order.count - 1)))
        scroll.setContentOffset(CGPoint(x: min(page * step - inset, scroll.contentSize.width - scroll.bounds.width + inset), y: 0), animated: true)
    }

    // MARK: Drag

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning _: any UIDragSession) -> [UIDragItem] {
        guard let card = interaction.view as? TaskCardView, let task = card.task else { return [] }
        let item = UIDragItem(itemProvider: NSItemProvider(object: task.id as NSString))
        item.localObject = TaskDrag(taskId: task.id, from: task.stage)
        return [item]
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin _: any UIDragSession) {
        guard let card = interaction.view as? TaskCardView, let task = card.task else { return }
        card.lifted = true
        dragFrom = task.stage
        markColumns()
    }

    func dragInteraction(_ interaction: UIDragInteraction, session _: any UIDragSession, didEndWith _: UIDropOperation) {
        (interaction.view as? TaskCardView)?.lifted = false
        dragFrom = nil
        dropOver = nil
        markColumns()
        stopEdge()
        settle()
    }

    /// While a card is in the air: the columns it may not go to step back, and the one under it lights.
    private func markColumns() {
        let open = dragFrom.map(allowed)
        for (name, column) in columns {
            column.closed = open != nil && name != dragFrom && !(open?.contains(name) ?? false)
            column.over = dropOver == name && name != dragFrom
        }
    }

    private static func drag(in session: any UIDropSession) -> TaskDrag? {
        session.localDragSession?.items.first?.localObject as? TaskDrag
    }

    func dropInteraction(_: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        Self.drag(in: session) != nil
    }

    func dropInteraction(_: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        let point = session.location(in: row)
        let under = order.first { name in columns[name].map { $0.frame.minX - row.spacing / 2 ... $0.frame.maxX + row.spacing / 2 ~= point.x } ?? false }
        // The stray column takes no drop: it has no stage to move to.
        let target = under.flatMap { $0.isEmpty ? nil : $0 }
        if target != dropOver {
            dropOver = target
            markColumns()
        }
        followEdge(session.location(in: self).x)
        // A closed column is still a target: the hub says why, and the card goes back.
        guard let target, target != Self.drag(in: session)?.from else { return UIDropProposal(operation: .cancel) }
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_: UIDropInteraction, performDrop session: any UIDropSession) {
        guard let drag = Self.drag(in: session), let target = dropOver, target != drag.from else { return }
        onMove(drag.taskId, target)
    }

    func dropInteraction(_: UIDropInteraction, sessionDidExit _: any UIDropSession) {
        dropOver = nil
        markColumns()
        stopEdge()
    }

    func dropInteraction(_: UIDropInteraction, sessionDidEnd _: any UIDropSession) {
        dropOver = nil
        markColumns()
        stopEdge()
    }

    /// A card held near the board's side carries the board along, so a column off screen can be reached.
    private func followEdge(_ x: Double) {
        let reach = Size.cBtnHLg
        if x < reach {
            edgeSpeed = -(reach - x) / reach * 12
        } else if x > bounds.width - reach {
            edgeSpeed = (x - (bounds.width - reach)) / reach * 12
        } else {
            stopEdge()
            return
        }
        guard edgeLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(edgeTick))
        link.add(to: .main, forMode: .common)
        edgeLink = link
    }

    @objc private func edgeTick() {
        let most = max(-inset, scroll.contentSize.width - scroll.bounds.width + inset)
        let next = min(max(-inset, scroll.contentOffset.x + edgeSpeed), most)
        scroll.contentOffset.x = next
    }

    private func stopEdge() {
        edgeLink?.invalidate()
        edgeLink = nil
        edgeSpeed = 0
    }
}

// MARK: New task

/// A new task, inline where it will appear (NewTaskForm.svelte): a title,
/// and the stage it starts in. On the board the column is the stage; the
/// table and the empty board ask for one, starting from the project's first
/// to-do stage. The form stays open after an add, so a run of tasks is typed
/// one after another, and the hub's refusal is said under the field.
final class NewTaskForm: UIView {
    /// Closed, the form is the page's one action (a first-use empty state).
    private let primary: Bool
    private let picksStage: Bool
    private let create: (String, String) async throws -> Void
    var onOpenChange: (Bool) -> Void = { _ in }

    private(set) var open = false
    /// The stage a new task starts in, unless another is picked.
    var stage = "" { didSet { renderPicker() } }
    var stages: [TaskStage] = [] { didSet { renderPicker() } }
    private var picked: String?
    private var pending = false

    private let field = KitField(placeholder: "What needs doing?")
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
    private let picker = KitSelect(small: true)
    private var addButton: UIButton!
    private var opener: UIButton!
    private let form = UIStackView()

    init(primary: Bool = false, picksStage: Bool, create: @escaping (String, String) async throws -> Void) {
        self.primary = primary
        self.picksStage = picksStage
        self.create = create
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        opener = primary
            ? KitButton.make("Add task", glyph: .plus, variant: .action) { [weak self] in self?.setOpen(true) }
            : KitButton.make("Add task", glyph: .plus, glyphTint: Palette.mutedForeground, variant: .ghost, height: .sm, stretch: true) { [weak self] in self?.setOpen(true) }
        if !primary {
            KitButton.setTitle("Add task", of: opener, variant: .ghost, height: .sm)
            opener.configuration?.attributedTitle = AttributedString("Add task", attributes: TypeScale.typeLabel.container(color: Palette.mutedForeground, tracking: -0.01))
            opener.contentHorizontalAlignment = .leading
            opener.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        }

        field.accessibilityLabel = "Task title"
        field.autocorrectionType = .default
        field.returnKeyType = .done
        field.font = TypeScale.typeLabel.withWeight(.regular).font
        field.addAction(UIAction { [weak self] _ in self?.submit() }, for: .primaryActionTriggered)
        field.addAction(UIAction { [weak self] _ in self?.renderAdd() }, for: .editingChanged)
        picker.accessibilityLabel = "Stage"
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in self?.setOpen(false) }
        addButton = KitButton.make("Add task", variant: .action, height: .sm) { [weak self] in self?.submit() }
        let actions = UIStackView(arrangedSubviews: [picker, UIView(), cancel, addButton])
        actions.spacing = Space.space1
        actions.alignment = .center
        picker.isHidden = !picksStage
        picker.setContentHuggingPriority(.required, for: .horizontal)
        problem.isHidden = true
        for part in [field, problem, actions] as [UIView] { form.addArrangedSubview(part) }
        form.axis = .vertical
        form.spacing = Space.space2
        form.isHidden = true

        let both = UIStackView(arrangedSubviews: [opener, form])
        both.axis = .vertical
        both.alignment = primary ? .leading : .fill
        both.translatesAutoresizingMaskIntoConstraints = false
        addSubview(both)
        NSLayoutConstraint.activate([
            both.topAnchor.constraint(equalTo: topAnchor),
            both.bottomAnchor.constraint(equalTo: bottomAnchor),
            both.leadingAnchor.constraint(equalTo: leadingAnchor),
            both.trailingAnchor.constraint(equalTo: trailingAnchor),
            form.widthAnchor.constraint(equalTo: both.widthAnchor),
        ])
        renderAdd()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NewTaskForm is built in code")
    }

    /// Opens or closes the form; the page keeps one `adding` for all of them.
    func setOpen(_ next: Bool, announce: Bool = true) {
        guard next != open else { return }
        open = next
        opener.isHidden = next
        form.isHidden = !next
        if next {
            picked = nil
            renderPicker()
            DispatchQueue.main.async { [weak self] in
                guard let self, open, window != nil else { return }
                field.becomeFirstResponder()
            }
        } else {
            field.text = ""
            show(problem: nil)
            field.resignFirstResponder()
        }
        renderAdd()
        if announce { onOpenChange(next) }
    }

    private var into: String { picked ?? stage }

    private func renderPicker() {
        guard picksStage else { return }
        picker.setValue(TaskWords.stage(into))
        picker.menu = UIMenu(children: stages.map { each in
            let action = UIAction(title: TaskWords.stage(each.name)) { [weak self] _ in
                self?.picked = each.name
                self?.renderPicker()
            }
            action.state = each.name == into ? .on : .off
            return action
        })
    }

    private func renderAdd() {
        let text = field.text?.trimmingCharacters(in: .whitespaces) ?? ""
        addButton.isEnabled = !text.isEmpty && !pending
        KitButton.setTitle(pending ? "Adding…" : "Add task", of: addButton, variant: .action, height: .sm)
    }

    private func show(problem text: String?) {
        problem.text = text
        problem.isHidden = text == nil
    }

    private func submit() {
        let text = field.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty, !pending else { return }
        pending = true
        show(problem: nil)
        renderAdd()
        let stage = into
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await create(text, stage)
                field.text = ""
                field.becomeFirstResponder()
            } catch {
                show(problem: error.localizedDescription)
            }
            pending = false
            renderAdd()
        }
    }
}
