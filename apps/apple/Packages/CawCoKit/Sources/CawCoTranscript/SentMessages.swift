import CawCoAPI
import CawCoCore
import CawCoDesign
import Foundation

/// The reader's own messages in a conversation, as the composer's recall
/// lists them: their sends only, never the agent's turns, a delegate's or a
/// peer's message, or harness plumbing wearing the reader's role. Read
/// straight off the hub's blocks, without rendering any of them.
public enum SentMessages {
    /// Newest first: the sends still waiting, newest first, then the rest of
    /// the conversation from its end. A send read overtakes every pending
    /// send accepted before it, so nothing waiting is older than what was read.
    /// Each text once, the newest (recall.ts `sentByReader`): "continue" sent
    /// ten times is one row.
    public static func recall(_ transcript: SessionTranscript) -> [RecallEntry] {
        var entries: [RecallEntry] = []
        var seen = Set<String>()
        func add(_ block: Components.Schemas.TranscriptBlock) {
            guard let entry = entry(block), seen.insert(entry.text.trimmingCharacters(in: .whitespacesAndNewlines)).inserted else { return }
            entries.append(entry)
        }
        for block in transcript.queued.reversed() {
            add(block)
        }
        let waiting = Set(transcript.queued.map(\.id))
        for block in transcript.blocks.reversed() where !waiting.contains(block.id) {
            add(block)
        }
        return entries
    }

    /// Whether `id` is a send the session has not read yet (client.svelte.ts
    /// `canWithdraw`: its state is pending), held back in the queue or already
    /// among the blocks.
    public static func isQueued(_ id: String, in transcript: SessionTranscript) -> Bool {
        transcript.queued.contains { $0.id == id && ($0.state?.rawValue ?? "pending") == "pending" }
            || transcript.blocks.contains { $0.id == id && $0.state?.rawValue == "pending" }
    }

    /// What a send carried beside its words, for sending it again in its
    /// place: its pasted texts, and its pictures as the hub serves them.
    public static func extras(of id: String, in transcript: SessionTranscript) -> (texts: [(name: String, content: String)], images: [(src: String, mediaType: String)]) {
        guard let raw = (transcript.queued + transcript.blocks).first(where: { $0.id == id }), let block = Block(raw) else { return ([], []) }
        let texts = (block.meta["attachments"] as? [[String: Any]] ?? []).compactMap { attachment -> (name: String, content: String)? in
            guard let content = attachment["content"] as? String else { return nil }
            return (attachment["name"] as? String ?? "Pasted text", content)
        }
        let images = (block.meta["images"] as? [[String: Any]] ?? []).compactMap { image -> (src: String, mediaType: String)? in
            guard let src = image["src"] as? String else { return nil }
            return (src, image["mediaType"] as? String ?? "image/png")
        }
        return (texts, images)
    }

    private static func entry(_ block: Components.Schemas.TranscriptBlock) -> RecallEntry? {
        guard block._type.value3 == .user, block.parentToolUseId == nil else { return nil }
        let state = block.state?.rawValue
        guard state != "cancelled" else { return nil }
        let text = block.content
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !Fold.isHarnessNote(type: "user", content: text) else { return nil }
        return RecallEntry(id: block.id, text: text, date: block.timestamp.flatMap(date), queued: block.queued == true || state == "pending")
    }

    private static func date(_ text: String) -> Date? {
        precise.date(from: text) ?? plain.date(from: text)
    }

    private static let precise: ISO8601DateFormatter = {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format
    }()

    private static let plain = ISO8601DateFormatter()
}
