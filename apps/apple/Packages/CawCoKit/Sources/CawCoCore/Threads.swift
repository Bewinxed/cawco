public import CawCoAPI
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog

// A project's threads with its Caw (hub caw.ts, the web's client.svelte.ts
// "a project's Caw, its threads and views", thread-tabs.ts and
// ThreadPane.svelte): their rows read on connect and kept by `thread.upsert`
// frames. A thread is addressed as a session (`thread:<id>`): its transcript
// is read and followed through `SessionsStore` and a send to it goes through
// the one send path, as any session's (hub thread-transcript.ts).

public typealias ThreadSummary = Components.Schemas.ThreadSummary
/// A project's Caw as the hub answers it (`GET`/`PATCH /api/projects/:id/caw`); the mascot is `CawView`.
public typealias CawLeadView = Components.Schemas.CawView

/// How a thread is addressed as a session (thread-tabs.ts, core threads.ts
/// `threadTarget`): `thread:<id>`, wherever a session is addressed by its
/// id. A thread not started yet has its id already, minted as a send's is
/// (`newTabId`): its first send carries its project, and the hub makes the
/// thread under that id.
public enum ThreadTabs {
    public static let prefix = "thread:"

    /// The session-shaped id a thread is listed, opened and linked by.
    public static func tabId(_ threadId: String) -> String { prefix + threadId }
    /// A new thread of `projectId`'s: its id minted here, its project kept
    /// for its first send (`mintedProject`).
    @MainActor
    public static func newTabId(_ projectId: String) -> String {
        let id = tabId(UUID().uuidString.lowercased())
        minted[id] = projectId
        return id
    }
    /// The thread an id names; nil for anything else.
    public static func threadId(of id: String) -> String? {
        id.hasPrefix(prefix) ? String(id.dropFirst(prefix.count)) : nil
    }
    /// The project of a thread this device minted and the hub has not made yet.
    @MainActor
    public static func mintedProject(of id: String) -> String? { minted[id] }
    /// A thread's tab: the ids the thread screen draws.
    public static func isThread(_ id: String) -> Bool { id.hasPrefix(prefix) }
    /// The threads this device minted, by tab id: their project.
    @MainActor private static var minted: [String: String] = [:]
    /// The `noteKind` of a thread's event: something that woke a project's Caw (core `CAW_EVENT_NOTE`).
    public static let cawEvent = "caw.event"
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

/// What one of Caw's replies carries under it, by its block's id
/// (ThreadPane.svelte `setVoice`): the tasks it is about and the files it
/// wrote, from the block's metadata.
public struct ThreadExtras: Sendable, Equatable {
    public let tasks: [String]
    public let files: [String]

    public init(tasks: [String], files: [String]) {
        self.tasks = tasks
        self.files = files
    }

    /// What each of a thread's replies carries, by block id, read off its transcript's blocks.
    public static func of(_ blocks: [Components.Schemas.TranscriptBlock]) -> [String: ThreadExtras] {
        var out: [String: ThreadExtras] = [:]
        for block in blocks {
            let tasks = block.metadata?.tasks ?? []
            let files = block.metadata?.files ?? []
            if !tasks.isEmpty || !files.isEmpty { out[block.id] = ThreadExtras(tasks: tasks, files: files) }
        }
        return out
    }
}

/// Every project's threads with its Caw: the hub's word, read on connect
/// and kept by its frames (client.svelte.ts `state.threads`).
@MainActor
@Observable
public final class ThreadsStore {
    /// Each project's threads, newest message first.
    public private(set) var byProject: [String: [ThreadSummary]] = [:]
    /// Each thread by its id.
    public private(set) var byId: [String: ThreadSummary] = [:]
    /// The threads were read once on this connection.
    public private(set) var read = false
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

    /// An ask of Caw's that got no answer (a view asked for), in the error
    /// formula: what, why, what is kept, the way back (hub-read.ts
    /// `THREAD_SEND_UNREACHED`). It may have reached him: the same words go
    /// again under the id they went as, the same ask to the hub.
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

    /// A new thread of the project's, opened by your words: its id minted
    /// here (`ThreadTabs.newTabId`) and your words its first send, through
    /// the one send path as any session's (`SessionsStore.steer`), carrying
    /// the project the hub makes it in. Answers the thread's tab id.
    @discardableResult
    public func start(projectId: String, text: String) -> String {
        let viewId = ThreadTabs.newTabId(projectId)
        _ = hub.sessions.steer(sessionId: viewId, machineId: "hub", text: text, projectId: projectId)
        log.notice("started thread \(viewId, privacy: .public) in project \(projectId, privacy: .public)")
        return viewId
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
        adopt(said.thread)
        log.notice("asked for a view in thread \(said.thread.id, privacy: .public) as message \(id, privacy: .public)")
        return said.thread
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
