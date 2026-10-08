import CawCoCore
import CawCoDesign
import UIKit

/// The slim bar across the top of every page (Shell.svelte `header.top`):
/// the sidebar toggle, then the crumb naming the place (or, on a wide screen
/// of one group, its tabs), cut at its tail at least 16pt short of the
/// controls; at the far end the cluster (TopBarCluster): Caw's head on a
/// phone, the glass group of Search, Machines and Caw on a wide screen. It
/// is the system bar, dressed as the web's: the raised surface with the seam
/// under it, so the Duo still lays it out along its side. On a phone the
/// conversations have no bar: their strip is the one row (WorkspaceController).
@MainActor
enum TopBar {
    /// The bar's own look: `--surface-raised` with a 1pt `--seam` under it.
    /// Hosting a group's tabs (`.top.hosting`) it is the shelf they stand on:
    /// `--surface-shelf`, no seam, the hairline drawn in its own bottom pixel
    /// by `BarTabs` so the chosen tab's sheet covers it.
    static func dress(_ bar: UINavigationBar, hosting: Bool = false) {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = hosting ? Palette.surfaceShelf : Palette.surfaceRaised
        // A whole point of seam, not the system's hairline.
        appearance.shadowImage = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { _ in
            UIColor.black.setFill()
            UIRectFill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }.withRenderingMode(.alwaysTemplate)
        appearance.shadowColor = hosting ? .clear : Palette.seam
        appearance.titleTextAttributes = TypeScale.typeBody.attributes(color: Palette.inkStrong)
        bar.standardAppearance = appearance
        bar.scrollEdgeAppearance = appearance
        bar.compactAppearance = appearance
        bar.compactScrollEdgeAppearance = appearance
        bar.tintColor = Palette.inkStrong
    }

    /// Puts the sidebar toggle, the crumb and the cluster on `item`. A phone's
    /// board shows no crumb (`showsCrumb` off): the tabs and the page say
    /// where you are, and "Fleet" told the reader nothing.
    static func install(on item: UINavigationItem, crumb: CrumbView, cluster: TopBarCluster, burger: UIView?, showsCrumb: Bool = true) {
        // The phone's toggle stands 4pt in, as the web's one row; a desk's
        // crumb at `space7`; the bar's own inset differs by device, so the
        // lead measures it.
        let inset = UIView()
        let lead = BarLead(inset: inset, target: burger == nil ? Space.space7 : Space.space1, crumb: crumb, cluster: cluster)
        cluster.onResize = { [weak lead] in lead?.setNeedsLayout() }
        for part in [inset, burger, showsCrumb ? crumb : nil].compactMap(\.self) { lead.addArrangedSubview(part) }
        lead.axis = .horizontal
        lead.alignment = .center
        lead.spacing = Space.space2
        lead.setCustomSpacing(0, after: inset)
        let leading = UIBarButtonItem(customView: lead)
        leading.title = crumb.text
        let trailing = UIBarButtonItem(customView: cluster)
        trailing.title = "Fleet controls"
        for bar in [leading, trailing] { unshared(bar) }
        item.title = nil
        item.titleView = UIView()
        item.largeTitleDisplayMode = .never
        NavigationItems.configure(item, leading: [leading], prominent: [trailing])
        item.hidesBackButton = true
    }

    /// No Liquid Glass capsule behind a house control (iOS 26's shared background).
    static func unshared(_ item: UIBarButtonItem) {
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            item.hidesSharedBackground = true
        }
    }
}

extension UIView {
    /// The navigation bar this view stands in.
    var hostingBar: UINavigationBar? {
        var view = superview
        while let next = view {
            if let bar = next as? UINavigationBar { return bar }
            view = next.superview
        }
        return nil
    }
}

/// The bar's leading group: an inset wide enough that what follows it starts
/// `target` points inside the bar's safe leading edge, whatever margin the
/// system gives the item, and a crumb no wider than reaches 16pt short of
/// the cluster's first control (a longer name ends in an ellipsis).
private final class BarLead: UIStackView {
    private let width: NSLayoutConstraint
    private let target: Double
    private weak var crumb: CrumbView?
    private weak var cluster: TopBarCluster?
    /// The crumb's least distance to the first control.
    private static let gap = 16.0

    init(inset: UIView, target: Double, crumb: CrumbView, cluster: TopBarCluster) {
        self.target = target
        self.crumb = crumb
        self.cluster = cluster
        width = inset.widthAnchor.constraint(equalToConstant: 2)
        super.init(frame: .zero)
        width.isActive = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("BarLead is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let bar = hostingBar else { return }
        let own = convert(bounds, to: bar).minX - bar.safeAreaInsets.left
        let next = max(0, target - own)
        if abs(width.constant - next) > 0.25 { width.constant = next }
        guard let crumb, crumb.superview === self, let cluster, cluster.hostingBar === bar else { return }
        let first = cluster.convert(CGPoint(x: cluster.leadingEdge, y: 0), to: bar).x
        let room = max(0, first - Self.gap - crumb.convert(CGPoint.zero, to: bar).x)
        if abs(crumb.room.constant - room) > 0.25 { crumb.room.constant = room }
    }
}

// MARK: Hosted tabs

/// The bar's slot when it carries a group's tabs (Shell.svelte `.slot-tabs`):
/// the strip takes the crumb's place, from the bar's leading edge to the
/// cluster, standing on the bar's floor. Arriving, it comes down 6pt as it
/// fades in over `durControl` while the crumb fades where it stood; leaving,
/// the crumb rises 4pt as it fades in. With less motion only the fades run.
@MainActor
final class BarTabs {
    private weak var bar: UINavigationBar?
    private let crumb: CrumbView
    private let cluster: TopBarCluster
    private let hairline = UIView()
    private weak var strip: PaneTabsView?

    private weak var toggle: UIView?

    init(bar: UINavigationBar, crumb: CrumbView, cluster: TopBarCluster, toggle: UIView) {
        self.bar = bar
        self.crumb = crumb
        self.cluster = cluster
        self.toggle = toggle
        hairline.backgroundColor = Palette.borderHairline
        hairline.isUserInteractionEnabled = false
        hairline.translatesAutoresizingMaskIntoConstraints = false
    }

    var hosting: Bool { strip != nil }
    private let slot = Slot()

    /// The bar moved its items (a page change, a resize): the strip is measured again.
    func relayout() {
        slot.setNeedsLayout()
    }

    /// The strip's room in the bar: from a `space2` past the sidebar toggle
    /// to a `space2` short of the cluster, on the bar's floor. Laid out by
    /// frame, because the bar re-homes its items on every page change and a
    /// constraint to them would not survive that. Only the strip takes touches.
    private final class Slot: UIView {
        weak var strip: PaneTabsView?
        weak var cluster: UIView?
        weak var toggle: UIView?

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let strip else { return }
            var lead = safeAreaInsets.left
            if let toggle, toggle.window != nil, toggle.window === window {
                lead = toggle.convert(toggle.bounds, to: self).maxX + Space.space2
            }
            var end = bounds.width - Space.space6
            if let cluster, cluster.window != nil, cluster.window === window {
                end = cluster.convert(cluster.bounds, to: self).minX - Space.space2
            }
            let height = PaneTabsView.item + 4
            let frame = CGRect(x: lead, y: bounds.height - height, width: max(0, end - lead), height: height)
            // Through bounds and centre: an arrival still in flight keeps its transform.
            strip.bounds = CGRect(origin: .zero, size: frame.size)
            strip.center = CGPoint(x: frame.midX, y: frame.midY)
        }

        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            let hit = super.hitTest(point, with: event)
            return hit === self ? nil : hit
        }
    }

    func host(_ next: PaneTabsView?) {
        guard let bar, next !== strip else { return }
        let still = UIAccessibility.isReduceMotionEnabled || bar.window == nil
        let old = strip
        strip = next
        if let old, old.superview === slot {
            old.removeFromSuperview()
            old.translatesAutoresizingMaskIntoConstraints = false
        }
        TopBar.dress(bar, hosting: next != nil)
        guard let next else {
            hairline.removeFromSuperview()
            slot.removeFromSuperview()
            crumb.isHidden = false
            crumb.alpha = 0
            crumb.transform = still ? .identity : CGAffineTransform(translationX: 0, y: 4)
            Motion.easeOut.animator(Motion.durControl) {
                self.crumb.alpha = 1
                self.crumb.transform = .identity
            }.startAnimation()
            return
        }
        if hairline.superview !== bar {
            bar.addSubview(hairline)
            NSLayoutConstraint.activate([
                hairline.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
                hairline.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
                hairline.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
                hairline.heightAnchor.constraint(equalToConstant: 1),
            ])
        }
        next.removeFromSuperview()
        next.translatesAutoresizingMaskIntoConstraints = true
        slot.strip = next
        slot.cluster = cluster
        slot.toggle = toggle
        if slot.superview !== bar {
            slot.frame = bar.bounds
            slot.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            bar.addSubview(slot)
        }
        slot.addSubview(next)
        slot.setNeedsLayout()
        slot.layoutIfNeeded()
        next.alpha = 0
        next.transform = still ? .identity : CGAffineTransform(translationX: 0, y: -6)
        Motion.easeOut.animator(Motion.durControl) {
            next.alpha = 1
            next.transform = .identity
            self.crumb.alpha = 0
        }.startAnimation()
    }
}

// MARK: Crumb

/// The one "where am I" label (Shell.svelte `.crumb`): body type in strong
/// ink. A new place rises 4pt as it fades in over `durControl` while the
/// old one fades where it stood; with less motion only the fades run.
final class CrumbView: UIView {
    private var label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)

    var text: String { label.text ?? "" }
    /// The most it may be wide, set by the bar's lead from where the controls start.
    private(set) var room: NSLayoutConstraint!

    init(_ text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        // Unbounded until the lead has measured the bar.
        room = widthAnchor.constraint(lessThanOrEqualToConstant: 10000)
        room.isActive = true
        label.text = text
        place(label)
        isAccessibilityElement = true
        accessibilityTraits = .header
        accessibilityLabel = text
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CrumbView is built in code")
    }

    private func place(_ next: KitLabel) {
        addSubview(next)
        NSLayoutConstraint.activate([
            next.leadingAnchor.constraint(equalTo: leadingAnchor),
            next.trailingAnchor.constraint(equalTo: trailingAnchor),
            next.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(greaterThanOrEqualTo: next.heightAnchor),
        ])
    }

    func set(_ text: String, animated: Bool) {
        guard text != label.text else { return }
        accessibilityLabel = text
        let old = label
        let next = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        next.text = text
        label = old
        guard animated, window != nil else {
            old.text = text
            return
        }
        // The one leaving is lifted out of the row where it stands.
        let frame = old.frame
        old.removeFromSuperview()
        old.translatesAutoresizingMaskIntoConstraints = true
        old.frame = frame
        addSubview(old)
        label = next
        place(next)
        let rise = UIAccessibility.isReduceMotionEnabled ? 0 : 4.0
        next.alpha = 0
        next.transform = CGAffineTransform(translationX: 0, y: rise)
        Motion.easeOut.animator(Motion.durControl) {
            next.alpha = 1
            next.transform = .identity
            old.alpha = 0
        }.startAnimation()
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durControl) { old.removeFromSuperview() }
    }
}

// MARK: Controls

/// One control on the wide bar's glass group (Apple HIG, Toolbars: "Prefer
/// system-provided symbols without borders… the section provides a visible
/// container"): a 16pt glyph and, for Machines, its count, with no border or
/// tile of its own; the capsule is the container. It takes the fill under a
/// finger and the hover surface under a pointer, and dips to `pressScale`.
final class GlassItem: TapControl {
    let glyph: GlyphView
    let count = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private var hovering = false

    init(_ symbol: Glyph, counted: Bool) {
        glyph = GlyphView(symbol, tint: Palette.inkMuted)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerCurve = .continuous
        let row = UIStackView(arrangedSubviews: counted ? [glyph, count] : [glyph])
        row.spacing = Space.space1
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        count.tabular = true
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: NeedsCawButton.side),
            widthAnchor.constraint(greaterThanOrEqualToConstant: NeedsCawButton.side),
            row.centerXAnchor.constraint(equalTo: centerXAnchor),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            row.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: Space.space2),
        ])
        addInteraction(UIPointerInteraction(delegate: self))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlassItem is built in code")
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            let scale = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                self.transform = CGAffineTransform(scaleX: scale, y: scale)
                self.paint()
            }.startAnimation()
        }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        Motion.easeInOut.animator(Motion.durControl) { self.paint() }.startAnimation()
    }

    private func paint() {
        backgroundColor = isHighlighted ? Palette.surfaceFill : (hovering ? Palette.surfaceHover : .clear)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}

extension GlassItem: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .roundedRect(bounds, radius: bounds.height / 2))
    }
}

/// The trailing cluster (Shell.svelte `.right`). A phone's holds only Caw's
/// head on his own glass capsule: Search and the machines are in its
/// sidebar. A wide bar's is one glass group (Apple HIG, Toolbars: a toolbar
/// and the tabs share the row on iPad; "aim for a maximum of three" groups):
/// Search (Jump), Machines with its count, and Caw's head, borderless on
/// the group's glass. The hub is changed from the Machines popover.
final class TopBarCluster: UIView {
    var onMachines: (UIView) -> Void = { _ in }
    var onJump: (UIView) -> Void = { _ in }
    /// Caw's head pressed, and dragged.
    var onCaw: (NeedsCawButton) -> Void = { _ in }
    var onCawPan: (UIPanGestureRecognizer, NeedsCawButton) -> Void = { _, _ in }
    /// The cluster's width changed: the crumb beside it is measured again.
    var onResize: () -> Void = {}

    private let phoneCaw = NeedsCawButton(ownGlass: true)
    private let groupCaw = NeedsCawButton(ownGlass: false)
    private let group = GlassCapsule()
    private let groupRow = UIStackView()
    private let jump = GlassItem(.search, counted: false)
    private let machines = GlassItem(.server, counted: true)
    private let stack = UIStackView()

    /// A phone's bar (Caw alone); a desk's is the glass group.
    var compact = true {
        didSet { arrange() }
    }

    /// Caw's head as this bar shows it.
    var caw: NeedsCawButton { compact ? phoneCaw : groupCaw }

    /// Where the first drawn control starts, in the cluster's own space.
    let leadingEdge = 0.0

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        // The web's right inset is `space6` (21); the bar's own differs by device and is measured.
        end = stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -(Space.space6 - 16))
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            end,
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            heightAnchor.constraint(equalToConstant: 44),
        ])
        machines.accessibilityLabel = "Machines"
        machines.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onMachines(machines)
        }, for: .primaryActionTriggered)
        jump.accessibilityLabel = "Search"
        jump.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onJump(jump)
        }, for: .primaryActionTriggered)
        KitTip.attach(to: machines, label: "Machines")
        KitTip.attach(to: jump, label: "Jump to session", keys: "⌘K")
        for head in [phoneCaw, groupCaw] {
            head.onTap = { [weak self, weak head] in
                guard let self, let head else { return }
                onCaw(head)
            }
            head.onPan = { [weak self, weak head] pan in
                guard let self, let head else { return }
                onCawPan(pan, head)
            }
        }
        groupRow.axis = .horizontal
        groupRow.alignment = .center
        groupRow.spacing = 0
        groupRow.isLayoutMarginsRelativeArrangement = true
        groupRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 2, bottom: 0, trailing: 2)
        groupRow.translatesAutoresizingMaskIntoConstraints = false
        for item in [jump, machines, groupCaw] as [UIView] { groupRow.addArrangedSubview(item) }
        group.content.addSubview(groupRow)
        NSLayoutConstraint.activate([
            groupRow.leadingAnchor.constraint(equalTo: group.content.leadingAnchor),
            groupRow.trailingAnchor.constraint(equalTo: group.content.trailingAnchor),
            groupRow.topAnchor.constraint(equalTo: group.content.topAnchor),
            groupRow.bottomAnchor.constraint(equalTo: group.content.bottomAnchor),
        ])
        arrange()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TopBarCluster is built in code")
    }

    private func arrange() {
        for view in stack.arrangedSubviews { stack.removeArrangedSubview(view); view.removeFromSuperview() }
        stack.addArrangedSubview(compact ? phoneCaw : group)
    }

    private var lastWidth = 0.0
    private var end: NSLayoutConstraint!

    /// Caw's head is drawn 36pt but answers a finger from 44pt about it (the
    /// web capsule's `touch-hit`), past the cluster's own edge: the stack that
    /// holds him and the strip beside him would otherwise take that margin.
    /// A control hit directly (Search, Machines) keeps its touch.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        super.point(inside: point, with: event) || TouchReach.reaches(point, in: self, [caw])
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        TouchReach.redirect(super.hitTest(point, with: event), at: point, in: self, to: [caw])
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let bar = hostingBar else { return }
        let own = bar.bounds.width - bar.safeAreaInsets.right - convert(bounds, to: bar).maxX
        // A phone's capsule stands 8pt in, as the web's; a desk's group at `space6`.
        let next = -max(0, (compact ? Space.space2 : Space.space6) - own)
        if abs(end.constant - next) > 0.25 { end.constant = next }
        if abs(bounds.width - lastWidth) > 0.25 {
            lastWidth = bounds.width
            onResize()
        }
    }

    /// The hub's word on the bar: what needs the operator, which machines are up.
    func configure(needs: Int, quiet: String, online: Int, tone: MachineHealth.Tone?, drawerOpen: Bool) {
        for head in [phoneCaw, groupCaw] { head.configure(count: needs, quiet: quiet, open: drawerOpen) }
        machines.count.text = "\(online)"
        // The glyph alone carries a machine in trouble; it crosses over `durFade`, never pulses.
        let ink: UIColor = switch tone {
        case .fail: Palette.statusFailGlyph
        case .attn: Palette.statusAttnGlyph
        case nil: Palette.inkMuted
        }
        if machines.glyph.tintColor != ink {
            Motion.easeOut.animator(Motion.durFade) { self.machines.glyph.tintColor = ink }.startAnimation()
        }
        machines.accessibilityValue = "\(online) online"
    }

    /// Something new needs the operator: Caw's beat, where he is drawn.
    func beat() {
        caw.beat()
    }
}

/// The sidebar toggle (Shell.svelte `.burger`): 44pt, the sidebar glyph at
/// 20. On a phone it opens the rail's sheet; on a wide screen it shows and
/// hides the rail's column (`label` says which).
final class BurgerButton: TapControl {
    var label: String {
        get { accessibilityLabel ?? "" }
        set { accessibilityLabel = newValue }
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        let glyph = GlyphView(.sidebar, size: Size.iconLg, tint: Palette.inkStrong)
        glyph.isUserInteractionEnabled = false
        addSubview(glyph)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 44),
            heightAnchor.constraint(equalToConstant: 44),
            glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "Open navigation"
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BurgerButton is built in code")
    }

    override var isHighlighted: Bool {
        didSet {
            let scale = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                self.transform = CGAffineTransform(scaleX: scale, y: scale)
            }.startAnimation()
        }
    }
}
