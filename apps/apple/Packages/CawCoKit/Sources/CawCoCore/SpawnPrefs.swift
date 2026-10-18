public import CawCoAPI
public import Foundation
import Observation

/// What the new-session form was last set to
/// (apps/dashboard/src/lib/cawco/spawnPrefs.svelte.ts). A reader who picks a
/// model and a permission mode is saying how they work, not how one session
/// starts, so a start that has no form of its own runs on these. The form
/// opens on the machine it last started a session on (`rememberedMachine`),
/// only ever its id, never a folder. Kept in UserDefaults under the web's
/// keys, as the JSON the web keeps in its browser storage.
@MainActor
@Observable
public final class SpawnPrefs {
    public typealias Harness = Components.Schemas.SpawnPayload.HarnessPayload
    public typealias PermissionMode = Components.Schemas.SpawnPayload.PermissionModePayload
    public typealias Effort = Components.Schemas.SpawnPayload.EffortPayload

    /// What the form sends when the reader has not chosen a model: nothing (`MODEL_DEFAULT`).
    public static let modelDefault = ""
    /// The permission modes the product offers, in the order it offers them
    /// (permission-modes.ts `ORDER`).
    public static let offeredModes: [PermissionMode] = [._default, .plan, .acceptEdits, .bypassPermissions, .fullSend]

    /// The mode a start with no picker runs on (permission-modes.ts
    /// `unpickedMode`): Full Send is only ever chosen behind its
    /// confirmation, or shown in the form under its warning, so a start
    /// that shows neither runs on Bypass, where the safety checks still ask.
    public nonisolated static func unpicked(_ mode: PermissionMode) -> PermissionMode {
        mode == .fullSend ? .bypassPermissions : mode
    }

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

    private static let machineKey = "cawco-spawn-machine"

    /// The machine the New Session form last started a session on, which it
    /// opens on next; nil when it has started none (spawnPrefs.svelte.ts
    /// `rememberedMachine`).
    public var rememberedMachine: String? {
        defaults.string(forKey: Self.machineKey).flatMap { $0.isEmpty ? nil : $0 }
    }

    /// Called with the machines a spawn from the form went out to: the first is the one it opens on next.
    public func rememberMachine(_ machineIds: [String]) {
        if let first = machineIds.first { defaults.set(first, forKey: Self.machineKey) }
    }

    /// What each mode is called (permission-modes.ts `LABELS`).
    public static let modeNames = [
        "default": "Ask first", "plan": "Plan first", "acceptEdits": "Accept edits",
        "bypassPermissions": "Bypass", "fullSend": "Full Send",
    ]

    /// Why `mode` cannot go out to `machine`'s `harness`, or nil when it can
    /// (permission-modes.ts `modeRefusal`): the machine has not reported that
    /// harness yet, so which modes it takes is not known, or it reports modes
    /// and this is not one of them. A harness that reports none (pi) is sent
    /// none. A mode is never swapped for another: a start goes out on the
    /// mode its person chose, or not at all.
    public static func modeRefusal(machine: String, harness: String, mode: String, report: Components.Schemas.HarnessReport?) -> String? {
        let name = ModelCatalog.harnessName(harness)
        guard let report else {
            return "\(machine) hasn't reported its \(name) yet, so which permission modes it takes isn't known."
        }
        let taken = report.capabilities.permissionModes.map(\.rawValue)
        guard !taken.isEmpty, !taken.contains(mode) else { return nil }
        return "\(machine)'s \(name) doesn't take \(modeNames[mode] ?? mode). Pick a mode it takes."
    }

    /// The permission mode a spawn that has no form starts on (`spawnDefaults`):
    /// the remembered one, when the machine's harness takes it. With no form
    /// there is no Full Send warning to read: a remembered Full Send gives
    /// Bypass (`unpicked`). A harness that reports no modes at all (pi) is
    /// given none. Throws the reason, and nothing starts, while the machine
    /// has not reported the harness or does not take the mode
    /// (`modeRefusal`). No model: a spawn that names none runs on its
    /// harness's own default.
    public func formDefaults(harness: Harness, machine: MachineRow?, machineId: String) throws -> PermissionMode? {
        let report = machine?.harnesses?.first { $0.harness.rawValue == harness.rawValue }
        let remembered = Self.unpicked(permissionMode)
        if let refused = Self.modeRefusal(machine: machine?.name ?? machineId, harness: harness.rawValue, mode: remembered.rawValue, report: report) {
            throw SpawnRefused(reason: "\(refused) Nothing was started.")
        }
        return report?.capabilities.permissionModes.isEmpty == true ? nil : remembered
    }
}

/// Why a spawn did not go out, in the words the person reads.
public struct SpawnRefused: LocalizedError {
    public let reason: String
    public var errorDescription: String? { reason }
}

extension HubConnection {
    /// A spawn as it leaves this app (client.svelte.ts `explicit`): a model
    /// only when one was picked (none runs on the harness's own default,
    /// never an empty string), and a permission mode named exactly when its
    /// harness has modes. What the caller set stands; a mode it left out is
    /// the remembered one, when the machine takes it (`formDefaults`, which
    /// throws why not, and nothing starts). Which modes a machine takes is
    /// its report's, so a start waits for the report (the first fleet read,
    /// a machine whose report is on its way) up to the control timeout; one
    /// still missing then is the machine's own word.
    public func explicit(machineId: String, _ payload: Components.Schemas.SpawnPayload) async throws -> Components.Schemas.SpawnPayload {
        let fleet = fleet
        _ = await observedUntil(.now + Self.controlTimeout) {
            fleet.fleetRead && fleet.machines.first { $0.machineId == machineId }?.harnesses != nil
        }
        let harness = payload.harness ?? .claude
        let machine = fleet.machines.first { $0.machineId == machineId }
        let report = machine?.harnesses?.first { $0.harness.rawValue == harness.rawValue }
        var payload = payload
        // A harness with no permission modes is sent none, whatever the caller carried.
        if report?.capabilities.permissionModes.isEmpty == true {
            payload.permissionMode = nil
        } else if payload.permissionMode == nil {
            payload.permissionMode = try spawnPrefs.formDefaults(harness: harness, machine: machine, machineId: machineId)
        }
        payload.model = payload.model.flatMap { $0.isEmpty ? nil : $0 }
        return payload
    }

    /// Starts a session where it is asked to on what the new-session form was
    /// last set to, sends its first prompt when it has one, and remembers the
    /// settings it went out with (project/[id]/+page.svelte `startSession`,
    /// NewSessionDialog's `rememberSpawn`). Returns the new session's id.
    /// Its mode is the remembered one when the machine takes it, Full Send
    /// starting on Bypass (`formDefaults`); the form keeps Full Send.
    @discardableResult
    public func spawnSession(machineId: String, cwd: String, projectId: String? = nil, prompt: String? = nil, scratch: Bool = false) async throws -> String {
        let prefs = spawnPrefs
        let (harness, model, mode, effort) = (prefs.harness, prefs.model, prefs.permissionMode, prefs.effort)
        let payload = try await explicit(machineId: machineId, Components.Schemas.SpawnPayload(
            cwd: cwd,
            effort: effort,
            harness: harness,
            instanceId: UUID().uuidString.lowercased(),
            model: model,
            projectId: projectId,
            scratch: scratch ? .init() : nil
        ))
        let id = try await spawn(machineId: machineId, payload: payload, prompt: prompt)
        prefs.remember(harness: harness, model: model, permissionMode: mode, effort: effort)
        _ = await refresh()
        return id
    }
}
