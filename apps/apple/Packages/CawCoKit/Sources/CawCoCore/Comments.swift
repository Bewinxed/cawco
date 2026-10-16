public import CawCoAPI
public import Foundation
import OpenAPIRuntime

/// A person's numbered pin on an artifact, with its thread (core comments.ts
/// `Pin`; Projects spec §5.7, §5.10). The page's overlay draws the pins and
/// writes them into the artifact's doc, the person's words, resolve and
/// reopen too, as the app asks it (`cawco:reply`, `cawco:resolve`); the app
/// reads them through the hub (`comment_read`'s route).
public typealias Pin = Components.Schemas.Pin
public typealias PinEntry = Components.Schemas.ThreadEntry

public extension Pin {
    /// What it stands on, in words, as its row and card name it (pin-name.ts
    /// `pinName`): the component it is written in and the element's own text
    /// ("Subagent card · Coconut cover take 3"); either alone; else the
    /// element by its id, class or kind; a canvas's element by id. The
    /// selector is never the name: it is the card head's tooltip (`selector`).
    var name: String {
        guard let page = anchor.value1 else { return "Element \(anchor.value2?.element ?? "?")" }
        let text = page.text?.replacing(/\s+/, with: " ").trimmingCharacters(in: .whitespaces) ?? ""
        switch (PinWords.component(page), text.isEmpty) {
        case let (named?, false): return "\(named) · \(text)"
        case (nil, false): return text
        case let (named?, true): return named
        case (nil, true): return PinWords.element(elements.value2?.first)
        }
    }

    /// The pin's selector, for the card head's tooltip (pin-name.ts `pinSelector`); a canvas pin has none.
    var selector: String? { anchor.value1?.selector }

    /// Where the element is written, `file:line`, when the page's dev build says (PinCard.svelte `source`).
    var source: String? {
        guard let source = anchor.value1?.source, let file = source.file else { return nil }
        return source.line.map { "\(file):\(Int($0))" } ?? file
    }

    /// Not yet delivered to the session: the pin itself, or a person's entry since (core `pinUnsent`'s first two).
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

/// pin-name.ts's words for what a pin stands on.
private enum PinWords {
    /// Words for a tag no text, id or class names: what the element is. Our call (pin-name.ts `TAG_WORDS`).
    static let tags: [String: String] = [
        "a": "Link", "article": "Article", "aside": "Aside", "button": "Button", "canvas": "Drawing",
        "figure": "Figure", "footer": "Footer", "form": "Form", "h1": "Heading", "h2": "Heading",
        "h3": "Heading", "h4": "Heading", "h5": "Heading", "h6": "Heading", "header": "Header",
        "img": "Image", "input": "Field", "li": "List item", "nav": "Navigation", "ol": "List",
        "p": "Paragraph", "picture": "Image", "section": "Section", "select": "Menu", "svg": "Drawing",
        "table": "Table", "textarea": "Field", "ul": "List", "video": "Video",
    ]

    /// `SubagentCard`, `subagent-card`, `subagent_card` → "Subagent card".
    static func words(_ name: String) -> String {
        let spaced = name.replacing(/([a-z0-9])([A-Z])/) { "\($0.output.1) \($0.output.2)" }
            .replacing(/[-_.]+/, with: " ")
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }

    /// The component the element is written in: the page's dev build's name
    /// for it, else a sheet's innermost component, else its file's.
    static func component(_ anchor: Components.Schemas.PageAnchor) -> String? {
        if let named = [anchor.source?.component, anchor.chain?.first?.component].compactMap(\.self).first(where: { !$0.isEmpty }) {
            return words(named)
        }
        guard let file = anchor.source?.file?.split(separator: "/").last,
              let match = file.wholeMatch(of: /(.+)\.(svelte|vue|[jt]sx)/) else { return nil }
        let base = String(match.output.1)
        return base == "+page" || base == "index" ? nil : words(base)
    }

    /// The element itself, when it says nothing: its id, its first class, else what it is.
    static func element(_ element: Components.Schemas.PinnedElement?) -> String {
        guard let element else { return "Element" }
        if let named = element.id.isEmpty ? element.classes.first : element.id {
            let spoken = words(named)
            if !spoken.isEmpty { return spoken }
        }
        return tags[element.tag] ?? "Element"
    }
}

/// An artifact's pins as the hub has them, and how many picks the session
/// has not heard, which Send picks sends (PreviewPane.svelte `unsentPicks`).
/// The pins go to the session by themselves once quiet (the hub's
/// artifacts/service.ts).
public struct ArtifactComments: Sendable, Equatable {
    /// By number.
    public let pins: [Pin]
    public let unsentPicks: Int
    /// When the person last sent from it; nil until they have.
    public let sentAt: String?

    /// An artifact with no pins and nothing unsent, until the hub is read.
    public static let empty = ArtifactComments(pins: [], unsentPicks: 0, sentAt: nil)

    /// Open pins on the page: the Pins button's badge.
    public var open: Int { pins.count { !$0.moved && !$0.resolved } }

    /// The pins the agent is working on (PreviewPane.svelte `live`): while
    /// the session works, the open pins the last delivery carried, the pin
    /// itself or an entry of its thread.
    public func live(working: Bool) -> Set<String> {
        let stamps = pins.flatMap { pin in [pin.sentAt ?? ""] + pin.thread.map { $0.sentAt ?? "" } }
        guard working, let last = stamps.max(), !last.isEmpty else { return [] }
        return Set(pins.filter { pin in
            !pin.resolved && (pin.sentAt == last || pin.thread.contains { $0.sentAt == last })
        }.map(\.id))
    }
}

/// What a view's word to the hub says when it could not load an artifact (core `ShownFailure`).
public enum ShownFailure: String, Sendable {
    case server, machine, workspace, reach, closed, page
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
        // Each pin as the doc keeps it; the ink's box beside it is the agent's.
        let pins = try found.body.json.artifacts.first { $0.id == artifact }?.pins.map(\.value1) ?? []
        let held = try doc.body.json
        // artifact-doc.ts `unsentPicks`: every pick when nothing was sent yet, else those made since.
        let picks = held.state.value.values.count { entry in
            guard let at = (entry as? [String: (any Sendable)?])?["at"] as? String else { return false }
            return held.sentAt.map { at > $0 } ?? true
        }
        return ArtifactComments(pins: pins.sorted { $0.number < $1.number }, unsentPicks: picks, sentAt: held.sentAt)
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
