public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime

/// What Configure reads from the hub's fleet (config/store.svelte.ts), held
/// once per window so the section list's counts and the section on screen
/// are the same numbers: the rows of `GET /api/fleet`, where each has landed
/// machine by machine, and every fault. A read that fails keeps the last
/// good rows and says why. Sections write through the hub's own wrappers
/// (`HubAPI.Configuration`, `.rules`, `.delegates`, `.tools`, `.models`,
/// `.supervisor`) and read again.
@MainActor
@Observable
public final class FleetConfig {
    /// The hub's fleet setup; nil until read once.
    public private(set) var snapshot: Components.Schemas.GetApiFleet200?
    /// Why the last read failed (`Slot.error`).
    public private(set) var problem: String?
    public private(set) var loading = false
    @ObservationIgnored private weak var hub: HubConnection?

    init(hub: HubConnection) {
        self.hub = hub
    }

    /// Reads the fleet's setup again (`Slot.load`).
    public func load() async {
        guard let hub else { return }
        loading = true
        defer { loading = false }
        do {
            snapshot = try await hub.api.fleet.read().ok.body.json
            problem = nil
        } catch {
            problem = "Could not read the fleet's setup — \(error.localizedDescription)."
        }
    }

    // MARK: Faults (counts.svelte.ts)

    /// Every fault the fleet has right now, hub-side and machine-side (`allFaults`).
    public func faults(machines: [MachineRow]) -> [FleetFault] {
        (snapshot.map { FleetFaults.hub($0, machines: machines) } ?? []) + machines.flatMap(FleetFaults.machine)
    }

    /// How many faults belong to a section, for its badge (`faultsIn`).
    public func faults(inSection slug: String, machines: [MachineRow]) -> Int {
        faults(machines: machines).filter { $0.scope.section == slug }.count
    }

    /// The faults one row has: the hub's own for it, then each machine's (RowFaults.svelte).
    public func faults(scope: FaultScope, key: String, machines: [MachineRow]) -> [FaultGroup] {
        FleetFaults.grouped(faults(machines: machines).filter { $0.scope == scope && $0.key == key })
    }

    // MARK: Remedies (FleetFault.svelte)

    /// Asks one machine to apply the fleet's setup again (`syncFleet`).
    public func resync(machineId: String) async throws {
        let answer = try await api().fleet.sync(.init(body: .json(.init(machineId: machineId))))
        switch answer {
        case .ok: return
        case let .notFound(refused): throw await Self.refusal(try? refused.body.plainText, status: 404)
        case .unprocessableContent: throw await Self.refusal(nil, status: 422)
        case let .undocumented(status, payload): throw await Self.refusal(payload.body, status: status)
        }
    }

    /// Re-resolves a skill or a plugin at the hub (`refreshSkill`, `refreshPlugin`); true when it still would not fetch.
    public func refresh(_ fault: FleetFault) async throws -> Bool {
        let api = try api()
        switch fault.scope {
        case .skills:
            switch try await api.fleet.refreshSkill(.init(path: .init(name: fault.key))) {
            case let .ok(read): return try read.body.json.error != nil
            case let .badRequest(refused): throw await Self.refusal(try? refused.body.plainText, status: 400)
            case let .notFound(refused): throw await Self.refusal(try? refused.body.plainText, status: 404)
            case let .gatewayTimeout(refused): throw await Self.refusal(try? refused.body.plainText, status: 504)
            case let .undocumented(status, payload): throw await Self.refusal(payload.body, status: status)
            }
        case .plugins:
            switch try await api.fleet.refreshPlugin(.init(path: .init(id: fault.key))) {
            case let .ok(read): return try read.body.json.error != nil
            case let .notFound(refused): throw await Self.refusal(try? refused.body.plainText, status: 404)
            case let .undocumented(status, payload): throw await Self.refusal(payload.body, status: status)
            }
        default:
            return false
        }
    }

    /// A skill edited on one machine, taken into the fleet (`adoptSkill`).
    public func adoptSkill(_ name: String, machineId: String) async throws {
        switch try await api().fleet.putSkill(.init(path: .init(name: name), body: .json(.init(fromMachine: machineId)))) {
        case .ok: return
        case let .badRequest(refused): throw await Self.refusal(try? refused.body.plainText, status: 400)
        case let .notFound(refused): throw await Self.refusal(try? refused.body.plainText, status: 404)
        case .unprocessableContent: throw await Self.refusal(nil, status: 422)
        case let .gatewayTimeout(refused): throw await Self.refusal(try? refused.body.plainText, status: 504)
        case let .undocumented(status, payload): throw await Self.refusal(payload.body, status: status)
        }
    }

    /// The fleet's copy of a skill over the one a machine edited (`pushSkill`).
    public func pushSkill(_ name: String, machineId: String) async throws {
        switch try await api().fleet.pushSkill(.init(path: .init(name: name), body: .json(.init(machineId: machineId)))) {
        case .ok: return
        case let .notFound(refused): throw await Self.refusal(try? refused.body.plainText, status: 404)
        case .unprocessableContent: throw await Self.refusal(nil, status: 422)
        case let .internalServerError(refused): throw await Self.refusal(try? refused.body.plainText, status: 500)
        case let .gatewayTimeout(refused): throw await Self.refusal(try? refused.body.plainText, status: 504)
        case let .undocumented(status, payload): throw await Self.refusal(payload.body, status: status)
        }
    }

    private func api() throws -> HubAPI {
        guard let hub else { throw URLError(.notConnectedToInternet) }
        return try hub.api
    }

    /// The hub's own words for a refusal, or that it answered with a status.
    static func refusal(_ body: HTTPBody?, status: Int) async -> HubConnection.ControlError {
        HubConnection.ControlError(message: await Wire.words(body) ?? "The hub answered \(status).")
    }
}

/// Where one fleet row has landed, machine by machine (RolloutChip.svelte):
/// "2/2 machines" on the row, and each machine's word in its popover.
public struct Rollout: Sendable {
    public struct Landing: Sendable {
        public let machineId: String
        /// `applied`, `failed`, `removed`, `needs-auth`, `unsupported`, `disabled`, `pending`; nil when not reported.
        public let state: String?
        public let detail: String?
        /// What each harness made of an MCP server (`mcpByHarness`), by harness.
        public let harnesses: [(harness: String, state: String, detail: String?)]
    }

    public let landings: [Landing]

    public var applied: Int { landings.filter { $0.state == "applied" }.count }
    public var refused: Int { landings.filter { FleetFaults.refused.contains($0.state ?? "") }.count }

    /// What a machine's state says (RolloutChip.svelte `SAID`).
    public static func said(_ state: String?) -> String {
        switch state {
        case "applied": "Has it"
        case "failed": "Refused it"
        case "removed": "Taken off"
        case "needs-auth": "Needs sign-in"
        case "unsupported": "Not supported"
        case "disabled": "Disabled"
        case "pending": "Connecting"
        default: "Not reported"
        }
    }

    /// One row's landings across the machines; `name` is ignored for the singular memory row.
    public static func of(_ scope: FaultScope, name: String, machines: [MachineRow]) -> Rollout {
        Rollout(landings: machines.map { machine in
            let report = FleetFaults.report(machine)
            let item = scope == .memory ? report?.memory : report?.record(scope)?[name]
            let harnesses = scope == .mcp
                ? (report?.mcpByHarness ?? [:]).sorted { $0.key < $1.key }.compactMap { harness, rows in
                    rows[name].map { (harness: harness, state: $0.state, detail: $0.detail) }
                }
                : []
            return Landing(machineId: machine.machineId, state: item?.state, detail: item?.detail, harnesses: harnesses)
        })
    }
}
