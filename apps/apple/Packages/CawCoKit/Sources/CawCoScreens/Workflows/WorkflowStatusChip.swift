import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// A run's status as one chip (WorkflowStatus.svelte): a pill on its tone's
/// ground, a 12pt glyph and its word in the label role, 3pt by 7pt in and
/// 4pt apart. The word is the tone's, or the status's own where the tone has
/// none (a cancelled run).
final class WorkflowStatusChip: UIView {
    private struct Tone {
        let ground: UIColor
        let ink: UIColor
        let glyph: Glyph
        let word: String
    }

    init(_ status: Components.Schemas.WorkflowRunStatus) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let tone: Tone = switch status {
        case .running: Tone(ground: Palette.statusLiveBg, ink: Palette.statusLiveInk, glyph: .dot, word: "live")
        case .waiting: Tone(ground: Palette.statusAttnBg, ink: Palette.statusAttnInk, glyph: .chevronUp, word: "needs you")
        case .done: Tone(ground: Palette.statusDoneBg, ink: Palette.statusDoneInk, glyph: .check, word: "done")
        case .failed: Tone(ground: Palette.statusFailBg, ink: Palette.statusFailInk, glyph: .failed, word: "failed")
        case .cancelled: Tone(ground: Palette.statusIdleBg, ink: Palette.statusIdleInk, glyph: .stop, word: status.rawValue)
        case .unrecognized: Tone(ground: Palette.statusIdleBg, ink: Palette.statusIdleInk, glyph: .dot, word: "unknown")
        }
        backgroundColor = tone.ground
        let word = KitLabel(TypeScale.typeLabel, ink: tone.ink)
        word.text = tone.word
        let row = UIStackView(arrangedSubviews: [GlyphView(tone.glyph, size: Size.iconSm, tint: tone.ink), word])
        row.spacing = Space.space1
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: 3),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        isAccessibilityElement = true
        accessibilityLabel = tone.word
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowStatusChip is built in code")
    }

    /// `--radius-pill`: its ends are half its height.
    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}
