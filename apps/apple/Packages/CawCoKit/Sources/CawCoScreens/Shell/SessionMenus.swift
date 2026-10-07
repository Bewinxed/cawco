import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// A session's menus (LiveSessionMenu.svelte, StoredSessionMenu.svelte):
// right-click, or a long-press under a finger, on a session wherever one is
// listed. Copies say so in a toast and hold a check before the menu closes.

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
    /// What the dialogs present over.
    let presenter: () -> UIViewController
}

@MainActor
enum SessionMenus {
    /// A live (hub-held) session. Keep and Discard only on a spin-off; Fork
    /// needs a conversation and its machine, Stop a live process. `onArchive`
    /// where it is listed as finished.
    static func live(_ row: InstanceRow, context: SessionMenuContext, onArchive: (() -> Void)? = nil,
                     copy: @escaping (String, String, String) -> UIAction) -> UIMenu {
        let hub = context.hub
        let id = row.id
        let running = row.status == .running || row.status == .starting
        let machine = hub.fleet.machines.first { $0.machineId == row.machineId }
        let forkable = row.sessionId
        let title = hub.fleet.title(row)
        var first: [UIMenuElement] = [
            UIAction(title: "Open", image: Glyph.external.image) { _ in context.open(id) },
            UIAction(title: "Fork", image: Glyph.structure.image, attributes: forkable != nil && machine != nil ? [] : .disabled) { _ in
                guard let key = forkable else { return }
                Task { @MainActor in
                    do {
                        let forked = try await hub.fork(machineId: row.machineId, cwd: row.cwd, sessionKey: key,
                                                        harness: row.harness.flatMap { .init(rawValue: $0) } ?? .claude)
                        context.open(forked)
                    } catch {
                        Toast.error(error.localizedDescription, in: context.presenter().view)
                    }
                }
            },
        ]
        if let onward = context.continueInNewSession {
            first.append(UIAction(title: "Continue in new session…", image: Glyph.arrowRight.image) { _ in onward(id) })
        }
        if running {
            first.append(UIAction(title: "Stop", image: Glyph.stop.image) { _ in
                Task { @MainActor in try? await hub.stopSession(instanceId: id, machineId: row.machineId) }
            })
        }
        if let onArchive { first.append(UIAction(title: "Archive", image: Glyph.archive.image) { _ in onArchive() }) }
        first.append(UIAction(title: "Rename…", image: Glyph.toolEdit.image) { _ in
            context.presenter().present(RenameDialog(current: title) { next in
                try await hub.renameInstance(id: id, title: next)
            }, animated: true)
        })
        var sections = [UIMenu(options: .displayInline, children: first)]

        let asleepWithTranscript = row.sessionId != nil && !running
        let neverStarted = row.sessionId == nil && !running
        if asleepWithTranscript, let key = row.sessionId {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Delete transcript", image: Glyph.trash.image, attributes: .destructive) { _ in
                    context.presenter().present(ConfirmDialog(
                        title: "Delete this transcript?",
                        body: "“\(title)” is removed from \(row.cwd.isEmpty ? "this machine" : row.cwd), for good. Nothing else on the machine is touched.",
                        confirmLabel: "Delete transcript", pendingLabel: "Deleting…", destructive: true
                    ) {
                        try await deleteTranscript(hub: hub, machineId: row.machineId, sessionKey: key, dir: row.cwd.isEmpty ? nil : row.cwd, harness: row.harness)
                    }, animated: true)
                },
            ]))
        }
        if neverStarted {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Remove session", image: Glyph.trash.image, attributes: .destructive) { _ in
                    context.presenter().present(ConfirmDialog(
                        title: "Remove this session?", body: "It never started, so there is no transcript to lose.",
                        confirmLabel: "Remove session", pendingLabel: "Removing…", destructive: true
                    ) {
                        try await hub.removeSession(id: id)
                    }, animated: true)
                },
            ]))
        }
        if row.kind == "scratch" {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Keep", image: Glyph.check.image) { _ in
                    Task { @MainActor in
                        do { try await hub.keepSession(id: id) } catch { Toast.error(error.localizedDescription, in: context.presenter().view) }
                    }
                },
                UIAction(title: "Discard", image: Glyph.trash.image, attributes: .destructive) { _ in
                    context.presenter().present(ConfirmDialog(
                        title: "Discard this spin-off?",
                        body: "The session stops, and whatever the spawn created for it — its worktree, its transcript — goes with it, for good.",
                        confirmLabel: "Discard spin-off", pendingLabel: "Discarding…", destructive: true
                    ) {
                        try await hub.stopSession(instanceId: id, machineId: row.machineId, discard: true)
                    }, animated: true)
                },
            ]))
        }
        var copies: [UIMenuElement] = []
        let path = copy("Copy path", "Path", row.cwd)
        if row.cwd.isEmpty { path.attributes = [.disabled, .keepsMenuPresented] }
        copies.append(path)
        copies.append(copy("Copy id", "Session id", id))
        sections.append(UIMenu(options: .displayInline, children: copies))
        return UIMenu(children: sections)
    }

    /// A stored conversation, by its machine's catalog entry.
    static func stored(machineId: String, info: StoredSession, context: SessionMenuContext,
                       copy: @escaping (String, String, String) -> UIAction) -> UIMenu {
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
        first.append(
            UIAction(title: "Fork from here", image: Glyph.structure.image) { _ in
                Task { @MainActor in
                    do {
                        let forked = try await hub.fork(machineId: machineId, cwd: info.cwd ?? "", sessionKey: info.sessionId,
                                                        harness: .init(rawValue: harness) ?? .claude)
                        context.open(forked)
                    } catch {
                        Toast.error(error.localizedDescription, in: context.presenter().view)
                    }
                }
            })
        let path = copy("Copy path", "Path", info.cwd ?? "")
        if (info.cwd ?? "").isEmpty { path.attributes = [.disabled, .keepsMenuPresented] }
        let second: [UIMenuElement] = [
            UIAction(title: "Rename…", image: Glyph.toolEdit.image) { _ in
                context.presenter().present(RenameDialog(current: title) { next in
                    // A session the hub keeps is named there; a transcript it never ran, in the transcript.
                    if let row {
                        try await hub.renameInstance(id: row.id, title: next)
                    } else {
                        try await hub.renameSession(machineId: machineId, sessionKey: info.sessionId, title: next, dir: info.cwd,
                                                    harness: .init(rawValue: harness))
                        try await hub.reloadCatalog(machineId)
                    }
                }, animated: true)
            },
            path,
            copy("Copy session id", "Session id", info.sessionId),
        ]
        let third: [UIMenuElement] = [
            UIAction(title: "Delete transcript", image: Glyph.trash.image, attributes: .destructive) { _ in
                context.presenter().present(ConfirmDialog(
                    title: "Delete this transcript?",
                    body: "“\(title)” is removed from \(info.cwd ?? "this machine"), for good. Nothing else on the machine is touched.",
                    confirmLabel: "Delete transcript", pendingLabel: "Deleting…", destructive: true
                ) {
                    try await deleteTranscript(hub: hub, machineId: machineId, sessionKey: info.sessionId, dir: info.cwd, harness: harness)
                }, animated: true)
            },
        ]
        return UIMenu(children: [UIMenu(options: .displayInline, children: first), UIMenu(options: .displayInline, children: second),
                                 UIMenu(options: .displayInline, children: third)])
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

/// A context menu on a view (ContextMenu.Root): built as it opens, from the
/// state at that moment. Its copy items (ContextMenu.CopyItem) copy, say so
/// in a toast, turn their glyph to a check for `durHold`, then close.
@MainActor
final class ContextMenuHost: NSObject, UIContextMenuInteractionDelegate {
    typealias Copy = (_ title: String, _ what: String, _ text: String) -> UIAction
    private let build: (@escaping Copy) -> UIMenu?
    private weak var interaction: UIContextMenuInteraction?
    private var copied: String?

    @discardableResult
    static func attach(to view: UIView, build: @escaping (@escaping Copy) -> UIMenu?) -> ContextMenuHost {
        let host = ContextMenuHost(build: build)
        let interaction = UIContextMenuInteraction(delegate: host)
        view.addInteraction(interaction)
        host.interaction = interaction
        objc_setAssociatedObject(view, &ContextMenuHost.key, host, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        return host
    }

    nonisolated(unsafe) private static var key = 0

    private init(build: @escaping (@escaping Copy) -> UIMenu?) {
        self.build = build
    }

    private func menu() -> UIMenu? {
        build { [weak self] title, what, text in self?.copyItem(title, what: what, text: text) ?? UIAction(title: title) { _ in } }
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

/// Renaming a session (RenameDialog.svelte): the field opens holding its
/// current name and focused; Rename runs the caller's rename and stays
/// open, saying why, if it fails.
final class RenameDialog: KitDialogController, UITextFieldDelegate {
    private let current: String
    private let rename: (String) async throws -> Void
    private let field = KitField()
    private let problem = KitLabel(TypeScale.typeLabel, ink: Palette.destructive, lines: 0)
    private var submit: UIButton!
    private var busy = false

    init(current: String, rename: @escaping (String) async throws -> Void) {
        self.current = current
        self.rename = rename
        super.init(width: .md)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RenameDialog is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        body.addArrangedSubview(KitDialogController.header(title: "Rename session",
                                                           description: "What this session is called wherever it is listed. It does not change the transcript."))
        field.text = current
        field.accessibilityLabel = "Session title"
        field.delegate = self
        field.returnKeyType = .done
        field.addAction(UIAction { [weak self] _ in self?.paint() }, for: .editingChanged)
        problem.isHidden = true
        let column = UIStackView(arrangedSubviews: [field, problem])
        column.axis = .vertical
        column.spacing = Space.space2
        body.addArrangedSubview(column)
        let cancel = KitButton.make("Cancel", variant: .outline) { [weak self] in self?.dismiss(animated: true) }
        submit = KitButton.make("Rename", variant: .action) { [weak self] in self?.commit() }
        body.addArrangedSubview(KitDialogController.footer([cancel, submit]))
        paint()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        field.becomeFirstResponder()
        field.selectAll(nil)
    }

    private func paint() {
        submit.isEnabled = !(field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty && !busy
    }

    private func commit() {
        let next = (field.text ?? "").trimmingCharacters(in: .whitespaces)
        guard !next.isEmpty, !busy else { return }
        busy = true
        holdsOpen = true
        submit.configuration?.showsActivityIndicator = true
        KitButton.setTitle("Renaming…", of: submit, variant: .action, height: .standard)
        paint()
        Task { @MainActor in
            do {
                try await rename(next)
                holdsOpen = false
                dismiss(animated: true)
            } catch {
                busy = false
                holdsOpen = false
                submit.configuration?.showsActivityIndicator = false
                KitButton.setTitle("Rename", of: submit, variant: .action, height: .standard)
                problem.text = error.localizedDescription
                morph { problem.isHidden = false }
                paint()
            }
        }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        commit()
        return true
    }
}
