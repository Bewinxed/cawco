import CawCoDesign
import UIKit

/// One open conversation as its tab shows it.
struct PaneTab: Equatable {
    let id: String
    let label: String
    let face: SessionStatusView.Face
    /// Parked on the operator: the label keeps the strong ink chosen or not.
    let needs: Bool
    /// A workflow run's tab is its own details: no chevron slot.
    let isRun: Bool
    let status: String
}

/// One group's tabs (workspace/PaneTabs.svelte on fluid-tabs' folder
/// variant): a row on the shelf, the open conversations as folder tabs (32pt,
/// 10pt in, label type, at most 200 wide). An unchosen tab stands on its own
/// tint card; the chosen one is a sheet in the transcript's surface with
/// rounded shoulders and a foot that flares into the page. Switching wipes
/// the new sheet in from the side facing the old one and the old one out
/// toward the new over `durPop` on the drawer curve; a switch past a
/// neighbour shows the sheet whole and slides it over instead. A tab that
/// opens grows from its start while the rest slide over (`durMorph`); one
/// that closes narrows and fades (`durExit`) while the rest close the gap
/// (`durFade`); a reorder slides on the drawer curve (`durPanel`). The track
/// scrolls sideways when it overflows, its edges fading over 40pt.
final class PaneTabsView: UIView, UIScrollViewDelegate, UIContextMenuInteractionDelegate {
    static let item = 32.0
    static let px = 10.0
    static let maxTab = 200.0
    static let flare = Radius.radiusSm
    static let gap = 2.0

    var onSelect: (String) -> Void = { _ in }
    var onClose: (String) -> Void = { _ in }
    var onDetails: (String, UIView) -> Void = { _, _ in }
    /// A pointer rests on a tab (its id and view), or left one (nil).
    var onHover: (String?, UIView?) -> Void = { _, _ in }
    /// A tab's context menu opened or closed.
    var onMenu: (Bool) -> Void = { _ in }
    var menu: (String) -> UIMenu? = { _ in nil }
    /// Supplies a tab's drag; set by the group.
    var dragFor: ((String, TabView) -> UIDragItem?)?

    /// Hosted in the top bar: no shelf of its own, the bar draws it.
    var hosted: Bool {
        didSet {
            guard hosted != oldValue else { return }
            dress()
        }
    }

    /// `padding-block: 4px 0` over the 32pt tabs, in a group; hosted, the bar sizes it.
    private lazy var ownHeight = heightAnchor.constraint(equalToConstant: Self.item + 4)

    private func dress() {
        backgroundColor = hosted ? .clear : Palette.surfaceShelf
        hairline.isHidden = hosted
        ownHeight.isActive = !hosted
        setNeedsLayout()
    }

    private let scroll = UIScrollView()
    private let track = UIView()
    private let fade = CAGradientLayer()
    private let hairline = UIView()
    private var views: [String: TabView] = [:]
    private var order: [String] = []
    private(set) var active: String?
    /// A drop caret: where a carried tab would land in this strip.
    private let caret = UIView()
    private var leadingInset = Space.space7

    init(hosted: Bool) {
        self.hosted = hosted
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.alwaysBounceHorizontal = false
        scroll.delegate = self
        scroll.clipsToBounds = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(track)
        addSubview(scroll)
        hairline.backgroundColor = Palette.borderHairline
        hairline.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hairline)
        caret.backgroundColor = Palette.inkStrong
        caret.layer.cornerRadius = 1
        caret.isHidden = true
        track.addSubview(caret)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.heightAnchor.constraint(equalToConstant: Self.item),
            hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
            hairline.bottomAnchor.constraint(equalTo: bottomAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1),
        ])
        dress()
        bringSubviewToFront(scroll)
        accessibilityLabel = "Open sessions in this group"
        accessibilityTraits = .tabBar
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaneTabsView is built in code")
    }

    // MARK: Content

    /// The strip's tabs and which is in front; arrivals, departures and moves animate.
    func configure(_ tabs: [PaneTab], active next: String?, animated: Bool) {
        let ids = tabs.map(\.id)
        let before = Dictionary(uniqueKeysWithValues: order.compactMap { id in views[id].map { (id, $0.frame.minX) } })
        let removed = order.filter { !ids.contains($0) }
        let added = ids.filter { !order.contains($0) }
        let still = !animated || window == nil || UIAccessibility.isReduceMotionEnabled
        for id in removed {
            guard let view = views.removeValue(forKey: id) else { continue }
            leave(view, still: still)
        }
        for tab in tabs {
            let view = views[tab.id] ?? makeTab(tab.id)
            view.configure(tab)
        }
        let previous = active
        order = ids
        active = next
        layoutTrack()
        // Every tab that stood elsewhere slides from there.
        if !still {
            let (duration, curve): (TimeInterval, TimingCurve) = !removed.isEmpty
                ? (Motion.durFade, Motion.easeInOut)
                : (!added.isEmpty ? (Motion.durMorph, Motion.easeOut) : (Motion.durPanel, Motion.easeDrawer))
            for id in ids {
                guard let view = views[id], let was = before[id], abs(was - view.frame.minX) > 0.5 else { continue }
                view.transform = CGAffineTransform(translationX: was - view.frame.minX, y: 0)
                curve.animator(duration) { view.transform = .identity }.startAnimation()
            }
            for id in added { views[id]?.grow() }
        }
        choose(from: previous, to: next, animated: !still)
        if let id = added.last, let view = views[id] { scroll.scrollRectToVisible(view.frame.insetBy(dx: -Self.flare, dy: 0), animated: !still) }
    }

    private func makeTab(_ id: String) -> TabView {
        let view = TabView(id: id)
        view.onSelect = { [weak self] in self?.onSelect(id) }
        view.onClose = { [weak self] in self?.onClose(id) }
        view.onDetails = { [weak self, weak view] in
            guard let self, let view else { return }
            onDetails(id, view)
        }
        view.onHover = { [weak self, weak view] over in self?.onHover(over ? id : nil, over ? view : nil) }
        view.addInteraction(UIContextMenuInteraction(delegate: self))
        if let dragFor {
            let drag = UIDragInteraction(delegate: TabDragDelegate.shared)
            drag.isEnabled = true
            view.addInteraction(drag)
            view.dragItem = { [weak view] in view.flatMap { dragFor(id, $0) } }
        }
        track.insertSubview(view, belowSubview: caret)
        views[id] = view
        return view
    }

    /// A tab that closed, taken out of the flow where it stands: it narrows
    /// toward its start as it fades over `durExit`; with less motion it only fades.
    private func leave(_ view: TabView, still: Bool) {
        guard !still else {
            view.removeFromSuperview()
            return
        }
        view.isUserInteractionEnabled = false
        let mask = CALayer()
        mask.backgroundColor = UIColor.black.cgColor
        mask.anchorPoint = CGPoint(x: 0, y: 0.5)
        let reach = view.bounds.insetBy(dx: -12, dy: -12)
        mask.bounds = reach
        mask.position = CGPoint(x: reach.minX, y: view.bounds.midY)
        view.layer.mask = mask
        let narrow = CABasicAnimation(keyPath: "bounds.size.width")
        narrow.fromValue = reach.width
        narrow.toValue = 12.0
        narrow.duration = Motion.durExit
        narrow.timingFunction = Motion.easeOut.function
        narrow.fillMode = .forwards
        narrow.isRemovedOnCompletion = false
        mask.add(narrow, forKey: "narrow")
        let out = Motion.easeOut.animator(Motion.durExit) { view.alpha = 0 }
        out.addCompletion { _ in view.removeFromSuperview() }
        out.startAnimation()
    }

    // MARK: The chosen sheet

    private var leapFrom: CGFloat?

    /// The sheet moves to the new tab: a wipe between neighbours, a slide past them.
    private func choose(from old: String?, to new: String?, animated: Bool) {
        guard old != new else {
            for (id, view) in views { view.setChosen(id == new, wipe: nil) }
            return
        }
        let from = old.flatMap { order.firstIndex(of: $0) }
        let to = new.flatMap { order.firstIndex(of: $0) }
        let forward = (to ?? 0) >= (from ?? 0)
        let leap = from != nil && to != nil && abs(to! - from!) > 1
        for (id, view) in views where id != old && id != new { view.setChosen(false, wipe: nil) }
        if let old, let view = views[old] {
            view.setChosen(false, wipe: animated && !leap ? (forward ? .right : .left) : nil)
        }
        if let new, let view = views[new] {
            view.setChosen(true, wipe: animated && !leap ? (forward ? .left : .right) : nil)
            if animated, leap, let old, let was = views[old] {
                view.slideSheet(from: was.frame.minX - view.frame.minX)
            }
            accessibilityValue = view.accessibilityLabel
        }
    }

    /// A swipe in progress: the chosen sheet gives up `fraction` on the side
    /// away from `toward`, whose sheet takes it on the side facing the chosen.
    func ride(toward: String?, fraction: Double) {
        guard let active, let here = order.firstIndex(of: active) else { return }
        for (id, view) in views {
            if let toward, let there = order.firstIndex(of: toward), toward != active {
                // TabItem.svelte `ride`: the chosen sheet keeps the side facing
                // the target; the target's sheet grows from the side facing the chosen.
                let right = there > here
                if id == active {
                    view.ride(size: 1 - fraction, anchoredRight: right)
                } else if id == toward {
                    view.ride(size: fraction, anchoredRight: !right)
                } else {
                    view.ride(size: nil, anchoredRight: false)
                }
            } else {
                view.ride(size: nil, anchoredRight: false)
            }
        }
    }

    // MARK: Drop caret

    /// Shows where a dropped tab would land (index into the strip), or hides it.
    func showCaret(at index: Int?) {
        guard let index, !order.isEmpty else {
            caret.isHidden = true
            return
        }
        let x: CGFloat
        if index < order.count, let view = views[order[index]] {
            x = view.frame.minX - 2
        } else if let last = order.last.flatMap({ views[$0] }) {
            x = last.frame.maxX
        } else {
            x = Self.flare
        }
        caret.frame = CGRect(x: x - 1, y: 2, width: 2, height: Self.item - 4)
        caret.isHidden = false
    }

    /// The strip index a point (in this view) falls at.
    func index(at point: CGPoint) -> Int {
        let x = convert(point, to: track).x
        for (index, id) in order.enumerated() {
            guard let view = views[id] else { continue }
            if x < view.frame.midX { return index }
        }
        return order.count
    }

    func tabView(_ id: String) -> TabView? { views[id] }

    // MARK: Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        // `padding-inline: space7 space4`, `space4` at the start in a group 620pt or narrower.
        leadingInset = hosted ? 0 : (bounds.width <= 620 ? Space.space4 : Space.space7)
        layoutTrack()
        edges()
    }

    private func layoutTrack() {
        var x = Self.flare
        for id in order {
            guard let view = views[id] else { continue }
            let width = min(Self.maxTab, view.fittingWidth)
            view.bounds = CGRect(x: 0, y: 0, width: width, height: Self.item)
            view.center = CGPoint(x: x + width / 2, y: Self.item / 2)
            x += width + Self.gap
        }
        let content = x - Self.gap + Self.flare
        track.frame = CGRect(x: 0, y: 0, width: max(content, 1), height: Self.item)
        scroll.contentSize = track.frame.size
        scroll.contentInset = UIEdgeInsets(top: 0, left: leadingInset, bottom: 0, right: hosted ? 0 : Space.space4)
    }

    func scrollViewDidScroll(_: UIScrollView) { edges() }

    /// Only an edge with more past it fades, over 40pt.
    private func edges() {
        let offset = scroll.contentOffset.x + scroll.contentInset.left
        let more = scroll.contentSize.width + scroll.contentInset.left + scroll.contentInset.right - scroll.bounds.width
        guard more > 1 else {
            scroll.layer.mask = nil
            return
        }
        let width = max(1, scroll.bounds.width)
        let start = offset > 0.5 ? 40 / width : 0
        let end = offset < more - 0.5 ? 40 / width : 0
        fade.startPoint = CGPoint(x: 0, y: 0.5)
        fade.endPoint = CGPoint(x: 1, y: 0.5)
        fade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        fade.locations = [0, NSNumber(value: start), NSNumber(value: 1 - end), 1]
        if start == 0 { fade.colors?[0] = UIColor.black.cgColor }
        if end == 0 { fade.colors?[3] = UIColor.black.cgColor }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = scroll.bounds
        CATransaction.commit()
        scroll.layer.mask = fade
    }

    /// The tab controls' touch areas reach past the 32pt tabs.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: 0, dy: -6).contains(point)
    }

    // MARK: Context menu

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        guard let id = (interaction.view as? TabView)?.id else { return nil }
        return UIContextMenuConfiguration(identifier: id as NSString, previewProvider: nil) { [weak self] _ in self?.menu(id) }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willDisplayMenuFor _: UIContextMenuConfiguration, animator _: (any UIContextMenuInteractionAnimating)?) {
        onMenu(true)
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willEndFor _: UIContextMenuConfiguration, animator _: (any UIContextMenuInteractionAnimating)?) {
        onMenu(false)
    }
}

/// Every tab's drag goes through one delegate; the item comes from the tab.
private final class TabDragDelegate: NSObject, UIDragInteractionDelegate {
    @MainActor static let shared = TabDragDelegate()

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning _: any UIDragSession) -> [UIDragItem] {
        guard let tab = interaction.view as? TabView, let item = tab.dragItem() else { return [] }
        return [item]
    }

    func dragInteraction(_ interaction: UIDragInteraction, willAnimateLiftWith _: any UIDragAnimating, session _: any UIDragSession) {
        // The tab being carried recedes: it is somewhere else now.
        interaction.view?.alpha = 0.4
    }

    func dragInteraction(_ interaction: UIDragInteraction, session _: any UIDragSession, didEndWith _: UIDropOperation) {
        interaction.view?.alpha = 1
    }
}

/// One folder tab: its tint card, its sheet, its status glyph, label,
/// details chevron (shown on the chosen tab, its slot kept on the rest) and close.
final class TabView: UIView {
    enum Wipe { case left, right }

    let id: String
    var onSelect: () -> Void = {}
    var onClose: () -> Void = {}
    var onDetails: () -> Void = {}
    /// A pointer came to rest on the tab, or left it.
    var onHover: (Bool) -> Void = { _ in }
    var dragItem: () -> UIDragItem? = { nil }

    private let tint = CAShapeLayer()
    private let sheet = CAShapeLayer()
    private let sheetMask = CALayer()
    private let status = SessionStatusView(.idle, compact: true)
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let details = UIButton(type: .custom)
    private let close = UIButton(type: .custom)
    private let row = UIStackView()
    private var tab: PaneTab?
    private(set) var chosen = false
    private var hovering = false
    private var pressed = false

    init(id: String) {
        self.id = id
        super.init(frame: .zero)
        layer.addSublayer(tint)
        sheetMask.backgroundColor = UIColor.black.cgColor
        sheet.mask = sheetMask
        layer.addSublayer(sheet)
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.isUserInteractionEnabled = false
        status.isUserInteractionEnabled = false
        Self.dress(details, glyph: .chevronDown, side: 12, size: CGSize(width: 22, height: 24))
        details.accessibilityLabel = "Session details"
        details.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            if chosen { onDetails() } else { onSelect() }
        }, for: .primaryActionTriggered)
        Self.dress(close, glyph: .close, side: Size.iconMd, size: CGSize(width: 20, height: 20))
        close.addAction(UIAction { [weak self] _ in self?.onClose() }, for: .primaryActionTriggered)
        let hit = UIStackView(arrangedSubviews: [status, label])
        hit.spacing = PaneTabsView.gap + 4
        hit.alignment = .center
        hit.isUserInteractionEnabled = false
        row.addArrangedSubview(hit)
        row.addArrangedSubview(details)
        row.addArrangedSubview(close)
        row.alignment = .center
        // The close stands 4pt off the chevron under a pointer, 24pt (and 8 off the end) under a finger.
        let coarse = traitCollection.userInterfaceIdiom != .mac
        row.setCustomSpacing(coarse ? 24 : 4, after: details)
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: PaneTabsView.px, bottom: 0, trailing: (PaneTabsView.px - 6) + (coarse ? 8 : 0))
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        let press = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
        press.minimumPressDuration = 0
        press.cancelsTouchesInView = false
        press.delegate = PressPassThrough.shared
        addGestureRecognizer(press)
        isAccessibilityElement = false
        hit.isAccessibilityElement = true
        hit.accessibilityTraits = .button
        accessibilityElements = [hit, details, close]
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TabView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TabView is built in code")
    }

    private static func dress(_ button: UIButton, glyph: Glyph, side: Double, size: CGSize) {
        var config = UIButton.Configuration.plain()
        config.image = glyph.image.resized(to: side)
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusXs
        button.configuration = config
        button.houseStyle()
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: size.width).isActive = true
        button.heightAnchor.constraint(equalToConstant: size.height).isActive = true
        button.pressScaling()
    }

    var fittingWidth: CGFloat {
        row.systemLayoutSizeFitting(CGSize(width: UIView.layoutFittingExpandedSize.width, height: PaneTabsView.item)).width
    }

    func configure(_ tab: PaneTab) {
        let changed = tab != self.tab
        self.tab = tab
        guard changed else { return }
        label.text = tab.label
        status.configure(tab.face)
        details.isHidden = tab.isRun
        close.accessibilityLabel = "Close \(tab.label)"
        details.accessibilityLabel = "Session details for \(tab.label)"
        let hit = row.arrangedSubviews.first
        hit?.accessibilityLabel = tab.label + (tab.status.isEmpty ? "" : " — \(tab.status)")
        accessibilityLabel = hit?.accessibilityLabel
        paint()
    }

    @objc private func tapped() {
        if chosen, tab?.isRun == false { onDetails() } else { onSelect() }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let was = hovering
        hovering = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durGhost) { self.paint() }.startAnimation()
        // The whole tab, its buttons included, times the details card.
        if hovering != was { onHover(hovering) }
    }

    @objc private func held(_ press: UILongPressGestureRecognizer) {
        pressed = press.state == .began || press.state == .changed
        paint()
    }

    // MARK: Sheet

    /// Chosen or not; `wipe` grows (chosen) or shrinks (not) the sheet from that side.
    func setChosen(_ next: Bool, wipe: Wipe?) {
        let was = chosen
        chosen = next
        (row.arrangedSubviews.first)?.accessibilityTraits = next ? [.button, .selected] : .button
        details.isUserInteractionEnabled = !(tab?.isRun ?? false)
        // The chevron's slot is kept on every tab; it shows on the chosen one.
        let still = UIAccessibility.isReduceMotionEnabled
        Motion.easeOut.animator(Motion.durControl) {
            self.details.alpha = next ? 1 : 0
            self.details.transform = next || still ? .identity : CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale)
        }.startAnimation()
        paint()
        guard was != next || wipe == nil else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(wipe == nil)
        if let wipe {
            CATransaction.setAnimationDuration(Motion.durPop)
            CATransaction.setAnimationTimingFunction(Motion.easeDrawer.function)
            anchorMask(right: wipe == .right)
        }
        sheetMask.transform = CATransform3DMakeScale(next ? 1 : 0.0001, 1, 1)
        CATransaction.commit()
        // The tint hides once the sheet covers it, and is back at once when it leaves.
        if next {
            DispatchQueue.main.asyncAfter(deadline: .now() + (wipe == nil ? 0 : Motion.durPop)) { [weak self] in
                guard let self, chosen else { return }
                tint.opacity = 0
            }
        } else {
            tint.opacity = 1
        }
    }

    /// A switch past a neighbour: the sheet whole at once, sliding over from the tab it left.
    func slideSheet(from dx: CGFloat) {
        let slide = CABasicAnimation(keyPath: "transform.translation.x")
        slide.fromValue = dx
        slide.toValue = 0
        slide.duration = Motion.durPop
        slide.timingFunction = Motion.easeDrawer.function
        sheet.add(slide, forKey: "leap")
    }

    /// Under a swipe the sheet is where its fraction puts it; nil hands back to rest.
    func ride(size: Double?, anchoredRight: Bool) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if let size {
            anchorMask(right: anchoredRight)
            sheetMask.transform = CATransform3DMakeScale(max(0.0001, size), 1, 1)
            tint.opacity = 1
        } else {
            sheetMask.transform = CATransform3DMakeScale(chosen ? 1 : 0.0001, 1, 1)
            tint.opacity = chosen ? 0 : 1
        }
        CATransaction.commit()
    }

    private func anchorMask(right: Bool) {
        let size = sheet.bounds.size
        let transform = sheetMask.transform
        sheetMask.transform = CATransform3DIdentity
        sheetMask.anchorPoint = CGPoint(x: right ? 1 : 0, y: 0.5)
        sheetMask.bounds = CGRect(origin: .zero, size: size)
        sheetMask.position = CGPoint(x: right ? size.width : 0, y: size.height / 2)
        sheetMask.transform = transform
    }

    /// A tab that opened grows from nothing at its place (`durMorph`, out curve).
    func grow() {
        let mask = CALayer()
        mask.backgroundColor = UIColor.black.cgColor
        let reach = bounds.insetBy(dx: -12, dy: -12)
        mask.anchorPoint = CGPoint(x: 0, y: 0.5)
        mask.bounds = reach
        mask.position = CGPoint(x: reach.minX, y: bounds.midY)
        layer.mask = mask
        let open = CABasicAnimation(keyPath: "bounds.size.width")
        open.fromValue = 12.0
        open.toValue = reach.width
        open.duration = Motion.durMorph
        open.timingFunction = Motion.easeOut.function
        mask.add(open, forKey: "grow")
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durMorph) { [weak self] in
            if self?.layer.mask === mask { self?.layer.mask = nil }
        }
    }

    private func paint() {
        let traits = traitCollection
        let fill: UIColor = pressed ? Palette.surfaceFill : (hovering && !chosen ? Palette.surfaceHover : Palette.surfaceRecessDeep)
        tint.fillColor = fill.resolvedColor(with: traits).cgColor
        sheet.fillColor = (pressed ? Palette.surfaceFill : Palette.surfaceRecess).resolvedColor(with: traits).cgColor
        label.ink = chosen || hovering || tab?.needs == true ? Palette.inkStrong : Palette.inkMuted
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let flare = PaneTabsView.flare
        let radius = Radius.radiusSm
        tint.frame = bounds
        tint.path = UIBezierPath(roundedRect: bounds, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: radius, height: radius)).cgPath
        sheet.frame = bounds.insetBy(dx: -flare, dy: 0)
        sheet.path = Self.sheetPath(in: sheet.bounds, radius: radius, flare: flare)
        anchorMask(right: sheetMask.anchorPoint.x > 0.5)
        CATransaction.commit()
    }

    /// Rounded shoulders, and a foot that curves outward by `flare` each side (fluid-tabs' sheet).
    static func sheetPath(in rect: CGRect, radius: Double, flare: Double) -> CGPath {
        let path = UIBezierPath()
        let left = rect.minX + flare
        let right = rect.maxX - flare
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addArc(withCenter: CGPoint(x: rect.minX, y: rect.maxY - flare), radius: flare, startAngle: .pi / 2, endAngle: 0, clockwise: false)
        path.addLine(to: CGPoint(x: left, y: rect.minY + radius))
        path.addArc(withCenter: CGPoint(x: left + radius, y: rect.minY + radius), radius: radius, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        path.addLine(to: CGPoint(x: right - radius, y: rect.minY))
        path.addArc(withCenter: CGPoint(x: right - radius, y: rect.minY + radius), radius: radius, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        path.addLine(to: CGPoint(x: right, y: rect.maxY - flare))
        path.addArc(withCenter: CGPoint(x: rect.maxX, y: rect.maxY - flare), radius: flare, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
        path.close()
        return path.cgPath
    }
}

/// The press tint watches touches without taking them from the tap or the buttons.
private final class PressPassThrough: NSObject, UIGestureRecognizerDelegate {
    @MainActor static let shared = PressPassThrough()

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        true
    }
}
