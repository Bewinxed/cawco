import UIKit

/// One limit window as a bar (usage/LimitBar.svelte): a track that is always
/// there, a fill for the share used, and the pace tick, a 2pt gap at the share
/// of the window's time already gone. Fill past the tick is a window burning
/// faster than it lasts. A new reading tweens the fill once; at rest nothing
/// moves, and the tick follows the clock without tweening.
public final class LimitBar: UIView {
    public enum Tone: Sendable {
        case calm, near, over, stale
    }

    /// What the fill shows (LimitBar.svelte `reads`): the share used (a
    /// context window), or the share left (a provider's limit, its tick
    /// where an even pace would leave you now).
    public enum Reads: Sendable {
        case used, left
    }

    private let fill = UIView()
    private let tick = UIView()
    private var used = 0.0
    private var elapsed: Double?
    private var tone = Tone.calm
    private let height: Double

    /// `height`: 8 on a page, 4 in the strip and the sheet.
    public init(height: Double = 4) {
        self.height = height
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusHair
        clipsToBounds = true
        fill.layer.cornerRadius = Radius.radiusHair
        addSubview(fill)
        addSubview(tick)
        heightAnchor.constraint(equalToConstant: height).isActive = true
        isAccessibilityElement = true
        accessibilityTraits = .updatesFrequently
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("LimitBar is built in code")
    }

    /// `used` 0–100 (a reading can pass 100; the bar stops at full); `elapsed` 0–1 draws the tick;
    /// `paint`: what the gap shows, the surface the bar is drawn on.
    public func configure(used: Double, elapsed: Double?, tone: Tone, reached: Bool, paint: UIColor, label: String, reads: Reads = .used) {
        let share = min(100, max(0, used))
        let shown = reads == .left ? 100 - share : share
        let changed = shown != self.used && window != nil
        self.used = shown
        self.elapsed = reached ? nil : elapsed.map { reads == .left ? 1 - $0 : $0 }
        self.tone = tone
        backgroundColor = track
        fill.backgroundColor = ink
        tick.backgroundColor = paint
        accessibilityLabel = "\(label) \(reads == .left ? "left" : "used")"
        let said = "\(Int(shown.rounded())) percent \(reads == .left ? "left" : "used")"
        accessibilityValue = self.elapsed.map { tick in
            reads == .left ? "\(said); an even pace would leave \(Int((tick * 100).rounded())) percent by now"
                : "\(said); an even pace would have used \(Int((tick * 100).rounded())) percent by now"
        } ?? said
        if changed, !UIAccessibility.isReduceMotionEnabled {
            setNeedsLayout()
            Motion.easeDrawer.animator(Motion.durMorph) { self.layoutIfNeeded() }.startAnimation()
        } else {
            setNeedsLayout()
        }
    }

    private var ink: UIColor {
        switch tone {
        case .calm: Palette.meterCalm
        case .near: Palette.meterNear
        case .over: Palette.meterOver
        case .stale: Palette.meterStale
        }
    }

    private var track: UIColor {
        switch tone {
        case .calm: Palette.meterCalmTrack
        case .near: Palette.meterNearTrack
        case .over: Palette.meterOverTrack
        case .stale: Palette.meterStaleTrack
        }
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        fill.frame = CGRect(x: 0, y: 0, width: bounds.width * min(100, max(0, used)) / 100, height: bounds.height)
        UIView.performWithoutAnimation {
            if let elapsed {
                tick.isHidden = false
                tick.frame = CGRect(x: bounds.width * elapsed - 1, y: 0, width: 2, height: bounds.height)
            } else {
                tick.isHidden = true
            }
        }
    }
}
