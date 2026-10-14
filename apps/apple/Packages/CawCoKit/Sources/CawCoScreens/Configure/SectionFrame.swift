import CawCoCore
import CawCoDesign
import UIKit

/// The one section template (SectionFrame.svelte): a recessed ground holding
/// one raised card. Its header carries the title, the section's purpose in
/// one line, and its actions; an optional toolbar row, above the rows, holds
/// the controls that act on them. Until the rows are read once, three
/// skeleton rows stand where they will; an error the first read hit stands
/// alone, and one a later read hit sits above the last rows read.
///
/// On a compact width the section is a page pushed over the list, and the
/// navigation bar carries its title (HIG Lists and tables: "iOS Settings
/// uses a hierarchy of lists"); the card keeps the purpose line.
class ConfigSectionController: ObservedViewController {
    let section: ConfigSection
    let context: ShellContext
    var hub: HubConnection { context.hub }

    let scroll = UIScrollView()
    /// The raised card on the recess.
    let card = UIView()
    /// The header's trailing actions.
    let actions = UIStackView()
    /// Controls that act on the rows, arriving with them.
    let toolbar = UIStackView()
    /// The rows: what the section shows once read, `space5` apart.
    let content = UIStackView()

    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    private let purposeLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private let body = UIStackView()
    private let skeleton = UIStackView()
    private let problemSlot = UIStackView()
    private let slot = UIStackView()

    /// The rows have been read once.
    var ready = false { didSet { if ready != oldValue { drawFrame(animated: true) } } }
    /// Why the rows could not be read.
    var problem: String? { didSet { if problem != oldValue { drawFrame(animated: false) } } }

    init(section: ConfigSection, context: ShellContext) {
        self.section = section
        self.context = context
        super.init(nibName: nil, bundle: nil)
        navigationItem.title = section.label
        navigationItem.largeTitleDisplayMode = .never
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfigSectionController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        view.accessibilityIdentifier = "config.section.\(section.slug)"
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)

        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(card)

        titleLabel.text = section.label
        titleLabel.accessibilityTraits = .header
        titleLabel.tracking = -0.01
        // Only a section whose rows don't say what it is carries the line (core `CONFIG_SECTIONS`).
        purposeLabel.text = section.purpose
        purposeLabel.isHidden = section.purpose == nil
        purposeLabel.wrap = .pretty
        let titles = UIStackView(arrangedSubviews: [titleLabel, purposeLabel])
        titles.axis = .vertical
        titles.spacing = 4
        actions.spacing = 8
        actions.alignment = .center
        let head = UIStackView(arrangedSubviews: [titles, actions])
        head.alignment = .top
        head.spacing = 12
        actions.setContentHuggingPriority(.required, for: .horizontal)
        titles.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        toolbar.spacing = 8
        toolbar.alignment = .center
        toolbar.isHidden = true
        problemSlot.axis = .vertical
        content.axis = .vertical
        content.spacing = Space.space5
        slot.axis = .vertical
        slot.spacing = Space.space5
        for part in [toolbar, problemSlot, content] { slot.addArrangedSubview(part) }

        skeleton.axis = .vertical
        skeleton.spacing = 2
        skeleton.accessibilityLabel = Words.Configure.loading
        skeleton.isAccessibilityElement = true
        // `h-14`: the height a two-line row takes.
        for _ in 0 ..< 3 { skeleton.addArrangedSubview(SkeletonView(height: 56)) }

        body.axis = .vertical
        body.spacing = Space.space6
        body.translatesAutoresizingMaskIntoConstraints = false
        for part in [head, skeleton, slot] { body.addArrangedSubview(part) }
        card.addSubview(body)

        let safe = view.safeAreaLayoutGuide
        // The card fills the pane's height, one gutter above its foot; taller rows scroll the ground.
        let fills = card.heightAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor, constant: -Space.space2 * 2)
        let wide = card.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            // `.ground`: the pages' gutter, `space2` above and below and `space5` at the side.
            card.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: Space.space2),
            card.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space5),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            // `.body`: 980pt at most, at the pane's leading edge.
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 980),
            // Never wider than the pane's gutters: what the rows hold wraps inside it.
            card.widthAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2),
            wide,
            fills,
            body.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space6),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space7),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space7),
            body.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -Space.space6),
        ])
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (controller: ConfigSectionController, _: UITraitCollection) in
            controller.drawTitle()
        }
        drawTitle()
        drawFrame(animated: false)
    }

    /// A compact width's navigation bar says the title; a wide card says it itself.
    private func drawTitle() {
        titleLabel.isHidden = traitCollection.horizontalSizeClass == .compact
    }

    /// Skeleton, problem alone, or the rows (with a later read's problem above them).
    private func drawFrame(animated: Bool) {
        guard isViewLoaded else { return }
        problemSlot.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let problem {
            problemSlot.addArrangedSubview(KitAlert(problem, tone: .destructive, glyph: .warning))
        }
        let showRows = ready
        skeleton.isHidden = showRows || problem != nil
        // Before the first read the problem stands alone, where the rows will be.
        content.isHidden = !showRows
        toolbar.isHidden = !showRows || toolbar.arrangedSubviews.isEmpty
        guard animated, showRows, !UIAccessibility.isReduceMotionEnabled else {
            slot.alpha = 1
            return
        }
        // `appear`: the rows fade in where the skeleton stood.
        slot.alpha = 0
        Motion.easeOut.animator(Motion.durControl) { self.slot.alpha = 1 }.startAnimation()
    }

    /// The header's actions, replaced.
    func setActions(_ views: [UIView]) {
        actions.arrangedSubviews.forEach { $0.removeFromSuperview() }
        views.forEach(actions.addArrangedSubview)
        actions.isHidden = views.isEmpty
    }

    /// The rows, replaced.
    func setContent(_ views: [UIView]) {
        content.arrangedSubviews.forEach { $0.removeFromSuperview() }
        views.forEach(content.addArrangedSubview)
    }
}

extension ConfigSection {
    /// What an editor shows when the row it names is not in the list
    /// (Missing.svelte): the section's empty state and the way back.
    func missing(_ what: String, back: @escaping () -> Void) -> KitEmptyState {
        KitEmptyState(icon: glyph, title: Words.Configure.gone(what: what), line: Words.Configure.goneLine,
                      action: KitButton.make(Words.Configure.backTo(section: label), variant: .outline, action: back))
    }
}
