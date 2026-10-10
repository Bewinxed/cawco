import CawCoDesign
import UIKit

/// A tab's options pulled down off the tab by a finger (PaneTabs.svelte
/// `pullMenu`): the same sections its long press's context menu shows
/// (`TabAction`), Close among them. They grow out of the tab itself, as one
/// shape (owner: "it needs to smoothly gooey morph options from the tab not
/// spawn a floating container"): the tab's outline stretches down from its
/// foot under the finger 1:1, a rounded body swelling out of it, at first
/// the width of the tab's flared foot and then widening into the options
/// panel, the two joined on each side by one smooth curve, the way a drop of
/// liquid joins what it hangs from. The shape is the tab's own surface, the
/// chosen tab's sheet, tab and options alike, so no seam runs along the
/// tab's foot; it lifts off the page by its border and its overlay shadow
/// over the first stretch of the pull, so the tab and the drop read as one
/// thing off the page from the start; the tab's title and rim stand on it
/// where they stood. Past fully out a third of the travel shows, no more
/// than a fifth of it.
///
/// Let go past `opens` (carried along its speed) and it settles open on the
/// house spring (`HouseSpring`); short of it, it folds back into the tab and
/// is gone. An option, a tap outside, a tap on the tab, a swipe up or Escape
/// folds it back. With less motion it fades in, open, anchored to the tab,
/// and fades out, with no morph.
///
/// One path on every system: the system's glass merging
/// (`UIGlassContainerEffect`, iOS 26 and later) joins glass elements only,
/// and the tab is the folder's card, not glass; the outline is drawn the
/// same on iOS 18.
final class TabOptionsSheet: UIView {
    /// How far a finger pulls before the options stay out, pt.
    static let opens = 24.0
    /// How far a release is carried along its speed, s (as the Caw drawer's).
    static let project = 0.099
    static let resist = 0.35
    static let resistMax = 0.2

    /// The options have gone, by an option, a tap outside, or a pull let go short.
    var onGone: () -> Void = {}

    private let shape = CAShapeLayer()
    private let shadow = PathShadow(Shadow.shadowOverlay)
    /// The options, laid out in the open panel, shown through the shape.
    private let body = UIView()
    private let bodyMask = CAShapeLayer()
    private let list: UIStackView
    private let tab: CGRect
    private let tabRadius: Double
    /// The tab's surface for the appearance it is drawn in, read again when
    /// that changes (light, dark, Increase Contrast).
    private weak var tabView: TabView?
    private var tabSurface: UIColor
    /// The open panel, under the tab's foot.
    private let panel: CGRect
    private var progress = 0.0
    private var spring: HouseSpring?
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private var gone = false
    /// VoiceOver has been moved to the open options.
    private var announced = false

    init(sections: [[TabAction]], under tabView: TabView, in host: UIView) {
        let box = tabView.convert(tabView.bounds, to: host)
        tab = box
        tabRadius = tabView.radius
        self.tabView = tabView
        tabSurface = tabView.surface
        let rows = UIStackView()
        rows.axis = .vertical
        for (index, section) in sections.enumerated() {
            if index > 0 { rows.addArrangedSubview(Self.separator()) }
            for action in section { rows.addArrangedSubview(Self.row(action)) }
        }
        list = rows
        let size = rows.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        let width = min(280, max(200, size.width + 12))
        // From the tab's leading edge, shifted left only when it would pass
        // the screen's edge less 12pt (the web's menu takes the same rule);
        // never narrower than the tab it grows out of.
        let margin = 12.0
        let x = max(margin, min(box.minX, host.bounds.width - width - margin))
        let left = min(x, box.minX)
        let right = max(x + width, box.maxX)
        panel = CGRect(x: left, y: box.maxY, width: right - left, height: size.height + 12)
        super.init(frame: host.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]

        layer.addSublayer(shadow.layer)
        shape.actions = ["path": NSNull(), "fillColor": NSNull(), "strokeColor": NSNull()]
        shape.lineWidth = 1
        layer.addSublayer(shape)
        bodyMask.actions = ["path": NSNull()]
        body.frame = panel
        body.layer.mask = bodyMask
        body.accessibilityViewIsModal = true
        addSubview(body)
        list.frame = CGRect(x: 6, y: 6, width: panel.width - 12, height: panel.height - 12)
        list.translatesAutoresizingMaskIntoConstraints = true
        body.addSubview(list)
        // The rows' frames, which each one's reveal is measured on.
        list.layoutIfNeeded()
        // The tab's title and rim, standing on the shape where they stood.
        if let head = tabView.contentSnapshot() {
            head.frame = tab
            head.isUserInteractionEnabled = false
            addSubview(head)
        }
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(swiped(_:))))
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitAccessibilityContrast.self]) { (sheet: TabOptionsSheet, _: UITraitCollection) in
            // A tab closed under the options keeps the surface it was last drawn in.
            if let tab = sheet.tabView { sheet.tabSurface = tab.surface }
            sheet.draw(sheet.progress)
        }
        host.addSubview(self)
        draw(0)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TabOptionsSheet is built in code")
    }

    private static func separator() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.translatesAutoresizingMaskIntoConstraints = false
        let wrap = UIView()
        wrap.addSubview(line)
        NSLayoutConstraint.activate([
            wrap.heightAnchor.constraint(equalToConstant: 13),
            line.heightAnchor.constraint(equalToConstant: 1),
            line.centerYAnchor.constraint(equalTo: wrap.centerYAnchor),
            line.leadingAnchor.constraint(equalTo: wrap.leadingAnchor, constant: 6),
            line.trailingAnchor.constraint(equalTo: wrap.trailingAnchor, constant: -6),
        ])
        return wrap
    }

    /// The sheet a row's action closes: set once the rows stand in it.
    private static func sheet(of view: UIView) -> TabOptionsSheet? {
        var node = view.superview
        while let current = node, !(current is TabOptionsSheet) { node = current.superview }
        return node as? TabOptionsSheet
    }

    /// An option, a kit menu item: 44pt, the label role in strong ink.
    private static func row(_ action: TabAction) -> UIView {
        var config = UIButton.Configuration.plain()
        config.title = action.title
        config.image = action.glyph?.image.resized(to: Size.iconMd)
        config.imagePadding = Space.space2
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var out = attributes
            out.font = TypeScale.typeLabel.font
            out.foregroundColor = action.disabled ? Palette.inkMuted : Palette.inkStrong
            return out
        }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3)
        config.background.cornerRadius = Radius.radiusSm
        let button = UIButton(configuration: config)
        button.contentHorizontalAlignment = .leading
        button.isEnabled = !action.disabled
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        button.addAction(UIAction { [weak button] _ in
            if let button { Self.sheet(of: button)?.dismiss() }
            action.run()
        }, for: .primaryActionTriggered)
        return button
    }

    // MARK: The shape

    private static func clamp01(_ t: Double) -> Double { min(1, max(0, t)) }
    private static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
    /// The house's in-out curve, as a function of its share of the way.
    private static func easeInOut(_ t: Double) -> Double { t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2 }
    /// The house's out curve (`ease-out`'s cubic).
    private static func easeOut(_ t: Double) -> Double { 1 - pow(1 - t, 3) }

    /// How far the body has come out of the tab's foot at `at` (0 in it, 1
    /// open, past 1 stretched); how far it has widened (0 the tab's foot, 1
    /// the panel); how far it has settled into its open shape (0 a drop, 1
    /// the folder's); and how far it has lifted off the page (its border and
    /// shadow).
    private func reach(_ at: Double) -> (travel: Double, widen: Double, settled: Double, lift: Double) {
        let q = max(0, at)
        let height = panel.height
        let travel = min(q, 1) * height + min(max(0, q - 1) * height * Self.resist, height * Self.resistMax)
        return (
            travel,
            Self.easeInOut(Self.clamp01((travel - height * Self.neckShare) / (height * Self.widenShare))),
            Self.easeInOut(Self.clamp01(travel / height)),
            Self.easeOut(Self.clamp01(travel / (height * Self.liftShare)))
        )
    }

    /// The body hangs from the tab at its foot's width for this share of the
    /// travel, so it reads as the tab stretching from the first frame, not a
    /// card under it; then it widens to the panel over the next `widenShare`.
    static let neckShare = 0.2
    static let widenShare = 0.55
    /// The share of the travel over which the shape lifts off the page, its
    /// border and shadow coming in: the chosen tab is the page's own surface,
    /// so the drop shows by its edge from the first stretch.
    static let liftShare = 0.15

    /// The one outline at `at`: the tab's shoulders and sides, each side
    /// running on into the body's, and the body's rounded foot. Each join is
    /// a concave fillet off the tab's side, a run along its foot, and a
    /// convex corner down into the body's side; where the body stands no
    /// further out than the tab, all three are nothing and the side runs
    /// straight down. It starts as the chosen tab's own foot, flared by
    /// `radiusLg` each side (its sheet's), so the first frame is the tab as
    /// it stood; the body hangs at that width (`neckShare`), a drop with its
    /// foot round and its joins long, then widens to the panel. As it opens
    /// it settles into the folder's own shape, the tab standing on the
    /// panel: each fillet the tab's flare, the panel's corners `radiusLg`.
    func outline(_ at: Double) -> CGPath {
        let (travel, widen, settled, _) = reach(at)
        let flare = Radius.radiusLg
        let left = Self.lerp(tab.minX - flare, panel.minX, widen)
        let right = Self.lerp(tab.maxX + flare, panel.maxX, widen)
        let foot = tab.maxY
        let bottom = foot + travel
        let r = min(tabRadius, tab.width / 2, tab.height / 2)
        let half = (right - left) / 2
        let rb = Self.lerp(min(half, travel / 2, 2 * Radius.radiusLg), min(Radius.radiusLg, half, travel / 2), settled)
        let side = tab.height - r
        let k = 0.5523 // a quarter circle's control length, of its radius
        // One join, for a body standing `out` past the tab: its fillet, `up`
        // the tab's side and `across` out along the foot, and its corner,
        // `across` in along the foot and `down` the body's side. Across, each
        // takes at most half of `out`; up and down, each its own length, the
        // fillet under the tab's shoulder, the corner above the body's foot
        // corner. Open, both are the folder's quarter circles with a run
        // along the foot between them. While the body stands only a little
        // past the tab, as its foot's flare, there is no run, and the two
        // meet on the slope of the whole join (`ux`, `uy`, the way down at
        // their meeting): one long soft S, a neck, not a step that turns flat
        // at the foot and down again. The slope eases to flat by the time a
        // run opens, so the join never kinks. `fillet` and `turn` are the
        // two curves' control lengths along that way, each kept inside its
        // curve's box so neither bulges past it.
        func join(_ out: Double) -> (up: Double, across: Double, down: Double, ux: Double, uy: Double, fillet: Double, turn: Double) {
            let full = Self.lerp(2 * Radius.radiusLg, Radius.radiusLg, settled)
            let up = min(Self.lerp(min(2 * Radius.radiusLg, side), Radius.radiusLg, settled), side, travel / 2)
            let across = min(full, out / 2)
            let down = min(full, max(0, travel - rb))
            let slope = Self.clamp01((full - out / 2) / Radius.radiusLg) * (up + down) / max(out, 1)
            let length = (1 + slope * slope).squareRoot()
            let ux = 1 / length
            let uy = slope / length
            func control(_ run: Double, _ drop: Double) -> Double {
                min(k * (run * ux + drop * uy), run / ux, uy > 0 ? drop * (1 - k) / uy : .infinity)
            }
            return (up, across, down, ux, uy, control(across, up), control(across, down))
        }
        let joinL = join(tab.minX - left)
        let joinR = join(right - tab.maxX)
        let path = UIBezierPath()
        path.move(to: CGPoint(x: tab.minX, y: tab.minY + r))
        path.addArc(withCenter: CGPoint(x: tab.minX + r, y: tab.minY + r), radius: r, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
        path.addLine(to: CGPoint(x: tab.maxX - r, y: tab.minY))
        path.addArc(withCenter: CGPoint(x: tab.maxX - r, y: tab.minY + r), radius: r, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
        // The right join: fillet, run, corner.
        let filletR = CGPoint(x: tab.maxX + joinR.across, y: foot)
        path.addLine(to: CGPoint(x: tab.maxX, y: foot - joinR.up))
        path.addCurve(
            to: filletR,
            controlPoint1: CGPoint(x: tab.maxX, y: foot - joinR.up * (1 - k)),
            controlPoint2: CGPoint(x: filletR.x - joinR.fillet * joinR.ux, y: foot - joinR.fillet * joinR.uy)
        )
        let cornerR = CGPoint(x: right - joinR.across, y: foot)
        path.addLine(to: cornerR)
        path.addCurve(
            to: CGPoint(x: right, y: foot + joinR.down),
            controlPoint1: CGPoint(x: cornerR.x + joinR.turn * joinR.ux, y: foot + joinR.turn * joinR.uy),
            controlPoint2: CGPoint(x: right, y: foot + joinR.down * (1 - k))
        )
        path.addLine(to: CGPoint(x: right, y: bottom - rb))
        path.addArc(withCenter: CGPoint(x: right - rb, y: bottom - rb), radius: rb, startAngle: 0, endAngle: .pi / 2, clockwise: true)
        path.addLine(to: CGPoint(x: left + rb, y: bottom))
        path.addArc(withCenter: CGPoint(x: left + rb, y: bottom - rb), radius: rb, startAngle: .pi / 2, endAngle: .pi, clockwise: true)
        // The left join, back up: corner, run, fillet.
        let cornerL = CGPoint(x: left + joinL.across, y: foot)
        path.addLine(to: CGPoint(x: left, y: foot + joinL.down))
        path.addCurve(
            to: cornerL,
            controlPoint1: CGPoint(x: left, y: foot + joinL.down * (1 - k)),
            controlPoint2: CGPoint(x: cornerL.x - joinL.turn * joinL.ux, y: foot + joinL.turn * joinL.uy)
        )
        let filletL = CGPoint(x: tab.minX - joinL.across, y: foot)
        path.addLine(to: filletL)
        path.addCurve(
            to: CGPoint(x: tab.minX, y: foot - joinL.up),
            controlPoint1: CGPoint(x: filletL.x + joinL.fillet * joinL.ux, y: foot - joinL.fillet * joinL.uy),
            controlPoint2: CGPoint(x: tab.minX, y: foot - joinL.up * (1 - k))
        )
        path.close()
        return path.cgPath
    }

    /// Draws the options `at` of the way out of the tab: 0 in it, 1 open.
    private func draw(_ at: Double) {
        progress = at
        let traits = traitCollection
        let path = outline(at)
        let (travel, widen, _, lift) = reach(at)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        shape.frame = bounds
        shape.path = path
        shape.fillColor = tabSurface.cgColor
        shape.strokeColor = Palette.borderControl.resolvedColor(with: traits).withAlphaComponent(lift).cgColor
        shadow.paint(traits)
        shadow.update(path, in: bounds)
        shadow.layer.opacity = Float(lift)
        bodyMask.frame = body.bounds
        var toBody = CGAffineTransform(translationX: -panel.minX, y: -panel.minY)
        bodyMask.path = path.copy(using: &toBody)
        reveal(travel: travel, widen: widen)
        CATransaction.commit()
    }

    /// Each option shows only while the shape has uncovered its words, so no
    /// line is ever read cut through by the shape's edge, and no option goes
    /// while they are still uncovered, which would leave an empty band under
    /// the last one: it comes in over the 8pt after the foot passes the
    /// bottom of its words (a row's 20pt band of ink round its middle; a
    /// separator's line), and once the body stands at nearly its full width.
    /// Going back into the tab, the same in reverse.
    private func reveal(travel: Double, widen: Double) {
        let across = Self.clamp01((widen - 0.75) / 0.25)
        for row in list.arrangedSubviews {
            // The body's top is the tab's foot, where the travel is measured from.
            let ink = list.frame.minY + row.frame.midY + min(row.frame.height / 2, 10)
            row.alpha = min(across, Self.clamp01((travel - ink) / 8))
        }
    }

    // MARK: The finger

    /// The finger's travel down from where it pressed.
    func pull(_ dy: Double) {
        stopSettle()
        guard !UIAccessibility.isReduceMotionEnabled else {
            if dy >= Self.opens, progress < 1 { fadeOpen() }
            return
        }
        draw(dy / panel.height)
    }

    /// Let go, at `velocity` pt/s down: open if it was heading past `opens`.
    func release(_ dy: Double, velocity: Double) {
        if UIAccessibility.isReduceMotionEnabled {
            if progress < 1 { finish() }
            return
        }
        if dy + velocity * Self.project >= Self.opens {
            settle(to: 1, velocity: velocity)
        } else {
            settle(to: 0, velocity: velocity)
        }
    }

    /// A swipe up on the open options takes them back into the tab under the
    /// finger; let go, they fold away or settle open on where it was heading.
    @objc private func swiped(_ pan: UIPanGestureRecognizer) {
        let dy = pan.translation(in: self).y
        switch pan.state {
        case .began, .changed:
            stopSettle()
            draw(1 + dy / panel.height)
        case .ended:
            let v = pan.velocity(in: self).y
            settle(to: dy + v * Self.project <= -Self.opens ? 0 : 1, velocity: v)
        case .cancelled, .failed:
            settle(to: 1, velocity: 0)
        default:
            break
        }
    }

    /// The swipe up only takes the options once they are open and the
    /// finger heads mostly up.
    override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let pan = gesture as? UIPanGestureRecognizer, pan.view === self else { return super.gestureRecognizerShouldBegin(gesture) }
        let v = pan.velocity(in: self)
        return !UIAccessibility.isReduceMotionEnabled && progress >= 0.99 && v.y < 0 && abs(v.y) > abs(v.x)
    }

    /// Folds back into the tab, then gone; with less motion it fades out.
    func dismiss() {
        guard !gone else { return }
        if window == nil {
            finish()
        } else if UIAccessibility.isReduceMotionEnabled {
            let fade = Motion.easeOut.animator(Motion.durFade) { self.alpha = 0 }
            fade.addCompletion { [weak self] _ in self?.finish() }
            fade.startAnimation()
        } else {
            settle(to: 0, velocity: 0)
        }
    }

    /// With less motion: the open options fade in where they open.
    private func fadeOpen() {
        draw(1)
        alpha = 0
        Motion.easeOut.animator(Motion.durFade) { self.alpha = 1 }.startAnimation()
        UIAccessibility.post(notification: .screenChanged, argument: list.arrangedSubviews.first)
    }

    // MARK: Settle

    /// On the house spring from where it is drawn to `target` (0 in the tab,
    /// 1 open), leaving at `velocity` pt/s.
    private func settle(to target: Double, velocity: Double) {
        stopSettle()
        let height = panel.height
        spring = HouseSpring(x: (progress - target) * height, v: velocity, target: target)
        last = CACurrentMediaTime()
        let made = CADisplayLink(target: self, selector: #selector(tick(_:)))
        made.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        made.add(to: .main, forMode: .common)
        link = made
    }

    private func stopSettle() {
        link?.invalidate()
        link = nil
        spring = nil
    }

    @objc private func tick(_ link: CADisplayLink) {
        guard var moving = spring else { return stopSettle() }
        let now = link.timestamp
        let done = moving.step(now - last)
        last = now
        spring = moving
        draw(moving.target + moving.x / panel.height)
        guard done else { return }
        let target = moving.target
        draw(target)
        stopSettle()
        if target == 0 {
            finish()
        } else if !announced {
            // VoiceOver moves to the options once they stand open: before
            // that, the first row may not be uncovered yet.
            announced = true
            UIAccessibility.post(notification: .screenChanged, argument: list.arrangedSubviews.first)
        }
    }

    private func finish() {
        guard !gone else { return }
        gone = true
        stopSettle()
        removeFromSuperview()
        onGone()
    }

    /// A tap in the panel is its options'; anywhere else, the tab's head
    /// included, folds them back.
    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        let point = tap.location(in: self)
        let inPanel = point.y > tab.maxY && UIBezierPath(cgPath: outline(progress)).contains(point)
        if !inPanel { dismiss() }
    }

    override func accessibilityPerformEscape() -> Bool {
        dismiss()
        return true
    }
}
