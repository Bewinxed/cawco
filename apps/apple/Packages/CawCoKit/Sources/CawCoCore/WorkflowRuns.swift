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
    init(_ id: String) { self.id = id }
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
                case let .undocumented(statusCode, _): detail.error = "The hub answered \(statusCode)."
                }
            } catch {
                if !Task.isCancelled { detail.error = error.localizedDescription }
            }
            if !Task.isCancelled { detail.loading = false }
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

    public func cancel(_ id: String) {
        guard let detail = details[id], detail.acting == nil, let client = hub.client else { return }
        detail.acting = "cancel"; detail.error = nil
        Task {
            defer { detail.acting = nil }
            do {
                let response = try await client.postApiWorkflowRunsByIdCancel(path: .init(id: id))
                switch response {
                case .ok: read(id)
                case let .badRequest(bad): detail.error = try await String(collecting: bad.body.plainText, upTo: 64_000)
                default: detail.error = "The hub refused to cancel the run."
                }
            } catch { detail.error = error.localizedDescription }
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
                case let .badRequest(bad): detail.error = try await String(collecting: bad.body.plainText, upTo: 64_000)
                default: detail.error = "The hub refused to re-run the workflow."
                }
            } catch { detail.error = error.localizedDescription }
        }
    }
}
