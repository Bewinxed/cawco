import UIKit

/// The kit's Input (ui/input/input.svelte): 36pt, `--radius-md`, 1pt
/// control border on the raised surface with the extra-small shadow, 12pt
/// in, body type in strong ink, the placeholder muted. `mono` sets the
/// mono face (a path). Focused, it takes the focus ring.
public final class KitField: UITextField {
    public init(placeholder: String = "", mono: Bool = false) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let role = mono ? TypeScale.typeCode.with(points: TypeScale.typeBody.points) : TypeScale.typeBody
        font = role.font
        textColor = Palette.inkStrong
        attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.font: role.font, .foregroundColor: Palette.mutedForeground])
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowXs
        autocorrectionType = .no
        autocapitalizationType = .none
        spellCheckingType = .no
        heightAnchor.constraint(equalToConstant: Size.cInputH).isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (field: KitField, _: UITraitCollection) in field.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitField is built in code")
    }

    override public func textRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }
    override public func editingRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }
    override public func placeholderRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }

    @discardableResult
    override public func becomeFirstResponder() -> Bool {
        defer { paint() }
        return super.becomeFirstResponder()
    }

    @discardableResult
    override public func resignFirstResponder() -> Bool {
        defer { paint() }
        return super.resignFirstResponder()
    }

    private func paint() {
        layer.borderColor = (isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
        layer.borderWidth = isFirstResponder ? Size.focusRingWidth : 1
    }
}

/// The kit's Select trigger (ui/select): the input's look, the field's
/// surface and border at the input's 36pt (`h-9`), or 30pt when `small`
/// (`size="sm"`), its value in label type, the unfold mark at the end; its
/// options are a menu.
public final class KitSelect: UIButton {
    public init(small: Bool = false) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        // select-trigger.svelte's `IconUnfold`.
        config.image = Glyph.unfold.image.resized(to: Size.iconMd)
        config.imagePlacement = .trailing
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 10)
        config.background.backgroundColor = Palette.surfaceRaised
        config.background.cornerRadius = Radius.radiusMd
        config.background.strokeColor = Palette.borderControl
        config.background.strokeWidth = 1
        configuration = config
        contentHorizontalAlignment = .fill
        showsMenuAsPrimaryAction = true
        changesSelectionAsPrimaryAction = false
        houseStyle()
        heightAnchor.constraint(equalToConstant: small ? Size.cBtnHSm : Size.cInputH).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitSelect is built in code")
    }

    public func setValue(_ text: String) {
        configuration?.attributedTitle = AttributedString(text, attributes: TypeScale.typeLabel.withWeight(.regular).container(color: Palette.foreground))
        configuration?.titleLineBreakMode = .byTruncatingTail
        accessibilityValue = text
    }
}
