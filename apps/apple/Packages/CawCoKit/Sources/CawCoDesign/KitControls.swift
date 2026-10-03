import UIKit

// MARK: Segmented tabs

/// The kit's segmented control (ui/fluid-tabs, `variant="segmented"`): a
/// `--muted` well at `--radius-sm` with 4pt of pad, items 28pt tall (32
/// under a finger) and 2pt apart, each a 16pt glyph and its name in label
/// type, 12pt in. The chosen item's raised sheet (`--surface-raised`,
/// `--shadow-tile`) glides to it over `durToggle` on the out curve, and its
/// ink turns strong over `durGhost`; a press tints the item.
public final class SegmentedTabs: UIControl {
    public struct Item: Sendable {
        public let label: String
        public let glyph: Glyph?
        public init(_ label: String, glyph: Glyph? = nil) {
            self.label = label
            self.glyph = glyph
        }
    }

    public private(set) var selectedIndex: Int
    private let stack = UIStackView()
    private let sheet = UIView()
    private var cells: [Cell] = []
    private static let pad = 4.0

    public init(_ items: [Item], selected: Int = 0) {
        selectedIndex = selected
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.muted
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        sheet.backgroundColor = Palette.surfaceRaised
        sheet.layer.cornerRadius = Radius.radiusSm - Self.pad
        sheet.layer.cornerCurve = .continuous
        sheet.isUserInteractionEnabled = false
        addSubview(sheet)
        stack.axis = .horizontal
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        let coarse = traitCollection.userInterfaceIdiom != .mac
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: Self.pad),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Self.pad),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Self.pad),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Self.pad),
            stack.heightAnchor.constraint(equalToConstant: coarse ? 32 : 28),
        ])
        for (index, item) in items.enumerated() {
            let cell = Cell(item)
            cell.addAction(UIAction { [weak self] _ in self?.choose(index) }, for: .primaryActionTriggered)
            cells.append(cell)
            stack.addArrangedSubview(cell)
        }
        isAccessibilityElement = false
        accessibilityTraits = .tabBar
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (tabs: SegmentedTabs, _: UITraitCollection) in tabs.paint() }
        paint()
        mark()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SegmentedTabs is built in code")
    }

    private func paint() {
        sheet.layer.draw(Shadow.shadowTile, in: traitCollection)
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        guard !placing else { return }
        place()
    }

    private var placing = false

    private func place() {
        guard cells.indices.contains(selectedIndex) else { return }
        stack.layoutIfNeeded()
        sheet.frame = cells[selectedIndex].convert(cells[selectedIndex].bounds, to: self)
    }

    private func mark() {
        for (index, cell) in cells.enumerated() { cell.chosen = index == selectedIndex }
    }

    /// Chooses the item at `index`, as a tap does.
    public func choose(_ index: Int) {
        guard index != selectedIndex, cells.indices.contains(index) else { return }
        selectedIndex = index
        Motion.easeOut.animator(Motion.durGhost) { self.mark() }.startAnimation()
        if UIAccessibility.isReduceMotionEnabled {
            place()
        } else {
            placing = true
            Motion.easeOut.animator(Motion.durToggle) { self.place() }.startAnimation()
            placing = false
        }
        sendActions(for: .valueChanged)
    }

    private final class Cell: UIControl {
        private let glyph: GlyphView?
        private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        var chosen = false {
            didSet {
                label.textColor = chosen ? Palette.inkStrong : Palette.inkMuted
                glyph?.tintColor = chosen ? Palette.inkStrong : Palette.inkMuted
                accessibilityTraits = chosen ? [.button, .selected] : .button
            }
        }

        init(_ item: Item) {
            glyph = item.glyph.map { GlyphView($0, size: 16, tint: Palette.inkMuted) }
            super.init(frame: .zero)
            layer.cornerRadius = Radius.radiusSm - 4
            label.text = item.label
            let row = UIStackView(arrangedSubviews: [glyph, label].compactMap(\.self))
            row.spacing = 6
            row.alignment = .center
            row.isUserInteractionEnabled = false
            row.translatesAutoresizingMaskIntoConstraints = false
            addSubview(row)
            NSLayoutConstraint.activate([
                row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
                row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
                row.centerYAnchor.constraint(equalTo: centerYAnchor),
            ])
            addTarget(self, action: #selector(tapped), for: .touchUpInside)
            isAccessibilityElement = true
            accessibilityLabel = item.label
            addInteraction(UIPointerInteraction(delegate: nil))
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("SegmentedTabs.Cell is built in code")
        }

        override var isHighlighted: Bool {
            didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
        }

        @objc private func tapped() { sendActions(for: .primaryActionTriggered) }
    }
}

// MARK: Alert

/// The kit's Alert (ui/alert): `--radius-md`, 12pt by 10pt in, body type,
/// a 16pt glyph leading the text 10pt before it; its tone sets the ground
/// and the ink.
public final class KitAlert: UIView {
    public enum Tone: Sendable { case plain, destructive, warning, success, info }

    public let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)

    public init(_ text: String = "", tone: Tone, glyph: Glyph? = nil) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        let (ground, ink): (UIColor, UIColor) = switch tone {
        case .plain: (Palette.surfaceRecess, Palette.inkStrong)
        case .destructive: (Palette.statusFailBg, Palette.statusFailInk)
        case .warning: (Palette.statusAttnBg, Palette.statusAttnInk)
        case .success: (Palette.statusDoneBg, Palette.statusDoneInk)
        case .info: (Palette.statusLiveBg, Palette.statusLiveInk)
        }
        backgroundColor = ground
        label.textColor = ink
        label.text = text
        let row = UIStackView(arrangedSubviews: [label])
        row.spacing = 10
        row.alignment = .top
        if let glyph {
            let mark = GlyphView(glyph, size: 16, tint: ink)
            let slot = UIView()
            slot.addSubview(mark)
            mark.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                slot.widthAnchor.constraint(equalToConstant: 16),
                mark.topAnchor.constraint(equalTo: slot.topAnchor, constant: 2),
                mark.leadingAnchor.constraint(equalTo: slot.leadingAnchor),
                mark.bottomAnchor.constraint(lessThanOrEqualTo: slot.bottomAnchor),
            ])
            row.insertArrangedSubview(slot, at: 0)
        }
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitAlert is built in code")
    }

    override public var accessibilityLabel: String? {
        get { label.text }
        set { label.text = newValue }
    }
}

// MARK: Badge

/// The kit's Badge (ui/badge): 20pt, `--radius-xs`, 6pt in, label type;
/// the recess and strong ink by default, its variant's ground and ink else.
public final class KitBadge: UIView {
    public enum Variant: Sendable { case plain, secondary, outline, attn, done, fail, live }

    public init(_ text: String, variant: Variant = .plain) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        let (ground, ink): (UIColor, UIColor) = switch variant {
        case .plain, .outline: (Palette.surfaceRecess, Palette.inkStrong)
        case .secondary: (Palette.surfaceRecess, Palette.inkMuted)
        case .attn: (Palette.statusAttnBg, Palette.statusAttnInk)
        case .done: (Palette.statusDoneBg, Palette.statusDoneInk)
        case .fail: (Palette.statusFailBg, Palette.statusFailInk)
        case .live: (Palette.statusLiveBg, Palette.statusLiveInk)
        }
        backgroundColor = ground
        let label = KitLabel(TypeScale.typeLabel, ink: ink)
        label.text = text
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 20),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        isAccessibilityElement = true
        accessibilityLabel = text
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitBadge is built in code")
    }
}

// MARK: Spinner

/// The kit's Spinner (ui/spinner): a 2.5-unit ring at a quarter of its
/// opacity and a quarter arc of it with round ends, in its tint, turning
/// once a second (`animate-spin`); drawn at `side` points.
public final class KitSpinner: UIView {
    private let track = CAShapeLayer()
    private let arc = CAShapeLayer()
    private let side: Double

    public init(side: Double = 16, tint: UIColor = Palette.inkMuted) {
        self.side = side
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        tintColor = tint
        for shape in [track, arc] {
            shape.fillColor = nil
            shape.lineWidth = 2.5 * side / 24
            layer.addSublayer(shape)
        }
        track.opacity = 0.25
        arc.lineCap = .round
        arc.strokeEnd = 0.25
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: side), heightAnchor.constraint(equalToConstant: side)])
        isAccessibilityElement = true
        accessibilityLabel = "Loading"
        accessibilityTraits = .updatesFrequently
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitSpinner is built in code")
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        let radius = 9 * side / 24
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: radius, startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true).cgPath
        for shape in [track, arc] {
            shape.frame = bounds
            shape.path = path
        }
    }

    override public func tintColorDidChange() {
        super.tintColorDidChange()
        let ink = tintColor.resolvedColor(with: traitCollection).cgColor
        track.strokeColor = ink
        arc.strokeColor = ink
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        tintColorDidChange()
        guard window != nil else { return layer.removeAnimation(forKey: "spin") }
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = 2 * Double.pi
        spin.duration = 1
        spin.repeatCount = .infinity
        layer.add(spin, forKey: "spin")
    }
}

// MARK: Copy box

/// One line of something to paste elsewhere (join/CopyBox.svelte): 36pt on
/// `--surface-hover` inside the control border at `--radius-md`, the text in
/// mono meta, truncated, and a Copy button (26pt, raised, the documents
/// glyph at 13pt) that says "Copied" or "Copy failed". What is copied is
/// always the whole line.
public final class CopyBox: UIView {
    private let text: String
    private let button = UIButton(type: .system)

    public init(text: String, label: String) {
        self.text = text
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceHover
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        let code = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkStrong)
        code.text = text
        code.lineBreakMode = .byTruncatingTail
        code.accessibilityLabel = "\(label): \(text)"
        code.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        var config = UIButton.Configuration.plain()
        config.image = Glyph.documents.image.resized(to: 13)
        config.imagePadding = 5
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
        config.background.backgroundColor = Palette.surfaceRaised
        config.background.cornerRadius = Radius.radiusSm
        config.background.strokeColor = Palette.borderControl
        config.background.strokeWidth = 1
        button.configuration = config
        button.houseStyle()
        say("Copy")
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.setContentCompressionResistancePriority(.required, for: .horizontal)
        button.addAction(UIAction { [weak self] _ in self?.copy() }, for: .primaryActionTriggered)
        button.configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted || button.isHovered ? Palette.surfaceHover : Palette.surfaceRaised
            let scale = button.isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) { button.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
        }
        let row = UIStackView(arrangedSubviews: [code, button])
        row.spacing = 8
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 36),
            button.heightAnchor.constraint(equalToConstant: 26),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -5),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (box: CopyBox, _: UITraitCollection) in box.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CopyBox is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    private func say(_ word: String) {
        button.configuration?.attributedTitle = AttributedString(word, attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkStrong)))
        button.accessibilityLabel = word
    }

    private var reset: Task<Void, Never>?

    private func copy() {
        UIPasteboard.general.string = text
        say(UIPasteboard.general.string == text ? "Copied" : "Copy failed")
        UIAccessibility.post(notification: .announcement, argument: button.accessibilityLabel)
        reset?.cancel()
        reset = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Motion.durHold))
            guard !Task.isCancelled else { return }
            self?.say("Copy")
        }
    }
}
