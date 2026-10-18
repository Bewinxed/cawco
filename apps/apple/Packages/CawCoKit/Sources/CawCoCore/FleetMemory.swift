public import CawCoAPI
public import Foundation

public typealias MemoryScope = Components.Schemas.MemoryScope

/// One memory file as the fleet keeps it: the main CLAUDE.md, or a document under memories/.
public struct MemoryFile: Equatable, Sendable {
    public let content: String
    public let hash: String
    public let updatedAt: Date
    /// A document's sessions; nil for the main file and a linked document.
    public let scope: MemoryScope?

    public init(content: String, hash: String, updatedAt: Date, scope: MemoryScope?) {
        self.content = content
        self.hash = hash
        self.updatedAt = updatedAt
        self.scope = scope
    }
}

/// A version a memory file used to be.
public struct MemoryVersion: Sendable {
    public let id: Int
    public let bytes: Double
    public let createdAt: Date
    public let hash: String
    /// `fleet`, or `machine:<machineId>` for a copy an adopt or an overwrite replaced.
    public let source: String
}

/// The fleet's memory (fleet.ts, config/memory.ts): the user CLAUDE.md every
/// session loads flat, the documents it links under memories/ (a
/// `models/<model>.md` is put in front of the session running that model),
/// and the scoped documents a role, a project or both loads. A save names
/// the version it started from; one that moved on since is refused, and the
/// latest comes back for the editor to show.
@MainActor
public enum FleetMemory {
    /// The main file's name, as a URL and a list say it (memory.ts `MAIN`).
    public static let main = "CLAUDE.md"

    /// The main file as the fleet's setup holds it, or a document by its path.
    public static func file(_ path: String, hub: HubConnection) -> MemoryFile? {
        guard let fleet = hub.configuration.snapshot else { return nil }
        if path == main {
            return fleet.memory.map { MemoryFile(content: $0.content, hash: $0.hash, updatedAt: $0.updatedAt, scope: nil) }
        }
        return fleet.memoryDocs.first { $0.path == path }.map { MemoryFile(content: $0.content, hash: $0.hash, updatedAt: $0.updatedAt, scope: $0.scope) }
    }

    /// How long ago, as the dashboard says it (utils/time.ts `formatDistanceToNow`).
    public static func ago(_ date: Date, now: Date = .now) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 5 { return Words.Memory.justNow }
        if seconds < 60 { return Words.Memory.ago(span: "\(seconds)s") }
        let minutes = seconds / 60
        if minutes < 60 { return Words.Memory.ago(span: "\(minutes)m") }
        let hours = minutes / 60
        if hours < 24 { return Words.Memory.ago(span: "\(hours)h") }
        let days = hours / 24
        if days < 7 { return Words.Memory.ago(span: "\(days)d") }
        if days / 7 < 4 { return Words.Memory.ago(span: "\(days / 7)w") }
        if days / 30 < 12 { return Words.Memory.ago(span: "\(days / 30)mo") }
        return Words.Memory.ago(span: "\(days / 365)y")
    }

    /// A file's name on the page (memory.ts `fileLabel`).
    public static func fileLabel(_ path: String) -> String {
        path == main ? "\(Words.Skills.userLayer)/\(main)" : "\(Words.Skills.userLayer)/memories/\(path)"
    }

    /// A document's name: a linked one by the file it lands at, a scoped one by its path (`docLabel`).
    public static func docLabel(_ path: String, scope: MemoryScope?) -> String {
        scoped(scope) ? path : fileLabel(path)
    }

    /// The scope names sessions of its own (core `scoped`).
    public static func scoped(_ scope: MemoryScope?) -> Bool {
        scope?.briefer == true || scope?.role != nil || scope?.model != nil || !(scope?.delegateTypes ?? []).isEmpty || !(scope?.projectIds ?? []).isEmpty
    }

    /// The scope places it in its projects' folders: projects and nothing else (core `placedOnly`).
    public static func placedOnly(_ scope: MemoryScope?) -> Bool {
        !(scope?.projectIds ?? []).isEmpty && !(scope?.briefer == true || scope?.role != nil || scope?.model != nil || !(scope?.delegateTypes ?? []).isEmpty)
    }

    /// Two scopes the same: every field, every list sorted (core `scopeKey`).
    public static func sameScope(_ a: MemoryScope?, _ b: MemoryScope?) -> Bool {
        a?.role?.rawValue == b?.role?.rawValue && (a?.delegateTypes ?? []).sorted() == (b?.delegateTypes ?? []).sorted()
            && a?.model == b?.model && (a?.projectIds ?? []).sorted() == (b?.projectIds ?? []).sorted() && (a?.briefer == true) == (b?.briefer == true)
    }

    /// Names in a sentence: `A`, `A and B`, `A, B and C`.
    private static func listed(_ names: [String]) -> String {
        names.count < 2 ? names.first ?? "" : names.dropLast().joined(separator: ", ") + Words.Memory.scopeAnd + (names.last ?? "")
    }

    /// The sessions a scope loads a document into, each project by its name (core `scopeWords`).
    public static func loadedInto(_ scope: MemoryScope?, projects: [Components.Schemas.GetApiProjects200Payload]) -> String {
        let types = (scope?.delegateTypes ?? []).isEmpty ? nil : Words.Memory.scopeDelegates(types: listed(scope?.delegateTypes ?? []))
        let model = scope?.model.map { Words.Memory.scopeOnModels(model: $0) }
        if scope?.briefer == true {
            return Words.Memory.scopeBriefing(about: [types ?? Words.Memory.scopeAnyDelegate, model].compactMap(\.self).joined(separator: " "))
        }
        let role = scope?.role?.rawValue
        let ids = scope?.projectIds ?? []
        let named = listed(ids.map { id in projects.first { $0.id == id }?.name ?? Words.Memory.scopeGone })
        let projectWords = ids.isEmpty ? nil : named
        let who = [role.map { $0 == "orchestrator" ? Words.Memory.orchestrator : Words.Memory.leaf }, types].compactMap(\.self)
        let subject = who.isEmpty ? nil : Words.Memory.scopeSessionsOf(who: who.joined(separator: " "))
        let narrowing = [model, projectWords.map { Words.Memory.scopeIn(projects: $0) }].compactMap(\.self)
        if subject == nil, narrowing.isEmpty { return Words.Memory.scopeNone }
        if subject != nil, narrowing.isEmpty, types == nil, let role { return Words.Memory.scopeEvery(role: role) }
        if subject == nil, let projectWords, model == nil { return Words.Memory.scopeEveryIn(projects: projectWords) }
        return ([subject ?? Words.Memory.scopeSessions] + narrowing).joined(separator: " ")
    }

    /// What a save came to: written, or refused because the fleet's copy moved on, with that copy.
    public enum Saved {
        case written
        case conflict(MemoryFile)
    }

    /// Writes a file; `expectedHash` is the version the edit started from.
    public static func save(_ path: String, content: String, expectedHash: String?, scope: MemoryScope?, hub: HubConnection) async throws -> Saved {
        if path == main {
            let output = try await hub.api.fleet.putMemory(.init(body: .json(.init(content: content, expectedHash: expectedHash))))
            switch output {
            case .ok:
                await hub.configuration.load()
                return .written
            case let .conflict(refused):
                let latest = try refused.body.json
                return .conflict(MemoryFile(content: latest.content, hash: latest.hash, updatedAt: latest.updatedAt, scope: nil))
            default:
                throw await TaskRefusal.reading(output)
            }
        }
        var body: [String: Any] = ["path": path, "content": content]
        if let expectedHash { body["expectedHash"] = expectedHash }
        if let scope, scoped(scope) { body["scope"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(scope)) }
        let payload = try JSONDecoder().decode(Operations.PutApiFleetMemoryDocs.Input.Body.JsonPayload.self, from: JSONSerialization.data(withJSONObject: body))
        let output = try await hub.api.fleet.putMemoryDoc(.init(body: .json(payload)))
        switch output {
        case .ok:
            await hub.configuration.load()
            return .written
        case let .conflict(refused):
            let latest = try refused.body.json
            return .conflict(MemoryFile(content: latest.content, hash: latest.hash, updatedAt: latest.updatedAt, scope: latest.scope))
        default:
            throw await TaskRefusal.reading(output)
        }
    }

    /// The main file takes the documents it links with it (a scoped one stays); a document goes alone.
    public static func remove(_ path: String, hub: HubConnection) async throws -> Components.Schemas.Undoable {
        let deleted: Components.Schemas.Undoable
        if path == main {
            let output = try await hub.api.fleet.deleteMemory(.init())
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            deleted = try ok.body.json
        } else {
            let output = try await hub.api.fleet.deleteMemoryDoc(.init(body: .json(.init(path: path))))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            deleted = try ok.body.json
        }
        await hub.configuration.load()
        return deleted
    }

    /// What a file used to say, newest first.
    public static func history(_ path: String, hub: HubConnection) async throws -> [MemoryVersion] {
        let output = try await hub.api.fleet.memoryHistory(.init(query: .init(path: path == main ? nil : path)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json.map { MemoryVersion(id: Int($0.id), bytes: $0.bytes, createdAt: $0.createdAt, hash: $0.hash, source: $0.source) }
    }

    /// One version's words.
    public static func version(_ id: Int, hub: HubConnection) async throws -> String {
        let output = try await hub.api.fleet.memoryRevision(.init(path: .init(id: String(id))))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json.value2.content
    }

    /// A version written back as the file, keeping what it replaces; the file as it now stands.
    public static func restore(_ id: Int, path: String, hub: HubConnection) async throws -> MemoryFile? {
        let output = try await hub.api.fleet.restoreMemory(.init(body: .json(.init(id: Double(id)))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
        return file(path, hub: hub)
    }

    /// A machine's own copy of the file, or nil when it has none.
    public static func peek(_ machineId: String, path: String, hub: HubConnection) async throws -> String? {
        let output = try await hub.api.fleet.peekMemory(.init(body: .json(.init(machineId: machineId))))
        switch output {
        case let .ok(ok):
            let set = try ok.body.json
            return path == main ? set.content : set.docs?.first { $0.path == path }?.content
        case .noContent:
            return nil
        default:
            throw await TaskRefusal.reading(output)
        }
    }

    /// The machine's copy taken as the fleet's.
    public static func adopt(_ machineId: String, path: String, hub: HubConnection) async throws -> MemoryFile? {
        let output = try await hub.api.fleet.adoptMemory(.init(body: .json(.init(machineId: machineId, path: path == main ? nil : path))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
        return file(path, hub: hub)
    }

    /// The fleet's copy sent over the one the machine edited.
    public static func push(_ machineId: String, path: String, hub: HubConnection) async throws {
        let output = try await hub.api.fleet.pushMemory(.init(body: .json(.init(machineId: machineId, path: path == main ? nil : path))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// Why a new document's path cannot be used (core `memoryDocProblem`, and the list's own).
    public static func newPathProblem(_ path: String, taken: [String]) -> String? {
        if path.isEmpty { return Words.Memory.needsPath }
        if taken.contains(path) { return Words.Memory.alreadyLinked(path: path) }
        let said: String? = if !path.hasSuffix(".md") {
            Words.Memory.problemNotMarkdown
        } else if path.hasPrefix("/") || path.range(of: "^[A-Za-z]:", options: .regularExpression) != nil {
            Words.Memory.problemAbsolute(path: path, layer: "\(Words.Skills.userLayer)/memories")
        } else if path.contains("\\") {
            Words.Memory.problemBackslash(path: path)
        } else if path.contains("@") {
            Words.Memory.problemAt(path: path)
        } else if path.split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) {
            Words.Memory.problemSegments(path: path)
        } else if path.split(separator: "/").contains(where: { $0.hasPrefix(".") }) {
            Words.Memory.problemDotted(path: path)
        } else {
            nil
        }
        // A sentence, as the popover says it: its first letter up, a full stop after.
        return said.map { $0.prefix(1).uppercased() + $0.dropFirst() + "." }
    }

    /// A new, empty document; it exists once the hub has it.
    public static func create(_ path: String, hub: HubConnection) async throws -> Saved {
        try await save(path, content: "", expectedHash: nil, scope: nil, hub: hub)
    }
}
