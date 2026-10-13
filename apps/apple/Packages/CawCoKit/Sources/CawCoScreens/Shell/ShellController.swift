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
            home.onUsageSignIn = { [weak self] in self?.go(.configure) }
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
            hub.needs.answer(ask, machineId: item.machineId, answer)
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
            openProbeForm()
            runMacProbe()
            #if !targetEnvironment(macCatalyst)
            runHangProbe()
            #endif
            #endif
        }
        // Apart from the bars: a pulse of a conversation in front wakes only this read.
        lookWatcher = ShellWatcher(hub: hub, home: home) { [weak self] in self?.lookAtFront() }
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
        hub.state == .connected && hub.fleet.fleetRead && hub.fleet.liveRead && hub.fleet.runsRead
    }

    private func applyRoute() {
        guard let route = pushRoute, routeReady else { return }
        pushRoute = nil
        switch route {
        case let .session(id):
            guard id.hasPrefix(BoardRun.prefix) || hub.fleet.byId[id] != nil else {
                Self.pushLog.notice("route session \(id, privacy: .public) is not on the hub")
                Toast.show("That session isn't on the hub any more.", in: view.window)
                return
            }
            openSession(id)
        case let .project(id): go(.project(id))
        case let .task(projectId, taskId, attempt): openTask(projectId: projectId, taskId: taskId, attempt: attempt)
        case .board: go(.fleet)
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

    #if DEBUG
    /// A simulator pass's `-new-session <projectId> <machineId>`: the New
    /// Session form, opened once the fleet's read holds that project, with it
    /// chosen on that machine (`-new-session-step` and `-new-session-machines`
    /// take the form on from there: NewSessionViewController).
    private var probeForm: (projectId: String, machineId: String)? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-new-session"), arguments.indices.contains(at + 2) else { return nil }
        return (arguments[at + 1], arguments[at + 2])
    }()

    private func openProbeForm() {
        guard let form = probeForm, home.ready, hub.fleet.projects.contains(where: { $0.id == form.projectId }),
              isViewLoaded, view.window != nil else { return }
        probeForm = nil
        DispatchQueue.main.async { [weak self] in self?.startSession(machineId: form.machineId, cwd: nil, projectId: form.projectId) }
    }
    #endif

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

    /// The fleet may have been read before the shell was on screen: it lands now.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if targetEnvironment(macCatalyst)
        if let scene = view.window?.windowScene { MacWindow.takeOverMoves(of: scene) }
        #endif
        applyLanding()
        #if DEBUG
        openProbeForm()
        runMacProbe()
        #if !targetEnvironment(macCatalyst)
        runHangProbe()
        #endif
        if ProcessInfo.processInfo.arguments.contains("-shell-probe"), shellProbe == nil {
            shellProbe = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.probeShell() }
            }
        }
        if ActsProbe.on, !actsProbed {
            actsProbed = true
            ActsProbe.start(shell: self, home: home, continuations: newSession)
        }
        #endif
    }

    #if DEBUG
    private var shellProbe: Timer?
    private var actsProbed = false

    /// A simulator pass's `-shell-probe`: once a second, in the Probe log,
    /// the tab in front, how many tabs its group has, whether the sidebar's
    /// sheet is up, and on a phone's conversations Caw's glass and touch
    /// frame (window points) against the top edge of the transcript's pages;
    /// then every animation in the scene's windows that repeats for ever and
    /// every Rive view drawing (`LoopCensus`), on a `probe loops` line.
    private func probeShell() {
        let rail = railSheet.map { !$0.isBeingDismissed } ?? false
        var line = "probe shell tab=\(currentId ?? "none") tabs=\(workspace.focused.tabs.count) rail=\(rail)"
        let caw = sessionCluster.caw
        if compact, compactNav.topViewController === workspaceController, let window = caw.window,
           let pages = Self.firstPages(in: workspaceController.view) {
            let glass = caw.convert(caw.bounds, to: window)
            let top = pages.convert(pages.bounds, to: window).minY
            let box = { (r: CGRect) in "\(r.minX),\(r.minY),\(r.width)x\(r.height)" }
            line += " caw=\(box(glass)) hit=\(box(caw.accessibilityFrame))"
            // The row's first tab as drawn: its top and foot against Caw's glass's.
            if let tab = Self.firstTab(in: workspaceController.view) {
                line += " firstTab=\(box(tab.convert(tab.bounds, to: window)))"
            }
            line += " transcriptTop=\(top) gap=\(top - glass.maxY) label=\(caw.accessibilityLabel ?? "")"
        }
        let probe = Logger(subsystem: "dev.cawco.app", category: "Probe")
        probe.notice("\(line, privacy: .public)")
        // What keeps the app from going idle this second, and how often the
        // shell laid out, placed the panel and remade its rows since the last
        // line: a probe whose read timed out prints these.
        let loops = LoopCensus.running(in: view.window?.windowScene?.windows ?? [])
        let counts = "layouts=\(ProbeCounts.shellLayouts) places=\(ProbeCounts.panelPlaces) rows=\(ProbeCounts.panelRows)"
        ProbeCounts.shellLayouts = 0
        ProbeCounts.panelPlaces = 0
        ProbeCounts.panelRows = 0
        probe.notice("probe loops n=\(loops.count) \(counts, privacy: .public) \(loops.joined(separator: " | "), privacy: .public)")
    }

    /// A Mac pass's `-mac-probe <dir>`: once the fleet is read, at a 1400pt
    /// and then a 1000pt wide window, it renders the window into `dir`
    /// (board, Caw's panel, the Machines popover) and prints, per width: the
    /// bar as drawn (from the window's top), its height against the web's,
    /// its controls' centre line against its own; the traffic lights' frame
    /// against the rail, its header and the bar's first control; each bar
    /// tab's hit-test at its centre and a rail hit-test; at points on the
    /// bar's empty space, on a tab and a control in the old titlebar strip
    /// and on the rail's top, the UIKit view a press lands on, whether the
    /// shell moves the window from there (`movesWindow`), and whether AppKit
    /// still moves it by itself (a press queued on NSApplication). Such a
    /// press reaches UIKit only where a control takes it; there the drag
    /// gesture prints what it saw, AppKit's current event among it (a left
    /// mouse-down with its window, the event `MacWindow.move` starts a drag
    /// from). Then the panel's and the popover's frames against their
    /// anchors. Last, a 640pt window: whether the rail
    /// still stands beside the page.
    private lazy var macProbeDir: URL? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-mac-probe"), arguments.indices.contains(at + 1) else { return nil }
        return URL(fileURLWithPath: arguments[at + 1])
    }()

    private var macProbeRan = false

    private func runMacProbe() {
        #if targetEnvironment(macCatalyst)
        guard let dir = macProbeDir, !macProbeRan, home.ready, let window = view.window, let scene = window.windowScene else { return }
        macProbeRan = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            func say(_ line: String) {
                Logger(subsystem: "dev.cawco.app", category: "Probe").notice("\(line, privacy: .public)")
                print("probe mac \(line)")
            }
            func snap(_ name: String) {
                let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                    _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                }
                try? image.pngData()?.write(to: dir.appending(path: "\(name).png"))
            }
            func box(_ r: CGRect) -> String { String(format: "x %.1f y %.1f w %.1f h %.1f (maxX %.1f)", r.minX, r.minY, r.width, r.height, r.maxX) }
            func tabs(in view: UIView) -> [TabView] {
                (view as? TabView).map { [$0] } ?? view.subviews.flatMap { tabs(in: $0) }
            }
            let appKit = MacProbeAppKit(window: window)
            // Each line reaches the log as it is printed, even if the run is stopped.
            setvbuf(stdout, nil, _IOLBF, 0)
            try? await Task.sleep(for: .seconds(2))
            say("windows \(appKit.windows)")
            for width in [1400.0, 1000.0] {
                let frame = scene.effectiveGeometry.systemFrame
                scene.requestGeometryUpdate(.Mac(systemFrame: CGRect(x: frame.minX, y: frame.minY, width: width, height: 820)))
                try? await Task.sleep(for: .seconds(1))
                let name = "w\(Int(width))"
                let bar = macBar
                let barBox = bar.convert(bar.bounds, to: window)
                let titlebar = scene.titlebar
                say("\(name) window \(box(window.bounds)) safe \(window.safeAreaInsets) shell safe \(view.safeAreaInsets) page safe \(mainNav.view.safeAreaInsets) system bar hidden \(mainNav.isNavigationBarHidden)")
                say("\(name) bar \(box(barBox)) from window top \(abs(barBox.minY) < 0.5) height \(barBox.height) web \(Size.cTopBarH) starts at the rail's edge \(abs(barBox.minX - primaryColumnWidth) < 0.5)")
                let glassBox = mainCluster.glass.convert(mainCluster.glass.bounds, to: window)
                let pageTop = mainNav.topViewController.map { $0.view.convert($0.view.safeAreaLayoutGuide.layoutFrame, to: window).minY } ?? -1
                say("\(name) bar centre \(barBox.midY) cluster glass \(box(glassBox)) centred \(abs(glassBox.midY - barBox.midY) < 0.5) tabs' floor \(tabs(in: bar).first.map { $0.convert($0.bounds, to: window).maxY } ?? -1) bar floor \(barBox.maxY) page content top \(pageTop)")
                say("\(name) titlebar title hidden \(titlebar?.titleVisibility == .hidden) toolbar \(titlebar?.toolbar == nil ? "none" : "present") railToggle on screen \(railToggle.window != nil)")
                say("\(name) board takes clicks \(view.isUserInteractionEnabled) alpha \(view.alpha) pro board open \(Pro.shared.boardOpen) access \(String(describing: Pro.shared.access))")
                snap("\(name)-board")
                var holder = tabs(in: bar).first?.superview
                while let at = holder, !(at is UIScrollView) { holder = at.superview }
                let strip = holder as? UIScrollView
                let shown = strip.map { $0.convert($0.bounds, to: window) } ?? window.bounds
                let railBox = rail.view.convert(rail.view.bounds, to: window)
                let lights = appKit.lights
                // The bar's first control: the strip when it hosts tabs, else the crumb.
                let first = strip != nil ? shown : mainCrumb.convert(mainCrumb.bounds, to: window)
                say("\(name) traffic lights \(lights.map(box) ?? "not found") rail \(box(railBox)) rail safe top \(rail.view.safeAreaInsets.top) bar's first control \(box(first))")
                if let lights {
                    say("\(name) lights over the rail \(railBox.contains(lights)) clear of the rail's header \(lights.maxY <= railBox.minY + rail.view.safeAreaInsets.top) clear of the bar's first control \(!lights.intersects(first))")
                }
                if #available(macCatalyst 26.0, *) {
                    say("\(name) corner-adapted safe area: window \(window.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))) bar \(bar.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal)))")
                }
                if let strip {
                    let edge = mainCluster.convert(CGPoint(x: mainCluster.leadingEdge, y: 0), to: window).x
                    say("\(name) strip \(box(shown)) offset \(strip.contentOffset.x) content \(strip.contentSize.width), cluster's first control at \(edge)")
                }
                // Presses: where each lands, whether the shell moves the window from there, whether AppKit still does by itself.
                var presses: [(String, CGPoint)] = [
                    ("bar above the tabs", CGPoint(x: shown.midX, y: 4)),
                    ("bar above the glass", CGPoint(x: glassBox.midX, y: 2)),
                    ("bar under the glass", CGPoint(x: glassBox.midX, y: 42)),
                    ("search, on the glass", CGPoint(x: glassBox.minX + 20, y: glassBox.midY)),
                    ("rail's top", CGPoint(x: railBox.midX, y: 16)),
                    ("rail's header", CGPoint(x: railBox.midX, y: rail.view.safeAreaInsets.top + 16)),
                ]
                if let strip {
                    presses.append(("strip past the last tab", CGPoint(x: min(shown.maxX - 4, shown.minX + strip.contentSize.width - strip.contentOffset.x + 24), y: barBox.midY)))
                }
                if let chosen = tabs(in: bar).first(where: { $0.id == currentId && $0.window != nil }).map({ $0.convert($0.bounds, to: window).intersection(shown) }), !chosen.isNull {
                    presses += [("chosen tab's top", CGPoint(x: chosen.midX, y: chosen.minY + 3)), ("chosen tab's middle", CGPoint(x: chosen.midX, y: chosen.midY)),
                                ("chosen tab's foot", CGPoint(x: chosen.midX, y: chosen.maxY - 3))]
                }
                let items = mainCluster.glass.content.subviews.flatMap(\.subviews).map { box($0.convert($0.bounds, to: window)) }
                say("\(name) glass items \(items) presented \(presentedViewController.map { "\(type(of: $0))" } ?? "none")")
                // Every hit-test first, then the presses: a press may raise a tip or a card over what follows.
                let landings = presses.map { label, point in
                    let hit = window.hitTest(point, with: nil)
                    let onTab = hit.map { landed in tabs(in: bar).contains { landed.isDescendant(of: $0) } } ?? false
                    let onControl = hit.map { landed in sequence(first: landed, next: \.superview).contains { $0 is UIControl } } ?? false
                    let shellMoves = movesWindow(hit, at: view.convert(point, from: window))
                    return "\(name) press on the \(label) \(point): lands on \(hit.map { "\(type(of: $0))" } ?? "nil"), a tab \(onTab), a control \(onControl); the shell moves the window \(shellMoves)"
                }
                for ((_, point), landing) in zip(presses, landings) {
                    MacWindow.lastAsk = "none"
                    WindowDragGesture.lastTouch = "none"
                    let appKitMoves = await appKit.press(at: point)
                    let raised = presentedViewController.map { "\(type(of: $0))" }
                    if raised != nil { dismiss(animated: false) }
                    say("\(landing); a window move was asked \(appKitMoves); the drag gesture saw \(WindowDragGesture.lastTouch); the shell's ask saw \(MacWindow.lastAsk); raised \(raised ?? "nothing")")
                }
                for tab in tabs(in: bar) where tab.window != nil && !tab.isHidden {
                    let frame = tab.convert(tab.bounds, to: window)
                    // A click at the middle of what the strip shows of it.
                    let seen = frame.intersection(shown)
                    guard !seen.isEmpty else {
                        say("\(name) tab \(tab.accessibilityLabel?.prefix(24) ?? "?") scrolled out of the strip")
                        continue
                    }
                    let hit = window.hitTest(CGPoint(x: seen.midX, y: seen.midY), with: nil)
                    say("\(name) tab \(tab.accessibilityLabel?.prefix(24) ?? "?") \(box(frame)) shown \(Int(seen.width))pt, hit lands on tab \(hit?.isDescendant(of: tab) == true) (\(hit.map { "\(type(of: $0))" } ?? "nil"))")
                }
                let railPoint = rail.view.convert(CGPoint(x: rail.view.bounds.midX, y: 160), to: window)
                let railHit = window.hitTest(railPoint, with: nil)
                say("\(name) rail \(box(rail.view.convert(rail.view.bounds, to: window))) hit at \(railPoint) lands in rail \(railHit?.isDescendant(of: rail.view) == true) (\(railHit.map { "\(type(of: $0))" } ?? "nil"))")
                await probeGlassCards(window: window, say: { say("\(name) \($0)") }, snap: { snap("\(name)-\($0)") })
            }
            let frame = scene.effectiveGeometry.systemFrame
            scene.requestGeometryUpdate(.Mac(systemFrame: CGRect(x: frame.minX, y: frame.minY, width: 640, height: 820)))
            try? await Task.sleep(for: .seconds(1))
            let lights = appKit.lights
            let bar = macBar
            say("w640 window \(box(window.bounds)) display mode \(displayMode.rawValue) collapsed \(isCollapsed) compact \(compact) rail \(box(rail.view.convert(rail.view.bounds, to: window))) on screen \(rail.view.window != nil) bar \(box(bar.convert(bar.bounds, to: window))) lights \(lights.map(box) ?? "not found")")
            snap("w640-board")
            say("done")
        }
        #endif
    }

    /// The glass's card through each of its contents, the way a press opens
    /// each (DESIGN.md, "The glass's cards"): Caw's panel from shut; the
    /// machines (where the bar has their glass) and then Jump morphed in from
    /// it; Caw's panel again; ⌘K into Jump from it. Per stop: the card's
    /// identity (one card throughout), where it hangs against the glass (its
    /// top on the glass's foot, its trailing edge flush within 1pt, the neck's
    /// span the glass's) and what it shows. Per morph (`scrubMorph`): the size
    /// tween's clock against the morph's, every animation key in the card (no
    /// slide's `transform`), and the card held at 0, 50 and 100% of the tween
    /// with its trailing edge and top against the glass's flank and foot. Then
    /// ⌘K: Jump goes at once and stands again at once, read in the same turn
    /// as the key, with no frame between and no animation in the card.
    private func probeGlassCards(window: UIWindow, say: (String) -> Void, snap: (String) -> Void) async {
        func box(_ r: CGRect) -> String { String(format: "x %.1f y %.1f w %.1f h %.1f (maxX %.1f)", r.minX, r.minY, r.width, r.height, r.maxX) }
        let card = glassCard
        let identity = "\(ObjectIdentifier(card))"
        func row() {
            guard let glass = card.glass else { return say("\(card.name) not hung") }
            let cap = view.convert(GlassCard.restingBox(of: glass, under: card.head, in: view), to: window)
            let drawn = card.convert(card.bounds, to: window)
            let neck = card.card.neck
            let edge = compact ? window.bounds.maxX - window.safeAreaInsets.right : cap.maxX
            say("\(card.name) glass \(box(cap)) card \(box(drawn)) top on the glass's foot \(abs(drawn.minY - (cap.maxY + glass.neck)) < 0.5) (neck \(glass.neck)) trailing flush \(abs(drawn.maxX - cap.maxX) <= 1) (screen edge \(abs(drawn.maxX - edge) <= 1)) neck span \(neck.end - neck.start) glass span \(cap.width) equal \(abs((neck.end - neck.start) - cap.width) < 0.5) flare \(neck.flareStart) flush end \(neck.flush == .end) glass joined \(glass.joined)")
            say("card \(ObjectIdentifier(card)) the same \("\(ObjectIdentifier(card))" == identity) shows \(card.showing?.name ?? "nothing") open \(card.open)")
        }
        let cluster = frontCluster
        say(Self.glassReading(cluster.glass))
        card.show(cawPanel, from: cluster.caw, glass: cluster.glass)
        try? await Task.sleep(for: .seconds(0.8))
        row()
        snap("caw-panel")
        if !compact {
            await scrubMorph("panel-to-machines", say: say, snap: snap) { openMachines(from: mainCluster.machinesItem) }
            row()
            if let machinesCard { say(Self.rulesReading(machinesCard)) }
            snap("machines")
        }
        await scrubMorph(compact ? "panel-to-jump" : "machines-to-jump", say: say, snap: snap) { openJump(.press(compact ? nil : mainCluster.jumpItem)) }
        row()
        if let jumpCard {
            say(Self.rulesReading(jumpCard))
            say("jump field focused \(jumpCard.fieldFocused)")
        }
        snap("jump")
        await scrubMorph("jump-to-panel", say: say, snap: snap) { card.show(cawPanel, from: cluster.caw, glass: cluster.glass) }
        row()
        // ⌘K into Jump while Caw's panel hangs: swapped at once, read in the key's own turn.
        openJump(.key)
        let swapKeys = Self.animationKeys(card.layer)
        say("cmd-k swap: shows \(card.showing?.name ?? "nothing") revealed \(card.card.revealed) switch keys \(swapKeys.filter(Self.switchKeys.contains)) content's own \(swapKeys.filter { !Self.switchKeys.contains($0) }) card the same \("\(ObjectIdentifier(card))" == identity)")
        try? await Task.sleep(for: .seconds(0.4))
        // ⌘K: read in the same turn as the key, before any frame is drawn.
        openJump(.key)
        say("cmd-k close: jump hidden at once \(card.isHidden) glass joined \(cluster.glass.joined)")
        openJump(.key)
        let instant = !card.isHidden && card.card.revealed >= 1 && card.showing === jumpCard
        say("cmd-k open: jump standing at once \(instant) revealed \(card.card.revealed) glass joined \(cluster.glass.joined) field focused \(jumpCard?.fieldFocused ?? false) animation keys \(Self.animationKeys(card.layer))")
        try? await Task.sleep(for: .seconds(0.4))
        snap("jump-by-key")
        jumpCard?.leaveByKey()
        try? await Task.sleep(for: .seconds(0.6))
    }

    /// What a switch of the card animates, if it animates: its box, its
    /// edge and cut, the contents' fades, a slide's transform. Anything else
    /// in it is a content's own (a field's caret, a row's selection tint).
    private static let switchKeys: Set<String> = ["bounds", "bounds.size", "bounds.origin", "position", "path", "locations", "opacity", "transform"]

    /// Every session mark in the card and each of its parts as drawn now
    /// (presentation values, in the card's points); every image the card
    /// draws: those drawn at another size than their own bounds (`off`, a
    /// view laid out inside a tween grows from where UIKit first put it, an
    /// image view from its image's own size) and those wider or taller than
    /// 40pt (`big`: a glyph is 12-24pt); and any layout animation in the
    /// contents (`laying`), which only the card's box may have.
    private static func marksReading(_ card: GlassCard) -> String {
        func box(_ r: CGRect) -> String { String(format: "%.1f %.1f %.1f %.1f", r.minX, r.minY, r.width, r.height) }
        let space = card.layer.presentation() ?? card.layer
        var marks: [String] = []
        var images = 0
        var off: [String] = []
        var big: [String] = []
        func walk(_ view: UIView) {
            for sub in view.subviews where !sub.isHidden {
                if let mark = sub as? SessionMarkView {
                    marks.append(mark.probeParts(in: card.layer).map { "\($0.name) \(box($0.frame))" }.joined(separator: ", "))
                }
                if sub is UIImageView {
                    images += 1
                    let shown = sub.layer.presentation() ?? sub.layer
                    let drawn = shown.convert(shown.bounds, to: space)
                    let own = sub.layer.bounds.size
                    if abs(shown.bounds.width - own.width) > 0.5 || abs(shown.bounds.height - own.height) > 0.5 {
                        off.append("\(type(of: sub)) drawn \(box(drawn)) own \(String(format: "%.1f %.1f", own.width, own.height))")
                    }
                    if drawn.width > 40 || drawn.height > 40 { big.append("\(type(of: sub)) \(box(drawn))") }
                }
                walk(sub)
            }
        }
        walk(card)
        let layout: Set<String> = ["bounds", "bounds.size", "bounds.origin", "position", "frame"]
        // Each layer under a content with a layout animation, named by its view (or its own class);
        // one inside a text field or view is the system's caret placing itself as the field takes focus.
        func inField(_ layer: CALayer) -> Bool {
            var view = layer.delegate as? UIView
            while let at = view {
                if at is UITextField || at is UITextView { return true }
                view = at.superview
            }
            return false
        }
        func laid(_ layer: CALayer, in content: String) -> [String] {
            let own = (layer.animationKeys() ?? []).filter(layout.contains).map { key in
                "\(content) \(layer.delegate.map { "\(type(of: $0))" } ?? "\(type(of: layer))") \(key)\(inField(layer) ? " in its field" : "")"
            }
            return own + (layer.sublayers ?? []).flatMap { laid($0, in: content) }
        }
        let laying = card.card.content.subviews.compactMap { $0 as? GlassContent }.flatMap { content in
            content.subviews.flatMap { laid($0.layer, in: content.name) }
        }
        return "\(marks.count) marks [\(marks.joined(separator: " | "))] images \(images) off [\(off.joined(separator: " | "))] big [\(big.joined(separator: " | "))] laying [\(Array(Set(laying)).sorted().joined(separator: ", "))]"
    }

    /// Every animation key in `layer` and the layers under it, sorted, once each.
    private static func animationKeys(_ layer: CALayer) -> [String] {
        func all(_ at: CALayer) -> [String] { (at.animationKeys() ?? []) + (at.sublayers ?? []).flatMap(all) }
        return Array(Set(all(layer))).sorted()
    }

    /// One switch of the glass's card (`start`), read on its own clock: the
    /// size tween's duration and curve against `durMorph` and `easeDrawer`,
    /// every animation key in the card (a slide out of or into the glass
    /// would be the slider's `transform`), then the card's layer held
    /// (`speed` 0) at 0, 50 and 100% of the tween by `timeOffset`, its
    /// presentation's trailing edge and top against the glass's flank and
    /// foot, captured at 50%; then let run on, and captured at its end.
    private func scrubMorph(_ label: String, say: (String) -> Void, snap: (String) -> Void, start: () -> Void) async {
        let card = glassCard
        let layer = card.layer
        let from = card.showing?.name ?? "nothing"
        // The size it tweens from: as drawn the moment before the switch.
        let startSize = (layer.presentation() ?? layer).frame.size
        start()
        // What a keyboard moving mid-switch does (`keyboardMoved`, Jump's field
        // letting the keyboard go as Caw's panel comes in): the card placed again
        // on a tween. Here with the panel's rows just built again, as the hub's
        // word changing builds them, so a first layout falling inside that tween
        // shows in the readings below.
        if card.showing === cawPanel {
            cawPanel.probeRebuild()
            card.place(animated: true)
        }
        // The tween's begin is stamped on the layer's clock when the transaction
        // carrying it commits, not when it starts: committed here, so the begin
        // read below is the tween's own. Left to the run loop, the commit can
        // come after this reads it (Jump's field raising the keyboard holds the
        // main thread, 4-127ms seen); the scrub then held a tween not yet begun,
        // which draws the size it tweens to ("panel-to-jump holds half the size
        // at time 0.000: … h 160.0 (63.0 to 160.0)").
        CATransaction.flush()
        let keys = Self.animationKeys(layer)
        let tween = (layer.animation(forKey: "bounds.size") ?? layer.animation(forKey: "bounds")) as? CABasicAnimation
        let curve: String = tween?.timingFunction.map { function in
            var point: [Float] = [0, 0]
            var all: [Float] = []
            for index in 1 ... 2 {
                function.getControlPoint(at: index, values: &point)
                all += point
            }
            return all.map { String(format: "%.3f", $0) }.joined(separator: ",")
        } ?? "none"
        let drawer = [Motion.easeDrawer.x1, Motion.easeDrawer.y1, Motion.easeDrawer.x2, Motion.easeDrawer.y2].map { String(format: "%.3f", $0) }.joined(separator: ",")
        say("\(label) card \(ObjectIdentifier(card)) from \(from) to \(card.showing?.name ?? "nothing") tween \(tween.map { String(format: "%.3f", $0.duration) } ?? "none") morph \(String(format: "%.3f", Motion.durMorph)) curve \(curve) drawer \(drawer) clock \(tween.map { abs($0.duration - Motion.durMorph) < 0.001 } ?? false && curve == drawer) keys \(keys) slide \(keys.contains("transform"))")
        guard let tween, let glass = card.glass else { return }
        let at = (layer.animation(forKey: "bounds.size") ?? layer.animation(forKey: "bounds"))?.beginTime ?? 0
        guard at > 0 else { return say("\(label) tween has no begin once committed") }
        // Half the size, not half the time: the drawer curve is front-loaded,
        // so at half its time the box has come ~97% of the way and reads as
        // the end. The time the curve reaches half its travel, by bisection.
        var low = 0.0
        var high = 1.0
        for _ in 0 ..< 40 {
            let mid = (low + high) / 2
            if Motion.easeDrawer.value(at: mid) < 0.5 { low = mid } else { high = mid }
        }
        let half = (low + high) / 2
        layer.speed = 0
        // The size it tweens to (the model's).
        let endSize = layer.frame.size
        for fraction in [0.0, half, 0.5, 1.0] {
            layer.timeOffset = at + fraction * tween.duration
            try? await Task.sleep(for: .milliseconds(150))
            if fraction == half {
                // The clock's start can sit a fraction of a millisecond off the tween's (the
                // card read 426.2pt for 425 at 0, 0.49 of its travel at `half`): the time is
                // found on the drawn size itself, the side that travels furthest at its midpoint.
                let wide = abs(endSize.width - startSize.width) >= abs(endSize.height - startSize.height)
                let mid = wide ? (startSize.width + endSize.width) / 2 : (startSize.height + endSize.height) / 2
                let rising = wide ? endSize.width > startSize.width : endSize.height > startSize.height
                var early = at
                var late = at + tween.duration
                for _ in 0 ..< 16 {
                    layer.timeOffset = (early + late) / 2
                    // The presentation is computed from what is committed: commit each step.
                    CATransaction.flush()
                    let size = (layer.presentation() ?? layer).frame.size
                    if ((wide ? size.width : size.height) < mid) == rising { early = layer.timeOffset } else { late = layer.timeOffset }
                }
                try? await Task.sleep(for: .milliseconds(150))
            }
            let drawn = layer.presentation()?.frame ?? layer.frame
            // Every piece the card draws at this stop: they all stand at the card's own size.
            say(String(format: "\(label) layers at %.3f: ", fraction) + card.card.probeLayers())
            say(String(format: "\(label) marks at %.3f: ", fraction) + Self.marksReading(card))
            let cap = GlassCard.restingBox(of: glass, under: card.head, in: view)
            let foot = cap.maxY + glass.neck
            say(String(format: "\(label) at %.2f: card w %.1f h %.1f trailing %.2f glass flank %.2f flush %@ top %.2f glass foot %.2f on foot %@ revealed %.2f",
                       fraction, drawn.width, drawn.height, drawn.maxX, cap.maxX, abs(drawn.maxX - cap.maxX) <= 1 ? "true" : "false",
                       drawn.minY, foot, abs(drawn.minY - foot) <= 1 ? "true" : "false", card.card.revealed))
            if fraction == half {
                say(String(format: "\(label) holds half the size at time %.3f: w %.1f (%.1f to %.1f) h %.1f (%.1f to %.1f)", (layer.timeOffset - at) / tween.duration,
                           drawn.width, startSize.width, endSize.width, drawn.height, startSize.height, endSize.height))
                snap("\(label)-50")
                // Held a while longer, so a capture from outside the app (the system's status bar with it) can be taken.
                try? await Task.sleep(for: .seconds(6))
            }
        }
        let held = layer.timeOffset
        layer.speed = 1
        layer.timeOffset = 0
        layer.beginTime = 0
        layer.beginTime = layer.convertTime(CACurrentMediaTime(), from: nil) - held
        // Settled: no switch animation left anywhere in the card (its box, edge, cut, the
        // contents' fades), polled a frame at a time for up to 2s.
        var moving = Self.animationKeys(layer).filter(Self.switchKeys.contains)
        for _ in 0 ..< 120 where !moving.isEmpty {
            try? await Task.sleep(for: .milliseconds(16))
            moving = Self.animationKeys(layer).filter(Self.switchKeys.contains)
        }
        let drawn = card.convert(card.bounds, to: nil)
        let contents = card.card.content.subviews.compactMap { $0 as? GlassContent }.map { "\($0.name) \(String(format: "%.2f", $0.alpha))" }
        say(String(format: "\(label) settled: shows %@ hidden %@ revealed %.2f card x %.1f y %.1f w %.1f h %.1f contents [%@] moving [%@]",
                   card.showing?.name ?? "nothing", card.isHidden ? "true" : "false", card.card.revealed, drawn.minX, drawn.minY, drawn.width, drawn.height,
                   contents.joined(separator: ", "), moving.joined(separator: ", ")))
        snap("\(label)-end")
        // Held as it settled, so a capture from outside the app shows this state and no later one.
        try? await Task.sleep(for: .seconds(5))
    }

    /// What stands on the glass at rest, against the glass's own bounds: every
    /// drawn view that reaches past them (more than half a point), and every
    /// label drawn narrower than its text, which the glass would show cut off.
    /// Then each control on it, its frame and any label's text in it.
    private static func glassReading(_ glass: GlassCapsule) -> String {
        func box(_ r: CGRect) -> String { String(format: "x %.1f y %.1f w %.1f h %.1f", r.minX, r.minY, r.width, r.height) }
        var outside: [String] = []
        var narrow: [String] = []
        func walk(_ view: UIView) {
            for sub in view.subviews where !sub.isHidden && sub.alpha > 0.01 {
                let frame = sub.convert(sub.bounds, to: glass)
                if !glass.bounds.insetBy(dx: -0.5, dy: -0.5).contains(frame) {
                    outside.append("\(type(of: sub)) \(box(frame))")
                }
                if let label = sub as? UILabel, label.intrinsicContentSize.width > label.bounds.width + 0.5 {
                    narrow.append("'\(label.text ?? "")' \(box(frame)) needs w \(String(format: "%.1f", label.intrinsicContentSize.width))")
                }
                walk(sub)
            }
        }
        walk(glass)
        let controls = glass.content.subviews.flatMap(\.subviews).map { control in
            let words = control.subviews.flatMap(\.subviews).compactMap { ($0 as? UILabel)?.text }
            return "\(type(of: control)) \(box(control.convert(control.bounds, to: glass)))\(words.isEmpty ? "" : " '\(words.joined(separator: " "))'")"
        }
        return "glass \(box(glass.bounds)) outside \(outside.isEmpty ? "none" : outside.joined(separator: " | ")) narrow \(narrow.isEmpty ? "none" : narrow.joined(separator: " | ")) controls \(controls.joined(separator: " | "))"
    }

    /// Every rule drawn in a card (a view a point tall or less with a fill),
    /// its colour as resolved in the card's scheme, and the two rule tokens
    /// resolved there: `seam` and `border-hairline`.
    private static func rulesReading(_ card: GlassContent) -> String {
        let traits = card.traitCollection
        func rgb(_ color: UIColor) -> String {
            var (r, g, b, a) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
            color.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            return String(format: "(%.0f,%.0f,%.0f a %.2f)", r * 255, g * 255, b * 255, a)
        }
        var rules: [String] = []
        func walk(_ view: UIView) {
            for sub in view.subviews where !sub.isHidden {
                if sub.bounds.height <= 1.01, sub.bounds.width > 4, let fill = sub.backgroundColor, fill.cgColor.alpha > 0 {
                    let frame = sub.convert(sub.bounds, to: card)
                    rules.append(String(format: "y %.1f w %.1f ", frame.minY, frame.width) + rgb(fill) + " seam \(fill == Palette.seam) hairline \(fill == Palette.borderHairline)")
                }
                walk(sub)
            }
        }
        walk(card)
        return "\(card.name) rules \(rules.isEmpty ? "none" : rules.joined(separator: " | ")); tokens seam \(rgb(Palette.seam)) border-hairline \(rgb(Palette.borderHairline))"
    }

    #if !targetEnvironment(macCatalyst)
    /// A simulator pass's `-hang-probe`: once the fleet is read, the glass's
    /// cards (`probeGlassCards`), each capture saved into the app's
    /// temporary folder under `hang/`, every line in the Probe log.
    private var hangProbeRan = false

    private func runHangProbe() {
        guard ProcessInfo.processInfo.arguments.contains("-hang-probe"), !hangProbeRan, home.ready, let window = view.window else { return }
        hangProbeRan = true
        let dir = FileManager.default.temporaryDirectory.appending(path: "hang")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let style = traitCollection.userInterfaceStyle == .dark ? "dark" : "light"
        let device = traitCollection.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        Task { @MainActor [weak self] in
            guard let self else { return }
            func say(_ line: String) { Logger(subsystem: "dev.cawco.app", category: "Probe").notice("hang \(line, privacy: .public)") }
            func snap(_ name: String) {
                let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                    _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                }
                try? image.pngData()?.write(to: dir.appending(path: "\(device)-\(style)-\(name).png"))
            }
            try? await Task.sleep(for: .seconds(3))
            say("\(device) \(style) window \(window.bounds) compact \(compact)")
            await probeGlassCards(window: window, say: say, snap: snap)
            say("done \(dir.path)")
        }
    }
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
        #if DEBUG
        ProbeCounts.shellLayouts += 1
        #endif
        #if targetEnvironment(macCatalyst)
        placeMacBar()
        #endif
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
    /// `animated` false: a landing, the place put there with no travel.
    private func move(to next: ShellDestination, opening: Bool, animated: Bool = true) {
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
            compactCrumb.set(next.crumb, animated: animated)
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
        mainCrumb.set(under.crumb, animated: false)
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
        openSession(id, animated: true)
    }

    /// `animated` false: a landing, the conversation put in front with no push.
    private func openSession(_ id: String, animated: Bool) {
        railSheet?.dismiss(animated: true)
        workspace.open(id)
        // From another place the board and the conversations arrive as one
        // stack; `showWorkspace` then finds them in front on a compact width
        // and does the wide screen's part.
        if destination != .fleet { move(to: .fleet, opening: true, animated: animated) }
        showWorkspace(animated: animated)
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
            if case let .ask(ask) = item.kind { return ask.instanceId }
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

    #if DEBUG
    func probeReopenRail() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.showRailSheet() }
    }
    #endif

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
        limits.onSignIn = { [weak self] in self?.go(.configure) }
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
    /// A simulator pass's `-shell-probe`: each touch the edge swipe is
    /// offered, whether it may begin, and its states (ShellController).
    static let probing = ProcessInfo.processInfo.arguments.contains("-shell-probe")

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

#if DEBUG && targetEnvironment(macCatalyst)
/// The Mac pass's view of the window from AppKit's side (ShellController
/// `runMacProbe`), reached through the Catalyst process's own NSApplication:
/// the NSWindows and whether they move themselves, the traffic lights'
/// frame, the view a click is sent to, and whether a press makes AppKit move
/// the window by itself; the owner's pointer is never moved. Points are the
/// UIKit window's (an app optimised for Mac draws 1:1).
@MainActor
private final class MacProbeAppKit {
    private weak var window: UIWindow?

    init(window: UIWindow) {
        self.window = window
    }

    private static func object(_ name: String, _ key: String) -> NSObject? {
        (NSClassFromString(name) as? NSObject.Type)?.value(forKey: key) as? NSObject
    }

    /// This UIWindow's NSWindow: the visible one whose content is its size.
    private var nsWindow: NSObject? {
        guard let window, let windows = Self.object("NSApplication", "sharedApplication")?.value(forKey: "windows") as? [NSObject] else { return nil }
        return windows.first { candidate in
            guard (candidate.value(forKey: "isVisible") as? Bool) == true,
                  let size = ((candidate.value(forKey: "contentView") as? NSObject)?.value(forKey: "frame") as? NSValue)?.cgRectValue.size else { return false }
            return abs(size.width - window.bounds.width) < 1 && abs(size.height - window.bounds.height) < 1
        }
    }

    /// Every NSWindow, its class and whether it moves itself.
    var windows: String {
        let all = Self.object("NSApplication", "sharedApplication")?.value(forKey: "windows") as? [NSObject] ?? []
        return all.map { "\(type(of: $0)) movable \($0.value(forKey: "isMovable") as? Bool ?? true)" }.joined(separator: ", ")
    }

    /// The window's frame view, which every click is hit-tested from.
    private var frameView: NSObject? {
        (nsWindow?.value(forKey: "contentView") as? NSObject)?.value(forKey: "superview") as? NSObject
    }

    private var height: Double? { ((frameView?.value(forKey: "frame") as? NSValue)?.cgRectValue.height).map(Double.init) }

    /// Close, minimise and zoom, as one box in the window's points.
    var lights: CGRect? {
        guard let nsWindow else { return nil }
        let pick = NSSelectorFromString("standardWindowButton:")
        typealias Button = @convention(c) (NSObject, Selector, Int) -> Unmanaged<NSObject>?
        let button = unsafeBitCast(nsWindow.method(for: pick), to: Button.self)
        let boxes = (0 ... 2).compactMap { button(nsWindow, pick, $0)?.takeUnretainedValue() }.compactMap(inWindow)
        guard let first = boxes.first else { return nil }
        return boxes.dropFirst().reduce(first) { $0.union($1) }
    }

    private func inWindow(_ view: NSObject) -> CGRect? {
        guard let bounds = (view.value(forKey: "bounds") as? NSValue)?.cgRectValue, let height else { return nil }
        let convert = NSSelectorFromString("convertRect:toView:")
        typealias Convert = @convention(c) (NSObject, Selector, CGRect, NSObject?) -> CGRect
        let base = unsafeBitCast(view.method(for: convert), to: Convert.self)(view, convert, bounds, nil)
        return CGRect(x: base.minX, y: height - base.maxY, width: base.width, height: base.height)
    }

    /// The NSView AppKit sends a click at `point` to, and whether a press there may move the window.
    func hitView(at point: CGPoint) -> String {
        guard let frameView, let height else { return "no window" }
        let test = NSSelectorFromString("hitTest:")
        typealias Hit = @convention(c) (NSObject, Selector, CGPoint) -> Unmanaged<NSObject>?
        guard let hit = unsafeBitCast(frameView.method(for: test), to: Hit.self)(frameView, test, CGPoint(x: point.x, y: height - point.y))?.takeUnretainedValue() else {
            return "nil"
        }
        return "\(type(of: hit)) mouseDownCanMoveWindow \(hit.value(forKey: "mouseDownCanMoveWindow") as? Bool ?? false)"
    }

    /// Times NSWindow was asked to move with the mouse while `press` ran.
    private nonisolated(unsafe) static var drags = 0

    /// A left press at `point` and its release, queued on NSApplication
    /// (`postEvent:atStart:`); true when AppKit asked the window to move on
    /// its own. Such events reach the NSWindow and never UIKit (a press so
    /// queued on a tab did not choose it), so this reads AppKit's part alone.
    func press(at point: CGPoint) async -> Bool {
        guard let nsWindow, let height, let app = Self.object("NSApplication", "sharedApplication"),
              let eventClass = NSClassFromString("NSEvent"), let windowClass = NSClassFromString("NSWindow"),
              let number = nsWindow.value(forKey: "windowNumber") as? Int else { return false }
        let make = NSSelectorFromString("mouseEventWithType:location:modifierFlags:timestamp:windowNumber:context:eventNumber:clickCount:pressure:")
        guard let maker = class_getClassMethod(eventClass, make),
              let drag = class_getInstanceMethod(windowClass, NSSelectorFromString("performWindowDragWithEvent:")) else { return false }
        typealias Make = @convention(c) (AnyClass, Selector, UInt, CGPoint, UInt, Double, Int, NSObject?, Int, Int, Float) -> Unmanaged<NSObject>?
        let event = unsafeBitCast(method_getImplementation(maker), to: Make.self)
        let original = method_getImplementation(drag)
        let record: @convention(block) (NSObject, NSObject) -> Void = { _, _ in MacProbeAppKit.drags += 1 }
        method_setImplementation(drag, imp_implementationWithBlock(record))
        defer { method_setImplementation(drag, original) }
        Self.drags = 0
        let post = NSSelectorFromString("postEvent:atStart:")
        typealias Post = @convention(c) (NSObject, Selector, NSObject, Bool) -> Void
        let enqueue = unsafeBitCast(app.method(for: post), to: Post.self)
        // NSEventTypeLeftMouseDown 1, LeftMouseUp 2; window base points.
        let base = CGPoint(x: point.x, y: height - point.y)
        for type: UInt in [1, 2] {
            if let made = event(eventClass, make, type, base, 0, ProcessInfo.processInfo.systemUptime, number, nil, 0, 1, type == 1 ? 1 : 0)?.takeUnretainedValue() {
                enqueue(app, post, made, false)
            }
        }
        try? await Task.sleep(for: .milliseconds(250))
        return Self.drags > 0
    }
}
#endif

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
