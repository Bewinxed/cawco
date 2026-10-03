import UIKit

/// What a session is doing, as the rim round its mark says it
/// (apps/dashboard/src/lib/cawco/SessionMark.svelte).
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

/// A session's mark: its sprite on its project's hue, the same tile in every
/// list that names a session, and round it a rim saying what it is doing.
/// Working, an arc running round the rim once a `durLoop`; needs you or
/// failed, the rim standing in that status's ink; idle or finished, no rim.
/// The rim stands outside the tile, so nothing round it moves for it.
public final class SessionMarkView: UIView {
    /// The lead slot's tile and its glyph (`--mark-size`, 18px; 12px glyph).
    public static let tile = Size.rowMarkBox
    static let glyph = 12.0
    /// The rim: a 1.5pt ring 1pt clear of the tile, on the tile's own curve.
    static let rimOut = 2.5
    static let rimWidth = 1.5

    private let sheen = CAGradientLayer()
    private let sprite = GlyphView(.ghost, size: SessionMarkView.glyph, tint: Palette.markGlyph)
    /// The rim's ring, as the mask its paint shows through.
    private let ring = CAShapeLayer()
    private let rim = CALayer()
    private let sweep = CAGradientLayer()
    private var status = MarkStatus.idle

    public init() {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.tile, height: Self.tile))
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        sheen.cornerRadius = Radius.radiusXs
        sheen.cornerCurve = .continuous
        layer.addSublayer(sheen)
        addSubview(sprite)
        ring.fillColor = nil
        ring.lineWidth = Self.rimWidth
        ring.strokeColor = UIColor.black.cgColor
        rim.mask = ring
        sweep.type = .conic
        sweep.startPoint = CGPoint(x: 0.5, y: 0.5)
        // CSS's 0turn is the top: the conic gradient starts there.
        sweep.endPoint = CGPoint(x: 0.5, y: 0)
        rim.addSublayer(sweep)
        layer.addSublayer(rim)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Self.tile),
            heightAnchor.constraint(equalToConstant: Self.tile),
            sprite.centerXAnchor.constraint(equalTo: centerXAnchor),
            sprite.centerYAnchor.constraint(equalTo: centerYAnchor),
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
    public func configure(id: String, place: String, status: MarkStatus) {
        sprite.glyph = Self.sprite(id)
        backgroundColor = Self.hue(place)
        self.status = status
        paint()
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        sheen.frame = bounds
        let outset = bounds.insetBy(dx: -Self.rimOut, dy: -Self.rimOut)
        rim.frame = outset
        sweep.frame = rim.bounds
        ring.frame = rim.bounds
        ring.path = UIBezierPath(
            roundedRect: rim.bounds.insetBy(dx: Self.rimWidth / 2, dy: Self.rimWidth / 2),
            cornerRadius: Radius.radiusXs + Self.rimOut - Self.rimWidth / 2
        ).cgPath
    }

    @objc private func motionChanged() {
        paint()
    }

    private func paint() {
        let traits = traitCollection
        sheen.colors = Palette.markOverlay.colors(for: traits)
        let sweeping = status == .live && !UIAccessibility.isReduceMotionEnabled
        if !sweeping {
            sweep.removeAllAnimations()
        }
        switch status {
        case .attn, .fail, .live:
            let color = (status == .attn ? Palette.statusAttnGlyph : status == .fail ? Palette.statusFailGlyph : Palette.statusLiveGlyph)
                .resolvedColor(with: traits)
            let ink = color.cgColor
            rim.isHidden = false
            if sweeping {
                // An arc of the live ink, fading along its tail, once a durLoop:
                // transparent live ink, not `clear` (black at alpha 0, which drew a grey tail).
                let faded = color.withAlphaComponent(0).cgColor
                sweep.colors = [faded, ink, faded]
                sweep.locations = [0, 0.45, 0.45]
                guard sweep.animation(forKey: "sweep") == nil else {
                    return
                }
                let turn = CABasicAnimation(keyPath: "transform.rotation.z")
                turn.fromValue = 0
                turn.toValue = Double.pi * 2
                turn.duration = Motion.durLoop
                turn.repeatCount = .infinity
                turn.isRemovedOnCompletion = false
                sweep.add(turn, forKey: "sweep")
            } else {
                sweep.colors = [ink, ink]
                sweep.locations = [0, 1]
            }
        case .done, .idle:
            rim.isHidden = true
        }
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
