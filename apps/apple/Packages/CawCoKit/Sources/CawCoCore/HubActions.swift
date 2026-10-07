public import CawCoAPI
public import Foundation
public import OpenAPIRuntime

/// Readings supplied by session controls (the web's `ContextUsage` shape).
public struct ContextUsage: Codable, Sendable {
    public struct Category: Codable, Sendable {
        public let name: String
        public let tokens: Double
        public let color: String
    }
    public let categories: [Category]
    public let maxTokens: Double
    public let percentage: Double
    public let totalTokens: Double
}

public struct LoginChallenge: Codable, Sendable { public let url: String }
public struct FileWriteResult: Codable, Sendable { public let bytes: Double }
public struct ReloadedSkills: Codable, Sendable { public let skills: [Components.Schemas.SlashCommand] }

extension HubConnection {
    /// Starts new work or resumes/forks/relaunches the supplied session. The
    /// generated payload carries every spawn option; no settings are guessed.
    @discardableResult
    public func spawn(machineId: String, payload: Components.Schemas.SpawnPayload, prompt: String? = nil) async throws -> String {
        var payload = payload
        let requestId = UUID().uuidString.lowercased()
        payload.requestId = requestId
        _ = try await request(machineId: machineId, instanceId: payload.instanceId,
                              verb: .spawn, requestId: requestId, payload: payload)
        if let prompt, !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            _ = try await sendMessage(instanceId: payload.instanceId, machineId: machineId, text: prompt)
        }
        return payload.instanceId
    }

    @discardableResult
    public func resume(machineId: String, payload: Components.Schemas.SpawnPayload, sessionKey: String) async throws -> String {
        var payload = payload
        payload.resume = .init(sessionKey: sessionKey)
        return try await spawn(machineId: machineId, payload: payload)
    }

    @discardableResult
    public func fork(machineId: String, cwd: String, sessionKey: String,
        harness: Components.Schemas.SpawnPayload.HarnessPayload = .claude, at: String? = nil) async throws -> String {
        let sourceId = fleet.conversationId(sessionKey: sessionKey, machineId: machineId, cwd: cwd)
        let source = fleet.byId[sourceId]
        let payload = Components.Schemas.SpawnPayload(
            cwd: cwd,
            effort: source?.effort.flatMap { .init(rawValue: $0.rawValue) },
            harness: harness,
            instanceId: UUID().uuidString.lowercased(),
            model: source?.model.flatMap { $0.isEmpty ? nil : $0 },
            // A branch is a new session nobody picked a mode for, so a Full
            // Send source branches on Bypass (`SpawnPrefs.unpicked`).
            permissionMode: source?.permissionMode
                .flatMap(Components.Schemas.SpawnPayload.PermissionModePayload.init(rawValue:))
                .map(SpawnPrefs.unpicked),
            resume: .init(sessionKey: sessionKey, fork: true, atMessage: at.flatMap { $0.isEmpty ? nil : $0 }),
            scratch: .init()
        )
        let id = try await spawn(machineId: machineId, payload: payload)
        _ = await refresh()
        return id
    }

    /// Spawn-in-place is the hub's atomic replacement operation. It stops the
    /// previous process itself, just as the web's relaunch and rewind do.
    public func relaunch(machineId: String, payload: Components.Schemas.SpawnPayload, sessionKey: String, continuePrompt: String? = nil) async throws {
        var payload = payload
        payload.resume = .init(sessionKey: sessionKey)
        _ = try await spawn(machineId: machineId, payload: payload, prompt: continuePrompt)
    }

    public func editAndResend(machineId: String, payload: Components.Schemas.SpawnPayload, sessionKey: String,
                              atMessage: String, text: String) async throws {
        var payload = payload
        payload.resume = .init(sessionKey: sessionKey, atMessage: atMessage)
        _ = try await spawn(machineId: machineId, payload: payload, prompt: text)
    }

    /// Ends the process, rather than merely interrupting its current turn.
    public func stopSession(instanceId: String, machineId: String, discard: Bool = false) async throws {
        let requestId = UUID().uuidString.lowercased()
        let payload = Components.Schemas.StopPayload(discard: discard, instanceId: instanceId, requestId: requestId)
        _ = try await request(machineId: machineId, instanceId: instanceId, verb: .stop,
                              requestId: requestId, payload: payload, timeout: .seconds(30))
    }

    public func listFiles(machineId: String, path: String) async throws -> [Components.Schemas.FsEntry] {
        try await fileRequest(machineId: machineId, op: .list, path: path)
    }
    public func readFile(machineId: String, path: String) async throws -> String {
        try await fileRequest(machineId: machineId, op: .read, path: path)
    }
    public func writeFile(machineId: String, path: String, content: String) async throws -> FileWriteResult {
        try await fileRequest(machineId: machineId, op: .write, path: path, content: content)
    }
    public func readImage(machineId: String, path: String) async throws -> Components.Schemas.FsImage {
        try await fileRequest(machineId: machineId, op: .image, path: path)
    }
    private func fileRequest<T: Decodable & Sendable>(machineId: String, op: Components.Schemas.FsPayload.OpPayload,
                                           path: String, content: String? = nil) async throws -> T {
        let requestId = UUID().uuidString.lowercased()
        let payload = Components.Schemas.FsPayload(content: content, op: op, path: path, requestId: requestId)
        return try await Self.decodeResult(await request(machineId: machineId, verb: .fs, requestId: requestId, payload: payload))
    }

    /// Typed escape hatch for the machine's other neutral controls. The
    /// concrete wrappers below are the web dashboard's current controls.
    public func machineControl<T: Decodable & Sendable>(machineId: String, method: String, args: [OpenAPIValueContainer] = [],
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil, timeout: Duration = .seconds(15)) async throws -> T {
        try await Self.decodeResult(await control(machineId, harness: harness, method: method, args: args, timeout: timeout))
    }
    public func sessionControl<T: Decodable & Sendable>(instanceId: String, machineId: String, method: String,
                                             args: [OpenAPIValueContainer] = []) async throws -> T {
        try await Self.decodeResult(await control(machineId, instanceId: instanceId, method: method, args: args))
    }
    /// A control's answer in its typed shape, decoded off the main actor: a
    /// machine's stored-session catalog is hundreds of rows.
    @concurrent
    private nonisolated static func decodeResult<T: Decodable & Sendable>(_ result: OpenAPIValueContainer?) async throws -> T {
        try Wire.decoder().decode(T.self, from: result.map { try Wire.data($0) } ?? Data("null".utf8))
    }

    public func setModelControl(instanceId: String, machineId: String, model: String) async throws {
        _ = try await control(machineId, instanceId: instanceId, method: "setModel", args: [model])
    }
    public func setPermissionModeControl(instanceId: String, machineId: String, mode: Components.Schemas.SpawnPayload.PermissionModePayload) async throws {
        _ = try await control(machineId, instanceId: instanceId, method: "setPermissionMode", args: [mode.rawValue])
    }
    public func supportedModels(instanceId: String, machineId: String) async throws -> [Components.Schemas.ModelInfo] {
        try await sessionControl(instanceId: instanceId, machineId: machineId, method: "supportedModels")
    }
    public func contextUsage(instanceId: String, machineId: String) async throws -> ContextUsage {
        try await sessionControl(instanceId: instanceId, machineId: machineId, method: "getContextUsage")
    }
    public func mcpServerStatus(instanceId: String, machineId: String) async throws -> [Components.Schemas.McpServerStatus] {
        try await sessionControl(instanceId: instanceId, machineId: machineId, method: "mcpServerStatus")
    }
    public func supportedCommands(instanceId: String, machineId: String) async throws -> Components.Schemas.SupportedCommands {
        try await sessionControl(instanceId: instanceId, machineId: machineId, method: "supportedCommands")
    }
    public func reloadSkills(instanceId: String, machineId: String) async throws -> ReloadedSkills? {
        try await sessionControl(instanceId: instanceId, machineId: machineId, method: "reloadSkills")
    }

    public func listSessions(machineId: String, limit: Int? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil) async throws -> [Components.Schemas.NeutralSessionInfo] {
        let options: [String: (any Sendable)?] = limit.map { ["limit": $0] } ?? [:]
        return try await Self.decodeResult(await control(machineId, harness: harness, method: "listSessions", args: [options]))
    }
    public func renameSession(machineId: String, sessionKey: String, title: String, dir: String? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil) async throws {
        _ = try await control(machineId, harness: harness, method: "renameSession", args: [sessionKey, title, directory(dir)])
    }

    /// Names the live hub row; stored-session naming remains `renameSession`.
    public func renameInstance(id: String, title: String) async throws {
        try await updateSession(id: id, body: .init(title: title), action: "rename")
    }

    public func keepSession(id: String) async throws {
        try await updateSession(id: id, body: .init(kind: .mainline), action: "keep")
        guard var row = fleet.byId[id] else { return }
        row.kind = "mainline"
        fleet.patch(upserts: [row], removed: [])
        if let sessionKey = row.sessionId, !sessionKey.isEmpty, !row.machineId.isEmpty {
            try await tagSession(machineId: row.machineId, sessionKey: sessionKey, tag: nil,
                dir: row.cwd.isEmpty ? nil : row.cwd,
                harness: row.harness.flatMap { .init(rawValue: $0) })
            try await reloadCatalog(row.machineId)
        }
    }

    private func updateSession(id: String, body: Operations.PatchApiInstancesById.Input.Body.JsonPayload, action: String) async throws {
        let response = try await api.instances.update(.init(path: .init(id: id), body: .json(body)))
        let statusCode: Int
        switch response {
        case .ok: return
        case .badRequest: statusCode = 400
        case .notFound: statusCode = 404
        case .conflict: statusCode = 409
        case .unprocessableContent: statusCode = 422
        case .internalServerError: statusCode = 500
        case .serviceUnavailable: statusCode = 503
        case .gatewayTimeout: statusCode = 504
        case let .undocumented(code, _): statusCode = code
        }
        throw ControlError(message: "Could not \(action) this session — the hub answered \(statusCode). Try again.")
    }

    public func removeSession(id: String) async throws {
        let response = try await api.instances.remove(.init(path: .init(id: id)))
        let body: HTTPBody?
        switch response {
        case .ok:
            _ = await refresh()
            return
        case let .notFound(answer): body = try answer.body.plainText
        case let .conflict(answer): body = try answer.body.plainText
        case let .badGateway(answer): body = try answer.body.plainText
        case let .undocumented(_, answer): body = answer.body
        }
        let message: String
        if let body {
            message = try await String(collecting: body, upTo: 64_000)
        } else {
            message = ""
        }
        throw ControlError(message: message)
    }
    public func deleteSession(machineId: String, sessionKey: String, dir: String? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil) async throws {
        _ = try await control(machineId, harness: harness, method: "deleteSession", args: [sessionKey, directory(dir)])
    }
    public func tagSession(machineId: String, sessionKey: String, tag: String?, dir: String? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil) async throws {
        _ = try await control(machineId, harness: harness, method: "tagSession", args: [sessionKey, tag, directory(dir)])
    }
    private func directory(_ dir: String?) -> [String: String] { dir.map { ["dir": $0] } ?? [:] }
    public func todos(machineId: String, sessionKey: String, dir: String? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload = .opencode) async throws -> [Components.Schemas.NeutralTask] {
        try await Self.decodeResult(await control(machineId, harness: harness, method: "getTodos", args: [sessionKey, dir]))
    }
    public func repositories(machineId: String) async throws -> Components.Schemas.ReposResult {
        try await machineControl(machineId: machineId, method: "listRepos")
    }
    public func beginLogin(machineId: String) async throws -> LoginChallenge {
        try await machineControl(machineId: machineId, method: "beginLogin")
    }
    public func completeLogin(machineId: String, code: String) async throws -> Components.Schemas.AuthState {
        try await Self.decodeResult(await control(machineId, method: "completeLogin", args: [code]))
    }
    public func unlockKeychain(machineId: String, password: String) async throws -> Components.Schemas.AuthState {
        try await Self.decodeResult(await control(machineId, method: "unlockKeychain", args: [password]))
    }
    public func installTool(machineId: String, id: String, pinnedVersion: String? = nil) async throws -> Components.Schemas.ToolStatus {
        let args = pinnedVersion.map { [id, $0] } ?? [id]
        return try await Self.decodeResult(await control(machineId, method: "installTool", args: args, timeout: .seconds(300)))
    }
    public func updateMachine(machineId: String, restartAgent: Bool = true, force: Bool = false) async throws -> Components.Schemas.UpdateReport {
        try await Self.decodeResult(await control(machineId, method: "updateCawco",
            args: [["restartAgent": restartAgent, "force": force]], timeout: .seconds(180)))
    }

    /// A send's uuid is the ledger command id, just as on the web. Attachments
    /// and images use the generated SendPayload entries without re-shaping.
    @discardableResult
    public func sendMessage(instanceId: String, machineId: String, text: String,
        attachments: [Components.Schemas.SendAttachment]? = nil,
        images: Components.Schemas.SendPayload.ImagesPayload? = nil) async throws -> Ledger.Command {
        try await ledger.execute(kind: .send, sessionId: instanceId, machineId: machineId) { id in
            let message = try OpenAPIValueContainer(unvalidatedValue: [
                "type": "user", "uuid": id, "origin": ["kind": "human"],
                "message": ["role": "user", "content": text],
                "parent_tool_use_id": nil,
            ] as [String: (any Sendable)?])
            let payload = Components.Schemas.SendPayload(attachments: attachments, images: images, instanceId: instanceId,
                message: try Wire.transcode(message, as: Components.Schemas.SentMessage.self))
            return try Wire.transcode(payload, as: OpenAPIValueContainer.self)
        }
    }
    @discardableResult
    public func interruptAndSend(instanceId: String, machineId: String, text: String,
        attachments: [Components.Schemas.SendAttachment]? = nil,
        images: Components.Schemas.SendPayload.ImagesPayload? = nil) async throws -> Ledger.Command {
        _ = try await command(instanceId: instanceId, machineId: machineId, kind: .interrupt, method: "interrupt", args: [])
        return try await sendMessage(instanceId: instanceId, machineId: machineId, text: text, attachments: attachments, images: images)
    }
    @discardableResult
    public func setModel(instanceId: String, machineId: String, model: String) async throws -> Ledger.Command {
        try await command(instanceId: instanceId, machineId: machineId, kind: .setModel, method: "setModel", args: [model])
    }
    @discardableResult
    public func setEffort(instanceId: String, machineId: String, effort: Components.Schemas.SpawnPayload.EffortPayload) async throws -> Ledger.Command {
        try await command(instanceId: instanceId, machineId: machineId, kind: .setEffort, method: "setEffort", args: [effort.rawValue])
    }
    @discardableResult
    public func setPermissionMode(instanceId: String, machineId: String, mode: Components.Schemas.SpawnPayload.PermissionModePayload) async throws -> Ledger.Command {
        try await command(instanceId: instanceId, machineId: machineId, kind: .setPermissionMode, method: "setPermissionMode", args: [mode.rawValue])
    }
    private func command(instanceId: String, machineId: String, kind: Components.Schemas.CommandKind,
                         method: String, args: [String]) async throws -> Ledger.Command {
        try await ledger.execute(kind: kind, sessionId: instanceId, machineId: machineId) { id in
            let payload = Components.Schemas.ControlPayload(args: try args.map { try OpenAPIValueContainer(unvalidatedValue: $0) },
                instanceId: instanceId, method: method, requestId: id)
            return try Wire.transcode(payload, as: OpenAPIValueContainer.self)
        }
    }
}
