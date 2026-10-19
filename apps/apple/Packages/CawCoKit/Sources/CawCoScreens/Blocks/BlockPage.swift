import CawCoCore
import CawCoDesign
import UIKit

/// What a page knows of one block it can hold (BlockPage.svelte `BlockItem`): its face and its body.
struct BlockItem {
    enum Body {
        /// At its own height.
        case natural
        /// A list: on a desk no taller than `cBlockBodyMax`, scrolling inside.
        case capped
        /// The board: the page's height less its head.
        case fill
    }

    let title: String
    let glyph: Glyph
    /// What follows the title: a count, a needs-you mark.
    var meta: UIView?
    /// The head's own action, before its ⋯.
    var action: UIView?
    let content: UIView
    /// The narrowest it reads at (`--c-block-ledger` and its kin).
    let measure: Double
    let hideable: Bool
    let body: Body
    /// Its body is its card; a view or a board draws its own surfaces.
    let card: Bool
    /// A custom view's name: its ⋯ shows it as a tab.
    var view: String?
    /// Spans the row whatever its width says: no Narrow or Wide.
    var wideOnly = false
    /// Drawn alone, with no frame, while it is the page's only block.
    var alone = false
}

/// A project page as a stack of blocks (BlockPage.svelte; Projects spec
/// §5.2): the person's arrangement, laid on a column grid by the page's own
/// width. Four columns from `cGrid4`, two from `cGrid2`, one under; the
/// order is the person's and room left at a row's end stays empty (never
/// dense). A wide block spans the row; a narrow one takes the fewest columns
/// that hold its measure, the row at most. Moving, resizing, hiding and
/// placing write the page's arrangement to the hub, and the grid reflows
/// when it answers. Hidden blocks wait at the page's end, each shown again
/// from there; a refused write is said there in the hub's words.
///
/// A block moves by its head (block-dnd.svelte.ts): the platform lifts it
/// after a held press, its head alone under the finger; its box stays as its
/// slot, and the drop indicator stands on the edge of the block nearest the
/// finger, in the gap between blocks; nothing else moves until the hub
/// answers the drop.
final class BlockPageView: UIView, UIDragInteractionDelegate, UIDropInteractionDelegate {
    let page: BlockPage
    private let blocks: ProjectBlocks
    private var items: [String: BlockItem] = [:]
    /// The page's visible height (`--block-fill`), which a board's body fills less its head.
    var fill: Double = 0 {
        didSet { if fill != oldValue { frames.values.forEach { $0.fill = fill } } }
    }

    private let dropMark = DropMark()
    /// The block the finger is nearest while one is in the air, and the edge a drop would take.
    private var over: (block: String, edge: DropEdge)?
    private let rows = UIStackView()
    private let end = UIStackView()
    private let refused = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var hiddenButton: UIButton!
    /// The hidden blocks, by id and title, which its menu lists as it opens.
    private var hiddenNow: [(block: String, title: String)] = []
    private var frames: [String: BlockFrameView] = [:]
    /// What the grid was last laid out as: its columns, and each shown block's place and span.
    private var laid = ""
    /// The page's only block, drawn alone.
    private var lone: UIView?

    init(page: BlockPage, blocks: ProjectBlocks) {
        self.page = page
        self.blocks = blocks
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        rows.axis = .vertical
        rows.spacing = Space.spaceGroup
        hiddenButton = KitButton.make("", glyph: .chevronDown, variant: .ghost, height: .sm) {}
        hiddenButton.configuration?.imagePlacement = .trailing
        hiddenButton.showsMenuAsPrimaryAction = true
        // Set once and made as it opens, as a block's ⋯ is.
        hiddenButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            done((self?.hiddenNow ?? []).map { block, title in
                UIAction(title: Words.Blocks.show(title: title), image: Glyph.eye.image) { [weak self] _ in self?.change(block, hidden: false) }
            })
        }])
        hiddenButton.setContentHuggingPriority(.required, for: .horizontal)
        refused.wrap = .pretty
        let gap = UIView()
        gap.setContentHuggingPriority(.init(1), for: .horizontal)
        end.addArrangedSubview(refused)
        end.addArrangedSubview(gap)
        end.addArrangedSubview(hiddenButton)
        end.spacing = Space.space3
        end.alignment = .center
        let column = UIStackView(arrangedSubviews: [rows, end])
        column.axis = .vertical
        column.spacing = Space.spaceGroup
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        dropMark.isHidden = true
        addSubview(dropMark)
        addInteraction(UIDropInteraction(delegate: self))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BlockPageView is built in code")
    }

    /// Every block this page can draw, by id: its own, and the views placed on it.
    func show(_ next: [String: BlockItem]) {
        items = next
        if !layoutGrid(animated: false) { dress() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutGrid(animated: false)
    }

    /// The grid's columns for its width.
    private var columns: Int {
        let width = bounds.width
        guard width > 0 else { return 1 }
        return width >= Size.cGrid4 ? 4 : width >= Size.cGrid2 ? 2 : 1
    }

    /// Lays the shown blocks in rows; again only when what stands where
    /// changed. Says whether it laid them (and dressed them) anew.
    @discardableResult
    private func layoutGrid(animated: Bool) -> Bool {
        let places = blocks.placesOf(page)
        let shown = places.filter { !$0.hidden }
        let hidden = places.filter(\.hidden)
        let columns = columns
        let gap = Space.spaceGroup
        let columnWidth = (bounds.width - Double(columns - 1) * gap) / Double(columns)
        let spans = shown.map { place -> Int in
            let item = items[place.block]
            if place.wide || item?.wideOnly == true || columnWidth <= 0 { return columns }
            let measure = item?.measure ?? Size.cBlockView
            return min(columns, max(1, Int((measure / columnWidth - 0.001).rounded(.up))))
        }
        let isLone = places.count == 1 && items[places[0].block]?.alone == true
        let key = "\(columns)|\(isLone)|" + zip(shown, spans).map { "\($0.block)#\($0.wide)#\($1)" }.joined(separator: ",")
            + "|\(hidden.map(\.block).joined(separator: ","))|\(blocks.refused[page] ?? "")|\(items.keys.sorted().joined(separator: ","))"
        guard key != laid, bounds.width > 0 else { return false }
        laid = key
        // The page's only task view, alone, framed by nothing.
        if isLone, let only = items[places[0].block] {
            rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
            frames.values.forEach { $0.removeFromSuperview() }
            frames = [:]
            rows.addArrangedSubview(only.content)
            lone = only.content
            end.isHidden = true
            return true
        }
        lone?.removeFromSuperview()
        lone = nil
        // Each block keeps its frame across a reflow; one that left goes.
        let ids = Set(shown.map(\.block))
        for (id, frame) in frames where !ids.contains(id) {
            frame.removeFromSuperview()
            frames[id] = nil
        }
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        var row: GridRow?
        var used = 0
        for (place, span) in zip(shown, spans) {
            let frame = frames[place.block] ?? BlockFrameView(id: place.block)
            frames[place.block] = frame
            if row == nil || used + span > columns {
                let made = GridRow(columns: columns, gap: gap)
                rows.addArrangedSubview(made)
                row = made
                used = 0
            }
            row?.place(frame, at: used, span: span)
            used += span
        }
        dress()
        // The page's end: the hub's refusal, and the hidden blocks to show again.
        let refusal = blocks.refused[page]
        refused.text = refusal
        refused.isHidden = refusal == nil
        hiddenButton.isHidden = hidden.isEmpty
        KitButton.setTitle("\(Words.Blocks.hidden) \(hidden.count)", of: hiddenButton, variant: .ghost, height: .sm)
        hiddenNow = hidden.map { ($0.block, items[$0.block]?.title ?? $0.block) }
        end.isHidden = hidden.isEmpty && refusal == nil
        if animated, window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeDrawer.animator(Motion.durMorph) { self.superview?.layoutIfNeeded() }.startAnimation()
        }
        #if DEBUG
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            // Said where the blocks now stand: the new order, never with the frames of the old one.
            window?.layoutIfNeeded()
            BlocksProbe.page(self)
        }
        #endif
        return true
    }

    // MARK: Moving a block by its head

    private func frame(of head: UIView?) -> BlockFrameView? {
        frames.values.first { $0.head === head }
    }

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: any UIDragSession) -> [UIDragItem] {
        guard let frame = frame(of: interaction.view), !frame.isControl(at: session.location(in: frame.head)) else { return [] }
        let item = UIDragItem(itemProvider: NSItemProvider())
        item.localObject = frame.id
        session.localContext = page.rawValue
        return [item]
    }

    func dragInteraction(_: UIDragInteraction, previewForLifting item: UIDragItem, session _: any UIDragSession) -> UITargetedDragPreview? {
        guard let id = item.localObject as? String, let frame = frames[id] else { return nil }
        // The head's glyph, title and count, on its own surface.
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: frame.face, cornerRadius: Radius.radiusMd)
        parameters.backgroundColor = Palette.surfaceRaised
        return UITargetedDragPreview(view: frame.head, parameters: parameters)
    }

    func dragInteraction(_: UIDragInteraction, sessionWillBegin session: any UIDragSession) {
        for item in session.items {
            if let id = item.localObject as? String { frames[id]?.lifted = true }
        }
    }

    func dragInteraction(_: UIDragInteraction, session _: any UIDragSession, didEndWith _: UIDropOperation) {
        frames.values.forEach { $0.lifted = false }
        point(nil)
    }

    /// The block in the air, when it is this page's.
    private func dragged(_ session: any UIDropSession) -> String? {
        guard let local = session.localDragSession, local.localContext as? String == page.rawValue else { return nil }
        return local.items.first?.localObject as? String
    }

    func dropInteraction(_: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        dragged(session) != nil
    }

    func dropInteraction(_: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        guard let id = dragged(session) else { return UIDropProposal(operation: .cancel) }
        point(target(at: session.location(in: self), moving: id))
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_: UIDropInteraction, sessionDidExit _: any UIDropSession) {
        point(nil)
    }

    func dropInteraction(_: UIDropInteraction, sessionDidEnd _: any UIDropSession) {
        point(nil)
        frames.values.forEach { $0.lifted = false }
    }

    /// A drop is a request: the arrangement is written, and the blocks reflow when the hub answers.
    func dropInteraction(_: UIDropInteraction, performDrop session: any UIDropSession) {
        let target = over
        point(nil)
        guard let id = dragged(session), let target,
              let to = Self.placeAt(blocks.placesOf(page).map(\.block), id, onto: target.block, edge: target.edge) else { return }
        write { await self.blocks.move(self.page, id, to: to) }
    }

    /// The shown block under the finger, or the nearest, and its edge nearest
    /// it: top and bottom on one column, and its sides as well on more.
    private func target(at point: CGPoint, moving id: String) -> (block: String, edge: DropEdge)? {
        let placed = frames.values.filter { $0.window != nil && !$0.isHidden }.map { ($0.id, $0.convert($0.bounds, to: self)) }
        guard let nearest = placed.min(by: { Self.distance(point, $0.1) < Self.distance(point, $1.1) }), nearest.0 != id else { return nil }
        let (block, box) = nearest
        var edges: [(DropEdge, Double)] = [(.top, abs(point.y - box.minY)), (.bottom, abs(point.y - box.maxY))]
        if columns > 1 { edges += [(.left, abs(point.x - box.minX)), (.right, abs(point.x - box.maxX))] }
        return edges.min { $0.1 < $1.1 }.map { (block, $0.0) }
    }

    private static func distance(_ point: CGPoint, _ box: CGRect) -> Double {
        let dx = max(box.minX - point.x, 0, point.x - box.maxX)
        let dy = max(box.minY - point.y, 0, point.y - box.maxY)
        return dx * dx + dy * dy
    }

    /// The indicator on the edge the drop would take, in the gap between blocks.
    private func point(_ next: (block: String, edge: DropEdge)?) {
        over = next
        guard let next, let frame = frames[next.block] else {
            dropMark.isHidden = true
            return
        }
        let box = frame.convert(frame.bounds, to: self)
        let line = Size.cBlockDropLine
        let gap = Space.spaceGroup
        dropMark.frame = switch next.edge {
        case .top: CGRect(x: box.minX, y: box.minY - gap / 2 - line / 2, width: box.width, height: line)
        case .bottom: CGRect(x: box.minX, y: box.maxY + gap / 2 - line / 2, width: box.width, height: line)
        case .left: CGRect(x: box.minX - gap / 2 - line / 2, y: box.minY, width: line, height: box.height)
        case .right: CGRect(x: box.maxX + gap / 2 - line / 2, y: box.minY, width: line, height: box.height)
        }
        dropMark.isHidden = false
        bringSubviewToFront(dropMark)
    }

    /// Where `block` lands, dropped at `onto`'s `edge`: before the target
    /// (its top or leading side) or after it, counted in the order `block`
    /// has already left. Nil when it would not move (block-dnd `placeAt`).
    static func placeAt(_ order: [String], _ block: String, onto: String, edge: DropEdge) -> Int? {
        guard let from = order.firstIndex(of: block), let at = order.firstIndex(of: onto) else { return nil }
        var to = edge == .top || edge == .left ? at : at + 1
        if from < to { to -= 1 }
        return to == from ? nil : to
    }

    /// Each laid block's face and body as its item says now: a count, an
    /// action or a body changes in place, the block where it stands.
    private func dress() {
        guard lone == nil else { return }
        let shown = blocks.placesOf(page).filter { !$0.hidden }
        let columns = columns
        for (index, place) in shown.enumerated() {
            guard let frame = frames[place.block] else { continue }
            let item = items[place.block] ?? stranger(place.block)
            frame.show(item, place: place, columns: columns, first: index == 0, last: index == shown.count - 1)
            frame.fill = fill
            if !frame.head.interactions.contains(where: { $0 is UIDragInteraction }) {
                // On a phone too, where a drag waits to be let.
                let drag = UIDragInteraction(delegate: self)
                drag.isEnabled = true
                frame.head.addInteraction(drag)
            }
            frame.onMove = { [weak self] step in self?.move(place, step: step) }
            frame.onWidth = { [weak self] wide in self?.change(place.block, wide: wide) }
            frame.onHide = { [weak self] in self?.change(place.block, hidden: true) }
            frame.onTab = { [weak self] in
                guard let self, let view = item.view else { return }
                Task { await self.blocks.unplace(view) }
            }
        }
    }

    /// A block a newer build drew, by id, kept across dressings: it keeps its place.
    private var strangers: [String: BlockItem] = [:]

    private func stranger(_ id: String) -> BlockItem {
        if let known = strangers[id] { return known }
        let made = BlockItem(title: id, glyph: .dataLayers, content: Self.newer(), measure: Size.cBlockView, hideable: true, body: .natural, card: true)
        strangers[id] = made
        return made
    }

    private func move(_ place: BlockPlace, step: Int) {
        let places = blocks.placesOf(page)
        let shown = places.filter { !$0.hidden }
        guard let at = shown.firstIndex(of: place), shown.indices.contains(at + step),
              let to = places.firstIndex(of: shown[at + step]) else { return }
        write { await self.blocks.move(self.page, place.block, to: to) }
    }

    private func change(_ block: String, wide: Bool? = nil, hidden: Bool? = nil) {
        write { await self.blocks.change(self.page, block, wide: wide, hidden: hidden) }
    }

    /// A write, the page shown as the hub answered it, the blocks sliding to their places.
    private func write(_ work: @escaping @MainActor () async -> Bool) {
        Task { @MainActor in
            _ = await work()
            #if DEBUG
            BlocksProbe.page(self)
            #endif
            laid = ""
            layoutGrid(animated: true)
        }
    }

    /// A block a newer build drew: it keeps its place.
    private static func newer() -> UIView {
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        line.text = Words.Blocks.newer
        let box = UIView()
        line.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(line)
        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space3),
            line.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space3),
            line.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
            line.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space3),
        ])
        return box
    }

    #if DEBUG
    /// Each shown block's id, span and centre of its ⋯, in order, for the probe.
    var probeBlocks: [(id: String, span: Int, more: String)] {
        let order = blocks.placesOf(page).filter { !$0.hidden }.map(\.block)
        return order.compactMap { id in frames[id].map { (id, $0.span, ViewsProbe.centre($0.moreButton)) } }
    }
    #endif
}

/// Which edge of a block a drop takes.
enum DropEdge { case top, bottom, left, right }

/// The drop indicator (Block.svelte `.drop`): a `cBlockDropLine` rule in
/// the brand's solid ink across the target's edge, a `cBlockDropDot` dot at
/// its start.
private final class DropMark: UIView {
    private let dot = UIView()

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        backgroundColor = Palette.brandSolid
        layer.cornerRadius = Radius.radiusHair
        dot.backgroundColor = Palette.brandSolid
        dot.layer.cornerRadius = Size.cBlockDropDot / 2
        addSubview(dot)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DropMark is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let side = Size.cBlockDropDot
        // Across a top or bottom edge, the dot at its leading end; down a side, at its top.
        dot.frame = bounds.width >= bounds.height
            ? CGRect(x: -side / 2, y: (bounds.height - side) / 2, width: side, height: side)
            : CGRect(x: (bounds.width - side) / 2, y: -side / 2, width: side, height: side)
    }
}

/// One row of the grid: its blocks at their columns, align-items start, as tall as its tallest.
private final class GridRow: UIView {
    private let columns: Int
    private let gap: Double

    init(columns: Int, gap: Double) {
        self.columns = columns
        self.gap = gap
        super.init(frame: .zero)
        let snug = heightAnchor.constraint(equalToConstant: 0)
        snug.priority = .fittingSizeLevel
        snug.isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GridRow is built in code")
    }

    func place(_ block: UIView, at column: Int, span: Int) {
        block.removeFromSuperview()
        block.translatesAutoresizingMaskIntoConstraints = false
        addSubview(block)
        let share = 1 / Double(columns)
        let gaps = gap * Double(columns - 1) / Double(columns)
        NSLayoutConstraint.activate([
            block.topAnchor.constraint(equalTo: topAnchor),
            bottomAnchor.constraint(greaterThanOrEqualTo: block.bottomAnchor),
            // Its columns' share of the row, less the gaps it doesn't span, and its place after the columns before it.
            block.widthAnchor.constraint(equalTo: widthAnchor, multiplier: share * Double(span), constant: gap * Double(span - 1) - gaps * Double(span)),
            NSLayoutConstraint(item: block, attribute: .leading, relatedBy: .equal, toItem: self, attribute: .trailing,
                               multiplier: max(share * Double(column), 0.000_001), constant: gap * Double(column) - gaps * Double(column)),
        ])
    }
}

/// One block's frame (Block.svelte): its head, then its body. The head is
/// the 16pt glyph in muted ink, the title in label, what the block counts,
/// then at its trailing edge the block's own action and its ⋯ (Move up, Move
/// down; Narrow or Wide, which on one column still sets the desk's; Hide; for
/// a custom view, Show as a tab), 44pt tall under a finger. The body is the
/// block's content as its card or bare; a list stands at most
/// `cBlockBodyMax` tall on a desk and scrolls inside; the board fills the
/// page's height less its head. The head is the block's drag handle.
final class BlockFrameView: UIView {
    var onMove: (Int) -> Void = { _ in }
    var onWidth: (Bool) -> Void = { _ in }
    var onHide: () -> Void = {}
    var onTab: () -> Void = {}

    let id: String
    private(set) var span = 1
    private let glyph = GlyphView(.dataLayers, size: Size.iconMd, tint: Palette.inkMuted)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let meta = UIStackView()
    private let tools = UIStackView()
    private(set) var moreButton: UIButton!
    /// The block as last shown, which its ⋯ menu is made from as it opens.
    private var shown: (item: BlockItem, place: BlockPlace, columns: Int, first: Bool, last: Bool)?
    /// The drag handle: glyph, title, count, and its tools, which are their own.
    private(set) var head: UIStackView!
    private let column = UIStackView()
    private let body = UIView()
    private let scroller = UIScrollView()
    private var content: UIView?
    private var cap: NSLayoutConstraint!
    private var capped = false
    private var filling = false
    /// The page's height, which a board's body fills less the head (`--block-fill`).
    var fill: Double = 0 {
        didSet { if fill != oldValue, filling { setNeedsLayout() } }
    }

    /// In the air: its box stays as its slot, dashed, the block not drawn twice.
    var lifted = false {
        didSet {
            guard lifted != oldValue else { return }
            column.alpha = lifted ? 0 : 1
            paint()
        }
    }

    private let slot = CAShapeLayer()

    init(id: String) {
        self.id = id
        super.init(frame: .zero)
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.accessibilityTraits = .header
        meta.spacing = Space.space1
        meta.alignment = .center
        moreButton = KitButton.make("", glyph: .more, variant: .ghost, height: .sm) {}
        moreButton.showsMenuAsPrimaryAction = true
        // Set once and made as it opens, from the block as last shown: a refresh
        // that set a new menu while a tap was opening this one cancelled it.
        moreButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            guard let self, let shown else { return done([]) }
            done(menu(shown.item, place: shown.place, columns: shown.columns, first: shown.first, last: shown.last).children)
        }])
        tools.spacing = Space.space2
        tools.alignment = .center
        tools.addArrangedSubview(moreButton)
        let gap = UIView()
        gap.setContentHuggingPriority(.init(1), for: .horizontal)
        let head = UIStackView(arrangedSubviews: [glyph, title, meta, gap, tools])
        self.head = head
        head.spacing = Space.space2
        head.alignment = .center
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        head.layer.cornerRadius = Radius.radiusMd
        head.layer.cornerCurve = .continuous
        // 44pt under a finger, the small button's height under a pointer (`--block-head-h`).
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: headHeight).isActive = true
        for part in [meta, tools] {
            part.setContentHuggingPriority(.required, for: .horizontal)
            part.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        scroller.translatesAutoresizingMaskIntoConstraints = false
        scroller.alwaysBounceVertical = false
        body.addSubview(scroller)
        slot.fillColor = nil
        slot.lineWidth = 1
        slot.lineDashPattern = [3, 3]
        layer.addSublayer(slot)
        column.addArrangedSubview(head)
        column.addArrangedSubview(body)
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        cap = scroller.heightAnchor.constraint(equalToConstant: Size.cBlockBodyMax)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroller.topAnchor.constraint(equalTo: body.topAnchor),
            scroller.bottomAnchor.constraint(equalTo: body.bottomAnchor),
            scroller.leadingAnchor.constraint(equalTo: body.leadingAnchor),
            scroller.trailingAnchor.constraint(equalTo: body.trailingAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (frame: BlockFrameView, _: UITraitCollection) in frame.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BlockFrameView is built in code")
    }

    private var card = false

    /// `--block-head-h`: 44pt under a finger, the small button's height under a pointer.
    private var headHeight: Double { traitCollection.userInterfaceIdiom == .mac ? Size.cBtnHSm : Size.cBtnHLg }

    /// What a lifted head shows under the finger: its glyph, title and count, not its tools.
    var face: CGRect {
        let end = meta.isHidden ? title.frame.maxX : meta.frame.maxX
        return CGRect(x: 0, y: 0, width: min(head.bounds.width, end + Space.space1), height: head.bounds.height)
    }

    /// Whether a press at a point in the head is one of its controls' (its action, its ⋯), never a drag.
    func isControl(at point: CGPoint) -> Bool {
        guard let hit = head.hitTest(point, with: nil) else { return false }
        return sequence(first: hit, next: \.superview).prefix { $0 !== head }.contains { $0 is UIControl }
    }

    func show(_ item: BlockItem, place: BlockPlace, columns: Int, first: Bool, last: Bool) {
        glyph.glyph = item.glyph
        title.text = item.title
        accessibilityLabel = item.title
        // The head's count and action stay where they stand while they are the same views.
        if meta.arrangedSubviews.first !== item.meta {
            meta.arrangedSubviews.forEach { $0.removeFromSuperview() }
            if let view = item.meta { meta.addArrangedSubview(view) }
        }
        meta.isHidden = item.meta == nil
        let action = tools.arrangedSubviews.first { $0 !== moreButton }
        if action !== item.action {
            action?.removeFromSuperview()
            if let next = item.action { tools.insertArrangedSubview(next, at: 0) }
        }
        moreButton.accessibilityLabel = Words.Blocks.more(title: item.title)
        shown = (item, place, columns, first, last)
        // Its content, again when it was taken elsewhere in between (the board, back on its own pane).
        if content !== item.content || item.content.superview !== scroller {
            if let content, content !== item.content, content.superview === scroller { content.removeFromSuperview() }
            content = item.content
            item.content.translatesAutoresizingMaskIntoConstraints = false
            scroller.addSubview(item.content)
            NSLayoutConstraint.activate([
                item.content.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor),
                item.content.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor),
                item.content.leadingAnchor.constraint(equalTo: scroller.contentLayoutGuide.leadingAnchor),
                item.content.trailingAnchor.constraint(equalTo: scroller.contentLayoutGuide.trailingAnchor),
                item.content.widthAnchor.constraint(equalTo: scroller.frameLayoutGuide.widthAnchor),
            ])
            if item.body == .fill {
                // The board stands at the body's height and scrolls its own columns.
                item.content.heightAnchor.constraint(equalTo: scroller.frameLayoutGuide.heightAnchor).isActive = true
            } else {
                // At its content's height, unless the cap holds it shorter.
                let natural = scroller.heightAnchor.constraint(equalTo: item.content.heightAnchor)
                natural.priority = .defaultHigh
                natural.isActive = true
            }
        }
        card = item.card
        capped = item.body == .capped
        filling = item.body == .fill
        paint()
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A list stands no taller than its cap on a desk (640pt of window and
        // up) and scrolls inside; on a phone the page itself scrolls.
        let desk = (window?.bounds.width ?? bounds.width) >= 640
        let holds = capped && desk
        // The board's body: the page's height less the head and the gap under it.
        let fills = filling && fill > 0
        if cap.isActive != (holds || fills) { cap.isActive = holds || fills }
        if fills {
            cap.constant = max(0, fill - headHeight - Space.space2)
        } else if holds, let content {
            cap.constant = min(Size.cBlockBodyMax, content.systemLayoutSizeFitting(CGSize(width: bounds.width, height: 0),
                withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height)
        }
        scroller.isScrollEnabled = holds
        slot.frame = bounds
        slot.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusLg).cgPath
    }

    private func paint() {
        body.backgroundColor = card ? Palette.surfaceRaised : .clear
        body.layer.cornerRadius = card ? Radius.radiusLg : 0
        body.layer.cornerCurve = .continuous
        body.boxShadow = card ? Shadow.shadowTile : []
        scroller.layer.cornerRadius = card ? Radius.radiusLg : 0
        scroller.layer.cornerCurve = .continuous
        scroller.clipsToBounds = card || capped
        // The slot it leaves while in the air: the recess, a dashed control edge, radius-lg.
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        backgroundColor = lifted ? Palette.surfaceRecess : .clear
        slot.strokeColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        slot.isHidden = !lifted
    }

    /// The kit menu: Move up, Move down; Narrow or Wide (and on one column
    /// "On wider screens"); Hide; for a custom view, Show as a tab.
    private func menu(_ item: BlockItem, place: BlockPlace, columns: Int, first: Bool, last: Bool) -> UIMenu {
        let up = UIAction(title: Words.Blocks.moveUp, image: Glyph.arrowUp.image, attributes: first ? .disabled : []) { [weak self] _ in self?.onMove(-1) }
        let down = UIAction(title: Words.Blocks.moveDown, image: Glyph.arrowDownLine.image, attributes: last ? .disabled : []) { [weak self] _ in self?.onMove(1) }
        var sections: [UIMenuElement] = [UIMenu(options: .displayInline, children: [up, down])]
        if !item.wideOnly {
            let narrow = UIAction(title: Words.Blocks.narrow, state: place.wide ? .off : .on) { [weak self] _ in if place.wide { self?.onWidth(false) } }
            let wide = UIAction(title: Words.Blocks.wide, state: place.wide ? .on : .off) { [weak self] _ in if !place.wide { self?.onWidth(true) } }
            sections.append(UIMenu(title: columns == 1 ? Words.Blocks.widerScreens : "", options: .displayInline, children: [narrow, wide]))
        }
        var away: [UIMenuElement] = []
        if item.hideable {
            away.append(UIAction(title: Words.Blocks.hide, image: Glyph.eyeClosed.image) { [weak self] _ in self?.onHide() })
        }
        if item.view != nil {
            away.append(UIAction(title: Words.Blocks.showAsTab, image: Glyph.window.image) { [weak self] _ in self?.onTab() })
        }
        if !away.isEmpty { sections.append(UIMenu(options: .displayInline, children: away)) }
        return UIMenu(children: sections)
    }
}

#if DEBUG
/// `-views-probe`: a page of blocks, said in the log for scripts/probe-kit/specs/ios-views.ts (leg c).
@MainActor
enum BlocksProbe {
    private static var said: [BlockPage: String] = [:]

    /// Said again only when what stands where changed.
    static func page(_ view: BlockPageView) {
        guard ViewsProbe.on, view.window != nil else { return }
        view.superview?.layoutIfNeeded()
        let blocks = view.probeBlocks.map { "\($0.id)/\($0.span)@\($0.more)" }.joined(separator: ";")
        let line = "blocks page=\(view.page.rawValue) blocks=\(blocks)"
        guard said[view.page] != line else { return }
        said[view.page] = line
        ViewsProbe.say(line)
    }
}
#endif
