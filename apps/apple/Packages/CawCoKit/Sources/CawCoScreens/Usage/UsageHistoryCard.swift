import CawCoCore
import CawCoDesign
import UIKit

/// History (usage/History.svelte): what each harness cost over the page's
/// range, as two small charts, one per harness and each on its own scale,
/// because the two are not the same kind of money. Hours for a window or a
/// day, the hub's days for a week or a month. Table swaps both charts for
/// their figures.
final class UsageHistoryCard: UsageCard {
    private let hub: HubConnection
    private let reads: UsageReads
    private let viewTabs = SegmentedTabs([.init("Chart"), .init("Table")])
    private let body = UIStackView()
    private var table = false

    private var since: [UsageHarness: UsageSince] = [:]
    private var hourly = true

    /// What the charts draw: a read together with the range it was read for,
    /// so a new range keeps the old charts up until its own read lands whole.
    private struct Shown {
        let hourly: Bool
        let series: [UsageHarness: UsageSummary]
        let since: [UsageHarness: UsageSince]
    }

    private var shown: Shown?
    private var failed = false
    private var retrying = false
    private var ticket = 0
    private var slots: [UsageHarness: UsageRelayView] = [:]
    private var charts: [UsageHarness: UsageHistory.Chart] = [:]
    private var plots: [UsageHarness: UsagePlot] = [:]

    init(hub: HubConnection, reads: UsageReads) {
        self.hub = hub
        self.reads = reads
        super.init(title: "History")
        viewTabs.accessibilityLabel = "Show as"
        viewTabs.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            table = viewTabs.selectedIndex == 1
            if shown == nil { render() } else { swapBodies() }
        }, for: .valueChanged)
        let head = UIStackView(arrangedSubviews: [Self.title("History"), UIView(), viewTabs])
        head.spacing = Space.space3
        head.alignment = .center
        column.addArrangedSubview(head)
        column.addArrangedSubview(body)
        render()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageHistoryCard is built in code")
    }

    override func layoutChanged() {
        render()
    }

    func configure(since next: [UsageHarness: UsageSince], hourly per: Bool) {
        guard next != since || per != hourly else { return }
        since = next
        hourly = per
        read()
    }

    // MARK: Reading

    private func read() {
        ticket += 1
        let mine = ticket
        let (claude, opencode, per) = (since[.claude] ?? .pending, since[.opencode] ?? .pending, hourly)
        guard claude != .pending, opencode != .pending else { return }
        Task { @MainActor [weak self, reads] in
            do {
                var series: [UsageHarness: UsageSummary] = [:]
                for (harness, from) in [(UsageHarness.claude, claude), (.opencode, opencode)] {
                    if let start = from.start { series[harness] = try await reads.summary(harness, groupBy: .start, since: start) }
                }
                guard let self, mine == ticket else { return }
                shown = Shown(hourly: per, series: series, since: [.claude: claude, .opencode: opencode])
                failed = false
            } catch {
                guard let self, mine == ticket else { return }
                failed = true
            }
            self?.retrying = false
            self?.render()
        }
    }

    // MARK: Drawing

    private func render() {
        let byHour = shown?.hourly ?? hourly
        let now = Date.now.timeIntervalSince1970 * 1000
        charts = Dictionary(uniqueKeysWithValues: UsageHarness.allCases.map { harness in
            (harness, UsageHistory.chart(harness, summary: shown?.series[harness], since: shown?.since[harness] ?? .pending,
                                        hourly: byHour, spend: hub.fleet.spend, now: now))
        })
        // Update mounted marks before moving their figure: retained periods
        // keep the plot's own height tween when a new range is read.
        for (harness, plot) in plots {
            if let chart = charts[harness], !chart.missing {
                plot.configure(chart, byHour: byHour, timeZone: hub.fleet.spend?.timeZone)
            }
        }
        body.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if failed, shown == nil {
            body.axis = .vertical
            body.addArrangedSubview(Self.failed("Could not read the history from the hub.", retrying: retrying) { [weak self] in
                self?.retrying = true
                self?.read()
            })
            return
        }
        // `.pair`: two figures side by side, `space-6` apart; a phone stacks them.
        body.axis = narrow ? .vertical : .horizontal
        body.spacing = Space.space6
        body.alignment = narrow ? .fill : .top
        body.distribution = narrow ? .fill : .fillEqually
        for harness in UsageHarness.allCases {
            let chart = charts[harness]!
            body.addArrangedSubview(figure(chart, byHour: byHour))
        }
    }

    private func chartBody(_ chart: UsageHistory.Chart, byHour: Bool) -> UIView {
        if table { return UsageFigures(chart, byHour: byHour, timeZone: hub.fleet.spend?.timeZone) }
        let plot = plots[chart.harness] ?? UsagePlot(chart, byHour: byHour, timeZone: hub.fleet.spend?.timeZone)
        plot.configure(chart, byHour: byHour, timeZone: hub.fleet.spend?.timeZone)
        plots[chart.harness] = plot
        return plot
    }

    private func swapBodies() {
        for (index, harness) in UsageHarness.allCases.enumerated() {
            guard let chart = charts[harness], !chart.missing, let slot = slots[harness] else { continue }
            slot.show([.init(id: harness.rawValue, order: index, head: nil,
                             rows: [.init(key: table ? "table" : "chart", view: chartBody(chart, byHour: shown!.hourly))], more: nil)],
                      direction: table ? 1 : -1, style: .body(index))
        }
    }

    /// `.chart`: its caption (the title, and the range's total at the row's
    /// end), then its body `space-2` under.
    private func figure(_ chart: UsageHistory.Chart, byHour: Bool) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = chart.title
        name.accessibilityTraits = .header
        let caption = UIStackView(arrangedSubviews: [name, UIView()])
        caption.spacing = Space.space2
        caption.alignment = .firstBaseline
        let ready = shown != nil
        if ready, !chart.missing {
            let total = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            total.tabular = true
            total.text = "\(chart.approx)\(Usage.money(chart.total))"
            caption.addArrangedSubview(total)
        }
        let stack = UIStackView(arrangedSubviews: [caption])
        stack.axis = .vertical
        stack.spacing = Space.space2
        if chart.missing {
            stack.addArrangedSubview(Self.note("No 5-hour window is running."))
        } else if !ready {
            stack.addArrangedSubview(SkeletonView(height: 96))
        } else {
            let slot = slots[chart.harness] ?? UsageRelayView()
            slots[chart.harness] = slot
            stack.addArrangedSubview(slot)
            slot.show([.init(id: chart.harness.rawValue, order: chart.harness == .claude ? 0 : 1, head: nil,
                             rows: [.init(key: table ? "table" : "chart", view: chartBody(chart, byHour: byHour))], more: nil)], direction: nil)
        }
        return stack
    }
}

/// `.plot`: one bar per period on a shared baseline, a 2pt gap between them,
/// 96pt tall with a hairline under; then the first and the last period's
/// names, `space-1` under. A bar is its share of the range's peak, 1pt at
/// least, rounded at the top, in `--meter-share`.
private final class UsagePlot: UIView {
    private var chart: UsageHistory.Chart
    private let bars = UIView()
    private let rule = UIView()
    private var marks: [Double: UIView] = [:]
    private var arriving = Set<Double>()
    private let axis = UIStackView()
    private var axisBottom: NSLayoutConstraint!
    private let first = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let last = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)

    init(_ chart: UsageHistory.Chart, byHour: Bool, timeZone: String?) {
        self.chart = chart
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        rule.backgroundColor = Palette.borderHairline
        addSubview(bars)
        addSubview(rule)
        axis.addArrangedSubview(first)
        axis.addArrangedSubview(UIView())
        axis.addArrangedSubview(last)
            axis.translatesAutoresizingMaskIntoConstraints = false
            axis.isAccessibilityElement = false
            first.isAccessibilityElement = false
            last.isAccessibilityElement = false
            addSubview(axis)
            axisBottom = axis.bottomAnchor.constraint(equalTo: bottomAnchor)
            axisBottom.priority = .defaultHigh
            NSLayoutConstraint.activate([
                axis.topAnchor.constraint(equalTo: topAnchor, constant: 96 + Space.space1),
                axis.leadingAnchor.constraint(equalTo: leadingAnchor),
                axis.trailingAnchor.constraint(equalTo: trailingAnchor),
                axisBottom,
                heightAnchor.constraint(greaterThanOrEqualToConstant: 96),
            ])
        configure(chart, byHour: byHour, timeZone: timeZone)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsagePlot is built in code")
    }

    func configure(_ chart: UsageHistory.Chart, byHour: Bool, timeZone: String?) {
        self.chart = chart
        let present = Set(chart.points.map(\.at))
        for (at, mark) in marks where !present.contains(at) { mark.removeFromSuperview(); marks[at] = nil }
        for point in chart.points {
            let mark = marks[point.at] ?? UIView()
            if marks[point.at] == nil {
                mark.backgroundColor = Palette.meterShare
                mark.layer.cornerRadius = Radius.radiusHair
                mark.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
                mark.isAccessibilityElement = true
                mark.accessibilityTraits = .image
                bars.addSubview(mark)
                marks[point.at] = mark
                arriving.insert(point.at)
            }
            let label = UsageHistory.label(point.at, hourly: byHour, timeZone: timeZone)
            let amount = "\(chart.approx)\(Usage.money(point.cost))"
            mark.accessibilityLabel = "\(label): \(amount)"
            KitTip.attach(to: mark, label: "\(label) · \(amount)", side: .top)
        }
        axis.isHidden = chart.points.isEmpty
        axisBottom.isActive = !chart.points.isEmpty
        first.text = chart.points.first.map { UsageHistory.label($0.at, hourly: byHour, timeZone: timeZone) }
        last.text = chart.points.last.map { UsageHistory.label($0.at, hourly: byHour, timeZone: timeZone) }
        invalidateIntrinsicContentSize()
        setNeedsLayout()
        if window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeDrawer.animator(Motion.durMorph) { self.layoutIfNeeded() }.startAnimation()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // The hairline is the plot's own bottom pixel: the bars stand on it, in the 95pt above.
        bars.frame = CGRect(x: 0, y: 0, width: bounds.width, height: 95)
        rule.frame = CGRect(x: 0, y: 95, width: bounds.width, height: 1)
        guard !chart.points.isEmpty else { return }
        let count = Double(chart.points.count)
        let slot = max(0, (bounds.width - 2 * (count - 1)) / count)
        for (index, point) in chart.points.enumerated() {
            let mark = marks[point.at]!
            let share = chart.peak > 0 ? point.cost / chart.peak : 0
            let height = max(1, share * 95)
            let next = CGRect(x: Double(index) * (slot + 2), y: 95 - height, width: slot, height: height)
            if arriving.remove(point.at) != nil {
                UIView.performWithoutAnimation { mark.frame = next }
            } else {
                UIView.performWithoutAnimation {
                    mark.frame.origin.x = next.minX
                    mark.frame.size.width = next.width
                }
                mark.frame.origin.y = next.minY
                mark.frame.size.height = next.height
            }
        }
    }
}

/// `.figures`: the chart as a table, in meta type: "Hour" or "Day" and the
/// harness's money, each line `space-1` above and below on a hairline.
private final class UsageFigures: UIStackView {
    init(_ chart: UsageHistory.Chart, byHour: Bool, timeZone: String?) {
        super.init(frame: .zero)
        axis = .vertical
        addArrangedSubview(Self.line(byHour ? "Hour" : "Day", chart.harness == .claude ? "API price" : "Spend", head: true))
        for point in chart.points {
            addArrangedSubview(Self.line(UsageHistory.label(point.at, hourly: byHour, timeZone: timeZone), "\(chart.approx)\(Usage.money(point.cost))", head: false))
        }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("UsageFigures is built in code")
    }

    private static func line(_ left: String, _ right: String, head: Bool) -> UIView {
        let role = head ? TypeScale.typeLabel : TypeScale.typeMeta
        let ink = head ? Palette.inkMuted : Palette.inkStrong
        let name = KitLabel(role, ink: ink)
        name.text = left
        let figure = KitLabel(role, ink: ink)
        figure.tabular = true
        figure.text = right
        let row = UIStackView(arrangedSubviews: [name, UIView(), figure])
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1 + 1, trailing: 0)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(rule)
        NSLayoutConstraint.activate([
            rule.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            rule.bottomAnchor.constraint(equalTo: row.bottomAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
        ])
        row.isAccessibilityElement = true
        row.accessibilityLabel = "\(left), \(right)"
        if head { row.accessibilityTraits = .header }
        return row
    }
}
