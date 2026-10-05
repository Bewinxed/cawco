import UIKit

/// What a session is doing, as its mark says it
/// (apps/dashboard/src/lib/cawco/TreeMark.svelte `MarkStatus`).
public enum MarkStatus: Sendable {
    case live, attn, done, fail, idle

    /// Its word, for the row's accessible name: colour is never the only signal.
    public var word: String {
        switch self {
        case .live: "Working"
        case .attn: "Needs you"
        case .done: "Finished"
        case .fail: "Failed"
        case .idle: "Idle"
        }
    }
}

/// A session's mark (SessionMark.svelte, a TreeMark): its sprite on its
/// project's hue, the same tile in every list that names a session.
///
/// - A parent with a count: up to three shaded copies of the tile stand behind
///   it as a deck, receding downward outside the box, and the tile shows the
///   count in place of its sprite. While its rows are out the deck is away and
///   the tile shows a chevron pointing down at them.
/// - With `onToggle`, the mark's own hit area is the switch; the rest of the
///   row still does what the row does.
/// - Working: the tile echoes, a copy of it growing from under the tile and
///   fading, on its list's beat (`beat`). With reduced motion, a still dot in
///   the live ink instead.
/// - Needs you, failed: a dot on the tile's top-right corner in that status's
///   ink, the tile cut away round it. The needs-you dot echoes as a working
///   tile does. Idle or finished: nothing.
public final class SessionMarkView: UIView {
    /// The lead slot's tile and its glyph (`--mark-size`, 18px; 12px glyph).
    public static let tile = Size.rowMarkBox
    static let glyph = 12.0
    /// How many beats fit in one loop: the rows start a third of a loop apart (motion/echo `BEATS`).
    static let beats = 3.0

    private let side: Double
    private let echo = CALayer()
    private let echoSheen = CAGradientLayer()
    private let cards = (0 ..< 3).map { _ in DeckCard() }
    private let face = UIView()
    private let sheen = CAGradientLayer()
    private let hole = CAShapeLayer()
    private let sprite = GlyphView(.ghost, size: SessionMarkView.glyph, tint: Palette.markGlyph)
    private let number = KitLabel(TypeScale.typeMeta.with(leading: 1), ink: Palette.markGlyph)
    private let chevron = GlyphView(.chevronBold, size: SessionMarkView.glyph, tint: Palette.markGlyph)
    private let ping = CALayer()
    private let dot = CALayer()
    private let hit = MarkSwitch()

    private var status = MarkStatus.idle
    private var count = 0
    private var open = false
    private var over = false
    private var hue = UIColor.clear

    /// Opens and folds the rows under it from the mark's own hit area; without it the mark only says the count.
    public var onToggle: (() -> Void)? {
        didSet { arm() }
    }

    /// Its place among its list's echoes, top to bottom, and how many the list has (motion/echo).
    public var beat: (place: Int, of: Int) = (0, 1) {
        didSet {
            if beat != oldValue { run() }
        }
    }

    /// What one row under it is, for the switch's name ("3 delegates").
    public var noun = "delegate"

    /// `tile`: the tile's side where a list sets its own (`--mark-size`); the glyph keeps its size.
    public init(tile: Double = SessionMarkView.tile) {
        side = tile
        super.init(frame: CGRect(x: 0, y: 0, width: tile, height: tile))
        translatesAutoresizingMaskIntoConstraints = false
        echo.cornerRadius = Radius.radiusXs
        echo.cornerCurve = .continuous
        echo.masksToBounds = true
        echo.opacity = Float(Motion.echoOpacity)
        echo.isHidden = true
        echo.addSublayer(echoSheen)
        layer.addSublayer(echo)
        for card in cards.reversed() { layer.addSublayer(card) }
        face.layer.cornerRadius = Radius.radiusXs
        face.layer.cornerCurve = .continuous
        face.isUserInteractionEnabled = false
        sheen.cornerRadius = Radius.radiusXs
        sheen.cornerCurve = .continuous
        face.layer.addSublayer(sheen)
        addSubview(face)
        number.tabular = true
        number.textAlignment = .center
        for part in [sprite, number, chevron] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
            face.addSubview(part)
            NSLayoutConstraint.activate([
                part.centerXAnchor.constraint(equalTo: face.centerXAnchor),
                part.centerYAnchor.constraint(equalTo: face.centerYAnchor),
            ])
        }
        hole.fillRule = .evenOdd
        hole.fillColor = UIColor.black.cgColor
        ping.cornerRadius = Size.statusDotSize / 2
        ping.isHidden = true
        dot.cornerRadius = Size.statusDotSize / 2
        dot.isHidden = true
        layer.addSublayer(ping)
        layer.addSublayer(dot)
        hit.isHidden = true
        hit.addAction(UIAction { [weak self] _ in self?.onToggle?() }, for: .touchUpInside)
        for event in [UIControl.Event.touchDown, .touchDragEnter] {
            hit.addAction(UIAction { [weak self] _ in self?.press(true) }, for: event)
        }
        for event in [UIControl.Event.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit] {
            hit.addAction(UIAction { [weak self] _ in self?.press(false) }, for: event)
        }
        hit.addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        addSubview(hit)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: tile),
            heightAnchor.constraint(equalToConstant: tile),
        ])
        isAccessibilityElement = false
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: SessionMarkView, _: UITraitCollection) in
            view.paint()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SessionMarkView is built in code")
    }

    /// `place`: where it runs (its cwd, or its machine), for its hue; `id` keys its sprite.
    /// `count`: the rows under it, at every depth; `open`: they are out.
    public func configure(id: String, place: String, status: MarkStatus, count: Int = 0, open: Bool = false) {
        sprite.glyph = Self.sprite(id)
        hue = Self.hue(place)
        let swapped = (count > 0) != (self.count > 0) || open != self.open
        self.status = status
        self.count = count
        self.open = open
        // The tile has room for two figures.
        number.text = count >= 100 ? "99" : "\(count)"
        hit.accessibilityLabel = "\(open ? "Hide" : "Show") \(count) \(noun)\(count == 1 ? "" : "s")"
        hit.accessibilityValue = open ? "Expanded" : "Collapsed"
        arm()
        paint()
        swap(animated: swapped && window != nil)
        setNeedsLayout()
    }

    /// The switch, where the mark has rows to open and someone to tell.
    private func arm() {
        hit.isHidden = !(count > 0 && onToggle != nil)
    }

    /// The switch as an accessibility element of the row it stands in, while it is armed.
    public var switchElement: UIView? { hit.isHidden ? nil : hit }

    override public func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let box = CGRect(x: 0, y: 0, width: side, height: side)
        face.bounds = box
        face.center = CGPoint(x: side / 2, y: side / 2)
        sheen.frame = box
        echo.bounds = box
        echo.position = CGPoint(x: side / 2, y: side / 2)
        echoSheen.frame = box
        // Card i stands i places back (1 nearest): the tile scaled by
        // 1 - deckShrink x its place about a point under the tile, so it
        // shows deckStep below the one in front. A card with no row to stand
        // for is not drawn; the deck is away while its rows are out.
        let shown = open ? 0 : min(count, 3)
        for (index, card) in cards.enumerated() {
            let depth = Double(shown - index)
            card.isHidden = depth < 1
            guard depth >= 1 else { continue }
            let scale = 1 - Motion.deckShrink * depth
            let width = side * scale
            card.frame = CGRect(x: (side - width) / 2, y: side + Motion.deckStep * depth - width, width: width, height: width)
            card.lay(depth: depth, scale: scale, band: Motion.deckStep)
        }
        let dotSide = Size.statusDotSize
        let corner = CGRect(x: side - dotSide / 2, y: -dotSide / 2, width: dotSide, height: dotSide)
        dot.frame = corner
        ping.bounds = CGRect(origin: .zero, size: corner.size)
        ping.position = CGPoint(x: corner.midX, y: corner.midY)
        // The tile is cut away round the dot, statusDotCut wide: what shows in the cut is whatever the row stands on.
        if dot.isHidden {
            face.layer.mask = nil
        } else {
            let reach = dotSide / 2 + Size.statusDotCut
            let path = UIBezierPath(rect: box)
            path.append(UIBezierPath(ovalIn: CGRect(x: side - reach, y: -reach, width: reach * 2, height: reach * 2)))
            hole.frame = box
            hole.path = path.cgPath
            face.layer.mask = hole
        }
        hit.frame = switchBox
        CATransaction.commit()
    }

    /// The switch's area. Under a finger: the kit's touch target centred on
    /// the tile, sideways as far as the row's words (its gap from the mark),
    /// up and down a two-line row's own height. Under a pointer: the tile,
    /// the dot's overhang round it and the deck under it.
    private var switchBox: CGRect {
        let box = CGRect(x: 0, y: 0, width: side, height: side)
        let reach = Size.statusDotSize / 2
        if traitCollection.userInterfaceIdiom == .mac {
            let under = min(Double(min(count, 3)) * Motion.deckStep + reach, 5 + Space.space1)
            return CGRect(x: -reach, y: -reach, width: side + reach * 2, height: side + reach + under)
        }
        return box.insetBy(dx: -Space.space2, dy: -(44 - side) / 2)
    }

    override public func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        if !hit.isHidden, switchBox.contains(point) { return true }
        return super.point(inside: point, with: event)
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { run() }
    }

    @objc private func motionChanged() {
        paint()
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

    /// What the tile shows at rest (its sprite or its count) and the chevron
    /// it gives way to: open, the chevron points down at the rows; under a
    /// pointer on the switch it stands in the rest's place.
    private func swap(animated: Bool) {
        let chevrons = (count > 0 && open) || (over && !hit.isHidden)
        let rest: UIView = count > 0 ? number : sprite
        let away: UIView = count > 0 ? sprite : number
        away.alpha = 0
        let turn = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        let small = CGAffineTransform(scaleX: 0.25, y: 0.25)
        let moves = !UIAccessibility.isReduceMotionEnabled
        let apply: @MainActor () -> Void = { [chevron] in
            rest.alpha = chevrons ? 0 : 1
            rest.transform = chevrons && moves ? small : .identity
            chevron.alpha = chevrons ? 1 : 0
            chevron.transform = chevrons || !moves ? turn : turn.concatenating(small)
        }
        if animated {
            Motion.easeOut.animator(Motion.durControl, animations: apply).startAnimation()
        } else {
            apply()
        }
    }

    private func paint() {
        let traits = traitCollection
        let tile = hue.resolvedColor(with: traits).cgColor
        let overlay = Palette.markOverlay.colors(for: traits)
        face.backgroundColor = hue
        sheen.colors = overlay
        echo.backgroundColor = tile
        echoSheen.colors = overlay
        for card in cards { card.paint(tile: tile, overlay: overlay, traits: traits) }
        let still = UIAccessibility.isReduceMotionEnabled
        let ink: UIColor? = switch status {
        case .attn: Palette.statusAttnGlyph
        case .fail: Palette.statusFailGlyph
        // Working: a still dot in the live ink, only where the echo that says it does not run.
        case .live: still ? Palette.statusLiveGlyph : nil
        case .done, .idle: nil
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        dot.isHidden = ink == nil
        dot.backgroundColor = ink?.resolvedColor(with: traits).cgColor
        ping.backgroundColor = dot.backgroundColor
        CATransaction.commit()
        setNeedsLayout()
        run()
    }

    /// The echo, on its list's beat: over the first share of the cycle it
    /// leaves the tile at echoOpacity and grows to echoScale as it fades, on
    /// ease-out; then it waits at the tile's own size, under the tile. The
    /// phase comes from the clock, never from when the row arrived: every
    /// echo in a list is timed from one origin plus its place times the gap.
    private func run() {
        let moving = !UIAccessibility.isReduceMotionEnabled && window != nil
        let layerFor: CALayer? = moving ? (status == .live ? echo : status == .attn ? ping : nil) : nil
        for candidate in [echo, ping] where candidate !== layerFor {
            candidate.removeAnimation(forKey: "beat")
            candidate.isHidden = true
        }
        guard let target = layerFor else { return }
        target.isHidden = false
        let loop = Motion.durLoop
        let gap = loop / Self.beats
        let cycle = max(2 * loop, Double(max(1, beat.of)) * gap)
        let share = NSNumber(value: loop / cycle)
        let rest = target === echo ? Motion.echoOpacity : 1.0
        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [rest, 0, rest, rest]
        let grow = CAKeyframeAnimation(keyPath: "transform.scale")
        grow.values = [1, Motion.echoScale, 1, 1]
        for part in [fade, grow] {
            part.keyTimes = [0, share, share, 1]
            part.timingFunctions = [Motion.easeOut.function, CAMediaTimingFunction(name: .linear), CAMediaTimingFunction(name: .linear)]
            part.duration = cycle
        }
        let group = CAAnimationGroup()
        group.animations = [fade, grow]
        group.duration = cycle
        group.repeatCount = .infinity
        group.isRemovedOnCompletion = false
        let now = target.convertTime(CACurrentMediaTime(), from: nil)
        let phase = (CACurrentMediaTime() - Double(beat.place) * gap).truncatingRemainder(dividingBy: cycle)
        group.beginTime = now - phase
        target.add(group, forKey: "beat")
    }

    /// A stable 1–8 hue from any seed string (mark.ts `markHue`).
    public static func hue(_ seed: String) -> UIColor {
        let hues = [Palette.mark1, Palette.mark2, Palette.mark3, Palette.mark4, Palette.mark5, Palette.mark6, Palette.mark7, Palette.mark8]
        return hues[Int(hash(seed, 31).magnitude % 8)]
    }

    /// A stable sprite for a session, on another constant than its hue (mark.ts `sessionSprite`).
    public static func sprite(_ seed: String) -> Glyph {
        Glyph.sprites[Int(hash(seed, 37).magnitude % UInt32(Glyph.sprites.count))]
    }

    /// The web's `(h * k + charCode) | 0` over UTF-16 units, 32-bit wrapping.
    private static func hash(_ seed: String, _ k: Int32) -> Int32 {
        var h: Int32 = 0
        for unit in seed.utf16 {
            h = h &* k &+ Int32(unit)
        }
        return h
    }
}

/// The mark's switch: a clear control over the tile, a button by role.
private final class MarkSwitch: UIControl {
    init() {
        super.init(frame: .zero)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MarkSwitch is built in code")
    }
}

/// One card of a mark's deck: the tile's colour and sheen, darker with depth,
/// under the shadow the card in front casts on the band of it that shows.
private final class DeckCard: CALayer {
    private let sheen = CAGradientLayer()
    private let shade = CALayer()
    private let cast = CAGradientLayer()

    override init() {
        super.init()
        cornerCurve = .continuous
        masksToBounds = true
        for part in [sheen, shade, cast] { addSublayer(part) }
    }

    override init(layer: Any) {
        super.init(layer: layer)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DeckCard is built in code")
    }

    func lay(depth: Double, scale: Double, band: Double) {
        cornerRadius = Radius.radiusXs * scale
        sheen.frame = bounds
        shade.frame = bounds
        shade.opacity = Float(depth * Motion.deckShadeStep)
        // The cast starts where the card in front ends: the top of the band that shows.
        let tall = band * 1.5 * scale
        cast.frame = CGRect(x: 0, y: bounds.height - band, width: bounds.width, height: tall)
    }

    func paint(tile: CGColor, overlay: [CGColor], traits: UITraitCollection) {
        backgroundColor = tile
        sheen.colors = overlay
        shade.backgroundColor = Palette.markDeckShade.resolvedColor(with: traits).cgColor
        let shadow = Palette.markDeckCast.resolvedColor(with: traits)
        cast.colors = [shadow.cgColor, shadow.withAlphaComponent(0).cgColor]
    }
}
