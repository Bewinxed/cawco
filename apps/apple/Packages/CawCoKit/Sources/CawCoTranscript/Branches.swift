import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The views each item kind draws, for a list that is not the collection:
/// a branch's own transcript inside its card.
@MainActor
enum RowFactory {
    static func make(_ kind: Item.Kind, env: RowEnv) -> any RowContent {
        switch kind {
        case .piece: PieceView(env: env)
        case .user: UserTurnView(env: env)
        case .tool: ToolLineView(env: env)
        case .thinking: ThinkingView(env: env)
        case .system, .harness: SystemLineView(env: env)
        case .peer: PeerView(env: env)
        case .question: QuestionCardView(env: env)
        case .subagent: SubagentView(env: env)
        case .delegate: DelegateView(env: env)
        case .run: RunView(env: env)
        case .livetool: LiveToolView(env: env)
        case .notice, .empty: NoticeView(env: env)
        }
    }

    static func same(_ view: UIView, _ kind: Item.Kind) -> Bool {
        switch kind {
        case .piece: view is PieceView
        case .user: view is UserTurnView
        case .tool: view is ToolLineView
        case .thinking: view is ThinkingView
        case .system, .harness: view is SystemLineView
        case .peer: view is PeerView
        case .question: view is QuestionCardView
        case .subagent: view is SubagentView
        case .delegate: view is DelegateView
        case .run: view is RunView
        case .livetool: view is LiveToolView
        case .notice, .empty: view is NoticeView
        }
    }
}

/// A transcript inside a card (a subagent's, a delegate's): its rows drawn
/// through the same views as the main list, each a row's margin below the last.
final class NestedRows: UIView {
    private let env: RowEnv
    private let stack = UIStackView()
    private var ids: [String] = []
    private var prints: [String] = []
    private var tops: [NSLayoutConstraint] = []

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        pin(stack)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ items: [Item]) {
        let views = stack.arrangedSubviews
        var next: [UIView] = []
        var nextTops: [NSLayoutConstraint] = []
        for (i, item) in items.enumerated() {
            if i < views.count, ids[i] == item.id, let row = views[i].subviews.first, RowFactory.same(row, item.kind) {
                if prints[i] != item.print { (row as? any RowContent)?.configure(item) }
                tops[i].constant = item.top
                next.append(views[i])
                nextTops.append(tops[i])
                continue
            }
            let row = RowFactory.make(item.kind, env: env)
            row.configure(item)
            let box = UIView()
            box.translatesAutoresizingMaskIntoConstraints = false
            row.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(row)
            let top = row.topAnchor.constraint(equalTo: box.topAnchor, constant: item.top)
            NSLayoutConstraint.activate([
                row.leadingAnchor.constraint(equalTo: box.leadingAnchor), row.trailingAnchor.constraint(equalTo: box.trailingAnchor),
                top, row.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            ])
            next.append(box)
            nextTops.append(top)
        }
        for view in views where !next.contains(view) { view.removeFromSuperview() }
        for (i, view) in next.enumerated() where stack.arrangedSubviews.count <= i || stack.arrangedSubviews[i] !== view {
            stack.insertArrangedSubview(view, at: i)
        }
        ids = items.map(\.id)
        prints = items.map(\.print)
        tops = nextTops
    }

    func fade(_ now: Double) {
        for box in stack.arrangedSubviews {
            (box.subviews.first as? PieceView)?.fade(now)
            (box.subviews.first as? ThinkingView)?.fade(now)
        }
    }
}

/// A branch card's identity: its sprite on its hue, filling the glyph cell.
final class BranchMark: UIView {
    private let sprite = GlyphView(.ghost, size: Size.rowMarkGlyph, tint: Palette.markGlyph)
    private let sheen = CAGradientLayer()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        clipsToBounds = true
        layer.addSublayer(sheen)
        addSubview(sprite)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.txWGlyph), heightAnchor.constraint(equalToConstant: Size.txWGlyph),
            sprite.centerXAnchor.constraint(equalTo: centerXAnchor), sprite.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (mark: BranchMark, _: UITraitCollection) in mark.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(seed: String) {
        backgroundColor = SessionMarkView.hue(seed)
        sprite.glyph = SessionMarkView.sprite(seed)
        paint()
    }

    private func paint() { sheen.colors = Palette.markOverlay.colors(for: traitCollection) }

    override func layoutSubviews() {
        super.layoutSubviews()
        sheen.frame = bounds
    }
}

/// A status pill (Subagent/Delegate `.pill`): the phase's words and clock on
/// its wash, meta tabular figures, --radius-xs.
final class PhasePill: ChipLabel {
    enum Tone { case live, attn, done, fail, idle }

    init() {
        super.init(insets: UIEdgeInsets(top: 2, left: Space.space2, bottom: 2, right: Space.space2), radius: Radius.radiusXs)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func set(_ text: String, tone: Tone) {
        let (bg, ink): (UIColor, UIColor) = switch tone {
        case .live: (Palette.statusLiveBg, Palette.statusLiveInk)
        case .attn: (Palette.statusAttnBg, Palette.statusAttnInk)
        case .done: (Palette.statusDoneBg, Palette.statusDoneInk)
        case .fail: (Palette.statusFailBg, Palette.statusFailInk)
        case .idle: (Palette.statusIdleBg, Palette.statusIdleInk)
        }
        backgroundColor = bg
        attributedText = Styled.string(text, TypeScale.typeMeta, color: ink, leading: TypeScale.leadingRoot, tabular: true)
        accessibilityLabel = text
    }
}

/// A line under a branch's head: its words at the text column, a still beat
/// in the glyph cell on the first line when it is live.
final class BeatLine: UIView {
    private let beat = Dot(Size.txBeat, color: Palette.statusLiveGlyph)
    private let text = WrapLabel()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let cell = UIView()
        cell.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(beat)
        addSubview(cell)
        addSubview(text)
        let line = TypeScale.textMeta * TypeScale.leadingBody
        NSLayoutConstraint.activate([
            cell.leadingAnchor.constraint(equalTo: leadingAnchor), cell.topAnchor.constraint(equalTo: topAnchor),
            cell.widthAnchor.constraint(equalToConstant: Size.txWGlyph), cell.heightAnchor.constraint(equalToConstant: line),
            beat.centerXAnchor.constraint(equalTo: cell.centerXAnchor), beat.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            text.leadingAnchor.constraint(equalTo: cell.trailingAnchor, constant: Columns.gap),
            text.trailingAnchor.constraint(equalTo: trailingAnchor),
            text.topAnchor.constraint(equalTo: topAnchor), text.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func set(_ words: String, beat shown: Bool, ink: UIColor = Palette.inkStrong) {
        beat.isHidden = !shown
        text.attributedText = Styled.string(words, TypeScale.typeMeta, color: ink, leading: TypeScale.leadingBody, lineBreak: .byWordWrapping)
    }
}

/// A report closing a branch's card (`.report`): raised, its label in caps.
final class ReportCard: UIView {
    private let label = LineLabel()
    private let text = MessageBody()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusXs
        let column = UIStackView(arrangedSubviews: [label, text])
        column.axis = .vertical
        column.spacing = Space.space2
        pin(column, insets: UIEdgeInsets(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3))
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: ReportCard, _: UITraitCollection) in
            card.layer.draw(Shadow.shadowTile, in: card.traitCollection)
        }
        layer.draw(Shadow.shadowTile, in: traitCollection)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(title: String, body: String, failed: Bool) {
        label.attributedText = NSAttributedString(string: title.uppercased(), attributes: Styled.attributes(TypeScale.typeLabel,
            color: failed ? Palette.statusFailInk : Palette.inkMuted).merging([.kern: TypeScale.trackCaps * TypeScale.textLabel]) { $1 })
        text.configure(body)
    }
}

/// The well a branch's transcript sits in (`.inner`): recessed, --radius-sm,
/// a space-1 padding, reaching out past the text column by it.
final class InnerWell: UIView {
    let rows: NestedRows
    let column = UIStackView()

    init(env: RowEnv) {
        rows = NestedRows(env: env)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        column.axis = .vertical
        column.addArrangedSubview(rows)
        pin(column, insets: UIEdgeInsets(top: Space.space1, left: Space.space1, bottom: Space.space1, right: Space.space1))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// A chevron in the branch head's 13pt cell.
@MainActor
func chevronCell(_ chevron: Chevron) -> UIView {
    let box = UIView()
    box.translatesAutoresizingMaskIntoConstraints = false
    box.addSubview(chevron)
    NSLayoutConstraint.activate([
        box.widthAnchor.constraint(equalToConstant: Size.txChevBox), box.heightAnchor.constraint(equalToConstant: Size.txChevBox),
        chevron.centerXAnchor.constraint(equalTo: box.centerXAnchor), chevron.centerYAnchor.constraint(equalTo: box.centerYAnchor),
    ])
    return box
}

/// A harness subagent (Subagent.svelte): the branch a Task call spawned,
/// folded on the spine — its identity, a status pill with its steps and
/// clock, the line it is on now, and its own transcript when opened.
final class SubagentView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let mark = BranchMark()
    private let type = LineLabel(hug: .defaultHigh, resist: .init(251))
    private let chevron = Chevron(size: Size.iconSm)
    private let title = LineLabel(hug: .init(1), resist: .init(249))
    private let model = LineLabel(hug: .required, resist: .init(250))
    private let pill = PhasePill()
    private let now = BeatLine()
    private let inner: InnerWell
    private let report = ReportCard()
    private let fail = WrapLabel()
    private let reveal: Reveal
    private var key = ""
    private var branch: Branch?
    private var ticker: Timer?

    required init(env: RowEnv) {
        inner = InnerWell(env: env)
        let box = UIView()
        reveal = Reveal(box)
        super.init(env: env)
        let spacer = UIView()
        spacer.setContentHuggingPriority(.init(1), for: .horizontal)
        let head = railLine([mark, type, chevronCell(chevron), title, model, spacer, pill])
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line).isActive = true
        type.widthAnchor.constraint(lessThanOrEqualTo: head.widthAnchor, multiplier: 0.4).isActive = true
        body.addArrangedSubview(head)
        body.addArrangedSubview(now)
        body.setCustomSpacing(Space.space1, after: head)
        inner.column.addArrangedSubview(fail)
        inner.column.addArrangedSubview(report)
        inner.column.setCustomSpacing(Space.space4, after: inner.rows)
        box.pin(hung(inner, offset: env.columns.hang - Space.space1), insets: UIEdgeInsets(top: Space.space2, left: 0, bottom: 0, right: 0))
        body.addArrangedSubview(reveal)
        head.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        head.isAccessibilityElement = true
        head.accessibilityTraits = .button
    }

    @objc private func tap() { env.toggle(key, self) }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        chevron.set(open: open, animated: true)
        if open, let branch { fillInner(branch) }
        return reveal.toggle(open: open)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { ticker?.invalidate(); ticker = nil } else if let branch { tick(branch) }
    }

    /// A running branch's clock re-reads itself once a second.
    private func tick(_ branch: Branch) {
        ticker?.invalidate()
        ticker = nil
        guard branch.running, window != nil else { return }
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { if let self, let branch = self.branch { self.setPill(branch) } }
        }
    }

    /// present.ts `subagentView`: what it is doing, its report, its steps.
    static func view(_ branch: Branch) -> (current: String, report: String, steps: Int) {
        let tools = branch.blocks.filter { $0.type == "tool.use" }
        let said = branch.blocks.last { $0.type == "assistant" && !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let report = branch.result?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? said?.content.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard branch.running else { return ("", report, tools.count) }
        let verbs = ["Read": "Reading", "Write": "Writing", "Edit": "Editing", "NotebookEdit": "Editing", "Bash": "Running",
                     "Grep": "Searching", "Glob": "Globbing", "WebFetch": "Fetching", "WebSearch": "Searching the web",
                     "Task": "Delegating", "TodoWrite": "Updating its plan"]
        func verb(_ name: String) -> String { let tool = name.components(separatedBy: "__").last ?? name; return verbs[tool] ?? tool }
        func step(_ block: Block) -> String {
            let v = verb(block.toolName ?? block.content)
            let glance = Glance.of(block.toolInput)
            return glance.isEmpty ? v : "\(v) \(glance)"
        }
        let current: String
        if let flight = tools.last(where: { $0.toolStatus == "pending" }) { current = step(flight) }
        else if let summary = branch.summary { current = summary }
        else if let writing = branch.streaming.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "\n").last { current = String(writing) }
        else if let last = tools.last { current = step(last) }
        else if let name = branch.lastToolName { current = verb(name) }
        else { current = branch.description ?? "Working" }
        return (current, report, tools.count)
    }

    private func setPill(_ branch: Branch) {
        let failed = branch.status == "error"
        let phase = failed ? "failed" : branch.running ? "running" : "done"
        let steps = Self.view(branch).steps
        let end = branch.completedAt ?? Date()
        let elapsed = formatDuration(end.timeIntervalSince(branch.startedAt ?? end))
        pill.set(phase + (steps > 0 ? " · \(steps) step\(steps == 1 ? "" : "s")" : "") + " · \(elapsed)",
                 tone: failed ? .fail : branch.running ? .live : .done)
    }

    func configure(_ item: Item) {
        guard case let .subagent(branch, spawn) = item.kind else { return }
        place()
        self.branch = branch
        key = spawn.disclosureKey
        mark.configure(seed: branch.toolUseId.isEmpty ? branch.subagentType : branch.toolUseId)
        type.attributedText = Styled.string(branch.subagentType, TypeScale.typeLabel, color: Palette.inkStrong, size: TypeScale.textLabel,
                                            leading: TypeScale.leadingRoot, mono: true)
        let named = branch.description ?? spawn.string("subagentDescription") ?? branch.subagentType
        title.attributedText = Styled.string(named, TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingRoot)
        title.isHidden = named == branch.subagentType
        let modelId = branch.model ?? spawn.string("subagentModel")
        model.attributedText = modelId.map { Styled.string(env.modelLabel($0), TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingRoot) }
        model.isHidden = modelId == nil
        setPill(branch)
        tick(branch)
        let view = Self.view(branch)
        if branch.running {
            now.set(view.current, beat: true)
            now.isHidden = false
        } else if branch.status == "error", let error = branch.error {
            now.set(headline(error), beat: false, ink: Palette.statusFailInk)
            now.isHidden = false
        } else if !view.report.isEmpty {
            now.set(headline(view.report), beat: false)
            now.isHidden = false
        } else { now.isHidden = true }
        let open = env.isOpen(key)
        chevron.set(open: open, animated: false)
        if open { fillInner(branch) }
        reveal.set(open: open)
        let head = body.arrangedSubviews.first
        head?.accessibilityLabel = "\(branch.subagentType), \(named)"
        head?.accessibilityValue = (open ? "Expanded" : "Collapsed") + ", " + (pill.accessibilityLabel ?? "")
    }

    private func fillInner(_ branch: Branch) {
        let builder = Builder(agentName: branch.subagentType, cache: env.cache)
        var voices = Voices()
        // Subagent.svelte draws a question as a call on its rail, and no nested folds.
        let rows = Fold.rows(branch.blocks, branches: [:], voices: &voices).compactMap { row -> Row? in
            switch row {
            case let .question(key, block): .tools(key: key, blocks: [block])
            case .subagent, .delegate, .run, .harness: nil
            default: row
            }
        }
        var items = builder.items(rows).items
        if !branch.streaming.isEmpty {
            items += builder.pieces(id: "branch:stream", sources: [.init(text: branch.streaming)], grouped: true, date: nil, streaming: true)
                .enumerated().map { i, item in var each = item; if i == 0 { each.top = Space.space4 }; return each }
        }
        inner.rows.configure(items)
        let failed = branch.status == "error"
        fail.isHidden = !(failed && branch.error != nil)
        if let error = branch.error {
            fail.attributedText = Styled.string(error, TypeScale.typeBody, color: Palette.statusFailInk, lineBreak: .byWordWrapping)
        }
        let report = Self.view(branch).report
        self.report.isHidden = failed || report.isEmpty
        if !report.isEmpty { self.report.configure(title: "Report", body: report, failed: false) }
    }
}

/// `getToolGlance` (@cawco/core): a call's most telling argument, one line.
enum Glance {
    static func of(_ input: [String: Any]) -> String {
        for key in ["file_path", "filePath", "path", "command", "pattern", "query", "url", "description", "skill", "prompt"] {
            if let text = input[key] as? String, !text.isEmpty {
                let line = text.split(separator: "\n").first.map(String.init) ?? text
                return String(line.prefix(80))
            }
        }
        return ""
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

/// A fleet delegate (Delegate.svelte): a session this one spawned, folded on
/// the spine — its handle, kind, the phase its pulse and record say, its
/// brief, what it is doing, the asks it is waiting on, and its own
/// transcript and last report when opened.
final class DelegateView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let mark = BranchMark()
    private let handle = LineLabel(hug: .defaultHigh, resist: .init(249))
    private let chevron = Chevron(size: Size.iconSm)
    private let kind = ChipLabel(insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space2), radius: Radius.radiusXs)
    private let may = LineLabel(hug: .required, resist: .required)
    private let pill = PhasePill()
    private let jump = UIButton(type: .system)
    private let brief = WrapLabel()
    private let status = BeatLine()
    private let asks = UIStackView()
    private let inner: InnerWell
    private let report = ReportCard()
    private let empty = WrapLabel()
    private let reveal: Reveal
    private var key = ""
    private var id: String?
    private var block: Block?
    private var ticker: Timer?

    required init(env: RowEnv) {
        inner = InnerWell(env: env)
        let box = UIView()
        reveal = Reveal(box)
        super.init(env: env)
        kind.layer.borderWidth = 1
        let spacer = UIView()
        spacer.setContentHuggingPriority(.init(1), for: .horizontal)
        let trigger = railLine([mark, handle, chevronCell(chevron), kind, may, spacer, pill])
        jump.setImage(Glyph.external.image, for: .normal)
        jump.tintColor = Palette.inkMuted
        jump.imageView?.contentMode = .scaleAspectFit
        jump.imageEdgeInsets = UIEdgeInsets(top: (Size.txLine - Size.iconSm) / 2, left: (Size.txLine - Size.iconSm) / 2,
                                            bottom: (Size.txLine - Size.iconSm) / 2, right: (Size.txLine - Size.iconSm) / 2)
        jump.addAction(UIAction { [weak self] _ in if let self, let id { env.openSession(id) } }, for: .touchUpInside)
        let head = railLine([trigger, jump], spacing: Space.space1)
        NSLayoutConstraint.activate([
            head.heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line),
            jump.widthAnchor.constraint(equalToConstant: Size.txLine), jump.heightAnchor.constraint(equalToConstant: Size.txLine),
        ])
        body.addArrangedSubview(head)
        body.addArrangedSubview(hung(brief))
        body.addArrangedSubview(status)
        asks.axis = .vertical
        asks.spacing = Space.spaceRow
        body.addArrangedSubview(asks)
        body.setCustomSpacing(Space.space1, after: head)
        inner.column.insertArrangedSubview(empty, at: 0)
        inner.column.addArrangedSubview(report)
        inner.column.setCustomSpacing(Space.space4, after: inner.rows)
        box.pin(hung(inner, offset: env.columns.hang - Space.space1), insets: UIEdgeInsets(top: Space.space2, left: 0, bottom: 0, right: 0))
        body.addArrangedSubview(reveal)
        trigger.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        trigger.isAccessibilityElement = true
        trigger.accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: DelegateView, _: UITraitCollection) in
            view.kind.layer.borderColor = Palette.borderHairline.resolvedColor(with: view.traitCollection).cgColor
        }
        kind.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    @objc private func tap() { env.toggle(key, self) }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        chevron.set(open: open, animated: true)
        if let id { env.watchDelegate(id, open) }
        if let block { configureBody(block, open: open) }
        return reveal.toggle(open: open)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { ticker?.invalidate(); ticker = nil }
    }

    enum Phase: String { case spawning, working, blocked, reported, idle, sleeping, stopped, failed }

    struct Report { let body: String; let failed: Bool; let count: Int; let at: Date? }

    private func facts(_ block: Block) -> (phase: Phase, report: Report?, asks: [String], failure: String, row: InstanceRow?) {
        let id = block.string("delegateInstanceId")
        let row = id.flatMap { env.hub?.fleet.byId[$0] }
        let parent = env.parentBlocks()
        // Its reports and asks, read back out of this transcript's own peer lines.
        let peers = id.map { id in parent.filter { $0.type == "user.peer" && $0.meta["reportKind"] != nil && Self.matches($0.string("peerSession"), id) } } ?? []
        let report = peers.last.map { Report(body: $0.content, failed: $0.string("reportKind") == "failed", count: peers.count, at: $0.date) }
        var waiting: [String] = []
        if let id {
            for ask in parent where ask.type == "user.delegate_ask" && Self.matches(ask.string("peerSession"), id) {
                let answered = ask.string("askRequestId").map { request in
                    parent.contains { $0.type == "tool.use" && ($0.toolName ?? "").contains("answer_delegate") && Builder.print($0).contains(request) }
                } ?? false
                if !answered { waiting.append(Asks.short(ask.content)) }
            }
        }
        let spawnFailed = id == nil && block.toolStatus == "error"
        let activity = id.flatMap { env.hub?.fleet.pulses[$0]?.activity.rawValue } ?? "idle"
        let live = row?.status == .running || row?.status == .starting
        let phase: Phase
        if spawnFailed || row?.status == .error { phase = .failed }
        else if id == nil { phase = .spawning }
        else if !waiting.isEmpty || activity == "blocked" { phase = .blocked }
        else if live, activity == "working" { phase = .working }
        else if row?.status == .sleeping { phase = .sleeping }
        else if row?.status == .stopped { phase = .stopped }
        else { phase = report == nil ? .idle : .reported }
        let failure = spawnFailed ? headline(block.toolResult ?? "The spawn failed.")
            : (row?.lastError ?? (report?.failed == true ? headline(report?.body ?? "") : ""))
        return (phase, report, waiting, failure, row)
    }

    /// present.ts `matchesSession`: the full id, or its 8-character prefix.
    static func matches(_ peer: String?, _ id: String) -> Bool {
        guard let peer else { return false }
        return peer == id || (peer.count >= 8 && id.hasPrefix(peer))
    }

    func configure(_ item: Item) {
        guard case let .delegate(block) = item.kind else { return }
        place()
        self.block = block
        key = block.disclosureKey
        let input = block.toolInput
        id = block.string("delegateInstanceId")
        let f = facts(block)
        let stub = block.content.split(separator: "/").last.map(String.init)
        let label = f.row.map { "\(ToolDescriptor.pathLeaf($0.cwd))#\($0.id.prefix(8))" }
            ?? id.map { "\(stub ?? "session")#\($0.prefix(8))" } ?? stub ?? "delegate"
        mark.configure(seed: id ?? block.toolId ?? block.id)
        handle.attributedText = Styled.string(label, TypeScale.typeLabel, color: Palette.inkStrong, size: TypeScale.textLabel,
                                              leading: TypeScale.leadingRoot, mono: true)
        let started = block.string("handoffKind") == "start"
        let type = started ? "session" : (input["type"] as? String ?? "")
        kind.attributedText = Styled.string(type, TypeScale.typeMeta, color: Palette.inkStrong, leading: Size.cRowMark / TypeScale.textMeta)
        kind.isHidden = type.isEmpty
        let mayDelegate = f.row?.canDelegate == true || input["can_delegate"] as? Bool == true
        may.attributedText = Styled.string("may delegate", TypeScale.typeMeta, color: Palette.brandInk, leading: TypeScale.leadingRoot)
        may.isHidden = !mayDelegate
        jump.isHidden = id == nil
        jump.accessibilityLabel = "Open \(label) in its own view"
        let tone: PhasePill.Tone = switch f.phase {
        case .failed: .fail
        case .blocked: .attn
        case .spawning, .working: .live
        case .reported: .done
        default: .idle
        }
        let inFlight = f.phase == .spawning || f.phase == .working
        let start = block.date
        let words = [f.phase == .reported ? "" : (f.phase == .blocked ? "needs an answer" : f.phase.rawValue),
                     f.report.map { "\($0.count) report\($0.count == 1 ? "" : "s")" } ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
        let reportAt = f.report?.at
        let setPill: @MainActor () -> Void = { [weak self] in
            guard let self else { return }
            var text = words
            let end = inFlight ? Date() : reportAt
            if let start, let end, end > start { text += (words.isEmpty ? "" : " · ") + formatDuration(end.timeIntervalSince(start)) }
            pill.set(text, tone: tone)
        }
        setPill()
        ticker?.invalidate()
        ticker = inFlight ? Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in MainActor.assumeIsolated { setPill() } } : nil
        let briefText = block.string("handoffBrief") ?? ""
        brief.attributedText = Styled.string(headline(briefText), TypeScale.typeBody, color: Palette.inkMuted,
                                             leading: TypeScale.leadingBody, lineBreak: .byCharWrapping)
        brief.superview?.isHidden = briefText.isEmpty
        asks.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for short in f.asks { asks.addArrangedSubview(AskLine(short)) }
        asks.isHidden = f.asks.isEmpty
        let open = env.isOpen(key)
        chevron.set(open: open, animated: false)
        configureBody(block, open: open)
        reveal.set(open: open)
        let trigger = (body.arrangedSubviews.first as? UIStackView)?.arrangedSubviews.first
        trigger?.accessibilityLabel = "\(label) \(type)"
        trigger?.accessibilityValue = (open ? "Expanded" : "Collapsed") + ", " + (pill.accessibilityLabel ?? "")
    }

    /// The line under the head, and — open — the delegate's transcript and report.
    private func configureBody(_ block: Block, open: Bool) {
        let f = facts(block)
        switch f.phase {
        case .working:
            let tool = id.flatMap { env.hub?.fleet.pulses[$0]?.currentTool }
            status.set(tool.map { "\($0.name) \($0.glance)".trimmingCharacters(in: .whitespaces) } ?? "working", beat: true)
            status.isHidden = false
        case .spawning:
            status.set("starting", beat: true)
            status.isHidden = false
        case .failed where !f.failure.isEmpty:
            status.set(f.failure, beat: false, ink: Palette.statusFailInk)
            status.isHidden = false
        default:
            if let report = f.report, !open {
                status.set(headline(report.body), beat: false, ink: report.failed ? Palette.statusFailInk : Palette.inkStrong)
                status.isHidden = false
            } else { status.isHidden = true }
        }
        guard open else { return }
        let builder = Builder(agentName: f.row?.harness ?? (block.toolInput["harness"] as? String) ?? "delegate", cache: env.cache)
        if let id, let transcript = env.delegateTranscript(id) {
            let blocks = transcript.blocks.compactMap(Block.init)
            var branches: [String: Branch] = [:]
            for page in transcript.branches {
                if let branch = Branch(page, blocks: page.value2.blocks.compactMap(Block.init), streaming: "") { branches[branch.toolUseId] = branch }
            }
            var voices = Voices()
            var items = builder.items(Fold.rows(blocks, branches: branches, voices: &voices)).items
            if let streaming = transcript.tail?.streaming, !streaming.isEmpty {
                items += builder.pieces(id: "delegate:stream", sources: [.init(text: streaming)], grouped: true, date: nil, streaming: true)
            }
            inner.rows.configure(items)
            let said: String? = transcript.loading && blocks.isEmpty ? "Loading its transcript…"
                : transcript.error.map { "Its transcript couldn't be read: \($0)" } ?? (blocks.isEmpty ? "Nothing in its transcript yet." : nil)
            empty.attributedText = said.map { Styled.string($0, TypeScale.typeMeta, color: Palette.inkMuted, lineBreak: .byWordWrapping) }
            empty.isHidden = said == nil
        } else {
            inner.rows.configure([])
            empty.attributedText = Styled.string("Still starting — no transcript to show.", TypeScale.typeMeta, color: Palette.inkMuted)
            empty.isHidden = false
        }
        if let report = f.report {
            self.report.configure(title: (report.failed ? "Report — failed" : "Report") + (report.count > 1 ? " · latest of \(report.count)" : ""),
                                  body: report.body, failed: report.failed)
            self.report.isHidden = false
        } else { self.report.isHidden = true }
    }
}

/// An ask still waiting on an answer, in a delegate's register.
final class AskLine: UIView {
    init(_ short: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let cell = UIView()
        cell.translatesAutoresizingMaskIntoConstraints = false
        let dot = Dot(Size.txBeat, color: Palette.statusAttnInk)
        cell.addSubview(dot)
        let state = LineLabel(hug: .required, resist: .required)
        state.attributedText = NSAttributedString(string: "PENDING", attributes: Styled.attributes(TypeScale.typeMeta, color: Palette.statusAttnInk)
            .merging([.kern: TypeScale.trackCaps * TypeScale.textMeta]) { $1 })
        let words = WrapLabel()
        words.attributedText = Styled.string(short, TypeScale.typeBody, color: Palette.inkStrong, lineBreak: .byCharWrapping)
        let row = UIStackView(arrangedSubviews: [cell, state, words])
        row.spacing = Columns.gap
        row.alignment = .firstBaseline
        pin(row)
        let line = TypeScale.textBody * TypeScale.leadingBody
        NSLayoutConstraint.activate([
            cell.widthAnchor.constraint(equalToConstant: Size.txWGlyph), cell.heightAnchor.constraint(equalToConstant: line),
            dot.centerXAnchor.constraint(equalTo: cell.centerXAnchor), dot.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// present.ts `askShort`: a routed ask's one-line form.
enum Asks {
    static func short(_ body: String) -> String {
        guard let match = body.wholeMatch(of: /(?s)([A-Za-z_][\w-]*) — (\{.*\})/),
              let input = try? JSONSerialization.jsonObject(with: Data(String(match.2).utf8)) as? [String: Any] else {
            return body.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init) ?? body
        }
        let tool = String(match.1)
        if let questions = input["questions"] as? [[String: Any]], let first = questions.first {
            return "Q1: \(first["question"] as? String ?? "")"
        }
        if let path = (input["filepath"] ?? input["filePath"] ?? input["path"]) as? String { return "\(tool) \(ToolDescriptor.pathLeaf(path))" }
        if let command = input["command"] as? String { return "\(tool) \(command.prefix(80))" }
        return tool
    }
}

/// A run's step, as the run's detail reads it (RunSteps.svelte).
struct RunStep {
    let id: String
    let status: String
    let title: String
    let started: Date?
    let ended: Date?
}

/// A workflow run where it was started (RunBlock.svelte): its status mark,
/// its name, how far along, its failure, and its steps under it.
final class RunView: RailRow, RowContent {
    private let mark = UIView()
    private let glyph = SessionStatusView(.unknown, compact: true)
    private let name = LineLabel(hug: .defaultHigh, resist: .defaultLow)
    private let progress = LineLabel(hug: .required, resist: .required)
    private let failure = WrapLabel()
    private let steps = UIStackView()
    private var runId: String?
    private var ticker: Timer?

    required init(env: RowEnv) {
        super.init(env: env)
        mark.translatesAutoresizingMaskIntoConstraints = false
        glyph.translatesAutoresizingMaskIntoConstraints = false
        mark.addSubview(glyph)
        let spacer = UIView()
        spacer.setContentHuggingPriority(.init(1), for: .horizontal)
        let head = railLine([mark, name, spacer, progress])
        NSLayoutConstraint.activate([
            head.heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line),
            mark.widthAnchor.constraint(equalToConstant: Size.txWGlyph), mark.heightAnchor.constraint(equalToConstant: Size.txWGlyph),
            glyph.leadingAnchor.constraint(equalTo: mark.leadingAnchor), glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
        ])
        body.addArrangedSubview(head)
        body.addArrangedSubview(hung(failure))
        body.setCustomSpacing(Space.space1, after: head)
        steps.axis = .vertical
        steps.spacing = Space.spaceRow
        body.addArrangedSubview(steps)
        head.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(openRun)))
        head.isAccessibilityElement = true
        head.accessibilityTraits = .link
    }

    @objc private func openRun() { if let runId { env.openRun(runId) } }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { ticker?.invalidate(); ticker = nil }
    }

    func configure(_ item: Item) {
        guard case let .run(block, anchored) = item.kind else { return }
        place()
        let runId = anchored ?? Fold.startedRun(block)
        self.runId = runId
        let fleet = env.hub?.fleet
        let run = runId.flatMap { fleet?.runs[$0] }
        let detail = runId.map { env.runSteps($0) } ?? []
        let refused = runId == nil && block.toolStatus == "error"
        let named = run.flatMap { fleet?.workflowNames[$0.workflowId] } ?? (block.toolInput["name"] as? String) ?? "Workflow"
        name.attributedText = Styled.string(named, TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot)
        glyph.isHidden = run == nil
        if let run { glyph.configure(Self.status(run.status.rawValue)) }
        let going = run?.status == .running || run?.status == .waiting
        let setProgress: @MainActor () -> Void = { [weak self] in
            guard let self else { return }
            var text = ""
            if let run {
                let end = run.endedAt ?? Date().timeIntervalSince1970 * 1000
                let took = formatDuration(max(0, end - run.startedAt) / 1000)
                let passed = detail.filter { $0.status == "passed" }.count
                text = detail.isEmpty ? took : "\(passed)/\(detail.count) steps · \(took)"
            } else if !refused { text = "starting" }
            progress.attributedText = Styled.string(text, TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingRoot, tabular: true)
        }
        setProgress()
        ticker?.invalidate()
        ticker = going ? Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in MainActor.assumeIsolated { setProgress() } } : nil
        let failed = refused ? (block.toolResult ?? "The run did not start.") : run?.failure
        failure.attributedText = failed.map { Styled.string($0, TypeScale.typeMeta, color: Palette.statusFailInk, leading: TypeScale.leadingBody, lineBreak: .byCharWrapping) }
        failure.superview?.isHidden = failed == nil
        steps.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for step in detail.sorted(by: { ($0.started ?? .distantFuture) < ($1.started ?? .distantFuture) }) {
            steps.addArrangedSubview(StepLine(step, env: env))
        }
        steps.isHidden = steps.arrangedSubviews.isEmpty
        body.arrangedSubviews.first?.accessibilityLabel = "\(named), \(progress.text ?? "")"
    }

    /// A step's or run's status on the session scale (SessionStatus.svelte `STEP`).
    static func status(_ status: String) -> SessionStatusView.Face {
        switch status {
        case "running": .working
        case "waiting": .needsYou
        case "held": .held
        case "failed": .failed
        case "passed": .passed
        case "done": .done
        case "pending": .pending
        case "skipped": .skipped
        case "cancelled": .cancelled
        default: .unknown
        }
    }
}

/// A run's step on the run's rail: its status glyph, title and time.
final class StepLine: UIView {
    init(_ step: RunStep, env: RowEnv) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let glyph = SessionStatusView(RunView.status(step.status), compact: true)
        let title = LineLabel(hug: .defaultLow, resist: .defaultLow)
        title.attributedText = Styled.string(step.title, TypeScale.typeBody, color: step.status == "failed" ? Palette.statusFailInk : Palette.inkStrong)
        let time = LineLabel(hug: .required, resist: .required)
        let end = step.ended ?? Date()
        time.attributedText = step.started.map { Styled.string(formatDuration(end.timeIntervalSince($0)), TypeScale.typeMeta, color: Palette.inkMuted, tabular: true) }
        let row = railLine([glyph, title, time])
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.txLine).isActive = true
        pin(row, insets: UIEdgeInsets(top: 0, left: env.columns.hang, bottom: 0, right: 0))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// Where the list has nothing to draw: "Loading transcript…" while the read
/// is out (Transcript `.empty`), or, once it says the conversation is empty,
/// the one empty state (EmptyState, app.css `.kit-empty`).
final class NoticeView: UIView, RowContent {
    private let mark = GlyphView(.chat, size: Size.iconLg, tint: Palette.inkMuted)
    private let title = WrapLabel()
    private let line = WrapLabel()
    private let column = UIStackView()
    private var inset: (top: NSLayoutConstraint, bottom: NSLayoutConstraint)!

    init(env _: RowEnv) {
        super.init(frame: .zero)
        column.axis = .vertical
        column.alignment = .leading
        column.spacing = Space.space2
        for view in [mark, title, line] { column.addArrangedSubview(view) }
        column.setCustomSpacing(Space.space2 + Space.space1, after: mark)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let top = column.topAnchor.constraint(equalTo: topAnchor)
        let bottom = column.bottomAnchor.constraint(equalTo: bottomAnchor)
        inset = (top, bottom)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor), column.trailingAnchor.constraint(equalTo: trailingAnchor), top, bottom,
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ item: Item) {
        switch item.kind {
        case let .notice(text):
            mark.isHidden = true
            title.isHidden = true
            line.attributedText = Styled.string(text, TypeScale.typeMeta, color: Palette.inkMuted, lineBreak: .byWordWrapping)
            inset.top.constant = Space.space5
            inset.bottom.constant = -Space.space5
        case .empty:
            mark.isHidden = false
            title.isHidden = false
            title.attributedText = NSAttributedString(string: "No messages yet", attributes: TypeScale.typeTitle.attributes(
                color: Palette.inkStrong, tracking: TypeScale.trackTitle))
            line.attributedText = Styled.string("Send the first instruction below — / lists this session's commands, @ names a machine or session.",
                                                TypeScale.typeBody, color: Palette.inkMuted, lineBreak: .byWordWrapping)
            inset.top.constant = Space.space6
            inset.bottom.constant = -Space.space6
        default: return
        }
        accessibilityElements = [title, line].filter { !$0.isHidden }
    }
}
