import CawCoAPI
import CawCoCore
import Foundation

/// A hub block as the renderers read it: the generated block's fields, and
/// its metadata as the plain JSON the web's renderers read (`Message` in
/// apps/dashboard/src/lib/cawco/types.ts). Read once per block revision.
struct Block {
    let id: String
    let type: String
    let content: String
    let timestamp: String?
    /// A send's record: `failed`, `pending` or `read`.
    let state: String?
    let toolCallId: String?
    let sdkUuid: String?
    let parentToolUseId: String?
    let queued: Bool
    let meta: [String: Any]
    /// The block's encoded bytes: what tells one revision of it from the next.
    let signature: Data

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return encoder
    }()

    init?(_ block: Components.Schemas.TranscriptBlock) {
        guard let data = try? Self.encoder.encode(block),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        self.init(raw, signature: data)
    }

    init(_ raw: [String: Any], signature: Data) {
        id = raw["id"] as? String ?? ""
        type = raw["type"] as? String ?? ""
        content = raw["content"] as? String ?? ""
        timestamp = raw["timestamp"] as? String
        state = raw["state"] as? String
        toolCallId = raw["toolCallId"] as? String
        sdkUuid = raw["sdkUuid"] as? String
        parentToolUseId = raw["parentToolUseId"] as? String
        queued = raw["queued"] as? Bool ?? false
        meta = raw["metadata"] as? [String: Any] ?? [:]
        self.signature = signature
    }

    func string(_ key: String) -> String? {
        meta[key] as? String
    }

    var toolName: String? { string("toolName") }
    var toolId: String? { string("toolId") }
    var toolInput: [String: Any] { meta["toolInput"] as? [String: Any] ?? [:] }
    /// `pending` until a result says otherwise.
    var toolStatus: String { string("toolStatus") ?? "pending" }
    var toolResult: String? { string("toolResult") }
    /// The disclosure key a call's row opens by (disclosure.svelte.ts).
    var disclosureKey: String { toolCallId ?? id }

    var date: Date? {
        guard let timestamp else { return nil }
        if let read = Block.read[timestamp] { return read }
        let date = Block.iso.date(from: timestamp) ?? Block.isoPlain.date(from: timestamp)
        Block.read[timestamp] = date
        return date
    }

    /// Timestamps already read, by their text: every build asks for every
    /// turn's, and reading one is slow. Blocks are only read on the main actor.
    private nonisolated(unsafe) static var read: [String: Date] = [:]

    private nonisolated(unsafe) static let iso: ISO8601DateFormatter = {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format
    }()

    private nonisolated(unsafe) static let isoPlain = ISO8601DateFormatter()
}

/// A subagent's branch as the web's `SubagentState` holds it: the hub's
/// branch, its blocks and the text it is streaming.
struct Branch {
    let toolUseId: String
    let status: String
    let subagentType: String
    let description: String?
    let model: String?
    let result: String?
    let error: String?
    let summary: String?
    let lastToolName: String?
    let startedAt: Date?
    let completedAt: Date?
    let blocks: [Block]
    let streaming: String
    let signature: Data

    init?(_ branch: Components.Schemas.TranscriptPageBranch, blocks: [Block], streaming: String) {
        guard let data = try? JSONEncoder().encode(branch.value1),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        toolUseId = raw["toolUseId"] as? String ?? ""
        status = raw["status"] as? String ?? "running"
        subagentType = raw["subagentType"] as? String ?? "subagent"
        description = raw["description"] as? String
        model = raw["model"] as? String
        result = raw["result"] as? String
        error = raw["error"] as? String
        summary = raw["summary"] as? String
        lastToolName = raw["lastToolName"] as? String
        let parse = ISO8601DateFormatter()
        parse.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func date(_ key: String) -> Date? {
            (raw[key] as? String).flatMap { parse.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) }
        }
        startedAt = date("startedAt")
        completedAt = date("completedAt")
        self.blocks = blocks
        self.streaming = streaming
        var signature = data
        for block in blocks { signature.append(block.signature) }
        signature.append(Data(streaming.utf8))
        self.signature = signature
    }

    var running: Bool { status == "starting" || status == "running" }
}
