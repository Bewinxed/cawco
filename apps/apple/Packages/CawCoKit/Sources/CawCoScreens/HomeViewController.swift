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
    var collectionView: UICollectionView!
    private(set) lazy var layout = makeLayout()
    private var dataSource: UICollectionViewDiffableDataSource<Section, Item>!

    // What the last update drew, for the cells to read.
    private var needs: [String: HomeModel.NeedsItem] = [:]
    private var rows: [String: RowLine] = [:]
    private var groups: [String: (group: HomeModel.MachineGroup, seam: Bool)] = [:]
    private var recentItems: [String: HomeModel.RecentItem] = [:]
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

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        self.home = home
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HomeViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = Palette.surfaceRecess
        collectionView.delegate = self
        collectionView.keyboardDismissMode = .onDrag
        view.addSubview(collectionView)
        dataSource = makeDataSource()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        navigationController?.setToolbarHidden(true, animated: animated)
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
            cell.configure(usageStrip ?? home.usage)
            cell.onOpen = { [weak self] in self?.openUsage() }
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
                stale: !home.live
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
            cell.configure(count: home.recent.count, open: home.recentOpen)
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
                id: recent.markId,
                place: recent.markPlace,
                status: Self.status(recent.instance, home: home),
                title: recent.title,
                line: recent.place,
                trail: recent.at > 0 ? Naming.span(ms: home.now - recent.at) : "",
                stale: !home.live
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
        guard dataSource != nil, !relay.running, !branch.running else {
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

        let working = home.rows(.working)
        let finished = home.rows(.finished)
        counts = (working.count, finished.count, finished.contains(where: \.isFailed))
        rows = [:]
        groups = [:]
        if !working.isEmpty || !finished.isEmpty {
            snapshot.appendSections([.work])
            var items: [Item] = [.tabs]
            var filledBefore = false
            for group in home.groups(home.tab) {
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

        let recent = home.recent
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
                let matches = recentMatches(recent)
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

    private func recentMatches(_ recent: [HomeModel.RecentItem]? = nil) -> [HomeModel.RecentItem] {
        let all = recent ?? home.recent
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else {
            return all
        }
        return all.filter { $0.title.lowercased().contains(needle) || $0.place.lowercased().contains(needle) }
    }

    /// Applies `next`, the lines that stay reconfigured in place (their cells
    /// keep their identity). A live change that moves lines travels
    /// (`Reflow.travel`); a driven motion applies its own unanimated.
    private func commit(_ next: NSDiffableDataSourceSnapshot<Section, Item>, animated: Bool) {
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

    /// A tab switch: the relay (Relay.swift), old lines leaving toward the
    /// side the choice moved away from and new ones arriving from the other.
    private func choose(_ tab: HomeModel.Tab) {
        guard tab != home.tab else {
            return
        }
        runRelay(tab == .finished ? 1 : -1) { self.home.tab = tab }
    }

    /// Changes what the work list shows as one relay; with Reduce Motion the
    /// new list fades in over the old.
    private func runRelay(_ direction: Double, _ change: @escaping () -> Void) {
        branch.end()
        relay.end()
        guard !UIAccessibility.isReduceMotionEnabled else {
            change()
            return
        }
        relay.run(on: self, direction: direction, change: {
            change()
            commit(build(), animated: false)
        }, done: { [weak self] in
            self?.requestRefresh()
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
        let sheet = UINavigationController(rootViewController: UsageSheetController(home: home))
        sheet.sheetPresentationController?.detents = [.medium(), .large()]
        sheet.sheetPresentationController?.prefersGrabberVisible = true
        present(sheet, animated: true)
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
            if let need = needs[id], case let .ask(ask) = need.kind { onOpen(ask.instanceId) }
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
