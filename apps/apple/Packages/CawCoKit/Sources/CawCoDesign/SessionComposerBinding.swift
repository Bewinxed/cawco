import UIKit

/// Everything a group's one composer takes from the conversation it is
/// writing to (workspace/composer-dock.svelte.ts `ComposerBinding`).
///
/// The composer is not part of a pane: a tab switch or a swipe changes the
/// transcript, and the box being typed in stays where it is, focus and
/// keyboard with it. So a pane draws no composer. It publishes what its
/// composer would have been given (its draft, its send, its parked prompts)
/// here, and its group's composer draws whichever binding is the active tab.
/// The draft lives here, so each conversation keeps its own.
@MainActor
public final class SessionComposerBinding {
    public let sessionId: String
    /// What is typed for this conversation; the composer writes it as it changes.
    public internal(set) var draft = ""
    public internal(set) var attachments: [ComposerAttachment] = []
    public var action: ComposerView.Action = .send
    /// Whether the session can be written to at all.
    public var writable = true
    /// Why the last send did not go through.
    public var sendError: String?
    /// The parked permission and question cards, in arrival order. The pane
    /// builds them; the composer stands them on its pill.
    public var prompts: [UIView] = []
    /// What Attach offers.
    public var attachMenu: UIMenu?
    public var onSend: (String, [ComposerAttachment]) -> Void = { _, _ in }
    public var onStop: () -> Void = {}
    /// The composer drawing this binding, while it is the active tab.
    public internal(set) weak var composer: ComposerView?

    public init(sessionId: String) {
        self.sessionId = sessionId
    }

    /// The pane changed something the composer shows.
    public func publish() {
        composer?.render(self)
    }

    /// Whether this conversation's draft is being typed into now.
    public var isWriting: Bool { composer?.isWriting ?? false }

    public func focus() {
        composer?.focus()
    }

    /// The draft as restored or pasted in from elsewhere.
    public func setDraft(_ text: String) {
        draft = text
        composer?.loadDraft(of: self)
    }

    public func attach(_ attachment: ComposerAttachment) {
        attachments.append(attachment)
        composer?.loadDraft(of: self)
    }

    /// The message went: the draft clears.
    public func sent() {
        draft = ""
        attachments = []
        composer?.loadDraft(of: self)
    }
}
