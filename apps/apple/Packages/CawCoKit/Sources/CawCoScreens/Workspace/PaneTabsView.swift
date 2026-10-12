import CawCoDesign
import OSLog
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
/// rounded shoulders and a foot that flares into the page. A switch is two
/// states trading places where they stand, on one clock (`durSettle` on
/// `easeCrossfade`, DESIGN.md "One clock"), a jump past a neighbour the same
/// as a step: the old sheet fades out over its own card as the new one fades
/// in over its own, every tab's rim, title ink and recede step move between
/// how they rest, the front changes at half way and the seam where two tabs
/// meet glides between their edges (`Passage`). Nothing slides or wipes; a
/// swipe draws the same by its fraction, and with less motion it lands at
/// once. A tab that
/// opens grows from its start while the rest slide over (`durMorph`); one
/// that closes narrows and fades (`durExit`) while the rest close the gap
/// (`durFade`); a reorder slides on the drawer curve (`durPanel`). The track
/// scrolls sideways when it overflows, its edges fading over 40pt.
///
/// A tab's options (`TabAction`) open on a long press, as its context menu,
/// and under a finger by a pull down off the tab, growing out of the tab
/// itself as one shape under the finger (`TabOptionsSheet`); a sideways drag
/// is the strip's scroll.
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
    /// Room above the tabs inside the strip's clip, so their rims' glow is
    /// not cut off: the bar row's pad, or the group's 4pt (TabsList.svelte
    /// `--pad`), which the strip's own height already holds.
    private var headroom: Double { barRow ? 44 - Size.cTabRowH : 4 }
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
    /// floor, its ends left to the sidebar toggle's glyph, `cBarPhoneEdge`
    /// from the screen's edge, and to Caw's glass, flush with the other; the
    /// first tab starting
    /// `cBarPhoneGap` after the glyph and the strip stopping that short of
    /// Caw, so the tabs scroll between them and never under. Its tabs have no
    /// chevrons and no close: their options are a long press or a pull down.
    /// They recede toward the shelf with distance from the chosen one and
    /// wear their session's status on their rim alone, with no status glyph
    /// (`TabView.phoneRow`).
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
    private var barTrail: Double { Size.cBarPhoneGap + NeedsCawButton.standingSide + safeAreaInsets.right }

    /// `padding-block: 4px 0` over the 32pt tabs, in a group; hosted, the bar sizes it.
    private lazy var ownHeight = heightAnchor.constraint(equalToConstant: Self.item + 4)
    private var scrollLead: NSLayoutConstraint!
    private var scrollTrail: NSLayoutConstraint!
    private var scrollHeight: NSLayoutConstraint!

    /// A landscape notch moves Caw's glass in: the strip's end follows it.
    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        if barRow { dress() }
    }

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
        // A switch under way is drawn between this order's tabs: a new order lands it.
        if ids != order { land() }
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
        // A new tab, or a new choice by any route: the strip shows it. Its
        // first fill, every tab new, shows the chosen one.
        let shown = added.count == ids.count ? next : (added.last ?? next)
        if previous != next {
            pass(to: next, showing: shown, animated: !still)
        } else {
            for (id, view) in views { view.setChosen(id == next) }
            if !added.isEmpty { reveal(shown, animated: !still) }
        }
        #if DEBUG
        probeBegin()
        #endif
    }

    /// A tap's choice, drawn at once on the switch's clock rather than when
    /// the pages it sends land: the group still moves the pages and the
    /// model, and the strip is already on its way (TabsList.svelte's
    /// `optimisticIndex`). Told again by `configure`, it draws nothing more.
    func choose(_ id: String) {
        guard views[id] != nil, id != active else { return }
        #if DEBUG
        probeChose(id)
        #endif
        pass(to: id, showing: id, animated: window != nil && !UIAccessibility.isReduceMotionEnabled)
    }

    /// The one way a tab is brought into the strip: all of it, clear of the
    /// strip's edge fades, scrolled only as far as it takes and not at all
    /// when it is already in view (TabsList.svelte `inView`).
    private func reveal(_ id: String?, animated: Bool) {
        guard let id else { return }
        let x = restOffset(id, from: scroll.contentOffset.x)
        guard abs(x - scroll.contentOffset.x) > 0.5 else { return }
        scroll.setContentOffset(CGPoint(x: x, y: scroll.contentOffset.y), animated: animated)
    }

    /// Where the strip rests to show `id`, scrolled from `base`: the tab whole
    /// and clear of each edge's fade (`edges`), moved no further. Choosing a
    /// tab already in view moves nothing (owner: "switching between them
    /// kinda shifts things around in a way that doesn't make sense").
    private func restOffset(_ id: String, from base: CGFloat) -> CGFloat {
        guard let view = views[id] else { return base }
        let room = fadeRoom
        let rect = view.frame
        let width = scroll.bounds.width
        let least = -scroll.contentInset.left
        let most = max(least, scroll.contentSize.width + scroll.contentInset.right - width)
        var x = base
        if rect.maxX + room.end > x + width { x = rect.maxX + room.end - width }
        if rect.minX - room.start < x { x = rect.minX - room.start }
        return min(max(x, least), most)
    }

    /// How far each edge's fade reaches into the strip (`edges`): the phone's
    /// row 24pt at its start and 16pt at its end, a group's strip 40pt.
    private var fadeRoom: (start: Double, end: Double) { barRow ? (24, 16) : (40, 40) }

    private func makeTab(_ id: String) -> TabView {
        let view = TabView(id: id)
        view.chevron = !barRow
        view.phoneRow = barRow
        view.actions = { [weak self] in self?.actions(id) ?? [] }
        // A finger's pull down off the tab: its options, under the finger.
        // Only mostly downward (|dy| > |dx|); sideways is the strip's.
        if traitCollection.userInterfaceIdiom != .mac {
            view.addGestureRecognizer(GatedPan(target: self, action: #selector(pulled(_:))) { $0.heading(.down) })
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

    // MARK: The choice

    /// The choice on its way from one tab to another (TabsList.svelte's
    /// switch, PaneTabs.svelte `look`): every tab's look and every seam as
    /// they stood when it began, the tab it left and the one it is going
    /// to, and how far it has come, 0 to 1. A tap's runs on the switch's
    /// clock (`durSettle` on `easeCrossfade`) from wherever the strip stood,
    /// a switch caught mid-way included; a swipe's is the pages' fraction,
    /// from the choice at rest, by way of the strip as it was drawn when the
    /// finger took a switch under way (`via`). Each frame draws every tab
    /// between where it began and how it rests with the choice landed
    /// (`restyle`), and the strip between where it rests for either end, so
    /// landing moves nothing.
    private struct Passage {
        var looks: [String: TabView.Look]
        var seams: [String: Seam]
        var leaving: String?
        var toward: String
        var scrollFrom: CGFloat
        var scrollTo: CGFloat
        /// A swipe's: where the strip stood as the finger took the pages.
        var base: CGFloat?
        var via: Via?
        var f = 0.0

        /// A value `f` of the way from `from` (at 0) to `to` (at 1): straight,
        /// or by way of `drawn` at the fraction a swipe took over at, so the
        /// strip carries on from exactly where it stood.
        func along(_ from: Double, _ drawn: Double?, _ to: Double) -> Double {
            guard let via, let drawn else { return from + (to - from) * f }
            if f <= via.f { return via.f > 0 ? from + (drawn - from) * (f / via.f) : drawn }
            return drawn + (to - drawn) * ((f - via.f) / (1 - via.f))
        }

        func along(_ from: TabView.Look, _ drawn: TabView.Look?, _ to: TabView.Look) -> TabView.Look {
            TabView.Look(pick: along(from.pick, drawn?.pick, to.pick), recede: along(from.recede, drawn?.recede, to.recede))
        }
    }

    /// The strip as drawn at the instant a swipe took the choice over (a
    /// tap's switch under way, or a swipe turning toward another tab), and
    /// the swipe's fraction then: its passage runs through it.
    private struct Via {
        let f: Double
        let looks: [String: TabView.Look]
        let seams: [String: Seam]
        let scroll: CGFloat
    }

    /// Where two neighbours meet: 0 on the left tab's own edge (it is in
    /// front), 1 on its right neighbour's (that one is), and between the two
    /// while a switch that trades them glides it. Keyed by the left tab.
    private struct Seam {
        let right: String
        let q: Double
    }

    private var passage: Passage?
    private var seamNow: [String: Seam] = [:]
    /// The tabs from the bottom of the stack up, as last drawn.
    private var stacked: [String] = []
    private let clock = Frames()
    #if DEBUG
    /// `-tabs-probe`: the switch being sampled, and a stepped clock's hold per stop, ms.
    private var probeLabel: String?
    private var probeHold: Double?
    private var probeStair = -1.0
    private var probeBegun = false
    /// The tab whose tap the takeover waits for, and whether a swipe has carried the switch since.
    private var probeArmed: String?
    private var probeRode = false
    private var probeAttempt = 0
    #endif

    /// The choice moves to `next`, and the strip to show `shown`: on the
    /// switch's clock from wherever every tab stands now, or at once.
    private func pass(to next: String?, showing shown: String?, animated: Bool) {
        let leaving = active
        let looks = views.mapValues(\.look)
        let seams = seamNow
        clock.stop()
        passage = nil
        active = next
        for (id, view) in views { view.setChosen(id == next) }
        accessibilityValue = next.flatMap { views[$0]?.accessibilityLabel }
        guard animated, let next, views[next] != nil else {
            restyle()
            reveal(shown, animated: false)
            return
        }
        let from = scroll.contentOffset.x
        passage = Passage(looks: looks, seams: seams, leaving: leaving, toward: next, scrollFrom: from, scrollTo: shown.map { restOffset($0, from: from) } ?? from)
        var duration = Motion.durSettle * 1000
        #if DEBUG
        // A takeover's tap runs 6× as long: a simulator's scripted finger
        // reaches the pages only a second after it, so it takes the switch
        // some 40% of the way.
        if probeLabel?.hasPrefix("takeover") == true { duration *= 6 }
        #endif
        clock.run { [weak self] ms in
            guard let self, passage?.base == nil, passage?.toward == next else { return false }
            var t = min(1, ms / duration)
            var f = Motion.easeCrossfade.value(at: t)
            #if DEBUG
            if let held = probeHeld(ms) { (t, f) = held }
            #endif
            passage?.f = f
            draw()
            #if DEBUG
            probeFrame(t)
            #endif
            guard t < 1 else {
                land()
                #if DEBUG
                probeFrame(nil)
                #endif
                return false
            }
            return true
        }
    }

    /// One frame of the passage: every tab where it has come to, and the
    /// strip between where it rests for either end.
    private func draw() {
        restyle()
        guard let passage, passage.via != nil || abs(passage.scrollTo - passage.scrollFrom) > 0.5 else { return }
        scroll.contentOffset.x = passage.along(passage.scrollFrom, passage.via.map { Double($0.scroll) }, passage.scrollTo)
    }

    /// The passage ends: a tap's where it was going, with nothing drawn anew;
    /// a swipe's back at the choice at rest.
    private func land() {
        clock.stop()
        guard let ended = passage else { return }
        passage = nil
        if ended.toward == active, abs(ended.scrollTo - ended.scrollFrom) > 0.5 { scroll.contentOffset.x = ended.scrollTo }
        restyle()
    }

    /// The pages moving toward another tab carry the choice with them
    /// (TabItem.svelte `ride`), frame by frame, by how far they have gone:
    /// the passage from the choice at rest toward `toward`, the strip
    /// between where it rests for each, both read from where it stood as the
    /// finger took the pages. A finger that takes a switch under way, or
    /// turns the pages toward another tab, takes the strip from where it is
    /// drawn at that instant, every look, seam and the scroll, and carries
    /// it on from there by the pages' fraction: it never jumps, and it is
    /// at rest on either tab when the pages are. `toward` nil, or the chosen
    /// tab, is at rest.
    func ride(toward: String?, fraction: Double) {
        let heading = toward.flatMap { $0 != active && views[$0] != nil ? $0 : nil }
        let f = min(1, max(0, fraction))
        guard let heading, let active else {
            // A swipe's passage hands back to rest; a tap's runs on.
            guard passage?.base != nil else { return }
            passage = nil
            restyle()
            return
        }
        if passage?.base == nil || passage?.toward != heading {
            let base = passage?.base ?? scroll.contentOffset.x
            let via = passage.map { _ in Via(f: f, looks: views.mapValues(\.look), seams: seamNow, scroll: scroll.contentOffset.x) }
            clock.stop()
            let rest = restLooks(active)
            passage = Passage(looks: rest, seams: restSeams(ranks(rest, tie: active)), leaving: active, toward: heading,
                              scrollFrom: restOffset(active, from: base), scrollTo: restOffset(heading, from: base), base: base, via: via)
        }
        passage?.f = f
        draw()
        #if DEBUG
        probeRide(f)
        #endif
    }

    /// The pages came to rest on `id`. When a swipe carried the choice
    /// there, it stands where they brought it and `id` is chosen with nothing
    /// drawn again: the switch was the swipe; any other swipe's goes back to
    /// rest. Pages a tap sent and a finger took elsewhere bring the choice
    /// after them, on the switch's clock.
    func settle(on id: String) {
        if let swiped = passage, swiped.base != nil {
            passage = nil
            if swiped.toward == id, views[id] != nil {
                active = id
                for (tab, view) in views { view.setChosen(tab == id) }
                accessibilityValue = views[id]?.accessibilityLabel
            }
            restyle()
        }
        if id != active, views[id] != nil {
            pass(to: id, showing: id, animated: window != nil && !UIAccessibility.isReduceMotionEnabled)
        }
        #if DEBUG
        probeSettled(id)
        #endif
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
        // The chosen tab's own width changed (its title arrived after the
        // strip first showed it): revealed at its old width, a fresh launch
        // left the chosen tab standing past the strip's end, and its details
        // card hung from a tab not on screen. Shown again where it now fits,
        // unless a finger or a switch has the strip; a tab already in view
        // moves nothing (`reveal`).
        let chosenWidth = active.flatMap { views[$0]?.frame.width } ?? 0
        if abs(chosenWidth - revealedTabWidth) > 0.5 {
            revealedTabWidth = chosenWidth
            if passage == nil, !scroll.isTracking, !scroll.isDecelerating { reveal(active, animated: false) }
        }
        edges()
    }

    /// The chosen tab's width when the strip last revealed it.
    private var revealedTabWidth = 0.0

    /// The strip's width when the chosen tab was last revealed for it.
    private var revealedWidth = 0.0

    /// Folder tabs overlap like a drawer of real folders (TabsList.svelte):
    /// each steps back over its leading neighbour by this much.
    static let overlap = Radius.radiusSm

    /// The tabs laid along the track, each overlapping the one before it,
    /// with a flare of room at each end for the chosen sheet's foot.
    private func layoutTrack() {
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
        restyle()
    }

    /// How every tab rests with the choice on `chosen` (`TabView.Look`): the
    /// chosen tab whole; on the phone's row an unchosen tab a step further
    /// toward the shelf for each tab between it and the chosen one, to
    /// three, the chosen tab's own card (under its sheet) one step back;
    /// with none chosen every tab one step back. Nothing here sizes a tab:
    /// choosing one never moves the others.
    private func restLooks(_ chosen: String?) -> [String: TabView.Look] {
        let at = chosen.flatMap { order.firstIndex(of: $0) }
        var looks: [String: TabView.Look] = [:]
        for (index, id) in order.enumerated() {
            let step = at.map { max(1, min(abs(index - $0), 3)) } ?? 1
            looks[id] = TabView.Look(pick: at == index ? 1 : 0, recede: Double(step))
        }
        return looks
    }

    /// Each tab's place in the stack, by index, higher drawn over lower: a
    /// tab as far back as it is unchosen now (DESIGN.md "Stack"), so two
    /// trade places only at equal depth; ties to the one nearer `tie`, so
    /// every edge tucks under its neighbour toward the choice, the first on
    /// top with none; the earlier lower among those.
    private func ranks(_ looks: [String: TabView.Look], tie: String?) -> [Int] {
        let near = tie.flatMap { order.firstIndex(of: $0) } ?? 0
        let back = order.map { 1 - (looks[$0]?.pick ?? 0) }
        let lowestFirst = order.indices.sorted { a, b in
            if back[a] != back[b] { return back[a] > back[b] }
            let da = abs(a - near)
            let db = abs(b - near)
            return da == db ? a < b : da > db
        }
        var rank = [Int](repeating: 0, count: order.count)
        for (place, index) in lowestFirst.enumerated() { rank[index] = place }
        return rank
    }

    /// Where each seam rests in a stack: on the edge of the tab in front.
    private func restSeams(_ rank: [Int]) -> [String: Seam] {
        var seams: [String: Seam] = [:]
        for index in order.indices.dropLast() {
            seams[order[index]] = Seam(right: order[index + 1], q: rank[index] > rank[index + 1] ? 0 : 1)
        }
        return seams
    }

    /// Draws every tab as the choice stands (the passage's, else at rest):
    /// its look between where it began and how it rests with the choice
    /// landed; the stack ranked from those looks, the tab the choice is
    /// going to taking ties past half way; and each seam between where it
    /// began and where it rests then, the tab in front at that frame drawing
    /// it: its card, sheet and rim stand in from its own edge to it, its
    /// side's ink leaning toward the neighbour's as far as it stands in, and
    /// the side of the tab behind stands under it (DESIGN.md, "Session tab
    /// status rim"). At the handover, half way, the two sides stand on the
    /// same pixels in the same ink. A touch on an overlap is the tab drawn
    /// there.
    private func restyle() {
        let goal = passage?.toward ?? active
        let target = restLooks(goal)
        var looks: [String: TabView.Look] = [:]
        for (id, to) in target {
            guard let passage, let from = passage.looks[id] else {
                looks[id] = to
                continue
            }
            looks[id] = passage.along(from, passage.via?.looks[id], to)
        }
        let rank = ranks(looks, tie: passage.map { $0.f > 0.5 ? $0.toward : $0.leaving } ?? active)
        let restTo = restSeams(ranks(target, tie: goal))
        var q: [Double] = []
        var seams: [String: Seam] = [:]
        for index in order.indices.dropLast() {
            let left = order[index]
            let right = order[index + 1]
            let to = restTo[left]?.q ?? 0
            let from = passage?.seams[left].flatMap { $0.right == right ? $0.q : nil } ?? to
            let drawn = passage?.via?.seams[left].flatMap { $0.right == right ? $0.q : nil }
            q.append(passage?.along(from, drawn, to) ?? to)
            seams[left] = Seam(right: right, q: q[index])
        }
        seamNow = seams
        for (index, id) in order.enumerated() {
            guard let view = views[id] else { continue }
            let under = TabSides(leading: index > 0 && rank[index - 1] > rank[index],
                                 trailing: index < order.count - 1 && rank[index + 1] > rank[index])
            // How far each side stands in from the tab's own edge, 0 to 1:
            // the whole overlap at the neighbour's edge.
            let cut = TabSides(leading: index > 0 ? 1 - q[index - 1] : 0, trailing: index < q.count ? q[index] : 0)
            // The phone's row runs a side under its neighbour in full, its
            // square shoulder meeting the front's round one at the top
            // (bf08800e); the desk's card stops at the neighbour's edge. On a
            // switch the front side stands in from its own edge to the seam
            // (`cut`), so the side under it reaches under by as much again
            // (`1 - cut` is the front's share of that seam): it stands to the
            // seam as it does at rest, its corner never out of the front's
            // arc. Left at its own edge, half way through a switch its square
            // corner stood 4pt inside the front's edge, where the front's
            // shoulder is still 3pt under the top, and showed.
            let inset = TabSides(leading: barRow && under.leading ? -(1 - cut.leading) * Self.overlap : cut.leading * Self.overlap,
                                 trailing: barRow && under.trailing ? -(1 - cut.trailing) * Self.overlap : cut.trailing * Self.overlap)
            // A side in front leans its ink toward the neighbour's as far as it
            // stands in; one under its neighbour is not drawn, and keeps its own.
            let lean = TabSides(leading: under.leading ? 0 : cut.leading, trailing: under.trailing ? 0 : cut.trailing)
            // Each neighbour as its rim stands this frame, and how far each
            // seam glides: 0 at either edge, 1 half way (TabsList `--glide-*`).
            func beside(_ at: Int) -> TabView.Beside? {
                guard order.indices.contains(at), let tone = views[order[at]]?.rimTone else { return nil }
                return TabView.Beside(tone: tone, pick: looks[order[at]]?.pick ?? 0)
            }
            let glide = TabSides(leading: index > 0 ? 2 * min(q[index - 1], 1 - q[index - 1]) : 0,
                                 trailing: index < q.count ? 2 * min(q[index], 1 - q[index]) : 0)
            view.look = looks[id] ?? TabView.Look()
            view.edges = TabView.Edges(under: under, inset: inset, lean: lean,
                                       beside: TabSides(leading: beside(index - 1), trailing: beside(index + 1)), glide: glide)
        }
        let bottomUp = order.indices.sorted { rank[$0] < rank[$1] }.map { order[$0] }
        guard bottomUp != stacked else { return }
        stacked = bottomUp
        for id in bottomUp {
            if let view = views[id] { track.bringSubviewToFront(view) }
        }
        track.bringSubviewToFront(caret)
    }

    func scrollViewDidScroll(_: UIScrollView) { edges() }

    /// Only an edge with more past it fades (app.css `.kit-edge-fade`), coming
    /// in over the first 6% of the strip's travel from that end. In a group
    /// it fades over 40pt, straight. The phone's row fades on PaneTabs.svelte's
    /// eased curve, so a tab dissolves into the bar rather than being cut: the
    /// start over 24pt, clear for its first 6, so a title scrolled past it
    /// never stands against the sidebar toggle's glyph; the end over 16pt.
    private func edges() {
        let offset = scroll.contentOffset.x + scroll.contentInset.left
        let more = scroll.contentSize.width + scroll.contentInset.left + scroll.contentInset.right - scroll.bounds.width
        guard more > 1 else {
            scroll.layer.mask = nil
            return
        }
        let width = max(1, scroll.bounds.width)
        let ramp = 0.06 * more
        let len = barRow ? 16.0 : 40.0
        let start = len * min(1, max(0, offset) / ramp)
        let end = len * min(1, max(0, more - offset) / ramp)
        // (distance from the edge in fade lengths, opacity) for each stop.
        let lead: [(Double, Double)] = barRow ? [(0, 0), (0.375, 0), (0.75, 0.15), (1.125, 0.6), (1.5, 1)] : [(0, 0), (1, 1)]
        let trail: [(Double, Double)] = barRow ? [(1, 1), (0.75, 0.9), (0.5, 0.5), (0.25, 0.1), (0, 0)] : [(1, 1), (0, 0)]
        var stops = lead.map { (at: $0.0 * start / width, alpha: start > 0 ? $0.1 : 1) }
        stops += trail.map { (at: 1 - $0.0 * end / width, alpha: end > 0 ? $0.1 : 1) }
        fade.startPoint = CGPoint(x: 0, y: 0.5)
        fade.endPoint = CGPoint(x: 1, y: 0.5)
        fade.colors = stops.map { UIColor.black.withAlphaComponent($0.alpha).cgColor }
        fade.locations = stops.map { NSNumber(value: $0.at) }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = scroll.bounds
        CATransaction.commit()
        scroll.layer.mask = fade
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

#if DEBUG
/// A simulator pass's `-tabs-probe`: once the strip holds four tabs on
/// screen it taps them, each by its own tap's handler, through a step to a
/// neighbour and a jump past one on the switch's clock, logging every frame
/// (category TabsProbe), then the same two on a stepped clock that holds
/// each stop (`probeStops`: the clock's quarters, and f = 0.45, 0.5, 0.55
/// either side of the seam's handover) for 2s, logging and capturing the
/// window and the strip at each into
/// tmp/tabs-probe/<idiom>-<style>-<switch>-<stop>[-strip].png. "landed" is
/// the frame after the passage ends: it matches t=1. Then it arms the
/// takeover on three working tabs in a row: a real tap on the second of
/// them (at the point it logs), then a finger's drag on the pages toward the
/// third, which takes them while that switch runs; every frame of the tap
/// and of the swipe after it is logged ("takeover<n>", "takeover<n>-ride")
/// until the pages land.
extension PaneTabsView {
    private static let probeLog = Logger(subsystem: "dev.cawco.app", category: "TabsProbe")
    private static let probeStops: [(name: String, f: Double)] = [
        ("t0", 0), ("t25", Motion.easeCrossfade.value(at: 0.25)), ("f45", 0.45), ("f49", 0.49), ("t50", 0.5),
        ("f51", 0.51), ("f55", 0.55), ("t75", Motion.easeCrossfade.value(at: 0.75)), ("t100", 1),
    ]

    /// The stepped clock at `ms`: its stop's place among the stops (as `t`) and its fraction.
    private func probeHeld(_ ms: Double) -> (Double, Double)? {
        guard let hold = probeHold else { return nil }
        let last = Self.probeStops.count - 1
        let at = min(last, Int(ms / hold))
        return (Double(at) / Double(last), Self.probeStops[at].f)
    }

    private func probeBegin() {
        guard !probeBegun, ProcessInfo.processInfo.arguments.contains("-tabs-probe"), order.count >= 4, window != nil else { return }
        probeBegun = true
        // The opening sessions settle first; each step waits from the one
        // before it actually ran, so a busy main thread never bunches them.
        probeStep(0, after: 6)
    }

    /// The steps: the held step lands on the tab asking (its rim the
    /// attention ink) from its neighbour, so its seam is read between two
    /// inks; the held jump goes back past the idle second tab (no rim while
    /// unchosen), and the last jump past it again on the real clock, every
    /// frame logged.
    private var probeSteps: [(label: String?, to: Int, hold: Double?)] {
        let asking = order.firstIndex { views[$0]?.probeNeeds == true } ?? 2
        let beside = asking + 1 < order.count ? asking + 1 : asking - 1
        return [
            (nil, 0, nil), ("step", 1, nil), ("jump", 3, nil), (nil, beside, nil),
            ("step-held", asking, 2000), ("jump-held", asking >= 2 ? 0 : 3, 2000),
            ("jump-idle", asking >= 2 ? 2 : 0, nil),
        ]
    }

    private func probeStep(_ index: Int, after delay: Double) {
        let steps = probeSteps
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            guard steps.indices.contains(index) else {
                Self.probeLog.notice("tabs probe done")
                probeArm()
                return
            }
            let step = steps[index]
            guard order.indices.contains(step.to), let view = views[order[step.to]] else { return }
            probeLabel = step.label
            probeHold = step.hold
            probeStair = -1
            Self.probeLog.notice("tabs probe begin \(step.label ?? "home", privacy: .public) from=\(self.active ?? "-", privacy: .public) to=\(view.id, privacy: .public)")
            if !view.chosen { view.onSelect() }
            probeStep(index + 1, after: step.hold.map { $0 * Double(Self.probeStops.count) / 1000 + 1.5 } ?? 2)
        }
    }

    /// The takeover waits for a real tap on the next tab along from its
    /// start (`probeTakeoverStart`, which it goes back to first), at the
    /// point it logs (`tap=`), and a finger on the pages right after it.
    /// Each attempt is numbered and arms the next once it lands, so a finger
    /// that took no switch under way can be tried again.
    private func probeArm() {
        let start = probeTakeoverStart
        guard let window, order.indices.contains(start + 2), let first = views[order[start]], let next = views[order[start + 1]] else { return }
        // From a working tab: the asking one's page holds its ask, which a finger there takes.
        if !first.chosen {
            first.onSelect()
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in self?.probeArm() }
            return
        }
        probeAttempt += 1
        probeArmed = next.id
        let tap = next.convert(CGPoint(x: next.bounds.midX, y: next.bounds.midY), to: window)
        Self.probeLog.notice("tabs probe armed takeover attempt=\(self.probeAttempt) from=\(self.active ?? "-", privacy: .public) to=\(next.id, privacy: .public) toward=\(self.order[start + 2], privacy: .public) tap=\(Int(tap.x.rounded())),\(Int(tap.y.rounded()))")
    }

    /// The first of three tabs in a row whose first two are working, for the takeover.
    private var probeTakeoverStart: Int {
        let asking = Set(order.indices.filter { views[order[$0]]?.probeNeeds == true })
        return order.indices.first { $0 + 2 < order.count && !asking.contains($0) && !asking.contains($0 + 1) } ?? 0
    }

    /// The armed tab was tapped (`choose`, before its switch starts): its
    /// switch and the swipe that takes it are logged from here.
    func probeChose(_ id: String) {
        guard probeArmed == id else { return }
        probeArmed = nil
        let attempt = probeAttempt
        probeLabel = "takeover\(attempt)"
        probeHold = nil
        probeRode = false
        Self.probeLog.notice("tabs probe begin takeover\(attempt) from=\(self.active ?? "-", privacy: .public) to=\(id, privacy: .public)")
        // Where the choice stands once the tap has had its way: a tap made
        // while a finger rests on the pages holds (the two-finger check).
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            Self.probeLog.notice("tabs probe after tap attempt=\(attempt) active=\(self?.active ?? "-", privacy: .public) tapped=\(id, privacy: .public)")
        }
        // A finger the pages never followed lands no swipe: the attempt ends here, and the next is armed.
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            guard let self, probeLabel == "takeover\(attempt)" else { return }
            probeLabel = nil
            Self.probeLog.notice("tabs probe takeover landed attempt=\(attempt) on=- with no swipe")
            probeArm()
        }
    }

    /// A frame a swipe drew, at its fraction `f`, while the takeover is logged.
    private func probeRide(_ f: Double) {
        guard let label = probeLabel, label.hasPrefix("takeover") else { return }
        probeRode = true
        probeWrite("\(label)-ride", at: String(format: "%.3f", f))
    }

    /// The pages landed on `id`: once a swipe has carried the takeover, its
    /// end; then the next attempt is armed (`probeArm` goes back to its start).
    private func probeSettled(_ id: String) {
        guard let label = probeLabel, label.hasPrefix("takeover"), probeRode else { return }
        probeWrite("\(label)-ride", at: "landed")
        probeLabel = nil
        Self.probeLog.notice("tabs probe takeover landed attempt=\(self.probeAttempt) on=\(id, privacy: .public)")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.probeArm() }
    }

    /// One sampled frame at `t` of the clock (nil: landed): the front of the
    /// two tabs trading the choice, each seam, the scroll, every tab as drawn.
    private func probeFrame(_ t: Double?) {
        guard let label = probeLabel else { return }
        if probeHold != nil, let t {
            guard t != probeStair else { return }
            probeStair = t
        }
        probeWrite(label, at: t.map { String(format: "%.3f", $0) } ?? "landed")
        if probeHold != nil, let t {
            probeCapture("\(label)-\(Self.probeStops[Int((t * Double(Self.probeStops.count - 1)).rounded())].name)")
        }
        // A takeover's label outlives its tap, so a swipe that came too late is still seen.
        if t == nil {
            probeHold = nil
            if probeLabel?.hasPrefix("takeover") != true { probeLabel = nil }
        }
    }

    private func probeWrite(_ label: String, at: String) {
        let pair = [passage?.leaving, passage?.toward ?? active].compactMap { $0 }
        let front = pair.max { (stacked.firstIndex(of: $0) ?? -1) < (stacked.firstIndex(of: $1) ?? -1) }
        let seams = order.dropLast().map { seamNow[$0].map { String(format: "%.3f", $0.q) } ?? "-" }.joined(separator: ",")
        let tabs = order.compactMap { id in views[id].map { "\(id.prefix(8)) \($0.probeState)" } }.joined(separator: " | ")
        let f = passage.map { String(format: "%.3f", $0.f) } ?? "1.000"
        let toward = passage.map { String($0.toward.prefix(8)) } ?? "-"
        Self.probeLog.notice("tabs \(label, privacy: .public) t=\(at, privacy: .public) f=\(f, privacy: .public) front=\(String(front?.prefix(8) ?? "-"), privacy: .public) toward=\(toward, privacy: .public) seams=\(seams, privacy: .public) scroll=\(String(format: "%.2f", self.scroll.contentOffset.x), privacy: .public) || \(tabs, privacy: .public)")
    }

    private func probeCapture(_ name: String) {
        guard let window else { return }
        let style = traitCollection.userInterfaceStyle == .dark ? "dark" : "light"
        let idiom = traitCollection.userInterfaceIdiom == .pad ? "pad" : "phone"
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("tabs-probe", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let file = "\(idiom)-\(style)-\(name)"
        try? image.pngData()?.write(to: folder.appendingPathComponent("\(file).png"))
        let strip = convert(bounds, to: window).insetBy(dx: 0, dy: -6).intersection(window.bounds)
        let scale = image.scale
        let pixels = CGRect(x: strip.minX * scale, y: strip.minY * scale, width: strip.width * scale, height: strip.height * scale)
        if let crop = image.cgImage?.cropping(to: pixels) {
            try? UIImage(cgImage: crop, scale: scale, orientation: .up).pngData()?.write(to: folder.appendingPathComponent("\(file)-strip.png"))
        }
        Self.probeLog.notice("tabs probe hold \(file, privacy: .public)")
        probeRims(name, in: image, window: window)
        probeFeet(name, drawn: image, window: window)
    }

    /// Every tab's flared feet in a held stop's capture (`drawn`), one line a
    /// tab (PaneTabs.svelte's proof, rule "feet"): its sheet's opacity, and
    /// each side's foot read in the box its quarter turn stands in, clear of
    /// the run, against the window captured again with every flared foot
    /// hidden and with its own tab's drawn whole, so only how much of it is
    /// drawn is read (its rim's and side's strength, under both, cancel).
    /// The even tabs' feet are drawn whole without the odd ones', then the
    /// odd without the even, so a neighbour's foot, which flares out over
    /// this tab's box, is never read as this one's. A side in front and in
    /// view: its ink as a share of the whole, and the whole (summed channel
    /// change, 0 to 3 a pixel). A side under its neighbour's card: whether
    /// it has a foot to draw, and the pixels its box changes between hidden
    /// and whole. Else out of view.
    private func probeFeet(_ name: String, drawn image: UIImage, window: UIWindow) {
        let tabs = order.compactMap { views[$0] }
        /// The window with the feet of the tabs `whole` picks drawn whole, every other hidden.
        func capture(_ whole: (Int) -> Bool) -> ProbePixels? {
            for (index, tab) in tabs.enumerated() { tab.probeFootOpacity = whole(index) ? 1 : 0 }
            return ProbePixels(UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            })
        }
        let bare = capture { _ in false }
        let even = capture { $0 % 2 == 0 }
        let odd = capture { $0 % 2 == 1 }
        for tab in tabs { tab.probeFootOpacity = nil }
        guard let drawnPixels = ProbePixels(image), let barePixels = bare, let evenPixels = even, let oddPixels = odd else { return }
        let room = fadeRoom
        let strip = scroll.convert(scroll.bounds, to: window)
        let shown = CGRect(x: strip.minX + room.start, y: strip.minY, width: max(0, strip.width - room.start - room.end), height: strip.height)
        for (index, view) in tabs.enumerated() {
            let id = view.id
            let wholePixels = index % 2 == 0 ? evenPixels : oddPixels
            let feet = view.probeFeet(in: window).map { foot -> String in
                let inView = shown.contains(foot.box)
                if foot.under {
                    return "under:path\(foot.path ? 1 : 0):\(inView ? wholePixels.changed(from: barePixels, in: foot.box) : 0)"
                }
                guard inView else { return "out" }
                let full = wholePixels.ink(over: barePixels, in: foot.box)
                let ink = drawnPixels.ink(over: barePixels, in: foot.box)
                return String(format: "free:%.3f:%.1f", full > 0 ? ink / full : 0, full)
            }
            Self.probeLog.notice("tabs feet \(name, privacy: .public) \(id.prefix(8), privacy: .public) sheet=\(String(format: "%.3f", view.probeSheet), privacy: .public) lead=\(feet[0], privacy: .public) trail=\(feet[1], privacy: .public)")
        }
    }

    /// Every rim and seam as drawn in a held stop's capture (`image`, the
    /// window), one line each. A tab: its tone, whether chosen, its rim's
    /// strength; how many pixels of its top's stroke band stand off its
    /// card's fill (0 when it draws no rim); each side's contrast against
    /// the shelf at mid-height, read off the drawn stroke; its taper's ink at
    /// 0, 10, 20, 40 and 100% of its length up from the tip, read back from
    /// its mask, and that length against the shoulder's height. A seam: the
    /// tab in front, the strength of the side it draws there, and how many
    /// strokes cross the row at the sides' mid-height there.
    private func probeRims(_ name: String, in image: UIImage, window: UIWindow) {
        guard let pixels = ProbePixels(image) else { return }
        let shelf = Palette.surfaceShelf.resolvedColor(with: traitCollection)
        // What the strip shows whole: inside its scroll's bounds, clear of each edge's fade.
        let room = fadeRoom
        let strip = scroll.convert(scroll.bounds, to: window)
        let shown = CGRect(x: strip.minX + room.start, y: strip.minY, width: max(0, strip.width - room.start - room.end), height: strip.height)
        for id in order {
            guard let view = views[id], let rim = view.probeRim(in: window) else { continue }
            let card = rim.card
            // The top's stroke band along the middle 60% of the top, where
            // the strip shows at least 20pt of it whole (-1 where it does not).
            let band = CGRect(x: card.minX + card.width * 0.2, y: card.minY, width: card.width * 0.6, height: 1).intersection(shown)
            var off = -1
            if band.width >= 20 {
                off = 0
                let fill = pixels.at(CGPoint(x: band.midX, y: card.minY + 3))
                for x in stride(from: band.minX, to: band.maxX, by: 1 / pixels.scale) {
                    if ProbePixels.distance(pixels.at(CGPoint(x: x, y: card.minY + 0.5)), fill) > 6.0 / 255 { off += 1 }
                }
            }
            // Each side at mid-height, where the strip shows it whole: the
            // strongest pixel across its stroke (-1 where it is out of view).
            let mid = card.minY + (card.height + rim.shoulder) / 2
            func side(_ edge: CGFloat, inward: CGFloat) -> Double {
                guard edge - 2 >= shown.minX, edge + 2 <= shown.maxX else { return -1 }
                return stride(from: 0, to: 1.0, by: 1 / Double(pixels.scale)).map { d in
                    ProbePixels.contrast(pixels.at(CGPoint(x: edge + inward * (d + 0.5 / Double(pixels.scale)), y: mid)), shelf)
                }.max() ?? 0
            }
            let taper = [0, 0.1, 0.2, 0.4, 1].map { String(format: "%.3f", rim.taper($0)) }.joined(separator: ",")
            Self.probeLog.notice("tabs rim \(name, privacy: .public) \(id.prefix(8), privacy: .public) tone=\(rim.tone, privacy: .public) pick=\(String(format: "%.3f", view.look.pick), privacy: .public) strength=\(String(format: "%.3f", rim.strength), privacy: .public) px=\(off) mid=\(String(format: "%.2f,%.2f", side(card.minX, inward: 1), side(card.maxX, inward: -1)), privacy: .public) taper=\(taper, privacy: .public) length=\(String(format: "%.1f", rim.length), privacy: .public) shoulder=\(String(format: "%.1f", card.height - rim.shoulder), privacy: .public)")
        }
        for (index, left) in order.dropLast().enumerated() {
            let right = order[index + 1]
            guard let a = views[left], let b = views[right], let ra = a.probeRim(in: window), let rb = b.probeRim(in: window) else { continue }
            // The front tab draws the seam at its own edge there.
            let leftFront = (stacked.firstIndex(of: left) ?? 0) > (stacked.firstIndex(of: right) ?? 0)
            // The side the front tab draws the seam with, at its strength.
            let strength = leftFront ? ra.sides.trailing : rb.sides.leading
            let edge = leftFront ? ra.card.maxX : rb.card.minX
            guard edge - 6 >= shown.minX, edge + 6 <= shown.maxX else { continue }
            let y = ra.card.minY + (ra.card.height + max(ra.shoulder, rb.shoulder)) / 2
            let near = pixels.at(CGPoint(x: edge + (leftFront ? -5 : 5), y: y))
            let far = pixels.at(CGPoint(x: edge + (leftFront ? 5 : -5), y: y))
            // Each run of ink across the row: where it starts from the edge
            // (pt, toward the tab behind positive), its length in pixels, and
            // its strongest pixel.
            var runs: [(start: CGFloat, length: Int, peak: [Double], off: Double)] = []
            var inStroke = false
            for x in stride(from: edge - 4, to: edge + 4, by: 1 / pixels.scale) {
                let p = pixels.at(CGPoint(x: x, y: y))
                let off = min(ProbePixels.distance(p, near), ProbePixels.distance(p, far))
                let ink = off > 8.0 / 255
                if ink, !inStroke { runs.append((start: (x - edge) * (leftFront ? 1 : -1), length: 0, peak: p, off: 0)) }
                if ink, var run = runs.popLast() {
                    run.length += 1
                    if off > run.off { (run.peak, run.off) = (p, off) }
                    runs.append(run)
                }
                inStroke = ink
            }
            let detail = runs.map { String(format: "%.2f:%d:%02x%02x%02x", $0.start, $0.length, Int($0.peak[0] * 255), Int($0.peak[1] * 255), Int($0.peak[2] * 255)) }.joined(separator: ",")
            Self.probeLog.notice("tabs seam \(name, privacy: .public) \(left.prefix(8), privacy: .public)|\(right.prefix(8), privacy: .public) front=\((leftFront ? left : right).prefix(8), privacy: .public) strength=\(String(format: "%.3f", strength), privacy: .public) strokes=\(runs.count) runs=\(detail.isEmpty ? "-" : detail, privacy: .public)")
            // The phone's row: the tucked side's square shoulder against the
            // front's round one. How far inside the front card's edge its
            // corner stands, and so how far down its side shows before it
            // runs under the front card (the front's arc there; nothing past
            // the arc's depth). At rest it meets that arc at the top.
            guard barRow else { continue }
            let (front, behind, frontView) = leftFront ? (ra, rb, a) : (rb, ra, b)
            let r = CGFloat(frontView.radius)
            let inside = leftFront ? front.card.maxX - behind.card.minX : behind.card.maxX - front.card.minX
            let shows: CGFloat = inside >= r ? 0 : (inside <= 0 ? r : r - (r * r - (r - inside) * (r - inside)).squareRoot())
            Self.probeLog.notice("tabs corner \(name, privacy: .public) \(left.prefix(8), privacy: .public)|\(right.prefix(8), privacy: .public) front=\((leftFront ? left : right).prefix(8), privacy: .public) inside=\(String(format: "%.2f", inside), privacy: .public) radius=\(String(format: "%.1f", r), privacy: .public) shows=\(String(format: "%.2f", shows), privacy: .public)")
        }
    }
}

/// A capture's pixels in sRGB, read by the window's points.
private struct ProbePixels {
    let bytes: [UInt8]
    let width: Int
    let height: Int
    let scale: CGFloat

    init?(_ image: UIImage) {
        guard let cg = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        width = cg.width
        height = cg.height
        scale = image.scale
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: space,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        guard drawn else { return nil }
        self.bytes = bytes
    }

    func at(_ point: CGPoint) -> [Double] {
        let x = min(width - 1, max(0, Int(point.x * scale)))
        let y = min(height - 1, max(0, Int(point.y * scale)))
        let at = (y * width + x) * 4
        return (0 ..< 3).map { Double(bytes[at + $0]) / 255 }
    }

    /// The device pixels inside `box` (window points), clamped to the capture.
    private func pixels(in box: CGRect) -> (xs: Range<Int>, ys: Range<Int>)? {
        let x0 = max(0, Int((box.minX * scale).rounded(.down)))
        let x1 = min(width, Int((box.maxX * scale).rounded(.up)))
        let y0 = max(0, Int((box.minY * scale).rounded(.down)))
        let y1 = min(height, Int((box.maxY * scale).rounded(.up)))
        guard x1 > x0, y1 > y0 else { return nil }
        return (x0 ..< x1, y0 ..< y1)
    }

    /// The ink this capture has over `bare` inside `box`: each pixel's
    /// change summed over its channels, 0 to 3 a pixel.
    func ink(over bare: ProbePixels, in box: CGRect) -> Double {
        guard let area = pixels(in: box) else { return 0 }
        var sum = 0.0
        for y in area.ys {
            for x in area.xs {
                let at = (y * width + x) * 4
                for c in 0 ..< 3 { sum += abs(Double(bytes[at + c]) - Double(bare.bytes[at + c])) / 255 }
            }
        }
        return sum
    }

    /// How many pixels inside `box` stand off `bare` by more than 6/255 in any channel.
    func changed(from bare: ProbePixels, in box: CGRect) -> Int {
        guard let area = pixels(in: box) else { return 0 }
        var count = 0
        for y in area.ys {
            for x in area.xs {
                let at = (y * width + x) * 4
                if (0 ..< 3).contains(where: { abs(Int(bytes[at + $0]) - Int(bare.bytes[at + $0])) > 6 }) { count += 1 }
            }
        }
        return count
    }

    static func distance(_ a: [Double], _ b: [Double]) -> Double {
        zip(a, b).map { abs($0 - $1) }.max() ?? 0
    }

    /// WCAG contrast between a pixel and a colour.
    static func contrast(_ pixel: [Double], _ color: UIColor) -> Double {
        var (r, g, b, alpha) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        color.getRed(&r, green: &g, blue: &b, alpha: &alpha)
        func luminance(_ rgb: [Double]) -> Double {
            let linear = rgb.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        }
        let one = luminance(pixel)
        let two = luminance([Double(r), Double(g), Double(b)].map { min(1, max(0, $0)) })
        return (max(one, two) + 0.05) / (min(one, two) + 0.05)
    }
}
#endif

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

/// One folder tab: its tint card, its sheet, its status rim, its status
/// glyph (none on the phone's row, whose rim is the status), label, details
/// chevron (shown on the chosen tab, its slot kept on the rest) and close.
final class TabView: UIView {
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

    /// On the phone's row: a rounder top (`radiusLg`) and its flare, and the
    /// receding fill. The status rim is on every width; on the phone's row it
    /// is the tab's status alone: the row draws no status glyph (owner: "why
    /// does it still have the icon if the rim is there"; "desktop has icons
    /// mobile not"); VoiceOver still reads it in the tab's label.
    var phoneRow = false {
        didSet {
            guard phoneRow != oldValue else { return }
            status.isHidden = phoneRow
            pad()
            setNeedsLayout()
            paint()
        }
    }

    /// How the tab is drawn, which a switch moves frame by frame on its
    /// clock and a swipe by its fraction (the strip's `restyle`).
    struct Look: Equatable {
        /// How chosen it is, 0 to 1: its sheet's opacity over its card, its
        /// rim's strength, its title's ink and its chevron.
        var pick = 0.0
        /// Its card's recede step on the phone's row, 1 to 3, between two
        /// steps while the choice moves.
        var recede = 1.0
    }

    var look = Look() {
        didSet {
            guard look != oldValue else { return }
            paint(animated: false)
        }
    }

    /// The tab's two ends. On the phone's row a title's room at each end
    /// clears the overlap, so a neighbour tucked over either end never
    /// touches it: a lead past the overlap before it, the chosen sheet's
    /// flare past the overlap after it. The same on every tab, chosen or
    /// not, so a choice never resizes a tab and moves the ones after it
    /// (PaneTabs.svelte, `--px-start`/`--px-end`).
    private func pad() {
        let coarse = traitCollection.userInterfaceIdiom != .mac
        let leading: Double
        let trailing: Double
        if phoneRow {
            leading = PaneTabsView.overlap + Size.cTabLead
            trailing = PaneTabsView.overlap + Radius.radiusLg
        } else {
            leading = PaneTabsView.px
            trailing = coarse ? PaneTabsView.px : PaneTabsView.px - 6
        }
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: leading, bottom: 0, trailing: trailing)
    }

    /// Its shoulders' radius.
    var radius: Double { phoneRow ? Radius.radiusLg : Radius.radiusSm }

    private let tint = CAShapeLayer()
    private let sheet = CAShapeLayer()
    /// The status rim (PaneTabs.svelte `.rim`): the tab's outline at
    /// `tabRimWidth`, with a soft glow at half its strength, each foot
    /// narrowing to a point on the shelf, fading out up the side over
    /// `tabRimTaper` short of the shoulder: straight down on a receded tab,
    /// out round the sheet's flare on the chosen one. Whole on the chosen
    /// tab, subtle on an unchosen one, none on an unchosen idle one (`strength`).
    private let rimHost = CALayer()
    /// The rim's reach: off the phone's row it stops at a tucked shoulder's
    /// crest, stroke and glow (`layoutRim`).
    private let rimClip = CALayer()
    /// The rim's pieces (PaneTabs.svelte `.rim-top`, `.rim-side`): the top
    /// in its own ink, and each side in an ink that leans toward its
    /// neighbour's on a gliding seam. They are drawn opaque and overlap by
    /// half a point under the rim's one opacity, its strength, so no join
    /// shows; a side at a gliding seam leans its own strength on top of
    /// that (its opacity), the rest of the rim keeps the tab's.
    private let rim = CALayer()
    private let rimTop = CAShapeLayer()
    private let lead = RimSide()
    private let trail = RimSide()
    /// The glows' taper up from the shelf (the plain foot's, `taperInk`).
    private let rimFade = CAGradientLayer()
    /// The glow: the outline's own shadow (`0 0 6px`, half the rim's
    /// strength), kept outside the tab as the web's box shadow is, so it
    /// never deepens the stroke or the tab under it; and the same off the
    /// outline with the sheet's flared feet (`glowFlared`), the two
    /// cross-fading with the feet. It leans at a gliding seam's side as
    /// that side's stroke does (`glowSides`), as the web's glow, drawn off
    /// the pieces it shows, does.
    private let glowFade = CALayer()
    private let glowHost = CALayer()
    private let glowLean = CALayer()
    private let glowSides = CAGradientLayer()
    private let glow = CALayer()
    private let glowOutside = CAShapeLayer()
    private let glowFlaredHost = CALayer()
    private let glowFlared = CALayer()
    private let glowFlaredOutside = CAShapeLayer()
    /// Room round the outline for the glow, inside the fade.
    private static let spill = 6.0

    /// Its two sides as the strip stands them (`PaneTabsView.restyle`): which
    /// stands under a neighbour drawn above it, and how far in from the
    /// tab's own edge its card, sheet and rim stand there, pt, where the
    /// seam with that neighbour is. On the desk a side under a neighbour
    /// stops at that neighbour's edge; on the phone's row it runs under in
    /// full; a side in front stands at the seam, which a switch glides
    /// between the two tabs' edges, its rim's ink leaning toward the
    /// neighbour's (`beside`) as far as it stands in (`lean`, 0 to 1), and
    /// that side's strength alone toward the weaker of the two rims' as the
    /// seam nears half way (`glide`, 0 at either edge, 1 half way).
    struct Edges: Equatable {
        var under = TabSides(leading: false, trailing: false)
        var inset = TabSides(leading: 0.0, trailing: 0.0)
        var lean = TabSides(leading: 0.0, trailing: 0.0)
        var beside = TabSides<Beside?>(leading: nil, trailing: nil)
        var glide = TabSides(leading: 0.0, trailing: 0.0)
    }

    /// A neighbour as its rim stands: its session's tone and how chosen it is.
    struct Beside: Equatable {
        var tone: SessionStatusView.Tone
        var pick: Double
    }

    var edges = Edges() {
        didSet {
            guard edges != oldValue else { return }
            if edges.under != oldValue.under || edges.inset != oldValue.inset { setNeedsLayout() }
            if edges.lean != oldValue.lean || edges.beside != oldValue.beside || edges.glide != oldValue.glide { paintRim(animated: false) }
        }
    }

    /// Its session's tone, which sets its rim's ink and strengths.
    var rimTone: SessionStatusView.Tone? { tab?.face.tone }

    /// A rim's strength (its opacity) with its tab `pick` chosen (0 to 1),
    /// between its unchosen and chosen strengths (PaneTabs.svelte `RIM`):
    /// chosen `tabRimMixChosen`, or `tabRimMixIdle` in the muted ink (idle,
    /// done); unchosen `tabRimMixSubtle`, and none on an idle tab. Solid
    /// (Increase Contrast, Reduce Transparency) wears every rim it draws whole.
    static func strength(_ tone: SessionStatusView.Tone, pick: Double, traits: UITraitCollection, solid: Bool) -> Double {
        let muted = tone == .quiet || tone == .done
        let full = solid ? 1 : (muted ? Effect.tabRimMixIdle : Effect.tabRimMixChosen).value(for: traits)
        let rest = tone == .quiet ? 0 : (solid ? 1 : Effect.tabRimMixSubtle)
        return rest + (full - rest) * pick
    }

    /// A rim's ink on the rail's scale: working the live ink, needs you the
    /// attention ink, failed the fail ink, the rest the muted ink.
    private static func ink(_ tone: SessionStatusView.Tone) -> UIColor {
        switch tone {
        case .working: Palette.statusLiveGlyph
        case .attention: Palette.tabRimAttn
        case .failed: Palette.statusFailGlyph
        case .quiet, .done: Palette.inkMuted
        }
    }

    /// Its shoulders' radii. On the phone's row a shoulder tucked under its
    /// neighbour is square, card and rim (PaneTabs.svelte `--r-start`,
    /// `--r-end`): the neighbour over it is rounder than the overlap is
    /// deep, so a round shoulder would rise out of the notch and its rim
    /// cross the neighbour's, a double stroke at the junction. Square, its
    /// top runs on under the neighbour and meets its shoulder at the top, as
    /// the mockup's tabs do, whose radius is their overlap.
    private var shoulders: (leading: Double, trailing: Double) {
        let r = radius
        guard phoneRow else { return (r, r) }
        return (edges.under.leading ? 0 : r, edges.under.trailing ? 0 : r)
    }
    private let status = SessionStatusView(.idle, compact: true)
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let details = ChevronButton()
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
        layer.addSublayer(sheet)
        rimTop.fillRule = .evenOdd
        rim.addSublayer(rimTop)
        rim.addSublayer(lead.layer)
        rim.addSublayer(trail.layer)
        for (shine, host, outside) in [(glow, glowHost, glowOutside), (glowFlared, glowFlaredHost, glowFlaredOutside)] {
            shine.shadowOffset = .zero
            shine.shadowRadius = 3
            outside.fillRule = .evenOdd
            host.mask = outside
            host.addSublayer(shine)
            glowLean.addSublayer(host)
        }
        glowSides.startPoint = CGPoint(x: 0, y: 0.5)
        glowSides.endPoint = CGPoint(x: 1, y: 0.5)
        glowSides.colors = Array(repeating: UIColor.black.cgColor, count: 6)
        glowLean.mask = glowSides
        glowFade.mask = rimFade
        glowFade.addSublayer(glowLean)
        rimHost.addSublayer(glowFade)
        rimHost.addSublayer(rim)
        rimFade.colors = [UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        rimClip.masksToBounds = true
        rimClip.addSublayer(rimHost)
        layer.addSublayer(rimClip)
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
        // The title, then its status in the words its glyph is read by,
        // whether or not the glyph is drawn.
        hit?.accessibilityLabel = "\(tab.label), \(tab.status.isEmpty ? tab.face.label : tab.status)"
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

    /// Chosen or not, as the strip's choice stands: what a tap on it does and
    /// how VoiceOver reads it. How chosen it looks is its `look`, which the
    /// switch's clock moves.
    func setChosen(_ next: Bool) {
        chosen = next
        (row.arrangedSubviews.first)?.accessibilityTraits = next ? [.button, .selected] : .button
        details.isUserInteractionEnabled = !(tab?.isRun ?? false)
        paint()
    }

    #if DEBUG
    /// Its session is parked on the operator, for `-tabs-probe`.
    var probeNeeds: Bool { tab?.needs == true }

    /// Its rim as drawn, for `-tabs-probe`: its card in `window`'s points,
    /// its shoulders' radius, its tone, its strength, how far up from the
    /// tip its fade reaches, and its taper's ink at `s` of `tabRimTaper` up
    /// from the tip, read back from the mask's own stops as the gradient
    /// draws them.
    struct ProbeRim {
        let card: CGRect
        let shoulder: Double
        let tone: String
        /// The rim's, its top's.
        let strength: Double
        /// Each side's: the rim's, leaned at a gliding seam.
        let sides: TabSides<Double>
        let length: Double
        let taper: (Double) -> Double
    }

    func probeRim(in window: UIWindow) -> ProbeRim? {
        guard let tone = tab?.face.tone else { return nil }
        let height = Double(rimHost.bounds.height)
        let length = min(Effect.tabRimTaper, shoulderHeight)
        let locations = (rimFade.locations ?? []).map(\.doubleValue)
        let inks = ((rimFade.colors as? [CGColor]) ?? []).map { Double($0.alpha) }
        let taper: (Double) -> Double = { s in
            let at = (height - s * Effect.tabRimTaper) / height
            guard locations.count == inks.count, let above = locations.firstIndex(where: { $0 >= at }) else { return inks.last ?? 1 }
            guard above > 0 else { return inks.first ?? 1 }
            let span = locations[above] - locations[above - 1]
            let t = span > 0 ? (at - locations[above - 1]) / span : 0
            return inks[above - 1] + (inks[above] - inks[above - 1]) * t
        }
        return ProbeRim(card: convert(cardRect, to: window), shoulder: max(shoulders.leading, shoulders.trailing), tone: "\(tone)",
                        strength: Double(rim.opacity),
                        sides: TabSides(leading: Double(rim.opacity * lead.layer.opacity), trailing: Double(rim.opacity * trail.layer.opacity)),
                        length: length, taper: taper)
    }

    /// `-tabs-probe`: the flared feet drawn as the choice stands (nil), or
    /// at this opacity (0 hidden, 1 whole), for a capture.
    var probeFootOpacity: Float? {
        didSet { paintFeet() }
    }

    /// Its sheet's opacity on screen, for `-tabs-probe`.
    var probeSheet: Double {
        Double(sheet.presentation()?.opacity ?? sheet.opacity)
    }

    /// One side's flared foot for `-tabs-probe`: whether it stands under its
    /// neighbour's card, whether it has a foot to draw, and the box its
    /// quarter turn stands in, out past the card's side from the run's foot
    /// to the shelf, in the window's points (clear of the run, which the
    /// plain foot shares).
    struct ProbeFoot {
        let under: Bool
        let path: Bool
        let box: CGRect
    }

    /// Its leading side's flared foot, then its trailing side's.
    func probeFeet(in window: UIWindow) -> [ProbeFoot] {
        let card = cardRect
        let foot = CGFloat(flare)
        let reach = foot + 0.5
        func box(_ edge: CGFloat, outward: Bool) -> CGRect {
            let x: CGFloat = outward ? edge : edge - reach
            return convert(CGRect(x: x, y: card.maxY - foot, width: reach, height: foot), to: window)
        }
        return [
            ProbeFoot(under: edges.under.leading, path: lead.flared.path != nil, box: box(card.minX, outward: false)),
            ProbeFoot(under: edges.under.trailing, path: trail.flared.path != nil, box: box(card.maxX, outward: true)),
        ]
    }

    /// How the tab is drawn now, for `-tabs-probe`: its look; its sheet's
    /// opacity (model and on screen) and its card's; its rim's strength; its
    /// chevron's; whether any transform, mask or running animation moves its
    /// sheet or the tab; its card's fill; which sides stand under a
    /// neighbour; its rim's top, leading and trailing ink; its sides'
    /// strengths over the rim's (1 but at a gliding seam).
    var probeState: String {
        func hex(_ color: CGColor?) -> String {
            guard let color, let rgb = color.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components, rgb.count >= 3 else { return "-" }
            return String(format: "%02x%02x%02x", Int((rgb[0] * 255).rounded()), Int((rgb[1] * 255).rounded()), Int((rgb[2] * 255).rounded()))
        }
        /// An ink unclamped (extended sRGB), so a wide-gamut one mixes as drawn.
        func ink(_ color: CGColor?) -> String {
            guard let color, let rgb = color.converted(to: CGColorSpace(name: CGColorSpace.extendedSRGB)!, intent: .defaultIntent, options: nil)?.components, rgb.count >= 3 else { return "-" }
            return String(format: "%.3f,%.3f,%.3f", rgb[0], rgb[1], rgb[2])
        }
        let moved = !CATransform3DIsIdentity(sheet.transform) || !CATransform3DIsIdentity(sheet.presentation()?.transform ?? CATransform3DIdentity) || sheet.mask != nil
        let keys = (sheet.animationKeys() ?? []) + (tint.animationKeys() ?? [])
        // Short: a frame's line holds every tab, and the log cuts a line at 1KB.
        return String(format: "pick=%.3f sheet=%.3f/%.3f tint=%.0f rim=%.3f chev=%.3f moved=%d tx=%@ keys=%@ fill=%@ under=%d%d top=%@ lead=%@ trail=%@ sides=%.3f,%.3f",
                      look.pick, sheet.opacity, sheet.presentation()?.opacity ?? sheet.opacity, tint.opacity,
                      rim.opacity, details.alpha, moved ? 1 : 0,
                      transform.isIdentity ? "id" : NSCoder.string(for: transform), keys.isEmpty ? "-" : keys.joined(separator: ","),
                      hex(tint.fillColor), edges.under.leading ? 1 : 0, edges.under.trailing ? 1 : 0,
                      ink(rimTop.fillColor), ink(lead.body.fillColor), ink(trail.body.fillColor), lead.layer.opacity, trail.layer.opacity)
    }
    #endif

    /// The surface the tab stands in, its press aside: its sheet when chosen,
    /// else its card. Its pulled options grow out of it (`TabOptionsSheet`),
    /// and fold back into it once the finger has let go.
    var surface: UIColor {
        (chosen ? Palette.tabSheet : card).resolvedColor(with: traitCollection)
    }

    /// What stands on the tab, its title and its rim, without its card or
    /// sheet: drawn over the surface its options grow out of.
    func contentSnapshot() -> UIView? {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        tint.isHidden = true
        sheet.isHidden = true
        CATransaction.commit()
        let snapshot = snapshotView(afterScreenUpdates: true)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        tint.isHidden = false
        sheet.isHidden = false
        CATransaction.commit()
        return snapshot
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
    /// shelf for each tab of distance from the chosen one (`look`), between
    /// two steps while the choice moves.
    private var card: UIColor {
        guard phoneRow else { return Palette.surfaceRecessDeep }
        let steps = [Palette.tabRecede1, Palette.tabRecede2, Palette.tabRecede3]
        let at = min(max(look.recede, 1), 3) - 1
        let low = min(Int(at), 1)
        return Self.mix(steps[low], steps[low + 1], at - Double(low), traits: traitCollection)
    }

    /// `a` toward `b` by `t`, both resolved for `traits`.
    private static func mix(_ a: UIColor, _ b: UIColor, _ t: Double, traits: UITraitCollection) -> UIColor {
        let a = a.resolvedColor(with: traits)
        guard t > 0 else { return a }
        let b = b.resolvedColor(with: traits)
        guard t < 1 else { return b }
        var (ar, ag, ab, aa) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        var (br, bg, bb, ba) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
        b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return UIColor(red: ar + (br - ar) * t, green: ag + (bg - ag) * t, blue: ab + (bb - ab) * t, alpha: aa + (ba - aa) * t)
    }

    /// `animated` false under a switch: every change lands in its own frame.
    private func paint(animated: Bool = true) {
        let traits = traitCollection
        CATransaction.begin()
        CATransaction.setDisableActions(!animated)
        let fill: UIColor = pressed ? Palette.surfaceFill : (hovering && !chosen ? Palette.surfaceHover : card)
        tint.fillColor = fill.resolvedColor(with: traits).cgColor
        // The chosen tab's sheet (`tab-sheet`): the transcript's head fades
        // into the same surface (TranscriptView's ground under its EdgeFade).
        sheet.fillColor = (pressed ? Palette.surfaceFill : Palette.tabSheet).resolvedColor(with: traits).cgColor
        // The sheet shows as far as the tab is chosen, over its own card,
        // which hides once the sheet covers it whole; the chevron (its slot
        // kept on every tab) comes and goes with it. They follow the
        // switch's clock alone, so no implicit action runs on them. The
        // rim's feet are the sheet's, on the same frame (`paintFeet`).
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        sheet.opacity = Float(look.pick)
        tint.opacity = look.pick >= 1 ? 0 : 1
        paintFeet()
        CATransaction.commit()
        let scale = look.pick >= 1 || UIAccessibility.isReduceMotionEnabled ? 1 : Motion.popScale + (1 - Motion.popScale) * look.pick
        UIView.performWithoutAnimation {
            details.alpha = look.pick
            details.transform = scale == 1 ? .identity : CGAffineTransform(scaleX: scale, y: scale)
        }
        // The title's ink follows how chosen the tab is; parked on the
        // operator, or under a pointer, it is strong.
        label.ink = hovering || tab?.needs == true ? Palette.inkStrong : Self.mix(Palette.inkMuted, Palette.inkStrong, look.pick, traits: traits)
        paintRim(animated: animated)
        CATransaction.commit()
    }

    /// The rim in its session's status colour (`ink`), at its strength now
    /// (`strength`, how chosen the tab stands this frame), which a switch
    /// moves one way only, from where it rests to where it will. Where one of
    /// its seams glides on a switch, the side standing at that seam (its
    /// shoulder, run and foot) leans its own strength toward the weaker of
    /// its tab's and that neighbour's as the seam nears half way and back as
    /// it leaves, so at the handover the two sides stand at one strength and
    /// the edge passes with nothing moving; against a rimless neighbour the
    /// gliding side fades out. The top and the far side keep the tab's own
    /// strength, so a jump past a rimless tab never blinks the rims either
    /// side of it out (PaneTabs.svelte `.rim-side` opacity). Each side's ink
    /// leans toward its neighbour's as far as it stands in (`edges`). A
    /// status changing at rest cross-fades over `durPanel`.
    private func paintRim(animated: Bool) {
        guard let tone = tab?.face.tone else { return }
        let traits = traitCollection
        let solid = solidRim
        let own = Self.strength(tone, pick: look.pick, traits: traits, solid: solid)
        /// A side's strength over the rim's: 1, but at a gliding seam leaning toward the neighbour's.
        func lean(_ glide: Double, _ beside: Beside?) -> Double {
            guard glide > 0, own > 0, let beside else { return 1 }
            let other = Self.strength(beside.tone, pick: beside.pick, traits: traits, solid: solid)
            return 1 - glide + glide * min(1, other / own)
        }
        let leading = lean(edges.glide.leading, edges.beside.leading)
        let trailing = lean(edges.glide.trailing, edges.beside.trailing)
        let resolved = Self.ink(tone).resolvedColor(with: traits)
        CATransaction.begin()
        CATransaction.setDisableActions(!animated)
        CATransaction.setAnimationDuration(Motion.durPanel)
        CATransaction.setAnimationTimingFunction(Motion.easeOut.function)
        rim.opacity = Float(own)
        lead.layer.opacity = Float(leading)
        trail.layer.opacity = Float(trailing)
        rimTop.fillColor = resolved.cgColor
        func side(_ beside: Beside?, _ lean: Double) -> CGColor {
            beside.map { Self.mix(resolved, Self.ink($0.tone), lean, traits: traits).cgColor } ?? resolved.cgColor
        }
        lead.ink = side(edges.beside.leading, edges.lean.leading)
        trail.ink = side(edges.beside.trailing, edges.lean.trailing)
        // The glows at half the rim's strength, leaning with each side; none
        // when the rim is solid.
        for shine in [glow, glowFlared] {
            shine.shadowColor = resolved.cgColor
            shine.shadowOpacity = solid ? 0 : Float(own / 2)
        }
        glowSides.colors = [leading, leading, 1, 1, trailing, trailing].map { UIColor.black.withAlphaComponent($0).cgColor }
        CATransaction.commit()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let flare = phoneRow ? Radius.radiusLg : Radius.radiusSm
        let radius = radius
        tint.frame = bounds
        let corners = shoulders
        let card = cardRect
        tint.path = Self.outline(card, leading: corners.leading, trailing: corners.trailing).cgPath
        // The sheet stands on the card's own box, its foot flaring past it.
        sheet.frame = card.insetBy(dx: -flare, dy: 0)
        sheet.path = Self.sheetPath(in: sheet.bounds, radius: radius, flare: flare)
        layoutRim()
        CATransaction.commit()
    }

    /// The card's own box, its sides where the strip stands them (`edges`).
    /// Off the phone's row a card tucked under a neighbour drawn above it
    /// starts where that neighbour's edge stands, its own shoulder rounded
    /// there, so the neighbour's shoulder shows against the shelf and each
    /// tab stands on it with its rounded top (TabItem.svelte, `--tuck`). The
    /// phone's row runs it under in full: its square shoulder meets the
    /// neighbour's rim at the top.
    private var cardRect: CGRect {
        let inset = edges.inset
        return CGRect(x: bounds.minX + inset.leading, y: bounds.minY, width: max(0, bounds.width - inset.leading - inset.trailing), height: bounds.height)
    }

    /// The rim's ring (PaneTabs.svelte `.rim`), on the card's own outline:
    /// `tabRimWidth` all round (1pt solid), each foot narrowing to a point on
    /// the shelf from where the taper's ink is 90% whole, or the foot's top
    /// where that is lower (`.rim-plain`, `narrowing`); and the rim and its
    /// glow fading out up each side to that tip over `tabRimTaper` along the
    /// stroke on the taper's ease-out, stopping at the shoulder (`rimFade`,
    /// `taperInk`). The chosen tab's feet run out round the sheet's own
    /// flare instead (`.rim-flared`, `flaredFoot`), each side cross-fading
    /// between the two on the sheet's clock (`paintFeet`). Off the phone's
    /// row a tucked card's
    /// rim stops at that shoulder's crest, stroke and glow (`rimClip`): the
    /// neighbour's stroke alone runs down into the notch between the two
    /// shoulders, one outline where they meet (PaneTabs.svelte, the desk's
    /// `.rim` clip).
    private func layoutRim() {
        let spill = Self.spill
        let flare = flare
        let card = cardRect
        let corners = shoulders
        // Room past each side for the flared foot and its glow.
        let room = flare + spill
        let reach = CGRect(x: card.minX - room, y: card.minY - spill, width: card.width + 2 * room, height: card.height + spill)
        var clip = reach
        if !phoneRow, edges.under.leading {
            clip = CGRect(x: card.minX + corners.leading, y: clip.minY, width: clip.maxX - card.minX - corners.leading, height: clip.height)
        }
        if !phoneRow, edges.under.trailing {
            clip.size.width = max(0, card.maxX - corners.trailing - clip.minX)
        }
        rimClip.frame = clip
        rimHost.frame = reach.offsetBy(dx: -clip.minX, dy: -clip.minY)
        rim.frame = rimHost.bounds
        let outline = CGRect(x: room, y: spill, width: card.width, height: card.height)
        let solid = solidRim
        let top = solid ? 1.0 : Effect.tabRimWidth
        let ring = Self.ring(outline, leading: corners.leading, trailing: corners.trailing, width: top, foot: min(Self.narrowing, flare)).cgPath
        // Cut in three where each shoulder meets the top, the pieces
        // overlapping by half a point.
        let leadEnd = outline.minX + max(corners.leading, top)
        let trailStart = max(leadEnd, outline.maxX - max(corners.trailing, top))
        let span = rim.bounds
        rimTop.frame = span
        rimTop.path = ring.intersection(CGPath(rect: CGRect(x: leadEnd - 0.5, y: span.minY, width: max(0, trailStart - leadEnd + 1), height: span.height), transform: nil), using: .evenOdd)
        // Each side: its body down the ring to its plain foot, and its
        // flared foot round the sheet's own flare. A side under its
        // neighbour's card draws no foot (PaneTabs.svelte `--u`, flipped with
        // the stack at half way): its body stops at the run's foot, the
        // flare's height, and it has no flared foot, as the sheet's own
        // foot there lies under that card.
        let runFoot: CGFloat = outline.maxY - CGFloat(flare)
        let sides: [(side: RimSide, from: CGFloat, to: CGFloat, under: Bool, trailing: Bool)] = [
            (lead, span.minX, CGFloat(leadEnd) + 0.5, edges.under.leading, false),
            (trail, CGFloat(trailStart) - 0.5, span.maxX, edges.under.trailing, true),
        ]
        for (side, from, to, under, trailing) in sides {
            side.layer.frame = span
            side.body.frame = span
            side.bodyFade.frame = span
            side.flared.frame = span
            let bottom: CGFloat = under ? runFoot : span.maxY
            side.body.path = ring.intersection(CGPath(rect: CGRect(x: from, y: span.minY, width: max(0, to - from), height: max(0, bottom - span.minY)), transform: nil), using: .evenOdd)
            side.flared.path = under ? nil : Self.flaredFoot(outline, flare: flare, width: top, trailing: trailing)
            // Its taper round the quarter turn, from the tip (`footTaper`).
            let centre = Self.flareCentre(edge: Double(trailing ? outline.maxX : outline.minX), shelf: Double(outline.maxY), flare: flare, outward: trailing ? 1 : -1)
            let ro = CGFloat(flare + top)
            let x: CGFloat = trailing ? centre.x - ro - 1 : centre.x - 1
            side.flaredFade.frame = CGRect(x: x, y: centre.y - 1, width: ro + 2, height: CGFloat(flare) + 2)
            side.flaredFade.contents = Self.footTaper(flare: flare, width: top, scale: traitCollection.displayScale, trailing: trailing)
        }
        // The body's ink up from the shelf, both feet's tapers, by how chosen
        // the tab stands (`BodyMask`, `paintFeet`).
        bodyMask = BodyMask(height: Double(span.height), flare: flare, arc: (flare + top / 2) * .pi / 2, shoulder: shoulderHeight)
        let locations = bodyMask.stops.map { NSNumber(value: ($0.height - $0.h) / max(1, $0.height)) }
        for side in [lead, trail] { side.bodyFade.locations = locations }
        // The glow is the outline's shadow, shown only outside the outline,
        // and the same off the outline with the sheet's flared feet,
        // cross-fading with the feet (`paintFeet`); each side's share of
        // them at that side's strength (`paintRim`): the mask steps from one
        // to the other over the glow's own reach about each join, as the
        // web's glow, blurred off its pieces, blends.
        let shape = Self.outline(outline, leading: corners.leading, trailing: corners.trailing)
        let flaredShape = Self.flaredOutline(outline, leading: corners.leading, trailing: corners.trailing, flare: flare)
        for piece in [glowFade, glowLean, glowSides, glowHost, glowFlaredHost, glow, glowFlared, glowOutside, glowFlaredOutside, rimFade] {
            piece.frame = rimHost.bounds
        }
        let width = max(1, Double(span.width))
        let blend = Double(glow.shadowRadius)
        let joins = (lead: Double(leadEnd), trail: Double(trailStart))
        glowSides.locations = [0, joins.lead - blend, joins.lead + blend, joins.trail - blend, joins.trail + blend, width]
            .map { NSNumber(value: min(1, max(0, $0 / width))) }
        for (shine, outside, path) in [(glow, glowOutside, shape), (glowFlared, glowFlaredOutside, flaredShape)] {
            shine.shadowPath = path.cgPath
            let around = UIBezierPath(rect: rimHost.bounds)
            around.append(path)
            outside.path = around.cgPath
        }
        // The glows' taper, up from the tip on the shelf: whole above it,
        // fading to nothing at the tip. Each stop stands at its share of the
        // taper up from the tip, no higher than the shoulder (PaneTabs.svelte
        // `.rim-plain` mask).
        let height = rimHost.bounds.height
        let shoulder = shoulderHeight
        let stops = Self.taperStops.reversed().map { x in
            (at: (height - min(x * Effect.tabRimTaper, shoulder)) / height, ink: Self.taperInk(x))
        }
        rimFade.locations = [0] + stops.map { NSNumber(value: $0.at) }
        rimFade.colors = [UIColor.black.cgColor] + stops.map { UIColor.black.withAlphaComponent($0.ink).cgColor }
        paintFeet()
    }

    /// A side's body ink up from the shelf, as a gradient's stops: each
    /// foot's taper (`taperInk`, its stops the web's, straight between them,
    /// whole from the shoulder up) weighed by how much of it shows, summed
    /// where both run on the same pixels (PaneTabs.svelte `.rim-plain` and
    /// `.rim-flared`, added as light). The plain foot's runs from its tip on
    /// the shelf; the flared foot's from its own tip, one flare out, so up
    /// the run it stands its quarter turn (`arc`) further along, and starts
    /// at the run's foot (`flare` up), where the flared foot leaves the side.
    private struct BodyMask {
        /// Each stop: its height above the shelf, pt, whether it is the run's
        /// side of the run's foot (the flared foot's ink counts), and the
        /// mask's height.
        var stops: [(h: Double, run: Bool, height: Double)] = []
        var flare = 0.0
        var arc = 0.0
        var shoulder = 0.0

        init() {}

        init(height: Double, flare: Double, arc: Double, shoulder: Double) {
            self.flare = flare
            self.arc = arc
            self.shoulder = shoulder
            let taper = Effect.tabRimTaper
            var at: [(h: Double, run: Bool)] = [(h: 0, run: false), (h: height, run: true), (h: flare, run: true), (h: flare, run: false)]
            for x in TabView.taperStops {
                let plain = min(x * taper, shoulder)
                at.append((h: plain, run: plain > flare))
                at.append((h: flare + min(max(0, x * taper - arc), max(0, shoulder - flare)), run: true))
            }
            at.append((h: shoulder, run: true))
            // Top down, as the gradient runs: at the run's foot, the run's side first.
            stops = at.filter { $0.h >= 0 && $0.h <= height }
                .sorted { $0.h != $1.h ? $0.h > $1.h : ($0.run && !$1.run) }
                .map { (h: $0.h, run: $0.run, height: height) }
        }

        /// A foot's taper at `h` pt along its stroke from where its stops start.
        private static func along(_ points: [(Double, Double)], _ h: Double) -> Double {
            guard let first = points.first, h > first.0 else { return points.first?.1 ?? 1 }
            for (a, b) in zip(points, points.dropFirst()) where h < b.0 {
                return b.0 > a.0 ? a.1 + (b.1 - a.1) * (h - a.0) / (b.0 - a.0) : b.1
            }
            return points.last?.1 ?? 1
        }

        /// The ink at a stop with the tab `pick` chosen.
        func ink(_ stop: (h: Double, run: Bool, height: Double), pick: Double) -> Double {
            let taper = Effect.tabRimTaper
            let plain = Self.along(TabView.taperStops.map { (min($0 * taper, shoulder), TabView.taperInk($0)) }, stop.h)
            guard stop.run else { return (1 - pick) * plain }
            let first = TabView.taperInk(arc / taper)
            let flared = Self.along([(flare, first)] + TabView.taperStops.map {
                (flare + min(max(0, $0 * taper - arc), max(0, shoulder - flare)), TabView.taperInk(max($0, arc / taper)))
            }, stop.h)
            return min(1, (1 - pick) * plain + pick * flared)
        }
    }

    private var bodyMask = BodyMask()

    /// The feet as the tab stands this frame: the flared foot shows exactly
    /// as much as the sheet does (`look.pick`, the sheet's own opacity), and
    /// the plain foot the rest, carried by each side's body mask, with the
    /// two glows likewise (PaneTabs.svelte `--sheet-now`). They ease nothing
    /// of their own: body, feet and rim are one shape on one clock.
    private func paintFeet() {
        #if DEBUG
        let footPick = probeFootOpacity.map(Double.init) ?? look.pick
        #else
        let footPick = look.pick
        #endif
        let colors = bodyMask.stops.map { UIColor.black.withAlphaComponent(bodyMask.ink($0, pick: look.pick)).cgColor }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for side in [lead, trail] {
            side.bodyFade.colors = colors
            side.flared.opacity = Float(footPick)
        }
        glow.opacity = Float(1 - look.pick)
        glowFlared.opacity = Float(look.pick)
        CATransaction.commit()
    }

    /// The feet's flare: the foot's height, over which a foot narrows to its tip.
    private var flare: Double { phoneRow ? Radius.radiusLg : Radius.radiusSm }

    /// How high a side runs from its tip to where its shoulder begins: the taper stops there.
    var shoulderHeight: Double {
        max(0, cardRect.height - max(shoulders.leading, shoulders.trailing))
    }

    /// The taper's ink at `x` of `tabRimTaper` up from the tip: an ease-out,
    /// 1 − (1 − x)^`tabRimTaperEase`, 0 at the tip, 90% whole by 32% of the
    /// way (10.2pt of 32), whole at it (PaneTabs.svelte `--te`, `--e04`…), so
    /// a chosen tab's sides stand whole at mid-height and hold 3:1.
    static func taperInk(_ x: Double) -> Double {
        x >= 1 ? 1 : 1 - pow(1 - max(0, x), Effect.tabRimTaperEase)
    }

    /// The taper's stops, as shares of its length up from the tip, the
    /// web's own; straight between them.
    static let taperStops: [Double] = [0, 0.04, 0.08, 0.13, 0.19, 0.26, 0.35, 0.5, 0.7, 1]

    /// How far up from the tip a foot narrows to its point: to where the
    /// taper's ink is 90% whole, (1 − 0.1^(1/p)) of its length (`--tn90`).
    static var narrowing: Double {
        (1 - pow(0.1, 1 / Effect.tabRimTaperEase)) * Effect.tabRimTaper
    }

    /// A tab's outline: circular shoulders, `leading` and `trailing` their
    /// radii (0 square), as the web's border radius draws them, square at the foot.
    static func outline(_ rect: CGRect, leading: Double, trailing: Double) -> UIBezierPath {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + leading))
        path.addArc(withCenter: CGPoint(x: rect.minX + leading, y: rect.minY + leading), radius: leading, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX - trailing, y: rect.minY))
        path.addArc(withCenter: CGPoint(x: rect.maxX - trailing, y: rect.minY + trailing), radius: trailing, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.close()
        return path
    }

    /// The outline's stroke, inside it: `width` wide across the top, round
    /// both shoulders (`leading` and `trailing` their radii, 0 square) and
    /// down each side, then narrowing over the last `foot` to a point on the
    /// shelf at the outline's edge (PaneTabs.svelte `.rim-plain`). The
    /// stroke's inner edge turns on a radius `width` less than its
    /// shoulder's, none when square.
    static func ring(_ rect: CGRect, leading: Double, trailing: Double, width: Double, foot: Double) -> UIBezierPath {
        let path = UIBezierPath()
        let lead = max(leading, width)
        let trail = max(trailing, width)
        // The narrowing starts no higher than the shoulders end.
        let narrow = max(rect.minY + max(lead, trail), rect.maxY - foot)
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + leading))
        path.addArc(withCenter: CGPoint(x: rect.minX + leading, y: rect.minY + leading), radius: leading, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX - trailing, y: rect.minY))
        path.addArc(withCenter: CGPoint(x: rect.maxX - trailing, y: rect.minY + trailing), radius: trailing, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - width, y: narrow))
        path.addLine(to: CGPoint(x: rect.maxX - width, y: rect.minY + trail))
        path.addArc(withCenter: CGPoint(x: rect.maxX - trail, y: rect.minY + trail), radius: trail - width, startAngle: 0, endAngle: .pi * 1.5, clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + lead, y: rect.minY + width))
        path.addArc(withCenter: CGPoint(x: rect.minX + lead, y: rect.minY + lead), radius: lead - width, startAngle: .pi * 1.5, endAngle: .pi, clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + width, y: narrow))
        path.close()
        return path
    }

    /// Rounded shoulders, and a foot that curves outward by `flare` each side
    /// (fluid-tabs' sheet), on a box one flare wider than the card each side.
    static func sheetPath(in rect: CGRect, radius: Double, flare: Double) -> CGPath {
        flaredOutline(rect.insetBy(dx: flare, dy: 0), leading: radius, trailing: radius, flare: flare).cgPath
    }

    /// The centre of the sheet's flared foot beside the side at `edge` on the
    /// shelf at `shelf`: one flare out from the side (`outward` -1 leading,
    /// 1 trailing) and one up, so the foot curves out from the side to the
    /// shelf. The sheet's fill (`flaredOutline`) and the rim's flared foot
    /// (`flaredFoot`) both turn about it.
    static func flareCentre(edge: Double, shelf: Double, flare: Double, outward: Double) -> CGPoint {
        CGPoint(x: edge + outward * flare, y: shelf - flare)
    }

    /// A tab's outline with the sheet's flared feet: down each side to one
    /// flare above the shelf, then out round a quarter turn to the shelf one
    /// flare past it; `leading` and `trailing` its shoulders' radii.
    static func flaredOutline(_ rect: CGRect, leading: Double, trailing: Double, flare: Double) -> UIBezierPath {
        let path = UIBezierPath()
        let left = flareCentre(edge: rect.minX, shelf: rect.maxY, flare: flare, outward: -1)
        let right = flareCentre(edge: rect.maxX, shelf: rect.maxY, flare: flare, outward: 1)
        path.move(to: CGPoint(x: left.x, y: rect.maxY))
        path.addArc(withCenter: left, radius: flare, startAngle: .pi / 2, endAngle: 0, clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + leading))
        path.addArc(withCenter: CGPoint(x: rect.minX + leading, y: rect.minY + leading), radius: leading, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX - trailing, y: rect.minY))
        path.addArc(withCenter: CGPoint(x: rect.maxX - trailing, y: rect.minY + trailing), radius: trailing, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - flare))
        path.addArc(withCenter: right, radius: flare, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
        path.close()
        return path
    }

    /// The rim's flared foot below the run's foot (PaneTabs.svelte
    /// `.rim-flared`), on the leading side of `rect` (the trailing, its
    /// mirror): `width` wide inside the sheet's own flare (`flareCentre`,
    /// `flare` its radius), from the run's foot round to its tip on the
    /// shelf one flare out. Its inner edge turns on a circle `width` wider
    /// down to where the taper's ink is 90% whole (`narrowing`), never so
    /// near the tip that it would cross the shelf and at most 60° of the
    /// turn up from it, then lands flat on the shelf at the tip.
    static func flaredFoot(_ rect: CGRect, flare: Double, width: Double, trailing: Bool) -> CGPath {
        let centre = flareCentre(edge: rect.minX, shelf: rect.maxY, flare: flare, outward: -1)
        let ro = flare + width
        let turn = min(max(acos(flare / ro), narrowing / (flare + width / 2)), .pi / 3)
        let up = flare - ro * cos(turn)
        let out = ro * sin(turn)
        let control = out - up * cos(turn) / sin(turn)
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rect.minX, y: centre.y))
        path.addArc(withCenter: centre, radius: flare, startAngle: 0, endAngle: .pi / 2, clockwise: true)
        path.addQuadCurve(to: CGPoint(x: centre.x + out, y: rect.maxY - up), controlPoint: CGPoint(x: centre.x + control, y: rect.maxY))
        path.addArc(withCenter: centre, radius: ro, startAngle: .pi / 2 - turn, endAngle: 0, clockwise: false)
        path.close()
        if trailing {
            path.apply(CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: rect.minX + rect.maxX, ty: 0))
        }
        return path.cgPath
    }

    /// The flared foot's taper (`taperInk`) round its quarter turn from the
    /// tip, as a mask: at each angle the ink at its length along the stroke's
    /// middle from the tip, in thin wedges about the flare's centre, drawn
    /// without antialiasing so they meet edge to edge. It covers the foot's
    /// box, the centre one point in from its corner (the trailing side's
    /// mirrored). Made once for each flare, stroke and scale.
    static func footTaper(flare: Double, width: Double, scale: CGFloat, trailing: Bool) -> CGImage? {
        let key = "\(flare) \(width) \(scale) \(trailing)"
        if let made = footTapers[key] { return made }
        let ro = flare + width
        let middle = flare + width / 2
        let size = CGSize(width: ro + 2, height: flare + 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = max(1, scale)
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            cg.setShouldAntialias(false)
            let centre = CGPoint(x: trailing ? ro + 1 : 1, y: 1)
            let wedges = 96
            let quarter = Double.pi / 2
            for k in -2 ..< wedges + 2 {
                let from = quarter * Double(k) / Double(wedges)
                let to = quarter * Double(k + 1) / Double(wedges)
                // Its length from the tip, which stands a quarter turn round.
                let s = middle * (quarter - min(quarter, max(0, (from + to) / 2)))
                let ink = taperInk(s / Effect.tabRimTaper)
                let wedge = UIBezierPath()
                wedge.move(to: centre)
                // The trailing side turns the other way about its centre.
                let a = trailing ? .pi - from : from
                let b = trailing ? .pi - to : to
                wedge.addArc(withCenter: centre, radius: ro + 2, startAngle: a, endAngle: b, clockwise: !trailing)
                wedge.close()
                UIColor(white: 0, alpha: ink).setFill()
                wedge.fill()
            }
        }.cgImage
        footTapers[key] = image
        return image
    }

    private static var footTapers: [String: CGImage] = [:]
}

/// One side of a tab's rim (PaneTabs.svelte `.rim-side`): its shoulder,
/// run and plain foot as one shape (`body`), its ink up from the shelf a
/// mask carrying both feet's tapers by how chosen the tab stands
/// (`TabView.BodyMask`); and its flared foot round the sheet's own flare
/// (`flared`), shown as much as the sheet is, its taper round the turn its
/// own mask. The side as a whole leans its strength at a gliding seam (its
/// layer's opacity).
private final class RimSide {
    let layer = CALayer()
    let body = CAShapeLayer()
    let bodyFade = CAGradientLayer()
    let flared = CAShapeLayer()
    let flaredFade = CALayer()

    var ink: CGColor? {
        didSet {
            body.fillColor = ink
            flared.fillColor = ink
        }
    }

    init() {
        body.fillRule = .evenOdd
        body.mask = bodyFade
        flared.mask = flaredFade
        layer.addSublayer(body)
        layer.addSublayer(flared)
    }
}

/// One thing for each of a tab's two sides (`TabView.Edges`).
struct TabSides<Value: Equatable>: Equatable {
    var leading: Value
    var trailing: Value
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

/// A tab's details chevron keeps its drawn box: its reach would take the end
/// of the tab's own title, which selects the tab.
private final class ChevronButton: UIButton, KeepsDrawnBox {}
