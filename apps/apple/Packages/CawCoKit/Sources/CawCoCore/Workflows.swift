public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime
import OSLog

/// One input a workflow asks for at launch (core `WorkflowInput`).
public struct WorkflowField: Decodable, Sendable, Equatable {
    public enum Kind: String, Decodable, Sendable { case path, select, text }

    public let name: String
    public let label: String
    public let required: Bool
    public let type: Kind
    public let options: [String]?
    public let preset: String?

    private enum CodingKeys: String, CodingKey {
        case name, label, required, type, options
        case preset = "default"
    }
}

/// One node of a workflow's graph (core `WorkflowNode`): what every node has,
/// and what its kind adds. Read by `kind`; a kind this build does not know
/// keeps its place on the canvas as `.other`.
public struct WorkflowNode: Decodable, Sendable, Equatable, Identifiable {
    public enum Kind: Sendable, Equatable {
        case start(inputs: [WorkflowField])
        /// The names of the outputs it returns.
        case end(outputs: [String])
        case step(harness: String, model: String, prompt: String)
        /// How many rules it checks.
        case check(rules: Int)
        /// The ports of its cases, the last being the else.
        case branch(ports: [String])
        case map(over: String, body: WorkflowGraph)
        /// The child workflow's id and how many inputs it is handed.
        case workflow(workflowId: String, inputs: Int)
        case ask(question: String, options: [String], allowOther: Bool)
        /// Each question's type (`noul`, `choice`, `score`).
        case jev(questions: [String])
        case other(String)

        /// The kind's own word (`start`, `step`, …).
        public var name: String {
            switch self {
            case .start: "start"
            case .end: "end"
            case .step: "step"
            case .check: "check"
            case .branch: "branch"
            case .map: "map"
            case .workflow: "workflow"
            case .ask: "ask"
            case .jev: "jev"
            case let .other(name): name
            }
        }
    }

    public let id: String
    public let title: String
    public let x: Double
    public let y: Double
    public let kind: Kind

    /// The ports a node leaves by (core `workflowPorts`): `fail` is taken
    /// when the node's call rejects; unwired, the failure fails the run.
    public var ports: [String] {
        switch kind {
        case .start: ["out"]
        case .step, .map, .workflow, .jev: ["out", "fail"]
        case .check: ["pass", "fail"]
        case let .branch(ports): ports
        case let .ask(_, options, allowOther): options + (allowOther ? ["other"] : [])
        case .end, .other: []
        }
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, position, kind, inputs, outputs, harness, model, prompt, rules, cases, over, body, workflowId, question, options, allowOther, questions
    }

    private struct Position: Decodable { let x: Double; let y: Double }
    private struct Case: Decodable { let port: String }
    private struct Option: Decodable { let label: String }
    private struct Question: Decodable { let type: String }
    private struct Anything: Decodable { init(from _: any Decoder) throws {} }
    private struct Name: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue _: Int) { nil }
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        let position = try container.decodeIfPresent(Position.self, forKey: .position)
        x = position?.x ?? 0
        y = position?.y ?? 0
        /// An object's own keys. JSON decoding does not keep their order, so they are read sorted.
        func keys(_ key: CodingKeys) -> [String] {
            ((try? container.nestedContainer(keyedBy: Name.self, forKey: key))?.allKeys.map(\.stringValue) ?? []).sorted()
        }
        let name = try container.decode(String.self, forKey: .kind)
        switch name {
        case "start":
            kind = .start(inputs: try container.decodeIfPresent([WorkflowField].self, forKey: .inputs) ?? [])
        case "end":
            kind = .end(outputs: keys(.outputs))
        case "step":
            kind = .step(
                harness: try container.decodeIfPresent(String.self, forKey: .harness) ?? "",
                model: try container.decodeIfPresent(String.self, forKey: .model) ?? "",
                prompt: try container.decodeIfPresent(String.self, forKey: .prompt) ?? ""
            )
        case "check":
            kind = .check(rules: (try container.decodeIfPresent([Anything].self, forKey: .rules) ?? []).count)
        case "branch":
            kind = .branch(ports: (try container.decodeIfPresent([Case].self, forKey: .cases) ?? []).map(\.port))
        case "map":
            kind = .map(
                over: try container.decodeIfPresent(String.self, forKey: .over) ?? "",
                body: try container.decodeIfPresent(WorkflowGraph.self, forKey: .body) ?? WorkflowGraph(nodes: [], edges: [], settings: nil)
            )
        case "workflow":
            kind = .workflow(workflowId: try container.decodeIfPresent(String.self, forKey: .workflowId) ?? "", inputs: keys(.inputs).count)
        case "ask":
            kind = .ask(
                question: try container.decodeIfPresent(String.self, forKey: .question) ?? "",
                options: (try container.decodeIfPresent([Option].self, forKey: .options) ?? []).map(\.label),
                allowOther: try container.decodeIfPresent(Bool.self, forKey: .allowOther) ?? false
            )
        case "jev":
            kind = .jev(questions: (try container.decodeIfPresent([Question].self, forKey: .questions) ?? []).map(\.type))
        default:
            kind = .other(name)
        }
    }
}

/// One edge of a workflow's graph (core `WorkflowEdge`): from a node's port
/// to a node, on a condition or always, and for a cycle at most so many times.
public struct WorkflowEdge: Decodable, Sendable, Equatable, Identifiable {
    public struct Source: Decodable, Sendable, Equatable {
        public let node: String
        public let port: String
    }

    public struct Target: Decodable, Sendable, Equatable {
        public let node: String
    }

    public struct When: Decodable, Sendable, Equatable {
        public let path: String
        public let op: String
        /// What it compares with, as the JSON the web would print; nil when it compares with nothing.
        public let value: String?

        private enum CodingKeys: String, CodingKey { case path, op, value }

        public init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            path = try container.decode(String.self, forKey: .path)
            op = try container.decode(String.self, forKey: .op)
            if container.contains(.value), let held = try? container.decode(OpenAPIValueContainer.self, forKey: .value) {
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.withoutEscapingSlashes, .sortedKeys]
                value = (try? encoder.encode(held)).flatMap { String(data: $0, encoding: .utf8) }
            } else {
                value = nil
            }
        }
    }

    public let id: String
    public let from: Source
    public let to: Target
    public let when: When?
    public let maxIterations: Double?
}

/// A workflow's graph: its nodes, its edges and the defaults a launch starts from.
public struct WorkflowGraph: Decodable, Sendable, Equatable {
    public struct Settings: Decodable, Sendable, Equatable {
        public struct Supervisor: Decodable, Sendable, Equatable {
            public let delegateType: String?
        }

        public let defaultProject: String?
        public let defaultMachine: String?
        public let defaultSupervisor: Supervisor?
    }

    public let nodes: [WorkflowNode]
    public let edges: [WorkflowEdge]
    public let settings: Settings?

    /// A graph of nothing, for a canvas before its workflow is read.
    public static let empty = WorkflowGraph(nodes: [], edges: [], settings: nil)
}

/// A workflow: its name and description, how it is authored, its program,
/// the inputs a program declared, and a drawn workflow's graph.
public struct WorkflowRow: Decodable, Sendable, Equatable, Identifiable {
    /// A graph the editor compiles, or a program written by hand; fixed at creation.
    public enum Origin: String, Decodable, Sendable { case editor, code }

    public let id: String
    public let name: String
    public let description: String
    public let origin: Origin
    public let program: String
    public let inputs: [WorkflowField]
    public let graph: WorkflowGraph?

    /// What the launch form asks for: the Start node's inputs for a graph;
    /// for a program, the `inputs` export the hub evaluated at save.
    public var fields: [WorkflowField] {
        for node in graph?.nodes ?? [] {
            if case let .start(inputs) = node.kind { return inputs }
        }
        return inputs
    }
}

/// What the hub's compiler or typechecker said about a workflow: the node,
/// the edge or the program line it belongs to, when it names one.
public struct WorkflowProblem: Decodable, Sendable, Equatable {
    public let message: String
    public let nodeId: String?
    public let edgeId: String?
    public let line: Double?
}

/// A workflow as its own page reads it: the workflow, and the hub's problems with it as saved.
public struct WorkflowDetail: Decodable, Sendable, Equatable {
    public let workflow: WorkflowRow
    public let problems: [WorkflowProblem]

    private enum CodingKeys: String, CodingKey { case problems }

    public init(from decoder: any Decoder) throws {
        workflow = try WorkflowRow(from: decoder)
        problems = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent([WorkflowProblem].self, forKey: .problems) ?? []
    }
}

/// Every workflow, and the launches and creations the Workflows page makes
/// (workflow-state.svelte.ts `refreshWorkflows`, workflows.ts). Its runs are
/// the fleet's (`FleetStore.runs`), which `workflow` frames keep current.
@MainActor @Observable
public final class WorkflowsStore {
    public private(set) var workflows: [WorkflowRow] = []
    /// What the last read failed with; empty while one is out or it came back.
    public private(set) var error = ""
    /// The first read of every workflow and its runs has come back, or failed.
    public private(set) var loaded = false
    @ObservationIgnored private unowned let hub: HubConnection
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Workflows")

    init(hub: HubConnection) { self.hub = hub }

    func reset() {
        workflows = []
        error = ""
        loaded = false
    }

    /// Reads every workflow and its runs. A read under way answers for
    /// itself: an error left by one that failed while the hub was away does
    /// not stand while the fresh one is out.
    public func refresh() async {
        guard let client = hub.client else { return }
        error = ""
        let adopt = await Self.read(client)
        adopt(self)
    }

    /// Read and shaped off the main actor, as the registry is.
    @concurrent
    private nonisolated static func read(_ client: Client) async -> @MainActor @Sendable (WorkflowsStore) -> Void {
        do {
            let rows: [WorkflowRow]
            switch try await client.getApiWorkflows() {
            case let .ok(ok): rows = try Wire.transcode(ok.body.json.workflows)
            case let .undocumented(statusCode, _): throw HubConnection.ControlError(message: "The hub answered \(statusCode).")
            }
            var names: [String: String] = [:]
            for workflow in rows {
                names[workflow.id] = workflow.name
            }
            let batches = try await withThrowingTaskGroup(of: [Components.Schemas.PublicRun].self) { group in
                for workflow in rows {
                    group.addTask { try await client.getApiWorkflowsByIdRuns(path: .init(id: workflow.id)).ok.body.json.runs }
                }
                var all: [Components.Schemas.PublicRun] = []
                for try await runs in group {
                    all += runs
                }
                return all
            }
            var runs: [String: BoardRun] = [:]
            for run in batches {
                runs[run.value1.id] = BoardRun(run)
            }
            return { [names, runs] store in
                store.workflows = rows
                store.error = ""
                store.loaded = true
                store.hub.fleet.adopt(workflowNames: names, runs: runs)
                store.hub.fleet.runsRead = true
            }
        } catch {
            let said = error.localizedDescription
            return { store in
                log.error("workflows unreadable: \(said, privacy: .public)")
                store.error = said
                store.loaded = true
                store.hub.fleet.runsRead = true
            }
        }
    }

    /// One workflow whole, with what the hub's compiler said about it as saved (workflows.ts `loadWorkflow`).
    public func load(_ id: String) async throws -> WorkflowDetail {
        let response = try await hub.api.workflows.read(.init(path: .init(id: id)))
        guard case let .ok(ok) = response else {
            if case let .undocumented(statusCode, _) = response {
                throw HubConnection.ControlError(message: "The hub answered \(statusCode).")
            }
            throw HubConnection.ControlError(message: "The hub could not read this workflow.")
        }
        return try Wire.transcode(ok.body.json)
    }

    /// What a **New program** starts from (workflow-ui.ts `STARTER_PROGRAM`).
    private static let starterProgram = """
    import { z } from "zod";

    export const inputs = z.object({});

    export default async function (w: Workflow<typeof inputs>) {
      // Add a step with w.run({ title, harness, model, prompt, output }).
      return {};
    }

    """

    private struct Creation: Encodable {
        struct Graph: Encodable {
            struct Node: Encodable {
                struct Position: Encodable {
                    let x: Double
                    let y: Double
                }

                let id: String
                let title: String
                let position: Position
                let kind: String
                let inputs: [String]
            }

            let nodes: [Node]
            let edges: [String]
        }

        let name: String
        let graph: Graph?
        let program: String?
    }

    /// Creates a workflow the way it will be authored, a program written by
    /// hand or a graph the editor compiles, and answers with its id.
    @discardableResult
    public func create(program: Bool) async throws -> String {
        let api = try hub.api
        let start = Creation.Graph.Node(
            id: "start-\(UUID().uuidString.lowercased().prefix(8))", title: "Start", position: .init(x: 80, y: 120), kind: "start", inputs: []
        )
        let body = program
            ? Creation(name: "Untitled program", graph: nil, program: Self.starterProgram)
            : Creation(name: "Untitled workflow", graph: .init(nodes: [start], edges: []), program: nil)
        let response = try await api.workflows.create(.init(body: .json(Wire.transcode(body))))
        let id: String
        switch response {
        case let .created(made):
            id = try made.body.json.id
        case let .badRequest(bad):
            if let refused = try? bad.body.json {
                throw HubConnection.ControlError(message: refused.problems.first?.message ?? "The hub refused the save without saying why.")
            }
            throw HubConnection.ControlError(message: try await String(collecting: bad.body.plainText, upTo: 64_000))
        case let .forbidden(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 403))
        case let .notFound(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 404))
        case let .conflict(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 409))
        case let .undocumented(statusCode, _):
            throw HubConnection.ControlError(message: "The hub answered \(statusCode).")
        }
        await refresh()
        return id
    }

    private struct Launch: Encodable {
        struct Workspace: Encodable {
            let path: String
            let machineId: String
        }

        struct Supervisor: Encodable {
            let delegateType: String
        }

        let inputs: [String: String]
        let workspace: Workspace
        let supervisor: Supervisor?

        private enum CodingKeys: String, CodingKey { case inputs, workspace, supervisor }

        /// No supervisor goes as `null`, as the web sends it.
        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(inputs, forKey: .inputs)
            try container.encode(workspace, forKey: .workspace)
            if let supervisor {
                try container.encode(supervisor, forKey: .supervisor)
            } else {
                try container.encodeNil(forKey: .supervisor)
            }
        }
    }

    /// Starts a run of a workflow in a directory on a machine, and answers with the run's id.
    public func launch(_ id: String, inputs: [String: String], machineId: String, path: String, supervisor: String) async throws -> String {
        let api = try hub.api
        let body = Launch(inputs: inputs, workspace: .init(path: path, machineId: machineId), supervisor: supervisor.isEmpty ? nil : .init(delegateType: supervisor))
        let response = try await api.workflows.launch(.init(path: .init(id: id), body: .json(Wire.transcode(body))))
        switch response {
        case let .ok(ok):
            return try ok.body.json.runId
        case let .badRequest(bad):
            let text = try await String(collecting: bad.body.plainText, upTo: 64_000)
            throw HubConnection.ControlError(message: text.isEmpty ? "The hub answered 400." : text)
        case let .forbidden(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 403))
        case let .notFound(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 404))
        case let .conflict(refused):
            throw HubConnection.ControlError(message: try await Wire.sentence(refused.body.plainText, status: 409))
        case let .undocumented(statusCode, _):
            throw HubConnection.ControlError(message: "The hub answered \(statusCode).")
        }
    }

    /// The delegate types a run's supervisor is chosen from, by name.
    public func delegateTypes() async throws -> [String] {
        try await hub.api.delegates.types().ok.body.json.types.map(\.name)
    }
}
