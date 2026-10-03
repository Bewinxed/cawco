import CawCoCore
import CawCoDesign
import UIKit

// The rail's pieces (Sidebar.svelte on the sidebar kit, ui/sidebar/*):
// rows, the project mark, the loading rows, ages and the nesting line.

// MARK: Tap

/// A house control that answers a tap the way a button does: a touch lifted
/// inside it is its primary action, as a key press or VoiceOver's is.
class TapControl: UIControl {
    override init(frame: CGRect) {
        super.init(frame: frame)
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TapControl is built in code")
    }

    @objc private func tapped() {
        sendActions(for: .primaryActionTriggered)
    }
}

// MARK: Row

/// One clickable row of the rail (`Sidebar.MenuButton` / `MenuSubButton`):
/// a `--radius-sm` pill that takes `--surface-fill` while pressed
/// (`press-tint`), `--surface-hover` under a pointer, and the selected wash
/// when it is the place in front, its ink turning `--selected-ink`.
class RailRow: TapControl {
    let content = UIStackView()
    private let pill = UIView()
    private var hovering = false
    var active = false { didSet { if active != oldValue { paint(animated: true) } } }
    /// Labels whose ink follows the row's state.
    var inks: [KitLabel] = []
    var glyphs: [GlyphView] = []
    /// The row's resting ink (`text-sidebar-foreground`, or muted for "N older").
    var restInk = Palette.sidebarForeground { didSet { paint(animated: false) } }

    /// `height` nil: the caller sizes it (the nav rows' `--c-nav-h`).
    init(height: Double?, leading: Double, trailing: Double, gap: Double) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        pill.isUserInteractionEnabled = false
        pill.layer.cornerRadius = Radius.radiusSm
        pill.layer.cornerCurve = .continuous
        pill.translatesAutoresizingMaskIntoConstraints = false
        addSubview(pill)
        content.axis = .horizontal
        content.alignment = .center
        content.spacing = gap
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            pill.leadingAnchor.constraint(equalTo: leadingAnchor),
            pill.trailingAnchor.constraint(equalTo: trailingAnchor),
            pill.topAnchor.constraint(equalTo: topAnchor),
            pill.bottomAnchor.constraint(equalTo: bottomAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: leading),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -trailing),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        if let height { heightAnchor.constraint(equalToConstant: height).isActive = true }
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        addInteraction(UIPointerInteraction(delegate: nil))
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RailRow is built in code")
    }

    override var isHighlighted: Bool {
        didSet { if isHighlighted != oldValue { paint(animated: false) } }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        paint(animated: true)
    }

    func paint(animated: Bool) {
        let fill: UIColor = if isHighlighted && isEnabled {
            Palette.surfaceFill
        } else if active {
            Palette.selectedBg
        } else if hovering {
            Palette.surfaceHover
        } else {
            .clear
        }
        let ink = active ? Palette.selectedInk : (hovering || isHighlighted ? Palette.foreground : restInk)
        let apply: @MainActor @Sendable () -> Void = {
            self.pill.backgroundColor = fill
            for label in self.inks { label.ink = ink }
            for glyph in self.glyphs { glyph.tintColor = self.active ? Palette.selectedIcon : Palette.foreground }
        }
        // The pill glides on the drawer curve as the ink turns; a press has no transition.
        if animated && !isHighlighted {
            Motion.easeDrawer.animator(Motion.durControl, animations: apply).startAnimation()
        } else {
            apply()
        }
        accessibilityTraits = active ? [.button, .selected] : .button
    }

    /// The lead column every row of the rail shares (`SLOT`): 18pt.
    static func slot(_ view: UIView) -> UIView {
        let slot = UIView()
        slot.translatesAutoresizingMaskIntoConstraints = false
        slot.isUserInteractionEnabled = false
        view.translatesAutoresizingMaskIntoConstraints = false
        slot.addSubview(view)
        NSLayoutConstraint.activate([
            slot.widthAnchor.constraint(equalToConstant: 18),
            slot.heightAnchor.constraint(equalToConstant: 18),
            view.centerXAnchor.constraint(equalTo: slot.centerXAnchor),
            view.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
        ])
        slot.setContentHuggingPriority(.required, for: .horizontal)
        return slot
    }
}

// MARK: Ghost button

/// The kit's ghost icon button at `icon-sm` (30pt, `--radius-sm`): no fill
/// at rest, `--surface-hover` under a pointer or while its menu is open, a
/// 16pt glyph. Its menu, when it has one, opens on a tap.
final class GhostIconButton: UIButton {
    var on = false { didSet { paint() } }

    init(_ glyph: Glyph, label: String, tint: UIColor = Palette.sidebarForeground, side: Double = 30) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = glyph.image.resized(to: Size.iconMd)
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusSm
        configuration = config
        tintColor = tint
        accessibilityLabel = label
        houseStyle()
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: side),
            heightAnchor.constraint(equalToConstant: side),
        ])
        configurationUpdateHandler = { [weak self] _ in self?.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GhostIconButton is built in code")
    }

    private func paint() {
        guard var config = configuration else { return }
        config.background.backgroundColor = on ? Palette.selectedBg : (isHighlighted ? Palette.surfaceFill : .clear)
        configuration = config
        imageView?.tintColor = on ? Palette.selectedInk : tintColor
    }
}

// MARK: Marks

/// A project's mark (ProjectMark.svelte): the folder on its hued tile, 18pt
/// with a 12pt glyph, `--radius-xs`, the mark overlay over the hue.
final class ProjectMarkView: UIView {
    private let overlay = CAGradientLayer()
    private let glyph = GlyphView(.folder, size: 12, tint: Palette.markGlyph)

    init(cwd: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        clipsToBounds = true
        layer.addSublayer(overlay)
        addSubview(glyph)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 18),
            heightAnchor.constraint(equalToConstant: 18),
            glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        backgroundColor = Self.hue(cwd)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ProjectMarkView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectMarkView is built in code")
    }

    private func paint() {
        overlay.colors = Palette.markOverlay.colors(for: traitCollection)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        overlay.frame = bounds
    }

    /// mark.ts `markHue`: `(h * 31 + c) | 0` over the UTF-16 units, one of the eight mark hues.
    static func hue(_ seed: String) -> UIColor {
        var h: Int32 = 0
        for unit in seed.utf16 { h = h &* 31 &+ Int32(unit) }
        let hues = [Palette.mark1, Palette.mark2, Palette.mark3, Palette.mark4, Palette.mark5, Palette.mark6, Palette.mark7, Palette.mark8]
        return hues[Int(h.magnitude % 8)]
    }
}

/// The brand tile (Sidebar.svelte's header): the 18pt slot in `--brand-solid`
/// at `--radius-xs`, and in it the 12pt mark, an outlined square whose left
/// half is filled, in `--on-brand`.
final class BrandMark: UIView {
    private let shape = CAShapeLayer()
    private let half = CAShapeLayer()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.brandSolid
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        // The 24-unit viewBox drawn at 12pt: a stroke of 1.7 units is 0.85pt.
        let scale = 12.0 / 24
        let origin = 3.0
        shape.path = UIBezierPath(rect: CGRect(x: origin + 4 * scale, y: origin + 4 * scale, width: 16 * scale, height: 16 * scale)).cgPath
        shape.fillColor = nil
        shape.lineWidth = 1.7 * scale
        half.path = UIBezierPath(rect: CGRect(x: origin + 4 * scale, y: origin + 4 * scale, width: 8 * scale, height: 16 * scale)).cgPath
        half.lineWidth = 1.7 * scale
        layer.addSublayer(half)
        layer.addSublayer(shape)
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 18), heightAnchor.constraint(equalToConstant: 18)])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: BrandMark, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BrandMark is built in code")
    }

    private func paint() {
        let ink = Palette.onBrand.resolvedColor(with: traitCollection).cgColor
        shape.strokeColor = ink
        half.strokeColor = ink
        half.fillColor = ink
    }
}

// MARK: Loading

/// The kit's one loading placeholder (`kit-skeleton`): `--surface-fill` at
/// `--radius-sm`, a sheen sweeping across it once a `durLoop`, still under
/// Reduce Motion.
final class SkeletonView: UIView {
    private let sheen = CAGradientLayer()

    init(height: Double) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceFill
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        clipsToBounds = true
        sheen.startPoint = CGPoint(x: 0, y: 0.5)
        sheen.endPoint = CGPoint(x: 1, y: 0.5)
        sheen.locations = [0, 0.3, 0.5, 0.7, 1]
        layer.addSublayer(sheen)
        heightAnchor.constraint(equalToConstant: height).isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: SkeletonView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SkeletonView is built in code")
    }

    private func paint() {
        let clear = UIColor.clear.cgColor
        let ink = Palette.skeletonSheen.resolvedColor(with: traitCollection)
        sheen.colors = [ink.withAlphaComponent(0).cgColor, ink.withAlphaComponent(0).cgColor, ink.cgColor, ink.withAlphaComponent(0).cgColor, clear]
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        sheen.frame = bounds
        sheen.removeAnimation(forKey: "sweep")
        guard !UIAccessibility.isReduceMotionEnabled, bounds.width > 0 else { return }
        let sweep = CABasicAnimation(keyPath: "transform.translation.x")
        sweep.fromValue = -bounds.width
        sweep.toValue = bounds.width
        sweep.duration = Motion.durLoop
        sweep.repeatCount = .infinity
        sheen.add(sweep, forKey: "sweep")
    }
}

// MARK: Time

enum RailAge {
    /// time.ts `formatAgeShort`: now, then minutes, hours, days, weeks, years.
    static func short(_ at: Double, now: Double) -> String {
        let seconds = max(0, floor((now - at) / 1000))
        if seconds < 45 { return "now" }
        let minutes = (seconds / 60).rounded()
        if minutes < 60 { return "\(Int(minutes))m" }
        let hours = (minutes / 60).rounded()
        if hours < 24 { return "\(Int(hours))h" }
        let days = (hours / 24).rounded()
        if days < 7 { return "\(Int(days))d" }
        let weeks = (days / 7).rounded()
        if weeks < 52 { return "\(Int(weeks))w" }
        return "\(Int((days / 365).rounded()))y"
    }
}

// MARK: Nesting line

/// A child list's line (app.css `.kit-nest`): for each child an elbow from
/// the rail above, round a `--radius-sm` corner and out along its arm to the
/// child's glyph, and the rail on to the next child, in `--nest-ink`.
/// `head` is how far the line's head has run from the parent's glyph, in
/// points along every branch at once: the branch motion moves it; at rest it
/// is the whole way.
final class NestRailView: UIView {
    private var elbows: [CAShapeLayer] = []
    /// The rail's x in this view, how far above the list the parent's glyph
    /// foot is (`--nest-lead`), and each child's glyph centre and arm end.
    var railX = 0.0
    var lead = 0.0
    var children: [(glyphY: Double, armEnd: Double)] = [] { didSet { setNeedsLayout() } }
    var head = Double.infinity { didSet { cut() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: NestRailView, _: UITraitCollection) in view.draw() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NestRailView is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        draw()
    }

    /// One elbow's length: down the rail, round the corner, out along the arm.
    func length(_ index: Int) -> Double {
        let child = children[index]
        let r = Radius.radiusSm
        return (child.glyphY - r + lead) + .pi / 2 * r + (child.armEnd - railX - r)
    }

    private func draw() {
        while elbows.count < children.count {
            let elbow = CAShapeLayer()
            elbow.fillColor = nil
            elbow.lineWidth = 1
            layer.addSublayer(elbow)
            elbows.append(elbow)
        }
        while elbows.count > children.count { elbows.removeLast().removeFromSuperlayer() }
        let r = Radius.radiusSm
        let x = railX + 0.5
        let ink = Palette.nestInk.resolvedColor(with: traitCollection).cgColor
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (child, elbow) in zip(children, elbows) {
            let path = UIBezierPath()
            path.move(to: CGPoint(x: x, y: -lead))
            path.addLine(to: CGPoint(x: x, y: child.glyphY - r))
            path.addArc(withCenter: CGPoint(x: x + r, y: child.glyphY - r + 0.5), radius: r, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
            path.addLine(to: CGPoint(x: child.armEnd, y: child.glyphY + 0.5))
            elbow.frame = bounds
            elbow.path = path.cgPath
            elbow.strokeColor = ink
        }
        CATransaction.commit()
        cut()
    }

    private func cut() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (index, elbow) in elbows.enumerated() where index < children.count {
            elbow.strokeEnd = head.isFinite ? min(1, max(0, head / length(index))) : 1
        }
        CATransaction.commit()
    }
}
