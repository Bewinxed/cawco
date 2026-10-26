import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// A sheet's inspector (preview/SheetInspector.svelte, live components spec
/// §5): the chosen story's props as controls, from the stage's docgen. An
/// enum is the variant control (its segments, or its list past four), a
/// boolean its switch, a string or number its field (a prop typed
/// `TokenColor`, `TokenSize` or `TokenFont` offered the design system's
/// names), a slot "content is a pin", code read-only. A change mounts the
/// story again at once; Save writes its args into the story file. Under the
/// controls, the story buttons: Add story from the controls as they stand,
/// Duplicate, Move up and down, Remove (asked in place). A right panel
/// beside the page in a pane; a sheet over the page's foot in the phone's
/// drawer. Drawn inside the well, as the web draws it inside its pane.
final class SheetInspectorView: UIView {
    enum Layout { case panel, sheet }

    let inspection: SheetInspection
    let layout: Layout
    var onClose: () -> Void = {}
    /// Its height changed (a sheet holds its content up to 60% of the well).
    var onResize: () -> Void = {}

    private let scroll = UIScrollView()
    private let body = UIStackView()
    private let foot = UIStackView()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.dataBad, lines: 0)
    private let ask = AskHere()
    /// The rows drawn for the chosen story's props, by name, painted again in place on every change.
    private var props: [String: PropRow] = [:]
    /// What the body was built for: built again only when the sheet, the story or its component change.
    private var built: String?
    private var storyPick: KitSelect?
    private var duplicateButton: UIButton?
    private var upButton: UIButton?
    private var downButton: UIButton?
    private var removeButton: UIButton?
    private var addButton: UIButton!
    private var discardButton: UIButton!
    private var saveButton: UIButton!
    private let actions = UIStackView()
    private let naming = UIStackView()
    private let nameLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let nameField = KitField(placeholder: Words.Artifacts.namePlaceholder)
    private let nameProblem = KitLabel(TypeScale.typeMeta, ink: Palette.dataBad, lines: 0)
    private var nameConfirm: UIButton!
    /// Which story button the name field is for.
    private var namingFor: NamingFor?
    private enum NamingFor { case add, duplicate }

    init(inspection: SheetInspection, layout: Layout) {
        self.inspection = inspection
        self.layout = layout
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        build()
        watch()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SheetInspectorView is built in code") }

    /// The sheet's file name, as the inspector's words name it.
    private var fileName: String {
        inspection.sheet.map { ($0.file as NSString).lastPathComponent } ?? Words.Artifacts.theStoryFile
    }

    // MARK: The frame

    private func build() {
        // The panel: the raised surface beside the page, a hairline its seam.
        // The sheet: the drawer recipe over the page's foot, its top corners
        // rounded and its hairline on top, the page above it live.
        backgroundColor = Palette.surfaceRaised
        if layout == .sheet {
            layer.cornerRadius = Radius.radiusLg
            layer.cornerCurve = .continuous
            layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            boxShadow = Shadow.shadowDrawer
        }
        let seam = UIView()
        seam.backgroundColor = Palette.borderHairline
        seam.translatesAutoresizingMaskIntoConstraints = false
        addSubview(seam)
        if layout == .panel {
            NSLayoutConstraint.activate([
                seam.leadingAnchor.constraint(equalTo: leadingAnchor),
                seam.topAnchor.constraint(equalTo: topAnchor),
                seam.bottomAnchor.constraint(equalTo: bottomAnchor),
                seam.widthAnchor.constraint(equalToConstant: 1),
            ])
        } else {
            NSLayoutConstraint.activate([
                seam.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Radius.radiusLg),
                seam.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Radius.radiusLg),
                seam.topAnchor.constraint(equalTo: topAnchor),
                seam.heightAnchor.constraint(equalToConstant: 1),
            ])
        }

        // `.head`: the title in the label role and Close, `--c-sheet-inspector-head-h` tall.
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = Words.Artifacts.inspect
        title.accessibilityTraits = .header
        let close = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.onClose() }
        close.accessibilityLabel = Words.Artifacts.closeInspector
        close.toolTip = Words.Artifacts.closeInspector
        let head = UIStackView(arrangedSubviews: [title, UIView(), close])
        head.alignment = .center
        head.spacing = Space.space2
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space2)
        head.heightAnchor.constraint(equalToConstant: Size.cSheetInspectorHeadH).isActive = true
        let headSeam = Self.hairline()

        // `.body`: the controls, scrolling between the head and the foot.
        body.axis = .vertical
        body.spacing = Space.space3
        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        scroll.hold(body, insets: UIEdgeInsets(top: Space.space3, left: Space.space4, bottom: Space.space3, right: Space.space4))
        body.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space4 * 2).isActive = true
        let fits = scroll.heightAnchor.constraint(equalTo: body.heightAnchor, constant: Space.space3 * 2)
        fits.priority = .defaultLow
        fits.isActive = true

        // `.foot`: the refusal, then the name field or the actions.
        problem.isHidden = true
        problem.accessibilityTraits = .staticText
        buildActions()
        buildNaming()
        foot.axis = .vertical
        foot.spacing = Space.space2
        foot.addArrangedSubview(problem)
        foot.addArrangedSubview(naming)
        foot.addArrangedSubview(actions)
        foot.isLayoutMarginsRelativeArrangement = true
        foot.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
        let footSeam = Self.hairline()

        let column = UIStackView(arrangedSubviews: [head, headSeam, scroll, footSeam, foot])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: layout == .panel ? 1 : 0),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            // The foot keeps clear of the home indicator (`env(safe-area-inset-bottom)`).
            column.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor),
        ])
        accessibilityLabel = "Inspector"
        shouldGroupAccessibilityChildren = true
    }

    private static func hairline() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    private func buildActions() {
        addButton = KitButton.make(Words.Artifacts.addStory, glyph: .plus, variant: .ghost, height: .sm) { [weak self] in
            self?.startNaming(.add)
        }
        addButton.toolTip = Words.Artifacts.addStoryTitle
        discardButton = KitButton.make(Words.Artifacts.discard, variant: .ghost, height: .sm) { [weak self] in
            self?.inspection.discard()
        }
        saveButton = KitButton.make(Words.Artifacts.save, variant: .action, height: .sm) { [weak self] in
            guard let self else { return }
            Task { await self.inspection.save() }
        }
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        for part in [addButton!, discardButton!, saveButton!] { actions.addArrangedSubview(part) }
        actions.insertArrangedSubview(spacer, at: 1)
        actions.spacing = Space.space2
        actions.alignment = .center
    }

    private func buildNaming() {
        nameField.addAction(UIAction { [weak self] _ in self?.paintNaming() }, for: .editingChanged)
        nameField.addAction(UIAction { [weak self] _ in self?.named() }, for: .editingDidEndOnExit)
        nameField.returnKeyType = .done
        nameField.autocapitalizationType = .words
        nameProblem.isHidden = true
        let cancel = KitButton.make(Words.Artifacts.cancel, variant: .ghost, height: .sm) { [weak self] in
            self?.stopNaming()
        }
        nameConfirm = KitButton.make(Words.Artifacts.addStory, variant: .action, height: .sm) { [weak self] in self?.named() }
        let buttons = UIStackView(arrangedSubviews: [UIView(), cancel, nameConfirm])
        buttons.spacing = Space.space2
        naming.axis = .vertical
        naming.spacing = Space.space2
        for part in [nameLabel, nameField, nameProblem, buttons] as [UIView] { naming.addArrangedSubview(part) }
        naming.isHidden = true
    }

    // MARK: Following the inspection

    /// Reads the inspection under observation and draws what it says; any
    /// change it read comes back here on the main actor.
    private func watch() {
        withObservationTracking {
            draw()
        } onChange: { [weak self] in
            Task { @MainActor in self?.watch() }
        }
    }

    private func draw() {
        let sheet = inspection.sheet
        let story = inspection.story
        let component = inspection.component
        let key = sheet.map { sheet in
            "\(sheet.hashValue)|\(story?.name ?? "-")|\(component?.file ?? "-")"
        } ?? "loading"
        if key != built {
            built = key
            rebuild(sheet: sheet, story: story, component: component)
        }
        paint()
        onResize()
    }

    /// The body as the chosen story's component has it: the story row, where
    /// the component is written, and a row for each prop, in the order the
    /// person reaches for them.
    private func rebuild(sheet: SheetOnPage?, story _: SheetStory?, component: SheetComponent?) {
        body.arrangedSubviews.forEach { $0.removeFromSuperview() }
        props = [:]
        storyPick = nil
        guard let sheet else {
            // The rows' own size while the page reads the sheet's props.
            let loading = UIStackView()
            loading.axis = .vertical
            loading.spacing = Space.space2
            for _ in 0 ..< 3 {
                let name = SkeletonView(height: TypeScale.typeLabel.points)
                name.widthAnchor.constraint(equalToConstant: Size.cSheetInspectorW * 0.4 - Space.space4).isActive = true
                let control = SkeletonView(height: Size.cInputH)
                control.layer.cornerRadius = Radius.radiusMd
                let pair = UIStackView(arrangedSubviews: [name, control])
                pair.axis = .vertical
                pair.alignment = .leading
                pair.spacing = Space.space2
                control.widthAnchor.constraint(equalTo: pair.widthAnchor).isActive = true
                loading.addArrangedSubview(pair)
                loading.setCustomSpacing(Space.space2 * 2, after: pair)
            }
            loading.isAccessibilityElement = true
            loading.accessibilityLabel = Words.Artifacts.readingProps
            body.addArrangedSubview(loading)
            return
        }
        if sheet.stories.isEmpty {
            body.addArrangedSubview(Self.note(Words.Artifacts.noStories(file: fileName)))
            return
        }
        body.addArrangedSubview(storyRow(sheet))
        body.addArrangedSubview(ask)
        guard let component else {
            body.addArrangedSubview(Self.note(Words.Artifacts.noComponent, code: "component", after: "."))
            return
        }
        let place = NSMutableAttributedString(string: "\(component.name) · ", attributes: Self.meta)
        place.append(NSAttributedString(string: component.file, attributes: Self.code))
        let where_ = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        where_.attributedText = place
        body.addArrangedSubview(where_)
        if let note = component.note { body.addArrangedSubview(Self.note(note)) }
        let list = UIStackView()
        list.axis = .vertical
        list.spacing = Space.space4
        let ordered = component.props.enumerated().sorted { a, b in
            let ra = inspection.control(a.element).rank
            let rb = inspection.control(b.element).rank
            return ra != rb ? ra < rb : a.offset < b.offset
        }.map(\.element)
        for prop in ordered {
            let row = PropRow(prop: prop, inspection: inspection)
            props[prop.name] = row
            list.addArrangedSubview(row)
        }
        if ordered.isEmpty, component.types != "unknown" {
            list.addArrangedSubview(Self.note(Words.Artifacts.takesNoProps(name: component.name)))
        }
        body.addArrangedSubview(list)
    }

    /// The story picker and its buttons: Duplicate, Move up, Move down, Remove.
    private func storyRow(_ sheet: SheetOnPage) -> UIView {
        let pick = KitSelect(small: true)
        pick.accessibilityLabel = Words.Artifacts.story
        // Set once and made as it opens, from the sheet as it stands then: a repaint that set a new menu cancelled one a tap was opening.
        pick.menuOnOpen { [weak self] in
            guard let self, let sheet = inspection.sheet else { return [] }
            return sheet.stories.map { one in
                UIAction(title: Words.Artifacts.storyOption(name: one.name, edited: inspection.dirty(one.name)),
                         state: one.name == inspection.chosen ? .on : .off) { [weak self] _ in
                    self?.inspection.choose(one.name)
                }
            }
        }
        storyPick = pick
        pick.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let duplicate = Self.iconButton(.copy, said: Words.Artifacts.duplicateStory, tip: Words.Artifacts.duplicate) { [weak self] in
            self?.startNaming(.duplicate)
        }
        let up = Self.iconButton(.arrowUp, said: Words.Artifacts.moveStoryUp, tip: Words.Artifacts.moveUp) { [weak self] in
            guard let self, let op = inspection.moveBy(-1) else { return }
            Task { await self.inspection.run(op) }
        }
        let down = Self.iconButton(.arrowDown, said: Words.Artifacts.moveStoryDown, tip: Words.Artifacts.moveDown) { [weak self] in
            guard let self, let op = inspection.moveBy(1) else { return }
            Task { await self.inspection.run(op) }
        }
        let remove = Self.iconButton(.trash, said: Words.Artifacts.removeStory, tip: Words.Artifacts.remove) { [weak self] in
            self?.askRemove()
        }
        duplicateButton = duplicate
        upButton = up
        downButton = down
        removeButton = remove
        let ops = UIStackView(arrangedSubviews: [duplicate, up, down, remove])
        ops.spacing = Space.space1
        let row = UIStackView(arrangedSubviews: [pick, ops])
        row.spacing = Space.space2
        row.alignment = .center
        _ = sheet
        return row
    }

    private static func iconButton(_ glyph: Glyph, said: String, tip: String, action: @escaping () -> Void) -> UIButton {
        let button = KitButton.make("", glyph: glyph, variant: .ghost, height: .sm, action: action)
        button.accessibilityLabel = said
        button.toolTip = tip
        return button
    }

    /// Remove, asked in place (AskHere): its export goes from the file, and its frame from the sheet.
    private func askRemove() {
        guard let name = inspection.story?.name else { return }
        let file = fileName
        ask.ask(.init(title: Words.Artifacts.removeTitle(name: name), body: [Words.Artifacts.removeBody(file: file)],
                      confirmLabel: Words.Artifacts.removeConfirm, pendingLabel: Words.Artifacts.removing,
                      cancelLabel: Words.Artifacts.cancel, destructive: true) { [inspection] in
            if !(await inspection.run(.remove(name))) {
                throw TaskRefusal(message: inspection.problem ?? Words.Artifacts.storyNotRemoved(name: name))
            }
        })
    }

    /// Everything that moves without the body being built again: values, Reset, the buttons' states, the refusal.
    private func paint() {
        let writing = inspection.writing
        if let pick = storyPick, inspection.sheet != nil {
            pick.setValue(Words.Artifacts.storyOption(name: inspection.chosen ?? "", edited: inspection.dirty(inspection.chosen)))
        }
        duplicateButton?.isEnabled = writing == nil
        removeButton?.isEnabled = writing == nil
        upButton?.isEnabled = writing == nil && inspection.moveBy(-1) != nil
        downButton?.isEnabled = writing == nil && inspection.moveBy(1) != nil
        for row in props.values { row.paint() }
        addButton.isEnabled = inspection.sheet != nil && writing == nil
        discardButton.isEnabled = inspection.isDirty && writing == nil
        saveButton.isEnabled = inspection.isDirty && writing != .op
        saveButton.configuration?.showsActivityIndicator = writing == .save
        KitButton.setTitle(writing == .save ? Words.Artifacts.saving : Words.Artifacts.save, of: saveButton, variant: .action, height: .sm)
        saveButton.toolTip = Words.Artifacts.saveTitle(story: inspection.story?.name ?? Words.Artifacts.theStory, file: fileName)
        problem.text = inspection.problem
        problem.isHidden = inspection.problem == nil
        if inspection.problem != nil { UIAccessibility.post(notification: .announcement, argument: inspection.problem) }
        paintNaming()
    }

    // MARK: Add story and Duplicate

    private func startNaming(_ kind: NamingFor) {
        namingFor = kind
        nameField.text = kind == .duplicate ? inspection.story.map { "\($0.name)Copy" } : ""
        naming.isHidden = false
        actions.isHidden = true
        paintNaming()
        nameField.becomeFirstResponder()
        onResize()
    }

    private func stopNaming() {
        namingFor = nil
        nameField.text = ""
        nameField.resignFirstResponder()
        naming.isHidden = true
        actions.isHidden = false
        onResize()
    }

    private func paintNaming() {
        guard let namingFor else { return }
        nameLabel.text = namingFor == .add ? Words.Artifacts.newStoryName
            : Words.Artifacts.nameCopy(story: inspection.story?.name ?? Words.Artifacts.theStory)
        let name = nameField.text ?? ""
        let said = inspection.nameProblem(name, file: fileName)
        nameProblem.text = said
        nameProblem.isHidden = said == nil
        let pending = inspection.writing == .op
        let words = namingFor == .add ? (pending ? Words.Artifacts.adding : Words.Artifacts.addStory)
            : (pending ? Words.Artifacts.duplicating : Words.Artifacts.duplicate)
        KitButton.setTitle(words, of: nameConfirm, variant: .action, height: .sm)
        nameConfirm.configuration?.showsActivityIndicator = pending
        nameConfirm.isEnabled = !name.trimmingCharacters(in: .whitespaces).isEmpty && said == nil && !pending
    }

    private func named() {
        let name = (nameField.text ?? "").trimmingCharacters(in: .whitespaces)
        guard let namingFor, !name.isEmpty, inspection.nameProblem(name, file: fileName) == nil else { return }
        let op: StoryOp = namingFor == .add ? .add(name, args: inspection.current())
            : .duplicate(inspection.story?.name ?? "", as: name)
        Task { [weak self] in
            guard let self else { return }
            if await inspection.run(op) { stopNaming() }
        }
    }

    // MARK: Words

    private static let meta: [NSAttributedString.Key: Any] = [.font: TypeScale.typeMeta.font, .foregroundColor: Palette.inkMuted]
    private static let code: [NSAttributedString.Key: Any] = [.font: TypeScale.typeCode.font, .foregroundColor: Palette.inkMuted]

    /// `.note`: the meta words in the muted ink; `code` set in the code face after them.
    static func note(_ text: String, code: String? = nil, after: String = "") -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        label.wrap = .pretty
        if let code {
            let said = NSMutableAttributedString(string: text + " ", attributes: meta)
            said.append(NSAttributedString(string: code, attributes: Self.code))
            said.append(NSAttributedString(string: after, attributes: meta))
            label.attributedText = said
        } else {
            label.text = text
        }
        return label
    }
}

/// One prop's row: its name, "required", Reset while the story sets it,
/// its control, its type where the control doesn't say it, and its hint.
private final class PropRow: UIStackView {
    private let prop: SheetProp
    private let inspection: SheetInspection
    private let control: SheetControl
    private var reset: UIButton!
    private var segments: KitSegmented?
    private var select: KitSelect?
    private var toggle: UISwitch?
    private var field: KitField?

    /// The prop's type names, which a field or switch already says by being one.
    private static let plainTypes: Set<String> = ["string", "number", "boolean"]

    init(prop: SheetProp, inspection: SheetInspection) {
        self.prop = prop
        self.inspection = inspection
        control = inspection.control(prop)
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space1
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = prop.name
        var head: [UIView] = [name]
        if prop.required {
            let required = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            required.text = Words.Artifacts.required
            head.append(required)
        }
        head.append(UIView())
        reset = KitButton.make("", glyph: .reset, variant: .ghost, height: .xs) { [weak self] in
            guard let self else { return }
            inspection.reset(prop)
        }
        reset.accessibilityLabel = Words.Artifacts.resetProp(prop: prop.name)
        reset.toolTip = Words.Artifacts.resetTitle(prop: prop.name)
        head.append(reset)
        let headRow = UIStackView(arrangedSubviews: head)
        headRow.spacing = Space.space2
        headRow.alignment = .center
        headRow.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space6).isActive = true
        addArrangedSubview(headRow)
        addArrangedSubview(makeControl(named: prop.name))
        let saysType = control == .slot || (control != .code && !Self.plainTypes.contains(prop.raw)
            && control != .segments && control != .select)
        if saysType {
            let type = KitLabel(TypeScale.typeCode, ink: Palette.inkMuted, lines: 0)
            type.text = prop.raw
            addArrangedSubview(type)
        }
        if let hint = prop.description, !hint.isEmpty {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            said.wrap = .pretty
            said.text = hint
            addArrangedSubview(said)
        }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("PropRow is built in code") }

    private func makeControl(named name: String) -> UIView {
        let options = prop.options ?? []
        switch control {
        case .segments:
            let made = KitSegmented(options.map(\.shown), selected: nil)
            made.accessibilityLabel = name
            made.addAction(UIAction { [weak self, weak made] _ in
                guard let self, let index = made?.selectedIndex, options.indices.contains(index) else { return }
                inspection.set(prop, options[index])
            }, for: .valueChanged)
            segments = made
            return made
        case .select:
            let made = KitSelect(small: true)
            made.accessibilityLabel = name
            // Set once and made as it opens, the prop's value checked as it stands then.
            made.menuOnOpen { [weak self] in
                guard let self else { return [] }
                let chosen = inspection.value(prop)?.shown ?? prop.bareDefault ?? ""
                return options.map { option in
                    UIAction(title: option.shown, state: option.shown == chosen ? .on : .off) { [weak self] _ in
                        guard let self else { return }
                        inspection.set(prop, option)
                    }
                }
            }
            select = made
            return made
        case .toggle:
            let made = UISwitch()
            made.onTintColor = Palette.inkStrong
            made.preferredStyle = .sliding
            made.accessibilityLabel = name
            made.addAction(UIAction { [weak self, weak made] _ in
                guard let self, let made else { return }
                inspection.set(prop, .bool(made.isOn))
            }, for: .valueChanged)
            toggle = made
            let row = UIStackView(arrangedSubviews: [made, UIView()])
            return row
        case .text, .number:
            let made = KitField(placeholder: prop.defaultValue ?? "")
            made.accessibilityLabel = name
            made.keyboardType = control == .number ? .decimalPad : .default
            made.addAction(UIAction { [weak self, weak made] _ in
                guard let self, let made else { return }
                inspection.set(prop, typed(made.text ?? ""))
            }, for: .editingChanged)
            // A prop typed with the design system's names offers them (the web's `datalist`).
            if prop.kind.hasPrefix("token-"), !options.isEmpty {
                let offer = UIButton(type: .system)
                offer.setImage(Glyph.chevronDown.image.resized(to: Size.iconMd), for: .normal)
                offer.tintColor = Palette.inkMuted
                offer.showsMenuAsPrimaryAction = true
                offer.accessibilityLabel = name
                offer.menu = UIMenu(children: options.map { option in
                    UIAction(title: option.shown) { [weak self, weak made] _ in
                        guard let self else { return }
                        made?.text = option.shown
                        inspection.set(prop, option)
                    }
                })
                offer.frame = CGRect(x: 0, y: 0, width: Size.cInputH, height: Size.cInputH)
                made.rightView = offer
                made.rightViewMode = .always
            }
            field = made
            return made
        case .slot:
            let line = UIStackView(arrangedSubviews: [GlyphView(.comment, size: Size.iconMd, tint: Palette.inkMuted),
                                                      SheetInspectorView.note(Words.Artifacts.slot)])
            line.spacing = Space.space2
            line.alignment = .center
            return line
        case .code:
            let code = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 0)
            code.text = inspection.code(prop) ?? prop.raw
            let said = SheetInspectorView.note(inspection.code(prop) == nil ? Words.Artifacts.setInFile : Words.Artifacts.codeInFile)
            let stack = UIStackView(arrangedSubviews: [code, said])
            stack.axis = .vertical
            stack.spacing = Space.space1
            return stack
        }
    }

    /// A field's words as the prop takes them: a number where the prop is one, or where the story holds one and the words read as one.
    private func typed(_ raw: String) -> SheetValue {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        let number = Double(trimmed)
        var asNumber = control == .number
        if case .number = inspection.value(prop), number != nil, !trimmed.isEmpty { asNumber = true }
        if asNumber, !trimmed.isEmpty, let number { return .number(number) }
        return .string(raw)
    }

    /// The control as the chosen story mounts it now, and Reset while the story or the person sets it.
    func paint() {
        let value = inspection.value(prop)
        reset.isHidden = !(inspection.own(prop) && control != .code && control != .slot)
        let options = prop.options ?? []
        let chosen = value?.shown ?? prop.bareDefault ?? ""
        if let segments {
            segments.select(options.firstIndex { $0.shown == chosen })
        }
        if let select {
            select.setValue(chosen)
        }
        if let toggle {
            let on = value.map { $0 == .bool(true) } ?? (prop.defaultValue == "true")
            if toggle.isOn != on { toggle.setOn(on, animated: true) }
        }
        // A field the person is typing in keeps their words.
        if let field, !field.isFirstResponder {
            field.text = value?.shown ?? ""
        }
    }
}
