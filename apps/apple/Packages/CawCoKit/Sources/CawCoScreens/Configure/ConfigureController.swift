import CawCoCore
import CawCoDesign
import UIKit

/// Configure (routes/config/+layout.svelte, ConfigRail.svelte): every
/// fleet-wide setting behind one list of sections, grouped, each with how
/// many rows it holds and how many of them fail somewhere.
///
/// On a regular width the list is the rail, an inset raised panel in the
/// page's gutter, and the chosen section stands beside it; it opens on the
/// section last opened. On a compact width the list is the page, as iOS
/// Settings is (HIG Lists and tables: "iOS Settings uses a hierarchy of
/// lists"), grouped with a disclosure indicator on each row, and a section
/// is pushed over it (HIG Split views: "Account for narrow, compact, and
/// intermediate window widths").
final class ConfigureController: ObservedViewController, UICollectionViewDelegate {
    private let context: ShellContext
    private var hub: HubConnection { context.hub }
    private var collection: UICollectionView!
    private var source: UICollectionViewDiffableDataSource<String, String>!
    /// The rail's panel on a regular width.
    private let panel = UIView()
    /// Where the chosen section stands on a regular width.
    private let pane = UIView()
    private var screens: [String: UIViewController] = [:]
    /// The section beside the rail.
    private var shown: String?
    /// What each row draws now: its count and its badge.
    private var drawn: [String: (count: Int?, badge: ConfigBadge?)] = [:]
    private var arrangedCompact: Bool?

    init(context: ShellContext) {
        self.context = context
        super.init(nibName: nil, bundle: nil)
        navigationItem.backButtonTitle = "Configure"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfigureController is built in code")
    }

    private var compact: Bool { traitCollection.horizontalSizeClass == .compact }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        view.accessibilityIdentifier = "configure"
        let layout = UICollectionViewCompositionalLayout { [weak self] _, environment in
            let compact = self?.compact ?? true
            var list = UICollectionLayoutListConfiguration(appearance: compact ? .insetGrouped : .plain)
            list.backgroundColor = .clear
            list.showsSeparators = compact
            list.separatorConfiguration.color = Palette.borderHairline
            list.headerMode = .supplementary
            let section = NSCollectionLayoutSection.list(using: list, layoutEnvironment: environment)
            if !compact {
                section.contentInsets = .init(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)
            }
            return section
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.backgroundColor = .clear
        collection.delegate = self
        collection.accessibilityLabel = "Configure"
        collection.translatesAutoresizingMaskIntoConstraints = false

        let row = UICollectionView.CellRegistration<UICollectionViewListCell, String> { [weak self] cell, _, slug in
            self?.configure(cell, slug: slug)
        }
        let header = UICollectionView.SupplementaryRegistration<UICollectionViewListCell>(elementKind: UICollectionView.elementKindSectionHeader) { [weak self] cell, _, path in
            guard let self, let group = source.sectionIdentifier(for: path.section) else { return }
            // `.label`: the group's name, body type in the muted ink.
            var content = UIListContentConfiguration.header()
            content.text = group
            content.textProperties.font = TypeScale.typeBody.font
            content.textProperties.color = Palette.inkMuted
            content.textProperties.transform = .none
            content.directionalLayoutMargins = .init(top: Space.space4, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
            cell.contentConfiguration = content
            cell.accessibilityTraits = .header
        }
        source = UICollectionViewDiffableDataSource(collectionView: collection) { collection, path, slug in
            collection.dequeueConfiguredReusableCell(using: row, for: path, item: slug)
        }
        source.supplementaryViewProvider = { collection, _, path in
            collection.dequeueConfiguredReusableSupplementary(using: header, for: path)
        }
        var snapshot = NSDiffableDataSourceSnapshot<String, String>()
        for (group, sections) in ConfigSections.groups {
            snapshot.appendSections([group])
            snapshot.appendItems(sections.map(\.slug), toSection: group)
        }
        source.apply(snapshot, animatingDifferences: false)

        // `.rail[data-variant="rail"]`: 232pt, raised, `radius-lg`, inset by the
        // pages' gutter so its top lines up with the section's card.
        panel.backgroundColor = Palette.surfaceRaised
        panel.layer.cornerRadius = Radius.radiusLg
        panel.layer.cornerCurve = .continuous
        panel.clipsToBounds = true
        panel.translatesAutoresizingMaskIntoConstraints = false
        pane.translatesAutoresizingMaskIntoConstraints = false
        pane.clipsToBounds = true
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (controller: ConfigureController, _: UITraitCollection) in
            controller.arrange()
        }
        arrange()
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.configuration.load() }
        // Back from a pushed section, the row it came from lets go of its press.
        if compact, let selected = collection.indexPathsForSelectedItems {
            for path in selected { collection.deselectItem(at: path, animated: animated) }
        }
    }

    // MARK: Layout

    /// The rail and the section side by side, or the list alone.
    private func arrange() {
        guard isViewLoaded, arrangedCompact != compact else { return }
        arrangedCompact = compact
        // Taking a view out takes its constraints with it.
        for part in [collection!, panel, pane] { part.removeFromSuperview() }
        let safe = view.safeAreaLayoutGuide
        if compact {
            if let shown, let screen = screens[shown] { unhost(screen) }
            shown = nil
            view.addSubview(collection)
            NSLayoutConstraint.activate([
                collection.topAnchor.constraint(equalTo: safe.topAnchor),
                collection.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                collection.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
                collection.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            ])
        } else {
            view.addSubview(panel)
            view.addSubview(pane)
            panel.addSubview(collection)
            NSLayoutConstraint.activate([
                panel.topAnchor.constraint(equalTo: safe.topAnchor, constant: Space.space2),
                panel.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -Space.space2),
                panel.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space5),
                panel.widthAnchor.constraint(equalToConstant: 232),
                collection.topAnchor.constraint(equalTo: panel.topAnchor),
                collection.bottomAnchor.constraint(equalTo: panel.bottomAnchor),
                collection.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
                collection.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
                pane.topAnchor.constraint(equalTo: view.topAnchor),
                pane.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                pane.leadingAnchor.constraint(equalTo: panel.trailingAnchor),
                pane.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
            // Wide screens open on the section last opened (`LAST_KEY`).
            let open = ConfigSections.last.flatMap(ConfigSections.section) ?? ConfigSections.all[0]
            show(open.slug, animated: false)
        }
        collection.collectionViewLayout.invalidateLayout()
        reconfigureRows()
    }

    // MARK: Rows

    override func refreshContent() {
        var next: [String: (count: Int?, badge: ConfigBadge?)] = [:]
        for section in ConfigSections.all {
            next[section.slug] = (section.count?(hub), section.badge(section, hub))
        }
        drawn = next
    }

    override func drawContent() {
        reconfigureRows()
    }

    private func reconfigureRows() {
        guard let source else { return }
        var snapshot = source.snapshot()
        snapshot.reconfigureItems(snapshot.itemIdentifiers)
        source.apply(snapshot, animatingDifferences: false)
        if let shown, let path = source.indexPath(for: shown) {
            collection.selectItem(at: path, animated: false, scrollPosition: [])
        }
    }

    private func configure(_ cell: UICollectionViewListCell, slug: String) {
        guard let section = ConfigSections.section(slug) else { return }
        let compact = compact
        let state = drawn[slug]
        cell.contentConfiguration = SectionRowConfiguration(glyph: section.glyph, hue: section.hue, label: section.label,
                                                            counted: section.count != nil, count: state?.count, badge: state?.badge)
        cell.accessories = compact ? [.disclosureIndicator(options: .init(tintColor: Palette.inkSubtle))] : []
        cell.configurationUpdateHandler = { cell, state in
            var background = UIBackgroundConfiguration.listCell()
            if compact {
                background.backgroundColor = state.isHighlighted || state.isSelected ? Palette.surfaceFill : Palette.surfaceRaised
            } else {
                // The chosen row's apricot wash; a press tints, keyboard focus hovers.
                let fill: UIColor = if state.isSelected {
                    Palette.selectedBg
                } else if state.isHighlighted {
                    Palette.surfaceFill
                } else if state.isFocused {
                    Palette.surfaceHover
                } else {
                    .clear
                }
                background.backgroundColor = fill
                background.cornerRadius = Radius.radiusSm
            }
            cell.backgroundConfiguration = background
            if var content = cell.contentConfiguration as? SectionRowConfiguration {
                content.chosen = !compact && state.isSelected
                cell.contentConfiguration = content
            }
        }
        cell.accessibilityIdentifier = "config.row.\(slug)"
        cell.accessibilityLabel = section.label
        cell.accessibilityValue = [state?.count.map { "\($0)" }, state?.badge?.said].compactMap(\.self).joined(separator: ", ")
        cell.accessibilityTraits = .button
    }

    // MARK: Sections

    func collectionView(_: UICollectionView, didSelectItemAt path: IndexPath) {
        guard let slug = source.itemIdentifier(for: path) else { return }
        open(slug)
    }

    /// Opens a section: beside the rail, or pushed over the list.
    func open(_ slug: String) {
        guard let section = ConfigSections.section(slug) else { return }
        ConfigSections.last = slug
        if compact {
            navigationController?.pushViewController(screen(section), animated: true)
        } else {
            show(slug, animated: true)
        }
    }

    private func screen(_ section: ConfigSection) -> UIViewController {
        if let kept = screens[section.slug] { return kept }
        let made = section.make(section, context)
        screens[section.slug] = made
        return made
    }

    /// The section beside the rail. A change of section rises or drops 4%
    /// over 140ms on the drawer curve while the rail holds still (DESIGN.md Pages).
    private func show(_ slug: String, animated: Bool) {
        guard slug != shown, let section = ConfigSections.section(slug) else { return }
        let order = ConfigSections.all.map(\.slug)
        let down = (order.firstIndex(of: slug) ?? 0) > (shown.flatMap(order.firstIndex) ?? 0)
        let leaving = shown.flatMap { screens[$0] }
        shown = slug
        let next = screen(section)
        addChild(next)
        next.view.translatesAutoresizingMaskIntoConstraints = false
        pane.addSubview(next.view)
        NSLayoutConstraint.activate([
            next.view.topAnchor.constraint(equalTo: pane.topAnchor),
            next.view.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            next.view.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            next.view.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
        ])
        next.didMove(toParent: self)
        if let path = source.indexPath(for: slug) { collection.selectItem(at: path, animated: animated, scrollPosition: []) }
        guard let leaving else { return }
        guard animated, !UIAccessibility.isReduceMotionEnabled else {
            unhost(leaving)
            guard animated else { return }
            next.view.alpha = 0
            Motion.easeDrawer.animator(Motion.durControl) { next.view.alpha = 1 }.startAnimation()
            return
        }
        let shift = pane.bounds.height * 0.04
        next.view.alpha = 0
        next.view.transform = CGAffineTransform(translationX: 0, y: down ? shift : -shift)
        leaving.view.isUserInteractionEnabled = false
        let move = Motion.easeDrawer.animator(0.14) {
            next.view.alpha = 1
            next.view.transform = .identity
            leaving.view.alpha = 0
            leaving.view.transform = CGAffineTransform(translationX: 0, y: down ? -shift : shift)
        }
        move.addCompletion { [weak self] _ in
            MainActor.assumeIsolated {
                leaving.view.transform = .identity
                leaving.view.alpha = 1
                leaving.view.isUserInteractionEnabled = true
                self?.unhost(leaving)
            }
        }
        move.startAnimation()
    }

    private func unhost(_ screen: UIViewController) {
        guard screen.parent === self else { return }
        screen.willMove(toParent: nil)
        screen.view.removeFromSuperview()
        screen.removeFromParent()
    }
}

// MARK: Row

/// One row of the list (ConfigRail.svelte `.row`): the section's 22pt tile
/// with its glyph in its hue, its name in the label role, its badge, and
/// its count in tabular meta figures, three digits wide from the first
/// paint so the dash that stands in until the count is read holds its box.
private struct SectionRowConfiguration: UIContentConfiguration {
    let glyph: Glyph
    let hue: UIColor
    let label: String
    let counted: Bool
    let count: Int?
    let badge: ConfigBadge?
    var chosen = false

    func makeContentView() -> any UIView & UIContentView { SectionRowView(self) }
    func updated(for _: any UIConfigurationState) -> SectionRowConfiguration { self }
}

private final class SectionRowView: UIView, UIContentView {
    private let tile = TileView(radius: Radius.radiusXs)
    private let mark = GlyphView(.settings, size: 14)
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
    private let badge = KitLabel(TypeScale.typeMeta, ink: Palette.statusAttnInk)
    private let badgeBox = UIView()
    private let count = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var height: NSLayoutConstraint!
    private var current: SectionRowConfiguration

    var configuration: any UIContentConfiguration {
        get { current }
        set {
            guard let next = newValue as? SectionRowConfiguration else { return }
            current = next
            draw()
        }
    }

    init(_ configuration: SectionRowConfiguration) {
        current = configuration
        super.init(frame: .zero)
        tile.backgroundColor = Palette.surfaceTile
        mark.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(mark)
        badgeBox.backgroundColor = Palette.statusAttnBg
        badgeBox.layer.cornerRadius = Radius.radiusXs
        badgeBox.translatesAutoresizingMaskIntoConstraints = false
        badge.translatesAutoresizingMaskIntoConstraints = false
        badge.tabular = true
        badgeBox.addSubview(badge)
        count.tabular = true
        count.textAlignment = .right
        let zero = ("000" as NSString).size(withAttributes: [.font: TypeScale.typeMeta.font]).width
        let row = UIStackView(arrangedSubviews: [tile, name, badgeBox, count])
        row.spacing = Space.space3
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        name.setContentHuggingPriority(.defaultLow, for: .horizontal)
        addSubview(row)
        height = heightAnchor.constraint(equalToConstant: Size.cRailRowH)
        height.priority = .required - 1
        NSLayoutConstraint.activate([
            tile.widthAnchor.constraint(equalToConstant: 22),
            tile.heightAnchor.constraint(equalToConstant: 22),
            mark.centerXAnchor.constraint(equalTo: tile.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
            badgeBox.heightAnchor.constraint(equalToConstant: 18),
            badgeBox.widthAnchor.constraint(greaterThanOrEqualToConstant: 18),
            badge.leadingAnchor.constraint(equalTo: badgeBox.leadingAnchor, constant: 5),
            badge.trailingAnchor.constraint(equalTo: badgeBox.trailingAnchor, constant: -5),
            badge.centerYAnchor.constraint(equalTo: badgeBox.centerYAnchor),
            count.widthAnchor.constraint(greaterThanOrEqualToConstant: zero),
            row.leadingAnchor.constraint(equalTo: layoutMarginsGuide.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: layoutMarginsGuide.trailingAnchor),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            height,
        ])
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (view: SectionRowView, _: UITraitCollection) in view.draw() }
        draw()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SectionRowView is built in code")
    }

    private func draw() {
        // The list's touch height on a phone (`[data-variant="list"] .row`: 48px), the rail's own beside a section.
        height.constant = traitCollection.horizontalSizeClass == .compact ? 48 : Size.cRailRowH
        directionalLayoutMargins = traitCollection.horizontalSizeClass == .compact
            ? .init(top: 0, leading: Space.space4, bottom: 0, trailing: 0)
            : .init(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space3)
        mark.glyph = current.glyph
        mark.tintColor = current.hue
        name.text = current.label
        name.ink = current.chosen ? Palette.selectedInk : Palette.inkRow
        badge.text = current.badge.map { "\($0.count)" }
        badgeBox.isHidden = current.badge == nil
        count.isHidden = !current.counted
        count.text = current.count.map { "\($0)" } ?? "—"
        count.ink = current.chosen ? Palette.selectedInk : Palette.inkMuted
    }
}
