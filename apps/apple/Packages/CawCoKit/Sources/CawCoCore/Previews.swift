public import CawCoAPI
public import Foundation
import Observation
import OpenAPIRuntime

public typealias PreviewFrame = Components.Schemas.PreviewFrame

/// Each session's preview as the hub last said it (client.svelte.ts
/// `previews`): a `preview` frame, and the list every board frame carries,
/// in which an open preview it no longer names has closed.
@MainActor
@Observable
public final class PreviewStore {
    public private(set) var byInstance: [String: PreviewFrame] = [:]

    public init() {}

    func adopt(_ frame: PreviewFrame) {
        byInstance[frame.instanceId] = frame
    }

    func reconcile(_ frames: [PreviewFrame]?) {
        guard let frames else { return }
        let named = Set(frames.map(\.instanceId))
        for (id, frame) in byInstance where !named.contains(id) && frame.state == .open {
            var closed = frame
            closed.state = .closed
            byInstance[id] = closed
        }
        for frame in frames { adopt(frame) }
    }

    func closed(_ instanceId: String) {
        guard var frame = byInstance[instanceId] else { return }
        frame.state = .closed
        byInstance[instanceId] = frame
    }

    func reset() {
        byInstance = [:]
    }
}

/// One string per thing a preview shows (source.ts `previewSourceKey`): a
/// call's card is "opened" when the session's open preview shows the same.
public enum PreviewKey {
    public static func of(ask input: [String: Any]) -> String? {
        if let page = input["page"] as? String { return "page:\(page)" }
        if let port = input["port"] as? Int { return "port:\(port)" }
        if let port = input["port"] as? Double { return "port:\(Int(port))" }
        if let dir = input["dir"] as? String { return "dir:\(dir)" }
        return nil
    }

    public static func of(_ frame: PreviewFrame) -> String? {
        guard let source = frame.source else { return nil }
        if let page = source.value3?.page { return "page:\(page)" }
        if let port = source.value1?.port { return "port:\(Int(port))" }
        if let dir = source.value2?.dir { return "dir:\(dir)" }
        return nil
    }
}

public extension HubConnection {
    /// Opens a `show_preview` call's page again (client.svelte.ts
    /// `openPreview`, with `reopenAsk`: a decision page is shown, never
    /// published again). The hub answers with the preview's frame.
    func openPreview(_ instanceId: String, ask input: [String: Any]) async throws {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        let page = input["page"] as? String
        let port = (input["port"] as? Int) ?? (input["port"] as? Double).map(Int.init)
        let dir = page == nil ? input["dir"] as? String : nil
        let at = page == nil ? input["path"] as? String : nil
        let output = try await client.postApiInstancesByIdPreview(path: .init(id: instanceId),
            body: .json(.init(port: page == nil ? port : nil, dir: dir, page: page, path: at)))
        guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
        previews.adopt(try ok.body.json)
    }

    func closePreview(_ instanceId: String) async throws {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.deleteApiInstancesByIdPreview(path: .init(id: instanceId))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        previews.closed(instanceId)
    }

    /// Where the app loads a session's preview: the hub's preview listener on
    /// the hub's host, which reads the session from a `cawco-preview` cookie.
    func previewOrigin(_ frame: PreviewFrame) -> URL? {
        guard let address, var parts = URLComponents(url: address, resolvingAgainstBaseURL: false) else { return nil }
        parts.port = Int(frame.port)
        parts.path = "/"
        return parts.url
    }

    /// The page a preview opens at: the one its `show_preview` named
    /// (`path`, on a dev server or folder), else the listener's root.
    func previewStart(_ frame: PreviewFrame) -> URL? {
        guard let origin = previewOrigin(frame) else { return nil }
        let path = frame.source?.value1?.path ?? frame.source?.value2?.path
        return path.flatMap { URL(string: $0, relativeTo: origin)?.absoluteURL } ?? origin
    }

    /// The choices bridge's three hub calls (client.svelte.ts `previewChoices`,
    /// `changePreviewChoice`, `sendPreviewChoices`), JSON passed through as
    /// the page sent it and as the hub answers it: the page reads the
    /// canvas's choices exactly as the hub keeps them.
    func previewChoices(_ instanceId: String, method: String, path: String = "", body: Data? = nil) async throws -> Data {
        guard let address else { throw TaskRefusal(message: "No hub is connected.") }
        let id = instanceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? instanceId
        var request = URLRequest(url: address.appending(path: "api/instances/\(id)/preview/choices\(path)"))
        request.httpMethod = method
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw TaskRefusal(message: text.isEmpty ? "The hub refused that." : text)
        }
        return data
    }
}
