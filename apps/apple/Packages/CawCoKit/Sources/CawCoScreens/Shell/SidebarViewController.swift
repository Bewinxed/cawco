import CawCoAPI
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// What the rail asks of the shell it sits in.
@MainActor
protocol SidebarHost: AnyObject {
    var destination: ShellDestination { get }
    /// The conversation in front, for the rows to mark.
    var activeSessionId: String? { get }
    var assistantOpen: Bool { get }
    func go(_ destination: ShellDestination)
    func openSession(_ id: String)
    func toggleAssistant()
    func startSession(machineId: String?, cwd: String?, projectId: String?)
    func newProject(from source: UIView)
    func forgetProject(_ project: ProjectRow)
    func showLimits()
    /// The phone sheet's Search: Jump, once the sheet has stepped aside.
    func search()
    /// The free week's line (paywall DESIGN.md T): the paywall in its Get Pro form.
    func keepPro()
}

/// The management rail (Sidebar.svelte): the wordmark with the assistant
/// and Start session in its corner, the app's places, on a wide screen the
/// home itself, the projects with their sessions, and in the footer the
/// usage strip, the account row, Configure and the theme. The split view's
/// primary column on a wide screen; on a phone the sheet the bar's burger
/// opens, where it is navigation only.
final class SidebarViewController: ObservedViewController {
    private let hub: HubConnection
    private let home: HomeModel
    private let prefs = RailPrefs.shared
    /// Where it stands: the split's column carries the home, the phone's sheet does not.
    private let inSheet: Bool
    weak var host: SidebarHost?
    /// The home's rail variant, embedded under the places on a wide screen.
    var homeController: UIViewController? { didSet { mountHome(oldValue) } }

    private let scroll = UIScrollView()
    private let column = UIStackView()
    private let headerRow = UIStackView()
    private let assistantButton = HeadAction(.assistant, label: "Assistant", tint: Palette.coral11)
    /// The rail's Assistant control: where the desk's pane grows from.
    var assistantSource: UIView { assistantButton }
    private let startButton = HeadAction(.plus, label: "Start session", tint: Palette.inkMuted)
    private let fleetRow = RailRow(height: nil, leading: 10, trailing: 10, gap: 10)
    private let workflowsRow = RailRow(height: nil, leading: 10, trailing: 10, gap: 10)
    private let fleetBadge = UILabel()
    private let fleetBadgeBox = UIView()
    private let homeSlot = UIView()
    private let projectsGroup = UIStackView()
    private let projectsBody = UIStackView()
    private let sortButton = GhostIconButton(.sort, label: "Sort sessions")
    private let newProjectButton = GhostIconButton(.plus, label: "New project")
    private let configureButton = GhostIconButton(.settings, label: "Configure")
    private let themeButton = ThemeButton()
    private let soundButton = SoundButton()
    private let usage = UsageCell(frame: .zero)
    /// The account row, and under the name the one place CawCo Pro shows (DESIGN.md T):
    /// the free week's days left, or the Pro tag.
    private let user = RailRow(height: nil, leading: 10, trailing: 10, gap: 10)
    private let trialLine = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let proTag = ProTag()
    private var navHeights: [NSLayoutConstraint] = []

    /// Every project block and session row the rail has drawn, by id, kept across updates.
    private var blocks: [String: ProjectBlock] = [:]
    private var sessionRows: [String: SessionRailRow] = [:]
    /// The rail's session card (SessionHover): its `tail` takes the transcript's tail view.
    private(set) var sessionHover: SessionHover?
    private var drawnShape = ""
    /// The web's derived project trees. Pulses belong to the rows pass,
    /// not the membership/split/order derivation.
    private var lists: [RailProjectList] = []
    private var projectsReady = false
    private var rowInputs: [RailModel.RowInput] = []
    private var drawnInputs: [RailModel.RowInput] = []
    private var listProjects: [ProjectRow] = []
    private var listPins: [String] = []
    private var listSort: RailPrefs.Sort?
    private var listDelegates: Bool?
    private var shownNodes: [(node: RailBranch, row: SessionRailRow)] = []
    private var blockedCount = 0
    private var liveCount = 0
    private var usageAt: Double?
    private var usageRead: Bool?
    private var claudeReadings: [String: Components.Schemas.ClaudeLimits] = [:]
    private var goReadings: [String: Components.Schemas.OpenCodeGoLimits] = [:]
    private var olderOpen = Set<String>()
    private var openTrees = Set<String>()
    private let fold = RailFold()
    #if DEBUG
    private var probeClock: CADisplayLink?
    private var probeStart = CACurrentMediaTime()
    private var probePass = 0
    private var probePhase = "open"
    private var probeData = Data()
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if inSheet && ProcessInfo.processInfo.arguments.contains("-sidebar-probe") {
            probeStart = CACurrentMediaTime()
            probePass += 1
            probePhase = probePass == 1 ? "first-open" : "reopen"
            probeClock = CADisplayLink(target: self, selector: #selector(probeFrame))
            probeClock?.add(to: .main, forMode: .common)
        }
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard inSheet, probePass == 1, ProcessInfo.processInfo.arguments.contains("-sidebar-probe") else { return }
        let project = lists.first { $0.project.name == "patapon" }!
        let block = blocks[project.project.id]!
        func after(_ seconds: Double, phase: String, _ action: @escaping () -> Void) {
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in self?.probePhase = phase; action() }
        }
        after(1, phase: "project-close") { [self] in
            let y = block.convert(block.bounds, to: column).minY
            scroll.setContentOffset(CGPoint(x: 0, y: min(y, max(0, scroll.contentSize.height - scroll.bounds.height))), animated: false)
            projectTapped(block.row)
        }
        after(1.4, phase: "project-open") { [self] in projectTapped(block.row) }
        after(2.5, phase: "project-close-again") { [self] in projectTapped(block.row) }
        after(3, phase: "project-open-again") { [self] in projectTapped(block.row) }
        let node = project.recent.first { $0.count > 0 }!
        after(4, phase: "delegate-open") { [self] in toggleTree(node.row.id, row: sessionRows[rowKey(project.project.id, node.row.id)]!) }
        after(5.5, phase: "delegate-close") { [self] in toggleTree(node.row.id, row: sessionRows[rowKey(project.project.id, node.row.id)]!) }
        after(6, phase: "delegate-open-again") { [self] in toggleTree(node.row.id, row: sessionRows[rowKey(project.project.id, node.row.id)]!) }
        after(6.06, phase: "delegate-reverse-close") { [self] in toggleTree(node.row.id, row: sessionRows[rowKey(project.project.id, node.row.id)]!) }
        after(6.1, phase: "delegate-reverse-open") { [self] in toggleTree(node.row.id, row: sessionRows[rowKey(project.project.id, node.row.id)]!) }
        after(7, phase: "dismiss") { [self] in
            probeClock?.invalidate(); probeClock = nil
            writeProbe()
            dismiss(animated: true) { [self] in (host as! ShellController).probeReopenRail() }
        }
    }
    private func writeProbe() {
        let file = URL.documentsDirectory.appendingPathComponent("sidebar-frames-\(probePass).jsonl")
        try! probeData.write(to: file)
        probeData = Data()
    }
    @objc private func probeFrame() {
        let rows = sessionRows.values.filter { row in
            let frame = row.convert(row.bounds, to: view)
            return frame.intersects(scroll.frame) && row.window != nil
        }.map { row -> [String: Any] in
            let frame = row.convert(row.bounds, to: view)
            let mark = row.mark.superview!.convert(CGRect(x: row.mark.center.x - row.mark.bounds.width / 2,
                                                         y: row.mark.center.y - row.mark.bounds.height / 2,
                                                         width: row.mark.bounds.width, height: row.mark.bounds.height), to: view)
            return ["id": row.id, "view": String(describing: ObjectIdentifier(row)), "title": row.name.text ?? "", "titleWidth": row.name.bounds.width,
                    "x": frame.minX, "y": frame.minY, "w": frame.width, "h": frame.height, "shift": row.transform.ty,
                    "mark": [mark.minX, mark.minY, mark.width, mark.height], "ride": [row.mark.transform.tx, row.mark.transform.ty]]
        }
        var lines: [[String: Any]] = []
        func rails(_ part: UIView) {
            if let rail = part as? NestRailView {
                let frame = rail.convert(rail.bounds, to: view)
                lines.append(["x": frame.minX + rail.railX, "y": frame.minY, "head": rail.head.isFinite ? rail.head : -1,
                              "children": rail.children.map { [frame.minY + $0.glyphY, frame.minX + $0.armEnd] }])
            }
            part.subviews.forEach(rails)
        }
        rails(projectsBody)
        let brand = headerRow.arrangedSubviews.first as! RailRow
        let icon = brand.content.arrangedSubviews[0].convert(brand.content.arrangedSubviews[0].bounds, to: view)
        let word = brand.content.arrangedSubviews[1].convert(brand.content.arrangedSubviews[1].bounds, to: view)
        let data = try! JSONSerialization.data(withJSONObject: ["ms": (CACurrentMediaTime() - probeStart) * 1000, "phase": probePhase, "rows": rows,
                                                              "lines": lines, "viewport": [view.bounds.width, view.bounds.height], "safeTop": view.safeAreaInsets.top,
                                                              "header": ["icon": [icon.minX, icon.minY, icon.width, icon.height], "word": [word.minX, word.minY, word.width, word.height]]])
        probeData.append(data); probeData.append(10)
        if CACurrentMediaTime() - probeStart > 8 { probeClock?.invalidate(); probeClock = nil; writeProbe() }
    }
    #endif

    init(hub: HubConnection, home: HomeModel, inSheet: Bool) {
        self.hub = hub
        self.home = home
        self.inSheet = inSheet
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SidebarViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.sidebar
        let header = buildHeader()
        let footer = buildFooter()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.showsVerticalScrollIndicator = false
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        for part in [header, scroll, footer] { view.addSubview(part) }
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: header.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footer.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 4),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -4),
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
            // The content is as wide as the rail: it scrolls one way only.
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        // A phone's bar holds only the toggle, the tabs and Caw: Search leads
        // its sheet, and the machines have a section of their own in it.
        if inSheet { column.addArrangedSubview(group(buildSearch())) }
        column.addArrangedSubview(group(buildPlaces()))
        homeSlot.translatesAutoresizingMaskIntoConstraints = false
        column.addArrangedSubview(homeSlot)
        column.addArrangedSubview(buildProjects())
        if inSheet, let machines = host as? MachinesHost { column.addArrangedSubview(buildMachines(machines)) }
        mountHome(nil)
        // The session card, beside the rail a pointer rests in; the sheet is a finger's.
        if !inSheet {
            sessionHover = SessionHover(hub: hub, home: home, rail: view) { [weak self] in self?.splitViewController?.view }
        }
        registerForTraitChanges([UITraitHorizontalSizeClass.self, UITraitUserInterfaceIdiom.self]) { (rail: SidebarViewController, _: UITraitCollection) in
            rail.sizeNavRows()
        }
        sizeNavRows()
        fold.onSettled = { [weak self] in self?.requestRefresh() }
    }

    /// `--c-nav-h`: 40 under a fine pointer, 44 under a finger.
    private var navHeight: Double { traitCollection.userInterfaceIdiom == .mac ? Size.cNavH : Size.cNavHCompact }

    private func sizeNavRows() {
        for constraint in navHeights { constraint.constant = navHeight }
    }

    private func navConstraint(_ view: UIView) {
        let height = view.heightAnchor.constraint(equalToConstant: navHeight)
        height.priority = .required - 1
        height.isActive = true
        navHeights.append(height)
    }

    /// A row of nav-height controls is that tall itself: its controls only
    /// centre in it, so without this the header and the footer could take
    /// any height above their controls' and the scroller between them any
    /// below its own, down to nothing. One short of required, as the
    /// controls' own are: a rail measured at no height keeps its constraints.
    private func navRow(_ row: UIStackView) {
        let height = row.heightAnchor.constraint(equalToConstant: navHeight)
        height.priority = .required - 1
        height.isActive = true
        navHeights.append(height)
    }

    /// A `Sidebar.Group` (`px-2 py-1`).
    private func group(_ content: UIView) -> UIView {
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        content.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: box.topAnchor, constant: 4),
            content.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -4),
            content.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 8),
            content.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -8),
        ])
        return box
    }

    // MARK: Header

    private func buildHeader() -> UIView {
        let brand = RailRow(height: nil, leading: 10, trailing: 10, gap: 10)
        navConstraint(brand)
        let word = KitLabel(CawCoBrand.wordmarkRole, ink: Palette.foreground)
        word.text = "Caw&Co"
        word.setContentHuggingPriority(.required, for: .horizontal)
        word.heightAnchor.constraint(equalToConstant: TypeScale.typeBody.lineHeight).isActive = true
        brand.content.addArrangedSubview(RailRow.slot(BrandMark()))
        brand.content.addArrangedSubview(word)
        brand.content.addArrangedSubview(UIView())
        brand.accessibilityLabel = "Caw&Co"
        brand.addAction(UIAction { [weak self] _ in self?.host?.go(.fleet) }, for: .primaryActionTriggered)
        assistantButton.addAction(UIAction { [weak self] _ in self?.host?.toggleAssistant() }, for: .primaryActionTriggered)
        startButton.addAction(UIAction { [weak self] _ in self?.host?.startSession(machineId: nil, cwd: nil, projectId: nil) }, for: .primaryActionTriggered)
        for action in [assistantButton, startButton] { navConstraint(action); action.widthAnchor.constraint(equalTo: action.heightAnchor).isActive = true }
        KitTip.attach(to: assistantButton, label: "Assistant", keys: "⌘J")
        KitTip.attach(to: startButton, label: "Start session", keys: "⇧⌘N")
        headerRow.addArrangedSubview(brand)
        headerRow.addArrangedSubview(assistantButton)
        headerRow.addArrangedSubview(startButton)
        headerRow.axis = .horizontal
        headerRow.spacing = 4
        headerRow.alignment = .center
        navRow(headerRow)
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        headerRow.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(headerRow)
        // In the sheet the close button sits in the brand row's corner, 16pt in and 30 wide.
        let trailing = inSheet ? 46.0 : 0
        NSLayoutConstraint.activate([
            headerRow.topAnchor.constraint(equalTo: box.topAnchor, constant: 8),
            headerRow.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -8),
            headerRow.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 8),
            headerRow.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -8 - trailing),
        ])
        if inSheet {
            let close = GhostIconButton(.close, label: "Close")
            close.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .primaryActionTriggered)
            box.addSubview(close)
            NSLayoutConstraint.activate([
                close.topAnchor.constraint(equalTo: box.topAnchor, constant: 16),
                close.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -16),
            ])
        }
        return box
    }

    // MARK: Places

    private func buildPlaces() -> UIView {
        let menu = UIStackView(arrangedSubviews: [fleetRow, workflowsRow])
        menu.axis = .vertical
        menu.spacing = 2
        for (row, glyph, title, place) in [(fleetRow, Glyph.box, "Fleet", ShellDestination.fleet), (workflowsRow, .workflow, "Workflows", .workflows)] {
            navConstraint(row)
            let icon = GlyphView(glyph, tint: Palette.foreground)
            let label = KitLabel(TypeScale.typeBody, ink: Palette.sidebarForeground)
            label.text = title
            row.content.addArrangedSubview(RailRow.slot(icon))
            row.content.addArrangedSubview(label)
            row.content.addArrangedSubview(UIView())
            row.inks = [label]
            row.glyphs = [icon]
            row.accessibilityLabel = title
            row.addAction(UIAction { [weak self] _ in self?.host?.go(place) }, for: .primaryActionTriggered)
        }
        // The count beside Fleet: what needs the operator, else what is working.
        fleetBadgeBox.translatesAutoresizingMaskIntoConstraints = false
        fleetBadgeBox.layer.cornerRadius = Radius.radiusXs
        fleetBadgeBox.isUserInteractionEnabled = false
        fleetBadge.translatesAutoresizingMaskIntoConstraints = false
        fleetBadge.font = TypeScale.typeMeta.font
        fleetBadgeBox.addSubview(fleetBadge)
        fleetRow.addSubview(fleetBadgeBox)
        NSLayoutConstraint.activate([
            fleetBadgeBox.trailingAnchor.constraint(equalTo: fleetRow.trailingAnchor, constant: -4),
            // On the row's centre line, whatever height the row stands at (a finger's is taller).
            fleetBadgeBox.centerYAnchor.constraint(equalTo: fleetRow.centerYAnchor),
            fleetBadgeBox.heightAnchor.constraint(equalToConstant: 20),
            fleetBadgeBox.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            fleetBadge.leadingAnchor.constraint(equalTo: fleetBadgeBox.leadingAnchor, constant: 4),
            fleetBadge.trailingAnchor.constraint(equalTo: fleetBadgeBox.trailingAnchor, constant: -4),
            fleetBadge.centerYAnchor.constraint(equalTo: fleetBadgeBox.centerYAnchor),
        ])
        return menu
    }

    // MARK: Home

    /// Watches the home list's content height, which the home's slot follows.
    private var homeHeight: NSKeyValueObservation?
    private var homeFits: NSLayoutConstraint?

    private func fitHome(_ height: Double) {
        guard let homeFits, height > 0, abs(homeFits.constant - height) > 0.5 else { return }
        homeFits.constant = height
    }

    private func mountHome(_ old: UIViewController?) {
        guard isViewLoaded else { return }
        if let old {
            old.willMove(toParent: nil)
            old.view.removeFromSuperview()
            old.removeFromParent()
        }
        homeSlot.isHidden = homeController == nil
        guard let homeController else { return }
        addChild(homeController)
        let content = homeController.view!
        content.translatesAutoresizingMaskIntoConstraints = false
        homeSlot.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: homeSlot.topAnchor),
            content.leadingAnchor.constraint(equalTo: homeSlot.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: homeSlot.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: homeSlot.bottomAnchor, constant: -5),
        ])
        // The home is as tall as what it holds, as the web's is in the rail:
        // on a hub with nothing running, Caw and his line, and the projects
        // straight under them. It scrolls on its own, so past six tenths of
        // the rail it stops growing and the projects stay in reach.
        // It starts at the cap: a list with no height lays nothing out and reports none.
        let fits = content.heightAnchor.constraint(equalToConstant: 10000)
        fits.priority = .defaultHigh
        NSLayoutConstraint.activate([
            fits,
            content.heightAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor, multiplier: 0.6),
        ])
        homeFits = fits
        homeHeight?.invalidate()
        if let list = content.subviews.compactMap({ $0 as? UIScrollView }).first {
            homeHeight = list.observe(\.contentSize, options: [.initial, .new]) { [weak self] _, change in
                guard let size = change.newValue else { return }
                MainActor.assumeIsolated { self?.fitHome(size.height) }
            }
        }
        // The seam under the home: a pixel above the gap that follows it.
        let seam = UIView()
        seam.backgroundColor = Palette.seam
        seam.translatesAutoresizingMaskIntoConstraints = false
        homeSlot.addSubview(seam)
        NSLayoutConstraint.activate([
            seam.heightAnchor.constraint(equalToConstant: 1),
            seam.leadingAnchor.constraint(equalTo: homeSlot.leadingAnchor),
            seam.trailingAnchor.constraint(equalTo: homeSlot.trailingAnchor),
            seam.bottomAnchor.constraint(equalTo: homeSlot.bottomAnchor),
        ])
        homeController.didMove(toParent: self)
    }

    // MARK: The phone's Search and Machines

    /// Jump's field at the sheet's head: a press opens the palette.
    private func buildSearch() -> UIView {
        let field = TapControl()
        field.translatesAutoresizingMaskIntoConstraints = false
        field.backgroundColor = Palette.surfaceRaised
        field.layer.cornerRadius = Radius.radiusSm
        field.layer.cornerCurve = .continuous
        field.layer.borderWidth = 1
        field.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        let words = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
        words.text = "Search sessions, projects, machines"
        let row = UIStackView(arrangedSubviews: [GlyphView(.search, tint: Palette.inkMuted), words])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        field.addSubview(row)
        NSLayoutConstraint.activate([
            field.heightAnchor.constraint(equalToConstant: 44),
            row.leadingAnchor.constraint(equalTo: field.leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(lessThanOrEqualTo: field.trailingAnchor, constant: -Space.space3),
            row.centerYAnchor.constraint(equalTo: field.centerYAnchor),
        ])
        field.isAccessibilityElement = true
        field.accessibilityLabel = "Search"
        field.accessibilityHint = "Jump to a session, project or machine"
        field.accessibilityTraits = [.button, .searchField]
        field.addAction(UIAction { [weak self] _ in self?.host?.search() }, for: .primaryActionTriggered)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (rail: SidebarViewController, _: UITraitCollection) in
            field.layer.borderColor = Palette.borderControl.resolvedColor(with: rail.traitCollection).cgColor
        }
        return field
    }

    /// The machines, where a phone keeps them: each with its status and its
    /// menu (a long press), then Add machine and Change hub.
    private func buildMachines(_ machinesHost: MachinesHost) -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground.withAlphaComponent(0.7))
        label.text = "Machines"
        let head = UIStackView(arrangedSubviews: [label, UIView()])
        head.alignment = .center
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 0)
        head.heightAnchor.constraint(equalToConstant: 44).isActive = true
        let list = MachinesListView(host: machinesHost)
        let section = UIStackView(arrangedSubviews: [head, list])
        section.axis = .vertical
        section.accessibilityLabel = "Machines"
        return group(section)
    }

    // MARK: Projects

    private func buildProjects() -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground.withAlphaComponent(0.7))
        label.text = "Projects"
        sortButton.showsMenuAsPrimaryAction = true
        sortButton.menu = sortMenu()
        KitTip.attach(to: newProjectButton, label: "New project")
        newProjectButton.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            host?.newProject(from: newProjectButton)
        }, for: .primaryActionTriggered)
        let controls = UIStackView(arrangedSubviews: [sortButton, newProjectButton])
        controls.spacing = 2
        let head = UIStackView(arrangedSubviews: [label, UIView(), controls])
        head.alignment = .center
        head.isLayoutMarginsRelativeArrangement = true
        // `px-2.5 pr-1`, and the controls' own -4pt so they meet the edge.
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 0)
        let headHeight = head.heightAnchor.constraint(equalToConstant: traitCollection.userInterfaceIdiom == .mac ? 32 : 44)
        headHeight.isActive = true
        projectsBody.axis = .vertical
        projectsBody.spacing = 2
        projectsGroup.axis = .vertical
        projectsGroup.addArrangedSubview(head)
        projectsGroup.addArrangedSubview(projectsBody)
        return group(projectsGroup)
    }

    private func sortMenu() -> UIMenu {
        let options = RailPrefs.Sort.allCases.map { sort in
            UIAction(title: sort.label, state: prefs.sort == sort ? .on : .off) { [weak self] _ in
                guard let self else { return }
                prefs.setSort(sort)
                sortButton.menu = sortMenu()
                requestRefresh()
            }
        }
        // The button's `title` and its name: which order the rail is in.
        sortButton.toolTip = "Sort sessions — \(prefs.sort.label)"
        sortButton.accessibilityLabel = "Sort sessions — currently \(prefs.sort.label)"
        return UIMenu(title: "Sort sessions by", options: .singleSelection, children: options)
    }

    // MARK: Footer

    private func buildFooter() -> UIView {
        var ground = UIBackgroundConfiguration.clear()
        ground.backgroundColor = Palette.sidebar
        usage.backgroundConfiguration = ground
        usage.translatesAutoresizingMaskIntoConstraints = false
        usage.onOpen = { [weak self] in self?.host?.showLimits() }
        // The cell draws the web's `.usage-link` corner link itself.
        usage.onPage = { [weak self] in self?.host?.go(.usage) }
        usage.heightAnchor.constraint(equalToConstant: 44).isActive = true

        // The strip's words start on the rail's content edge, where the rows' do.
        usage.textInset = 10
        navConstraint(user)
        // No picture of the reader yet: Caw stands in.
        let avatar = BrandMark(round: true)
        let name = KitLabel(TypeScale.typeBody, ink: Palette.foreground)
        name.text = "bewinxed"
        let named = UIStackView(arrangedSubviews: [name, trialLine])
        named.axis = .vertical
        named.alignment = .leading
        trialLine.isHidden = true
        proTag.isHidden = true
        user.content.addArrangedSubview(RailRow.slot(avatar))
        user.content.addArrangedSubview(named)
        user.content.addArrangedSubview(proTag)
        user.accessibilityLabel = "bewinxed"
        user.isEnabled = false
        user.addAction(UIAction { [weak self] _ in self?.host?.keepPro() }, for: .primaryActionTriggered)

        configureButton.addAction(UIAction { [weak self] _ in self?.host?.go(.configure) }, for: .primaryActionTriggered)
        KitTip.attach(to: configureButton, label: "Configure")
        let account = UIStackView(arrangedSubviews: [user, configureButton, soundButton, themeButton])
        account.spacing = 4
        account.alignment = .center
        navRow(account)
        let stack = UIStackView(arrangedSubviews: [usage, account])
        stack.axis = .vertical
        stack.spacing = 8
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }

    // MARK: Content

    override func refreshContent() {
        #if DEBUG
        let began = CFAbsoluteTimeGetCurrent()
        defer { Self.performance.debug("rail content \((CFAbsoluteTimeGetCurrent() - began) * 1000) ms") }
        #endif
        let fleet = hub.fleet
        projectsReady = fleet.catalogsRead || hub.state == .unreachable
        // Track the inputs of Sidebar.svelte's listed/splits/branches, apart
        // from lastAt and the row's age. A tool/time pulse changes none of
        // these; an activity transition, row or preference change does.
        _ = fleet.projects
        _ = prefs.pins
        _ = prefs.sort
        _ = home.delegates
        _ = home.now
        _ = host?.activeSessionId
        _ = fleet.machines.isEmpty
        _ = fleet.claudeLimits
        _ = fleet.openCodeGoLimits
        _ = fleet.limitsRead
        for project in fleet.projects { _ = prefs.collapsed(project.id) }
        let inputs = RailModel.inputs(hub: hub, home: home, sort: prefs.sort)
        rowInputs = inputs.rows
        liveCount = inputs.live
        blockedCount = inputs.blocked
        showAccess()
    }

    /// T: the free week's whole days left under the name (its last two in
    /// strong ink), and a press opens the Get Pro form; owned, the Pro tag
    /// alone. Nothing else in the rail sells.
    private func showAccess() {
        let access = Pro.shared.access
        var line: String?
        var last = false
        if case let .trial(endsAt) = access {
            // `home.now` ticks in milliseconds: read here, the line follows the clock.
            let days = Int((endsAt.timeIntervalSince(Date(timeIntervalSince1970: home.now / 1000)) / 86400).rounded(.up))
            line = PaywallCopy.Trial.line(daysLeft: days)
            last = days <= 2
        }
        if trialLine.text != line { trialLine.text = line }
        trialLine.ink = last ? Palette.inkStrong : Palette.inkMuted
        trialLine.isHidden = line == nil
        proTag.isHidden = access != .owned
        user.isEnabled = line != nil
        user.accessibilityLabel = ["bewinxed", line, access == .owned ? PaywallCopy.Trial.owned : nil].compactMap { $0 }.joined(separator: ", ")
        user.accessibilityTraits = line != nil ? .button : .staticText
    }

    override func drawContent() {
        #if DEBUG
        let began = CFAbsoluteTimeGetCurrent()
        defer { Self.performance.debug("rail derivation \((CFAbsoluteTimeGetCurrent() - began) * 1000) ms") }
        #endif
        if fold.running { return }
        let fleet = hub.fleet
        if usageAt != home.now || usageRead != fleet.limitsRead || claudeReadings != fleet.claudeLimits || goReadings != fleet.openCodeGoLimits {
            usageAt = home.now
            usageRead = fleet.limitsRead
            claudeReadings = fleet.claudeLimits
            goReadings = fleet.openCodeGoLimits
            usage.configure(home.usage)
        }
        guard projectsReady else {
            lists = []
            showPending()
            return
        }
        // As on the web, keep the derived trees between changes of their
        // inputs. This pass is unobserved: sampling recency for their order
        // must not subscribe the derivation to each session's pulse.
        let projects = hub.fleet.projects
        let pins = prefs.pins
        let sort = prefs.sort
        let delegates = home.delegates
        if rowInputs != drawnInputs || projects != listProjects || pins != listPins || sort != listSort || delegates != listDelegates {
            #if DEBUG
            if let pair = zip(drawnInputs, rowInputs).first(where: { $0 != $1 }) {
                Self.performance.debug("rail input first \(pair.0.id, privacy: .public) -> \(pair.1.id, privacy: .public), status \(pair.0.status, privacy: .public) -> \(pair.1.status, privacy: .public), activity \(pair.0.activity.rawValue, privacy: .public) -> \(pair.1.activity.rawValue, privacy: .public), time changed \(pair.0.updatedDate != pair.1.updatedDate || pair.0.updatedText != pair.1.updatedText), recent changed \(pair.0.recent != pair.1.recent)")
            }
            #endif
            drawnInputs = rowInputs
            listProjects = projects
            listPins = pins
            listSort = sort
            listDelegates = delegates
            lists = RailModel.lists(hub: hub, home: home, prefs: prefs)
        }
        let shape = shape(of: lists)
        if shape != drawnShape {
            drawnShape = shape
            rebuild(lists)
        }
        shownNodes = []
        func keep(_ nodes: [RailBranch], project: String) {
            for node in nodes {
                if let row = sessionRows[rowKey(project, node.row.id)] {
                    shownNodes.append((node, row))
                    if openTrees.contains(node.row.id) { keep(node.children, project: project) }
                }
            }
        }
        for list in lists where !prefs.collapsed(list.project.id) {
            keep(list.recent, project: list.project.id)
            if olderShown(list) { keep(list.older, project: list.project.id) }
        }
    }

    override func refreshRows() {
        #if DEBUG
        let began = CFAbsoluteTimeGetCurrent()
        defer { Self.performance.debug("rail rows \((CFAbsoluteTimeGetCurrent() - began) * 1000) ms") }
        #endif
        guard let host else { return }
        // Places.
        fleetRow.active = host.destination == .fleet
        // Any page under /workflows (Sidebar.svelte `path.startsWith("/workflows")`).
        workflowsRow.active = host.destination.spoke == ShellDestination.workflows.spoke
        if configureButton.on != (host.destination == .configure) { configureButton.on = host.destination == .configure }
        if assistantButton.on != host.assistantOpen { assistantButton.on = host.assistantOpen }
        // `blockedCount || runningInstances.length`: what waits on the operator, else what runs.
        let blocked = blockedCount
        let count = blocked > 0 ? blocked : liveCount
        fleetBadgeBox.isHidden = count == 0
        fleetBadge.text = "\(count)"
        fleetBadgeBox.backgroundColor = blocked > 0 ? Palette.statusAttnBg : Palette.statusLiveBg
        fleetBadge.textColor = blocked > 0 ? Palette.statusAttnInk : Palette.statusLiveInk
        update(lists)
    }

    /// Rows standing where the projects will, while their read is out (`pending`).
    private func showPending() {
        guard drawnShape != "pending" else { return }
        drawnShape = "pending"
        clear(projectsBody)
        for _ in 0 ..< 6 { projectsBody.addArrangedSubview(SkeletonView(height: 30)) }
    }

    /// What the rail draws, as one string: a change rebuilds the blocks, anything else updates them in place.
    private func shape(of lists: [RailProjectList]) -> String {
        func nodes(_ list: [RailBranch]) -> String {
            list.map { "\($0.row.id)\(openTrees.contains($0.row.id) ? "[\(nodes($0.children))]" : "")" }.joined(separator: ",")
        }
        return lists.map { list in
            let open = !prefs.collapsed(list.project.id)
            guard open else { return "\(list.project.id)-" }
            return "\(list.project.id)+\(nodes(list.recent))|\(olderShown(list) ? nodes(list.older) : "\(list.older.count)")"
        }.joined(separator: ";") + "#\(hub.fleet.machines.isEmpty)"
    }

    private func olderShown(_ list: RailProjectList) -> Bool {
        olderOpen.contains(list.project.id) || list.older.contains { $0.row.id == host?.activeSessionId }
    }

    private func clear(_ stack: UIStackView) {
        for view in stack.arrangedSubviews {
            stack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    private func rebuild(_ lists: [RailProjectList]) {
        clear(projectsBody)
        var keptBlocks: [String: ProjectBlock] = [:]
        var keptRows: [String: SessionRailRow] = [:]
        guard !lists.isEmpty else {
            // `text-meta text-muted-foreground`; the command's name in the
            // mono face at label size, in the foreground ink.
            let note = UILabel()
            let said = hub.fleet.machines.isEmpty
                ? "Run cawco on a machine, then group its checkouts here."
                : "No projects yet — name a checkout to group its sessions."
            let words = NSMutableAttributedString(string: said, attributes: TypeScale.typeMeta.attributes(color: Palette.mutedForeground))
            let command = (said as NSString).range(of: "cawco")
            if command.location != NSNotFound {
                words.addAttributes([.font: TypeScale.typeCode.with(points: TypeScale.typeLabel.points).font,
                                     .foregroundColor: Palette.foreground], range: command)
            }
            note.attributedText = words
            note.numberOfLines = 0
            note.lineBreakMode = .byWordWrapping
            let box = UIStackView(arrangedSubviews: [note])
            box.isLayoutMarginsRelativeArrangement = true
            box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10)
            projectsBody.addArrangedSubview(box)
            blocks = [:]
            sessionRows = [:]
            return
        }
        for list in lists {
            let block = blocks[list.project.id] ?? ProjectBlock(project: list.project)
            block.row.addTarget(self, action: #selector(projectTapped(_:)), for: .primaryActionTriggered)
            block.onMenu = { [weak self] in self?.folderMenu(list.project) ?? UIMenu() }
            keptBlocks[list.project.id] = block
            block.clearSessions()
            if !prefs.collapsed(list.project.id) {
                let sub = block.sessions
                for node in list.recent { sub.addArrangedSubview(nodeView(node, project: list.project.id, rows: &keptRows)) }
                if !list.older.isEmpty {
                    let shown = olderShown(list)
                    let more = block.olderRow
                    more.setTitle("\(list.older.count) older")
                    more.isOpen = shown
                    more.onTap = { [weak self] in self?.toggleOlder(list.project.id) }
                    sub.addArrangedSubview(more)
                    if shown {
                        let box = OlderBox()
                        for node in list.older { box.stack.addArrangedSubview(nodeView(node, project: list.project.id, rows: &keptRows)) }
                        sub.addArrangedSubview(box)
                    }
                } else if list.recent.isEmpty {
                    let start = block.emptyRow
                    // The form resolves the project's machine and folder (Sidebar.svelte `newSession({ projectId })`).
                    start.onTap = { [weak self] in self?.host?.startSession(machineId: nil, cwd: nil, projectId: list.project.id) }
                    sub.addArrangedSubview(start)
                }
                block.showSessions(true)
            } else {
                block.showSessions(false)
            }
            projectsBody.addArrangedSubview(block)
        }
        blocks = keptBlocks
        sessionRows = keptRows
    }

    /// A session and, when it is open, the sessions it started on a rail of their own.
    private func rowKey(_ project: String, _ id: String) -> String { project + "\u{0}" + id }

    private func nodeView(_ node: RailBranch, project: String, rows: inout [String: SessionRailRow]) -> UIView {
        let key = rowKey(project, node.row.id)
        let row = sessionRows[key] ?? SessionRailRow(id: node.row.id)
        rows[key] = row
        configure(node, row: row)
        row.onOpen = { [weak self] id in self?.host?.openSession(id) }
        row.onToggle = { [weak self, weak row] id in
            if let row { self?.toggleTree(id, row: row) }
        }
        guard openTrees.contains(node.row.id), !node.children.isEmpty else {
            return row
        }
        let list = NestList()
        for child in node.children { list.stack.addArrangedSubview(nodeView(child, project: project, rows: &rows)) }
        let unit = UIStackView(arrangedSubviews: [row, list])
        unit.axis = .vertical
        return unit
    }

    /// Fills the drawn rows from the fleet: mark, name, age, counts, which is
    /// in front. Only a row whose drawn state moved, or one just built, is
    /// filled again: a session's pulse redraws its own row and no other.
    private func update(_ lists: [RailProjectList]) {
        let active = host?.activeSessionId
             for (node, row) in shownNodes {
                let at = hub.fleet.lastAt(node.row)
                let title = hub.fleet.title(node.row)
                let status = HomeViewController.status(node.row, home: home)
                let place = node.row.cwd.isEmpty ? node.row.machineId : node.row.cwd
                let age = at == 0 ? "" : RailAge.short(at, now: home.now)
                let hint = at == 0 ? "No activity recorded" : "Last activity \(RailAge.ago(at, now: home.now))"
                let open = openTrees.contains(node.row.id)
                let front = node.row.id == active
                let count = node.count
                let failed = node.failed
                // `statusWord`: a session the operator stopped says so; its mark is an ended session's.
                let word = node.row.status == .stopped ? "Stopped" : status.word
                // The row view itself is part of the print: a rebuilt row is filled whatever it last drew.
                row.ageHint = hint
                let print = SessionPrint(view: ObjectIdentifier(row), title: title, status: status, place: place,
                                         age: age, count: count, failed: failed, open: open, front: front, word: word)
                 let key = ObjectIdentifier(row)
                 if sessionPrints[key] != print {
                     sessionPrints[key] = print
                    row.configure(title: title, status: status, word: word, place: place, age: age, count: count, failed: failed, open: open)
                    row.active = front
                }
            }
        for list in lists {
            guard let block = blocks[list.project.id] else { continue }
            let name = list.project.name
            let running = list.running
            let open = !prefs.collapsed(list.project.id)
            let print = ProjectPrint(view: ObjectIdentifier(block), name: name, running: running, open: open)
            if projectPrints[list.project.id] != print {
                projectPrints[list.project.id] = print
                block.configure(name: name, running: running, open: open)
            }
        }
    }

    /// Content is known before a row enters its stack, including its first frame.
    private func configure(_ node: RailBranch, row: SessionRailRow) {
        let at = hub.fleet.lastAt(node.row)
        let status = HomeViewController.status(node.row, home: home)
        row.configure(title: hub.fleet.title(node.row), status: status,
                      word: node.row.status == .stopped ? "Stopped" : status.word,
                      place: node.row.cwd.isEmpty ? node.row.machineId : node.row.cwd,
                      age: at == 0 ? "" : RailAge.short(at, now: home.now),
                      count: node.count, failed: node.failed, open: openTrees.contains(node.row.id))
        row.active = node.row.id == host?.activeSessionId
    }

    /// What each rail row and project block last drew.
    private struct SessionPrint: Equatable {
        let view: ObjectIdentifier
        let title: String
        let status: MarkStatus
        let place: String
        let age: String
        let count: Int
        let failed: Int
        let open: Bool
        let front: Bool
        let word: String
    }
    private struct ProjectPrint: Equatable {
        let view: ObjectIdentifier
        let name: String
        let running: Int
        let open: Bool
    }
    private var sessionPrints: [ObjectIdentifier: SessionPrint] = [:]
    private var projectPrints: [String: ProjectPrint] = [:]
    #if DEBUG
    private static let performance = Logger(subsystem: "dev.cawco.app", category: "Rail")
    #endif

    // MARK: Folding

    @objc private func projectTapped(_ row: RailRow) {
        guard let block = blocks.first(where: { $0.value.row === row })?.value else { return }
        let project = block.project
        let shut = !prefs.collapsed(project.id)
        if fold.closingBox === block.sessionsBox {
            fold.open(block.sessionsBox, glyphs: block.sessionGlyphs(), rail: block.rail, in: view)
            return
        }
        if shut {
            fold.close(block.sessionsBox, glyphs: block.sessionGlyphs(), rail: block.rail) { [weak self] in
                guard let self else { return }
                prefs.setCollapsed(project.id, true)
                block.showSessions(false)
                drawnShape = shape(of: lists)
                requestRefresh()
            }
        } else {
            fold.capture(in: view)
            prefs.setCollapsed(project.id, false)
            refreshNow()
            fold.open(block.sessionsBox, glyphs: block.sessionGlyphs(), rail: block.rail, in: view)
        }
    }

    private func toggleTree(_ id: String, row: SessionRailRow) {
        if let list = fold.closingBox as? NestList, list.superview === row.superview {
            fold.open(list, glyphs: list.glyphs(), rail: list.rail, in: view)
            return
        }
        if openTrees.contains(id), let unit = row.superview as? UIStackView, let list = unit.arrangedSubviews.last as? NestList {
            fold.close(list, glyphs: list.glyphs(), rail: list.rail) { [weak self] in
                guard let self else { return }
                openTrees.remove(id)
                list.isHidden = true
                drawnShape = shape(of: lists)
                requestRefresh()
            }
        } else {
            fold.capture(in: view)
            openTrees.insert(id)
            refreshNow()
            if let unit = row.superview as? UIStackView, let list = unit.arrangedSubviews.last as? NestList {
                fold.open(list, glyphs: list.glyphs(), rail: list.rail, in: view)
            }
        }
    }

    /// A project's "N older": the same fold a project and a tree open and shut by.
    private func toggleOlder(_ id: String) {
        func box() -> OlderBox? { blocks[id]?.sessions.arrangedSubviews.last as? OlderBox }
        if let shut = fold.closingBox as? OlderBox, shut === box() {
            fold.open(shut, glyphs: [], rail: nil, in: view)
            return
        }
        if olderOpen.contains(id), let open = box() {
            fold.close(open, glyphs: [], rail: nil) { [weak self] in
                guard let self else { return }
                olderOpen.remove(id)
                open.isHidden = true
                drawnShape = shape(of: lists)
                requestRefresh()
            }
        } else {
            fold.capture(in: view)
            olderOpen.insert(id)
            refreshNow()
            if let open = box() { fold.open(open, glyphs: [], rail: nil, in: view) }
        }
    }

    /// Lays the rail out now, so a fold can measure what it opens.
    private func refreshNow() {
        refreshContent()
        drawContent()
        refreshRows()
        view.layoutIfNeeded()
    }

    // MARK: Folder menu

    /// FolderMenu.svelte: what a project's row answers to on a right-click or long press.
    private func folderMenu(_ project: ProjectRow) -> UIMenu {
        let pinned = prefs.isPinned(project.id)
        let chosen = prefs.chosenHue(project.folder)
        let current = prefs.hue(project.folder)
        var swatches: [UIMenuElement] = RailPrefs.identityHues.map { hue in
            UIAction(title: "Hue \(Int(hue))\(chosen == nil && current == hue ? " (automatic)" : "")", image: Self.swatch(hue), state: current == hue ? .on : .off) { [weak self] _ in
                self?.prefs.setHue(project.folder, hue)
            }
        }
        if chosen != nil {
            swatches.insert(UIAction(title: "Auto") { [weak self] _ in self?.prefs.setHue(project.folder, nil) }, at: 0)
        }
        let colour = UIMenu(title: "Colour", options: .displayAsPalette, children: swatches)
        let open = UIAction(title: "Open project page", image: Glyph.external.image) { [weak self] _ in self?.host?.go(.project(project.id)) }
        var sections: [UIMenuElement] = [
            UIAction(title: "New session here", image: Glyph.plus.image) { [weak self] _ in
                self?.host?.startSession(machineId: nil, cwd: nil, projectId: project.id)
            },
            open,
            UIAction(title: pinned ? "Unpin from rail" : "Pin to rail", image: Glyph.pin.image) { [weak self] _ in
                self?.prefs.togglePin(project.id)
                self?.requestRefresh()
            },
            UIMenu(title: "Customize", image: Glyph.palette.image, children: [colour]),
            UIAction(title: "Collapse other folders", image: Glyph.chevronUp.image) { [weak self] _ in
                self?.collapseOthers(project.id)
            },
        ]
        if UIApplication.shared.supportsMultipleScenes {
            sections.insert(UIWindowScene.ActivationAction({ _ in
                let activity = NSUserActivity(activityType: "dev.cawco.scene")
                activity.userInfo = ["projectId": project.id]
                return UIWindowScene.ActivationConfiguration(userActivity: activity)
            }), at: 2)
        }
        let forget = UIAction(title: "Forget project…", image: Glyph.trash.image, attributes: .destructive) { [weak self] _ in
            self?.host?.forgetProject(project)
        }
        return UIMenu(children: [UIMenu(options: .displayInline, children: sections), UIMenu(options: .displayInline, children: [forget])])
    }

    private func collapseOthers(_ id: String) {
        for project in hub.fleet.projects { prefs.setCollapsed(project.id, project.id != id) }
        requestRefresh()
    }

    /// A swatch as the picker draws it: a 20pt disc in the hue's identity ink.
    private static func swatch(_ hue: Double) -> UIImage {
        let ink = IdentityInk.color(hue: hue)
        return UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            ink.setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: 20, height: 20))
        }.withRenderingMode(.alwaysOriginal)
    }
}

// MARK: Parts

/// The header's corner actions (`.head-action`): a nav-row-tall square,
/// `--radius-sm`, an 18pt glyph in muted ink, the selected wash while on.
final class HeadAction: TapControl {
    private let glyph: GlyphView
    private let rest: UIColor
    var on = false { didSet { paint() } }

    init(_ glyph: Glyph, label: String, tint: UIColor) {
        self.glyph = GlyphView(glyph, size: 18, tint: tint)
        rest = tint
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        self.glyph.isUserInteractionEnabled = false
        addSubview(self.glyph)
        NSLayoutConstraint.activate([
            self.glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            self.glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = label
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HeadAction is built in code")
    }

    override var isHighlighted: Bool { didSet { paint() } }

    private func paint() {
        Motion.easeOut.animator(Motion.durControl) {
            self.backgroundColor = self.on ? Palette.selectedBg : (self.isHighlighted ? Palette.surfaceFill : .clear)
            self.glyph.tintColor = self.on ? Palette.selectedInk : self.rest
        }.startAnimation()
        accessibilityTraits = on ? [.button, .selected] : .button
    }
}

/// The theme switch (ThemeSwitcher.svelte): a ghost icon button that flips
/// the scheme on screen, the moon and the sun swapping in place.
final class ThemeButton: TapControl {
    private let moon = GlyphView(.moon, tint: Palette.sidebarForeground)
    private let sun = GlyphView(.sun, tint: Palette.sidebarForeground)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        for glyph in [moon, sun] {
            glyph.isUserInteractionEnabled = false
            addSubview(glyph)
            NSLayoutConstraint.activate([glyph.centerXAnchor.constraint(equalTo: centerXAnchor), glyph.centerYAnchor.constraint(equalTo: centerYAnchor)])
        }
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 30), heightAnchor.constraint(equalToConstant: 30)])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in self?.flip() }, for: .primaryActionTriggered)
        addInteraction(UIPointerInteraction(delegate: nil))
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: ThemeButton, _: UITraitCollection) in button.show(animated: true) }
        show(animated: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ThemeButton is built in code")
    }

    override var isHighlighted: Bool { didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear } }

    private func flip() {
        Theme.set(traitCollection.userInterfaceStyle == .dark ? .light : .dark)
    }

    /// `icon-swap`: the arriving glyph from 0.25 scale and 4pt blur, over `durControl` on the out curve.
    private func show(animated: Bool) {
        let dark = traitCollection.userInterfaceStyle == .dark
        let label = Theme.current == .unspecified ? "System" : (dark ? "Dark mode" : "Light mode")
        accessibilityLabel = label
        KitTip.attach(to: self, label: label)
        let shown = dark ? moon : sun
        let hidden = dark ? sun : moon
        let still = !animated || UIAccessibility.isReduceMotionEnabled
        if !still { shown.transform = CGAffineTransform(scaleX: 0.25, y: 0.25) }
        let apply: @MainActor @Sendable () -> Void = {
            shown.alpha = 1
            shown.transform = .identity
            hidden.alpha = 0
            if !still { hidden.transform = CGAffineTransform(scaleX: 0.25, y: 0.25) }
        }
        if animated { Motion.easeOut.animator(Motion.durControl, animations: apply).startAnimation() } else { apply() }
    }
}

/// The Sound switch, beside the theme switch: whether the interface plays
/// its sounds (the composer's recall), off until the reader turns it on.
/// The speaker and the crossed speaker swap in place as the theme's glyphs do.
final class SoundButton: TapControl {
    private let on = GlyphView(.soundOn, tint: Palette.sidebarForeground)
    private let off = GlyphView(.soundOff, tint: Palette.sidebarForeground)
    private var watcher: NSObjectProtocol?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        for glyph in [on, off] {
            glyph.isUserInteractionEnabled = false
            addSubview(glyph)
            NSLayoutConstraint.activate([glyph.centerXAnchor.constraint(equalTo: centerXAnchor), glyph.centerYAnchor.constraint(equalTo: centerYAnchor)])
        }
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 30), heightAnchor.constraint(equalToConstant: 30)])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in self?.flip() }, for: .primaryActionTriggered)
        addInteraction(UIPointerInteraction(delegate: nil))
        // Another window's switch turned it.
        watcher = NotificationCenter.default.addObserver(forName: SoundPreference.changed, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.show(animated: true) }
        }
        show(animated: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SoundButton is built in code")
    }

    override var isHighlighted: Bool { didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear } }

    private func flip() {
        SoundPreference.enabled.toggle()
    }

    /// `icon-swap`: the arriving glyph from 0.25 scale, over `durControl` on the out curve.
    private func show(animated: Bool) {
        let enabled = SoundPreference.enabled
        let label = enabled ? "Sound on" : "Sound off"
        accessibilityLabel = label
        accessibilityTraits = enabled ? [.button, .selected] : .button
        KitTip.attach(to: self, label: label)
        let shown = enabled ? on : off
        let hidden = enabled ? off : on
        let still = !animated || UIAccessibility.isReduceMotionEnabled
        if !still { shown.transform = CGAffineTransform(scaleX: 0.25, y: 0.25) }
        let apply: @MainActor @Sendable () -> Void = {
            shown.alpha = 1
            shown.transform = .identity
            hidden.alpha = 0
            if !still { hidden.transform = CGAffineTransform(scaleX: 0.25, y: 0.25) }
        }
        if animated { Motion.easeOut.animator(Motion.durControl, animations: apply).startAnimation() } else { apply() }
    }
}

/// The scheme the reader chose over the system's, for every window of the app (theme.svelte.ts).
@MainActor
enum Theme {
    private static let key = "cawco-theme"

    static var current: UIUserInterfaceStyle {
        UIUserInterfaceStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .unspecified
    }

    static func set(_ style: UIUserInterfaceStyle) {
        UserDefaults.standard.set(style.rawValue, forKey: key)
        apply()
    }

    static func apply(to window: UIWindow? = nil) {
        let windows = window.map { [$0] } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        for window in windows { window.overrideUserInterfaceStyle = current }
    }
}
