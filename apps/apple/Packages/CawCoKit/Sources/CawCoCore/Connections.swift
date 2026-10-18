public import CawCoAPI
public import Foundation
import Observation

public typealias ConnectionView = Components.Schemas.ConnectionView

/// The fleet's connections (WORDS.md: a signed-in outside service whose key
/// the hub holds; connections.ts on the hub), as Configure › Connections
/// reads and changes them. Read when the section opens, after each change,
/// and every two seconds while a sign-in is under way, until its row moves on.
@MainActor
@Observable
public final class FleetConnections {
    @ObservationIgnored private let hub: HubConnection
    /// As the hub last answered; nil until the first read lands.
    public private(set) var rows: [ConnectionView]?
    /// Why the list could not be read.
    public private(set) var problem: String?

    public init(hub: HubConnection) {
        self.hub = hub
    }

    public func read() async {
        do {
            let output = try await hub.api.connections.list()
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            rows = try ok.body.json.connections
            problem = nil
        } catch {
            problem = Words.Connections.unread(clause: ThreadsStore.failureWords(error))
        }
    }

    /// A connection's name from its service and the account's words: `github-brand` (`nameFor`).
    public static func name(service: String, account: String) -> String {
        let words = account.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let made = words.isEmpty ? service : "\(service)-\(words)"
        return String(made.prefix(24)).replacingOccurrences(of: "-+$", with: "", options: .regularExpression)
    }

    /// A new connection to one of the services the page offers; the row exists once this answers.
    public func create(_ service: Words.Connections.Service, way: Words.Connections.Way, account: String) async throws -> String {
        typealias Payload = Operations.PostApiConnections.Input.Body.JsonPayload
        let name = Self.name(service: service.service, account: account)
        guard let auth = Payload.AuthPayload(rawValue: way.auth) else { throw URLError(.badURL) }
        let output = try await hub.api.connections.create(.init(body: .json(Payload(
            name: name, service: service.service, account: account.trimmingCharacters(in: .whitespaces), transport: .http,
            url: service.url, auth: auth))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await read()
        return name
    }

    /// The key, emptied from the field the moment the hub holds it.
    public func setKey(_ name: String, key: String) async throws {
        let output = try await hub.api.connections.setKey(.init(path: .init(name: name), body: .json(.init(key: key))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await read()
    }

    /// The projects that may use it.
    public func setProjects(_ name: String, projects: [String]) async throws {
        let output = try await hub.api.connections.update(.init(path: .init(name: name), body: .json(.init(projects: projects))))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let next = try ok.body.json
        if let at = rows?.firstIndex(where: { $0.name == next.name }) { rows?[at] = next }
    }

    /// Into the hub's trash, key and projects with it, for its Undo.
    public func remove(_ name: String) async throws -> Components.Schemas.Undoable {
        let output = try await hub.api.connections.remove(.init(path: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        rows?.removeAll { $0.name == name }
        return try ok.body.json
    }

    /// The provider's sign-in, which hands back to the dashboard's address, where it finishes with the hub.
    public func signIn(_ name: String) async throws -> URL {
        let dashboard = try await hub.dashboardAddress()
        var origin = URLComponents()
        origin.scheme = dashboard.scheme
        origin.host = dashboard.host
        origin.port = dashboard.port
        let output = try await hub.api.connections.signIn(.init(path: .init(name: name), body: .json(.init(origin: origin.string))))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        guard let url = URL(string: try ok.body.json.authorizationUrl) else { throw URLError(.badURL) }
        await read()
        return url
    }
}
