import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// A machine's keychain dialog (UnlockKeychain.svelte),
// what they show once sent (MachineAuthStatus.svelte), and an error read in
// full (ErrorDialog.svelte).

/// What each answer says: a title and one sentence.
typealias AuthSaid = [Components.Schemas.AuthState: (title: String, body: String)]

/// The body a login dialog shows once sent (MachineAuthStatus.svelte): the
/// wait, naming what the machine is doing until it answers, then the answer,
/// a check for a machine that can start a turn and a warning for any
/// other, which stays up until Done. Closing while it works only stops
/// watching.
final class MachineAuthStatusView: UIStackView {
    private let mark = UIView()
    private let title = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
    private let line = CrossView()
    private let onClose: () -> Void
    private var button: UIButton?
    private let buttonRow = UIStackView()

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space4
        mark.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([mark.widthAnchor.constraint(equalToConstant: 36), mark.heightAnchor.constraint(equalToConstant: 36)])
        let head = UIStackView(arrangedSubviews: [mark, title, line])
        head.axis = .vertical
        head.spacing = Space.space2
        head.alignment = .leading
        title.accessibilityTraits = .header
        title.wrap = .balance
        // The button stands at the end of the box at its own height (`mt-auto
        // flex justify-end`): the height the dialog holds while it works is
        // room above it, never a taller button.
        buttonRow.alignment = .center
        buttonRow.addArrangedSubview(UIView())
        let gap = UIView()
        gap.setContentHuggingPriority(.defaultLow - 1, for: .vertical)
        // With no height held (the answer), the room is nothing and the
        // button stands under the words; a held height still opens it.
        let none = gap.heightAnchor.constraint(equalToConstant: 0)
        none.priority = .defaultLow
        none.isActive = true
        addArrangedSubview(head)
        addArrangedSubview(gap)
        addArrangedSubview(buttonRow)
        setCustomSpacing(0, after: head)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("MachineAuthStatusView is built in code")
    }

    private func setMark(_ view: UIView) {
        mark.subviews.forEach { $0.removeFromSuperview() }
        view.translatesAutoresizingMaskIntoConstraints = false
        mark.addSubview(view)
        NSLayoutConstraint.activate([view.centerXAnchor.constraint(equalTo: mark.centerXAnchor), view.centerYAnchor.constraint(equalTo: mark.centerYAnchor)])
    }

    private func setButton(_ label: String, variant: KitButton.Variant) {
        button?.removeFromSuperview()
        let made = KitButton.make(label, variant: variant) { [weak self] in self?.onClose() }
        buttonRow.addArrangedSubview(made)
        button = made
    }

    private func sayLine(_ text: String) {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground, lines: 0)
        label.text = text
        label.wrap = .pretty
        line.show(label)
    }

    /// One step, said until the machine answers: nothing the machine has not said is claimed as passed.
    func working(title text: String, step: String) {
        setMark(KitSpinner(side: 24, tint: Palette.mutedForeground))
        title.text = text
        sayLine(step)
        setButton("Close", variant: .outline)
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    func answered(_ state: Components.Schemas.AuthState, said: AuthSaid) {
        let ok = state == .authenticated
        let glyph = GlyphView(ok ? .passed : .warning, size: 36, tint: ok ? Palette.success : Palette.warning)
        setMark(glyph)
        // mark-in: from a quarter size, blurred, over durPop.
        if !UIAccessibility.isReduceMotionEnabled {
            glyph.alpha = 0
            glyph.transform = CGAffineTransform(scaleX: 0.25, y: 0.25)
            Motion.easeOut.animator(Motion.durPop) {
                glyph.alpha = 1
                glyph.transform = .identity
            }.startAnimation()
        }
        let answer = said[state] ?? (title: "", body: "")
        title.text = answer.title
        sayLine(answer.body)
        setButton("Done", variant: .action)
        UIAccessibility.post(notification: .announcement, argument: "\(answer.title). \(answer.body)")
    }
}

/// A machine's login form and its answer, the two views cross-fading in
/// place with the dialog holding the form's height while it works.
class MachineAuthDialog: KitDialogController {
    let hub: HubConnection
    let machine: MachineRow
    let views = CrossView()
    /// Which submit an answer belongs to: one that lands after the dialog moved on is dropped.
    var attempt = 0

    init(hub: HubConnection, machine: MachineRow, width: Width) {
        self.hub = hub
        self.machine = machine
        super.init(width: width)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachineAuthDialog is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        body.addArrangedSubview(views)
    }

    func showStatus(working title: String, step: String) -> MachineAuthStatusView {
        let status = MachineAuthStatusView { [weak self] in self?.dismiss(animated: true) }
        status.working(title: title, step: step)
        morph { views.show(status, holdHeight: true) }
        return status
    }

    /// The answer: the status says it, and the dialog lets go of the form's
    /// height it held while it worked, settling to what the answer takes.
    func answer(_ status: MachineAuthStatusView, _ state: Components.Schemas.AuthState, said: AuthSaid) {
        status.answered(state, said: said)
        morph { views.release() }
    }
}

/// Unlocks a Mac's login keychain from here (UnlockKeychain.svelte). The
/// password is sent, used once and dropped: the field clears the moment it
/// goes, whatever the answer.
final class UnlockKeychainController: MachineAuthDialog, UITextFieldDelegate {
    private let password = KitField()
    private let note = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground, lines: 0)
    private let problem = KitLabel(TypeScale.typeLabel, ink: Palette.destructive, lines: 0)
    private var submit: UIButton!

    init(hub: HubConnection, machine: MachineRow) {
        super.init(hub: hub, machine: machine, width: .md)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UnlockKeychainController is built in code")
    }

    private var said: AuthSaid {
        let host = machine.name
        return [
            .authenticated: ("\(host) is unlocked", "\(host) is logged in again. New sessions there can read its credentials."),
            .unauthenticated: ("\(host) is not logged in", "\(host) unlocked, but nobody has logged in there yet."),
            .unreadableCredentials: ("\(host) cannot read its login", "\(host) unlocked, but its credentials still cannot be read."),
        ]
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        views.show(form())
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        password.becomeFirstResponder()
    }

    private func form() -> UIView {
        let header = KitDialogController.header(
            title: "Unlock \(machine.name)",
            description: "Its login keychain is locked, so Claude Code there cannot read its credentials. This is the macOS login password for that machine.",
            glyph: .key, glyphTint: Palette.warning
        )
        password.isSecureTextEntry = true
        password.textContentType = .password
        password.attributedPlaceholder = NSAttributedString(string: "Login password for \(machine.name)",
                                                            attributes: [.font: TypeScale.typeBody.font, .foregroundColor: Palette.mutedForeground])
        password.accessibilityLabel = "Login password for \(machine.name)"
        password.delegate = self
        password.returnKeyType = .go
        password.addAction(UIAction { [weak self] _ in self?.submit.isEnabled = !(self?.password.text ?? "").isEmpty }, for: .editingChanged)
        note.text = "Sent over your tunnel to that machine, used once, and not stored anywhere."
        note.wrap = .pretty
        problem.wrap = .pretty
        problem.isHidden = true
        let cancel = KitButton.make("Cancel", variant: .outline) { [weak self] in self?.dismiss(animated: true) }
        submit = KitButton.make("Unlock", variant: .action) { [weak self] in self?.unlock() }
        submit.isEnabled = false
        let fields = UIStackView(arrangedSubviews: [password, problem, note, KitDialogController.actions([cancel, submit])])
        fields.axis = .vertical
        fields.spacing = Space.space3
        let stack = UIStackView(arrangedSubviews: [header, fields])
        stack.axis = .vertical
        stack.spacing = 24
        return stack
    }

    private func unlock() {
        let sent = password.text ?? ""
        guard !sent.isEmpty else { return }
        attempt += 1
        let mine = attempt
        password.text = ""
        password.resignFirstResponder()
        let status = showStatus(working: "Unlocking \(machine.name)…",
                                step: "Unlocking the login keychain and checking \(machine.name) can read its credentials")
        Task { @MainActor [weak self, hub, machine] in
            do {
                let state = try await hub.unlockKeychain(machineId: machine.machineId, password: sent)
                guard let self, mine == attempt else { return }
                answer(status, state, said: said)
            } catch {
                guard let self, mine == attempt else { return }
                views.show(form())
                problem.text = error.localizedDescription
                problem.isHidden = false
                note.isHidden = true
                password.becomeFirstResponder()
                morph {}
            }
        }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        unlock()
        return true
    }
}

/// An error read in full (ErrorDialog.svelte): the whole text, selectable,
/// in a bordered box that scrolls past 60% of the screen, and Copy error,
/// whose glyph turns to a check for `durHold`.
final class ErrorDialogController: KitDialogController {
    private let titleText: String
    private let message: String

    init(title: String, message: String) {
        titleText = title
        self.message = message
        super.init(width: .xl2)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ErrorDialogController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        body.addArrangedSubview(KitDialogController.header(title: titleText, glyph: .alert, glyphTint: Palette.destructive))
        // `.error-text`: recess, hairline, `--radius-sm`, `--space-3` in, 1.55 leading, up to 60vh.
        let inset = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
        body.addArrangedSubview(KitPre(message, fill: Palette.surfaceRecess, border: Palette.borderHairline, radius: Radius.radiusSm,
                                       inset: inset, leading: 1.55, maxHeight: UIScreen.main.bounds.height * 0.6))
        var copyButton: UIButton!
        copyButton = KitButton.make("Copy error", glyph: .copy, variant: .outline) { [message] in
            UIPasteboard.general.string = message
            copyButton.configuration?.image = Glyph.check.image.resized(to: Size.iconMd)
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(Motion.durHold))
                copyButton.configuration?.image = Glyph.copy.image.resized(to: Size.iconMd)
            }
        }
        let close = KitButton.make("Close", variant: .action) { [weak self] in self?.dismiss(animated: true) }
        body.addArrangedSubview(KitDialogController.footer([copyButton, close]))
    }
}
