import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

// Caw's head in the top bar (NeedsCaw.svelte): the way into what needs the
// operator, and the panel under him that holds every notification.

// MARK: Head

/// His compacted head (assets/mascot/README.md, `compacted`: a head that
/// fills its box, built for 18 pt) on his own glass on a phone (`standing`),
/// or on the bar's glass group where he shares one. What waits is arcs on his
/// circle's rim, one for each; past nine a second lap refills them on top in
/// the fail glyph's ink, and past two laps the ring closes whole in it; no
/// digit is drawn on him. His head is `CawBeat`: when something new arrives
/// it plays his needs-you beat once, and it smiles back at a pointer on him
/// or a press; with less motion only the arcs change. A tap on him opens or
/// closes his panel (`CawPanel`), which the shell owns.
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
    /// drawn on him: the number is in his VoiceOver label and his panel.
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
        addInteraction(UIPointerInteraction(delegate: self))
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedsCawButton is built in code")
    }

    @objc private func tapped() { onTap() }
    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        face.hover(hover.state == .began || hover.state == .changed)
    }

    /// The glass's own edge, pt: GlassCapsule's hairline border.
    private static let glassEdge: CGFloat = 1

    /// The arcs ON his glass's rim, a dial's ticks on its edge (owner: "lines
    /// along the rim of the circle … just like a dial thing"): the stroke's
    /// outer edge just inside the glass's hairline (laid across it, its outer
    /// half met the bar and read as cut off); arc k from k × (arc + arcGap)°
    /// clockwise from 12 o'clock.
    override func layoutSubviews() {
        super.layoutSubviews()
        let centre = CGPoint(x: bounds.midX, y: bounds.midY)
        let rim = CGFloat(glassSide) / 2 - Self.glassEdge - Size.cCawRing / 2
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

    /// The Needs you count (needs-you only, never notices), what he says with
    /// none (`HomeModel.quiet`), and his panel's state for VoiceOver.
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
