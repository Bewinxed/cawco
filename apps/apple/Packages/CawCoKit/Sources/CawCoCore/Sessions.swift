public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime
import OSLog

@MainActor @Observable
public final class SessionTranscript {
    public let id: String
    public internal(set) var blocks: [Components.Schemas.TranscriptBlock] = []
    public internal(set) var queued: [Components.Schemas.TranscriptBlock] = []
    public internal(set) var branches: [Components.Schemas.TranscriptPageBranch] = []
    public internal(set) var tail: Components.Schemas.TranscriptTail?
    public internal(set) var facts: Components.Schemas.TranscriptFacts?
    public internal(set) var location: Components.Schemas.TranscriptWhere?
    public internal(set) var cursor: String?
    public internal(set) var loading = true
    public internal(set) var loadingOlder = false
    /// Why the read failed, when it did (client.svelte.ts `readFault`).
    public internal(set) var fault: ReadFault?
    /// The hub answered 404: nothing it or any machine holds goes by this id.
    /// An answer, not a fault: retrying would ask the same question.
    public internal(set) var missing = false
    public internal(set) var blockRevision = 0
    init(_ id: String) { self.id = id }
}

/// A transcript read that failed (client.svelte.ts `pageFault`): the machine
/// holding it is offline (a 503 naming it), or the read failed.
public struct ReadFault: Sendable, Equatable {
    public enum Reason: Sendable { case offline, failed }
    public let reason: Reason
    public let machineId: String?
    public let message: String
}

/// The hub builds the blocks. This store only adopts its page and applies its
/// sequenced changes; it never constructs a conversation from harness frames.
@MainActor @Observable
public final class SessionsStore {
    public private(set) var transcripts: [String: SessionTranscript] = [:]
    @ObservationIgnored private unowned let hub: HubConnection
    @ObservationIgnored private var readers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var watches: [String: Int] = [:]
    @ObservationIgnored private var peeked: String?
    var watched: Set<String> { Set(watches.keys) }
    private let log = Logger(subsystem: "dev.cawco.app", category: "Transcript")

    init(hub: HubConnection) { self.hub = hub }

    public func open(_ id: String) -> SessionTranscript {
        watches[id, default: 0] += 1
        if let existing = transcripts[id] { return existing }
        let transcript = SessionTranscript(id)
        transcripts[id] = transcript
        read(id)
        return transcript
    }

    public func close(_ id: String) {
        guard let count = watches[id] else { return }
        if count > 1 { watches[id] = count - 1; return }
        watches[id] = nil
        readers.removeValue(forKey: id)?.cancel()
        transcripts[id] = nil
        hub.ledger.sync(watched)
    }

    func reset() {
        readers.values.forEach { $0.cancel() }
        readers = [:]
        transcripts = [:]
        watches = [:]
        peeked = nil
        hub.ledger.sync([])
    }

    func reconnected() {
        for id in watched where transcripts[id]?.fault != nil { read(id) }
        hub.ledger.sync(watched)
    }

    /// Peek and delegate readers share the same counted transcript watches as
    /// tabs, so one reader closing never drops another reader's stream.
    public func watchDelegate(_ id: String) { if !id.hasPrefix("run:") { _ = open(id) } }
    public func unwatchDelegate(_ id: String) { close(id) }
    public func setPeeked(_ id: String?) {
        guard peeked != id else { return }
        if let peeked { close(peeked) }
        peeked = id
        if let id, !id.hasPrefix("run:") { _ = open(id) }
    }

    public func read(_ id: String) {
        guard let transcript = transcripts[id], let client = hub.client else { return }
        readers[id]?.cancel()
        transcript.loading = true
        transcript.fault = nil
        transcript.missing = false
        hub.ledger.beginRead(id)
        readers[id] = Task { [weak self] in
            guard let self else { return }
            do {
                let page: Components.Schemas.TranscriptPage
                switch try await client.getApiInstancesByIdTranscript(path: .init(id: id)) {
                case let .ok(ok): page = try ok.body.json
                case .notFound:
                    guard !Task.isCancelled else { return }
                    transcript.loading = false
                    transcript.missing = true
                    return
                case let .undocumented(statusCode, payload):
                    var detail = ""
                    if let body = payload.body { detail = try await String(collecting: body, upTo: 64_000) }
                    // A 503 naming a machine is the hub saying that machine is not connected.
                    if statusCode == 503, let away = payload.headerFields.first(where: { $0.name.canonicalName == "x-cawco-machine" })?.value {
                        let host = hub.fleet.machines.first { $0.machineId == away }?.hostname ?? away
                        throw Fault(ReadFault(reason: .offline, machineId: away,
                                              message: "\(host) is offline — its stored transcript can't be read right now."))
                    }
                    throw Fault(ReadFault(reason: .failed, machineId: nil, message: detail.isEmpty ? "The hub answered \(statusCode)" : detail))
                case let .conflict(answer): throw Fault(try await Self.failed(answer.body.plainText))
                case let .internalServerError(answer): throw Fault(try await Self.failed(answer.body.plainText))
                case let .gatewayTimeout(answer): throw Fault(try await Self.failed(answer.body.plainText))
                case .unprocessableContent: throw Fault(ReadFault(reason: .failed, machineId: nil, message: "The hub refused the read"))
                }
                guard !Task.isCancelled else { return }
                transcript.blocks = page.blocks
                transcript.branches = page.branches
                transcript.queued = page.queued ?? []
                transcript.tail = page.tail
                transcript.facts = page.facts
                transcript.location = page._where
                transcript.cursor = page.cursor
                transcript.blockRevision += 1
                transcript.loading = false
                // The history page and its seq are one atomic view of the hub.
                // Resume after it, including events that arrived during the read.
                if let seq = page.seq { hub.ledger.adoptPage(id, seq: seq) }
                log.info("page adopted for \(id, privacy: .public): \(page.blocks.count) blocks at seq \(page.seq ?? -1)")
                // The older pages fill in behind the newest (client.svelte.ts `readOlder`).
                await readOlder(transcript, client: client)
            } catch {
                guard !Task.isCancelled else { return }
                transcript.loading = false
                transcript.fault = (error as? Fault)?.fault ?? ReadFault(reason: .failed, machineId: nil, message: error.localizedDescription)
                log.error("transcript read: \(transcript.fault?.message ?? "", privacy: .public)")
            }
        }
    }

    private struct Fault: Error { let fault: ReadFault; init(_ fault: ReadFault) { self.fault = fault } }

    private static func failed(_ body: HTTPBody) async throws -> ReadFault {
        ReadFault(reason: .failed, machineId: nil, message: try await String(collecting: body, upTo: 64_000))
    }

    /// Every page older than what the transcript holds, each prepended as it
    /// lands, until the conversation's start or a read again under it.
    private func readOlder(_ transcript: SessionTranscript, client: Client) async {
        transcript.loadingOlder = true
        defer { transcript.loadingOlder = false }
        while let before = transcript.cursor, !Task.isCancelled {
            await Task.yield()
            // TRANSCRIPT_OLDER_PAGE (apps/dashboard/src/lib/config.ts): 250 rows a page behind the newest.
            guard case let .ok(ok) = try? await client.getApiInstancesByIdTranscript(path: .init(id: transcript.id),
                                                                                       query: .init(limit: "250", before: before)),
                  let page = try? ok.body.json, transcript.cursor == before, !Task.isCancelled else { return }
            let held = Set(transcript.blocks.map(\.id))
            transcript.blocks.insert(contentsOf: page.blocks.filter { !held.contains($0.id) }, at: 0)
            transcript.branches.insert(contentsOf: page.branches, at: 0)
            transcript.cursor = page.cursor
            transcript.blockRevision += 1
        }
    }

    func apply(_ id: String, data: Data) {
        guard let transcript = transcripts[id] else { return }
        do {
            // Routing is structural; content is decoded only as generated types.
            guard let frame = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  frame["kind"] as? String == "transcript",
                  let events = frame["events"] as? [[String: Any]] else { return }
            for event in events {
                switch event["type"] as? String {
                case "block.append", "block.insert", "block.update":
                    transcript.blockRevision += 1
                    guard let raw = event["block"] else { continue }
                    let block: Components.Schemas.TranscriptBlock = try decode(raw)
                    if let parent = block.parentToolUseId {
                        if let at = transcript.branches.firstIndex(where: { $0.value1.toolUseId == parent }) {
                            upsert(block, into: &transcript.branches[at].value2.blocks, event: event)
                        }
                    } else { upsert(block, into: &transcript.blocks, event: event) }
                case "block.remove":
                    transcript.blockRevision += 1
                    let removed = event["id"] as? String
                    transcript.blocks.removeAll { $0.id == removed }
                    transcript.queued.removeAll { $0.id == removed }
                case "queue":
                    transcript.blockRevision += 1
                    transcript.queued = try decode(event["blocks"] ?? [])
                case "tail":
                    if let patch = event["tail"] as? [String: Any], let tail = transcript.tail {
                        transcript.tail = try merge(tail, with: patch)
                    }
                case "tail.append":
                    transcript.tail?.streaming += event["streaming"] as? String ?? ""
                    transcript.tail?.thinkingStream += event["thinking"] as? String ?? ""
                case "facts":
                    if let patch = event["facts"] as? [String: Any], let facts = transcript.facts {
                        transcript.facts = try merge(facts, with: patch)
                    }
                case "branch":
                    transcript.blockRevision += 1
                    if let raw = event["branch"] as? [String: Any] {
                        let branch: Components.Schemas.TranscriptBranch = try decode(raw)
                        let at = transcript.branches.firstIndex { $0.value1.toolUseId == branch.toolUseId }
                        var complete = raw
                        complete["blocks"] = try at.map { try JSONSerialization.jsonObject(with: Wire.encoder().encode(transcript.branches[$0].value2.blocks)) } ?? []
                        let pageBranch: Components.Schemas.TranscriptPageBranch = try decode(complete)
                        if let at { transcript.branches[at] = pageBranch } else { transcript.branches.append(pageBranch) }
                    }
                case "reset": read(id); return
                default: break
                }
            }
        } catch {
            transcript.fault = ReadFault(reason: .failed, machineId: nil, message: error.localizedDescription)
            log.error("transcript event unreadable: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func upsert(_ block: Components.Schemas.TranscriptBlock, into blocks: inout [Components.Schemas.TranscriptBlock], event: [String: Any]) {
        if let at = blocks.firstIndex(where: { $0.id == block.id }) { blocks[at] = block; return }
        if event["type"] as? String == "block.insert" {
            let after = event["after"] as? String
            let at = after.flatMap { id in blocks.firstIndex { $0.id == id } }.map { $0 + 1 } ?? 0
            blocks.insert(block, at: at)
        } else { blocks.append(block) }
    }

    private func decode<T: Decodable>(_ raw: Any) throws -> T {
        try Wire.decoder().decode(T.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    private func merge<T: Codable>(_ value: T, with patch: [String: Any]) throws -> T {
        var raw = try JSONSerialization.jsonObject(with: Wire.encoder().encode(value)) as! [String: Any]
        for (key, value) in patch { raw[key] = value }
        return try decode(raw)
    }

    /// A user turn (core `SendPayload`): its words, and what it carries
    /// beside them, images as base64 with no `data:` prefix and texts the
    /// reader attached or pasted at length.
    public func steer(_ row: InstanceRow, text: String, images: [(mediaType: String, data: Data)] = [], texts: [(name: String, content: String)] = []) -> String {
        let uuid = UUID().uuidString.lowercased()
        let message: [String: any Sendable] = [
            "type": "user", "uuid": uuid, "origin": ["kind": "human"],
            "message": ["role": "user", "content": text],
        ]
        var body: [String: any Sendable] = ["instanceId": row.id, "message": message]
        if !images.isEmpty {
            body["images"] = images.map { ["mediaType": $0.mediaType, "data": $0.data.base64EncodedString()] as [String: any Sendable] }
        }
        if !texts.isEmpty {
            body["attachments"] = texts.map { ["kind": "text", "name": $0.name, "content": $0.content] as [String: any Sendable] }
        }
        let payload = try! OpenAPIValueContainer(unvalidatedValue: body)
        return hub.ledger.submit(kind: .send, sessionId: row.id, machineId: row.machineId, payload: payload, settlesAt: .accepted)
    }

    public func stop(_ row: InstanceRow) -> String {
        hub.ledger.submit(kind: .interrupt, sessionId: row.id, machineId: row.machineId,
            payload: try! OpenAPIValueContainer(unvalidatedValue: ["instanceId": row.id, "method": "interrupt", "args": [] as [String]] as [String: any Sendable]), settlesAt: .applied)
    }
}
