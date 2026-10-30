import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
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

    /// This window's open conversations and their groups.
    let workspace = Workspace()
    private let panes: PaneHost
    private lazy var workspaceController = WorkspaceController(workspace: workspace, panes: panes, context: context)
    /// The phone's session page has no bar: its strip is the one row, and its
    /// toggle and Caw float over the strip's ends (WorkspaceController `barOverlay`).
    private let sessionCluster = TopBarCluster()
    private let sessionBurger = BurgerButton(bare: true)
    /// Where this window comes to rest (`land`), until it has; nil after.
    private var landing: ShellLanding?
    private static let restoring = Logger(subsystem: "dev.cawco.app", category: "Restore")
    /// Every notification, in the panel under Caw's head on any bar.
    private let cawPanel = CawPanel()
    /// The asks already seen, by id: one that is not is new, and Caw beats once. Nil until the fleet is read.
    private var seenNeeds: Set<String>?
    /// Likewise the notices, by id; nil until their sources are read.
    private var seenNotices: Set<String>?
    /// The wide screen's sidebar toggle: the rail's column shown or hidden.
    private let railToggle = BurgerButton()
    #if targetEnvironment(macCatalyst)
    /// The Mac's own top bar, holding the crumb, the hosted tabs and the
    /// cluster for good. It has no sidebar toggle, as the web's desktop has
    /// none (Shell.svelte `.burger min-[900px]:hidden`): the rail stands
    /// beside the page and its grip resizes it.
    private lazy var macBar = MacBar(crumb: mainCrumb, cluster: mainCluster)
    #endif

    /// The wide screen's bar: the Mac's own, an iPad's system bar.
    private var mainBar: UIView {
        #if targetEnvironment(macCatalyst)
        macBar
        #else
        mainNav.navigationBar
        #endif
    }

    /// The wide screen's page in front takes the bar's parts: on an iPad its
    /// system bar carries the toggle, the crumb and the cluster as items. The
    /// Mac's bar holds them itself, whatever the page.
    private func installMainBar(on page: UIViewController) {
        #if !targetEnvironment(macCatalyst)
        TopBar.install(on: page.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: railToggle)
        #endif
    }

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
    private var lookWatcher: ShellWatcher!
    private var catalogWatcher: ShellWatcher!

    private static let railKey = "cawco-rail-width"
    static let railMin = 216.0
    static let railMax = 520.0
    static let railDefault = 228.0

    var context: ShellContext {
        ShellContext(hub: hub, home: home, openSession: { [weak self] id in self?.openSession(id) }, go: { [weak self] place in self?.go(place) },
                     openTask: { [weak self] projectId, taskId in self?.openTask(projectId: projectId, taskId: taskId) },
                     openConfigure: { [weak self] slug in self?.openConfigure(slug) },
                     forgetProject: { [weak self] project, source in self?.forgetProject(project, from: source) },
                     startSession: { [weak self] machineId, cwd, projectId, spinOff in
                         self?.startSession(machineId: machineId, cwd: cwd, projectId: projectId, spinOff: spinOff)
                     },
                     sessionMenus: sessionMenus)
    }

    /// What a session's menu does through the shell, wherever the row stands.
    var sessionMenus: SessionMenuContext {
        SessionMenuContext(
            hub: hub,
            open: { [weak self] id in self?.openSession(id) },
            continueInNewSession: panes.continueHandler.map { _ in { [weak self] id in self?.panes.continueInNewSession(id) } },
            continueStored: { [weak self] source in self?.newSession.continueSession(source) },
            cancelContinuation: { [weak self] row in self?.newSession.cancelDetached(row: row) },
            fork: { [weak self] source in self?.newSession.fork(source) },
            asks: sessionAsks
        )
    }

    /// This window's one question about a session, under the row that asked.
    let sessionAsks = SessionAsks()

    func markStatus(_ row: InstanceRow) -> MarkStatus {
        HomeViewController.status(row, home: home)
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
        panes.continueHandler = { [weak self] id in self?.newSession.continueSession(id) }
        // A Caw thread's task cards, its way to the board, its machines line and its first message's new tab.
        panes.onOpenTask = { [weak self] projectId, taskId in self?.openTask(projectId: projectId, taskId: taskId) }
        panes.onOpenProject = { [weak self] projectId in self?.go(.project(projectId)) }
        panes.onCheckMachines = { [weak self] source in self?.openMachines(from: source) }
        // An artifact's own tab learned its name: the strips draw it.
        panes.onNamed = { [weak self] _ in self?.workspaceController.requestRefresh() }
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
            home.onUsageSignIn = { [weak self] in self?.openConfigure("accounts") }
        }
        // The page's dock: Start session where the phone's thumb reaches.
        board.onStart = { [weak self] in self?.startSession(machineId: nil, cwd: nil, projectId: nil) }
        // A home row is the session menu's trigger, as a rail row is.
        for home in [board, railHome] {
            home.sessionMenus = { [weak self] in self?.sessionMenus }
        }

        let railNav = UINavigationController(rootViewController: rail)
        railNav.setNavigationBarHidden(true, animated: false)
        // Hidden, and never the Mac window's toolbar either (TopBar `dress`).
        railNav.navigationBar.preferredBehavioralStyle = .pad
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
            cluster.onJump = { [weak self] source in self?.openJump(.press(source)) }
            cluster.onMachines = { [weak self] source in self?.openMachines(from: source) }
            cluster.onCaw = { [weak self, weak cluster] head in
                guard let self, let cluster else { return }
                // It hangs from the glass he stands on: his own tab on a phone, the bar's group on a wide screen.
                if cawPanel.open { glassCard.close() } else { glassCard.show(cawPanel, from: head, glass: cluster.glass) }
            }
            cluster.onCawPull = { [weak self, weak cluster] head, pan in
                guard let self, let cluster else { return }
                // A pull on him while the card hangs with another content morphs it into his panel, as his press does; the rest of that pull is spent.
                if pan.state == .began, glassCard.open, glassCard.showing !== cawPanel {
                    cawPullSpent = true
                    glassCard.show(cawPanel, from: head, glass: cluster.glass)
                }
                if cawPullSpent {
                    if [.ended, .cancelled, .failed].contains(pan.state) { cawPullSpent = false }
                    return
                }
                glassCard.pulled(pan, showing: cawPanel, from: head, glass: cluster.glass)
            }
        }
        glassCard.onChange = { [weak self] in self?.refreshBars() }
        glassCard.onLeave = { [weak self] content in
            guard let self else { return }
            // The machines and Jump are made for an opening and let go once out of the card.
            if content === machinesCard { machinesCard = nil }
            if content === jumpCard { jumpCard = nil }
        }
        cawPanel.onChoose = { [weak self] item in self?.openWaiting(item) }
        cawPanel.onAnswer = { [weak self] item, ask, answer in
            guard let self, home.live else { return }
            hub.needs.answer(ask, answer)
        }
        // The fleet's upstream choice, answered on its Needs you row; the hub's refusal said there.
        cawPanel.onUpstream = { [weak self] answer in
            guard let self else { return }
            try await hub.answerFleetUpstream(answer)
        }
        cawPanel.onDismiss = { [weak self] notice in self?.home.dismiss(notice) }
        cawPanel.onAcknowledge = { [weak self] ids in self?.home.acknowledge(ids) }
        cawPanel.onAct = { [weak self] notice in
            if notice.action == .openTestFlight { UIApplication.shared.open(HubConnection.Incompatible.testFlight) }
            self?.home.act(notice)
        }
        installMainBar(on: detail)
        TopBar.install(on: board.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: false)
        TopBar.pin(compactCluster, to: compactNav.navigationBar)
        placeSessionRow()
        // One group on a wide screen: its strip is the bar's, in the crumb's place.
        workspaceController.onHost = { [weak self] strip in self?.barTabs.host(strip) }
        // Back on the board from the conversations (a back swipe, a place
        // swapped in over them), the focused group shows nothing; its tabs
        // stay. Only when the conversations are what left: the stack's first
        // appearance shows its root too, and clearing the group there sent a
        // restored scene's conversation away and the phone to rest on Home.
        compactMotion.didShow = { [weak self] shown, left in
            guard let self, shown === compactNav.viewControllers.first, left === workspaceController, compact else { return }
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
            applyLanding()
            #if DEBUG
            #if !targetEnvironment(macCatalyst)
            #endif
            #endif
        }
        // Apart from the bars: a pulse of a conversation in front wakes only this read.
        lookWatcher = ShellWatcher(hub: hub, home: home) { [weak self] in self?.lookAtFront() }
        catalogWatcher = ShellWatcher(hub: hub, home: home) { [weak self] in self?.sayCatalogLeftOut() }
    }

    /// The load of each machine's stored sessions last said here.
    private var saidCatalogLoads: [String: Int] = [:]

    /// The harnesses a machine's listing left out, said in one warning toast
    /// per machine, changed in place by each load and dismissed once a load
    /// leaves none out (client.svelte.ts `loadCatalog`: `toast.warning(said.join(" "),
    /// { id: "catalog-unread-<machine>" })`). Said in this window once it is
    /// on screen; until then each load waits for `viewDidAppear`.
    private func sayCatalogLeftOut() {
        let leftOut = hub.fleet.catalogLeftOut
        guard isViewLoaded, view.window != nil else { return }
        for (machineId, left) in leftOut where saidCatalogLoads[machineId] != left.load {
            saidCatalogLoads[machineId] = left.load
            let id = "catalog-unread-\(machineId)"
            if left.sentences.isEmpty {
                Toast.dismiss(id: id, in: view)
            } else {
                Toast.show(left.sentences.joined(separator: " "), kind: .warning, id: id, in: view)
            }
            #if DEBUG
            Logger(subsystem: "dev.cawco.app", category: "Probe").notice("probe catalog left out: machine \(machineId, privacy: .public) load \(left.load) \(left.sentences.isEmpty ? "dismissed" : "said", privacy: .public) \(left.sentences.count) harness(es)")
            #endif
        }
    }

    // MARK: Landing

    /// Where this window comes to rest: a restored scene's place and
    /// conversation, a new window's conversation, a simulator pass's
    /// `-open-session`, or, with nothing named, the launch's own start. One
    /// route for all of them, so a restore is never raced by a launch default.
    func land(_ next: ShellLanding) {
        landing = next
        // Its screen is built when its group first shows it: the draft and
        // the transcript's place wait for it there (PaneHost `restore`).
        if let values = next.values, let id = next.sessionIds.last { panes.restore(values, for: id) }
        applyLanding()
    }

    /// Lands once the fleet's first read is in and the shell is in its
    /// window, where its width is known. Before that the shell is off screen
    /// (CawWaiting holds it out of the window until the read), its size class
    /// unspecified: a conversation opened then went into the wide screen's
    /// detail, and the phone's own stack stayed on its board.
    private func applyLanding() {
        // Read on every pass, so the watcher wakes when a waiting route can land.
        let ready = routeReady
        let routable = pushRoute != nil && ready
        guard isViewLoaded, view.window != nil else { return }
        guard landing != nil else {
            if routable { applyRoute() }
            return
        }
        guard home.ready else { return }
        // After the watcher's read: landing changes the workspace it observes.
        DispatchQueue.main.async { [weak self] in
            guard let self, let landing else { return }
            self.landing = nil
            let place = landing.place ?? .fleet
            Self.restoring.notice("landing on \(place.route, privacy: .public), session \(landing.sessionIds.last?.prefix(8) ?? "none", privacy: .public), transcript place saved: \(landing.values?["transcriptPosition"] != nil), compact: \(self.compact)")
            if place != .fleet { move(to: place, opening: false, animated: false) }
            if landing.sessionIds.isEmpty {
                // Nothing in front to bring back: a phone rests on the place,
                // whatever its workspace kept in front from the last run.
                if compact, workspace.activeSessionId != nil { workspace.showBoard() }
            } else {
                for id in landing.sessionIds { openSession(id, animated: false) }
            }
            // A tapped push lands over the restore, never under it.
            applyRoute()
        }
    }

    // MARK: Push routes

    /// A tapped push's route (PushNote.route), kept until the shell has
    /// landed and the hub has answered the fleet's first read. One route at a
    /// time: a later tap replaces one still waiting.
    private var pushRoute: PushRoute?
    private static let pushLog = Logger(subsystem: "dev.cawco.app", category: "Push")

    /// Opens what a tapped push names, now or once it can land.
    func open(_ route: PushRoute) {
        pushRoute = route
        Self.pushLog.notice("route \(String(describing: route), privacy: .public) waiting")
        applyLanding()
    }

    /// The hub is connected and has answered for the fleet: a session's id
    /// can be told present or gone. An unreachable hub's `home.ready` is not this.
    private var routeReady: Bool {
        hub.state == .connected && hub.fleet.fleetRead && hub.fleet.liveRead
    }

    private func applyRoute() {
        guard let route = pushRoute, routeReady else { return }
        pushRoute = nil
        switch route {
        case let .session(id):
            // An ask no session row stands behind (a memory proposal) opens
            // where it was made (`PushNote.route`), else as its own tab, its
            // card answerable there; the read above holds the hub's asks.
            guard hub.fleet.byId[id] != nil || hub.needs.blocked(id)
                || !hub.needs.madeIn(id).isEmpty else {
                Self.pushLog.notice("route session \(id, privacy: .public) is not on the hub")
                Toast.show("That session isn't on the hub any more.", in: view.window)
                return
            }
            openSession(id)
        case let .project(id): go(.project(id))
        case let .task(projectId, taskId): openTask(projectId: projectId, taskId: taskId)
        case .board: go(.fleet)
        // Needs you is Caw's panel: it hangs from the glass in front, as his press opens it.
        case .needs:
            let cluster = frontCluster
            if glassCard.showing !== cawPanel || !cawPanel.open {
                glassCard.show(cawPanel, from: cluster.caw, glass: cluster.glass)
            }
        case .keepPro: onKeepPro()
        }
        Self.pushLog.notice("route \(String(describing: route), privacy: .public) landed")
    }

    /// What the scene keeps when it goes to the background
    /// (RootViewController `restorationActivity`): the place in front, and
    /// the conversation when the conversations are the page in front. On a
    /// phone they are pushed over the place they were opened from, and that
    /// place is kept with them.
    var restoration: (place: ShellDestination, sessionId: String?) {
        if compact {
            let onSession = compactNav.topViewController === workspaceController
            return onSession ? (compactUnder ?? .fleet, currentId) : (destination, nil)
        }
        return (destination, destination == .fleet ? currentId : nil)
    }


    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ShellController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        installGrip()
        // Over every column and the grip, with nothing under it: the page
        // keeps working while it is open, and a tap outside it closes it and
        // lands where it fell.
        view.addSubview(glassCard)
        glassCard.dismissal(in: view)
        // Over everything else, while the hub has caught any law broken.
        LawsBrokenShelf(hub: hub).stand(in: view)
        railEdge.maximumNumberOfTouches = 1
        // Only where the conversations' pages reach the screen's left edge,
        // with nothing over them: a phone's, and an iPad's with the rail's
        // column put away (beside it, the left edge is the rail's).
        railEdgeGate.mayBegin = { [weak self] in
            guard let self, presentedViewController == nil else { return false }
            if compact { return compactNav.topViewController === workspaceController }
            return traitCollection.userInterfaceIdiom == .pad && displayMode == .secondaryOnly && detail.shown === workspaceController
        }
        railEdgeGate.holder = { [weak self] in
            guard let self, workspaceController.isViewLoaded else { return nil }
            return workspaceController.view
        }
        railEdge.delegate = railEdgeGate
        view.addGestureRecognizer(railEdge)
        NotificationCenter.default.addObserver(self, selector: #selector(sceneActivated(_:)), name: UIScene.didActivateNotification, object: nil)
        #if targetEnvironment(macCatalyst)
        // The page's column shows the Mac's own bar over it, never the system's (MacBar).
        mainNav.setNavigationBarHidden(true, animated: false)
        view.addSubview(macBar)
        view.addGestureRecognizer(WindowDragGesture { [weak self] touch in
            guard let self else { return false }
            return movesWindow(touch.view, at: touch.location(in: view))
        })
        #endif
    }

    #if targetEnvironment(macCatalyst)
    /// Whether a press that landed on `hit`, at `point` in the shell's
    /// points, moves the window (MacWindow): on the bar's empty space, or on
    /// the rail's top, over its header, where the traffic lights stand.
    /// Never on a tab, a control or a row.
    func movesWindow(_ hit: UIView?, at point: CGPoint) -> Bool {
        guard let hit else { return false }
        if hit.isDescendant(of: macBar) {
            return WindowDragGesture.nothingTakes(hit, under: macBar)
        }
        if let railView = rail.viewIfLoaded, hit.isDescendant(of: railView) {
            return railView.convert(point, from: view).y < railView.safeAreaInsets.top && WindowDragGesture.nothingTakes(hit, under: railView)
        }
        return false
    }

    /// The Mac's bar across the window's top, from the rail's edge to the
    /// window's, `cTopBarH` tall; the page's column starts under it, the
    /// titlebar's inset it inherits (32pt) made up to the bar's height. The
    /// split view lays its columns over its view's other subviews on a pass:
    /// the bar comes back over them.
    private func placeMacBar() {
        let rail = !isCollapsed && displayMode == .oneBesideSecondary ? primaryColumnWidth : 0
        let start = traitCollection.layoutDirection == .rightToLeft ? 0 : rail
        let frame = CGRect(x: start, y: 0, width: max(0, view.bounds.width - rail), height: Size.cTopBarH)
        if macBar.frame != frame { macBar.frame = frame }
        view.bringSubviewToFront(macBar)
        let inherited = mainNav.view.safeAreaInsets.top - mainNav.additionalSafeAreaInsets.top
        let top = Size.cTopBarH - inherited
        if abs(mainNav.additionalSafeAreaInsets.top - top) > 0.25 { mainNav.additionalSafeAreaInsets.top = top }
    }
    #endif

    // MARK: Edge swipe

    /// On a phone's conversations a finger from the screen's left edge pulls
    /// the sidebar in, following it (`RailSheetTransition.follow`); the
    /// pages' swipe between chats waits for it to fail, so an edge swipe
    /// never moves to another chat (owner: "swipes from the leftmost of the
    /// screen to open the sidebar not swipe to the other chat"). A swipe
    /// that starts anywhere else is still the pages'. On an iPad with the
    /// rail's column put away the same swipe brings the column back, as its
    /// toggle does; the split view moves its columns itself, so it does not
    /// follow the finger. The edge is the app's own strip (`RailEdgeGate`),
    /// not UIScreenEdgePanGestureRecognizer's: that one decides by itself
    /// what counts as the screen's edge, and failed a one-finger drag from
    /// x=1 before it ever asked whether to begin, which handed the drag to
    /// the pages (simulator pass, `probe edge`).
    private lazy var railEdge = UIPanGestureRecognizer(target: self, action: #selector(railEdgePanned(_:)))
    private let railEdgeGate = RailEdgeGate()

    @objc private func railEdgePanned(_ pan: UIPanGestureRecognizer) {
        let width = RailSheetTransition.width(in: view.bounds.width)
        let dx = pan.translation(in: view).x
        #if DEBUG
        RailEdgeGate.probe("probe edge state=\(pan.state.rawValue) dx=\(dx)")
        #endif
        guard compact else {
            if pan.state == .began { toggleRail() }
            return
        }
        switch pan.state {
        case .began:
            // With less motion the sheet fades in at once rather than following the finger.
            if !UIAccessibility.isReduceMotionEnabled { sheetTransition.follow() }
            showRailSheet()
        case .changed:
            sheetTransition.move(dx, width: width)
        case .ended, .cancelled, .failed:
            sheetTransition.release(dx, speed: pan.velocity(in: view).x, width: width, ended: pan.state == .ended)
        default:
            break
        }
    }

    /// The phone's session row (variant B), over the strip's ends: the bare
    /// toggle glyph's leading edge `cBarPhoneEdge` from the screen's, its
    /// centre on the tabs' centre line (they stand on the row's floor), in a
    /// 44pt touch area reaching into the screen's edge; Caw's glass flush
    /// with the other edge, its top with the tabs' and its foot clear of the
    /// row's floor (TopBarCluster `cawLine`).
    private func placeSessionRow() {
        let row = workspaceController.barOverlay
        for part in [sessionBurger, sessionCluster] as [UIView] { row.addSubview(part) }
        NSLayoutConstraint.activate([
            sessionBurger.centerXAnchor.constraint(equalTo: row.leadingAnchor, constant: Size.cBarPhoneEdge + Size.cBarToggleGlyph / 2),
            sessionBurger.centerYAnchor.constraint(equalTo: row.bottomAnchor, constant: -Size.cTabRowH / 2),
            sessionCluster.trailingAnchor.constraint(equalTo: row.safeAreaLayoutGuide.trailingAnchor),
            sessionCluster.bottomAnchor.constraint(equalTo: row.bottomAnchor),
        ])
    }

    /// The wide screen's toggle: the rail's column steps aside, or back, as
    /// the split view moves its columns.
    private func toggleRail() {
        // Under the rail's breakpoint the sidebar comes over the page as the sheet, as the web's burger brings it.
        if railNarrow == true {
            showRailSheet()
            return
        }
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
    }

    /// The fleet may have been read before the shell was on screen: it lands now.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if targetEnvironment(macCatalyst)
        if let scene = view.window?.windowScene { MacWindow.takeOverMoves(of: scene) }
        #endif
        applyLanding()
        sayCatalogLeftOut()
        #if DEBUG
        #if !targetEnvironment(macCatalyst)
        #endif
        #endif
    }

    #if DEBUG

    /// The split's rail and the panes' screens.
    var probeRail: SidebarViewController { rail }















    /// Every animation key in `layer` and the layers under it, sorted, once each.
    private static func animationKeys(_ layer: CALayer) -> [String] {
        func all(_ at: CALayer) -> [String] { (at.animationKeys() ?? []) + (at.sublayers ?? []).flatMap(all) }
        return Array(Set(all(layer))).sorted()
    }




    #if !targetEnvironment(macCatalyst)

    #endif

    /// The first tab on screen in the phone's row.
    private static func firstTab(in view: UIView) -> TabView? {
        if let tab = view as? TabView, tab.window != nil, !tab.isHidden, tab.alpha > 0.01 {
            return tab
        }
        for child in view.subviews {
            if let found = firstTab(in: child) { return found }
        }
        return nil
    }

    /// The focused group's pages: the transcripts' scroller.
    private static func firstPages(in view: UIView) -> UIView? {
        if let pages = view as? PagingScrollView, pages.traceName.hasPrefix("sessions:"), pages.window != nil, !pages.isHidden {
            return pages
        }
        for child in view.subviews {
            if let found = firstPages(in: child) { return found }
        }
        return nil
    }
    #endif

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        #if targetEnvironment(macCatalyst)
        placeMacBar()
        #endif
        fitRail()
        barTabs.relayout()
        placeGrip()
        // The split view lays its columns over what else is in its view on
        // every pass (the grip brings itself back the same way): a card of
        // the glass stays over all of them, under the glass wherever it now stands.
        if !glassCard.isHidden {
            view.bringSubviewToFront(glassCard)
            glassCard.follow()
        }
    }

    static func clamp(_ width: Double) -> Double { min(railMax, max(railMin, width.rounded())) }

    /// Which side of the rail's breakpoint the window stood on at the last pass.
    private var railNarrow: Bool?

    /// The web's rail breakpoint (design.json `rail`, `max-width: 900px`): at
    /// or under it the sidebar's column stands aside and its toggle brings
    /// the sidebar over the page as the sheet, as the web's burger does;
    /// over it the column stands beside the page. The Mac keeps its column
    /// at every width, as Configure keeps its rail there (ConfigSections.listed).
    private func fitRail() {
        #if !targetEnvironment(macCatalyst)
        guard !compact, view.bounds.width > 0 else { return }
        let narrow = view.bounds.width <= 900
        guard narrow != railNarrow else { return }
        railNarrow = narrow
        preferredDisplayMode = narrow ? .secondaryOnly : .oneBesideSecondary
        railToggle.label = narrow ? "Show sidebar" : "Hide sidebar"
        #endif
    }

    private var compact: Bool { traitCollection.horizontalSizeClass == .compact }

    // MARK: Places

    func go(_ next: ShellDestination) {
        move(to: next, opening: false)
    }

    /// Configure, at one of its sections (`/config/<slug>`): where a machine's
    /// "Sign in an account…" and Usage's sign-in go.
    func openConfigure(_ slug: String) {
        dialogPresenter.dismiss(animated: true)
        move(to: .configure, opening: false)
        for page in [page(for: .configure), page(for: .configure, compact: true)] {
            (page as? ConfigureController)?.reveal(slug)
        }
    }

    /// The place a compact width's conversations were opened from, while it
    /// is the page under them: Back goes there, as the web's does.
    private var compactUnder: ShellDestination?

    /// Changes place. `opening`: a conversation is being opened from another
    /// place. On a compact width that is one push over the page in front,
    /// which stays under it; a navigation controller given two animated
    /// stacks in one turn (the board, then the conversations) keeps neither.
    /// `animated` false: a landing, the place put there with no travel.
    private func move(to next: ShellDestination, opening: Bool, animated: Bool = true) {
        railSheet?.dismiss(animated: true)
        guard next != destination else {
            guard next == .fleet, compact else { return }
            if compactUnder != nil {
                // Fleet asked for while another place is under the conversations: the board takes its place.
                compactUnder = nil
                compactCrumb.set(crumb(next), animated: true)
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
        mainCrumb.set(crumb(next), animated: true)
        let regularPage = next == .fleet ? detail : page(for: next)
        // The bar's toggle, crumb and cluster move with the place, so they stay one bar.
        installMainBar(on: regularPage)
        // A transition that is not animated never asks for its travel: none is left for the next one.
        mainMotion.route = animated ? travel : nil
        mainNav.setViewControllers([regularPage], animated: animated && !compact)
        compactMotion.route = animated ? travel : nil
        if opening, compact, let under = compactNav.viewControllers.first {
            // The page in front keeps its bar and stays in the stack.
            compactUnder = from
            if workspaceController.parent != nil, workspaceController.parent !== compactNav { detail.show(nil) }
            compactNav.setViewControllers([under, workspaceController], animated: animated)
        } else {
            compactUnder = nil
            let compactPage = next == .fleet ? board : page(for: next, compact: true)
            compactCrumb.set(crumb(next), animated: animated)
            TopBar.install(on: compactPage.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger, showsCrumb: next != .fleet)
            compactNav.setViewControllers([compactPage], animated: animated && compact)
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
        mainCrumb.set(crumb(under), animated: false)
        let regularPage = under == .fleet ? detail : page(for: under)
        installMainBar(on: regularPage)
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
        openSession(id, animated: true)
    }

    /// `animated` false: a landing, the conversation put in front with no push.
    private func openSession(_ id: String, animated: Bool) {
        railSheet?.dismiss(animated: true)
        workspace.open(Self.tabId(id, hub: hub))
        // From another place the board and the conversations arrive as one
        // stack; `showWorkspace` then finds them in front on a compact width
        // and does the wide screen's part.
        if destination != .fleet { move(to: .fleet, opening: true, animated: animated) }
        showWorkspace(animated: animated)
        hostTabs()
        rail.requestRefresh()
    }

    /// What opens for `id`: itself, but a project's conversation, the
    /// session its row names, is never a tab of its own (thread-tabs.ts
    /// `inLists`): it opens its newest thread, else a new one, so what is
    /// said there reaches the thread the web shows.
    static func tabId(_ id: String, hub: HubConnection) -> String {
        guard let row = hub.fleet.byId[id]?.session, let projectId = row.projectId,
              hub.fleet.projects.contains(where: { $0.id == projectId && $0.leadInstanceId == id }) else { return id }
        return hub.threads.of(projectId).first.map { ThreadTabs.tabId($0.id) } ?? ThreadTabs.newTabId(projectId)
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
    /// parked ask, the transcript where it was left. A fleet-watch notice opens the session it is about. An ask opens
    /// where it was made (NeedsCard.svelte `href`, ParkedAsk `paneId`): Caw's
    /// thread, the session that made it (a curator run's proposal), else its own.
    private func openWaiting(_ item: HomeModel.NeedsItem) {
        switch item.kind {
        case let .ask(ask): openSession(ask.paneId)
        case let .watch(notice): openSession(notice.instanceId)
        // Answered on its row; it opens nothing.
        case .choice, .tailnet: break
        }
    }

    /// An ask is answered where it was made (SessionPane.svelte `madeIn`): an
    /// open tab on an ask no session stands behind, which a session made (a
    /// memory curator run's proposal), moves to that session in place, whatever
    /// opened it (a tap on an older push, a restored tab, Jump). A tab on a
    /// former id (a session the hub folded into its continuation) moves to
    /// the session it is now, as SessionSurface.svelte does. Read on every
    /// change of the tabs, of the hub's asks and of its former ids, so a tab
    /// restored before they were read moves once they are.
    private func moveToOrigins() {
        let moves = workspace.openIds.compactMap { id in
            (hub.askOrigin(id) ?? hub.fleet.formerIds[id]).map { (from: id, to: $0) }
        }
        guard !moves.isEmpty else { return }
        // After this read: the move changes the tabs it observes.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            for move in moves where workspace.openIds.contains(move.from) {
                #if DEBUG
                Self.restoring.notice("probe alone \(move.from, privacy: .public): moves to \(move.to, privacy: .public)")
                #endif
                workspace.retarget(move.from, to: move.to)
            }
            rail.requestRefresh()
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
        moveToOrigins()
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

    private lazy var barTabs = BarTabs(bar: mainBar, dress: { [weak self] hosting in
        guard let self else { return }
        #if targetEnvironment(macCatalyst)
        macBar.dress(hosting: hosting)
        #else
        TopBar.dress(mainNav.navigationBar, hosting: hosting)
        #endif
    }, crumb: mainCrumb, cluster: mainCluster, toggle: railToggle)

    /// The bar carries the tabs only where the conversations are the page in
    /// front on a wide screen (Shell.svelte `hostedLeaf`: on a session page).
    /// Called wherever the page in front changes (a place, a width, the
    /// conversations shown or put away), so what the owner now sees is looked
    /// at too: back on the conversations from another place, the one in front
    /// is marked, which no workspace change says. Off this turn, so the
    /// watcher whose read called it never takes on the look's reads.
    private func hostTabs() {
        workspaceController.hosting = !compact && destination == .fleet && detail.shown === workspaceController
        DispatchQueue.main.async { [weak self] in self?.lookAtFront() }
    }

    /// A wide screen never shows an empty detail if anything can be opened:
    /// the longest-waiting ask's session, else the most recently active one
    /// (home-state.svelte.ts `landing`), replacing rather than pushing.
    private func landIfEmpty() {
        guard !compact, workspace.openIds.isEmpty, home.ready else { return }
        let ask = home.needs.lazy.compactMap { item -> String? in
            if case let .ask(ask) = item.kind { return ask.paneId }
            return nil
        }.first
        let latest = hub.fleet.rows.filter { $0.isLive && (home.delegates || $0.parentInstanceId == nil) }.max { hub.fleet.lastAt($0) < hub.fleet.lastAt($1) }?.id
        guard let landing = ask ?? latest else { return }
        workspace.land(landing)
        picked.insert(landing)
        showWorkspace(animated: false)
    }

    // MARK: What the owner looks at

    /// Conversations the shell put in front itself (`landIfEmpty`), until
    /// they leave the front: the owner did not pick them, so having them in
    /// front is not looking at them (SessionSurface.svelte `picked`).
    private var picked: Set<String> = []

    /// What the owner looks at counts as opened, SessionSurface.svelte's rule
    /// ported: a finished conversation is seen when it is in front where the
    /// owner can see it (its group's chosen tab on a wide screen, the one
    /// shown on a phone), with the conversations the page in front and the
    /// window's scene active. Only one a turn of which ended since it was
    /// last seen (`turnEndedUnseen`: its row's turn end past its seen mark)
    /// is marked, so a turn that ends while it is watched is seen as it ends,
    /// with its delegates still running or its next turn begun, in whatever
    /// order the row and the pulse arrive; a turn is never marked ahead of its
    /// end, and nothing is sent twice.
    private func lookAtFront() {
        // A group's tabs and the one in front change in place (PaneLeaf is a
        // plain class); `version` is the workspace's only observed mark of
        // an open, a switch or a close. Without it this read woke for none
        // of them, so a conversation opened in front was never marked.
        _ = workspace.version
        let tabs = workspace.leaves.compactMap(\.active)
        // One the shell picked that has left the front was switched away
        // from: it never puts one back, so in front again it is the owner's doing.
        picked.formIntersection(tabs)
        let front = compact ? workspace.activeSessionId.map { [$0] } ?? [] : tabs
        // Read before the checks below, so the watcher wakes when a turn in front ends.
        let unseen = front.filter { id in
            guard let row = hub.fleet.byId[id] else { return false }
            return home.turnEndedUnseen(row) && !picked.contains(id)
        }
        guard isViewLoaded, let scene = view.window?.windowScene else { return }
        let shown = compact
            ? compactNav.topViewController === workspaceController
            : destination == .fleet && detail.shown === workspaceController
        // The focused group's conversation is the one this window has in
        // front; `Presence` decides whether the window itself is in front.
        Presence.shared.front(shown ? workspace.activeSessionId : nil, in: scene)
        guard scene.activationState == .foregroundActive, shown, !unseen.isEmpty else { return }
        home.look(unseen)
    }

    /// The window came to the front (SessionSurface.svelte's `visibilitychange`).
    @objc private func sceneActivated(_ note: Notification) {
        guard let scene = note.object as? UIScene, scene === view.window?.windowScene else { return }
        #if targetEnvironment(macCatalyst)
        if let scene = scene as? UIWindowScene { MacWindow.takeOverMoves(of: scene) }
        #endif
        lookAtFront()
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
                    compactCrumb.set(crumb(destination), animated: false)
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
        // The sidebar comes over the page: no card of the glass stays open under it.
        glassCard.close(refocus: false)
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


    /// The New Session form, with what the caller knows filled in (Sidebar.svelte `newSession`).
    func startSession(machineId: String?, cwd: String?, projectId: String?) {
        startSession(machineId: machineId, cwd: cwd, projectId: projectId, spinOff: false)
    }

    /// The form as above; `spinOff` opens it as a spin-off (a project's Spin off).
    func startSession(machineId: String?, cwd: String?, projectId: String?, spinOff: Bool) {
        // The phone's rail sheet steps aside first: the form opens over the page, not over the sheet.
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in
                self?.newSession.start(machineId: machineId, cwd: cwd, projectId: projectId, spinOff: spinOff)
            }
        } else {
            newSession.start(machineId: machineId, cwd: cwd, projectId: projectId, spinOff: spinOff)
        }
    }

    private lazy var newSession: NewSessionFlow = {
        let flow = NewSessionFlow(hub: hub)
        flow.presenter = { [weak self] in self?.dialogPresenter }
        flow.open = { [weak self] id in self?.openSession(id) }
        flow.title = { [weak self] id in self?.panes.title(id) }
        return flow
    }()

    /// NewProjectPopover: hung off the rail's plus, wherever the rail is. The
    /// project the hub answers with, made or joined, opens in the rail and on
    /// its page, under the hub's name for it: a folder that joined a project
    /// shows that project, wherever its primary place is.
    func newProject(from source: UIView) {
        let form = NewProjectController(hub: hub) { [weak self] created in
            RailPrefs.shared.setCollapsed(created.id, false)
            self?.rail.requestRefresh()
            self?.go(.project(created.id))
        }
        KitPopover.present(form, from: source, in: railSheet ?? self)
    }

    /// A task's sheet over its project's page (a `task` or `attempt` push):
    /// the page first, then the sheet over whatever is in front.
    func openTask(projectId: String, taskId: String) {
        go(.project(projectId))
        // What was presented (another task's sheet, a dialog) gives way to this one.
        if presentedViewController != nil { dismiss(animated: false) }
        TaskSheetController.present(projectId: projectId, taskId: taskId, hub: hub, home: home,
                                    from: self) { [weak self] id in self?.openSession(id) }
    }

    /// FolderMenu's "Forget project…" and the project page's: one dialog
    /// (ForgetProjectDialog) that grows out of `source`, names what runs and
    /// stops it first. The grouping goes, the checkout and its sessions stay;
    /// a project page that was showing it goes back to the place it was opened from.
    func forgetProject(_ project: ProjectRow, from source: UIView?) {
        let dialog = ForgetProjectDialog(project: project, hub: hub, home: home) { [weak self] in
            guard let self else { return }
            if destination == .project(project.id) { go(spoke) }
            pages[.project(project.id)] = nil
            pages[Self.compactKey(.project(project.id))] = nil
        }
        dialog.origin = source
        (presentedViewController ?? self).present(dialog, animated: true)
    }

    /// The window's CawCo Pro gate answers the rail's free-week line (RootViewController sets it).
    var onKeepPro: () -> Void = {}

    func keepPro() {
        // The phone's sheet steps aside first: the paywall opens over the page.
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in self?.onKeepPro() }
        } else {
            onKeepPro()
        }
    }

    func showLimits() {
        let limits = UsageSheetController(home: home)
        // The list's foot is the way to the Usage page.
        limits.onPage = { [weak self] in
            self?.dismiss(animated: true)
            self?.go(.usage)
        }
        limits.onOpenSession = { [weak self] id in self?.openSession(id) }
        limits.onSignIn = { [weak self] in self?.openConfigure("accounts") }
        // The house bottom sheet, as the home's usage bar presents it.
        limits.loadViewIfNeeded()
        let sheet = HouseSheetController(limits, title: "Usage limits", scroller: limits.scroll)
        // The list ends on its 44pt way to the page: it stands on the home indicator's edge, no padding under it.
        sheet.footAtSafeArea = true
        (railSheet ?? self).present(sheet, animated: true)
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
        // H2's Turn on: the notification setup, over the hub's sheet.
        connect.turnOnNotifications = { [weak self] in
            guard let self else { return }
            PaywallController.present(.setup, banner: HeroBanner.card(hub: hub, home: home), from: dialogPresenter)
        }
        let sheet = UINavigationController(rootViewController: connect)
        connect.navigationItem.title = "Hub"
        let close = UIBarButtonItem(title: "Close", image: Glyph.close.image, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        NavigationItems.configure(connect.navigationItem, leading: [close])
        sheet.sheetPresentationController?.detents = [.medium(), .large()]
        // HIG (Sheets): a resizable sheet shows its grabber.
        sheet.sheetPresentationController?.prefersGrabberVisible = true
        dialogPresenter.present(sheet, animated: true)
    }

    /// The phone sheet's Search: the sheet steps aside, and Jump comes down
    /// out of the glass Caw stands on.
    func search() {
        if let sheet = railSheet {
            sheet.dismiss(animated: true) { [weak self] in self?.openJump(.press(nil)) }
        } else {
            openJump(.press(nil))
        }
    }

    // MARK: The glass's cards

    /// The one card on the glass (DESIGN.md, "The glass's cards"): it shows
    /// Caw's panel, the machines or Jump, one at a time, and morphs from one
    /// into the next while it hangs.
    private let glassCard = GlassCard()
    /// The machines and Jump, each made for an opening and let go once out
    /// of the card (`onLeave`); Caw's panel stays for the window's life.
    private var machinesCard: MachinesCard?
    private var jumpCard: JumpCard?
    /// A pull on Caw that morphed the card into his panel: the rest of it moves nothing.
    private var cawPullSpent = false

    /// The bar in front, whose glass the cards hang from: a wide screen's
    /// glass group; on a phone Caw's tab, on the conversations' row or the board's bar.
    private var frontCluster: TopBarCluster {
        guard compact else { return mainCluster }
        return compactNav.topViewController === workspaceController ? sessionCluster : compactCluster
    }

    /// Jump to (JumpPalette): the search glass and ⌘K open and close it. A
    /// press brings it down out of the glass, or morphs the hanging card
    /// into it; ⌘K stands it, or swaps it in, at once.
    func openJump(_ opener: JumpOpener) {
        let instant: Bool
        let trigger: UIView?
        switch opener {
        case .key: (instant, trigger) = (true, nil)
        case let .press(source): (instant, trigger) = (false, source)
        }
        if let open = jumpCard, open.open {
            if instant { open.leaveByKey() } else { open.close() }
            return
        }
        // One still fading out of the card, or folding back, comes back from where it has reached.
        let card = jumpCard ?? {
            let made = JumpCard(hub: hub, home: home)
            made.onProject = { [weak self] id in self?.go(.project(id)) }
            made.onMachine = { [weak self] id in self?.startSession(machineId: id, cwd: nil, projectId: nil) }
            made.onConversation = { [weak self] id in self?.openSession(id) }
            jumpCard = made
            return made
        }()
        card.trigger = trigger
        let cluster = frontCluster
        glassCard.show(card, from: cluster.caw, glass: cluster.glass, instant: instant)
    }

    // MARK: Keys (Shell.svelte `shortcut`): none of them while the reader is typing.

    /// Whether a command has something to act on: a split needs the
    /// conversations showing (`onSession`), one in front and another to leave behind.
    func can(_ command: RootViewController.ShellCommand) -> Bool {
        switch command {
        case .jump, .startSession, .configure:
            return true
        case .splitRight, .splitDown:
            let showing = compact ? compactNav.topViewController === workspaceController : detail.shown === workspaceController
            return showing && workspace.activeSessionId != nil && workspace.openIds.count >= 2
        }
    }

    /// The menu bar's commands and their keys; every one stands down while the reader is typing.
    func perform(_ command: RootViewController.ShellCommand) {
        // ⌘K closes Jump at once, its own field typing or not.
        if command == .jump, let card = jumpCard, card.open {
            card.leaveByKey()
            return
        }
        guard !UIResponder.isTyping, can(command) else { return }
        switch command {
        case .jump: openJump(.key)
        case .startSession: startSession(machineId: nil, cwd: nil, projectId: nil)
        case .configure: go(.configure)
        // The conversation in front goes into the new half (`mod+\` right,
        // `mod+shift+\` below), as VS Code binds it.
        case .splitRight, .splitDown:
            guard let here = workspace.activeSessionId else { return }
            workspace.split(workspace.focusedLeaf, command == .splitRight ? .right : .bottom, here)
        }
    }

    /// MachinesButton's card, on the glass the button stands in; the button opens and closes it.
    private func openMachines(from source: UIView) {
        if let open = machinesCard, open.open {
            open.close()
            return
        }
        let card = machinesCard ?? {
            let made = MachinesCard(host: self)
            machinesCard = made
            return made
        }()
        card.trigger = source
        let cluster = frontCluster
        glassCard.show(card, from: cluster.caw, glass: cluster.glass)
    }

    /// Connect a machine (AddMachine.swift), over whatever is up.
    func addMachine() {
        dialogPresenter.present(AddMachineController(hub: hub), animated: true)
    }

    /// The topmost controller this window shows: what a dialog opens over.
    var dialogPresenter: UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    /// What the bar names (Shell.svelte `crumb`): a project's own name, once
    /// the fleet's projects are read, else the place's section.
    private func crumb(_ place: ShellDestination) -> String {
        if case let .project(id) = place, let name = hub.fleet.projects.first(where: { $0.id == id })?.name { return name }
        return place.crumb
    }

    /// The bar's facts, from the hub's word.
    private func refreshBars() {
        defer { barTabs.relayout() }
        let fleet = hub.fleet
        // A project's name arrives with the fleet, and changes when it is renamed.
        mainCrumb.set(crumb(destination), animated: false)
        compactCrumb.set(crumb(compactUnder ?? destination), animated: false)
        // The rim counts what needs the operator, never the notices.
        let needs = home.needs
        let notices = home.notices
        let tone = MachineHealth.tone(fleet.machines, hubBuild: fleet.hubBuild)
        for cluster in [mainCluster, compactCluster, sessionCluster] {
            cluster.configure(needs: needs.count, notices: notices.count, quiet: home.quiet, machines: fleet.machines.count, tone: tone, panelOpen: cawPanel.open)
        }
        var answers = CawPanel.Answers()
        for item in needs {
            if case let .ask(ask) = item.kind, let sent = hub.needs.answerSent(for: ask) { answers.sent[item.id] = sent }
        }
        cawPanel.configure(needs: needs, answers: answers, notices: notices, quiet: home.quiet, now: home.now, live: home.live)
        home.noticesShown(notices)
        // Something new needs the operator, or a new notice came: Caw beats once, on the bar in front.
        var fresh = false
        let ids = Set(needs.map(\.id))
        if home.ready {
            if let seen = seenNeeds, !ids.subtracting(seen).isEmpty { fresh = true }
            seenNeeds = ids
        }
        let noticeIds = Set(notices.map(\.id))
        if home.ready, home.noticesRead {
            if let seen = seenNotices, !noticeIds.subtracting(seen).isEmpty { fresh = true }
            seenNotices = noticeIds
        }
        if fresh {
            for cluster in [mainCluster, compactCluster, sessionCluster] where cluster.caw.window != nil {
                cluster.beat()
            }
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
}

/// The edge swipe's gate (ShellController `railEdge`): when it may begin,
/// and which drags wait for it to fail.
@MainActor
private final class RailEdgeGate: NSObject, UIGestureRecognizerDelegate {
    var mayBegin: @MainActor () -> Bool = { false }
    /// The view whose drags wait for the edge swipe: the conversations, on a phone.
    var holder: @MainActor () -> UIView? = { nil }

    /// Only a touch that lands in the edge's strip (`cEdgePull`, the web's
    /// `.edge`): the rest never reach the edge pan, so no drag that starts
    /// further in ever waits on it.
    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        let at = touch.location(in: nil)
        #if DEBUG
        if at.x < 40 { Self.probe("probe edge touch x=\(at.x) y=\(at.y) inStrip=\(at.x <= Size.cEdgePull)") }
        #endif
        return at.x <= Size.cEdgePull
    }

    /// From the strip, a finger that travels right more than it travels down
    /// (Shell.svelte `edgeSwipe`), where the sidebar may open.
    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let pan = gesture as? UIPanGestureRecognizer, let view = pan.view else { return false }
        let v = pan.velocity(in: view)
        let rightward = v.x > 0 && v.x > abs(v.y)
        let may = rightward && mayBegin()
        #if DEBUG
        Self.probe("probe edge shouldBegin=\(may) rightward=\(rightward) v=\(v.x),\(v.y)")
        #endif
        return may
    }

    #if DEBUG

    static func probe(_ line: String) {
        guard probing else { return }
        Logger(subsystem: "dev.cawco.app", category: "Probe").notice("\(line, privacy: .public)")
    }
    #endif

    /// Every drag inside the conversations (the pages' swipe between chats,
    /// the strip's scroll, a tab's pull) waits for the edge swipe to fail.
    func gestureRecognizer(_: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        guard other is UIPanGestureRecognizer, let view = other.view, let holder = holder() else { return false }
        return view.isDescendant(of: holder)
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
        let now = current
        return now is UITextField || now is UITextView
    }

    /// What has the keyboard's focus now, if anything does.
    static var current: UIResponder? {
        found = nil
        UIApplication.shared.sendAction(#selector(UIResponder.reportFirstResponder), to: nil, from: nil, for: nil)
        return found
    }

    @objc private func reportFirstResponder() {
        UIResponder.found = self
    }
}
