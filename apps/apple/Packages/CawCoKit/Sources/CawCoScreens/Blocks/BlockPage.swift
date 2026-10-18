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
final class BlockPageView: UIView {
    let page: BlockPage
    private let blocks: ProjectBlocks
    private var items: [String: BlockItem] = [:]
    private let rows = UIStackView()
    private let end = UIStackView()
    private let refused = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var hiddenButton: UIButton!
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
        hiddenButton.menu = UIMenu(children: hidden.map { place in
            UIAction(title: Words.Blocks.show(title: items[place.block]?.title ?? place.block), image: Glyph.eye.image) { [weak self] _ in
                self?.change(place.block, hidden: false)
            }
        })
        end.isHidden = hidden.isEmpty && refusal == nil
        if animated, window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeDrawer.animator(Motion.durMorph) { self.superview?.layoutIfNeeded() }.startAnimation()
        }
        return true
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
/// `cBlockBodyMax` tall on a desk and scrolls inside.
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
    private let body = UIView()
    private let scroller = UIScrollView()
    private var content: UIView?
    private var cap: NSLayoutConstraint!
    private var capped = false

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
        tools.spacing = Space.space2
        tools.alignment = .center
        tools.addArrangedSubview(moreButton)
        let gap = UIView()
        gap.setContentHuggingPriority(.init(1), for: .horizontal)
        let head = UIStackView(arrangedSubviews: [glyph, title, meta, gap, tools])
        head.spacing = Space.space2
        head.alignment = .center
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        // 44pt under a finger, the small button's height under a pointer (`--block-head-h`).
        let coarse = traitCollection.userInterfaceIdiom != .mac
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: coarse ? Size.cBtnHLg : Size.cBtnHSm).isActive = true
        for part in [meta, tools] {
            part.setContentHuggingPriority(.required, for: .horizontal)
            part.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        scroller.translatesAutoresizingMaskIntoConstraints = false
        scroller.alwaysBounceVertical = false
        body.addSubview(scroller)
        let column = UIStackView(arrangedSubviews: [head, body])
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
        moreButton.menu = menu(item, place: place, columns: columns, first: first, last: last)
        if content !== item.content {
            content?.removeFromSuperview()
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
            // At its content's height, unless the cap holds it shorter.
            let natural = scroller.heightAnchor.constraint(equalTo: item.content.heightAnchor)
            natural.priority = .defaultHigh
            natural.isActive = true
        }
        card = item.card
        capped = item.body == .capped
        paint()
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A list stands no taller than its cap on a desk (640pt of window and
        // up) and scrolls inside; on a phone the page itself scrolls.
        let desk = (window?.bounds.width ?? bounds.width) >= 640
        let holds = capped && desk
        if cap.isActive != holds { cap.isActive = holds }
        if holds, let content {
            cap.constant = min(Size.cBlockBodyMax, content.systemLayoutSizeFitting(CGSize(width: bounds.width, height: 0),
                withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height)
        }
        scroller.isScrollEnabled = holds
    }

    private func paint() {
        body.backgroundColor = card ? Palette.surfaceRaised : .clear
        body.layer.cornerRadius = card ? Radius.radiusLg : 0
        body.layer.cornerCurve = .continuous
        body.boxShadow = card ? Shadow.shadowTile : []
        scroller.layer.cornerRadius = card ? Radius.radiusLg : 0
        scroller.layer.cornerCurve = .continuous
        scroller.clipsToBounds = card || capped
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
    static func page(_ view: BlockPageView) {
        guard ViewsProbe.on, view.window != nil else { return }
        view.superview?.layoutIfNeeded()
        let blocks = view.probeBlocks.map { "\($0.id)/\($0.span)@\($0.more)" }.joined(separator: ";")
        ViewsProbe.say("blocks page=\(view.page.rawValue) blocks=\(blocks)")
    }
}
#endif
