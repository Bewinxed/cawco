import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// A session's menus (LiveSessionMenu.svelte, StoredSessionMenu.svelte):
// right-click, or a long-press under a finger, on a session wherever one is
// listed. Copies say so in a toast and hold a check before the menu closes.
//
// Each action keeps the operator where they asked (DESIGN.md, The Stay In
// Context Rule). Stop and Archive say what is happening on the session's own
// row until the hub answers, and a refusal stays there in the hub's words
// (`HubConnection.acts`). Fork and Keep stay open in the menu while they run
// and say why there when refused. Rename turns the row into a field.
// Delete transcript, Remove session and Discard ask under their row, in the
// list (AskHere; DESIGN.md, The Open Page Rule): the page stays live, the
// question's confirm pends while the hub works, and a refusal stays under
// the question in the hub's words, its confirm the way to try again.

/// What the menus need from where they are shown.
@MainActor
struct SessionMenuContext {
    let hub: HubConnection
    /// Opens a conversation the way a row does.
    let open: (String) -> Void
    /// "Continue in new session…": PaneHost's one entry point, once that flow exists.
    let continueInNewSession: ((String) -> Void)?
    /// The same flow for a stored transcript the hub holds no row for: it is named whole.
    let continueStored: (ContinueSource) -> Void
    /// Cancels the continuation carried on from this row after its form was put away, in any stage before it starts.
    let cancelContinuation: (String) -> Void
    /// The window's one question about its sessions, drawn under the row that asked.
    let asks: SessionAsks
    /// The list the menu opened in ("page-work", "page-recent", …): a
    /// question is asked at `<place>/<id>`, so it stands under the row in
    /// that list and in no other that also lists the session.
    var place = ""

    /// This context, for the rows of the list at `place`.
    func at(_ place: String) -> SessionMenuContext {
        var context = self
        context.place = place
        return context
    }

    /// Where a question about session `id` stands in this list.
    func askAt(_ id: String) -> String { "\(place)/\(id)" }
}

/// A question about a session, and where it stands (`<list>/<session>`).
typealias SessionQuestion = (at: String, request: AskHere.Request)

/// The window's one question about a session (AskHere): the question and
/// where it stands, `<list>/<session>`. The list whose place that is draws
/// a line under the row for it, and holds the question there; `revision`
/// moves whenever it changes height or state, so the line is measured again.
@MainActor
@Observable
final class SessionAsks {
    /// Where the question stands, nil when none does.
    private(set) var at: String?
    private(set) var revision = 0
    @ObservationIgnored let view = AskHere()

    init() {
        view.onResize = { [weak self] in self?.moved() }
    }

    /// Asks `request` under the row at `at`, in place of any question standing.
    func ask(_ request: AskHere.Request, at: String) {
        self.at = at
        view.ask(request)
        revision += 1
    }

    private func moved() {
        if view.asked == nil { at = nil }
        revision += 1
    }
}

@MainActor
enum SessionMenus {
    /// A live (hub-held) session. Keep and Discard only on a spin-off; Fork
    /// needs a conversation and its machine, Stop a live process. `onArchive`
    /// where it is listed as finished.
    static func live(_ row: InstanceRow, context: SessionMenuContext, onArchive: (() -> Void)? = nil, copy host: MenuHost) -> UIMenu {
        let hub = context.hub
        let acts = hub.acts
        let id = row.id
        let status = row.status.rawValue
        let running = row.status == .running || row.status == .starting
        let machine = hub.fleet.machines.first { $0.machineId == row.machineId }
        let forkable = row.sessionId
        let title = hub.fleet.title(row)
        let asked = acts.act(id, status: status)
        func busy(_ verb: SessionActs.Verb) -> Bool { asked?.verb == verb && asked?.stage == .inFlight }
        var first: [UIMenuElement] = []
        // A continuation carried on after its form was put away ends on this row: it opens from here.
        if let made = acts.opens(id) {
            first.append(UIAction(title: "Open the new session", image: Glyph.arrowRight.image) { _ in
                acts.clear(id)
                context.open(made)
            })
        }
        first.append(UIAction(title: "Open", image: Glyph.external.image) { _ in context.open(id) })
        first.append(pending("Fork", running: "Forking…", image: Glyph.structure.image, verb: .fork, id: id, status: status,
                             host: host, hub: hub, enabled: forkable != nil && machine != nil) {
            guard let key = forkable else { return nil }
            return try await hub.fork(machineId: row.machineId, cwd: row.cwd, sessionKey: key,
                                      harness: row.harness.flatMap { .init(rawValue: $0) } ?? .claude)
        } then: { forked in
            if let forked { context.open(forked) }
        })
        if let onward = context.continueInNewSession {
            first.append(UIAction(title: "Continue in new session…", image: Glyph.arrowRight.image,
                                  attributes: busy(.continueOn) ? .disabled : []) { _ in onward(id) })
        }
        // A continuation carried on from this row stops from here, until its new session has started.
        if busy(.continueOn) {
            first.append(UIAction(title: "Cancel the continuation", image: Glyph.stop.image) { _ in context.cancelContinuation(id) })
        }
        if running {
            // Stopping cuts a turn short when one is running: the item says so.
            let midTurn = hub.fleet.activityPulse(id)?.activity == .working
            // Once the hub records it the session is `stopping`, not running, and this item goes.
            first.append(UIAction(title: midTurn ? "Stop mid-turn" : "Stop", image: Glyph.stop.image) { _ in
                Task { @MainActor in
                    await stop(id, machineId: row.machineId, hub: hub)
                }
            })
        }
        if let onArchive {
            first.append(UIAction(title: busy(.archive) ? "Archiving…" : "Archive", image: Glyph.archive.image,
                                  attributes: busy(.archive) ? .disabled : []) { _ in onArchive() })
        }
        first.append(UIAction(title: "Rename…", image: Glyph.toolEdit.image) { _ in
            host.whenClosed {
                guard let view = host.view else { return }
                rename(id, over: view, current: title, hub: hub)
            }
        })
        var sections = [UIMenu(options: .displayInline, children: first)]

        let asleepWithTranscript = row.sessionId != nil && !running
        let neverStarted = row.sessionId == nil && !running
        if asleepWithTranscript, let question = deleteQuestion(row, context: context) {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Delete transcript", image: Glyph.trash.image, attributes: .destructive) { _ in
                    ask(question, from: host, context: context)
                },
            ]))
        }
        if neverStarted {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Remove session", image: Glyph.trash.image, attributes: .destructive) { _ in
                    ask(removeQuestion(row, context: context), from: host, context: context)
                },
            ]))
        }
        if row.kind == "scratch" {
            sections.append(UIMenu(options: .displayInline, children: [
                pending("Keep", running: "Keeping…", image: Glyph.check.image, verb: .keep, id: id, status: status, host: host, hub: hub) {
                    try await hub.keepSession(id: id)
                    return nil
                },
                UIAction(title: "Discard", image: Glyph.trash.image, attributes: .destructive) { _ in
                    ask(discardQuestion(row, context: context), from: host, context: context)
                },
            ]))
        }
        var copies: [UIMenuElement] = []
        let path = host("Copy path", "Path", row.cwd)
        if row.cwd.isEmpty { path.attributes = [.disabled, .keepsMenuPresented] }
        copies.append(path)
        copies.append(host("Copy id", "Session id", id))
        sections.append(UIMenu(options: .displayInline, children: copies))
        return UIMenu(children: sections)
    }

    /// A stored conversation, by its machine's catalog entry.
    static func stored(machineId: String, info: StoredSession, context: SessionMenuContext, copy host: MenuHost) -> UIMenu {
        let hub = context.hub
        let to = hub.fleet.conversationId(sessionKey: info.sessionId, machineId: machineId, cwd: info.cwd)
        let row = hub.fleet.rows.first { $0.id == to }
        let title = hub.fleet.storedTitle(info, machineId: machineId)
        let harness = info.harness.rawValue
        var first: [UIMenuElement] = [UIAction(title: "Open", image: Glyph.external.image) { _ in context.open(to) }]
        // StoredSessionMenu names its source itself: the stored session's id, machine, folder, harness and title.
        first.append(UIAction(title: "Continue in new session…", image: Glyph.arrowRight.image) { _ in
            context.continueStored(ContinueSource(instanceId: info.sessionId, machineId: machineId, cwd: info.cwd ?? "",
                                                  harness: harness, model: nil, title: title))
        })
        if UIApplication.shared.supportsMultipleScenes {
            first.append(UIAction(title: "Open in new window", image: Glyph.window.image) { _ in openInNewWindow(to) })
        }
        first.append(pending("Fork from here", running: "Forking…", image: Glyph.structure.image, verb: .fork, id: to,
                             status: row?.status.rawValue, host: host, hub: hub) {
            try await hub.fork(machineId: machineId, cwd: info.cwd ?? "", sessionKey: info.sessionId,
                               harness: .init(rawValue: harness) ?? .claude)
        } then: { forked in
            if let forked { context.open(forked) }
        })
        let path = host("Copy path", "Path", info.cwd ?? "")
        if (info.cwd ?? "").isEmpty { path.attributes = [.disabled, .keepsMenuPresented] }
        let second: [UIMenuElement] = [
            UIAction(title: "Rename…", image: Glyph.toolEdit.image) { _ in
                host.whenClosed {
                    guard let view = host.view else { return }
                    RenameInPlace.begin(over: view, current: title) { next in
                        // A session the hub keeps is named there; a transcript it never ran, in the transcript.
                        if let row {
                            try await hub.renameInstance(id: row.id, title: next)
                        } else {
                            try await hub.renameSession(machineId: machineId, sessionKey: info.sessionId, title: next, dir: info.cwd,
                                                        harness: .init(rawValue: harness))
                            try await hub.reloadCatalog(machineId)
                        }
                    } named: { next in
                        if let held = hub.fleet.byId[to] { return hub.fleet.title(held) == next }
                        return hub.fleet.catalog(machineId).first { $0.sessionId == info.sessionId }
                            .map { hub.fleet.storedTitle($0, machineId: machineId) } == next
                    }
                }
            },
            path,
            host("Copy session id", "Session id", info.sessionId),
        ]
        let third: [UIMenuElement] = [
            UIAction(title: "Delete transcript", image: Glyph.trash.image, attributes: .destructive) { _ in
                ask((context.askAt(to), AskHere.Request(
                    title: "Delete this transcript?",
                    body: ["“\(title)” is removed from \(info.cwd.flatMap { $0.isEmpty ? nil : $0 } ?? "this machine"), for good. Nothing else on the machine is touched."],
                    confirmLabel: "Delete transcript", pendingLabel: "Deleting…", destructive: true
                ) {
                    try await deleteTranscript(hub: hub, machineId: machineId, sessionKey: info.sessionId, dir: info.cwd, harness: harness)
                }), from: host, context: context)
            },
        ]
        return UIMenu(children: [UIMenu(options: .displayInline, children: first), UIMenu(options: .displayInline, children: second),
                                 UIMenu(options: .displayInline, children: third)])
    }

    /// A menu item that runs where it was chosen (PendingSelect): the menu
    /// stays up saying it is running, closes once the hub has it, and on a
    /// refusal stays with the hub's reason under the item. The row says it
    /// too, so a menu put away meanwhile loses nothing. `work`'s answer is
    /// what `then` goes on to (a fork, the session it made).
    static func pending(_ title: String, running: String, image: UIImage, verb: SessionActs.Verb, id: String, status: String?,
                                host: MenuHost, hub: HubConnection, enabled: Bool = true,
                                work: @escaping @MainActor () async throws -> String?,
                                then: @escaping @MainActor (String?) -> Void = { _ in }) -> UIAction {
        let acts = hub.acts
        let asked = acts.act(id, status: status).flatMap { $0.verb == verb ? $0 : nil }
        let busy = asked?.stage == .inFlight
        var attributes: UIMenuElement.Attributes = .keepsMenuPresented
        if busy || !enabled { attributes.insert(.disabled) }
        let action = UIAction(title: busy ? running : title, image: image, attributes: attributes) { _ in
            Task { @MainActor in
                await runPending(verb, id: id, host: host, hub: hub, work: work, then: then)
            }
        }
        if case .refused = asked?.stage { action.subtitle = acts.words(id, status: status)?.text }
        return action
    }

    /// What a pending item does once chosen: in flight with the menu kept
    /// up, then closed and on to what it made, or refused in the hub's words.
    static func runPending(_ verb: SessionActs.Verb, id: String, host: MenuHost, hub: HubConnection,
                           work: @MainActor () async throws -> String?, then: @MainActor (String?) -> Void) async {
        let acts = hub.acts
        acts.begin(verb, [id])
        host.refresh()
        do {
            let made = try await work()
            acts.settle([id])
            host.close()
            then(made)
        } catch {
            acts.refuse(id, error.localizedDescription, status: hub.fleet.byId[id]?.status.rawValue)
            host.refresh()
        }
    }

    /// Renames a hub-held session where its row stands.
    @discardableResult
    static func rename(_ id: String, over view: UIView, current: String, hub: HubConnection) -> RenameInPlace {
        RenameInPlace.begin(over: view, current: current) { next in
            try await hub.renameInstance(id: id, title: next)
        } named: { next in
            hub.fleet.byId[id].map { hub.fleet.title($0) } == next
        }
    }

    /// Stops a session from wherever it is listed. Its row says "Stopping…"
    /// from the hub's own status (`stopping`, filed the moment the stop is
    /// recorded, on every client) and "Stopped" once its machine confirms;
    /// a refusal stays on the row in the hub's words, read against the list
    /// as the hub left it (an away machine's stop is recorded, and stays
    /// stopping, while the hub answers that the machine is offline).
    static func stop(_ id: String, machineId: String, hub: HubConnection) async {
        hub.acts.clear(id)
        do {
            try await hub.stopSession(instanceId: id, machineId: machineId)
            _ = await hub.refresh()
        } catch {
            _ = await hub.refresh()
            hub.acts.refuse(.stop, id, error.localizedDescription, status: hub.fleet.byId[id]?.status.rawValue)
        }
    }

    /// Delete transcript (LiveSessionMenu `askDeleteTranscript`): a session at
    /// rest whose conversation lives on its machine; deleting it there is how
    /// it leaves, and the hub drops the row once the machine confirms.
    static func deleteQuestion(_ row: InstanceRow, context: SessionMenuContext) -> SessionQuestion? {
        guard let key = row.sessionId else { return nil }
        let hub = context.hub
        return (context.askAt(row.id), AskHere.Request(
            title: "Delete this transcript?",
            body: ["“\(hub.fleet.title(row))” is removed from \(row.cwd.isEmpty ? "this machine" : row.cwd), for good. Nothing else on the machine is touched."],
            confirmLabel: "Delete transcript", pendingLabel: "Deleting…", destructive: true
        ) {
            try await deleteTranscript(hub: hub, machineId: row.machineId, sessionKey: key, dir: row.cwd.isEmpty ? nil : row.cwd, harness: row.harness)
        })
    }

    /// Remove session (LiveSessionMenu `askRemove`): one that never started.
    static func removeQuestion(_ row: InstanceRow, context: SessionMenuContext) -> SessionQuestion {
        let hub = context.hub
        let id = row.id
        return (context.askAt(id), AskHere.Request(
            title: "Remove this session?", body: ["It never started, so there is no transcript to lose."],
            confirmLabel: "Remove session", pendingLabel: "Removing…", destructive: true
        ) {
            try await hub.removeSession(id: id)
        })
    }

    /// Discard (LiveSessionMenu `askDiscard`): a spin-off and whatever its spawn made.
    static func discardQuestion(_ row: InstanceRow, context: SessionMenuContext) -> SessionQuestion {
        let hub = context.hub
        let id = row.id
        return (context.askAt(id), AskHere.Request(
            title: "Discard this spin-off?",
            body: ["The session stops, and whatever the spawn created for it — its worktree, its transcript — goes with it, for good."],
            confirmLabel: "Discard spin-off", pendingLabel: "Discarding…", destructive: true
        ) {
            try await hub.stopSession(instanceId: id, machineId: row.machineId, discard: true)
            _ = await hub.refresh()
        })
    }

    /// Asks under the row the menu opened on, once the menu has gone.
    static func ask(_ question: SessionQuestion, from host: MenuHost, context: SessionMenuContext) {
        host.whenClosed {
            context.asks.ask(question.request, at: question.at)
        }
    }


    /// client.svelte.ts `deleteTranscript`: the machine deletes it, then its catalog is read again.
    private static func deleteTranscript(hub: HubConnection, machineId: String, sessionKey: String, dir: String?, harness: String?) async throws {
        try await hub.deleteSession(machineId: machineId, sessionKey: sessionKey, dir: dir, harness: harness.flatMap { .init(rawValue: $0) })
        try await hub.reloadCatalog(machineId)
    }

    /// "Open in new tab", natively: the conversation in a window of its own.
    static func openInNewWindow(_ id: String) {
        UIApplication.shared.requestSceneSessionActivation(nil, userActivity: SessionViewController.activity(id), options: nil, errorHandler: nil)
    }
}

/// What a menu's items reach of the menu and of the view it opened on: its
/// copy items, the view itself (the row a rename edits in place, the row a
/// confirm comes out of), and the open menu, redrawn as an item runs or put
/// away when it is done.
@MainActor
struct MenuHost {
    let copier: (_ title: String, _ what: String, _ text: String) -> UIAction
    /// The view the menu opened on: the row the session is drawn in.
    weak var view: UIView?
    /// Draws the open menu again from the state now.
    let refresh: () -> Void
    /// Puts the menu away.
    let close: () -> Void
    /// Runs `work` once the menu has gone, at once when none is open.
    let whenClosed: (@escaping () -> Void) -> Void

    /// A copy item (ContextMenu.CopyItem).
    func callAsFunction(_ title: String, _ what: String, _ text: String) -> UIAction { copier(title, what, text) }
}

/// A context menu on a view (ContextMenu.Root): built as it opens, from the
/// state at that moment. Its copy items (ContextMenu.CopyItem) copy, say so
/// in a toast, turn their glyph to a check for `durHold`, then close.
@MainActor
final class ContextMenuHost: NSObject, UIContextMenuInteractionDelegate {
    private let build: (MenuHost) -> UIMenu?
    private weak var interaction: UIContextMenuInteraction?
    private var copied: String?
    private var shown = false
    private var afterClose: [() -> Void] = []

    @discardableResult
    static func attach(to view: UIView, build: @escaping (MenuHost) -> UIMenu?) -> ContextMenuHost {
        let host = ContextMenuHost(build: build)
        let interaction = UIContextMenuInteraction(delegate: host)
        view.addInteraction(interaction)
        host.interaction = interaction
        objc_setAssociatedObject(view, &ContextMenuHost.key, host, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        return host
    }

    nonisolated(unsafe) private static var key = 0

    private init(build: @escaping (MenuHost) -> UIMenu?) {
        self.build = build
    }

    private func menu() -> UIMenu? {
        build(MenuHost(
            copier: { [weak self] title, what, text in self?.copyItem(title, what: what, text: text) ?? UIAction(title: title) { _ in } },
            view: interaction?.view,
            refresh: { [weak self] in
                guard let self, shown else { return }
                interaction?.updateVisibleMenu { [weak self] current in self?.menu() ?? current }
            },
            close: { [weak self] in self?.interaction?.dismissMenu() },
            whenClosed: { [weak self] work in
                guard let self, shown else { return work() }
                afterClose.append(work)
            }
        ))
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willDisplayMenuFor _: UIContextMenuConfiguration,
                                animator _: (any UIContextMenuInteractionAnimating)?) {
        shown = true
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, willEndFor _: UIContextMenuConfiguration,
                                animator: (any UIContextMenuInteractionAnimating)?) {
        let finish = { [weak self] in
            guard let self else { return }
            shown = false
            let waiting = afterClose
            afterClose = []
            waiting.forEach { $0() }
        }
        if let animator { animator.addCompletion(finish) } else { finish() }
    }

    private func copyItem(_ title: String, what: String, text: String) -> UIAction {
        UIAction(title: title, image: (copied == title ? Glyph.check : Glyph.copy).image, attributes: .keepsMenuPresented) { [weak self] _ in
            guard let self else { return }
            UIPasteboard.general.string = text
            guard UIPasteboard.general.string == text else {
                Toast.error("Could not copy the \(what.lowercased()).", in: interaction?.view)
                interaction?.dismissMenu()
                return
            }
            Toast.success("\(what) copied", in: interaction?.view)
            copied = title
            interaction?.updateVisibleMenu { [weak self] current in self?.menu() ?? current }
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(Motion.durHold))
                self?.copied = nil
                self?.interaction?.dismissMenu()
            }
        }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        guard menu() != nil else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in self?.menu() }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration _: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let view = interaction?.view else { return nil }
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: view.bounds, cornerRadius: Radius.radiusSm)
        parameters.backgroundColor = Palette.surfaceRaised
        return UITargetedPreview(view: view, parameters: parameters)
    }
}
