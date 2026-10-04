import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

/// Which session the board is peeking (PeekPane.svelte `PeekTarget`).
struct PeekTarget {
    /// The instance the peek is watching.
    let viewId: String
    /// What the board row the peek came from calls it.
    let title: String
}

/// The glance → peek → dive loop's middle step (home/peek.svelte.ts,
/// PeekSheet.svelte): any home row or Needs-you card can peek, and one sheet
/// shows it. On a touch screen or a narrow window it rises from the bottom,
/// 80% of the screen tall from its first frame; with a fine pointer it comes
/// in from the right, beside the home it was opened from.
@MainActor
enum Peek {
    /// `(hover: none), (pointer: coarse), (max-width: 640px)`.
    private static func rises(in presenter: UIViewController) -> Bool {
        presenter.traitCollection.userInterfaceIdiom != .mac || (presenter.view.window?.bounds.width ?? 0) <= 640
    }

    /// `open`: dives into the session, as its row does.
    static func show(_ target: PeekTarget, hub: HubConnection, home: HomeModel, from presenter: UIViewController, open: @escaping (String) -> Void) {
        let bottom = rises(in: presenter)
        let pane = PeekController(hub: hub, home: home, target: target, fills: bottom ? .sheet : .side)
        let sheet = HouseSheetController(pane, style: bottom ? .card : .side, scroller: pane.scroller)
        sheet.footAtSafeArea = bottom
        pane.onDive = { [weak sheet] id in
            sheet?.dismiss(animated: true)
            open(id)
        }
        pane.onClose = { [weak sheet] in sheet?.dismiss(animated: true) }
        presenter.present(sheet, animated: true)
    }
}

/// A row of a glyph and its words that lines up, in a baseline-aligned line, by its words.
private final class BaselineRow: UIStackView {
    weak var words: UIView?
    override var forFirstBaselineLayout: UIView { words ?? self }
    override var forLastBaselineLayout: UIView { words ?? self }
}

/// A peek (PeekPane.svelte): what one session is actually doing, without
/// leaving the board. It shows the tail of the conversation rather than the
/// conversation: who it is and where it runs, what it is doing, what it is
/// parked on, its plan, and the last handful of turns with the live text
/// still arriving. Anything that needs reading properly is a dive.
///
/// It is a live view: it keeps the session's transcript open for as long as
/// it stands, exactly like an open tab, and lets it go when it is put away.
final class PeekController: ObservedViewController {
    enum Fill { case sheet, side }

    private let hub: HubConnection
    private let home: HomeModel
    private let target: PeekTarget
    private let fill: Fill
    /// Puts the peek away and opens a session: the one peeked, or its fork.
    var onDive: (String) -> Void = { _ in }
    var onClose: () -> Void = {}

    private func onOpen() { onDive(target.viewId) }

    private let column = UIStackView()
    // Header.
    private let folder = GlyphView(.folder, size: Size.iconMd)
    private let titleLabel = KitLabel(TypeScale.typeBody.with(weight: .medium), ink: Palette.foreground)
    private let osMark = GlyphView(.server, size: 14, tint: Palette.mutedForeground)
    private let hostLabel = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private let cwdLabel = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.mutedForeground)
    private let header = UIView()
    // What it is doing.
    private let mark = SessionMarkView()
    private let stateLabel = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private let toolName = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private let toolDot = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    private let toolGlance = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.mutedForeground)
    private let meter = ContextMeterView()
    // What it is parked on, why it failed, its plan.
    private let asks = UIStackView()
    private let note = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground, lines: 0)
    private let noteBox = UIView()
    private let tasksBox = UIStackView()
    private let tasksTitle = KitLabel(TypeScale.typeLabel, ink: Palette.foreground)
    private let tasksScroll = UIScrollView()
    private let tasks: TaskPanelView
    private let tail: PeekTailView
    private var height: NSLayoutConstraint?

    /// What the asks last drew, so a pulse does not rebuild their buttons.
    private var askPrint = ""
    private var usage: ContextUsage?
    private var contextAsked = false

    /// The tail, which hands a downward pull at its top to the sheet.
    var scroller: UIScrollView { tail }

    init(hub: HubConnection, home: HomeModel, target: PeekTarget, fills fill: Fill) {
        self.hub = hub
        self.home = home
        self.target = target
        self.fill = fill
        tasks = TaskPanelView(hub: hub, instanceId: target.viewId, dense: true)
        tail = PeekTailView(hub: hub, instanceId: target.viewId)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PeekController is built in code")
    }

    // MARK: The session

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // A peek is a live view: it reads the session as an open tab does.
        hub.sessions.setPeeked(target.viewId)
        // A peek is the one moment a session's plan is looked at from the board.
        hub.tasks.refresh(target.viewId)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || parent?.isBeingDismissed == true { hub.sessions.setPeeked(nil) }
    }

    private var row: InstanceRow? { hub.fleet.byId[target.viewId] }

    private func refreshContext() {
        guard let row, row.isLive else { return }
        Task { [weak self, hub, id = target.viewId] in
            guard let usage = try? await hub.contextUsage(instanceId: id, machineId: row.machineId) else { return }
            self?.usage = usage
            self?.requestRefresh()
        }
    }

    // MARK: Layout

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: view.topAnchor),
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        if fill == .sheet {
            // The peek holds its size from the first frame: it opens on "Reading…" and the
            // tail arrives into a sheet already its height.
            let tall = view.heightAnchor.constraint(equalToConstant: 400)
            tall.priority = .required - 1
            tall.isActive = true
            height = tall
        }
        buildHeader()
        buildStatus()
        asks.axis = .vertical
        column.addArrangedSubview(asks)
        buildNote()
        buildTasks()
        column.addArrangedSubview(seam())
        column.addArrangedSubview(tail)
        tail.setContentHuggingPriority(.init(1), for: .vertical)
        tail.setContentCompressionResistancePriority(.init(1), for: .vertical)
        view.accessibilityLabel = "Peek"
    }

    /// `.peek-sheet { height: 80dvh }`: the content box is 80% of the screen
    /// tall, the pane inside it under its padding and grabber (16 + 16 + 6)
    /// and above the safe area.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let height, let window = view.window else { return }
        let tall = (window.bounds.height * 0.8 - 38 - window.safeAreaInsets.bottom).rounded()
        if height.constant != tall { height.constant = tall }
    }

    /// `border-t border-border/50`.
    private func seam() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.border.withAlphaComponent(0.5)
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    private func inset(_ view: UIView, into box: UIView, top: Double, bottom: Double, side: Double = 16) {
        view.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: box.topAnchor, constant: top),
            view.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -bottom),
            view.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: side),
            view.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -side),
        ])
    }

    private func buildHeader() {
        titleLabel.text = target.title
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        titleLabel.accessibilityTraits = .header
        let title = UIStackView(arrangedSubviews: [folder, titleLabel])
        title.spacing = 8
        title.alignment = .center
        for fixed in [hostLabel, osMark] as [UIView] {
            fixed.setContentHuggingPriority(.required, for: .horizontal)
            fixed.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        let machine = BaselineRow(arrangedSubviews: [osMark, hostLabel])
        machine.words = hostLabel
        machine.spacing = 6
        machine.alignment = .center
        // Truncated from the left, as every path in the app is: the leaf tells two checkouts apart.
        cwdLabel.lineBreakMode = .byTruncatingHead
        cwdLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        // `items-baseline`: the host and the mono path share a baseline, and the line is as tall as that takes.
        // The mono path shares the host's baseline, which sets its box at the line's foot.
        let path = UIStackView(arrangedSubviews: [cwdLabel])
        path.isLayoutMarginsRelativeArrangement = true
        path.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 58.0 / 3 - TypeScale.typeMeta.lineHeight, leading: 0, bottom: 0, trailing: 0)
        let meta = UIStackView(arrangedSubviews: [machine, path, UIView()])
        meta.spacing = 8
        meta.alignment = .top
        // What that comes to on the web, measured: the mono face sits lower in its line than the body face.
        meta.heightAnchor.constraint(equalToConstant: 58.0 / 3).isActive = true
        let words = UIStackView(arrangedSubviews: [title, meta])
        words.axis = .vertical
        let open = KitButton.make("Open", variant: .ghost, height: .sm) { [weak self] in self?.onOpen() }
        open.setContentHuggingPriority(.required, for: .horizontal)
        open.setContentCompressionResistancePriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [words, open])
        line.spacing = 8
        line.alignment = .top
        header.translatesAutoresizingMaskIntoConstraints = false
        line.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(line)
        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: header.topAnchor, constant: 12),
            line.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -12),
            line.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            // The button's `-mr-1.5`.
            line.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -(16 - 6)),
        ])
        column.addArrangedSubview(header)
        _ = ContextMenuHost.attach(to: header) { [weak self] _ in self?.menu() }
    }

    /// The header's menu: Open, Fork, Stop while it runs, and Close peek.
    private func menu() -> UIMenu {
        let row = row
        let machine = row.flatMap { row in hub.fleet.machines.first { $0.machineId == row.machineId } }
        let forkable = row?.sessionId
        var first: [UIMenuElement] = [
            UIAction(title: "Open", image: Glyph.external.image) { [weak self] _ in self?.onOpen() },
            UIAction(title: "Fork", image: Glyph.fork.image, attributes: forkable != nil && machine != nil ? [] : .disabled) { [weak self] _ in
                guard let self, let row, let key = forkable else { return }
                Task { @MainActor [hub, weak self] in
                    do {
                        let forked = try await hub.fork(machineId: row.machineId, cwd: row.cwd, sessionKey: key,
                                                        harness: row.harness.flatMap { .init(rawValue: $0) } ?? .claude)
                        self?.onDive(forked)
                    } catch {
                        Toast.error(error.localizedDescription, in: self?.view)
                    }
                }
            },
        ]
        if let row, row.isLive {
            first.append(UIAction(title: "Stop", image: Glyph.stop.image) { [hub] _ in
                Task { @MainActor in try? await hub.stopSession(instanceId: row.id, machineId: row.machineId) }
            })
        }
        let close = UIAction(title: "Close peek", image: Glyph.close.image) { [weak self] _ in self?.onClose() }
        return UIMenu(children: [UIMenu(options: .displayInline, children: first), UIMenu(options: .displayInline, children: [close])])
    }

    private func buildStatus() {
        toolDot.text = "·"
        toolGlance.lineBreakMode = .byTruncatingTail
        toolGlance.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        for fixed in [stateLabel, toolName, toolDot] {
            fixed.setContentHuggingPriority(.required, for: .horizontal)
            fixed.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        let tool = UIStackView(arrangedSubviews: [toolName, toolDot, toolGlance])
        tool.spacing = 6
        tool.alignment = .firstBaseline
        let line = UIStackView(arrangedSubviews: [mark, stateLabel, tool, UIView(), meter])
        line.spacing = 8
        line.alignment = .center
        line.setCustomSpacing(8, after: tool)
        let box = UIView()
        inset(line, into: box, top: 0, bottom: 12)
        column.addArrangedSubview(box)
        meter.presenter = { [weak self] in self }
        meter.onRefresh = { [weak self] in self?.refreshContext() }
        toolBox = tool
    }

    private var toolBox: UIView!

    private func buildNote() {
        let line = seam()
        line.translatesAutoresizingMaskIntoConstraints = false
        noteBox.addSubview(line)
        inset(note, into: noteBox, top: 12 + 1, bottom: 12)
        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: noteBox.topAnchor),
            line.leadingAnchor.constraint(equalTo: noteBox.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: noteBox.trailingAnchor),
        ])
        column.addArrangedSubview(noteBox)
    }

    /// What it set out to do, before what it last said about doing it.
    /// Capped, because a peek is a glance: a forty-task plan scrolls inside
    /// its own section rather than pushing the tail off.
    private func buildTasks() {
        tasksBox.axis = .vertical
        tasksBox.addArrangedSubview(seam())
        let title = UIView()
        inset(tasksTitle, into: title, top: 12, bottom: 4)
        tasksBox.addArrangedSubview(title)
        tasksScroll.translatesAutoresizingMaskIntoConstraints = false
        tasksScroll.addSubview(tasks)
        let fits = tasksScroll.heightAnchor.constraint(equalTo: tasks.heightAnchor)
        fits.priority = .defaultHigh
        NSLayoutConstraint.activate([
            tasks.topAnchor.constraint(equalTo: tasksScroll.contentLayoutGuide.topAnchor),
            tasks.bottomAnchor.constraint(equalTo: tasksScroll.contentLayoutGuide.bottomAnchor),
            tasks.leadingAnchor.constraint(equalTo: tasksScroll.frameLayoutGuide.leadingAnchor, constant: 8),
            tasks.trailingAnchor.constraint(equalTo: tasksScroll.frameLayoutGuide.trailingAnchor, constant: -8),
            tasksScroll.heightAnchor.constraint(lessThanOrEqualToConstant: 192),
            fits,
        ])
        tasksBox.addArrangedSubview(tasksScroll)
        let foot = UIView()
        foot.heightAnchor.constraint(equalToConstant: 8).isActive = true
        tasksBox.addArrangedSubview(foot)
        column.addArrangedSubview(tasksBox)
    }

    // MARK: Drawing

    override func refreshContent() {
        let row = row
        let transcript = hub.sessions.transcripts[target.viewId]
        let failed = row?.isFailed ?? false
        let sleeping = row?.isResumable ?? false
        let stale = row?.isStale ?? false
        let running = row?.isLive ?? false
        let activity = home.activity(target.viewId)

        // Header: the directory's hue, the same one its row wears.
        let cwd = row?.cwd ?? ""
        folder.isHidden = cwd.isEmpty
        folder.tintColor = IdentityInk.color(hue: RailPrefs.shared.hue(cwd))
        let machine = row.flatMap { row in hub.fleet.machines.first { $0.machineId == row.machineId } }
        osMark.isHidden = machine == nil
        if let machine { osMark.glyph = Glyph.os(machine.os) }
        hostLabel.text = machine.map { Naming.machineLabel($0.hostname) } ?? row?.machineId ?? ""
        cwdLabel.isHidden = cwd.isEmpty
        cwdLabel.text = cwd

        // What it is doing.
        mark.configure(id: target.viewId, place: row.map { $0.cwd.isEmpty ? $0.machineId : $0.cwd } ?? target.viewId,
                       status: HomeViewController.status(row, home: home))
        let word: String
        if failed { word = "Failed" } else if sleeping { word = "Sleeping" } else if stale { word = "Unknown" } else {
            word = switch activity {
            case .working: "Working"
            case .blocked: "Needs you"
            case .idle: "Idle"
            }
        }
        stateLabel.text = word
        let loud = failed || activity == .blocked
        stateLabel.role = loud ? TypeScale.typeMeta.with(weight: .medium) : TypeScale.typeMeta
        stateLabel.ink = loud ? Palette.error : Palette.mutedForeground
        let tool = activity == .working ? hub.fleet.pulse(target.viewId)?.currentTool : nil
        toolBox.isHidden = tool == nil
        toolName.text = tool?.name
        toolGlance.text = tool?.glance

        // Only a live session has a window to report on, and only one that has been asked has a number.
        meter.isHidden = !running
        if running, !contextAsked {
            contextAsked = true
            refreshContext()
        }
        let facts = transcript?.facts.flatMap { try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) as? [String: Any] }
        let compaction = (facts?["lastCompaction"] as? [String: Any]).flatMap { raw -> ContextMeterView.Compaction? in
            guard let at = raw["at"] as? Double, let pre = raw["preTokens"] as? Double else { return nil }
            return ContextMeterView.Compaction(at: at, preTokens: pre, manual: raw["trigger"] as? String == "manual",
                                               failed: raw["result"] as? String == "failed", error: raw["error"] as? String)
        }
        meter.configure(.init(usage: usage, compacting: facts?["sdkStatus"] as? String == "compacting", compaction: compaction))

        // A permission parked by a process that has since died cannot be answered: a dead one shows none.
        drawAsks(running ? hub.needs.parked[target.viewId] ?? [] : [], machineId: row?.machineId ?? "")

        if failed {
            noteBox.isHidden = false
            noteBox.backgroundColor = Palette.error.withAlphaComponent(0.1)
            note.ink = Palette.error
            note.text = row?.lastError.flatMap { $0.isEmpty ? nil : $0 } ?? "Failed without saying why."
        } else if stale {
            noteBox.isHidden = false
            noteBox.backgroundColor = .clear
            note.ink = Palette.mutedForeground
            note.text = "Unknown — the hub can't currently reach this session's machine."
        } else {
            noteBox.isHidden = true
        }

        let plan = hub.tasks.snapshot(target.viewId)
        if let plan, !plan.tasks.isEmpty {
            let progress = hub.tasks.progress(plan)
            tasksBox.isHidden = false
            tasksTitle.text = "Tasks · \(progress.done) of \(progress.total)"
            tasks.refresh()
        } else {
            tasksBox.isHidden = true
        }
    }

    private func drawAsks(_ parked: [ParkedAsk], machineId: String) {
        let sent = parked.map { hub.needs.answerSent(for: $0) }
        let live = home.live
        let print = zip(parked, sent).map { "\($0.requestId)\u{1f}\($0.summary)\u{1f}\($0.isQuestion)\u{1f}\($1.map { "\($0.stage)" } ?? "")" }.joined(separator: "\u{1e}") + "\(live)"
        guard print != askPrint else { return }
        askPrint = print
        asks.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (ask, sent) in zip(parked, sent) {
            let summary = ask.isQuestion ? "asked a question" : ask.summary
            let words = KitLabel(TypeScale.typeBody, ink: Palette.foreground, lines: 0)
            words.text = summary
            let buttons = UIStackView()
            buttons.alignment = .center
            if ask.isQuestion {
                // A question wants a real choice, made on its own card in the session.
                buttons.addArrangedSubview(UIView())
                buttons.addArrangedSubview(KitButton.make("Answer", variant: .secondary, height: .sm) { [weak self] in self?.onOpen() })
            } else {
                // Equal peers at opposite ends (DESIGN.md, The Peer Rule).
                let inFlight = sent.map { $0.stage != .failed } ?? false
                let deny = KitButton.make("Deny", glyph: .close, glyphTint: Palette.inkMuted, variant: .secondary, height: .sm) { [weak self] in
                    _ = self?.hub.needs.answer(ask, machineId: machineId, .deny)
                }
                let approve = KitButton.make("Approve", glyph: .tick, glyphTint: Palette.inkStrong, variant: .secondary, height: .sm) { [weak self] in
                    _ = self?.hub.needs.answer(ask, machineId: machineId, .allow)
                }
                deny.accessibilityLabel = "Deny \(summary)"
                approve.accessibilityLabel = "Approve \(summary)"
                deny.isEnabled = live && !inFlight
                approve.isEnabled = live && !inFlight
                buttons.spacing = 32
                buttons.addArrangedSubview(deny)
                buttons.addArrangedSubview(UIView())
                buttons.addArrangedSubview(approve)
            }
            let card = UIStackView(arrangedSubviews: [words, buttons])
            card.axis = .vertical
            card.spacing = 8
            let box = UIView()
            box.backgroundColor = Palette.statusAttnBg
            let line = seam()
            line.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(line)
            inset(card, into: box, top: 12 + 1, bottom: 12)
            NSLayoutConstraint.activate([
                line.topAnchor.constraint(equalTo: box.topAnchor),
                line.leadingAnchor.constraint(equalTo: box.leadingAnchor),
                line.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            ])
            asks.addArrangedSubview(box)
        }
    }
}
