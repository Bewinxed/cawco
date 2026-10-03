import CawCoCore
import CawCoDesign
import UIKit

/// The slim bar across the top of every page (Shell.svelte `header.top`):
/// on a phone the burger that opens the rail, then the crumb naming the
/// place; at the far end one cluster of 28pt outline controls (the
/// attention badge, Machines, Jump and, on a phone, the assistant). It is
/// the system bar, dressed as the web's: the raised surface with the seam
/// under it and no glass, so the Duo still lays it out along its side.
@MainActor
enum TopBar {
    /// The bar's own look: `--surface-raised` with a 1pt `--seam` under it.
    static func dress(_ bar: UINavigationBar) {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = Palette.surfaceRaised
        // A whole point of seam, not the system's hairline.
        appearance.shadowImage = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { _ in
            UIColor.black.setFill()
            UIRectFill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }.withRenderingMode(.alwaysTemplate)
        appearance.shadowColor = Palette.seam
        appearance.titleTextAttributes = TypeScale.typeBody.attributes(color: Palette.inkStrong)
        bar.standardAppearance = appearance
        bar.scrollEdgeAppearance = appearance
        bar.compactAppearance = appearance
        bar.compactScrollEdgeAppearance = appearance
        bar.tintColor = Palette.inkStrong
    }

    /// Puts the burger (compact only), the crumb and the cluster on `item`.
    static func install(on item: UINavigationItem, crumb: CrumbView, cluster: TopBarCluster, burger: UIView?) {
        // The bar's own inset is the system's 16pt; the web's burger stands at 18
        // (`space7` less its own −`space2`), and so does a desk's crumb.
        let inset = UIView()
        inset.widthAnchor.constraint(equalToConstant: 2).isActive = true
        let lead = UIStackView(arrangedSubviews: [inset, burger, crumb].compactMap(\.self))
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

// MARK: Crumb

/// The one "where am I" label (Shell.svelte `.crumb`): body type in strong
/// ink. A new place rises 4pt as it fades in over `durControl` while the
/// old one fades where it stood; with less motion only the fades run.
final class CrumbView: UIView {
    private var label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)

    var text: String { label.text ?? "" }

    init(_ text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
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
        let inset = square ? 0 : Space.space3
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
}

extension ChromeButton: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .roundedRect(bounds, radius: Radius.radiusSm))
    }
}

/// The trailing cluster (Shell.svelte `.right`): the attention control, then
/// Machines, Jump and on a phone the assistant, `space2` apart at a desk and
/// 16pt apart under a finger so each 28pt control's touch area reaches 44.
final class TopBarCluster: UIView {
    var onAttention: () -> Void = {}
    var onMachines: (UIView) -> Void = { _ in }
    var onJump: () -> Void = {}
    var onAssistant: () -> Void = {}
    var onHub: () -> Void = {}

    let machines = ChromeButton(square: false)
    /// Native only: the hub this app talks to (the web is served by it).
    let hub = ChromeButton(square: true)
    let jump = ChromeButton(square: false)
    let assistant = ChromeButton(square: true)
    private let attention = ChromeButton(square: true)
    private let badge = UILabel()
    private let badgeBox = UIView()
    private let machinesGlyph = GlyphView(.server, tint: Palette.inkMuted)
    private let machinesCount = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let jumpWord = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let jumpKeys = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let stack = UIStackView()
    private var shownCount = 0

    /// Whether the cluster carries the assistant: a phone's bar does, a desk's rail does instead.
    var compact = true {
        didSet { assistant.isHidden = !compact; arrange() }
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            // The web's right inset is `space6` (21); the bar's own is 16.
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -(Space.space6 - 16)),
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
        jump.addAction(UIAction { [weak self] _ in self?.onJump() }, for: .primaryActionTriggered)

        assistant.row.addArrangedSubview(GlyphView(.assistant, tint: Palette.coral11))
        assistant.isAccessibilityElement = true
        assistant.accessibilityLabel = "Open assistant"
        assistant.addAction(UIAction { [weak self] _ in self?.onAssistant() }, for: .primaryActionTriggered)

        hub.row.addArrangedSubview(GlyphView(.globe, tint: Palette.inkMuted))
        hub.isAccessibilityElement = true
        hub.accessibilityLabel = "Change hub"
        hub.addAction(UIAction { [weak self] _ in self?.onHub() }, for: .primaryActionTriggered)
        hub.widthAnchor.constraint(equalToConstant: 28).isActive = true

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
            assistant.widthAnchor.constraint(equalToConstant: 28),
        ])
        attention.isHidden = true
        arrange()
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (cluster: TopBarCluster, _: UITraitCollection) in cluster.arrange() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TopBarCluster is built in code")
    }

    /// Below 900pt the attention control stands left of the cluster, out of
    /// its flow, so arriving it moves nothing; wider it is the first control.
    private func arrange() {
        let coarse = traitCollection.userInterfaceIdiom != .mac
        stack.spacing = coarse ? 16 : Space.space2
        for view in stack.arrangedSubviews { stack.removeArrangedSubview(view); view.removeFromSuperview() }
        let width = window?.bounds.width ?? UIScreen.main.bounds.width
        jumpWord.isHidden = width < 640
        jumpKeys.isHidden = width < 900
        if width < 900 {
            addSubview(attention)
            attention.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                attention.centerYAnchor.constraint(equalTo: centerYAnchor),
                attention.trailingAnchor.constraint(equalTo: leadingAnchor, constant: -stack.spacing),
                attention.heightAnchor.constraint(equalToConstant: 28),
            ])
            [machines, jump, hub, assistant].forEach(stack.addArrangedSubview)
        } else {
            [attention, machines, jump, hub, assistant].forEach(stack.addArrangedSubview)
        }
        assistant.isHidden = !compact
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        arrange()
    }

    /// The hub's word on the bar: what waits on the operator, which machines are up.
    func configure(blocked: Int, online: Int, tone: MachineHealth.Tone?, assistantOpen: Bool) {
        machinesCount.text = "\(online)"
        // The glyph alone carries a machine in trouble; it crosses over `durFade`, never pulses.
        let ink: UIColor = switch tone {
        case .fail: Palette.statusFailGlyph
        case .attn: Palette.statusAttnGlyph
        case nil: Palette.inkMuted
        }
        if machinesGlyph.tintColor != ink {
            Motion.easeOut.animator(Motion.durFade) { self.machinesGlyph.tintColor = ink }.startAnimation()
        }
        machines.accessibilityValue = "\(online) online"
        assistant.expanded = assistantOpen
        assistant.accessibilityLabel = assistantOpen ? "Close assistant" : "Open assistant"
        attention.accessibilityLabel = "\(blocked) waiting on you"
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
