public import CawCoAPI
public import Foundation
import OpenAPIRuntime

public typealias FleetMcpServer = Components.Schemas.FleetMcpServer

/// How a fleet MCP server runs, as its editor holds it (McpEditor.svelte
/// `build`): a command every machine runs (bunx and a package is one), or
/// an endpoint it calls.
public enum McpRun: Equatable, Sendable {
    case command(command: String, args: [String], env: [(key: String, value: String)])
    case remote(transport: String, url: String, headers: [(key: String, value: String)])

    public static func == (a: McpRun, b: McpRun) -> Bool {
        switch (a, b) {
        case let (.command(c1, a1, e1), .command(c2, a2, e2)): c1 == c2 && a1 == a2 && e1.map(\.key) == e2.map(\.key) && e1.map(\.value) == e2.map(\.value)
        case let (.remote(t1, u1, h1), .remote(t2, u2, h2)): t1 == t2 && u1 == u2 && h1.map(\.key) == h2.map(\.key) && h1.map(\.value) == h2.map(\.value)
        default: false
        }
    }

    /// The server's stored config, read back (fleet.ts `isRemoteMcp`: a remote one has an endpoint).
    public init(_ config: Components.Schemas.FleetMcpConfig) {
        if let remote = config.value3 {
            self = .remote(transport: remote._type.rawValue, url: remote.url, headers: Self.pairs(remote.headers))
        } else if let remote = config.value2 {
            self = .remote(transport: remote._type.rawValue, url: remote.url, headers: Self.pairs(remote.headers))
        } else if let local = config.value1 {
            self = .command(command: local.command, args: local.args ?? [], env: Self.pairs(local.env))
        } else {
            self = .command(command: "", args: [], env: [])
        }
    }

    public var isRemote: Bool {
        if case .remote = self { return true }
        return false
    }

    /// The one line a row shows: the command it runs, or the endpoint it calls (`describeMcp`).
    public var described: String {
        switch self {
        case let .command(command, args, _): ([command] + args).joined(separator: " ")
        case let .remote(_, url, _): url
        }
    }

    private static func pairs(_ container: OpenAPIObjectContainer?) -> [(key: String, value: String)] {
        (container?.value ?? [:]).compactMap { key, value in (value as? String).map { (key, $0) } }.sorted { $0.key < $1.key }
    }

    /// The config as the hub stores it; blank pairs dropped (`pairsToRecord`).
    var json: [String: Any] {
        let record = { (rows: [(key: String, value: String)]) -> [String: String] in
            Dictionary(rows.compactMap { row in
                let key = row.key.trimmingCharacters(in: .whitespaces)
                return key.isEmpty ? nil : (key, row.value)
            }, uniquingKeysWith: { _, last in last })
        }
        switch self {
        case let .command(command, args, env):
            var made: [String: Any] = ["command": command]
            if !args.isEmpty { made["args"] = args }
            let passed = record(env)
            if !passed.isEmpty { made["env"] = passed }
            return made
        case let .remote(transport, url, headers):
            var made: [String: Any] = ["type": transport, "url": url]
            let sent = record(headers)
            if !sent.isEmpty { made["headers"] = sent }
            return made
        }
    }
}

/// The fleet's MCP servers (fleet.ts): saved, removed and synced through
/// the hub, which fans each write out to the machines; the list is the
/// fleet's setup (`FleetConfig`), read again after each write.
@MainActor
public enum FleetMcp {
    /// The charset names are held to, on the hub and here.
    private static let namePattern = "^[A-Za-z0-9_-]+$"
    /// Names Claude Code keeps for its own servers: the hub turns them away, so the form does too.
    private static let reserved = ["workspace", "claude-in-chrome", "computer-use", "claude preview", "claude browser"]

    /// Why a name cannot be used, or nil (`mcpNameProblem`).
    public static func nameProblem(_ name: String, taken: [String]) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return Words.Mcp.problemEmpty }
        if trimmed.range(of: namePattern, options: .regularExpression) == nil { return Words.Mcp.problemCharacters }
        if reserved.contains(trimmed.lowercased()) { return Words.Mcp.problemReserved(name: trimmed) }
        if taken.contains(trimmed) { return Words.Mcp.problemTaken(name: trimmed) }
        return nil
    }

    /// A name for the server a package would run: its last path segment, minus any version (`suggestMcpName`).
    public static func suggestName(_ package: String) -> String {
        let segment = package.trimmingCharacters(in: .whitespaces).split(separator: "/").last.map(String.init) ?? ""
        let at = segment.lastIndex(of: "@").flatMap { $0 > segment.startIndex ? $0 : nil }
        let bare = at.map { String(segment[..<$0]) } ?? segment
        return bare.replacingOccurrences(of: "[^A-Za-z0-9_-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// Splits an args field on runs of whitespace, with no quoting (`splitArgs`).
    public static func splitArgs(_ line: String) -> [String] {
        line.split(whereSeparator: \.isWhitespace).map(String.init)
    }

    /// Saves a server; `projectId` binds it to one project, nil makes it every machine's (`saveMcpServer`).
    public static func save(_ name: String, run: McpRun, enabled: Bool, projectId: String?, hub: HubConnection) async throws {
        var body: [String: Any] = ["config": run.json, "enabled": enabled]
        body["projectId"] = projectId ?? NSNull()
        let payload = try JSONDecoder().decode(Operations.PutApiFleetMcpByName.Input.Body.JsonPayload.self,
                                               from: JSONSerialization.data(withJSONObject: body))
        let output = try await hub.api.fleet.putMCP(.init(path: .init(name: name), body: .json(payload)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
    }

    /// From every machine, into the hub's trash for its Undo.
    public static func remove(_ name: String, hub: HubConnection) async throws -> Components.Schemas.Undoable {
        let output = try await hub.api.fleet.deleteMCP(.init(path: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        let deleted = try ok.body.json
        await hub.configuration.load()
        return deleted
    }

    /// Every machine syncs the fleet's setup again; each row's rollout says how it went.
    public static func syncAll(hub: HubConnection) async throws {
        let output = try await hub.api.fleet.sync(.init(body: .json(.init())))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// The provider's sign-in for a server, as the hub starts it: its authorization page.
    public static func signIn(_ name: String, hub: HubConnection) async throws -> URL {
        let output = try await hub.api.fleet.signInMCP(.init(path: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        guard let auth = URL(string: try ok.body.json.authorizationUrl) else { throw URLError(.badURL) }
        // CawCo's start page (fleet.ts `signInToMcp`): it keeps the dashboard's
        // origin in the browser and hands the provider's answer back only
        // there, where the dashboard's /oauth/mcp page finishes it with the hub.
        let dashboard = try await hub.dashboardAddress()
        // A bare web origin, as a browser's `location.origin` says it: no path, no slash.
        var origin = URLComponents()
        origin.scheme = dashboard.scheme
        origin.host = dashboard.host
        origin.port = dashboard.port
        let hop = try JSONSerialization.data(withJSONObject: ["origin": origin.string ?? "", "auth": auth.absoluteString])
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        guard let start = URL(string: "\(Words.Mcp.oauthUrl)/start#\(hop)") else { throw URLError(.badURL) }
        return start
    }
}
