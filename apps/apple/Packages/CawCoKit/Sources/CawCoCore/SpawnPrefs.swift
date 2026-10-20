public import CawCoAPI
public import Foundation
import Observation

/// What the new-session form was last set to
/// (apps/dashboard/src/lib/cawco/spawnPrefs.svelte.ts). A reader who picks a
/// model and a permission mode is saying how they work, not how one session
/// starts, so the form opens on them. Every start goes through the form: one
/// with no form of its own opens it. The form opens on the machine it last
/// started a session on (`rememberedMachine`), only ever its id, never a folder. Kept in UserDefaults under the web's
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
    /// None until a form has started a session on one: the form then opens on no mode, and Start waits for one.
    public private(set) var permissionMode: PermissionMode?
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
    public func remember(harness: Harness, model: String, permissionMode: PermissionMode?, effort: Effort?) {
        self.harness = harness
        self.model = model
        self.permissionMode = permissionMode
        self.effort = effort
        let stored = Stored(effort: effort?.rawValue, harness: harness.rawValue, model: model, permissionMode: permissionMode?.rawValue)
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
}

extension HubConnection {
    /// A spawn as it leaves this app (client.svelte.ts `explicit`): a model
    /// only when one was picked (none runs on the harness's own default,
    /// never an empty string), and a permission mode only when its harness
    /// has modes. What the path says stands: the New Session form's choice,
    /// or the session's own on a relaunch or a fork. A path that names none
    /// sends none, and the hub settles it (`settleMode`): a session it has a
    /// row for runs on its own mode, else the one last chosen for its harness
    /// on its machine, and anything else is refused with why. Every new
    /// session's mode is chosen in the form (a start with no form of its own
    /// opens it). Which modes a machine takes is its report's, so a start
    /// waits for the report (the first fleet read, a machine whose report is
    /// on its way) up to the control timeout; one still missing then is the
    /// machine's own word.
    public func explicit(machineId: String, _ payload: Components.Schemas.SpawnPayload) async -> Components.Schemas.SpawnPayload {
        let fleet = fleet
        _ = await observedUntil(.now + Self.controlTimeout) {
            fleet.fleetRead && fleet.machines.first { $0.machineId == machineId }?.harnesses != nil
        }
        var payload = payload
        let report = payload.harness.flatMap { harness in
            fleet.machines.first { $0.machineId == machineId }?.harnesses?.first { $0.harness.rawValue == harness.rawValue }
        }
        // A harness with no permission modes (pi) is sent none, whatever the path carried.
        if report?.capabilities.permissionModes.isEmpty == true { payload.permissionMode = nil }
        payload.model = payload.model.flatMap { $0.isEmpty ? nil : $0 }
        return payload
    }
}
