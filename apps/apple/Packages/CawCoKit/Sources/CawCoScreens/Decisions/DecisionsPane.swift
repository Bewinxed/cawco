import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The project page's Decisions tab (DecisionsView.svelte, PRD §5.8; the
/// approved wireframe A): its decision pages as a 4/2/1 grid of tiles, each
/// saying how far along it is; a tile opens its page in this same pane
/// (DecisionPageView), its title and figure flying into the page's head,
/// and ‹ Decisions goes back. Empty, Caw stands over the starters that ask
/// him for a page in his panel (The Empty Starts Work Rule); while the list
/// is read, the grid's skeleton stands (The Claim Of Nothing Rule).
final class DecisionsPane: UIView, UICollectionViewDelegate {
    /// Caw's panel from where he stands, with a starter's words in his field when one was pressed.
    var openCaw: (UIView, String?) -> Void = { _, _ in }
    var newSession: () -> Void = {}
    var openTask: (String) -> Void = { _ in }
    /// A task as the board has it, for the record's task chips.
    var taskOf: (String) -> (kind: Components.Schemas.StageKind?, title: String)? = { _ in nil }

    private let hub: HubConnection
    private let home: HomeModel
    private let projectId: String
    let decisions: ProjectDecisions

    private nonisolated enum Item: Hashable, Sendable {
        case page(String)
        case slot(Int)
    }

    private var grid: UICollectionView!
    private var data: UICollectionViewDiffableDataSource<Int, Item>!
    private var pages: [String: DecisionPageSummary] = [:]
    private let stateScroll = UIScrollView()
    private let stateColumn = UIStackView()
    private var shownState = ""
    /// Caw standing at 80 over the empty tab, his face kept current at each show.
    private let standing = ProjectCawSeat(side: 80)
    /// He stands here now: the head's seat steps aside for him.
    private(set) var cawStands = false
    private var page: DecisionPageView?
    /// The page open in the pane; nil: the list.
    private(set) var open: String?
    private var shown = ""
    private var leading = 0.0
    private var trailing = 0.0
    private var ticking: Timer?

    init(hub: HubConnection, home: HomeModel, projectId: String) {
        self.hub = hub
        self.home = home
        self.projectId = projectId
        decisions = ProjectDecisions(hub: hub, projectId: projectId)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        build()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DecisionsPane is built in code")
    }

    private func build() {
        let layout = UICollectionViewCompositionalLayout { [weak self] _, environment in
            self?.section(environment)
        }
        grid = UICollectionView(frame: .zero, collectionViewLayout: layout)
        grid.backgroundColor = .clear
        grid.alwaysBounceVertical = true
        grid.delegate = self
        grid.translatesAutoresizingMaskIntoConstraints = false
        let tiles = UICollectionView.CellRegistration<DecisionTileCell, String> { [weak self] cell, _, name in
            guard let self, let summary = pages[name] else { return }
            cell.configure(summary, now: Date.now.timeIntervalSince1970 * 1000, hub: hub, home: home)
        }
        let slots = UICollectionView.CellRegistration<UICollectionViewCell, Int> { cell, _, _ in
            guard cell.contentView.subviews.isEmpty else { return }
            let bone = SkeletonView(height: 90)
            bone.layer.cornerRadius = Radius.radiusLg
            bone.translatesAutoresizingMaskIntoConstraints = false
            cell.contentView.addSubview(bone)
            NSLayoutConstraint.activate([
                bone.topAnchor.constraint(equalTo: cell.contentView.topAnchor),
                bone.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor),
                bone.leadingAnchor.constraint(equalTo: cell.contentView.leadingAnchor),
                bone.trailingAnchor.constraint(equalTo: cell.contentView.trailingAnchor),
            ])
        }
        data = UICollectionViewDiffableDataSource(collectionView: grid) { view, path, item in
            switch item {
            case let .page(name): view.dequeueConfiguredReusableCell(using: tiles, for: path, item: name)
            case let .slot(index): view.dequeueConfiguredReusableCell(using: slots, for: path, item: index)
            }
        }
        addSubview(grid)

        stateScroll.alwaysBounceVertical = true
        stateScroll.translatesAutoresizingMaskIntoConstraints = false
        stateColumn.axis = .vertical
        stateColumn.alignment = .leading
        stateColumn.translatesAutoresizingMaskIntoConstraints = false
        stateScroll.addSubview(stateColumn)
        addSubview(stateScroll)
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: topAnchor),
            grid.bottomAnchor.constraint(equalTo: bottomAnchor),
            grid.leadingAnchor.constraint(equalTo: leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: trailingAnchor),
            stateScroll.topAnchor.constraint(equalTo: topAnchor),
            stateScroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            stateScroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            stateScroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            stateColumn.topAnchor.constraint(equalTo: stateScroll.contentLayoutGuide.topAnchor),
            stateColumn.bottomAnchor.constraint(equalTo: stateScroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
        ])
    }

    private var columnEdges: [NSLayoutConstraint] = []

    /// The page's gutters, which the grid, the states and an open page keep.
    func inset(leading: Double, trailing: Double) {
        guard leading != self.leading || trailing != self.trailing else { return }
        self.leading = leading
        self.trailing = trailing
        NSLayoutConstraint.deactivate(columnEdges)
        columnEdges = [
            stateColumn.leadingAnchor.constraint(equalTo: stateScroll.frameLayoutGuide.leadingAnchor, constant: leading),
            stateColumn.trailingAnchor.constraint(lessThanOrEqualTo: stateScroll.frameLayoutGuide.trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(columnEdges)
        page?.inset(leading: leading, trailing: trailing)
        grid.collectionViewLayout.invalidateLayout()
    }

    /// The grid by its own width (`@container decisions`): one column, two from 520pt, four from 900pt.
    private func section(_ environment: any NSCollectionLayoutEnvironment) -> NSCollectionLayoutSection {
        let width = environment.container.effectiveContentSize.width - leading - trailing
        let columns = width >= 900 ? 4 : width >= 520 ? 2 : 1
        let item = NSCollectionLayoutItem(layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(90)))
        let group = NSCollectionLayoutGroup.horizontal(layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(90)),
                                                       repeatingSubitem: item, count: columns)
        group.interItemSpacing = .fixed(Space.space3)
        let section = NSCollectionLayoutSection(group: group)
        section.interGroupSpacing = Space.space3
        section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: leading, bottom: Space.space6, trailing: trailing)
        return section
    }

    // MARK: Showing

    /// What the pane shows for what the hub said: the open page, the grid, or a state.
    func show(canTalk: Bool, lead: ProjectCawLead, starters: [Components.Schemas.ProjectStarter], projectName: String) {
        let list = decisions.list
        var what: String
        if let open {
            what = "page:\(open)"
            if page?.name != open {
                page?.removeFromSuperview()
                let made = DecisionPageView(name: open, summary: list?.pages.first { $0.name == open }, hub: hub, projectId: projectId)
                made.onBack = { [weak self] in self?.back() }
                made.onOpenTask = { [weak self] id in self?.openTask(id) }
                made.taskOf = { [weak self] id in self?.taskOf(id) }
                addSubview(made)
                NSLayoutConstraint.activate([
                    made.topAnchor.constraint(equalTo: topAnchor),
                    made.bottomAnchor.constraint(equalTo: bottomAnchor),
                    made.leadingAnchor.constraint(equalTo: leadingAnchor),
                    made.trailingAnchor.constraint(equalTo: trailingAnchor),
                ])
                made.inset(leading: leading, trailing: trailing)
                page = made
            }
            page?.refresh(summary: list?.pages.first { $0.name == open })
        } else if let problem = decisions.problem, list == nil {
            what = "unread"
            let retry = KitButton.make(Words.Decisions.retry, variant: .outline) { [weak self] in Task { await self?.decisions.read() } }
            retry.setContentHuggingPriority(.required, for: .horizontal)
            putState("unread:\(problem)") {
                KitEmptyState(icon: .report, title: Words.Decisions.unavailable,
                              line: Words.Decisions.unavailableLine(project: projectName, problem: problem), action: retry)
            }
        } else if let list, list.pages.isEmpty, canTalk {
            what = "caw-empty"
            standing.configure(lead.status, sentence: lead.sentence)
            putState("caw:\(starters.map(\.text).joined(separator: "|"))") {
                CawEmpty.state(seat: standing, title: Words.Decisions.empty, line: Words.Decisions.emptyCaw, starters: starters) { [weak self] from, text in
                    self?.openCaw(from, text)
                }
            }
        } else if let list, list.pages.isEmpty {
            what = "empty"
            let start = KitButton.make(Words.Decisions.newSession, variant: .outline) { [weak self] in self?.newSession() }
            start.setContentHuggingPriority(.required, for: .horizontal)
            putState("empty") {
                KitEmptyState(icon: .report, title: Words.Decisions.empty, line: Words.Decisions.emptySession, action: start)
            }
        } else {
            what = "grid"
            showGrid(list)
        }
        // The list, a page and the states swap as the project's views do.
        if what.split(separator: ":").first != shown.split(separator: ":").first || (what.hasPrefix("page:") && what != shown) {
            let first = shown.isEmpty
            let leaving = shown
            shown = what
            let place: @MainActor @Sendable () -> Void = {
                self.grid.isHidden = what != "grid"
                self.stateScroll.isHidden = what == "grid" || what.hasPrefix("page:")
                self.page?.isHidden = !what.hasPrefix("page:")
                if !what.hasPrefix("page:"), leaving.hasPrefix("page:") { self.page?.removeFromSuperview(); self.page = nil }
            }
            if !first, window != nil, !UIAccessibility.isReduceMotionEnabled {
                UIView.transition(with: self, duration: Motion.durFade, options: [.transitionCrossDissolve, .allowUserInteraction], animations: place)
            } else {
                place()
            }
        }
        cawStands = what == "caw-empty"
        tick(what == "grid")
    }

    private func putState(_ key: String, _ make: () -> UIView) {
        guard key != shownState else { return }
        shownState = key
        stateColumn.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let state = make()
        stateColumn.addArrangedSubview(state)
        // `.state { max-inline-size: 72ch }`; Caw's own measure is narrower still.
        let zero = ("0" as NSString).size(withAttributes: [.font: TypeScale.typeBody.font]).width
        state.widthAnchor.constraint(lessThanOrEqualToConstant: zero * 72).isActive = true
    }

    /// The tiles as the hub listed them, newest first; until the first read, four skeleton tiles.
    private func showGrid(_ list: DecisionsList?) {
        var snapshot = NSDiffableDataSourceSnapshot<Int, Item>()
        snapshot.appendSections([0])
        guard let list else {
            snapshot.appendItems((0 ..< 4).map(Item.slot))
            data.apply(snapshot, animatingDifferences: false)
            return
        }
        let before = pages
        pages = Dictionary(list.pages.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        snapshot.appendItems(list.pages.map { Item.page($0.name) })
        let changed = list.pages.filter { before[$0.name] != nil && before[$0.name] != $0 }.map { Item.page($0.name) }
        snapshot.reconfigureItems(changed)
        // A page published while the list is open arrives as rows do; the tiles it moves slide to their places.
        data.apply(snapshot, animatingDifferences: window != nil && !before.isEmpty && !UIAccessibility.isReduceMotionEnabled)
    }

    /// The tiles' ages move each minute while the grid shows.
    private func tick(_ on: Bool) {
        if on, ticking == nil {
            ticking = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    var snapshot = self.data.snapshot()
                    snapshot.reconfigureItems(snapshot.itemIdentifiers)
                    self.data.apply(snapshot, animatingDifferences: false)
                }
            }
        } else if !on {
            ticking?.invalidate()
            ticking = nil
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { tick(false) }
    }

    // MARK: Opening and going back

    func collectionView(_ view: UICollectionView, didSelectItemAt path: IndexPath) {
        guard case let .page(name)? = data.itemIdentifier(for: path) else { return }
        view.deselectItem(at: path, animated: false)
        let tile = view.cellForItem(at: path) as? DecisionTileCell
        let from = tile?.shared()
        open = name
        onChange()
        // The tile's title and figure fly into the page's head.
        if let from, let page { DispatchQueue.main.async { page.land(from) } }
    }

    /// ‹ Decisions: the head's title and figure go back into their tile.
    private func back() {
        guard let leaving = open else { return }
        let from = page?.shared()
        open = nil
        onChange()
        guard let from else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, let path = data.indexPath(for: .page(leaving)) else { return }
            grid.layoutIfNeeded()
            (grid.cellForItem(at: path) as? DecisionTileCell)?.land(from)
        }
    }

    /// Asks the page that holds the pane to draw it again.
    var onChange: () -> Void = {}

}

// MARK: The flight

/// A title and a figure, where they stood: what a tile and a page's head
/// hand each other (motion/share.svelte.ts, `data-share="dpage:<name>:…"`).
struct DecisionShare {
    let title: CGRect
    let progress: CGRect
}

enum ShareFlight {
    /// The destination flies from the source's box to its own (FLIP, transform
    /// only: translate and scale), over `durPanel` on the drawer curve.
    @MainActor
    static func land(_ view: UIView, from: CGRect) {
        guard let window = view.window, !UIAccessibility.isReduceMotionEnabled else { return }
        let to = view.convert(view.bounds, to: window)
        guard to.width > 0, to.height > 0, from.width > 0, from.height > 0 else { return }
        let sx = from.width / to.width, sy = from.height / to.height
        view.transform = CGAffineTransform(translationX: from.midX - to.midX, y: from.midY - to.midY).scaledBy(x: sx, y: sy)
        Motion.easeDrawer.animator(Motion.durPanel) { view.transform = .identity }.startAnimation()
    }
}

extension DecisionPageView {
    /// The head's title and figure where they stand now, in the window.
    func shared() -> DecisionShare? {
        guard let window else { return nil }
        let (title, progress) = sharedViews
        return DecisionShare(title: title.convert(title.bounds, to: window), progress: progress.convert(progress.bounds, to: window))
    }

    func land(_ from: DecisionShare) {
        layoutIfNeeded()
        let (title, progress) = sharedViews
        ShareFlight.land(title, from: from.title)
        ShareFlight.land(progress, from: from.progress)
    }
}

// MARK: A tile

/// One decision page in the grid (the card recipe:
/// 12pt, raised, the tile shadow, 18pt rhythm). Line 1: its title, and its
/// state pill at the end; line 2: the ring and its figure, `12 of 20 picked
/// · 3 notes`, or decided, the check and `12 decided · 14 tasks`; line 3:
/// the session that wrote it, its mark, name and age. The whole tile opens
/// its page; it tints on press and never scales.
final class DecisionTileCell: UICollectionViewCell {
    private let tile = TileView(radius: Radius.radiusLg)
    private let title = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong)
    private let pill = StatePillView()
    private let ring = TaskRingView(size: .md)
    private let figure = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let notes = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let progress = UIStackView()
    private let mark = SessionMarkView()
    private let who = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let age = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let meta = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        tile.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(tile)
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [title, pill])
        head.spacing = Space.space3
        head.alignment = .center
        head.distribution = .equalSpacing
        // Every tile's rows stand at the same heights, a pill or none.
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: 24).isActive = true
        figure.tabular = true
        notes.tabular = true
        for part in [ring, figure] as [UIView] { progress.addArrangedSubview(part) }
        progress.spacing = Space.space2
        progress.alignment = .center
        // `· 1 note` stands a word space from the figure, not the row's gap.
        let second = UIStackView(arrangedSubviews: [progress, notes])
        second.spacing = 4
        second.alignment = .center
        who.lineBreakMode = .byTruncatingTail
        who.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        age.tabular = true
        age.setContentCompressionResistancePriority(.required, for: .horizontal)
        for part in [mark, who, age] as [UIView] { meta.addArrangedSubview(part) }
        meta.spacing = Space.space2
        meta.setCustomSpacing(4, after: who)
        meta.alignment = .center
        let column = UIStackView(arrangedSubviews: [head, second, meta])
        column.axis = .vertical
        column.alignment = .leading
        column.spacing = Space.space2
        column.isUserInteractionEnabled = false
        column.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(column)
        NSLayoutConstraint.activate([
            tile.topAnchor.constraint(equalTo: contentView.topAnchor),
            tile.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            tile.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            tile.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            column.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space5),
            column.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space5),
            column.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space5),
            head.widthAnchor.constraint(equalTo: column.widthAnchor),
            meta.widthAnchor.constraint(lessThanOrEqualTo: column.widthAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: DecisionTileCell, _: UITraitCollection) in cell.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DecisionTileCell is built in code")
    }

    func configure(_ page: DecisionPageSummary, now: Double, hub: HubConnection, home: HomeModel) {
        title.text = page.title
        let decided = DecisionWords.isDecided(page.state)
        let words = DecisionWords.progress(picked: page.picked, cards: page.cards, decided: page.decided, tasks: page.tasks, state: page.state)
        figure.text = words
        ring.configure(done: decided ? 1 : Int(page.picked), total: decided ? 1 : Int(page.cards))
        notes.text = decided || page.notes <= 0 ? nil : Words.Decisions.notes(notes: Int(page.notes))
        notes.isHidden = notes.text == nil
        let working = page.writer.map { hub.fleet.activityPulse($0.instanceId)?.activity == .working } ?? false
        pill.show(DecisionWords.pill(state: page.state, writer: page.writer, working: working, short: true))
        meta.isHidden = page.writer == nil
        var ageWords: String?
        if let writer = page.writer {
            let row = hub.fleet.byId[writer.instanceId]
            let place = row.map { $0.cwd.isEmpty ? $0.machineId : $0.cwd } ?? writer.instanceId
            mark.configure(id: writer.instanceId, place: place, status: HomeViewController.status(row, home: home))
            who.text = writer.title
            ageWords = page.updatedAt > 0 ? "· \(RailAge.short(page.updatedAt, now: now))" : nil
            age.text = ageWords
            age.isHidden = ageWords == nil
        }
        accessibilityLabel = [page.title, words, notes.text, pill.accessibilityLabel.flatMap { pill.isHidden ? nil : $0 },
                              page.writer.map(\.title), ageWords].compactMap(\.self).joined(separator: ", ")
        paint()
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }

    /// `.press-tint`: surface-fill under the press at night, the stronger step by day; the inks go strong while held.
    private func paint() {
        let dark = traitCollection.userInterfaceStyle == .dark
        tile.backgroundColor = isHighlighted ? (dark ? Palette.surfaceFill : Palette.surfaceFillStrong) : Palette.surfaceRaised
        let held = isHighlighted && !dark
        for label in [figure, notes, who, age] { label.ink = held ? Palette.inkStrong : Palette.inkMuted }
    }

    /// Its title and figure where they stand, in the window.
    func shared() -> DecisionShare? {
        guard let window else { return nil }
        return DecisionShare(title: title.convert(title.bounds, to: window), progress: progress.convert(progress.bounds, to: window))
    }

    func land(_ from: DecisionShare) {
        ShareFlight.land(title, from: from.title)
        ShareFlight.land(progress, from: from.progress)
    }
}

