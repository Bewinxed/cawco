import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

// Caw's head in the top bar (NeedsCaw.svelte): the way into what needs the
// operator, and the drawer it pulls down.

// MARK: Head

/// His compacted head (assets/mascot/README.md, `compacted`: a head that
/// fills its box, built for 18 pt) on a glass capsule (`GlassCapsule`), or
/// on the bar's glass group where he shares one. What waits is arcs on his
/// circle's rim, one for each, closing whole past nine; no digit is drawn on
/// him. When something new arrives he plays his needs-you beat once
/// (`CawBeat`; his guide: "a gentle beat… never a hello") and holds still
/// again; with less motion only the arcs change. A tap or a drag down from
/// him moves the drawer (`NeedsDrawer`), which the shell owns.
final class NeedsCawButton: UIControl {
    /// His head's side, pt.
    static let head = 22.0
    /// The beat's box: his head and raised wing (tab-icon-shots `NEEDS_YOU`).
    static let beatBox = 32.0
    /// The capsule's side on a phone; in the wide bar's group the group's height rules.
    static let side = 36.0

    var onTap: () -> Void = {}
    var onPan: (UIPanGestureRecognizer) -> Void = { _ in }

    private let capsule: GlassCapsule?
    private let face = CawMark(status: .compacted, side: NeedsCawButton.head)
    private let beatView = UIImageView()
    /// What waits, on his circle's rim (NeedsCaw.svelte, The count): an arc
    /// for each, `arc`° long with `arcGap`° between, from 12 o'clock
    /// clockwise; past `arcs` of them the ring closes whole. No digit is
    /// drawn on him: the number is in his VoiceOver label and the drawer.
    static let arc = 30.0
    static let arcGap = 8.0
    static let arcs = 9
    /// One layer per arc and one for the closed ring, each drawn along itself.
    private let arcLayers = (0 ..< NeedsCawButton.arcs).map { _ in CAShapeLayer() }
    private let wholeRing = CAShapeLayer()
    private(set) var count = 0
    private var beating = false

    init(ownGlass: Bool) {
        capsule = ownGlass ? GlassCapsule() : nil
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        if let capsule {
            capsule.isUserInteractionEnabled = false
            addSubview(capsule)
            NSLayoutConstraint.activate([
                capsule.leadingAnchor.constraint(equalTo: leadingAnchor),
                capsule.trailingAnchor.constraint(equalTo: trailingAnchor),
                capsule.topAnchor.constraint(equalTo: topAnchor),
                capsule.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        }
        for part in [face, beatView] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
            part.isUserInteractionEnabled = false
            addSubview(part)
        }
        beatView.alpha = 0
        beatView.contentMode = .scaleAspectFit
        for ring in arcLayers + [wholeRing] {
            ring.fillColor = nil
            ring.lineWidth = Size.cCawRing
            ring.lineCap = .round
            ring.strokeEnd = 0
            layer.addSublayer(ring)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: NeedsCawButton, _: UITraitCollection) in
            button.inkRing()
        }
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Self.side),
            heightAnchor.constraint(equalToConstant: Self.side),
            // His head's circle at the centre, not his box (`CawMark.headCentre`).
            face.centerXAnchor.constraint(equalTo: centerXAnchor, constant: (0.5 - CawMark.headCentre.x) * Self.head),
            face.centerYAnchor.constraint(equalTo: centerYAnchor, constant: (0.5 - CawMark.headCentre.y) * Self.head),
            face.widthAnchor.constraint(equalToConstant: Self.head),
            face.heightAnchor.constraint(equalToConstant: Self.head),
            beatView.centerXAnchor.constraint(equalTo: centerXAnchor),
            beatView.centerYAnchor.constraint(equalTo: centerYAnchor),
            beatView.widthAnchor.constraint(equalToConstant: Self.beatBox),
            beatView.heightAnchor.constraint(equalToConstant: Self.beatBox),
        ])
        inkRing()
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = "All caught up"
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        addGestureRecognizer(pan)
        addInteraction(UIPointerInteraction(delegate: self))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedsCawButton is built in code")
    }

    @objc private func tapped() { onTap() }
    @objc private func panned(_ pan: UIPanGestureRecognizer) { onPan(pan) }

    /// The arcs on his circle's rim: inside the glass's 1 pt edge, half the
    /// stroke in; arc k from k × (arc + arcGap)° clockwise from 12 o'clock.
    override func layoutSubviews() {
        super.layoutSubviews()
        let centre = CGPoint(x: bounds.midX, y: bounds.midY)
        let rim = CGFloat(Self.side) / 2 - 1 - Size.cCawRing / 2
        let top = -CGFloat.pi / 2
        let degree = CGFloat.pi / 180
        // A round cap reaches half the stroke past the path's end: taken off
        // each end, so the arc as seen is `arc`° and the gaps `arcGap`°.
        let cap = Size.cCawRing / 2 / rim
        for (k, ring) in arcLayers.enumerated() {
            let from = top + CGFloat(k) * CGFloat(Self.arc + Self.arcGap) * degree
            ring.path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: from + cap, endAngle: from + CGFloat(Self.arc) * degree - cap, clockwise: true).cgPath
        }
        wholeRing.path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: top, endAngle: top + 2 * .pi, clockwise: true).cgPath
    }

    /// The arcs take the scheme's attention ink.
    private func inkRing() {
        let ink = Palette.statusAttnGlyph.resolvedColor(with: traitCollection).cgColor
        for ring in arcLayers + [wholeRing] {
            ring.strokeColor = ink
        }
    }

    /// An arc drawn in, or retracted, along its own length over `durPanel` on
    /// the out curve; with less motion it fades instead.
    private func show(_ ring: CAShapeLayer, _ on: Bool, animated: Bool) {
        let target: CGFloat = on ? 1 : 0
        let fade = UIAccessibility.isReduceMotionEnabled
        let key = fade ? "opacity" : "strokeEnd"
        let now = fade ? CGFloat(ring.presentation()?.opacity ?? ring.opacity) : (ring.presentation()?.strokeEnd ?? ring.strokeEnd)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        ring.opacity = fade ? Float(target) : 1
        ring.strokeEnd = fade ? 1 : target
        CATransaction.commit()
        guard animated, now != target else { return }
        let move = CABasicAnimation(keyPath: key)
        move.fromValue = now
        move.toValue = target
        move.duration = Motion.durPanel
        move.timingFunction = Motion.easeOut.function
        ring.add(move, forKey: key)
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            let scale = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) { self.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
        }
    }

    /// The Needs you count, and the drawer's state for VoiceOver.
    func configure(count next: Int, open: Bool) {
        count = next
        accessibilityLabel = next > 0 ? "Needs you, \(next)" : "All caught up"
        accessibilityValue = open ? "Open" : nil
        let animated = window != nil
        for (k, ring) in arcLayers.enumerated() {
            show(ring, next > k, animated: animated)
        }
        show(wholeRing, next > Self.arcs, animated: animated)
    }

    /// His needs-you beat, once; nothing with less motion.
    func beat() {
        guard !beating, !UIAccessibility.isReduceMotionEnabled, window != nil else { return }
        beating = true
        let dark = traitCollection.userInterfaceStyle == .dark
        beatView.animationImages = CawBeat.drawings(dark: dark)
        beatView.animationDuration = CawBeat.duration(dark: dark)
        beatView.animationRepeatCount = 1
        beatView.image = beatView.animationImages?.first
        beatView.alpha = 1
        face.alpha = 0
        beatView.startAnimating()
        DispatchQueue.main.asyncAfter(deadline: .now() + CawBeat.duration(dark: dark)) { [weak self] in
            guard let self else { return }
            beatView.stopAnimating()
            beating = false
            Motion.easeOut.animator(Motion.durFade) {
                self.beatView.alpha = 0
                self.face.alpha = 1
            }.startAnimation()
        }
    }
}

extension NeedsCawButton: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .roundedRect(bounds, radius: bounds.height / 2))
    }
}

// MARK: Drawer

/// What needs the operator, pulled down from Caw (NeedsCaw.svelte's drawer).
/// Dragged, its body grows out from under his capsule 1:1 with the finger,
/// joined to it by a neck that thins as the two part and snaps once they are
/// a gap apart (a metaball's join); let go, it opens or closes on where the
/// finger was heading (its position carried along its speed) and settles on
/// the house spring (`durSettle`, no bounce, the one `HouseSheet` and the
/// deck settle on), sampled each frame so a finger can take it again
/// mid-flight. Inside, the home's Needs you rows, longest wait first; a row
/// closes the drawer and opens what it asks for. A drag up, a tap outside
/// or a row closes it. With less motion it opens and closes in place.
final class NeedsDrawer: UIView {
    /// Where the open drawer stands under the capsule, pt.
    static let gap = 8.0
    /// The finger's travel by which the neck has thinned to nothing and snapped.
    static let snap = 56.0
    /// The travel over which the body widens from the capsule to its own width.
    static let widen = 160.0
    /// How far a release is carried along its speed when deciding where it
    /// was going: the projection of a deceleration of 0.99 a millisecond.
    static let project = 0.099
    /// Past fully open, a third of the travel shows, and no more than a fifth.
    static let resist = 0.35
    static let resistMax = 0.2

    /// A row chosen: the drawer has begun to close.
    var onChoose: (HomeModel.NeedsItem) -> Void = { _ in }
    /// The drawer's state changed: the head says so.
    var onOpenChange: (Bool) -> Void = { _ in }

    private(set) var open = false
    private var progress = 0.0
    private weak var source: UIView?
    private let scrim = UIView()
    private let neck = CAShapeLayer()
    private let holder = UIView()
    private let body = UIView()
    private let inner = UIStackView()
    private let rows = UIStackView()
    private let scroll = UIScrollView()
    private let head = UIView()
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let countLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let empty = UIStackView()
    private let handle = UIView()
    /// The rows' scroller is as tall as its rows, up to what the screen leaves (`measure`).
    private var scrollHeight: NSLayoutConstraint!
    private var items: [HomeModel.NeedsItem] = []
    private var now = 0.0

    private struct Geometry {
        var cap: CGRect
        var left: Double
        var width: Double
        /// The full travel: the gap, then the content.
        var travel: Double
    }

    private var geo: Geometry?

    init() {
        super.init(frame: .zero)
        isHidden = true
        scrim.backgroundColor = Palette.surfaceRecess.withAlphaComponent(0.4)
        scrim.alpha = 0
        scrim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(scrimTapped)))
        addSubview(scrim)
        neck.fillColor = Palette.surfaceRaised.cgColor
        layer.addSublayer(neck)
        holder.boxShadow = Shadow.shadowOverlay
        addSubview(holder)
        body.backgroundColor = Palette.surfaceRaised
        body.clipsToBounds = true
        body.layer.cornerCurve = .continuous
        holder.addSubview(body)
        build()
        body.accessibilityViewIsModal = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (drawer: NeedsDrawer, _: UITraitCollection) in
            drawer.neck.fillColor = Palette.surfaceRaised.resolvedColor(with: drawer.traitCollection).cgColor
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedsDrawer is built in code")
    }

    private func build() {
        inner.axis = .vertical
        inner.translatesAutoresizingMaskIntoConstraints = true
        body.addSubview(inner)
        titleLabel.text = "Needs you"
        countLabel.tabular = true
        let headRow = UIStackView(arrangedSubviews: [titleLabel, countLabel, UIView()])
        headRow.spacing = Space.space2
        headRow.alignment = .firstBaseline
        headRow.isLayoutMarginsRelativeArrangement = true
        headRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space4, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        head.addSubview(headRow)
        headRow.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            headRow.leadingAnchor.constraint(equalTo: head.leadingAnchor),
            headRow.trailingAnchor.constraint(equalTo: head.trailingAnchor),
            headRow.topAnchor.constraint(equalTo: head.topAnchor),
            headRow.bottomAnchor.constraint(equalTo: head.bottomAnchor),
        ])
        head.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drawerPanned(_:))))
        rows.axis = .vertical
        rows.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(rows)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scrollHeight = scroll.heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            scrollHeight,
            rows.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space2),
            rows.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Space.space2),
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            rows.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * Space.space2),
        ])
        let resting = CawMark(status: .ready, side: 48)
        let emptyLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        emptyLabel.text = "All caught up"
        empty.axis = .vertical
        empty.alignment = .center
        empty.spacing = Space.space2
        empty.addArrangedSubview(resting)
        empty.addArrangedSubview(emptyLabel)
        empty.isLayoutMarginsRelativeArrangement = true
        empty.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space6, leading: 0, bottom: Space.space2, trailing: 0)
        empty.isAccessibilityElement = true
        empty.accessibilityLabel = "All caught up"
        empty.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drawerPanned(_:))))
        // The grabber at the drawer's foot: pulled up, the drawer goes back.
        let bar = UIView()
        bar.backgroundColor = Palette.borderControl
        bar.layer.cornerRadius = 2
        bar.translatesAutoresizingMaskIntoConstraints = false
        handle.addSubview(bar)
        NSLayoutConstraint.activate([
            handle.heightAnchor.constraint(equalToConstant: 24),
            bar.widthAnchor.constraint(equalToConstant: 36),
            bar.heightAnchor.constraint(equalToConstant: 4),
            bar.centerXAnchor.constraint(equalTo: handle.centerXAnchor),
            bar.centerYAnchor.constraint(equalTo: handle.centerYAnchor),
        ])
        handle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drawerPanned(_:))))
        for part in [head, scroll, empty, handle] { inner.addArrangedSubview(part) }
    }

    /// What the rows said last: they are made again only when that changes.
    private var drawn = ""

    /// The rows, as Home's Needs you lists them.
    func configure(_ next: [HomeModel.NeedsItem], now: Double) {
        let words = next.map { item in "\(item.id) \(item.title) \(item.raisedAt.map { Naming.span(ms: now - $0) } ?? "")" }.joined(separator: "\n")
        guard words != drawn else { return }
        drawn = words
        items = next
        self.now = now
        countLabel.text = "\(next.count)"
        head.isHidden = next.isEmpty
        scroll.isHidden = next.isEmpty
        empty.isHidden = !next.isEmpty
        for view in rows.arrangedSubviews { view.removeFromSuperview() }
        for item in next { rows.addArrangedSubview(row(for: item)) }
        if open, springing == nil {
            DispatchQueue.main.async { [weak self] in
                guard let self, open else { return }
                geo = measure()
                paint(1)
            }
        }
    }

    private func row(for item: HomeModel.NeedsItem) -> UIView {
        let kind = if case let .ask(ask) = item.kind, !ask.isQuestion { "Permission" } else { "Question" }
        let meta = item.raisedAt.map { "\(kind) · waiting \(Naming.span(ms: now - $0))" } ?? kind
        let button = UIButton(type: .custom)
        var config = UIButton.Configuration.plain()
        config.title = item.title
        config.subtitle = meta
        config.titleLineBreakMode = .byTruncatingTail
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var out = attributes
            out.font = TypeScale.typeLabel.font
            out.foregroundColor = Palette.inkStrong
            return out
        }
        config.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var out = attributes
            out.font = TypeScale.typeMeta.font
            out.foregroundColor = Palette.inkMuted
            return out
        }
        config.titleAlignment = .leading
        config.contentInsets = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
        config.background.cornerRadius = Radius.radiusSm
        button.configuration = config
        button.contentHorizontalAlignment = .leading
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.accessibilityLabel = "\(item.title), \(meta)"
        button.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            close()
            onChoose(item)
        }, for: .primaryActionTriggered)
        return button
    }

    // MARK: Geometry

    private func measure() -> Geometry? {
        guard let source, source.window != nil else { return nil }
        let cap = source.convert(source.bounds, to: self)
        let phone = traitCollection.horizontalSizeClass == .compact
        let width = phone ? bounds.width - 16 : 380
        let left = phone ? 8 : max(8, cap.maxX - width)
        inner.frame.size.width = width
        let room = bounds.height - safeAreaInsets.bottom - cap.maxY - 16
        // The rows as tall as they are, within what the rest leaves of the room.
        let rowsHeight = rows.systemLayoutSizeFitting(
            CGSize(width: width - 2 * Space.space2, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        ).height
        scrollHeight.constant = 0
        let rest = inner.systemLayoutSizeFitting(
            CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        ).height
        scrollHeight.constant = scroll.isHidden ? 0 : max(0, min(rowsHeight, min(room - Self.gap, 560) - rest))
        let content = min(rest + scrollHeight.constant, room - Self.gap, 560)
        inner.frame = CGRect(x: 0, y: 0, width: width, height: content)
        return Geometry(cap: cap, left: left, width: width, travel: content + Self.gap)
    }

    private static func clamp01(_ t: Double) -> Double { min(1, max(0, t)) }
    private static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
    /// The house's in-out curve, as a function of its share of the way.
    private static func easeInOut(_ t: Double) -> Double { t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2 }

    /// Draws the drawer at `at` of its travel: body, neck, content and scrim.
    private func paint(_ at: Double) {
        progress = at
        guard let g = geo else { return }
        let q = max(0, at)
        let over = max(0, q - 1)
        let travel = min(q, 1) * g.travel + min(over * g.travel * Self.resist, g.travel * Self.resistMax)
        let widen = Self.easeInOut(Self.clamp01(travel / min(Self.widen, g.travel * 0.8)))
        let left = Self.lerp(g.cap.minX, g.left, widen)
        let right = Self.lerp(g.cap.maxX, g.left + g.width, widen)
        let snapAt = min(Self.snap, g.travel * 0.4)
        let gap = Self.gap * Self.clamp01(travel / snapAt)
        let top = g.cap.maxY + gap
        let h = max(0, travel - gap)
        let w = right - left
        let r = min(Radius.radiusLg, h / 2, w / 2)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        holder.frame = CGRect(x: left, y: top, width: w, height: h)
        holder.layer.cornerRadius = r
        body.frame = holder.bounds
        body.layer.cornerRadius = r
        inner.frame.origin = CGPoint(x: g.left - left, y: 0)
        inner.alpha = Self.clamp01((q - 0.3) / 0.4)
        scrim.alpha = Self.clamp01(q)
        neck.path = neckPath(g, travel: travel, snapAt: snapAt, left: left, right: right, top: top, h: h, r: r)
        CATransaction.commit()
        isHidden = q <= 0.001
    }

    /// The join between the capsule and the body until they are a gap apart:
    /// from a chord across the capsule's foot down to one across the body's
    /// head under him, pinched to a waist that thins to nothing, then gone.
    private func neckPath(_ g: Geometry, travel: Double, snapAt: Double, left: Double, right: Double, top: Double, h: Double, r: Double) -> CGPath? {
        let t = travel / snapAt
        guard travel > 0.5, t < 1, h > 0 else { return nil }
        let capW = g.cap.width
        let capX = g.cap.midX
        let a = capW * 0.36
        let b = min((right - left) / 2, a * 1.4)
        let x = min(max(capX, left + r + b), right - r - b)
        let waist = a * pow(1 - t, 1.6)
        let y1 = g.cap.maxY - capW * 0.12
        let y2 = top + min(h, 10)
        let ym = (y1 + y2) / 2
        let xm = (capX + x) / 2
        let d1 = (ym - y1) / 2
        let d2 = (y2 - ym) / 2
        let path = UIBezierPath()
        path.move(to: CGPoint(x: capX - a, y: y1))
        path.addCurve(to: CGPoint(x: xm - waist, y: ym), controlPoint1: CGPoint(x: capX - a, y: y1 + d1), controlPoint2: CGPoint(x: xm - waist, y: ym - d1))
        path.addCurve(to: CGPoint(x: x - b, y: y2), controlPoint1: CGPoint(x: xm - waist, y: ym + d2), controlPoint2: CGPoint(x: x - b, y: y2 - d2))
        path.addLine(to: CGPoint(x: x + b, y: y2))
        path.addCurve(to: CGPoint(x: xm + waist, y: ym), controlPoint1: CGPoint(x: x + b, y: y2 - d2), controlPoint2: CGPoint(x: xm + waist, y: ym + d2))
        path.addCurve(to: CGPoint(x: capX + a, y: y1), controlPoint1: CGPoint(x: xm + waist, y: ym - d1), controlPoint2: CGPoint(x: capX + a, y: y1 + d1))
        path.close()
        return path.cgPath
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        scrim.frame = bounds
        neck.frame = bounds
    }

    /// Only the shown drawer takes touches; folded away, the page is under the finger.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !isHidden else { return nil }
        return super.hitTest(point, with: event)
    }

    // MARK: Settle

    /// The spring the house settles a hand-driven surface on (`durSettle`, no bounce).
    private struct Spring {
        var x: Double
        var v: Double
        let target: Double
        static let stiffness = pow(2 * .pi / Motion.durSettle, 2)
        static let damping = 4 * .pi / Motion.durSettle

        mutating func step(_ dt: Double) -> Bool {
            var left = dt
            while left > 0 {
                let h = min(left, 1.0 / 240)
                let a = -Self.stiffness * x - Self.damping * v
                v += a * h
                x += v * h
                left -= h
            }
            return abs(x) < 0.5 && abs(v) < 20
        }
    }

    private var springing: Spring?
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0

    private func stopSettle() {
        link?.invalidate()
        link = nil
        springing = nil
    }

    /// From where it is drawn to `target` (0 shut, 1 open), at `velocity` (travel a second, in shares).
    private func settle(to target: Double, velocity: Double) {
        stopSettle()
        guard let g = geo else { return }
        guard !UIAccessibility.isReduceMotionEnabled else {
            paint(target)
            finished(target)
            return
        }
        springing = Spring(x: (progress - target) * g.travel, v: velocity * g.travel, target: target)
        last = CACurrentMediaTime()
        let made = CADisplayLink(target: self, selector: #selector(tick(_:)))
        made.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        made.add(to: .main, forMode: .common)
        link = made
    }

    @objc private func tick(_ link: CADisplayLink) {
        guard var spring = springing, let g = geo else { return stopSettle() }
        let now = link.timestamp
        let done = spring.step(now - last)
        last = now
        springing = spring
        paint(spring.target + spring.x / g.travel)
        if done {
            let target = spring.target
            paint(target)
            stopSettle()
            finished(target)
        }
    }

    private func finished(_ at: Double) {
        if at == 0 {
            isHidden = true
            return
        }
        UIAccessibility.post(notification: .screenChanged, argument: items.isEmpty ? empty : rows.arrangedSubviews.first)
    }

    // MARK: Open and close

    /// Opens from Caw's capsule, `source`.
    func show(from source: UIView, velocity: Double = 0) {
        self.source = source
        superview?.bringSubviewToFront(self)
        if geo == nil || progress <= 0.001 { geo = measure() }
        setOpen(true)
        settle(to: 1, velocity: velocity)
    }

    func close(velocity: Double = 0) {
        setOpen(false)
        settle(to: 0, velocity: velocity)
    }

    private func setOpen(_ next: Bool) {
        guard next != open else { return }
        open = next
        onOpenChange(next)
    }

    @objc private func scrimTapped() { close() }

    override func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    // MARK: The hand

    private var base = 0.0

    /// A drag from Caw's capsule: down opens, and back up while it has it.
    func drag(_ pan: UIPanGestureRecognizer, from source: UIView) {
        switch pan.state {
        case .began:
            self.source = source
            superview?.bringSubviewToFront(self)
            stopSettle()
            if progress <= 0.001 { geo = measure() }
            base = progress
            isHidden = false
        case .changed:
            guard let g = geo else { return }
            paint(base + pan.translation(in: self).y / g.travel)
        case .ended, .cancelled:
            release(pan)
        default:
            break
        }
    }

    /// A drag on the open drawer's head, its foot or its empty state: up closes it.
    @objc private func drawerPanned(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            stopSettle()
            base = progress
        case .changed:
            guard let g = geo else { return }
            paint(base + min(0, pan.translation(in: self).y) / g.travel)
        case .ended, .cancelled:
            release(pan)
        default:
            break
        }
    }

    /// Let go: it goes where its position, carried along its speed, points.
    private func release(_ pan: UIPanGestureRecognizer) {
        guard let g = geo else { return }
        let v = pan.velocity(in: self).y / g.travel
        if progress + v * Self.project > 0.5 {
            setOpen(true)
            settle(to: 1, velocity: v)
        } else {
            close(velocity: v)
        }
    }
}
