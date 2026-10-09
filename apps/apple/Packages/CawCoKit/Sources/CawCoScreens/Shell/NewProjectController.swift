import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Names a directory so the rail has a folder for it before anything has
/// run there (NewProjectPopover.svelte): Name (the folder's own name when
/// left empty), Machine (an online one), Directory, typed or browsed, and
/// Create. What stops it is said under the field it is about, or beside
/// Create for what the hub answered.
final class NewProjectController: KitPopoverController, UITextFieldDelegate {
    private let hub: HubConnection
    private let nameField = KitField(placeholder: "What you call it")
    private let machineSelect = KitSelect()
    private let dirField = KitField(placeholder: "/home/you/project", mono: true)
    private let machineProblem = NewProjectController.problem()
    private let dirProblem = NewProjectController.problem()
    private let hubProblem = NewProjectController.problem()
    private var create: UIButton!
    private var picker: DirectoryPickerView!
    private let stack = UIStackView()
    private var machineId = ""
    private var saving = false

    init(hub: HubConnection) {
        self.hub = hub
        super.init(material: true)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NewProjectController is built in code")
    }

    private static func problem() -> KitLabel {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.error, lines: 0)
        label.isHidden = true
        return label
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let heading = KitLabel(TypeScale.typeBody.withWeight(.medium), ink: Palette.foreground)
        heading.text = "New project"
        nameField.delegate = self
        dirField.delegate = self
        // The web's field ids.
        nameField.accessibilityIdentifier = "project-name"
        dirField.accessibilityIdentifier = "project-cwd"
        nameField.addAction(UIAction { [weak self] _ in self?.clearProblem() }, for: .editingChanged)
        dirField.addAction(UIAction { [weak self] _ in
            self?.clearProblem()
            self?.namePlaceholder()
        }, for: .editingChanged)
        machineId = hub.fleet.machines.first { $0.status == "online" }?.machineId ?? ""
        machineSelect.menu = machineMenu()
        showMachine()
        picker = DirectoryPickerView(hub: hub, machineId: { [weak self] in self?.machineId ?? "" }, value: { [weak self] in self?.dirField.text ?? "" })
        picker.onSelect = { [weak self] path in
            self?.dirField.text = path
            self?.clearProblem()
            self?.namePlaceholder()
        }
        picker.onResize = { [weak self] in self?.resize() }
        create = KitButton.make("Create", variant: .action, height: .sm) { [weak self] in self?.submit() }
        // `flex items-center gap-3 pt-1`.
        let createRow = UIStackView(arrangedSubviews: [create, hubProblem, UIView()])
        createRow.spacing = Self.gap
        createRow.alignment = .center
        let form = UIStackView(arrangedSubviews: [
            field("Name", nameField),
            field("Machine", machineSelect, problem: machineProblem),
            field("Directory", dirField, problem: dirProblem),
            picker,
            createRow,
        ])
        form.axis = .vertical
        form.spacing = Self.gap
        form.setCustomSpacing(Self.gap + Space.space1, after: picker)
        stack.addArrangedSubview(heading)
        stack.addArrangedSubview(form)
        stack.axis = .vertical
        stack.spacing = Self.gap
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: Self.inset),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Self.inset),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Self.inset),
        ])
        resize()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        nameField.becomeFirstResponder()
    }

    private func field(_ title: String, _ control: UIView, problem: KitLabel? = nil) -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground)
        label.text = title
        control.accessibilityLabel = title
        let column = UIStackView(arrangedSubviews: [label, control] + [problem].compactMap(\.self))
        column.axis = .vertical
        column.spacing = Space.space1
        return column
    }

    /// `gap-3` between the parts.
    private static let gap = 12.0
    /// `p-4` inside the popover's 1pt border.
    private static let inset = 16 + 1.0

    /// `w-[340px] max-w-[calc(100vw-2rem)]`, as tall as the form.
    private func resize() {
        let width = min(340, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        stack.layoutIfNeeded()
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - Self.inset * 2, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    private func machineMenu() -> UIMenu {
        let online = hub.fleet.machines.filter { $0.status == "online" }
        guard !online.isEmpty else {
            return UIMenu(children: [UIAction(title: "No machines online", attributes: .disabled) { _ in }])
        }
        return UIMenu(options: .singleSelection, children: online.map { machine in
            UIAction(title: "\(machine.hostname) · \(machine.os)", state: machine.machineId == machineId ? .on : .off) { [weak self] _ in
                self?.machineId = machine.machineId
                self?.showMachine()
                self?.clearProblem()
            }
        })
    }

    private func showMachine() {
        let machine = hub.fleet.machines.first { $0.machineId == machineId }
        machineSelect.setValue(machine.map { "\($0.hostname) · \($0.os)" } ?? "No machines online")
        machineSelect.menu = machineMenu()
    }

    private var dir: String {
        let typed = (dirField.text ?? "").trimmingCharacters(in: .whitespaces)
        guard typed.count > 1 else { return typed }
        var trimmed = typed
        while trimmed.count > 1, trimmed.hasSuffix("/") { trimmed.removeLast() }
        return trimmed
    }

    private static func leaf(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func namePlaceholder() {
        let placeholder = dir.isEmpty ? "What you call it" : Self.leaf(dir)
        nameField.attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.font: nameField.font as Any, .foregroundColor: Palette.mutedForeground])
    }

    private func clearProblem() {
        for label in [machineProblem, dirProblem, hubProblem] { label.isHidden = true }
        resize()
    }

    /// What stops a Create, said where it applies; it appears with the kit's `appear`.
    private func say(_ text: String, at label: KitLabel) {
        label.text = text
        label.alpha = 0
        label.isHidden = false
        Motion.easeOut.animator(Motion.durControl) { label.alpha = 1 }.startAnimation()
        resize()
    }

    private func submit() {
        guard !saving else { return }
        guard !machineId.isEmpty else { return say("Choose the machine this directory is on.", at: machineProblem) }
        guard !dir.isEmpty else { return say("Enter the directory this project lives in.", at: dirProblem) }
        saving = true
        clearProblem()
        create.configuration?.showsActivityIndicator = true
        KitButton.setTitle("Creating…", of: create, variant: .action, height: .sm)
        let name = (nameField.text ?? "").trimmingCharacters(in: .whitespaces)
        Task { @MainActor in
            do {
                _ = try await hub.createProject(name: name.isEmpty ? Self.leaf(dir) : name, cwd: dir, machineId: machineId)
                dismiss(animated: true)
            } catch {
                saving = false
                create.configuration?.showsActivityIndicator = false
                KitButton.setTitle("Create", of: create, variant: .action, height: .sm)
                say(error.localizedDescription, at: hubProblem)
            }
        }
    }

    func textFieldShouldReturn(_ field: UITextField) -> Bool {
        if field === nameField { dirField.becomeFirstResponder() } else { submit() }
        return true
    }
}

/// Walks a machine's filesystem so a directory can be picked, not typed
/// (DirectoryPicker.svelte): "Browse" opens it on the field's directory,
/// else where the machine last worked; up a level, the path, the folders
/// (dotfiles left out), and "Use this directory". A folder's listing comes
/// in from the side it lies on (8% over `durPanel` on the drawer curve,
/// fading in; with less motion only the fade). Listings are kept while it
/// is open.
final class DirectoryPickerView: UIStackView {
    var onSelect: (String) -> Void = { _ in }
    var onResize: () -> Void = {}
    private let hub: HubConnection
    private let machineId: () -> String
    private let value: () -> String
    private let trigger = UIButton(type: .custom)
    private let panel = UIStackView()
    private let up = GhostIconButton(.arrowUp, label: "Parent directory", side: 24)
    private let pathLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.mutedForeground)
    private let listScroll = UIScrollView()
    private let list = UIStackView()
    private var listHeight: NSLayoutConstraint!
    private var path = "/"
    private var cache: [String: [Components.Schemas.FsEntry]] = [:]
    private var open = false

    init(hub: HubConnection, machineId: @escaping () -> String, value: @escaping () -> String) {
        self.hub = hub
        self.machineId = machineId
        self.value = value
        super.init(frame: .zero)
        axis = .vertical
        alignment = .leading
        var config = UIButton.Configuration.plain()
        config.image = Glyph.folder.image.resized(to: Size.iconMd)
        config.imagePadding = 6
        config.contentInsets = .zero
        config.attributedTitle = AttributedString("Browse", attributes: TypeScale.typeMeta.container(color: Palette.mutedForeground))
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.mutedForeground }
        trigger.configuration = config
        trigger.addAction(UIAction { [weak self] _ in self?.toggle() }, for: .primaryActionTriggered)
        addArrangedSubview(trigger)

        up.addAction(UIAction { [weak self] _ in
            guard let self, let parent = parent else { return }
            go(parent, way: -1)
        }, for: .primaryActionTriggered)
        pathLabel.lineBreakMode = .byTruncatingHead
        // `flex items-center gap-2`.
        let head = UIStackView(arrangedSubviews: [up, pathLabel])
        head.spacing = Self.gap
        head.alignment = .center
        list.axis = .vertical
        list.translatesAutoresizingMaskIntoConstraints = false
        listScroll.addSubview(list)
        listScroll.translatesAutoresizingMaskIntoConstraints = false
        listHeight = listScroll.heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            listHeight,
            list.topAnchor.constraint(equalTo: listScroll.contentLayoutGuide.topAnchor),
            list.bottomAnchor.constraint(equalTo: listScroll.contentLayoutGuide.bottomAnchor),
            list.leadingAnchor.constraint(equalTo: listScroll.frameLayoutGuide.leadingAnchor),
            list.trailingAnchor.constraint(equalTo: listScroll.frameLayoutGuide.trailingAnchor),
        ])
        let use = KitButton.make("Use this directory", glyph: .tick, variant: .action, height: .xs) { [weak self] in
            guard let self else { return }
            onSelect(path)
            collapse()
        }
        let foot = UIStackView(arrangedSubviews: [UIView(), use])
        foot.alignment = .center
        let rule = UIView()
        rule.backgroundColor = Palette.border
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        // `mt-2 flex flex-col gap-2 border-t border-border pt-2`.
        panel.axis = .vertical
        panel.spacing = Self.gap
        for part in [rule, head, listScroll, foot] { panel.addArrangedSubview(part) }
        panel.isHidden = true
        addArrangedSubview(panel)
        setCustomSpacing(Self.gap, after: trigger)
        panel.widthAnchor.constraint(equalTo: widthAnchor).isActive = true
    }

    /// Tailwind's `2` (`mt-2`, `gap-2`, `pt-2`).
    private static let gap = 8.0

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("DirectoryPickerView is built in code")
    }

    private var parent: String? {
        guard path != "/" else { return nil }
        let cut = path.split(separator: "/").dropLast().joined(separator: "/")
        return "/" + cut
    }

    private func toggle() {
        if open { return collapse() }
        open = true
        panel.isHidden = false
        go(seed(), way: 0)
    }

    private func collapse() {
        open = false
        panel.isHidden = true
        cache = [:]
        onResize()
    }

    /// What the field already says, else where this machine worked last.
    private func seed() -> String {
        let typed = value()
        if typed.hasPrefix("/") { return typed.count > 1 && typed.hasSuffix("/") ? String(typed.dropLast()) : typed }
        let recent = hub.fleet.catalog(machineId()).compactMap(\.cwd).first
        return recent ?? "/"
    }

    private func go(_ next: String, way: Int) {
        path = next
        pathLabel.text = next
        up.isEnabled = parent != nil
        if let cached = cache[next] { return show(cached, way: way) }
        showSkeleton()
        let machine = machineId()
        Task { @MainActor in
            do {
                let listed = try await hub.listFiles(machineId: machine, path: next)
                cache[next] = listed
                guard path == next else { return }
                show(listed, way: way)
            } catch {
                guard path == next else { return }
                showText(error.localizedDescription, ink: Palette.destructive)
            }
        }
    }

    private func clear() {
        for view in list.arrangedSubviews {
            list.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    private func showSkeleton() {
        clear()
        for width in [112.0, 160, 96] {
            let row = UIStackView(arrangedSubviews: [SkeletonView(height: 16), SkeletonView(height: 12)])
            row.spacing = Space.space2
            row.alignment = .center
            row.arrangedSubviews[0].widthAnchor.constraint(equalToConstant: 16).isActive = true
            row.arrangedSubviews[1].widthAnchor.constraint(equalToConstant: width).isActive = true
            let box = UIStackView(arrangedSubviews: [row, UIView()])
            box.isLayoutMarginsRelativeArrangement = true
            box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 11, bottom: 0, trailing: 0)
            box.heightAnchor.constraint(equalToConstant: 30).isActive = true
            list.addArrangedSubview(box)
        }
        fit()
    }

    private func showText(_ text: String, ink: UIColor) {
        clear()
        let label = KitLabel(TypeScale.typeMeta, ink: ink, lines: 0)
        label.text = text
        let box = UIStackView(arrangedSubviews: [label])
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        list.addArrangedSubview(box)
        fit()
    }

    private func show(_ entries: [Components.Schemas.FsEntry], way: Int) {
        let dirs = entries.filter { $0.kind == .dir && !$0.name.hasPrefix(".") }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        guard !dirs.isEmpty else { return showText("No subdirectories.", ink: Palette.mutedForeground) }
        clear()
        for dir in dirs {
            var config = UIButton.Configuration.plain()
            config.image = Glyph.folder.image.resized(to: Size.iconMd)
            config.imagePadding = Space.space2
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkStrong.withAlphaComponent(0.7) }
            config.attributedTitle = AttributedString(dir.name, attributes: TypeScale.typeCode.with(points: TypeScale.typeLabel.points).container(color: Palette.inkStrong))
            config.titleLineBreakMode = .byTruncatingTail
            // The kit's `sm` button: `px-[11px]` inside its 1pt border.
            config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12)
            config.background.cornerRadius = Radius.radiusMd
            let row = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
                guard let self else { return }
                go(path == "/" ? "/\(dir.name)" : "\(path)/\(dir.name)", way: 1)
            })
            row.contentHorizontalAlignment = .leading
            row.configurationUpdateHandler = { button in
                button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : .clear
            }
            row.houseStyle()
            row.heightAnchor.constraint(equalToConstant: Size.cBtnHSm).isActive = true
            list.addArrangedSubview(row)
        }
        fit()
        guard way != 0 else { return }
        let travel = UIAccessibility.isReduceMotionEnabled ? 0 : Double(way) * 0.08 * max(1, list.bounds.width)
        list.alpha = 0
        list.transform = CGAffineTransform(translationX: travel, y: 0)
        Motion.easeDrawer.animator(Motion.durPanel) {
            self.list.alpha = 1
            self.list.transform = .identity
        }.startAnimation()
    }

    /// `max-h-56`: the list scrolls past 224pt.
    private func fit() {
        list.layoutIfNeeded()
        let height = list.systemLayoutSizeFitting(CGSize(width: max(1, listScroll.bounds.width), height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        listHeight.constant = min(224, height)
        listScroll.contentOffset = .zero
        onResize()
    }
}
