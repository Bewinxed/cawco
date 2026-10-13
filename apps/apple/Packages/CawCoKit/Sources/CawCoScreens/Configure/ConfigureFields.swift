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
