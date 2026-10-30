public import CawCoAPI
public import Foundation
import OpenAPIRuntime
import OSLog

// A project's conversation as the hub answers it (hub caw.ts, the web's
// client.svelte.ts "a project's conversation and views"): the session its
// events reach, a session like any other, read and followed through
// `SessionsStore`. What only the project carries is read here: its
// conversation's view, a view asked of it, its folder's files.

/// A project's conversation as the hub answers it (`GET`/`PATCH /api/projects/:id/caw`); the mascot is `CawView`.
public typealias ConversationView = Components.Schemas.ProjectConversationView

/// The `noteKind` of a project note's line in its conversation's transcript (core `CAW_EVENT_NOTE`).
public enum ProjectNotes {
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

/// What only a project carries of its conversation: its view, a view asked
/// of it, its folder's files; and the words every failed request is said in.
@MainActor
public final class CawStore {
    private unowned let hub: HubConnection
    private let log = Logger(subsystem: "dev.cawco.app", category: "Caw")

    init(hub: HubConnection) {
        self.hub = hub
    }

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

    /// Ask Caw for a view (client.svelte.ts `requestView`): your words go to
    /// the project's conversation, which drafts the view. Answers the session
    /// they went to.
    @discardableResult
    public func requestView(projectId: String, text: String) async throws -> String {
        guard let client = hub.client else { throw TaskRefusal(message: Self.noHub) }
        let output = try await client.postApiProjectsByIdViewRequests(path: .init(id: projectId), body: .json(.init(text: text)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let said = try ok.body.json
        log.notice("asked for a view in conversation \(said.instanceId, privacy: .public)")
        return said.instanceId
    }

    /// A project's Caw: on or off, his harness, his session, why he cannot start (`cawOf`).
    public func caw(_ projectId: String) async throws -> ConversationView {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdCaw(path: .init(id: projectId))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json
    }

    /// Turns a project's Caw on or off, or moves him to another harness or
    /// model, `model` nil for his harness's default (`configureCaw`);
    /// `stopping`, turning him off, names what he started that stops now,
    /// the rest finishing. Written
    /// as the JSON itself: the generated body leaves a null model out, and
    /// null is what names the default.
    public func configureCaw(_ projectId: String, on: Bool? = nil, harness: String? = nil,
                             model: String?? = nil, stopping: [String]? = nil) async throws -> ConversationView {
        guard let address = hub.address else { throw TaskRefusal(message: "No hub is connected.") }
        var change: [String: Any] = [:]
        if let on { change["on"] = on }
        if let harness { change["harness"] = harness }
        if let model { change["model"] = model ?? NSNull() }
        if let stopping { change["initiated"] = ["stop": stopping] }
        var request = URLRequest.hub(address.appending(path: "api/projects").appending(path: projectId).appending(path: "caw"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: change)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw TaskRefusal(message: Wire.reason(data, status: status)) }
        return try Wire.decoder().decode(ConversationView.self, from: data)
    }

    /// A file of the project's folder as it reads on the hub (FolderFiles.svelte `read`).
    public func file(_ projectId: String, path: String) async throws -> String {
        guard let client = hub.client else { throw TaskRefusal(message: Self.noHub) }
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
