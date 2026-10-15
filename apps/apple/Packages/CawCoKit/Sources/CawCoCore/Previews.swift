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
    /// Artifacts whose open request is out (ToolGroup.svelte `opening`).
    public private(set) var opening: Set<String> = []
    /// Why an artifact's last open failed, said under the call that asked (ToolGroup.svelte `openFailed`).
    public private(set) var openFailed: [String: String] = [:]

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

    func began(_ artifactId: String) {
        opening.insert(artifactId)
        openFailed[artifactId] = nil
    }

    func ended(_ artifactId: String, failure: String?) {
        opening.remove(artifactId)
        openFailed[artifactId] = failure
    }

    func closed(_ instanceId: String) {
        guard var frame = byInstance[instanceId] else { return }
        frame.state = .closed
        byInstance[instanceId] = frame
    }

    func reset() {
        byInstance = [:]
        opening = []
        openFailed = [:]
    }
}

/// What a preview shows is an artifact, named by its id (ToolGroup.svelte
/// `sameArtifact`): a call's card is "opened" when the session's open
/// preview shows the artifact the call made or showed.
public enum PreviewKey {
    /// The artifact a call names (source.ts `calledArtifact`): `artifact_show`'s
    /// `id`, or the one `artifact_create` answered with (`{id, kind, name, route, opened}`);
    /// nil until the call has one, and for a refusal's sentence.
    public static func of(ask input: [String: Any], result: String?) -> String? {
        if let id = input["id"] as? String, id.wholeMatch(of: /[0-9a-f-]{36}/) != nil { return id }
        guard let data = result?.data(using: .utf8),
              let answer = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = answer["id"] as? String, id.wholeMatch(of: /[0-9a-f-]{36}/) != nil else { return nil }
        return id
    }

    public static func of(_ frame: PreviewFrame) -> String? {
        frame.artifact.id
    }
}

public extension HubConnection {
    /// Brings one of a session's artifacts to the front of its panel
    /// (ToolGroup.svelte `openArtifact`, `artifact_show`'s route). The hub
    /// sends the preview's frame when it opens; until it answers the artifact
    /// is `opening`, and a refusal's sentence stays in `openFailed` until the
    /// next try. `done` hears whether it opened.
    func openArtifact(_ id: String, in instanceId: String, done: @escaping @MainActor (Bool) -> Void = { _ in }) {
        guard !previews.opening.contains(id) else { return }
        previews.began(id)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let output = try await api.instances.showArtifact(.init(path: .init(id: instanceId, artifact: id)))
                guard case .ok = output else { throw await TaskRefusal.reading(output) }
                previews.ended(id, failure: nil)
                done(true)
            } catch {
                previews.ended(id, failure: Self.sentence(error))
                done(false)
            }
        }
    }

    /// An error as the formula's middle sentence: a refusal's words, a lost connection's.
    private static func sentence(_ error: any Error) -> String {
        if let refusal = error as? TaskRefusal { return refusal.message }
        if error is URLError { return "The hub could not be reached." }
        return error.localizedDescription
    }

    func closePreview(_ instanceId: String) async throws {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.deleteApiInstancesByIdPreview(path: .init(id: instanceId))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
        previews.closed(instanceId)
    }

    /// Where the app loads a session's preview: its own origin, never the
    /// dashboard's (core `previewOrigin`). Port mode: the session's preview
    /// port on the hub's host, on the hub's scheme. Host mode: the whole
    /// origin the hub named (`scheme://name[:port]`), as given: its scheme is
    /// how those names are served, never how the app reached the hub. The
    /// listener knows the session by that origin.
    func previewOrigin(_ frame: PreviewFrame) -> URL? {
        previewOrigin(port: frame.port, origin: frame.origin)
    }

    /// A preview origin from what the hub named: a port, or a whole origin.
    func previewOrigin(port: Double?, origin: String?) -> URL? {
        if let origin {
            guard var parts = URLComponents(string: origin), parts.scheme != nil, parts.host != nil else { return nil }
            parts.path = "/"
            parts.query = nil
            parts.fragment = nil
            return parts.url
        }
        guard let address, var parts = URLComponents(url: address, resolvingAgainstBaseURL: false), let port else { return nil }
        parts.path = "/"
        parts.query = nil
        parts.fragment = nil
        parts.port = Int(port)
        return parts.url
    }

    /// What a web view loads to show `place`, a page on session `instanceId`'s
    /// preview origin. Port mode: `place` itself. Host mode: every preview
    /// name is locked to the hub's pass (hub preview-access.ts), and each web
    /// view keeps its own cookies, so each load asks the hub for a ticket
    /// (single-use, 60 s) and opens the origin's entry, which sets the pass
    /// and sends the view on to `place`.
    func previewLoad(_ place: URL, in instanceId: String, byHost: Bool) async throws -> URL {
        guard byHost else { return place }
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.postApiInstancesByIdPreviewTicket(path: .init(id: instanceId))
        guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
        let ticket = try answer.body.json.ticket
        guard var parts = URLComponents(url: place, resolvingAgainstBaseURL: false) else {
            throw TaskRefusal(message: "The preview's address can't be read.")
        }
        let path = parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath
        let next = parts.percentEncodedQuery.map { "\(path)?\($0)" } ?? path
        // Each value whole: `queryItems` leaves `&`, `=` and `+` as they are,
        // which would cut `next`'s own query apart. The hub decodes it once.
        var whole = CharacterSet.urlQueryAllowed
        whole.remove(charactersIn: "&=+#")
        guard let ticketValue = ticket.addingPercentEncoding(withAllowedCharacters: whole),
              let nextValue = next.addingPercentEncoding(withAllowedCharacters: whole) else {
            throw TaskRefusal(message: "The preview's address can't be read.")
        }
        parts.path = "/__cawco/enter"
        parts.percentEncodedQuery = "ticket=\(ticketValue)&next=\(nextValue)"
        parts.fragment = nil
        guard let entry = parts.url else { throw TaskRefusal(message: "The preview's address can't be read.") }
        return entry
    }

    /// WebKit's word for a navigation the app cancelled by its own policy
    /// ("Frame load interrupted"): a load the app replaced, not a failure.
    nonisolated static func interruptedByPolicy(_ error: any Error) -> Bool {
        let error = error as NSError
        return error.domain == "WebKitErrorDomain" && error.code == 102
    }

    /// The page a preview opens at: the one its `artifact_create` named
    /// (`path`, on a dev server or folder), else the listener's root.
    func previewStart(_ frame: PreviewFrame) -> URL? {
        guard let origin = previewOrigin(frame) else { return nil }
        let path = frame.source?.value1?.path ?? frame.source?.value2?.path
        return path.flatMap { URL(string: $0, relativeTo: origin)?.absoluteURL } ?? origin
    }
}
