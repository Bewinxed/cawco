import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The project has no stages.md, so the code stages stand in
/// (tasks/StagesControl.svelte). This picks a set for it from the hub's
/// templates: the hub writes stages.md into the project folder as a commit,
/// and the board takes its columns from it from then on. Tasks in a stage the
/// new set lacks keep their stage and stand in "Other stages" until moved.
/// Asked for from the project head's ⋯ (Pick stages…), and opens from it.
final class StagesControl: KitPopoverController {
    private let tasks: ProjectTasks
    private let onApplied: (StagesView) -> Void
    private let intro = UIStackView()
    /// After a set is applied with tasks it lacks: which ones, and where they stand.
    private let result = UIStackView()
    private let stack = UIStackView()
    private let list = UIStackView()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
    private var templates: [StagesTemplateView]?
    private var applying: Components.Schemas.StagesTemplate?
    private static let width = 320.0
    private static let inset = 6 + 1.0

    init(tasks: ProjectTasks, onApplied: @escaping (StagesView) -> Void) {
        self.tasks = tasks
        self.onApplied = onApplied
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StagesControl is built in code")
    }

    /// A template's name as the picker says it.
    static func name(_ template: Components.Schemas.StagesTemplate) -> String {
        switch template {
        case .code: "Code"
        case .social: "Social posts"
        case .outreach: "Outreach"
        case .seo: "SEO"
        case .design: "Design"
        case .launch: "Launch campaign"
        case .brand: "Brand kit"
        case let .unrecognized(raw): TaskWords.stage(raw)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let lead = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        lead.text = "This project has no stages of its own yet"
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        line.text = "The code stages stand in until you pick a set. The set is written to stages.md in the project folder."
        line.wrap = .pretty
        intro.addArrangedSubview(lead)
        intro.addArrangedSubview(line)
        intro.axis = .vertical
        intro.spacing = Space.space1
        intro.isLayoutMarginsRelativeArrangement = true
        intro.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: 0, trailing: Space.space2)
        let problemRow = UIStackView(arrangedSubviews: [problem])
        problemRow.isLayoutMarginsRelativeArrangement = true
        problemRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)
        problem.isHidden = true
        list.axis = .vertical
        result.axis = .vertical
        result.spacing = Space.space3
        result.isLayoutMarginsRelativeArrangement = true
        result.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        result.isHidden = true
        for part in [intro, problemRow, list, result] as [UIView] { stack.addArrangedSubview(part) }
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: Self.inset),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Self.inset),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Self.inset),
        ])
        render()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                templates = try await tasks.templates()
            } catch {
                say(error.localizedDescription)
            }
            render()
        }
    }

    private func say(_ text: String?) {
        problem.text = text
        problem.isHidden = text == nil
    }

    private func render() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let templates {
            for template in templates { list.addArrangedSubview(row(template)) }
        } else if problem.isHidden {
            for _ in 0 ..< 5 {
                let lines = UIStackView(arrangedSubviews: [SkeletonView(height: 14), SkeletonView(height: 12)])
                lines.axis = .vertical
                lines.spacing = Space.space1
                lines.isLayoutMarginsRelativeArrangement = true
                lines.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
                list.addArrangedSubview(lines)
            }
        }
        fit()
    }

    /// The card's size for what it holds now; a change of it morphs the popover.
    private func fit() {
        let width = min(Self.width, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - Self.inset * 2, height: 0), withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    private func row(_ template: StagesTemplateView) -> UIView {
        let button = TemplateRow()
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = Self.name(template.name)
        let chain = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        chain.text = template.stages.filter { $0.kind != .dropped }.map { TaskWords.stage($0.name) }.joined(separator: " → ")
        let head = UIStackView(arrangedSubviews: [name, UIView()])
        head.alignment = .center
        if applying == template.name { head.addArrangedSubview(KitSpinner()) }
        let lines = UIStackView(arrangedSubviews: [head, chain])
        lines.axis = .vertical
        lines.spacing = Space.spaceRow
        button.hold(lines)
        button.isEnabled = applying == nil
        button.accessibilityLabel = "\(name.text ?? ""): \(chain.text ?? "")"
        button.addAction(UIAction { [weak self] _ in self?.apply(template.name) }, for: .touchUpInside)
        return button
    }

    private func apply(_ template: Components.Schemas.StagesTemplate) {
        guard applying == nil else { return }
        applying = template
        say(nil)
        render()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let (stages, stranded) = try await tasks.applyTemplate(template)
                applying = nil
                // The board takes its new columns under the popover.
                onApplied(stages)
                guard !stranded.isEmpty else {
                    dismiss(animated: true)
                    return
                }
                strand(stranded, set: Self.name(template))
            } catch {
                applying = nil
                say(error.localizedDescription)
                render()
            }
        }
    }
}

extension StagesControl {
    /// The set is written and some tasks are in stages it lacks: the popover
    /// becomes what happened, naming them, with Done to put it away.
    fileprivate func strand(_ stranded: [String], set: String) {
        let one = stranded.count == 1
        let lead = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        lead.text = "\(set) stages picked"
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        line.text = "\(stranded.joined(separator: ", ")) \(one ? "is in a stage" : "are in stages") the new set lacks; \(one ? "it stands" : "they stand") in Other stages until moved."
        line.wrap = .pretty
        let done = KitButton.make("Done", variant: .outline, height: .sm) { [weak self] in self?.dismiss(animated: true) }
        let foot = UIStackView(arrangedSubviews: [UIView(), done])
        let words = UIStackView(arrangedSubviews: [lead, line])
        words.axis = .vertical
        words.spacing = Space.space1
        for part in [words, foot] as [UIView] { result.addArrangedSubview(part) }
        intro.isHidden = true
        list.isHidden = true
        result.isHidden = false
        fit()
        UIAccessibility.post(notification: .announcement, argument: line.text)
    }
}

/// A template in the list (`kit-item`): its name and its chain, pressable.
private final class TemplateRow: UIControl {
    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TemplateRow is built in code")
    }

    func hold(_ content: UIView) {
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
        ])
    }

    override var isEnabled: Bool {
        didSet { alpha = isEnabled ? 1 : 0.5 }
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }
}
