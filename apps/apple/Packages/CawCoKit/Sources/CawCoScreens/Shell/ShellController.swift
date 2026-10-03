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
final class ShellController: UISplitViewController, UISplitViewControllerDelegate, SidebarHost {
    private let hub: HubConnection
    private let home: HomeModel

    private(set) var destination: ShellDestination = .fleet
    private(set) var selected: SessionViewController?
    private(set) var currentId: String?
    private(set) var assistantOpen = false

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
    private weak var railSheet: SidebarViewController?
    /// Places opened once, kept so coming back finds them as they were left.
    private var pages: [ShellDestination: UIViewController] = [:]
    private var watcher: ShellWatcher!

    private static let railKey = "cawco-rail-width"
    static let railMin = 216.0
    static let railMax = 520.0
    static let railDefault = 228.0

    var context: ShellContext {
        ShellContext(hub: hub, home: home, openSession: { [weak self] id in self?.openSession(id) }, go: { [weak self] place in self?.go(place) })
    }

    var activeSessionId: String? { currentId }

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        self.home = home
        rail = SidebarViewController(hub: hub, home: home, inSheet: false)
        railHome = HomeViewController(hub: hub, home: home)
        board = HomeViewController(hub: hub, home: home)
        detail = FleetDetailController(hub: hub, home: home)
        super.init(style: .doubleColumn)
        rail.host = self
        rail.homeController = railHome
        for home in [railHome, board] {
            home.onOpen = { [weak self] id in self?.openSession(id) }
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
        burger.addAction(UIAction { [weak self] _ in self?.showRailSheet() }, for: .primaryActionTriggered)
        for cluster in [mainCluster, compactCluster] {
            cluster.onAttention = { [weak self] in self?.go(.fleet) }
            cluster.onAssistant = { [weak self] in self?.toggleAssistant() }
            cluster.onJump = { [weak self] in self?.openJump() }
            cluster.onMachines = { [weak self] source in self?.openMachines(from: source) }
            cluster.onHub = { [weak self] in self?.changeHub() }
        }
        TopBar.install(on: detail.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: nil)
        TopBar.install(on: board.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger)

        preferredDisplayMode = .oneBesideSecondary
        preferredSplitBehavior = .tile
        presentsWithGesture = false
        let width = UserDefaults.standard.double(forKey: Self.railKey)
        minimumPrimaryColumnWidth = Self.railMin
        maximumPrimaryColumnWidth = Self.railMax
        preferredPrimaryColumnWidth = Self.clamp(width > 0 ? width : Self.railDefault)
        delegate = self
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            // The rail is resized by its own grip, as the web's is.
            displayModeButtonVisibility = .never
        }
        watcher = ShellWatcher(hub: hub, home: home) { [weak self] in self?.refreshBars() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ShellController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        installGrip()
    }

    static func clamp(_ width: Double) -> Double { min(railMax, max(railMin, width.rounded())) }

    private var compact: Bool { traitCollection.horizontalSizeClass == .compact }

    // MARK: Places

    func go(_ next: ShellDestination) {
        railSheet?.dismiss(animated: true)
        guard next != destination else {
            if next == .fleet, compact { compactNav.popToRootViewController(animated: true) }
            return
        }
        let travel = Travel.route(from: destination, to: next)
        destination = next
        mainCrumb.set(next.crumb, animated: true)
        compactCrumb.set(next.crumb, animated: true)
        let regularPage = next == .fleet ? detail : page(for: next)
        let compactPage = next == .fleet ? board : page(for: next, compact: true)
        // The bar's crumb and cluster move with the place, so they stay one bar.
        TopBar.install(on: regularPage.navigationItem, crumb: mainCrumb, cluster: mainCluster, burger: nil)
        TopBar.install(on: compactPage.navigationItem, crumb: compactCrumb, cluster: compactCluster, burger: burger)
        mainMotion.route = travel
        mainNav.setViewControllers([regularPage], animated: !compact)
        compactMotion.route = travel
        compactNav.setViewControllers([compactPage], animated: compact)
        rail.requestRefresh()
        railSheet?.requestRefresh()
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
        case .configure: .project("compact:configure")
        case .usage: .project("compact:usage")
        case .fleet: .fleet
        }
    }

    // MARK: Sessions

    func openSession(_ id: String) {
        railSheet?.dismiss(animated: true)
        let values = selected?.sessionId == id ? selected?.restorationValues : nil
        currentId = id
        if destination != .fleet { go(.fleet) }
        place(sessionId: id, restoring: values)
        rail.requestRefresh()
    }

    /// Puts the conversation in front in whichever stack the width shows.
    private func place(sessionId id: String, restoring values: [AnyHashable: Any]?) {
        selected?.close()
        selected = nil
        if let runId = BoardRun.runId(of: id) {
            let run = WorkflowRunViewController(hub: hub, runId: runId)
            run.onReturn = { [weak self] in self?.returnToFleet() }
            run.onOpen = { [weak self] id in self?.openSession(id) }
            put(run)
            return
        }
        let session = SessionViewController(hub: hub, id: id)
        selected = session
        session.onClose = { [weak self, weak session] in
            if self?.selected === session { self?.selected = nil }
        }
        session.onReturnToFleet = { [weak self] in self?.returnToFleet() }
        if let values { session.restoreValues(values) }
        put(session)
    }

    private func put(_ controller: UIViewController) {
        if compact {
            compactNav.setViewControllers([compactNav.viewControllers.first ?? board, controller], animated: true)
        } else {
            detail.show(controller)
        }
    }

    func returnToFleet() {
        currentId = nil
        selected?.close()
        selected = nil
        if compact {
            compactNav.popToRootViewController(animated: true)
        } else {
            detail.show(nil)
        }
        rail.requestRefresh()
    }

    // MARK: Width changes

    /// The conversation in front moves to the stack the new width shows, its
    /// draft and place in the transcript carried over.
    func splitViewControllerDidCollapse(_: UISplitViewController) {
        moveSession()
    }

    func splitViewControllerDidExpand(_: UISplitViewController) {
        railSheet?.dismiss(animated: false)
        moveSession()
    }

    private func moveSession() {
        let values = selected?.restorationValues
        if compact {
            detail.show(nil)
            compactNav.setViewControllers([compactNav.viewControllers.first ?? board], animated: false)
        } else {
            compactNav.setViewControllers([compactNav.viewControllers.first ?? board], animated: false)
        }
        if let id = currentId {
            UIView.performWithoutAnimation { place(sessionId: id, restoring: values) }
        }
    }

    // MARK: Rail

    private func showRailSheet() {
        let sheet = SidebarViewController(hub: hub, home: home, inSheet: true)
        sheet.host = self
        sheet.modalPresentationStyle = .custom
        sheet.transitioningDelegate = sheetTransition
        railSheet = sheet
        present(sheet, animated: true)
    }

    func toggleAssistant() {
        assistantOpen.toggle()
        railSheet?.dismiss(animated: true)
        refreshBars()
        rail.requestRefresh()
    }

    func startSession(machineId _: String?, cwd _: String?, projectId _: String?) {
        railSheet?.dismiss(animated: true)
    }

    func newProject(from _: UIView) {}

    func forgetProject(_: ProjectRow) {}

    func showLimits() {
        let sheet = UINavigationController(rootViewController: UsageSheetController(home: home))
        sheet.sheetPresentationController?.detents = [.medium(), .large()]
        (railSheet ?? self).present(sheet, animated: true)
    }

    /// Native only: point this window at another hub (ConnectViewController's change mode).
    private func changeHub() {
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
        present(sheet, animated: true)
    }

    private func openJump() {}

    private func openMachines(from _: UIView) {}

    /// The bar's facts, from the hub's word.
    private func refreshBars() {
        let fleet = hub.fleet
        let blocked = fleet.rows.filter { $0.isLive && home.activity($0.id) == .blocked }.count
        let online = fleet.machines.filter { $0.status == "online" }.count
        let down = fleet.machines.contains { $0.status != "online" }
        for cluster in [mainCluster, compactCluster] {
            cluster.configure(blocked: blocked, online: online, anyDown: down, assistantOpen: assistantOpen)
        }
    }

    // MARK: Grip

    /// The rail's resize handle (Shell.svelte `.grip`): 6pt on the rail's
    /// trailing edge, the control border under a pointer; a drag sets the
    /// width 1:1, coalesced to a frame, and it is kept when the finger lifts.
    private func installGrip() {
        let grip = RailGrip()
        grip.onDrag = { [weak self] x in
            guard let self else { return }
            preferredPrimaryColumnWidth = Self.clamp(x)
        }
        grip.onEnd = { [weak self] in
            guard let self else { return }
            UserDefaults.standard.set(preferredPrimaryColumnWidth, forKey: Self.railKey)
        }
        grip.width = { [weak self] in self.map { Double($0.primaryColumnWidth) } ?? Self.railDefault }
        rail.view.addSubview(grip)
        NSLayoutConstraint.activate([
            grip.topAnchor.constraint(equalTo: rail.view.topAnchor),
            grip.bottomAnchor.constraint(equalTo: rail.view.bottomAnchor),
            grip.trailingAnchor.constraint(equalTo: rail.view.trailingAnchor, constant: 3),
            grip.widthAnchor.constraint(equalToConstant: 6),
        ])
        // The rail's hairline against the page.
        let edge = UIView()
        edge.backgroundColor = Palette.borderHairline
        edge.isUserInteractionEnabled = false
        edge.translatesAutoresizingMaskIntoConstraints = false
        rail.view.insertSubview(edge, belowSubview: grip)
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
    private var start = 0.0

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
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

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began: start = width()
        case .changed: onDrag(start + pan.translation(in: superview).x)
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
    private let caw = CawView(status: .ready)
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
        view.addSubview(empty)
        NSLayoutConstraint.activate([
            empty.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func refreshContent() {
        let state: CawStatus = hub.state == .unreachable ? .reconnecting : (home.ready ? .ready : .loading)
        caw.status = state
        line.text = switch state {
        case .reconnecting: "Reaching the hub again…"
        case .loading: "Reading the fleet…"
        default: "Open a session from the list, or start one."
        }
        empty.isHidden = shown != nil
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
        empty.isHidden = next != nil
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
