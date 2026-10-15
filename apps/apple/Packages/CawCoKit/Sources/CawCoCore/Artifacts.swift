public import CawCoAPI
public import Foundation
import OpenAPIRuntime

/// A canvas the composer made (Projects spec §5.10, The pen's swipe): a
/// draft until its first send. Its page stands at `/__cawco/canvas/<id>/` on
/// its session's own preview origin (`origin`), as a preview's page does.
public struct CanvasPage: Sendable, Equatable {
    public let id: String
    public let name: String
    /// Its session's preview origin (`HubConnection.previewRoute`): a port of the hub's host, or host mode's whole origin of its own.
    public let origin: URL
    /// Host mode's route: its origin is locked to the hub's pass, so a web
    /// view enters it with a ticket (`HubConnection.previewLoad`).
    public let byHost: Bool

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
    /// The session's preview route for a canvas, from what the hub named (`previewRoute`'s rule).
    private func listener(port: Double?, origin named: String?) throws -> PreviewRoute {
        guard address != nil else { throw TaskRefusal(message: "No hub is connected.") }
        guard let route = previewRoute(port: port, origin: named) else {
            throw TaskRefusal(message: "The hub didn't say where its canvases stand. Update the hub, then try again.")
        }
        return route
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
        let route = try listener(port: made.port, origin: made.origin)
        return CanvasPage(id: made.id, name: made.name, origin: route.origin, byHost: route.byHost)
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
        let route = try listener(port: body["port"] as? Double, origin: body["origin"] as? String)
        let page = CanvasPage(id: id, name: name, origin: route.origin, byHost: route.byHost)
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
