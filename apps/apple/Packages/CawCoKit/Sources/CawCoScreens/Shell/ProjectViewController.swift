import CawCoCore
import CawCoDesign
import UIKit

/// A project's home (routes/project/[id]/+page.svelte): its name, folder and
/// machine, then the sessions that ran in it, live first, then what its
/// machine has stored.
final class ProjectViewController: ObservedViewController {
    private let projectId: String
    private let context: ShellContext
    /// `px-6`, `pt-6`, `pb-6`, and the gap between the two columns.
    private static let edge = 24.0
    private let head = UIStackView()
    private let actions = UIStackView()
    private var startButton: UIButton!
    /// One column: the docs, then the rail's cards under them.
    private let scroll = UIScrollView()
    private let page = UIStackView()
    /// Two: the docs, and the rail beside them.
    private let mainScroll = UIScrollView()
    private let mainColumn = UIStackView()
    private let asideScroll = UIScrollView()
    private let asideHolder = UIStackView()
    private let asideColumn = UIStackView()
    private var asideWidth: NSLayoutConstraint!
    private var arranged: String?
    private let name = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
    private let folder = KitLabel(TypeScale.typeCode.withWeight(.regular), ink: Palette.inkMuted)
    private let machineGlyph = GlyphView(.server, tint: Palette.inkMuted)
    private let machineName = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted)
    private let presence = UIView()
    private let sessions = UIStackView()
    private let liveRows = KeyedRows<LiveSessionRowView>(spacing: 6)
    private let storedRows = KeyedRows<StoredSessionRowView>(spacing: 6)
    private let liveSkeleton = UIStackView()
    private let storedSkeleton = UIStackView()
    private let empty = KitEmptyState(icon: .chat, title: "No sessions yet", line: "Nothing is running in this project, and nothing has been recorded.")
    private let moreRow = UIStackView()
    private var moreButton: UIButton!
    private let missing = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
    private var showMore = false
    /// The live list mounts a screenful at once and the rest a chunk a frame
    /// (`LIVE_FIRST`, `LIVE_STEP`): a checkout with hundreds of live sessions
    /// otherwise holds its first row back for the whole list. Once it is whole
    /// it follows the fleet, rows opening and closing in place.
    private var liveMounted = 24
    private var liveFollowed = false
    private var mounting = false
    private var storedShown = false
    /// One clock for the rows timing a step with no plan to count.
    private var clock: Timer?
    private var inventory: MachineInventoryView!
    private var docsView: ProjectDocsView!
    private var memory: ProjectMemoryCard!
    /// Stored sessions shown before "Show more".
    private static let storedFirst = 8

    init(projectId: String, context: ShellContext) {
        self.projectId = projectId
        self.context = context
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        // The header stays; under it the body scrolls as one column, or from
        // 1024pt as two that scroll apart: the docs, and a 340pt rail (360
        // from 1280) holding CLAUDE.md, the machine and the sessions.
        let safe = view.safeAreaLayoutGuide
        head.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(head)
        asideColumn.axis = .vertical
        asideColumn.spacing = 16
        // The one column carries the page's 24pt inside its scrollport, so a
        // card's shadow shows in it; each of the two is a scrollport a point
        // larger than its cards (`-m-px p-px`), which keeps their ring.
        for (scroller, column, pad) in [(scroll, page, Self.edge), (mainScroll, mainColumn, 1.0), (asideScroll, asideHolder, 1.0)] {
            scroller.translatesAutoresizingMaskIntoConstraints = false
            scroller.alwaysBounceVertical = true
            scroller.contentInset.bottom = Self.edge
            view.addSubview(scroller)
            column.axis = .vertical
            column.translatesAutoresizingMaskIntoConstraints = false
            scroller.addSubview(column)
            let top = pad == Self.edge ? 0 : pad
            NSLayoutConstraint.activate([
                scroller.topAnchor.constraint(equalTo: head.bottomAnchor, constant: -top),
                scroller.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                column.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor, constant: top),
                column.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor),
                column.leadingAnchor.constraint(equalTo: scroller.frameLayoutGuide.leadingAnchor, constant: pad),
                column.trailingAnchor.constraint(equalTo: scroller.frameLayoutGuide.trailingAnchor, constant: -pad),
                scroller.contentLayoutGuide.widthAnchor.constraint(equalTo: scroller.frameLayoutGuide.widthAnchor),
            ])
        }
        // `mt-6` between the docs and what follows them on one column.
        page.spacing = Self.edge
        asideWidth = asideScroll.widthAnchor.constraint(equalToConstant: 340)
        // The page runs under the rail on a wide screen: everything keeps to the safe area.
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: safe.topAnchor, constant: Self.edge),
            head.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Self.edge),
            head.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Self.edge),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            mainScroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Self.edge - 1),
            mainScroll.trailingAnchor.constraint(equalTo: asideScroll.leadingAnchor, constant: -(Self.edge - 2)),
            asideScroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -(Self.edge - 1)),
            asideWidth,
        ])

        // Header: the name, then the folder and the machine it lives on.
        folder.lineBreakMode = .byTruncatingMiddle
        presence.layer.cornerRadius = 4
        presence.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([presence.widthAnchor.constraint(equalToConstant: 8), presence.heightAnchor.constraint(equalToConstant: 8)])
        let machine = UIStackView(arrangedSubviews: [machineGlyph, machineName, presence])
        machine.spacing = 6
        machine.alignment = .center
        // The folder truncates (`truncate`); the machine keeps its name.
        folder.setContentCompressionResistancePriority(.defaultLow - 1, for: .horizontal)
        machineName.setContentCompressionResistancePriority(.required, for: .horizontal)
        machine.setContentCompressionResistancePriority(.required, for: .horizontal)
        let meta = UIStackView(arrangedSubviews: [folder, machine])
        meta.spacing = Space.space3
        meta.alignment = .center
        let titles = UIStackView(arrangedSubviews: [name, meta])
        titles.axis = .vertical
        titles.spacing = Space.space1
        // The machine follows the folder; neither stretches to the actions.
        titles.alignment = .leading
        // The header's actions: Forget project… as the kit's ghost button in muted ink.
        let forget = KitButton.make("Forget project…", variant: .ghost) { [weak self] in
            guard let self, let project = context.hub.fleet.projects.first(where: { $0.id == projectId }) else { return }
            context.forgetProject(project)
        }
        // `class="text-muted-foreground"`.
        forget.configuration?.attributedTitle = AttributedString("Forget project…", attributes: AttributeContainer(TypeScale.typeButton.attributes(color: Palette.mutedForeground, tracking: -0.01)))
        // New session opens its popover from the button's end; Side quest starts one at once.
        startButton = KitButton.make("New session", variant: .action) { [weak self] in
            guard let self else { return }
            KitPopover.present(ProjectStartController { [weak self] prompt in self?.start(scratch: false, prompt: prompt) },
                               from: startButton, in: self, align: .end)
        }
        let quest = KitButton.make("Side quest", variant: .outline) { [weak self] in self?.start(scratch: true, prompt: nil) }
        actions.addArrangedSubview(startButton)
        actions.addArrangedSubview(quest)
        actions.addArrangedSubview(forget)
        // `gap-2`.
        actions.spacing = 8
        actions.alignment = .center
        for button in [startButton!, quest, forget] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        actions.setContentHuggingPriority(.required, for: .horizontal)
        titles.setContentHuggingPriority(.defaultLow, for: .horizontal)
        // `flex-wrap`, `gap-x-4 gap-y-2`, `pb-4`: the actions drop under the titles where they cannot stand beside them.
        head.addArrangedSubview(titles)
        head.addArrangedSubview(actions)
        head.alignment = .center
        head.spacing = Space.space4
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: Space.space4, trailing: 0)

        // The repo's own markdown.
        docsView = ProjectDocsView(hub: context.hub)

        // Its CLAUDE.md, summarised: the docs card is where it is read.
        memory = ProjectMemoryCard(hub: context.hub)
        asideColumn.addArrangedSubview(memory)

        // What its machine has (MachineInventory, MCP servers).
        inventory = MachineInventoryView(hub: context.hub)
        asideColumn.addArrangedSubview(inventory)

        // Sessions, in a card.
        let card = TileView(radius: Radius.radiusLg)
        card.boxShadow = Shadow.shadowMd
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
        title.text = "Sessions"
        // The header (`px-4 py-3`), then the rows 6pt apart (`px-3 pb-3`).
        let header = UIStackView(arrangedSubviews: [title])
        header.isLayoutMarginsRelativeArrangement = true
        header.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space4, bottom: Space.space3, trailing: Space.space4)
        for skeleton in [liveSkeleton, storedSkeleton] {
            skeleton.axis = .vertical
            skeleton.spacing = 6
            for _ in 0 ..< 8 { skeleton.addArrangedSubview(SkeletonView(height: 36)) }
        }
        // `variant="ghost" size="sm"` in muted ink, at the start.
        moreButton = KitButton.make("Show more", variant: .ghost, height: .sm) { [weak self] in
            self?.showMore = true
            self?.requestRefresh()
        }
        moreRow.addArrangedSubview(moreButton)
        moreRow.addArrangedSubview(UIView())
        // `px-1` on the empty state.
        empty.directionalLayoutMargins.leading = 4
        empty.directionalLayoutMargins.trailing = 4
        for part in [liveSkeleton, liveRows, storedSkeleton, storedRows, empty, moreRow] as [UIView] { sessions.addArrangedSubview(part) }
        sessions.axis = .vertical
        sessions.spacing = 6
        sessions.isLayoutMarginsRelativeArrangement = true
        sessions.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
        let body = UIStackView(arrangedSubviews: [header, sessions])
        body.axis = .vertical
        body.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(body)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: card.topAnchor),
            body.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor),
        ])
        asideColumn.addArrangedSubview(card)
        arrange()

        missing.text = "No such project."
        missing.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(missing)
        NSLayoutConstraint.activate([
            missing.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            missing.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func refreshContent() {
        let fleet = context.hub.fleet
        guard let project = fleet.projects.first(where: { $0.id == projectId }) else {
            for part in [head, scroll, mainScroll, asideScroll] as [UIView] { part.isHidden = true }
            missing.isHidden = !fleet.fleetRead
            return
        }
        if head.isHidden {
            head.isHidden = false
            arranged = nil
        }
        arrange()
        missing.isHidden = true
        name.text = project.name
        folder.text = project.cwd
        let machine = fleet.machines.first { $0.machineId == project.machineId }
        machineGlyph.glyph = Glyph.os(machine?.os ?? "")
        machineName.text = machine.map { Naming.machineLabel($0.hostname) } ?? project.machineId
        let online = machine?.status == "online"
        if context.hub.state == .connected { docsView.load(machineId: project.machineId, cwd: project.cwd, projectId: project.id) }
        if context.hub.state == .connected {
            memory.load(machineId: project.machineId, cwd: project.cwd, projectId: project.id, online: online,
                        machineName: machine.map { Naming.machineLabel($0.hostname) } ?? project.machineId)
        }
        inventory.isHidden = machine == nil
        if let machine { inventory.configure(machines: [machine]) }
        presence.backgroundColor = online ? Palette.success : Palette.mutedForeground.withAlphaComponent(0.4)

        showSessions(project, online: online)
    }

    // MARK: Sessions

    /// The card's two lists answer separately and each shows when its own
    /// source has: the live sessions with the fleet's first read, the stored
    /// ones once the machine has listed them (or is not online to ask).
    private func showSessions(_ project: ProjectRow, online: Bool) {
        let fleet = context.hub.fleet
        let home = context.home
        liveSkeleton.isHidden = fleet.fleetRead
        liveRows.isHidden = !fleet.fleetRead
        guard fleet.fleetRead else {
            for part in [storedSkeleton, storedRows, empty, moreRow] as [UIView] { part.isHidden = true }
            return
        }
        // `liveIn`: started from this project, or running in its checkout, in the hub's own order.
        let under = { (cwd: String?) in cwd == project.cwd || (cwd ?? "").hasPrefix(project.cwd + "/") }
        let live = fleet.rows.filter { $0.isListed && ($0.projectId == project.id || ($0.machineId == project.machineId && under($0.cwd))) }
        let mounted = liveFollowed ? live : Array(live.prefix(liveMounted))
        // The path shows on a window 640pt wide or more (`sm:block`), where it is not the card's own.
        let wide = isWide
        liveRows.set(mounted.map(\.id), animated: liveFollowed, in: scroll) { [weak self] id in
            let row = LiveSessionRowView()
            row.addAction(UIAction { [weak self] _ in self?.context.openSession(id) }, for: .primaryActionTriggered)
            SessionRowDrag.attach(to: row) { id }
            // LiveSessionMenu, read from the fleet as it opens.
            ContextMenuHost.attach(to: row) { [weak self] copy in
                guard let self, let now = context.hub.fleet.byId[id] else { return nil }
                return SessionMenus.live(now, context: context.sessionMenus, copy: copy)
            }
            return row
        }
        let now = Date.now.timeIntervalSince1970 * 1000
        var timing = false
        for row in mounted {
            let activity = home.activity(row.id)
            let asleep = row.isResumable
            let plan = plan(for: row.id)
            let unmeasured = plan == nil && !row.isFailed && !asleep && !row.isStale && activity == .working
            timing = timing || unmeasured
            let tool = activity == .working ? fleet.pulse(row.id)?.currentTool : nil
            // LiveSessionRow's title: its stored transcript's, else what its spawn said it is for.
            let info = row.sessionId.flatMap { key in fleet.catalog(row.machineId).first { $0.sessionId == key } }
            let status = HomeViewController.status(row, home: home)
            liveRows.rows[row.id]?.configure(LiveRowModel(
                id: row.id,
                title: info.map { fleet.storedTitle($0, machineId: row.machineId) } ?? row.title ?? "untitled session",
                status: status,
                word: row.status == .stopped ? "Stopped" : status.word,
                place: row.cwd.isEmpty ? row.machineId : row.cwd,
                dim: asleep || row.isStale,
                quest: row.kind == "scratch",
                leaf: row.canDelegate == false,
                cwd: wide && !row.cwd.isEmpty && row.cwd != project.cwd ? row.cwd : nil,
                alarmed: row.isFailed || activity == .blocked,
                done: plan?.done,
                total: plan?.total,
                unmeasured: unmeasured,
                pulseAt: fleet.pulseAt(row.id),
                toolName: tool?.name,
                toolGlance: tool?.glance,
                hint: row.isFailed ? "Failed — the session's process exited badly. Open it to see why."
                    : (asleep ? "Sleeping — it resumes when you open or message it."
                        : (row.isStale ? "Unknown — the hub can't currently reach this session's machine." : nil)),
                hue: RailPrefs.shared.hue(row.cwd)
            ), now: now)
        }
        keepClock(timing)
        if !liveFollowed { mountMore(of: live.count) }

        // `storedIn`: what the machine recorded somewhere inside the checkout.
        let stored = fleet.catalog(project.machineId).filter { ($0.cwd ?? "").isEmpty == false && under($0.cwd) }
        let read = !online || fleet.catalogs[project.machineId] != nil
        storedSkeleton.isHidden = read
        storedRows.isHidden = !read
        guard read else {
            empty.isHidden = true
            moreRow.isHidden = true
            return
        }
        let shown = showMore ? stored : Array(stored.prefix(Self.storedFirst))
        let machineId = project.machineId
        let byKey = Dictionary(shown.map { ($0.sessionId, $0) }, uniquingKeysWith: { first, _ in first })
        // "Show more" opens its rows in place; the first answer just lands.
        storedRows.set(shown.map(\.sessionId), animated: storedShown, in: scroll) { [weak self] key in
            let row = StoredSessionRowView()
            row.addAction(UIAction { [weak self] _ in
                guard let self, let info = context.hub.fleet.catalog(machineId).first(where: { $0.sessionId == key }) else { return }
                context.openSession(context.hub.fleet.conversationId(sessionKey: key, machineId: machineId, cwd: info.cwd))
            }, for: .primaryActionTriggered)
            SessionRowDrag.attach(to: row) { [weak self] in
                guard let fleet = self?.context.hub.fleet, let info = fleet.catalog(machineId).first(where: { $0.sessionId == key }) else { return nil }
                return fleet.conversationId(sessionKey: key, machineId: machineId, cwd: info.cwd)
            }
            ContextMenuHost.attach(to: row) { [weak self] copy in
                guard let self, let info = context.hub.fleet.catalog(machineId).first(where: { $0.sessionId == key }) else { return nil }
                return SessionMenus.stored(machineId: machineId, info: info, context: context.sessionMenus, copy: copy)            }
            return row
        }
        storedShown = true
        for (key, info) in byKey {
            storedRows.rows[key]?.configure(StoredRowModel(
                id: key,
                title: fleet.storedTitle(info, machineId: machineId),
                place: (info.cwd ?? "").isEmpty ? machineId : info.cwd ?? machineId,
                cwd: wide && info.cwd != project.cwd ? info.cwd : nil,
                age: RailAge.ago(info.lastModified, now: home.now)
            ))
        }
        empty.isHidden = !(live.isEmpty && stored.isEmpty)
        let more = stored.count - Self.storedFirst
        moreRow.isHidden = showMore || more <= 0
        if more > 0 {
            moreButton.configuration?.attributedTitle = AttributedString(
                "Show \(more) more", attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.mutedForeground, tracking: -0.01))
            )
        }
    }

    /// The session's plan, counted (`tasksOf`, `taskProgress`): read only, as
    /// the board's sweep and the frames keep the store current. A session
    /// with no plan has none, and a working one times its step instead.
    private func plan(for id: String) -> (done: Int, total: Int)? {
        guard let tasks = context.hub.tasks, let snapshot = tasks.snapshot(id), !snapshot.tasks.isEmpty else { return nil }
        let progress = tasks.progress(snapshot)
        return (progress.done, progress.total)
    }

    /// The next chunk of the live list a frame on (`LIVE_STEP`), then the list follows the fleet.
    private func mountMore(of count: Int) {
        guard !mounting else { return }
        mounting = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            mounting = false
            if liveMounted < count { liveMounted += 32 } else { liveFollowed = true }
            requestRefresh()
        }
    }

    /// A second's tick for the rows timing a step, only while one is on screen.
    private func keepClock(_ wanted: Bool) {
        guard wanted != (clock != nil) else { return }
        clock?.invalidate()
        clock = wanted ? Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.view.window != nil else { return }
                let now = Date.now.timeIntervalSince1970 * 1000
                for row in self.liveRows.rows.values where row.model?.unmeasured == true { row.tick(now) }
            }
        } : nil
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        clock?.invalidate()
        clock = nil
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        arrange()
        // The path comes and goes with the window's width.
        if isWide != wasWide {
            wasWide = isWide
            requestRefresh()
        }
    }

    /// The window's width, which is what the web's breakpoints read.
    private var span: Double { Double(view.window?.bounds.width ?? view.bounds.width) }
    private var isWide: Bool { span >= 640 }
    private var wasWide = false

    /// Puts the page in the shape its width asks for: one column under 1024pt,
    /// two from there; the docs picked from a select under 768, across the
    /// reader from 768, down a column beside it from 1280; the header's
    /// actions beside its titles, or under them where they do not fit.
    private func arrange() {
        guard isViewLoaded, !head.isHidden else { return }
        let span = span
        let columns = span >= 1024
        let room = view.bounds.inset(by: view.safeAreaInsets).width - Self.edge * 2
        let actionsWidth = actions.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width
        let stacked = room - actionsWidth - Space.space4 < 240
        let shape = "\(columns):\(span >= 1280):\(span >= 768):\(stacked)"
        guard shape != arranged else { return }
        arranged = shape
        docsView.pickerMode = span >= 1280 ? .column : (span >= 768 ? .across : .select)
        // `lg:w-[340px] xl:w-[360px]` is the scrollport, a point of padding inside it: the cards are 2pt narrower.
        asideWidth.constant = span >= 1280 ? 360 : 340
        if columns {
            mainColumn.addArrangedSubview(docsView)
            asideHolder.addArrangedSubview(asideColumn)
        } else {
            page.addArrangedSubview(docsView)
            page.addArrangedSubview(asideColumn)
        }
        scroll.isHidden = columns
        mainScroll.isHidden = !columns
        asideScroll.isHidden = !columns
        head.axis = stacked ? .vertical : .horizontal
        head.alignment = stacked ? .leading : .center
        head.spacing = stacked ? Space.space2 : Space.space4
    }

    // MARK: Starts

    /// "New session" and "Side quest": a session here on what the new-session
    /// form was last set to, opened in its tab as soon as the hub has it.
    private func start(scratch: Bool, prompt: String?) {
        guard let project = context.hub.fleet.projects.first(where: { $0.id == projectId }) else { return }
        Task { @MainActor [weak self, context] in
            do {
                let id = try await context.hub.spawnSession(machineId: project.machineId, cwd: project.cwd, projectId: project.id, prompt: prompt, scratch: scratch)
                context.openSession(id)
            } catch {
                Toast.error(error.localizedDescription, in: self?.view)
            }
        }
    }
}
