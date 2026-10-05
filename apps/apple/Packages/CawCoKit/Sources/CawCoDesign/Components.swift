import CawCoCore
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

// The web dashboard's kit, recipe by recipe (apps/dashboard/src/lib/components/ui
// and app.css), as UIKit views. Every value comes from the tokens.

public extension UIButton {
    /// The tab controls' press: `pressScale` over `durControl`, none with
    /// Reduce Motion (PaneTabs.svelte `.tclose:active`).
    func pressScaling() {
        configurationUpdateHandler = { button in
            let pressed = button.isHighlighted && !UIAccessibility.isReduceMotionEnabled
            let to = pressed ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                button.transform = CGAffineTransform(scaleX: to, y: to)
            }.startAnimation()
        }
    }
}

// MARK: Tile

/// A raised tile (`--surface-raised` with `--shadow-tile`: a 1pt drop and a
/// 1pt hairline ring, both of neutral-12, heavier at night).
open class TileView: UIView {
    public init(radius: Double = Radius.radiusLg) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = radius
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("TileView is built in code")
    }
}

// MARK: Buttons

/// The web's Button (button.svelte): its variants and heights, as a
/// `UIButton.Configuration`. A wide button tints on press; a compact one
/// scales to `pressScale`.
@MainActor
public enum KitButton {
    public enum Variant: Sendable {
        /// The action: vermilion, on its own lightness gradient.
        case action
        /// Recessed, on a hairline.
        case secondary
        /// Raised, on the control border.
        case outline
        /// No fill and no edge at rest.
        case ghost
    }

    public enum Height: Sendable {
        case xs, sm, standard, lg

        var points: Double {
            switch self {
            case .xs: Size.cBtnHXs
            case .sm: Size.cBtnHSm
            case .standard: Size.cBtnH
            case .lg: Size.cBtnHLg
            }
        }

        var padding: Double {
            switch self {
            case .xs: 8
            case .sm: Space.space3
            case .standard: Space.space4
            case .lg: 16
            }
        }

        var gap: Double {
            switch self {
            case .xs: Space.space1
            case .sm: Space.space2
            case .standard, .lg: 8
            }
        }

        var role: TypeRole {
            switch self {
            case .xs, .sm: TypeScale.typeLabel
            case .standard, .lg: TypeScale.typeButton
            }
        }
    }

    public static func make(
        _ title: String,
        glyph: Glyph? = nil,
        glyphTint: UIColor? = nil,
        variant: Variant,
        height: Height = .standard,
        stretch: Bool = false,
        action: @escaping () -> Void
    ) -> UIButton {
        let button = UIButton(configuration: configuration(title, glyph: glyph, glyphTint: glyphTint, variant: variant, height: height), primaryAction: UIAction { _ in action() })
        button.houseStyle()
        button.translatesAutoresizingMaskIntoConstraints = false
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: height.points).isActive = true
        let compact = !stretch
        button.configurationUpdateHandler = { button in
            guard var config = button.configuration else {
                return
            }
            let pressed = button.isHighlighted && button.isEnabled
            config.background.backgroundColor = background(variant, pressed: pressed && !compact)
            button.configuration = config
            button.alpha = button.isEnabled ? 1 : 0.5
            let scale = compact && pressed && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durToggle) {
                button.transform = CGAffineTransform(scaleX: scale, y: scale)
            }.startAnimation()
        }
        return button
    }

    public static func setTitle(_ title: String, of button: UIButton, variant: Variant, height: Height) {
        button.configuration?.attributedTitle = AttributedString(title, attributes: AttributeContainer(height.role.attributes(color: ink(variant), tracking: -0.01)))
    }

    static func configuration(_ title: String, glyph: Glyph?, glyphTint: UIColor?, variant: Variant, height: Height) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(title, attributes: AttributeContainer(height.role.attributes(color: ink(variant), tracking: -0.01)))
        config.titleLineBreakMode = .byTruncatingTail
        if let glyph {
            config.image = glyph.image.resized(to: Size.iconMd)
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in glyphTint ?? ink(variant) }
            config.imagePadding = height.gap
        }
        // The web button's 1px border is part of its box on every variant (transparent on some): its padding starts inside it.
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: height.padding + 1, bottom: 0, trailing: height.padding + 1)
        config.background.cornerRadius = Radius.radiusMd
        config.background.backgroundColor = background(variant, pressed: false)
        // Where that border is transparent the fill stops inside it
        // (`background-clip: padding-box`): the paint is a point in from the box on every side.
        if variant == .action || variant == .ghost {
            config.background.backgroundInsets = NSDirectionalEdgeInsets(top: 1, leading: 1, bottom: 1, trailing: 1)
            config.background.cornerRadius = Radius.radiusMd - 1
        }
        switch variant {
        case .action:
            config.background.strokeWidth = 0
            // `--action-surface`: the solid lighter at the top, darker at the foot.
            let gradient = ActionSurface()
            config.background.customView = gradient
        case .secondary:
            config.background.strokeColor = Palette.borderHairline
            config.background.strokeWidth = 1
        case .outline:
            config.background.strokeColor = Palette.borderControl
            config.background.strokeWidth = 1
        case .ghost:
            config.background.strokeWidth = 0
        }
        return config
    }

    private static func ink(_ variant: Variant) -> UIColor {
        variant == .action ? Palette.onAction : Palette.inkStrong
    }

    private static func background(_ variant: Variant, pressed: Bool) -> UIColor {
        if pressed {
            return Palette.surfaceFill
        }
        switch variant {
        case .action: return Palette.actionSolid
        case .secondary: return Palette.surfaceRecess
        case .outline: return Palette.surfaceRaised
        case .ghost: return .clear
        }
    }
}

public extension UIButton {
    /// Draws the house recipe on every idiom. On the Mac a button's default
    /// behaviour is AppKit's, which ignores a configuration's own background:
    /// the action button lost its vermilion there.
    func houseStyle() {
        preferredBehavioralStyle = .pad
        isPointerInteractionEnabled = true
        pointerStyleProvider = { button, _, _ in
            UIPointerStyle(effect: .hover(UITargetedPreview(view: button), preferredTintMode: .none, prefersShadow: false, prefersScaledContent: false), shape: .roundedRect(button.bounds, radius: Radius.radiusMd))
        }
    }
}

/// The action button's surface (`--action-surface`).
private final class ActionSurface: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ActionSurface, _: UITraitCollection) in
            view.paint()
        }
        paint()
    }

    private func paint() {
        (layer as? CAGradientLayer)?.colors = Palette.actionSurface.colors(for: traitCollection)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ActionSurface is built in code")
    }
}

extension UIImage {
    /// The image drawn at `side` points square, keeping its rendering mode.
    public func resized(to side: Double) -> UIImage {
        let size = CGSize(width: side, height: side)
        return UIGraphicsImageRenderer(size: size).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }.withRenderingMode(renderingMode)
    }

    /// A template glyph under a 4pt blur, drawn once at its own size: the far
    /// end of a glyph that comes in clearing its blur (`icon-swap`, a
    /// compaction's chevron), crossfaded with the sharp one.
    public func blurredGlyph() -> UIImage? {
        let scale = UITraitCollection.current.displayScale
        let padded = CGSize(width: size.width + 16, height: size.height + 16)
        let drawn = UIGraphicsImageRenderer(size: padded).image { _ in
            withTintColor(.black).draw(at: CGPoint(x: 8, y: 8))
        }
        guard let input = CIImage(image: drawn) else { return nil }
        let filter = CIFilter.gaussianBlur()
        filter.inputImage = input
        filter.radius = Float(4 * scale)
        guard let output = filter.outputImage?.cropped(to: input.extent),
              let cg = CIContext().createCGImage(output, from: input.extent)
        else { return nil }
        let soft = UIImage(cgImage: cg, scale: drawn.scale, orientation: .up).withRenderingMode(.alwaysTemplate)
        return UIGraphicsImageRenderer(size: size).image { _ in
            soft.draw(in: CGRect(x: -8, y: -8, width: padded.width, height: padded.height))
        }.withRenderingMode(.alwaysTemplate)
    }
}

// MARK: Tree count

/// A parent's count of what is folded under it, and the switch that opens it
/// (TreeCount.svelte): the last thing on its row, failures beside it in their ink.
public final class TreeCountButton: UIButton {
    public var onToggle: () -> Void = {}
    private var count = 0
    private var failed = 0
    private var open = false

    public init() {
        super.init(frame: .zero)
        houseStyle()
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        config.background.cornerRadius = Radius.radiusXs
        configuration = config
        addAction(UIAction { [weak self] _ in self?.onToggle() }, for: .primaryActionTriggered)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: Space.space5),
            widthAnchor.constraint(greaterThanOrEqualToConstant: Space.space5),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TreeCountButton is built in code")
    }

    public func configure(count: Int, failed: Int, open: Bool) {
        self.count = count
        self.failed = failed
        self.open = open
        var title = AttributedString("\(count)", attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: open ? Palette.inkStrong : Palette.inkMuted)))
        if failed > 0 {
            title += AttributedString(" · \(failed)", attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.statusFailInk)))
        }
        configuration?.attributedTitle = title
        configuration?.background.backgroundColor = open ? Palette.surfaceFillStrong : Palette.surfaceFill
        let label = "\(count) delegate\(count == 1 ? "" : "s")\(failed > 0 ? ", \(failed) failed" : "")"
        accessibilityLabel = open ? "Hide \(label)" : "Show \(label)"
    }
}

// MARK: Folder tabs

/// The session tabs' folder tabs, hosted (fluid-tabs, `variant="folder"`): no
/// shelf, the chosen tab a sheet with rounded shoulders and a foot that
/// flares into the page below. Each tab owns a sheet, shown by a mask no
/// wider than its tab: switching grows the chosen one from the side facing
/// the old one and shrinks the old one toward the new, over `durPop` on the
/// drawer curve.
public final class FolderTabs: UIControl {
    public struct Tab {
        public let label: String
        public init(label: String) {
            self.label = label
        }
    }

    /// The strip's sizes as the home's WorkTabs sets them.
    static let item = Space.space8
    static let padX = 6.0
    static let flare = Radius.radiusSm

    public private(set) var selectedIndex = 0
    private var cells: [Cell] = []
    private let stack = UIStackView()

    public init(_ tabs: [Tab], selected: Int) {
        selectedIndex = selected
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Self.flare),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Self.flare),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.heightAnchor.constraint(equalToConstant: Self.item),
        ])
        for (index, tab) in tabs.enumerated() {
            let cell = Cell(label: tab.label)
            cell.addAction(UIAction { [weak self] _ in self?.choose(index) }, for: .touchUpInside)
            cells.append(cell)
            stack.addArrangedSubview(cell)
        }
        apply(animated: false, forward: true)
        accessibilityTraits = .tabBar
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FolderTabs is built in code")
    }

    /// The view that trails a tab's label (its count).
    public func setTrail(_ view: UIView, at index: Int) {
        cells[index].setTrail(view)
    }

    /// How far under 260pt the rail holding the tabs is, 0 to 33
    /// (WorkTabs.svelte `--tight`): a tab's inset and the room after its
    /// trail give that much back, so both labels stand whole beside their counts.
    public var tight = 0.0 {
        didSet {
            guard tight != oldValue else { return }
            for cell in cells { cell.tight = tight }
        }
    }

    public func select(_ index: Int, animated: Bool) {
        guard index != selectedIndex else {
            return
        }
        let forward = index > selectedIndex
        selectedIndex = index
        apply(animated: animated && !UIAccessibility.isReduceMotionEnabled, forward: forward)
    }

    /// When set, a tap asks this instead of choosing the tab itself: the
    /// host drives the sheet (`scrub`, `select`).
    public var onChoose: ((Int) -> Void)?

    private func choose(_ index: Int) {
        if let onChoose {
            onChoose(index)
            return
        }
        guard index != selectedIndex else {
            return
        }
        select(index, animated: true)
        sendActions(for: .valueChanged)
    }

    /// Draws the sheet `progress` (0–1) of the way from tab `from` to tab
    /// `to`, where a finger or a settle has it: the chosen sheet grows from
    /// the side facing the old tab as the old one shrinks toward it. The
    /// labels' ink goes to the nearer tab.
    public func scrub(from: Int, to: Int, progress: Double) {
        let forward = to > from
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (index, cell) in cells.enumerated() {
            if index == to {
                cell.drive(sheet: progress, chosen: progress >= 0.5, forward: forward)
            } else if index == from {
                cell.drive(sheet: 1 - progress, chosen: progress < 0.5, forward: !forward)
            } else {
                cell.drive(sheet: 0, chosen: false, forward: forward)
            }
        }
        CATransaction.commit()
        selectedIndex = progress >= 0.5 ? to : from
    }

    private func apply(animated: Bool, forward: Bool) {
        CATransaction.begin()
        CATransaction.setDisableActions(!animated)
        CATransaction.setAnimationDuration(Motion.durPop)
        CATransaction.setAnimationTimingFunction(Motion.easeDrawer.function)
        for (index, cell) in cells.enumerated() {
            cell.set(chosen: index == selectedIndex, forward: forward)
        }
        CATransaction.commit()
    }

    final class Cell: UIControl {
        private let title: KitLabel
        private let row = UIStackView()
        private let sheet = CAShapeLayer()
        private let sheetMask = CALayer()

        init(label: String) {
            title = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
            super.init(frame: .zero)
            title.text = label
            row.axis = .horizontal
            // TabItem.svelte: the trail stands right after the label's hit.
            row.spacing = 0
            row.alignment = .center
            row.isUserInteractionEnabled = false
            row.translatesAutoresizingMaskIntoConstraints = false
            row.addArrangedSubview(title)
            addSubview(row)
            end = row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -FolderTabs.padX)
            lead = row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: FolderTabs.padX)
            NSLayoutConstraint.activate([
                lead,
                end,
                row.centerYAnchor.constraint(equalTo: centerYAnchor),
            ])
            sheetMask.backgroundColor = UIColor.black.cgColor
            sheet.mask = sheetMask
            layer.insertSublayer(sheet, at: 0)
            isAccessibilityElement = true
            accessibilityLabel = label
            accessibilityTraits = .button
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: Cell, _: UITraitCollection) in
                cell.paint()
            }
            paint()
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("FolderTabs.Cell is built in code")
        }

        private var end: NSLayoutConstraint!
        private var lead: NSLayoutConstraint!
        private var trailed = false

        /// A trail ends the tab: the label's hit loses its end padding, the
        /// box keeps `padX − 6` (TabItem.svelte), and the trail its own 2pt
        /// (WorkTabs.svelte `.count`).
        func setTrail(_ view: UIView) {
            row.addArrangedSubview(view)
            trailed = true
            inset()
        }

        /// WorkTabs.svelte: `--px: 6px − tight × 0.09`, and after a count `max(0, 2px − tight × 0.06)`.
        var tight = 0.0 {
            didSet { inset() }
        }

        private func inset() {
            let pad = FolderTabs.padX - tight * 0.09
            lead.constant = pad
            end.constant = trailed ? -max(0, 2 - tight * 0.06) : -pad
        }

        func set(chosen: Bool, forward: Bool) {
            title.ink = chosen ? Palette.inkStrong : Palette.inkMuted
            accessibilityTraits = chosen ? [.button, .selected] : .button
            // The chosen sheet grows from the side facing the old tab; the old one shrinks toward the new.
            anchor = chosen == forward ? 0 : 1
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            placeMask()
            CATransaction.commit()
            sheetMask.transform = CATransform3DMakeScale(chosen ? 1 : 0.0001, 1, 1)
        }

        /// The sheet shown `sheet` (0–1) wide, pinned at its growing side
        /// (`growsForward`: from the leading edge), with no animation.
        func drive(sheet: Double, chosen: Bool, forward growsForward: Bool) {
            title.ink = chosen ? Palette.inkStrong : Palette.inkMuted
            accessibilityTraits = chosen ? [.button, .selected] : .button
            anchor = growsForward ? 0 : 1
            sheetMask.removeAllAnimations()
            placeMask()
            sheetMask.transform = CATransform3DMakeScale(max(0.0001, sheet), 1, 1)
        }

        private var anchor = 0.0

        /// The mask over the whole sheet, pinned at the side it grows from.
        private func placeMask() {
            let size = sheet.bounds.size
            sheetMask.anchorPoint = CGPoint(x: anchor, y: 0.5)
            sheetMask.bounds = CGRect(origin: .zero, size: size)
            sheetMask.position = CGPoint(x: anchor * size.width, y: size.height / 2)
        }

        private func paint() {
            let dark = traitCollection.userInterfaceStyle == .dark
            sheet.fillColor = (dark ? Palette.surfaceHover : Palette.surfaceRaised).resolvedColor(with: traitCollection).cgColor
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            let flare = FolderTabs.flare
            sheet.frame = bounds.insetBy(dx: -flare, dy: 0)
            sheet.path = Self.sheetPath(in: sheet.bounds, radius: Radius.radiusSm, flare: flare)
            placeMask()
            CATransaction.commit()
        }

        /// Rounded shoulders, and a foot that curves outward by `flare` each side.
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
}

