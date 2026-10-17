import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// Recent in the wide rail (Sidebar.svelte `<HomeRecent inset />` where
/// `!narrow`): under Projects, so the projects come straight after what is
/// live. The page's Recent (RecentList) in a list of its own that never
/// scrolls: it is as tall as what it holds, and the rail scrolls it with
/// the projects.
final class RailRecentController: ObservedViewController, UICollectionViewDelegate {
    nonisolated enum Section: Hashable, Sendable { case recent }

    private let home: HomeModel
    let recent: RecentList
    var onOpen: (String) -> Void = { _ in }
    /// What a row's session menu does through the shell.
    var sessionMenus: (() -> SessionMenuContext?)? {
        didSet { recent.sessionMenus = sessionMenus }
    }

    /// The search field took the keyboard: the rail brings it into view.
    var onSearchBegan: (UIView) -> Void = { _ in }

    private(set) var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Section, RecentList.Entry>!
    private var built: NSDiffableDataSourceSnapshot<Section, RecentList.Entry>?
    private var prints = RowPrints<RecentList.Entry>()
    /// The list is as tall as its content.
    private var fits: NSLayoutConstraint?
    /// Folds it away while it has nothing to list.
    private lazy var empty = view.heightAnchor.constraint(equalToConstant: 0)
    private var sizeWatch: NSKeyValueObservation?
    /// A cell is under the finger; `pending` waits for it to lift (HomeViewController `commit`).
    private var pressed = false
    private var pending: NSDiffableDataSourceSnapshot<Section, RecentList.Entry>?

    init(hub: HubConnection, home: HomeModel) {
        self.home = home
        recent = RecentList(hub: hub, home: home, place: "rail-recent")
        super.init(nibName: nil, bundle: nil)
        recent.onChange = { [weak self] in self?.requestRefresh() }
        recent.onSearchBegan = { [weak self] in
            guard let self, let row = searchRow else { return }
            onSearchBegan(row)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RailRecentController is built in code")
    }

    /// The search row, while it is drawn.
    var searchRow: SearchCell? {
        dataSource?.indexPath(for: .line(.search)).flatMap { collectionView.cellForItem(at: $0) as? SearchCell }
    }

    #if DEBUG
    /// Once a second while it stands (`-rail-recent-probe`): the rail's probe reads where it settled.
    var onProbe: () -> Void = {}
    private var probeTimer: Timer?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard ProcessInfo.processInfo.arguments.contains("-rail-recent-probe") else { return }
        probeTimer = probeTimer ?? Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.onProbe() }
        }
    }
    #endif

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.sidebar
        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: Self.layout())
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.backgroundColor = Palette.sidebar
        collectionView.isScrollEnabled = false
        collectionView.delegate = self
        view.addSubview(collectionView)
        // A list with no height lays nothing out and reports none: it starts at a head's.
        let fits = collectionView.heightAnchor.constraint(equalToConstant: 44)
        fits.priority = .required - 1
        NSLayoutConstraint.activate([
            collectionView.topAnchor.constraint(equalTo: view.topAnchor),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            fits,
        ])
        self.fits = fits
        sizeWatch = collectionView.observe(\.contentSize, options: [.new]) { [weak self] _, change in
            guard let height = change.newValue?.height else { return }
            MainActor.assumeIsolated { self?.fit(height) }
        }
        let ask = UICollectionView.CellRegistration<AskCell, RecentList.Entry> { [weak self] cell, _, entry in
            guard case let .ask(at) = entry, let asks = self?.sessionMenus?()?.asks, asks.at == at else { return }
            cell.hold(asks.view, indent: 0)
        }
        let recent = recent
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { view, index, entry in
            switch entry {
            case let .line(line): recent.cell(line, in: view, at: index)
            case .ask: view.dequeueConfiguredReusableCell(using: ask, for: index, item: entry)
            }
        }
    }

    private func fit(_ height: Double) {
        guard let fits, height > 0, abs(fits.constant - height) > 0.5 else { return }
        fits.constant = height
    }

    /// `.recent.inset` (`padding: space-1 space-2 space-2`), its lines 2pt apart.
    private static func layout() -> UICollectionViewCompositionalLayout {
        let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
        let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [NSCollectionLayoutItem(layoutSize: size)])
        let section = NSCollectionLayoutSection(group: group)
        section.interGroupSpacing = 2
        section.contentInsets = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        return UICollectionViewCompositionalLayout(section: section)
    }

    // MARK: Updates

    override func refreshContent() {
        var snapshot = NSDiffableDataSourceSnapshot<Section, RecentList.Entry>()
        let entries = recent.entries(home.recentItems, asked: sessionMenus?()?.asks.at)
        if !entries.isEmpty {
            snapshot.appendSections([.recent])
            snapshot.appendItems(entries, toSection: .recent)
        }
        built = snapshot
    }

    override func drawContent() {
        guard let next = built else { return }
        built = nil
        // Nothing to list (the hub not read, or nothing in it): the rail keeps
        // no room for it. Folded by a height, not by hiding: a stack hides an
        // arranged view with a required zero height of its own, and one hidden
        // and shown again from inside the layout pass kept it (the list stood
        // 0pt tall with Recent read, `frame=…x0 all=4`).
        empty.isActive = next.numberOfItems == 0
        commit(next)
    }

    /// A row's pulse or age: only the rows whose drawn state moved are configured again.
    override func refreshRows() {
        guard let dataSource else { return }
        var snapshot = dataSource.snapshot()
        let next = draws(snapshot.itemIdentifiers)
        guard !pressed else { return }
        let moved = prints.take(next)
        guard !moved.isEmpty else { return }
        snapshot.reconfigureItems(moved)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    private func draws(_ entries: [RecentList.Entry]) -> [RecentList.Entry: AnyHashable] {
        let asks = sessionMenus?()?.asks.revision
        return Dictionary(entries.map { entry in
            switch entry {
            case let .line(line): (entry, recent.print(of: line) ?? AnyHashable(0))
            case .ask: (entry, AnyHashable(asks ?? 0))
            }
        }, uniquingKeysWith: { first, _ in first })
    }

    /// Applies `next`, the lines that stay and drew something else configured
    /// again in place; while a finger is down it waits for it to lift.
    private func commit(_ next: NSDiffableDataSourceSnapshot<Section, RecentList.Entry>) {
        guard !pressed else {
            pending = next
            return
        }
        var next = next
        let before = Set(dataSource.snapshot().itemIdentifiers)
        let redrawn = prints.take(draws(next.itemIdentifiers))
        // The head's count and chevron are read from the list, not the row: it draws again on every read.
        let head = RecentList.Entry.line(.head)
        next.reconfigureItems((redrawn + (next.indexOfItem(head) != nil ? [head] : [])).filter { before.contains($0) })
        dataSource.apply(next, animatingDifferences: false)
    }

    // MARK: A press

    func collectionView(_: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt _: IndexPath) {
        (cell as? HomeCell)?.ground = Palette.sidebar
    }

    func collectionView(_: UICollectionView, didHighlightItemAt _: IndexPath) {
        pressed = true
    }

    func collectionView(_: UICollectionView, didUnhighlightItemAt _: IndexPath) {
        pressed = false
        DispatchQueue.main.async { [weak self] in
            guard let self, !pressed, let waiting = pending else { return }
            pending = nil
            commit(waiting)
        }
    }

    func collectionView(_: UICollectionView, shouldSelectItemAt indexPath: IndexPath) -> Bool {
        guard case let .line(line) = dataSource.itemIdentifier(for: indexPath) else { return false }
        return RecentList.selects(line)
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: false)
        guard case let .line(line) = dataSource.itemIdentifier(for: indexPath) else { return }
        recent.select(line, open: onOpen)
    }

    #if DEBUG
    private static let probe = Logger(subsystem: "dev.cawco.app", category: "RailRecent")
    private var probed = ""

    /// `-rail-recent-probe`: where Recent stands in the rail, what it lists
    /// against what it holds, and the stored rows by title, each time that moves.
    func probeLog(rail: UIView, projects: UIView, scroll: UIView) {
        guard ProcessInfo.processInfo.arguments.contains("-rail-recent-probe"), let dataSource, view.window != nil else { return }
        let frame = view.convert(view.bounds, to: rail)
        let above = projects.convert(projects.bounds, to: rail)
        // Each row where the list laid it, and whether its cell stands there.
        var drawn = 0
        let rows = dataSource.snapshot().itemIdentifiers.compactMap { entry -> String? in
            guard case let .line(.row(id)) = entry, let path = dataSource.indexPath(for: entry),
                  let laid = collectionView.layoutAttributesForItem(at: path), let item = recent.all.first(where: { $0.id == id }) else { return nil }
            if collectionView.cellForItem(at: path) != nil { drawn += 1 }
            let at = collectionView.convert(laid.frame, to: rail)
            return "\(item.title)@\(Int(at.minY))+\(Int(at.height))\(item.instance == nil ? "[stored]" : "")"
        }
        func box(_ r: CGRect) -> String { "\(Int(r.minX)),\(Int(r.minY)),\(Int(r.width))x\(Int(r.height))" }
        // Where the rail stands in the window, the room its safe area keeps, and its scroller in it.
        let safe = rail.safeAreaInsets
        let geometry = "rail.window=\(box(rail.convert(rail.bounds, to: nil))) rail.safe=\(Int(safe.left)),\(Int(safe.top)),\(Int(safe.right)),\(Int(safe.bottom)) scroll=\(box(scroll.convert(scroll.bounds, to: rail)))"
        let line = "rail recent frame=\(box(frame)) projects=\(box(above)) \(geometry) rail=\(Int(rail.bounds.width)) under=\(frame.minY >= above.maxY) open=\(home.recentOpen) folded=\(empty.isActive) fits=\(Int(fits?.constant ?? -1)) all=\(recent.all.count) stored=\(recent.all.filter { $0.instance == nil }.count) rows=\(rows.count) drawn=\(drawn) style=\(traitCollection.userInterfaceStyle == .dark ? "dark" : "light") | \(rows.joined(separator: " | "))"
        guard line != probed else { return }
        probed = line
        Self.probe.notice("\(line, privacy: .public)")
    }
    #endif
}
