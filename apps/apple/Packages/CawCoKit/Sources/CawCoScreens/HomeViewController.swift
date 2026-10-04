import CawCoCore
import CawCoDesign
import UIKit

/// The home (home/Home.svelte, its phone page): a status line, a headline,
/// and the sessions grouped by what they want from the operator — Needs you,
/// then Working and Finished as two tabs, then Recent. It never claims
/// nothing needs you while the hub is not live: the rows stay as last known
/// and greyed, there is no headline and no Caw, and the status line says
/// the hub is gone.
///
/// One collection view with a compositional list layout and a diffable data
/// source keyed by stable ids. `updateProperties()` reads the stores, so
/// UIKit's observation tracking runs it again whenever what it read changes;
/// each run applies the new snapshot and reconfigures the items that stay.
final class HomeViewController: ObservedViewController, UICollectionViewDelegate, RelayHost, BranchHost {
    static let cawSide = 160.0
    static let recentPage = 30

    nonisolated enum Section: Int, Hashable, Sendable {
        case top, needs, work, caw, recent
    }

    /// One drawn line, by a stable id: a machine's header is the same line in
    /// both tabs, so a tab switch never takes it out and puts it back.
    nonisolated enum Item: Hashable, Sendable {
        case status
        case usage
        case headline
        case need(String)
        case tabs
        case machine(String)
        case row(String)
        case more(String)
        case caw
        case recentHead
        case recentSearch
        case recent(String)
        case recentNone
        case recentMore
    }

    private struct RowLine {
        let line: HomeModel.Line
        let tab: HomeModel.Tab
        let group: String
        let through: [Int]
    }

    private let hub: HubConnection
    private let home: HomeModel
    var onOpen: (String) -> Void = { _ in }
    var onSelectTab: (HomeModel.Tab) -> Void = { _ in }
    /// Opens the Usage page from the strip's corner link.
    var onUsagePage: (() -> Void)?
    /// Set on the page (not the rail's copy): its dock's Start session.
    var onStart: (() -> Void)?
    var collectionView: UICollectionView!
    private(set) lazy var layout = makeLayout()
    private var dataSource: UICollectionViewDiffableDataSource<Section, Item>!

    // What the last update drew, for the cells to read.
    private var needs: [String: HomeModel.NeedsItem] = [:]
    private var rows: [String: RowLine] = [:]
    private var groups: [String: (group: HomeModel.MachineGroup, seam: Bool)] = [:]
    private var recentItems: [String: HomeModel.RecentItem] = [:]
    /// Everything Recent lists, before the search narrows it.
    private var recentAll: [HomeModel.RecentItem] = []
    /// A cell is under the finger; `pending` is the snapshot waiting for it to lift.
    private var pressed = false
    private var pending: (snapshot: NSDiffableDataSourceSnapshot<Section, Item>, animated: Bool)?
    private var counts = (working: 0, finished: 0, finishedFailed: false)
    private var cawLine = ""
    /// Read in `build()`, so a change to either alone runs the update again.
    private var spendWords = ""
    private var usageStrip: Usage.Strip?

    // The view's own state.
    private var search = ""
    private var recentShown = HomeViewController.recentPage
    /// The driven motions: a tab switch or "N more" (the relay), a tree's fold.
    /// While one runs, the list waits for it before it takes the next change.
    private let relay = RelayMotion()
    private let branch = BranchMotion()
    /// The swipe between Working and Finished, and what it has open.
    private var swipe: TabSwipe!
    private var swiping: (from: HomeModel.Tab, to: HomeModel.Tab)?
    private var cover: UIView?
    private var leavingPane: UIView?
    private var arrivingPane: UIView?
    /// Room added under a shorter list while it stands where a longer one was.
    private var heldInset = 0.0
    /// The landed list's rows flying in.
    private let flight = Frames()

    /// Where the home stands (Home.svelte `variant`): the page, or the rail's own copy.
    enum Variant {
        case page, rail

        /// The page has a ground of its own; in the rail the home has none and stands on the sidebar's.
        var ground: UIColor { self == .page ? Palette.surfaceRecess : Palette.sidebar }
    }

    private let variant: Variant

    init(hub: HubConnection, home: HomeModel, variant: Variant) {
        self.hub = hub
        self.home = home
        self.variant = variant
        super.init(nibName: nil, bundle: nil)
    }

    func collectionView(_: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt _: IndexPath) {
        (cell as? HomeCell)?.ground = variant.ground
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HomeViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = variant.ground
        collectionView = BoardList(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = variant.ground
        collectionView.delegate = self
        collectionView.keyboardDismissMode = .onDrag
        view.addSubview(collectionView)
        dataSource = makeDataSource()
        swipe = TabSwipe(host: self, in: view)
        if onStart != nil { installDock() }
    }

    /// The page's dock (Home.svelte `.dock`): Start session held at the
    /// bottom, where the phone's thumb reaches, over the recess fading in
    /// across its first 12pt so the list scrolls out from under it.
    private func installDock() {
        let dock = DockView()
        let button = KitButton.make("Start session", glyph: .plus, variant: .action, height: .lg, stretch: true) { [weak self] in self?.onStart?() }
        dock.translatesAutoresizingMaskIntoConstraints = false
        dock.addSubview(button)
        view.addSubview(dock)
        NSLayoutConstraint.activate([
            dock.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            dock.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            dock.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            button.topAnchor.constraint(equalTo: dock.topAnchor, constant: Space.space3),
            button.leadingAnchor.constraint(equalTo: dock.leadingAnchor, constant: Space.space5),
            button.trailingAnchor.constraint(equalTo: dock.trailingAnchor, constant: -Space.space5),
            button.heightAnchor.constraint(equalToConstant: Size.cBtnHLg),
        ])
        let foot = button.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -Space.space3)
        foot.isActive = true
        dockFoot = foot
        // The list ends above the dock: its safe area grows by the dock's own height.
        additionalSafeAreaInsets.bottom = Space.space3 + Size.cBtnHLg + Space.space3
    }

    private var dockFoot: NSLayoutConstraint?

    /// The dock's foot clears the home indicator: the screen's own inset, without the room the dock adds.
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        guard let dockFoot else { return }
        let own = max(0, view.safeAreaInsets.bottom - additionalSafeAreaInsets.bottom)
        dockFoot.constant = -(Space.space3 + own)
    }

    // MARK: Layout

    private func makeLayout() -> HomeLayout {
        HomeLayout { [weak self] index, environment in
            let section = self?.dataSource?.sectionIdentifier(for: index) ?? .top
            let first = self?.dataSource?.snapshot().sectionIdentifiers.first { $0 != .top }
            guard section == .work, let self else {
                return Self.section(section, firstGroup: section == first)
            }
            // The work rows are a list, so a finished row swipes away to archive.
            var list = UICollectionLayoutListConfiguration(appearance: .plain)
            list.showsSeparators = false
            list.backgroundColor = .clear
            list.trailingSwipeActionsConfigurationProvider = { [weak self] indexPath in
                self?.archiveSwipe(at: indexPath)
            }
            let layout = NSCollectionLayoutSection.list(using: list, layoutEnvironment: environment)
            layout.contentInsets = NSDirectionalEdgeInsets(top: section == first ? Space.space2 : Space.space5, leading: Space.space5, bottom: 0, trailing: Space.space5)
            return layout
        }
    }

    /// A finished row's swipe: what a finger uncovers as it draws the row
    /// away, "Archive", taking the row and its tree off Finished.
    private func archiveSwipe(at indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        guard home.tab == .finished, case let .row(id) = dataSource.itemIdentifier(for: indexPath),
              let row = rows[id], !row.line.line.context, home.archivable(row.line.line.row)
        else {
            return nil
        }
        let action = UIContextualAction(style: .normal, title: "Archive") { [weak self] _, _, done in
            guard let self else { return }
            home.archive(home.treeOf(id))
            done(true)
        }
        action.image = Glyph.archive.image.resized(to: Size.iconMd).withTintColor(Palette.selectedInk, renderingMode: .alwaysOriginal)
        action.backgroundColor = Palette.selectedBg
        return UISwipeActionsConfiguration(actions: [action])
    }

    /// Each section a list of self-sized lines, spaced and inset as the web home's groups.
    private static func section(_ section: Section, firstGroup: Bool) -> NSCollectionLayoutSection {
        let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
        let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [NSCollectionLayoutItem(layoutSize: size)])
        let layout = NSCollectionLayoutSection(group: group)
        let side = Space.space5
        switch section {
        case .top:
            layout.interGroupSpacing = Space.space2
            layout.contentInsets = NSDirectionalEdgeInsets(top: Space.space5, leading: side, bottom: Space.space3, trailing: side)
        case .needs:
            layout.interGroupSpacing = Space.space2
            layout.contentInsets = NSDirectionalEdgeInsets(top: firstGroup ? Space.space2 : Space.space5, leading: side, bottom: 0, trailing: side)
        case .work, .caw:
            layout.contentInsets = NSDirectionalEdgeInsets(top: firstGroup ? Space.space2 : Space.space5, leading: side, bottom: 0, trailing: side)
        case .recent:
            layout.interGroupSpacing = 2
            layout.contentInsets = NSDirectionalEdgeInsets(top: firstGroup ? Space.space2 : Space.space5, leading: side, bottom: Space.space7, trailing: side)
        }
        return layout
    }

    // MARK: Cells

    private func makeDataSource() -> UICollectionViewDiffableDataSource<Section, Item> {
        let usage = UICollectionView.CellRegistration<UsageCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            // Its bar's ticks are cut in the ground it stands on.
            cell.ground = variant.ground
            cell.configure(usageStrip ?? home.usage)
            cell.onOpen = { [weak self] in self?.openUsage() }
            cell.onPage = onUsagePage
        }
        let status = UICollectionView.CellRegistration<StatusCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            cell.line.configure(hub: hub, ready: home.ready, spend: spendWords)
        }
        let headline = UICollectionView.CellRegistration<HeadlineCell, Item> { [weak self] cell, _, _ in
            cell.configure(count: self?.needs.count ?? 0)
        }
        let need = UICollectionView.CellRegistration<NeedsCardCell, Item> { [weak self] cell, _, item in
            guard let self, case let .need(id) = item, let need = needs[id] else { return }
            var sent: Ledger.Command?
            if case let .ask(parked) = need.kind {
                sent = hub.needs.answerSent(for: parked)
            }
            cell.configure(need, now: home.now, sent: sent, stale: !home.live)
            cell.onAnswer = { [weak self] answer in
                guard let self, home.live, case let .ask(parked) = need.kind else { return }
                hub.needs.answer(parked, machineId: need.machineId, answer)
            }
            cell.onOpen = { [weak self] in
                guard let self else { return }
                switch need.kind {
                case let .ask(ask): onOpen(ask.instanceId)
                case let .run(run): onOpen(run.rowId)
                }
            }
        }
        let tabs = UICollectionView.CellRegistration<TabsCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            cell.configure(tab: home.tab, working: counts.working, finished: counts.finished, finishedFailed: counts.finishedFailed, delegatesOn: home.delegates)
            cell.onTab = { [weak self] tab in self?.choose(tab) }
            cell.onDelegates = { [weak self] in
                guard let self else { return }
                home.delegates.toggle()
            }
        }
        let machine = UICollectionView.CellRegistration<MachineCell, Item> { [weak self] cell, _, item in
            guard let self, case let .machine(id) = item, let entry = groups[id] else { return }
            let finished = home.tab == .finished ? home.finishedOn(id) : []
            cell.configure(entry.group, seam: entry.seam, archivable: finished.count)
            cell.onArchiveAll = { [weak self] in
                guard let self else { return }
                home.archive(home.finishedOn(id))
            }
        }
        let row = UICollectionView.CellRegistration<RowCell, Item> { [weak self] cell, _, item in
            guard let self, case let .row(id) = item, let entry = rows[id] else { return }
            let line = entry.line.line
            let session = line.row
            cell.configure(depth: line.depth, first: line.first, last: line.last, through: entry.through)
            cell.row.configure(SessionRowView.Content(
                id: session.id,
                place: session.cwd.isEmpty ? session.machineId : session.cwd,
                status: Self.status(session, home: home, done: entry.tab == .finished),
                title: home.fleetTitle(session),
                line: line.context ? "" : home.meta(session, tab: entry.tab, group: entry.group),
                trail: line.context ? "" : home.age(session, tab: entry.tab),
                fold: entry.line.fold,
                context: line.context,
                stale: !home.live,
                hover: session.id
            ))
            cell.row.count.onToggle = { [weak self] in self?.toggleTree(session.id) }
        }
        let more = UICollectionView.CellRegistration<MoreCell, Item> { [weak self] cell, _, item in
            guard let self, case let .more(id) = item, let more = groups[id]?.group.more else { return }
            cell.configure(words: more.words, failed: more.failed)
            cell.button.removeTarget(nil, action: nil, for: .allEvents)
            cell.button.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                let tab = home.tab
                // Showing the rest moves forward, back to the first few moves back.
                let all = !(home.shownWhole[tab] ?? []).contains(id)
                runRelay(all ? 1 : -1) { self.home.toggleWhole(id, in: tab) }
            }, for: .primaryActionTriggered)
        }
        let caw = UICollectionView.CellRegistration<CawCell, Item> { [weak self] cell, _, _ in
            cell.configure(line: self?.cawLine ?? "")
        }
        let recentHead = UICollectionView.CellRegistration<RecentHeadCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            cell.configure(count: recentAll.count, open: home.recentOpen)
        }
        let recentSearch = UICollectionView.CellRegistration<SearchCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            if cell.field.text != search {
                cell.field.text = search
            }
            cell.field.removeTarget(nil, action: nil, for: .editingChanged)
            cell.field.addAction(UIAction { [weak self, weak cell] _ in
                guard let self, let cell else { return }
                search = cell.field.text ?? ""
                recentShown = Self.recentPage
                requestRefresh()
            }, for: .editingChanged)
        }
        let recentRow = UICollectionView.CellRegistration<RecentRowCell, Item> { [weak self] cell, _, item in
            guard let self, case let .recent(id) = item, let recent = recentItems[id] else { return }
            cell.row.configure(SessionRowView.Content(
                id: recent.id,
                place: recent.markPlace,
                status: Self.status(recent.instance, home: home),
                title: recent.title,
                line: recent.place,
                trail: recent.at > 0 ? Naming.span(ms: home.now - recent.at) : "",
                stale: !home.live,
                hover: recent.instance?.id
            ))
        }
        let note = UICollectionView.CellRegistration<NoteCell, Item> { [weak self] cell, _, _ in
            cell.label.text = "No session matches “\(self?.search ?? "")”."
        }
        let showMore = UICollectionView.CellRegistration<ButtonCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            let left = recentMatches().count - recentShown
            cell.configure(title: "Show \(min(Self.recentPage, left)) more")
            cell.onTap = { [weak self] in
                guard let self else { return }
                recentShown += Self.recentPage
                requestRefresh()
            }
        }

        return UICollectionViewDiffableDataSource(collectionView: collectionView) { view, index, item in
            switch item {
            case .status: view.dequeueConfiguredReusableCell(using: status, for: index, item: item)
            case .usage: view.dequeueConfiguredReusableCell(using: usage, for: index, item: item)
            case .headline: view.dequeueConfiguredReusableCell(using: headline, for: index, item: item)
            case .need: view.dequeueConfiguredReusableCell(using: need, for: index, item: item)
            case .tabs: view.dequeueConfiguredReusableCell(using: tabs, for: index, item: item)
            case .machine: view.dequeueConfiguredReusableCell(using: machine, for: index, item: item)
            case .row: view.dequeueConfiguredReusableCell(using: row, for: index, item: item)
            case .more: view.dequeueConfiguredReusableCell(using: more, for: index, item: item)
            case .caw: view.dequeueConfiguredReusableCell(using: caw, for: index, item: item)
            case .recentHead: view.dequeueConfiguredReusableCell(using: recentHead, for: index, item: item)
            case .recentSearch: view.dequeueConfiguredReusableCell(using: recentSearch, for: index, item: item)
            case .recent: view.dequeueConfiguredReusableCell(using: recentRow, for: index, item: item)
            case .recentNone: view.dequeueConfiguredReusableCell(using: note, for: index, item: item)
            case .recentMore: view.dequeueConfiguredReusableCell(using: showMore, for: index, item: item)
            }
        }
    }

    // MARK: Updates

    override func refreshContent() {
        // A driven motion owns the list until it lands, and asks again then.
        guard dataSource != nil, !relay.running, !branch.running, swipe?.active != true, !flight.running else {
            return
        }
        commit(build(), animated: true)
    }

    /// The snapshot the model says now, and the lookups its cells read.
    private func build() -> NSDiffableDataSourceSnapshot<Section, Item> {
        var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
        let live = home.live
        let ready = home.ready
        let needList = home.needs

        spendWords = home.spendWords
        usageStrip = home.usage
        snapshot.appendSections([.top])
        // The phone has no rail: the rail's usage strip stands here, always (owner pick i).
        snapshot.appendItems([.status, .usage], toSection: .top)
        if ready, live, !needList.isEmpty {
            snapshot.appendItems([.headline], toSection: .top)
        }

        needs = Dictionary(uniqueKeysWithValues: needList.map { ($0.id, $0) })
        if !needList.isEmpty {
            snapshot.appendSections([.needs])
            snapshot.appendItems(needList.map { .need($0.id) }, toSection: .needs)
        }

        let board = home.board
        let working = board.working
        let finished = board.finished
        counts = (working.count, finished.count, finished.contains(where: \.isFailed))
        rows = [:]
        groups = [:]
        if !working.isEmpty || !finished.isEmpty {
            snapshot.appendSections([.work])
            var items: [Item] = [.tabs]
            var filledBefore = false
            for group in board.groups {
                let filled = !group.lines.isEmpty
                groups[group.machineId] = (group, filled && filledBefore)
                filledBefore = filledBefore || filled
                items.append(.machine(group.machineId))
                var lastAt: [Int: Bool] = [:]
                for line in group.lines {
                    let depth = line.line.depth
                    let through = depth > 1 ? (1 ..< depth).filter { lastAt[$0] == false } : []
                    lastAt[depth] = line.line.last
                    rows[line.id] = RowLine(line: line, tab: home.tab, group: group.machineId, through: through)
                    items.append(.row(line.id))
                }
                if group.more != nil {
                    items.append(.more(group.machineId))
                }
            }
            snapshot.appendItems(items, toSection: .work)
        }

        let recent = board.recent
        recentAll = recent
        if live, needList.isEmpty, working.isEmpty, finished.isEmpty, recent.isEmpty {
            // Caw only on a fleet with nothing in it yet, or while a machine has not answered.
            let waiting = home.waitingOn
            if let first = waiting.first {
                cawLine = waiting.count > 1
                    ? "Waiting for \(waiting.count) machines to answer."
                    : "Waiting for \(Naming.machineLabel(first.hostname)) to answer."
            } else {
                cawLine = "Your sessions will land here."
            }
            snapshot.appendSections([.caw])
            snapshot.appendItems([.caw], toSection: .caw)
        }

        recentItems = [:]
        if ready, !recent.isEmpty {
            snapshot.appendSections([.recent])
            var items: [Item] = [.recentHead]
            if home.recentOpen {
                items.append(.recentSearch)
                let matches = recentMatches()
                for item in matches.prefix(recentShown) {
                    recentItems[item.id] = item
                    items.append(.recent(item.id))
                }
                if matches.isEmpty {
                    items.append(.recentNone)
                } else if matches.count > recentShown {
                    items.append(.recentMore)
                }
            }
            snapshot.appendItems(items, toSection: .recent)
        }
        return snapshot
    }

    /// What the last update listed in Recent, narrowed by the search.
    private func recentMatches() -> [HomeModel.RecentItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else {
            return recentAll
        }
        return recentAll.filter { $0.title.lowercased().contains(needle) || $0.place.lowercased().contains(needle) }
    }

    /// Applies `next`, the lines that stay reconfigured in place (their cells
    /// keep their identity). A live change that moves lines travels
    /// (`Reflow.travel`); a driven motion applies its own unanimated.
    private func commit(_ next: NSDiffableDataSourceSnapshot<Section, Item>, animated: Bool) {
        // A row under the finger holds the board still: applying now would
        // move or reconfigure the cell mid-touch, the collection view would
        // cancel the touch, and the tap would never select. The latest
        // snapshot waits and lands once the finger lifts (HeldOrder: "held
        // still while they settle or are touched").
        if pressed {
            pending = (next, animated)
            return
        }
        var next = next
        let old = dataSource.snapshot()
        let before = Set(old.itemIdentifiers)
        let after = next.itemIdentifiers
        next.reconfigureItems(after.filter { before.contains($0) })
        let moved = old.itemIdentifiers.filter { after.contains($0) } != after.filter { before.contains($0) }
        let structural = moved || before.count != after.count || !after.allSatisfy(before.contains)
        if !animated || !structural || old.numberOfItems == 0 {
            dataSource.apply(next, animatingDifferences: false)
        } else {
            Reflow.travel(in: collectionView) { self.dataSource.apply(next, animatingDifferences: true) }
        }
    }

    // MARK: Actions

    /// A tab switch (WorkTabs.svelte `choose`): the folder sheet has already
    /// wiped across (FolderTabs), and only the rows relay (Relay.swift), old
    /// lines leaving toward the side the choice moved away from and new ones
    /// arriving from the other. Everything above the rows stays where it is.
    private func choose(_ tab: HomeModel.Tab) {
        // A swipe in flight is retargeted from where it is, never restarted.
        if swipe.active {
            swipe.retarget(swiping.map { $0.to == tab ? swipe.side : 0 } ?? 0)
            return
        }
        guard tab != home.tab else {
            return
        }
        runRelay(tab == .finished ? 1 : -1, { self.home.tab = tab }, landed: { [weak self] in
            self?.onSelectTab(tab)
        })
    }

    /// Shows `tab` at once, with no relay: a choice made elsewhere (the
    /// sidebar, a restored window).
    func show(_ tab: HomeModel.Tab) {
        guard tab != home.tab else {
            return
        }
        relay.end()
        home.tab = tab
        requestRefresh()
    }

    /// Changes what the work list shows as one relay; with Reduce Motion the
    /// new list fades in over the old.
    private func runRelay(_ direction: Double, _ change: @escaping () -> Void, landed: @escaping () -> Void = {}) {
        branch.end()
        relay.end()
        flight.stop()
        guard !UIAccessibility.isReduceMotionEnabled else {
            // Less motion: the new list cross-fades over the old, nothing travels.
            let old = collectionView.snapshotView(afterScreenUpdates: false)
            change()
            commit(build(), animated: false)
            if let old {
                old.frame = collectionView.frame
                view.addSubview(old)
                fadeAway(old)
            }
            landed()
            return
        }
        relay.run(on: self, direction: direction, change: {
            change()
            commit(build(), animated: false)
        }, done: { [weak self] in
            self?.requestRefresh()
            landed()
        })
    }

    // MARK: RelayHost

    func workLines() -> RelayLines {
        var lines = RelayLines()
        let snapshot = dataSource.snapshot()
        guard snapshot.sectionIdentifiers.contains(.work) else {
            return lines
        }
        let frames = layout.frames(in: collectionView)
        var group: (id: String, rows: [String])?
        func close() {
            guard let open = group else {
                return
            }
            lines.groups.append(RelayPlan.Group(
                id: open.id,
                rows: open.rows,
                more: groups[open.id]?.group.more?.words,
                order: home.machineOrder(open.id)
            ))
            group = nil
        }
        for item in snapshot.itemIdentifiers(inSection: .work) {
            guard let key = item.relayKey, let indexPath = dataSource.indexPath(for: item) else {
                continue
            }
            lines.frames[key] = frames[indexPath]
            if let cell = collectionView.cellForItem(at: indexPath) {
                lines.cells[key] = cell
            }
            switch item {
            case let .machine(id):
                close()
                group = (id, [])
            case let .row(id):
                group?.rows.append(id)
            default:
                break
            }
        }
        close()
        return lines
    }

    func place(at indexPath: IndexPath) -> RelayPlace {
        guard let item = dataSource.itemIdentifier(for: indexPath) else {
            return .none
        }
        switch item {
        case let .machine(id): return .line(key: RelayPlan.head(id), group: id)
        case let .row(id): return .line(key: id, group: rows[id]?.group ?? "")
        case let .more(id): return .line(key: RelayPlan.more(id), group: id)
        case .caw, .recentHead, .recentSearch, .recent, .recentNone, .recentMore: return .tail
        case .status, .usage, .headline, .need, .tabs: return .none
        }
    }

    // MARK: A tree's fold

    /// Opens or folds a tree (Branch.swift): opening, the new rows are laid
    /// out at once and uncovered as the line reaches them; folding, they
    /// close away and the list takes the change once they have gone.
    private func toggleTree(_ id: String) {
        relay.end()
        branch.end()
        let opening = !home.openTrees.contains(id)
        let frames = layout.frames(in: collectionView)
        guard let parent = rows[id], let parentPath = dataSource.indexPath(for: .row(id)), let parentFrame = frames[parentPath] else {
            home.toggleTree(id)
            return
        }
        let held = rows
        let folding = held.keys.filter { isUnder(held[$0]?.line.line, id, in: held) }
        home.toggleTree(id)
        let next = build()
        if opening {
            commit(next, animated: false)
            collectionView.layoutIfNeeded()
            let laid = layout.frames(in: collectionView)
            let tree = rows.keys.filter { isUnder(rows[$0]?.line.line, id, in: rows) }
            branch.run(on: self, parent: parentFrame, parentDepth: parent.line.line.depth, rows: branchRows(tree, in: rows, frames: laid), opening: true) { [weak self] in
                self?.requestRefresh()
            }
        } else {
            // The leaving rows stay drawn, and their lines read, until they have gone.
            rows = held.merging(rows) { _, new in new }
            var now = dataSource.snapshot()
            now.reconfigureItems([.row(id)])
            dataSource.apply(now, animatingDifferences: false)
            branch.run(on: self, parent: parentFrame, parentDepth: parent.line.line.depth, rows: branchRows(folding, in: held, frames: frames), opening: false) { [weak self] in
                guard let self else { return }
                commit(build(), animated: false)
                requestRefresh()
            }
        }
    }

    private func isUnder(_ line: TreeLine<InstanceRow>?, _ parent: String, in rows: [String: RowLine]) -> Bool {
        var at = line?.parent
        while let id = at {
            if id == parent {
                return true
            }
            at = rows[id]?.line.line.parent
        }
        return false
    }

    /// A tree's rows as the fold reads them, top down.
    private func branchRows(_ ids: [String], in rows: [String: RowLine], frames: [IndexPath: CGRect]) -> [BranchRow] {
        var out: [BranchRow] = []
        for id in ids {
            guard let entry = rows[id], let indexPath = dataSource.indexPath(for: .row(id)), let frame = frames[indexPath] else {
                continue
            }
            let line = entry.line.line
            var through: [(depth: Int, list: String?)] = []
            for depth in entry.through {
                // The row whose siblings a rail at `depth` joins: the parent of this row's ancestor at that depth.
                var at = id
                while let row = rows[at], row.line.line.depth > depth, let up = row.line.line.parent {
                    at = up
                }
                through.append((depth, rows[at]?.line.line.parent))
            }
            out.append(BranchRow(
                id: id,
                indexPath: indexPath,
                frame: frame,
                depth: line.depth,
                first: line.first,
                last: line.last,
                parent: line.parent,
                through: through
            ))
        }
        return out.sorted { $0.frame.minY < $1.frame.minY }
    }

    /// Every window, in the house bottom sheet.
    private func openUsage() {
        let limits = UsageSheetController(home: home)
        limits.loadViewIfNeeded()
        present(HouseSheetController(limits, title: "Usage limits", scroller: limits.scroll), animated: true)
    }

    // The finger on the list holds its order (holdWhileInside): no row moves from under it.
    func scrollViewWillBeginDragging(_: UIScrollView) {
        home.holding = true
    }

    func scrollViewDidEndDragging(_: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate {
            home.holding = false
        }
    }

    func scrollViewDidEndDecelerating(_: UIScrollView) {
        home.holding = false
    }

    func collectionView(_: UICollectionView, didHighlightItemAt _: IndexPath) {
        pressed = true
        home.holding = true
    }

    /// The finger lifted: the selection lands on the row it was on (UIKit
    /// selects right after this), then the board catches up on the next turn.
    func collectionView(_ collectionView: UICollectionView, didUnhighlightItemAt _: IndexPath) {
        pressed = false
        if !collectionView.isDragging, !collectionView.isDecelerating { home.holding = false }
        DispatchQueue.main.async { [weak self] in
            guard let self, !pressed, let waiting = pending else { return }
            pending = nil
            commit(waiting.snapshot, animated: waiting.animated)
        }
    }

    func collectionView(_: UICollectionView, shouldSelectItemAt indexPath: IndexPath) -> Bool {
        switch dataSource.itemIdentifier(for: indexPath) {
        case .row, .recent, .need, .recentHead: true
        default: false
        }
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: false)
        switch dataSource.itemIdentifier(for: indexPath) {
        case .recentHead: home.recentOpen.toggle()
        case let .row(id): onOpen(id)
        case let .recent(id): onOpen(id)
        case let .need(id):
            if let need = needs[id] {
                switch need.kind {
                case let .ask(ask): onOpen(ask.instanceId)
                case let .run(run): onOpen(run.rowId)
                }
            }
        default: break
        }
    }

    // MARK: Status

    /// A session's status, one rule for every row that draws its mark
    /// (SessionMark.svelte `sessionStatus`); `done`: the row is listed as finished.
    static func status(_ row: InstanceRow?, home: HomeModel, done: Bool = false) -> MarkStatus {
        guard let row else {
            return .idle
        }
        if row.isFailed {
            return .fail
        }
        if row.isStale || row.status == .sleeping {
            return .idle
        }
        if row.status == .stopped {
            return done ? .done : .idle
        }
        switch home.activity(row.id) {
        case .blocked: return .attn
        case .working: return .live
        case .idle: return done ? .done : .idle
        }
    }
}

// MARK: The swipe between Working and Finished

/// The swipe moves the list region under the tab row (TabSwipe): the list
/// there now drags off and the other tab's drags on beside it, in lockstep
/// under the finger, while the status line, usage strip, needs cards and tab
/// row stay where they are and the tab strip's sheet follows the finger.
/// The neighbour comes on with its machines and what is under the list, its
/// rows not yet there; once it lands they fly in, staggered, from the side
/// it came from (list-swap's numbers, Relay.swift).
extension HomeViewController: TabSwipeHost {
    private func tab(on side: Int, of tab: HomeModel.Tab) -> HomeModel.Tab? {
        switch (tab, side) {
        case (.working, 1): .finished
        case (.finished, -1): .working
        default: nil
        }
    }

    private var tabsCell: TabsCell? {
        dataSource.indexPath(for: .tabs).flatMap { collectionView.cellForItem(at: $0) as? TabsCell }
    }

    func swipeHasTab(_ side: Int) -> Bool {
        tab(on: side, of: swiping?.from ?? home.tab) != nil
    }

    func swipeMayBegin(at point: CGPoint, side: Int) -> Bool {
        if swipe.active {
            return true
        }
        guard !branch.running, let tabs = tabsCell else {
            return false
        }
        // The region under the tab row: never the chrome above it.
        guard point.y >= tabs.convert(tabs.bounds, to: view).maxY else {
            return false
        }
        // A finished row's own swipe to archive goes the same way past the last tab.
        let inList = view.convert(point, to: collectionView)
        if tab(on: side, of: home.tab) == nil, let indexPath = collectionView.indexPathForItem(at: inList),
           archiveSwipe(at: indexPath) != nil {
            return false
        }
        return true
    }

    func swipeOpen(_ side: Int) {
        relay.end()
        flight.stop()
        let from = home.tab
        guard let to = tab(on: side, of: from), let tabs = tabsCell else {
            return
        }
        swiping = (from, to)
        let top = max(0, tabs.convert(tabs.bounds, to: view).maxY)
        let region = CGRect(x: 0, y: top, width: view.bounds.width, height: max(0, view.bounds.height - top))
        let leaving = view.resizableSnapshotView(from: region, afterScreenUpdates: false, withCapInsets: .zero) ?? UIView()

        // The other tab's list, laid out where this one stands.
        let resting = collectionView.contentOffset
        home.tab = to
        commit(build(), animated: false)
        collectionView.layoutIfNeeded()
        hold(resting)
        let arriving = UIView(frame: CGRect(origin: .zero, size: region.size))
        arriving.backgroundColor = variant.ground
        for cell in collectionView.visibleCells {
            guard let indexPath = collectionView.indexPath(for: cell), let item = dataSource.itemIdentifier(for: indexPath) else {
                continue
            }
            let frame = cell.convert(cell.bounds, to: view)
            guard frame.maxY > region.minY, frame.minY < region.maxY, underTabs(indexPath),
                  !Self.flies(item), let shot = cell.snapshotView(afterScreenUpdates: true)
            else {
                continue
            }
            shot.frame = frame.offsetBy(dx: 0, dy: -region.minY)
            arriving.addSubview(shot)
        }
        let cover = UIView(frame: region)
        cover.clipsToBounds = true
        cover.backgroundColor = variant.ground
        cover.isUserInteractionEnabled = false
        cover.addSubview(leaving)
        cover.addSubview(arriving)
        leaving.frame.origin = .zero
        arriving.frame.origin.x = Double(side) * region.width
        view.addSubview(cover)
        self.cover = cover
        leavingPane = leaving
        arrivingPane = arriving
        tabs.scrub(from: from, to: to, progress: 0)
    }

    func swipeDraw(offset: Double, side: Int, progress: Double) {
        guard let cover, let swiping else {
            // Past the edge with no tab there: the region under the tab row
            // gives a little, banded, and nothing above it moves.
            for cell in collectionView.visibleCells {
                guard let indexPath = collectionView.indexPath(for: cell), underTabs(indexPath) else { continue }
                cell.transform = offset == 0 ? .identity : CGAffineTransform(translationX: offset, y: 0)
            }
            return
        }
        leavingPane?.frame.origin.x = offset
        arrivingPane?.frame.origin.x = Double(side) * cover.bounds.width + offset
        tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: progress)
    }

    func swipeLanded(_ side: Int) {
        guard let swiping else {
            return
        }
        tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: 1)
        if UIAccessibility.isReduceMotionEnabled, let cover {
            // Less motion: the old list cross-fades into the new, nothing travels.
            arrivingPane?.removeFromSuperview()
            leavingPane?.frame.origin.x = 0
            self.cover = nil
            fadeAway(cover)
            close()
            requestRefresh()
        } else {
            close()
            flyIn(from: side)
        }
        onSelectTab(swiping.to)
    }

    /// Whether a line stands under the tab row (the swipe's region).
    private func underTabs(_ indexPath: IndexPath) -> Bool {
        if case .none = place(at: indexPath) {
            return false
        }
        return true
    }

    func swipeReturned(_: Int) {
        guard let swiping else {
            return
        }
        home.tab = swiping.from
        commit(build(), animated: false)
        collectionView.layoutIfNeeded()
        tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: 0)
        close()
        requestRefresh()
    }

    private func close() {
        swiping = nil
        cover?.removeFromSuperview()
        cover = nil
        leavingPane = nil
        arrivingPane = nil
        letGoOfOffset()
    }

    /// Keeps the list where it stood when a shorter one takes its place, so
    /// the tab row does not jump while the panes are open.
    private func hold(_ offset: CGPoint) {
        let room = collectionView.contentSize.height + collectionView.adjustedContentInset.top
            + collectionView.adjustedContentInset.bottom - collectionView.bounds.height
        let short = offset.y - (room - collectionView.adjustedContentInset.top)
        if short > 0 {
            heldInset += short
            collectionView.contentInset.bottom += short
        }
        collectionView.contentOffset = offset
    }

    /// Hands the held room back: a shorter list glides up into place.
    private func letGoOfOffset() {
        guard heldInset > 0 else {
            return
        }
        let held = heldInset
        heldInset = 0
        Motion.easeDrawer.animator(Motion.durPanel) {
            self.collectionView.contentInset.bottom -= held
        }.startAnimation()
    }

    /// The lines that fly in once a swipe lands: the rows and their "N more".
    private static func flies(_ item: Item) -> Bool {
        switch item {
        case .row, .more: true
        default: false
        }
    }

    /// The landed list's rows come in top down from the side the list came
    /// from: 18pt and a fade over 300 ms on the out curve, 40 ms apart, the
    /// stagger capped at 9 (RelayPlan, list-swap.svelte.ts).
    private func flyIn(from side: Int) {
        collectionView.layoutIfNeeded()
        let frames = layout.frames(in: collectionView)
        var order: [IndexPath: Int] = [:]
        let lines = frames.filter { indexPath, _ in dataSource.itemIdentifier(for: indexPath).map(Self.flies) ?? false }
        for (i, line) in lines.sorted(by: { $0.value.minY < $1.value.minY }).enumerated() {
            order[line.key] = i
        }
        guard let last = order.values.max() else {
            requestRefresh()
            return
        }
        let travel = Double(side) * RelayPlan.travel
        let total = Double(min(last, RelayPlan.staggerCap)) * RelayPlan.inStagger + RelayPlan.inMs
        var now = 0.0
        let adjust: (IndexPath) -> Adjust? = { indexPath in
            guard let i = order[indexPath] else { return nil }
            let p = Motion.easeOut.value(at: (now - Double(min(i, RelayPlan.staggerCap)) * RelayPlan.inStagger) / RelayPlan.inMs)
            return Adjust(dx: travel * (1 - p), alpha: p)
        }
        layout.reach = RelayPlan.travel
        layout.adjust = adjust
        flight.run { [weak self] t in
            guard let self else { return false }
            now = t
            guard t < total else {
                layout.adjust = nil
                collectionView.settleFrame()
                requestRefresh()
                return false
            }
            collectionView.drawFrame(adjust, frames: frames)
            return true
        }
    }

    /// A view laid over the list fades away over `durControl`, then goes.
    func fadeAway(_ cover: UIView) {
        cover.isUserInteractionEnabled = false
        let fade = Motion.easeOut.animator(Motion.durControl) { cover.alpha = 0 }
        fade.addCompletion { _ in cover.removeFromSuperview() }
        fade.startAnimation()
    }
}

/// The board's list. Its own scroll pan never starts on a mostly sideways
/// drag: that drag is the tab swipe's (TabSwipe), so vertical scrolling
/// stays immediate and a sideways one never nudges the page.
final class BoardList: UICollectionView {
    override func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        if recognizer === panGestureRecognizer {
            let v = panGestureRecognizer.velocity(in: self)
            if abs(v.y) <= abs(v.x) * TabSwipe.slope {
                return false
            }
        }
        return super.gestureRecognizerShouldBegin(recognizer)
    }
}

private extension HomeViewController.Item {
    /// A work line's key in the relay: a machine's header, a row, a "more".
    var relayKey: String? {
        switch self {
        case let .machine(id): RelayPlan.head(id)
        case let .row(id): id
        case let .more(id): RelayPlan.more(id)
        default: nil
        }
    }
}
