import CawCoCore
import CawCoDesign
import UIKit

/// A project's home (routes/project/[id]/+page.svelte): its name, folder and
/// machine, then the sessions that ran in it, live first, then what its
/// machine has stored.
final class ProjectViewController: ObservedViewController {
    private let projectId: String
    private let context: ShellContext
    private let scroll = UIScrollView()
    private let page = UIStackView()
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
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)
        page.axis = .vertical
        page.spacing = Space.space6
        page.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(page)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            page.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            page.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            // The page runs under the rail on a wide screen: its content keeps to the safe area.
            page.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: Space.space6),
            page.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -Space.space6),
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
        // The header's actions: Forget project… as the kit's ghost button in muted ink.
        var forgetStyle = UIButton.Configuration.plain()
        forgetStyle.attributedTitle = AttributedString("Forget project…", attributes: AttributeContainer(TypeScale.typeButton.attributes(color: Palette.mutedForeground, tracking: -0.01)))
        forgetStyle.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        forgetStyle.background.cornerRadius = Radius.radiusMd
        let forget = UIButton(configuration: forgetStyle, primaryAction: UIAction { [weak self] _ in
            guard let self, let project = context.hub.fleet.projects.first(where: { $0.id == projectId }) else { return }
            context.forgetProject(project)
        })
        forget.configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : .clear
        }
        forget.houseStyle()
        forget.heightAnchor.constraint(equalToConstant: Size.cBtnH).isActive = true
        let head = UIStackView(arrangedSubviews: [titles, forget])
        head.alignment = .center
        head.spacing = Space.space4
        titles.setContentHuggingPriority(.defaultLow, for: .horizontal)
        forget.setContentHuggingPriority(.required, for: .horizontal)
        forget.setContentCompressionResistancePriority(.required, for: .horizontal)
        page.addArrangedSubview(head)

        // The repo's own markdown.
        docsView = ProjectDocsView(hub: context.hub)
        page.addArrangedSubview(docsView)

        // Its CLAUDE.md, summarised: the docs card is where it is read.
        memory = ProjectMemoryCard(hub: context.hub)
        page.addArrangedSubview(memory)

        // What its machine has (MachineInventory, MCP servers).
        inventory = MachineInventoryView(hub: context.hub)
        page.addArrangedSubview(inventory)

        // Sessions, in a card.
        let card = TileView(radius: Radius.radiusLg)
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
        var ghost = UIButton.Configuration.plain()
        ghost.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3)
        ghost.background.cornerRadius = Radius.radiusMd
        moreButton = UIButton(configuration: ghost, primaryAction: UIAction { [weak self] _ in
            self?.showMore = true
            self?.requestRefresh()
        })
        moreButton.configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : (button.isHovered ? Palette.surfaceHover : .clear)
        }
        moreButton.houseStyle()
        moreButton.heightAnchor.constraint(equalToConstant: Size.cBtnHSm).isActive = true
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
        page.addArrangedSubview(card)

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
            scroll.isHidden = fleet.fleetRead
            missing.isHidden = !fleet.fleetRead
            return
        }
        scroll.isHidden = false
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
        // `liveIn`: started from this project, or running in its checkout.
        let under = { (cwd: String?) in cwd == project.cwd || (cwd ?? "").hasPrefix(project.cwd + "/") }
        let live = RailModel.sorted(
            fleet.rows.filter { $0.isListed && ($0.projectId == project.id || ($0.machineId == project.machineId && under($0.cwd))) },
            hub: context.hub, home: home, by: .recent
        )
        let mounted = liveFollowed ? live : Array(live.prefix(liveMounted))
        // The path shows on a window 640pt wide or more (`sm:block`), where it is not the card's own.
        let wide = isWide
        liveRows.set(mounted.map(\.id), animated: liveFollowed, in: scroll) { [weak self] id in
            let row = LiveSessionRowView()
            row.addAction(UIAction { [weak self] _ in self?.context.openSession(id) }, for: .primaryActionTriggered)
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
            let tool = activity == .working ? fleet.pulses[row.id]?.currentTool : nil
            liveRows.rows[row.id]?.configure(LiveRowModel(
                id: row.id,
                title: fleet.title(row),
                status: HomeViewController.status(row, home: home),
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
            ContextMenuHost.attach(to: row) { [weak self] copy in
                guard let self, let info = context.hub.fleet.catalog(machineId).first(where: { $0.sessionId == key }) else { return nil }
                return SessionMenus.stored(machineId: machineId, info: info, context: context.sessionMenus, copy: copy)            }
            return row
        }
        storedShown = true
        for (key, info) in byKey {
            storedRows.rows[key]?.configure(StoredRowModel(
                id: key,
                title: fleet.storedTitle(info),
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
                "Show \(more) more", attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.mutedForeground))
            )
        }
    }

    /// The session's plan, counted: none until the hub's task store lands in
    /// Core (`hub.tasks`), so every working row times its step instead.
    private func plan(for _: String) -> (done: Int, total: Int)? { nil }

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
        // The path comes and goes with the page's width.
        if isWide != wasWide {
            wasWide = isWide
            requestRefresh()
        }
    }

    private var isWide: Bool { (view.window?.bounds.width ?? view.bounds.width) >= 640 }
    private var wasWide = false
}
