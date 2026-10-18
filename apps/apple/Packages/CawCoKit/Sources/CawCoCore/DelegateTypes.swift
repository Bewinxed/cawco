public import CawCoAPI
public import Foundation
import Observation

public typealias DelegateType = Components.Schemas.DelegateType

/// One project's own delegate types (delegate-types.ts `ProjectTypes`): the
/// files in its `delegates/` folder, which its sessions pick before a fleet
/// type of the same name, and the files there that made no type.
public struct ProjectTypes: Sendable {
    public let projectId: String
    public let projectName: String
    /// Each with the file it was read from (`path`) and whether it replaces a fleet type (`shadows`).
    public let types: [Components.Schemas.CatalogType]
    public let problems: [Components.Schemas.TypeFileProblem]
}

/// The fleet's delegate types (delegate-types.ts, config/store.svelte.ts
/// `types`): the presets a session's `delegate` call routes against. Read
/// when Configure › Delegate types opens; a save answers with the row as
/// the hub stored it, put in its place; a delete answers what its Undo
/// restores, and the row leaves at once.
@MainActor
@Observable
public final class FleetDelegateTypes {
    @ObservationIgnored private let hub: HubConnection
    /// As the hub last answered; nil until the first read lands.
    public private(set) var types: [DelegateType]?
    /// Why the list could not be read.
    public private(set) var problem: String?
    /// The row this screen just added or brought back (`store.mark`).
    public private(set) var flash: String?

    public init(hub: HubConnection) {
        self.hub = hub
    }

    /// Each project's own types (store.svelte.ts `projectTypes`); nil until the first read lands.
    public private(set) var projectTypes: [ProjectTypes]?
    /// Why the projects' types could not be read.
    public private(set) var projectProblem: String?

    /// The fleet's types and, beside them, each project's own.
    public func read() async {
        async let projects: Void = readProjects()
        do {
            guard let client = hub.client else { throw TaskRefusal(message: Words.Configure.hubDown) }
            let output = try await client.getApiDelegateTypes()
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            types = try ok.body.json.types
            problem = nil
        } catch {
            problem = ThreadsStore.failureWords(error)
        }
        await projects
    }

    private func readProjects() async {
        do {
            projectTypes = try await Self.projects(hub: hub)
            projectProblem = nil
        } catch {
            projectProblem = ThreadsStore.failureWords(error)
        }
    }

    /// Every project's catalog (`GET /api/projects/:id/delegate-types`): the
    /// types its `delegates/` folder holds and the files there that made none.
    /// A project with neither is left out.
    public static func projects(hub: HubConnection) async throws -> [ProjectTypes] {
        guard let client = hub.client else { throw TaskRefusal(message: Words.Configure.hubDown) }
        let listed = try await client.getApiProjects()
        guard case let .ok(ok) = listed else { throw await TaskRefusal.reading(listed) }
        let projects = try ok.body.json
        let catalogs = try await withThrowingTaskGroup(of: (Int, ProjectTypes).self) { group in
            for (at, project) in projects.enumerated() {
                group.addTask {
                    let output = try await client.getApiProjectsByIdDelegateTypes(path: .init(id: project.id))
                    guard case let .ok(read) = output else { throw await TaskRefusal.reading(output) }
                    let catalog = try read.body.json
                    return (at, ProjectTypes(projectId: project.id, projectName: project.name,
                                             types: catalog.types.filter { $0.value2.source == .project },
                                             problems: catalog.problems))
                }
            }
            var found: [(Int, ProjectTypes)] = []
            for try await entry in group { found.append(entry) }
            return found.sorted { $0.0 < $1.0 }.map(\.1)
        }
        return catalogs.filter { !$0.types.isEmpty || !$0.problems.isEmpty }
    }

    /// Create and edit are the same route on the hub: `PUT` upserts by name.
    @discardableResult
    public func save(_ type: DelegateType) async throws -> DelegateType {
        guard let client = hub.client else { throw TaskRefusal(message: Words.Configure.hubDown) }
        typealias Payload = Operations.PutApiDelegateTypesByName.Input.Body.JsonPayload
        guard let harness = Payload.HarnessPayload(rawValue: type.harness.rawValue) else {
            throw TaskRefusal(message: Words.DelegateTypes.problemHarness(harness: type.harness.rawValue))
        }
        // Every field the row holds goes back, so a save keeps what this editor does not show (its account, its connections).
        let payload = Payload(description: type.description, harness: harness, model: type.model,
                              effort: type.effort.flatMap { Payload.EffortPayload(rawValue: $0.rawValue) }, skills: type.skills,
                              denyTools: type.denyTools, canDelegate: type.canDelegate, cawcoTodos: type.cawcoTodos,
                              account: type.account, connections: type.connections)
        let output = try await client.putApiDelegateTypesByName(path: .init(name: type.name), body: .json(payload))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let saved = try ok.body.json
        if let at = types?.firstIndex(where: { $0.name == saved.name }) {
            types?[at] = saved
        } else {
            types = (types ?? []) + [saved]
        }
        return saved
    }

    /// Into the hub's trash: the row leaves at once, and what comes back is its Undo.
    public func remove(_ name: String) async throws -> Components.Schemas.Undoable {
        guard let client = hub.client else { throw TaskRefusal(message: Words.Configure.hubDown) }
        let output = try await client.deleteApiDelegateTypesByName(path: .init(name: name))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        types?.removeAll { $0.name == name }
        return try ok.body.json
    }

    /// The row this screen just changed: it comes up from faint in the list.
    public func mark(_ name: String) {
        flash = name
    }

    /// The flash has been drawn.
    public func marked() {
        flash = nil
    }
}

/// Undo, for every Configure delete (config/undo.ts): the hub's trash puts the
/// item back whole and answers it as its list reads it.
@MainActor
public enum FleetTrash {
    public static func restore(_ deleted: Components.Schemas.Undoable, hub: HubConnection) async throws {
        guard let client = hub.client else { throw TaskRefusal(message: Words.Configure.hubDown) }
        let output = try await client.postApiTrashByIdRestore(path: .init(id: .init(value1: deleted.restore)))
        // The hub says why in a sentence: its window ran out, or its name is taken.
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }
}
