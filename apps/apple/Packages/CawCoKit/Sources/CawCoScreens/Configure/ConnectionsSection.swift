import AuthenticationServices
import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Connections (routes/config/connections/+page.svelte): one row
/// per signed-in outside service, led by the service's mark, with the
/// account it signs in as and its state (both the hub's word), and which
/// projects may use it. A row that is not signed in carries its way in:
/// Sign in (OAuth, in the platform's sign-in browser, the row turning signed
/// in when the hub says so) or Set key (a field under the row, emptied the
/// moment the hub has the key). Its ⋯ holds Projects…, a checklist that
/// stays open while you tick, and Remove, which goes through at once with
/// Undo in its toast. With no connection yet, signing in is the person's,
/// so the page says so, and each card signs in to one service.
final class ConnectionsSectionController: ConfigSectionController, ASWebAuthenticationPresentationContextProviding {
    private let store: FleetConnections
    private let signInMenu = KitButton.make(Words.Connections.signInTo, glyph: .plus, variant: .action) {}
    private let list = RowList(label: Words.Connections.list)
    private let rows = KeyedRows()
    private let empty = UIStackView()
    private let cards = UIStackView()
    private let form = ConnectionForm()
    /// What a row's last action came to when it failed, by connection name.
    private var problems: [String: String] = [:]
    /// The rows whose sign-in is under way, and the browser it runs in.
    private var signing: Set<String> = []
    private var session: ASWebAuthenticationSession?
    private var watching: Task<Void, Never>?
    /// The row whose key field is open.
    private var keying: String?
    private var keyFields: [String: KeyAsk] = [:]
    private var removing: String?

    override init(section: ConfigSection, context: ShellContext) {
        store = FleetConnections(hub: context.hub)
        super.init(section: section, context: context)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConnectionsSectionController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        signInMenu.accessibilityIdentifier = "connections.sign-in"
        signInMenu.showsMenuAsPrimaryAction = true
        signInMenu.menu = UIMenu(children: Words.Connections.services.map { service in
            UIAction(title: service.label, image: BrandLogo.provider(service.service)?.image) { [weak self] _ in self?.startAdding(service) }
        })
        setActions([signInMenu])

        // The empty state: the line, then a card per service.
        let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        line.text = Words.Connections.emptyLine
        line.wrap = .pretty
        cards.axis = .vertical
        cards.spacing = Space.space2
        cards.accessibilityLabel = Words.Connections.servicesLabel
        for service in Words.Connections.services {
            let card = ServiceCard(service)
            card.addAction(UIAction { [weak self] _ in self?.startAdding(service) }, for: .primaryActionTriggered)
            cards.addArrangedSubview(card)
        }
        empty.axis = .vertical
        empty.spacing = Space.space3
        empty.addArrangedSubview(CapBox.measure(line, TypeScale.typeBody))
        empty.addArrangedSubview(cards)

        form.isHidden = true
        form.onCancel = { [weak self] in self?.form.close() }
        form.onSubmit = { [weak self] service, way, account, key in self?.add(service, way: way, account: account, key: key) }
        setContent([form, empty, list])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await store.read() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        watching?.cancel()
    }

    override func refreshContent() {
        ready = store.rows != nil
        problem = store.rows == nil ? store.problem : nil
        let down = hub.writesBlocked
        let all = store.rows ?? []
        signInMenu.isHidden = all.isEmpty
        signInMenu.isEnabled = down == nil
        signInMenu.accessibilityHint = down
        empty.isHidden = !all.isEmpty
        list.isHidden = all.isEmpty
        // The form opens where it was asked for: under the cards, or over the list.
        let home: UIStackView = all.isEmpty ? empty : content
        if form.superview !== home {
            form.removeFromSuperview()
            if all.isEmpty { empty.addArrangedSubview(form) } else { content.insertArrangedSubview(form, at: 0) }
        }
        let shown = rows.keep(all.map(\.name))
        for row in all { draw(row, in: rows.row(row.name)) }
        list.set(shown)
    }

    // MARK: A row

    private func label(_ row: ConnectionView) -> String {
        Words.Connections.services.first { $0.service == row.service.lowercased() }?.label ?? row.service
    }

    private func draw(_ row: ConnectionView, in view: ConfigRow) {
        let name = row.name
        let service = label(row)
        let mark: UIView = BrandLogo.provider(row.service.lowercased()).map { logo in
            let image = UIImageView(image: logo.image)
            image.contentMode = .scaleAspectFit
            image.widthAnchor.constraint(equalToConstant: 16).isActive = true
            image.heightAnchor.constraint(equalToConstant: 16).isActive = true
            return image
        } ?? GlyphView(.toolMcp, size: 16, tint: Palette.inkMuted)
        // Projects…: a checklist that stays open while each project is ticked.
        let projects = UIMenu(title: Words.Connections.projects, image: Glyph.toolTodo.image.resized(to: 16), children: hub.fleet.projects.map { project in
            UIAction(title: project.name, attributes: .keepsMenuPresented, state: row.projects.contains(project.id) ? .on : .off) { [weak self] _ in
                self?.toggle(name, project: project.id)
            }
        })
        view.show(name: service, meta: row.account, mark: mark,
                  actions: [RowAction(label: Words.Connections.remove, glyph: .trash, destructive: true, disabled: removing == name) { [weak self] in
                      self?.remove(row)
                  }],
                  lead: [projects], note: note(row))
        view.accessibilityIdentifier = "connections.row.\(name)"
        let (word, variant): (String, KitBadge.Variant) = switch row.state {
        case .signedIn: (Words.Connections.stateSignedIn, .done)
        case .needsSignIn: (Words.Connections.stateNeedsSignIn, .secondary)
        default: (Words.Connections.stateError, .attn)
        }
        view.setBadge(KitBadge(word, variant: variant))

        // Up to two of the projects that may use it, then "+N"; its way in, while it has none.
        var trailing: [UIView] = []
        let names = row.projects.compactMap { id in hub.fleet.projects.first { $0.id == id }?.name }
        if !names.isEmpty {
            let chips = UIStackView(arrangedSubviews: names.prefix(2).map { KitBadge($0, variant: .secondary) })
            chips.spacing = Space.space1
            if names.count > 2 { chips.addArrangedSubview(KitBadge(Words.Connections.more(count: names.count - 2), variant: .outline)) }
            chips.accessibilityLabel = "\(Words.Connections.projectsMayUse) \(names.joined(separator: ", "))"
            trailing.append(chips)
        }
        if row.state != .signedIn, row.auth == .oauth {
            let pending = signing.contains(name)
            let button = KitButton.make(pending ? Words.Connections.signingIn : Words.Connections.signIn, variant: .outline, height: .sm) { [weak self] in
                self?.signIn(row)
            }
            button.configuration?.showsActivityIndicator = pending
            button.isEnabled = !pending
            trailing.append(button)
        } else if row.state != .signedIn, row.auth == .bearer || row.auth == .header, keying != name {
            trailing.append(KitButton.make(Words.Connections.setKey, variant: .outline, height: .sm) { [weak self] in
                self?.keying = name
                self?.requestRefresh()
            })
        }
        view.setTrailing(trailing)

        if keying == name {
            let ask = keyFields[name] ?? KeyAsk(label: Words.Connections.rowKey(service: service, account: row.account))
            keyFields[name] = ask
            ask.onSave = { [weak self] key in self?.saveKey(name, key: key) }
            ask.onCancel = { [weak self] in
                self?.keying = nil
                self?.keyFields[name] = nil
                self?.requestRefresh()
            }
            view.setBelow([ask])
            DispatchQueue.main.async { ask.focus() }
        } else {
            keyFields[name] = nil
            view.setBelow([])
        }
    }

    /// The line under a row: its sign-in under way, its last failure, or the hub's reason.
    private func note(_ row: ConnectionView) -> RowNote? {
        if signing.contains(row.name) { return RowNote(text: Words.Connections.signingInTab(service: label(row)), tone: .busy) }
        if let problem = problems[row.name] { return RowNote(text: problem, tone: .fail) }
        let saidByButton = [Words.Connections.saidSignIn, Words.Connections.saidSetKey, Words.Connections.saidUnderWay]
        if row.state != .signedIn, let reason = row.reason, !saidByButton.contains(reason) { return RowNote(text: reason, tone: .fail) }
        return nil
    }

    #if DEBUG
    /// A service signed in to through the form, as a person fills and sends it.
    func probeAdd(service name: String, account: String, key: String) {
        guard let service = Words.Connections.services.first(where: { $0.service == name }) else { return }
        startAdding(service)
        guard let way = ConnectionForm.firstWay(service) else { return }
        add(service, way: way, account: account, key: key)
    }

    var probeAdding: Bool { form.pending }
    func probeRow(_ name: String) -> ConnectionView? { store.rows?.first { $0.name == name } }
    func probeToggle(_ name: String, project: String) { toggle(name, project: project) }
    #endif

    // MARK: Acting

    private func startAdding(_ service: Words.Connections.Service) {
        form.open(service)
    }

    /// The account's words, then its way in: the row exists once the hub has it, and what follows is said on it.
    private func add(_ service: Words.Connections.Service, way: Words.Connections.Way, account: String, key: String) {
        form.pending = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            let name: String
            do {
                name = try await store.create(service, way: way, account: account)
            } catch {
                form.pending = false
                form.problem = ThreadsStore.failureWords(error)
                return
            }
            form.pending = false
            form.close()
            if way.auth == "oauth" {
                guard let row = store.rows?.first(where: { $0.name == name }) else { return }
                signIn(row)
                return
            }
            do {
                try await store.setKey(name, key: key)
            } catch {
                problems[name] = ThreadsStore.failureWords(error)
            }
            requestRefresh()
        }
    }

    private func saveKey(_ name: String, key: String) {
        problems[name] = nil
        keyFields[name]?.pending = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await store.setKey(name, key: key)
                keying = nil
                keyFields[name] = nil
            } catch {
                keyFields[name]?.pending = false
                problems[name] = ThreadsStore.failureWords(error)
            }
            requestRefresh()
        }
    }

    /// The provider's sign-in in the platform's browser; the hub's word turns the row.
    private func signIn(_ row: ConnectionView) {
        let name = row.name
        signing.insert(name)
        problems[name] = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let url = try await store.signIn(name)
                let session = ASWebAuthenticationSession(url: url, callback: .customScheme("cawco-signin")) { [weak self] _, _ in
                    MainActor.assumeIsolated { self?.browserClosed(name) }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = false
                self.session = session
                session.start()
                watch(name)
            } catch {
                signing.remove(name)
                problems[name] = ThreadsStore.failureWords(error)
                requestRefresh()
            }
        }
    }

    /// Reads the hub every two seconds while the sign-in is under way, until the row moves on.
    private func watch(_ name: String) {
        watching?.cancel()
        watching = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard let self else { return }
                await store.read()
                let row = store.rows?.first { $0.name == name }
                if row?.reason != Words.Connections.saidUnderWay {
                    signing.remove(name)
                    session?.cancel()
                    session = nil
                    requestRefresh()
                    return
                }
            }
        }
    }

    /// The browser closed before the hub moved the row on: it did not finish.
    private func browserClosed(_ name: String) {
        session = nil
        guard signing.contains(name) else { return }
        Task { @MainActor [weak self] in
            // The hand-back answers the hub as the browser closes: a beat for its word.
            try? await Task.sleep(for: .seconds(2))
            guard let self, signing.contains(name) else { return }
            await store.read()
            guard store.rows?.first(where: { $0.name == name })?.reason == Words.Connections.saidUnderWay else { return }
            watching?.cancel()
            signing.remove(name)
            problems[name] = Words.Connections.signInClosed
            requestRefresh()
        }
    }

    private func toggle(_ name: String, project: String) {
        guard let row = store.rows?.first(where: { $0.name == name }) else { return }
        let next = row.projects.contains(project) ? row.projects.filter { $0 != project } : row.projects + [project]
        problems[name] = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await store.setProjects(name, projects: next)
            } catch {
                problems[name] = ThreadsStore.failureWords(error)
            }
            requestRefresh()
        }
    }

    /// Remove: at once, with Undo in its toast; the hub puts it back whole, key and projects with it.
    private func remove(_ row: ConnectionView) {
        removing = row.name
        problems[row.name] = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await store.remove(row.name)
                ConfigUndo.offer(Words.Configure.removed(what: label(row)), mark: row.name, deleted: deleted, hub: hub, in: view) { [store] in
                    await store.read()
                }
            } catch {
                problems[row.name] = ThreadsStore.failureWords(error)
            }
            removing = nil
            await store.read()
        }
    }

    nonisolated func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { view.window ?? ASPresentationAnchor() }
    }
}

/// A service to sign in to, as a starter card (StarterCards.svelte's recipe):
/// raised, the tile shadow, its mark and "Sign in to …", `cStarterH` tall.
private final class ServiceCard: UIControl {
    init(_ service: Words.Connections.Service) {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile
        let mark = UIImageView(image: BrandLogo.provider(service.service)?.image)
        mark.contentMode = .scaleAspectFit
        let words = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        words.text = Words.Connections.signInService(service: service.label)
        let row = UIStackView(arrangedSubviews: [mark, words, UIView()])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: Size.iconMd),
            mark.heightAnchor.constraint(equalToConstant: Size.iconMd),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cStarterH),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = words.text
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in self?.backgroundColor = Palette.surfaceHover }, for: .touchDown)
        addAction(UIAction { [weak self] _ in self?.backgroundColor = Palette.surfaceRaised }, for: [.touchUpInside, .touchUpOutside, .touchCancel])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ServiceCard is built in code")
    }
}

/// Sign in to a service (`.add`): its mark and name, which account, its
/// key for a service that takes one, the hub's refusal, then Cancel and
/// Sign in; on the recess, `space-4` in.
private final class ConnectionForm: UIView {
    var onCancel: () -> Void = {}
    var onSubmit: (Words.Connections.Service, Words.Connections.Way, String, String) -> Void = { _, _, _, _ in }
    var pending = false { didSet { draw() } }
    var problem: String? { didSet { draw() } }

    private var service: Words.Connections.Service?
    /// The way the hub signs in to it, as picked.
    private var way: Words.Connections.Way?
    private let mark = UIImageView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let account = KitField(placeholder: Words.Connections.accountPlaceholder)
    private var accountField: ConfigField!
    private let key = KitField()
    private var keyField: ConfigField!
    private let refusal = metaLine(ink: Palette.statusFailInk)
    private var submit: UIButton!

    init() {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        mark.contentMode = .scaleAspectFit
        let head = UIStackView(arrangedSubviews: [mark, title, UIView()])
        head.spacing = Space.space2
        head.alignment = .center
        accountField = ConfigField(label: "", control: account)
        accountField.say(hint: Words.Connections.accountHint)
        key.isSecureTextEntry = true
        keyField = ConfigField(label: "", control: key)
        let cancel = KitButton.make(Words.Connections.cancel, variant: .ghost, height: .sm) { [weak self] in self?.onCancel() }
        submit = KitButton.make(Words.Connections.signIn, variant: .action, height: .sm) { [weak self] in self?.send() }
        let buttons = UIStackView(arrangedSubviews: [UIView(), cancel, submit])
        buttons.spacing = Space.space2
        let column = UIStackView(arrangedSubviews: [head, accountField, keyField, refusal, buttons])
        column.axis = .vertical
        column.spacing = Space.space3
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: Size.iconMd),
            mark.heightAnchor.constraint(equalToConstant: Size.iconMd),
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space4),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space4),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space4),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space4),
        ])
        account.addAction(UIAction { [weak self] _ in self?.draw() }, for: .editingChanged)
        key.addAction(UIAction { [weak self] _ in self?.draw() }, for: .editingChanged)
        accessibilityContainerType = .semanticGroup
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConnectionForm is built in code")
    }

    func open(_ next: Words.Connections.Service) {
        service = next
        account.text = ""
        key.text = ""
        problem = nil
        mark.image = BrandLogo.provider(next.service)?.image
        title.text = Words.Connections.signInService(service: next.label)
        accessibilityLabel = title.text
        accountField.setLabel(Words.Connections.account(service: next.label))
        keyField.setLabel(Words.Connections.key(service: next.label))
        way = Self.firstWay(next)
        keyField.say(hint: way?.key)
        keyField.isHidden = way?.auth != "bearer"
        fold(self, open: true)
        draw()
        // A field that opens on a press takes the next keystroke.
        DispatchQueue.main.async { self.account.becomeFirstResponder() }
    }

    /// The first of a service's ways the form signs in with: a key or the service's own page.
    static func firstWay(_ service: Words.Connections.Service) -> Words.Connections.Way? {
        service.ways.first { $0.auth != "app" }
    }

    func close() {
        service = nil
        key.text = ""
        endEditing(true)
        fold(self, open: false)
    }

    private var filled: Bool {
        guard let service else { return false }
        let named = !(account.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        return way?.auth == "bearer" ? named && !(key.text ?? "").isEmpty : named
    }

    private func send() {
        guard let service, let way, filled, !pending else { return }
        onSubmit(service, way, account.text ?? "", key.text ?? "")
    }

    private func draw() {
        refusal.text = problem
        refusal.isHidden = problem == nil
        KitButton.setTitle(pending ? Words.Connections.signingIn : Words.Connections.signIn, of: submit, variant: .action, height: .sm)
        submit.configuration?.showsActivityIndicator = pending
        submit.isEnabled = filled && !pending
    }
}

/// A row's key, asked under it (`.row-ask`): the secure field, Save key, Cancel.
private final class KeyAsk: UIStackView {
    var onSave: (String) -> Void = { _ in }
    var onCancel: () -> Void = {}
    var pending = false { didSet { draw() } }
    private let field = KitField()
    private var save: UIButton!

    init(label: String) {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        field.isSecureTextEntry = true
        field.accessibilityLabel = label
        field.widthAnchor.constraint(lessThanOrEqualToConstant: 384).isActive = true
        save = KitButton.make(Words.Connections.saveKey, variant: .action, height: .xs) { [weak self] in
            guard let self, !(field.text ?? "").isEmpty else { return }
            onSave(field.text ?? "")
        }
        let cancel = KitButton.make(Words.Connections.cancel, variant: .ghost, height: .xs) { [weak self] in self?.onCancel() }
        for part in [save!, cancel] { part.setContentHuggingPriority(.required, for: .horizontal) }
        addArrangedSubview(field)
        addArrangedSubview(save)
        addArrangedSubview(cancel)
        // The field at most 384pt; the row's room past Cancel stays empty.
        let rest = UIView()
        // The field grows first (250), the rest only past its cap.
        rest.setContentHuggingPriority(.defaultLow + 1, for: .horizontal)
        addArrangedSubview(rest)
        draw()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KeyAsk is built in code")
    }

    func focus() {
        guard !field.isFirstResponder else { return }
        field.becomeFirstResponder()
    }

    private func draw() {
        KitButton.setTitle(pending ? Words.Connections.saving : Words.Connections.saveKey, of: save, variant: .action, height: .xs)
        save.configuration?.showsActivityIndicator = pending
        save.isEnabled = !pending
    }
}
