import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Skills (routes/config/skills/+page.svelte): two ways to the
/// same thing. Fetch a skill and the hub downloads its files once for the
/// whole fleet; link a marketplace and every machine clones it, then install
/// its plugins. Either way a skill is in every session's `/` menu on a
/// machine once that machine has it. Three groups: Skills (each one's
/// switch, where it landed, Fetch again, Previous versions under its row,
/// Remove everywhere), Marketplaces (Browse lists what one offers, each a
/// press from installed), Plugins; and under them what each machine has.
final class SkillsSectionController: ConfigSectionController {
    private lazy var fetch = KitButton.make(Words.Skills.fetchSkill, glyph: .plus, variant: .action) { [weak self] in self?.openFetch() }
    private lazy var refetch = KitButton.make("", glyph: .refresh, variant: .outline, height: .sm) { [weak self] in self?.refetchAll() }
    private lazy var link = KitButton.make(Words.Skills.linkMarketplace, glyph: .shop, variant: .outline, height: .sm) { [weak self] in self?.openLink() }
    private let refetchFault = metaLine(ink: Palette.statusFailInk)
    private let skillsList = RowList(label: Words.Skills.skills)
    private let marketList = RowList(label: Words.Skills.marketplaces)
    private let pluginList = RowList(label: Words.Skills.plugins)
    private let skillRows = KeyedRows()
    private let marketRows = KeyedRows()
    private let pluginRows = KeyedRows()
    private let noSkills = metaLine(Words.Skills.noSkills)
    private let noMarkets = metaLine(Words.Skills.noMarketplaces)
    private let noPlugins = metaLine(Words.Skills.noPlugins)
    private var inventory: MachineInventoryView!
    private var chips: [String: RolloutChip] = [:]
    private var busy: Set<String> = []
    /// Why a row's last action was refused, by its key, with the way to try it again.
    private var rowFaults: [String: (reason: String, again: () -> Void)] = [:]
    private var refetching = false
    private var refetchFailed = false
    // A skill's previous versions, open under its row.
    private var historyOf: String?
    private var versions: [String: [SkillVersion]] = [:]
    private var versionsFailed: [String: String] = [:]
    private var restoring: Int?
    private var restoreFailed: Int?
    private var versionViews: [String: PreviousVersionsView] = [:]
    // A marketplace's listing, open under its row.
    private var browsing: String?
    private var listings: [String: [MarketplacePluginInfo]] = [:]
    private var reading: Set<String> = []
    private var unread: [String: String] = [:]
    private var installFailed: [String: String] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()
        fetch.accessibilityIdentifier = "skills.fetch"
        setActions([fetch])
        refetchFault.isHidden = true
        for part in [refetch, refetchFault, link] as [UIView] { toolbar.addArrangedSubview(part) }
        toolbar.addArrangedSubview(UIView())
        inventory = MachineInventoryView(hub: hub, kind: .skills)
        setContent([
            group(.bolt, Words.Skills.skills, [noSkills, skillsList, metaLine(Words.Skills.degraded)], first: true),
            group(.shop, Words.Skills.marketplaces, [noMarkets, marketList]),
            group(.dataLayers, Words.Skills.plugins, [noPlugins, pluginList, metaLine(Words.Skills.pluginOff)]),
            inventory,
        ])
    }

    /// `.group`: its header in the section's hue, then its rows, 8pt apart; a hairline over every group after the first.
    private func group(_ glyph: Glyph, _ name: String, _ body: [UIView], first: Bool = false) -> UIView {
        if first {
            let stack = UIStackView(arrangedSubviews: [nsSectionHeader(glyph, hue: section.hue, name)] + body)
            stack.axis = .vertical
            stack.spacing = 8
            return stack
        }
        return editorSection(glyph, hue: section.hue, name, body)
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.configuration.load() }
    }

    /// The rows the hub could not fetch (fleet-faults.ts `hubFaults`): each carries the hub's reason.
    private var hubBroken: [(scope: String, key: String)] {
        let fleet = hub.configuration.snapshot
        let skills = (fleet?.skills ?? []).filter { $0.error != nil && $0.fetching != true }.map { ("skills", $0.name) }
        let plugins = (fleet?.config.plugins ?? []).filter { $0.error != nil && $0.fetching != true }.map { ("plugins", $0.id) }
        return skills + plugins
    }

    override func refreshContent() {
        let config: FleetConfig = hub.configuration
        ready = config.snapshot != nil
        problem = config.snapshot == nil ? config.problem : nil
        let down = hub.writesBlocked
        fetch.isEnabled = down == nil
        fetch.accessibilityHint = down
        link.isEnabled = down == nil
        let skills = config.snapshot?.skills ?? []
        let markets = config.snapshot?.config.marketplaces ?? []
        let plugins = config.snapshot?.config.plugins ?? []
        let broken = hubBroken
        refetch.isHidden = broken.isEmpty
        KitButton.setTitle(refetching ? Words.Skills.fetching : Words.Skills.fetchAllAgain(count: broken.count), of: refetch, variant: .outline, height: .sm)
        refetch.configuration?.showsActivityIndicator = refetching
        refetch.isEnabled = !refetching && down == nil
        if refetchFailed { refetch.configuration?.background.strokeColor = Palette.destructive }

        noSkills.isHidden = !skills.isEmpty
        skillsList.isHidden = skills.isEmpty
        skillsList.set(skillRows.keep(skills.map(\.name)))
        for skill in skills { drawSkill(skill, in: skillRows.row(skill.name).row) }

        noMarkets.isHidden = !markets.isEmpty
        marketList.isHidden = markets.isEmpty
        marketList.set(marketRows.keep(markets.map(\.name)))
        for market in markets { drawMarket(market, in: marketRows.row(market.name).row, installed: Set(plugins.map(\.id))) }

        noPlugins.isHidden = !plugins.isEmpty
        pluginList.isHidden = plugins.isEmpty
        pluginList.set(pluginRows.keep(plugins.map(\.id)))
        for plugin in plugins { drawPlugin(plugin, in: pluginRows.row(plugin.id).row) }

        inventory.configure(machines: hub.fleet.machines, taken: skills.map(\.name))
    }

    private func chip(_ scope: FaultScope, _ name: String) -> RolloutChip {
        let key = "\(scope):\(name)"
        let made = chips[key] ?? RolloutChip(hub: hub, scope: scope, name: name, what: name)
        made.openFault = { [weak self] group in
            guard let self else { return }
            navigationController?.pushViewController(FleetFaultController(group: group, hub: hub), animated: true)
        }
        chips[key] = made
        made.draw()
        return made
    }

    /// A resolved row's size and hash, as its meta says them.
    private func sized(bytes: Double?, hash: String?) -> [String] {
        [bytes.map(FleetSkills.bytes), hash.map { String($0.prefix(7)) }].compactMap(\.self)
    }

    private func faultLine(_ key: String) -> UIView? {
        rowFaults[key].map { fault in RowFault(fault.reason, again: fault.again) }
    }

    // MARK: Skills

    private func drawSkill(_ skill: FleetSkill, in row: ConfigRow) {
        let name = skill.name
        row.onToggle = { [weak self] on in self?.toggleSkill(name, on: on) }
        let meta = ([skill.source] + (skill.fetching == true ? [Words.Skills.fetching] : sized(bytes: skill.bytes, hash: skill.hash))).joined(separator: " · ")
        row.show(name: name, meta: meta, glyph: .bolt, hue: section.hue, enabled: skill.enabled, toggling: busy.contains(name), actions: [
            RowAction(label: skill.fetching == true ? Words.Skills.fetching : Words.Skills.fetchAgain, glyph: .refresh,
                      disabled: busy.contains(name) || skill.fetching == true) { [weak self] in self?.refetchSkill(name) },
            RowAction(label: historyOf == name ? Words.Skills.hidePreviousVersions : Words.Skills.previousVersions, glyph: .history) { [weak self] in
                self?.toggleHistory(name)
            },
            RowAction(label: Words.Skills.removeEverywhere, glyph: .trash, destructive: true, disabled: busy.contains(name)) { [weak self] in
                self?.removeSkill(name)
            },
        ])
        row.accessibilityIdentifier = "skills.row.\(name)"
        row.setRollout(chip(.skills, name))
        var below: [UIView] = []
        if let fault = faultLine(name) { below.append(fault) }
        let faults = RowFaults(hub: hub, scope: .skills, key: name) { [weak self] in Task { await self?.hub.configuration.load() } }
        if !faults.isHidden { below.append(faults) }
        if historyOf == name {
            if versions[name] == nil, versionsFailed[name] == nil {
                below.append(SkeletonView(height: 40))
                below.last?.accessibilityLabel = Words.Skills.readingVersions(name: name)
            } else {
                let list = versionViews[name] ?? PreviousVersionsView { [weak self] source in self?.sourceLabel(source) ?? source }
                versionViews[name] = list
                list.onRestore = { [weak self] version in self?.restore(name, version) }
                list.set((versions[name] ?? []).map { ListedVersion(id: $0.id, name: $0.name, hash: $0.hash, createdAt: $0.createdAt, source: $0.source) },
                         failed: versionsFailed[name], restoring: restoring, restoreFailed: restoreFailed)
                below.append(list)
            }
        }
        row.setBelow(below)
    }

    /// Where a kept version came from: the fleet's own row, or a machine's edited copy.
    private func sourceLabel(_ source: String) -> String {
        guard source.hasPrefix("machine:") else { return Words.Skills.theFleet }
        let id = String(source.dropFirst("machine:".count))
        return hub.fleet.machines.first { $0.machineId == id }?.name ?? id
    }

    private func toggleHistory(_ name: String) {
        guard historyOf != name else {
            historyOf = nil
            return requestRefresh()
        }
        historyOf = name
        requestRefresh()
        loadVersions(name)
    }

    private func loadVersions(_ name: String) {
        versionsFailed[name] = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                versions[name] = try await FleetSkills.history(name, hub: hub)
            } catch {
                versionsFailed[name] = ThreadsStore.failureWords(error)
            }
            requestRefresh()
        }
    }

    private func restore(_ name: String, _ version: ListedVersion) {
        restoring = version.id
        restoreFailed = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                // The row's rollout chip says where it lands.
                try await FleetSkills.restore(version.id, hub: hub)
                loadVersions(name)
            } catch {
                restoreFailed = version.id
                Toast.error(ThreadsStore.failureWords(error), in: view.window)
            }
            restoring = nil
            requestRefresh()
        }
    }

    /// A row's action, the row busy while it runs; a refusal stays under the row with Try again.
    private func run(_ key: String, again: @escaping () -> Void, _ work: @escaping () async throws -> Void) {
        busy.insert(key)
        rowFaults[key] = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await work()
            } catch {
                rowFaults[key] = (ThreadsStore.failureWords(error), again)
            }
            busy.remove(key)
            requestRefresh()
        }
    }

    private func toggleSkill(_ name: String, on: Bool) {
        run(name, again: { [weak self] in self?.toggleSkill(name, on: on) }) { [hub] in try await FleetSkills.switchSkill(name, on: on, hub: hub) }
    }

    private func refetchSkill(_ name: String) {
        // A fetch the hub could not make stands on the row as its hub fault.
        run(name, again: { [weak self] in self?.refetchSkill(name) }) { [hub] in try await FleetSkills.refetchSkill(name, hub: hub) }
    }

    /// Remove: at once, with Undo in the toast.
    private func removeSkill(_ name: String) {
        run(name, again: { [weak self] in self?.removeSkill(name) }) { [weak self, hub] in
            let deleted = try await FleetSkills.removeSkill(name, hub: hub)
            ConfigUndo.offer(Words.Configure.removed(what: name), mark: name, deleted: deleted, hub: hub, in: self?.view) {
                await hub.configuration.load()
            }
        }
    }

    /// Every row the hub could not fetch, again, in order; each row says what came of it.
    private func refetchAll() {
        refetching = true
        refetchFailed = false
        refetchFault.isHidden = true
        requestRefresh()
        let broken = hubBroken
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                var still = 0
                for fault in broken {
                    if fault.scope == "skills" {
                        if try await FleetSkills.refetchSkill(fault.key, hub: hub).error != nil { still += 1 }
                    } else if try await FleetSkills.refetchPlugin(fault.key, hub: hub).error != nil {
                        still += 1
                    }
                }
                refetchFailed = still > 0
                await hub.configuration.load()
            } catch {
                refetchFailed = true
                refetchFault.text = ThreadsStore.failureWords(error)
                refetchFault.isHidden = false
            }
            refetching = false
            requestRefresh()
        }
    }

    // MARK: Marketplaces

    private func drawMarket(_ market: FleetMarketplace, in row: ConfigRow, installed: Set<String>) {
        let name = market.name
        row.show(name: name, meta: market.source, glyph: .shop, hue: section.hue, actions: [
            RowAction(label: Words.Skills.unlink, glyph: .trash, destructive: true, disabled: busy.contains(name)) { [weak self] in self?.unlink(name) },
        ])
        row.setRollout(chip(.marketplaces, name))
        let browse = KitButton.make(browsing == name ? Words.Skills.hide : Words.Skills.browse, glyph: .search, variant: .ghost, height: .sm) { [weak self] in
            self?.browse(market)
        }
        browse.accessibilityHint = Words.Skills.readFrom(source: market.source)
        row.setTrailing([browse])
        var below: [UIView] = []
        if let fault = faultLine(name) { below.append(fault) }
        let faults = RowFaults(hub: hub, scope: .marketplaces, key: name)
        if !faults.isHidden { below.append(faults) }
        if browsing == name {
            if reading.contains(name) {
                let skeleton = SkeletonView(height: 40)
                skeleton.accessibilityLabel = Words.Skills.reading(name: name)
                below.append(skeleton)
            } else if let failure = unread[name] {
                below.append(metaLine(failure, ink: Palette.statusAttnInk))
            } else if (listings[name] ?? []).isEmpty {
                below.append(metaLine(Words.Skills.listsNothing))
            } else {
                for plugin in listings[name] ?? [] { below.append(offer(plugin, marketplace: name, installed: installed)) }
            }
        }
        row.setBelow(below)
    }

    /// One plugin a marketplace offers (`.offer`): its name, version and category over its description, then Install, or Added.
    private func offer(_ plugin: MarketplacePluginInfo, marketplace: String, installed: Set<String>) -> UIView {
        let id = "\(plugin.name)@\(marketplace)"
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = plugin.name
        var line: [UIView] = [name]
        if let version = plugin.version {
            let words = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
            words.text = version
            line.append(words)
        }
        if let category = plugin.category { line.append(metaLine(category)) }
        let head = UIStackView(arrangedSubviews: line + [UIView()])
        head.spacing = 8
        head.alignment = .firstBaseline
        let text = UIStackView(arrangedSubviews: [head])
        text.axis = .vertical
        text.spacing = 2
        if let description = plugin.description { text.addArrangedSubview(metaLine(description)) }
        let end: UIView
        if installed.contains(id) {
            end = metaLine(Words.Skills.added)
        } else {
            let pending = busy.contains(id)
            let install = KitButton.make(pending ? Words.Skills.adding : Words.Skills.install, variant: .outline, height: .sm) { [weak self] in self?.install(id) }
            install.configuration?.showsActivityIndicator = pending
            install.isEnabled = !pending
            if installFailed[id] != nil { install.configuration?.background.strokeColor = Palette.destructive }
            end = install
        }
        end.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [text, end])
        row.spacing = 8
        row.alignment = .center
        let box = UIStackView(arrangedSubviews: [row])
        box.axis = .vertical
        box.spacing = 4
        if let failed = installFailed[id] { box.addArrangedSubview(RowFault(failed, again: nil)) }
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = .init(top: 8, leading: 10, bottom: 8, trailing: 10)
        box.backgroundColor = Palette.surfaceRecess
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.cornerCurve = .continuous
        return box
    }

    private func browse(_ market: FleetMarketplace) {
        let name = market.name
        guard browsing != name else {
            browsing = nil
            return requestRefresh()
        }
        browsing = name
        requestRefresh()
        guard listings[name] == nil, !reading.contains(name) else { return }
        reading.insert(name)
        unread[name] = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                listings[name] = try await FleetSkills.catalog(market, hub: hub)
            } catch {
                unread[name] = ThreadsStore.failureWords(error)
            }
            reading.remove(name)
            requestRefresh()
        }
    }

    private func install(_ id: String) {
        busy.insert(id)
        installFailed[id] = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await FleetSkills.install(id, hub: hub)
                await hub.configuration.load()
            } catch {
                installFailed[id] = ThreadsStore.failureWords(error)
            }
            busy.remove(id)
            requestRefresh()
        }
    }

    private func unlink(_ name: String) {
        run(name, again: { [weak self] in self?.unlink(name) }) { [weak self, hub] in
            let deleted = try await FleetSkills.unlink(name, hub: hub)
            await MainActor.run { if self?.browsing == name { self?.browsing = nil } }
            ConfigUndo.offer(Words.Configure.unlinked(what: name), mark: name, deleted: deleted, hub: hub, in: self?.view) {
                await hub.configuration.load()
            }
        }
    }

    // MARK: Plugins

    private func drawPlugin(_ plugin: FleetPlugin, in row: ConfigRow) {
        let id = plugin.id
        row.onToggle = { [weak self] on in self?.togglePlugin(id, on: on) }
        let sized = sized(bytes: plugin.bytes, hash: plugin.hash).joined(separator: " · ")
        let meta = plugin.fetching == true ? Words.Skills.fetching : (sized.isEmpty ? Words.Skills.noBytes : sized)
        row.show(name: id, meta: meta, glyph: .dataLayers, hue: section.hue, mono: true, enabled: plugin.enabled, toggling: busy.contains(id), actions: [
            RowAction(label: plugin.fetching == true ? Words.Skills.fetching : Words.Skills.fetchAgain, glyph: .refresh,
                      disabled: busy.contains(id) || plugin.fetching == true) { [weak self] in self?.refetchPlugin(id) },
            RowAction(label: Words.Skills.removeEverywhere, glyph: .trash, destructive: true, disabled: busy.contains(id)) { [weak self] in
                self?.removePlugin(id)
            },
        ])
        row.setRollout(chip(.plugins, id))
        var below: [UIView] = []
        if let fault = faultLine(id) { below.append(fault) }
        let faults = RowFaults(hub: hub, scope: .plugins, key: id) { [weak self] in Task { await self?.hub.configuration.load() } }
        if !faults.isHidden { below.append(faults) }
        row.setBelow(below)
    }

    private func togglePlugin(_ id: String, on: Bool) {
        run(id, again: { [weak self] in self?.togglePlugin(id, on: on) }) { [hub] in try await FleetSkills.switchPlugin(id, on: on, hub: hub) }
    }

    private func refetchPlugin(_ id: String) {
        run(id, again: { [weak self] in self?.refetchPlugin(id) }) { [hub] in try await FleetSkills.refetchPlugin(id, hub: hub) }
    }

    private func removePlugin(_ id: String) {
        run(id, again: { [weak self] in self?.removePlugin(id) }) { [weak self, hub] in
            let deleted = try await FleetSkills.removePlugin(id, hub: hub)
            ConfigUndo.offer(Words.Configure.removed(what: id), mark: id, deleted: deleted, hub: hub, in: self?.view) {
                await hub.configuration.load()
            }
        }
    }

    #if DEBUG
    /// A skill a machine has, adopted from the machines' list as its Adopt does it.
    func probeAdopt(_ name: String, machine: MachineRow) async {
        await inventory.probeAdopt(name, machine: machine)
    }

    func probeToggle(_ name: String, on: Bool) { toggleSkill(name, on: on) }
    #endif

    // MARK: Popovers

    private func openFetch() {
        let taken = (hub.configuration.snapshot?.skills ?? []).map(\.name)
        KitPopover.present(FetchSkillController(hub: hub, taken: taken), from: fetch, in: self, align: .end)
    }

    private func openLink() {
        let taken = (hub.configuration.snapshot?.config.marketplaces ?? []).map(\.name)
        KitPopover.present(LinkMarketplaceController(hub: hub, taken: taken), from: link, in: self, align: .start)
    }
}

/// Fetch a skill (FetchSkillPopover.svelte): a source and a name, where it
/// applies, then, when the repo holds several, which one. The hub downloads
/// the files once and every machine writes them into its skills directory;
/// the popover closes once the row has landed.
final class FetchSkillController: KitPopoverController {
    private let hub: HubConnection
    private let taken: [String]
    private let source = KitField(placeholder: Words.Skills.sourcePlaceholder, mono: true)
    private let name = KitField(placeholder: Words.Skills.namePlaceholder, mono: true)
    private var sourceField: ConfigField!
    private var nameField: ConfigField!
    private let scope = KitSelect()
    private let choices = UIStackView()
    private let failure = metaLine(ink: Palette.statusFailInk)
    private var submit: UIButton!
    private var named = false
    private var busy = false
    private var projectId = ""
    private let column = UIStackView()

    init(hub: HubConnection, taken: [String]) {
        self.hub = hub
        self.taken = taken
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FetchSkillController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        sourceField = ConfigField(label: Words.Skills.source, control: source)
        nameField = ConfigField(label: Words.Skills.name, control: name)
        source.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            if !named { name.text = FleetSkills.suggestName(FleetSkills.normalize(source.text ?? "")) }
            draw()
        }, for: .editingChanged)
        name.addAction(UIAction { [weak self] _ in
            self?.named = true
            self?.draw()
        }, for: .editingChanged)
        scope.accessibilityLabel = Words.Skills.scope
        // Where it applies, listed as the select opens.
        scope.menuOnOpen { [weak self] in
            guard let self else { return [] }
            return [UIAction(title: Words.Skills.everyMachine, state: projectId.isEmpty ? .on : .off) { [weak self] _ in
                self?.projectId = ""
                self?.draw()
            }] + hub.fleet.projects.map { each in
                UIAction(title: each.name, state: each.id == projectId ? .on : .off) { [weak self] _ in
                    self?.projectId = each.id
                    self?.draw()
                }
            }
        }
        choices.axis = .vertical
        choices.spacing = 4
        choices.isHidden = true
        failure.isHidden = true
        submit = KitButton.make(Words.Skills.fetchSkill, variant: .action, height: .sm) { [weak self] in self?.fetchIt() }
        let end = UIStackView(arrangedSubviews: [UIView(), submit])
        let scopeRow = UIStackView(arrangedSubviews: [scope, UIView()])
        for part in [sourceField!, nameField!, scopeRow, choices, failure, end] as [UIView] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = 12
        column.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
        ])
        draw()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        source.becomeFirstResponder()
    }

    private var normalized: String { FleetSkills.normalize(source.text ?? "") }
    private var problem: String? { FleetSkills.nameProblem(name.text ?? "", taken: taken) }

    private func draw() {
        let typed = (source.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let hint = !normalized.isEmpty && normalized != typed ? Words.Skills.readsAs(source: normalized) : Words.Skills.sourceHint
        sourceField.sayCoded(hint)
        let skillName = (name.text ?? "").isEmpty ? "name" : name.text ?? "name"
        let project = hub.fleet.projects.first { $0.id == projectId }
        // The directory it lands in: the user layer's, or each of the project's folders.
        let path = project == nil ? "\(Words.Skills.userLayer)/skills/\(skillName)" : "\(Words.Skills.claudeDir)/skills/\(skillName)"
        nameField.sayCoded("\(Words.Skills.landsIn) `\(path)`\(project.map { Words.Skills.inProjectFolders(project: $0.name) } ?? "")",
                           problem: (name.text ?? "").isEmpty ? nil : problem)
        scope.setValue(project?.name ?? Words.Skills.everyMachine)
        KitButton.setTitle(busy ? Words.Skills.fetching : Words.Skills.fetchSkill, of: submit, variant: .action, height: .sm)
        submit.configuration?.showsActivityIndicator = busy
        submit.isEnabled = !normalized.isEmpty && problem == nil && !busy && hub.writesBlocked == nil
        fit()
    }

    private func fit() {
        let width = min(380, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = column.systemLayoutSizeFitting(CGSize(width: width - 24, height: 0), withHorizontalFittingPriority: .required,
                                                    verticalFittingPriority: .fittingSizeLevel).height + 24
        preferredContentSize = CGSize(width: width, height: height)
    }

    private func fetchIt(_ from: String? = nil) {
        guard !busy else { return }
        busy = true
        failure.isHidden = true
        draw()
        let skill = (name.text ?? "").trimmingCharacters(in: .whitespaces)
        let source = from ?? normalized
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let row = try await FleetSkills.save(skill, source: source, projectId: projectId.isEmpty ? nil : projectId, hub: hub)
                await hub.configuration.load()
                busy = false
                if let several = row.choices, !several.isEmpty {
                    showChoices(several, source: source)
                    draw()
                    return
                }
                // The row it made says the rest: its rollout chip, machine by machine.
                dismiss(animated: true)
            } catch {
                busy = false
                failure.text = ThreadsStore.failureWords(error)
                failure.isHidden = false
                draw()
            }
        }
    }

    /// The repo holds several skills: each a press that fetches that one.
    private func showChoices(_ several: [String], source: String) {
        choices.arrangedSubviews.forEach { $0.removeFromSuperview() }
        choices.addArrangedSubview(metaLine(Words.Skills.severalSkills))
        for choice in several {
            let button = KitButton.make(choice, variant: .ghost, height: .sm) { [weak self] in
                guard let self else { return }
                let picked = FleetSkills.pick(source, choice: choice)
                self.source.text = picked
                choices.isHidden = true
                fetchIt(picked)
            }
            button.contentHorizontalAlignment = .leading
            choices.addArrangedSubview(button)
        }
        choices.isHidden = false
    }
}

/// Link a marketplace (LinkMarketplacePopover.svelte): every machine clones
/// it, and nothing is installed until a plugin is picked from it. It links
/// under the name its own marketplace.json gives, read by the hub as the
/// source is typed: the one name its plugins install by.
final class LinkMarketplaceController: KitPopoverController {
    private let hub: HubConnection
    private let taken: [String]
    private let source = KitField(placeholder: Words.Skills.marketSourcePlaceholder, mono: true)
    private let name = KitField(placeholder: Words.Skills.marketNamePlaceholder, mono: true)
    private var sourceField: ConfigField!
    private var nameField: ConfigField!
    private let failure = metaLine(ink: Palette.statusFailInk)
    private var submit: UIButton!
    private var busy = false
    /// What the source's marketplace.json calls it, for the source it was read from.
    private var read: (source: String, name: String?, problem: String?)?
    private var reading: Task<Void, Never>?
    private let column = UIStackView()

    init(hub: HubConnection, taken: [String]) {
        self.hub = hub
        self.taken = taken
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("LinkMarketplaceController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        sourceField = ConfigField(label: Words.Skills.source, control: source)
        nameField = ConfigField(label: Words.Skills.name, control: name)
        source.addAction(UIAction { [weak self] _ in self?.typed() }, for: .editingChanged)
        name.addAction(UIAction { [weak self] _ in self?.draw() }, for: .editingChanged)
        failure.isHidden = true
        submit = KitButton.make(Words.Skills.link, variant: .action, height: .sm) { [weak self] in self?.link() }
        let end = UIStackView(arrangedSubviews: [UIView(), submit])
        for part in [sourceField!, nameField!, failure, end] as [UIView] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = 12
        column.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
        ])
        draw()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        source.becomeFirstResponder()
    }

    private var wanted: String { (source.text ?? "").trimmingCharacters(in: .whitespaces) }
    private var own: String? { read?.source == wanted ? read?.name : nil }

    /// Typing rests 400ms before the hub reads the source.
    private func typed() {
        reading?.cancel()
        let at = wanted
        draw()
        guard !at.isEmpty else {
            read = nil
            return draw()
        }
        reading = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, !Task.isCancelled else { return }
            do {
                let found = try await FleetSkills.marketplaceName(at, hub: hub)
                guard wanted == at else { return }
                read = (at, found, nil)
                if (name.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty { name.text = found }
            } catch {
                guard wanted == at else { return }
                read = (at, nil, ThreadsStore.failureWords(error))
            }
            draw()
        }
    }

    private func draw() {
        let unread = read?.source == wanted ? read?.problem : nil
        sourceField.sayCoded(Words.Skills.marketSourceHint, problem: unread)
        let readingNow = !wanted.isEmpty && read?.source != wanted
        let typedName = (name.text ?? "").trimmingCharacters(in: .whitespaces)
        let clash = own.map { taken.contains($0) } ?? false
        let differs = own != nil && !typedName.isEmpty && typedName != own
        nameField.sayCoded(readingNow ? Words.Skills.readingManifest : Words.Skills.installsAs(name: own ?? "name"),
                           warn: differs ? Words.Skills.callsItself(name: own ?? "") : nil,
                           problem: clash ? Words.Skills.alreadyLinked(name: own ?? "") : nil)
        KitButton.setTitle(busy ? Words.Skills.linking : Words.Skills.link, of: submit, variant: .action, height: .sm)
        submit.configuration?.showsActivityIndicator = busy
        submit.isEnabled = own != nil && !clash && !busy && hub.writesBlocked == nil
        let width = min(380, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = column.systemLayoutSizeFitting(CGSize(width: width - 24, height: 0), withHorizontalFittingPriority: .required,
                                                    verticalFittingPriority: .fittingSizeLevel).height + 24
        preferredContentSize = CGSize(width: width, height: height)
    }

    private func link() {
        guard own != nil, !busy else { return }
        busy = true
        failure.isHidden = true
        draw()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                _ = try await FleetSkills.link(wanted, hub: hub)
                dismiss(animated: true)
            } catch {
                busy = false
                failure.text = ThreadsStore.failureWords(error)
                failure.isHidden = false
                draw()
            }
        }
    }
}
