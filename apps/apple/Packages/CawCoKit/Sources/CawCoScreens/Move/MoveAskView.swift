import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// What "Move it" does, as the person reads it before saying it (the
/// owner's pick D, "Plain + details"; move/MoveAsk.svelte): its lines, then
/// the git terms behind a Details fold. New session's step 2 and the
/// pane's approval card both draw it, from the hub's words (core `MoveAsk`).
final class MoveAskView: UIStackView {
    private let details = UIView()
    private let chevron = GlyphView(.chevronRight, size: 12, tint: Palette.inkMuted)
    private let toggle = UIControl()
    var onResize: () -> Void = {}

    init(_ ask: Components.Schemas.MoveAsk) {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        alignment = .fill
        translatesAutoresizingMaskIntoConstraints = false
        for (index, text) in ask.lines.enumerated() {
            let line = KitLabel(TypeScale.typeBody, ink: index == 0 ? Palette.inkStrong : Palette.inkMuted, lines: 0)
            line.wrap = .pretty
            line.text = text
            addArrangedSubview(line)
        }
        // The fold's trigger: "Details" and its chevron, a 44pt target.
        let word = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        word.text = "Details"
        let row = UIStackView(arrangedSubviews: [word, chevron])
        row.spacing = Space.space1
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        toggle.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: toggle.leadingAnchor),
            row.trailingAnchor.constraint(lessThanOrEqualTo: toggle.trailingAnchor),
            row.centerYAnchor.constraint(equalTo: toggle.centerYAnchor),
            toggle.heightAnchor.constraint(equalToConstant: 32),
        ])
        toggle.isAccessibilityElement = true
        toggle.accessibilityLabel = "Details"
        toggle.accessibilityTraits = .button
        toggle.accessibilityValue = "Collapsed"
        toggle.addAction(UIAction { [weak self] _ in self?.fold() }, for: .touchUpInside)
        let trigger = UIView()
        trigger.addSubview(toggle)
        toggle.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            toggle.topAnchor.constraint(equalTo: trigger.topAnchor),
            toggle.bottomAnchor.constraint(equalTo: trigger.bottomAnchor),
            toggle.leadingAnchor.constraint(equalTo: trigger.leadingAnchor),
            toggle.widthAnchor.constraint(greaterThanOrEqualToConstant: 88),
        ])
        addArrangedSubview(trigger)
        // The git terms, one per line, in the code face on the recess.
        details.backgroundColor = Palette.surfaceRecess
        details.layer.cornerRadius = Radius.radiusSm
        details.layer.cornerCurve = .continuous
        let code = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 0)
        code.text = ask.details.joined(separator: "\n")
        code.translatesAutoresizingMaskIntoConstraints = false
        details.addSubview(code)
        NSLayoutConstraint.activate([
            code.topAnchor.constraint(equalTo: details.topAnchor, constant: Space.space3),
            code.bottomAnchor.constraint(equalTo: details.bottomAnchor, constant: -Space.space3),
            code.leadingAnchor.constraint(equalTo: details.leadingAnchor, constant: Space.space3),
            code.trailingAnchor.constraint(equalTo: details.trailingAnchor, constant: -Space.space3),
        ])
        details.isHidden = true
        addArrangedSubview(details)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("MoveAskView is built in code") }

    /// The fold opens and shuts in place, the chevron turning with it.
    private func fold() {
        let open = details.isHidden
        toggle.accessibilityValue = open ? "Expanded" : "Collapsed"
        let change: @MainActor @Sendable () -> Void = {
            self.details.isHidden = !open
            self.details.alpha = open ? 1 : 0
            self.chevron.transform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
            self.onResize()
        }
        if UIAccessibility.isReduceMotionEnabled || window == nil {
            change()
        } else {
            Motion.easeOut.animator(Motion.durControl, animations: change).startAnimation()
        }
    }
}
