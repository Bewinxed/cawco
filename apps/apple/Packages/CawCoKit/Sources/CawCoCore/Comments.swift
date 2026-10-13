public import CawCoAPI
public import Foundation
import OpenAPIRuntime

/// A person's numbered pin on an artifact, with its thread (core comments.ts
/// `Pin`; Projects spec §5.7, §5.10). The page's overlay draws the pins and
/// writes the new ones into the artifact's doc; the app reads them through
/// the hub (`comment_read`'s route) and writes the person's words, resolve
/// and reopen through the hub's person routes, having no doc of its own.
public typealias Pin = Components.Schemas.Pin
public typealias PinEntry = Components.Schemas.ThreadEntry

public extension Pin {
    /// What it stands on, as its row and card name it (pin-name.ts `pinName`):
    /// the element's text, else its selector; a canvas's element by id.
    var name: String {
        if let page = anchor.value1 {
            let text = page.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty ? page.selector : text
        }
        return "Element \(anchor.value2?.element ?? "?")"
    }

    /// Where the element is written, `file:line`, when the page's dev build says (PinCard.svelte `source`).
    var source: String? {
        guard let source = anchor.value1?.source, let file = source.file else { return nil }
        return source.line.map { "\(file):\(Int($0))" } ?? file
    }

    /// Something the session has not heard: the pin itself, or a person's entry since (core `pinUnsent`).
    var unsent: Bool {
        sentAt == nil || thread.contains { $0.by == .person && $0.sentAt == nil }
    }

    var resolved: Bool { resolvedAt != nil }
    var moved: Bool { movedAt != nil }
    var label: Int { Int(number) }

    /// Its thread's last line, as its row shows it (PinList.svelte `lastLine`).
    var lastLine: String {
        guard let last = thread.last else { return kind == .annotation ? "Annotation" : "Nothing written yet" }
        let first = last.text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        return "\(last.by == .agent ? "Agent" : "You"): \(first)"
    }
}

/// An artifact's pins as the hub has them, and how many picks the session
/// has not heard: N on Send N is those picks and the unsent pins
/// (PreviewPane.svelte `owed`).
public struct ArtifactComments: Sendable, Equatable {
    /// By number.
    public let pins: [Pin]
    public let unsentPicks: Int

    /// An artifact with no pins and nothing unsent, until the hub is read.
    public static let empty = ArtifactComments(pins: [], unsentPicks: 0)

    public var owed: Int { unsentPicks + pins.count { $0.unsent } }
    /// Open pins on the page: the Pins button's badge.
    public var open: Int { pins.count { !$0.moved && !$0.resolved } }
}

/// What a view's word to the hub says when it could not load an artifact (core `ShownFailure`).
public enum ShownFailure: String, Sendable {
    case server, machine, workspace, page
}

public extension HubConnection {
    /// Every pin on one artifact, open and resolved, and the picks the session
    /// has not heard (`comment_read`'s route with `filter=all`, and the
    /// artifact's read for its state and `sentAt`), read together.
    func comments(on artifact: String, in instanceId: String) async throws -> ArtifactComments {
        let api = try api
        async let read = api.instances.comments(.init(path: .init(id: instanceId), query: .init(artifact: artifact, filter: .all)))
        async let state = api.instances.readArtifact(.init(path: .init(id: instanceId, artifact: artifact)))
        let (comments, artifactRead) = try await (read, state)
        guard case let .ok(found) = comments else { throw await TaskRefusal.reading(comments) }
        guard case let .ok(doc) = artifactRead else { throw await TaskRefusal.reading(artifactRead) }
        let pins = try found.body.json.artifacts.first { $0.id == artifact }?.pins ?? []
        let held = try doc.body.json
        // artifact-doc.ts `unsentPicks`: every pick when nothing was sent yet, else those made since.
        let picks = held.state.value.values.count { entry in
            guard let at = (entry as? [String: (any Sendable)?])?["at"] as? String else { return false }
            return held.sentAt.map { at > $0 } ?? true
        }
        return ArtifactComments(pins: pins.sorted { $0.number < $1.number }, unsentPicks: picks)
    }

    /// The person's words in pin `pin`'s thread (the hub's person reply);
    /// a refusal's sentence is the error's.
    func reply(_ text: String, to pin: String, in instanceId: String) async throws {
        let output = try await api.instances.personReply(.init(path: .init(id: instanceId, pin: pin), body: .json(.init(text: text))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// The person resolves pin `pin`, or reopens it.
    func resolve(_ pin: String, _ resolved: Bool, in instanceId: String) async throws {
        let output = try await api.instances.personResolve(.init(path: .init(id: instanceId, pin: pin), body: .json(.init(resolved: resolved))))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// This view's word that it has the artifact on screen at `revision`, or
    /// why it could not load it (PreviewPane.svelte's `artifactShown`): the
    /// agent's `artifact_create` and `artifact_show` answer `opened` from it.
    func artifactShown(_ artifact: String, in instanceId: String, revision: String, failure: ShownFailure?) async throws {
        typealias Body = Operations.PostApiInstancesByIdArtifactsByArtifactShown.Input.Body.JsonPayload
        let output = try await api.instances.artifactShown(.init(
            path: .init(id: instanceId, artifact: artifact),
            body: .json(Body(client: Presence.shared.clientId, revision: revision, ok: failure == nil,
                             error: failure.flatMap { Body._ErrorPayload(rawValue: $0.rawValue) }))
        ))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }
}
