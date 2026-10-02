import CawCoCore
import SwiftUI

/// A session's status as a glyph and its word, so no state reads by colour
/// alone. The glyph wears its status hue; the word stays muted ink.
///
/// The glyphs are SF Symbols placeholders until the drawn set replaces them
/// here, in `SessionStatus.symbol`.
public struct StatusGlyph: View {
    private let status: SessionStatus
    @ScaledMetric(relativeTo: .subheadline) private var glyph = Size.iconMd
    @ScaledMetric(relativeTo: .subheadline) private var text = TypeScale.textLabel
    @ScaledMetric(relativeTo: .subheadline) private var gap = Space.space1

    public init(_ status: SessionStatus) {
        self.status = status
    }

    public var body: some View {
        HStack(spacing: gap) {
            Image(systemName: status.symbol)
                .font(.system(size: glyph, weight: TypeScale.weightStrong))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(status.tint)
                .accessibilityHidden(true)
            Text(status.word)
                .font(.system(size: text, weight: TypeScale.weightStrong))
                .foregroundStyle(Palette.inkMuted)
        }
        .lineLimit(1)
        .accessibilityElement(children: .combine)
    }
}

extension SessionStatus {
    var word: String {
        switch self {
        case .starting: "Starting"
        case .working: "Working"
        case .needsYou: "Needs you"
        case .idle: "Idle"
        case .done: "Done"
        case .stopped: "Stopped"
        case .error: "Error"
        case .unknown: "Unknown"
        }
    }

    var symbol: String {
        switch self {
        case .starting: "circle.dotted"
        case .working: "arrow.clockwise.circle.fill"
        case .needsYou: "hand.raised.circle.fill"
        case .idle: "pause.circle.fill"
        case .done: "checkmark.circle.fill"
        case .stopped: "stop.circle.fill"
        case .error: "xmark.circle.fill"
        case .unknown: "questionmark.circle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .starting, .working: Palette.statusLiveGlyph
        case .needsYou: Palette.statusAttnGlyph
        case .done: Palette.statusDoneGlyph
        case .error: Palette.statusFailGlyph
        case .idle, .stopped, .unknown: Palette.statusIdleGlyph
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: Space.space3) {
        ForEach(SessionStatus.allCases, id: \.self) { StatusGlyph($0) }
    }
    .padding(Space.space5)
    .background(Palette.surfaceRaised)
}
