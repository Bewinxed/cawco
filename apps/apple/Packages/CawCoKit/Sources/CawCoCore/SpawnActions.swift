public import CawCoAPI
import Foundation
import OpenAPIRuntime

// What the new-session form asks the hub beyond a spawn: whether a location
// can be read, what the `/` menu offers, and "continue in new session"
// (NewSessionDialog.svelte, continue.svelte.ts).

/// The hub's sizing of what a continuation carries (`GET /api/instances/{id}/continue`).
public struct ContinuationEstimate: Sendable, Equatable {
    public let liveContextTokens: Double
    public let summariseInputTokens: Double
    public let openingTokens: Double
}

extension HubConnection {
    public typealias ContinuationRequest = Operations.PostApiInstancesByIdContinue.Input.Body.JsonPayload

    /// Reads `path` on a machine as a spawn would (NewSessionDialog
    /// `inspectLocation`): the machine's own inspection, and a listing. True
    /// when the folder is missing, which a start creates; any other failure throws.
    public func inspectLocation(machineId: String, path: String) async throws -> Bool {
        async let inspected = api.machines.inspect(.init(path: .init(machineId: machineId), body: .json(.init(cwd: path))))
        async let listed: Bool = {
            do {
                _ = try await self.listFiles(machineId: machineId, path: path)
                return false
            } catch {
                if error.localizedDescription.hasPrefix("ENOENT:") { return true }
                throw error
            }
        }()
        guard case .ok = try await inspected else {
            throw ControlError(message: "That directory can't be read.")
        }
        return try await listed
    }

    /// The claude context windows the hub has observed, for pickers that size models.
    public func readModelWindows() async throws {
        let windows = try await api.models.windows().ok.body.json.claude.value
        var read: [String: Double] = [:]
        for (id, value) in windows {
            if let number = value as? Double { read[id] = number } else if let number = value as? Int { read[id] = Double(number) }
        }
        SpawnMemory.claudeWindows = read
    }

    /// The fleet's skills and plugins, as the prompt's `/` menu offers them.
    /// A hub without a fleet catalog leaves the menu with nothing to offer.
    public func spawnMenu() async -> (skills: [String], plugins: [String]) {
        guard let snapshot = try? await api.fleet.read().ok.body.json else { return ([], []) }
        return (snapshot.skills.map(\.name), snapshot.config.plugins.map(\.id))
    }

    public func continuationEstimate(instanceId: String) async throws -> ContinuationEstimate {
        switch try await api.instances.prepareContinuation(.init(path: .init(id: instanceId))) {
        case let .ok(ok):
            let sized = try ok.body.json
            return ContinuationEstimate(liveContextTokens: sized.liveContextTokens, summariseInputTokens: sized.summariseInputTokens,
                                        openingTokens: sized.openingTokens)
        case let .unprocessableContent(refused):
            throw ControlError(message: try await Self.text(refused.body))
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.text(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    /// Starts a continuation of `sourceId`: the hub answers with the job's id
    /// at once and runs it from there.
    public func startContinuation(sourceId: String, request: ContinuationRequest) async throws -> String {
        switch try await api.instances.continueSession(.init(path: .init(id: sourceId), body: .json(request))) {
        case let .ok(ok):
            return try ok.body.json.continuationId
        case let .conflict(refused):
            throw ControlError(message: try await Self.text(try refused.body.plainText))
        case let .unprocessableContent(refused):
            throw ControlError(message: try await Self.text(refused.body))
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.text(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    /// Cancel: the hub stops the summariser and starts nothing. Throws the hub's refusal.
    public func cancelContinuation(id: String) async throws {
        switch try await api.instances.cancelContinuation(.init(path: .init(id: id))) {
        case .ok:
            return
        case let .notFound(refused):
            throw ControlError(message: try await Self.text(try refused.body.plainText))
        case let .conflict(refused):
            throw ControlError(message: try await Self.text(try refused.body.plainText))
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.text(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    private static func text(_ body: HTTPBody?, or fallback: String = "") async throws -> String {
        guard let body else { return fallback }
        let read = try await String(collecting: body, upTo: 64000)
        return read.isEmpty ? fallback : read
    }

    private static func text(_ body: Operations.GetApiInstancesByIdContinue.Output.UnprocessableContent.Body) async throws -> String {
        switch body {
        case let .plainText(text): try await Self.text(text)
        case let .applicationProblemJson(problem): problem.detail ?? "The hub refused \(problem.property ?? "this request")."
        }
    }

    private static func text(_ body: Operations.PostApiInstancesByIdContinue.Output.UnprocessableContent.Body) async throws -> String {
        switch body {
        case let .plainText(text): try await Self.text(text)
        case let .applicationProblemJson(problem): problem.detail ?? "The hub refused \(problem.property ?? "this request")."
        }
    }
}
