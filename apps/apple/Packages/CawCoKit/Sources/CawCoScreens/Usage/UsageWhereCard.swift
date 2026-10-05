import CawCoCore
import CawCoDesign
import UIKit

/// Where it goes (usage/WhereItGoes.svelte): one block, one harness at a
/// time, by session, model or machine, over the page's range. One neutral
/// bar per row with its value at the tip, the top eight, then the rest a
/// press away. Sessions stand under the machine that ran them, named once,
/// and each opens its conversation. Claude's figures are the API price of
/// work the plan covers (`~`); opencode's are what it recorded spending.
final class UsageWhereCard: UsageCard {
    var onOpen: (String) -> Void = { _ in }
    private let hub: HubConnection
    private let reads: UsageReads
    private let harnessTabs = SegmentedTabs(UsageHarness.allCases.map { .init($0.name) })
    private let groupTabs = SegmentedTabs(UsageGrouping.allCases.map { .init($0.label) })
    private let head = UIStackView()
    private let body = UIStackView()
    private let relay = UsageRelayView()
    private var rows: [String: UsageWhereRow] = [:]
    private var drawnView: (harness: UsageHarness, grouping: UsageGrouping, start: Double, all: Bool, narrow: Bool)?
    private let footnote = UsageCard.note("~ is the API price of work the plan already covers.")

    private(set) var harness = UsageHarness.claude
    private(set) var grouping = UsageGrouping.session
    private var since: [UsageHarness: UsageSince] = [:]
    /// The list shows every row rather than the first eight.
    private var all = false

    /// One read, and what it was read for: what the list draws.
    private struct View {
        let harness: UsageHarness
        let grouping: UsageGrouping
        let start: Double
        let summary: UsageSummary
    }

    private var view: View?
    private var failed: String?
    private var retrying = false
    private var latest = ""

    init(hub: HubConnection, reads: UsageReads) {
        self.hub = hub
        self.reads = reads
        super.init(title: "Where it goes")
        harnessTabs.accessibilityLabel = "Harness"
        groupTabs.accessibilityLabel = "Group by"
        harnessTabs.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            harness = UsageHarness.allCases[harnessTabs.selectedIndex]
            read()
        }, for: .valueChanged)
        groupTabs.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            grouping = UsageGrouping.allCases[groupTabs.selectedIndex]
            read()
        }, for: .valueChanged)
        column.addArrangedSubview(head)
        body.axis = .vertical
        column.addArrangedSubview(body)
        column.addArrangedSubview(footnote)
        layoutChanged()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageWhereCard is built in code")
    }

    /// `.head`: the title, and the two switches at the row's end; where they
    /// do not fit beside it they wrap under it, `space-3` below.
    override func layoutChanged() {
        rows = [:]
        drawnView = nil
        relay.reset()
        head.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let title = Self.title("Where it goes")
        let switches = UIStackView(arrangedSubviews: [harnessTabs, groupTabs])
        switches.spacing = Space.space2
        if narrow {
            // The switches wrap one under the other, each as wide as its names.
            switches.axis = .vertical
            switches.alignment = .leading
            head.axis = .vertical
            head.alignment = .leading
            head.spacing = Space.space3
            head.addArrangedSubview(title)
            head.addArrangedSubview(switches)
        } else {
            head.axis = .horizontal
            head.alignment = .center
            head.spacing = Space.space3
            head.addArrangedSubview(title)
            head.addArrangedSubview(UIView())
            head.addArrangedSubview(switches)
        }
        render()
    }

    /// The page's range moved: the rows are read for it and shown in place.
    func configure(since next: [UsageHarness: UsageSince]) {
        guard next != since else { return }
        since = next
        read()
    }

    /// The list on screen, for the export: what it was read for and its rows.
    var shown: (harness: UsageHarness, grouping: UsageGrouping, summary: UsageSummary)? {
        view.map { ($0.harness, $0.grouping, $0.summary) }
    }

    // MARK: Reading

    private var start: UsageSince { since[harness] ?? .pending }

    /// Reads what the switches chose, then shows it.
    private func read() {
        failed = nil
        guard let from = start.start else {
            latest = ""
            render()
            return
        }
        let want = "\(harness.rawValue):\(grouping.rawValue):\(Int(from))"
        latest = want
        let (h, g) = (harness, grouping)
        if view == nil { render() }
        footnote.isHidden = harness != .claude
        Task { @MainActor [weak self, reads] in
            do {
                let summary = try await reads.summary(h, groupBy: g.groupBy, since: from)
                guard let self, latest == want else { return }
                // A new harness or grouping starts from its first eight rows.
                if let was = view, was.harness != h || was.grouping != g { all = false }
                view = View(harness: h, grouping: g, start: from, summary: summary)
            } catch {
                guard let self, latest == want else { return }
                failed = error.localizedDescription
            }
            self?.retrying = false
            self?.render()
        }
    }

    // MARK: Drawing

    private func render() {
        footnote.isHidden = harness != .claude
        if let view, start != .none, !view.summary.rows.isEmpty {
            let previous = drawnView
            if let previous, previous.harness == view.harness, previous.grouping == view.grouping,
               previous.start == view.start, previous.all == all, previous.narrow == narrow { return }
            var direction: Double?
            if let previous {
                if previous.harness != view.harness {
                    direction = view.harness == .opencode ? 1 : -1
                } else if previous.grouping != view.grouping {
                    direction = Double(UsageGrouping.allCases.firstIndex(of: view.grouping)! - UsageGrouping.allCases.firstIndex(of: previous.grouping)!)
                } else if previous.all != all {
                    direction = all ? 1 : -1
                }
            } else {
                relay.reset()
            }
            let lines = list(view)
            if relay.superview !== body {
                UIView.transition(with: body, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                    self.body.arrangedSubviews.forEach { $0.removeFromSuperview() }
                    self.body.addArrangedSubview(self.relay)
                    self.body.layoutIfNeeded()
                    self.relay.show(lines, direction: direction)
                }
            } else {
                relay.show(lines, direction: direction)
            }
            drawnView = (view.harness, view.grouping, view.start, all, narrow)
            return
        }
        drawnView = nil
        relay.reset()
        body.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if start == .none {
            body.addArrangedSubview(Self.note("No 5-hour window is running for \(harness.name)."))
        } else if let failed, view == nil {
            body.addArrangedSubview(Self.failed("Could not read where it goes. \(failed)", retrying: retrying) { [weak self] in
                self?.retrying = true
                self?.read()
            })
        } else if view != nil {
            body.addArrangedSubview(Self.note("Nothing recorded in this range."))
        } else {
            body.addArrangedSubview(skeleton())
        }
    }

    /// `.skeleton`: five rows waiting, 24pt each, `space-2` apart.
    private func skeleton() -> UIView {
        let stack = UIStackView(arrangedSubviews: (0 ..< 5).map { _ in SkeletonView(height: 24) })
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Reading where it goes"
        return stack
    }

    /// `.list`: the groups flush, a second group `space-2` under the first;
    /// each group its machine's header (Sessions only) and its rows `space-1` apart.
    private func list(_ view: View) -> [UsageRelayView.Group] {
        let groups = UsageWhere.groups(view.summary, harness: view.harness, grouping: view.grouping, every: all,
                                       machines: hub.fleet.machines.map(\.machineId))
        var list: [UsageRelayView.Group] = []
        for (index, group) in groups.enumerated() {
            var header: UsageRelayView.Line?
            if group.machineId != UsageWhere.flat {
                header = .init(key: RelayPlan.head(group.machineId), view: machine(group))
            }
            let lines = group.rows.enumerated().map { offset, item in
                UsageRelayView.Line(key: item.id, view: row(item), gap: offset > 0 ? Space.space1 : 0)
            }
            list.append(.init(id: group.machineId, order: group.machineId == UsageWhere.flat ? -1 : hub.fleet.machines.firstIndex(where: { $0.machineId == group.machineId }) ?? (Int.max - 1),
                              head: header, rows: lines, more: nil, gap: index > 0 ? Space.space2 : 0))
        }
        // The flat box and global "more" box stay in the plan even while
        // empty: neither has a header to insert when a grouping changes.
        if !list.contains(where: { $0.id == UsageWhere.flat }) {
            list.insert(.init(id: UsageWhere.flat, order: -1, head: nil, rows: [], more: nil), at: 0)
        }
        var moreLine: UsageRelayView.Line?
        if let more = UsageWhere.more(view.summary, every: all) {
            // `.more-slot`: the rest of the rows, a ghost button at the list's start.
            let button = KitButton.make(more, variant: .ghost, height: .sm) { [weak self] in
                self?.all = true
                self?.render()
            }
            let slot = UIStackView(arrangedSubviews: [button, UIView()])
            slot.isLayoutMarginsRelativeArrangement = true
            slot.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: 0, bottom: 0, trailing: 0)
            moreLine = .init(key: RelayPlan.more("usage-more"), view: slot)
        }
        list.append(.init(id: "usage-more", order: Int.max, head: nil, rows: [], more: moreLine))
        return list
    }

    /// `.machine`: where these ran, said once for the rows under it.
    private func machine(_ group: UsageWhere.Group) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        name.text = group.name
        name.accessibilityTraits = .header
        let row = UIStackView(arrangedSubviews: [GlyphView(Glyph.os(group.os), size: 16, tint: Palette.inkMuted), name, UIView()])
        row.spacing = Space.space2
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1, trailing: 0)
        return row
    }

    /// `.row`: the name on two fifths and the measure on three, 28pt at
    /// least; a phone stacks them `space-1` apart with `space-1` above and below.
    private func row(_ item: UsageWhere.Item) -> UIView {
        if let kept = rows[item.id] {
            kept.update(item)
            return kept
        }
        let name = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        name.text = item.label
        name.lineBreakMode = .byTruncatingTail
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        var nameParts: [UIView] = []
        if let os = item.os { nameParts.append(GlyphView(Glyph.os(os), size: 16, tint: Palette.inkStrong)) }
        nameParts.append(name)
        let nameBox = UIStackView(arrangedSubviews: nameParts)
        nameBox.spacing = Space.space2
        nameBox.alignment = .center

        let measure = UsageMeasure(share: item.share, value: item.value)
        let line = UsageWhereRow(session: item.session, onOpen: onOpen)
        line.name = name
        line.measure = measure
        rows[item.id] = line
        line.accessibilityLabel = "\(item.label), \(item.value)"
        line.accessibilityValue = item.tip
        KitTip.attach(to: measure, label: item.tip, side: .top)
        let content = UIStackView(arrangedSubviews: [nameBox, measure])
        content.isUserInteractionEnabled = item.session == nil
        if narrow {
            content.axis = .vertical
            content.spacing = Space.space1
            content.isLayoutMarginsRelativeArrangement = true
            content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1, trailing: 0)
        } else {
            content.spacing = Space.space3
            content.alignment = .center
            // `2fr 3fr` of what the gap leaves.
            nameBox.widthAnchor.constraint(equalTo: measure.widthAnchor, multiplier: 2.0 / 3).isActive = true
        }
        content.translatesAutoresizingMaskIntoConstraints = false
        line.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: line.topAnchor),
            content.bottomAnchor.constraint(equalTo: line.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: line.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: line.trailingAnchor),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: narrow ? 0 : 28),
        ])
        return line
    }
}

/// A row of the list: a Sessions row opens its conversation on a tap.
private final class UsageWhereRow: UIControl {
    var name: KitLabel!
    var measure: UsageMeasure!
    private var session: String?

    init(session: String?, onOpen: @escaping (String) -> Void) {
        self.session = session
        super.init(frame: .zero)
        isAccessibilityElement = true
        accessibilityTraits = session == nil ? .staticText : .link
        if let session {
            addAction(UIAction { [weak self] _ in
                if let session = self?.session { onOpen(session) }
            }, for: .touchUpInside)
        } else {
            isUserInteractionEnabled = true
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageWhereRow is built in code")
    }

    func update(_ item: UsageWhere.Item) {
        session = item.session
        isAccessibilityElement = true
        accessibilityElementsHidden = false
        name.text = item.label
        accessibilityLabel = "\(item.label), \(item.value)"
        accessibilityValue = item.tip
        KitTip.attach(to: measure, label: item.tip, side: .top)
        measure.configure(share: item.share, value: item.value)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // A row with nowhere to go takes no touch; its measure keeps its hint.
        guard allTargets.isEmpty else { return super.hitTest(point, with: event).map { _ in self } }
        return super.hitTest(point, with: event).flatMap { $0 === self ? nil : $0 }
    }
}

/// `.measure`: the bar and its value. The fill takes its share of the room
/// the value leaves (all but 5.5rem), 2pt at least and 8pt tall, and the
/// value stands at its tip, `space-2` on. A new share tweens the fill once.
final class UsageMeasure: UIView {
    private let fill = UIView()
    private let value = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private var share: Double

    init(share: Double, value text: String) {
        self.share = share
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        fill.backgroundColor = Palette.meterShare
        fill.layer.cornerRadius = Radius.radiusHair
        value.tabular = true
        value.text = text
        // Placed by frame, at the fill's tip.
        value.translatesAutoresizingMaskIntoConstraints = true
        addSubview(fill)
        addSubview(value)
        heightAnchor.constraint(greaterThanOrEqualToConstant: 16).isActive = true
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageMeasure is built in code")
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: max(8, value.intrinsicContentSize.height))
    }

    func configure(share: Double, value text: String) {
        self.share = share
        value.text = text
        invalidateIntrinsicContentSize()
        setNeedsLayout()
        if window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeDrawer.animator(Motion.durMorph) { self.layoutIfNeeded() }.startAnimation()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = max(2, share * (bounds.width - 88))
        fill.frame = CGRect(x: 0, y: (bounds.height - 8) / 2, width: width, height: 8)
        let size = value.intrinsicContentSize
        value.frame = CGRect(x: width + Space.space2, y: (bounds.height - size.height) / 2, width: size.width, height: size.height)
    }
}
