import CawCoCore
import CawCoDesign
import UIKit

/// An on/off setting (SwitchField.svelte): the switch, its label, and what
/// the current state means, 10pt beside it.
final class SwitchField: UIStackView {
    let toggle = UISwitch()
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// The switch moved; it shows the new value until the caller says otherwise.
    var onChange: ((Bool) -> Void)?

    init(label text: String) {
        super.init(frame: .zero)
        alignment = .top
        spacing = 10
        toggle.onTintColor = Palette.inkStrong
        // A switch, as the web's (switch.svelte): the Mac idiom draws one as a checkbox unless asked.
        toggle.preferredStyle = .sliding
        toggle.accessibilityLabel = text
        toggle.setContentHuggingPriority(.required, for: .horizontal)
        toggle.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onChange?(toggle.isOn)
        }, for: .valueChanged)
        label.text = text
        label.isAccessibilityElement = false
        hint.wrap = .pretty
        let copy = UIStackView(arrangedSubviews: [label, hint])
        copy.axis = .vertical
        copy.spacing = 2
        addArrangedSubview(toggle)
        addArrangedSubview(copy)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SwitchField is built in code")
    }

    /// The stored value, what it means, and whether it can be changed now.
    func set(on: Bool, hint text: String?, enabled: Bool = true) {
        if toggle.isOn != on { toggle.setOn(on, animated: window != nil) }
        hint.text = text
        hint.isHidden = text?.isEmpty ?? true
        toggle.isEnabled = enabled
        toggle.accessibilityHint = text
    }
}

/// A labelled control (Field.svelte): the label above, then one line under
/// it that says the problem, a caution, or the hint, in that order.
final class ConfigField: UIStackView {
    private let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)

    init(label text: String, control: UIView) {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 6
        label.text = text
        control.accessibilityLabel = control.accessibilityLabel ?? text
        line.wrap = .pretty
        line.isHidden = true
        addArrangedSubview(label)
        addArrangedSubview(control)
        addArrangedSubview(line)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ConfigField is built in code")
    }

    /// The label, said anew (a field whose service changed).
    func setLabel(_ text: String) {
        label.text = text
        label.isHidden = text.isEmpty
    }

    /// `say`, its hint and caution shared words whose backticked runs are code (Coded.svelte).
    func sayCoded(_ hint: String?, warn: String? = nil, problem: String? = nil) {
        say(hint: hint, warn: warn, problem: problem)
        guard problem == nil, let text = warn ?? hint else { return }
        line.attributedText = TypeScale.typeMeta.coded(text, color: warn != nil ? Palette.statusAttnInk : Palette.inkMuted)
    }

    /// The line under the control: a refusal, else a caution, else the hint.
    func say(hint: String? = nil, warn: String? = nil, problem: String? = nil) {
        let text = problem ?? warn ?? hint
        let ink: UIColor = problem != nil ? Palette.statusFailInk : warn != nil ? Palette.statusAttnInk : Palette.inkMuted
        line.text = text
        line.ink = ink
        let hidden = text?.isEmpty ?? true
        guard line.isHidden != hidden else { return }
        // The line folds open and shut when there is something, or nothing, to say.
        Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durControl) {
            self.line.isHidden = hidden
            self.layoutIfNeeded()
        }.startAnimation()
    }
}

/// The kit's Textarea (ui/textarea): the input's surface, border and ring,
/// body type, `px-3 py-2` in, four lines tall before it grows with what it holds.
final class ConfigTextArea: UITextView {
    private let placeholder = KitLabel(TypeScale.typeBody, ink: Palette.mutedForeground, lines: 0)

    init(placeholder words: String) {
        super.init(frame: .zero, textContainer: nil)
        translatesAutoresizingMaskIntoConstraints = false
        font = TypeScale.typeBody.font
        textColor = Palette.inkStrong
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowXs
        isScrollEnabled = false
        textContainerInset = UIEdgeInsets(top: 8, left: 12 - 5, bottom: 8, right: 12 - 5)
        autocorrectionType = .no
        // `rows={4}`.
        heightAnchor.constraint(greaterThanOrEqualToConstant: TypeScale.typeBody.font.lineHeight * 4 + 16).isActive = true
        placeholder.text = words
        placeholder.isUserInteractionEnabled = false
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        addSubview(placeholder)
        NSLayoutConstraint.activate([
            placeholder.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            placeholder.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            placeholder.widthAnchor.constraint(equalTo: widthAnchor, constant: -24),
        ])
        NotificationCenter.default.addObserver(forName: UITextView.textDidChangeNotification, object: self, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.paint() }
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (area: ConfigTextArea, _: UITraitCollection) in area.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfigTextArea is built in code")
    }

    override var text: String! {
        didSet { paint() }
    }

    @discardableResult
    override func becomeFirstResponder() -> Bool {
        defer { paint() }
        return super.becomeFirstResponder()
    }

    @discardableResult
    override func resignFirstResponder() -> Bool {
        defer { paint() }
        return super.resignFirstResponder()
    }

    private func paint() {
        placeholder.isHidden = !(text ?? "").isEmpty
        layer.borderColor = (isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
        layer.borderWidth = isFirstResponder ? Size.focusRingWidth : 1
    }
}

/// A choice between a few named options (Choice.svelte): the kit's
/// segmented control, its label for VoiceOver alone; a row too long for a
/// narrow screen scrolls sideways rather than running off it.
final class ChoiceField: UIScrollView {
    var onChange: (String) -> Void = { _ in }
    private let tabs = SegmentedTabs([])
    private var values: [String] = []

    init(label: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        showsHorizontalScrollIndicator = false
        tabs.accessibilityLabel = label
        addSubview(tabs)
        // As wide as its options, the field's width at most.
        let fit = widthAnchor.constraint(equalTo: tabs.widthAnchor)
        fit.priority = .defaultHigh
        NSLayoutConstraint.activate([
            tabs.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor),
            tabs.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor),
            tabs.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor),
            tabs.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor),
            heightAnchor.constraint(equalTo: tabs.heightAnchor),
            fit,
        ])
        tabs.addAction(UIAction { [weak self] _ in
            guard let self, values.indices.contains(tabs.selectedIndex) else { return }
            onChange(values[tabs.selectedIndex])
        }, for: .valueChanged)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ChoiceField is built in code")
    }

    /// The options, each its value and its words, and the one chosen.
    func set(_ options: [(value: String, label: String)], value: String) {
        values = options.map(\.value)
        tabs.set(options.map { SegmentedTabs.Item($0.label) }, selected: values.firstIndex(of: value) ?? 0)
    }
}

/// Which model a form names (ModelCombobox.svelte): the id typed in the
/// code face, its ⋯ the harness's models as the machines report them, one
/// tap filling the field; an id the list has not learned goes through as typed.
final class ModelField: UIStackView {
    var onChange: () -> Void = {}
    private let field = KitField(placeholder: "", mono: true)
    private let pick = KitSelect()

    var text: String {
        get { field.text ?? "" }
        set { field.text = newValue }
    }

    init() {
        super.init(frame: .zero)
        spacing = 8
        alignment = .center
        field.accessibilityLabel = Words.DelegateTypes.model
        field.addAction(UIAction { [weak self] _ in self?.onChange() }, for: .editingChanged)
        pick.setValue("")
        pick.accessibilityLabel = Words.DelegateTypes.model
        // The models on offer as it opens, the typed one checked.
        pick.menuOnOpen { [weak self] in
            guard let self else { return [] }
            return offered.map { model in
                UIAction(title: model, state: model == text ? .on : .off) { [weak self] _ in
                    self?.field.text = model
                    self?.onChange()
                }
            }
        }
        pick.setContentHuggingPriority(.required, for: .horizontal)
        pick.widthAnchor.constraint(equalToConstant: Size.cInputH).isActive = true
        addArrangedSubview(field)
        addArrangedSubview(pick)
        field.widthAnchor.constraint(lessThanOrEqualToConstant: 448).isActive = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ModelField is built in code")
    }

    /// The models on offer for the harness now.
    func offer(_ models: [String]) {
        pick.isHidden = models.isEmpty
        offered = models
    }

    private var offered: [String] = []
}

/// The name of the thing being edited, typed where its title reads
/// (TitleInput.svelte): the title role, no border, the subtle ink for its placeholder.
final class TitleInput: UITextField {
    var invalid = false { didSet { accessibilityValue = invalid ? "Invalid" : nil } }

    init(label: String, placeholder: String, mono: Bool = false) {
        super.init(frame: .zero)
        let role = TypeScale.typeTitle
        font = mono ? TypeScale.typeCode.font.withSize(role.font.pointSize) : role.font
        textColor = Palette.inkStrong
        attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.foregroundColor: Palette.inkSubtle, .font: font as Any])
        accessibilityLabel = label
        autocorrectionType = .no
        autocapitalizationType = .none
        spellCheckingType = .no
        borderStyle = .none
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TitleInput is built in code")
    }
}
