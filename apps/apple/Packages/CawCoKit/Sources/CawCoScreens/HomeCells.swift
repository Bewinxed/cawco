import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

// The home's cells, one per kind of line the web home draws (home/*.svelte).
// Each is built once and configured from the model on every update.

/// A cell whose content is one view pinned to its content view's edges. A
/// list cell, so a finished row takes the list's own swipe to archive.
class HomeCell: UICollectionViewListCell {
    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
        contentView.clipsToBounds = false
        // The page's own ground: a line that arrives or leaves beneath it is
        // uncovered or covered as it slides, never drawn through (HomeLayout).
        var ground = UIBackgroundConfiguration.clear()
        ground.backgroundColor = Palette.surfaceRecess
        backgroundConfiguration = ground
        indentationWidth = 0
        separatorLayoutGuide.leadingAnchor.constraint(equalTo: trailingAnchor).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("Home cells are built in code")
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
    private let words = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, tracking: TypeScale.trackTitle)
    private var count = -1

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
        NSLayoutConstraint.activate([
            spark.widthAnchor.constraint(equalToConstant: 28),
            spark.heightAnchor.constraint(equalToConstant: 28),
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
    var onAnswer: (NeedsYouStore.Answer) -> Void = { _ in }

    override init(frame: CGRect) {
        super.init(frame: frame)
        deny = KitButton.make("Deny", glyph: .close, glyphTint: Palette.inkMuted, variant: .secondary, height: .sm) { [weak self] in
            self?.onAnswer(.deny)
        }
        approve = KitButton.make("Approve", glyph: .tick, glyphTint: Palette.inkStrong, variant: .secondary, height: .sm) { [weak self] in
            self?.onAnswer(.allow)
        }
        waited.tabular = true
        waited.setContentHuggingPriority(.required, for: .horizontal)
        waited.setContentCompressionResistancePriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [title, waited])
        head.spacing = Space.space2
        head.alignment = .firstBaseline
        actions.addArrangedSubview(deny)
        actions.addArrangedSubview(UIView())
        actions.addArrangedSubview(approve)
        actions.spacing = Space.space8
        actions.distribution = .equalSpacing
        let column = UIStackView(arrangedSubviews: [head, place, ask, actions, stage])
        column.axis = .vertical
        column.spacing = Space.space1
        column.setCustomSpacing(Space.space1 * 2, after: ask)
        column.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space4),
            column.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space4),
            column.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
        ])
        pin(tile)
    }

    func configure(_ item: HomeModel.NeedsItem, now: Double, sent: Ledger.Command?, stale: Bool) {
        title.text = item.title
        waited.text = item.raisedAt.map { "waiting \(Naming.span(ms: now - $0))" } ?? "waiting"
        place.text = item.place
        switch item.kind {
        case let .ask(parked):
            ask.text = parked.summary
            // A question is answered in its session; a permission here.
            actions.isHidden = parked.isQuestion
            deny.accessibilityLabel = "Deny \(parked.summary) on \(item.title)"
            approve.accessibilityLabel = "Approve \(parked.summary) on \(item.title)"
        case .run:
            // A run's question is answered in its run.
            ask.text = "Waiting on your answer"
            actions.isHidden = true
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

    override init(frame: CGRect) {
        super.init(frame: frame)
        for (index, chip) in counts.enumerated() {
            tabs.setTrail(chip, at: index)
        }
        tabs.addAction(UIAction { [weak self] _ in
            guard let self else {
                return
            }
            onTab(HomeModel.Tab.allCases[tabs.selectedIndex])
        }, for: .valueChanged)
        delegates.translatesAutoresizingMaskIntoConstraints = false
        delegates.addSubview(delegatesGlyph)
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
            tabs.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Space.space1),
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
        counts[0].configure(count: working, ink: Palette.statusLiveInk, chosen: tab == .working, failed: false)
        counts[1].configure(count: finished, ink: finishedFailed ? Palette.statusFailInk : Palette.statusDoneInk, chosen: tab == .finished, failed: finishedFailed)
        delegatesGlyph.glyph = delegatesOn ? .structureOn : .structure
        delegatesGlyph.tintColor = delegatesOn ? Palette.inkStrong : Palette.inkMuted
        delegates.accessibilityValue = delegatesOn ? "Shown" : "Hidden"
    }
}

/// A tab's count, washed in its status ink on the chosen tab; it pops as it changes.
final class CountChip: UIView {
    private let figure = KitLabel(TypeScale.typeMeta)
    private var count = -1

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        figure.tabular = true
        figure.textAlignment = .center
        addSubview(figure)
        NSLayoutConstraint.activate([
            figure.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 3),
            figure.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -3),
            figure.centerYAnchor.constraint(equalTo: centerYAnchor),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 18),
            heightAnchor.constraint(equalToConstant: 18),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CountChip is built in code")
    }

    func configure(count: Int, ink: UIColor, chosen: Bool, failed: Bool) {
        figure.ink = chosen || failed ? ink : Palette.inkMuted
        backgroundColor = chosen ? ink.resolvedColor(with: traitCollection).withAlphaComponent(traitCollection.userInterfaceStyle == .dark ? 0.10 : 0.06) : .clear
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
        archiveAll.addAction(UIAction { [weak self] _ in self?.onArchiveAll() }, for: .primaryActionTriggered)
        let row = UIStackView(arrangedSubviews: [glyph, name, UIView(), archiveAll])
        row.spacing = Space.space1
        row.alignment = .center
        archiveAll.heightAnchor.constraint(equalToConstant: 22).isActive = true
        pin(row, insets: NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space1, trailing: Space.space3))
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

/// One session in a home group (HomeRow.svelte), at its depth in its tree,
/// with its share of the nesting lines.
final class RowCell: HomeCell {
    let row = SessionRowView()
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
        NSLayoutConstraint.activate([
            lead,
            row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Space.spaceRow),
            bottom,
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: RowCell, _: UITraitCollection) in
            cell.paintNest()
        }
        paintNest()
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
    /// From the rail to the child row's left edge (`--nest-in`).
    static var nestIn: Double { Space.space2 }
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
final class SessionRowView: UIView {
    let mark = SessionMarkView()
    private let title = KitLabel(TypeScale.typeLabel)
    private let trail = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    let count = TreeCountButton()
    private var status = MarkStatus.idle

    init() {
        super.init(frame: .zero)
        trail.tabular = true
        trail.setContentHuggingPriority(.required, for: .horizontal)
        trail.setContentCompressionResistancePriority(.required, for: .horizontal)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let first = UIStackView(arrangedSubviews: [title, trail, count])
        first.spacing = Space.space1
        first.alignment = .center
        let text = UIStackView(arrangedSubviews: [first, line])
        text.axis = .vertical
        let body = UIStackView(arrangedSubviews: [mark, text])
        body.spacing = Space.space2
        body.alignment = .center
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        NSLayoutConstraint.activate([
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            body.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            body.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            first.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
        ])
        // The row reads as one element (status word, title, line, age), and a
        // parent's count is a second one, its own button.
        isAccessibilityElement = false
        accessibilityElements = [summary]
    }

    private lazy var summary = UIAccessibilityElement(accessibilityContainer: self)

    override func layoutSubviews() {
        super.layoutSubviews()
        summary.accessibilityFrameInContainerSpace = bounds
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SessionRowView is built in code")
    }

    struct Content {
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
    }

    func configure(_ content: Content) {
        mark.configure(id: content.id, place: content.place, status: content.status)
        title.text = content.title
        title.ink = content.context ? Palette.inkMuted : Palette.inkStrong
        trail.text = content.trail
        line.text = content.line
        if let fold = content.fold {
            count.isHidden = false
            count.configure(count: fold.count, failed: fold.failed, open: fold.open)
        } else {
            count.isHidden = true
        }
        alpha = content.stale ? 0.55 : 1
        summary.accessibilityLabel = "\(content.status.word): \(content.title)"
        summary.accessibilityValue = [content.line, content.trail].filter { !$0.isEmpty }.joined(separator: ", ")
        accessibilityElements = content.fold == nil ? [summary] : [summary, count]
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
        pin(button, insets: NSDirectionalEdgeInsets(top: 2, leading: 0, bottom: 0, trailing: 0))
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
    private let caw = CawView(status: .ready)
    private let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)

    override init(frame: CGRect) {
        super.init(frame: frame)
        line.textAlignment = .center
        let column = UIStackView(arrangedSubviews: [caw, line])
        column.axis = .vertical
        column.alignment = .center
        column.spacing = Space.space2
        pin(column, insets: NSDirectionalEdgeInsets(top: Space.space4, leading: 0, bottom: Space.space4, trailing: 0))
        NSLayoutConstraint.activate([
            caw.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            caw.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
        ])
    }

    func configure(line text: String) {
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

    override init(frame: CGRect) {
        super.init(frame: frame)
        pin(row, insets: NSDirectionalEdgeInsets(top: 2, leading: 0, bottom: 0, trailing: 0))
    }
}

/// A line of words under a list: no match, or a button to show more.
final class NoteCell: HomeCell {
    let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)

    override init(frame: CGRect) {
        super.init(frame: frame)
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
