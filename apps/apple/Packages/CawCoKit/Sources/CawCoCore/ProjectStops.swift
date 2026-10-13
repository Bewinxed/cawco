public import CawCoAPI
public import Foundation

/// One running session of a project, in tree order (parents first): what a forget stops first.
public typealias RunningSession = Components.Schemas.RunningSession
public typealias ProjectStopFrame = Components.Schemas.ProjectStopFrame

/// What a forget asks of the hub before it deletes (client.svelte.ts
/// `projectRunning`, `stopProjectSessions`): what runs, and to stop it.
/// Each stop's outcome arrives later as a `project.stop` frame
/// (`HubConnection.onProjectStop`), once its machine confirms the end.
public struct ProjectStops: Sendable {
    let client: Client
    public let projectId: String

    @MainActor
    public init(hub: HubConnection, projectId: String) throws {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        self.client = client
        self.projectId = projectId
    }

    public func running() async throws -> [RunningSession] {
        let output = try await client.getApiProjectsByIdRunning(path: .init(id: projectId))
        if case let .ok(ok) = output { return try ok.body.json.sessions }
        throw await TaskRefusal.reading(output)
    }

    /// Stops `ids` in one request; each one's end is told by its frame.
    public func stop(_ ids: [String]) async throws {
        let output = try await client.postApiProjectsByIdStop(path: .init(id: projectId), body: .json(.init(instanceIds: ids)))
        if case .ok = output { return }
        throw await TaskRefusal.reading(output)
    }
}
