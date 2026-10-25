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

public struct FileWriteResult: Codable, Sendable { public let bytes: Double }
public struct ReloadedSkills: Codable, Sendable { public let skills: [Components.Schemas.SlashCommand] }

/// A conversation a Fork branches, where it lives, and the message it branches at (none: its end).
public struct ForkSource: Sendable {
    public var machineId: String
    public var cwd: String
    public var sessionKey: String
    public var harness: Components.Schemas.HarnessKind
    public var at: String?

    public init(machineId: String, cwd: String, sessionKey: String, harness: Components.Schemas.HarnessKind, at: String? = nil) {
        self.machineId = machineId
        self.cwd = cwd
        self.sessionKey = sessionKey
        self.harness = harness
        self.at = at
    }
}

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

    /// A harness as a request names it, refused in words when this build's
    /// payloads do not know it (a newer hub's): nothing stands in for it.
    func requested<Named: RawRepresentable>(_ harness: Components.Schemas.HarnessKind) throws -> Named
    where Named.RawValue == String {
        guard let named = Named(rawValue: harness.rawValue) else {
            throw ControlError(message: "This app can't reach a \(harness.rawValue) session. Update it, then try again.")
        }
        return named
    }

    /// A branch of the conversation `source.sessionKey` on its own harness
    /// (the source row's, or its catalog entry's), as it goes out with no
    /// form: its source's model, effort and recorded mode. A branch is a new
    /// session nobody picked a mode for, so a Full Send source branches on
    /// Bypass (`SpawnPrefs.unpicked`). No mode when its source recorded none.
    public func forkPayload(_ source: ForkSource) throws -> Components.Schemas.SpawnPayload {
        let sourceId = fleet.conversationId(sessionKey: source.sessionKey, machineId: source.machineId, cwd: source.cwd)
        let row = fleet.byId[sourceId]?.session
        return Components.Schemas.SpawnPayload(
            cwd: source.cwd,
            effort: row?.effort.flatMap { .init(rawValue: $0.rawValue) },
            harness: try requested(source.harness) as Components.Schemas.SpawnPayload.HarnessPayload,
            instanceId: UUID().uuidString.lowercased(),
            model: row?.model.flatMap { $0.isEmpty ? nil : $0 },
            permissionMode: row?.permissionMode
                .flatMap(Components.Schemas.SpawnPayload.PermissionModePayload.init(rawValue:))
                .map(SpawnPrefs.unpicked),
            resume: .init(sessionKey: source.sessionKey, fork: true, atMessage: source.at.flatMap { $0.isEmpty ? nil : $0 }),
            scratch: .init()
        )
    }

    /// Fork: the branch starts at once on what its source carries, and its
    /// id comes back. A source that recorded no mode, on a harness that has
    /// modes there (or hasn't said which), carries none to start on: the
    /// branch goes to `unchosen` (the New Session sheet, whose Start waits
    /// for a pick) and nil comes back.
    public func fork(_ source: ForkSource, unchosen: (ForkSource) -> Void) async throws -> String? {
        let payload = try forkPayload(source)
        let report = fleet.machines.first { $0.machineId == source.machineId }?
            .harnesses?.first { $0.harness.rawValue == source.harness.rawValue }
        guard payload.permissionMode != nil || report?.capabilities.permissionModes.isEmpty == true else {
            unchosen(source)
            return nil
        }
        return try await fork(machineId: source.machineId, payload: payload)
    }

    /// Sends a branch (`forkPayload`, as it stands or as the form set it) and its first prompt, when it has one.
    @discardableResult
    public func fork(machineId: String, payload: Components.Schemas.SpawnPayload, prompt: String? = nil) async throws -> String {
        let id = try await spawn(machineId: machineId, payload: payload, prompt: prompt)
        _ = await refresh()
        return id
    }

    /// How a session runs again (core `relaunchOf`, the one rule): on the
    /// conversation it named when it has one, fresh under the same id when it
    /// never named one, and not at all when its conversation is gone.
    public enum Relaunch: Equatable, Sendable {
        case resume(sessionKey: String)
        case fresh
        case refused(String)

        /// Core `CLAUDE_CONVERSATION_GONE`: the row's `lastError` when its conversation can't be resumed.
        public static let conversationGone = "This Claude Code conversation is gone and cannot be resumed. Start a new session to continue working."

        /// Refused when the row's `lastErrorKind` is `conversation-gone`. A hub from
        /// before the kind sends none, and its `lastError` words are what it says.
        public static func of(sessionId: String?, lastErrorKind: OpenEnums.ErrorFrameLastErrorKind?, lastError: String?) -> Relaunch {
            if let lastErrorKind {
                if case .conversationGone = lastErrorKind { return .refused(lastError ?? conversationGone) }
            } else if lastError == conversationGone {
                return .refused(conversationGone)
            }
            return sessionId.map { .resume(sessionKey: $0) } ?? .fresh
        }
    }

    /// Spawn-in-place is the hub's atomic replacement operation. It stops the
    /// previous process itself, just as the web's relaunch and rewind do.
    /// `relaunch` says so to the machine: without it, a resume of a session
    /// it runs is a recovery, and the old process is kept.
    public func relaunch(machineId: String, payload: Components.Schemas.SpawnPayload, plan: Relaunch, continuePrompt: String? = nil) async throws {
        var payload = payload
        switch plan {
        case let .refused(reason): throw ControlError(message: reason)
        case let .resume(sessionKey): payload.resume = .init(sessionKey: sessionKey)
        case .fresh: payload.resume = nil
        }
        payload.relaunch = true
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
    private func fileRequest<T: Decodable & Sendable>(machineId: String, op: Components.Schemas.FsPayload.OpPayload,
                                           path: String, content: String? = nil) async throws -> T {
        let requestId = UUID().uuidString.lowercased()
        let payload = Components.Schemas.FsPayload(content: content, op: op, path: path, requestId: requestId)
        return try await Self.decodeResult(await request(machineId: machineId, verb: .fs, requestId: requestId, payload: payload).result)
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

    /// A machine's stored sessions, with the harnesses the listing left out:
    /// those that gave no answer in time and those whose listing threw. Their
    /// sessions are absent from `sessions`, which says nothing about them.
    public struct SessionListing: Sendable {
        public var sessions: [Components.Schemas.NeutralSessionInfo]
        public var unanswered: [Components.Schemas.HarnessUnanswered]
        public var failed: [Components.Schemas.HarnessFailed]
    }

    public func listSessions(machineId: String, limit: Int? = nil,
        harness: Components.Schemas.ControlPayload.HarnessPayload? = nil) async throws -> SessionListing {
        let options: [String: (any Sendable)?] = limit.map { ["limit": $0] } ?? [:]
        let frame = try await controlFrame(machineId, harness: harness, method: "listSessions", args: [options])
        let sessions: [Components.Schemas.NeutralSessionInfo] = try await Self.decodeResult(frame.result)
        return SessionListing(sessions: sessions, unanswered: frame.unanswered ?? [], failed: frame.failed ?? [])
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
        guard var row = fleet.byId[id]?.session else { return }
        row.kind = "mainline"
        fleet.patch(upserts: [row], removed: [])
        if let sessionKey = row.sessionId, !sessionKey.isEmpty, !row.machineId.isEmpty {
            try await tagSession(machineId: row.machineId, sessionKey: sessionKey, tag: nil,
                dir: row.cwd.isEmpty ? nil : row.cwd,
                harness: row.harness)
            try await reloadCatalog(row.machineId)
        }
    }

    private func updateSession(id: String, body: Operations.PatchApiInstancesById.Input.Body.JsonPayload, action: String) async throws {
        let response = try await api.instances.update(.init(path: .init(id: id), body: .json(body)))
        let statusCode: Int
        var said: String?
        // Every refusal carries the hub's own words ("title is blank", "no session …"): they are what the row says.
        switch response {
        case .ok: return
        case let .badRequest(refused):
            statusCode = 400
            said = await Wire.words(try? refused.body.plainText)
        case let .notFound(refused):
            statusCode = 404
            said = await Wire.words(try? refused.body.plainText)
        case let .conflict(refused):
            statusCode = 409
            said = await Wire.words(try? refused.body.plainText)
        case let .unprocessableContent(refused):
            statusCode = 422
            said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
        case let .internalServerError(refused):
            statusCode = 500
            said = await Wire.words(try? refused.body.plainText)
        case let .serviceUnavailable(refused):
            statusCode = 503
            said = await Wire.words(try? refused.body.plainText)
        case let .gatewayTimeout(refused):
            statusCode = 504
            said = await Wire.words(try? refused.body.plainText)
        case let .undocumented(code, payload):
            statusCode = code
            said = await Wire.words(payload.body)
        }
        throw ControlError(message: said.map { "Could not \(action) this session — \($0)" }
            ?? "Could not \(action) this session — the hub answered \(statusCode). Try again.")
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
        throw ControlError(message: await Wire.words(body) ?? "")
    }
    /// A stored conversation's catalog calls go to the harness that keeps it.
    public func deleteSession(machineId: String, sessionKey: String, dir: String? = nil,
        harness: Components.Schemas.HarnessKind) async throws {
        let named: Components.Schemas.ControlPayload.HarnessPayload = try requested(harness)
        _ = try await control(machineId, harness: named, method: "deleteSession", args: [sessionKey, directory(dir)])
    }
    public func tagSession(machineId: String, sessionKey: String, tag: String?, dir: String? = nil,
        harness: Components.Schemas.HarnessKind) async throws {
        let named: Components.Schemas.ControlPayload.HarnessPayload = try requested(harness)
        _ = try await control(machineId, harness: named, method: "tagSession", args: [sessionKey, tag, directory(dir)])
    }
    private func directory(_ dir: String?) -> [String: String] { dir.map { ["dir": $0] } ?? [:] }
    public func unlockKeychain(machineId: String, password: String) async throws -> Components.Schemas.AuthState {
        try await Self.decodeResult(await control(machineId, method: "unlockKeychain", args: [password]))
    }
    public func installTool(machineId: String, id: String, pinnedVersion: String? = nil) async throws -> Components.Schemas.ToolStatus {
        let args = pinnedVersion.map { [id, $0] } ?? [id]
        return try await Self.decodeResult(await control(machineId, method: "installTool", args: args, timeout: .seconds(300)))
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
