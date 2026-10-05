import CawCoDesign
import UIKit

/// The workflows pages' form controls (workflows.css `.wf input`, `select`,
/// `textarea`): the raised surface inside the 1pt control border at
/// `--radius-sm`, 7pt by 11pt in, strong ink in the face of the label that
/// holds them; 36pt under a pointer, and 44pt at 16pt type under a finger.
@MainActor
enum WorkflowForm {
    static var coarse: Bool { UITraitCollection.current.userInterfaceIdiom != .mac }
    static var height: Double { coarse ? Size.cBtnHLg : Size.cBtnH }
    /// One line of the control's text at the page's line height.
    static var line: Double { text(role()).lineHeight }
    /// A text area is its two rows inside its padding and border under a
    /// finger (the 44pt floor replaces the 90pt one there), 90pt under a pointer.
    static var areaHeight: Double { coarse ? line * 2 + (Space.space2 + 1) * 2 : 90 }

    static func role(mono: Bool = false) -> TypeRole {
        let role = TypeScale.typeLabel.with(points: coarse ? 16 : TypeScale.typeLabel.points)
        return mono ? role.with(family: FontFamily.fontMono) : role
    }

    /// A role as the workflows pages set it: `.wf` restates a role's size and
    /// weight and leaves the line height the page's own, the body's.
    static func text(_ role: TypeRole) -> TypeRole {
        role.with(leading: TypeScale.leadingBody)
    }

    /// A control under its name (`.wf label`): muted ink in the label role, 7pt above it.
    static func labelled(_ name: String, _ control: UIView) -> UIStackView {
        let label = KitLabel(text(TypeScale.typeLabel), ink: Palette.inkMuted, lines: 0)
        label.text = name
        control.accessibilityLabel = name
        let column = UIStackView(arrangedSubviews: [label, control])
        column.axis = .vertical
        column.spacing = Space.space2
        return column
    }

    /// The control's edge: the focus ring while it has the keyboard, the
    /// error edge while a required value is missing, the control border else.
    static func edge(_ layer: CALayer, focused: Bool, missing: Bool, traits: UITraitCollection) {
        let ink = focused ? Palette.focusRing : (missing ? Palette.error9 : Palette.borderControl)
        layer.borderColor = ink.resolvedColor(with: traits).cgColor
        layer.borderWidth = focused ? Size.focusRingWidth : 1
    }
}

/// `.wf input`: one line; `mono` is `.wf-mono` (a directory).
final class WorkflowInput: UITextField, UITextFieldDelegate {
    /// A required value was asked for and is not there yet.
    var missing = false { didSet { paint() } }
    var ringed = false { didSet { paint() } }

    init(mono: Bool = false) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        font = WorkflowForm.role(mono: mono).font
        textColor = Palette.inkStrong
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        autocorrectionType = .no
        autocapitalizationType = .none
        spellCheckingType = .no
        returnKeyType = .done
        delegate = self
        heightAnchor.constraint(equalToConstant: WorkflowForm.height).isActive = true
        addAction(UIAction { [weak self] _ in self?.missing = false }, for: .editingChanged)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (field: WorkflowInput, _: UITraitCollection) in field.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowInput is built in code")
    }

    override func textRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: Space.space3 + 1, dy: 0) }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: Space.space3 + 1, dy: 0) }

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

    func textFieldShouldReturn(_: UITextField) -> Bool {
        resignFirstResponder()
        return true
    }

    private func paint() {
        WorkflowForm.edge(layer, focused: isFirstResponder || ringed, missing: missing, traits: traitCollection)
    }
}

/// A form control that can wear the focus ring without holding the keyboard:
/// the web focuses a dialog's first control as it opens, and Mobile Safari
/// draws the ring there without raising the keys.
@MainActor
protocol WorkflowRinged: UIView {
    var ringed: Bool { get set }
}

extension WorkflowInput: WorkflowRinged {}
extension WorkflowTextArea: WorkflowRinged {}
extension WorkflowSelect: WorkflowRinged {}

/// `.wf textarea`: two rows tall at the least, growing with what is written.
final class WorkflowTextArea: UITextView, UITextViewDelegate {
    var missing = false { didSet { paint() } }
    var ringed = false { didSet { paint() } }
    /// The control's face at the page's line height, wrapping by word.
    private let attributes: [NSAttributedString.Key: Any] = {
        var attributes = WorkflowForm.text(WorkflowForm.role()).attributes(color: Palette.inkStrong)
        if let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byWordWrapping
            attributes[.paragraphStyle] = paragraph
        }
        return attributes
    }()

    /// What it holds, set in its own face.
    func set(_ value: String) {
        attributedText = NSAttributedString(string: value, attributes: attributes)
        typingAttributes = attributes
    }

    init() {
        super.init(frame: .zero, textContainer: nil)
        translatesAutoresizingMaskIntoConstraints = false
        typingAttributes = attributes
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        isScrollEnabled = false
        autocorrectionType = .no
        autocapitalizationType = .none
        spellCheckingType = .no
        textContainer.lineFragmentPadding = 0
        textContainerInset = UIEdgeInsets(top: Space.space2 + 1, left: Space.space3 + 1, bottom: Space.space2 + 1, right: Space.space3 + 1)
        delegate = self
        heightAnchor.constraint(greaterThanOrEqualToConstant: WorkflowForm.areaHeight).isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (area: WorkflowTextArea, _: UITraitCollection) in area.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowTextArea is built in code")
    }

    func textViewDidChange(_: UITextView) { missing = false }
    func textViewDidBeginEditing(_: UITextView) { paint() }
    func textViewDidEndEditing(_: UITextView) { paint() }

    private func paint() {
        WorkflowForm.edge(layer, focused: isFirstResponder || ringed, missing: missing, traits: traitCollection)
    }
}

/// `.wf select`: the chosen option's name in the control's box, the options a menu.
final class WorkflowSelect: UIButton {
    struct Option {
        let value: String
        let label: String
        var disabled = false
    }

    var onChange: (String) -> Void = { _ in }
    var missing = false { didSet { paint() } }
    var ringed = false { didSet { paint() } }
    private(set) var value = ""
    private var options: [Option] = []

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = Glyph.chevronDown.image.resized(to: Size.iconSm)
        config.imagePlacement = .trailing
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3 + 1, bottom: 0, trailing: Space.space3 + 1)
        config.background.backgroundColor = Palette.surfaceRaised
        config.background.cornerRadius = Radius.radiusSm
        config.titleLineBreakMode = .byTruncatingTail
        configuration = config
        contentHorizontalAlignment = .fill
        showsMenuAsPrimaryAction = true
        houseStyle()
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        heightAnchor.constraint(equalToConstant: WorkflowForm.height).isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (select: WorkflowSelect, _: UITraitCollection) in select.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowSelect is built in code")
    }

    /// The options, and the one chosen.
    func set(_ next: [Option], value chosen: String) {
        options = next
        value = chosen
        let shown = next.first { $0.value == chosen }?.label ?? ""
        configuration?.attributedTitle = AttributedString(shown, attributes: AttributeContainer(WorkflowForm.role().attributes(color: Palette.inkStrong)))
        accessibilityValue = shown
        menu = UIMenu(options: .singleSelection, children: next.map { option in
            UIAction(title: option.label, attributes: option.disabled ? .disabled : [], state: option.value == chosen ? .on : .off) { [weak self] _ in
                guard let self else { return }
                missing = false
                set(options, value: option.value)
                onChange(option.value)
            }
        })
    }

    private func paint() {
        WorkflowForm.edge(layer, focused: ringed, missing: missing, traits: traitCollection)
    }
}
