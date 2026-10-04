import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// Model (spawn/ModelSection.svelte, ToolChips.svelte, motion/Rail.svelte):
// one panel with the harness rail down its left edge, a search that is also
// where a model id is pasted, and the list, whose chosen row carries the
// effort and permission chips.

/// The run settings that ride on a model (ToolChips.svelte `ModelTools`).
struct ModelTools {
    var efforts: [String]
    var effort: String?
    /// Why the effort chip offers no level, as its label and its reason.
    var effortOff: (label: String, reason: String)?
    var modes: [(value: String, disabled: Bool)]
    var permission: String?
    var onEffort: (String) -> Void
    var onPermission: (String) -> Void

    /// A harness that can neither report nor change effort.
    static func effortNotExposed(_ harness: String) -> (label: String, reason: String) {
        ("Effort n/a", "\(ModelCatalog.harnessName(harness)) doesn't expose effort")
    }
}

/// Effort and permission as chips that open their pickers (ToolChips.svelte).
final class ToolChipsView: UIStackView {
    private let effort = NsChip(height: 28)
    private let permission = NsChip(height: 28)
    private var tools: ModelTools?
    weak var presenter: UIViewController?
    private weak var popover: UIViewController?

    init() {
        super.init(frame: .zero)
        spacing = 4
        alignment = .center
        translatesAutoresizingMaskIntoConstraints = false
        addArrangedSubview(effort)
        addArrangedSubview(permission)
        effort.addAction(UIAction { [weak self] _ in self?.openEffort() }, for: .touchUpInside)
        permission.addAction(UIAction { [weak self] _ in self?.openPermission() }, for: .touchUpInside)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("ToolChipsView is built in code") }

    func show(_ tools: ModelTools) {
        self.tools = tools
        // The effort chip is always there; when it has no level, it says why.
        let off = tools.effortOff ?? (tools.efforts.isEmpty && tools.effort == nil ? ("No effort", "This model has no effort setting") : nil)
        let picker = off == nil && !tools.efforts.isEmpty
        effort.show(Glyph.tuning.image, tint: Palette.hueOrange500, label: off?.label ?? tools.effort?.capitalized ?? "Default")
        effort.off = off != nil
        effort.isUserInteractionEnabled = picker
        effort.accessibilityLabel = "Effort"
        effort.accessibilityValue = off.map { "\($0.label): \($0.reason)" } ?? tools.effort?.capitalized ?? "Default"
        // A session with no mode (its harness has none) shows nothing here.
        if let mode = tools.permission, !tools.modes.isEmpty {
            let look = PermissionLook.of(mode)
            permission.show(look.glyph.image, tint: look.hue, label: look.short)
            permission.accessibilityLabel = "Permission mode"
            permission.accessibilityValue = look.name
            permission.isHidden = false
        } else {
            permission.isHidden = true
        }
    }

    private func openEffort() {
        guard let tools, let presenter else { return }
        let picker = EffortPopover(efforts: tools.efforts, value: tools.effort) { [weak self] level in self?.tools?.onEffort(level) }
        present(picker, from: effort, in: presenter)
    }

    private func openPermission() {
        guard let tools, let mode = tools.permission, let presenter else { return }
        let picker = PermissionPopover(modes: tools.modes, value: mode) { [weak self] picked in
            self?.tools?.onPermission(picked)
            self?.popover?.dismiss(animated: true)
        }
        present(picker, from: permission, in: presenter)
    }

    private func present(_ picker: NsPopoverController, from chip: NsChip, in presenter: UIViewController) {
        chip.open = true
        popover = picker
        KitPopover.present(picker, from: chip, in: presenter, align: .end)
        picker.onClose = { [weak chip] in chip?.open = false }
    }
}

/// The harness rail (motion/Rail.svelte, axis y): marks only, a thumb that
/// slides under the chosen one, and one label that travels to whichever is
/// under the pointer.
final class HarnessRail: UIView {
    struct Item {
        let id: String
        let name: String
        let soon: Bool
        let disabled: Bool
        /// What VoiceOver adds to a disabled item's name.
        let why: String?
    }

    private var items: [Item] = []
    private var buttons: [RailButton] = []
    private let thumb = UIView()
    private let column = UIStackView()
    private let tip = UIView()
    private let tipText = UILabel()
    private var value = ""
    private var placed = false
    private var hovered = -1
    /// Where the travelling label is drawn: over the search and list beside the rail.
    weak var tipHost: UIView?
    var onPick: (String) -> Void = { _ in }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        thumb.backgroundColor = Palette.surfaceLift
        thumb.layer.cornerRadius = Radius.radiusSm
        thumb.layer.cornerCurve = .continuous
        thumb.boxShadow = Shadow.shadowRaised
        thumb.isUserInteractionEnabled = false
        addSubview(thumb)
        column.axis = .vertical
        // One 36pt radio and its gap a step: 40pt, 44 under a finger.
        column.spacing = traitCollection.userInterfaceIdiom == .mac ? 4 : 8
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let edge = UIView()
        edge.backgroundColor = Palette.borderHairline
        edge.translatesAutoresizingMaskIntoConstraints = false
        addSubview(edge)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -7),
            column.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -6),
            edge.topAnchor.constraint(equalTo: topAnchor),
            edge.bottomAnchor.constraint(equalTo: bottomAnchor),
            edge.trailingAnchor.constraint(equalTo: trailingAnchor),
            edge.widthAnchor.constraint(equalToConstant: 1),
        ])
        tip.backgroundColor = Palette.inkStrong
        tip.layer.cornerRadius = Radius.radiusSm
        tip.layer.cornerCurve = .continuous
        tip.boxShadow = Shadow.shadowRaised
        tip.isUserInteractionEnabled = false
        tip.alpha = 0
        tip.addSubview(tipText)
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hover(_:))))
        accessibilityLabel = "Harness"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HarnessRail is built in code") }

    func show(_ next: [Item], value nextValue: String) {
        let first = buttons.isEmpty
        if next.map(\.id) != items.map(\.id) {
            buttons.forEach { $0.removeFromSuperview() }
            buttons = next.map { item in
                let mark: UIView = item.id == "codex" ? BrandLogo.harnessView("codex") : BrandLogo.harnessView(item.id)
                let button = RailButton(mark)
                button.addAction(UIAction { [weak self] _ in self?.onPick(item.id) }, for: .primaryActionTriggered)
                column.addArrangedSubview(button)
                return button
            }
        }
        items = next
        value = nextValue
        for (button, item) in zip(buttons, items) {
            button.isEnabled = !item.disabled
            button.chosen = item.id == value
            button.accessibilityLabel = [item.name, item.why].compactMap { $0 }.joined(separator: ", ")
        }
        setNeedsLayout()
        if first, !UIAccessibility.isReduceMotionEnabled {
            // `.ns-in`, 30ms apart.
            for (i, button) in buttons.enumerated() {
                let rest = button.alpha
                button.alpha = 0
                button.transform = CGAffineTransform(translationX: 0, y: 8)
                Motion.easeOut.animator(Motion.durFade) {
                    button.alpha = rest
                    button.transform = .identity
                }.startAnimation(afterDelay: Double(i) * 0.03)
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let at = items.firstIndex(where: { $0.id == value }), buttons.indices.contains(at) else {
            thumb.alpha = 0
            return
        }
        let frame = buttons[at].convert(buttons[at].bounds, to: self)
        guard frame.width > 0 else { return }
        // It glides only once it has been placed: never in from the corner.
        if placed, thumb.frame != frame, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeInOut.animator(Motion.durMorph) { self.thumb.frame = frame }.startAnimation()
        } else {
            thumb.frame = frame
        }
        thumb.alpha = 1
        placed = true
    }

    /// Which item the pointer is over, gaps counting toward the one before.
    @objc private func hover(_ gesture: UIHoverGestureRecognizer) {
        var hit = -1
        if gesture.state == .began || gesture.state == .changed {
            let y = gesture.location(in: self).y
            for (i, button) in buttons.enumerated() where button.convert(button.bounds, to: self).minY <= y { hit = i }
            if let last = buttons.last, hit == buttons.count - 1, y > last.convert(last.bounds, to: self).maxY { hit = -1 }
        }
        guard hit != hovered else { return }
        let from = hovered
        hovered = hit
        guard let host = tipHost else { return }
        guard hit >= 0 else {
            Motion.easeOut.animator(Motion.durControl) { self.tip.alpha = 0 }.startAnimation()
            return
        }
        let item = items[hit]
        let text = NSMutableAttributedString(string: item.name, attributes: [
            .font: TypeScale.typeMeta.with(weight: .regular, leading: 1).font, .foregroundColor: Palette.neutral2,
        ])
        if item.disabled {
            text.append(NSAttributedString(string: item.soon ? "  SOON" : "  NOT INSTALLED", attributes: [
                .font: TypeScale.typeLabel.with(weight: .medium, leading: 1).font, .foregroundColor: Palette.neutral2.withAlphaComponent(0.6),
                .kern: TypeScale.trackCaps * TypeScale.typeLabel.points,
            ]))
        }
        tipText.attributedText = text
        tipText.sizeToFit()
        let button = buttons[hit].convert(buttons[hit].bounds, to: host)
        let rail = convert(bounds, to: host)
        let frame = CGRect(x: rail.maxX + 6, y: button.minY, width: tipText.bounds.width + 20, height: button.height)
        if tip.superview !== host { host.addSubview(tip) }
        host.bringSubviewToFront(tip)
        let place: @MainActor () -> Void = {
            self.tip.frame = frame
            self.tipText.frame = CGRect(x: 10, y: 0, width: frame.width - 20, height: frame.height)
        }
        if from >= 0, tip.alpha > 0, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeInOut.animator(Motion.durMorph, animations: place).startAnimation()
        } else {
            place()
        }
        Motion.easeOut.animator(Motion.durControl) { self.tip.alpha = 1 }.startAnimation()
    }
}

/// One radio of the rail: a 36pt square holding its mark.
private final class RailButton: UIControl {
    var chosen = false {
        didSet { accessibilityTraits = chosen ? [.button, .selected] : .button }
    }

    init(_ mark: UIView) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        mark.isUserInteractionEnabled = false
        addSubview(mark)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 36),
            heightAnchor.constraint(equalToConstant: 36),
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        addAction(UIAction { [weak self] _ in self?.sendActions(for: .primaryActionTriggered) }, for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("RailButton is built in code") }

    override var isEnabled: Bool { didSet { alpha = isEnabled ? 1 : 0.45 } }
    override var canBecomeFocused: Bool { isEnabled }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted && !chosen ? Palette.surfaceHover : .clear }
    }

    /// Under a finger the 36pt square answers out to 44.
    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        bounds.insetBy(dx: -4, dy: -4).contains(point)
    }
}

final class ModelSectionView: UIView, UITextFieldDelegate {
    struct State {
        var harness: String
        var installed: [String]
        var machineName: String
        var machineIds: [String]
        var model: String
        var tools: ModelTools?
    }

    private static let tabs: [(id: String, name: String, soon: Bool)] = [
        ("claude", "Claude Code", false), ("codex", "Codex", true), ("opencode", "OpenCode", false), ("pi", "Pi", false),
    ]
    private static let step = 46.0

    private let hub: HubConnection
    private var state: State
    private var listHarness: String
    private var query = ""
    private var shown: [ModelEntry] = []
    private var custom = false
    private var built = false
    /// Why a model cannot be picked here, shown on its row; nil when it can.
    var unavailable: ((ModelEntry) -> String?)? { didSet { if built { render(swap: nil) } } }
    var onHarness: (String) -> Void = { _ in }
    var onModel: (String) -> Void = { _ in }

    private let picker = UIView()
    private let rail = HarnessRail()
    private let search = UITextField()
    private let clear = UIButton(type: .custom)
    private let scroll = UIScrollView()
    private let rows = UIStackView()
    private let fill = UIView()
    private let chips = ToolChipsView()
    private let leaving = UIView()

    init(hub: HubConnection, label: String, state: State, presenter: UIViewController) {
        self.hub = hub
        self.state = state
        listHarness = state.harness
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        chips.presenter = presenter
        let phone = traitCollection.horizontalSizeClass == .compact

        picker.backgroundColor = Palette.surfaceRaised
        picker.layer.cornerRadius = Radius.radiusMd
        picker.layer.cornerCurve = .continuous
        picker.layer.borderWidth = 1
        picker.boxShadow = Shadow.shadowXs
        rail.layer.cornerRadius = Radius.radiusMd
        rail.layer.cornerCurve = .continuous
        rail.layer.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner]
        rail.clipsToBounds = true
        rail.tipHost = picker
        rail.onPick = { [weak self] id in self?.onHarness(id) }

        let body = TypeScale.typeBody.with(weight: .regular, points: phone ? 16 : nil, leading: 1.4)
        search.font = body.font
        search.textColor = Palette.inkStrong
        search.autocapitalizationType = .none
        search.autocorrectionType = .no
        search.spellCheckingType = .no
        search.returnKeyType = .done
        search.delegate = self
        search.accessibilityLabel = "Search models"
        search.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            query = search.text ?? ""
            render(swap: nil)
        }, for: .editingChanged)
        var clearConfig = UIButton.Configuration.plain()
        clearConfig.image = Glyph.closeSquare.image
        clearConfig.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkSubtle }
        clearConfig.contentInsets = .zero
        clear.configuration = clearConfig
        clear.accessibilityLabel = "Clear"
        clear.addAction(UIAction { [weak self] _ in self?.setQuery("") }, for: .touchUpInside)
        let searchRow = UIStackView(arrangedSubviews: [GlyphView(.search, size: 16, tint: Palette.inkSubtle), search, clear])
        searchRow.spacing = 8
        searchRow.alignment = .center
        searchRow.isLayoutMarginsRelativeArrangement = true
        searchRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12)
        let seam = UIView()
        seam.backgroundColor = Palette.borderHairline

        fill.backgroundColor = Palette.surfaceFill
        fill.layer.cornerRadius = Radius.radiusSm
        fill.layer.cornerCurve = .continuous
        fill.isUserInteractionEnabled = false
        fill.alpha = 0
        rows.axis = .vertical
        rows.spacing = 2
        rows.translatesAutoresizingMaskIntoConstraints = false
        leaving.isUserInteractionEnabled = false
        scroll.alwaysBounceVertical = true
        scroll.addSubview(fill)
        scroll.addSubview(rows)
        scroll.addSubview(leaving)
        scroll.addSubview(chips)
        chips.translatesAutoresizingMaskIntoConstraints = true
        chips.alpha = 0

        let pick = UIStackView(arrangedSubviews: [searchRow, seam, scroll])
        pick.axis = .vertical
        let panel = UIStackView(arrangedSubviews: [rail, pick])
        panel.alignment = .fill
        panel.translatesAutoresizingMaskIntoConstraints = false
        picker.addSubview(panel)

        let header = nsSectionHeader(.cpuBolt, hue: Palette.hueCyan500, label)
        let column = UIStackView(arrangedSubviews: [header, picker])
        column.axis = .vertical
        column.spacing = 8
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            panel.topAnchor.constraint(equalTo: picker.topAnchor),
            panel.bottomAnchor.constraint(equalTo: picker.bottomAnchor),
            panel.leadingAnchor.constraint(equalTo: picker.leadingAnchor),
            panel.trailingAnchor.constraint(equalTo: picker.trailingAnchor),
            searchRow.heightAnchor.constraint(equalToConstant: phone ? 44 : 42),
            seam.heightAnchor.constraint(equalToConstant: 1),
            clear.widthAnchor.constraint(equalToConstant: 22),
            clear.heightAnchor.constraint(equalToConstant: 22),
            scroll.heightAnchor.constraint(equalToConstant: 300),
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 4),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -4),
            rows.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 4),
            rows.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -4),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ModelSectionView, _: UITraitCollection) in view.paint() }
        paint()
        built = true
        // The first list staggers in too, rather than standing there.
        render(swap: 1)
        ensure()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ModelSectionView is built in code") }

    private func paint() {
        picker.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    private func ensure() {
        let harness = listHarness
        Task { [weak self] in
            guard let self else { return }
            if await ModelCatalog.ensure(hub, harness: harness), harness == listHarness { render(swap: nil) }
        }
    }

    /// The form moved: a harness change swaps the list, anything else repaints it.
    func update(_ next: State) {
        let from = listHarness
        state = next
        guard next.harness != from else {
            render(swap: nil)
            return
        }
        listHarness = next.harness
        query = ""
        search.text = ""
        let order = ModelCatalog.harnesses
        let way = (order.firstIndex(of: next.harness) ?? 0) > (order.firstIndex(of: from) ?? 0) ? 1 : -1
        render(swap: way)
        // A different catalogue entirely: the old offset would land mid-list.
        scroll.setContentOffset(.zero, animated: false)
        ensure()
    }

    private func setQuery(_ text: String) {
        query = text
        search.text = text
        render(swap: nil)
    }

    private var entries: [ModelEntry] {
        ModelCatalog.entries(ModelCatalog.models(hub.fleet, harness: listHarness, machineIds: state.machineIds), use: SpawnMemory.use(listHarness))
    }

    /// The typed-in ids the catalogue does not cover (models.svelte.ts `recent`).
    private var typed: [String] { SpawnMemory.typed }

    private var selectedId: String {
        state.model.isEmpty ? (entries.first { $0.isDefault }?.id ?? "") : state.model
    }

    // MARK: The list

    private func render(swap way: Int?) {
        let name = ModelCatalog.harnessName(listHarness)
        rail.show(Self.tabs.map { tab in
            let missing = !tab.soon && !state.installed.contains(tab.id)
            return HarnessRail.Item(id: tab.id, name: tab.name, soon: tab.soon, disabled: tab.soon || missing,
                                    why: tab.soon ? "Coming soon" : (missing ? "Not installed on \(state.machineName)" : nil))
        }, value: state.harness)
        search.attributedPlaceholder = NSAttributedString(string: "Search \(name) models or paste a model id…",
                                                          attributes: [.font: search.font as Any, .foregroundColor: Palette.inkSubtle])
        clear.isHidden = query.isEmpty

        let all = entries
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let use = SpawnMemory.use(listHarness)
        shown = ModelCatalog.grouped(all, use: use, typed: typed).filter { q.isEmpty || ModelCatalog.matches($0, q) }
        let exact = all.contains { $0.id.lowercased() == q || $0.aliases.contains { $0.lowercased() == q } } || typed.contains { $0.lowercased() == q }
        custom = q.count > 2 && !exact && ModelCatalog.isIdShaped(query.trimmingCharacters(in: .whitespaces))
        let mixed = Set(all.map { ModelCatalog.providerOf($0.id) ?? "" }).count > 1
        let selected = selectedId
        let picked = shown.firstIndex { $0.id == selected }
        chips.isHidden = state.tools == nil
        if let tools = state.tools { chips.show(tools) }
        let chipsWidth = state.tools != nil && picked != nil ? chips.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width : 0

        // The outgoing rows leave over the incoming ones, so both staggers run at once.
        let still = way == nil || UIAccessibility.isReduceMotionEnabled || window == nil && way != 1
        let old = rows.arrangedSubviews
        leaving.subviews.forEach { $0.removeFromSuperview() }
        if let way, !still, window != nil {
            leaving.frame = CGRect(origin: .zero, size: scroll.bounds.size)
            for (i, row) in old.prefix(8).enumerated() {
                let frame = row.convert(row.bounds, to: scroll)
                rows.removeArrangedSubview(row)
                row.removeFromSuperview()
                row.translatesAutoresizingMaskIntoConstraints = true
                row.frame = frame
                leaving.addSubview(row)
                let out = Motion.easeOut.animator(0.2) {
                    row.alpha = 0
                    row.transform = CGAffineTransform(translationX: way > 0 ? -18 : 18, y: 0)
                }
                out.addCompletion { _ in row.removeFromSuperview() }
                out.startAnimation(afterDelay: Double(min(i, 9)) * 0.018)
            }
        }
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }

        // One slot for the custom row and the empty line, ahead of the rows.
        if custom {
            rows.addArrangedSubview(customRow())
        } else if shown.isEmpty {
            rows.addArrangedSubview(MachinesPopover.note(q.isEmpty ? "No \(name) models reported yet" : "No \(name) models match \"\(query)\"", pad: 22))
        }
        for (i, entry) in shown.enumerated() {
            let reason = unavailable?(entry)
            let row = ModelRow(entry: entry, reason: reason, mixed: mixed, harness: listHarness,
                               trailing: entry.id == selected ? chipsWidth + 14 : 8)
            row.isEnabled = reason == nil
            row.accessibilityTraits = entry.id == selected ? [.button, .selected] : .button
            row.addAction(UIAction { [weak self] _ in self?.pick(entry) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
            if let way, !still {
                // Each arrives from the side the choice moved toward, once the first old row is out.
                row.alpha = 0
                row.transform = CGAffineTransform(translationX: Double(way) * 18, y: 0)
                Motion.easeOut.animator(0.3) {
                    row.alpha = 1
                    row.transform = .identity
                }.startAnimation(afterDelay: 0.2 + Double(min(i, 9)) * 0.04)
            }
        }

        // The fill and the chips slide to the chosen row.
        let index = Double((picked ?? 0) + (custom ? 1 : 0))
        layoutIfNeeded()
        let width = scroll.bounds.width
        let place: @MainActor () -> Void = {
            self.fill.frame = CGRect(x: 4, y: 4 + index * Self.step, width: max(0, width - 8), height: 44)
            self.chips.frame = CGRect(x: width - 10 - chipsWidth, y: 4 + index * Self.step, width: chipsWidth, height: 44)
        }
        let show: @MainActor (Bool) -> Void = { on in
            self.fill.alpha = on ? 1 : 0
            self.chips.alpha = on ? 1 : 0
        }
        chips.isUserInteractionEnabled = picked != nil
        if window == nil || UIAccessibility.isReduceMotionEnabled || fill.alpha == 0 || width == 0 {
            place()
        } else {
            Motion.easeInOut.animator(Motion.durToggle, animations: place).startAnimation()
        }
        Motion.easeOut.animator(Motion.durControl) { show(picked != nil) }.startAnimation()
        scroll.bringSubviewToFront(leaving)
        scroll.bringSubviewToFront(chips)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // The fill and chips are placed by frame: a width change re-places them.
        if abs(fill.frame.width - (scroll.bounds.width - 8)) > 0.5, scroll.bounds.width > 0 {
            let y = fill.frame.minY
            let chipsWidth = chips.frame.width
            fill.frame = CGRect(x: 4, y: y, width: scroll.bounds.width - 8, height: 44)
            chips.frame = CGRect(x: scroll.bounds.width - 10 - chipsWidth, y: y, width: chipsWidth, height: 44)
        }
    }

    private func customRow() -> UIControl {
        let hint = KitLabel(TypeScale.typeMeta.with(leading: 1), ink: Palette.inkSubtle)
        hint.text = "↵ Enter"
        let row = ModelRow(tile: NsTile(GlyphView(.terminal, size: 16, tint: Palette.onInk), look: .ink), name: "Use custom model id",
                           meta: query, tail: hint)
        row.addAction(UIAction { [weak self] _ in self?.pickCustom() }, for: .touchUpInside)
        return row
    }

    private func pick(_ entry: ModelEntry) {
        if entry.isCustom { SpawnMemory.rememberTyped(entry.id) }
        onModel(entry.id)
    }

    private func pickCustom() {
        let id = query.trimmingCharacters(in: .whitespaces)
        SpawnMemory.rememberTyped(id)
        query = ""
        search.text = ""
        onModel(id)
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if custom { pickCustom() } else { textField.resignFirstResponder() }
        return false
    }
}

/// A model in the list (`.row`): 44pt, 8pt in, 10pt between its maker's tile
/// (where the list mixes makers), its name over its id and maker, and "1M"
/// for a wide window. One that cannot take the job stays listed, with why.
private final class ModelRow: UIControl {
    private let dash = CAShapeLayer()
    private var dashed = false

    init(entry: ModelEntry, reason: String?, mixed: Bool, harness: String, trailing: Double) {
        super.init(frame: .zero)
        var parts: [UIView] = []
        if mixed {
            let mark: UIView
            if let brand = BrandLogo.provider(ModelCatalog.providerOf(entry.id)) {
                let image = UIImageView(image: brand.image)
                image.contentMode = .scaleAspectFit
                image.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([image.widthAnchor.constraint(equalToConstant: 16), image.heightAnchor.constraint(equalToConstant: 16)])
                mark = image
            } else {
                mark = BrandLogo.harnessView(harness)
            }
            let tile = NsTile(mark)
            tile.alpha = reason == nil ? 1 : 0.5
            parts.append(tile)
        }
        let name = KitLabel(entry.mono ? TypeScale.typeLabel.with(family: FontFamily.fontMono) : TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = entry.name
        name.lineBreakMode = .byTruncatingTail
        name.alpha = reason == nil ? 1 : 0.5
        let meta = UILabel()
        meta.lineBreakMode = .byTruncatingTail
        if let reason {
            meta.attributedText = NSAttributedString(string: reason, attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted))
        } else {
            let text = NSMutableAttributedString(string: entry.id, attributes: TypeScale.typeMeta.with(family: FontFamily.fontMono).attributes(color: Palette.inkSubtle))
            let vendor = ModelCatalog.vendor(entry.id)
            if !vendor.isEmpty {
                text.append(NSAttributedString(string: " · \(vendor)", attributes: TypeScale.typeMeta.attributes(color: Palette.inkSubtle)))
            }
            meta.attributedText = text
        }
        let text = UIStackView(arrangedSubviews: [name, meta])
        text.axis = .vertical
        text.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        parts.append(text)
        if entry.name.hasSuffix("· 1M") {
            let ctx = KitLabel(TypeScale.typeMeta.with(weight: .regular, leading: 1, family: FontFamily.fontMono), ink: Palette.inkSubtle)
            ctx.text = "1M"
            ctx.setContentCompressionResistancePriority(.required, for: .horizontal)
            ctx.setContentHuggingPriority(.required, for: .horizontal)
            parts.append(ctx)
        }
        build(parts, trailing: trailing)
        accessibilityLabel = [entry.name, reason ?? entry.id].joined(separator: ", ")
    }

    /// The custom-id row: raised, on a dashed neutral edge.
    init(tile: UIView, name: String, meta: String, tail: UIView) {
        super.init(frame: .zero)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = name
        let detail = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.inkMuted)
        detail.text = meta
        detail.lineBreakMode = .byTruncatingTail
        let text = UIStackView(arrangedSubviews: [title, detail])
        text.axis = .vertical
        text.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        tail.setContentCompressionResistancePriority(.required, for: .horizontal)
        tail.setContentHuggingPriority(.required, for: .horizontal)
        build([tile, text, tail], trailing: 8)
        dashed = true
        backgroundColor = Palette.surfaceRaised
        dash.fillColor = nil
        dash.lineWidth = 1
        dash.lineDashPattern = [3, 2]
        layer.addSublayer(dash)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (row: ModelRow, _: UITraitCollection) in row.paint() }
        paint()
        accessibilityLabel = "\(name), \(meta)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ModelRow is built in code") }

    private func build(_ parts: [UIView], trailing: Double) {
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let content = UIStackView(arrangedSubviews: parts)
        content.spacing = 10
        content.alignment = .center
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 44),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -trailing),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
    }

    private func paint() {
        dash.strokeColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if dashed { dash.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusSm).cgPath }
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            // `.press-tint`: the hover fill while held; the chosen row's own fill lies under it.
            backgroundColor = isHighlighted ? Palette.surfaceHover : (dashed ? Palette.surfaceRaised : .clear)
        }
    }
}
