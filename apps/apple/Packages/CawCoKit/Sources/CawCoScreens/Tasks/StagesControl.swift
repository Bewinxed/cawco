import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The project has no stages.md, so the code stages stand in
/// (tasks/StagesControl.svelte). This picks a set for it from the hub's
/// templates: the hub writes stages.md into the project folder as a commit,
/// and the board takes its columns from it from then on, under the popover.
/// Tasks in a stage the new set lacks keep their stage and stand in "Other
/// stages" until moved.
///
/// A set that keeps every task's stage is written at once. One that lacks
/// stages tasks stand in asks first, under the set, naming those tasks and
/// where each stands: the consequence of the choice, said before it is made.
/// A refusal stays where it was asked, with Try again. Asked for from the
/// project head's ⋯ (Pick stages…), and opens from it.
final class StagesControl: KitPopoverController {
    private let api: ProjectTasks
    private let tasks: [TaskSummary]
    private let onApplied: (StagesView) -> Void
    private let stack = UIStackView()
    private let list = UIStackView()
    private let fault = UIStackView()
    private let faultLine = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
    private var again: UIButton!
    private var templates: [StagesTemplateView]?
    private var readProblem: String?
    /// A set being written with nothing to ask.
    private var applying: Components.Schemas.StagesTemplate?
    /// The set whose question stands under it, while it does.
    private var asking: Components.Schemas.StagesTemplate?
    private var askPending = false
    private var askProblem: String?
    /// A refusal of a set written at once, and the set Try again writes.
    private var problem: String?
    private var lastAsked: StagesTemplateView?
    private static let width = 320.0
    private static let inset = 6 + 1.0

    /// `tasks`: the project's tasks, so a set that lacks their stages names them first.
    init(api: ProjectTasks, tasks: [TaskSummary], onApplied: @escaping (StagesView) -> Void) {
        self.api = api
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
        case .launch: "Launch campaign"
        case .seo: "SEO"
        case .brand: "Brand kit"
        case .design: "Design"
        case .social: "Social posts"
        case .outreach: "Outreach"
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
        let intro = UIStackView(arrangedSubviews: [lead, line])
        intro.axis = .vertical
        intro.spacing = Space.space1
        intro.isLayoutMarginsRelativeArrangement = true
        intro.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: 0, trailing: Space.space2)

        // RowFault: the reason, and Try again for the set last asked.
        again = KitButton.make("Try again", variant: .ghost, height: .xs) { [weak self] in
            guard let self, let lastAsked else { return }
            apply(lastAsked)
        }
        again.setContentHuggingPriority(.required, for: .horizontal)
        fault.addArrangedSubview(faultLine)
        fault.addArrangedSubview(again)
        fault.spacing = Space.space2
        fault.alignment = .firstBaseline
        fault.isLayoutMarginsRelativeArrangement = true
        fault.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)

        list.axis = .vertical
        for part in [intro, fault, list] as [UIView] { stack.addArrangedSubview(part) }
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
                templates = try await api.templates()
            } catch {
                readProblem = error.localizedDescription
            }
            render()
        }
    }

    // MARK: Choosing a set

    /// The tasks a set strands: in a stage it lacks, each with where it stands.
    private func stranded(by template: StagesTemplateView) -> [TaskSummary] {
        let kept = Set(template.stages.map(\.name))
        return tasks.filter { !kept.contains($0.stage) }
    }

    private func apply(_ template: StagesTemplateView) {
        guard applying == nil, !askPending else { return }
        lastAsked = template
        problem = nil
        if !stranded(by: template).isEmpty {
            // One question at a time, under the set it is about.
            asking = template.name
            askProblem = nil
            render()
            return
        }
        asking = nil
        applying = template.name
        render()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await write(template.name)
            } catch {
                applying = nil
                problem = error.localizedDescription
                render()
                UIAccessibility.post(notification: .announcement, argument: problem)
            }
        }
    }

    /// The question's Use: writes the set, its answer or its refusal said in the question.
    private func confirm(_ template: StagesTemplateView) {
        guard !askPending else { return }
        askPending = true
        askProblem = nil
        render()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await write(template.name)
            } catch {
                askPending = false
                askProblem = error.localizedDescription
                render()
                UIAccessibility.post(notification: .announcement, argument: askProblem)
            }
        }
    }

    /// Writes the set; the board takes its columns from the answer, and the picker goes.
    private func write(_ name: Components.Schemas.StagesTemplate) async throws {
        let (stages, _) = try await api.applyTemplate(name)
        onApplied(stages)
        dismiss(animated: true)
    }

    // MARK: Drawing

    private func render() {
        let reason = problem ?? (templates == nil ? readProblem : nil)
        faultLine.text = reason
        again.isHidden = problem == nil || lastAsked == nil || applying != nil
        fault.isHidden = reason == nil
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let templates {
            for template in templates {
                list.addArrangedSubview(row(template))
                if asking == template.name { list.addArrangedSubview(question(template)) }
            }
        } else if readProblem == nil {
            for _ in 0 ..< 7 {
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
        button.isEnabled = applying == nil && !askPending
        button.accessibilityLabel = "\(name.text ?? ""): \(chain.text ?? "")"
        button.accessibilityTraits = asking == template.name ? [.button, .selected] : .button
        button.addAction(UIAction { [weak self] _ in self?.apply(template) }, for: .touchUpInside)
        return button
    }

    /// The question under a set that strands tasks: what happens to which
    /// task, then Cancel and Use.
    private func question(_ template: StagesTemplateView) -> UIView {
        let set = Self.name(template.name)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        title.text = "Use the \(set) stages?"
        title.accessibilityTraits = .header
        let body = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        body.text = "The set lacks the stage each task below stands in. Each keeps its stage and stands in Other stages until moved."
        body.wrap = .pretty
        let items = UIStackView(arrangedSubviews: stranded(by: template).map { task in
            let name = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkStrong)
            name.text = "\(task.id) \(task.title)"
            name.lineBreakMode = .byTruncatingTail
            name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let stage = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            stage.text = TaskWords.stage(task.stage)
            stage.setContentCompressionResistancePriority(.required, for: .horizontal)
            let line = UIStackView(arrangedSubviews: [GlyphView(.toolTodo, size: Size.iconSm, tint: Palette.inkMuted), name, UIView(), stage])
            line.spacing = Space.space2
            line.alignment = .center
            line.isAccessibilityElement = true
            line.accessibilityLabel = "\(task.id) \(task.title), \(stage.text ?? "")"
            return line
        })
        items.axis = .vertical
        items.spacing = Space.space1
        let refused = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
        refused.text = askProblem
        refused.isHidden = askProblem == nil
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in
            self?.asking = nil
            self?.askProblem = nil
            self?.render()
        }
        cancel.isEnabled = !askPending
        let use = KitButton.make(askPending ? "Writing stages.md…" : "Use \(set)", variant: .action, height: .sm) { [weak self] in
            self?.confirm(template)
        }
        use.configuration?.showsActivityIndicator = askPending
        use.isEnabled = !askPending
        let actions = UIStackView(arrangedSubviews: [UIView(), cancel, use])
        actions.spacing = Space.space1
        actions.alignment = .center
        let ask = UIStackView(arrangedSubviews: [title, body, items, refused, actions])
        ask.axis = .vertical
        ask.spacing = Space.space2
        ask.setCustomSpacing(Space.space1, after: title)
        ask.isLayoutMarginsRelativeArrangement = true
        ask.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
        ask.backgroundColor = Palette.surfaceBand
        ask.layer.cornerRadius = Radius.radiusSm
        ask.layer.cornerCurve = .continuous
        return ask
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
