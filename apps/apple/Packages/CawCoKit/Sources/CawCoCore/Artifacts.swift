public import CawCoAPI
public import Foundation
import OpenAPIRuntime

/// A canvas the composer made (Projects spec §5.10, The pen's swipe): a
/// draft until its first send. Its page stands at `/__cawco/canvas/<id>/` on
/// the hub's preview listener (`origin`), which reads the session from the
/// `cawco-preview` cookie, as a preview's page does.
public struct CanvasPage: Sendable, Equatable {
    public let id: String
    public let name: String
    /// The preview listener's root, on the hub's host.
    public let origin: URL

    /// The canvas's own page, `/__cawco/canvas/<id>/`: one closing slash,
    /// which the directory hint writes (a path ending in one gets a second,
    /// and the listener serves `//` nothing).
    public var url: URL {
        origin.appending(components: "__cawco", "canvas", id, directoryHint: .isDirectory)
    }

    /// Where its page joins its live document (the overlay's `sync`).
    public var sync: String {
        "/__cawco/artifact/\(id)"
    }
}

/// A canvas as a send carries it (client.svelte.ts `exportCanvas`): its
/// `.excalidraw` file as the hub wrote it, its outline, its latest picture.
public struct CanvasExport: Sendable {
    /// The `.excalidraw` file, as JSON text, every field the hub keeps.
    public let file: String
    /// Elements drawn on it and not deleted.
    public let drawn: Int
    public let outline: String
    /// The PNG a screen last drew; nil until one has.
    public let png: Data?
    /// Its page, on the preview listener.
    public let page: CanvasPage
}

public extension HubConnection {
    /// The listener's root for a port the hub named, on the hub's host
    /// (`previewOrigin`'s rule).
    private func listener(_ port: Double?) throws -> URL {
        guard let address else { throw TaskRefusal(message: "No hub is connected.") }
        guard let port, var parts = URLComponents(url: address, resolvingAgainstBaseURL: false) else {
            throw TaskRefusal(message: "The hub didn't say where its canvases stand. Update the hub, then try again.")
        }
        parts.port = Int(port)
        parts.path = "/"
        parts.query = nil
        guard let origin = parts.url else { throw TaskRefusal(message: "The hub's address can't carry its canvas listener.") }
        return origin
    }

    /// A new, empty canvas for the composer (client.svelte.ts
    /// `createDraftCanvas`): a draft until its first send, not shown in the
    /// panel by being made.
    func createDraftCanvas(in instanceId: String) async throws -> CanvasPage {
        let output = try await api.instances.createArtifact(.init(
            path: .init(id: instanceId),
            body: .json(.init(kind: .canvas, name: "canvas", draft: true))
        ))
        guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
        let made = try answer.body.json
        return CanvasPage(id: made.id, name: made.name, origin: try listener(made.port))
    }

    /// A canvas's export (`GET /api/artifacts/:id/export`). Read raw rather
    /// than through the generated client: its `CanvasElement` keeps only the
    /// fields the outline reads, and the `.excalidraw` file a send carries is
    /// every field the hub keeps. `within` bounds the wait for its answer
    /// (`URLError.timedOut` past it); without it, URLSession's own.
    func exportCanvas(_ id: String, name: String, within: Duration? = nil) async throws -> CanvasExport {
        guard let address else { throw TaskRefusal(message: "No hub is connected.") }
        var request = URLRequest(url: address.appending(path: "api/artifacts/\(id)/export"))
        if let within {
            let parts = within.components
            request.timeoutInterval = Double(parts.seconds) + Double(parts.attoseconds) / 1e18
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw TaskRefusal(message: text.isEmpty ? "The hub refused to read the canvas." : text)
        }
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let file = body["file"] as? [String: Any],
              let outline = body["outline"] as? String else {
            throw TaskRefusal(message: "The hub's answer for the canvas can't be read.")
        }
        let elements = file["elements"] as? [[String: Any]] ?? []
        let drawn = elements.count { ($0["isDeleted"] as? Bool) != true }
        let text = String(decoding: try JSONSerialization.data(withJSONObject: file), as: UTF8.self)
        let png = (body["png"] as? String).flatMap { Data(base64Encoded: $0) }
        let page = CanvasPage(id: id, name: name, origin: try listener(body["port"] as? Double))
        return CanvasExport(file: text, drawn: drawn, outline: outline, png: png, page: page)
    }

    /// The draft canvas went out with a send: the session holds it now (client.svelte.ts `canvasSent`).
    func canvasSent(_ id: String, in instanceId: String) async throws {
        let output = try await api.instances.canvasSent(.init(path: .init(id: instanceId, artifact: id)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// The canvas shown in the session's artifact panel (`artifact_show`'s
    /// route): Dock. Its refusal is the hub's sentence.
    func dockCanvas(_ id: String, in instanceId: String) async throws {
        let output = try await api.instances.showArtifact(.init(path: .init(id: instanceId, artifact: id)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }
}
