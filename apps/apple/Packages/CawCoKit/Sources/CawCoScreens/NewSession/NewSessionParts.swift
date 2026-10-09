import CawCoDesign
import UIKit

// The new-session dialog's own recipes (spawn/ns-theme.css and the parts it
// styles), each from the root tokens.

/// A press that scales to `pressScale` over `durToggle`, none with less motion
/// (ns-theme.css `button:active`).
@MainActor
func nsPress(_ view: UIView, _ down: Bool) {
    guard !UIAccessibility.isReduceMotionEnabled else { return }
    let scale = down ? Motion.pressScale : 1
    Motion.easeOut.animator(Motion.durToggle) { view.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
}

/// A glyph or a mark drawn at `side` points, as a button's image slot takes it
/// (`svg { width: 16px; height: 16px }`); `alpha` fades a mark that is not the chosen one.
@MainActor
func nsSized(_ image: UIImage, _ side: Double, template: Bool, alpha: Double = 1) -> UIImage {
    let box = CGRect(x: 0, y: 0, width: side, height: side)
    let drawn = UIGraphicsImageRenderer(size: box.size).image { _ in image.draw(in: box, blendMode: .normal, alpha: alpha) }
    return drawn.withRenderingMode(template ? .alwaysTemplate : .alwaysOriginal)
}

/// A small labelled control in the form's own skin: a 16pt glyph, 6pt, its
/// strong label, 10pt in, at `--radius-sm`. `bordered` is `.browse`: the
/// recess on a neutral edge with the raised shadow; otherwise it is bare
/// (`.override`), in muted ink.
final class NsLabelButton: UIControl {
    private let glyph = GlyphView(.search, size: 16, tint: Palette.inkMuted)
    private let label: KitLabel
    private let bordered: Bool

    init(bordered: Bool, height: Double) {
        self.bordered = bordered
        label = KitLabel(TypeScale.typeLabel.with(weight: .medium, leading: 1), ink: bordered ? Palette.inkStrong : Palette.inkMuted)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = bordered ? 1 : 0
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [glyph, label])
        row.spacing = 6
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: height),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentCompressionResistancePriority(.required, for: .horizontal)
        setContentHuggingPriority(.required, for: .horizontal)
        isAccessibilityElement = true
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: NsLabelButton, _: UITraitCollection) in button.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsLabelButton is built in code") }

    func show(_ icon: Glyph?, _ text: String) {
        glyph.isHidden = icon == nil
        if let icon { glyph.glyph = icon }
        label.text = text
        accessibilityLabel = text
    }

    private func paint() {
        guard bordered else { return }
        backgroundColor = isHighlighted ? Palette.surfaceHover : Palette.surfaceRecess
        layer.borderColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
        boxShadow = Shadow.shadowRaised
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            nsPress(self, isHighlighted)
            backgroundColor = isHighlighted ? Palette.surfaceHover : (bordered ? Palette.surfaceRecess : .clear)
        }
    }

    override var isEnabled: Bool { didSet { alpha = isEnabled ? 1 : 0.5 } }
}

/// `.ns-chip-btn`: a setting as a small trigger that opens its picker. 30pt,
/// 8pt in, 6pt between its parts, the raised surface on the control border at
/// `--radius-sm`; its glyph 16pt, its label strong at label size, a 12pt
/// chevron in subtle ink. Open, it fills.
final class NsChip: UIControl {
    private let lead = UIImageView()
    private let label = KitLabel(TypeScale.typeLabel.with(weight: .medium), ink: Palette.inkStrong)
    private let chevron = GlyphView(.chevronDown, size: 12, tint: Palette.inkSubtle)
    private let row = UIStackView()
    /// A trailing control (the project chip's clear), standing where the chevron does.
    private(set) var trailing: UIView?

    /// No setting yet, where one is required (MachinesChip): fail ink and edge.
    var warn = false { didSet { paint() } }
    /// Nothing chosen (ProjectChip, LocationChip): muted ink.
    var empty = false { didSet { paint() } }
    var open = false { didSet { paint() } }
    /// A grant wider than the rest (Full Send, ToolChips.svelte `.full-send`):
    /// the warning tint, its ink and a real edge, plain or not.
    var grant = false { didSet { paint() } }

    /// A chip that names a setting it cannot change: its own look at 55%, no chevron.
    var off = false {
        didSet {
            alpha = off ? 0.55 : 1
            isEnabled = !off
            chevron.isHidden = off || plain || !showsChevron || trailing != nil
        }
    }

    /// The same chip as plain text, where the setting cannot be changed
    /// (`.ns-chip-btn.static`): no surface, no edge, no chevron.
    var plain = false {
        didSet {
            chevron.isHidden = off || plain || !showsChevron || trailing != nil
            paint()
        }
    }

    private let showsChevron: Bool

    /// `height`: 30pt, or 28 for a tool chip riding a model row
    /// (`.ns-chip-btn.tool`). `inset` and `gap`: 8 and 6, drawn in to 6 and 4
    /// where three chips share a phone's row. `chevron`: a bordered chip
    /// already reads as tappable there, and its chevron is room a name needs.
    init(height: Double = 30, inset: Double = 8, gap: Double = 6, chevron showsChevron: Bool = true) {
        self.showsChevron = showsChevron
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        lead.contentMode = .scaleAspectFit
        lead.translatesAutoresizingMaskIntoConstraints = false
        label.lineBreakMode = .byTruncatingTail
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        row.spacing = gap
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        chevron.isHidden = !showsChevron
        for view in [lead, label, chevron] as [UIView] { row.addArrangedSubview(view) }
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: height),
            lead.widthAnchor.constraint(equalToConstant: 16),
            lead.heightAnchor.constraint(equalToConstant: 16),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inset),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: NsChip, _: UITraitCollection) in chip.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsChip is built in code") }

    /// The chip's face: its glyph (a template in `tint`, or a brand mark as drawn), its label.
    func show(_ image: UIImage, tint: UIColor? = nil, label text: String, mono: Bool = false) {
        lead.image = image
        lead.tintColor = tint
        label.role = mono ? TypeScale.typeLabel.with(weight: .regular, family: FontFamily.fontMono) : TypeScale.typeLabel.with(weight: .medium)
        label.text = text
    }

    /// Puts `view` where the chevron stands (nil: the chevron again).
    func setTrailing(_ view: UIView?) {
        trailing?.removeFromSuperview()
        trailing = view
        chevron.isHidden = view != nil || !showsChevron || plain || off
        if let view { row.addArrangedSubview(view) }
        row.isUserInteractionEnabled = view != nil
    }

    override var isHighlighted: Bool {
        didSet { if isHighlighted != oldValue { nsPress(self, isHighlighted) } }
    }


    private func paint() {
        let traits = traitCollection
        if grant {
            backgroundColor = Palette.statusAttnBg
            layer.borderColor = Palette.statusAttnInk.resolvedColor(with: traits).cgColor
            label.ink = Palette.statusAttnInk
            chevron.tintColor = Palette.statusAttnInk
            return
        }
        chevron.tintColor = Palette.inkSubtle
        backgroundColor = plain ? .clear : (open ? Palette.surfaceFill : Palette.surfaceRaised)
        layer.borderColor = plain ? UIColor.clear.cgColor : (warn ? Palette.statusFailInk : Palette.borderControl).resolvedColor(with: traits).cgColor
        label.ink = warn ? Palette.statusFailInk : (empty ? Palette.inkMuted : Palette.inkStrong)
    }
}

/// `.ns-btn`: 36pt, 14pt in, strong body type, the control border at
/// `--radius-md` on the raised surface; `.sm` is 30pt at label size and
/// `.xs` 28pt; `primary` is the action surface in on-brand ink. Disabled, it
/// only fades to 55%. Pending, its label says what it is doing.
final class NsButton: UIControl {
    enum Size { case md, sm, xs }
    private let primary: Bool
    private let gradient = CAGradientLayer()
    private let label: KitLabel
    private let spinner: KitSpinner
    private var title: String
    private(set) var pending = false

    /// `height`: its size's own (36, 30, 28) unless a place gives it another (44 under a finger).
    init(_ title: String, primary: Bool = false, size: Size = .md, height: Double? = nil, action: @escaping () -> Void) {
        self.primary = primary
        self.title = title
        let ink = primary ? Palette.onBrand : Palette.inkStrong
        label = KitLabel((size == .md ? TypeScale.typeBody : TypeScale.typeLabel).with(weight: .medium, leading: 1), ink: ink, tracking: size == .md ? -0.01 : 0)
        spinner = KitSpinner(side: 16, tint: ink)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = size == .md ? Radius.radiusMd : Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = primary ? 0 : 1
        clipsToBounds = true
        if primary { layer.insertSublayer(gradient, at: 0) }
        label.text = title
        // Stretched wide, the button keeps its label its own width, in the middle.
        label.setContentHuggingPriority(.required, for: .horizontal)
        spinner.isHidden = true
        let row = UIStackView(arrangedSubviews: [spinner, label])
        row.spacing = 6
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        // The padding starts inside the web button's 1px border (transparent on the primary).
        let side: Double = (size == .md ? 14 : size == .sm ? 11 : 8) + 1
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: height ?? (size == .md ? 36 : size == .sm ? 30 : 28)),
            row.centerXAnchor.constraint(equalTo: centerXAnchor),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            row.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: side),
            row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -side),
        ])
        let hug = widthAnchor.constraint(equalTo: row.widthAnchor, constant: side * 2)
        hug.priority = .defaultHigh
        hug.isActive = true
        addAction(UIAction { [weak self] _ in
            // A pending button keeps its place and swallows the press.
            if self?.pending == false { action() }
        }, for: .touchUpInside)
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = title
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: NsButton, _: UITraitCollection) in button.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsButton is built in code") }

    /// What it says at rest.
    func setLabel(_ text: String) {
        title = text
        if !pending { show(text) }
    }

    private func show(_ text: String) {
        guard label.text != text else { return }
        label.text = text
        accessibilityLabel = text
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        // Its width follows its label over `durMorph`.
        Motion.easeInOut.animator(Motion.durMorph) { self.superview?.layoutIfNeeded() }.startAnimation()
    }

    /// While its work runs: the spinner, and `busy` for its label.
    func setPending(_ next: Bool, label busy: String) {
        guard next != pending || (next && label.text != busy) else { return }
        pending = next
        spinner.isHidden = !next
        show(next ? busy : title)
        accessibilityTraits = next ? [.button, .updatesFrequently] : .button
    }

    override var isEnabled: Bool { didSet { alpha = isEnabled ? 1 : 0.55 } }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            nsPress(self, isHighlighted && isEnabled)
            if !primary { backgroundColor = isHighlighted ? Palette.surfaceHover : Palette.surfaceRaised }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = bounds
        CATransaction.commit()
    }

    private func paint() {
        let traits = traitCollection
        backgroundColor = primary ? .clear : Palette.surfaceRaised
        gradient.colors = Palette.actionSurface.colors(for: traits)
        layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
    }
}

/// `.ns-tile`: a glyph on the raised surface at `--radius-sm` with the tile
/// shadow; `dashed` is a dashed neutral edge on nothing; `ink` is the solid ink.
final class NsTile: UIView {
    enum Look { case raised, dashed, ink }
    private let look: Look
    private let dash = CAShapeLayer()

    init(_ content: UIView, side: Double = 26, look: Look = .raised) {
        self.look = look
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: side),
            heightAnchor.constraint(equalToConstant: side),
            content.centerXAnchor.constraint(equalTo: centerXAnchor),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        if look == .dashed {
            dash.fillColor = nil
            dash.lineWidth = 1
            dash.lineDashPattern = [3, 2]
            layer.addSublayer(dash)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (tile: NsTile, _: UITraitCollection) in tile.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsTile is built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        dash.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusSm).cgPath
    }

    private func paint() {
        switch look {
        case .raised:
            backgroundColor = Palette.surfaceRaised
            boxShadow = Shadow.shadowTile
        case .dashed:
            backgroundColor = .clear
            dash.strokeColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
        case .ink:
            backgroundColor = Palette.inkSolid
        }
    }
}

/// SectionHeader (ui/section-header): a 16pt duotone glyph in the section's
/// hue, 8pt, then its name in the label role.
func nsSectionHeader(_ glyph: Glyph, hue: UIColor, _ text: String) -> UIView {
    let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    label.text = text
    label.accessibilityTraits = .header
    let row = UIStackView(arrangedSubviews: [GlyphView(glyph, size: 16, tint: hue), label, UIView()])
    row.spacing = 8
    row.alignment = .center
    return row
}

/// `.fai-comb`: a 14pt band of 1pt `--neutral-5` ticks, 6pt apart.
final class NsComb: UIView {
    private let ticks = CAShapeLayer()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 14).isActive = true
        ticks.lineWidth = 1
        layer.addSublayer(ticks)
        isUserInteractionEnabled = false
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (comb: NsComb, _: UITraitCollection) in comb.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsComb is built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath()
        var x = 0.5
        while x < bounds.width {
            path.move(to: CGPoint(x: x, y: 0))
            path.addLine(to: CGPoint(x: x, y: bounds.height))
            x += 6
        }
        ticks.frame = bounds
        ticks.path = path.cgPath
    }

    private func paint() {
        ticks.strokeColor = Palette.neutral5.resolvedColor(with: traitCollection).cgColor
    }
}

/// A picker row (the chips' popovers, PermissionSection, LifetimeChip): any
/// content, then the check when chosen; chosen, the row fills, and a press
/// tints it. 8pt in, 6pt above and below, at least `height` tall, at
/// `--radius-sm`.
final class NsRow: UIControl {
    private let check = GlyphView(.passed, size: 16, tint: Palette.inkStrong)
    private let fills: Bool
    /// Chosen, and said so to assistive technology (the web row's `aria-pressed`).
    var chosen = false {
        didSet {
            paint(animated: true)
            if chosen { accessibilityTraits.insert(.selected) } else { accessibilityTraits.remove(.selected) }
        }
    }

    /// `check`: whether the row keeps a slot for the check, so rows share one
    /// width whichever is chosen. `fills`: whether a chosen row fills.
    init(_ content: UIView, height: Double = 44, check keepsCheck: Bool = true, fills: Bool = true, label: String) {
        self.fills = fills
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        content.isUserInteractionEnabled = false
        let row = UIStackView(arrangedSubviews: [content])
        if keepsCheck { row.addArrangedSubview(check) }
        row.spacing = 10
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        // On a phone every button in the popover is at least 44 tall (ns-theme.css, `max-width: 640px`).
        let phone = UIScreen.main.bounds.width <= 640
        // `padding: 6px 8px`; a row of fixed height (the machines' `height: 44px`) lets its content run into the padding.
        let top = row.topAnchor.constraint(equalTo: topAnchor, constant: 6)
        let bottom = row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6)
        top.priority = .defaultHigh
        bottom.priority = .defaultHigh
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: phone ? max(height, Size.cBtnHLg) : height),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            top,
            bottom,
        ])
        isAccessibilityElement = true
        accessibilityLabel = label
        paint(animated: false)
    }

    /// A tile, the name in the label role over its meta in subtle meta type.
    convenience init(tile: UIView, name: String, meta: String?, height: Double = 44, wraps: Bool = false, check: Bool = true, fills: Bool = true, mono: Bool = false) {
        let title = KitLabel(mono ? TypeScale.typeLabel.with(family: FontFamily.fontMono) : TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = name
        title.lineBreakMode = .byTruncatingTail
        let detail = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle, lines: wraps ? 0 : 1)
        detail.text = meta
        detail.isHidden = meta == nil
        detail.lineBreakMode = .byTruncatingTail
        let text = UIStackView(arrangedSubviews: [title, detail])
        text.axis = .vertical
        let content = UIStackView(arrangedSubviews: [tile, text])
        content.spacing = 10
        content.alignment = .center
        self.init(content, height: height, check: check, fills: fills, label: [name, meta].compactMap { $0 }.joined(separator: ", "))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsRow is built in code") }

    private var resting: UIColor { chosen && fills ? Palette.surfaceFill : .clear }

    override var isHighlighted: Bool {
        didSet { if isHighlighted != oldValue { backgroundColor = isHighlighted ? Palette.surfaceHover : resting } }
    }

    override var isEnabled: Bool { didSet { alpha = isEnabled ? 1 : 0.55 } }

    private func paint(animated: Bool) {
        accessibilityTraits = chosen ? [.button, .selected] : .button
        let apply: @MainActor () -> Void = {
            self.backgroundColor = self.resting
            self.check.alpha = self.chosen ? 1 : 0
            self.check.transform = self.chosen ? .identity : CGAffineTransform(scaleX: 0.5, y: 0.5)
        }
        if animated, window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durToggle, animations: apply).startAnimation()
        } else {
            apply()
        }
    }
}

/// Segmented.svelte: a `--surface-recess-deep` well at `--radius-md`, 3pt
/// in, equal columns 2pt apart, 26pt items in strong label type; the chosen
/// one's lifted thumb (`--surface-lift`, `--shadow-raised`) slides to it.
final class NsSegmented: UIControl {
    private let thumb = UIView()
    private var cells: [UIButton] = []
    private(set) var index: Int
    private let items: [(label: String, glyph: UIImage?, tint: UIColor?, off: UIImage?)]
    var onChange: (Int) -> Void = { _ in }

    /// `off`: the glyph an item wears while it is not the chosen one (a brand
    /// mark at 60%), where that differs.
    init(_ items: [(label: String, glyph: UIImage?, tint: UIColor?, off: UIImage?)], selected: Int) {
        index = selected
        // Each glyph is drawn once at the slot's size; a change of choice only swaps between them.
        self.items = items.map { item in
            (item.label, item.glyph.map { nsSized($0, 16, template: item.tint != nil) }, item.tint, item.off)
        }
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecessDeep
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        thumb.backgroundColor = Palette.surfaceLift
        thumb.layer.cornerRadius = Radius.radiusSm
        thumb.layer.cornerCurve = .continuous
        thumb.isUserInteractionEnabled = false
        addSubview(thumb)
        let stack = UIStackView()
        stack.distribution = .fillEqually
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 3),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 3),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -3),
            // `.tab { height: 26px }`; on a phone the popover's `button { min-height: 44px }` (ns-theme.css) outranks it.
            stack.heightAnchor.constraint(equalToConstant: UIScreen.main.bounds.width <= 640 ? Size.cBtnHLg : 26),
        ])
        for (i, item) in self.items.enumerated() {
            var config = UIButton.Configuration.plain()
            config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10)
            config.imagePadding = 6
            config.image = item.glyph
            config.cornerStyle = .fixed
            config.imageColorTransformer = item.tint.map { tint in UIConfigurationColorTransformer { _ in tint } }
            let cell = UIButton(configuration: config)
            cell.tag = i
            cell.accessibilityLabel = item.label
            cell.addAction(UIAction { [weak self] _ in self?.choose(i) }, for: .touchUpInside)
            cells.append(cell)
            stack.addArrangedSubview(cell)
            label(cell, item.label, on: i == selected)
        }
        isAccessibilityElement = false
        thumb.boxShadow = Shadow.shadowRaised
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsSegmented is built in code") }

    private func label(_ cell: UIButton, _ text: String, on: Bool) {
        if let off = items[cell.tag].off { cell.configuration?.image = on ? items[cell.tag].glyph : off }
        cell.configuration?.attributedTitle = AttributedString(text, attributes:
            TypeScale.typeLabel.with(weight: .medium).container(color: on ? Palette.inkStrong : Palette.inkMuted))
        cell.accessibilityTraits = on ? [.button, .selected] : .button
    }

    private func choose(_ i: Int) {
        guard i != index else { return }
        index = i
        for (j, cell) in cells.enumerated() { label(cell, cell.accessibilityLabel ?? "", on: j == i) }
        if UIAccessibility.isReduceMotionEnabled { layoutThumb() } else { Motion.easeInOut.animator(Motion.durPop) { self.layoutThumb() }.startAnimation() }
        onChange(i)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutThumb()
    }

    private func layoutThumb() {
        guard cells.indices.contains(index) else { return }
        let cell = cells[index]
        // The cells are placed by their stack: it lays out before the thumb reads them.
        cell.superview?.layoutIfNeeded()
        thumb.frame = cell.convert(cell.bounds, to: self)
    }
}

/// The dialog's popover (NsPopover.svelte, `.ns-pop`): KitPopover's card,
/// `width` wide (the screen less 24pt on a phone), 6pt in, its rows `gap`
/// apart, at most 440pt tall (55% of the screen on a phone), scrolling inside.
class NsPopoverController: KitPopoverController {
    let rows = UIStackView()
    let scroll = UIScrollView()
    private let width: Double
    /// The popover has gone, however it was closed: its chip stops reading as open.
    var onClose: () -> Void = {}

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed { onClose() }
    }

    init(width: Double, gap: Double = 0) {
        self.width = width
        super.init()
        rows.axis = .vertical
        rows.spacing = gap
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        rows.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(scroll)
        scroll.addSubview(rows)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: card.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Self.inset),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Self.inset),
            rows.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Self.inset),
            rows.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Self.inset),
        ])
        fit()
    }

    /// `.ns-pop { padding: 6px }` inside its 1pt border.
    private static let inset = 6 + 1.0

    /// Sizes the card to its rows, inside the caps.
    func fit() {
        guard isViewLoaded else { return }
        let screen = view.window?.windowScene?.screen.bounds.size ?? UIScreen.main.bounds.size
        let phone = traitCollection.horizontalSizeClass == .compact
        let wide = phone ? screen.width - 24 : width
        let height = rows.systemLayoutSizeFitting(CGSize(width: wide - Self.inset * 2, height: UIView.layoutFittingCompressedSize.height),
                                                 withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        let cap = phone ? min(420, screen.height * 0.55) : 440
        preferredContentSize = CGSize(width: wide, height: min(height, cap))
    }

    /// A hairline between groups (`.divider`): 1pt, 4pt above and below, 2pt in.
    func divider() {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        let box = UIView()
        box.addSubview(line)
        line.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            line.heightAnchor.constraint(equalToConstant: 1),
            line.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 2),
            line.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -2),
            line.topAnchor.constraint(equalTo: box.topAnchor, constant: 4),
            line.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -4),
        ])
        rows.addArrangedSubview(box)
    }

    /// Rows arrive as the web's `ns-in`: from 8pt down and transparent, over
    /// `durFade` on the out curve, each `step` after the one before.
    func arrive(from first: Double = 0, step: Double = 0.035) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        for (i, row) in rows.arrangedSubviews.enumerated() {
            row.alpha = 0
            row.transform = CGAffineTransform(translationX: 0, y: 8)
            let animator = Motion.easeOut.animator(Motion.durFade) {
                row.alpha = 1
                row.transform = .identity
            }
            animator.startAnimation(afterDelay: first + Double(i) * step)
        }
    }
}
