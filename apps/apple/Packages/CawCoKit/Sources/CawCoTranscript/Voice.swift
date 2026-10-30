import CawCoCore
import CawCoDesign
import UIKit

/// Who answers in a transcript when it is not a harness session's agent
/// (turn/voice.ts): a pane hosting a project's conversation says it is Caw
/// here, and the rows draw it, his face standing in the speaker line's mark.
/// A transcript with a voice is bare (Transcript.svelte `bare`): nothing
/// stands in for rows not there yet.
@MainActor
public struct TranscriptVoice {
    /// Who answers, on the speaker line (Transcript.svelte `agentName`).
    public var name: String

    public init(name: String) {
        self.name = name
    }
}
