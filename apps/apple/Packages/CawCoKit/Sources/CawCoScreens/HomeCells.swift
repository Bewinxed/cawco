import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

// The home's cells, one per kind of line the web home draws (home/*.svelte).
// Each is built once and configured from the model on every update.

/// A cell whose content is one view pinned to its content view's edges. A
/// list cell, so a finished row takes the list's own swipe to archive.
class HomeCell: UICollectionViewListCell {
    /// The home's own ground, which its variant names (the page's recess, the
    /// rail's sidebar): a line that arrives or leaves beneath a cell is
    /// uncovered or covered as it slides, never drawn through (HomeLayout).
    var ground: UIColor = Palette.surfaceRecess {
        didSet { if ground != oldValue { paintGround() } }
    }

    private func paintGround() {
        var background = UIBackgroundConfiguration.clear()
        background.backgroundColor = ground
        backgroundConfiguration = background
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
        contentView.clipsToBounds = false
        paintGround()
        indentationWidth = 0
        separatorLayoutGuide.leadingAnchor.constraint(equalTo: trailingAnchor).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("Home cells are built in code")
    }

    /// The pill a press tints (app.css `.press-tint`): it fills with
    /// `surface-fill` while the finger is down, at once, as `:active` does.
    var pressTarget: UIView? {
        didSet {
            pressTarget?.layer.cornerRadius = Radius.radiusSm
            pressTarget?.layer.cornerCurve = .continuous
        }
    }

    override func updateConfiguration(using state: UICellConfigurationState) {
        super.updateConfiguration(using: state)
        pressTarget?.backgroundColor = state.isHighlighted ? Palette.surfaceFill : nil
    }

    func pin(_ view: UIView, insets: NSDirectionalEdgeInsets = .zero) {
        view.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(view)
        let bottom = view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -insets.bottom)
        bottom.priority = .required - 1
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: insets.leading),
            view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -insets.trailing),
            view.topAnchor.constraint(equalTo: contentView.topAnchor, constant: insets.top),
            bottom,
        ])
    }
}

extension UIButton {
    /// app.css `.press-tint` on a plain button: its 8pt pill fills with
    /// `surface-fill` while pressed, at once.
    func pressTint() {
        configuration?.background.cornerRadius = Radius.radiusSm
        configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : .clear
        }
    }
}

// MARK: Top

/// The line every other line on the home is believed by (StatusLine.svelte).
final class StatusCell: HomeCell {
    let line = StatusLineView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        pin(line)
    }
}

/// "N need(s) you", by its spark: the loudest thing on the screen.
final class HeadlineCell: HomeCell {
    private let spark = UIView()
    private let words = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
    private var count = -1
    private var sparkSide: [NSLayoutConstraint] = []

    /// In the rail (Home.svelte `.rail .headline`, `.rail .spark`): the label
    /// role at the body's size, and a 22pt spark at the small radius.
    var rail = false {
        didSet {
            guard rail != oldValue else { return }
            words.role = rail ? TypeScale.typeLabel.with(points: TypeScale.textBody) : TypeScale.typeTitle
            words.tracking = rail ? 0 : TypeScale.trackTitle
            for side in sparkSide { side.constant = rail ? 22 : 28 }
            spark.layer.cornerRadius = rail ? Radius.radiusXs : Radius.radiusSm
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        spark.backgroundColor = Palette.statusAttnBg
        spark.layer.cornerRadius = Radius.radiusSm
        spark.layer.cornerCurve = .continuous
        spark.translatesAutoresizingMaskIntoConstraints = false
        let glyph = GlyphView(.attention, size: Size.iconMd, tint: Palette.statusAttnInk)
        spark.addSubview(glyph)
        let row = UIStackView(arrangedSubviews: [spark, words])
        row.spacing = Space.space2
        row.alignment = .center
        pin(row)
        sparkSide = [spark.widthAnchor.constraint(equalToConstant: 28), spark.heightAnchor.constraint(equalToConstant: 28)]
        NSLayoutConstraint.activate(sparkSide + [
            glyph.centerXAnchor.constraint(equalTo: spark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: spark.centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .header
    }

    func configure(count: Int) {
        guard count != self.count else {
            return
        }
        let first = self.count < 0
        self.count = count
        let text = "\(count) need\(count == 1 ? "s" : "") you"
        accessibilityLabel = text
        // The words morph at the pace a button's width follows its label (`--dur-morph`).
        if first || UIAccessibility.isReduceMotionEnabled {
            words.text = text
        } else {
            UIView.transition(with: words, duration: Motion.durMorph, options: .transitionCrossDissolve) {
                self.words.text = text
            }
        }
    }
}

// MARK: Needs you

/// One thing parked on the operator (NeedsCard.svelte): whose it is, how long
/// it has waited, where it runs and what it asks. A permission is answered
/// here, Deny and Approve as equal recessed peers at opposite ends; the
/// answer's stage is said under them until the session has taken it.
final class NeedsCardCell: HomeCell {
    private let tile = TileView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let waited = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let place = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let ask = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 2)
    private let stage = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let actions = UIStackView()
    private var deny: UIButton!
    private var approve: UIButton!
    private var open: UIButton!
    var onAnswer: (NeedsYouStore.Answer) -> Void = { _ in }
    var onOpen: () -> Void = {}
    /// Glance → peek → dive: read what led here before answering.
    var onPeek: () -> Void = {}
    private let peek = RowActionButton(.maximize)
    /// Peek's room in the head: its 28pt less the 8pt it reaches into the card's padding.
    private let peekRoom = UIView()
    private var headBox: UIView!
    private var headTall: NSLayoutConstraint!

    override init(frame: CGRect) {
        super.init(frame: frame)
        peek.addAction(UIAction { [weak self] _ in self?.onPeek() }, for: .touchUpInside)
        ask.wrap = .pretty
        deny = KitButton.make("Deny", glyph: .close, glyphTint: Palette.inkMuted, variant: .secondary, height: .sm) { [weak self] in
            self?.onAnswer(.deny)
        }
        approve = KitButton.make("Approve", glyph: .tick, glyphTint: Palette.inkStrong, variant: .secondary, height: .sm) { [weak self] in
            self?.onAnswer(.allow)
        }
        open = KitButton.make("Answer", variant: .secondary, height: .sm) { [weak self] in self?.onOpen() }
        waited.tabular = true
        waited.setContentHuggingPriority(.required, for: .horizontal)
        waited.setContentCompressionResistancePriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [title, waited, peekRoom])
        head.spacing = Space.space2
        // The web's head starts its title and its wait on one top edge.
        head.alignment = .top
        actions.addArrangedSubview(deny)
        actions.addArrangedSubview(UIView())
        actions.addArrangedSubview(approve)
        actions.addArrangedSubview(open)
        actions.spacing = Space.space8
        actions.distribution = .equalSpacing
        // The head's line is as tall as what stands on it: Peek's 28pt less the
        // 4pt it gives back above and below (`margin: -4px`), where it is shown.
        let headBox = UIView()
        head.translatesAutoresizingMaskIntoConstraints = false
        headBox.addSubview(head)
        headTall = headBox.heightAnchor.constraint(greaterThanOrEqualToConstant: RowActionButton.side - 8)
        let hugs = headBox.bottomAnchor.constraint(equalTo: head.bottomAnchor)
        // Weaker than the labels' own hugging: the head keeps its text's height at the top of the taller line.
        hugs.priority = UILayoutPriority(100)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: headBox.topAnchor),
            head.leadingAnchor.constraint(equalTo: headBox.leadingAnchor),
            head.trailingAnchor.constraint(equalTo: headBox.trailingAnchor),
            headBox.bottomAnchor.constraint(greaterThanOrEqualTo: head.bottomAnchor),
            hugs,
        ])
        self.headBox = headBox
        let column = UIStackView(arrangedSubviews: [headBox, place, ask, actions, stage])
        column.axis = .vertical
        column.spacing = Space.space1
        column.setCustomSpacing(Space.space1 * 2, after: ask)
        column.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(column)
        // Peek stands over the head, in the tile: it and its room share the tile only once the column is in it.
        tile.addSubview(peek)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space4),
            column.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space4),
            column.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
            peekRoom.widthAnchor.constraint(equalToConstant: RowActionButton.side - Space.space2),
            peekRoom.heightAnchor.constraint(equalToConstant: 1),
            peek.trailingAnchor.constraint(equalTo: peekRoom.trailingAnchor, constant: Space.space2),
            peek.centerYAnchor.constraint(equalTo: headBox.centerYAnchor),
        ])
        pin(tile)
    }

    func configure(_ item: HomeModel.NeedsItem, now: Double, sent: Ledger.Command?, stale: Bool) {
        title.text = item.title
        waited.text = item.raisedAt.map { "waiting \(Naming.span(ms: now - $0))" } ?? "waiting"
        place.text = item.place
        let peeks = if case .ask = item.kind { true } else { false }
        peek.isHidden = !peeks
        peekRoom.isHidden = !peeks
        headTall.isActive = peeks
        peek.accessibilityLabel = "Peek \(item.title)"
        switch item.kind {
        case let .ask(parked):
            ask.text = parked.summary
            // A question is answered in its session; a permission here.
            actions.isHidden = false
            open.isHidden = !parked.isQuestion
            deny.isHidden = parked.isQuestion; approve.isHidden = parked.isQuestion
            KitButton.setTitle("Answer", of: open, variant: .secondary, height: .sm)
            deny.accessibilityLabel = "Deny \(parked.summary) on \(item.title)"
            approve.accessibilityLabel = "Approve \(parked.summary) on \(item.title)"
        case .run:
            // A run's question is answered in its run.
            ask.text = "Waiting on your answer"
            actions.isHidden = false
            deny.isHidden = true; approve.isHidden = true; open.isHidden = false
            KitButton.setTitle("Open", of: open, variant: .secondary, height: .sm)
        }
        let inFlight = sent.map { $0.stage != .failed } ?? false
        deny.isEnabled = !stale && !inFlight
        approve.isEnabled = !stale && !inFlight
        let words = Self.stageWords(sent)
        stage.isHidden = words == nil
        stage.text = words?.text
        stage.ink = words?.failed == true ? Palette.statusFailInk : Palette.inkMuted
        contentView.alpha = stale ? 0.55 : 1
    }

    /// The answer's stage, in the operator's words.
    static func stageWords(_ sent: Ledger.Command?) -> (text: String, failed: Bool)? {
        guard let sent else {
            return nil
        }
        switch sent.stage {
        case .submitted: return ("Sending…", false)
        case .accepted: return ("The hub has it — waiting for the session.", false)
        case .applied: return ("The session has it.", false)
        case .failed: return ("Couldn't send that answer.\(sent.reason.map { " \($0)" } ?? "")", true)
        }
    }
}

// MARK: Work tabs

/// The Working and Finished switch (WorkTabs.svelte's head): the folder tabs,
/// each count washed in its status ink, and the delegates switch at the end,
/// the section's seam under the row.
final class TabsCell: HomeCell {
    let tabs = FolderTabs(HomeModel.Tab.allCases.map { FolderTabs.Tab(label: $0.label) }, selected: 0)
    private let counts = [CountChip(), CountChip()]
    private let delegates = UIButton(type: .custom)
    private let delegatesGlyph = GlyphView(.structure, size: Size.iconMd)
    var onTab: (HomeModel.Tab) -> Void = { _ in }
    var onDelegates: () -> Void = {}

    /// How far under 260pt the rail is (WorkTabs.svelte `--tight`); none on the page.
    var tight = 0.0 {
        didSet {
            guard tight != oldValue else { return }
            tabs.tight = tight
            for chip in counts { chip.tight = tight }
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        for (index, chip) in counts.enumerated() {
            tabs.setTrail(chip, at: index)
        }
        tabs.onChoose = { [weak self] index in
            self?.onTab(HomeModel.Tab.allCases[index])
        }
        delegates.translatesAutoresizingMaskIntoConstraints = false
        delegates.addSubview(delegatesGlyph)
        delegates.houseStyle()
        delegates.addAction(UIAction { [weak self] _ in self?.onDelegates() }, for: .primaryActionTriggered)
        delegates.accessibilityLabel = "Delegates"
        let seam = UIView()
        seam.backgroundColor = Palette.seam
        seam.translatesAutoresizingMaskIntoConstraints = false
        for view in [tabs, delegates, seam] as [UIView] {
            contentView.addSubview(view)
        }
        NSLayoutConstraint.activate([
            tabs.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            // `.head`'s 4pt and the tab list's own 4pt above its tabs.
            tabs.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Space.space1 * 2),
            tabs.bottomAnchor.constraint(equalTo: seam.topAnchor),
            delegates.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Space.space2),
            delegates.bottomAnchor.constraint(equalTo: seam.topAnchor, constant: -2),
            delegates.widthAnchor.constraint(equalToConstant: 28),
            delegates.heightAnchor.constraint(equalToConstant: 28),
            delegatesGlyph.centerXAnchor.constraint(equalTo: delegates.centerXAnchor),
            delegatesGlyph.centerYAnchor.constraint(equalTo: delegates.centerYAnchor),
            seam.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            seam.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            seam.heightAnchor.constraint(equalToConstant: 1),
            seam.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -Space.space1),
        ])
    }

    func configure(tab: HomeModel.Tab, working: Int, finished: Int, finishedFailed: Bool, delegatesOn: Bool) {
        tabs.select(tab == .working ? 0 : 1, animated: window != nil)
        counts[0].configure(count: working, ink: Palette.statusLiveInk, wash: Palette.countWashLive, chosen: tab == .working, failed: false)
        counts[1].configure(
            count: finished,
            ink: finishedFailed ? Palette.statusFailInk : Palette.statusDoneInk,
            wash: finishedFailed ? Palette.countWashFail : Palette.countWashDone,
            chosen: tab == .finished,
            failed: finishedFailed
        )
        delegatesGlyph.glyph = delegatesOn ? .structureOn : .structure
        delegatesGlyph.tintColor = delegatesOn ? Palette.inkStrong : Palette.inkMuted
        delegates.accessibilityValue = delegatesOn ? "Shown" : "Hidden"
    }

    /// The strip where a swipe has it: the sheet `progress` of the way from
    /// `from` to `to`, each count washed while its tab is the nearer.
    func scrub(from: HomeModel.Tab, to: HomeModel.Tab, progress: Double) {
        let a = from == .working ? 0 : 1
        let b = to == .working ? 0 : 1
        tabs.scrub(from: a, to: b, progress: progress)
        counts[a].choose(progress < 0.5)
        counts[b].choose(progress >= 0.5)
    }
}

/// A tab's count, washed in its status ink on the chosen tab; it pops as it changes.
final class CountChip: UIView {
    private let figure = KitLabel(TypeScale.typeMeta)
    private var count = -1
    private var sides: [NSLayoutConstraint] = []

    /// WorkTabs.svelte `.count`: `padding-inline: 3px − tight × 0.03`.
    var tight = 0.0 {
        didSet {
            let pad = 3 - tight * 0.03
            sides[0].constant = pad
            sides[1].constant = -pad
        }
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        figure.tabular = true
        figure.textAlignment = .center
        addSubview(figure)
        sides = [
            figure.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 3),
            figure.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -3),
        ]
        NSLayoutConstraint.activate(sides + [
            figure.centerYAnchor.constraint(equalTo: centerYAnchor),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 18),
            heightAnchor.constraint(equalToConstant: 18),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CountChip is built in code")
    }

    /// `wash`: its tab's `count-wash-*`, shown on the chosen tab only.
    private var ink = Palette.inkMuted
    private var wash = UIColor.clear
    private var failed = false

    func configure(count: Int, ink: UIColor, wash: UIColor, chosen: Bool, failed: Bool) {
        self.ink = ink
        self.wash = wash
        self.failed = failed
        choose(chosen)
        guard count != self.count else {
            return
        }
        let popping = self.count >= 0 && !UIAccessibility.isReduceMotionEnabled
        self.count = count
        figure.text = "\(count)"
        if popping {
            Reflow.pop(figure)
        }
    }

    /// Washed in its status ink while its tab is chosen.
    func choose(_ chosen: Bool) {
        figure.ink = chosen || failed ? ink : Palette.inkMuted
        backgroundColor = chosen ? wash : .clear
    }
}

/// Where a machine's rows run, said once above them; a seam above a group
/// that follows another with rows.
final class MachineCell: HomeCell {
    private let glyph = GlyphView(.server, size: 14)
    private let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let seam = UIView()
    private let archiveAll = UIButton(type: .custom)
    /// Archives everything this machine has finished, failures too.
    var onArchiveAll: () -> Void = {}

    override init(frame: CGRect) {
        super.init(frame: frame)
        var config = UIButton.Configuration.plain()
        config.image = Glyph.archive.image.resized(to: 14)
        config.imagePadding = Space.space1
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        config.attributedTitle = AttributedString("Archive all", attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
        archiveAll.configuration = config
        archiveAll.houseStyle()
        archiveAll.pressTint()
        archiveAll.addAction(UIAction { [weak self] _ in self?.onArchiveAll() }, for: .primaryActionTriggered)
        let row = UIStackView(arrangedSubviews: [glyph, name, UIView(), archiveAll])
        row.spacing = Space.space1
        row.alignment = .center
        archiveAll.heightAnchor.constraint(equalToConstant: 22).isActive = true
        // Its 4pt foot is the first row's own gap above it (`--tree-gap`): every row keeps one.
        pin(row, insets: NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: 0, trailing: Space.space3))
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: 22).isActive = true
        seam.backgroundColor = Palette.seam
        seam.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(seam)
        NSLayoutConstraint.activate([
            seam.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            seam.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            seam.topAnchor.constraint(equalTo: contentView.topAnchor),
            seam.heightAnchor.constraint(equalToConstant: 1),
        ])
        name.accessibilityTraits = .header
        archiveAll.accessibilityLabel = "Archive all"
    }

    /// `archivable`: what "Archive all" would take; none hides it.
    func configure(_ group: HomeModel.MachineGroup, seam showsSeam: Bool, archivable: Int) {
        glyph.glyph = Glyph.os(group.os)
        name.text = group.name
        seam.isHidden = !showsSeam
        archiveAll.isHidden = archivable == 0
        archiveAll.accessibilityLabel = "Archive all finished on \(group.name)"
    }
}

/// A 28pt control at a row's or a card's end (HomeRow.svelte `.peek`,
/// NeedsCard.svelte `.peek`): a 16pt glyph in muted ink at `--radius-xs`, a
/// finger's 44pt around it. Under a pointer it fills and its ink turns strong.
final class RowActionButton: UIControl {
    static let side = 28.0
    private let glyph: GlyphView
    /// What it fills with at rest: nothing on a touch screen, the row's hover wash where it rises over the row.
    var rest: UIColor? {
        didSet { paint() }
    }

    private var over = false {
        didSet { paint() }
    }

    init(_ icon: Glyph) {
        glyph = GlyphView(icon, size: Size.iconMd, tint: Palette.inkMuted)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        glyph.isUserInteractionEnabled = false
        addSubview(glyph)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Self.side),
            heightAnchor.constraint(equalToConstant: Self.side),
            glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RowActionButton is built in code")
    }

    /// `.touch-hit`: a 44pt target centred on the 28pt box.
    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        let reach = traitCollection.userInterfaceIdiom == .mac ? 0 : (44 - Self.side) / 2
        return bounds.insetBy(dx: -reach, dy: -reach).contains(point)
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        over = hover.state == .began || hover.state == .changed
    }

    private func paint() {
        let lit = over || isHighlighted
        backgroundColor = lit ? Palette.surfaceFill : rest
        glyph.tintColor = lit ? Palette.inkStrong : Palette.inkMuted
    }
}

/// What stands at a session row's end beside the row itself (HomeRow.svelte):
/// Peek, for a live session, and on a pointer Archive, for a finished one.
/// A touch screen always shows Peek, in its own room after the row; a
/// pointer finds both on hover, risen over the row's words a step left of
/// its trailing column.
@MainActor
final class RowActions: NSObject {
    let peek = RowActionButton(.maximize)
    let archive = RowActionButton(.archive)
    var onPeek: () -> Void = {}
    var onArchive: () -> Void = {}
    private let pointer: Bool
    private let rowEnds: NSLayoutConstraint
    private let rowYields: NSLayoutConstraint

    /// `rowEnds`: the row's own trailing constraint to its cell, which Peek's room replaces on a touch screen.
    init(cell: HomeCell, row: SessionRowView, rowEnds: NSLayoutConstraint) {
        pointer = cell.traitCollection.userInterfaceIdiom == .mac
        self.rowEnds = rowEnds
        rowYields = row.trailingAnchor.constraint(equalTo: peek.leadingAnchor)
        super.init()
        let content = cell.contentView
        for button in [archive, peek] {
            content.addSubview(button)
            button.centerYAnchor.constraint(equalTo: row.centerYAnchor).isActive = true
            button.isHidden = true
        }
        peek.addAction(UIAction { [weak self] _ in self?.onPeek() }, for: .touchUpInside)
        archive.addAction(UIAction { [weak self] _ in self?.onArchive() }, for: .touchUpInside)
        // Archive stands a step before Peek wherever Peek is; a finger never sees it, and it still has a place.
        archive.trailingAnchor.constraint(equalTo: peek.leadingAnchor, constant: -Space.space1).isActive = true
        if pointer {
            // They take no room until wanted: block-centred on the row, a step left of the trailing column.
            peek.trailingAnchor.constraint(equalTo: row.end.leadingAnchor, constant: -Space.space1).isActive = true
            for button in [archive, peek] {
                button.rest = Palette.surfaceHover
                button.alpha = 0
            }
            content.addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        } else {
            peek.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -Space.space2).isActive = true
        }
    }

    func configure(title: String, peeks: Bool, archives: Bool) {
        peek.isHidden = !peeks
        peek.accessibilityLabel = "Peek \(title)"
        // A finger swipes the row away instead: no button for it.
        archive.isHidden = !(archives && pointer)
        archive.accessibilityLabel = "Archive \(title)"
        let yields = peeks && !pointer
        if yields {
            rowEnds.isActive = false
            rowYields.isActive = true
        } else {
            rowYields.isActive = false
            rowEnds.isActive = true
        }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let over = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durControl) { [peek, archive] in
            peek.alpha = over ? 1 : 0
            archive.alpha = over ? 1 : 0
        }.startAnimation()
    }
}

/// One session in a home group (HomeRow.svelte), at its depth in its tree,
/// with its share of the nesting lines.
final class RowCell: HomeCell {
    let row = SessionRowView()
    private(set) var actions: RowActions!
    /// Its elbow (down from the rail above, round its corner, out to its
    /// glyph), the rail on past it, and each ancestor's rail through it: each
    /// its own stroke, so a tree's fold can draw each as far as its line's head.
    private let elbow = CAShapeLayer()
    private let onward = CAShapeLayer()
    private var rails: [Int: CAShapeLayer] = [:]
    private let room = CALayer()
    private let wipe = CALayer()
    private var lead: NSLayoutConstraint!
    private var shape = NestShape(depth: 0, first: false, last: true, through: [])

    override init(frame: CGRect) {
        super.init(frame: frame)
        for layer in [elbow, onward] {
            Self.stroke(layer)
            contentView.layer.addSublayer(layer)
        }
        room.backgroundColor = UIColor.black.cgColor
        wipe.backgroundColor = UIColor.black.cgColor
        row.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(row)
        lead = row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor)
        let bottom = row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        bottom.priority = .required - 1
        let ends = row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor)
        NSLayoutConstraint.activate([
            lead,
            ends,
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Nest.gap),
            bottom,
        ])
        actions = RowActions(cell: self, row: row, rowEnds: ends)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: RowCell, _: UITraitCollection) in
            cell.paintNest()
        }
        paintNest()
        pressTarget = row
    }

    func configure(depth: Int, first: Bool, last: Bool, through: [Int]) {
        lead.constant = Double(depth) * Nest.indent
        shape = NestShape(depth: depth, first: first, last: last, through: through)
        for (depth, layer) in rails where !through.contains(depth) {
            layer.removeFromSuperlayer()
            rails[depth] = nil
        }
        for depth in through where rails[depth] == nil {
            let layer = CAShapeLayer()
            Self.stroke(layer)
            layer.strokeColor = elbow.strokeColor
            contentView.layer.addSublayer(layer)
            rails[depth] = layer
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let height = contentView.bounds.height
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for layer in [elbow, onward] + rails.values {
            layer.frame = contentView.bounds
        }
        elbow.path = shape.elbow()
        onward.path = shape.onward(height: height)
        for (depth, layer) in rails {
            layer.path = shape.rail(depth, height: height)
        }
        CATransaction.commit()
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        rest()
    }

    private static func stroke(_ layer: CAShapeLayer) {
        layer.fillColor = nil
        layer.lineWidth = 1
    }

    /// The nesting lines' ink (`nest-ink`).
    private func paintNest() {
        let ink = Palette.nestInk.resolvedColor(with: traitCollection).cgColor
        for layer in [elbow, onward] + rails.values {
            layer.strokeColor = ink
        }
    }

    // MARK: A tree's fold (Branch)

    /// How far (0–1) each stretch of its line is drawn: its elbow, the rail
    /// on past it, and each ancestor's rail through it, by depth.
    func drawNest(elbow drawn: Double, onward on: Double, through: [Int: Double]) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        elbow.strokeEnd = drawn
        onward.strokeEnd = on
        for (depth, layer) in rails {
            layer.strokeEnd = through[depth] ?? 1
        }
        CATransaction.commit()
    }

    /// How far in (0–1) its glyph has flown from the row's left edge, and its
    /// title has wiped in left to right past its glyph.
    func reveal(glyph: Double, title: Double) {
        let mark = row.mark
        mark.alpha = glyph
        mark.transform = glyph >= 1 ? .identity : CGAffineTransform(translationX: -Space.space3 * (1 - glyph), y: 0)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if title >= 1 {
            row.layer.mask = nil
        } else {
            let bounds = row.bounds
            let past = Space.space3 + Size.rowMarkBox
            wipe.frame = CGRect(x: 0, y: -bounds.height, width: past + (bounds.width - past) * title, height: bounds.height * 3)
            row.layer.mask = wipe
        }
        CATransaction.commit()
    }

    /// The room a tree's fold has open over this row: only its top `height`
    /// shows (what is above its top, its elbow up to the parent, always shows).
    func clip(below height: Double) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if height >= bounds.height {
            layer.mask = nil
        } else {
            let width = bounds.width
            room.frame = CGRect(x: -width, y: -bounds.height * 2, width: width * 3, height: bounds.height * 2 + max(0, height))
            layer.mask = room
        }
        CATransaction.commit()
    }

    /// Every piece back at rest: drawn, in, uncovered.
    func rest() {
        drawNest(elbow: 1, onward: 1, through: [:])
        reveal(glyph: 1, title: 1)
        clip(below: .infinity)
    }
}

/// The tree's geometry (app.css `.kit-nest`, measured off a home row): the
/// rail runs down from the parent's glyph centre, round an elbow of
/// `radiusSm`, out along its arm to the child's glyph.
enum Nest {
    /// The rail's x from a row's left edge: the row's inset plus half its glyph.
    static var railX: Double { Space.space3 + Size.rowMarkBox / 2 }
    /// How far each level is set in from the one above it, mark to mark (`--tree-step`): the same in every tree.
    static var step: Double { Space.space1 + Space.space2 + Space.space3 }
    /// From the rail to the child row's left edge (`--nest-in`): what is left
    /// of one step after the half mark the rail stands under and the row's own inset.
    static var nestIn: Double { step - Size.rowMarkBox / 2 - Space.space3 }
    /// Between the rows of a tree, and between a parent and its first child (`--tree-gap`).
    static var gap: Double { Space.space1 }
    /// Each depth sets its rows in by this.
    static var indent: Double { railX + nestIn }
    static var rowHeight: Double { Size.cBtnHLg }
}

/// One row's share of the nesting lines: its elbow from the rail above to
/// its glyph, its rail on to its next sibling, and every ancestor's rail
/// that passes it on the way to a later sibling.
struct NestShape {
    let depth: Int
    let first: Bool
    let last: Bool
    let through: [Int]

    private var rail: Double { Double(depth - 1) * Nest.indent + Nest.railX }

    /// Its elbow: down the rail from the row above (a first child's from its
    /// parent's glyph foot), round a circular corner, out along its arm to its glyph.
    func elbow() -> CGPath? {
        guard depth > 0 else {
            return nil
        }
        let glyphY = BranchShape.glyphY
        let radius = BranchShape.radius
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rail, y: BranchShape.elbowTop(first: first)))
        path.addLine(to: CGPoint(x: rail, y: glyphY - radius))
        path.addArc(withCenter: CGPoint(x: rail + radius, y: glyphY - radius), radius: radius, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
        path.addLine(to: CGPoint(x: Double(depth) * Nest.indent + Space.space3, y: glyphY))
        return path.cgPath
    }

    /// The rail on past it, to its next sibling.
    func onward(height: Double) -> CGPath? {
        guard depth > 0, !last else {
            return nil
        }
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rail, y: BranchShape.glyphY - BranchShape.radius))
        path.addLine(to: CGPoint(x: rail, y: height))
        return path.cgPath
    }

    /// An ancestor's rail passing it on the way to a later sibling.
    func rail(_ ancestor: Int, height: Double) -> CGPath {
        let x = Double(ancestor - 1) * Nest.indent + Nest.railX
        let path = UIBezierPath()
        path.move(to: CGPoint(x: x, y: 0))
        path.addLine(to: CGPoint(x: x, y: height))
        return path.cgPath
    }
}

/// One session's row (home/HomeRow.svelte): its mark, the rim saying what it
/// is doing, the status word read out with the title; under the title, the
/// project and what it is doing now; at the end its age and, on a parent,
/// the count of the rows under it. A finger keeps its 44pt.
final class SessionRowView: UIView, HoverSessionRow {
    private var pointer: PointerSurface?
    let mark = SessionMarkView()
    private let title = KitLabel(TypeScale.typeLabel)
    private let trail = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    /// The second cell of the trailing column (SessionRow.svelte's empty `.cell`): it keeps the line's height and no width.
    private let noCount = UIView()
    /// The trailing column (`.end`): what rises over the row's end on a pointer stands left of it.
    let end = UIStackView()
    private var status = MarkStatus.idle

    init() {
        super.init(frame: .zero)
        pointer = PointerSurface(self)
        trail.tabular = true
        trail.setContentHuggingPriority(.required, for: .horizontal)
        trail.setContentCompressionResistancePriority(.required, for: .horizontal)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        line.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        // Two lines of words, and at the row's end the age, on the title's
        // line, flush with the row's trailing edge. A parent's count is on its
        // mark, which opens its rows.
        let words = UIStackView(arrangedSubviews: [title, line])
        words.axis = .vertical
        end.axis = .vertical
        end.alignment = .trailing
        for cell in [trail, noCount] as [UIView] { end.addArrangedSubview(cell) }
        end.setContentHuggingPriority(.required, for: .horizontal)
        end.setContentCompressionResistancePriority(.required, for: .horizontal)
        let body = UIStackView(arrangedSubviews: [mark, words, end])
        body.spacing = Space.space2
        // The row's gap is a mark's; words and what trails them sit closer.
        body.setCustomSpacing(Space.space1, after: words)
        body.alignment = .center
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        let thin = noCount.widthAnchor.constraint(equalToConstant: 0)
        thin.priority = .defaultHigh
        NSLayoutConstraint.activate([
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            body.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            body.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            title.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
            trail.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
            noCount.heightAnchor.constraint(equalToConstant: Space.space5),
            thin,
        ])
        // The row reads as one element (status word, title, line, age), and a
        // parent's count is a second one, its own button.
        isAccessibilityElement = false
        accessibilityElements = [summary]
        // The row is the session menu's trigger (SessionRow.svelte): a
        // long-press under a finger, a right-click under a pointer.
        ContextMenuHost.attach(to: self) { [weak self] copy in self?.menu?(copy) }
    }

    /// The session's menu, built as it opens from the fleet at that moment; nil where the row has none (a workflow run).
    var menu: ((@escaping ContextMenuHost.Copy) -> UIMenu?)?

    private lazy var summary = UIAccessibilityElement(accessibilityContainer: self)

    override func layoutSubviews() {
        super.layoutSubviews()
        summary.accessibilityFrameInContainerSpace = bounds
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SessionRowView is built in code")
    }

    /// Everything the row draws: two rows with equal content look the same.
    nonisolated struct Content: Hashable, Sendable {
        var id: String
        var place: String
        var status: MarkStatus
        var title: String
        var line = ""
        var trail = ""
        var fold: HomeModel.Fold?
        /// The parent of delegates the list shows, drawn so they hang off it.
        var context = false
        var stale = false
        /// The instance the row stands for, where it stands for one: the
        /// session a hover card opens from it (`data-hover-session={instance?.id}`).
        var hover: String?
        /// A finished row a pointer can archive from its end (`onarchive`).
        var archives = false
        /// The operator stopped it: its mark is an ended session's, so the word is where it differs (`statusWord`).
        var stopped = false
        /// Its place among its list's echoes and how many the list has (motion/echo).
        var beat = 0
        var beats = 1

        /// The session Peek shows: a live instance's. A workflow run has no
        /// tail of its own (its card is its steps), and a stored session no instance.
        var peek: String? { hover.flatMap { BoardRun.runId(of: $0) == nil ? $0 : nil } }
    }

    /// HomeRow.svelte's `data-hover-session`: the rail's session card opens over the home's rows too.
    private(set) var hoverSessionId: String?

    func configure(_ content: Content) {
        hoverSessionId = content.hover
        mark.beat = (content.beat, content.beats)
        mark.configure(id: content.id, place: content.place, status: content.status, count: content.fold?.count ?? 0, open: content.fold?.open ?? false)
        title.text = content.title
        title.ink = content.context ? Palette.inkMuted : Palette.inkStrong
        trail.text = content.trail
        line.text = content.line
        alpha = content.stale ? 0.55 : 1
        summary.accessibilityLabel = "\(content.stopped ? "Stopped" : content.status.word): \(content.title)"
        summary.accessibilityValue = [content.line, content.trail].filter { !$0.isEmpty }.joined(separator: ", ")
        // The row reads as one element, and a parent's mark is a second one, its own switch.
        accessibilityElements = [summary] + (mark.switchElement.map { [$0] } ?? [])
    }
}

/// A machine's last line: "Show N more", with the failures folded away, or "Show fewer".
final class MoreCell: HomeCell {
    let button = UIButton(type: .custom)

    override init(frame: CGRect) {
        super.init(frame: frame)
        button.contentHorizontalAlignment = .leading
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3)
        button.configuration = config
        button.houseStyle()
        button.pressTint()
        pin(button, insets: NSDirectionalEdgeInsets(top: Nest.gap, leading: 0, bottom: 0, trailing: 0))
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 28).isActive = true
    }

    func configure(words: String, failed: Int) {
        var title = AttributedString(words, attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
        if failed > 0 {
            title += AttributedString(" · \(failed) failed", attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.statusFailInk)))
        }
        button.configuration?.attributedTitle = title
    }
}

// MARK: Caw

/// Caw on a fleet with nothing in it yet, or while a machine has not
/// answered, and the line that says which.
final class CawCell: HomeCell {
    /// His place in the column; he is made when the cell is first configured, and again after
    /// he has left it (`leave(over:)`).
    private let place = UIView()
    private var caw: CawView?
    private let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)

    override init(frame: CGRect) {
        super.init(frame: frame)
        line.textAlignment = .center
        place.translatesAutoresizingMaskIntoConstraints = false
        let column = UIStackView(arrangedSubviews: [place, line])
        column.axis = .vertical
        column.alignment = .center
        column.spacing = Space.space2
        pin(column, insets: NSDirectionalEdgeInsets(top: Space.space4, leading: 0, bottom: Space.space4, trailing: 0))
        placeSide = [
            place.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            place.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
        ]
        NSLayoutConstraint.activate(placeSide)
    }

    private var placeSide: [NSLayoutConstraint] = []

    /// His size where he stands (Home.svelte: 160 on the page, 112 in the rail).
    var side = HomeViewController.cawSide {
        didSet {
            for constraint in placeSide { constraint.constant = side }
        }
    }

    /// The fleet has something in it now and this cell is going: he fades out over
    /// `container`, where the rows that arrive slide in under him.
    func leave(over container: UIView) {
        caw?.leave(over: container)
        caw = nil
    }

    func configure(line text: String, status: CawStatus) {
        if let caw {
            caw.status = status
        } else {
            let caw = CawView(status: status)
            caw.translatesAutoresizingMaskIntoConstraints = true
            caw.frame = place.bounds
            caw.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            place.addSubview(caw)
            self.caw = caw
        }
        guard text != line.text else {
            return
        }
        // The line's states share one cell and cross-fade.
        UIView.transition(with: line, duration: Motion.durControl, options: .transitionCrossDissolve) {
            self.line.text = text
        }
    }
}

// MARK: Recent

/// Recent's disclosure: its chevron turning, its count popping as it changes.
final class RecentHeadCell: HomeCell {
    private let chevron = GlyphView(.chevronRight, size: Size.iconSm)
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
    private let count = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var shown = -1

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.text = "Recent"
        count.tabular = true
        let chevronBox = UIView()
        chevronBox.translatesAutoresizingMaskIntoConstraints = false
        chevronBox.addSubview(chevron)
        let row = UIStackView(arrangedSubviews: [chevronBox, label, UIView(), count])
        row.spacing = Space.space1
        row.alignment = .center
        pin(row, insets: NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3))
        NSLayoutConstraint.activate([
            row.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
            chevronBox.widthAnchor.constraint(equalToConstant: Size.iconMd),
            chevronBox.heightAnchor.constraint(equalToConstant: Size.iconMd),
            chevron.centerXAnchor.constraint(equalTo: chevronBox.centerXAnchor),
            chevron.centerYAnchor.constraint(equalTo: chevronBox.centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        pressTarget = contentView
    }

    func configure(count total: Int, open: Bool) {
        let turn = CGAffineTransform(rotationAngle: open ? .pi / 2 : 0)
        if chevron.transform != turn {
            if window == nil || UIAccessibility.isReduceMotionEnabled {
                chevron.transform = turn
            } else {
                Motion.easeOut.animator(Motion.durControl) { self.chevron.transform = turn }.startAnimation()
            }
        }
        if total != shown {
            let popping = shown >= 0 && !UIAccessibility.isReduceMotionEnabled
            shown = total
            count.text = "\(total)"
            if popping {
                Reflow.pop(count)
            }
        }
        accessibilityLabel = "Recent, \(total)"
        accessibilityValue = open ? "Expanded" : "Collapsed"
    }
}

/// Recent's search field.
final class SearchCell: HomeCell {
    let field = UITextField()

    override init(frame: CGRect) {
        super.init(frame: frame)
        let glyph = GlyphView(.search, size: Size.iconMd)
        field.placeholder = "Search sessions…"
        field.font = TypeScale.typeBody.font
        field.adjustsFontForContentSizeCategory = true
        field.textColor = Palette.inkStrong
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.clearButtonMode = .whileEditing
        field.returnKeyType = .search
        field.accessibilityLabel = "Search recent sessions"
        let row = UIStackView(arrangedSubviews: [glyph, field])
        row.spacing = Space.space2
        row.alignment = .center
        pin(row, insets: NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3))
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
    }
}

/// A plain session row in Recent, or a line of words (no match).
final class RecentRowCell: HomeCell {
    let row = SessionRowView()
    private(set) var actions: RowActions!

    override init(frame: CGRect) {
        super.init(frame: frame)
        row.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(row)
        let bottom = row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        bottom.priority = .required - 1
        let ends = row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            ends,
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 2),
            bottom,
        ])
        actions = RowActions(cell: self, row: row, rowEnds: ends)
        pressTarget = row
    }
}

/// A line of words under a list: no match, or a button to show more.
final class NoteCell: HomeCell {
    let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.wrap = .pretty
        pin(label, insets: NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space3, bottom: Space.space1, trailing: Space.space3))
    }
}

/// An outline button under a list ("Show 30 more").
final class ButtonCell: HomeCell {
    private var button: UIButton?
    var onTap: () -> Void = {}

    func configure(title: String) {
        if let button {
            KitButton.setTitle(title, of: button, variant: .outline, height: .sm)
            return
        }
        let button = KitButton.make(title, variant: .outline, height: .sm) { [weak self] in
            self?.onTap()
        }
        contentView.addSubview(button)
        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            button.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Space.space1),
            button.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
        ])
        self.button = button
    }
}
