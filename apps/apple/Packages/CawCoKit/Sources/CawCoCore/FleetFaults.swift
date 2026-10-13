import CawCoAPI
import Foundation

// Every way the fleet can be broken, in one vocabulary (fleet-faults.ts).
//
// A failure is never handed to the reader as the raw string a CLI printed: it
// has an ORIGIN (the hub could not fetch it, or a machine would not apply it)
// and a CAUSE read off what was actually said, named, explained, given its
// remedy, and only then quoted. Anything unmatched keeps its raw text and
// says so, rather than being guessed at.

/// Which fleet panel a fault belongs to: the key its report is stored under.
public enum FaultScope: String, CaseIterable, Sendable {
    case mcp, marketplaces, plugins, skills, memory, memoryDocs, memoryHook, hooks

    /// What the scope is called in a sentence, singular (`SCOPE_NOUN`).
    public var noun: String {
        switch self {
        case .mcp: "MCP server"
        case .marketplaces: "marketplace"
        case .plugins: "plugin"
        case .skills: "skill"
        case .memory: "memory"
        case .memoryDocs: "memory document"
        case .memoryHook: "model-memory hook"
        case .hooks: "hook"
        }
    }

    /// The Configure section that owns the affordance for it (`SCOPE_ANCHOR`): a fault links there, never re-creates it.
    public var section: String {
        switch self {
        case .mcp: "mcp"
        case .marketplaces, .plugins, .skills: "skills"
        case .memory, .memoryDocs, .memoryHook: "memory"
        case .hooks: "hooks"
        }
    }
}

/// Where the fault happened, which decides what could possibly fix it.
public enum FaultOrigin: Sendable { case hub, machine }

/// The named causes. `unknown` is a fault CawCo refuses to guess at.
public enum FaultCause: String, Sendable {
    case authDiscovery, needsAuth, unsupported, cliTooOld, cliMissing, sshRefused, marketplaceUnlinked, hubOnly
    case drifted, absent, unparsable, unwritable, timedOut, noCheckout, missingBytes, unsafePath, unfetchable, unknown

    /// What answers it: ask the machine to converge again, re-resolve the row
    /// at the hub, a person's decision between two copies, or nothing the
    /// app can press.
    public enum Action: Sendable { case resync, refresh, settle, none }

    /// What a cause means and what to do about it, in the operator's language (`CAUSE`).
    public struct Copy: Sendable {
        /// A title that names the fault, never the error text.
        public let title: String
        /// Why this happened, in one sentence.
        public let why: String
        /// What resolves it.
        public let fix: String
        public let action: Action
        /// The fault is about the `claude` binary, so the toolchain is worth showing.
        public var toolchain = false
    }

    public var copy: Copy {
        switch self {
        case .authDiscovery:
            Copy(title: "The hub could not read this server’s authorization", why: "The server or its authorization metadata did not answer discovery.",
                 fix: "Check this server’s URL, then save it again to retry discovery. Its connection starts once discovery succeeds.", action: .none)
        case .needsAuth:
            Copy(title: "This server needs sign-in", why: "The fleet has no usable sign-in for this server.",
                 fix: "Open this server and sign in. Every supported agent can use it once approval finishes on the selected computer.", action: .none)
        case .unsupported:
            Copy(title: "This agent has no MCP support", why: "pi cannot call MCP servers.", fix: "Use Claude Code or OpenCode for this server.", action: .none)
        case .cliTooOld:
            Copy(title: "The claude CLI on this machine is too old",
                 why: "The command CawCo ran uses an option this machine’s claude does not have, so the install never started.",
                 fix: "Check which claude this machine resolves first — a newer one installed elsewhere is no help while a stale binary comes earlier on PATH. Update or unshadow it, then sync this machine again.",
                 action: .resync, toolchain: true)
        case .cliMissing:
            Copy(title: "No claude CLI on this machine",
                 why: "Marketplaces and plugins are registered through the claude CLI, and this machine has none on any path CawCo can see.",
                 fix: "Install Claude Code on this machine, then sync it again.", action: .resync, toolchain: true)
        case .sshRefused:
            Copy(title: "Git fell back to ssh and had nothing to authenticate with",
                 why: "The repository is public, but the plugin manifest names an ssh remote, and this machine’s git had no key or token it would accept — an expired gh login does exactly this.",
                 fix: "The fleet does not need this machine to reach github at all: refresh the row at the hub and the bytes are carried to every machine instead. Fixing the machine’s gh login also works.",
                 action: .refresh)
        case .marketplaceUnlinked:
            Copy(title: "Its marketplace is not linked on this machine",
                 why: "A plugin is installed out of a marketplace, and the one this plugin’s id names never linked here — the marketplace’s own row says why.",
                 fix: "Resolve the marketplace failure first; this plugin follows it.", action: .none)
        case .hubOnly:
            Copy(title: "Only the hub’s machine can install this",
                 why: "Its marketplace is a directory on the hub’s machine, so every other machine gets its plugins as files the hub carries, and the hub could not carry this one.",
                 fix: "Publish the marketplace where every machine can reach it, such as a git repository, and point its row there. Or bring the plugin under the size the hub carries.",
                 action: .none)
        case .drifted:
            Copy(title: "This machine edited its own copy",
                 why: "CawCo only ever takes back the copy it wrote. Somebody changed this one on the machine itself, so it was left exactly where it is.",
                 fix: "Decide which copy wins: adopt this machine’s into the fleet, or overwrite it with the fleet’s.", action: .settle)
        case .absent:
            Copy(title: "What CawCo wrote is no longer there",
                 why: "The last sync recorded writing this, and a later read could not find it — something on the machine removed or replaced it.",
                 fix: "Sync this machine and it is written again.", action: .resync)
        case .unparsable:
            Copy(title: "A config file on this machine could not be read",
                 why: "CawCo will not overwrite a file it cannot parse, so nothing that file holds was converged.",
                 fix: "Repair the JSON named in the output on that machine, then sync it again.", action: .resync)
        case .unwritable:
            Copy(title: "A config file on this machine could not be written",
                 why: "The file was read, and the write back failed — permissions, a full disk, or a read-only home.",
                 fix: "Fix the write on that machine, then sync it again.", action: .resync)
        case .timedOut:
            Copy(title: "The command never finished",
                 why: "A clone or an install ran past the time a sync will hold open for it, and was killed rather than left running.",
                 fix: "Usually a slow or blocked network on that machine. Sync it again once it can reach the source.", action: .resync)
        case .noCheckout:
            Copy(title: "Bound to a project this machine does not have",
                 why: "This row is scoped to a checkout, and there is no such checkout on this machine — so there was nowhere to write it.",
                 fix: "Either clone the project on this machine, or scope the row to the whole fleet instead of to that project.", action: .none)
        case .missingBytes:
            Copy(title: "The hub sent no files for this version",
                 why: "The machine was told which version to hold and was not given the bytes for it — the two sides disagree about what this machine already has.",
                 fix: "Refresh the row at the hub so it is resolved and sent again.", action: .refresh)
        case .unsafePath:
            Copy(title: "A file in this row pointed outside its own directory",
                 why: "Content the hub fetched named a path that climbs out of the directory it belongs in, and the whole row was refused rather than written.",
                 fix: "This is a problem with the source, not with the machine. Point the row at a source you trust, or remove it.", action: .none)
        case .unfetchable:
            Copy(title: "The hub could not fetch this",
                 why: "This never reached any machine. The hub resolves content once for the whole fleet, and this source would not resolve — a name no linked marketplace lists, a repository that is gone or private, or a form the hub does not know how to fetch.",
                 fix: "Correct the source, link the marketplace it names, then retry the fetch here at the hub.", action: .refresh)
        case .unknown:
            Copy(title: "This did not converge",
                 why: "CawCo has no reading of what came back, so the machine’s own words are below, untouched.",
                 fix: "Sync this machine again; if it says the same thing, the output is the whole of what is known.", action: .resync)
        }
    }

    /// What a machine or the hub said, read as a cause (`causeOf`). Order
    /// matters: the specific first. The patterns match strings this
    /// repository is known to produce.
    public static func of(_ detail: String?, origin: FaultOrigin = .machine) -> FaultCause {
        let said = (detail ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty else { return origin == .hub ? .unfetchable : .unknown }
        let table: [(Regex<AnyRegexOutput>, FaultCause)] = [
            (try! Regex("unknown option|unknown argument|unknown command").ignoresCase(), .cliTooOld),
            (try! Regex("claude CLI not found").ignoresCase(), .cliMissing),
            (try! Regex("Permission denied \\(publickey\\)|Could not read from remote repository|Host key verification failed").ignoresCase(), .sshRefused),
            (try! Regex("marketplace .+ is not linked").ignoresCase(), .marketplaceUnlinked),
            (try! Regex("is a directory on the hub's machine").ignoresCase(), .hubOnly),
            (try! Regex("edited on this machine").ignoresCase(), .drifted),
            (try! Regex("the hub sent no files").ignoresCase(), .missingBytes),
            (try! Regex("^unsafe path").ignoresCase(), .unsafePath),
            (try! Regex("no checkout|has no checkout for").ignoresCase(), .noCheckout),
            (try! Regex("timed out after").ignoresCase(), .timedOut),
            (try! Regex("could not parse").ignoresCase(), .unparsable),
            (try! Regex("could not write").ignoresCase(), .unwritable),
            (try! Regex("^not in |^not on disk|is not in known_marketplaces").ignoresCase(), .absent),
        ]
        for (pattern, cause) in table where said.contains(pattern) { return cause }
        // Hub refusals have no shared prefix: anything a resolve said is still a fetch that failed.
        return origin == .hub ? .unfetchable : .unknown
    }
}

/// One thing that is wrong, with everything needed to render and act on it.
public struct FleetFault: Equatable, Sendable {
    public let origin: FaultOrigin
    public let scope: FaultScope
    /// The row's own key: a server name, a plugin id, a document path. Empty for the singular memory rows.
    public let key: String
    /// Which machine refused it; nil for a hub-side fault.
    public let machineId: String?
    public let harness: String?
    /// What was said, verbatim and never rewritten.
    public let detail: String?
    public let cause: FaultCause

    public init(origin: FaultOrigin, scope: FaultScope, key: String, machineId: String?, harness: String?, detail: String?, cause: FaultCause) {
        self.origin = origin
        self.scope = scope
        self.key = key
        self.machineId = machineId
        self.harness = harness
        self.detail = detail
        self.cause = cause
    }

    /// The row's own name for a reader: the key, or the scope's noun for the singular rows.
    public var label: String { key.isEmpty ? scope.noun : key }
}

/// Faults grouped by what they are, not where they were found: one stale CLI
/// that broke six plugins on one machine is one problem with six symptoms.
public struct FaultGroup: Equatable, Sendable {
    public let origin: FaultOrigin
    public let cause: FaultCause
    public let scope: FaultScope
    public let machineId: String?
    public let harness: String?
    public var faults: [FleetFault]

    public init(_ faults: [FleetFault]) {
        let first = faults[0]
        origin = first.origin
        cause = first.cause
        scope = first.scope
        machineId = first.machineId
        harness = first.harness
        self.faults = faults
    }
}

/// The `claude` a machine's sync ran, and any it did not (`ToolchainReading`).
public struct ToolchainReading: Sendable {
    public struct Install: Sendable {
        public let path: String
        public let version: String?
    }

    public let used: Install?
    /// Installs the sync did not use, in PATH order.
    public let others: [Install]
    /// One of `others` reports a strictly higher version than the used one.
    public let shadowed: Bool
}

/// A machine's fleet report as the fault and rollout readings read it.
nonisolated struct SyncReport: Decodable {
    struct Item: Decodable {
        let state: String
        let detail: String?
    }

    struct Claude: Decodable {
        let path: String
        let version: String?
        let used: Bool?
    }

    struct Toolchain: Decodable { let claude: [Claude]? }

    let mcp: [String: Item]?
    let mcpByHarness: [String: [String: Item]]?
    let marketplaces: [String: Item]?
    let plugins: [String: Item]?
    let skills: [String: Item]?
    let memoryDocs: [String: Item]?
    let hooks: [String: Item]?
    let memory: Item?
    let memoryHook: Item?
    let toolchain: Toolchain?

    func record(_ scope: FaultScope) -> [String: Item]? {
        switch scope {
        case .mcp: mcp
        case .marketplaces: marketplaces
        case .plugins: plugins
        case .skills: skills
        case .memoryDocs: memoryDocs
        case .hooks: hooks
        case .memory, .memoryHook: nil
        }
    }
}

public enum FleetFaults {
    static let refused: Set = ["failed", "needs-auth", "unsupported"]

    static func report(_ machine: MachineRow) -> SyncReport? {
        machine.fleet.flatMap { try? Wire.transcode($0, as: SyncReport.self) }
    }

    /// Every row one machine's report says it could not apply (`machineFaults`).
    public static func machine(_ machine: MachineRow) -> [FleetFault] {
        guard let report = report(machine) else { return [] }
        let id = machine.machineId
        func scan(_ scope: FaultScope, _ record: [String: SyncReport.Item]?, harness: String? = nil) -> [FleetFault] {
            (record ?? [:]).sorted { $0.key < $1.key }.filter { refused.contains($0.value.state) }.map { key, item in
                let cause: FaultCause = switch item.state {
                case "needs-auth": .needsAuth
                case "unsupported": .unsupported
                default: .of(item.detail)
                }
                return FleetFault(origin: .machine, scope: scope, key: key, machineId: id, harness: harness, detail: item.detail, cause: cause)
            }
        }
        func single(_ scope: FaultScope, _ item: SyncReport.Item?) -> [FleetFault] {
            guard let item, item.state == "failed" else { return [] }
            return [FleetFault(origin: .machine, scope: scope, key: "", machineId: id, harness: nil, detail: item.detail, cause: .of(item.detail))]
        }
        let mcp = report.mcpByHarness.map { byHarness in
            byHarness.sorted { $0.key < $1.key }.flatMap { scan(.mcp, $0.value, harness: $0.key) }
        } ?? scan(.mcp, report.mcp)
        return mcp + scan(.marketplaces, report.marketplaces) + scan(.plugins, report.plugins) + scan(.skills, report.skills)
            + scan(.memoryDocs, report.memoryDocs) + scan(.hooks, report.hooks) + single(.memory, report.memory) + single(.memoryHook, report.memoryHook)
    }

    private nonisolated struct HubRow: Decodable {
        let name: String?
        let id: String?
        let error: String?
    }

    /// Every row the HUB could not resolve (`hubFaults`). A plugin is a fault
    /// only while no machine reports it applied: one too big for the hub to
    /// carry installs from each machine's own marketplace and works everywhere.
    public static func hub(_ snapshot: Components.Schemas.GetApiFleet200, machines: [MachineRow]) -> [FleetFault] {
        let skills = (try? Wire.transcode(snapshot.skills, as: [HubRow].self)) ?? []
        let plugins = (try? Wire.transcode(snapshot.config.plugins, as: [HubRow].self)) ?? []
        let reports = machines.compactMap(report)
        let appliedSomewhere = { (id: String) in reports.contains { $0.plugins?[id]?.state == "applied" } }
        return skills.compactMap { row in
            guard let error = row.error, let name = row.name else { return nil }
            return FleetFault(origin: .hub, scope: .skills, key: name, machineId: nil, harness: nil, detail: error, cause: .of(error, origin: .hub))
        } + plugins.compactMap { row in
            guard let error = row.error, let id = row.id, !appliedSomewhere(id) else { return nil }
            return FleetFault(origin: .hub, scope: .plugins, key: id, machineId: nil, harness: nil, detail: error, cause: .of(error, origin: .hub))
        }
    }

    /// Faults grouped by what they are (`groupFaults`): hub faults first, then the biggest groups.
    public static func grouped(_ faults: [FleetFault]) -> [FaultGroup] {
        var order: [String] = []
        var groups: [String: [FleetFault]] = [:]
        for fault in faults {
            let id = "\(fault.origin)|\(fault.cause)|\(fault.scope)|\(fault.machineId ?? "")|\(fault.harness ?? "")"
            if groups[id] == nil { order.append(id) }
            groups[id, default: []].append(fault)
        }
        let all = order.compactMap { groups[$0].map(FaultGroup.init) }
        return all.enumerated().sorted { a, b in
            if a.element.origin != b.element.origin { return a.element.origin == .hub }
            if a.element.faults.count != b.element.faults.count { return a.element.faults.count > b.element.faults.count }
            return a.offset < b.offset
        }.map(\.element)
    }

    /// The `claude` this machine's sync actually ran, and any it did not (`readToolchain`).
    public static func toolchain(_ machine: MachineRow?) -> ToolchainReading? {
        guard let machine, let claude = report(machine)?.toolchain?.claude, !claude.isEmpty else { return nil }
        let usedIndex = claude.firstIndex { $0.used == true }
        let used = usedIndex.map { claude[$0] }
        let others = claude.enumerated().filter { $0.offset != usedIndex }.map(\.element)
        return ToolchainReading(used: used.map { .init(path: $0.path, version: $0.version) },
                                others: others.map { .init(path: $0.path, version: $0.version) },
                                shadowed: others.contains { higher($0.version, than: used?.version) })
    }

    private static func parts(_ version: String?) -> [Int]? {
        guard let match = (version ?? "").firstMatch(of: /(\d+)\.(\d+)\.(\d+)/) else { return nil }
        return [Int(match.1), Int(match.2), Int(match.3)].compactMap(\.self)
    }

    private static func higher(_ a: String?, than b: String?) -> Bool {
        guard let left = parts(a), let right = parts(b) else { return false }
        for at in 0 ..< 3 where left[at] != right[at] { return left[at] > right[at] }
        return false
    }
}
