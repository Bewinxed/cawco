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
/// closes his panel (`CawPanel`), which the shell owns; a finger pulling down
/// off him draws it out of his glass under the finger, and pulling up takes
/// it back (`onPull`).
final class NeedsCawButton: UIControl {
    /// His head's side in the wide bar's group, pt.
    static let head = 22.0
    /// His side in the wide bar's group: the group's height.
    static let side = 36.0
    /// His own glass's side on a phone (`cBarCawGlassPhone`). Its top stands
    /// where the tabs' tops do (owner: "the spacing above the tabs isn't
    /// equal to the spacing from caw to the top") and its foot `footRoom`
    /// clear of the row's floor, the transcript's top edge (owner: "caw is
    /// still touching the transcript"; TopBarCluster `cawLine`). His panel
    /// hangs from that floor through a neck as tall as `footRoom`.
    static let standingSide = Size.cBarCawGlassPhone
    /// What the tab row is taller than his glass: the room under his foot.
    static let footRoom = Size.cTabRowH - Size.cBarCawGlassPhone

    /// A phone's touch area for him, in his own space: a 44pt square
    /// (`cBtnHLg`, Apple HIG Buttons: "a hit region of at least 44x44 pt")
    /// flush with the screen's edge, as his glass is, and standing on the
    /// row's floor, `footRoom` under his glass's foot: it reaches up past his
    /// glass to the bar's top and never down into the transcript. The drawn
    /// glass stays 32pt; VoiceOver's frame is this square too.
    var touchBox: CGRect {
        let side = Size.cBtnHLg
        return CGRect(x: bounds.maxX - side, y: bounds.maxY + Self.footRoom - side, width: side, height: side)
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
    /// A finger's pull on him (`CawPanel.pulled`): down brings his panel out
    /// of his glass under the finger, up takes the open panel back in. It
    /// begins only heading mostly that way; a tap is still `onTap`, and his
    /// press lets go as the pull takes the touch.
    var onPull: (UIPanGestureRecognizer) -> Void = { _ in }
    /// His panel stands open (`configure`): a pull on him heads up, not down.
    private var panelOpen = false

    /// On a phone his glass is his own, a tab tucked into the screen's
    /// trailing edge: square on that side, round on the other (owner: "it's
    /// top right doesn't need to be rounded"), his head filling it to the
    /// group's 4pt margin (`cBarCawHeadPhone`, owner: "caw itself can be
    /// bigger"), and the arcs run along that outline instead of his circle.
    let standing: Bool
    private var glassSide: Double { standing ? Self.standingSide : Self.side }
    private let headSide: Double
    /// His own glass on a phone; on the wide bar he stands on the group's.
    let capsule: GlassCapsule?
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
    /// One layer per arc, one per second-lap arc over it, and the closed
    /// ring's two halves, each drawn along itself.
    private let arcLayers = (0 ..< NeedsCawButton.arcs).map { _ in CAShapeLayer() }
    private let lapLayers = (0 ..< NeedsCawButton.arcs).map { _ in CAShapeLayer() }
    private let wholeHigh = CAShapeLayer()
    private let wholeLow = CAShapeLayer()
    /// While his panel hangs from his glass, the glass's lower half is no
    /// outline any more: its foot is the seam into the panel, its trailing
    /// corner runs on down into the panel's side, its leading one flares out
    /// into the panel's top edge. So the rim is drawn in two halves, each arc
    /// in the half its middle lies in, and the lower half fades out while
    /// the panel hangs (NeedsCaw.svelte `.rim.foot`, `data-joined`).
    private let upperHalf = CALayer()
    private let lowerHalf = CALayer()
    private(set) var count = 0

    /// Whether arc `k`'s middle lies on the lower half of his circle, or of
    /// the phone's standing outline (NeedsCaw.svelte `roundLow`, `standLow`).
    private static func lowArc(_ k: Int, standing: Bool) -> Bool {
        let middle = Double(k) * (arc + arcGap) + arc / 2
        guard standing else { return cos(middle * .pi / 180) < 0 }
        // Along the outline of half height 1, from 12 o'clock: the top edge,
        // the trailing side, the foot, then the leading half circle.
        let s = middle / 360 * (4 + .pi)
        if s < 1 { return false }
        if s < 3 { return s > 2 }
        if s < 4 { return true }
        return cos(.pi + (s - 4)) < 0
    }

    init(standing: Bool) {
        self.standing = standing
        headSide = standing ? Size.cBarCawHeadPhone : Self.head
        face = CawBeat(side: headSide)
        capsule = standing ? GlassCapsule() : nil
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        if let capsule {
            capsule.squaredTrailing = true
            // Joined, it runs on down past his foot to the row's floor, which his panel hangs from.
            capsule.neck = Self.footRoom
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
        for half in [upperHalf, lowerHalf] {
            half.actions = ["bounds": NSNull(), "position": NSNull()]
            layer.addSublayer(half)
        }
        for (k, (ring, lap)) in zip(arcLayers, lapLayers).enumerated() {
            let half = Self.lowArc(k, standing: standing) ? lowerHalf : upperHalf
            half.addSublayer(ring)
            half.addSublayer(lap)
        }
        upperHalf.addSublayer(wholeHigh)
        lowerHalf.addSublayer(wholeLow)
        for ring in arcLayers + lapLayers + [wholeHigh, wholeLow] {
            ring.fillColor = nil
            ring.lineWidth = Size.cCawRing
            ring.lineCap = .round
            ring.strokeEnd = 0
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
        // A finger's pull, as on a tab (PaneTabsView `pulled`): down off him
        // while his panel is shut, up while it stands open, mostly that way
        // rather than sideways, on him or his face alike. A Mac's pointer clicks him.
        if UIDevice.current.userInterfaceIdiom != .mac {
            let pull = GatedPan(target: self, action: #selector(pulled(_:))) { [weak self] pan in
                guard let self else { return false }
                return pan.heading(panelOpen ? .up : .down)
            }
            pull.maximumNumberOfTouches = 1
            addGestureRecognizer(pull)
        }
    }

    @objc private func pulled(_ pan: UIPanGestureRecognizer) { onPull(pan) }

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
        upperHalf.frame = bounds
        lowerHalf.frame = bounds
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
        // The closed circle's halves, each from its leading end clockwise: over the top, and under the foot.
        wholeHigh.path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: .pi, endAngle: 2 * .pi, clockwise: true).cgPath
        wholeLow.path = UIBezierPath(arcCenter: centre, radius: rim, startAngle: 0, endAngle: .pi, clockwise: true).cgPath
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
        // The closed outline's halves (NeedsCaw.svelte `STAND_HALF`): from the
        // leading side's middle over the top to the trailing side's, and from
        // there down, along the foot and round back.
        let high = UIBezierPath()
        high.move(to: CGPoint(x: centre.x - rim, y: centre.y))
        high.addArc(withCenter: centre, radius: rim, startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true)
        high.addLine(to: CGPoint(x: centre.x + rim, y: centre.y - rim))
        high.addLine(to: CGPoint(x: centre.x + rim, y: centre.y))
        wholeHigh.path = high.cgPath
        let low = UIBezierPath()
        low.move(to: CGPoint(x: centre.x + rim, y: centre.y))
        low.addLine(to: CGPoint(x: centre.x + rim, y: centre.y + rim))
        low.addLine(to: CGPoint(x: centre.x, y: centre.y + rim))
        low.addArc(withCenter: centre, radius: rim, startAngle: .pi / 2, endAngle: .pi, clockwise: true)
        wholeLow.path = low.cgPath
    }

    /// The first lap takes the scheme's attention ink; the second lap and
    /// the closed ring the fail glyph's.
    private func inkRing() {
        let ink = Palette.statusAttnGlyph.resolvedColor(with: traitCollection).cgColor
        let lapInk = Palette.statusFailGlyph.resolvedColor(with: traitCollection).cgColor
        for ring in arcLayers {
            ring.strokeColor = ink
        }
        for ring in lapLayers + [wholeHigh, wholeLow] {
            ring.strokeColor = lapInk
        }
    }

    /// His panel hangs from his glass (true) or folds back (false): the
    /// lower half of his rim fades out over `durPop` as it grows and back
    /// over `durExit` as it folds, on `easeOut`, on the panel's clock.
    /// `instant`: the arcs change at once, with a card opened or closed by the keyboard.
    func setJoined(_ on: Bool, instant: Bool = false) {
        let target: Float = on ? 0 : 1
        let now = lowerHalf.presentation()?.opacity ?? lowerHalf.opacity
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lowerHalf.opacity = target
        CATransaction.commit()
        if instant { lowerHalf.removeAnimation(forKey: "joined") }
        guard !instant, window != nil, now != target else { return }
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = now
        fade.toValue = target
        fade.duration = on ? Motion.durPop : Motion.durExit
        fade.timingFunction = Motion.easeOut.function
        lowerHalf.add(fade, forKey: "joined")
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

    /// The Needs you count (needs-you only: the rim never counts notices),
    /// what he says with none (`HomeModel.quiet`), "· N notices" after it
    /// while any notice stands (NeedsCaw.svelte `noticeWords`), and his
    /// panel's state for VoiceOver.
    func configure(count next: Int, notices: Int, quiet: String, open: Bool) {
        count = next
        panelOpen = open
        let noticeWords = notices > 0 ? " · \(notices) \(notices == 1 ? "notice" : "notices")" : ""
        accessibilityLabel = (next > 0 ? "Needs you, \(next)" : quiet) + noticeWords
        accessibilityValue = open ? "Open" : nil
        let animated = window != nil
        let closed = next > 2 * Self.arcs
        for (k, (ring, lap)) in zip(arcLayers, lapLayers).enumerated() {
            show(ring, !closed && next > k, animated: animated)
            show(lap, !closed && next > Self.arcs + k, animated: animated)
        }
        show(wholeHigh, closed, animated: animated)
        show(wholeLow, closed, animated: animated)
    }

    /// His needs-you beat, once; nothing with less motion.
    func beat() { face.beat() }
}

extension NeedsCawButton: UIPointerInteractionDelegate {
    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: standing ? .path(UIBezierPath(roundedRect: bounds, byRoundingCorners: [.topLeft, .bottomLeft], cornerRadii: CGSize(width: bounds.height / 2, height: bounds.height / 2))) : .roundedRect(bounds, radius: bounds.height / 2))
    }
}
