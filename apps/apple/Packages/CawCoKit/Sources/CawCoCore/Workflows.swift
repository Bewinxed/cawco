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

/// A workflow as the Workflows page and its launch form read it: its name
/// and description, the inputs a program declared, and of a drawn graph only
/// the Start node's inputs and the launch defaults.
public struct WorkflowRow: Decodable, Sendable, Equatable, Identifiable {
    public struct Graph: Decodable, Sendable, Equatable {
        public struct Node: Decodable, Sendable, Equatable {
            public let kind: String
            /// The Start node's inputs. A `workflow` node's `inputs` is an
            /// object of templates and reads as nil here.
            public let inputs: [WorkflowField]?

            private enum CodingKeys: String, CodingKey { case kind, inputs }

            public init(from decoder: any Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                kind = try container.decode(String.self, forKey: .kind)
                inputs = kind == "start" ? try container.decode([WorkflowField].self, forKey: .inputs) : nil
            }
        }

        public struct Settings: Decodable, Sendable, Equatable {
            public struct Supervisor: Decodable, Sendable, Equatable {
                public let delegateType: String?
            }

            public let defaultProject: String?
            public let defaultMachine: String?
            public let defaultSupervisor: Supervisor?
        }

        public let nodes: [Node]
        public let settings: Settings?
    }

    public let id: String
    public let name: String
    public let description: String
    public let inputs: [WorkflowField]
    public let graph: Graph?

    /// What the launch form asks for: the Start node's inputs for a graph;
    /// for a program, the `inputs` export the hub evaluated at save.
    public var fields: [WorkflowField] {
        graph?.nodes.first { $0.kind == "start" }?.inputs ?? inputs
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
        case let .undocumented(statusCode, _):
            throw HubConnection.ControlError(message: "The hub answered \(statusCode).")
        }
    }

    /// The delegate types a run's supervisor is chosen from, by name.
    public func delegateTypes() async throws -> [String] {
        try await hub.api.delegates.types().ok.body.json.types.map(\.name)
    }
}
