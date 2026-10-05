import CawCoCore
import CawCoDesign
import UIKit

/// Usage (routes/usage/+page.svelte): will it last, first. The Limits block
/// leads with the window that stops you first and every window under it;
/// then where the spend goes, then its history, both over one range. A
/// phone gives the first screen to the limits: the range and the export
/// stand after them.
final class UsageViewController: ObservedViewController, UIDocumentPickerDelegate {
    private let context: ShellContext
    private let reads: UsageReads
    private let scroll = UIScrollView()
    private let column = UIStackView()
    private let rangeTabs = SegmentedTabs(UsageRange.allCases.map { .init($0.label) })
    private var exportButton: UIButton!
    private let controls = UIStackView()
    private let top = UIStackView()
    private let errorSlot = UIStackView()
    private let limits = UsageLimitsCard()
    private let whereCard: UsageWhereCard
    private let history: UsageHistoryCard
    private var edges: [NSLayoutConstraint] = []
    private var range = UsageRange.window
    private var rereading = false
    private var exporting = false
    /// The page's clock: the countdowns and projections move a minute at a time.
    private var now = Date.now.timeIntervalSince1970 * 1000
    private var clock: Timer?
    private var narrow: Bool?
    /// A session's turns and context percent, where the app has its transcript
    /// open (client.svelte.ts `statsOf`): its assistant blocks, and how full
    /// its context was last read.
    private func stats(_ id: String) -> (turns: Int?, contextPct: Double?) {
        let turns = context.hub.sessions.transcripts[id]?.blocks.filter { $0._type.value3 == .assistant }.count ?? 0
        let reading = SessionReadings.shared.context[id]
        return (turns > 0 ? turns : nil, reading.flatMap { $0.maxTokens > 0 ? $0.totalTokens / $0.maxTokens * 100 : nil })
    }

    init(context: ShellContext) {
        self.context = context
        reads = UsageReads(hub: context.hub)
        whereCard = UsageWhereCard(hub: context.hub, reads: reads)
        history = UsageHistoryCard(hub: context.hub, reads: reads)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        view.accessibilityLabel = "Usage"
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)
        column.axis = .vertical
        column.spacing = Space.spaceGroup
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        let safe = view.safeAreaLayoutGuide
        // `.col`: 1100pt at most, in the middle of the page's room.
        let wide = column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor)
        wide.priority = .defaultHigh
        edges = [
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: column.bottomAnchor),
            column.leadingAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.leadingAnchor),
            scroll.frameLayoutGuide.trailingAnchor.constraint(greaterThanOrEqualTo: column.trailingAnchor),
        ]
        NSLayoutConstraint.activate(edges + [
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            column.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: 1100),
            wide,
        ])

        rangeTabs.accessibilityLabel = "Range"
        rangeTabs.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            range = UsageRange.allCases[rangeTabs.selectedIndex]
            requestRefresh()
        }, for: .valueChanged)
        exportButton = KitButton.make("Export CSV", glyph: .download, variant: .outline) { [weak self] in self?.export() }
        controls.spacing = Space.space2
        controls.alignment = .center
        controls.addArrangedSubview(rangeTabs)
        controls.addArrangedSubview(exportButton)
        errorSlot.axis = .vertical

        limits.onLogin = { [weak self] machineId in
            guard let self, let machine = context.hub.fleet.machines.first(where: { $0.machineId == machineId }) else { return }
            context.sessionMenus.presenter().present(MachineLoginController(hub: context.hub, machine: machine), animated: true)
        }
        whereCard.onOpen = { [weak self] session in
            guard let self else { return }
            // `conversationHref`: the row with that id, else the newest that holds the session.
            let fleet = context.hub.fleet
            context.openSession(fleet.byId[session] != nil ? session : fleet.conversationId(sessionKey: session, machineId: "", cwd: nil))
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.now = Date.now.timeIntervalSince1970 * 1000
                self?.requestRefresh()
            }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        clock?.invalidate()
        clock = nil
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        arrange()
    }

    /// The window's width, which is what the web's breakpoint reads.
    private var span: Double { Double(view.window?.bounds.width ?? view.bounds.width) }

    /// Puts the page in the order its width asks for: under 640pt the limits
    /// lead and the controls follow them; wider, the controls stand first, at
    /// the column's end.
    private func arrange() {
        let next = span < 640
        guard next != narrow else { return }
        narrow = next
        controls.axis = next ? .vertical : .horizontal
        controls.alignment = next ? .leading : .center
        for card in [limits, whereCard, history] as [UsageCard] { card.narrow = next }
        // `.page`: `space-6` all round, `space-4` above and below and `space-3` each side on a phone.
        let (block, inline) = next ? (Space.space4, Space.space3) : (Space.space6, Space.space6)
        edges[0].constant = block
        edges[1].constant = block
        edges[2].constant = inline
        edges[3].constant = inline
        scroll.contentInset = .zero
        column.arrangedSubviews.forEach { $0.removeFromSuperview() }
        top.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if next {
            top.addArrangedSubview(controls)
            top.addArrangedSubview(UIView())
            for part in [errorSlot, limits, top, whereCard, history] as [UIView] { column.addArrangedSubview(part) }
        } else {
            top.addArrangedSubview(UIView())
            top.addArrangedSubview(controls)
            for part in [top, errorSlot, limits, whereCard, history] as [UIView] { column.addArrangedSubview(part) }
        }
    }

    override func refreshContent() {
        let fleet = context.hub.fleet
        errorSlot.arrangedSubviews.forEach { $0.removeFromSuperview() }
        errorSlot.isHidden = !fleet.spendFailed
        if fleet.spendFailed {
            errorSlot.addArrangedSubview(UsageCard.failed("Could not reach the hub for usage data. Check that it is running, then try again.",
                                                          retrying: rereading) { [weak self] in self?.reread() })
        }
        limits.configure(UsageLimits.read(fleet: fleet, now: now), now: now)
        let since = range.since(fleet: fleet)
        whereCard.configure(since: since)
        history.configure(since: since, hourly: range.hourly)
    }

    /// The hub's spend could not be read: reading it again, shown on the button.
    private func reread() {
        rereading = true
        requestRefresh()
        Task { @MainActor [weak self, hub = context.hub] in
            await hub.readSpend()
            self?.rereading = false
            self?.requestRefresh()
        }
    }

    // MARK: Export

    /// The list as a file. Sessions is the fleet's session ledger with the
    /// range's spend for both harnesses; Models and Machines are the rows of
    /// the harness and range on screen.
    private func export() {
        guard let shown = whereCard.shown, !exporting else { return }
        exporting = true
        exportButton.configuration?.showsActivityIndicator = true
        let since = range.since(fleet: context.hub.fleet)
        Task { @MainActor [weak self, reads, context] in
            guard let self else { return }
            defer {
                exporting = false
                exportButton.configuration?.showsActivityIndicator = false
            }
            do {
                let file: (name: String, body: String)
                if shown.grouping == .session {
                    var entries: [(key: String, harness: UsageHarness, row: UsageSummaryRow)] = []
                    for harness in UsageHarness.allCases {
                        guard let start = since[harness]?.start else { continue }
                        let summary = try await reads.summary(harness, groupBy: .session, since: start)
                        entries += summary.rows.map { ($0.id, harness, $0) }
                    }
                    file = ("fleet-sessions.csv", UsageSessionsExport.csv(fleet: context.hub.fleet, home: context.home, entries: entries) { self.stats($0) })
                } else {
                    file = UsageWhere.csv(shown.summary, harness: shown.harness, grouping: shown.grouping)
                }
                save(file.name, file.body)
            } catch {
                Toast.error("Could not export usage. \(error.localizedDescription)", in: view)
            }
        }
    }

    /// Hands the file to the system's own "save to": Files on iOS, the save panel on a Mac.
    private func save(_ name: String, _ body: String) {
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let url = folder.appending(path: name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(body.utf8).write(to: url)
        } catch {
            Toast.error(error.localizedDescription, in: view)
            return
        }
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }
}
