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
    /// Pictures and files pasted into the field, for the pane to attach.
    public var onPasteItems: ([NSItemProvider]) -> Void = { _ in }
    /// A tap on a file whose upload failed: upload it again.
    public var onRetryFile: (String) -> Void = { _ in }

    // MARK: Recall and the queued message

    /// What the reader sent in this conversation, newest first: their own
    /// messages only, never the agent's, a delegate's or a harness note.
    /// Read once each time the recall wheel opens.
    public var recall: () -> [RecallEntry] = { [] }
    /// The reader's newest message, when it is still queued and the harness
    /// can take it back (client.svelte.ts `canWithdraw`): what ↑ in an empty
    /// composer lifts out of the transcript.
    public var editableQueued: () -> RecallEntry? = { nil }
    /// The transcript's half of editing a queued message: its bubble folds
    /// to its tag while the words are in the composer (`true`), and unfolds
    /// when they go back (`false`), showing `replacement` until the hub's
    /// own record of the new send arrives.
    public var foldQueued: (_ id: String, _ folded: Bool, _ replacement: String?) -> Void = { _, _, _ in }
    /// The view the queued message's words are drawn in, while it is on screen.
    public var queuedWords: (_ id: String) -> UIView? = { _ in nil }
    /// Marks the bubble whose words were just replaced.
    public var flashQueued: (_ id: String) -> Void = { _ in }
    /// Replace the queued message `id` with these words (withdraw, then
    /// send again in its place).
    public var onReplaceQueued: (_ id: String, _ text: String) -> Void = { _, _ in }
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
        composer?.attachmentsChanged(of: self)
    }

    /// Where the upload of the file `id` stands now. A file the reader has
    /// removed meanwhile, or that went with a send, stays gone.
    public func updateFile(_ id: String, _ state: ComposerAttachment.FileState) {
        guard let at = attachments.firstIndex(where: { $0.slot == id }),
              case let .file(_, name, mediaType, size, _) = attachments[at] else { return }
        attachments[at] = .file(id: id, name: name, mediaType: mediaType, size: size, state: state)
        composer?.attachmentsChanged(of: self)
    }

    /// The pick `id` has been read: what it became takes its place, or,
    /// when it could not be read (nil), the place goes. A pick whose place
    /// is gone (removed, or the draft was sent) is dropped: it can never
    /// land in another message.
    /// Answers whether the place was still there.
    @discardableResult
    public func resolve(_ id: String, with attachment: ComposerAttachment?) -> Bool {
        guard let at = attachments.firstIndex(where: { $0.slot == id }) else { return false }
        if let attachment {
            attachments[at] = attachment
        } else {
            attachments.remove(at: at)
        }
        composer?.attachmentsChanged(of: self)
        return true
    }

    /// Lifts the queued message `entry` into the composer to edit (a tap
    /// on its bubble): the draft steps aside until the words go back.
    public func editQueued(_ entry: RecallEntry) {
        composer?.editQueued(entry)
    }

    /// The message went: the draft clears.
    public func sent() {
        draft = ""
        attachments = []
        composer?.loadDraft(of: self)
    }
}

/// One message the reader sent here, as the recall wheel lists it.
public struct RecallEntry: Sendable, Equatable {
    /// The send's id: its block's, its record's uuid.
    public let id: String
    public let text: String
    public let date: Date?
    /// Sent and not yet read by the session.
    public let queued: Bool

    public init(id: String, text: String, date: Date?, queued: Bool) {
        self.id = id
        self.text = text
        self.date = date
        self.queued = queued
    }
}
