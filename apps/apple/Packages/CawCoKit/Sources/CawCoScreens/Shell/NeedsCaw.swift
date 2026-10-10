import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

// Caw's head in the top bar (NeedsCaw.svelte): the way into what needs the
// operator, and the drawer it pulls down.

// MARK: Head

/// His compacted head (assets/mascot/README.md, `compacted`: a head that
/// fills its box, built for 18 pt) on his own glass on a phone (`standing`),
/// or on the bar's glass group where he shares one. What waits is arcs on his
/// circle's rim, one for each; past nine a second lap refills them on top in
/// the fail glyph's ink, and past two laps the ring closes whole in it; no
/// digit is drawn on him. His head is `CawBeat`: when something new arrives
/// it plays his needs-you beat once, and it smiles back at a pointer on him
/// or a press; with less motion only the arcs change. A tap or a drag down
/// from him moves the drawer (`NeedsDrawer`), which the shell owns.
final class NeedsCawButton: UIControl {
    /// His head's side in the wide bar's group, pt.
    static let head = 22.0
    /// His side in the wide bar's group: the group's height.
    static let side = 36.0
    /// His own glass's side on a phone (`cBarCawGlassPhone`); in the session
    /// row its foot stands `cBarPhoneGap` clear of the transcript (TopBarCluster).
    static let standingSide = Size.cBarCawGlassPhone

    /// A phone's touch area for him, in his own space: a 44pt square
    /// (`cBtnHLg`, Apple HIG Buttons: "a hit region of at least 44x44 pt")
    /// flush with the screen's edge, as his glass is, and centred on his
    /// glass's height, so a finger aimed at him lands in it on every side.
    /// The drawn glass stays 32pt; VoiceOver's frame is this square too.
    var touchBox: CGRect {
        let side = Size.cBtnHLg
        return CGRect(x: bounds.maxX - side, y: bounds.midY - side / 2, width: side, height: side)
    }

    override var accessibilityFrame: CGRect {
        // Converted through the screen's own space: UIAccessibility's
        // converter handed back his own space while he first stood.
        get {
            guard standing, let screen = window?.windowScene?.screen else { return super.accessibilityFrame }
            return convert(touchBox, to: screen.coordinateSpace)
        }
        set { super.accessibilityFrame = newValue }
    }

    var onTap: () -> Void = {}
    var onPan: (UIPanGestureRecognizer) -> Void = { _ in }

    /// On a phone his glass is his own, a tab tucked into the screen's
    /// trailing edge: square on that side, round on the other (owner: "it's
    /// top right doesn't need to be rounded"), his head filling it to the
    /// group's 4pt margin (`cBarCawHeadPhone`, owner: "caw itself can be
    /// bigger"), and the arcs run along that outline instead of his circle.
    let standing: Bool
    private var glassSide: Double { standing ? Self.standingSide : Self.side }
    private let headSide: Double
    private let capsule: GlassCapsule?
    private let face: CawBeat
    /// What waits, on his circle's rim (NeedsCaw.svelte, The count): an arc
    /// for each, `arc`° long with `arcGap`° between, from 12 o'clock
    /// clockwise, in the attention ink; past `arcs` the count refills the
    /// same arcs on top in the fail glyph's ink (the tenth redraws the
    /// first), and past two laps the ring closes whole in it. No digit is
    /// drawn on him: the number is in his VoiceOver label and the drawer.
    static let arc = 30.0
    static let arcGap = 8.0
    static let arcs = 9
    /// One layer per arc, one per second-lap arc over it, and one for the
    /// closed ring, each drawn along itself.
    private let arcLayers = (0 ..< NeedsCawButton.arcs).map { _ in CAShapeLayer() }
    private let lapLayers = (0 ..< NeedsCawButton.arcs).map { _ in CAShapeLayer() }
    private let wholeRing = CAShapeLayer()
    private(set) var count = 0

    init(standing: Bool) {
        self.standing = standing
        headSide = standing ? Size.cBarCawHeadPhone : Self.head
        face = CawBeat(side: headSide)
        capsule = standing ? GlassCapsule() : nil
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        if let capsule {
            capsule.squaredTrailing = true
            capsule.isUserInteractionEnabled = false
            addSubview(capsule)
            NSLayoutConstraint.activate([
                capsule.leadingAnchor.constraint(equalTo: leadingAnchor),
                capsule.trailingAnchor.constraint(equalTo: trailingAnchor),
                capsule.topAnchor.constraint(equalTo: topAnchor),
                capsule.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        }
        face.translatesAutoresizingMaskIntoConstraints = false
        addSubview(face)
        for ring in arcLayers + lapLayers + [wholeRing] {
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
            widthAnchor.constraint(equalToConstant: glassSide),
            heightAnchor.constraint(equalToConstant: glassSide),
            // His head's optical centre at the centre, not his box (`CawMark.headCentre`).
            face.centerXAnchor.constraint(equalTo: centerXAnchor, constant: (0.5 - CawMark.headCentre.x) * headSide),
            face.centerYAnchor.constraint(equalTo: centerYAnchor, constant: (0.5 - CawMark.headCentre.y) * headSide),
            face.widthAnchor.constraint(equalToConstant: headSide),
            face.heightAnchor.constraint(equalToConstant: headSide),
        ])
        inkRing()
        isAccessibilityElement = true
        accessibilityTraits = .button
        // Nothing is known until the hub's first word (`configure`).
        accessibilityLabel = "Reading the fleet"
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        addGestureRecognizer(pan)
        addInteraction(UIPointerInteraction(delegate: self))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedsCawButton is built in code")
    }

    @objc private func tapped() { onTap() }
    @objc private func panned(_ pan: UIPanGestureRecognizer) { onPan(pan) }
    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        face.hover(hover.state == .began || hover.state == .changed)
    }

    /// The arcs ON his glass's rim, a dial's ticks on its edge (owner: "lines
    /// along the rim of the circle … just like a dial thing"): the stroke's
    /// outer edge on the glass's edge, half the stroke in; arc k from
    /// k × (arc + arcGap)° clockwise from 12 o'clock.
    override func layoutSubviews() {
        super.layoutSubviews()
        let centre = CGPoint(x: bounds.midX, y: bounds.midY)
        let rim = CGFloat(glassSide) / 2 - Size.cCawRing / 2
        if standing {
            layoutOutline(centre: centre, rim: rim)
            return
        }
        let top = -CGFloat.pi / 2
        let degree = CGFloat.pi / 180
        // A round cap reaches half the stroke past the path's end: taken off
        // each end, so the arc as seen is `arc`° and the gaps `arcGap`°.
        let cap = Size.cCawRing / 2 / rim
        for (k, (ring, lap)) in zip(arcLayers, lapLayers).enumerated() {
            let from = top + CGFloat(k) * CGFloat(Self.arc + Self.arcGap) * degree
            let path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: from + cap, endAngle: from + CGFloat(Self.arc) * degree - cap, clockwise: true).cgPath
            ring.path = path
            lap.path = path
        }
        wholeRing.path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: top, endAngle: top + 2 * .pi, clockwise: true).cgPath
    }

    /// The standing glass's arcs (NeedsCaw.svelte `outlinePath`): the outline
    /// drawn half the stroke in, clockwise from 12 o'clock along the top
    /// edge, down the trailing edge, back along the bottom edge, then round
    /// the leading half circle. Each arc is `arc`/360 of its length and
    /// `arcGap`/360 from the next, caps and all.
    private func layoutOutline(centre: CGPoint, rim: CGFloat) {
        let length = (4 + CGFloat.pi) * rim
        func point(_ s: CGFloat) -> CGPoint {
            if s < rim { return CGPoint(x: centre.x + s, y: centre.y - rim) }
            if s < 3 * rim { return CGPoint(x: centre.x + rim, y: centre.y - rim + (s - rim)) }
            if s < 4 * rim { return CGPoint(x: centre.x + rim - (s - 3 * rim), y: centre.y + rim) }
            let angle = CGFloat.pi + (s - 4 * rim) / rim
            return CGPoint(x: centre.x + rim * sin(angle), y: centre.y - rim * cos(angle))
        }
        let cap = Size.cCawRing / 2
        for (k, (ring, lap)) in zip(arcLayers, lapLayers).enumerated() {
            let from = CGFloat(k) * CGFloat(Self.arc + Self.arcGap) / 360 * length + cap
            let to = from + CGFloat(Self.arc) / 360 * length - 2 * cap
            let path = UIBezierPath()
            path.move(to: point(from))
            var s = from + 0.5
            while s < to {
                path.addLine(to: point(s))
                s += 0.5
            }
            path.addLine(to: point(to))
            ring.path = path.cgPath
            lap.path = path.cgPath
        }
        let whole = UIBezierPath()
        whole.move(to: CGPoint(x: centre.x, y: centre.y - rim))
        whole.addLine(to: CGPoint(x: centre.x + rim, y: centre.y - rim))
        whole.addLine(to: CGPoint(x: centre.x + rim, y: centre.y + rim))
        whole.addLine(to: CGPoint(x: centre.x, y: centre.y + rim))
        whole.addArc(withCenter: centre, radius: rim, startAngle: .pi / 2, endAngle: -.pi / 2, clockwise: true)
        wholeRing.path = whole.cgPath
    }

    /// The first lap takes the scheme's attention ink; the second lap and
    /// the closed ring the fail glyph's.
    private func inkRing() {
        let ink = Palette.statusAttnGlyph.resolvedColor(with: traitCollection).cgColor
        let lapInk = Palette.statusFailGlyph.resolvedColor(with: traitCollection).cgColor
        for ring in arcLayers {
            ring.strokeColor = ink
        }
        for ring in lapLayers + [wholeRing] {
            ring.strokeColor = lapInk
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
            face.press(isHighlighted)
            let scale = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) { self.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
        }
    }

    /// The Needs you count, what he says with none (`HomeModel.quiet`), and
    /// the drawer's state for VoiceOver.
    func configure(count next: Int, quiet: String, open: Bool) {
        count = next
        accessibilityLabel = next > 0 ? "Needs you, \(next)" : quiet
        accessibilityValue = open ? "Open" : nil
        let animated = window != nil
        let closed = next > 2 * Self.arcs
        for (k, (ring, lap)) in zip(arcLayers, lapLayers).enumerated() {
            show(ring, !closed && next > k, animated: animated)
            show(lap, !closed && next > Self.arcs + k, animated: animated)
        }
        show(wholeRing, closed, animated: animated)
    }

    /// His needs-you beat, once; nothing with less motion.
    func beat() { face.beat() }
}

extension NeedsCawButton: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: standing ? .path(UIBezierPath(roundedRect: bounds, byRoundingCorners: [.topLeft, .bottomLeft], cornerRadii: CGSize(width: bounds.height / 2, height: bounds.height / 2))) : .roundedRect(bounds, radius: bounds.height / 2))
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
    /// With nothing listed: Caw at rest and what is known (`HomeModel.quiet`);
    /// he rests there only once "All caught up" is a known answer.
    private let resting = CawMark(status: .ready, side: 48)
    private let emptyLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
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
        // A first-baseline row pins no height of its own, so fitting it (the
        // drawer is sized by `measure`) came out ~45pt taller than its words:
        // the title, its tallest part, stands it from margin to margin.
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: headRow.layoutMarginsGuide.topAnchor),
            titleLabel.bottomAnchor.constraint(equalTo: headRow.layoutMarginsGuide.bottomAnchor),
        ])
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
        emptyLabel.text = "Reading the fleet"
        empty.axis = .vertical
        empty.alignment = .center
        empty.spacing = Space.space2
        empty.addArrangedSubview(resting)
        empty.addArrangedSubview(emptyLabel)
        empty.isLayoutMarginsRelativeArrangement = true
        empty.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space6, leading: 0, bottom: Space.space2, trailing: 0)
        empty.isAccessibilityElement = true
        empty.accessibilityLabel = "Reading the fleet"
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
    func configure(_ next: [HomeModel.NeedsItem], quiet: String, now: Double) {
        let words = next.map { item in "\(item.id) \(item.title) \(item.raisedAt.map { Naming.span(ms: now - $0) } ?? "") \(item.stale)" }.joined(separator: "\n") + "\n\(quiet)"
        guard words != drawn else { return }
        emptyLabel.text = quiet
        empty.accessibilityLabel = quiet
        resting.isHidden = quiet != "All caught up"
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
        let waited = item.raisedAt.map { "\(kind) · waiting \(Naming.span(ms: now - $0))" } ?? kind
        let meta = item.stale ? "\(waited) · machine offline" : waited
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
        // Its machine is offline: it stands, dimmed as every stale row is.
        button.alpha = item.stale ? 0.55 : 1
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

    /// The house spring the drawer settles on (`HouseSpring`).
    private var springing: HouseSpring?
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
        springing = HouseSpring(x: (progress - target) * g.travel, v: velocity * g.travel, target: target)
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
        // At rest open it is measured again as it now stands: it opened at a
        // size measured as it began (its width or its rows not yet settled),
        // and kept that size, the head stretched into the room left over.
        if let fresh = measure(), abs(fresh.travel - (geo?.travel ?? 0)) > 0.5 {
            geo = fresh
            paint(1)
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
