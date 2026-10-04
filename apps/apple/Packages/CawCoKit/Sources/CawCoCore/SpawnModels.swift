public import CawCoAPI
import Foundation

// What the new-session form picks from and remembers, as the dashboard keeps
// it: spawn/model-entries.ts, models.svelte.ts, provider.ts,
// spawn/modelUse.svelte.ts and spawnPrefs.svelte.ts. Harness, effort and
// permission mode travel as the wire's own strings.

/// A model as the picker lists it (model-entries.ts `ModelEntry`).
public struct ModelEntry: Sendable, Equatable {
    public var id: String
    public var name: String
    public var mono: Bool
    public var provider: String?
    public var released: String?
    public var lastUsedAt: String?
    public var isDefault: Bool
    public var isCustom: Bool
    public var contextWindow: Double?
    /// The effort the CLI applies when a spawn omits effort, where the harness measured it.
    public var defaultEffort: String?
    public var effort: [String]
    public var aliases: [String]
}

public enum ModelCatalog {
    /// The harnesses cawco spawns on, in their order (core HARNESSES).
    public static let harnesses = ["claude", "opencode", "pi"]

    /// What a harness is called where it is named.
    public static func harnessName(_ harness: String) -> String {
        ["claude": "Claude Code", "codex": "Codex", "opencode": "OpenCode", "pi": "Pi"][harness] ?? harness
    }

    /// A harness's models (models.svelte.ts `catalog` through model-catalog.ts
    /// `modelsForHarness`): what the machines report, else what a running
    /// session of it answered; one row a model id; given `machineIds`, a
    /// reported row only when every one of them reports it, since a spawn
    /// resolves its model on the machine it runs on. Claude rows carry the
    /// context window the hub has seen a turn report.
    @MainActor
    public static func models(_ fleet: FleetStore, harness: String, machineIds: [String]) -> [Components.Schemas.ModelInfo] {
        var reported: [(machineId: String, model: Components.Schemas.ModelInfo)] = []
        for machine in fleet.machines {
            for report in machine.harnesses ?? [] where report.harness.rawValue == harness {
                for model in report.models ?? [] { reported.append((machine.machineId, model)) }
            }
        }
        var seen = Set<String>()
        var rows: [Components.Schemas.ModelInfo] = []
        if reported.isEmpty {
            rows = SpawnMemory.offered(harness).filter { seen.insert($0.value).inserted }
        } else {
            for row in reported where !seen.contains(row.model.value) {
                let everywhere = machineIds.allSatisfy { id in reported.contains { $0.machineId == id && $0.model.value == row.model.value } }
                guard everywhere else { continue }
                seen.insert(row.model.value)
                rows.append(row.model)
            }
        }
        guard harness == "claude" else { return rows }
        return rows.map { row in
            var row = row
            if let window = SpawnMemory.claudeWindows[row.resolvedModel ?? row.value] { row.contextWindow = window }
            return row
        }
    }

    /// Asks a running session of `harness` what it offers, when no machine
    /// reports that harness's catalog (models.svelte.ts `ensureModels`): each
    /// session once a launch, until one answers. Returns whether the list changed.
    @MainActor
    public static func ensure(_ hub: HubConnection, harness: String) async -> Bool {
        let described = hub.fleet.machines.contains { machine in
            (machine.harnesses ?? []).contains { $0.harness.rawValue == harness && !($0.models ?? []).isEmpty }
        }
        guard !described else { return false }
        let candidates = hub.fleet.rows.filter { $0.status == .running && ($0.harness ?? "claude") == harness && !asked.contains($0.id) }
        for row in candidates {
            asked.insert(row.id)
            if let list = try? await hub.supportedModels(instanceId: row.id, machineId: row.machineId) {
                SpawnMemory.setOffered(harness, list)
                return true
            }
        }
        return false
    }

    @MainActor private static var asked = Set<String>()

    // MARK: Continue in new session (core continuation.ts)

    /// Room a summariser needs beyond what it reads, for what it writes.
    public static let summariserOutputReserve = 16000.0
    /// Room the new session needs beyond its opening message, to do any work.
    public static let targetHeadroom = 32000.0

    /// Why a model with `window` tokens of context cannot take `needed`, or
    /// nil when it can. An unknown window refuses: nothing is guessed.
    public static func contextFitRefusal(window: Double?, needed: Double) -> String? {
        guard let window, window > 0 else { return "context window unknown" }
        return window >= needed ? nil : "needs \(Int((needed / 1000).rounded(.up)))k context, has \(Int((window / 1000).rounded(.down)))k"
    }

    /// `owner/name`, however the repository was written (core `repoPath`).
    public static func repoPath(_ repo: String) -> String {
        repo.trimmingCharacters(in: .whitespaces)
            .replacing(/\/+$/, with: "")
            .replacing(/^[A-Za-z][A-Za-z0-9+.\-]*:\/\/[^\/]+\//, with: "")
            .replacing(/^[^\/]+@[^:]+:/, with: "")
            .replacing(/\.git$/, with: "")
    }

    /// The model the machines resolve "default" to, or "" (models.svelte.ts `defaultModelFor`).
    @MainActor
    public static func defaultModel(_ fleet: FleetStore, harness: String, machineIds: [String]) -> String {
        let id = models(fleet, harness: harness, machineIds: machineIds).first { $0.value == "default" }?.resolvedModel
        return id.flatMap { $0 == "default" ? nil : $0 } ?? ""
    }

    // MARK: Names (model-entries.ts `modelName`)

    private static let known = ["opus", "sonnet", "haiku", "deepseek", "gpt", "gemini", "qwen", "llama", "mistral", "grok"]

    public static func modelName(_ id: String, displayName: String? = nil) -> (name: String, provider: String?, mono: Bool) {
        let slash = id.lastIndex(of: "/")
        let provider = slash.map { String(id[..<$0]) }
        let raw = slash.map { String(id[id.index(after: $0)...]) } ?? id
        let claude = raw.hasPrefix("claude-")
        let wide = raw.lowercased().hasSuffix("[1m]")
        var core = claude ? String(raw.dropFirst("claude-".count)) : raw
        if wide { core = String(core.dropLast(4)) }
        var tokens = core.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        let family = tokens.isEmpty ? "" : tokens.removeFirst()
        guard claude || known.contains(family) else {
            return (displayName.flatMap { $0.isEmpty ? nil : $0 } ?? id, provider, displayName?.isEmpty ?? true)
        }
        let label = ["deepseek": "DeepSeek", "gpt": "GPT"][family] ?? family.prefix(1).uppercased() + family.dropFirst()
        var version: [String] = []
        while let first = tokens.first, first.wholeMatch(of: /v?\d+(?:\.\d+)*/) != nil {
            version.append(tokens.removeFirst())
        }
        let suffix = tokens.map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
        var number = version.joined(separator: ".")
        if number.hasPrefix("v") { number = "V" + number.dropFirst() }
        var name = label
        if !number.isEmpty { name += (family == "gpt" ? "-" : " ") + number }
        if !suffix.isEmpty { name += " " + suffix }
        if wide { name += " · 1M" }
        return (name, provider, false)
    }

    // MARK: Entries (model-entries.ts)

    public static func entries(_ rows: [Components.Schemas.ModelInfo], use: ModelUse) -> [ModelEntry] {
        var order: [String] = []
        var groups: [String: [Components.Schemas.ModelInfo]] = [:]
        for row in rows {
            let id = row.resolvedModel ?? row.value
            if groups[id] == nil { order.append(id) }
            groups[id, default: []].append(row)
        }
        return order.map { id in
            let group = groups[id] ?? []
            let named = group.first { $0.value == id } ?? group.first { $0.value != "default" }
            let label = modelName(id, displayName: named?.displayName)
            var effort: [String] = []
            for level in group.flatMap({ $0.supportedEffortLevels ?? [] }).map(\.rawValue) where !effort.contains(level) {
                effort.append(level)
            }
            var aliases: [String] = []
            for value in group.map(\.value) where value != id && !aliases.contains(value) {
                aliases.append(value)
            }
            return ModelEntry(
                id: id, name: label.name, mono: label.mono, provider: label.provider,
                released: group.compactMap(\.released).sorted().last,
                lastUsedAt: use.lastUsedAt[id],
                isDefault: group.contains { $0.value == "default" },
                isCustom: false,
                contextWindow: group.compactMap(\.contextWindow).first,
                defaultEffort: group.compactMap(\.defaultEffort).first?.rawValue,
                effort: effort, aliases: aliases
            )
        }
    }

    /// New since the last spawn, then Recent by last use, then All by
    /// release (undated last), then typed ids the catalog does not cover.
    public static func grouped(_ entries: [ModelEntry], use: ModelUse, typed: [String]) -> [ModelEntry] {
        var new: [ModelEntry] = [], recent: [ModelEntry] = [], all: [ModelEntry] = []
        let since = use.lastSpawnAt.flatMap(Self.date)
        for entry in entries {
            if let since, let released = entry.released.flatMap(Self.date), released > since {
                new.append(entry)
            } else if entry.lastUsedAt != nil {
                recent.append(entry)
            } else {
                all.append(entry)
            }
        }
        let byRelease = { (a: ModelEntry, b: ModelEntry) in (a.released ?? "") > (b.released ?? "") }
        new.sort(by: byRelease)
        all.sort(by: byRelease)
        recent.sort { ($0.lastUsedAt ?? "") > ($1.lastUsedAt ?? "") }
        var seen = Set<String>()
        let custom = typed.filter { id in
            seen.insert(id).inserted && !entries.contains { $0.id == id || $0.aliases.contains(id) }
        }.map { id in
            ModelEntry(id: id, name: id, mono: true, provider: nil, released: nil, lastUsedAt: use.lastUsedAt[id],
                       isDefault: false, isCustom: true, contextWindow: nil, defaultEffort: nil, effort: [], aliases: [])
        }
        return new + recent + all + custom
    }

    public static func matches(_ entry: ModelEntry, _ query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return ([entry.name, entry.id, entry.provider ?? ""] + entry.aliases).contains { $0.lowercased().contains(q) }
    }

    public static func isIdShaped(_ query: String) -> Bool {
        query.wholeMatch(of: /[\w.\-\/\[\]:]+/) != nil
    }

    private static func date(_ iso: String) -> Date? {
        let full = ISO8601DateFormatter()
        full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = full.date(from: iso) { return date }
        full.formatOptions = [.withInternetDateTime]
        if let date = full.date(from: iso) { return date }
        full.formatOptions = [.withFullDate]
        return full.date(from: iso)
    }

    // MARK: Makers (provider.ts)

    private static let prefixes: [(String, String)] = [
        ("claude", "anthropic"), ("sonnet", "anthropic"), ("opus", "anthropic"), ("haiku", "anthropic"), ("fable", "anthropic"),
        ("gpt", "openai"), ("o1", "openai"), ("o3", "openai"), ("o4", "openai"),
        ("deepseek", "deepseek"), ("gemini", "google"), ("grok", "xai"), ("qwen", "qwen"), ("kimi", "moonshot"),
        ("glm", "zhipu"), ("llama", "meta"), ("mistral", "mistral"), ("codestral", "mistral"), ("magistral", "mistral"),
        ("minimax", "minimax"), ("nemotron", "nvidia"),
    ]

    public static func providerOf(_ model: String) -> String? {
        let name = (model.split(separator: "/").last.map(String.init) ?? model).lowercased()
        return prefixes.first { name.hasPrefix($0.0) }?.1
    }

    /// The lab's name where a list mixes makers (ModelSection.svelte VENDOR).
    public static func vendor(_ model: String) -> String {
        [
            "anthropic": "Anthropic", "openai": "OpenAI", "google": "Google", "deepseek": "DeepSeek", "moonshot": "Moonshot AI",
            "qwen": "Qwen", "xai": "xAI", "zhipu": "Z.ai", "minimax": "MiniMax", "mistral": "Mistral", "meta": "Meta", "nvidia": "NVIDIA",
        ][providerOf(model) ?? ""] ?? ""
    }
}

// MARK: Use (modelUse.svelte.ts, under the same key)

public struct ModelUse: Codable, Sendable {
    public var lastSpawnAt: String?
    public var lastUsedAt: [String: String] = [:]
}

@MainActor
public enum SpawnMemory {
    private static let useKey = "cawco-models:use"
    private static let recentKey = "cawco-models:recent"

    public static func use(_ harness: String) -> ModelUse {
        history[harness] ?? ModelUse()
    }

    private static var history: [String: ModelUse] {
        get { read([String: ModelUse].self, useKey) ?? [:] }
        set { write(newValue, useKey) }
    }

    /// After a spawn goes out: the harness's last spawn, and the model's last use.
    public static func recordUse(harness: String, model: String) {
        let now = ISO8601DateFormatter().string(from: Date())
        var all = history
        var use = all[harness] ?? ModelUse()
        use.lastSpawnAt = now
        if !model.isEmpty { use.lastUsedAt[model] = now }
        all[harness] = use
        history = all
    }

    /// Typed-in model ids, newest first, five at most (models.svelte.ts `rememberModel`).
    public static var typed: [String] { read([String].self, recentKey) ?? [] }

    public static func rememberTyped(_ model: String) {
        let id = model.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return }
        write(Array(([id] + typed.filter { $0 != id }).prefix(5)), recentKey)
    }

    /// What a running session of each harness answered, for harnesses no
    /// machine reports (models.svelte.ts `store.offered`, under the same key's prefix).
    private static let offeredKey = "cawco-models:by-harness"

    public static func offered(_ harness: String) -> [Components.Schemas.ModelInfo] {
        (read([String: [Components.Schemas.ModelInfo]].self, offeredKey) ?? [:])[harness] ?? []
    }

    static func setOffered(_ harness: String, _ models: [Components.Schemas.ModelInfo]) {
        var all = read([String: [Components.Schemas.ModelInfo]].self, offeredKey) ?? [:]
        all[harness] = models
        write(all, offeredKey)
    }

    /// Claude models' context windows as the hub last saw a turn report them,
    /// by wire id (`/api/model-windows`); claude's own catalog carries none.
    public internal(set) static var claudeWindows: [String: Double] = [:]

    private static func read<T: Decodable>(_: T.Type, _ key: String) -> T? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(T.self, from: $0) }
    }

    private static func write(_ value: some Encodable, _ key: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(value), forKey: key)
    }
}
