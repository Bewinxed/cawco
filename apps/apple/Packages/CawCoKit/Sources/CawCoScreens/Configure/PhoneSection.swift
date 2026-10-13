import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Phone (routes/config/phone/+page.svelte): pushes to the CawCo
/// app. Devices register themselves from the app; here each can be made
/// quiet or removed, and every one sent a test.
///
/// Every step runs on its device's row (The Stay In Context Rule), sized to
/// its decision: Quiet and the test are light and just run, the switch
/// showing Quiet once the hub has it and each row the test's answer for it;
/// removing another device is light too (it comes back when its app opens)
/// and its row folds shut once the hub has removed it; removing this device
/// costs its pushes until notifications are turned on again, so that is
/// said on its row before a second press. A refusal stays on its row with
/// Try again.
final class PhoneSectionController: ConfigSectionController {
    private let devices: PushDevices
    private let testButton: UIButton
    private let testProblem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private lazy var testRetry = KitButton.make("Try again", variant: .ghost, height: .xs) { [weak self] in self?.test() }
    private let empty = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let list = RowList(label: "Devices")
    private var rows: [String: DeviceRow] = [:]
    /// The row whose Remove is armed.
    private var armed: String?

    override init(section: ConfigSection, context: ShellContext) {
        devices = PushDevices(hub: context.hub)
        testButton = KitButton.make("Send test push", variant: .outline, height: .sm) {}
        super.init(section: section, context: context)
        testButton.addAction(UIAction { [weak self] _ in self?.test() }, for: .primaryActionTriggered)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PhoneSectionController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        testButton.accessibilityIdentifier = "phone.test"
        let header = nsSectionHeader(.phone, hue: section.hue, "Devices") as! UIStackView
        header.addArrangedSubview(testButton)
        let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        note.text = "A push names the session or task and nothing else; the app reads the rest over your tailnet."
        note.wrap = .pretty
        let problem = UIStackView(arrangedSubviews: [testProblem, testRetry, UIView()])
        problem.spacing = Space.space2
        problem.alignment = .firstBaseline
        empty.text = "Your devices will appear here. Open the CawCo app on your phone and allow notifications to register it."
        empty.wrap = .pretty
        let group = UIStackView(arrangedSubviews: [header, note, problem, empty, list])
        group.axis = .vertical
        group.spacing = 8
        setContent([group])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await devices.read() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let wide = view.bounds.width >= 640
        for row in rows.values { row.wide = wide }
    }

    override func refreshContent() {
        ready = devices.loaded
        problem = devices.loaded ? nil : devices.readError
        let count = devices.devices.filter { !devices.gone.contains($0.id) }.count
        // What the test touches, said before it is sent.
        KitButton.setTitle(count > 1 ? "Send a test to \(count) devices" : "Send test push", of: testButton, variant: .outline, height: .sm)
        testButton.configuration?.showsActivityIndicator = devices.testing
        testButton.isEnabled = !devices.testing && count > 0
        testProblem.text = devices.testError
        testProblem.superview?.isHidden = devices.testError == nil
        // Empty only when no row stands, a dropped device's included.
        empty.isHidden = !devices.loaded || !devices.devices.isEmpty
        drawRows()
    }

    private func drawRows() {
        let shown = devices.devices
        let ids = Set(shown.map(\.id))
        // A row the hub removed folds shut, then leaves.
        for (id, row) in rows where !ids.contains(id) {
            rows[id] = nil
            fold(row)
        }
        for (index, device) in shown.enumerated() {
            let row = rows[device.id] ?? makeRow(device)
            rows[device.id] = row
            if list.arrangedSubviews.firstIndex(of: row) == nil { list.insertArrangedSubview(row, at: min(index, list.arrangedSubviews.count)) }
            row.draw(device, this: devices.isThisDevice(device), work: devices.working[device.id], failure: devices.failures[device.id],
                     result: devices.results[device.id], armed: armed == device.id, gone: devices.gone.contains(device.id), first: index == 0)
        }
        for row in rows.values { row.wide = view.bounds.width >= 640 }
    }

    private func makeRow(_ device: PushDevices.Device) -> DeviceRow {
        let row = DeviceRow()
        let id = device.id
        row.onQuiet = { [weak self] on in
            guard let self, let device = devices.devices.first(where: { $0.id == id }) else { return }
            Task { await self.devices.setQuiet(device, on) }
        }
        row.onRemove = { [weak self] in
            guard let self, let device = devices.devices.first(where: { $0.id == id }) else { return }
            // Another device comes back when its app opens, so it just goes.
            // This one gets no pushes until notifications are turned on
            // again: that cost is said where it is asked, and a second press removes it.
            guard !devices.isThisDevice(device) || armed == id else {
                armed = id
                requestRefresh()
                return
            }
            armed = nil
            Task { await self.devices.remove(device) }
        }
        row.onDisarm = { [weak self] in
            self?.armed = nil
            self?.requestRefresh()
        }
        row.onRetry = { [weak self] in
            guard let self, let device = devices.devices.first(where: { $0.id == id }) else { return }
            Task { await self.devices.retry(device) }
        }
        return row
    }

    private func fold(_ row: UIView) {
        let reduce = UIAccessibility.isReduceMotionEnabled
        Motion.easeOut.animator(reduce ? Motion.durControl : Motion.durExit) {
            row.alpha = 0
            if !reduce { row.isHidden = true }
            self.list.layoutIfNeeded()
        }.addingCompletion { row.removeFromSuperview() }.startAnimation()
    }

    private func test() {
        armed = nil
        Task { await devices.test() }
    }
}

/// One registered device (the page's `.device`): who it is and its last
/// push, its Quiet switch, Remove, and one status line for what is on its
/// way, the test's answer, or why a step was refused with Try again.
/// Under 640pt the switch drops to a line of its own.
private final class DeviceRow: UIStackView {
    var onQuiet: ((Bool) -> Void)?
    var onRemove: (() -> Void)?
    var onDisarm: (() -> Void)?
    var onRetry: (() -> Void)?
    var wide = true { didSet { if wide != oldValue { place() } } }

    private let name = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
    private let platform = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let last = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let quiet = SwitchField(label: "Quiet")
    private let quietSpinner = KitSpinner(side: 14)
    private lazy var remove = KitButton.make("Remove", variant: .ghost, height: .sm) { [weak self] in self?.onRemove?() }
    private lazy var disarm = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in self?.onDisarm?() }
    private let armedNote = KitLabel(TypeScale.typeMeta, ink: Palette.statusAttnInk, lines: 0)
    private let statusDot = UIView()
    private let statusSpinner = KitSpinner(side: 12)
    private let status = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private lazy var retry = KitButton.make("Try again", variant: .ghost, height: .xs) { [weak self] in self?.onRetry?() }
    private let statusLine = UIStackView()
    private let top = UIStackView()
    private let quietSlot = UIStackView()
    private let hairline = UIView()
    private var armedNow = false

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 6
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = .init(top: 10, leading: 0, bottom: 10, trailing: 0)

        let who = UIStackView(arrangedSubviews: [name, platform, last])
        who.axis = .vertical
        // Who it is takes the row's room; Remove keeps its own width.
        who.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        who.setContentHuggingPriority(.defaultLow, for: .horizontal)
        quiet.onChange = { [weak self] on in self?.onQuiet?(on) }
        quietSpinner.isHidden = true
        quietSlot.addArrangedSubview(quiet)
        quietSlot.addArrangedSubview(quietSpinner)
        quietSlot.spacing = Space.space2
        quietSlot.alignment = .center
        disarm.isHidden = true
        let actions = UIStackView(arrangedSubviews: [disarm, remove])
        actions.spacing = Space.space1
        actions.setContentHuggingPriority(.required, for: .horizontal)
        top.spacing = 12
        top.alignment = .center
        // The room between who and Remove is the spacer's, never Remove's.
        let room = UIView()
        room.setContentHuggingPriority(UILayoutPriority(1), for: .horizontal)
        top.addArrangedSubview(who)
        top.addArrangedSubview(room)
        top.addArrangedSubview(actions)

        armedNote.isHidden = true
        armedNote.wrap = .pretty
        statusDot.translatesAutoresizingMaskIntoConstraints = false
        statusDot.layer.cornerRadius = 3.5
        NSLayoutConstraint.activate([statusDot.widthAnchor.constraint(equalToConstant: 7), statusDot.heightAnchor.constraint(equalToConstant: 7)])
        statusLine.spacing = 8
        statusLine.alignment = .center
        for part in [statusDot, statusSpinner, status, retry, UIView()] { statusLine.addArrangedSubview(part) }
        status.accessibilityTraits = .updatesFrequently

        hairline.backgroundColor = Palette.borderHairline
        hairline.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hairline)
        NSLayoutConstraint.activate([
            hairline.topAnchor.constraint(equalTo: topAnchor),
            hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1),
        ])
        for part in [top, armedNote, statusLine] { addArrangedSubview(part) }
        place()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("DeviceRow is built in code")
    }

    /// Wide, the switch stands between who and Remove; narrow, on its own line.
    private func place() {
        quietSlot.removeFromSuperview()
        if wide {
            top.insertArrangedSubview(quietSlot, at: 1)
        } else {
            insertArrangedSubview(quietSlot, at: 1)
        }
    }

    func draw(_ device: PushDevices.Device, this: Bool, work: PushDevices.Work?, failure: PushDevices.Failure?, result: PushDevices.Line?,
              armed: Bool, gone: Bool, first: Bool) {
        hairline.isHidden = first
        // A device the hub dropped keeps its name and why, with nothing left to change.
        quietSlot.isHidden = gone
        remove.superview?.isHidden = gone
        accessibilityIdentifier = "phone.device.\(device.id)"
        name.text = device.name
        platform.text = PushDevices.platformName(device.platform)
        let now = Date.now.timeIntervalSince1970 * 1000
        if let error = device.lastError {
            last.text = "Last push refused: \(error)"
            last.ink = Palette.statusFailInk
        } else if let sent = device.lastSentAt {
            last.text = "Last push \(RailAge.ago(sent, now: now))"
            last.ink = Palette.inkMuted
        } else {
            last.text = "Registered \(RailAge.ago(device.registeredAt, now: now))"
            last.ink = Palette.inkMuted
        }

        // Quiet shows the hub's value; a change on its way spins beside it.
        let pendingQuiet: Bool? = if case let .quiet(next) = work { next } else { nil }
        let on = pendingQuiet ?? device.quiet
        quiet.set(on: on, hint: on ? "Sent nothing." : "Gets what needs you.", enabled: work == nil)
        quiet.toggle.accessibilityIdentifier = "phone.quiet.\(device.name)"
        quietSpinner.isHidden = pendingQuiet == nil

        // Removing this device says what it costs, here, before the second press.
        let removing = work == .removing
        KitButton.setTitle(removing ? "Removing…" : armed ? "Remove this device" : "Remove", of: remove, variant: armed ? .fail : .ghost, height: .sm)
        remove.configuration?.showsActivityIndicator = removing
        remove.isEnabled = work == nil || removing
        remove.isUserInteractionEnabled = !removing
        remove.accessibilityIdentifier = "phone.remove.\(device.name)"
        armedNote.text = this ? "No more pushes here until you turn notifications on again." : nil
        if armed != armedNow || disarm.isHidden == armed {
            armedNow = armed
            Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durControl) {
                self.disarm.isHidden = !armed
                self.armedNote.isHidden = !armed
                self.superview?.layoutIfNeeded()
            }.startAnimation()
        }

        // One status line: on its way, the test's answer, or the refusal with Try again.
        let (text, ink, dot, spinning, retrying): (String?, UIColor, UIColor?, Bool, Bool) = if let failure {
            (failure.text, Palette.statusFailInk, nil, false, true)
        } else if work == .testing {
            ("Sending…", Palette.inkMuted, nil, true, false)
        } else if let result {
            (result.text, result.ok ? Palette.inkStrong : Palette.inkMuted, result.ok ? Palette.statusLiveGlyph : Palette.statusAttnGlyph, false, false)
        } else {
            (nil, Palette.inkMuted, nil, false, false)
        }
        status.text = text
        status.ink = ink
        statusDot.backgroundColor = dot
        statusDot.isHidden = dot == nil
        statusSpinner.isHidden = !spinning
        retry.isHidden = !retrying
        retry.accessibilityIdentifier = "phone.retry.\(device.name)"
        statusLine.isHidden = text == nil
    }
}
