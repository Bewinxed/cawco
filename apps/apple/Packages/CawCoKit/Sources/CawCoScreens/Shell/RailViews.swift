import CawCoCore
import CawCoDesign
import CawCoMascot
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
    /// The row's ground at rest: clear, or a state's wash (a failed session's).
    var restFill = UIColor.clear { didSet { if restFill != oldValue { paint(animated: false) } } }

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
        layer.zPosition = 2
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
            restFill
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
/// with a 12pt glyph, `--radius-xs`, the mark overlay over the hue. Its
/// count is the sessions running in it, a status of the project, so it stays
/// on the tile while the project is open. The mark is the switch that folds
/// the project's sessions, as a session's mark folds its delegates: under a
/// pointer on it the tile's face gives way to the chevron, turned down at the
/// rows while they are out; the row round it opens the project's page.
final class ProjectMarkView: UIView {
    private let face = UIView()
    private let overlay = CAGradientLayer()
    private let glyph = GlyphView(.folder, size: 12, tint: Palette.markGlyph)
    private let count = KitLabel(TypeScale.typeMeta.with(leading: 1), ink: Palette.markGlyph)
    private let chevron = GlyphView(.chevronBold, size: 12, tint: Palette.markGlyph)
    private let hit = ProjectMarkSwitch()
    private var running = 0
    private var open = false
    private var over = false
    /// The row's gap from the mark to its name: a finger's switch reaches that far sideways.
    private let gap: Double

    /// Opens and folds the project's sessions from the mark's own hit area.
    var onToggle: () -> Void = {}

    init(cwd: String, gap: Double) {
        self.gap = gap
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        face.translatesAutoresizingMaskIntoConstraints = false
        face.isUserInteractionEnabled = false
        face.layer.cornerRadius = Radius.radiusXs
        face.layer.cornerCurve = .continuous
        face.clipsToBounds = true
        face.layer.addSublayer(overlay)
        addSubview(face)
        count.textAlignment = .center
        count.tabular = true
        count.isHidden = true
        for part in [glyph, count, chevron] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
            face.addSubview(part)
            NSLayoutConstraint.activate([
                part.centerXAnchor.constraint(equalTo: face.centerXAnchor),
                part.centerYAnchor.constraint(equalTo: face.centerYAnchor),
            ])
        }
        chevron.alpha = 0
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 18),
            heightAnchor.constraint(equalToConstant: 18),
            face.leadingAnchor.constraint(equalTo: leadingAnchor),
            face.trailingAnchor.constraint(equalTo: trailingAnchor),
            face.topAnchor.constraint(equalTo: topAnchor),
            face.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        face.backgroundColor = Self.hue(cwd)
        hit.addAction(UIAction { [weak self] _ in self?.onToggle() }, for: .touchUpInside)
        for event in [UIControl.Event.touchDown, .touchDragEnter] {
            hit.addAction(UIAction { [weak self] _ in self?.press(true) }, for: event)
        }
        for event in [UIControl.Event.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit] {
            hit.addAction(UIAction { [weak self] _ in self?.press(false) }, for: event)
        }
        hit.addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        addSubview(hit)
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

    /// `running`: the sessions running in it; `open`: its sessions are out.
    /// `name`: the project's, for the switch's ("Show cockpit's sessions").
    func configure(count total: Int, open: Bool, name: String) {
        let turned = open != self.open || (total > 0) != (running > 0)
        running = total
        self.open = open
        count.text = total >= 100 ? "99" : "\(total)"
        hit.accessibilityLabel = "\(open ? "Hide" : "Show") \(name)'s sessions"
        hit.accessibilityValue = open ? "Expanded" : "Collapsed"
        swap(animated: turned && window != nil)
    }

    /// The switch, as an accessibility element of the block the row stands in.
    var switchElement: UIView { hit }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        overlay.frame = face.bounds
        CATransaction.commit()
        hit.frame = switchBox
    }

    /// The switch's area. Under a finger: the kit's touch target centred on
    /// the tile, sideways as far as the row's name (its gap from the mark),
    /// up and down as a session mark's. Under a pointer: the tile and the
    /// status dot's overhang round it, as a session mark's.
    private var switchBox: CGRect {
        let side = 18.0
        let box = CGRect(x: 0, y: 0, width: side, height: side)
        if traitCollection.userInterfaceIdiom == .mac {
            let reach = Size.statusDotSize / 2
            return box.insetBy(dx: -reach, dy: -reach)
        }
        return box.insetBy(dx: -gap, dy: -(44 - side) / 2)
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        switchBox.contains(point) || super.point(inside: point, with: event)
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let now = hover.state == .began || hover.state == .changed
        guard now != over else { return }
        over = now
        swap(animated: true)
    }

    /// The press: the tile gives a little under it.
    private func press(_ down: Bool) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let scale = down ? Motion.pressScale : 1
        Motion.easeOut.animator(Motion.durToggle) { [face] in
            face.transform = CGAffineTransform(scaleX: scale, y: scale)
        }.startAnimation()
    }

    /// What the tile shows at rest (the folder, or the running count, which
    /// stays while the sessions are out) and the chevron it gives way to
    /// under a pointer on the switch, turned down at the rows while they are out.
    private func swap(animated: Bool) {
        let rest: UIView = running > 0 ? count : glyph
        let away: UIView = running > 0 ? glyph : count
        away.isHidden = true
        rest.isHidden = false
        let turn = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        let small = CGAffineTransform(scaleX: 0.25, y: 0.25)
        let moves = !UIAccessibility.isReduceMotionEnabled
        let apply: @MainActor () -> Void = { [chevron, over] in
            rest.alpha = over ? 0 : 1
            rest.transform = over && moves ? small : .identity
            chevron.alpha = over ? 1 : 0
            chevron.transform = over || !moves ? turn : turn.concatenating(small)
        }
        if animated {
            Motion.easeOut.animator(Motion.durControl, animations: apply).startAnimation()
        } else {
            apply()
        }
    }

    /// mark.ts `markHue`: `(h * 31 + c) | 0` over the UTF-16 units, one of the eight mark hues.
    static func hue(_ seed: String) -> UIColor {
        var h: Int32 = 0
        for unit in seed.utf16 { h = h &* 31 &+ Int32(unit) }
        let hues = [Palette.mark1, Palette.mark2, Palette.mark3, Palette.mark4, Palette.mark5, Palette.mark6, Palette.mark7, Palette.mark8]
        return hues[Int(h.magnitude % 8)]
    }
}

/// A project mark's switch: a clear control over the tile, a button by role.
private final class ProjectMarkSwitch: UIControl {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectMarkSwitch is built in code")
    }
}

/// The app's own icon (Sidebar.svelte's `.brand-icon`): Caw on spark in the
/// 18pt lead tile, at `--radius-xs` beside the wordmark and round where he
/// stands in for the reader's picture, his edge drawn 1pt inside the tile in
/// `--image-outline`.
final class BrandMark: UIView {
    private let caw = UIImageView(image: CawCoBrand.icon)

    init(round: Bool = false) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.spark
        layer.cornerRadius = round ? 9 : Radius.radiusXs
        layer.cornerCurve = .circular
        layer.borderWidth = 1
        // He draws a little past his box; the tile keeps its shape.
        clipsToBounds = true
        caw.translatesAutoresizingMaskIntoConstraints = false
        caw.contentMode = .scaleAspectFill
        addSubview(caw)
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 18), heightAnchor.constraint(equalToConstant: 18),
                                     caw.leadingAnchor.constraint(equalTo: leadingAnchor), caw.trailingAnchor.constraint(equalTo: trailingAnchor),
                                     caw.topAnchor.constraint(equalTo: topAnchor), caw.bottomAnchor.constraint(equalTo: bottomAnchor)])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: BrandMark, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BrandMark is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.imageOutline.resolvedColor(with: traitCollection).cgColor
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

    /// time.ts `formatDistanceToNow`: "just now", then whole seconds, minutes,
    /// hours, days, weeks, months and years ago.
    static func ago(_ at: Double, now: Double) -> String {
        let seconds = Int(floor((now - at) / 1000))
        if seconds < 5 { return "just now" }
        if seconds < 60 { return "\(seconds)s ago" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }
        if days / 7 < 4 { return "\(days / 7)w ago" }
        if days / 30 < 12 { return "\(days / 30)mo ago" }
        return "\(days / 365)y ago"
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
    private let cover = CAShapeLayer()
    var marks: [CGRect] = []
    /// The rail's x in this view, how far above the list the parent's glyph
    /// foot is (`--nest-lead`), and each child's glyph centre and arm end.
    var railX = 0.0
    var lead = 0.0
    var children: [(glyphY: Double, armEnd: Double)] = [] { didSet { draw() } }
    var head = Double.infinity { didSet { cut() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        cover.fillColor = UIColor.black.cgColor
        layer.mask = cover
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
        let scale = traitCollection.displayScale
        let x = floor((railX - 0.5) * scale) / scale + 0.5
        let ink = Palette.nestInk.resolvedColor(with: traitCollection).cgColor
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (child, elbow) in zip(children, elbows) {
            let path = UIBezierPath()
            path.move(to: CGPoint(x: x, y: -lead))
            path.addLine(to: CGPoint(x: x, y: child.glyphY - r))
            path.addArc(withCenter: CGPoint(x: x + r, y: child.glyphY - r), radius: r, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
            path.addLine(to: CGPoint(x: child.armEnd, y: child.glyphY))
            elbow.frame = bounds
            elbow.path = path.cgPath
            elbow.strokeColor = ink
        }
        // The strokes sit over a row's pill, but under every moving mark.
        // Boolean subtraction preserves overlapping holes on the common trunk.
        let top = lead + Size.rowMarkBox
        cover.frame = CGRect(x: 0, y: -top, width: bounds.width, height: bounds.height + top)
        var visible = CGPath(rect: CGRect(origin: .zero, size: cover.bounds.size), transform: nil)
        for mark in marks {
            let hole = UIBezierPath(roundedRect: mark.offsetBy(dx: 0, dy: top), cornerRadius: Radius.radiusXs).cgPath
            visible = visible.subtracting(hole)
        }
        cover.path = visible
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
