import AuthenticationServices
import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Connections (routes/config/connections/+page.svelte): one row
/// per signed-in outside service, led by the service's mark, with the
/// account it signs in as and its state (both the hub's word), and which
/// projects may use it. Signing in to a service picks one of its ways (core
/// `CONNECTION_SERVICES`): a key, an app's registration (a GitHub App's ids
/// and private key, a Linear app's client), or the service's own sign-in. A
/// row that is not signed in carries its way in: Set app (its registration
/// under the row), Sign in (OAuth, or a Linear app once set, in the
/// platform's sign-in browser, the row turning signed in when the hub says
/// so) or Set key (a field under the row, emptied the moment the hub has the
/// key). Its ⋯ holds Projects…, a checklist that
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
    /// The row whose app's registration is open under it.
    private var appFor: String?
    private var appForms: [String: RowAppForm] = [:]
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
        form.onSubmit = { [weak self] sent in self?.add(sent) }
        setContent([form, empty, list])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await store.read() }
        // Where a Linear app's sign-in comes back: its settings must list it.
        Task { [weak self] in
            guard let self, let url = try? await store.callbackURL() else { return }
            form.setCallback(url)
            callback = url
        }
    }

    /// Where a Linear app's sign-in comes back, once the hub has said its dashboard's address.
    private var callback = ""

    /// A Linear app whose client is not set yet (`needsApp`).
    private func needsApp(_ row: ConnectionView) -> Bool {
        row.auth == .app && row.app == nil && row.service.lowercased() != "github"
    }

    /// A row that signs in through a page: OAuth, a Linear app once set, or a
    /// GitHub App, whose sign-in registers and installs it (`signsIn`).
    private func signsIn(_ row: ConnectionView) -> Bool {
        row.auth == .oauth || (row.auth == .app && (row.service.lowercased() == "github" || row.app?.value2 != nil))
    }

    /// A way that signs in through a page, in the sign-in browser: OAuth, a
    /// Linear app's, or a GitHub App's registration (`signsInByPage`).
    private static func signsInByPage(_ service: String, _ way: Words.Connections.Way) -> Bool {
        way.auth == "oauth" || way.auth == "app"
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
        // An app's ⋯ also sets its app (`Set app…`).
        let setApp = row.auth == .app && row.service.lowercased() != "github" ? [RowAction(label: Words.Connections.setApp, glyph: .toolMcp) { [weak self] in self?.openApp(name) }] : []
        view.show(name: service, meta: row.account, mark: mark,
                  actions: setApp + [RowAction(label: Words.Connections.remove, glyph: .trash, destructive: true, disabled: removing == name) { [weak self] in
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
        if row.state != .signedIn, needsApp(row), appFor != name {
            trailing.append(KitButton.make(Words.Connections.setAppNow, variant: .outline, height: .sm) { [weak self] in self?.openApp(name) })
        } else if row.state != .signedIn, signsIn(row) {
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

        if appFor == name {
            let ask = appForms[name] ?? RowAppForm(service: row.service.lowercased(), label: service)
            appForms[name] = ask
            ask.fields.setCallback(callback)
            ask.onSave = { [weak self] app in self?.saveApp(row, app) }
            ask.onCancel = { [weak self] in
                self?.appFor = nil
                self?.appForms[name] = nil
                self?.requestRefresh()
            }
            view.setBelow([ask])
        } else if keying == name {
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
            appForms[name] = nil
            view.setBelow([])
        }
    }

    /// The line under a row: its sign-in under way, its last failure, or the hub's reason.
    private func note(_ row: ConnectionView) -> RowNote? {
        if signing.contains(row.name) { return RowNote(text: Words.Connections.signingInTab(service: label(row)), tone: .busy) }
        if let problem = problems[row.name] { return RowNote(text: problem, tone: .fail) }
        let saidByButton = [Words.Connections.saidSignIn, Words.Connections.saidSetKey, Words.Connections.saidSetApp, Words.Connections.saidUnderWay]
        if row.state != .signedIn, let reason = row.reason, !saidByButton.contains(reason) { return RowNote(text: reason, tone: .fail) }
        return nil
    }

    #if DEBUG
    /// A service signed in to through the form, as a person fills and sends it.
    func probeAdd(service name: String, account: String, key: String) {
        guard let service = Words.Connections.services.first(where: { $0.service == name }),
              let way = service.ways.first(where: { $0.auth == "bearer" }) else { return }
        startAdding(service)
        form.probePick(way.label)
        form.probeFill(account: account, key: key)
        form.probeSend()
    }

    /// The form opened on a service, as its Server address field then reads: shown or not, its words, its problem.
    func probeOpenAddress(service name: String) -> ConnectionAddressRead? {
        guard let service = Words.Connections.services.first(where: { $0.service == name }) else { return nil }
        startAdding(service)
        form.layoutIfNeeded()
        return form.probeAddress
    }

    /// The open form filled with `address`, its account and key, then Sign in pressed.
    func probeSendAddress(_ address: String, account: String, key: String) -> ConnectionAddressRead {
        form.probeFill(address: address)
        form.probeFill(account: account, key: key)
        form.probeSend()
        form.layoutIfNeeded()
        return form.probeAddress
    }

    func probeFill(address typed: String) { form.probeFill(address: typed) }
    var probeAddressRead: ConnectionAddressRead { form.probeAddress }

    /// The form opened on a service with one of its ways picked, as it then reads.
    func probeOpen(service name: String, way label: String) -> String {
        guard let service = Words.Connections.services.first(where: { $0.service == name }) else { return "no service" }
        startAdding(service)
        form.probePick(label)
        form.layoutIfNeeded()
        return AccountsProbe.texts(in: form).joined(separator: " | ")
    }

    func probeCloseForm() { form.close() }

    var probeAdding: Bool { form.pending }
    func probeRow(_ name: String) -> ConnectionView? { store.rows?.first { $0.name == name } }
    func probeToggle(_ name: String, project: String) { toggle(name, project: project) }
    #endif

    // MARK: Acting

    private func startAdding(_ service: Words.Connections.Service) {
        form.open(service)
    }

    /// The account's words, then its way in: the row exists once the hub has it, and what follows is said on it.
    private func add(_ sent: ConnectionForm.Sent) {
        let (service, way, key, app) = (sent.service, sent.way, sent.key, sent.app)
        form.pending = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            let name: String
            do {
                name = try await store.create(service, way: way, account: sent.account, url: sent.url)
            } catch {
                form.pending = false
                form.problem = ThreadsStore.failureWords(error)
                return
            }
            form.pending = false
            form.close()
            // What follows the row's making: its key or its app, said on the row when refused.
            var ready = true
            do {
                if way.auth == "bearer" { try await store.setKey(name, key: key) }
                if way.auth == "app", let app { try await store.setApp(name, app) }
            } catch {
                problems[name] = ThreadsStore.failureWords(error)
                ready = false
            }
            if ready, Self.signsInByPage(service.service, way), let row = store.rows?.first(where: { $0.name == name }) {
                signIn(row)
                return
            }
            requestRefresh()
        }
    }

    private func openApp(_ name: String) {
        appFor = name
        appForms[name] = nil
        requestRefresh()
    }

    /// The row's app set; a Linear app then signs in, through Linear's own page.
    private func saveApp(_ row: ConnectionView, _ app: FleetConnections.AppRegistration) {
        let name = row.name
        problems[name] = nil
        appForms[name]?.pending = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await store.setApp(name, app)
                appFor = nil
                appForms[name] = nil
            } catch {
                appForms[name]?.pending = false
                problems[name] = ThreadsStore.failureWords(error)
                requestRefresh()
                return
            }
            if case .linear = app, let next = store.rows?.first(where: { $0.name == name }) {
                signIn(next)
                return
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

#if DEBUG
/// The Server address field as the probe reads it.
struct ConnectionAddressRead {
    var shown: Bool
    var value: String
    var placeholder: String
    var problem: String?
    /// In the form's space: the form, the address input, the line under it, the account input.
    var form: CGRect
    var field: CGRect
    var line: CGRect?
    var account: CGRect
    /// The form's frame in its superview, and that superview's width.
    var inParent: CGRect
    var parentWidth: CGFloat

    var said: String {
        func box(_ rect: CGRect?) -> String {
            guard let rect else { return "none" }
            return "[\(Int(rect.minX)),\(Int(rect.minY)) \(Int(rect.width))×\(Int(rect.height))]"
        }
        return "shown \(shown) | value '\(value)' | placeholder '\(placeholder)' | problem '\(problem ?? "")' | form \(box(form)) in parent \(box(inParent)) of \(Int(parentWidth)) | field \(box(field)) | line \(box(line)) | account \(box(account))"
    }
}
#endif

/// Sign in to a service (`.add`): its mark and name, its server's address
/// for a service the person runs one of, which account, its key for a
/// service that takes one, the hub's refusal, then Cancel and Sign in; on
/// the recess, `space-4` in.
private final class ConnectionForm: UIView {
    /// What Sign in sends: the service, its way, the account's words, its key or app, and the address it is at.
    struct Sent {
        let service: Words.Connections.Service
        let way: Words.Connections.Way
        let account: String
        let key: String
        let app: FleetConnections.AppRegistration?
        let url: String?
    }

    var onCancel: () -> Void = {}
    var onSubmit: (Sent) -> Void = { _ in }
    var pending = false { didSet { draw() } }
    var problem: String? { didSet { draw() } }

    private var service: Words.Connections.Service?
    /// The way the hub signs in to it, as picked.
    private var way: Words.Connections.Way?
    private let mark = UIImageView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    /// The server's address, for a service the person runs one of (core `serverExample`).
    private let address = KitField()
    private var addressField: ConfigField!
    private var addressProblem: String? { didSet { addressField.say(problem: addressProblem) } }
    private let account = KitField(placeholder: Words.Connections.accountPlaceholder)
    private var accountField: ConfigField!
    private let key = KitField()
    private var keyField: ConfigField!
    private let refusal = metaLine(ink: Palette.statusFailInk)
    private var submit: UIButton!
    /// "Signs in with": the service's ways, when it has more than one, and what the picked one is for.
    private let wayChoice = ChoiceField(label: Words.Connections.signsInWith)
    private var wayField: ConfigField!
    private let waySays = metaLine()
    private let app = AppFields()

    init() {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        mark.contentMode = .scaleAspectFit
        let head = UIStackView(arrangedSubviews: [mark, title, UIView()])
        head.spacing = Space.space2
        head.alignment = .center
        address.keyboardType = .URL
        address.textContentType = .URL
        address.accessibilityIdentifier = "connection-server"
        addressField = ConfigField(label: Words.Connections.serverAddress, control: address)
        accountField = ConfigField(label: "", control: account)
        accountField.say(hint: Words.Connections.accountHint)
        key.isSecureTextEntry = true
        keyField = ConfigField(label: "", control: key)
        wayField = ConfigField(label: Words.Connections.signsInWith, control: wayChoice)
        wayChoice.onChange = { [weak self] label in self?.pick(label) }
        app.onChange = { [weak self] in self?.draw() }
        let cancel = KitButton.make(Words.Connections.cancel, variant: .ghost, height: .sm) { [weak self] in self?.onCancel() }
        submit = KitButton.make(Words.Connections.signIn, variant: .action, height: .sm) { [weak self] in self?.send() }
        let buttons = UIStackView(arrangedSubviews: [UIView(), cancel, submit])
        buttons.spacing = Space.space2
        let column = UIStackView(arrangedSubviews: [head, wayField, waySays, addressField, accountField, keyField, app, refusal, buttons])
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
        // A refused address is said until it is typed again.
        address.addAction(UIAction { [weak self] _ in self?.addressProblem = nil }, for: .editingChanged)
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
        // Its server's address: GitLab's hosted one to start, Gitea's the person's own.
        addressField.isHidden = next.serverExample == nil
        address.setPlaceholder(next.serverExample ?? "")
        address.text = next.url ?? ""
        addressProblem = nil
        let ways = Self.waysHere(next)
        way = ways.first
        wayField.isHidden = ways.count <= 1
        waySays.isHidden = ways.count <= 1
        wayChoice.set(ways.map { ($0.label, $0.label) }, value: way?.label ?? "")
        app.show(service: next.service)
        drawWay()
        fold(self, open: true)
        draw()
        // A field that opens on a press takes the next keystroke.
        DispatchQueue.main.async { self.account.becomeFirstResponder() }
    }

    /// The ways this form offers: GitHub's gh on a machine and its code
    /// sign-in are the web's alone for now, so the app offers the rest.
    private static func waysHere(_ service: Words.Connections.Service) -> [Words.Connections.Way] {
        service.ways.filter { $0.auth != "gh" && $0.auth != "device" }
    }

    #if DEBUG
    func probePick(_ label: String) {
        guard let service else { return }
        let ways = Self.waysHere(service)
        guard let at = ways.firstIndex(where: { $0.label == label }) else { return }
        wayChoice.set(ways.map { ($0.label, $0.label) }, value: ways[at].label)
        pick(label)
    }

    func probeFill(account words: String, key typed: String) {
        account.text = words
        key.text = typed
        draw()
    }

    func probeFill(address typed: String) {
        address.text = typed
        address.sendActions(for: .editingChanged)
    }

    func probeSend() { send() }

    var probeAddress: ConnectionAddressRead {
        layoutIfNeeded()
        // The field's line under its input: the third of its parts, label, control, line.
        let line = addressField.arrangedSubviews.last.flatMap { $0.isHidden ? nil : $0.convert($0.bounds, to: self) }
        return ConnectionAddressRead(
            shown: !addressField.isHidden, value: address.text ?? "",
            placeholder: address.attributedPlaceholder?.string ?? "", problem: addressProblem,
            form: bounds, field: address.convert(address.bounds, to: self), line: line,
            account: account.convert(account.bounds, to: self),
            inParent: frame, parentWidth: superview?.bounds.width ?? 0)
    }
    #endif

    /// A way picked by its label.
    private func pick(_ label: String) {
        guard let next = service?.ways.first(where: { $0.label == label }) else { return }
        way = next
        drawWay()
    }

    /// What the picked way asks for: a key, an app's registration, or nothing (the service's own page).
    private func drawWay() {
        waySays.text = way?.says
        keyField.say(hint: way?.key)
        keyField.isHidden = way?.auth != "bearer"
        // A GitHub App takes nothing here: its sign-in registers it.
        app.isHidden = way?.auth != "app" || service?.service == "github"
        draw()
    }

    /// Where a Linear app's sign-in comes back, said over its fields.
    func setCallback(_ url: String) {
        app.setCallback(url)
    }

    func close() {
        service = nil
        key.text = ""
        app.clear()
        endEditing(true)
        fold(self, open: false)
    }

    private var filled: Bool {
        guard let service else { return false }
        let named = !(account.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        return switch way?.auth {
        case "bearer": named && !(key.text ?? "").isEmpty
        case "app": named && (service.service == "github" || app.registration != nil)
        default: named
        }
    }

    private func send() {
        guard let service, let way, filled, !pending else { return }
        // An address the hub can't take is refused under its field, and nothing is sent.
        var url = service.url
        if service.serverExample != nil {
            url = FleetConnections.serverURL(address.text ?? "")
            guard url != nil else {
                addressProblem = Words.Connections.serverAddressProblem
                return
            }
        }
        onSubmit(Sent(service: service, way: way, account: account.text ?? "", key: key.text ?? "",
                      app: way.auth == "app" && service.service != "github" ? app.registration : nil, url: url))
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

/// A secret typed in the kit's field with its eye (`secret`): shown in the
/// clear while the eye is pressed open, named for what it shows or hides.
private final class SecretField: UIStackView {
    var onChange: () -> Void = {}
    let field = KitField(mono: true)
    private let eye: KitGhostButton
    private let what: String

    var text: String {
        get { field.text ?? "" }
        set { field.text = newValue }
    }

    init(label: String) {
        what = label.lowercased()
        eye = KitGhostButton(.eye, label: Words.Connections.showSecret(what: label.lowercased()))
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        field.isSecureTextEntry = true
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.accessibilityLabel = label
        field.addAction(UIAction { [weak self] _ in self?.onChange() }, for: .editingChanged)
        eye.addAction(UIAction { [weak self] _ in self?.toggle() }, for: .primaryActionTriggered)
        eye.accessibilityTraits.insert(.button)
        addArrangedSubview(field)
        addArrangedSubview(eye)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SecretField is built in code")
    }

    private func toggle() {
        field.isSecureTextEntry.toggle()
        let shown = !field.isSecureTextEntry
        eye.configuration?.image = (shown ? Glyph.eyeClosed : Glyph.eye).image.resized(to: Size.iconMd)
        eye.accessibilityLabel = shown ? Words.Connections.hideSecret(what: what) : Words.Connections.showSecret(what: what)
        eye.accessibilityValue = shown ? Words.Connections.hideSecret(what: what) : nil
    }

    func clear() {
        field.text = ""
        if !field.isSecureTextEntry { toggle() }
    }
}

/// A Linear app's registration (`appFields`): the callback URL its settings
/// must list, then its client ID and client secret. The hub keeps the secret sealed.
private final class AppFields: UIStackView {
    var onChange: () -> Void = {}
    private(set) var service = ""
    private let callback = KitLabel(TypeScale.typeCode.with(points: TypeScale.textMeta), ink: Palette.inkStrong, lines: 0)
    private let clientId = KitField(mono: true)
    private let clientSecret = SecretField(label: Words.Connections.clientSecret)

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        clientId.autocorrectionType = .no
        clientId.autocapitalizationType = .none
        clientId.addAction(UIAction { [weak self] _ in self?.onChange() }, for: .editingChanged)
        clientSecret.onChange = { [weak self] in self?.onChange() }
        callback.lineBreakMode = .byCharWrapping
        let callbackLine = UIStackView(arrangedSubviews: [metaLine(Words.Connections.callbackLine), callback])
        callbackLine.axis = .vertical
        callbackLine.spacing = Space.space1
        let clientIdField = ConfigField(label: Words.Connections.clientId, control: clientId)
        clientIdField.say(hint: Words.Connections.clientIdHint)
        let secretField = ConfigField(label: Words.Connections.clientSecret, control: clientSecret)
        secretField.say(hint: Words.Connections.clientSecretHint)
        [callbackLine, clientIdField, secretField].forEach(addArrangedSubview)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("AppFields is built in code")
    }

    /// The fields of `service`'s app, empty.
    func show(service next: String) {
        service = next
        clear()
    }

    /// Where a Linear app's sign-in comes back, as the hub's dashboard names it.
    func setCallback(_ url: String) {
        callback.text = url
    }

    /// What was typed, once every field holds something.
    var registration: FleetConnections.AppRegistration? {
        let client = (clientId.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let secret = clientSecret.text
        return client.isEmpty || secret.isEmpty ? nil : .linear(clientId: client, clientSecret: secret)
    }

    func clear() {
        clientId.text = ""
        clientSecret.clear()
    }
}

/// A row's app, set under it (`.row-app`): its registration's fields, then
/// Cancel and Save app; a Linear app signs in once it is set.
private final class RowAppForm: UIStackView {
    var onSave: (FleetConnections.AppRegistration) -> Void = { _ in }
    var onCancel: () -> Void = {}
    var pending = false { didSet { draw() } }
    let fields = AppFields()
    private var save: UIButton!

    init(service: String, label: String) {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        accessibilityLabel = Words.Connections.appOf(row: label)
        accessibilityContainerType = .semanticGroup
        fields.show(service: service)
        fields.onChange = { [weak self] in self?.draw() }
        let cancel = KitButton.make(Words.Connections.cancel, variant: .ghost, height: .xs) { [weak self] in self?.onCancel() }
        save = KitButton.make(Words.Connections.saveApp, variant: .action, height: .xs) { [weak self] in
            guard let self, let app = fields.registration, !pending else { return }
            onSave(app)
        }
        let buttons = UIStackView(arrangedSubviews: [UIView(), cancel, save])
        buttons.spacing = Space.space2
        addArrangedSubview(fields)
        addArrangedSubview(buttons)
        draw()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("RowAppForm is built in code")
    }

    private func draw() {
        KitButton.setTitle(pending ? Words.Connections.saving : Words.Connections.saveApp, of: save, variant: .action, height: .xs)
        save.configuration?.showsActivityIndicator = pending
        save.isEnabled = fields.registration != nil && !pending
    }
}
