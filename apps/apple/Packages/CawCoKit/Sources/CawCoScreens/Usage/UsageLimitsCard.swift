import CawCoCore
import CawCoDesign
import UIKit

/// The page's lead (usage/LimitsBlock.svelte): will it last? The window that
/// stops you first leads as a percent with its projection in one sentence;
/// under it every window, grouped by provider, on one grid so the bars,
/// percents and resets line up down the block. A phone stacks each window:
/// its name and percent, its bar, its reset.
final class UsageLimitsCard: UsageCard {
    /// "Log in to Claude" on a machine.
    var onLogin: (String) -> Void = { _ in }
    private let body = UIStackView()
    private var shown: UsageLimits?
    private var now = 0.0
    private var viewport = 0.0
    private var bars: [String: LimitBar] = [:]

    /// The grid's columns: the name, the percent, and between them the bar.
    private static let nameWidth = 120.0
    private static let usedWidth = 72.0

    init() {
        super.init(title: "Limits")
        column.addArrangedSubview(Self.title("Limits"))
        body.axis = .vertical
        body.spacing = Space.space4
        column.addArrangedSubview(body)
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (card: UsageLimitsCard, _: UITraitCollection) in card.render() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageLimitsCard is built in code")
    }

    func configure(_ limits: UsageLimits, now: Double) {
        shown = limits
        self.now = now
        render()
    }

    override func layoutChanged() {
        render()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = Double(window?.bounds.width ?? bounds.width)
        if viewport != width {
            viewport = width
            render()
        }
    }

    private func render() {
        guard let limits = shown else { return }
        // Configure retained bars while still mounted: LimitBar owns its
        // interruptible fill tween, and the clock tick remains unanimated.
        for row in limits.claudeRows + limits.goRows {
            if let bar = bars[row.key] {
                bar.configure(used: row.meter.used, elapsed: row.meter.elapsed, tone: Self.tone(row.meter.state),
                              reached: row.meter.state == .reached, paint: Self.paint(row.meter.state), label: row.label)
            }
        }
        body.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard limits.read else {
            body.addArrangedSubview(skeleton())
            return
        }
        if let lead = limits.lead {
            body.addArrangedSubview(self.lead(lead, limits))
        }
        body.addArrangedSubview(windows(limits))
    }

    // MARK: Loading

    /// `.loading`: the headline, the sentence and three rows, waiting.
    private func skeleton() -> UIView {
        let head = SkeletonView(height: 28)
        let line = SkeletonView(height: 16)
        let stack = UIStackView(arrangedSubviews: [head, line] + (0 ..< 3).map { _ in SkeletonView(height: 20) })
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.alignment = .leading
        head.widthAnchor.constraint(equalToConstant: 96).isActive = true
        line.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: 0.75).isActive = true
        for bar in stack.arrangedSubviews.dropFirst(2) { bar.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Reading limits"
        return stack
    }

    // MARK: Lead

    /// `.lead`: "42%" in the KPI role, "of the 5-hour window" beside it on
    /// its baseline, and under them the projection.
    private func lead(_ row: Usage.Row, _ limits: UsageLimits) -> UIView {
        let percent = KitLabel(TypeScale.typeKpi.with(points: TypeScale.typeKpi.points(viewport: viewport)), ink: Palette.inkStrong)
        percent.tabular = true
        percent.text = "\(Int(row.meter.used.rounded()))%"
        percent.setContentHuggingPriority(.required, for: .horizontal)
        let of = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        of.wrap = .pretty
        of.text = "of \(limits.leadName)"
        let headline = UIStackView(arrangedSubviews: [percent, of])
        headline.spacing = Space.space2
        headline.alignment = .firstBaseline
        headline.isAccessibilityElement = true
        headline.accessibilityLabel = "\(Int(row.meter.used.rounded())) percent of \(limits.leadName)"
        let stack = UIStackView(arrangedSubviews: [headline])
        stack.axis = .vertical
        stack.spacing = Space.space1
        if !limits.sentence.isEmpty {
            let sentence = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            sentence.wrap = .pretty
            sentence.text = limits.sentence
            stack.addArrangedSubview(sentence)
        }
        return stack
    }

    // MARK: Windows

    private func windows(_ limits: UsageLimits) -> UIView {
        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = Space.space1
        var resets: [UIView] = []

        grid.addArrangedSubview(provider(.claude, name: "Claude", plan: limits.claudePlan, age: limits.claudeAge, first: true))
        if let unknown = limits.claudeUnknown {
            grid.addArrangedSubview(self.unknown(unknown))
        } else {
            for row in limits.claudeRows { grid.addArrangedSubview(window(row, limits, &resets)) }
            if let extra = limits.extra { grid.addArrangedSubview(spend(extra, name: "Extra usage")) }
        }
        if limits.showGo {
            grid.addArrangedSubview(provider(.opencode, name: "opencode", plan: limits.goRows.isEmpty ? nil : "Go", age: limits.goAge, first: false))
            for row in limits.goRows { grid.addArrangedSubview(window(row, limits, &resets)) }
            if let spend = limits.spend { grid.addArrangedSubview(self.spend(spend)) }
        }
        // `max-content`: the reset column is as wide as its longest line, the same in every row.
        if !narrow, let first = resets.first {
            for other in resets.dropFirst() { other.widthAnchor.constraint(equalTo: first.widthAnchor).isActive = true }
            let widest = resets.map { $0.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width }.max() ?? 0
            first.widthAnchor.constraint(equalToConstant: widest.rounded(.up)).isActive = true
        }
        return grid
    }

    /// `.provider`: the agent's mark, its name, "· Max 20x", and a stale
    /// reading's age at the row's end. `space-1` under it; a second group's
    /// stands `space-3` clear of the first.
    private func provider(_ harness: UsageHarness, name: String, plan: String?, age: String?, first: Bool) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = name
        label.accessibilityTraits = .header
        let row = UIStackView(arrangedSubviews: [HarnessGlyphView(harness), label])
        row.spacing = Space.space2
        row.alignment = .center
        if let plan {
            let planLabel = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted)
            planLabel.text = "· \(plan)"
            row.addArrangedSubview(planLabel)
        }
        row.addArrangedSubview(UIView())
        if let age {
            let ageLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            ageLabel.text = age
            row.addArrangedSubview(ageLabel)
        }
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: first ? 0 : Space.space3, leading: 0, bottom: Space.space1, trailing: 0)
        return row
    }

    /// The glyph before a percent or an amount: near the limit, or nearly at it or reached.
    private static func status(_ state: Usage.State, near: String, over: String, reached: String) -> GlyphView? {
        let glyph: GlyphView
        switch state {
        case .near:
            glyph = GlyphView(.attention, size: 16, tint: Palette.meterNear)
            glyph.accessibilityLabel = near
        case .over, .reached:
            glyph = GlyphView(.failed, size: 16, tint: Palette.meterOver)
            glyph.accessibilityLabel = state == .reached ? reached : over
        case .calm, .stale:
            return nil
        }
        glyph.isAccessibilityElement = true
        glyph.accessibilityTraits = .image
        return glyph
    }

    private static func tone(_ state: Usage.State) -> LimitBar.Tone {
        switch state {
        case .calm: .calm
        case .near: .near
        case .over, .reached: .over
        case .stale: .stale
        }
    }

    /// A row's ground (`--row-paint`): the card, or a faint wash over it for a row near or over.
    private static func paint(_ state: Usage.State) -> UIColor {
        switch state {
        case .near: Palette.meterWashNear.over(Palette.surfaceRaised)
        case .over, .reached: Palette.meterWashOver.over(Palette.surfaceRaised)
        case .calm, .stale: Palette.surfaceRaised
        }
    }

    /// `.row`: `space-2` of pad all round on its own ground, reaching
    /// `space-2` past the grid each side so its words stay on the grid.
    private func framed(_ content: UIView, paint: UIColor) -> UIView {
        let box = UIView()
        let ground = UIView()
        ground.backgroundColor = paint
        ground.layer.cornerRadius = Radius.radiusSm
        ground.layer.cornerCurve = .continuous
        ground.translatesAutoresizingMaskIntoConstraints = false
        content.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(ground)
        box.addSubview(content)
        NSLayoutConstraint.activate([
            ground.topAnchor.constraint(equalTo: box.topAnchor),
            ground.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            ground.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: -Space.space2),
            ground.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: Space.space2),
            content.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space2),
            content.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space2),
            content.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        ])
        return box
    }

    private static func name(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = text
        return label
    }

    /// One window: its name, its 8pt bar, its percent with its glyph, and when it resets.
    private func window(_ row: Usage.Row, _ limits: UsageLimits, _ resets: inout [UIView]) -> UIView {
        let meter = row.meter
        let paint = Self.paint(meter.state)
        let name = Self.name(row.label)
        let bar = bars[row.key] ?? LimitBar(height: 8)
        bars[row.key] = bar
        bar.configure(used: meter.used, elapsed: meter.elapsed, tone: Self.tone(meter.state), reached: meter.state == .reached, paint: paint, label: row.label)
        let percent = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        percent.tabular = true
        percent.text = "\(Int(meter.used.rounded()))%"
        var usedParts: [UIView] = [UIView()]
        if let glyph = Self.status(meter.state, near: "Near the limit", over: "Nearly at the limit", reached: "Limit reached") { usedParts.append(glyph) }
        usedParts.append(percent)
        let used = UIStackView(arrangedSubviews: usedParts)
        used.spacing = Space.space1
        used.alignment = .center
        let reset = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        reset.text = limits.resets(row, now: now)

        guard !narrow else {
            // "label used" / "bar" / "resets", `space-1` apart.
            let top = UIStackView(arrangedSubviews: [name, used])
            top.spacing = Space.space3
            top.alignment = .center
            let stack = UIStackView(arrangedSubviews: [top, bar, reset])
            stack.axis = .vertical
            stack.spacing = Space.space1
            return framed(stack, paint: paint)
        }
        resets.append(reset)
        let line = UIStackView(arrangedSubviews: [name, bar, used, reset])
        line.spacing = Space.space3
        line.alignment = .center
        NSLayoutConstraint.activate([
            name.widthAnchor.constraint(equalToConstant: Self.nameWidth),
            used.widthAnchor.constraint(equalToConstant: Self.usedWidth),
        ])
        return framed(line, paint: paint)
    }

    /// `.unknown`: why there is no Claude bar, and the way to sign in where that is the cure.
    private func unknown(_ unknown: UsageLimits.Unknown) -> UIView {
        let reason = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        reason.wrap = .pretty
        reason.text = unknown.reason
        reason.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [reason])
        row.spacing = Space.space3
        row.alignment = .center
        if unknown.signIn, let machineId = unknown.machineId {
            row.addArrangedSubview(KitButton.make("Log in to Claude", glyph: .key, variant: .outline, height: .sm) { [weak self] in self?.onLogin(machineId) })
        }
        row.addArrangedSubview(UIView())
        return row
    }

    /// `.spend`: a name on the name column ("Spend", "Extra usage") and its
    /// words from the bar's column on.
    private func spend(_ figures: String, name label: String = "Spend") -> UIView {
        let name = Self.name(label)
        let said = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
        said.tabular = true
        said.wrap = .pretty
        said.text = figures
        if !narrow {
            // UIKit's baseline anchor describes the face, not the attributed
            // CSS line box. Seat both roles on the kit's measured WebKit strut.
            let nameBox = LineBox.strut(name.role.font, height: name.role.lineHeight)
            let figureBox = LineBox.strut(said.role.font, height: said.role.lineHeight)
            let above = max(nameBox.above, figureBox.above)
            let below = max(nameBox.below, figureBox.below)
            let row = UIView()
            row.addSubview(name)
            row.addSubview(said)
            NSLayoutConstraint.activate([
                name.leadingAnchor.constraint(equalTo: row.leadingAnchor),
                name.widthAnchor.constraint(equalToConstant: Self.nameWidth),
                name.topAnchor.constraint(equalTo: row.topAnchor, constant: Space.space2 + above - nameBox.above),
                name.bottomAnchor.constraint(lessThanOrEqualTo: row.bottomAnchor, constant: -Space.space2),
                said.leadingAnchor.constraint(equalTo: name.trailingAnchor, constant: Space.space3),
                said.trailingAnchor.constraint(equalTo: row.trailingAnchor),
                said.topAnchor.constraint(equalTo: row.topAnchor, constant: Space.space2 + above - figureBox.above),
                said.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -Space.space2 - below + figureBox.below),
            ])
            return row
        }
        let row = UIStackView(arrangedSubviews: [name, said])
        row.axis = .vertical
        row.spacing = Space.space1
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: 0, bottom: Space.space2, trailing: 0)
        return row
    }
}
