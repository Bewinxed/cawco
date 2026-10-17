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
    /// Why nothing can be sent here right now, when it is not an empty
    /// field: the action box wears the warning state and explains on a tap.
    public var sendBlock: SendBlock?
    /// The parked permission and question cards, in arrival order. The pane
    /// builds them; the composer stands them on its pill.
    public var prompts: [UIView] = []
    /// What Attach offers; none, no Attach (a Caw thread takes words alone).
    public var attachMenu: UIMenu?
    /// Who answers here, when it is not "the agent" (ComposerBinding
    /// `agentName`): the field is named for them.
    public var agentName: String?
    /// The field's hint, when it is not the session's (`placeholder`).
    public var placeholder: String?
    /// What stands on the pill's top-leading corner (`perch`): a project's
    /// Caw, peeking over the composer. Takes no touches.
    public var perch: UIView?
    /// The plan's ring, at the trailing end of the row over the pill (`planRing`).
    public var ring: UIView?
    /// The group's delegate tray stands for this conversation (`delegatesOf`).
    public var delegates = true
    public var onSend: (String, [ComposerAttachment]) -> Void = { _, _ in }
    public var onStop: () -> Void = {}
    /// Pictures and files pasted into the field, for the pane to attach.
    public var onPasteItems: ([NSItemProvider]) -> Void = { _ in }
    /// A tap on a file whose upload failed: upload it again.
    public var onRetryFile: (String) -> Void = { _ in }
    /// What the session offers behind `/` (client.svelte.ts `commandsOf`),
    /// read each time the menu filters. The pane `publish()`es when it changes.
    public var commands: () -> [ComposerCommand] = { [] }
    /// A `/` word started: ask the session for its commands' details
    /// (client.svelte.ts `refreshCommands`, throttled there).
    public var onMenu: () -> Void = {}

    // MARK: Recall and the queued message

    /// What the reader sent in this conversation, newest first: their own
    /// messages only, never the agent's, a delegate's or a harness note.
    /// Read as the recall wheel opens, and again while it is up whenever the
    /// pane renders (an older page landed).
    public var recall: () -> [RecallEntry] = { [] }
    /// Asks for the page before the oldest the transcript holds: the wheel
    /// is nearing the oldest entry it has (`SessionsStore.readOlderPage`).
    public var readOlder: () -> Void = {}
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

    // MARK: The question card's keys

    /// The first question card standing on the composer.
    private var questionCard: PromptCardView? {
        prompts.compactMap { $0 as? PromptCardView }.first { $0.ask.isQuestion }
    }

    /// A question card stands on the composer: the pane may take the
    /// keyboard, so the card's keys reach it.
    public var standsQuestion: Bool { questionCard != nil }

    /// The keys the first question card owns, the digits and Return: the
    /// same in a session and in a Caw thread, each pane listing them among
    /// its key commands with its own `action`, which calls `cardKey`, while
    /// nothing that takes text holds the keyboard (a field, or a preview's
    /// page). Never Escape: a question is put down only by its own Dismiss button.
    public func cardKeys(_ action: Selector) -> [UIKeyCommand] {
        guard questionCard != nil else { return [] }
        return (1 ... 9).map { UIKeyCommand(input: "\($0)", modifierFlags: [], action: action) }
            + [UIKeyCommand(input: "\r", modifierFlags: [], action: action)]
    }

    /// One of `cardKeys`, pressed: the first question card takes it.
    public func cardKey(_ command: UIKeyCommand) {
        if let input = command.input { questionCard?.key(input) }
    }

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

    /// The message went: the draft clears, and a canvas it carried is the session's now.
    public func sent() {
        draft = ""
        attachments = []
        if let id = sendingCanvas, canvas?.id == id {
            canvas = nil
            composer?.canvasWentOut(id, of: self)
        }
        composer?.loadDraft(of: self)
    }

    // MARK: The canvas

    /// The draft's canvas (canvas-room.svelte.ts `draft.canvas`): standing
    /// over the field, folded to its chip, or docked in the artifact panel.
    public internal(set) var canvas: DraftCanvas?
    /// What the canvas needs of the session's screen: the hub, the pane's
    /// box, and the artifact panel's.
    public var canvasHost: CanvasHost?
    /// The canvas the send under way carries, until the pane says it went.
    var sendingCanvas: String?

    /// The artifact panel laid out or began to move: a docked canvas follows its page.
    public func panelMoved() {
        composer?.canvasRoom?.follow()
    }

    /// The draft's canvas as the screen kept it (a restored draft): back as its chip.
    public func restoreCanvas(id: String, name: String) {
        guard canvas == nil else { return }
        canvas = DraftCanvas(id: id, name: name, folded: true)
        composer?.canvasRestored(of: self)
    }
}

/// Why Send cannot work now, for a reason other than an empty field (HIG
/// Feedback: "Show people when a command can't be carried out and help them
/// understand why"; Alerts: an indicator people choose to learn more from,
/// never an alert of its own accord). The action box shows it as its
/// warning state, and a tap explains: `menu`, anchored on the box, for a
/// reason that is only information (with the action that fixes it), or
/// `explain` for one that carries its fix in an alert.
public struct SendBlock {
    /// What VoiceOver reads after "Can't send:", and the menu's title.
    public let reason: String
    public let menu: UIMenu?
    public let explain: (() -> Void)?

    public init(reason: String, menu: UIMenu? = nil, explain: (() -> Void)? = nil) {
        self.reason = reason
        self.menu = menu
        self.explain = explain
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
