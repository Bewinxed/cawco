import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// The app chrome (Shell.svelte): the rail, the slim bar across the top, and
/// the place it names underneath. On a regular width the split view's
/// primary column is the rail (216–520pt, 228 until the reader drags its
/// grip) and its secondary column the place; on a compact width the split's
/// compact column is one stack whose root is the place, the board pushing a
/// conversation in over it, and the rail is a sheet the bar's burger opens.
final class ShellController: UISplitViewController, UISplitViewControllerDelegate, SidebarHost, MachinesHost {
    let hub: HubConnection
    private let home: HomeModel

    private(set) var destination: ShellDestination = .fleet
    private var spoke: ShellDestination = .fleet
    private(set) var assistantOpen = false

    /// This window's open conversations and their groups.
    let workspace = Workspace()
    private let panes: PaneHost
    private lazy var workspaceController = WorkspaceController(workspace: workspace, panes: panes, context: context)
    /// The phone's session page has no bar: its strip is the one row, and its
    /// toggle and Caw float over the strip's ends (WorkspaceController `barOverlay`).
    private let sessionCluster = TopBarCluster()
    private let sessionBurger = BurgerButton()
    /// What needs the operator, pulled down from Caw's head on any bar.
    private let needsDrawer = NeedsDrawer()
    /// The asks already seen, by id: one that is not is new, and Caw beats once. Nil until the fleet is read.
    private var seenNeeds: Set<String>?
    /// The wide screen's sidebar toggle: the rail's column shown or hidden.
    private let railToggle = BurgerButton()

    // Regular width.
    private let rail: SidebarViewController
    private let railHome: HomeViewController
    private let mainNav = UINavigationController()
    private let mainMotion = ShellNavigationMotion()
    private let detail: FleetDetailController
    private let mainCrumb = CrumbView("Fleet")
    private let mainCluster = TopBarCluster()
    // Compact width.
    private let board: HomeViewController
    private let compactNav = UINavigationController()
    private let compactMotion = ShellNavigationMotion()
    private let compactCrumb = CrumbView("Fleet")
    private let compactCluster = TopBarCluster()
    private let burger = BurgerButton()
    private let sheetTransition = RailSheetTransition()
    private var keptRailSheet: SidebarViewController?
    private var railSheet: SidebarViewController? {
        keptRailSheet?.presentingViewController == nil ? nil : keptRailSheet
    }
    /// Places opened once, kept so coming back finds them as they were left.
    private var pages: [ShellDestination: UIViewController] = [:]
    private var watcher: ShellWatcher!

    private static let railKey = "cawco-rail-width"
    static let railMin = 216.0
    static let railMax = 520.0
    static let railDefault = 228.0

    var context: ShellContext {
        ShellContext(hub: hub, home: home, openSession: { [weak self] id in self?.openSession(id) }, go: { [weak self] place in self?.go(place) },
                     forgetProject: { [weak self] project in self?.forgetProject(project) },
                     startSession: { [weak self] machineId, cwd, projectId in self?.startSession(machineId: machineId, cwd: cwd, projectId: projectId) },
                     sessionMenus: sessionMenus)
    }

    /// What a session's menu does through the shell, wherever the row stands.
    var sessionMenus: SessionMenuContext {
        SessionMenuContext(
            hub: hub,
            open: { [weak self] id in self?.openSession(id) },
            continueInNewSession: panes.continueHandler.map { _ in { [weak self] id in self?.panes.continueInNewSession(id) } },
            continueStored: { [weak self] source in self?.newSession.continueSession(source) },
            presenter: { [weak self] in self?.dialogPresenter ?? UIViewController() }
        )
    }

    var activeSessionId: String? { currentId }

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        self.home = home
        rail = SidebarViewController(hub: hub, home: home, inSheet: false)
        railHome = HomeViewController(hub: hub, home: home, variant: .rail)
        board = HomeViewController(hub: hub, home: home, variant: .page)
        detail = FleetDetailController(hub: hub, home: home)
        panes = PaneHost(hub: hub)
        super.init(style: .doubleColumn)
        panes.onReturnToFleet = { [weak self] id in self?.returnToFleet(id) }
        panes.onOpen = { [weak self] id in self?.openSession(id) }
        panes.onEditWorkflow = { [weak self] id in self?.go(.workflow(id: id, program: true)) }
        panes.continueHandler = { [weak self] id in self?.newSession.continueSession(id) }
        // The details' "N MCP" leads to the fleet's MCP configuration (`/config/mcp`).
        panes.onOpenMcp = { [weak self] in
            self?.dialogPresenter.dismiss(animated: true)
            self?.go(.configure)
        }
        rail.host = self
        rail.homeController = railHome
        for home in [railHome, board] {
            home.onOpen = { [weak self] id in self?.openSession(id) }
            home.onUsagePage = { [weak self] in self?.go(.usage) }
        }
        // The page's dock: Start session where the phone's thumb reaches.
        board.onStart = { [weak self] in self?.startSession(machineId: nil, cwd: nil, projectId: nil) }
        // A home row is the session menu's trigger, as a rail row is.
        for home in [board, railHome] {
            home.sessionMenus = { [weak self] in self?.sessionMenus }
        }

        let railNav = UINavigationController(rootViewController: rail)
        railNav.setNavigationBarHidden(true, animated: false)
        setViewController(railNav, for: .primary)

        for nav in [mainNav, compactNav] { TopBar.dress(nav.navigationBar) }
        mainMotion.attach(to: mainNav)
        mainNav.setViewControllers([detail], animated: false)
        setViewController(mainNav, for: .secondary)
        compactMotion.attach(to: compactNav)
        compactNav.setViewControllers([board], animated: false)
        setViewController(compactNav, for: .compact)

        mainCluster.compact = false
        for button in [burger, sessionBurger] {
            button.addAction(UIAction { [weak self] _ in self?.showRailSheet() }, for: .primaryActionTriggered)
        }
        railToggle.label = "Hide sidebar"
        railToggle.addAction(UIAction { [weak self] _ in self?.toggleRail() }, for: .primaryActionTriggered)
        for cluster in [mainCluster, compactCluster, sessionCluster] {
            cluster.onJump = { [weak self] source in self?.openJump(.view(source)) }
            cluster.onMachines = { [weak self] source in self?.openMachines(from: source) }
            cluster.onCaw = { [weak self] head in
                guard let self else { return }
                if needsDrawer.open { needsDrawer.close() } else { needsDrawer.show(from: head) }
            }
            cluster.onCawPan = { [weak self] pan, head in self?.needsDrawer.drag(pan, from: head) }
        }
        needsDrawer.onChoose = { [weak self] item in self?.openWaiting(item) }
        needsDrawer.onOpenChange = { [weak self] _ in self?.refreshBars() }
        TopBar.install(on: detail.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: railToggle)
        TopBar.install(on: board.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: false)
        placeSessionRow()
        // One group on a wide screen: its strip is the bar's, in the crumb's place.
        workspaceController.onHost = { [weak self] strip in self?.barTabs.host(strip) }
        // Back on the board (a back swipe), the focused group shows nothing; its tabs stay.
        compactMotion.didShow = { [weak self] shown in
            guard let self, shown === compactNav.viewControllers.first, compact else { return }
            // Back on the place the conversations were opened from: the shell is there again.
            if let under = compactUnder { settle(on: under) }
            if workspace.activeSessionId != nil { workspace.showBoard() }
        }

        preferredDisplayMode = .oneBesideSecondary
        preferredSplitBehavior = .tile
        presentsWithGesture = false
        let width = UserDefaults.standard.double(forKey: Self.railKey)
        setRail(Self.clamp(width > 0 ? width : Self.railDefault))
        delegate = self
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            // The rail is resized by its own grip, as the web's is.
            displayModeButtonVisibility = .never
        }
        watcher = ShellWatcher(hub: hub, home: home) { [weak self] in
            guard let self else { return }
            refreshBars()
            followWorkspace()
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ShellController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        installGrip()
        // Over every column and the grip: the drawer comes down over the page.
        needsDrawer.frame = view.bounds
        needsDrawer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(needsDrawer)
    }

    /// The phone's session row: its toggle and Caw's capsule on the screen's
    /// layout margins, where the board's bar stands them, over the strip's ends.
    private func placeSessionRow() {
        let row = workspaceController.barOverlay
        for part in [sessionBurger, sessionCluster] as [UIView] { row.addSubview(part) }
        NSLayoutConstraint.activate([
            sessionBurger.leadingAnchor.constraint(equalTo: row.layoutMarginsGuide.leadingAnchor),
            sessionBurger.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            // The cluster stands its capsule `space6 − 16` inside its own end.
            sessionCluster.trailingAnchor.constraint(equalTo: row.layoutMarginsGuide.trailingAnchor, constant: Space.space6 - 16),
            sessionCluster.centerYAnchor.constraint(equalTo: row.centerYAnchor),
        ])
    }

    /// The wide screen's toggle: the rail's column steps aside, or back, as
    /// the split view moves its columns.
    private func toggleRail() {
        let hidden = displayMode == .secondaryOnly
        preferredDisplayMode = hidden ? .oneBesideSecondary : .secondaryOnly
        railToggle.label = hidden ? "Hide sidebar" : "Show sidebar"
        UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durPanel) { self.view.layoutIfNeeded() }
    }

    /// The watcher's first read ran before there was a view: the workspace kept
    /// from the last run is placed once the shell knows its width.
    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        followWorkspace()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-sidebar-probe") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in self?.showRailSheet() }
        }
        #endif
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        barTabs.relayout()
        placeGrip()
        // The split view lays its columns over what else is in its view on
        // every pass (the grip brings itself back the same way): the drawer
        // stays over all of them.
        view.bringSubviewToFront(needsDrawer)
    }

    static func clamp(_ width: Double) -> Double { min(railMax, max(railMin, width.rounded())) }

    private var compact: Bool { traitCollection.horizontalSizeClass == .compact }

    // MARK: Places

    func go(_ next: ShellDestination) {
        move(to: next, opening: false)
    }

    /// The place a compact width's conversations were opened from, while it
    /// is the page under them: Back goes there, as the web's does.
    private var compactUnder: ShellDestination?

    /// Changes place. `opening`: a conversation is being opened from another
    /// place. On a compact width that is one push over the page in front,
    /// which stays under it; a navigation controller given two animated
    /// stacks in one turn (the board, then the conversations) keeps neither.
    private func move(to next: ShellDestination, opening: Bool) {
        railSheet?.dismiss(animated: true)
        guard next != destination else {
            guard next == .fleet, compact else { return }
            if compactUnder != nil {
                // Fleet asked for while another place is under the conversations: the board takes its place.
                compactUnder = nil
                compactCrumb.set(next.crumb, animated: true)
                TopBar.install(on: board.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: false)
                compactNav.setViewControllers([board], animated: true)
            } else {
                compactNav.popToRootViewController(animated: true)
            }
            return
        }
        let travel = Travel.route(from: destination, to: next)
        let from = destination
        // The last place outside a project home, where forgetting one goes back to (route.svelte.ts `spoke`).
        if case .project = destination {} else { spoke = destination }
        destination = next
        mainCrumb.set(next.crumb, animated: true)
        let regularPage = next == .fleet ? detail : page(for: next)
        // The bar's toggle, crumb and cluster move with the place, so they stay one bar.
        TopBar.install(on: regularPage.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: railToggle)
        mainMotion.route = travel
        mainNav.setViewControllers([regularPage], animated: !compact)
        compactMotion.route = travel
        if opening, compact, let under = compactNav.viewControllers.first {
            // The page in front keeps its bar and stays in the stack.
            compactUnder = from
            if workspaceController.parent != nil, workspaceController.parent !== compactNav { detail.show(nil) }
            compactNav.setViewControllers([under, workspaceController], animated: true)
        } else {
            compactUnder = nil
            let compactPage = next == .fleet ? board : page(for: next, compact: true)
            compactCrumb.set(next.crumb, animated: true)
            TopBar.install(on: compactPage.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: next != .fleet)
            compactNav.setViewControllers([compactPage], animated: compact)
        }
        hostTabs()
        // The bar re-homes its items with the page: the hosted strip is measured against them again.
        barTabs.relayout()
        mainNav.transitionCoordinator?.animate(alongsideTransition: nil) { [weak self] _ in self?.barTabs.relayout() }
        DispatchQueue.main.async { [weak self] in self?.barTabs.relayout() }
        rail.requestRefresh()
        railSheet?.requestRefresh()
    }

    /// The compact stack is back on the place under the conversations: the
    /// shell's place, the wide screen's page and the rail follow it there.
    private func settle(on under: ShellDestination) {
        compactUnder = nil
        guard under != destination else { return }
        destination = under
        mainCrumb.set(under.crumb, animated: false)
        let regularPage = under == .fleet ? detail : page(for: under)
        TopBar.install(on: regularPage.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: railToggle)
        mainNav.setViewControllers([regularPage], animated: false)
        hostTabs()
        rail.requestRefresh()
    }

    private func page(for destination: ShellDestination, compact: Bool = false) -> UIViewController {
        // One instance per place and width: a controller lives in one stack at a time.
        let key = compact ? Self.compactKey(destination) : destination
        if let kept = pages[key] { return kept }
        let made = ShellScreens.controller(for: destination, context: context)
        pages[key] = made
        return made
    }

    /// The compact stack's own copy of a place, keyed apart from the regular one.
    private static func compactKey(_ destination: ShellDestination) -> ShellDestination {
        switch destination {
        case let .project(id): .project("compact:" + id)
        case .workflows: .project("compact:workflows")
        case let .workflow(id, program): .workflow(id: "compact:" + id, program: program)
        case .configure: .project("compact:configure")
        case .usage: .project("compact:usage")
        case .fleet: .fleet
        }
    }

    // MARK: Sessions

    /// The conversation in front, its screen if it is a session.
    var selected: SessionViewController? { currentId.flatMap(panes.session) }
    var currentId: String? { workspace.activeSessionId }

    /// Opens a conversation in the workspace: its group's tab, the deck pushed
    /// over the board on a compact width, the grid in the detail on a wide one.
    func openSession(_ id: String) {
        railSheet?.dismiss(animated: true)
        workspace.open(id)
        // From another place the board and the conversations arrive as one
        // stack; `showWorkspace` then finds them in front on a compact width
        // and does the wide screen's part.
        if destination != .fleet { move(to: .fleet, opening: true) }
        showWorkspace(animated: true)
        hostTabs()
        rail.requestRefresh()
    }

    /// Puts the workspace where the width shows it.
    private func showWorkspace(animated: Bool) {
        if compact {
            guard compactNav.topViewController !== workspaceController else { return }
            if workspaceController.parent != nil, workspaceController.parent !== compactNav { detail.show(nil) }
            compactNav.setViewControllers([compactNav.viewControllers.first ?? board, workspaceController], animated: animated)
        } else {
            if workspace.openIds.isEmpty {
                detail.show(nil)
                return
            }
            workspace.fillGroups()
            guard detail.shown !== workspaceController else { return }
            if compactNav.viewControllers.contains(workspaceController) {
                compactNav.setViewControllers([compactNav.viewControllers.first ?? board], animated: false)
            }
            detail.show(workspaceController)
        }
    }

    // MARK: What waits

    /// A Needs you row goes to what is waiting, never to a place: its
    /// session's tab comes to the front, the composer already holding the
    /// parked ask, the transcript where it was left. A run is answered in its run.
    private func openWaiting(_ item: HomeModel.NeedsItem) {
        switch item.kind {
        case let .ask(ask): openSession(ask.instanceId)
        case let .run(run): openSession(run.rowId)
        }
    }

    /// A conversation's own way back (its back or close): its tab closes; on a
    /// phone, a group left showing nothing goes back to the board.
    func returnToFleet(_ id: String) {
        workspace.close(id)
        rail.requestRefresh()
    }

    /// Keeps the stacks with the workspace however it changed (a tab closed
    /// from its strip, a drop): the phone leaves a group showing nothing for
    /// the board, the wide screen lands when nothing is open.
    private func followWorkspace() {
        _ = workspace.version
        guard isViewLoaded else { return }
        defer { hostTabs() }
        if compact {
            if workspace.activeSessionId == nil, compactNav.topViewController === workspaceController {
                compactNav.popToRootViewController(animated: true)
            }
        } else if workspace.openIds.isEmpty {
            if detail.shown != nil { detail.show(nil) }
            landIfEmpty()
        } else if detail.shown !== workspaceController {
            // Tabs kept from the last run: a wide screen shows them, never an empty detail.
            showWorkspace(animated: false)
        }
    }

    private lazy var barTabs = BarTabs(bar: mainNav.navigationBar, crumb: mainCrumb, cluster: mainCluster, toggle: railToggle)

    /// The bar carries the tabs only where the conversations are the page in
    /// front on a wide screen (Shell.svelte `hostedLeaf`: on a session page).
    private func hostTabs() {
        workspaceController.hosting = !compact && destination == .fleet && detail.shown === workspaceController
    }

    /// A wide screen never shows an empty detail if anything can be opened:
    /// the longest-waiting ask's session, else the most recently active one
    /// (home-state.svelte.ts `landing`), replacing rather than pushing.
    private func landIfEmpty() {
        guard !compact, workspace.openIds.isEmpty, home.ready else { return }
        let ask = home.needs.lazy.compactMap { item -> String? in
            if case let .ask(ask) = item.kind { return ask.instanceId }
            return nil
        }.first
        let latest = hub.fleet.rows.filter { $0.isLive && (home.delegates || $0.parentInstanceId == nil) }.max { hub.fleet.lastAt($0) < hub.fleet.lastAt($1) }?.id
        guard let landing = ask ?? latest else { return }
        workspace.land(landing)
        showWorkspace(animated: false)
    }

    // MARK: Width changes

    /// The workspace moves to the stack the new width shows; its panes go
    /// with it, drafts and places in the transcripts carried over.
    func splitViewControllerDidCollapse(_: UISplitViewController) {
        moveWorkspace()
    }

    func splitViewControllerDidExpand(_: UISplitViewController) {
        railSheet?.dismiss(animated: false)
        moveWorkspace()
    }

    private func moveWorkspace() {
        UIView.performWithoutAnimation {
            if compact {
                detail.show(nil)
                if workspace.activeSessionId != nil { showWorkspace(animated: false) }
            } else {
                if compactUnder != nil {
                    // The wide screen is on Fleet with the conversations: the compact stack rests on the board.
                    compactUnder = nil
                    compactCrumb.set(destination.crumb, animated: false)
                    TopBar.install(on: board.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: false)
                    compactNav.setViewControllers([board], animated: false)
                } else {
                    compactNav.setViewControllers([compactNav.viewControllers.first ?? board], animated: false)
                }
                showWorkspace(animated: false)
            }
            hostTabs()
        }
    }

    // MARK: Rail

    private func showRailSheet() {
        let sheet: SidebarViewController
        if let kept = keptRailSheet {
            sheet = kept
        } else {
            sheet = SidebarViewController(hub: hub, home: home, inSheet: true)
            sheet.host = self
            sheet.modalPresentationStyle = .custom
            sheet.transitioningDelegate = sheetTransition
            keptRailSheet = sheet
        }
        present(sheet, animated: true)
    }

    #if DEBUG
    func probeReopenRail() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.showRailSheet() }
    }
    #endif

    func toggleAssistant() {
        railSheet?.dismiss(animated: true)
        if assistantOpen { closeAssistant() } else { openAssistant() }
    }

    private var assistantPane: AssistantPane?
    private weak var assistantSheet: UIViewController?
    /// AssistantPanel.svelte's `(max-width: 899px)`: a drawer there, a pane wider.
    private var assistantDrawer: Bool { view.bounds.width < 900 }

    /// Where the assistant comes from: the rail's row on a desk; on a phone the
    /// sidebar toggle, since the sheet it opened from has gone.
    private var assistantOrigin: CGPoint? {
        let phoneToggle: UIView = compactNav.topViewController === workspaceController ? sessionBurger : burger
        let source: UIView = assistantDrawer ? (compact ? phoneToggle : railToggle) : rail.assistantSource
        guard source.window != nil else { return nil }
        return source.convert(CGPoint(x: source.bounds.midX, y: source.bounds.midY), to: view)
    }

    private func openAssistant() {
        assistantOpen = true
        let panel = AssistantPanelView(hub: hub, focused: { [weak self] in self?.workspace.activeSessionId }, closable: !assistantDrawer)
        panel.onClose = { [weak self] in self?.closeAssistant() }
        panel.onOpenSession = { [weak self] id in
            self?.closeAssistant()
            self?.openSession(id)
        }
        if assistantDrawer {
            let holder = AssistantHolder(panel: panel) { [weak self] in
                // Swiped or tapped away.
                guard let self, assistantOpen, assistantSheet == nil || assistantSheet?.isBeingDismissed == true else { return }
                assistantOpen = false
                refreshBars()
                rail.requestRefresh()
            }
            // `max-height: 85dvh` on the assistant's drawer.
            let sheet = HouseSheetController(holder, style: .card, scroller: panel.scroller, cap: 0.85)
            assistantSheet = sheet
            dialogPresenter.present(sheet, animated: true)
        } else {
            let pane = AssistantPane(panel: panel)
            pane.install(in: view, under: mainNav.navigationBar)
            pane.appear(from: assistantOrigin)
            assistantPane = pane
        }
        refreshBars()
        rail.requestRefresh()
    }

    private func closeAssistant() {
        assistantOpen = false
        if let pane = assistantPane {
            assistantPane = nil
            pane.disappear(into: assistantOrigin) { pane.removeFromSuperview() }
        }
        if let sheet = assistantSheet {
            assistantSheet = nil
            sheet.dismiss(animated: true)
        }
        refreshBars()
        rail.requestRefresh()
    }

    @objc private func escapeKey() {
        guard assistantPane != nil else { return }
        closeAssistant()
    }

    /// The New Session form, with what the caller knows filled in (Sidebar.svelte `newSession`).
    func startSession(machineId: String?, cwd: String?, projectId: String?) {
        // The phone's rail sheet steps aside first: the form opens over the page, not over the sheet.
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in self?.newSession.start(machineId: machineId, cwd: cwd, projectId: projectId) }
        } else {
            newSession.start(machineId: machineId, cwd: cwd, projectId: projectId)
        }
    }

    private lazy var newSession: NewSessionFlow = {
        let flow = NewSessionFlow(hub: hub)
        flow.presenter = { [weak self] in self?.dialogPresenter }
        flow.open = { [weak self] id in self?.openSession(id) }
        flow.title = { [weak self] id in self?.panes.title(id) }
        return flow
    }()

    /// NewProjectPopover: hung off the rail's plus, wherever the rail is.
    func newProject(from source: UIView) {
        KitPopover.present(NewProjectController(hub: hub), from: source, in: railSheet ?? self)
    }

    /// A task's sheet over its project's page (a `task` or `attempt` push):
    /// the page first, then the sheet over whatever is in front.
    func openTask(projectId: String, taskId: String, attempt: String?) {
        go(.project(projectId))
        // What was presented (another task's sheet, a dialog) gives way to this one.
        if presentedViewController != nil { dismiss(animated: false) }
        TaskSheetController.present(projectId: projectId, taskId: taskId, attempt: attempt, hub: hub,
                                    from: self) { [weak self] id in self?.openSession(id) }
    }

    /// FolderMenu's "Forget project…" and the project page's: the grouping
    /// goes, the checkout and its sessions stay; a project page that was
    /// showing it goes back to the place it was opened from.
    func forgetProject(_ project: ProjectRow) {
        let dialog = ConfirmDialog(
            title: "Forget \(project.name)?",
            body: "The grouping is removed. The checkout and its sessions stay on disk.",
            confirmLabel: "Forget",
            pendingLabel: "Forgetting…"
        ) { [weak self] in
            guard let self else { return }
            try await hub.deleteProject(id: project.id)
            if destination == .project(project.id) { go(spoke) }
            pages[.project(project.id)] = nil
            pages[Self.compactKey(.project(project.id))] = nil
        }
        (presentedViewController ?? self).present(dialog, animated: true)
    }

    func showLimits() {
        let limits = UsageSheetController(home: home)
        // The list's foot is the way to the Usage page.
        limits.onPage = { [weak self] in
            self?.dismiss(animated: true)
            self?.go(.usage)
        }
        // The house bottom sheet, as the home's usage bar presents it.
        limits.loadViewIfNeeded()
        (railSheet ?? self).present(HouseSheetController(limits, title: "Usage limits", scroller: limits.scroll), animated: true)
    }

    /// Native only: point this window at another hub (ConnectViewController's
    /// change mode), from the Machines popover and the phone sidebar's Machines.
    func changeHub() {
        // The phone's sheet steps aside first: the hub's sheet opens over the page.
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in self?.presentHub() }
        } else {
            presentHub()
        }
    }

    private func presentHub() {
        let connect = ConnectViewController(hub: hub, mode: .change) { [weak self] in
            self?.dismiss(animated: true)
        }
        let sheet = UINavigationController(rootViewController: connect)
        connect.navigationItem.title = "Hub"
        let close = UIBarButtonItem(title: "Close", image: Glyph.close.image, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        NavigationItems.configure(connect.navigationItem, leading: [close])
        sheet.sheetPresentationController?.detents = [.medium(), .large()]
        dialogPresenter.present(sheet, animated: true)
    }

    /// The phone sheet's Search: the sheet steps aside, and Jump opens over the page.
    func search() {
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in self?.openJump(.key) }
        } else {
            openJump(.key)
        }
    }

    /// Jump to (JumpPalette): ⌘K toggles it; the Jump button grows it out of itself.
    func openJump(_ opener: JumpOpener) {
        if let up = dialogPresenter as? JumpPaletteController {
            up.dismiss(animated: true)
            return
        }
        let palette = JumpPaletteController(hub: hub, home: home, opener: opener)
        palette.onProject = { [weak self] id in self?.go(.project(id)) }
        palette.onMachine = { [weak self] id in self?.startSession(machineId: id, cwd: nil, projectId: nil) }
        palette.onConversation = { [weak self] id in self?.openSession(id) }
        dialogPresenter.present(palette, animated: true)
    }

    // MARK: Keys (Shell.svelte `shortcut`): none of them while the reader is typing.

    /// Whether a command has something to act on: a split needs the
    /// conversations showing (`onSession`), one in front and another to leave behind.
    func can(_ command: RootViewController.ShellCommand) -> Bool {
        switch command {
        case .jump, .assistant, .startSession:
            return true
        case .splitRight, .splitDown:
            let showing = compact ? compactNav.topViewController === workspaceController : detail.shown === workspaceController
            return showing && workspace.activeSessionId != nil && workspace.openIds.count >= 2
        }
    }

    /// The menu bar's commands and their keys; every one stands down while the reader is typing.
    func perform(_ command: RootViewController.ShellCommand) {
        guard !UIResponder.isTyping, can(command) else { return }
        switch command {
        case .jump: openJump(.key)
        case .assistant: toggleAssistant()
        case .startSession: startSession(machineId: nil, cwd: nil, projectId: nil)
        // The conversation in front goes into the new half (`mod+\` right,
        // `mod+shift+\` below), as VS Code binds it.
        case .splitRight, .splitDown:
            guard let here = workspace.activeSessionId else { return }
            workspace.split(workspace.focusedLeaf, command == .splitRight ? .right : .bottom, here)
        }
    }

    /// Escape closes the desk's pane wherever focus is.
    override var keyCommands: [UIKeyCommand]? {
        guard assistantPane != nil else { return nil }
        let escape = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escapeKey))
        escape.wantsPriorityOverSystemBehavior = true
        return [escape]
    }

    /// MachinesButton's popover, hung from the button's end.
    private func openMachines(from source: UIView) {
        KitPopover.present(MachinesPopoverController(host: self), from: source, in: self, align: .end,
                           entrance: MachinesPopoverController.entrance)
    }

    /// Connect a machine (AddMachineDialog), over whatever is up.
    func addMachine() {
        dialogPresenter.present(AddMachineController(hub: hub), animated: true)
    }

    /// The topmost controller this window shows: what a dialog opens over.
    var dialogPresenter: UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    /// The bar's facts, from the hub's word.
    private func refreshBars() {
        defer { barTabs.relayout() }
        let fleet = hub.fleet
        // The count is the rows the drawer lists, as the web's is.
        let needs = home.needs
        let online = fleet.machines.filter { $0.status == "online" }.count
        let tone = MachineHealth.tone(fleet.machines, hubBuild: fleet.hubBuild)
        for cluster in [mainCluster, compactCluster, sessionCluster] {
            cluster.configure(needs: needs.count, online: online, tone: tone, drawerOpen: needsDrawer.open)
        }
        needsDrawer.configure(needs, now: Date.now.timeIntervalSince1970 * 1000)
        // Something new needs the operator: Caw beats once, on the bar in front.
        let ids = Set(needs.map(\.id))
        if home.ready {
            if let seen = seenNeeds, !ids.subtracting(seen).isEmpty {
                for cluster in [mainCluster, compactCluster, sessionCluster] where cluster.caw.window != nil {
                    cluster.beat()
                }
            }
            seenNeeds = ids
        }
    }

    // MARK: Grip

    /// The rail's resize handle (Shell.svelte `.grip`): 6pt on the rail's
    /// trailing edge, the control border under a pointer; a drag sets the
    /// width 1:1, coalesced to a frame, and it is kept when the finger lifts.
    /// Where a key's step is taking the rail, while its tween runs.
    private var railGoal: Double?

    /// Sets the rail's width, which is the grip's alone to set. From iOS 26
    /// the split view's own separator also resizes a column, and a width left
    /// by it stands over `preferredPrimaryColumnWidth` for good (measured: the
    /// preferred width went 220, 216, 224 while the column stayed 278.5), so a
    /// key's step could no longer move the rail. The column's limits are
    /// therefore both the width itself: the system has no range to resize
    /// in, and the width is whatever was set here, on every OS.
    private func setRail(_ width: Double) {
        minimumPrimaryColumnWidth = width
        maximumPrimaryColumnWidth = width
        preferredPrimaryColumnWidth = width
        view.layoutIfNeeded()
    }

    private weak var grip: RailGrip?

    /// The grip on the rail's trailing edge, 3pt either side of it, while the
    /// rail stands beside the page.
    private func placeGrip() {
        guard let grip else { return }
        let beside = !isCollapsed && !compact && displayMode == .oneBesideSecondary
        grip.isHidden = !beside
        guard beside else { return }
        let edge = traitCollection.layoutDirection == .rightToLeft ? view.bounds.width - primaryColumnWidth : primaryColumnWidth
        grip.frame = CGRect(x: edge - 3, y: 0, width: 6, height: view.bounds.height)
        view.bringSubviewToFront(grip)
    }

    private func installGrip() {
        let grip = RailGrip()
        // The grip reports where the finger is across the split view; the
        // rail's edge goes there.
        grip.onDrag = { [weak self] x in
            guard let self else { return }
            setRail(Self.clamp(traitCollection.layoutDirection == .rightToLeft ? view.bounds.width - x : x))
        }
        grip.onEnd = { [weak self] in
            guard let self else { return }
            UserDefaults.standard.set(primaryColumnWidth, forKey: Self.railKey)
        }
        // A key's step is a tween over `durControl`, from the width the rail
        // is going to (a step still in flight included), so held arrows glide.
        grip.onKey = { [weak self] x in
            guard let self else { return }
            let next = Self.clamp(x)
            railGoal = next
            UserDefaults.standard.set(next, forKey: Self.railKey)
            guard !UIAccessibility.isReduceMotionEnabled else {
                setRail(next)
                railGoal = nil
                return
            }
            UIView.animate(withDuration: Motion.durControl, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) {
                self.setRail(next)
            } completion: { [weak self] _ in
                if self?.railGoal == next { self?.railGoal = nil }
            }
        }
        grip.target = { [weak self] in self.map { $0.railGoal ?? Double($0.primaryColumnWidth) } ?? Self.railDefault }
        grip.width = { [weak self] in self.map { Double($0.primaryColumnWidth) } ?? Self.railDefault }
        // In the split view's own view, over everything it draws: from iOS 26
        // the split view lays a separator of its own on the rail's edge, and a
        // grip inside the rail sat under it and never saw a touch.
        grip.translatesAutoresizingMaskIntoConstraints = true
        view.addSubview(grip)
        self.grip = grip
        placeGrip()
        // The rail's hairline against the page.
        let edge = UIView()
        edge.backgroundColor = Palette.borderHairline
        edge.isUserInteractionEnabled = false
        edge.translatesAutoresizingMaskIntoConstraints = false
        rail.view.addSubview(edge)
        NSLayoutConstraint.activate([
            edge.topAnchor.constraint(equalTo: rail.view.topAnchor),
            edge.bottomAnchor.constraint(equalTo: rail.view.bottomAnchor),
            edge.trailingAnchor.constraint(equalTo: rail.view.trailingAnchor),
            edge.widthAnchor.constraint(equalToConstant: 1),
        ])
    }

    // MARK: Restoration

    var restorationValues: [AnyHashable: Any] {
        var values = selected?.restorationValues ?? [:]
        if case let .project(id) = destination { values["projectId"] = id }
        return values
    }
}

/// Re-reads what the bar shows whenever the hub's word on it changes.
@MainActor
private final class ShellWatcher {
    private let read: () -> Void

    init(hub: HubConnection, home: HomeModel, read: @escaping () -> Void) {
        self.read = read
        watch(hub: hub, home: home)
    }

    private func watch(hub: HubConnection, home: HomeModel) {
        withObservationTracking {
            self.read()
        } onChange: { [weak self, weak hub, weak home] in
            Task { @MainActor in
                guard let self, let hub, let home else { return }
                self.watch(hub: hub, home: home)
            }
        }
    }
}

/// The rail's grip: a pointer shows the column resize cursor's region and the
/// control border; a drag sets the width under the finger.
final class RailGrip: UIView, UIPointerInteractionDelegate {
    var onDrag: (Double) -> Void = { _ in }
    var onEnd: () -> Void = {}
    var width: () -> Double = { 228 }

    init() {
        super.init(frame: .zero)
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(pressed)))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        addInteraction(UIPointerInteraction(delegate: self))
        isAccessibilityElement = true
        accessibilityLabel = "Resize sidebar"
        accessibilityTraits = .adjustable
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RailGrip is built in code")
    }

    // A key steps the width (Shell.svelte `resizeKey`): the arrows by 8pt, 32
    // with shift, Home and End to the ends; the grip takes the keyboard when
    // it is pressed or reached by Tab.
    var onKey: (Double) -> Void = { _ in }
    /// The width the rail is going to, a step still in flight included.
    var target: () -> Double = { 228 }
    override var canBecomeFirstResponder: Bool { true }
    override var canBecomeFocused: Bool { true }

    /// A press on the grip, or the start of a drag, takes the keyboard.
    @objc private func pressed() {
        becomeFirstResponder()
    }

    override func didUpdateFocus(in context: UIFocusUpdateContext, with coordinator: UIFocusAnimationCoordinator) {
        super.didUpdateFocus(in: context, with: coordinator)
        if context.nextFocusedItem === self { becomeFirstResponder() } else if context.previouslyFocusedItem === self { resignFirstResponder() }
    }

    // The keys are read as presses, which reach the view holding the
    // keyboard directly; whatever it does not use goes on up the chain.
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var rest = presses
        for press in presses {
            guard let key = press.key else { continue }
            let step = key.modifierFlags.contains(.shift) ? 32.0 : 8.0
            switch key.keyCode {
            case .keyboardLeftArrow: onKey(target() - step)
            case .keyboardRightArrow: onKey(target() + step)
            case .keyboardHome: onKey(ShellController.railMin)
            case .keyboardEnd: onKey(ShellController.railMax)
            default: continue
            }
            rest.remove(press)
        }
        if !rest.isEmpty { super.pressesBegan(rest, with: event) }
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began: pressed()
        case .changed: onDrag(pan.location(in: superview).x)
        case .ended, .cancelled: onEnd()
        default: break
        }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        backgroundColor = hover.state == .began || hover.state == .changed ? Palette.borderControl : .clear
    }

    override func accessibilityIncrement() {
        onDrag(width() + 8)
        onEnd()
    }

    override func accessibilityDecrement() {
        onDrag(width() - 8)
        onEnd()
    }

    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .verticalBeam(length: bounds.height), constrainedAxes: .vertical)
    }
}

/// The wide screen's page for the fleet: the conversation in front, or, with
/// nothing open, the empty detail (SessionSurface.svelte `.empty-detail`):
/// Caw for a real wait, or once the fleet is read and nothing could be
/// opened, where to start.
final class FleetDetailController: ObservedViewController {
    private let hub: HubConnection
    private let home: HomeModel
    private(set) var shown: UIViewController?
    private let empty = UIStackView()
    private let caw = CawView(status: .loading)
    private let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        self.home = home
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FleetDetailController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        caw.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([caw.widthAnchor.constraint(equalToConstant: 150), caw.heightAnchor.constraint(equalToConstant: 150)])
        line.textAlignment = .center
        empty.axis = .vertical
        empty.alignment = .center
        empty.spacing = Space.space3
        empty.addArrangedSubview(caw)
        empty.addArrangedSubview(line)
        empty.translatesAutoresizingMaskIntoConstraints = false
        // He fades out over the conversation that lands, so he never takes its touches.
        empty.isUserInteractionEnabled = false
        caw.onGone = { [weak self] in
            guard let self else { return }
            empty.isHidden = shown != nil
        }
        view.addSubview(empty)
        NSLayoutConstraint.activate([
            empty.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func refreshContent() {
        // He moves only while something needs the reader. With sessions merely working he is
        // awake and still; with nothing going on he sleeps.
        let state: CawStatus = if hub.state == .unreachable {
            .reconnecting
        } else if !home.ready {
            .loading
        } else if !home.needs.isEmpty {
            .needsYou
        } else if home.working.isEmpty {
            .sleeping
        } else {
            .ready
        }
        caw.status = state
        line.text = switch state {
        case .reconnecting: "Reaching the hub again…"
        case .loading: "Reading the fleet…"
        default: "Open a session from the list, or start one."
        }
        standIn()
    }

    /// With nothing open, Caw and his line stand in the detail area. Once a conversation is in
    /// front the line goes and he fades out over it; `onGone` then puts the area away.
    private func standIn() {
        let open = shown != nil
        line.isHidden = open
        if !open {
            empty.isHidden = false
        }
        view.bringSubviewToFront(empty)
        caw.present = !open
    }

    /// The conversation in front, cross-fading over `durControl`.
    func show(_ next: UIViewController?) {
        let old = shown
        shown = next
        if let next {
            addChild(next)
            next.view.frame = view.bounds
            next.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(next.view)
            next.didMove(toParent: self)
            next.view.alpha = old == nil ? 1 : 0
        }
        standIn()
        guard let old else { return }
        old.willMove(toParent: nil)
        let fade = Motion.easeOut.animator(Motion.durControl) {
            next?.view.alpha = 1
            old.view.alpha = 0
        }
        fade.addCompletion { _ in
            old.view.removeFromSuperview()
            old.removeFromParent()
        }
        fade.startAnimation()
    }
}

extension UIResponder {
    private nonisolated(unsafe) static weak var found: UIResponder?

    /// typing.ts `isTyping`: a text field or text view has the keyboard.
    static var isTyping: Bool {
        found = nil
        UIApplication.shared.sendAction(#selector(UIResponder.reportFirstResponder), to: nil, from: nil, for: nil)
        return found is UITextField || found is UITextView
    }

    @objc private func reportFirstResponder() {
        UIResponder.found = self
    }
}
