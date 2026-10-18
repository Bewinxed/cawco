public import CawCoAPI
public import Foundation

public typealias FleetSkill = Components.Schemas.FleetSkillMeta
public typealias FleetPlugin = Components.Schemas.FleetPlugin
public typealias FleetMarketplace = Components.Schemas.FleetMarketplace
public typealias MarketplacePluginInfo = Components.Schemas.MarketplacePluginInfo

/// A version a fleet row used to be (PreviousVersions.svelte `ListedVersion`).
public struct SkillVersion: Sendable {
    public let id: Int
    public let name: String
    public let hash: String
    public let createdAt: Date
    /// `fleet` for the hub's own row; `machine:<machineId>` for a copy an overwrite took off it.
    public let source: String
}

/// The fleet's skills, plugins and marketplaces (fleet.ts): fetched once at
/// the hub for every machine. A fetch answers at once with the row marked
/// `fetching`, because a large repo outlasts any request; what came of it is
/// the `fleet.fetch` frame that follows, which these calls wait for.
@MainActor
public enum FleetSkills {
    /// The charset skill names are held to, on the hub and here.
    private static let namePattern = "^[A-Za-z0-9._-]+$"
    /// The source forms the hub's resolver takes as they are.
    private static let scheme = "^(skills:|github:|npm:|https?://)"
    /// The words an installer command line is built out of, stripped down to the slug they surround.
    private static let wrappers: Set<String> = ["bunx", "bun", "npx", "npm", "pnpm", "pnpx", "yarn", "dlx", "x", "run", "skills", "add", "install", "i"]

    /// Why a name cannot be used, or nil (`skillNameProblem`).
    public static func nameProblem(_ name: String, taken: [String]) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return Words.Skills.problemEmpty }
        if trimmed.range(of: namePattern, options: .regularExpression) == nil { return Words.Skills.problemCharacters }
        if taken.contains(trimmed) { return Words.Skills.problemTaken(name: trimmed) }
        return nil
    }

    /// The source a paste really names: an installer command line keeps its slug (`normalizeSkillSource`).
    public static func normalize(_ input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: scheme, options: .regularExpression) != nil { return trimmed }
        guard let slug = trimmed.split(whereSeparator: \.isWhitespace).map(String.init)
            .first(where: { !$0.hasPrefix("-") && !wrappers.contains($0.lowercased()) }) else { return "" }
        return slug.range(of: scheme, options: .regularExpression) != nil ? slug : "skills:\(slug)"
    }

    /// The name a source suggests: the skill it filters for, or its path's last segment (`suggestSkillName`).
    public static func suggestName(_ source: String) -> String {
        let named = source.range(of: "^(skills|github|npm):", options: .regularExpression)
        let schemeWord = named.map { String(source[$0].dropLast()) }
        let rest = named.map { String(source[$0.upperBound...]) } ?? source
        let body = rest.split(separator: "#", omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let at = body.lastIndex(of: "@").flatMap { $0 > body.startIndex ? $0 : nil }
        // `@` names the skill in a `skills:` slug, and a ref or a version elsewhere.
        let filter = at.flatMap { (schemeWord == nil || schemeWord == "skills") ? String(body[body.index(after: $0)...]) : nil } ?? ""
        var segments = (at.map { String(body[..<$0]) } ?? body).split(whereSeparator: { $0 == "/" || $0 == "?" }).map(String.init)
        // A plain URL points at the skill's own file; the directory holds its name.
        if segments.last?.lowercased() == "skill.md" { segments.removeLast() }
        let picked = filter.isEmpty ? segments.last ?? "" : filter
        return picked.replacingOccurrences(of: "[^A-Za-z0-9._-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// The same source, narrowed to one skill of a repo that holds several (`pickSkill`).
    public static func pick(_ source: String, choice: String) -> String {
        let hash = source.firstIndex(of: "#")
        let body = hash.map { String(source[..<$0]) } ?? source
        let at = body.lastIndex(of: "@").flatMap { $0 > body.startIndex ? $0 : nil }
        return "\(at.map { String(body[..<$0]) } ?? body)@\(choice)\(hash.map { String(source[$0...]) } ?? "")"
    }

    /// A resolved size, in the units a download is talked about in (`formatBytes`).
    public static func bytes(_ count: Double) -> String {
        if count < 1024 { return "\(Int(count)) B" }
        let kb = count / 1024
        if kb < 1024 { return kb < 10 ? String(format: "%.1f kB", kb) : "\(Int(kb.rounded())) kB" }
        let mb = kb / 1024
        return mb < 10 ? String(format: "%.1f MB", mb) : "\(Int(mb.rounded())) MB"
    }

    /// Waits for the frame that lands what `ask` started (`untilFetched`): the
    /// answer itself when it was not still fetching.
    private static func untilFetched<T>(_ hub: HubConnection, pick: @escaping (Components.Schemas.FleetFetchFrame) -> T?,
                                        fetching: (T) -> Bool, ask: () async throws -> T) async throws -> T {
        let from = hub.fleetFetchCount
        let answered = try await ask()
        guard fetching(answered) else { return answered }
        let deadline = Date.now.addingTimeInterval(600)
        while Date.now < deadline {
            let since = hub.fleetFetchCount - from
            for frame in hub.fleetFetches.suffix(max(0, min(since, hub.fleetFetches.count))) {
                if let landed = pick(frame), !fetching(landed) { return landed }
            }
            guard hub.state == .connected else { throw TaskRefusal(message: Words.Configure.hubDown) }
            try await Task.sleep(for: .milliseconds(300))
        }
        throw URLError(.timedOut)
    }

    /// Stores a skill and resolves it at the hub for every machine; comes back once it landed, `choices` and all.
    public static func save(_ name: String, source: String, projectId: String?, hub: HubConnection) async throws -> FleetSkill {
        try await untilFetched(hub, pick: { $0.skill?.name == name ? $0.skill : nil }, fetching: { $0.fetching == true }) {
            var body: [String: Any] = ["source": source, "enabled": true]
            body["projectId"] = projectId ?? NSNull()
            let payload = try JSONDecoder().decode(Operations.PutApiFleetSkillsByName.Input.Body.JsonPayload.self,
                                                   from: JSONSerialization.data(withJSONObject: body))
            let output = try await hub.api.fleet.putSkill(.init(path: .init(name: name), body: .json(payload)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
    }

    /// On or off: the stored flag, nothing fetched.
    public static func switchSkill(_ name: String, on: Bool, hub: HubConnection) async throws {
        let output = try await hub.api.fleet.switchSkill(.init(path: .init(name: name), body: .json(.init(enabled: on))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
    }

    /// The same source resolved again; back once the fetch landed, its `error` and all.
    @discardableResult
    public static func refetchSkill(_ name: String, hub: HubConnection) async throws -> FleetSkill {
        try await untilFetched(hub, pick: { $0.skill?.name == name ? $0.skill : nil }, fetching: { $0.fetching == true }) {
            let output = try await hub.api.fleet.refreshSkill(.init(path: .init(name: name)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
    }

    public static func removeSkill(_ name: String, hub: HubConnection) async throws -> Components.Schemas.Undoable {
        let output = try await hub.api.fleet.deleteSkill(.init(path: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
        return try ok.body.json
    }

    /// What a skill used to be, newest first, without its files.
    public static func history(_ name: String, hub: HubConnection) async throws -> [SkillVersion] {
        let output = try await hub.api.fleet.skillHistory(.init(query: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        return try ok.body.json.map { SkillVersion(id: Int($0.id), name: $0.name, hash: $0.hash, createdAt: $0.createdAt, source: $0.source) }
    }

    /// A past version written back as the fleet's copy, keeping what it replaces.
    public static func restore(_ id: Int, hub: HubConnection) async throws {
        let output = try await hub.api.fleet.restoreSkill(.init(body: .json(.init(id: Double(id)))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
    }

    // MARK: Plugins

    /// Installs a plugin; back once its bytes landed.
    @discardableResult
    public static func install(_ id: String, hub: HubConnection) async throws -> FleetPlugin {
        try await untilFetched(hub, pick: { $0.plugin?.id == id ? $0.plugin : nil }, fetching: { $0.fetching == true }) {
            let output = try await hub.api.fleet.putPlugin(.init(path: .init(id: id), body: .json(.init(enabled: true))))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
    }

    public static func switchPlugin(_ id: String, on: Bool, hub: HubConnection) async throws {
        let output = try await hub.api.fleet.switchPlugin(.init(path: .init(id: id), body: .json(.init(enabled: on))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
    }

    @discardableResult
    public static func refetchPlugin(_ id: String, hub: HubConnection) async throws -> FleetPlugin {
        try await untilFetched(hub, pick: { $0.plugin?.id == id ? $0.plugin : nil }, fetching: { $0.fetching == true }) {
            let output = try await hub.api.fleet.refreshPlugin(.init(path: .init(id: id)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
    }

    public static func removePlugin(_ id: String, hub: HubConnection) async throws -> Components.Schemas.Undoable {
        let output = try await hub.api.fleet.deletePlugin(.init(path: .init(id: id)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
        return try ok.body.json
    }

    // MARK: Marketplaces

    /// What the marketplace at `source` reads as, once the hub has read it.
    private static func read(_ source: String, hub: HubConnection) async throws -> Components.Schemas.MarketplaceRead {
        try await untilFetched(hub, pick: { $0.marketplace?.source == source ? $0.marketplace : nil }, fetching: { $0.fetching == true }) {
            let output = try await hub.api.fleet.readMarketplace(.init(query: .init(source: source)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
    }

    /// What the marketplace calls itself in its own marketplace.json: the one name it can be linked under.
    public static func marketplaceName(_ source: String, hub: HubConnection) async throws -> String {
        let read = try await read(source, hub: hub)
        guard let name = read.name else { throw TaskRefusal(message: Words.Skills.couldNotRead(what: source, why: said(read.error))) }
        return name
    }

    /// The hub's reason, its full stop dropped where a sentence ends after it; or that it said nothing.
    private static func said(_ error: String?) -> String {
        (error ?? Words.Skills.saidNothing).replacingOccurrences(of: "\\.+$", with: "", options: .regularExpression)
    }

    /// What a linked marketplace offers, read by the hub from its source.
    public static func catalog(_ row: FleetMarketplace, hub: HubConnection) async throws -> [MarketplacePluginInfo] {
        let read = try await read(row.source, hub: hub)
        if let error = read.error { throw TaskRefusal(message: Words.Skills.couldNotRead(what: row.name, why: said(error))) }
        return read.plugins ?? []
    }

    /// Links the marketplace at `source`; back with its row once the hub has read and linked it.
    public static func link(_ source: String, hub: HubConnection) async throws -> FleetMarketplace {
        let link = try await untilFetched(hub, pick: { $0.link?.source == source ? $0.link : nil }, fetching: { $0.fetching == true }) {
            let output = try await hub.api.fleet.linkMarketplace(.init(body: .json(.init(source: source))))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            return try ok.body.json
        }
        guard let marketplace = link.marketplace else { throw TaskRefusal(message: Words.Skills.couldNotLink(what: source, why: said(link.error))) }
        await hub.configuration.load()
        return marketplace
    }

    public static func unlink(_ name: String, hub: HubConnection) async throws -> Components.Schemas.Undoable {
        let output = try await hub.api.fleet.deleteMarketplace(.init(path: .init(name: name)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        await hub.configuration.load()
        return try ok.body.json
    }

    /// A skill somebody wrote on one machine, taken into the fleet (`adoptSkill`).
    public static func adopt(_ name: String, machineId: String, hub: HubConnection) async throws {
        try await hub.configuration.adoptSkill(name, machineId: machineId)
        await hub.configuration.load()
    }
}
