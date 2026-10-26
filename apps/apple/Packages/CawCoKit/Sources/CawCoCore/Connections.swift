public import CawCoAPI
public import Foundation
import Observation

public typealias ConnectionView = Components.Schemas.ConnectionView

/// The fleet's connections (a signed-in outside service whose key
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

    /// A typed server address as the hub takes one: an http(s) URL, or none (`serverUrl`).
    public static func serverURL(_ typed: String) -> String? {
        guard var url = URLComponents(string: typed.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host, !host.isEmpty else { return nil }
        // As the web's `URL.href`: the scheme and host lowercased, an empty path made `/`.
        url.scheme = scheme
        url.host = host.lowercased()
        if url.path.isEmpty { url.path = "/" }
        return url.url?.absoluteString
    }

    #if DEBUG
    /// Each new connection's body as it goes to the hub, for the probe's log.
    public static var probeSent: ((String) -> Void)?
    #endif

    /// A new connection to one of the services the page offers, at `url` (the
    /// service's own, or the server address typed for one the person runs); the row exists once this answers.
    public func create(_ service: Words.Connections.Service, way: Words.Connections.Way, account: String, url: String?) async throws -> String {
        typealias Payload = Operations.PostApiConnections.Input.Body.JsonPayload
        let name = Self.name(service: service.service, account: account)
        guard let auth = Payload.AuthPayload(rawValue: way.auth) else { throw URLError(.badURL) }
        let payload = Payload(
            name: name, service: service.service, account: account.trimmingCharacters(in: .whitespaces), transport: .http,
            url: url, auth: auth)
        #if DEBUG
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        if let probeSent = Self.probeSent, let body = try? encoder.encode(payload) {
            probeSent(String(decoding: body, as: UTF8.self))
        }
        #endif
        let output = try await hub.api.connections.create(.init(body: .json(payload)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await read()
        return name
    }

    /// A Linear app's client (connections/+page.svelte `AppDraft`). A GitHub
    /// App is registered by its sign-in, from a manifest the hub posts.
    public enum AppRegistration: Sendable, Equatable {
        case linear(clientId: String, clientSecret: String)
    }

    /// The app's registration, emptied from the fields the moment the hub holds it.
    public func setApp(_ name: String, _ app: AppRegistration) async throws {
        typealias Body = Operations.PutApiConnectionsByNameApp.Input.Body.JsonPayload
        let body: Body = switch app {
        case let .linear(clientId, clientSecret):
            Body(value1: nil, value2: .init(clientId: clientId, clientSecret: clientSecret))
        }
        let output = try await hub.api.connections.setApp(.init(path: .init(name: name), body: .json(body)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await read()
    }

    /// Where a Linear app's sign-in comes back: the URL its settings in Linear
    /// must list (connections/+page.svelte `callbackUrl`), on the dashboard's address.
    public func callbackURL() async throws -> String {
        let dashboard = try await hub.dashboardAddress()
        var origin = URLComponents()
        origin.scheme = dashboard.scheme
        origin.host = dashboard.host
        origin.port = dashboard.port
        origin.path = "/api/connections/oauth/callback"
        return origin.string ?? ""
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
