import CawCoCore
import CawCoDesign
import UIKit

/// One group (workspace/PaneLeaf.svelte): its strip of tabs, and a slot per
/// conversation stacked behind it. The conversations are not the group's
/// to build: `PaneHost` keeps each alive once and the group docks it, so a
/// split, a move or a change of layout rearranges views without rebuilding
/// a transcript.
///
/// The showing tab mounts first; the rest mount in the background, nearest
/// first, one at a time, once the strip has been left alone for 800ms
/// (120ms where the group swipes) and 300ms apart. Where the group swipes,
/// the two neighbours are painted parked either side and a finger drags the
/// panes 1:1 (TabSwipe); a tab chosen any other way lands on the same
/// settle. Elsewhere the arriving transcript glides 40pt in from the side
/// of the tab it came from and fades up from 0.4 over 260ms on the drawer
/// curve. A hairline rail down the leading edge marks the group the
/// keyboard belongs to, graphite, never the accent.
final class PaneGroupController: UIViewController, TabSwipeHost, UIDropInteractionDelegate {
    let leafId: String
    private let workspace: Workspace
    private let panes: PaneHost
    private let context: ShellContext
    /// The strip, unless the top bar hosts it.
    let strip: PaneTabsView
    private let stack = UIView()
    private let rail = UIView()
    private let preview = UIView()
    private var slots: [String: UIView] = [:]
    private var mounted: [String] = []
    private var queue: DispatchWorkItem?
    private var shownId: String?
    private var shownTabs: [String] = []
    private var swipe: TabSwipe?
    private var dock: ComposerDock!
    /// The tab a swipe landed on: its switch is already drawn.
    private var flip: String?
    private var openSide = 0
    var swipeable = false {
        didSet {
            swipe?.pan.isEnabled = swipeable
            layoutPanes()
        }
    }

    /// The top bar carries this group's strip (a workspace of one group on a
    /// wide screen): the strip leaves the group, which then starts at its panes.
    var hosted: Bool {
        get { strip.hosted }
        set {
            guard newValue != strip.hosted else { return }
            strip.hosted = newValue
            if isViewLoaded { placeStrip() }
        }
    }

    /// The details card its tabs host (hover, pin, glide).
    private lazy var tabDetails = TabDetails(panes: panes, presenter: self)
    private var ownStrip: [NSLayoutConstraint] = []
    private var noStrip: NSLayoutConstraint?

    private func placeStrip() {
        if hosted {
            NSLayoutConstraint.deactivate(ownStrip)
            if strip.superview === view { strip.removeFromSuperview() }
            noStrip?.isActive = true
        } else {
            noStrip?.isActive = false
            strip.removeFromSuperview()
            strip.translatesAutoresizingMaskIntoConstraints = false
            strip.alpha = 1
            strip.transform = .identity
            view.insertSubview(strip, aboveSubview: stack)
            NSLayoutConstraint.activate(ownStrip)
        }
    }

    init(leafId: String, workspace: Workspace, panes: PaneHost, context: ShellContext, hosted: Bool) {
        self.leafId = leafId
        self.workspace = workspace
        self.panes = panes
        self.context = context
        strip = PaneTabsView(hosted: hosted)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaneGroupController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        view.clipsToBounds = true
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.clipsToBounds = true
        view.addSubview(stack)
        ownStrip = [
            strip.topAnchor.constraint(equalTo: view.topAnchor),
            strip.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: strip.bottomAnchor),
        ]
        noStrip = stack.topAnchor.constraint(equalTo: view.topAnchor)
        placeStrip()
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        // The group's one composer: above the panes, under the rail and a drop preview.
        dock = ComposerDock(in: view, below: stack.topAnchor)
        dock.onInset = { [weak self] inset in
            guard let self else { return }
            for id in mounted { panes.session(id)?.composerInset = inset }
        }
        rail.backgroundColor = Palette.inkMuted
        rail.alpha = 0
        rail.isUserInteractionEnabled = false
        rail.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rail)
        NSLayoutConstraint.activate([
            rail.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rail.topAnchor.constraint(equalTo: view.topAnchor),
            rail.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            rail.widthAnchor.constraint(equalToConstant: 2),
        ])
        // Where a drop would go: half the group for a split, the whole for a join.
        preview.backgroundColor = Palette.surfaceHover
        preview.layer.borderWidth = 1
        preview.alpha = 0
        preview.isUserInteractionEnabled = false
        view.addSubview(preview)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (group: PaneGroupController, _: UITraitCollection) in
            group.preview.layer.borderColor = Palette.borderControl.resolvedColor(with: group.traitCollection).cgColor
        }
        preview.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor

        strip.onSelect = { [weak self] id in
            guard let self else { return }
            // A tap mid-settle retargets it rather than restarting it.
            if let swipe, swipe.active, let at = activeIndex, let to = index(of: id) {
                swipe.retarget(to == at ? 0 : (to > at ? 1 : -1))
            }
            // An open details card goes with the tab that was clicked; otherwise it closes.
            if let tab = strip.tabView(id) { tabDetails.click(id, tab: tab, chosen: false) }
            workspace.activate(id, in: leafId)
        }
        strip.onClose = { [weak self] id in
            guard let self else { return }
            if tabDetails.openId == id { tabDetails.close() }
            workspace.close(id)
        }
        // The chosen tab, or its chevron: its details, pinned; again, closed.
        strip.onDetails = { [weak self] id, tab in self?.tabDetails.click(id, tab: tab, chosen: true) }
        strip.onHover = { [weak self] id, tab in
            guard let self else { return }
            if let id, let tab { tabDetails.hover(id, tab: tab) } else { tabDetails.leave() }
        }
        strip.onMenu = { [weak self] open in self?.tabDetails.menuOpen = open }
        tabDetails.order = { [weak self] in self?.leaf?.tabs ?? [] }
        strip.menu = { [weak self] id in self?.menu(for: id) }
        strip.dragFor = { [weak self] id, _ in self?.dragItem(id) }
        view.addInteraction(UIDropInteraction(delegate: self))
        stack.addInteraction(UIDropInteraction(delegate: self))
        // Its own target too, for when the bar hosts it.
        strip.addInteraction(UIDropInteraction(delegate: self))
        let tap = UITapGestureRecognizer(target: self, action: #selector(touched))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        swipe = TabSwipe(host: self, in: stack)
        swipe?.pan.isEnabled = swipeable
    }

    private var leaf: PaneLeaf? { workspace.leaf(leafId) }
    private var activeIndex: Int? { leaf?.active.flatMap { leaf?.tabs.firstIndex(of: $0) } }
    private func index(of id: String) -> Int? { leaf?.tabs.firstIndex(of: id) }

    /// Touching the group gives it the keyboard.
    @objc private func touched() {
        workspace.focus(leafId)
    }

    // MARK: Content

    /// Reads the group from the workspace and the fleet; the switch animates.
    func refresh(animated: Bool) {
        guard isViewLoaded, let leaf else { return }
        strip.configure(leaf.tabs.map { tab(for: $0) }, active: leaf.active, animated: animated)
        let focused = workspace.focusedLeaf == leafId
        Motion.easeOut.animator(Motion.durControl) { self.rail.alpha = focused ? 0.5 : 0 }.startAnimation()
        if let id = leaf.active, !mounted.contains(id) { mount(id) }
        for id in mounted where !leaf.tabs.contains(id) { unmount(id) }
        let from = shownId
        let to = leaf.active
        shownId = to
        let tabsBefore = shownTabs
        shownTabs = leaf.tabs
        layoutPanes()
        // Which way the switch went along the strip, read off the strip as
        // it was, else as it is; and how long its transcript motion has left,
        // for the composer to hold its height until then.
        var direction = 0
        var landing: TimeInterval = 0
        if let from, let to, from != to {
            let order = [tabsBefore, leaf.tabs].first { $0.contains(from) && $0.contains(to) }
            if let order, let a = order.firstIndex(of: from), let b = order.firstIndex(of: to) { direction = b > a ? 1 : -1 }
            let landedBySwipe = flip == to
            if animated, !landedBySwipe, direction != 0, !UIAccessibility.isReduceMotionEnabled {
                landing = swipeable && tabsBefore.contains(to) ? TabSwipe.settle : 0.26
            }
            if animated {
                switchPanes(from: from, to: to, order: order ?? leaf.tabs)
            }
        }
        dock.bind(panes.binding(for: to), direction: animated ? direction : 0, landing: landing)
        scheduleBackground()
    }

    private func tab(for id: String) -> PaneTab {
        let fleet = context.hub.fleet
        let row = fleet.byId[id]
        let label = row.map(fleet.title) ?? panes.title(id) ?? String(id.prefix(8))
        let activity = context.home.activity(id)
        let face: SessionStatusView.Face = {
            guard let row else { return .stored }
            if row.isFailed { return .failed }
            if row.isStale || context.hub.state != .connected { return .unreachable }
            if row.status == .sleeping { return .sleeping }
            if row.status == .stopped { return .stopped }
            if activity == .blocked { return .needsYou }
            if activity == .working { return .working }
            return .idle
        }()
        let status = face == .idle || face == .stored ? "" : face.label
        return PaneTab(id: id, label: label, face: face, needs: activity == .blocked, isRun: BoardRun.runId(of: id) != nil, status: status)
    }

    // MARK: Panes

    private func mount(_ id: String) {
        mounted.append(id)
        let slot = UIView()
        slot.clipsToBounds = true
        slots[id] = slot
        stack.addSubview(slot)
        let controller = panes.controller(for: id)
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = true
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        slot.addSubview(controller.view)
        controller.didMove(toParent: self)
        (controller as? SessionViewController)?.composerInset = dock.inset
        layoutPanes()
    }

    private func unmount(_ id: String) {
        mounted.removeAll { $0 == id }
        guard let slot = slots.removeValue(forKey: id) else { return }
        if let controller = children.first(where: { $0.view.superview === slot }) {
            controller.willMove(toParent: nil)
            controller.view.removeFromSuperview()
            controller.removeFromParent()
        }
        slot.removeFromSuperview()
    }

    /// Hands a conversation's pane over to another group (a move or a split).
    func release(_ id: String) {
        unmount(id)
    }

    /// The other open conversations mount nearest first, one at a time.
    private func scheduleBackground() {
        queue?.cancel()
        guard let leaf, let here = leaf.active, let at = leaf.tabs.firstIndex(of: here) else { return }
        let waiting = leaf.tabs.filter { $0 != here && !mounted.contains($0) }
            .sorted { abs((leaf.tabs.firstIndex(of: $0) ?? 0) - at) < abs((leaf.tabs.firstIndex(of: $1) ?? 0) - at) }
        guard let next = waiting.first else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            mount(next)
            scheduleBackground(after: 0.3)
        }
        queue = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (swipeable ? 0.12 : 0.8), execute: work)
    }

    private func scheduleBackground(after gap: TimeInterval) {
        queue?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.scheduleBackground() }
        queue = work
        DispatchQueue.main.asyncAfter(deadline: .now() + gap, execute: work)
    }

    /// Every slot at its place: the active one in front; where the group
    /// swipes, its neighbours parked a width either side.
    private func layoutPanes() {
        let width = stack.bounds.width
        let active = leaf?.active
        let at = activeIndex
        for (id, slot) in slots {
            slot.bounds = CGRect(origin: .zero, size: stack.bounds.size)
            slot.center = CGPoint(x: stack.bounds.midX, y: stack.bounds.midY)
            for pane in slot.subviews { pane.frame = slot.bounds }
            let delta = at.flatMap { a in index(of: id).map { $0 - a } }
            let shown = id == active || (swipeable && delta.map { abs($0) <= 1 } == true)
            slot.isHidden = !shown
            slot.isUserInteractionEnabled = id == active
            if swipe?.active != true, let delta { slot.transform = swipeable ? CGAffineTransform(translationX: CGFloat(delta) * width, y: 0) : .identity }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        layoutPanes()
        dock.layout()
    }

    /// A tab chosen without the finger: the swipe's settle where the group
    /// swipes, the 40pt glide elsewhere; the side is read off the strip as it was.
    private func switchPanes(from: String, to: String, order: [String]) {
        if flip == to {
            flip = nil
            return
        }
        guard let a = order.firstIndex(of: from), let b = order.firstIndex(of: to), let slot = slots[to] else { return }
        let dir = b > a ? 1.0 : -1.0
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        if swipeable, let out = slots[from] {
            let width = stack.bounds.width
            out.isHidden = false
            out.transform = .identity
            slot.transform = CGAffineTransform(translationX: dir * width, y: 0)
            let spring = UISpringTimingParameters(duration: 0.4, bounce: 0)
            let settle = UIViewPropertyAnimator(duration: 0.4, timingParameters: spring)
            settle.addAnimations {
                slot.transform = .identity
                out.transform = CGAffineTransform(translationX: -dir * width, y: 0)
            }
            settle.addCompletion { [weak self] _ in self?.layoutPanes() }
            settle.startAnimation()
            return
        }
        slot.transform = CGAffineTransform(translationX: dir * 40, y: 0)
        slot.alpha = 0.4
        Motion.easeDrawer.animator(0.26) {
            slot.transform = .identity
            slot.alpha = 1
        }.startAnimation()
    }

    // MARK: TabSwipeHost

    private func neighbour(_ side: Int) -> String? {
        guard let leaf, let at = activeIndex else { return nil }
        let index = at + side
        return leaf.tabs.indices.contains(index) ? leaf.tabs[index] : nil
    }

    func swipeHasTab(_ side: Int) -> Bool { neighbour(side) != nil }

    func swipeMayBegin(at point: CGPoint, side: Int) -> Bool {
        // On the first tab a rightward drag is the way back to the board.
        guard swipeable, stack.bounds.contains(point) else { return false }
        return !(side == -1 && activeIndex == 0)
    }

    func swipeOpen(_ side: Int) {
        openSide = side
        // Nothing sends while a swipe carries the conversation.
        dock.held = true
        guard let id = neighbour(side) else { return }
        if !mounted.contains(id) { mount(id) }
        slots[id]?.isHidden = false
    }

    func swipeDraw(offset: Double, side: Int, progress: Double) {
        let width = stack.bounds.width
        if let active = leaf?.active { slots[active]?.transform = CGAffineTransform(translationX: offset, y: 0) }
        if side != 0, let id = neighbour(side) {
            slots[id]?.transform = CGAffineTransform(translationX: Double(side) * width + offset, y: 0)
            strip.ride(toward: id, fraction: progress)
        } else {
            strip.ride(toward: nil, fraction: 0)
        }
    }

    func swipeLanded(_ side: Int) {
        strip.ride(toward: nil, fraction: 0)
        dock.held = false
        guard let id = neighbour(side) else { return }
        flip = id
        workspace.activate(id, in: leafId)
        layoutPanes()
    }

    func swipeReturned(_: Int) {
        strip.ride(toward: nil, fraction: 0)
        dock.held = false
        layoutPanes()
    }

    // MARK: Menu

    /// PaneTabs.svelte's context menu, every gesture's command.
    private func menu(for id: String) -> UIMenu {
        var first: [UIMenuElement] = []
        if BoardRun.runId(of: id) == nil {
            first.append(UIAction(title: "Session details") { [weak self] _ in
                guard let self else { return }
                tabDetails.pin(id, tab: strip.tabView(id))
            })
            if panes.continueHandler != nil {
                first.append(UIAction(title: "Continue in new session…", image: Glyph.arrowRight.image) { [weak self] _ in self?.panes.continueInNewSession(id) })
            }
        }
        let splits: [UIMenuElement] = [
            UIAction(title: "Split right") { [weak self] _ in self?.split(id, .right) },
            UIAction(title: "Split down") { [weak self] _ in self?.split(id, .bottom) },
        ]
        let others = workspace.leaves.filter { $0.id != leafId }
        let moves: [UIMenuElement] = others.enumerated().map { index, other in
            UIAction(title: "Move to group \(index + 2)") { [weak self] _ in self?.workspace.move(id, to: other.id) }
        }
        let closing: [UIMenuElement] = [
            UIAction(title: "Close") { [weak self] _ in self?.workspace.close(id) },
            UIAction(title: "Close others", attributes: (leaf?.tabs.count ?? 0) < 2 ? .disabled : []) { [weak self] _ in
                guard let self, let tabs = leaf?.tabs else { return }
                for other in tabs where other != id { workspace.close(other) }
            },
        ]
        let copy = UIAction(title: "Copy link", image: Glyph.copy.image) { [weak self] _ in
            guard let link = self?.panes.link(id) else { return }
            UIPasteboard.general.url = link
        }
        var sections: [UIMenuElement] = []
        if !first.isEmpty { sections.append(UIMenu(options: .displayInline, children: first)) }
        sections.append(UIMenu(options: .displayInline, children: splits))
        if !moves.isEmpty { sections.append(UIMenu(options: .displayInline, children: moves)) }
        sections.append(UIMenu(options: .displayInline, children: closing))
        sections.append(UIMenu(options: .displayInline, children: [copy]))
        return UIMenu(children: sections)
    }

    private func split(_ id: String, _ edge: Workspace.Edge) {
        workspace.split(leafId, edge, id)
    }

    // MARK: Drag and drop

    /// What rides a drag: which conversation, and the group it left. Never the transcript.
    private func dragItem(_ id: String) -> UIDragItem {
        let provider = NSItemProvider(object: SessionViewController.activity(id))
        let item = UIDragItem(itemProvider: provider)
        item.localObject = SessionDrag(sessionId: id, from: leafId)
        return item
    }

    /// The drop is on the strip: the strip itself (hosted in the bar), or the top of the group.
    private func overStrip(_ interaction: UIDropInteraction, _ session: any UIDropSession) -> Bool {
        interaction.view === strip || (interaction.view === view && !hosted && session.location(in: view).y < strip.frame.maxY)
    }

    private func carried(_ session: any UIDropSession) -> SessionDrag? {
        session.items.first?.localObject as? SessionDrag
    }

    func dropInteraction(_: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        carried(session) != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        guard let drag = carried(session) else { return UIDropProposal(operation: .forbidden) }
        if overStrip(interaction, session) {
            // Over the strip: where in it the tab would land.
            hidePreview()
            strip.showCaret(at: strip.index(at: session.location(in: strip)))
            return UIDropProposal(operation: .move)
        }
        strip.showCaret(at: nil)
        let edge = Self.edge(session.location(in: stack), in: stack.bounds)
        // A split against a group's own only tab would leave it empty: a join is all there is.
        let own = drag.from == leafId && (leaf?.tabs.count ?? 0) < 2
        showPreview(own ? nil : edge, joining: !own || edge == nil)
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_: UIDropInteraction, sessionDidExit _: any UIDropSession) {
        hidePreview()
        strip.showCaret(at: nil)
    }

    func dropInteraction(_: UIDropInteraction, sessionDidEnd _: any UIDropSession) {
        hidePreview()
        strip.showCaret(at: nil)
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        guard let drag = carried(session) else { return }
        hidePreview()
        strip.showCaret(at: nil)
        if overStrip(interaction, session) {
            let index = strip.index(at: session.location(in: strip))
            if drag.from == leafId { workspace.reorder(leafId, drag.sessionId, to: index) } else { workspace.move(drag.sessionId, to: leafId, at: index) }
            return
        }
        if let edge = Self.edge(session.location(in: stack), in: stack.bounds), !(drag.from == leafId && (leaf?.tabs.count ?? 0) < 2) {
            workspace.split(leafId, edge, drag.sessionId)
        } else if drag.from != leafId {
            workspace.move(drag.sessionId, to: leafId)
        }
    }

    /// dnd.svelte.ts `edgeAt`: within a quarter of an edge is a split against
    /// the closest edge; the centre half is a join.
    static func edge(_ point: CGPoint, in rect: CGRect) -> Workspace.Edge? {
        guard rect.width > 0, rect.height > 0 else { return nil }
        let x = point.x - rect.minX, y = point.y - rect.minY
        let band = 0.25
        let near = x < rect.width * band || x > rect.width * (1 - band) || y < rect.height * band || y > rect.height * (1 - band)
        guard near else { return nil }
        let distances: [(Workspace.Edge, Double)] = [(.left, x), (.right, rect.width - x), (.top, y), (.bottom, rect.height - y)]
        return distances.min { $0.1 < $1.1 }?.0
    }

    /// The preview is the shape the drop would take: half the group, or all of it.
    /// Opacity fades at the control tier; between halves it morphs over `durMorph`.
    private func showPreview(_ edge: Workspace.Edge?, joining _: Bool) {
        let box = stack.frame
        let target: CGRect = switch edge {
        case .left: CGRect(x: box.minX, y: box.minY, width: box.width / 2, height: box.height)
        case .right: CGRect(x: box.midX, y: box.minY, width: box.width / 2, height: box.height)
        case .top: CGRect(x: box.minX, y: box.minY, width: box.width, height: box.height / 2)
        case .bottom: CGRect(x: box.minX, y: box.midY, width: box.width, height: box.height / 2)
        case nil: box
        }
        if preview.alpha == 0 {
            preview.frame = target
            Motion.easeOut.animator(Motion.durControl) { self.preview.alpha = 0.9 }.startAnimation()
        } else if preview.frame != target {
            let morph = UIAccessibility.isReduceMotionEnabled ? Motion.easeInOut.animator(0) : Motion.easeInOut.animator(Motion.durMorph)
            morph.addAnimations { self.preview.frame = target }
            morph.startAnimation()
        }
        view.bringSubviewToFront(preview)
    }

    private func hidePreview() {
        guard preview.alpha > 0 else { return }
        Motion.easeOut.animator(Motion.durControl) { self.preview.alpha = 0 }.startAnimation()
    }
}

/// A conversation being carried between groups.
final class SessionDrag {
    let sessionId: String
    let from: String?

    init(sessionId: String, from: String?) {
        self.sessionId = sessionId
        self.from = from
    }
}

/// A session row that can be carried into a group (dnd.svelte.ts
/// `dragSession` with no group it left): the conversation it opens rides the
/// drag, and its activity, so it can also be dropped out as a window.
@MainActor
final class SessionRowDrag: NSObject, UIDragInteractionDelegate {
    private let sessionId: () -> String?

    /// Makes `row` draggable as the conversation `sessionId` names when the drag starts.
    static func attach(to row: UIView, sessionId: @escaping () -> String?) {
        let delegate = SessionRowDrag(sessionId: sessionId)
        row.addInteraction(UIDragInteraction(delegate: delegate))
        objc_setAssociatedObject(row, &key, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    nonisolated(unsafe) private static var key = 0

    private init(sessionId: @escaping () -> String?) {
        self.sessionId = sessionId
    }

    func dragInteraction(_: UIDragInteraction, itemsForBeginning _: any UIDragSession) -> [UIDragItem] {
        guard let id = sessionId() else { return [] }
        let item = UIDragItem(itemProvider: NSItemProvider(object: SessionViewController.activity(id)))
        item.localObject = SessionDrag(sessionId: id, from: nil)
        return [item]
    }
}
