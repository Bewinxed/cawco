import CawCoCore
import CawCoDesign
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
    private let usage = UsageCell(frame: .zero)
    private var navHeights: [NSLayoutConstraint] = []

    /// Every project block and session row the rail has drawn, by id, kept across updates.
    private var blocks: [String: ProjectBlock] = [:]
    private var sessionRows: [String: SessionRailRow] = [:]
    private var drawnShape = ""
    private var olderOpen = Set<String>()
    private var openTrees = Set<String>()
    private let fold = RailFold()

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
        ])
        column.addArrangedSubview(group(buildPlaces()))
        homeSlot.translatesAutoresizingMaskIntoConstraints = false
        column.addArrangedSubview(homeSlot)
        column.addArrangedSubview(buildProjects())
        mountHome(nil)
        registerForTraitChanges([UITraitHorizontalSizeClass.self, UITraitUserInterfaceIdiom.self]) { (rail: SidebarViewController, _: UITraitCollection) in
            rail.sizeNavRows()
        }
        sizeNavRows()
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
        let word = KitLabel(TypeScale.typeBody.withWeight(.medium), ink: Palette.foreground)
        word.text = "CawCo"
        brand.content.addArrangedSubview(RailRow.slot(BrandMark()))
        brand.content.addArrangedSubview(word)
        brand.accessibilityLabel = "CawCo"
        brand.addAction(UIAction { [weak self] _ in self?.host?.go(.fleet) }, for: .primaryActionTriggered)
        assistantButton.addAction(UIAction { [weak self] _ in self?.host?.toggleAssistant() }, for: .primaryActionTriggered)
        startButton.addAction(UIAction { [weak self] _ in self?.host?.startSession(machineId: nil, cwd: nil, projectId: nil) }, for: .primaryActionTriggered)
        for action in [assistantButton, startButton] { navConstraint(action); action.widthAnchor.constraint(equalTo: action.heightAnchor).isActive = true }
        headerRow.addArrangedSubview(brand)
        headerRow.addArrangedSubview(assistantButton)
        headerRow.addArrangedSubview(startButton)
        headerRow.axis = .horizontal
        headerRow.spacing = 4
        headerRow.alignment = .center
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
            fleetBadgeBox.topAnchor.constraint(equalTo: fleetRow.topAnchor, constant: 6),
            fleetBadgeBox.heightAnchor.constraint(equalToConstant: 20),
            fleetBadgeBox.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            fleetBadge.leadingAnchor.constraint(equalTo: fleetBadgeBox.leadingAnchor, constant: 4),
            fleetBadge.trailingAnchor.constraint(equalTo: fleetBadgeBox.trailingAnchor, constant: -4),
            fleetBadge.centerYAnchor.constraint(equalTo: fleetBadgeBox.centerYAnchor),
        ])
        return menu
    }

    // MARK: Home

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
        // Until the home's rail variant lands it scrolls on its own: give it the
        // column's height so the rail stays one scroller under it.
        let tall = content.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor, multiplier: 0.6)
        tall.isActive = true
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

    // MARK: Projects

    private func buildProjects() -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.sidebarForeground.withAlphaComponent(0.7))
        label.text = "Projects"
        sortButton.showsMenuAsPrimaryAction = true
        sortButton.menu = sortMenu()
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

        let user = RailRow(height: nil, leading: 10, trailing: 10, gap: 10)
        navConstraint(user)
        let avatar = UILabel()
        avatar.text = "bw"
        avatar.font = TypeScale.typeMeta.font
        avatar.textColor = Palette.selectedInk
        avatar.textAlignment = .center
        avatar.backgroundColor = Palette.selectedBg
        avatar.layer.cornerRadius = 9
        avatar.clipsToBounds = true
        avatar.translatesAutoresizingMaskIntoConstraints = false
        avatar.widthAnchor.constraint(equalToConstant: 18).isActive = true
        avatar.heightAnchor.constraint(equalToConstant: 18).isActive = true
        let name = KitLabel(TypeScale.typeBody, ink: Palette.foreground)
        name.text = "bewinxed"
        user.content.addArrangedSubview(RailRow.slot(avatar))
        user.content.addArrangedSubview(name)
        user.accessibilityLabel = "bewinxed"
        user.isEnabled = false

        configureButton.addAction(UIAction { [weak self] _ in self?.host?.go(.configure) }, for: .primaryActionTriggered)
        let account = UIStackView(arrangedSubviews: [user, configureButton, themeButton])
        account.spacing = 4
        account.alignment = .center
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
        guard let host else { return }
        let fleet = hub.fleet
        // Places.
        fleetRow.active = host.destination == .fleet
        workflowsRow.active = host.destination == .workflows
        configureButton.on = host.destination == .configure
        assistantButton.on = host.assistantOpen
        // `blockedCount || runningInstances.length`: what waits on the operator, else what runs.
        let blocked = fleet.rows.filter { $0.isLive && home.activity($0.id) == .blocked }.count
        let count = blocked > 0 ? blocked : fleet.rows.filter(\.isLive).count
        fleetBadgeBox.isHidden = count == 0
        fleetBadge.text = "\(count)"
        fleetBadgeBox.backgroundColor = blocked > 0 ? Palette.statusAttnBg : Palette.statusLiveBg
        fleetBadge.textColor = blocked > 0 ? Palette.statusAttnInk : Palette.statusLiveInk
        usage.configure(home.usage)
        // Projects, once every read they need is in.
        let ready = fleet.catalogsRead || hub.state == .unreachable
        guard ready else {
            showPending()
            return
        }
        let lists = RailModel.lists(hub: hub, home: home, prefs: prefs)
        let shape = shape(of: lists)
        if shape != drawnShape {
            drawnShape = shape
            rebuild(lists)
        }
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
            let open = !prefs.collapsed(list.project.cwd)
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
            let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            note.text = hub.fleet.machines.isEmpty
                ? "Run cawco on a machine, then group its checkouts here."
                : "No projects yet — name a checkout to group its sessions."
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
            if !prefs.collapsed(list.project.cwd) {
                let sub = block.sessions
                for node in list.recent { sub.addArrangedSubview(nodeView(node, rows: &keptRows)) }
                if !list.older.isEmpty {
                    let shown = olderShown(list)
                    let more = block.olderRow
                    more.setTitle("\(list.older.count) older")
                    more.isOpen = shown
                    more.onTap = { [weak self] in self?.toggleOlder(list.project.id) }
                    sub.addArrangedSubview(more)
                    if shown {
                        let box = OlderBox()
                        for node in list.older { box.stack.addArrangedSubview(nodeView(node, rows: &keptRows)) }
                        sub.addArrangedSubview(box)
                    }
                } else if list.recent.isEmpty {
                    let start = block.emptyRow
                    start.onTap = { [weak self] in
                        self?.host?.startSession(machineId: list.project.machineId, cwd: list.project.cwd, projectId: list.project.id)
                    }
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
    private func nodeView(_ node: RailBranch, rows: inout [String: SessionRailRow]) -> UIView {
        let row = sessionRows[node.row.id] ?? SessionRailRow(id: node.row.id)
        rows[node.row.id] = row
        row.onOpen = { [weak self] id in self?.host?.openSession(id) }
        row.onToggle = { [weak self] id in self?.toggleTree(id) }
        guard openTrees.contains(node.row.id), !node.children.isEmpty else {
            return row
        }
        let list = NestList()
        for child in node.children { list.stack.addArrangedSubview(nodeView(child, rows: &rows)) }
        let unit = UIStackView(arrangedSubviews: [row, list])
        unit.axis = .vertical
        return unit
    }

    /// Fills every drawn row from the fleet: mark, name, age, counts, which is in front.
    private func update(_ lists: [RailProjectList]) {
        let active = host?.activeSessionId
        func walk(_ nodes: [RailBranch]) {
            for node in nodes {
                guard let row = sessionRows[node.row.id] else { continue }
                let at = hub.fleet.lastAt(node.row)
                row.configure(
                    title: hub.fleet.title(node.row),
                    status: HomeViewController.status(node.row, home: home),
                    place: node.row.cwd.isEmpty ? node.row.machineId : node.row.cwd,
                    age: at == 0 ? "" : RailAge.short(at, now: home.now),
                    count: node.count,
                    failed: node.failed,
                    open: openTrees.contains(node.row.id)
                )
                row.active = node.row.id == active
                walk(node.children)
            }
        }
        for list in lists {
            guard let block = blocks[list.project.id] else { continue }
            block.configure(name: list.project.name, running: list.running, open: !prefs.collapsed(list.project.cwd))
            walk(list.recent)
            walk(list.older)
        }
    }

    // MARK: Folding

    @objc private func projectTapped(_ row: RailRow) {
        guard let block = blocks.first(where: { $0.value.row === row })?.value else { return }
        let project = block.project
        let shut = !prefs.collapsed(project.cwd)
        if shut {
            fold.close(block.sessionsBox, glyphs: block.sessionGlyphs()) { [weak self] in
                self?.prefs.setCollapsed(project.cwd, true)
                self?.requestRefresh()
            }
        } else {
            prefs.setCollapsed(project.cwd, false)
            refreshNow()
            fold.open(block.sessionsBox, glyphs: block.sessionGlyphs(), in: view)
        }
    }

    private func toggleTree(_ id: String) {
        guard let row = sessionRows[id] else { return }
        if openTrees.contains(id), let unit = row.superview as? UIStackView, let list = unit.arrangedSubviews.last as? NestList {
            fold.close(list, glyphs: list.glyphs(), rail: list.rail) { [weak self] in
                self?.openTrees.remove(id)
                self?.requestRefresh()
            }
        } else {
            openTrees.insert(id)
            refreshNow()
            if let unit = sessionRows[id]?.superview as? UIStackView, let list = unit.arrangedSubviews.last as? NestList {
                fold.open(list, glyphs: list.glyphs(), rail: list.rail, in: view)
            }
        }
    }

    private func toggleOlder(_ id: String) {
        if olderOpen.contains(id) { olderOpen.remove(id) } else { olderOpen.insert(id) }
        requestRefresh()
    }

    /// Lays the rail out now, so a fold can measure what it opens.
    private func refreshNow() {
        refreshContent()
        view.layoutIfNeeded()
    }

    // MARK: Folder menu

    /// FolderMenu.svelte: what a project's row answers to on a right-click or long press.
    private func folderMenu(_ project: ProjectRow) -> UIMenu {
        let pinned = prefs.isPinned(project.id)
        let chosen = prefs.chosenHue(project.cwd)
        let current = prefs.hue(project.cwd)
        var swatches: [UIMenuElement] = RailPrefs.identityHues.map { hue in
            UIAction(title: "Hue \(Int(hue))\(chosen == nil && current == hue ? " (automatic)" : "")", image: Self.swatch(hue), state: current == hue ? .on : .off) { [weak self] _ in
                self?.prefs.setHue(project.cwd, hue)
            }
        }
        if chosen != nil {
            swatches.insert(UIAction(title: "Auto") { [weak self] _ in self?.prefs.setHue(project.cwd, nil) }, at: 0)
        }
        let colour = UIMenu(title: "Colour", options: .displayAsPalette, children: swatches)
        let open = UIAction(title: "Open project page", image: Glyph.external.image) { [weak self] _ in self?.host?.go(.project(project.id)) }
        var sections: [UIMenuElement] = [
            UIAction(title: "New session here", image: Glyph.plus.image) { [weak self] _ in
                self?.host?.startSession(machineId: project.machineId, cwd: project.cwd, projectId: project.id)
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
        for project in hub.fleet.projects { prefs.setCollapsed(project.cwd, project.id != id) }
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
        accessibilityLabel = Theme.current == .unspecified ? "System" : (dark ? "Dark mode" : "Light mode")
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
