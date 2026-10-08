import CawCoCore
import CawCoDesign
import UIKit

/// The slim bar across the top of every page (Shell.svelte `header.top`):
/// on a phone the burger that opens the rail, then the crumb naming the
/// place, cut at its tail at least 16pt short of the controls; at the far end
/// one cluster of 28pt outline controls (TopBarCluster). It is
/// the system bar, dressed as the web's: the raised surface with the seam
/// under it and no glass, so the Duo still lays it out along its side.
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

    /// Puts the burger (compact only), the crumb and the cluster on `item`.
    static func install(on item: UINavigationItem, crumb: CrumbView, cluster: TopBarCluster, burger: UIView?) {
        // The web's burger stands 18pt in (`space7` less its own −`space2`) and
        // a desk's crumb at `space7`; the bar's own inset differs by device, so
        // the lead measures it.
        let inset = UIView()
        let lead = BarLead(inset: inset, target: burger == nil ? Space.space7 : 18, crumb: crumb, cluster: cluster)
        cluster.onResize = { [weak lead] in lead?.setNeedsLayout() }
        for part in [inset, burger, crumb].compactMap(\.self) { lead.addArrangedSubview(part) }
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

    init(bar: UINavigationBar, crumb: CrumbView, cluster: TopBarCluster) {
        self.bar = bar
        self.crumb = crumb
        self.cluster = cluster
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

    /// The strip's room in the bar: from the bar's leading edge to a `space2`
    /// short of the cluster, on the bar's floor. Laid out by frame, because
    /// the bar re-homes the cluster's item on every page change and a
    /// constraint to it would not survive that. Only the strip takes touches.
    private final class Slot: UIView {
        weak var strip: PaneTabsView?
        weak var cluster: UIView?

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let strip else { return }
            let lead = safeAreaInsets.left
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

/// One control of the bar's family (Shell.svelte `.right > .jump`, `.icobtn`,
/// AssistantOrb): 28pt tall, `--radius-sm`, a hairline, the raised surface,
/// label type at the strong weight, 16pt glyphs. It dips to `pressScale`
/// under the finger and takes the hover surface under a pointer.
final class ChromeButton: TapControl {
    let row = UIStackView()
    var expanded = false { didSet { paint() } }
    private var hovering = false

    init(square: Bool) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = Space.space2
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        // `padding: 0 11px` inside the control's 1px border.
        let inset = square ? 0 : Space.space3 + 1
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 28),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 28),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            row.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: inset),
            row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -inset),
            row.centerXAnchor.constraint(equalTo: centerXAnchor),
        ])
        if !square {
            let lead = row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset)
            lead.priority = .defaultHigh
            lead.isActive = true
        }
        addInteraction(UIPointerInteraction(delegate: self))
        let hover = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
        addGestureRecognizer(hover)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: ChromeButton, _: UITraitCollection) in button.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ChromeButton is built in code")
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            let scale = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                self.transform = CGAffineTransform(scaleX: scale, y: scale)
            }.startAnimation()
        }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        Motion.easeInOut.animator(Motion.durControl) { self.paint() }.startAnimation()
    }

    private func paint() {
        backgroundColor = expanded || hovering ? Palette.surfaceHover : Palette.surfaceRaised
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// A control whose press opens a menu anchored on it, made when it opens
    /// so its rows are the state of that moment; nil, the press is its action.
    var menuProvider: (() -> UIMenu?)? {
        didSet {
            isContextMenuInteractionEnabled = menuProvider != nil
            showsMenuAsPrimaryAction = menuProvider != nil
        }
    }

    override func contextMenuInteraction(_: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        guard let menuProvider else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in menuProvider() }
    }

    override func contextMenuInteraction(_: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration _: UIContextMenuConfiguration) -> UITargetedPreview? {
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: Radius.radiusSm)
        parameters.backgroundColor = Palette.surfaceRaised
        return UITargetedPreview(view: self, parameters: parameters)
    }
}

extension ChromeButton: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .roundedRect(bounds, radius: Radius.radiusSm))
    }
}

/// The trailing cluster (Shell.svelte `.right`), `space2` apart at a desk and
/// 16pt apart under a finger so each 28pt control's touch area reaches 44.
/// A wide bar holds the attention control, Machines, Jump and the hub. A
/// phone's holds three at most: the attention control while something
/// waits, Jump, and More, whose menu holds Machines, the assistant and the
/// hub as rows that do what those buttons do.
final class TopBarCluster: UIView {
    /// A press on the attention control with one ask waiting (more open its menu).
    var onAttention: () -> Void = {}
    /// The attention control's menu: one row per ask, longest wait first.
    var waitingMenu: () -> UIMenu? = { nil }
    var onMachines: (UIView) -> Void = { _ in }
    var onJump: (UIView) -> Void = { _ in }
    var onAssistant: () -> Void = {}
    var onHub: () -> Void = {}
    /// The cluster's width changed: the crumb beside it is measured again.
    var onResize: () -> Void = {}

    let machines = ChromeButton(square: false)
    /// Native only: the hub this app talks to (the web is served by it).
    let hub = ChromeButton(square: true)
    let jump = ChromeButton(square: false)
    /// The phone's More (Shell.svelte `.more`): the third control, and the last.
    let more = ChromeButton(square: true)
    private let attention = ChromeButton(square: true)
    private let badge = UILabel()
    private let badgeBox = UIView()
    private let machinesGlyph = GlyphView(.server, tint: Palette.inkMuted)
    private let moreGlyph = GlyphView(.more, tint: Palette.inkMuted)
    private let machinesCount = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let jumpWord = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let jumpKeys = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let stack = UIStackView()
    private var shownCount = 0
    private var online = 0
    private var machinesInk = Palette.inkMuted
    private var assistantOpen = false

    /// A phone's bar (attention, Jump, More); a desk's is the wide one, its rail carrying the assistant.
    var compact = true {
        didSet { arrange() }
    }

    /// What the phone's assistant drawer grows from: More, whose menu opens it.
    var assistantSource: UIView { more }

    /// Where the first drawn control starts, in the cluster's own space: the
    /// attention control stands left of it on a narrow desk bar.
    var leadingEdge: Double {
        attention.superview === self && !attention.isHidden ? attention.frame.minX : 0
    }

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

        machinesCount.tabular = true
        machines.row.addArrangedSubview(machinesGlyph)
        machines.row.addArrangedSubview(machinesCount)
        machines.accessibilityLabel = "Machines"
        machines.isAccessibilityElement = true
        machines.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onMachines(machines)
        }, for: .primaryActionTriggered)

        jump.row.addArrangedSubview(GlyphView(.search, tint: Palette.inkMuted))
        jumpWord.text = "Jump"
        jumpKeys.text = "⌘K"
        jump.row.addArrangedSubview(jumpWord)
        jump.row.addArrangedSubview(jumpKeys)
        jump.isAccessibilityElement = true
        jump.accessibilityLabel = "Jump to session"
        jump.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onJump(jump)
        }, for: .primaryActionTriggered)

        more.row.addArrangedSubview(moreGlyph)
        more.isAccessibilityElement = true
        more.accessibilityLabel = "More"
        more.menuProvider = { [weak self] in self?.moreMenu() }

        hub.row.addArrangedSubview(GlyphView(.globe, tint: Palette.inkMuted))
        hub.isAccessibilityElement = true
        hub.accessibilityLabel = "Change hub"
        hub.addAction(UIAction { [weak self] _ in self?.onHub() }, for: .primaryActionTriggered)
        hub.widthAnchor.constraint(equalToConstant: 28).isActive = true
        KitTip.attach(to: machines, label: "Machines")
        KitTip.attach(to: jump, label: "Jump to session", keys: "⌘K")
        KitTip.attach(to: hub, label: "Change hub")

        attention.row.addArrangedSubview(GlyphView(.shield, tint: Palette.inkStrong))
        attention.isAccessibilityElement = true
        attention.addAction(UIAction { [weak self] _ in self?.onAttention() }, for: .primaryActionTriggered)
        // The count rides the control's corner: 16pt, the attention pill.
        badgeBox.backgroundColor = Palette.statusAttnBg
        badgeBox.layer.cornerRadius = 8
        badgeBox.isUserInteractionEnabled = false
        badgeBox.translatesAutoresizingMaskIntoConstraints = false
        badge.font = TypeScale.typeMeta.font
        badge.textColor = Palette.statusAttnInk
        badge.translatesAutoresizingMaskIntoConstraints = false
        badgeBox.addSubview(badge)
        attention.addSubview(badgeBox)
        NSLayoutConstraint.activate([
            badgeBox.heightAnchor.constraint(equalToConstant: 16),
            badgeBox.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),
            badgeBox.topAnchor.constraint(equalTo: attention.topAnchor, constant: -5),
            badgeBox.trailingAnchor.constraint(equalTo: attention.trailingAnchor, constant: 5),
            badge.leadingAnchor.constraint(equalTo: badgeBox.leadingAnchor, constant: 4),
            badge.trailingAnchor.constraint(equalTo: badgeBox.trailingAnchor, constant: -4),
            badge.centerYAnchor.constraint(equalTo: badgeBox.centerYAnchor),
            attention.widthAnchor.constraint(equalToConstant: 28),
            more.widthAnchor.constraint(equalToConstant: 28),
        ])
        attention.isHidden = true
        arrange()
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (cluster: TopBarCluster, _: UITraitCollection) in cluster.arrange() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TopBarCluster is built in code")
    }

    /// A phone's bar: the attention control in the row's flow, so the crumb is
    /// measured against it and, the cluster standing at the bar's end, arriving
    /// it widens the cluster to its left and moves nothing already drawn. A
    /// desk's below 900pt: the attention control stands left of the cluster,
    /// out of its flow; wider, it is the first control.
    private func arrange() {
        let coarse = traitCollection.userInterfaceIdiom != .mac
        stack.spacing = coarse ? 16 : Space.space2
        for view in stack.arrangedSubviews { stack.removeArrangedSubview(view); view.removeFromSuperview() }
        // Out of the flow it was pinned to the cluster; those pins go with it.
        attention.removeFromSuperview()
        let width = window?.bounds.width ?? UIScreen.main.bounds.width
        jumpWord.isHidden = width < 640
        jumpKeys.isHidden = width < 900
        if compact {
            [attention, jump, more].forEach(stack.addArrangedSubview)
        } else if width < 900 {
            addSubview(attention)
            attention.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                attention.centerYAnchor.constraint(equalTo: centerYAnchor),
                attention.trailingAnchor.constraint(equalTo: leadingAnchor, constant: -stack.spacing),
                attention.heightAnchor.constraint(equalToConstant: 28),
            ])
            [machines, jump, hub].forEach(stack.addArrangedSubview)
        } else {
            [attention, machines, jump, hub].forEach(stack.addArrangedSubview)
        }
    }

    /// More's rows: what the wide bar shows as buttons, and the phone's
    /// assistant. Machines wears the glyph's tone, as More itself does.
    private func moreMenu() -> UIMenu {
        let machinesRow = UIAction(title: "Machines", subtitle: "\(online) online",
                                   image: Glyph.server.image.withTintColor(machinesInk, renderingMode: .alwaysOriginal)) { [weak self] _ in
            guard let self else { return }
            onMachines(more)
        }
        let assistantRow = UIAction(title: assistantOpen ? "Close assistant" : "Open assistant",
                                    image: Glyph.assistant.image.withTintColor(Palette.coral11, renderingMode: .alwaysOriginal)) { [weak self] _ in
            self?.onAssistant()
        }
        let hubRow = UIAction(title: "Change hub",
                              image: Glyph.globe.image.withTintColor(Palette.inkMuted, renderingMode: .alwaysOriginal)) { [weak self] _ in
            self?.onHub()
        }
        return UIMenu(children: [machinesRow, assistantRow, hubRow])
    }

    private var lastWidth = 0.0

    override func didMoveToWindow() {
        super.didMoveToWindow()
        arrange()
    }

    private var end: NSLayoutConstraint!

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let bar = hostingBar else { return }
        let own = bar.bounds.width - bar.safeAreaInsets.right - convert(bounds, to: bar).maxX
        let next = -max(0, Space.space6 - own)
        if abs(end.constant - next) > 0.25 { end.constant = next }
        if abs(bounds.width - lastWidth) > 0.25 {
            lastWidth = bounds.width
            onResize()
        }
    }

    /// The hub's word on the bar: what waits on the operator, which machines are up.
    func configure(blocked: Int, online: Int, tone: MachineHealth.Tone?, assistantOpen: Bool) {
        self.online = online
        self.assistantOpen = assistantOpen
        machinesCount.text = "\(online)"
        // The glyph alone carries a machine in trouble; it crosses over `durFade`, never pulses.
        let ink: UIColor = switch tone {
        case .fail: Palette.statusFailGlyph
        case .attn: Palette.statusAttnGlyph
        case nil: Palette.inkMuted
        }
        machinesInk = ink
        // More wears the Machines tone, so a dropped machine is still seen with the list behind it.
        if machinesGlyph.tintColor != ink {
            Motion.easeOut.animator(Motion.durFade) {
                self.machinesGlyph.tintColor = ink
                self.moreGlyph.tintColor = ink
            }.startAnimation()
        }
        machines.accessibilityValue = "\(online) online"
        // One ask: the press opens it. More: the press opens the list of them, on the control.
        if (blocked > 1) != (attention.menuProvider != nil) {
            attention.menuProvider = blocked > 1 ? { [weak self] in self?.waitingMenu() } : nil
        }
        attention.accessibilityLabel = "\(blocked) waiting on you"
        attention.toolTip = "\(blocked) waiting on you"
        badge.text = "\(blocked)"
        let showing = blocked > 0
        guard showing != (shownCount > 0) else { shownCount = blocked; return }
        shownCount = blocked
        // It grows out of the bar's top edge from the pop scale over
        // `durMenu`, and shrinks back into it over `durExit`.
        let still = UIAccessibility.isReduceMotionEnabled || window == nil
        let top = CGAffineTransform(translationX: 0, y: -14 * (1 - Motion.popScale)).scaledBy(x: Motion.popScale, y: Motion.popScale)
        if showing {
            attention.isHidden = false
            attention.alpha = 0
            attention.transform = still ? .identity : top
            Motion.easeOut.animator(Motion.durMenu) {
                self.attention.alpha = 1
                self.attention.transform = .identity
            }.startAnimation()
        } else {
            let out = Motion.easeOut.animator(Motion.durExit) {
                self.attention.alpha = 0
                if !still { self.attention.transform = top }
            }
            out.addCompletion { _ in
                if self.shownCount == 0 { self.attention.isHidden = true }
                self.attention.transform = .identity
            }
            out.startAnimation()
        }
    }
}

/// The phone's menu button (Shell.svelte `.burger`): 44pt, the sidebar glyph at 20.
final class BurgerButton: TapControl {
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
