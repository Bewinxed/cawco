import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// A page's `cawco.pickPlace()` (preview/PlacePick.svelte): the page asks
/// the person for a machine and a folder on it, and gets CawCo's own
/// pickers: the machine select and the folder browser New Project uses
/// (DirectoryPickerView). "Use this place" answers the page with the
/// machine, its label (`Naming.machineLabel`, the name every surface shows
/// it by) and the folder; Cancel answers nothing. Until the person chooses,
/// the select names no machine ("Choose a machine"), as New Session opens on
/// none; a machine they chose that goes offline reads as none, never swapped
/// for another.
final class PlacePickView: UIView {
    /// The place the person picked: the machine, its label, the folder.
    struct Place {
        let machineId: String
        let label: String
        let path: String
    }

    var onPick: (Place) -> Void = { _ in }
    var onCancel: () -> Void = {}
    var onResize: () -> Void = {}

    private let hub: HubConnection
    /// The machine the person chose; nil until they choose one.
    private var chosen: String?
    /// Its column scrolls in its own room (`overflow-y: auto`).
    let scroll = UIScrollView()
    private let machineSelect = KitSelect(small: true)
    private let folderField = KitField(placeholder: Words.PlacePick.folderPlaceholder, mono: true)
    private var browse: DirectoryPickerView!
    private let problem = KitLabel(TypeScale.typeLabel, ink: Palette.error, lines: 0)
    private var use: UIButton!

    /// `titled`: over the well it carries its own heading; in the house sheet, the sheet's title says it.
    init(hub: HubConnection, titled: Bool) {
        self.hub = hub
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        // Opaque over the well: the page under it is put by while the person picks, so it carries its own heading.
        backgroundColor = Palette.surfaceRaised
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        title.text = Words.PlacePick.title
        title.accessibilityTraits = .header
        title.isHidden = !titled
        machineSelect.accessibilityLabel = Words.PlacePick.machine
        // Set once and made as it opens, from the machines online then: a repaint that set a new menu cancelled one a tap was opening.
        machineSelect.menuOnOpen { [weak self] in
            guard let self else { return [] }
            let rows = online
            let picked = machine?.machineId
            return rows.isEmpty
                ? [UIAction(title: Words.PlacePick.noMachines, attributes: .disabled) { _ in }]
                : rows.map { row in
                    UIAction(title: Words.PlacePick.machineOption(label: row.name, os: row.os),
                             state: row.machineId == picked ? .on : .off) { [weak self] _ in
                        self?.chosen = row.machineId
                        self?.paintMachines()
                    }
                }
        }
        folderField.accessibilityLabel = Words.PlacePick.folder
        folderField.addAction(UIAction { [weak self] _ in self?.clearProblem() }, for: .editingChanged)
        folderField.spellCheckingType = .no
        browse = DirectoryPickerView(hub: hub, machineId: { [weak self] in self?.machine?.machineId ?? "" },
                                     value: { [weak self] in self?.folderField.text ?? "" })
        browse.onSelect = { [weak self] picked in
            self?.folderField.text = picked
            self?.clearProblem()
        }
        browse.onResize = { [weak self] in self?.onResize() }
        use = KitButton.make(Words.PlacePick.use, variant: .action, height: .sm) { [weak self] in self?.submit() }
        let cancel = KitButton.make(Words.PlacePick.cancel, variant: .ghost, height: .sm) { [weak self] in self?.onCancel() }
        problem.isHidden = true
        problem.accessibilityTraits = .staticText
        let buttons = UIStackView(arrangedSubviews: [use, cancel, problem])
        buttons.spacing = Space.space3
        buttons.alignment = .center
        let column = UIStackView(arrangedSubviews: [title, Self.field(Words.PlacePick.machine, machineSelect),
                                                    Self.field(Words.PlacePick.folder, folderField), browse, buttons])
        column.axis = .vertical
        column.spacing = Space.space3
        // `pt-1` over the buttons.
        column.setCustomSpacing(Space.space3 + Space.space1, after: browse)
        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        // `.place-pick`'s `padding: space-5` over the well; in the house sheet the sheet's own 16 holds it.
        let pad = titled ? Space.space5 : 0
        scroll.hold(column, insets: UIEdgeInsets(top: pad, left: pad, bottom: pad, right: pad))
        column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -pad * 2).isActive = true
        // As tall as the form where nothing else sets its height (the sheet): the sheet's cap still wins, and it scrolls.
        let natural = scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        natural.priority = .defaultHigh - 1
        natural.isActive = true
        hold(scroll)
        accessibilityLabel = Words.PlacePick.title
        watch()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PlacePickView is built in code") }

    /// A field's label over its control, `gap-1`.
    private static func field(_ words: String, _ control: UIView) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground)
        label.text = words
        let stack = UIStackView(arrangedSubviews: [label, control])
        stack.axis = .vertical
        stack.spacing = Space.space1
        return stack
    }

    private var online: [Components.Schemas.AgentRow] {
        hub.fleet.machines.filter { $0.status == "online" }
    }

    /// Their choice while it is online; none until they choose, as New Session opens on none.
    private var machine: Components.Schemas.AgentRow? {
        guard let chosen else { return nil }
        return online.first { $0.machineId == chosen }
    }

    /// The fleet under observation: a machine heard or lost redraws the select.
    private func watch() {
        withObservationTracking {
            paintMachines()
        } onChange: { [weak self] in
            Task { @MainActor in self?.watch() }
        }
    }

    private func paintMachines() {
        let machine = machine
        let rows = online
        if let machine {
            machineSelect.setValue(Words.PlacePick.machineOption(label: machine.name, os: machine.os))
        } else {
            machineSelect.setValue(rows.isEmpty ? Words.PlacePick.noMachines : Words.PlacePick.chooseMachine, placeholder: true)
        }
        browse.isHidden = machine == nil
        #if DEBUG
        PreviewProbe.say("place pick machine=\(machine.map { "\($0.machineId):\($0.name)" } ?? "-") online=\(rows.map(\.machineId).joined(separator: ","))")
        #endif
    }

    private func clearProblem() {
        problem.text = nil
        problem.isHidden = true
        onResize()
    }

    private func say(_ words: String) {
        problem.text = words
        problem.isHidden = false
        UIAccessibility.post(notification: .announcement, argument: words)
        onResize()
    }

    /// Use this place: an online machine and a full path, its trailing slashes past the root's dropped.
    private func submit() {
        guard let machine else { return say(Words.PlacePick.needsMachine) }
        var folder = (folderField.text ?? "").trimmingCharacters(in: .whitespaces)
        while folder.count > 1, folder.hasSuffix("/") { folder.removeLast() }
        guard folder.hasPrefix("/") else { return say(Words.PlacePick.needsPath) }
        onPick(Place(machineId: machine.machineId, label: Naming.machineLabel(machine.hostname), path: folder))
    }

    #if DEBUG
    /// `-place-pick <machineId> <path>`: the machine chosen from the select, the folder typed and Use this place pressed, as the person's would.
    func pickForProbe(machineId: String, path: String) {
        chosen = machineId
        paintMachines()
        folderField.text = path
        submit()
    }
    #endif
}

/// The picker presented: in a pane, over the whole of the preview's well,
/// as the web draws it there (a view in the well, above the page and the
/// inspector); in the phone's drawer, in the house sheet
/// (HouseSheetController), the drawer's own sheet idiom.
final class PlacePickSheetController: UIViewController {
    let pick: PlacePickView
    /// The sheet was put away (a swipe, a tap outside it): an ask still standing is answered null, as Cancel answers it.
    var onGone: () -> Void = {}

    init(_ pick: PlacePickView) {
        self.pick = pick
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PlacePickSheetController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        view.hold(pick)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || parent?.isBeingDismissed == true { onGone() }
    }
}
