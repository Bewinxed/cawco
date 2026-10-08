import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// A machine's login dialogs (MachineLogin.svelte, UnlockKeychain.svelte),
// what they show once sent (MachineAuthStatus.svelte), and an error read in
// full (ErrorDialog.svelte).

/// What each answer says: a title and one sentence.
typealias AuthSaid = [Components.Schemas.AuthState: (title: String, body: String)]

/// The body a login dialog shows once sent (MachineAuthStatus.svelte): the
/// wait, naming the first step and after 1.5s the second, then the answer,
/// a check for a machine that can start a turn and a warning for any
/// other, which stays up until Done. Closing while it works only stops
/// watching.
final class MachineAuthStatusView: UIStackView {
    private let mark = UIView()
    private let title = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
    private let line = CrossView()
    private var stepTimer: Task<Void, Never>?
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
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground, lines: 0)
        label.text = text
        label.wrap = .pretty
        line.show(label)
    }

    func working(title text: String, steps: (String, String)) {
        setMark(KitSpinner(side: 24, tint: Palette.mutedForeground))
        title.text = text
        sayLine(steps.0)
        setButton("Close", variant: .outline)
        stepTimer?.cancel()
        stepTimer = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            self?.sayLine(steps.1)
        }
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    func answered(_ state: Components.Schemas.AuthState, said: AuthSaid) {
        stepTimer?.cancel()
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

    func showStatus(working title: String, steps: (String, String)) -> MachineAuthStatusView {
        let status = MachineAuthStatusView { [weak self] in self?.dismiss(animated: true) }
        status.working(title: title, steps: steps)
        morph { views.show(status, holdHeight: true) }
        return status
    }
}

/// Logs a machine in from here (MachineLogin.svelte): the machine starts
/// Claude Code's own `claude auth login` as the dialog opens and passes its
/// link here, the reader authorises in their own browser and pastes the code
/// back into that sign-in. Claude Code on the machine keeps the login.
final class MachineLoginController: MachineAuthDialog, UITextFieldDelegate {
    private let codeField = KitField(placeholder: "Paste the code from that page", mono: true)
    private let asking = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground, lines: 0)
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.destructive, lines: 0)
    private var openLink: UIButton!
    private var submit: UIButton!
    private var url: URL?

    init(hub: HubConnection, machine: MachineRow) {
        super.init(hub: hub, machine: machine, width: .lg)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachineLoginController is built in code")
    }

    private var said: AuthSaid {
        let host = machine.hostname
        return [
            .authenticated: ("\(host) is logged in", "New sessions on \(host) will use this login."),
            .unauthenticated: ("\(host) is not logged in", "\(host) saved the token, but still reports nobody logged in."),
            .unreadableCredentials: ("\(host) cannot read its login", "\(host) saved the token, but cannot read its credentials."),
        ]
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        views.show(form())
        begin()
    }

    private func form() -> UIView {
        let header = KitDialogController.header(
            title: "Log in \(machine.hostname)",
            description: "Authorise in your browser here, then paste the code back. Nothing needs to be typed on that machine.",
            glyph: .key
        )
        asking.text = "Asking \(machine.hostname) for a login link…"
        asking.wrap = .pretty
        openLink = KitButton.make("Open the authorisation page", glyph: .external, variant: .action, height: .sm, stretch: true) { [weak self] in
            guard let url = self?.url else { return }
            UIApplication.shared.open(url)
        }
        openLink.isHidden = true
        codeField.accessibilityLabel = "Authorisation code"
        codeField.isEnabled = false
        codeField.delegate = self
        codeField.returnKeyType = .go
        codeField.addAction(UIAction { [weak self] _ in self?.paintSubmit() }, for: .editingChanged)
        problem.wrap = .pretty
        problem.isHidden = true
        let cancel = KitButton.make("Cancel", variant: .outline) { [weak self] in self?.dismiss(animated: true) }
        submit = KitButton.make("Log in", variant: .action) { [weak self] in self?.finish() }
        submit.isEnabled = false
        let fields = UIStackView(arrangedSubviews: [asking, openLink, codeField, problem, KitDialogController.footer([cancel, submit])])
        fields.axis = .vertical
        fields.spacing = Space.space4
        let stack = UIStackView(arrangedSubviews: [header, fields])
        stack.axis = .vertical
        stack.spacing = 24
        return stack
    }

    private func paintSubmit() {
        submit.isEnabled = url != nil && !(codeField.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Asked for as the dialog opens, so the reader never waits on a blank box.
    private func begin() {
        attempt += 1
        let mine = attempt
        Task { @MainActor [weak self, hub, machine] in
            do {
                let challenge = try await hub.beginLogin(machineId: machine.machineId)
                guard let self, mine == attempt else { return }
                url = URL(string: challenge.url)
                morph {
                    self.asking.isHidden = true
                    self.openLink.isHidden = false
                }
                codeField.isEnabled = true
                paintSubmit()
            } catch {
                guard let self, mine == attempt else { return }
                fail(error.localizedDescription)
            }
        }
    }

    private func fail(_ message: String) {
        views.show(form())
        if url != nil {
            asking.isHidden = true
            openLink.isHidden = false
            codeField.isEnabled = true
        }
        problem.text = message
        problem.isHidden = false
        codeField.accessibilityHint = message
        paintSubmit()
        if url != nil { codeField.becomeFirstResponder() }
        morph {}
    }

    private func finish() {
        let code = (codeField.text ?? "").trimmingCharacters(in: .whitespaces)
        guard !code.isEmpty, url != nil else { return }
        attempt += 1
        let mine = attempt
        codeField.resignFirstResponder()
        let status = showStatus(working: "Logging in \(machine.hostname)…",
                                steps: ("Exchanging the code", "Checking \(machine.hostname) can use the new login"))
        Task { @MainActor [weak self, hub, machine] in
            do {
                let state = try await hub.completeLogin(machineId: machine.machineId, code: code)
                guard let self, mine == attempt else { return }
                codeField.text = ""
                status.answered(state, said: said)
                morph {}
            } catch {
                guard let self, mine == attempt else { return }
                fail(error.localizedDescription)
            }
        }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        finish()
        return true
    }
}

/// Unlocks a Mac's login keychain from here (UnlockKeychain.svelte). The
/// password is sent, used once and dropped: the field clears the moment it
/// goes, whatever the answer.
final class UnlockKeychainController: MachineAuthDialog, UITextFieldDelegate {
    private let password = KitField()
    private let note = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground, lines: 0)
    private let problem = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.destructive, lines: 0)
    private var submit: UIButton!

    init(hub: HubConnection, machine: MachineRow) {
        super.init(hub: hub, machine: machine, width: .md)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UnlockKeychainController is built in code")
    }

    private var said: AuthSaid {
        let host = machine.hostname
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
            title: "Unlock \(machine.hostname)",
            description: "Its login keychain is locked, so Claude Code there cannot read its credentials. This is the macOS login password for that machine.",
            glyph: .key, glyphTint: Palette.warning
        )
        password.isSecureTextEntry = true
        password.textContentType = .password
        password.attributedPlaceholder = NSAttributedString(string: "Login password for \(machine.hostname)",
                                                            attributes: [.font: TypeScale.typeBody.font, .foregroundColor: Palette.mutedForeground])
        password.accessibilityLabel = "Login password for \(machine.hostname)"
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
        let fields = UIStackView(arrangedSubviews: [password, problem, note, KitDialogController.footer([cancel, submit])])
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
        let status = showStatus(working: "Unlocking \(machine.hostname)…",
                                steps: ("Unlocking the login keychain", "Checking \(machine.hostname) can read its credentials"))
        Task { @MainActor [weak self, hub, machine] in
            do {
                let state = try await hub.unlockKeychain(machineId: machine.machineId, password: sent)
                guard let self, mine == attempt else { return }
                status.answered(state, said: said)
                morph {}
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
        let text = UITextView()
        text.isEditable = false
        text.isSelectable = true
        text.text = message
        text.font = TypeScale.typeCode.with(points: TypeScale.typeMeta.points).font
        text.textColor = Palette.inkStrong
        text.backgroundColor = Palette.surfaceRecess
        text.layer.cornerRadius = Radius.radiusMd
        text.layer.borderWidth = 1
        text.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        text.textContainerInset = UIEdgeInsets(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3)
        text.translatesAutoresizingMaskIntoConstraints = false
        let fit = text.heightAnchor.constraint(equalToConstant: 120)
        fit.priority = .defaultLow
        NSLayoutConstraint.activate([fit, text.heightAnchor.constraint(lessThanOrEqualToConstant: UIScreen.main.bounds.height * 0.6)])
        body.addArrangedSubview(text)
        text.layoutIfNeeded()
        fit.constant = text.sizeThatFits(CGSize(width: 600, height: CGFloat.greatestFiniteMagnitude)).height
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
