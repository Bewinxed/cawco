import UIKit

public extension TypeRole {
    /// This role with another weight, leading, size or face: the web's
    /// `font-weight` / `line-height` / `font-family` set on top of a role.
    func with(weight: UIFont.Weight? = nil, points: Double? = nil, leading: Double? = nil, family: [String]? = nil) -> TypeRole {
        TypeRole(weight: weight ?? self.weight, size: points.map { $0 ... $0 } ?? size, leading: leading ?? self.leading, family: family ?? self.family)
    }
}

/// A session's status as a glyph and its word (SessionStatus.svelte), so no
/// state reads by colour alone: the Solar glyph wears its status hue, the
/// word stays muted ink in the label role. `compact` is the glyph alone, as
/// a session tab leads with it. A change cross-fades the glyph once, the new
/// one coming up from the pop scale, over `durControl`; then it holds.
public final class SessionStatusView: UIView {
    public enum Tone: Sendable {
        case working, attention, failed, quiet, done

        var ink: UIColor {
            switch self {
            case .working: Palette.statusLiveGlyph
            case .attention: Palette.statusAttnGlyph
            case .failed: Palette.statusFailGlyph
            case .quiet: Palette.statusIdleGlyph
            case .done: Palette.statusDoneGlyph
            }
        }
    }

    /// One state on the web's scale: its word, glyph and tone.
    public struct Face: Equatable, Sendable {
        public let label: String
        public let glyph: Glyph
        public let tone: Tone

        public static let working = Face(label: "Working", glyph: .working, tone: .working)
        public static let needsYou = Face(label: "Needs you", glyph: .attention, tone: .attention)
        public static let held = Face(label: "Held", glyph: .attention, tone: .attention)
        public static let failed = Face(label: "Failed", glyph: .failed, tone: .failed)
        public static let unreachable = Face(label: "Unreachable", glyph: .ask, tone: .quiet)
        public static let sleeping = Face(label: "Sleeping", glyph: .sleeping, tone: .quiet)
        public static let stopped = Face(label: "Stopped", glyph: .pause, tone: .quiet)
        public static let stored = Face(label: "Stored", glyph: .pause, tone: .quiet)
        public static let idle = Face(label: "Idle", glyph: .pause, tone: .quiet)
        public static let done = Face(label: "Done", glyph: .passed, tone: .done)
        public static let passed = Face(label: "Passed", glyph: .passed, tone: .done)
        public static let pending = Face(label: "Pending", glyph: .pause, tone: .quiet)
        public static let skipped = Face(label: "Skipped", glyph: .pause, tone: .quiet)
        public static let cancelled = Face(label: "Cancelled", glyph: .pause, tone: .quiet)
        public static let unknown = Face(label: "Unknown", glyph: .ask, tone: .quiet)
    }

    private let cell = UIView()
    private var glyph: GlyphView
    private let word = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    public private(set) var face: Face

    public init(_ face: Face, compact: Bool = false) {
        self.face = face
        glyph = GlyphView(face.glyph, size: Size.iconMd, tint: face.tone.ink)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        cell.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(glyph)
        word.text = face.label
        word.isHidden = compact
        let row = UIStackView(arrangedSubviews: [cell, word])
        row.spacing = Space.space1
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: topAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
            cell.widthAnchor.constraint(equalToConstant: Size.iconMd),
            cell.heightAnchor.constraint(equalToConstant: Size.iconMd),
        ])
        center(glyph)
        isAccessibilityElement = true
        accessibilityTraits = .image
        accessibilityLabel = face.label
        setContentHuggingPriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SessionStatusView is built in code")
    }

    private func center(_ view: UIView) {
        NSLayoutConstraint.activate([
            view.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            view.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
    }

    public func configure(_ next: Face) {
        guard next != face else { return }
        face = next
        word.text = next.label
        accessibilityLabel = next.label
        let old = glyph
        let incoming = GlyphView(next.glyph, size: Size.iconMd, tint: next.tone.ink)
        cell.addSubview(incoming)
        center(incoming)
        glyph = incoming
        guard window != nil else {
            old.removeFromSuperview()
            return
        }
        let still = UIAccessibility.isReduceMotionEnabled
        incoming.alpha = 0
        if !still { incoming.transform = CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale) }
        let swap = Motion.easeOut.animator(Motion.durControl) {
            incoming.alpha = 1
            incoming.transform = .identity
            old.alpha = 0
        }
        swap.addCompletion { _ in old.removeFromSuperview() }
        swap.startAnimation()
    }
}
