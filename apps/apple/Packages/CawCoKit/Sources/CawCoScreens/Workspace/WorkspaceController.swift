import CawCoCore
import CawCoDesign
import UIKit

/// Whether the shell may take a back swipe: not while a group has a tab
/// before the one in front, where the same drag is the tab swipe's.
@MainActor
protocol BackSwipeGate: AnyObject {
    var allowsBackSwipe: Bool { get }
}

/// The conversations surface (SessionSurface.svelte's groups): the
/// workspace's groups as a grid of resizable splits on a wide screen, or as
/// the deck on a phone and a tablet held upright, one group at a time,
/// paged by two fingers (layout-policy.svelte.ts, the `ipad` choice "b").
final class WorkspaceController: ObservedViewController, BackSwipeGate {
    let workspace: Workspace
    let panes: PaneHost
    private let context: ShellContext
    private var groups: [String: PaneGroupController] = [:]
    private var shape = ""
    private let surface = UIView()
    private var grid: UIView?
    private var deck: DeckView?
    private var lastVersion = -1

    init(workspace: Workspace, panes: PaneHost, context: ShellContext) {
        self.workspace = workspace
        self.panes = panes
        self.context = context
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkspaceController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        surface.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(surface)
        NSLayoutConstraint.activate([
            surface.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            surface.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            surface.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        registerForTraitChanges([UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]) { (controller: WorkspaceController, _: UITraitCollection) in
            controller.shape = ""
            controller.requestRefresh()
        }
    }

    override func viewWillTransition(to size: CGSize, with coordinator: any UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            self?.shape = ""
            self?.requestRefresh()
        }
    }

    // MARK: Policy

    private var coarse: Bool { traitCollection.userInterfaceIdiom != .mac }

    /// One group at a time: a phone, or a tablet held upright.
    var isDeck: Bool {
        if traitCollection.horizontalSizeClass == .compact { return true }
        let size = view.window?.bounds.size ?? view.bounds.size
        return coarse && size.height > size.width
    }

    /// A tablet in landscape holds two groups; a desk splits freely.
    private var maxLeaves: Int {
        if isDeck || !coarse { return .max }
        return 2
    }

    // MARK: The bar's strip

    /// A workspace that is one group has one strip, and on a wide screen the
    /// top bar is where it goes (Shell.svelte `barLeaf`); a split keeps a
    /// strip per group, and the narrow line keeps its own row. Called with
    /// the strip the bar should carry, or nil to give the bar back its crumb.
    var onHost: (PaneTabsView?) -> Void = { _ in }
    /// Whether the shell lets the bar host at all (the conversations are the page in front).
    var hosting = true { didSet { if hosting != oldValue { host() } } }
    private weak var hostedStrip: PaneTabsView?

    private func host() {
        guard isViewLoaded else { return }
        let width = view.window?.bounds.width ?? view.bounds.width
        var one: PaneGroupController?
        if hosting, !isDeck, width >= 900, case let .leaf(leaf) = workspace.root, !leaf.tabs.isEmpty { one = groups[leaf.id] }
        for group in groups.values where group !== one { group.hosted = false }
        one?.hosted = true
        let strip = one?.strip
        guard strip !== hostedStrip else { return }
        hostedStrip = strip
        onHost(strip)
    }

    // MARK: Content

    override func refreshContent() {
        let version = workspace.version
        // The fleet's words on every tab: names, status, activity.
        _ = context.hub.fleet.rows
        _ = context.hub.needs.parked
        _ = context.hub.state
        workspace.maxLeaves = maxLeaves
        if maxLeaves != .max { workspace.capLeaves(maxLeaves) }
        let animated = lastVersion >= 0 && view.window != nil
        lastVersion = version
        let leaves = workspace.leaves
        let next = layoutShape()
        if next != shape {
            shape = next
            rebuild(leaves)
        }
        host()
        let focused = workspace.focusedLeaf
        for leaf in leaves {
            guard let group = groups[leaf.id] else { continue }
            group.swipeable = coarse && leaf.id == focused
            group.refresh(animated: animated)
        }
        deck?.focus(leaves.firstIndex { $0.id == focused } ?? 0, animated: animated)
        panes.keep(Set(workspace.openIds))
    }

    /// What the surface draws as structure: the tree's shape and the mode.
    private func layoutShape() -> String {
        func walk(_ node: PaneNode) -> String {
            switch node {
            case let .leaf(leaf): leaf.id
            case let .branch(branch): "\(branch.dir.rawValue)(\(branch.kids.map(walk).joined(separator: ",")))"
            }
        }
        return (isDeck ? "deck:" : "grid:") + walk(workspace.root)
    }

    private func group(for leaf: PaneLeaf) -> PaneGroupController {
        if let kept = groups[leaf.id] { return kept }
        let made = PaneGroupController(leafId: leaf.id, workspace: workspace, panes: panes, context: context, hosted: false)
        groups[leaf.id] = made
        return made
    }

    private func rebuild(_ leaves: [PaneLeaf]) {
        let ids = Set(leaves.map(\.id))
        for (id, group) in groups where !ids.contains(id) {
            group.willMove(toParent: nil)
            group.view.removeFromSuperview()
            group.removeFromParent()
            groups[id] = nil
        }
        for leaf in leaves {
            let group = group(for: leaf)
            if group.parent == nil {
                addChild(group)
                group.didMove(toParent: self)
            }
            group.view.removeFromSuperview()
        }
        grid?.removeFromSuperview()
        deck?.removeFromSuperview()
        grid = nil
        deck = nil
        if isDeck {
            let made = DeckView(cards: leaves.map { group(for: $0).view })
            made.onFocus = { [weak self] index in
                guard let self, workspace.leaves.indices.contains(index) else { return }
                workspace.focus(workspace.leaves[index].id)
            }
            place(made)
            deck = made
            made.focus(leaves.firstIndex { $0.id == workspace.focusedLeaf } ?? 0, animated: false)
        } else {
            let made = build(workspace.root)
            place(made)
            grid = made
        }
    }

    private func place(_ content: UIView) {
        content.frame = surface.bounds
        content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        surface.addSubview(content)
    }

    /// A split is a view along one axis holding its children; nesting is the whole mechanism.
    private func build(_ node: PaneNode) -> UIView {
        switch node {
        case let .leaf(leaf):
            return groups[leaf.id]?.view ?? UIView()
        case let .branch(branch):
            let split = SplitView(axis: branch.dir, sizes: branch.sizes, kids: branch.kids.map(build))
            split.onResize = { [weak self] sizes in self?.workspace.resize(branch.id, sizes) }
            if let made = branch.kids.firstIndex(where: { workspace.takeFresh($0.id) }) { split.grow(made) }
            return split
        }
    }

    // MARK: Back swipe

    var allowsBackSwipe: Bool {
        let leaf = workspace.focused
        guard let active = leaf.active else { return true }
        return leaf.tabs.firstIndex(of: active) == 0
    }
}

// MARK: Grid

/// A split (PaneGrid.svelte on paneforge): children along one axis, each at
/// its share, no smaller than 12%; between them a hairline divider that
/// takes the control border under a pointer and muted ink while dragged.
/// A drag tracks the finger 1:1; the shares are kept when it lets go. A
/// group a split just made grows in from nothing as the others give up its
/// room, over `durPanel` on the in-out curve.
final class SplitView: UIView {
    let axis: PaneBranch.Axis
    private(set) var sizes: [Double]
    private let kids: [UIView]
    private var dividers: [Divider] = []
    var onResize: ([Double]) -> Void = { _ in }
    static let minShare = 12.0

    init(axis: PaneBranch.Axis, sizes: [Double], kids: [UIView]) {
        self.axis = axis
        self.kids = kids
        self.sizes = sizes.count == kids.count ? sizes : Array(repeating: 100 / Double(kids.count), count: kids.count)
        super.init(frame: .zero)
        for kid in kids {
            kid.translatesAutoresizingMaskIntoConstraints = true
            addSubview(kid)
        }
        for index in 1 ..< max(1, kids.count) {
            let divider = Divider(vertical: axis == .h)
            divider.onDrag = { [weak self] delta, ended in self?.drag(index, by: delta, ended: ended) }
            dividers.append(divider)
            addSubview(divider)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SplitView is built in code")
    }

    private var length: Double { axis == .h ? bounds.width : bounds.height }

    override func layoutSubviews() {
        super.layoutSubviews()
        var at = 0.0
        for (index, kid) in kids.enumerated() {
            let size = length * sizes[index] / 100
            kid.frame = axis == .h
                ? CGRect(x: at, y: 0, width: size, height: bounds.height)
                : CGRect(x: 0, y: at, width: bounds.width, height: size)
            at += size
            if index < dividers.count {
                dividers[index].frame = axis == .h
                    ? CGRect(x: at - 6, y: 0, width: 12, height: bounds.height)
                    : CGRect(x: 0, y: at - 6, width: bounds.width, height: 12)
            }
        }
    }

    private func drag(_ index: Int, by delta: Double, ended: Bool) {
        guard length > 0 else { return }
        let share = delta / length * 100
        let a = index - 1, b = index
        let total = sizes[a] + sizes[b]
        let next = min(max(sizes[a] + share, Self.minShare), total - Self.minShare)
        sizes[a] = next
        sizes[b] = total - next
        setNeedsLayout()
        layoutIfNeeded()
        if ended { onResize(sizes) }
    }

    /// The new group grows from nothing while the others give its room up.
    func grow(_ made: Int) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let target = sizes
        let room = 100 - target[made]
        sizes = target.enumerated().map { index, size in index == made ? 0 : size * 100 / room }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            layoutIfNeeded()
            sizes = target
            Motion.easeInOut.animator(Motion.durPanel) {
                self.setNeedsLayout()
                self.layoutIfNeeded()
            }.startAnimation()
        }
    }

    /// The divider: a hairline in a 12pt grab area.
    private final class Divider: UIView, UIPointerInteractionDelegate {
        var onDrag: (Double, Bool) -> Void = { _, _ in }
        private let line = UIView()
        private let vertical: Bool
        private var last = 0.0

        init(vertical: Bool) {
            self.vertical = vertical
            super.init(frame: .zero)
            line.backgroundColor = Palette.borderHairline
            line.isUserInteractionEnabled = false
            addSubview(line)
            addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
            addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
            addInteraction(UIPointerInteraction(delegate: self))
            isAccessibilityElement = true
            accessibilityLabel = "Resize groups"
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("Divider is built in code")
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            line.frame = vertical ? CGRect(x: bounds.midX - 0.5, y: 0, width: 1, height: bounds.height) : CGRect(x: 0, y: bounds.midY - 0.5, width: bounds.width, height: 1)
        }

        @objc private func dragged(_ pan: UIPanGestureRecognizer) {
            let t = pan.translation(in: superview)
            let now = vertical ? t.x : t.y
            switch pan.state {
            case .began:
                last = 0
                line.backgroundColor = Palette.inkMuted
            case .changed:
                onDrag(now - last, false)
                last = now
            case .ended, .cancelled:
                onDrag(now - last, true)
                Motion.easeOut.animator(Motion.durControl) { self.line.backgroundColor = Palette.borderHairline }.startAnimation()
            default:
                break
            }
        }

        @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
            let on = hover.state == .began || hover.state == .changed
            Motion.easeOut.animator(Motion.durControl) {
                self.line.backgroundColor = on ? Palette.borderControl : Palette.borderHairline
            }.startAnimation()
        }

        func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
            vertical
                ? UIPointerStyle(shape: .verticalBeam(length: 24), constrainedAxes: .vertical)
                : UIPointerStyle(shape: .horizontalBeam(length: 24), constrainedAxes: .horizontal)
        }
    }
}

// MARK: Deck

/// The phone's groups as a vertical stack of cards (PaneDeck.svelte,
/// deck.svelte.ts): two fingers drag the stack, the neighbour coming into
/// view under them 1:1, 12pt between cards; past the ends it gives a third
/// of the drag, never more than a quarter of the height. While held, the
/// card lifts (scale to `pressScale`, `--radius-lg` corners, the overlay
/// shadow) over 60% of `durPanel` on the out curve and sets down over
/// `durPanel` on the in-out curve; the page dots show while it is lifted.
/// A release projected 0.1s ahead past 35% of the height, or a flick past
/// 110pt/s, moves to the neighbour; a no-bounce spring settles it.
final class DeckView: UIView, UIGestureRecognizerDelegate {
    static let gap = 12.0
    var onFocus: (Int) -> Void = { _ in }
    private var cards: [Card] = []
    private var index = 0
    private var offset = 0.0
    private var base = 0.0
    private let dots = UIStackView()
    private var dotViews: [UIView] = []
    private var settle: UIViewPropertyAnimator?

    init(cards views: [UIView]) {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRecess
        clipsToBounds = true
        cards = views.map { Card(content: $0) }
        for card in cards { addSubview(card) }
        dots.axis = .vertical
        dots.spacing = 6
        dots.alpha = 0
        dots.isUserInteractionEnabled = false
        addSubview(dots)
        for _ in views where views.count > 1 {
            let dot = UIView()
            dot.layer.cornerRadius = 3
            dot.translatesAutoresizingMaskIntoConstraints = false
            dot.widthAnchor.constraint(equalToConstant: 6).isActive = true
            let height = dot.heightAnchor.constraint(equalToConstant: 6)
            height.isActive = true
            dotHeights.append(height)
            dotViews.append(dot)
            dots.addArrangedSubview(dot)
        }
        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        pan.minimumNumberOfTouches = 2
        pan.maximumNumberOfTouches = 2
        pan.delegate = self
        addGestureRecognizer(pan)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DeckView is built in code")
    }

    private var height: Double { max(1, bounds.height) }
    private var step: Double { height + Self.gap }

    func focus(_ next: Int, animated _: Bool) {
        guard settle == nil, next != index || cards.indices.contains(next) else { return }
        index = max(0, min(next, cards.count - 1))
        paint()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        for card in cards { card.bounds = CGRect(origin: .zero, size: bounds.size) }
        dots.frame.size = dots.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        dots.center = CGPoint(x: bounds.maxX - Space.space3 - 3, y: bounds.midY)
        paint()
    }

    private func paint() {
        for (at, card) in cards.enumerated() {
            let delta = Double(at - index)
            card.center = CGPoint(x: bounds.midX, y: bounds.midY + delta * step + offset)
            card.isHidden = abs(delta) > 1
            card.isUserInteractionEnabled = delta == 0
        }
        for (at, dot) in dotViews.enumerated() {
            let on = at == index
            dot.backgroundColor = on ? Palette.inkStrong : Palette.inkMuted
            dot.alpha = on ? 1 : 0.5
            dotHeights[at].constant = on ? 18 : 6
        }
    }

    private var dotHeights: [NSLayoutConstraint] = []

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        false
    }

    override func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard let pan = recognizer as? UIPanGestureRecognizer, cards.count > 1 else { return false }
        let v = pan.velocity(in: self)
        return abs(v.x) <= abs(v.y) * 0.7 + 1
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        let dy = pan.translation(in: self).y
        switch pan.state {
        case .began:
            settle?.stopAnimation(true)
            settle = nil
            base = offset
            lift(true)
        case .changed:
            let raw = base + dy
            let open = raw < 0 ? index < cards.count - 1 : index > 0
            offset = open ? max(-step, min(step, raw)) : (raw < 0 ? -1 : 1) * min(abs(raw) * 0.35, height * 0.25)
            paint()
        case .ended, .cancelled, .failed:
            let velocity = pan.state == .ended ? pan.velocity(in: self).y : 0
            let projected = offset + velocity * 0.1
            let up = projected < 0
            let target = up ? index + 1 : index - 1
            let far = abs(projected) > height * 0.35
            let flicked = up ? velocity < -110 : velocity > 110
            if cards.indices.contains(target), far || flicked {
                index = target
                offset += up ? step : -step
                paint()
                onFocus(index)
            }
            let spring = UISpringTimingParameters(duration: 0.4, bounce: 0, initialVelocity: CGVector(dx: 0, dy: offset == 0 ? 0 : velocity / -offset))
            let animator = UIViewPropertyAnimator(duration: 0.4, timingParameters: spring)
            animator.addAnimations { [weak self] in
                self?.offset = 0
                self?.paint()
            }
            animator.addCompletion { [weak self] _ in
                self?.settle = nil
                self?.lift(false)
            }
            settle = animator
            animator.startAnimation()
        default:
            break
        }
    }

    private func lift(_ up: Bool) {
        let still = UIAccessibility.isReduceMotionEnabled
        let animator = up
            ? Motion.easeOut.animator(Motion.durPanel * 0.6)
            : Motion.easeInOut.animator(Motion.durPanel)
        animator.addAnimations { [weak self] in
            guard let self else { return }
            for card in cards { card.lift(up && !still) }
            dots.alpha = up ? 1 : 0
        }
        animator.startAnimation()
    }

    /// A card: the translate is the deck's, the lift (scale, corners, shadow) its own.
    private final class Card: UIView {
        private let liftView = UIView()
        /// `.lift::before`: the overlay shadow at the lifted corners, faded
        /// in and out with the lift.
        private let shade = UIView()
        private let clip = UIView()

        init(content: UIView) {
            super.init(frame: .zero)
            shade.isUserInteractionEnabled = false
            shade.layer.cornerRadius = Radius.radiusLg
            shade.layer.cornerCurve = .continuous
            shade.boxShadow = Shadow.shadowOverlay
            shade.alpha = 0
            clip.clipsToBounds = true
            clip.layer.cornerCurve = .continuous
            addSubview(liftView)
            liftView.addSubview(shade)
            liftView.addSubview(clip)
            content.translatesAutoresizingMaskIntoConstraints = true
            content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            clip.addSubview(content)
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("Card is built in code")
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            liftView.bounds = bounds
            liftView.center = CGPoint(x: bounds.midX, y: bounds.midY)
            shade.frame = liftView.bounds
            clip.frame = liftView.bounds
            clip.subviews.first?.frame = clip.bounds
        }

        /// Scale, corners and the overlay shadow's opacity, in the caller's animation.
        func lift(_ up: Bool) {
            liftView.transform = up ? CGAffineTransform(scaleX: Motion.pressScale, y: Motion.pressScale) : .identity
            clip.layer.cornerRadius = up ? Radius.radiusLg : 0
            shade.alpha = up ? 1 : 0
        }
    }
}
