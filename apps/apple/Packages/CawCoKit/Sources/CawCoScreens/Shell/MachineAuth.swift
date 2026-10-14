import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// A machine's keychain unlock, under its row (UnlockKeychain.svelte), and
// what it shows once sent (MachineAuthStatus.svelte).

/// What each answer says: a title and one sentence.
typealias AuthSaid = [Components.Schemas.AuthState: (title: String, body: String)]

/// What an unlock shows once the password is sent (MachineAuthStatus.svelte):
/// the wait, naming what the machine does until it answers, then the answer,
/// a check for a machine that can start a turn and a warning for any other,
/// which stays up until Done. Closing while it works only stops watching.
final class MachineAuthStatusView: UIStackView {
    private let mark = UIView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let onClose: () -> Void
    private var button: UIButton?
    private let buttonRow = UIStackView()

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        mark.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([mark.widthAnchor.constraint(equalToConstant: 36), mark.heightAnchor.constraint(equalToConstant: 36)])
        let head = UIStackView(arrangedSubviews: [mark, title, line])
        head.axis = .vertical
        head.spacing = Space.space2
        head.alignment = .leading
        title.accessibilityTraits = .header
        title.wrap = .balance
        line.wrap = .pretty
        // The button stands at the end of the box at its own height (`mt-auto
        // flex justify-end`): the height the tile holds while it works is
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
        let made = KitButton.make(label, variant: variant, height: .sm) { [weak self] in self?.onClose() }
        buttonRow.addArrangedSubview(made)
        button = made
    }

    /// One line naming what the machine does, said until it answers: nothing it has not said is claimed as passed.
    func working(title text: String, step: String) {
        setMark(KitSpinner(side: 24, tint: Palette.inkMuted))
        title.text = text
        line.text = step
        setButton("Close", variant: .ghost)
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    func answered(_ state: Components.Schemas.AuthState, said: AuthSaid) {
        let ok = state == .authenticated
        let glyph = GlyphView(ok ? .passed : .warning, size: 36, tint: ok ? Palette.success : Palette.warning)
        setMark(glyph)
        // mark-in: from a quarter size, over durPop.
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
        line.text = answer.body
        setButton("Done", variant: .action)
        UIAccessibility.post(notification: .announcement, argument: "\(answer.title). \(answer.body)")
    }
}

/// Unlocks a Mac's login keychain from here (UnlockKeychain.svelte), under
/// the machine's row in the list (DESIGN.md, The Open Page Rule): nothing
/// elsewhere breaks while the password is typed, so nothing else is held.
/// Cancel or Escape puts it away. The password is sent, used once and
/// dropped: the field clears the moment it goes, whatever the answer. The
/// form and the answer cross-fade in place, the tile holding the form's
/// height while the machine works.
final class UnlockKeychainView: UIView, UITextFieldDelegate {
    let machineId: String
    private let hub: HubConnection
    private let host: String
    private let views = CrossView()
    private let password = KitField()
    private let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var submit: UIButton!
    /// Which submit an answer belongs to: one that lands after the tile was put away is dropped.
    private var attempt = 0
    /// Put away (Cancel, Close, Done, Escape): the list takes it out.
    var onClose: () -> Void = {}
    /// It changed height: the list (and the card it stands in) measures again.
    var onResize: () -> Void = {}

    init(hub: HubConnection, machine: MachineRow) {
        self.hub = hub
        machineId = machine.machineId
        host = machine.name
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        accessibilityIdentifier = "machine-unlock"
        // `.tile`: the raised surface on a hairline at `--radius-md`, `--shadow-raised`, `space-3` in.
        let tile = TileView(radius: Radius.radiusMd)
        tile.translatesAutoresizingMaskIntoConstraints = false
        tile.backgroundColor = Palette.surfaceRaised
        tile.layer.borderWidth = 1
        tile.boxShadow = Shadow.shadowRaised
        tile.addSubview(views)
        addSubview(tile)
        NSLayoutConstraint.activate([
            // `.unlock`: `space-1` above and below, `space-2` in from the list's edges.
            tile.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            tile.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            tile.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            tile.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            views.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            views.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
            views.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space3),
            views.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space3),
        ])
        shouldGroupAccessibilityChildren = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (unlock: UnlockKeychainView, _: UITraitCollection) in
            tile.layer.borderColor = Palette.borderHairline.resolvedColor(with: unlock.traitCollection).cgColor
        }
        tile.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        views.show(form())
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UnlockKeychainView is built in code")
    }

    /// The field takes the keys as it opens.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, views.current?.isDescendant(of: self) == true, attempt == 0 else { return }
        DispatchQueue.main.async { [weak self] in _ = self?.password.becomeFirstResponder() }
    }

    private var said: AuthSaid {
        [
            .authenticated: ("\(host) is unlocked", "New sessions on \(host) can read its accounts' logins again."),
            .unauthenticated: ("No account is signed in on \(host)",
                               "\(host) unlocked, but no Claude account is signed in there. Add one in Configure → Accounts and sign it in there."),
            .unreadableCredentials: ("\(host) cannot read its logins", "\(host) unlocked, but its accounts' logins still cannot be read."),
        ]
    }

    private func form() -> UIView {
        let key = GlyphView(.key, size: Size.iconMd, tint: Palette.warning)
        key.setContentHuggingPriority(.required, for: .horizontal)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        title.text = "Unlock \(host)"
        title.accessibilityTraits = .header
        let titleLine = UIStackView(arrangedSubviews: [key, title])
        titleLine.spacing = Space.space2
        titleLine.alignment = .center
        let body = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        body.wrap = .pretty
        body.text = "Its login keychain is locked, so Claude Code there cannot read its credentials. This is the macOS login password for that machine."
        let head = UIStackView(arrangedSubviews: [titleLine, body])
        head.axis = .vertical
        head.spacing = Space.space1
        password.isSecureTextEntry = true
        password.textContentType = .password
        password.attributedPlaceholder = NSAttributedString(string: "Login password for \(host)",
                                                            attributes: [.font: TypeScale.typeBody.font, .foregroundColor: Palette.mutedForeground])
        password.accessibilityLabel = "Login password for \(host)"
        password.delegate = self
        password.returnKeyType = .go
        password.addAction(UIAction { [weak self] _ in self?.submit.isEnabled = !(self?.password.text ?? "").isEmpty }, for: .editingChanged)
        note.text = "Sent over your tunnel to that machine, used once, and not stored anywhere."
        note.wrap = .pretty
        problem.wrap = .pretty
        problem.isHidden = true
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in self?.close() }
        submit = KitButton.make("Unlock", variant: .action, height: .sm) { [weak self] in self?.unlock() }
        submit.isEnabled = !(password.text ?? "").isEmpty
        let actions = UIStackView(arrangedSubviews: [UIView(), cancel, submit])
        actions.spacing = Space.space2
        actions.alignment = .center
        let fields = UIStackView(arrangedSubviews: [password, problem, note, actions])
        fields.axis = .vertical
        fields.spacing = Space.space2
        let stack = UIStackView(arrangedSubviews: [head, fields])
        stack.axis = .vertical
        stack.spacing = Space.space3
        return stack
    }

    private func close() {
        attempt += 1
        password.text = ""
        password.resignFirstResponder()
        onClose()
    }

    private func unlock() {
        let sent = password.text ?? ""
        guard !sent.isEmpty else { return }
        attempt += 1
        let mine = attempt
        // Cleared the moment it has been sent, whatever the answer will be.
        password.text = ""
        password.resignFirstResponder()
        let status = MachineAuthStatusView { [weak self] in self?.close() }
        status.working(title: "Unlocking \(host)…", step: "Unlocking the login keychain and checking \(host) can read its credentials")
        views.show(status, holdHeight: true)
        #if DEBUG
        Self.probe("unlock \(machineId) working")
        #endif
        onResize()
        Task { @MainActor [weak self, hub, machineId] in
            do {
                let state = try await hub.unlockKeychain(machineId: machineId, password: sent)
                guard let self, mine == attempt else { return }
                status.answered(state, said: said)
                views.release()
                #if DEBUG
                Self.probe("unlock \(machineId) answered \(state.rawValue)")
                #endif
                onResize()
            } catch {
                guard let self, mine == attempt else { return }
                views.show(form())
                problem.text = error.localizedDescription
                problem.isHidden = false
                note.isHidden = true
                password.becomeFirstResponder()
                #if DEBUG
                Self.probe("unlock \(machineId) refused: \(error.localizedDescription)")
                #endif
                onResize()
            }
        }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        unlock()
        return true
    }

    /// Escape inside it puts it away.
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.key?.keyCode == .keyboardEscape }) {
            close()
            return
        }
        super.pressesBegan(presses, with: event)
    }

    #if DEBUG
    static func probe(_ line: String) {
        AskProbe.log.notice("machine \(line, privacy: .public)")
    }

    /// The password typed and Unlock pressed.
    func probeSubmit(_ typed: String) {
        password.text = typed
        unlock()
    }

    /// The form or the status, and what each says.
    var probeState: String {
        let words = { (root: UIView) -> [String] in
            var said: [String] = []
            func walk(_ view: UIView) {
                if view.isHidden { return }
                if let label = view as? UILabel, let text = label.text, !text.isEmpty { said.append(text) }
                if let button = view as? UIButton, let title = button.configuration?.title { said.append("[\(title)\(button.isEnabled ? "" : " off")]") }
                view.subviews.forEach(walk)
            }
            walk(root)
            return said
        }
        return views.current.map { words($0).joined(separator: " / ") } ?? "empty"
    }
    #endif
}
