public import CawCoAPI
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog

// A project's threads with its Caw (hub caw.ts, the web's client.svelte.ts
// "a project's Caw, its threads and views", thread-tabs.ts and
// ThreadPane.svelte): read on connect, kept by `thread.upsert` and
// `thread.message` frames, written to through the hub's thread routes only.

public typealias ThreadSummary = Components.Schemas.ThreadSummary
/// A project's Caw as the hub answers it (`GET`/`PATCH /api/projects/:id/caw`); the mascot is `CawView`.
public typealias CawLeadView = Components.Schemas.CawView

/// How a thread is addressed as a session (thread-tabs.ts): `thread:<id>`,
/// and a thread not started yet, whose first message makes it,
/// `thread:new:<project id>`.
public enum ThreadTabs {
    public static let prefix = "thread:"
    static let newPrefix = "thread:new:"

    /// The session-shaped id a thread is listed, opened and linked by.
    public static func tabId(_ threadId: String) -> String { prefix + threadId }
    /// The tab for a new thread in `projectId`, before its first message.
    public static func newTabId(_ projectId: String) -> String { newPrefix + projectId }
    /// The thread an id names; nil for anything else, a new thread's tab included.
    public static func threadId(of id: String) -> String? {
        id.hasPrefix(prefix) && !id.hasPrefix(newPrefix) ? String(id.dropFirst(prefix.count)) : nil
    }
    /// The project a new thread's tab is for.
    public static func newProject(of id: String) -> String? {
        id.hasPrefix(newPrefix) ? String(id.dropFirst(newPrefix.count)) : nil
    }
    /// A thread's tab or a new thread's: the ids the thread screen draws.
    public static func isThread(_ id: String) -> Bool { id.hasPrefix(prefix) }
}

/// An artifact in a tab of its own (routes/artifact/[id]): its tab's id is the
/// artifact's, under a prefix of its own.
public enum ArtifactTabs {
    public static let prefix = "artifact:"
    public static func tabId(_ artifactId: String) -> String { prefix + artifactId }
    /// The artifact a tab's id names; nil for any other tab.
    public static func artifactId(of id: String) -> String? {
        id.hasPrefix(prefix) ? String(id.dropFirst(prefix.count)) : nil
    }
}

/// One message of a thread (core threads.ts `ThreadMessage`), read off the
/// hub's JSON once: yours, Caw's, or an event that woke him.
public struct ThreadNote: Sendable, Equatable {
    public enum Author: Sendable, Equatable {
        case you, caw, event
    }

    public let id: String
    public let threadId: String
    /// When it was added, ms epoch.
    public let createdAt: Double
    public let author: Author
    public let body: String
    /// An event's one line ("Routine · 3 new GitHub issues").
    public let noteTitle: String?
    /// The tasks Caw's reply is about (`tsk-12`), drawn as cards under it.
    public let tasks: [String]
    /// The project folder's files Caw's reply wrote, drawn as chips under it.
    public let files: [String]
    /// Your answer to his question: the question's JSON, and the answer's.
    let question: Data?
    let answer: Data?
    /// A not-woken note's data: your words he has not read, and why.
    public let notWoken: ThreadNotWoken?
    /// Caw asking whether to build a design system: the project it is for
    /// (EventThreadMessage `designOffer`, held beside a null `event`).
    public let designOffer: String?
    /// What rode with your words, as a send's row carries it (`images`,
    /// `attachments`): the JSON of each, drawn on your row.
    let carried: Data?

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String, let threadId = raw["threadId"] as? String else { return nil }
        switch raw["author"] as? String {
        case "you": author = .you
        case "caw": author = .caw
        case "event": author = .event
        default: return nil
        }
        self.id = id
        self.threadId = threadId
        createdAt = (raw["createdAt"] as? NSNumber)?.doubleValue ?? 0
        body = raw["body"] as? String ?? ""
        noteTitle = raw["noteTitle"] as? String
        tasks = raw["tasks"] as? [String] ?? []
        files = raw["files"] as? [String] ?? []
        question = (raw["question"] as? [String: Any]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        answer = (raw["answer"] as? [String: Any]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        notWoken = ((raw["event"] as? [String: Any])?["notWoken"] as? [String: Any]).flatMap(ThreadNotWoken.init)
        designOffer = (raw["designOffer"] as? [String: Any])?["projectId"] as? String
        var carried: [String: Any] = [:]
        if let images = raw["images"] as? [[String: Any]], !images.isEmpty { carried["images"] = images }
        if let attachments = raw["attachments"] as? [[String: Any]], !attachments.isEmpty { carried["attachments"] = attachments }
        self.carried = carried.isEmpty ? nil : try? JSONSerialization.data(withJSONObject: carried)
    }

    /// A generated message (a frame's, a read's) as one note.
    static func read(_ message: some Encodable) -> ThreadNote? {
        guard let data = try? Wire.encoder().encode(message),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return ThreadNote(raw)
    }

    /// The block's ISO 8601 timestamp, its zone with it (`Z`): the transcript reads no time without one.
    static func stamp(_ ms: Double) -> String {
        Date(timeIntervalSince1970: ms / 1000).formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    /// The message as the transcript's block (ThreadPane.svelte `blockOf`):
    /// your words your turn, Caw's his, an event a code line; your answer to
    /// his question the call that asked it, answered, which the transcript
    /// draws as the settled question card.
    func block(in viewId: String) -> [String: Any] {
        var raw: [String: Any] = ["id": id, "instanceId": viewId, "timestamp": Self.stamp(createdAt)]
        switch author {
        case .caw:
            raw["type"] = "assistant"
            raw["content"] = body
        case .event:
            raw["type"] = "ui.system_note"
            raw["content"] = body
            var metadata: [String: Any] = ["noteTitle": noteTitle ?? "", "noteKind": ThreadNote.cawEvent]
            // What SystemLine draws under it: a design offer's Build and Not now (thread-blocks.ts `eventMetadata`).
            if let designOffer { metadata["designOffer"] = ["projectId": designOffer] }
            raw["metadata"] = metadata
        case .you:
            guard let question = question.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }),
                  let answer = answer.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) else {
                raw["type"] = "user"
                raw["content"] = body
                // What rode with your words, as a send's row carries it (ThreadPane.svelte `blockOf`).
                if let carried = carried.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) {
                    raw["metadata"] = carried
                }
                return raw
            }
            let call = question["toolUseId"] as? String ?? id
            let questions = question["questions"] ?? []
            var result: [String: Any] = ["questions": questions]
            if answer["outcome"] as? String == "answered" {
                result["outcome"] = "answered"
                result["answers"] = answer["answers"] ?? [:]
                if let annotations = answer["annotations"] { result["annotations"] = annotations }
            } else {
                result["outcome"] = "dismissed"
            }
            raw["type"] = "tool.use"
            raw["content"] = ""
            raw["toolCallId"] = call
            raw["metadata"] = [
                "toolName": "AskUserQuestion", "toolId": call, "toolInput": ["questions": questions],
                "toolStatus": "success", "toolUseResult": result,
            ] as [String: Any]
        }
        return raw
    }

    /// The `noteKind` of a thread's event: something that woke a project's Caw (voice.ts `CAW_EVENT`).
    public static let cawEvent = "caw.event"
}

/// Your words in a thread that did not wake Caw (core threads.ts
/// `CawNotWoken`): the message he has not read, why, and the hub's sentence
/// for it.
public struct ThreadNotWoken: Sendable, Equatable {
    public let message: String
    /// `no-machine`, `capped`, `could-not-start`, `place`, `not-taken` or `failed`.
    public let reason: String
    public let words: String

    init?(_ raw: [String: Any]) {
        guard let message = raw["message"] as? String, let reason = raw["reason"] as? String,
              let words = raw["words"] as? String else { return nil }
        self.message = message
        self.reason = reason
        self.words = words
    }
}

/// What a message carries under it, by its block's id (ThreadPane.svelte
/// `setVoice`): a Caw reply's tasks and the files it wrote; a not-woken
/// note's reason, and whether Try again stands under it.
public struct ThreadExtras: Sendable, Equatable {
    public let tasks: [String]
    public let files: [String]
    public let notWoken: ThreadNotWoken?
    /// The note is the one Try again wakes Caw from (ThreadPane.svelte `retryable`).
    public let wakeAgain: Bool
}

/// Every project's threads with its Caw, and the messages of each thread
/// this device has opened: the hub's word, read on connect and kept by its
/// frames (client.svelte.ts `state.threads`, `state.threadMessages`).
@MainActor
@Observable
public final class ThreadsStore {
    /// Each project's threads, newest message first.
    public private(set) var byProject: [String: [ThreadSummary]] = [:]
    /// Each thread by its id.
    public private(set) var byId: [String: ThreadSummary] = [:]
    /// The messages of each thread read here, oldest first; nil until read.
    public private(set) var messages: [String: [ThreadNote]] = [:]
    /// The threads were read once on this connection.
    public private(set) var read = false
    /// Each thread as the transcript's session (ThreadPane.svelte `session`).
    @ObservationIgnored private var transcripts: [String: SessionTranscript] = [:]
    /// His asks that ended with no answer from this device, by thread
    /// (withdrawn before they were answered, or answered elsewhere): each
    /// leaves its quiet line where it was asked (ThreadPane.svelte `withdrawn`).
    private var askEnds: [String: [[String: Any]]] = [:]
    /// The fleet lists the threads as rows (thread-tabs.ts `threadRowOf`).
    @ObservationIgnored var onThreads: () -> Void = {}

    /// The messages that reached a thread while a read of it was on its way,
    /// and how many reads are: a read's answer may have been taken before
    /// them, so it lands them after its own (client.svelte.ts
    /// `heardWhileReading`). Held only while a read is in flight.
    private struct Reading {
        var heard: [ThreadNote] = []
        var reads = 0
    }
    @ObservationIgnored private var heardWhileReading: [String: Reading] = [:]

    private unowned let hub: HubConnection
    private let log = Logger(subsystem: "dev.cawco.app", category: "Threads")

    init(hub: HubConnection) {
        self.hub = hub
    }

    func reset() {
        byProject = [:]
        byId = [:]
        messages = [:]
        askEnds = [:]
        transcripts = [:]
        retried = []
        read = false
        onThreads()
    }

    /// A project's threads, newest first.
    public func of(_ projectId: String) -> [ThreadSummary] { byProject[projectId] ?? [] }

    /// A project's newest conversation with Caw: never its notes thread,
    /// whose messages are the person's notes (CawThread.svelte `newestOf`,
    /// the hub's `newestConversation`).
    public func newestConversation(_ projectId: String) -> ThreadSummary? { of(projectId).first { !$0.notes } }

    /// The thread a `thread:` id names, when the hub has told of it.
    public func thread(_ id: String) -> ThreadSummary? { ThreadTabs.threadId(of: id).flatMap { byId[$0] } }

    // MARK: The hub's word

    /// A thread's row as the hub has it now, in its project's list, newest first (`adoptThread`).
    func adopt(_ thread: ThreadSummary) {
        guard byId[thread.id] != thread else { return }
        byId[thread.id] = thread
        let list = (byProject[thread.projectId] ?? []).filter { $0.id != thread.id } + [thread]
        byProject[thread.projectId] = list.sorted { $0.lastAt != $1.lastAt ? $0.lastAt > $1.lastAt : $0.id > $1.id }
        onThreads()
    }

    /// A message added to a thread read here, or being read; one not read yet is read whole when it opens (`adoptThreadMessage`).
    func adopt(_ note: ThreadNote) {
        heardWhileReading[note.threadId]?.heard.append(note)
        guard var list = messages[note.threadId], !list.contains(where: { $0.id == note.id }) else { return }
        list.append(note)
        messages[note.threadId] = list
        draw(note.threadId, history: false)
    }

    /// Every project's threads (`GET /api/threads`): the whole truth on each connect.
    func readAll() async {
        guard let client = hub.client else { return }
        do {
            let answer = try await client.getApiThreads().ok.body.json
            let threads = try Wire.transcode(answer, as: [String: [ThreadSummary]].self)
            var ids: [String: ThreadSummary] = [:]
            var lists: [String: [ThreadSummary]] = [:]
            for (projectId, list) in threads {
                lists[projectId] = list.sorted { $0.lastAt != $1.lastAt ? $0.lastAt > $1.lastAt : $0.id > $1.id }
                for thread in list { ids[thread.id] = thread }
            }
            byProject = lists
            byId = ids
            read = true
            onThreads()
            log.notice("threads read: \(ids.count, privacy: .public) in \(lists.count, privacy: .public) projects")
        } catch {
            log.error("threads unreadable: \(String(describing: error), privacy: .public)")
        }
    }

    /// Reads a thread whole; its frames keep it from then on (`readThread`).
    /// A frame that lands while the read is on its way is newer than the
    /// read's answer, so the thread is the read's messages and then each such
    /// one the read does not have: the read never drops a message the frames
    /// already brought.
    public func read(projectId: String, threadId: String) async throws {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        heardWhileReading[threadId, default: Reading()].reads += 1
        defer {
            heardWhileReading[threadId]?.reads -= 1
            if heardWhileReading[threadId]?.reads == 0 { heardWhileReading[threadId] = nil }
        }
        let output = try await client.getApiProjectsByIdThreadsByThreadId(path: .init(id: projectId, threadId: threadId))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let read = try ok.body.json
        let notes = read.messages.compactMap(ThreadNote.read)
        var ids = Set(notes.map(\.id))
        let after = (heardWhileReading[threadId]?.heard ?? []).filter { ids.insert($0.id).inserted }
        messages[threadId] = notes + after
        adopt(read.thread)
        draw(threadId, history: true)
        #if DEBUG
        // Its own prefix and a count, never the list: a thread's `probe thread <id> …` line is the pane's state.
        log.notice("probe thread-read \(threadId, privacy: .public) \(read.messages.count, privacy: .public) messages, \((self.messages[threadId] ?? []).count, privacy: .public) held")
        #endif
    }

    /// A thread send that got no answer, in the error formula: what, why,
    /// what is kept, the way back (ThreadPane.svelte `THREAD_SEND_UNREACHED`).
    /// It may have reached him: the same words go again under the id they
    /// went as (ThreadViewController `unanswered`), the same message to the hub.
    public static let sendUnreached =
        "Your message may not have gone: the hub didn't answer. Your words are back in the field. Send again once the hub answers, and it goes once."

    /// A request that got no answer, in the error formula (hub-read.ts `HUB_UNREACHABLE`).
    public static let hubUnreached =
        "The app couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again."

    /// The request got no answer from the hub (hub-read.ts `unreachable`).
    public static func unreachable(_ error: any Error) -> Bool {
        let cause = (error as? ClientError)?.underlyingError ?? error
        return cause is URLError || (cause as? TaskRefusal)?.message == noHub
    }

    /// A failed request as a person reads it (hub-read.ts `failureWords`):
    /// no answer is said in the formula, a refusal in the hub's own words.
    public static func failureWords(_ error: any Error) -> String {
        if unreachable(error) { return hubUnreached }
        let cause = (error as? ClientError)?.underlyingError ?? error
        return (cause as? TaskRefusal)?.message ?? cause.localizedDescription
    }

    private static let noHub = "No hub is connected."

    /// Your words in a thread, or the first of a new one (`sayInThread`,
    /// `startThread`): Caw is woken with them, and with what rides with them
    /// (client.svelte.ts `carriedOf`: its pictures, its texts and the files
    /// already on the hub). `id` is the message's, so its row lands the words
    /// that flew under it. Answers the thread they went to.
    @discardableResult
    public func say(projectId: String, threadId: String?, body: String, id: String,
                    images: [(mediaType: String, data: Data)] = [], texts: [(name: String, content: String)] = [],
                    files: [SentFile] = []) async throws -> ThreadSummary {
        guard let client = hub.client else { throw TaskRefusal(message: Self.noHub) }
        let said: Components.Schemas.ThreadSaid
        if let threadId {
            typealias Said = Operations.PostApiProjectsByIdThreadsByThreadIdMessages.Input.Body.JsonPayload
            let carried = images.map { Said.ImagesPayloadPayload(mediaType: $0.mediaType, data: $0.data.base64EncodedString()) }
            let attached = texts.map { Said.AttachmentsPayloadPayload(value1: .init(kind: .text, name: $0.name, content: $0.content)) }
                + files.map { Said.AttachmentsPayloadPayload(value2: .init(kind: .file, name: $0.name, mediaType: $0.mediaType, size: $0.size, ref: $0.ref)) }
            let output = try await client.postApiProjectsByIdThreadsByThreadIdMessages(
                path: .init(id: projectId, threadId: threadId),
                body: .json(.init(body: body, id: id, images: carried.isEmpty ? nil : carried, attachments: attached.isEmpty ? nil : attached)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            said = try ok.body.json
        } else {
            typealias Started = Operations.PostApiProjectsByIdThreads.Input.Body.JsonPayload
            let carried = images.map { Started.ImagesPayloadPayload(mediaType: $0.mediaType, data: $0.data.base64EncodedString()) }
            let attached = texts.map { Started.AttachmentsPayloadPayload(value1: .init(kind: .text, name: $0.name, content: $0.content)) }
                + files.map { Started.AttachmentsPayloadPayload(value2: .init(kind: .file, name: $0.name, mediaType: $0.mediaType, size: $0.size, ref: $0.ref)) }
            let output = try await client.postApiProjectsByIdThreads(
                path: .init(id: projectId),
                body: .json(.init(body: body, id: id, images: carried.isEmpty ? nil : carried, attachments: attached.isEmpty ? nil : attached)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            said = try ok.body.json
            if messages[said.thread.id] == nil { messages[said.thread.id] = [] }
        }
        if let note = ThreadNote.read(said.message) { adopt(note) }
        adopt(said.thread)
        log.notice("said in thread \(said.thread.id, privacy: .public) as message \(id, privacy: .public)")
        return said.thread
    }

    /// Ask Caw for a view (client.svelte.ts `requestView`): your words go to
    /// him in a thread of their own, and he drafts the view there. `id` is
    /// the ask's: the hub takes the same id again as the same ask. Answers
    /// the thread they went to.
    @discardableResult
    public func requestView(projectId: String, text: String, id: String) async throws -> ThreadSummary {
        guard let client = hub.client else { throw TaskRefusal(message: Self.noHub) }
        let output = try await client.postApiProjectsByIdViewRequests(path: .init(id: projectId), body: .json(.init(text: text, id: id)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let said = try ok.body.json
        if messages[said.thread.id] == nil { messages[said.thread.id] = [] }
        if let note = ThreadNote.read(said.message) { adopt(note) }
        adopt(said.thread)
        log.notice("asked for a view in thread \(said.thread.id, privacy: .public) as message \(id, privacy: .public)")
        return said.thread
    }

    /// His ask in this thread ended with no answer from this device, withdrawn
    /// or answered elsewhere (AskEnd): its quiet line, where it was asked.
    func ended(_ ask: ParkedAsk, line: String) {
        guard let threadId = ask.threadId else { return }
        let note: [String: Any] = [
            "id": "ended:\(ask.requestId)", "instanceId": ThreadTabs.tabId(threadId), "type": "ui.system_note",
            "content": line, "timestamp": ThreadNote.stamp(Date.now.timeIntervalSince1970 * 1000),
        ]
        askEnds[threadId, default: []].append(note)
        draw(threadId, history: false)
    }

    // MARK: The thread as a transcript

    /// The thread as the transcript reads a session: its messages as
    /// blocks, kept current as they change (ThreadPane.svelte `session`).
    public func transcript(_ threadId: String) -> SessionTranscript {
        if let held = transcripts[threadId] { return held }
        let made = SessionTranscript(ThreadTabs.tabId(threadId))
        made.loading = messages[threadId] == nil
        transcripts[threadId] = made
        draw(threadId, history: true)
        return made
    }

    /// A thread not started yet (`thread:new:<project>`): nothing said, nothing to read.
    public func blank(_ projectId: String) -> SessionTranscript {
        let made = SessionTranscript(ThreadTabs.newTabId(projectId))
        made.loading = false
        return made
    }

    /// What Caw's replies and the not-woken notes carry under them, by block id.
    public func extras(_ threadId: String) -> [String: ThreadExtras] {
        let again = wakeAgainNote(threadId)
        var out: [String: ThreadExtras] = [:]
        for note in messages[threadId] ?? [] {
            if note.author == .caw, !note.tasks.isEmpty || !note.files.isEmpty {
                out[note.id] = ThreadExtras(tasks: note.tasks, files: note.files, notWoken: nil, wakeAgain: false)
            } else if let woken = note.notWoken {
                out[note.id] = ThreadExtras(tasks: [], files: [], notWoken: woken, wakeAgain: note.id == again)
            }
        }
        return out
    }

    /// His words as he writes them, while his turn answers your words in this
    /// thread (ThreadPane.svelte `liveWords`), as the thread's live tail: his
    /// plain words in his session after the send `hearing` names, the one he
    /// is writing last, as the hub posts them as his reply when the turn
    /// ends; none once a reply of his stands after your newest words. The
    /// thread screen watches his session while `hearing` names it.
    public func hear(_ threadId: String) {
        guard let transcript = transcripts[threadId] else { return }
        let thread = byId[threadId]
        let busy = thread?.status == .working
        var words = ""
        if let hearing = thread?.hearing, let lead = hub.sessions.transcripts[hearing.instanceId],
           (messages[threadId] ?? []).last(where: { $0.author != .event })?.author == .you,
           let at = lead.blocks.firstIndex(where: { $0.id == hearing.send }) {
            var said = lead.blocks[(at + 1)...]
                .filter { $0._type.value3 == .assistant && $0.parentToolUseId == nil }
                .map(\.content)
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            if let streaming = lead.tail?.streaming, !streaming.isEmpty { said.append(streaming) }
            words = said.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard transcript.tail?.streaming != words || transcript.tail?.busy != busy else { return }
        let raw: [String: Any] = [
            "busy": busy, "streaming": words, "streams": [String: Any](),
            "thinkingClosing": false, "thinkingSince": NSNull(), "thinkingStream": "",
        ]
        transcript.tail = (try? JSONSerialization.data(withJSONObject: raw))
            .flatMap { try? Wire.decoder().decode(Components.Schemas.TranscriptTail.self, from: $0) }
    }

    /// Not-woken notes Try again was pressed on and went: their wake is under way.
    private var retried: Set<String> = []

    /// The one not-woken note that offers Try again (ThreadPane.svelte
    /// `retryable`): the newest, about your newest words, with no reply of
    /// his after them, while no turn of his is on the thread.
    private func wakeAgainNote(_ threadId: String) -> String? {
        let notes = messages[threadId] ?? []
        guard byId[threadId]?.status != .working,
              let at = notes.lastIndex(where: { $0.author == .you && $0.answer == nil }) else { return nil }
        let yours = notes[at]
        let after = notes[(at + 1)...]
        guard !after.contains(where: { $0.author == .caw }),
              let note = after.last(where: { $0.notWoken?.message == yours.id }),
              !retried.contains(note.id) else { return nil }
        return note.id
    }

    /// Try again on a not-woken note (`wakeThread`): Caw woken with your
    /// words he has not read; nothing of yours is added. The thread's frames
    /// carry what comes of it.
    public func wake(projectId: String, threadId: String, note: String) async throws {
        guard let client = hub.client else { throw TaskRefusal(message: Self.noHub) }
        let output = try await client.postApiProjectsByIdThreadsByThreadIdWake(path: .init(id: projectId, threadId: threadId))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        retried.insert(note)
        log.notice("woke Caw again in thread \(threadId, privacy: .public) from note \(note, privacy: .public)")
    }

    private func draw(_ threadId: String, history: Bool) {
        guard let transcript = transcripts[threadId] else { return }
        let viewId = ThreadTabs.tabId(threadId)
        var raws = (messages[threadId] ?? []).map { $0.block(in: viewId) }
        // An ended ask's line stands after what was said before it went.
        for note in askEnds[threadId] ?? [] {
            let at = raws.lastIndex { ($0["timestamp"] as? String ?? "") <= (note["timestamp"] as? String ?? "") }
            raws.insert(note, at: (at ?? -1) + 1)
        }
        let decoder = Wire.decoder()
        transcript.blocks = raws.compactMap { raw in
            (try? JSONSerialization.data(withJSONObject: raw)).flatMap { try? decoder.decode(Components.Schemas.TranscriptBlock.self, from: $0) }
        }
        transcript.loading = messages[threadId] == nil
        transcript.blockRevision += 1
        if history { transcript.historyRevision += 1 }
    }

    // MARK: Caw

    /// A project's Caw: on or off, his harness, his session, why he cannot start (`cawOf`).
    public func caw(_ projectId: String) async throws -> CawLeadView {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdCaw(path: .init(id: projectId))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json
    }

    /// Turns a project's Caw on or off, or moves him to another harness or
    /// model, `model` nil for his harness's default (`configureCaw`). Written
    /// as the JSON itself: the generated body leaves a null model out, and
    /// null is what names the default.
    public func configureCaw(_ projectId: String, on: Bool? = nil, harness: String? = nil,
                             model: String?? = nil, initiated: String? = nil) async throws -> CawLeadView {
        guard let address = hub.address else { throw TaskRefusal(message: "No hub is connected.") }
        var change: [String: Any] = [:]
        if let on { change["on"] = on }
        if let harness { change["harness"] = harness }
        if let model { change["model"] = model ?? NSNull() }
        if let initiated { change["initiated"] = initiated }
        var request = URLRequest.hub(address.appending(path: "api/projects").appending(path: projectId).appending(path: "caw"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: change)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw TaskRefusal(message: Wire.reason(data, status: status)) }
        return try Wire.decoder().decode(CawLeadView.self, from: data)
    }

    /// A file of the project's folder as it reads on the hub (FolderFiles.svelte `read`).
    public func file(_ projectId: String, path: String) async throws -> String {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdFolderFile(path: .init(id: projectId), query: .init(path: path))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json.content
    }
}

/// RFC 6902 over JSON read by JSONSerialization: the operations the hub's
/// plan deltas use (add, replace, remove, and copy, move and test).
enum JSONPatch {
    static func apply(_ operations: [[String: Any]], to document: [String: Any]) -> [String: Any]? {
        var root: Any = document
        for operation in operations {
            guard let op = operation["op"] as? String, let path = operation["path"] as? String,
                  let tokens = pointer(path) else { return nil }
            switch op {
            case "add", "replace":
                guard let value = operation["value"], let next = set(root, tokens, value, insert: op == "add") else { return nil }
                root = next
            case "remove":
                guard let next = remove(root, tokens) else { return nil }
                root = next
            case "copy", "move":
                guard let from = (operation["from"] as? String).flatMap(pointer), let value = get(root, from) else { return nil }
                if op == "move" { guard let next = remove(root, from) else { return nil }; root = next }
                guard let next = set(root, tokens, value, insert: true) else { return nil }
                root = next
            case "test":
                guard let value = get(root, tokens), let want = operation["value"],
                      NSDictionary(dictionary: ["v": value]).isEqual(to: ["v": want]) else { return nil }
            default:
                return nil
            }
        }
        return root as? [String: Any]
    }

    private static func pointer(_ path: String) -> [String]? {
        if path.isEmpty { return [] }
        guard path.hasPrefix("/") else { return nil }
        return path.dropFirst().split(separator: "/", omittingEmptySubsequences: false).map {
            $0.replacingOccurrences(of: "~1", with: "/").replacingOccurrences(of: "~0", with: "~")
        }
    }

    private static func get(_ node: Any, _ tokens: [String]) -> Any? {
        guard let head = tokens.first else { return node }
        let rest = Array(tokens.dropFirst())
        if let object = node as? [String: Any] { return object[head].flatMap { get($0, rest) } }
        if let array = node as? [Any], let index = Int(head), array.indices.contains(index) { return get(array[index], rest) }
        return nil
    }

    private static func set(_ node: Any, _ tokens: [String], _ value: Any, insert: Bool) -> Any? {
        guard let head = tokens.first else { return value }
        let rest = Array(tokens.dropFirst())
        if var object = node as? [String: Any] {
            if rest.isEmpty {
                object[head] = value
            } else {
                guard let child = object[head], let next = set(child, rest, value, insert: insert) else { return nil }
                object[head] = next
            }
            return object
        }
        if var array = node as? [Any] {
            if rest.isEmpty {
                if head == "-" { array.append(value); return array }
                guard let index = Int(head) else { return nil }
                if insert {
                    guard index <= array.count else { return nil }
                    array.insert(value, at: index)
                } else {
                    guard array.indices.contains(index) else { return nil }
                    array[index] = value
                }
                return array
            }
            guard let index = Int(head), array.indices.contains(index), let next = set(array[index], rest, value, insert: insert) else { return nil }
            array[index] = next
            return array
        }
        return nil
    }

    private static func remove(_ node: Any, _ tokens: [String]) -> Any? {
        guard let head = tokens.first else { return nil }
        let rest = Array(tokens.dropFirst())
        if var object = node as? [String: Any] {
            if rest.isEmpty { guard object.removeValue(forKey: head) != nil else { return nil }; return object }
            guard let child = object[head], let next = remove(child, rest) else { return nil }
            object[head] = next
            return object
        }
        if var array = node as? [Any], let index = Int(head), array.indices.contains(index) {
            if rest.isEmpty { array.remove(at: index); return array }
            guard let next = remove(array[index], rest) else { return nil }
            array[index] = next
            return array
        }
        return nil
    }
}
