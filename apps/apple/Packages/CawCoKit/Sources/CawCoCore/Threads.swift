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
public typealias ProjectSpend = Components.Schemas.ProjectSpend

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
    }

    /// A generated message (a frame's, a read's) as one note.
    static func read(_ message: some Encodable) -> ThreadNote? {
        guard let data = try? Wire.encoder().encode(message),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return ThreadNote(raw)
    }

    static func stamp(_ ms: Double) -> String {
        Date(timeIntervalSince1970: ms / 1000).formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true))
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
            raw["metadata"] = ["noteTitle": noteTitle ?? "", "noteKind": ThreadNote.cawEvent]
        case .you:
            guard let question = question.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }),
                  let answer = answer.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) else {
                raw["type"] = "user"
                raw["content"] = body
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

/// What a Caw reply carries under it, by its block's id: the tasks it is
/// about and the files it wrote (ThreadPane.svelte `setVoice`).
public struct ThreadExtras: Sendable, Equatable {
    public let tasks: [String]
    public let files: [String]
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
    /// His questions withdrawn before they were answered, by thread: each
    /// leaves its quiet line where it was asked (ThreadPane.svelte `withdrawn`).
    private var withdrawn: [String: [[String: Any]]] = [:]
    /// The fleet lists the threads as rows (thread-tabs.ts `threadRowOf`).
    @ObservationIgnored var onThreads: () -> Void = {}

    private unowned let hub: HubConnection
    private let log = Logger(subsystem: "dev.cawco.app", category: "Threads")

    init(hub: HubConnection) {
        self.hub = hub
    }

    func reset() {
        byProject = [:]
        byId = [:]
        messages = [:]
        withdrawn = [:]
        transcripts = [:]
        read = false
        onThreads()
    }

    /// A project's threads, newest first.
    public func of(_ projectId: String) -> [ThreadSummary] { byProject[projectId] ?? [] }

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

    /// A message added to a thread read here; one not read yet is read whole when it opens (`adoptThreadMessage`).
    func adopt(_ note: ThreadNote) {
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
    public func read(projectId: String, threadId: String) async throws {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdThreadsByThreadId(path: .init(id: projectId, threadId: threadId))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let read = try ok.body.json
        messages[threadId] = read.messages.compactMap(ThreadNote.read)
        adopt(read.thread)
        draw(threadId, history: true)
        #if DEBUG
        let said = (messages[threadId] ?? []).map { "\($0.author)" }.joined(separator: ",")
        log.notice("probe thread \(threadId, privacy: .public) read: \(read.messages.count, privacy: .public) messages [\(said, privacy: .public)]")
        #endif
    }

    /// Your words in a thread, or the first of a new one (`sayInThread`,
    /// `startThread`): Caw is woken with them. `id` is the message's, so its
    /// row lands the words that flew under it. Answers the thread they went to.
    @discardableResult
    public func say(projectId: String, threadId: String?, body: String, id: String) async throws -> ThreadSummary {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let said: Components.Schemas.ThreadSaid
        if let threadId {
            let output = try await client.postApiProjectsByIdThreadsByThreadIdMessages(
                path: .init(id: projectId, threadId: threadId), body: .json(.init(body: body, id: id)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            said = try ok.body.json
        } else {
            let output = try await client.postApiProjectsByIdThreads(path: .init(id: projectId), body: .json(.init(body: body, id: id)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            said = try ok.body.json
            if messages[said.thread.id] == nil { messages[said.thread.id] = [] }
        }
        if let note = ThreadNote.read(said.message) { adopt(note) }
        adopt(said.thread)
        log.notice("said in thread \(said.thread.id, privacy: .public) as message \(id, privacy: .public)")
        return said.thread
    }

    /// His question in this thread was withdrawn before it was answered: its quiet line, where it was asked.
    func withdraw(_ ask: ParkedAsk, reason: String?) {
        guard let threadId = ask.threadId else { return }
        let line = ask.isQuestion ? "Question withdrawn" : "Permission request withdrawn"
        let note: [String: Any] = [
            "id": "withdrawn:\(ask.requestId)", "instanceId": ThreadTabs.tabId(threadId), "type": "ui.system_note",
            "content": reason.map { "\(line): it couldn't be shown (\($0))" } ?? line,
            "timestamp": ThreadNote.stamp(Date.now.timeIntervalSince1970 * 1000),
        ]
        withdrawn[threadId, default: []].append(note)
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

    /// What Caw's replies carry under them, by block id.
    public func extras(_ threadId: String) -> [String: ThreadExtras] {
        var out: [String: ThreadExtras] = [:]
        for note in messages[threadId] ?? [] where note.author == .caw && (!note.tasks.isEmpty || !note.files.isEmpty) {
            out[note.id] = ThreadExtras(tasks: note.tasks, files: note.files)
        }
        return out
    }

    private func draw(_ threadId: String, history: Bool) {
        guard let transcript = transcripts[threadId] else { return }
        let viewId = ThreadTabs.tabId(threadId)
        var raws = (messages[threadId] ?? []).map { $0.block(in: viewId) }
        // A withdrawn question's line stands after what was said before it went.
        for note in withdrawn[threadId] ?? [] {
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
        var request = URLRequest(url: address.appending(path: "api/projects").appending(path: projectId).appending(path: "caw"))
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

    /// What a project has spent: today, this month, its Caw's share (`projectSpend`).
    public func spend(_ projectId: String) async throws -> ProjectSpend {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdSpend(path: .init(id: projectId))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json
    }
}

/// One step of a session's plan (core plan.ts `PlanStep`).
public struct PlanStep: Sendable, Equatable {
    public let id: String
    public let content: String
    public let depth: Int
    /// `pending`, `in_progress` or `completed`.
    public let status: String
}

/// A session's plan as the hub keeps it (core plan.ts `SessionPlan`): its
/// steps, else a task attempt's to-dos as steps.
public struct SessionPlan: Sendable, Equatable {
    public let steps: [PlanStep]
    /// The spec's Markdown, once the session has written one.
    public let spec: String?

    init(_ raw: [String: Any]) {
        let steps = (raw["steps"] as? [[String: Any]] ?? []).enumerated().map { index, step in
            PlanStep(id: step["id"] as? String ?? "\(index)", content: step["content"] as? String ?? "",
                     depth: (step["depth"] as? NSNumber)?.intValue ?? 0, status: step["status"] as? String ?? "pending")
        }
        let todos = (raw["todos"] as? [[String: Any]] ?? []).enumerated().map { index, todo in
            PlanStep(id: todo["path"] as? String ?? "\(index)", content: todo["text"] as? String ?? "",
                     depth: (todo["depth"] as? NSNumber)?.intValue ?? 0, status: todo["done"] as? Bool == true ? "completed" : "pending")
        }
        self.steps = steps.isEmpty ? todos : steps
        spec = (raw["spec"] as? [String: Any])?["markdown"] as? String
    }

    /// How far along it is (PlanPane.svelte `planProgress`).
    public var done: Int { steps.filter { $0.status == "completed" }.count }
    /// It has anything to show (PlanPane.svelte `planShows`).
    public var shows: Bool { !steps.isEmpty || spec != nil }
}

/// The plans this device follows beside the sessions it streams (a thread
/// showing its lead's plan): `plan.follow` names them, the hub answers each
/// new one with its `plan.snapshot`, then `plan.delta`s (client.svelte.ts
/// `watchPlan`, core plan.ts).
@MainActor
@Observable
public final class PlanFollows {
    public private(set) var plans: [String: SessionPlan] = [:]
    @ObservationIgnored private var held: [String: (rev: Int, raw: [String: Any])] = [:]
    @ObservationIgnored private var readers: [String: Int] = [:]
    @ObservationIgnored private var sent: [String]?
    @ObservationIgnored var post: (Data) -> Bool = { _ in false }
    private let log = Logger(subsystem: "dev.cawco.app", category: "Plan")

    /// One more reader of a session's plan; it stays followed while any remains.
    public func follow(_ instanceId: String) {
        readers[instanceId, default: 0] += 1
        sync()
    }

    /// A reader let go; the last one stops following it.
    public func unfollow(_ instanceId: String) {
        guard let count = readers[instanceId] else { return }
        if count > 1 {
            readers[instanceId] = count - 1
            return
        }
        readers[instanceId] = nil
        held[instanceId] = nil
        plans[instanceId] = nil
        sync()
    }

    /// The socket opened: the hub follows nothing for it yet.
    func reconnected() {
        sent = nil
        held = [:]
        sync()
    }

    private func sync() {
        let ids = readers.keys.sorted()
        guard ids != sent else { return }
        let message: [String: Any] = ["type": "plan.follow", "instanceIds": ids]
        guard let data = try? JSONSerialization.data(withJSONObject: message), post(data) else { return }
        sent = ids
    }

    /// A `plan.snapshot` or `plan.delta` off the socket.
    func take(_ data: Data) {
        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = raw["instanceId"] as? String, readers[id] != nil,
              let rev = (raw["rev"] as? NSNumber)?.intValue else { return }
        switch raw["type"] as? String {
        case "plan.snapshot":
            held[id] = (rev, raw)
        case "plan.delta":
            // A gap, or a patch that does not apply: the hub sends it whole.
            guard let before = held[id], before.rev == rev - 1, let patch = raw["patch"] as? [[String: Any]],
                  let after = JSONPatch.apply(patch, to: before.raw) else {
                let resync: [String: Any] = ["type": "plan.resync", "instanceId": id]
                if let ask = try? JSONSerialization.data(withJSONObject: resync) { _ = post(ask) }
                log.notice("plan \(id.prefix(8), privacy: .public) delta \(rev, privacy: .public) not applied: asked whole")
                return
            }
            held[id] = (rev, after)
        default:
            return
        }
        if let now = held[id] {
            let plan = SessionPlan(now.raw)
            if plans[id] != plan { plans[id] = plan }
        }
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
