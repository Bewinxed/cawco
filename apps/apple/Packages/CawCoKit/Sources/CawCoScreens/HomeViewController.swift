import CawCoCore
import CawCoDesign
import CawCoMascot
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
    /// The snapshot's tab, which can preview a neighbour without committing
    /// the shared model while a finger still owns the transition.
    private var drawnTab: HomeModel.Tab
    var onOpen: (String) -> Void = { _ in }
    var onSelectTab: (HomeModel.Tab) -> Void = { _ in }
    /// Opens the Usage page from the strip's corner link.
    var onUsagePage: (() -> Void)?
    /// What a row's session menu does through the shell (LiveSessionMenu, StoredSessionMenu).
    var sessionMenus: (() -> SessionMenuContext?)?
    /// Set on the page (not the rail's copy): its dock's Start session.
    var onStart: (() -> Void)?
    var collectionView: UICollectionView!
    private(set) lazy var layout = makeLayout()
    private var dataSource: UICollectionViewDiffableDataSource<Section, Item>!

    // What the last update drew, for the cells to read.
    private var needs: [String: HomeModel.NeedsItem] = [:]
    private var rows: [String: RowLine] = [:]
    /// Each echoing row's place among the list's echoes (motion/echo): they beat top to bottom.
    private var echoing: [String: Int] = [:]
    private var groups: [String: (group: HomeModel.MachineGroup, seam: Bool)] = [:]
    private var recentItems: [String: HomeModel.RecentItem] = [:]
    /// Everything Recent lists, before the search narrows it.
    private var recentAll: [HomeModel.RecentItem] = []
    /// A cell is under the finger; `pending` is the snapshot waiting for it to lift.
    private var pressed = false
    private var pending: (snapshot: NSDiffableDataSourceSnapshot<Section, Item>, animated: Bool)?
    /// A rows pass came while a finger was down; it runs once the finger lifts.
    private var rowsWaiting = false
    /// The board `refreshContent` read, for `drawContent` to apply.
    private var built: NSDiffableDataSourceSnapshot<Section, Item>?
    /// What each item last drew, and the count of board reads the items that
    /// draw only what `build()` read are stamped with.
    private var prints = RowPrints<Item>()
    private var contentRevision = 0
    private var counts = (working: 0, finished: 0, finishedFailed: false)
    private var cawLine = ""
    /// Nothing is going on, so he sleeps; while a machine is awaited he is awake.
    private var cawStatus = CawStatus.sleeping
    /// Read in `build()`, so a change to it alone runs the update again.
    private var usageStrip: Usage.Strip?

    // The view's own state.
    private var search = ""
    private var recentShown = HomeViewController.recentPage
    /// The driven motions: a tab switch or "N more" (the relay), a tree's fold.
    /// While one runs, the list waits for it before it takes the next change.
    private let relay = RelayMotion()
    private let branch = BranchMotion()
    /// The swipe between Working and Finished, and what it has open.
    private var paging: PagingScrollView!
    private var swiping: (from: HomeModel.Tab, to: HomeModel.Tab)?
    /// The tab whose rows already started flying in, decided before the page settles.
    private var arrivedTab: HomeModel.Tab?
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

    /// How far under 260pt the rail is, 0 to 33 (WorkTabs.svelte `--tight`):
    /// the tabs' spacing gives that room back. None on the page.
    private var tight: Double {
        variant == .rail && isViewLoaded ? min(33, max(0, 260 - view.bounds.width)) : 0
    }

    /// The width the tabs were last tightened for.
    private var tightenedAt = -1.0

    init(hub: HubConnection, home: HomeModel, variant: Variant) {
        self.hub = hub
        self.home = home
        drawnTab = home.tab
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
        collectionView.autoresizingMask = [.flexibleWidth]
        collectionView.backgroundColor = variant.ground
        collectionView.delegate = self
        collectionView.keyboardDismissMode = .onDrag
        paging = PagingScrollView()
        paging.traceName = "home"
        paging.frame = view.bounds
        paging.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        paging.backgroundColor = variant.ground
        view.addSubview(paging)
        paging.addSubview(collectionView)
        paging.mayBegin = { [weak self] point in
            guard let self, !branch.running, let tabs = tabsCell else { return false }
            return paging.convert(point, to: view).y >= tabs.convert(tabs.bounds, to: view).maxY
        }
        paging.onBegin = { [weak self] in self?.preparePages() }
        paging.onScroll = { [weak self] position in self?.drawPagingChrome(position) }
        paging.onTarget = { [weak self] page in self?.arrive(at: page) }
        paging.onLand = { [weak self] page in self?.finishPaging(page) }
        // The list ends at the view's foot, or at a docked keyboard's top while it
        // is up: the search field and its results stay above it and scroll to the
        // last. Sized by frame: the rail lays this view out by its own constraints.
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        dataSource = makeDataSource()
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

    /// A docked keyboard's frame on the screen, while one is up.
    private var keyboard: CGRect?
    /// The list's height when the search row was last brought up.
    private var searchedAt = 0.0

    @objc private func keyboardMoved(_ note: Notification) {
        let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        let time = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
        // Docked means it reaches the screen's foot; a floating keyboard covers nothing to make room for.
        let screen = view.window?.screen.bounds ?? .zero
        keyboard = end.flatMap { $0.height > 0 && $0.maxY >= screen.maxY - 1 && $0.minY < screen.maxY ? $0 : nil }
        view.setNeedsLayout()
        UIView.animate(withDuration: time) { self.view.layoutIfNeeded() }
    }

    /// While the search field has the keyboard, its row stands at the top of
    /// what the keyboard leaves, with its results under it.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        paging.configure(count: 2, selected: home.tab == .working ? 0 : 1)
        var tall = view.bounds.height
        if let keyboard, let window = view.window {
            let top = view.convert(window.convert(keyboard, from: window.screen.coordinateSpace), from: window).minY
            tall = max(0, min(tall, top))
        }
        if collectionView.frame.height != tall || collectionView.frame.width != view.bounds.width {
            collectionView.frame = CGRect(x: paging.contentOffset.x, y: 0, width: view.bounds.width, height: tall)
        }
        // The rail's grip moved: the tabs tighten or loosen with its width.
        if tight != tightenedAt {
            tightenedAt = tight
            for case let cell as TabsCell in collectionView.visibleCells { cell.tight = tight }
        }
        guard tall != searchedAt else { return }
        searchedAt = tall
        raiseSearch()
    }

    private func raiseSearch() {
        guard let at = dataSource?.indexPath(for: .recentSearch),
              let cell = collectionView.cellForItem(at: at) as? SearchCell, cell.field.isFirstResponder
        else { return }
        collectionView.scrollToItem(at: at, at: .top, animated: true)
    }

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
            let snapshot = self?.dataSource?.snapshot()
            let sections = snapshot?.sectionIdentifiers ?? []
            let first = sections.first { $0 != .top }
            let metrics = self?.metrics ?? .page
            guard section == .work, let self else {
                let empty = snapshot.map { $0.indexOfSection(section) != nil && $0.numberOfItems(inSection: section) == 0 } ?? false
                return Self.section(section, firstGroup: section == first, last: section == sections.last, metrics: metrics, empty: empty)
            }
            // The work rows are a list, so a finished row swipes away to archive.
            var list = UICollectionLayoutListConfiguration(appearance: .plain)
            list.showsSeparators = false
            list.backgroundColor = .clear
            list.trailingSwipeActionsConfigurationProvider = { [weak self] indexPath in
                self?.archiveSwipe(at: indexPath)
            }
            let layout = NSCollectionLayoutSection.list(using: list, layoutEnvironment: environment)
            // The rail's home ends with its work list: the groups' foot is under it there.
            layout.contentInsets = NSDirectionalEdgeInsets(
                top: section == first ? metrics.first : metrics.gap, leading: metrics.side,
                bottom: sections.last == .work ? metrics.foot : 0, trailing: metrics.side
            )
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
    private static func section(_ section: Section, firstGroup: Bool, last: Bool, metrics: Metrics, empty: Bool) -> NSCollectionLayoutSection {
        let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
        let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [NSCollectionLayoutItem(layoutSize: size)])
        let layout = NSCollectionLayoutSection(group: group)
        let side = metrics.side
        let above = firstGroup ? metrics.first : metrics.gap
        switch section {
        case .top:
            layout.interGroupSpacing = Space.space2
            // With nothing in it the block takes no room (Home.svelte `.top.bare`).
            layout.contentInsets = empty ? .zero : metrics.top
        case .needs:
            layout.interGroupSpacing = Space.space2
            layout.contentInsets = NSDirectionalEdgeInsets(top: above, leading: side, bottom: 0, trailing: side)
        case .work, .caw:
            // The groups' foot is under whichever group is last (`.groups` padding).
            layout.contentInsets = NSDirectionalEdgeInsets(top: above, leading: side, bottom: last ? metrics.foot : 0, trailing: side)
        case .recent:
            layout.interGroupSpacing = 2
            layout.contentInsets = NSDirectionalEdgeInsets(top: above, leading: side, bottom: metrics.foot, trailing: side)
        }
        return layout
    }

    /// Home.svelte's spacing, by where the home stands: `.page .top` and
    /// `.page .groups` (18 18 11; 7 18 25, groups 18 apart), or `.rail .top`
    /// and `.rail .groups` (7 11 4; 4 7 7, groups 11 apart).
    struct Metrics {
        let top: NSDirectionalEdgeInsets
        /// The groups' inline padding.
        let side: Double
        /// Above the first group, and between groups.
        let first: Double
        let gap: Double
        /// Under the last group.
        let foot: Double

        static let page = Metrics(
            top: NSDirectionalEdgeInsets(top: Space.space5, leading: Space.space5, bottom: Space.space3, trailing: Space.space5),
            side: Space.space5, first: Space.space2, gap: Space.space5, foot: Space.space7
        )
        static let rail = Metrics(
            top: NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space1, trailing: Space.space3),
            side: Space.space2, first: Space.space1, gap: Space.space3, foot: Space.space2
        )
    }

    private var metrics: Metrics { variant == .rail ? .rail : .page }

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
            cell.line.configure(hub: hub, ready: home.ready)
        }
        let headline = UICollectionView.CellRegistration<HeadlineCell, Item> { [weak self] cell, _, _ in
            cell.rail = self?.variant == .rail
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
            cell.onPeek = { [weak self] in
                guard let self, case let .ask(ask) = need.kind else { return }
                Peek.show(PeekTarget(viewId: ask.instanceId, title: need.title), hub: hub, home: home, from: self, open: onOpen)
            }
        }
        let tabs = UICollectionView.CellRegistration<TabsCell, Item> { [weak self] cell, _, _ in
            guard let self else { return }
            cell.tight = tight
            cell.configure(tab: drawnTab, working: counts.working, finished: counts.finished, finishedFailed: counts.finishedFailed, delegatesOn: home.delegates)
            cell.onTab = { [weak self] tab in self?.choose(tab) }
            cell.onDelegates = { [weak self] in
                guard let self else { return }
                home.delegates.toggle()
            }
        }
        let machine = UICollectionView.CellRegistration<MachineCell, Item> { [weak self] cell, _, item in
            guard let self, case let .machine(id) = item, let entry = groups[id] else { return }
            let finished = drawnTab == .finished ? home.finishedOn(id) : []
            cell.configure(entry.group, seam: entry.seam, archivable: finished.count)
            cell.onArchiveAll = { [weak self] in
                guard let self else { return }
                home.archive(home.finishedOn(id))
            }
        }
        let row = UICollectionView.CellRegistration<RowCell, Item> { [weak self] cell, _, item in
            guard let self, case let .row(id) = item, let entry = rows[id], let content = rowContent(id) else { return }
            let line = entry.line.line
            cell.configure(depth: line.depth, first: line.first, last: line.last, through: entry.through)
            cell.row.mark.onToggle = { [weak self] in self?.toggleTree(id) }
            cell.row.configure(content)
            // LiveSessionMenu, read from the fleet as it opens; a workflow run takes no session commands.
            cell.row.menu = { [weak self] copy in
                guard let self, let context = sessionMenus?(), BoardRun.runId(of: id) == nil, let now = hub.fleet.byId[id] else { return nil }
                let archive: (() -> Void)? = content.archives ? { [weak self] in
                    guard let self else { return }
                    home.archive(home.treeOf(id))
                } : nil
                return SessionMenus.live(now, context: context, onArchive: archive, copy: copy)
            }
            cell.actions.configure(title: content.title, peeks: content.peek != nil, archives: content.archives)
            cell.actions.onPeek = { [weak self] in self?.peek(content) }
            cell.actions.onArchive = { [weak self] in
                guard let self else { return }
                home.archive(home.treeOf(id))
            }
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
            cell.side = self?.variant == .rail ? 112 : Self.cawSide
            cell.configure(line: self?.cawLine ?? "", status: self?.cawStatus ?? .sleeping)
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
            cell.field.removeTarget(nil, action: nil, for: [.editingChanged, .editingDidBegin])
            cell.field.addAction(UIAction { [weak self] _ in self?.raiseSearch() }, for: .editingDidBegin)
            cell.field.addAction(UIAction { [weak self, weak cell] _ in
                guard let self, let cell else { return }
                search = cell.field.text ?? ""
                recentShown = Self.recentPage
                requestRefresh()
            }, for: .editingChanged)
        }
        let recentRow = UICollectionView.CellRegistration<RecentRowCell, Item> { [weak self] cell, _, item in
            guard let self, case let .recent(id) = item, let content = recentContent(id) else { return }
            cell.row.configure(content)
            cell.actions.configure(title: content.title, peeks: content.peek != nil, archives: false)
            cell.actions.onPeek = { [weak self] in self?.peek(content) }
            // LiveSessionMenu for a session the hub holds, StoredSessionMenu for a stored transcript.
            cell.row.menu = { [weak self] copy in
                guard let self, let context = sessionMenus?(), let recent = recentItems[id] else { return nil }
                if let held = recent.instance {
                    guard BoardRun.runId(of: held.id) == nil, let now = hub.fleet.byId[held.id] else { return nil }
                    return SessionMenus.live(now, context: context, copy: copy)
                }
                let fleet = hub.fleet
                guard let info = fleet.catalog(recent.machineId).first(where: {
                    fleet.conversationId(sessionKey: $0.sessionId, machineId: recent.machineId, cwd: $0.cwd) == id
                }) else { return nil }
                return SessionMenus.stored(machineId: recent.machineId, info: info, context: context, copy: copy)
            }
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

    /// A driven motion owns the list until it lands, and asks again then.
    private var listIsFree: Bool {
        dataSource != nil && !relay.running && !branch.running && paging?.active != true && !flight.running
    }

    /// What the model says stands on the board now, read under observation.
    override func refreshContent() {
        built = listIsFree ? build() : nil
    }

    /// Applies it. Unobserved: the cells it configures read their own
    /// sessions, which must not tie the whole board to them.
    override func drawContent() {
        guard let next = built else { return }
        built = nil
        commit(next, animated: true)
    }

    /// A session's pulse, the minute turning: the rows whose drawn state
    /// moved are configured again in place, and nothing else is touched.
    override func refreshRows() {
        guard listIsFree else { return }
        var snapshot = dataSource.snapshot()
        // Read under observation even with a finger down, so the next change is still heard.
        let next = Dictionary(snapshot.itemIdentifiers.map { ($0, print(of: $0)) }, uniquingKeysWith: { first, _ in first })
        // A row under the finger holds the board still (see `commit`).
        guard !pressed else {
            rowsWaiting = true
            return
        }
        let moved = prints.take(next)
        guard !moved.isEmpty else { return }
        snapshot.reconfigureItems(moved)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    /// Glance → peek → dive: the tail of this one, without leaving home.
    private func peek(_ content: SessionRowView.Content) {
        guard let id = content.peek else { return }
        Peek.show(PeekTarget(viewId: id, title: content.title), hub: hub, home: home, from: self, open: onOpen)
    }

    // MARK: What a row draws

    /// A work row's content: what its cell draws, and what tells the rows pass it moved.
    private func rowContent(_ id: String) -> SessionRowView.Content? {
        guard let entry = rows[id] else { return nil }
        let line = entry.line.line
        let session = line.row
        return SessionRowView.Content(
            id: session.id,
            place: session.cwd.isEmpty ? session.machineId : session.cwd,
            status: Self.status(session, home: home, done: entry.tab == .finished),
            title: home.fleetTitle(session),
            line: line.context ? "" : home.meta(session, tab: entry.tab, group: entry.group),
            trail: line.context ? "" : home.age(session, tab: entry.tab),
            fold: entry.line.fold,
            context: line.context,
            stale: !home.live,
            hover: session.id,
            archives: entry.tab == .finished && !line.context && home.archivable(session),
            stopped: session.status == .stopped,
            beat: echoing[id] ?? 0,
            beats: max(1, echoing.count)
        )
    }

    private func recentContent(_ id: String) -> SessionRowView.Content? {
        guard let recent = recentItems[id] else { return nil }
        return SessionRowView.Content(
            id: recent.id,
            place: recent.markPlace,
            status: Self.status(recent.instance, home: home),
            title: recent.title,
            line: recent.place,
            trail: recent.at > 0 ? Naming.span(ms: home.now - recent.at) : "",
            stale: !home.live,
            hover: recent.instance?.id,
            stopped: recent.instance?.status == .stopped
        )
    }

    /// What an item draws, as something two passes can compare. A session's
    /// row and a needs card carry state of their own (a pulse, an age, an
    /// answer on its way); every other item draws only what `build()` read,
    /// so it moves when the board is read again and not otherwise.
    private func print(of item: Item) -> AnyHashable {
        switch item {
        case let .row(id):
            guard let entry = rows[id], let content = rowContent(id) else { return AnyHashable(contentRevision) }
            let line = entry.line.line
            return AnyHashable([AnyHashable(line.depth), AnyHashable(line.first), AnyHashable(line.last), AnyHashable(entry.through), AnyHashable(content)])
        case let .recent(id):
            return recentContent(id).map(AnyHashable.init) ?? AnyHashable(contentRevision)
        case let .need(id):
            guard let need = needs[id] else { return AnyHashable(contentRevision) }
            var sent: Ledger.Command?
            var asks = ""
            if case let .ask(parked) = need.kind {
                sent = hub.needs.answerSent(for: parked)
                asks = "\(parked.summary)\u{1f}\(parked.isQuestion)"
            }
            let stage = NeedsCardCell.stageWords(sent)
            let waited = need.raisedAt.map { Naming.span(ms: home.now - $0) } ?? ""
            return AnyHashable([need.title, need.place, asks, waited, stage?.text ?? "", "\(stage?.failed ?? false)", "\(sent.map { $0.stage != .failed } ?? false)", "\(home.live)", "\(need.stale)"])
        case .caw:
            return AnyHashable([cawLine, cawStatus.rawValue])
        default:
            return AnyHashable(contentRevision)
        }
    }

    /// The snapshot the model says now, and the lookups its cells read.
    private func build(tab preview: HomeModel.Tab? = nil) -> NSDiffableDataSourceSnapshot<Section, Item> {
        let tab = preview ?? home.tab
        drawnTab = tab
        contentRevision += 1
        var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
        let live = home.live
        let ready = home.ready
        let needList = home.needs

        usageStrip = home.usage
        snapshot.appendSections([.top])
        // The status line is drawn only until the hub is live and read
        // (StatusLine.svelte): then it says nothing and takes no room.
        if !(live && ready) {
            snapshot.appendItems([.status], toSection: .top)
        }
        if variant == .page {
            // The phone has no rail: the rail's usage strip stands here, always
            // (owner pick i). In the rail the strip is the rail's own, in its footer.
            snapshot.appendItems([.usage], toSection: .top)
        }
        if ready, live, !needList.isEmpty {
            snapshot.appendItems([.headline], toSection: .top)
        }

        needs = Dictionary(uniqueKeysWithValues: needList.map { ($0.id, $0) })
        if !needList.isEmpty {
            snapshot.appendSections([.needs])
            snapshot.appendItems(needList.map { .need($0.id) }, toSection: .needs)
        }

        let board = home.board(for: tab)
        let working = board.working
        let finished = board.finished
        counts = (working.count, finished.count, finished.contains(where: \.isFailed))
        rows = [:]
        groups = [:]
        echoing = [:]
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
                    rows[line.id] = RowLine(line: line, tab: tab, group: group.machineId, through: through)
                    items.append(.row(line.id))
                    // The list's echoes, top to bottom: a working tile and a needs-you dot each take a beat.
                    let status = Self.status(line.line.row, home: home, done: tab == .finished)
                    if status == .live || status == .attn {
                        echoing[line.id] = echoing.count
                    }
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
            cawStatus = waiting.isEmpty ? .sleeping : .ready
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
        // Recent is the page's (Home.svelte: `HomeRecent` only where `variant === "page"`); the rail lists projects under the home instead.
        if variant == .page, ready, !recent.isEmpty {
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

    /// Applies `next`. Of the lines that stay, the ones whose drawn state
    /// moved are reconfigured in place (their cells keep their identity) and
    /// the rest are left as they are. A live change that moves lines travels
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
        let redrawn = prints.take(Dictionary(after.map { ($0, print(of: $0)) }, uniquingKeysWith: { first, _ in first }))
        next.reconfigureItems(redrawn.filter { before.contains($0) })
        let moved = old.itemIdentifiers.filter { after.contains($0) } != after.filter { before.contains($0) }
        let structural = moved || before.count != after.count || !after.allSatisfy(before.contains)
        // Nothing joined, left, moved or changed what it draws: the list stands as it is.
        if !structural, redrawn.isEmpty, old.sectionIdentifiers == next.sectionIdentifiers {
            return
        }
        // The fleet has something in it now: Caw's cell goes, and he fades out over the list.
        if before.contains(.caw), !after.contains(.caw), let at = dataSource.indexPath(for: .caw) {
            (collectionView.cellForItem(at: at) as? CawCell)?.leave(over: view)
        }
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
        if paging.active {
            paging.choose(tab == .working ? 0 : 1, animated: true)
            arrive(at: tab == .working ? 0 : 1)
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
        // The tab whose rows are drawn: each keeps its own open trees.
        let tab = drawnTab
        let opening = !home.isTreeOpen(id, in: tab)
        let frames = layout.frames(in: collectionView)
        guard let parent = rows[id], let parentPath = dataSource.indexPath(for: .row(id)), let parentFrame = frames[parentPath] else {
            home.toggleTree(id, in: tab)
            return
        }
        let held = rows
        let folding = held.keys.filter { isUnder(held[$0]?.line.line, id, in: held) }
        home.toggleTree(id, in: tab)
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
        if let page = onUsagePage {
            limits.onPage = { [weak self] in
                self?.dismiss(animated: true)
                page()
            }
        }
        limits.loadViewIfNeeded()
        let sheet = HouseSheetController(limits, title: "Usage limits", scroller: limits.scroll)
        // A list that ends on its 44pt way to the page stands on the home indicator's edge.
        sheet.footAtSafeArea = limits.onPage != nil
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

    func collectionView(_: UICollectionView, didHighlightItemAt _: IndexPath) {
        pressed = true
        home.holding = true
    }

    /// The finger lifted: the selection lands on the row it was on (UIKit
    /// selects right after this), then the board catches up on the next turn.
    func collectionView(_ collectionView: UICollectionView, didUnhighlightItemAt _: IndexPath) {
        pressed = false
        if !collectionView.isDragging, !collectionView.isDecelerating, !paging.active { home.holding = false }
        DispatchQueue.main.async { [weak self] in
            guard let self, !pressed else { return }
            guard listIsFree else {
                pending = nil
                rowsWaiting = false
                return
            }
            if rowsWaiting {
                rowsWaiting = false
                requestRows()
            }
            guard let waiting = pending else { return }
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
        if row.isStale {
            return .idle
        }
        // At rest with no process: a session put to sleep, or one that
        // stopped. Listed as finished, it is done (SessionMark.svelte `sessionStatus`).
        if row.status == .sleeping || row.status == .stopped {
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

/// UIKit paging moves the list region under the tab row: the list
/// there now drags off and the other tab's drags on beside it, in lockstep
/// under the finger, while the status line, usage strip, needs cards and tab
/// row stay where they are and the tab strip's sheet follows the finger.
/// The neighbour comes on with its machines and what is under the list, its
/// rows not yet there; once it lands they fly in, staggered, from the side
/// it came from (list-swap's numbers, Relay.swift).
extension HomeViewController {
    private var tabsCell: TabsCell? {
        dataSource.indexPath(for: .tabs).flatMap { collectionView.cellForItem(at: $0) as? TabsCell }
    }

    private func preparePages() {
        guard swiping == nil else { return }
        relay.end()
        flight.stop()
        let from = home.tab
        let to: HomeModel.Tab = from == .working ? .finished : .working
        guard let tabs = tabsCell else { return }
        swiping = (from, to)
        arrivedTab = nil
        pressed = false
        pending = nil
        rowsWaiting = false
        home.holding = true
        let top = max(0, tabs.convert(tabs.bounds, to: view).maxY)
        let region = CGRect(x: 0, y: top, width: view.bounds.width, height: max(0, view.bounds.height - top))
        let leaving = view.resizableSnapshotView(from: region, afterScreenUpdates: false, withCapInsets: .zero) ?? UIView()

        // The other tab's list, laid out where this one stands.
        let resting = collectionView.contentOffset
        commit(build(tab: to), animated: false)
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
        let cover = UIView(frame: CGRect(x: 0, y: region.minY, width: region.width * 2, height: region.height))
        cover.clipsToBounds = true
        cover.backgroundColor = variant.ground
        cover.isUserInteractionEnabled = false
        cover.addSubview(leaving)
        cover.addSubview(arriving)
        leaving.frame.origin = CGPoint(x: from == .working ? 0 : region.width, y: 0)
        arriving.frame.origin.x = to == .working ? 0 : region.width
        paging.addSubview(cover)
        self.cover = cover
        leavingPane = leaving
        arrivingPane = arriving
        tabs.scrub(from: from, to: to, progress: 0)
    }

    private func drawPagingChrome(_ position: Double) {
        // Only the under-tabs pages slide. The live chrome stays at the
        // viewport's origin while UIKit scrolls the snapshot pages below it.
        collectionView.frame.origin.x = paging.contentOffset.x
        guard let swiping else { return }
        let from = swiping.from == .working ? 0.0 : 1.0
        let to = swiping.to == .working ? 0.0 : 1.0
        let progress = min(1, max(0, (position - from) / (to - from)))
        tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: progress)
    }

    private func finishPaging(_ page: Int) {
        guard let swiping else {
            return
        }
        let destination: HomeModel.Tab = page == 0 ? .working : .finished
        if destination == swiping.from {
            // Rows already in flight for a landing that did not happen come to rest where they are.
            if flight.running {
                flight.stop()
                layout.adjust = nil
                collectionView.settleFrame()
            }
            commit(build(tab: swiping.from), animated: false)
            collectionView.layoutIfNeeded()
            tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: 0)
            close()
            requestRefresh()
            return
        }
        home.tab = swiping.to
        tabsCell?.scrub(from: swiping.from, to: swiping.to, progress: 1)
        if UIAccessibility.isReduceMotionEnabled {
            close()
            requestRefresh()
        } else {
            // The rows left their gate at the decision (`arrive`); only a landing nobody saw coming starts them here.
            if arrivedTab != swiping.to { arrive(at: page) }
            close()
        }
        onSelectTab(swiping.to)
    }

    /// The page the swipe is going to settle on is decided: its rows start
    /// flying in now, while the page is still sliding into place. The page
    /// slides in empty and the live list, which already holds the arriving
    /// tab, shows through where it comes on.
    private func arrive(at page: Int) {
        guard let swiping, arrivedTab == nil, !UIAccessibility.isReduceMotionEnabled else { return }
        let destination: HomeModel.Tab = page == 0 ? .working : .finished
        guard destination == swiping.to else { return }
        arrivedTab = destination
        arrivingPane?.subviews.forEach { $0.removeFromSuperview() }
        arrivingPane?.backgroundColor = .clear
        cover?.backgroundColor = .clear
        flyIn(from: destination == .finished ? 1 : -1)
    }

    /// Whether a line stands under the tab row (the swipe's region).
    private func underTabs(_ indexPath: IndexPath) -> Bool {
        if case .none = place(at: indexPath) {
            return false
        }
        return true
    }

    private func close() {
        swiping = nil
        arrivedTab = nil
        cover?.removeFromSuperview()
        cover = nil
        leavingPane = nil
        arrivingPane = nil
        home.holding = false
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
/// drag: that drag is the system page scroll's, so vertical scrolling
/// stays immediate and a sideways one never nudges the page.
final class BoardList: UICollectionView {
    override func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        if recognizer === panGestureRecognizer {
            let v = panGestureRecognizer.velocity(in: self)
            if abs(v.y) <= abs(v.x) * PagingScrollView.slope {
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
