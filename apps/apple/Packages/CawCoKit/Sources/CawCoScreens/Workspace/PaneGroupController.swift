import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// One group (workspace/PaneLeaf.svelte): its strip of tabs, and a slot per
/// conversation stacked behind it. The conversations are not the group's
/// to build: `PaneHost` keeps each alive once and the group docks it, so a
/// split, a move or a change of layout rearranges views without rebuilding
/// a transcript.
///
/// The tab in front and its two neighbours are mounted the moment it is in
/// front, never during a swipe; a tab further away is a row in the strip.
/// Where the group swipes, the two neighbours are painted parked either side
/// and a finger drags the panes 1:1 (UIKit paging), the chosen sheet in the
/// strip following the pages; a tab chosen any other way lands on the same
/// settle. Elsewhere the arriving transcript glides 40pt in from the side
/// of the tab it came from and fades up from 0.4 over 260ms on the drawer
/// curve. A hairline rail down the leading edge marks the group the
/// keyboard belongs to, graphite, never the accent.
final class PaneGroupController: UIViewController, UIDropInteractionDelegate {
    let leafId: String
    private let workspace: Workspace
    private let panes: PaneHost
    private let context: ShellContext
    /// The strip, unless the top bar hosts it.
    let strip: PaneTabsView
    private let stack = PagingScrollView()
    private let rail = UIView()
    private let preview = UIView()
    private var slots: [String: UIView] = [:]
    private var mounted: [String] = []
    private var releasing: DispatchWorkItem?
    private var shownId: String?
    private var shownTabs: [String] = []
    private var dock: ComposerDock!
    /// The tab a swipe landed on: its switch is already drawn.
    private var flip: String?
    var onSwipeEnded: () -> Void = {}
    var swipeable = false {
        didSet {
            guard swipeable != oldValue else { return }
            stack.isScrollEnabled = swipeable
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
        panes.installTray(in: dock)
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
            if let tab = strip.tabView(id) { tabDetails.click(id, tab: tab, chosen: false) }
            guard let at = shownTabs.firstIndex(of: id) else { return }
            if !mounted.contains(id) { mount(id) }
            stack.choose(at, animated: swipeable)
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
        stack.traceName = "sessions:\(leafId)"
        stack.isScrollEnabled = swipeable
        // Held for the swipe and no longer: released on every end of it, a
        // landing, a swipe let go back where it began, or one onto no tab.
        stack.onBegin = { [weak self] in self?.dock.held = true }
        stack.onEnd = { [weak self] in self?.dock.held = false }
        stack.onScroll = { [weak self] position in self?.pagingMoved(position) }
        stack.onLand = { [weak self] page in
            guard let self, shownTabs.indices.contains(page) else { return }
            let id = shownTabs[page]
            // Where the group swipes, the pages drew the sheet's way over and
            // it stands where they brought it: the switch is not drawn again.
            if swipeable { strip.settle(on: id) } else { strip.ride(toward: nil, fraction: 0) }
            if leaf?.active != id {
                flip = id
                workspace.activate(id, in: leafId)
            }
            onSwipeEnded()
        }
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
        // Titles/state and model-selected transitions wait until the gesture
        // releases its pair. No pulse or second animator resets their offsets.
        guard !stack.active else { return }
        let tabsBefore = shownTabs
        shownTabs = leaf.tabs
        strip.configure(leaf.tabs.map { tab(for: $0) }, active: leaf.active, animated: animated)
        let focused = workspace.focusedLeaf == leafId
        Motion.easeOut.animator(Motion.durControl) { self.rail.alpha = focused ? 0.5 : 0 }.startAnimation()
        if let id = leaf.active, !mounted.contains(id) { mount(id) }
        for id in mounted where !leaf.tabs.contains(id) { unmount(id) }
        let from = shownId
        let to = leaf.active
        shownId = to
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
                landing = 0.26
            }
            if animated {
                switchPanes(from: from, to: to, order: order ?? leaf.tabs)
            }
        }
        dock.bind(panes.binding(for: to), direction: animated ? direction : 0, landing: landing)
        shareChanged()
        mountNeighbours()
        releaseLeavers()
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

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Pane")

    private func mount(_ id: String) {
        Self.log.info("mount \(id.prefix(8), privacy: .public) \(self.stack.active ? "during a swipe" : "at rest", privacy: .public)")
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
        // The two-finger deck owns a pair of fingers; transcript lists keep
        // their one-finger scroll without waiting for the deck recognizer.
        func singleFingerLists(_ view: UIView) {
            if let list = view as? UICollectionView { list.panGestureRecognizer.maximumNumberOfTouches = 1 }
            for child in view.subviews { singleFingerLists(child) }
        }
        singleFingerLists(controller.view)
        controller.didMove(toParent: self)
        if let session = controller as? SessionViewController {
            session.composerInset = dock.inset
            session.onTranscriptShare = { [weak self] in self?.shareChanged() }
        }
        layoutPanes()
    }

    /// The composer stands over the active conversation's transcript, not
    /// over a side preview beside it.
    private func shareChanged() {
        dock.transcriptShare = shownId.flatMap { panes.session($0)?.transcriptShare } ?? 1
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

    /// What this group keeps live: the tab in front and the ones either side
    /// of it, which a swipe can land on. Every other tab is a row in the
    /// strip, named from the fleet, with no transcript read and no stream:
    /// catch-up is bounded to what is on screen, or one swipe from it.
    private var window: Set<String> {
        guard let leaf, let here = leaf.active, let at = leaf.tabs.firstIndex(of: here) else { return [] }
        return Set(leaf.tabs[max(0, at - 1)...min(leaf.tabs.count - 1, at + 1)])
    }

    /// The tab in front's neighbours, mounted as it comes to the front (a
    /// launch, a tap, a swipe's landing), while the reader is still on it:
    /// their transcripts are read and their history caught up off screen,
    /// so a swipe only ever brings in a pane that stands ready. They mount
    /// once the switch's motion has been drawn (a landing's last frame, the
    /// 40pt glide), so no frame of it is held for them, and never under a
    /// moving finger: a swipe that starts first lands, and its landing mounts
    /// them. Refreshes in the meantime do not put them off.
    private func mountNeighbours() {
        guard !neighboursQueued else { return }
        neighboursQueued = true
        DispatchQueue.main.asyncAfter(deadline: .now() + (swipeable ? 0.05 : 0.3)) { [weak self] in
            guard let self else { return }
            neighboursQueued = false
            guard !stack.paging else { return }
            let window = window
            for id in leaf?.tabs ?? [] where window.contains(id) && !mounted.contains(id) { mount(id) }
        }
    }

    private var neighboursQueued = false

    /// A tab that left the window is released once the switch that moved it
    /// out has been drawn (its subscription ends; its draft and scroll are
    /// kept for its return). Refreshes in the meantime do not put it off.
    private func releaseLeavers() {
        guard releasing == nil, mounted.contains(where: { !window.contains($0) }) else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            releasing = nil
            // Nothing leaves under a moving finger: it goes once the pages are still.
            guard !stack.active else { return releaseLeavers() }
            let window = window
            for id in mounted where !window.contains(id) {
                unmount(id)
                panes.release(id)
            }
        }
        releasing = work
        // Past the switch's own motion, so nothing leaves while it is drawn.
        DispatchQueue.main.asyncAfter(deadline: .now() + (swipeable ? 0.3 : 0.8), execute: work)
    }

    /// Every slot at its place: the active one in front; where the group
    /// swipes, its neighbours parked a width either side.
    private func layoutPanes() {
        let width = stack.bounds.width
        let active = leaf?.active
        for (id, slot) in slots {
            slot.bounds = CGRect(origin: .zero, size: stack.bounds.size)
            let page = shownTabs.firstIndex(of: id) ?? 0
            slot.center = CGPoint(x: (Double(page) + 0.5) * width, y: stack.bounds.midY)
            for pane in slot.subviews { pane.frame = slot.bounds }
            let shown = id == active || abs(Double(page) - stack.position) <= 1
            slot.isHidden = !shown
            slot.isUserInteractionEnabled = id == active
            // A neighbour parked a width aside is drawn for the swipe, not read out.
            slot.accessibilityElementsHidden = id != active
            slot.transform = .identity
        }
        stack.configure(count: shownTabs.count, selected: activeIndex ?? 0)
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
        if swipeable { return }
        slot.transform = CGAffineTransform(translationX: dir * 40, y: 0)
        slot.alpha = 0.4
        Motion.easeDrawer.animator(0.26) {
            slot.transform = .identity
            slot.alpha = 1
        }.startAnimation()
    }

    // MARK: System paging progress

    private func pagingMoved(_ position: Double) {
        guard stack.active, let from = activeIndex, !shownTabs.isEmpty else { return }
        let target = position > Double(from) ? Int(position.rounded(.up)) : Int(position.rounded(.down))
        for (id, slot) in slots {
            if let at = shownTabs.firstIndex(of: id) { slot.isHidden = abs(Double(at) - position) > 1 }
        }
        if shownTabs.indices.contains(target), target != from {
            strip.ride(toward: shownTabs[target], fraction: min(1, abs(position - Double(from)) / Double(abs(target - from))))
        } else { strip.ride(toward: nil, fraction: 0) }
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
