public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime

@MainActor @Observable
public final class WorkflowRunDetail {
    public enum AnswerStage: Sendable { case pending, submitting, answered, failed }
    public let id: String
    public internal(set) var run: Components.Schemas.GetApiWorkflowRunsById200?
    public internal(set) var loading = true
    public internal(set) var error: String?
    public internal(set) var answerStage: AnswerStage = .pending
    public internal(set) var acting: String?
    /// The program's own narration and its checkpoints, in the order they
    /// happened (journal-graph.ts `journalLog` + `journalCheckpoints`).
    public internal(set) var log: [LogLine] = []
    init(_ id: String) { self.id = id }

    public struct LogLine: Sendable, Equatable {
        public let seq: Double
        public let at: Date
        public let text: String
    }
}

/// The same run-detail and answer endpoints as workflows.ts. No answer is
/// considered settled until the hub has accepted it; refusals keep the form.
@MainActor @Observable
public final class WorkflowRunsStore {
    public private(set) var details: [String: WorkflowRunDetail] = [:]
    @ObservationIgnored private unowned let hub: HubConnection
    @ObservationIgnored private var reads: [String: Task<Void, Never>] = [:]
    init(hub: HubConnection) { self.hub = hub }

    public func open(_ id: String) -> WorkflowRunDetail {
        if let detail = details[id] { return detail }
        let detail = WorkflowRunDetail(id)
        details[id] = detail
        read(id)
        return detail
    }

    public func read(_ id: String) {
        guard let detail = details[id], let client = hub.client else { return }
        reads[id]?.cancel()
        reads[id] = Task {
            do {
                let response = try await client.getApiWorkflowRunsById(path: .init(id: id))
                guard !Task.isCancelled else { return }
                switch response {
                case let .ok(ok):
                    let next = try ok.body.json
                    if next.ask?.stepId != detail.run?.ask?.stepId, next.ask != nil { detail.answerStage = .pending }
                    detail.run = next
                case let .badRequest(bad): detail.error = try await String(collecting: bad.body.plainText, upTo: 64_000)
                case let .forbidden(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 403)
                case let .notFound(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 404)
                case let .conflict(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 409)
                case let .undocumented(statusCode, _): detail.error = "The hub answered \(statusCode)."
                }
            } catch {
                if !Task.isCancelled { detail.error = error.localizedDescription }
            }
            if !Task.isCancelled { detail.loading = false }
            // The log is re-read whenever the run is: a checkpoint or a log
            // line arrives without a step row of its own.
            if !Task.isCancelled, case let .ok(ok)? = try? await client.getApiWorkflowRunsByIdLog(path: .init(id: id)),
               let entries = try? ok.body.json.log {
                detail.log = entries.compactMap { entry -> WorkflowRunDetail.LogLine? in
                    let args = entry.args?.value ?? [:]
                    switch entry.kind {
                    case .log, .notify: return .init(seq: entry.seq, at: entry.at, text: "\(args["text"].flatMap { $0 } ?? "")")
                    case .checkpoint: return .init(seq: entry.seq, at: entry.at, text: "Checkpoint · \(args["label"].flatMap { $0 } ?? "")")
                    default: return nil
                    }
                }.sorted { $0.seq < $1.seq }
            }
        }
    }

    func reset() {
        reads.values.forEach { $0.cancel() }
        reads = [:]; details = [:]
    }

    public func answer(_ id: String, choice: String?, note: String, valueText: String) {
        guard let detail = details[id], let ask = detail.run?.ask,
              detail.acting == nil, hub.state == .connected, let client = hub.client else { return }
        detail.acting = "answer"
        detail.answerStage = .submitting
        detail.error = nil
        Task {
            defer { detail.acting = nil }
            do {
                let value = valueText.trimmingCharacters(in: .whitespacesAndNewlines)
                let typed = value.isEmpty ? nil : try JSONDecoder().decode(OpenAPIValueContainer.self, from: Data(value.utf8))
                let response = try await client.postApiWorkflowRunsByIdAnswer(path: .init(id: id), body: .json(.init(stepId: ask.stepId, choice: choice, note: note, value: typed)))
                switch response {
                case .ok:
                    detail.answerStage = .answered
                    read(id)
                case let .badRequest(bad):
                    detail.error = try await String(collecting: bad.body.plainText, upTo: 64_000)
                    detail.answerStage = .failed
                case let .forbidden(refused):
                    detail.error = try await Wire.sentence(refused.body.plainText, status: 403)
                    detail.answerStage = .failed
                case let .notFound(refused):
                    detail.error = try await Wire.sentence(refused.body.plainText, status: 404)
                    detail.answerStage = .failed
                case let .conflict(refused):
                    detail.error = try await Wire.sentence(refused.body.plainText, status: 409)
                    detail.answerStage = .failed
                case let .unprocessableContent(bad):
                    let problem = try bad.body.applicationProblemJson
                    detail.error = String(data: try Wire.encoder().encode(problem), encoding: .utf8)
                    detail.answerStage = .failed
                case let .undocumented(statusCode, _):
                    detail.error = "The hub answered \(statusCode)."
                    detail.answerStage = .failed
                }
            } catch { detail.error = error.localizedDescription; detail.answerStage = .failed }
        }
    }

    /// `done` hears the refusal, or nil once the hub has cancelled it.
    public func cancel(_ id: String, done: @escaping (String?) -> Void = { _ in }) {
        guard let detail = details[id], detail.acting == nil, let client = hub.client else {
            done("Can't cancel while the hub is unreachable.")
            return
        }
        detail.acting = "cancel"
        Task {
            defer { detail.acting = nil }
            var refusal: String?
            do {
                let response = try await client.postApiWorkflowRunsByIdCancel(path: .init(id: id))
                switch response {
                case .ok: read(id)
                case let .badRequest(refused): refusal = try await Wire.sentence(refused.body.plainText, status: 400)
                case let .forbidden(refused): refusal = try await Wire.sentence(refused.body.plainText, status: 403)
                case let .notFound(refused): refusal = try await Wire.sentence(refused.body.plainText, status: 404)
                case let .conflict(refused): refusal = try await Wire.sentence(refused.body.plainText, status: 409)
                case let .undocumented(statusCode, _): refusal = "The hub answered \(statusCode)."
                }
            } catch { refusal = error.localizedDescription }
            done(refusal)
        }
    }

    public func rerun(_ id: String, fromStepId: String? = nil, opened: @escaping (String) -> Void) {
        guard let detail = details[id], detail.acting == nil, let client = hub.client else { return }
        detail.acting = "rerun"; detail.error = nil
        Task {
            defer { detail.acting = nil }
            do {
                let response = try await client.postApiWorkflowRunsByIdRerun(path: .init(id: id), body: .json(.init(fromStepId: fromStepId)))
                switch response {
                case let .ok(ok): opened(try ok.body.json.runId)
                case let .badRequest(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 400)
                case let .forbidden(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 403)
                case let .notFound(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 404)
                case let .conflict(refused): detail.error = try await Wire.sentence(refused.body.plainText, status: 409)
                case let .unprocessableContent(refused):
                    detail.error = String(data: try Wire.encoder().encode(try refused.body.applicationProblemJson), encoding: .utf8)
                case let .undocumented(statusCode, _): detail.error = "The hub answered \(statusCode)."
                }
            } catch { detail.error = error.localizedDescription }
        }
    }
}
