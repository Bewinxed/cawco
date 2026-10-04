public import CawCoAPI
public import Foundation
import Observation

/// What the new-session form was last set to
/// (apps/dashboard/src/lib/cawco/spawnPrefs.svelte.ts). A reader who picks a
/// model and a permission mode is saying how they work, not how one session
/// starts, so a start that has no form of its own runs on these. Where a
/// session runs is not a preference. Kept in UserDefaults under the web's
/// key, as the JSON the web keeps in its browser storage.
@MainActor
@Observable
public final class SpawnPrefs {
    public typealias Harness = Components.Schemas.SpawnPayload.HarnessPayload
    public typealias PermissionMode = Components.Schemas.SpawnPayload.PermissionModePayload
    public typealias Effort = Components.Schemas.SpawnPayload.EffortPayload

    /// What the form sends when the reader has not chosen a model: nothing (`MODEL_DEFAULT`).
    public static let modelDefault = ""
    /// The permission modes the product offers, in the order it offers them
    /// (permission-modes.ts `PERMISSION_MODES`).
    public static let offeredModes: [PermissionMode] = [._default, .plan, .acceptEdits, .bypassPermissions]

    public private(set) var harness: Harness = .claude
    public private(set) var model = SpawnPrefs.modelDefault
    public private(set) var permissionMode: PermissionMode = .bypassPermissions
    /// Nil is a choice too, and the one to start from: only the model knows which levels it has.
    public private(set) var effort: Effort?

    private static let key = "cawco-spawn-prefs"
    @ObservationIgnored private let defaults: UserDefaults

    private struct Stored: Codable {
        var effort: String?
        var harness: String?
        var model: String?
        var permissionMode: String?
    }

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        guard let text = defaults.string(forKey: Self.key), let stored = try? JSONDecoder().decode(Stored.self, from: Data(text.utf8)) else {
            return
        }
        // A model and an effort are only kept with the harness they were chosen against.
        let kept = stored.harness.flatMap(Harness.init(rawValue:))
        harness = kept ?? .claude
        if kept != nil, let model = stored.model { self.model = model }
        if let mode = stored.permissionMode.flatMap(PermissionMode.init(rawValue:)) { permissionMode = mode }
        if kept != nil { effort = stored.effort.flatMap(Effort.init(rawValue:)) }
    }

    /// Called when a spawn actually goes out, so a form the reader abandoned teaches nothing (`rememberSpawn`).
    public func remember(harness: Harness, model: String, permissionMode: PermissionMode, effort: Effort?) {
        self.harness = harness
        self.model = model
        self.permissionMode = permissionMode
        self.effort = effort
        let stored = Stored(effort: effort?.rawValue, harness: harness.rawValue, model: model, permissionMode: permissionMode.rawValue)
        if let data = try? JSONEncoder().encode(stored) {
            defaults.set(String(decoding: data, as: UTF8.self), forKey: Self.key)
        }
    }

    /// What the New Session form shows before anything is touched, for a
    /// spawn that has no form (`spawnDefaults`): the machine's default model
    /// entry by the model it resolves to, and the remembered permission mode
    /// unless the machine's harness cannot honour it, then the first one it
    /// can. A harness that reports no modes at all (pi) has none.
    public func formDefaults(harness: Harness, machine: MachineRow?) -> (model: String, permissionMode: PermissionMode?) {
        let report = machine?.harnesses?.first { $0.harness.rawValue == harness.rawValue }
        let resolved = report?.models?.first { $0.value == "default" }?.resolvedModel
        let model = resolved.flatMap { $0 == "default" ? nil : $0 } ?? ""
        guard let report else { return (model, permissionMode) }
        let honoured = Set(report.capabilities.permissionModes.map(\.rawValue))
        if honoured.isEmpty { return (model, nil) }
        if honoured.contains(permissionMode.rawValue) { return (model, permissionMode) }
        return (model, Self.offeredModes.first { honoured.contains($0.rawValue) } ?? permissionMode)
    }
}

extension HubConnection {
    /// A spawn as it leaves this app (client.svelte.ts `explicit`): a model
    /// named wherever one is known, and a permission mode named exactly when
    /// its harness has modes. What the caller set stands; what it left out is
    /// what the New Session form shows by default, never the machine's own.
    public func explicit(machineId: String, _ payload: Components.Schemas.SpawnPayload) -> Components.Schemas.SpawnPayload {
        let harness = payload.harness ?? .claude
        let machine = fleet.machines.first { $0.machineId == machineId }
        let report = machine?.harnesses?.first { $0.harness.rawValue == harness.rawValue }
        let defaults = spawnPrefs.formDefaults(harness: harness, machine: machine)
        var payload = payload
        // A harness with no permission modes is sent none, whatever the caller carried.
        payload.permissionMode = report?.capabilities.permissionModes.isEmpty == true ? nil : (payload.permissionMode ?? defaults.permissionMode)
        let model = payload.model.flatMap { $0.isEmpty ? nil : $0 } ?? defaults.model
        payload.model = model.isEmpty ? nil : model
        return payload
    }

    /// Starts a session where it is asked to on what the new-session form was
    /// last set to, sends its first prompt when it has one, and remembers the
    /// settings it went out with (project/[id]/+page.svelte `startSession`,
    /// NewSessionDialog's `rememberSpawn`). Returns the new session's id.
    @discardableResult
    public func spawnSession(machineId: String, cwd: String, projectId: String? = nil, prompt: String? = nil, scratch: Bool = false) async throws -> String {
        let prefs = spawnPrefs
        let (harness, model, mode, effort) = (prefs.harness, prefs.model, prefs.permissionMode, prefs.effort)
        let payload = explicit(machineId: machineId, Components.Schemas.SpawnPayload(
            cwd: cwd,
            effort: effort,
            harness: harness,
            instanceId: UUID().uuidString.lowercased(),
            model: model,
            permissionMode: mode,
            projectId: projectId,
            scratch: scratch ? .init() : nil
        ))
        let id = try await spawn(machineId: machineId, payload: payload, prompt: prompt)
        prefs.remember(harness: harness, model: model, permissionMode: mode, effort: effort)
        _ = await refresh()
        return id
    }
}
