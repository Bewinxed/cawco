import CawCoCore
import CawCoDesign
import UIKit
import WebKit

/// Where a component stands on the map (MapCard.svelte `MapRole`): the canvas's own, what renders it, what it renders.
nonisolated enum MapRole: String, Hashable, Sendable {
    case usedIn, center, madeOf
}

/// A component canvas's Map mode (preview/map/CanvasMap.svelte), over the
/// page in the panel's well, the page staying loaded under it: the canvas's
/// component in the middle, what renders it (used in) in rows above, what
/// it renders (made of) in rows below, an arrowed edge from each user to it
/// and from it to each part, as the hub's `GET …/artifacts/:id/map`
/// answers. Each card counts its states and frames drawn; the chosen one,
/// the canvas's own until another is pressed, draws its canvas live, the
/// others the report's thumbnail of their frames. On the decision graph's
/// recess with its dots and zoom tools, fitted once, then the person's. In
/// a pane under 640pt it is a list: Used in, This canvas, Made of. Nothing
/// shows before the read has lasted `--dur-wait-grace`; a read that fails is
/// the empty state with the hub's sentence and Try again.
@MainActor
final class CanvasMapView: UIView, UIScrollViewDelegate {
    /// Where the chosen card's live page comes from: the pane's own canvas
    /// address, entered as the pane's page is (`HubConnection.previewLoad`).
    struct Live: Equatable {
        var address: URL
        var byHost: Bool
    }

    /// Cards to a row before the next row: the five a desk pane holds at the map's fit (CanvasMap.svelte `PER_ROW`).
    private static let perRow = 5

    private let hub: HubConnection
    private let instanceId: String
    private let artifactId: String
    private var revision = ""
    private var live: Live?
    private var scheme = CanvasViewControl.Scheme.page
    private var reduced = false
    private(set) var narrow = false

    private var map: CanvasMap?
    private var failure: String?
    private var reading: Task<Void, Never>?
    /// The chosen card's file: the canvas's own until another is pressed.
    private var chosen: String?

    private let wait = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var waitGrace: Task<Void, Never>?
    private let down = UIScrollView()
    private lazy var tryAgain: UIButton = KitButton.make(Words.Preview.tryAgain, glyph: .refresh, variant: .outline, height: .sm) { [weak self] in
        self?.read()
    }

    // The graph.
    private let graph = UIView()
    private let scroll = UIScrollView()
    private let board = WorkflowCanvasView.DotGrid()
    private let edges = CAShapeLayer()
    private let arrows = CAShapeLayer()
    private let legend = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let tools = WorkflowCanvasTools()
    private var cards: [String: MapCardView] = [:]
    private var fitted = false
    private var laidFor: CGSize = .zero
    /// Room round the map to pan into.
    private static let margin = 1200.0

    // The narrow pane's list.
    private var list: UICollectionView!
    private var source: UICollectionViewDiffableDataSource<MapRole, ListItem>!
    private var openedAtCanvas = false

    nonisolated enum ListItem: Hashable, Sendable {
        case card(file: String, role: MapRole)
        case empty(MapRole)
    }

    init(hub: HubConnection, instanceId: String, artifactId: String) {
        self.hub = hub
        self.instanceId = instanceId
        self.artifactId = artifactId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        clipsToBounds = true
        accessibilityLabel = "Map"

        // `.map-wait`: `space-5` in, unseen until the grace has passed, then faded up.
        wait.text = "Reading the canvas's map"
        wait.accessibilityTraits = .updatesFrequently
        wait.alpha = 0
        wait.translatesAutoresizingMaskIntoConstraints = false
        addSubview(wait)

        // `.map-down`: the well's surface, the empty state `space-6` in, scrolling.
        down.translatesAutoresizingMaskIntoConstraints = false
        down.backgroundColor = Palette.surfaceWell
        down.isHidden = true
        addSubview(down)

        graph.translatesAutoresizingMaskIntoConstraints = false
        graph.isHidden = true
        addSubview(graph)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.delegate = self
        scroll.minimumZoomScale = FlowFit.minZoom
        scroll.maximumZoomScale = FlowFit.maxZoom
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.bouncesZoom = false
        graph.addSubview(scroll)
        scroll.addSubview(board)
        for line in [edges, arrows] {
            line.lineWidth = Size.cGraphEdge
            line.lineJoin = .round
            board.layer.addSublayer(line)
        }
        edges.fillColor = nil
        legend.translatesAutoresizingMaskIntoConstraints = false
        legend.wrap = .pretty
        graph.addSubview(legend)
        tools.onZoom = { [weak self] step in self?.zoom(by: step) }
        tools.onFit = { [weak self] in self?.fit(animated: true) }
        graph.addSubview(tools)

        list = UICollectionView(frame: .zero, collectionViewLayout: Self.listLayout())
        list.translatesAutoresizingMaskIntoConstraints = false
        list.backgroundColor = .clear
        list.isHidden = true
        list.alwaysBounceVertical = true
        addSubview(list)
        source = makeSource()

        NSLayoutConstraint.activate([
            wait.topAnchor.constraint(equalTo: topAnchor, constant: Space.space5),
            wait.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space5),
            wait.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -Space.space5),
            down.topAnchor.constraint(equalTo: topAnchor),
            down.leadingAnchor.constraint(equalTo: leadingAnchor),
            down.trailingAnchor.constraint(equalTo: trailingAnchor),
            down.bottomAnchor.constraint(equalTo: bottomAnchor),
            graph.topAnchor.constraint(equalTo: topAnchor),
            graph.leadingAnchor.constraint(equalTo: leadingAnchor),
            graph.trailingAnchor.constraint(equalTo: trailingAnchor),
            graph.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.topAnchor.constraint(equalTo: graph.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: graph.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: graph.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: graph.bottomAnchor),
            // Svelte Flow's Panel stands 15pt in from the canvas's edge.
            legend.topAnchor.constraint(equalTo: graph.topAnchor, constant: 15),
            legend.leadingAnchor.constraint(equalTo: graph.leadingAnchor, constant: 15),
            legend.widthAnchor.constraint(lessThanOrEqualToConstant: Size.cMapNodeW),
            tools.centerXAnchor.constraint(equalTo: graph.centerXAnchor),
            tools.bottomAnchor.constraint(equalTo: graph.bottomAnchor, constant: -15),
            list.topAnchor.constraint(equalTo: topAnchor),
            list.leadingAnchor.constraint(equalTo: leadingAnchor),
            list.trailingAnchor.constraint(equalTo: trailingAnchor),
            list.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: CanvasMapView, _: UITraitCollection) in view.paintEdges() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("CanvasMapView is built in code") }

    /// The pane as it stands: a new revision reads the map again; the live
    /// card follows the view's scheme and motion; `narrow` lists it.
    func update(revision next: String, live nextLive: Live?, view: CanvasViewControl.Chosen, narrow nextNarrow: Bool) {
        let reread = next != revision
        let restyled = scheme != view.scheme || reduced != view.reduced || live != nextLive
        revision = next
        live = nextLive
        scheme = view.scheme
        reduced = view.reduced
        let relaid = narrow != nextNarrow
        narrow = nextNarrow
        if reread {
            read()
        } else if relaid || restyled {
            paint()
        }
    }

    deinit {
        reading?.cancel()
        waitGrace?.cancel()
    }

    // MARK: The read

    private func read() {
        reading?.cancel()
        failure = nil
        paint()
        startWait()
        let ids = (instanceId, artifactId)
        reading = Task { [weak self, hub] in
            do {
                let read = try await hub.canvasMap(ids.1, in: ids.0)
                guard !Task.isCancelled, let self else { return }
                map = read
                let files = ([read.center] + read.usedIn + read.madeOf).map(\.file)
                if !(chosen.map(files.contains) ?? false) { chosen = read.center.file }
                fitted = false
                paint()
            } catch {
                guard !Task.isCancelled, let self else { return }
                failure = HubConnection.sentence(error)
                paint()
            }
        }
    }

    /// The Real Wait Rule: nothing until the read has lasted the grace, then its line fades up.
    private func startWait() {
        waitGrace?.cancel()
        wait.alpha = 0
        waitGrace = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Motion.durWaitGrace))
            guard !Task.isCancelled, let self, map == nil, failure == nil else { return }
            let fade: @MainActor @Sendable () -> Void = { self.wait.alpha = 1 }
            if UIAccessibility.isReduceMotionEnabled { fade() } else { Motion.easeOut.animator(Motion.durFade, animations: fade).startAnimation() }
        }
    }

    // MARK: What stands

    private func paint() {
        let state: String
        if let failure {
            state = "failed"
            showDown(failure)
        } else if map == nil {
            state = "waiting"
        } else {
            state = narrow ? "list" : "graph"
        }
        wait.isHidden = state != "waiting"
        down.isHidden = state != "failed"
        graph.isHidden = state != "graph"
        list.isHidden = state != "list"
        if let map {
            buildCards(map)
            if narrow { applyList(map) } else { setNeedsLayout() }
        }
        #if DEBUG
        probe(state)
        #endif
    }

    private func showDown(_ sentence: String) {
        down.subviews.forEach { $0.removeFromSuperview() }
        tryAgain.removeFromSuperview()
        let empty = KitEmptyState(icon: .alert, title: "The map didn't load", line: sentence, action: tryAgain)
        empty.translatesAutoresizingMaskIntoConstraints = false
        down.addSubview(empty)
        let side = Space.space6
        NSLayoutConstraint.activate([
            empty.topAnchor.constraint(equalTo: down.contentLayoutGuide.topAnchor),
            empty.bottomAnchor.constraint(equalTo: down.contentLayoutGuide.bottomAnchor),
            empty.leadingAnchor.constraint(equalTo: down.contentLayoutGuide.leadingAnchor, constant: side),
            empty.trailingAnchor.constraint(equalTo: down.contentLayoutGuide.trailingAnchor, constant: -side),
            empty.widthAnchor.constraint(equalTo: down.frameLayoutGuide.widthAnchor, constant: -side * 2),
        ])
        UIAccessibility.post(notification: .layoutChanged, argument: empty)
    }

    /// Every component as its card, kept by file, each told whether it is chosen and its live page.
    private func buildCards(_ map: CanvasMap) {
        let all = roles(map)
        let files = Set(all.map(\.node.file))
        for (file, card) in cards where !files.contains(file) {
            card.removeFromSuperview()
            cards[file] = nil
        }
        for (node, role) in all {
            let card = cards[node.file] ?? {
                let made = MapCardView()
                made.onChoose = { [weak self] file in self?.choose(file) }
                cards[node.file] = made
                return made
            }()
            let isChosen = node.file == chosen
            card.show(node, role: role, chosen: isChosen, live: isChosen ? liveOf(node, role: role) : nil,
                      hub: hub, instanceId: instanceId)
        }
    }

    private func roles(_ map: CanvasMap) -> [(node: CanvasMapNode, role: MapRole)] {
        map.usedIn.map { ($0, MapRole.usedIn) } + [(map.center, .center)] + map.madeOf.map { ($0, MapRole.madeOf) }
    }

    /// A card's canvas page, live (CanvasMap.svelte `liveOf`): the canvas's
    /// own address for its component, another states file's for the rest, as
    /// a second page (`by=map`) that never posts a report.
    private func liveOf(_ node: CanvasMapNode, role: MapRole) -> Live? {
        guard let live, !node.statesFiles.isEmpty,
              var parts = URLComponents(url: live.address, resolvingAgainstBaseURL: false) else { return nil }
        var items = parts.queryItems ?? []
        if role != .center {
            items.removeAll { $0.name == "file" || $0.name == "spec" }
            items += node.statesFiles.map { URLQueryItem(name: "file", value: $0) }
        }
        items.removeAll { $0.name == "by" || $0.name == "scheme" || $0.name == "motion" }
        items.append(URLQueryItem(name: "by", value: "map"))
        if scheme != .page { items.append(URLQueryItem(name: "scheme", value: scheme.rawValue)) }
        if reduced { items.append(URLQueryItem(name: "motion", value: "reduce")) }
        parts.queryItems = items
        return parts.url.map { Live(address: $0, byHost: live.byHost) }
    }

    private func choose(_ file: String) {
        chosen = file
        #if DEBUG
        PreviewProbe.say("preview map chose \(file)")
        #endif
        paint()
    }

    // MARK: The graph

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let map, !narrow, bounds.width > 0 else { return }
        if laidFor != bounds.size { fitted = false }
        layoutGraph(map)
    }

    /// The rows (CanvasMap.svelte's nodes): each row centred on the canvas's
    /// card, `space-5` across, `space-6` between rows, `space-8` between the
    /// canvas's card and each group, at the tallest card's height.
    private func layoutGraph(_ map: CanvasMap) {
        let width = Size.cMapNodeW
        // A card back from a list cell stands by its frame again, not the cell's constraints.
        for card in cards.values where card.superview !== board {
            card.removeFromSuperview()
            card.translatesAutoresizingMaskIntoConstraints = true
            board.addSubview(card)
        }
        let row = cards.values.map {
            $0.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                       verticalFittingPriority: .fittingSizeLevel).height
        }.max() ?? width
        var frames: [String: CGRect] = [:]
        func place(_ list: [CanvasMapNode], top: (Int) -> Double) {
            for at in stride(from: 0, to: list.count, by: Self.perRow) {
                let cards = Array(list[at ..< min(at + Self.perRow, list.count)])
                let wide = Double(cards.count) * width + Double(cards.count - 1) * Space.space5
                for (n, node) in cards.enumerated() {
                    frames[node.file] = CGRect(x: -wide / 2 + Double(n) * (width + Space.space5), y: top(at / Self.perRow), width: width, height: row)
                }
            }
        }
        place(map.usedIn) { at in -(Space.space8 + row) - Double(at) * (row + Space.space6) }
        frames[map.center.file] = CGRect(x: -width / 2, y: 0, width: width, height: row)
        place(map.madeOf) { at in row + Space.space8 + Double(at) * (row + Space.space6) }
        let extent = frames.values.reduce(CGRect.null) { $0.union($1) }
        guard !extent.isNull else { return }
        let origin = CGPoint(x: extent.minX - Self.margin, y: extent.minY - Self.margin)
        if !fitted { scroll.zoomScale = 1 }
        let boardSize = CGSize(width: extent.width + Self.margin * 2, height: extent.height + Self.margin * 2)
        if board.bounds.size != boardSize {
            board.bounds = CGRect(origin: .zero, size: boardSize)
            board.center = CGPoint(x: boardSize.width * scroll.zoomScale / 2, y: boardSize.height * scroll.zoomScale / 2)
            scroll.contentSize = CGSize(width: boardSize.width * scroll.zoomScale, height: boardSize.height * scroll.zoomScale)
        }
        for (file, frame) in frames { cards[file]?.frame = frame.offsetBy(dx: -origin.x, dy: -origin.y) }
        drawEdges(map, frames: frames, origin: origin)
        legend.text = "Above, what renders \(map.center.name) (\(map.usedIn.count)). Below, what \(map.center.name) renders (\(map.madeOf.count))."
        if !fitted {
            fitted = true
            laidFor = bounds.size
            let (zoom, x, y) = FlowFit.view(extent, in: bounds.size)
            scroll.zoomScale = zoom
            scroll.contentOffset = CGPoint(x: -x - origin.x * zoom, y: -y - origin.y * zoom)
            tools.show(zoom: zoom)
        }
        #if DEBUG
        probeCards()
        #endif
    }

    /// An arrowed `c-graph-edge` edge in `border-control` from each user's
    /// foot to the canvas's head, and from the canvas's foot to each part's
    /// head, the smooth step Svelte Flow draws, closed arrow at its end.
    private var edgeEnds: [(CGPoint, CGPoint)] = []

    private func drawEdges(_ map: CanvasMap, frames: [String: CGRect], origin: CGPoint) {
        guard let center = frames[map.center.file]?.offsetBy(dx: -origin.x, dy: -origin.y) else { return }
        let foot = { (box: CGRect) in CGPoint(x: box.midX, y: box.maxY) }
        let head = { (box: CGRect) in CGPoint(x: box.midX, y: box.minY) }
        let boxes = { (list: [CanvasMapNode]) in list.compactMap { frames[$0.file]?.offsetBy(dx: -origin.x, dy: -origin.y) } }
        edgeEnds = boxes(map.usedIn).map { (foot($0), head(center)) } + boxes(map.madeOf).map { (foot(center), head($0)) }
        let lines = CGMutablePath()
        let tips = CGMutablePath()
        // Svelte Flow's ArrowClosed at stroke width 1.5: 12.5 units of a 20-unit box, its head 5 long and 8 wide.
        let unit = 12.5 / 20 * Size.cGraphEdge
        for (from, to) in edgeEnds {
            lines.addPath(SmoothStep.downPath(source: from, target: to))
            tips.move(to: to)
            tips.addLine(to: CGPoint(x: to.x - 4 * unit, y: to.y - 5 * unit))
            tips.addLine(to: CGPoint(x: to.x + 4 * unit, y: to.y - 5 * unit))
            tips.closeSubpath()
        }
        edges.frame = board.bounds
        arrows.frame = board.bounds
        edges.path = lines
        arrows.path = tips
        paintEdges()
    }

    private func paintEdges() {
        let ink = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        edges.strokeColor = ink
        arrows.strokeColor = ink
        arrows.fillColor = ink
    }

    private func fit(animated: Bool) {
        guard let map else { return }
        fitted = false
        laidFor = .zero
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeInOut.animator(Motion.durPanel) { self.layoutGraph(map) }.startAnimation()
        } else {
            layoutGraph(map)
        }
    }

    /// Zoom in and out step by a factor of 1.2 about the canvas's centre (d3-zoom's `scaleBy`).
    private func zoom(by factor: Double) {
        let next = min(FlowFit.maxZoom, max(FlowFit.minZoom, scroll.zoomScale * factor))
        let centre = CGPoint(x: (scroll.contentOffset.x + bounds.width / 2) / scroll.zoomScale, y: (scroll.contentOffset.y + bounds.height / 2) / scroll.zoomScale)
        let move = {
            self.scroll.zoomScale = next
            self.scroll.contentOffset = CGPoint(x: centre.x * next - self.bounds.width / 2, y: centre.y * next - self.bounds.height / 2)
        }
        if UIAccessibility.isReduceMotionEnabled { move() } else { Motion.easeInOut.animator(Motion.durPanel) { move() }.startAnimation() }
        tools.show(zoom: next)
    }

    func viewForZooming(in _: UIScrollView) -> UIView? { board }
    func scrollViewDidZoom(_ scrollView: UIScrollView) { tools.show(zoom: scrollView.zoomScale) }

    // MARK: The list

    private static func listLayout() -> UICollectionViewCompositionalLayout {
        UICollectionViewCompositionalLayout { _, _ in
            let item = NSCollectionLayoutItem(layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(200)))
            let group = NSCollectionLayoutGroup.vertical(layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(200)), subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            // `.map-list`: `space-4` in, `space-5` between groups, `space-3` between cards, `space-2` under a group's words.
            section.interGroupSpacing = Space.space3
            section.contentInsets = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space4, bottom: Space.space5, trailing: Space.space4)
            let header = NSCollectionLayoutBoundarySupplementaryItem(
                layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(16)),
                elementKind: UICollectionView.elementKindSectionHeader, alignment: .top)
            header.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
            section.boundarySupplementaryItems = [header]
            return section
        }
    }

    private func makeSource() -> UICollectionViewDiffableDataSource<MapRole, ListItem> {
        let cardCell = UICollectionView.CellRegistration<UICollectionViewCell, ListItem> { [weak self] cell, _, item in
            guard let self else { return }
            cell.contentView.subviews.forEach { $0.removeFromSuperview() }
            let content: UIView
            switch item {
            case let .card(file, _):
                guard let card = cards[file] else { return }
                content = card
            case let .empty(role):
                let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                let name = map?.center.name ?? ""
                line.text = role == .usedIn ? "Nothing renders \(name) yet." : "\(name) renders no other component."
                content = line
            }
            content.removeFromSuperview()
            content.translatesAutoresizingMaskIntoConstraints = false
            cell.contentView.addSubview(content)
            NSLayoutConstraint.activate([
                content.topAnchor.constraint(equalTo: cell.contentView.topAnchor),
                content.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor),
                content.leadingAnchor.constraint(equalTo: cell.contentView.leadingAnchor),
                content.trailingAnchor.constraint(equalTo: cell.contentView.trailingAnchor),
            ])
        }
        let headerCell = UICollectionView.SupplementaryRegistration<UICollectionViewCell>(elementKind: UICollectionView.elementKindSectionHeader) { [weak self] cell, _, path in
            guard let self, let role = source.sectionIdentifier(for: path.section) else { return }
            cell.contentView.subviews.forEach { $0.removeFromSuperview() }
            let words = KitLabel(TypeScale.typeCaps, ink: Palette.inkMuted)
            words.text = Self.words(role)
            words.accessibilityTraits = .header
            cell.contentView.hold(words, insets: .zero)
        }
        let made = UICollectionViewDiffableDataSource<MapRole, ListItem>(collectionView: list) { view, path, item in
            view.dequeueConfiguredReusableCell(using: cardCell, for: path, item: item)
        }
        made.supplementaryViewProvider = { view, _, path in
            view.dequeueConfiguredReusableSupplementary(using: headerCell, for: path)
        }
        return made
    }

    private static func words(_ role: MapRole) -> String {
        switch role {
        case .usedIn: "Used in"
        case .center: "This canvas"
        case .madeOf: "Made of"
        }
    }

    private func applyList(_ map: CanvasMap) {
        var snapshot = NSDiffableDataSourceSnapshot<MapRole, ListItem>()
        for (role, nodes) in [(MapRole.usedIn, map.usedIn), (.center, [map.center]), (.madeOf, map.madeOf)] {
            snapshot.appendSections([role])
            snapshot.appendItems(nodes.isEmpty ? [.empty(role)] : nodes.map { .card(file: $0.file, role: role) }, toSection: role)
        }
        // Each card's chosen and live state changes in the card itself; the cells hold the same cards.
        snapshot.reconfigureItems(snapshot.itemIdentifiers)
        source.apply(snapshot, animatingDifferences: false) { [weak self] in
            guard let self, !openedAtCanvas, let index = source.indexPath(for: .card(file: map.center.file, role: .center)) else { return }
            // Opened on the canvas's own card: what renders it a scroll up.
            openedAtCanvas = true
            list.layoutIfNeeded()
            if let header = list.layoutAttributesForSupplementaryElement(ofKind: UICollectionView.elementKindSectionHeader, at: IndexPath(item: 0, section: index.section)) {
                list.contentOffset = CGPoint(x: 0, y: max(-list.adjustedContentInset.top, header.frame.minY - Space.space4))
            }
            #if DEBUG
            probeCards()
            #endif
        }
    }

    #if DEBUG
    private func probe(_ state: String) {
        let names = { (list: [CanvasMapNode]) in list.map(\.name).joined(separator: ",") }
        PreviewProbe.say("preview map state=\(state) center=\(map?.center.name ?? "-") usedIn=\(names(map?.usedIn ?? [])) madeOf=\(names(map?.madeOf ?? [])) chosen=\(chosen ?? "-") failure=\(failure ?? "-")")
    }

    private var probed = ""

    /// Each card's name, role and frame in the window, the chosen one's live address.
    private func probeCards() {
        DispatchQueue.main.async { [weak self] in
            guard let self, window != nil else { return }
            let line = cards.values.compactMap { card -> String? in
                guard card.window != nil, let node = card.node else { return nil }
                let box = card.convert(card.bounds, to: nil)
                return "\(node.name):\(card.role.rawValue):\(Int(box.minX)),\(Int(box.minY)),\(Int(box.width)),\(Int(box.height))\(card.chosen ? ":chosen" : "")"
            }.sorted().joined(separator: " ")
            let said = "preview map cards \(narrow ? "list" : "graph") \(line) edges=\(narrow ? 0 : edgeEnds.count) live=\(cards[chosen ?? ""]?.liveAddress ?? "-")"
            guard said != probed else { return }
            probed = said
            PreviewProbe.say(said)
        }
    }
    #endif
}

/// One component on the map (MapCard.svelte), on the graph and in the
/// narrow list alike: a card `c-map-node-w` wide on the raised surface at
/// `radius-lg` with the tile shadow, `space-2` in; its name in the label
/// role (the canvas's own tagged "This canvas" in the selected pair), its
/// file and "N states · M drawn" in meta, all one button that chooses it,
/// over a 16:10 view at `radius-md` on the recess holding the report's
/// thumbnail of its frames, or, once chosen, its canvas page live, laid out
/// at the tablet form's width and scaled to the view, taking no input. The
/// chosen card takes the coral edge. One with no states file can't be chosen.
@MainActor
final class MapCardView: UIControl {
    var onChoose: (String) -> Void = { _ in }
    private(set) var node: CanvasMapNode?
    private(set) var role = MapRole.center
    private(set) var chosen = false

    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let tagLabel = KitLabel(TypeScale.typeMeta, ink: Palette.selectedInk)
    private let tagBox = UIView()
    private let file = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let counts = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let viewBox = UIView()
    private let thumb = MapThumbView()
    private var page: WKWebView?
    private(set) var liveAddress: String?
    private var loading: Task<Void, Never>?
    /// The live page's room: the tablet form's width at 16:10 (core `FORMS.tablet`).
    private static let liveSize = CGSize(width: 768, height: 480)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile
        layer.borderWidth = 0
        name.lineBreakMode = .byTruncatingTail
        file.lineBreakMode = .byTruncatingTail
        counts.tabular = true
        tagLabel.text = "This canvas"
        tagBox.backgroundColor = Palette.selectedBg
        tagBox.layer.cornerRadius = 9
        tagBox.hold(tagLabel, insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space2))
        tagBox.setContentHuggingPriority(.required, for: .horizontal)
        tagBox.setContentCompressionResistancePriority(.required, for: .horizontal)
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [name, tagBox, UIView()])
        line.spacing = Space.space2
        line.alignment = .center
        let words = UIStackView(arrangedSubviews: [line, file, counts])
        words.axis = .vertical
        words.spacing = Space.spaceRow
        words.isLayoutMarginsRelativeArrangement = true
        words.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space1, bottom: Space.space1, trailing: Space.space1)
        viewBox.backgroundColor = Palette.surfaceRecess
        viewBox.layer.cornerRadius = Radius.radiusMd
        viewBox.layer.cornerCurve = .continuous
        viewBox.clipsToBounds = true
        viewBox.hold(thumb, insets: UIEdgeInsets(top: Space.space2, left: Space.space2, bottom: Space.space2, right: Space.space2))
        viewBox.heightAnchor.constraint(equalTo: viewBox.widthAnchor, multiplier: 10.0 / 16.0).isActive = true
        let column = UIStackView(arrangedSubviews: [words, viewBox])
        column.axis = .vertical
        column.spacing = Space.space2
        column.isUserInteractionEnabled = false
        hold(column, insets: UIEdgeInsets(top: Space.space2, left: Space.space2, bottom: Space.space2, right: Space.space2))
        isAccessibilityElement = true
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in
            guard let self, let node, !node.statesFiles.isEmpty else { return }
            onChoose(node.file)
        }, for: .touchUpInside)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: MapCardView, _: UITraitCollection) in card.paintEdge() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MapCardView is built in code") }

    deinit { loading?.cancel() }

    func show(_ node: CanvasMapNode, role: MapRole, chosen: Bool, live: CanvasMapView.Live?, hub: HubConnection, instanceId: String) {
        self.node = node
        self.role = role
        self.chosen = chosen
        let choosable = !node.statesFiles.isEmpty
        name.text = node.name
        tagBox.isHidden = role != .center
        // Its folder and file: the name says which component; the whole path is the tooltip's.
        file.text = node.file.split(separator: "/").suffix(2).joined(separator: "/")
        let states = Int(node.states)
        counts.text = choosable || states > 0 ? "\(states) \(states == 1 ? "state" : "states") · \(Int(node.drawn)) drawn" : "No states file"
        let at = node.at.map { "\(node.file), \(role == .usedIn ? "rendering it at" : "rendered at") \($0)" } ?? node.file
        toolTip = choosable ? at : "\(at): no states file, so nothing to draw live"
        isEnabled = choosable
        accessibilityLabel = [node.name, role == .center ? "This canvas" : nil, counts.text].compactMap(\.self).joined(separator: ", ")
        accessibilityHint = toolTip
        accessibilityTraits = chosen ? [.button, .selected] : choosable ? .button : [.button, .notEnabled]
        thumb.show(node.thumb, name: node.name)
        paintEdge()
        setLive(live, hub: hub, instanceId: instanceId)
    }

    /// The chosen one's coral edge, as a chosen chip's (`brand-solid`, inset 1px).
    private func paintEdge() {
        layer.borderWidth = chosen ? 1 : 0
        layer.borderColor = Palette.brandSolid.resolvedColor(with: traitCollection).cgColor
    }

    /// The live page while chosen: entered as the pane's page is, its own
    /// cookies, no input, scaled from the tablet form's width to the view.
    private func setLive(_ live: CanvasMapView.Live?, hub: HubConnection, instanceId: String) {
        let address = live?.address.absoluteString
        guard address != liveAddress else { return }
        liveAddress = address
        loading?.cancel()
        page?.removeFromSuperview()
        page = nil
        thumb.isHidden = live != nil
        guard let live else { return }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let made = WKWebView(frame: CGRect(origin: .zero, size: Self.liveSize), configuration: configuration)
        made.isUserInteractionEnabled = false
        made.isOpaque = false
        made.backgroundColor = Palette.surfaceWell
        made.scrollView.isScrollEnabled = false
        made.layer.anchorPoint = .zero
        made.isAccessibilityElement = false
        made.accessibilityElementsHidden = true
        viewBox.addSubview(made)
        page = made
        setNeedsLayout()
        loading = Task { [weak made] in
            guard let url = try? await hub.previewLoad(live.address, in: instanceId, byHost: live.byHost), !Task.isCancelled else { return }
            made?.load(URLRequest(url: url))
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let page, viewBox.bounds.width > 0 else { return }
        let scale = viewBox.bounds.width / Self.liveSize.width
        page.bounds = CGRect(origin: .zero, size: Self.liveSize)
        page.layer.position = .zero
        page.transform = CGAffineTransform(scaleX: scale, y: scale)
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted && !chosen ? Palette.surfaceHover : Palette.surfaceRaised }
    }
}

/// A component's frames as a browser last drew them, in miniature
/// (MapThumb.svelte, core `DesignThumb`): each frame's box where it stood
/// on its canvas, fitted into the view, by its state: drawn on the raised
/// surface in the control edge, empty dashed, failed in the fail pair, not
/// seen since a change or not shown at its width on the skeleton's fill.
/// Nothing drawn yet says so.
@MainActor
final class MapThumbView: UIView {
    private let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var thumb: DesignThumb?
    private var boxes: [CAShapeLayer] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        none.text = "Not drawn yet"
        none.textAlignment = .center
        hold(none, insets: .zero)
        isAccessibilityElement = true
        accessibilityTraits = .image
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: MapThumbView, _: UITraitCollection) in view.setNeedsLayout() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MapThumbView is built in code") }

    func show(_ next: DesignThumb?, name: String) {
        thumb = next
        none.isHidden = next != nil
        var by: [String: Int] = [:]
        for frame in next?.frames ?? [] { by[frame.state.rawValue, default: 0] += 1 }
        let said = ["\(by["drawn"] ?? 0) drawn",
                    by["failed"].map { "\($0) failed" }, by["empty"].map { "\($0) empty" },
                    by["unseen"].map { "\($0) not seen since a change" }, by["unshown"].map { "\($0) not shown at its width" }]
            .compactMap(\.self).joined(separator: ", ")
        accessibilityLabel = next == nil ? "Not drawn yet" : "\(name)'s frames as last drawn: \(said)"
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        boxes.forEach { $0.removeFromSuperlayer() }
        boxes = []
        guard let thumb, thumb.w > 0, thumb.h > 0, bounds.width > 0 else { return }
        // `preserveAspectRatio="xMidYMid meet"`: the whole canvas, centred.
        let scale = min(bounds.width / thumb.w, bounds.height / thumb.h)
        let left = (bounds.width - thumb.w * scale) / 2
        let top = (bounds.height - thumb.h * scale) / 2
        let resolve = { (color: UIColor) in color.resolvedColor(with: self.traitCollection).cgColor }
        for frame in thumb.frames {
            let box = CAShapeLayer()
            let rect = CGRect(x: left + frame.x * scale, y: top + frame.y * scale, width: frame.w * scale, height: frame.h * scale)
            let radius = min(8 * scale, rect.width / 2, rect.height / 2)
            box.path = UIBezierPath(roundedRect: rect, cornerRadius: radius).cgPath
            box.lineWidth = 1
            switch frame.state {
            case .empty:
                box.fillColor = nil
                box.strokeColor = resolve(Palette.borderControl)
                box.lineDashPattern = [3, 3]
            case .failed:
                box.fillColor = resolve(Palette.statusFailBg)
                box.strokeColor = resolve(Palette.statusFailGlyph)
            case .unseen, .unshown:
                box.fillColor = resolve(Palette.surfaceFill)
                box.strokeColor = nil
            default:
                box.fillColor = resolve(Palette.surfaceRaised)
                box.strokeColor = resolve(Palette.borderControl)
            }
            layer.addSublayer(box)
            boxes.append(box)
        }
    }
}
