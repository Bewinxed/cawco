import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

// Connect a machine (AddMachineDialog.svelte, join/join.svelte.ts): two ways
// in, one install. SSH has the hub run its install script on the machine
// and follows it step by step; Command hands over the same script as a
// one-liner and waits for the machine to check in.

typealias SshJoinJob = Components.Schemas.SshJoinJob

/// The SSH add in flight, or the last one, and the hub's join facts. Held
/// here rather than in the dialog so closing it mid-install and opening it
/// again finds the same run: the hub keeps installing either way.
@MainActor
@Observable
final class JoinState {
    static let shared = JoinState()

    private(set) var info: Components.Schemas.JoinInfo?
    private(set) var infoError: String?
    private(set) var job: SshJoinJob?
    /// Why the hub refused to start one (a bad target, an unlisted address).
    private(set) var refused: String?

    /// The one-liner a machine runs to join: the hub's install script, piped to sh.
    static func installCommand(_ hubUrl: String) -> String { "curl -fsSL \(hubUrl)/install.sh | sh" }

    /// The hub's addresses (Tailscale first), its SSH key and its name, read
    /// again every time a join surface opens.
    func refresh(_ hub: HubConnection) async {
        do {
            let response = try await hub.api.machines.join()
            switch response {
            case let .ok(ok):
                info = try ok.body.json
                infoError = nil
            case let .undocumented(status, _):
                infoError = "The hub answered \(status) when asked for its addresses. Reopen this to try again."
            }
        } catch {
            infoError = "The hub did not answer when asked for its addresses. Check that it is running, then reopen this."
        }
    }

    func start(_ hub: HubConnection, target: String, port: Int?, hubUrl: String) async {
        refused = nil
        do {
            let response = try await hub.api.machines.connectSSH(.init(body: .json(.init(target: target, port: port, hubUrl: hubUrl))))
            switch response {
            case let .ok(ok):
                job = try ok.body.json
            case let .unprocessableContent(refusal):
                refused = (try? await Self.text(refusal.body)) ?? "The hub answered 422."
            case let .undocumented(status, payload):
                var said: String?
                if let body = payload.body { said = try? await String(collecting: body, upTo: 64 * 1024) }
                refused = (said?.isEmpty == false ? said : nil) ?? "The hub answered \(status)."
            }
        } catch {
            refused = "The hub did not answer, so nothing was started. Check that it is running, then try again."
        }
    }

    private static func text(_ body: Operations.PostApiMachinesSsh.Output.UnprocessableContent.Body) async throws -> String {
        switch body {
        case let .plainText(text): try await String(collecting: text, upTo: 64 * 1024)
        case let .applicationProblemJson(problem): problem.detail ?? problem.title.rawValue
        }
    }

    /// One read of the run in flight; the dialog calls it every second while it is open.
    func poll(_ hub: HubConnection) async {
        guard let current = job, current.state == .running else { return }
        let response = try? await hub.api.machines.sshStatus(.init(path: .init(id: current.id)))
        guard job?.id == current.id else { return }
        switch response {
        case let .ok(ok):
            if let next = try? ok.body.json { job = next }
        case .notFound:
            // The hub restarted and its in-memory runs went with it.
            var lost = current
            lost.state = .failed
            lost.problem = nil
            job = lost
            refused = "The hub restarted during the install and lost track of it. If the machine shows up in the fleet, it joined; if not, Retry."
        default:
            break
        }
    }

    /// Back to the form: a finished run is dropped, a running one cannot be.
    func reset() {
        if job?.state != .running { job = nil }
        refused = nil
    }
}

/// Connect a machine: the one dialog every "add a machine" entry opens.
final class AddMachineController: KitDialogController {
    private let hub: HubConnection
    private let join = JoinState.shared
    private let tabs = SegmentedTabs([.init("SSH", glyph: .server), .init("Command", glyph: .terminal)])
    private let infoAlert = KitAlert(tone: .destructive)
    private let pane = CrossView()
    private let footer = UIStackView()
    /// The fleet as it was when the dialog opened: a machine not in it that comes online has joined.
    private let known: Set<String>
    private var hubUrl = ""
    private var view_: String = ""
    private var poller: Task<Void, Never>?
    private var watching = false

    // The SSH form, kept across redraws so what was typed stays.
    private let target = KitField(placeholder: "user@host, or a Host from ~/.ssh/config")
    private let port = KitField(placeholder: "22")
    private var keyOpen = false
    private var starting = false

    init(hub: HubConnection) {
        self.hub = hub
        known = Set(hub.fleet.machines.map(\.machineId))
        super.init(width: .lg)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AddMachineController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        body.addArrangedSubview(KitDialogController.header(title: "Connect a machine", description: "Install the CawCo agent on a machine and it joins this fleet."))
        tabs.accessibilityLabel = "How to connect the machine"
        tabs.addAction(UIAction { [weak self] _ in self?.render() }, for: .valueChanged)
        let tabRow = UIStackView(arrangedSubviews: [tabs, UIView()])
        body.addArrangedSubview(tabRow)
        infoAlert.isHidden = true
        body.addArrangedSubview(infoAlert)
        body.addArrangedSubview(pane)
        body.addArrangedSubview(footer)
        footer.spacing = Space.space2
        target.autocapitalizationType = .none
        target.accessibilityLabel = "SSH target"
        target.addAction(UIAction { [weak self] _ in self?.paintFooter() }, for: .editingChanged)
        port.keyboardType = .numberPad
        port.accessibilityLabel = "Port"
        port.addAction(UIAction { [weak self] _ in self?.paintFooter() }, for: .editingChanged)
        Task { @MainActor [weak self] in
            guard let self else { return }
            await join.refresh(hub)
            follow()
        }
        follow()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        poller?.cancel()
    }

    private func follow() {
        withObservationTracking {
            observe()
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    /// What the dialog draws from: the join facts, the run, the fleet.
    private func observe() {
        let addresses = join.info?.addresses ?? []
        if !addresses.contains(where: { $0.url == hubUrl }) { hubUrl = addresses.first?.url ?? "" }
        _ = hub.fleet.machines
        infoAlert.label.text = join.infoError
        infoAlert.isHidden = join.infoError == nil
        if join.job?.problem?.value1 != nil { keyOpen = true }
        render()
        // Once a second while the install is still going.
        if join.job?.state == .running, poller == nil {
            poller = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    guard let self else { return }
                    await join.poll(hub)
                    if join.job?.state != .running { break }
                }
                self?.poller = nil
            }
        }
    }

    /// The SSH form shows while nothing runs, and again after a failure so it can be fixed.
    private var sshView: String {
        switch join.job?.state {
        case .running: "running"
        case .done: "done"
        default: "form"
        }
    }

    private func render() {
        let key = tabs.selectedIndex == 0 ? "ssh:\(sshView):\(join.job?.lines.count ?? 0):\(join.job?.problem != nil):\(join.refused ?? ""):\(keyOpen):\(hubUrl)"
            : "command:\(hubUrl):\(joined?.machineId ?? "")"
        guard key != view_ else { return paintFooter() }
        let swapsView = key.split(separator: ":").prefix(2) != view_.split(separator: ":").prefix(2)
        view_ = key
        let next = tabs.selectedIndex == 0 ? sshPane() : commandPane()
        morph {
            if swapsView { pane.show(next) } else { pane.show(next) }
        }
        paintFooter()
    }

    // MARK: SSH

    private func sshPane() -> UIView {
        switch sshView {
        case "running":
            return runningView()
        case "done":
            let mark = GlyphView(.passed, size: 20, tint: Palette.statusDoneInk)
            let said = KitLabel(TypeScale.typeBody, ink: Palette.statusDoneInk, lines: 0)
            said.text = "\(joinedName(join.job?.machineId)) joined the fleet."
            let row = UIStackView(arrangedSubviews: [mark, said])
            row.spacing = 10
            row.alignment = .center
            row.isLayoutMarginsRelativeArrangement = true
            row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12)
            row.backgroundColor = Palette.statusDoneBg
            row.layer.cornerRadius = Radius.radiusMd
            return row
        default:
            return sshForm()
        }
    }

    private func field(_ title: String, _ control: UIView) -> UIStackView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = title
        let column = UIStackView(arrangedSubviews: [label, control])
        column.axis = .vertical
        column.spacing = 6
        return column
    }

    /// The address the machine is told to reach this hub on, the same choice on both tabs.
    private func addressField() -> UIView {
        let select = KitSelect()
        let addresses = join.info?.addresses ?? []
        let chosen = addresses.first { $0.url == hubUrl }
        select.setValue(chosen.map { "\($0.label) · \($0.url)" } ?? "")
        select.isEnabled = !addresses.isEmpty
        select.menu = UIMenu(options: .singleSelection, children: addresses.map { address in
            UIAction(title: "\(address.label) · \(address.url)", state: address.url == hubUrl ? .on : .off) { [weak self] _ in
                self?.hubUrl = address.url
                self?.view_ = ""
                self?.render()
            }
        })
        select.accessibilityLabel = "Hub address this machine should use"
        let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle, lines: 0)
        hint.text = "The machine downloads the install script from here, so it has to be able to reach it."
        let column = field("Hub address this machine should use", select)
        column.addArrangedSubview(hint)
        return column
    }

    private func sshForm() -> UIView {
        let portColumn = field("Port", port)
        portColumn.widthAnchor.constraint(equalToConstant: 96).isActive = true
        let first = UIStackView(arrangedSubviews: [field("SSH target", target), portColumn])
        first.spacing = Space.space3
        let form = UIStackView(arrangedSubviews: [first, addressField()])
        form.axis = .vertical
        form.spacing = Space.space4
        if let failure = failure() {
            let column = UIStackView(arrangedSubviews: [KitAlert(failure.text, tone: .destructive, glyph: .failed)])
            column.axis = .vertical
            column.spacing = Space.space2
            if !failure.tail.isEmpty { column.addArrangedSubview(outputBox(failure.tail.joined(separator: "\n"), max: 192)) }
            form.addArrangedSubview(column)
        } else if let refused = join.refused {
            form.addArrangedSubview(KitAlert(refused, tone: .destructive, glyph: .failed))
        }
        form.addArrangedSubview(keyDisclosure())
        return form
    }

    /// "This hub's SSH key": what the machine has to accept, in a copy box.
    private func keyDisclosure() -> UIView {
        let toggle = disclosureButton("This hub's SSH key", open: keyOpen) { [weak self] in
            guard let self else { return }
            keyOpen.toggle()
            view_ = ""
            render()
        }
        let column = UIStackView(arrangedSubviews: [toggle])
        column.axis = .vertical
        column.spacing = Space.space2
        column.alignment = .leading
        if keyOpen, let info = join.info {
            let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle, lines: 0)
            if let key = info.sshPublicKey {
                hint.text = "The machine has to accept this key: it goes in ~/.ssh/authorized_keys for the user you sign in as."
                let box = CopyBox(text: key, label: "This hub's SSH public key")
                column.addArrangedSubview(hint)
                column.addArrangedSubview(box)
                box.widthAnchor.constraint(equalTo: column.widthAnchor).isActive = true
            } else {
                hint.text = "This hub has no SSH key yet. Create one on \(info.hubHostname) with ssh-keygen -t ed25519, then reopen this."
                column.addArrangedSubview(hint)
            }
        }
        return column
    }

    private func disclosureButton(_ title: String, open: Bool, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = Glyph.chevronRight.image.resized(to: 16)
        config.imagePadding = 6
        config.contentInsets = .zero
        config.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkMuted)))
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in action() })
        button.houseStyle()
        button.imageView?.transform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        button.accessibilityTraits.insert(open ? .selected : [])
        return button
    }

    /// The run, step by step: each finished step ticked, the current one spinning, and its output folded under.
    private func runningView() -> UIView {
        guard let job = join.job else { return UIView() }
        let lead = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        lead.text = "Adding \(job.target). It keeps installing if you close this."
        let steps = job.lines.filter { $0.hasPrefix(Self.stepPrefix) }.map { String($0.dropFirst(Self.stepPrefix.count)) }
        let list = UIStackView()
        list.axis = .vertical
        list.spacing = 8
        for (index, step) in (steps.isEmpty ? ["Connecting over SSH"] : steps).enumerated() {
            let current = steps.isEmpty || index == steps.count - 1
            let mark: UIView = current ? KitSpinner(side: 16, tint: Palette.inkStrong) : GlyphView(.passed, size: 16, tint: Palette.statusDoneInk)
            let label = KitLabel(TypeScale.typeBody, ink: current ? Palette.inkStrong : Palette.inkMuted)
            label.text = step
            label.lineBreakMode = .byTruncatingTail
            let row = UIStackView(arrangedSubviews: [mark, label])
            row.spacing = 10
            row.alignment = .center
            list.addArrangedSubview(row)
        }
        let output = outputBox(job.lines.joined(separator: "\n"), max: 224, follow: true)
        output.isHidden = !outputOpen
        let toggle = disclosureButton("Output", open: outputOpen) { [weak self] in
            self?.outputOpen.toggle()
            self?.view_ = ""
            self?.render()
        }
        let column = UIStackView(arrangedSubviews: [lead, list, toggle, output])
        column.axis = .vertical
        column.spacing = Space.space3
        column.alignment = .fill
        column.setCustomSpacing(8, after: toggle)
        return column
    }

    private var outputOpen = false

    /// `INSTALL_STEP_PREFIX`: the install script's and `cawco join`'s step lines.
    private static let stepPrefix = "cawco-install: "

    private func outputBox(_ text: String, max: Double, follow: Bool = false) -> UIView {
        let view = UITextView()
        view.isEditable = false
        view.text = text
        view.font = TypeScale.typeCode.with(points: TypeScale.typeMeta.points).font
        view.textColor = Palette.inkStrong
        view.backgroundColor = Palette.surfaceHover
        view.layer.cornerRadius = Radius.radiusMd
        view.layer.borderWidth = 1
        view.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        view.textContainerInset = UIEdgeInsets(top: 10, left: 12, bottom: 10, right: 12)
        view.translatesAutoresizingMaskIntoConstraints = false
        let height = min(max, view.sizeThatFits(CGSize(width: 440, height: CGFloat.greatestFiniteMagnitude)).height)
        view.heightAnchor.constraint(equalToConstant: height).isActive = true
        if follow { view.scrollRangeToVisible(NSRange(location: (text as NSString).length, length: 0)) }
        return view
    }

    /// A failed run, said with the error formula: what happened, why, how to fix it, what next.
    private func failure() -> (text: String, tail: [String])? {
        guard let job = join.job, job.state == .failed else { return nil }
        let host = job.target.split(separator: "@").last.map(String.init) ?? job.target
        let tail = Array(job.lines.suffix(20))
        guard let problem = job.problem else { return join.refused.map { ($0, []) } }
        if problem.value1 != nil {
            return ("\(job.target) refused this hub's SSH key. Add the key below to ~/.ssh/authorized_keys on that machine, then Retry.", [])
        }
        if problem.value2 != nil {
            return ("\(job.target) answered with a different SSH host key than this hub saw before, so the hub stopped. If the machine was reinstalled, remove the old key on the hub with ssh-keygen -R \(host), then Retry.", [])
        }
        if let unreachable = problem.value3 {
            return ("\(job.target) did not answer on port \(Int(job.port ?? 22)) (\(unreachable.detail)). Check the address and that SSH is running there, then Retry.", [])
        }
        if problem.value4 != nil {
            return ("SSH got into \(job.target), but it could not download the install script from \(job.hubUrl). Pick a hub address that machine can reach, then Retry.", tail)
        }
        if let step = problem.value5 {
            return ("The step \"\(step.step)\" failed on \(job.target). Its last output is below. Fix what it names, then Retry.", tail)
        }
        if problem.value6 != nil {
            return ("CawCo installed on \(job.target), but the machine never came online on this hub. Its last output is below. Check that it can reach \(job.hubUrl), then Retry.", tail)
        }
        return nil
    }

    private func joinedName(_ machineId: String?) -> String {
        hub.fleet.machines.first { $0.machineId == machineId }.map { Naming.machineLabel($0.hostname) } ?? machineId ?? "The machine"
    }

    // MARK: Command

    /// The first machine online now that was not in the fleet when the dialog opened.
    private var joined: MachineRow? {
        hub.fleet.machines.first { $0.status == "online" && !known.contains($0.machineId) }
    }

    private func commandPane() -> UIView {
        let lead = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        lead.text = "Run this on the machine you want to add. It installs Bun if needed, clones CawCo and starts the agent."
        let column = UIStackView(arrangedSubviews: [addressField(), lead])
        column.axis = .vertical
        column.spacing = Space.space3
        if !hubUrl.isEmpty { column.addArrangedSubview(CopyBox(text: JoinState.installCommand(hubUrl), label: "Install command")) }
        // CheckInStatus: waiting, or which machine joined.
        let dot = UIView()
        dot.layer.cornerRadius = 3
        dot.backgroundColor = joined == nil ? Palette.hueOrange500 : Palette.hueGreen500
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 6), dot.heightAnchor.constraint(equalToConstant: 6)])
        let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        said.text = joined.map { "\(Naming.machineLabel($0.hostname)) joined the fleet." } ?? "Waiting for check-in…"
        let status = UIStackView(arrangedSubviews: [dot, said, UIView()])
        status.spacing = 8
        status.alignment = .center
        status.heightAnchor.constraint(greaterThanOrEqualToConstant: 30).isActive = true
        column.addArrangedSubview(status)
        if joined != nil { UIAccessibility.post(notification: .announcement, argument: said.text) }
        return column
    }

    // MARK: Footer

    private var portNumber: Int?? {
        let typed = (port.text ?? "").trimmingCharacters(in: .whitespaces)
        if typed.isEmpty { return .some(nil) }
        guard let number = Int(typed), (1 ... 65535).contains(number) else { return nil }
        return .some(number)
    }

    private func paintFooter() {
        footer.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let close = { [weak self] in self?.dismiss(animated: true) ?? () }
        var buttons: [UIView]
        if tabs.selectedIndex == 0, sshView == "form" {
            let canStart = !(target.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty && !hubUrl.isEmpty && portNumber != nil && !starting
            port.layer.borderColor = (portNumber == nil ? Palette.destructive : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
            let add = KitButton.make(join.job?.state == .failed ? "Retry" : "Add machine", variant: .action) { [weak self] in self?.startSSH() }
            add.isEnabled = canStart
            add.configuration?.showsActivityIndicator = starting
            buttons = [KitButton.make("Cancel", variant: .outline, action: close), add]
        } else if tabs.selectedIndex == 0, sshView == "done" {
            buttons = [KitButton.make("Add another machine", variant: .outline) { [weak self] in
                self?.join.reset()
            }, KitButton.make("Close", variant: .action, action: close)]
        } else {
            buttons = [KitButton.make("Close", variant: .outline, action: close)]
        }
        let row = KitDialogController.footer(buttons)
        footer.addArrangedSubview(row)
    }

    private func startSSH() {
        guard let port = portNumber, !starting else { return }
        let target = (self.target.text ?? "").trimmingCharacters(in: .whitespaces)
        guard !target.isEmpty, !hubUrl.isEmpty else { return }
        starting = true
        paintFooter()
        view.endEditing(true)
        Task { @MainActor [weak self, hub, hubUrl] in
            guard let self else { return }
            await join.start(hub, target: target, port: port, hubUrl: hubUrl)
            starting = false
            paintFooter()
        }
    }
}
