import CawCoAPI
import Foundation

/// One cell of the transcript list: a row, or one call of a run, or one
/// block of a long message, with its margin above it (the row's own
/// `margin-block-start`, since the web's rows never collapse their margins).
struct Item {
    let id: String
    var top: Double
    let kind: Kind
    /// Everything the cell draws, as one value: a settled item whose print is
    /// unchanged is never configured again.
    var print: String

    enum Kind {
        case piece(Piece)
        case user(UserTurn)
        case tool(Block)
        case thinking(Reasoning)
        case system(Block)
        case harness(HarnessNote, key: String)
        case peer(Block)
        case question(Block)
        case subagent(Branch, spawn: Block)
        case delegate(Block)
        case run(Block, runId: String?)
        case compaction(Compaction)
        case livetool(name: String, glance: String)
        case notice(String)
        /// The read said the conversation is empty (EmptyState).
        case empty
    }

    /// One block of an assistant turn (MessageRow's `.turn`, LiveRow's answer).
    struct Piece {
        let blocks: [MarkdownBlock]
        /// The speaker line, on the turn's first block when it is not grouped.
        let header: Header?
        /// A grouped turn's clock, floated into its first line.
        let float: String?
        /// The live tail: its words fade in as they land.
        let streaming: Bool
        /// A chunk of a long fence, drawn as one well with the pieces around it.
        var joinsAbove = false
        var joinsBelow = false
    }

    struct Header {
        let name: String
        let clock: String?
        let note: String?
        let you: Bool
    }

    /// The reader's own turn (MessageRow `.turn.you`).
    struct UserTurn {
        let block: Block
        let grouped: Bool
        let runsOn: Bool
    }

    /// A reasoning block (Thinking.svelte): settled, or the live tail's.
    struct Reasoning {
        let key: String
        let text: String
        let live: Bool
        /// The live block the reader just watched, settled: it arrives open and folds shut.
        let folding: Bool
    }
}

extension Item {
    /// The clock a turn's speaker line shows: 24-hour, hours and minutes.
    static func clock(_ date: Date?) -> String? {
        guard let date else { return nil }
        return clockFormat.string(from: date)
    }

    private static let clockFormat: DateFormatter = {
        let format = DateFormatter()
        format.locale = .current
        format.setLocalizedDateFormatFromTemplate("HHmm")
        return format
    }()
}
