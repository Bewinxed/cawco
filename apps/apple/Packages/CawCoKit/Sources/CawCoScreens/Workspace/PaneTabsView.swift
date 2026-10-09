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

/// One thing a tab's options offer (PaneTabs.svelte's context menu). The
/// group returns one list of sections; the long press's context menu, the
/// sheet a finger pulls down from the tab, and VoiceOver's custom actions on
/// the tab are all drawn from it, so they never drift apart.
struct TabAction {
    let title: String
    var glyph: Glyph?
    var disabled = false
    let run: () -> Void

    init(title: String, glyph: Glyph? = nil, disabled: Bool = false, run: @escaping () -> Void) {
        self.title = title
        self.glyph = glyph
        self.disabled = disabled
        self.run = run
    }

    /// The sections as the context menu shows them: each inline, in order.
    static func menu(_ sections: [[TabAction]]) -> UIMenu {
        UIMenu(children: sections.map { section in
            UIMenu(options: .displayInline, children: section.map { action in
                UIAction(title: action.title, image: action.glyph?.image, attributes: action.disabled ? .disabled : []) { _ in action.run() }
            })
        })
    }
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
///
/// A tab's options (`TabAction`) open on a long press, as its context menu,
/// and under a finger by a pull down off the tab, as a sheet that follows
/// the finger (`TabOptionsSheet`); a sideways drag is the strip's scroll.
final class PaneTabsView: UIView, UIScrollViewDelegate, UIContextMenuInteractionDelegate {
    static let item = 32.0
    static let px = 10.0
    static let maxTab = 200.0
    static let gap = 2.0

    var onSelect: (String) -> Void = { _ in }
    var onClose: (String) -> Void = { _ in }
    var onDetails: (String, UIView) -> Void = { _, _ in }
    /// A pointer rests on a tab (its id and view), or left one (nil).
    var onHover: (String?, UIView?) -> Void = { _, _ in }
    /// A tab's options (its context menu, or the pulled sheet) opened or closed.
    var onMenu: (Bool) -> Void = { _ in }
    /// A tab's options, by section; set by the group.
    var actions: (String) -> [[TabAction]] = { _ in [] }

    /// The phone's row: tabs a row's height tall on its floor, rounder by a
    /// radius step (owner: "round the tabs more on mobile"), their foot's
    /// flare following, with room above them for their rims' glow.
    private var item: Double { barRow ? Size.cTabRowH : Self.item }
    var flare: Double { barRow ? Radius.radiusLg : Radius.radiusSm }
    private var headroom: Double { barRow ? 44 - Size.cTabRowH : 0 }
    /// Supplies a tab's drag; set by the group.
    var dragFor: ((String, TabView) -> UIDragItem?)?

    /// Hosted in the top bar: no shelf of its own, the bar draws it.
    var hosted: Bool {
        didSet {
            guard hosted != oldValue else { return }
            dress()
        }
    }

    /// On a phone the strip is the app's only bar (ShellController's floating
    /// row, variant B): the compact bar's 44pt with the tabs standing on its
    /// floor, its ends left to the sidebar toggle's glyph and to Caw's glass,
    /// each `cBarPhoneEdge` from the screen's edge, the first tab starting
    /// `cBarPhoneGap` after the glyph and the strip stopping that short of
    /// Caw, so the tabs scroll between them and never under. Its tabs have no
    /// chevrons and no close: their options are a long press or a pull down.
    /// They recede toward the shelf with distance from the chosen one and
    /// wear their session's status on a rim (`TabView.phoneRow`).
    var barRow = false {
        didSet {
            guard barRow != oldValue else { return }
            dress()
            for view in views.values {
                view.chevron = !barRow
                view.phoneRow = barRow
            }
            layoutTrack()
        }
    }

    /// The bar row's ends, pt: the toggle's glyph and Caw's glass float over them.
    /// The strip starts where the toggle's glyph ends, so a scrolled tab never
    /// draws under it; the track's flare of room puts the first tab a flare
    /// further in, and a chosen first tab's foot spreads into that room whole.
    private var barLead: Double { Size.cBarPhoneEdge + Size.cBarToggleGlyph }
    private var barTrail: Double { Size.cBarPhoneGap + NeedsCawButton.side + Size.cBarPhoneEdge }

    /// `padding-block: 4px 0` over the 32pt tabs, in a group; hosted, the bar sizes it.
    private lazy var ownHeight = heightAnchor.constraint(equalToConstant: Self.item + 4)
    private var scrollLead: NSLayoutConstraint!
    private var scrollTrail: NSLayoutConstraint!
    private var scrollHeight: NSLayoutConstraint!

    private func dress() {
        backgroundColor = hosted ? .clear : Palette.surfaceShelf
        hairline.isHidden = hosted
        ownHeight.constant = barRow ? 44 : Self.item + 4
        ownHeight.isActive = !hosted
        scrollLead?.constant = barRow ? barLead : 0
        scrollTrail?.constant = barRow ? -barTrail : 0
        scrollHeight?.constant = item + headroom
        setNeedsLayout()
    }

    private let scroll = StripScroll()
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
        scrollLead = scroll.leadingAnchor.constraint(equalTo: leadingAnchor)
        scrollTrail = scroll.trailingAnchor.constraint(equalTo: trailingAnchor)
        scrollHeight = scroll.heightAnchor.constraint(equalToConstant: Self.item)
        NSLayoutConstraint.activate([
            scrollLead,
            scrollTrail,
            scrollHeight,
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
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
        // A new tab, or a new choice by any route (a tap, a swipe landing): the
        // strip shows it. Its first fill, every tab new, shows the chosen one.
        if !added.isEmpty || previous != next { reveal(added.count == ids.count ? next : (added.last ?? next), animated: !still) }
    }

    /// The one way a tab is brought into the strip: all of it, with the strip's edge room, scrolled only as far as it takes.
    private func reveal(_ id: String?, animated: Bool) {
        guard let id, let view = views[id] else { return }
        scroll.scrollRectToVisible(view.frame.insetBy(dx: -flare, dy: 0), animated: animated)
    }

    /// The tab a swipe is approaching, once the strip has gone to meet it.
    private var approached: String?

    private func makeTab(_ id: String) -> TabView {
        let view = TabView(id: id)
        view.chevron = !barRow
        view.phoneRow = barRow
        view.actions = { [weak self] in self?.actions(id) ?? [] }
        // A finger's pull down off the tab: its options, under the finger.
        if traitCollection.userInterfaceIdiom != .mac {
            let pull = UIPanGestureRecognizer(target: self, action: #selector(pulled(_:)))
            pull.delegate = PullGate.shared
            view.addGestureRecognizer(pull)
        }
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
        // The strip follows the swipe: the tab it is heading for is in view before it lands.
        let heading = toward != active ? toward : nil
        if heading != approached {
            approached = heading
            reveal(heading, animated: true)
        }
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

    /// The pages came to rest on `id`. When they brought the sheet there, it
    /// stands where it is and `id` is chosen with nothing drawn again: the
    /// switch was the swipe. Otherwise the sheet goes back to rest, and the
    /// switch, if any, is drawn when the strip is told of it (`configure`).
    func settle(on id: String) {
        defer { approached = nil }
        guard approached == id, views[id] != nil else {
            ride(toward: nil, fraction: 0)
            return
        }
        active = id
        for (tab, view) in views { view.setChosen(tab == id, wipe: nil) }
        layoutTrack()
        accessibilityValue = views[id]?.accessibilityLabel
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
            x = flare
        }
        caret.frame = CGRect(x: x - 1, y: headroom + 2, width: 2, height: item - 4)
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
        // `padding-inline: space7 space4`, `space4` at the start in a group
        // 620pt or narrower; the bar row's ends are its scroll view's own.
        leadingInset = hosted || barRow ? 0 : (bounds.width <= 620 ? Space.space4 : Space.space7)
        layoutTrack()
        // The chosen tab is revealed as the strip fills, often before it has
        // a width: a reveal into no width scrolls the tab out past the
        // leading edge. A new width shows it again where it now fits.
        if abs(scroll.bounds.width - revealedWidth) > 0.5 {
            revealedWidth = scroll.bounds.width
            // From the strip's start, so a chosen tab that fits from there
            // leaves the strip at its start, as the web's does.
            scroll.contentOffset.x = -scroll.contentInset.left
            reveal(active, animated: false)
        }
        edges()
    }

    /// The strip's width when the chosen tab was last revealed for it.
    private var revealedWidth = 0.0

    /// Folder tabs overlap like a drawer of real folders (TabsList.svelte):
    /// each steps back over its leading neighbour by this much.
    static let overlap = Radius.radiusSm

    /// The tabs laid along the track, each overlapping the one before it,
    /// with a flare of room at each end for the chosen sheet's foot.
    private func layoutTrack() {
        recede()
        var x = flare
        var end = x
        for id in order {
            guard let view = views[id] else { continue }
            let width = min(Self.maxTab, view.fittingWidth)
            view.bounds = CGRect(x: 0, y: 0, width: width, height: item)
            view.center = CGPoint(x: x + width / 2, y: headroom + item / 2)
            end = x + width
            x += width - Self.overlap
        }
        let content = end + flare
        track.frame = CGRect(x: 0, y: 0, width: max(content, 1), height: headroom + item)
        scroll.contentSize = track.frame.size
        scroll.contentInset = UIEdgeInsets(top: 0, left: leadingInset, bottom: 0, right: hosted || barRow ? 0 : Space.space4)
        stack()
    }

    /// Each tab's distance from the chosen one, to three (on the phone's row
    /// an unchosen tab recedes a step toward the shelf for each; with none
    /// chosen every tab is one step back), and which side of it it stands.
    private func recede() {
        let chosen = active.flatMap { order.firstIndex(of: $0) }
        for (index, id) in order.enumerated() {
            guard let view = views[id] else { continue }
            view.distance = chosen.map { min(abs(index - $0), 3) } ?? 1
            view.side = chosen.map { index < $0 ? .before : (index > $0 ? .after : .chosen) } ?? .chosen
        }
    }

    /// The chosen tab on top, then each tab above the ones farther from it,
    /// so every edge tucks under its neighbour toward the chosen tab; with
    /// none chosen, the first on top. A touch on an overlap is the tab drawn there.
    private func stack() {
        let chosen = active.flatMap { order.firstIndex(of: $0) } ?? 0
        let farthestFirst = order.enumerated().sorted { a, b in
            let da = abs(a.offset - chosen)
            let db = abs(b.offset - chosen)
            return da == db ? a.offset < b.offset : da > db
        }
        for (_, id) in farthestFirst {
            if let view = views[id] { track.bringSubviewToFront(view) }
        }
        track.bringSubviewToFront(caret)
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

    /// A tab's close answers a finger from 44pt about it (the web's `.tclose`
    /// `touch-hit`), past the 24pt row, the 32pt tab and the scroll content
    /// that hold it. The chevron keeps its drawn box: its reach would take
    /// the label's end.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        TouchReach.redirect(super.hitTest(point, with: event), at: point, in: self, to: views.values.map(\.closeButton))
    }

    // MARK: Context menu

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        guard let id = (interaction.view as? TabView)?.id, sheet == nil else { return nil }
        return UIContextMenuConfiguration(identifier: id as NSString, previewProvider: nil) { [weak self] _ in
            self.map { TabAction.menu($0.actions(id)) }
        }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willDisplayMenuFor _: UIContextMenuConfiguration, animator _: (any UIContextMenuInteractionAnimating)?) {
        onMenu(true)
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willEndFor _: UIContextMenuConfiguration, animator _: (any UIContextMenuInteractionAnimating)?) {
        onMenu(false)
    }

    // MARK: Pulled down

    /// The sheet a finger is pulling, or has pulled, down off a tab.
    private var sheet: TabOptionsSheet?

    @objc private func pulled(_ pan: UIPanGestureRecognizer) {
        let dy = pan.translation(in: self).y
        switch pan.state {
        case .began:
            guard let tab = pan.view as? TabView, let host = window else { return }
            tab.yieldToPull(pan)
            for menu in tab.interactions.compactMap({ $0 as? UIContextMenuInteraction }) { menu.dismissMenu() }
            sheet?.dismiss()
            let made = TabOptionsSheet(sections: actions(tab.id), under: tab, in: host)
            made.onGone = { [weak self, weak made] in
                guard let self, sheet === made else { return }
                sheet = nil
                onMenu(false)
            }
            sheet = made
            onMenu(true)
            made.pull(dy)
        case .changed:
            sheet?.pull(dy)
        case .ended:
            sheet?.release(dy, velocity: pan.velocity(in: self).y)
        case .cancelled, .failed:
            sheet?.release(0, velocity: 0)
        default:
            break
        }
    }
}

/// The strip's scroll leaves a mostly vertical drag alone: it has no
/// vertical travel, and a pull down off a tab is that tab's options.
private final class StripScroll: UIScrollView {
    override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        if gesture === panGestureRecognizer {
            let v = panGestureRecognizer.velocity(in: self)
            if abs(v.y) > abs(v.x) { return false }
        }
        return super.gestureRecognizerShouldBegin(gesture)
    }
}

/// A tab's pull begins only mostly downward (|dy| > |dx|); sideways is the strip's.
private final class PullGate: NSObject, UIGestureRecognizerDelegate {
    @MainActor static let shared = PullGate()

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let pan = gesture as? UIPanGestureRecognizer else { return true }
        let v = pan.velocity(in: pan.view)
        return v.y > 0 && v.y > abs(v.x)
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
    /// The details chevron's slot: none in a phone's bar row, whose tab menu is its long press.
    var chevron = true {
        didSet { details.isHidden = (tab?.isRun ?? false) || !chevron }
    }

    /// The tab's options, by section (`TabAction`): VoiceOver's custom actions.
    var actions: () -> [[TabAction]] = { [] }

    /// On the phone's row: a rounder top (`radiusLg`) and its flare, the
    /// receding fill, and the status rim.
    var phoneRow = false {
        didSet {
            guard phoneRow != oldValue else { return }
            rimHost.isHidden = !phoneRow
            pad()
            setNeedsLayout()
            paint()
        }
    }

    /// How far from the chosen tab, 0 for the chosen one, at most 3.
    var distance = 1 {
        didSet { if distance != oldValue { paint() } }
    }

    /// Which side of the chosen tab this one stands: before it, its trailing
    /// end is tucked under its neighbour; after it, its leading end is.
    enum Side { case chosen, before, after }
    var side = Side.chosen {
        didSet { if side != oldValue { pad() } }
    }

    /// The tab's two ends. On the phone's row its title's trailing room
    /// clears the overlap and the chosen sheet's flare, so a neighbour tucked
    /// over its end never touches its last glyph; the room comes out of the
    /// pad before the status glyph, which takes the overlap back only where
    /// its own leading end is tucked (PaneTabs.svelte, `--px-start`/`--px-end`).
    private func pad() {
        let coarse = traitCollection.userInterfaceIdiom != .mac
        let leading: Double
        let trailing: Double
        if phoneRow {
            leading = side == .after ? PaneTabsView.overlap + Size.cTabLead : Size.cTabLead
            trailing = PaneTabsView.overlap + Radius.radiusLg
        } else {
            leading = PaneTabsView.px
            trailing = coarse ? PaneTabsView.px : PaneTabsView.px - 6
        }
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: leading, bottom: 0, trailing: trailing)
    }

    private var radius: Double { phoneRow ? Radius.radiusLg : Radius.radiusSm }

    private let tint = CAShapeLayer()
    private let sheet = CAShapeLayer()
    private let sheetMask = CALayer()
    /// The status rim (PaneTabs.svelte `.rim`): the tab's outline, 1.5pt
    /// across the top tapering to 0.5pt down the sides, with a soft glow at
    /// half its strength, gone by 90% of the tab's height (`rimFade`).
    private let rimHost = CALayer()
    private let rim = CAShapeLayer()
    private let rimFade = CAGradientLayer()
    /// The glow: the outline's own shadow (`0 0 6px`, half the rim's
    /// strength), kept outside the tab as the web's box shadow is, so it
    /// never deepens the stroke or the tab under it.
    private let glowHost = CALayer()
    private let glow = CALayer()
    private let glowOutside = CAShapeLayer()
    /// Room round the outline for the glow, inside the fade.
    private static let spill = 6.0
    private let status = SessionStatusView(.idle, compact: true)
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let details = UIButton(type: .custom)
    private let close = UIButton(type: .custom)
    private let row = UIStackView()
    private var tab: PaneTab?
    private(set) var chosen = false
    private var hovering = false
    private var pressed = false
    /// The press tint's own recognizer: it watches every touch and gives way to none.
    private let press = UILongPressGestureRecognizer()

    /// A pull down has the finger: the long press's context menu, the drag's
    /// lift and the tap give it up, so the one touch opens one thing.
    func yieldToPull(_ pull: UIGestureRecognizer) {
        for gesture in gestureRecognizers ?? [] where gesture !== pull && gesture !== press && gesture.isEnabled {
            gesture.isEnabled = false
            gesture.isEnabled = true
        }
    }

    init(id: String) {
        self.id = id
        super.init(frame: .zero)
        layer.addSublayer(tint)
        sheetMask.backgroundColor = UIColor.black.cgColor
        sheet.mask = sheetMask
        layer.addSublayer(sheet)
        rim.fillRule = .evenOdd
        glow.shadowOffset = .zero
        glow.shadowRadius = 3
        glowOutside.fillRule = .evenOdd
        glowHost.mask = glowOutside
        glowHost.addSublayer(glow)
        rimHost.addSublayer(glowHost)
        rimHost.addSublayer(rim)
        rimFade.colors = [UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        rimHost.isHidden = true
        layer.addSublayer(rimHost)
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
        let hit = TabHit(arrangedSubviews: [status, label])
        hit.actions = { [weak self] in self?.actions() ?? [] }
        hit.spacing = PaneTabsView.gap + 4
        hit.alignment = .center
        hit.isUserInteractionEnabled = false
        row.addArrangedSubview(hit)
        row.addArrangedSubview(details)
        row.addArrangedSubview(close)
        row.alignment = .center
        // A pointer's close stands 4pt off the chevron. A finger has none
        // (owner: "remove the x make it close on hold menu then close"): it
        // closes a tab from its options, held or pulled down.
        let coarse = traitCollection.userInterfaceIdiom != .mac
        close.isHidden = coarse
        row.setCustomSpacing(4, after: details)
        row.isLayoutMarginsRelativeArrangement = true
        pad()
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        // The row stays inside the tab by truncating its label, so this gives
        // way to the buttons' own widths: a tab is measured before it has any
        // width, and a required edge there is unsatisfiable, which makes UIKit
        // drop constraints for good and leaves the tab's content collapsed.
        let inside = row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor)
        inside.priority = .required - 1
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            inside,
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        press.addTarget(self, action: #selector(held(_:)))
        press.minimumPressDuration = 0
        press.cancelsTouchesInView = false
        press.delegate = PressPassThrough.shared
        addGestureRecognizer(press)
        isAccessibilityElement = false
        hit.isAccessibilityElement = true
        hit.accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TabView, _: UITraitCollection) in view.paint() }
        for name in [UIAccessibility.reduceTransparencyStatusDidChangeNotification, UIAccessibility.darkerSystemColorsStatusDidChangeNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(contrastChanged), name: name, object: nil)
        }
        paint()
    }

    /// The tab, then the controls it draws: a hidden chevron or close (a
    /// phone's row, a finger) is not offered to VoiceOver.
    override var accessibilityElements: [Any]? {
        get { row.arrangedSubviews.filter { !$0.isHidden } }
        set { _ = newValue }
    }

    /// Increase Contrast or Reduce Transparency: the rim is drawn solid.
    private var solidRim: Bool {
        UIAccessibility.isReduceTransparencyEnabled || UIAccessibility.isDarkerSystemColorsEnabled
    }

    @objc private func contrastChanged() {
        setNeedsLayout()
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
        details.isHidden = tab.isRun || !chevron
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
        // The chevron's slot is kept on every tab; it shows on the chosen one,
        // popping in or out when the choice moves, and is simply set otherwise.
        let still = UIAccessibility.isReduceMotionEnabled
        let chevron: @MainActor @Sendable () -> Void = {
            self.details.alpha = next ? 1 : 0
            self.details.transform = next || still ? .identity : CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale)
        }
        if was != next { Motion.easeOut.animator(Motion.durControl, animations: chevron).startAnimation() } else { chevron() }
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

    /// An unchosen tab's card: on the phone's row a step further toward the
    /// shelf for each tab of distance from the chosen one.
    private var card: UIColor {
        guard phoneRow else { return Palette.surfaceRecessDeep }
        return switch distance {
        case ...1: Palette.tabRecede1
        case 2: Palette.tabRecede2
        default: Palette.tabRecede3
        }
    }

    private func paint() {
        let traits = traitCollection
        let fill: UIColor = pressed ? Palette.surfaceFill : (hovering && !chosen ? Palette.surfaceHover : card)
        tint.fillColor = fill.resolvedColor(with: traits).cgColor
        sheet.fillColor = (pressed ? Palette.surfaceFill : Palette.surfaceRecess).resolvedColor(with: traits).cgColor
        label.ink = chosen || hovering || tab?.needs == true ? Palette.inkStrong : Palette.inkMuted
        paintRim()
    }

    /// The rim in its session's status colour, on the rail's scale (working
    /// the live ink, needs you the attention ink, failed the fail ink, the
    /// rest the muted ink at the idle strength). A change cross-fades over
    /// `durPanel`.
    private func paintRim() {
        guard phoneRow, let tone = tab?.face.tone else { return }
        let ink: UIColor = switch tone {
        case .working: Palette.statusLiveGlyph
        case .attention: Palette.statusAttnGlyph
        case .failed: Palette.statusFailGlyph
        case .quiet, .done: Palette.inkMuted
        }
        let quiet = tone == .quiet || tone == .done
        let mix = quiet ? Effect.tabRimMixIdle : (chosen ? Effect.tabRimMixChosen : Effect.tabRimMix)
        let solid = solidRim
        let resolved = ink.resolvedColor(with: traitCollection)
        CATransaction.begin()
        CATransaction.setAnimationDuration(Motion.durPanel)
        CATransaction.setAnimationTimingFunction(Motion.easeOut.function)
        rim.fillColor = (solid ? resolved : resolved.withAlphaComponent(mix)).cgColor
        // The glow at half the rim's strength; none when the rim is solid.
        glow.shadowColor = resolved.cgColor
        glow.shadowOpacity = solid ? 0 : Float(mix / 2)
        CATransaction.commit()
    }

    /// The close, which the strip lets a finger reach from 44pt about it.
    var closeButton: UIView { close }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let flare = phoneRow ? Radius.radiusLg : Radius.radiusSm
        let radius = radius
        tint.frame = bounds
        tint.path = UIBezierPath(roundedRect: bounds, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: radius, height: radius)).cgPath
        sheet.frame = bounds.insetBy(dx: -flare, dy: 0)
        sheet.path = Self.sheetPath(in: sheet.bounds, radius: radius, flare: flare)
        anchorMask(right: sheetMask.anchorPoint.x > 0.5)
        if phoneRow { layoutRim() }
        CATransaction.commit()
    }

    /// The rim's ring: the tab's outline less the same outline brought in
    /// 1.5pt at the top and 0.5pt at the sides (1pt all round, solid), open
    /// at the foot; faded out by 90% of the tab's height unless solid.
    private func layoutRim() {
        let spill = Self.spill
        rimHost.frame = CGRect(x: -spill, y: -spill, width: bounds.width + 2 * spill, height: bounds.height + spill)
        rim.frame = rimHost.bounds
        let outline = CGRect(x: spill, y: spill, width: bounds.width, height: bounds.height)
        let solid = solidRim
        let top = solid ? 1.0 : 1.5
        let side = solid ? 1.0 : 0.5
        let path = UIBezierPath(roundedRect: outline, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: radius, height: radius))
        let inner = CGRect(x: outline.minX + side, y: outline.minY + top, width: outline.width - 2 * side, height: outline.height - top + 1)
        let innerRadius = max(0, radius - side)
        path.append(UIBezierPath(roundedRect: inner, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: innerRadius, height: innerRadius)))
        rim.path = path.cgPath
        // The glow is the outline's shadow, shown only outside the outline.
        let shape = UIBezierPath(roundedRect: outline, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: radius, height: radius))
        glowHost.frame = rimHost.bounds
        glow.frame = rimHost.bounds
        glow.shadowPath = shape.cgPath
        let outside = UIBezierPath(rect: rimHost.bounds)
        outside.append(shape)
        glowOutside.frame = rimHost.bounds
        glowOutside.path = outside.cgPath
        let height = rimHost.bounds.height
        rimFade.frame = rimHost.bounds
        rimFade.locations = [0, NSNumber(value: spill / height), NSNumber(value: (spill + 0.9 * bounds.height) / height)]
        rimHost.mask = solid ? nil : rimFade
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

/// The tab's VoiceOver element: its options as custom actions, read when
/// asked so they are the ones the menu would show now.
private final class TabHit: UIStackView {
    var actions: () -> [[TabAction]] = { [] }

    override var accessibilityCustomActions: [UIAccessibilityCustomAction]? {
        get {
            actions().joined().filter { !$0.disabled }.map { action in
                UIAccessibilityCustomAction(name: action.title) { _ in
                    action.run()
                    return true
                }
            }
        }
        set { _ = newValue }
    }
}

/// The press tint watches touches without taking them from the tap or the buttons.
private final class PressPassThrough: NSObject, UIGestureRecognizerDelegate {
    @MainActor static let shared = PressPassThrough()

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        true
    }
}
