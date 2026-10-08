import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

// Jump to (JumpPalette.svelte, jump-index.ts, jump-search.svelte.ts): one
// field over the fleet's projects, machines, running and stored sessions,
// ranked as you type, and the transcripts' full text under them, scoped to
// what you or the agent wrote with `@me` / `@agent`.

// MARK: Index

/// Which group a row belongs to: its mark and its cap.
enum JumpKind { case project, machine, live, stored }

/// Where a row goes.
enum JumpTarget {
    case project(String)
    case machine(String)
    case conversation(String)
}

struct JumpRow {
    let id: String
    let kind: JumpKind
    let label: String
    let detail: String
    let target: JumpTarget
    let labelLower: String
    let detailLower: String
    let hay: String

    init(id: String, kind: JumpKind, label: String, detail: String, target: JumpTarget) {
        self.id = id
        self.kind = kind
        self.label = label
        self.detail = detail
        self.target = target
        labelLower = label.lowercased()
        detailLower = detail.lowercased()
        hay = "\(labelLower) \(detailLower)"
    }
}

/// A row that survived the query, with where it matched.
struct RankedRow {
    let row: JumpRow
    let labelRanges: [Range<Int>]
    let detailRanges: [Range<Int>]
}

struct JumpGroup {
    let name: String
    let rows: [RankedRow]
}

struct JumpIndex {
    var groups: [(name: String, rows: [JumpRow])] = []
    var recent: [JumpGroup] = []
    /// sessionId → its title, so a transcript hit can name its conversation.
    var sessionTitles: [String: String] = [:]

    static let names = ["Projects", "Machines", "Running sessions", "Recent sessions"]
    static let caps: [String: Int] = ["Projects": 8, "Machines": 8, "Running sessions": 10, "Recent sessions": 16]
    /// The empty query is a preview, not a listing.
    static let previewCap = 8
    static let recentPerMachine = 8

    @MainActor
    static func build(hub: HubConnection, home: HomeModel) -> JumpIndex {
        let fleet = hub.fleet
        let leaf = { (path: String) in path.split(separator: "/").last.map(String.init) ?? path }
        var lists: [[JumpRow]] = [[], [], [], []]
        for project in fleet.projects {
            lists[0].append(JumpRow(id: "project:\(project.id)", kind: .project, label: project.name, detail: project.primaryPlace?.path ?? "", target: .project(project.id)))
        }
        for machine in fleet.machines where machine.status == "online" {
            lists[1].append(JumpRow(id: "machine:\(machine.machineId)", kind: .machine, label: machine.hostname,
                                    detail: "\(machine.os) · start a session here", target: .machine(machine.machineId)))
        }
        let words: [Activity: String] = [.working: "Working", .blocked: "Needs you", .idle: "Idle"]
        let running = fleet.rows.filter(\.isLive)
        for row in running {
            lists[2].append(JumpRow(id: "live:\(row.id)", kind: .live, label: leaf(row.cwd).isEmpty ? row.id : leaf(row.cwd),
                                    detail: "\(row.cwd.isEmpty ? "—" : row.cwd) · \(words[home.activity(row.id)] ?? "")", target: .conversation(row.id)))
        }
        var destinations = Set(running.map(\.id))
        var recentStored: [JumpRow] = []
        var titles: [String: String] = [:]
        for machine in fleet.machines {
            for (i, info) in fleet.catalog(machine.machineId).enumerated() {
                let title = fleet.storedTitle(info, machineId: machine.machineId)
                titles[info.sessionId] = title
                let to = fleet.conversationId(sessionKey: info.sessionId, machineId: machine.machineId, cwd: info.cwd)
                guard !destinations.contains(to) else { continue }
                destinations.insert(to)
                let row = JumpRow(id: "stored:\(machine.machineId):\(info.sessionId)", kind: .stored, label: title,
                                  detail: "\(machine.hostname) · \(info.cwd ?? "")", target: .conversation(to))
                lists[3].append(row)
                if i < recentPerMachine { recentStored.append(row) }
            }
        }
        var index = JumpIndex()
        index.sessionTitles = titles
        index.groups = zip(names, lists).filter { !$0.1.isEmpty }.map { (name: $0.0, rows: $0.1) }
        let preview = { (rows: [JumpRow]) in rows.prefix(previewCap).map { RankedRow(row: $0, labelRanges: [], detailRanges: []) } }
        index.recent = (zip(names.prefix(3), lists.prefix(3)).map { JumpGroup(name: $0.0, rows: preview($0.1)) }
            + [JumpGroup(name: names[3], rows: preview(recentStored))]).filter { !$0.rows.isEmpty }
        return index
    }

    /// Whether every character of `needle` appears in order in `hay`.
    private static func matches(_ hay: String, _ needle: String) -> Bool {
        var at = hay.startIndex
        for char in needle {
            guard let found = hay[at...].firstIndex(of: char) else { return false }
            at = hay.index(after: found)
        }
        return true
    }

    /// Where `needle` sits inside `lower`: one run when it is there outright,
    /// else the characters a subsequence match walked through, merged into runs.
    static func ranges(_ lower: String, _ needle: String) -> [Range<Int>] {
        let chars = Array(lower)
        let want = Array(needle)
        if let start = (0 ... max(0, chars.count - want.count)).first(where: { chars.count >= want.count && Array(chars[$0 ..< $0 + want.count]) == want }) {
            return [start ..< start + want.count]
        }
        var out: [Range<Int>] = []
        var cursor = 0
        for char in want {
            guard let found = chars[cursor...].firstIndex(of: char) else { return [] }
            if let last = out.last, last.upperBound == found { out[out.count - 1] = last.lowerBound ..< found + 1 } else { out.append(found ..< found + 1) }
            cursor = found + 1
        }
        return out
    }

    func filter(_ query: String) -> [JumpGroup] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return recent }
        return groups.compactMap { group in
            var ranked: [(row: JumpRow, tier: Int)] = []
            for row in group.rows {
                let tier: Int
                if row.labelLower.hasPrefix(needle) { tier = 0 } else if row.labelLower.contains(needle) { tier = 1 } else if row.hay.contains(needle) { tier = 2 } else if Self.matches(row.hay, needle) { tier = 3 } else { continue }
                ranked.append((row, tier))
            }
            let rows = ranked.enumerated().sorted { $0.element.tier != $1.element.tier ? $0.element.tier < $1.element.tier : $0.offset < $1.offset }
                .prefix(Self.caps[group.name] ?? 8)
                .map { RankedRow(row: $0.element.row, labelRanges: Self.ranges($0.element.row.labelLower, needle), detailRanges: Self.ranges($0.element.row.detailLower, needle)) }
            return rows.isEmpty ? nil : JumpGroup(name: group.name, rows: Array(rows))
        }
    }
}

// MARK: Search

/// Who wrote the line, as the palette names them and the index stores them.
enum JumpAuthor: String, CaseIterable {
    case me, agent

    var role: String { self == .me ? "user" : "assistant" }
    var label: String { self == .me ? "Me" : "Agent" }
    var detail: String { self == .me ? "only what I wrote" : "only what the agent wrote" }
    var glyph: Glyph { self == .me ? .user : .ghost }

    /// A whole `@me` / `@agent` word anywhere in the query.
    static func parse(_ query: String) -> (author: JumpAuthor?, text: String) {
        guard let match = query.firstMatch(of: /(?i)(?:^|\s)@(me|agent)(?=\s|$)/) else {
            return (nil, query.trimmingCharacters(in: .whitespaces))
        }
        var rest = query
        rest.removeSubrange(match.range)
        let text = rest.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return (JumpAuthor(rawValue: String(match.1).lowercased()), text)
    }

    /// The `@…` word at the end of the query, which opens the author picker.
    static func fragment(_ query: String) -> String? {
        query.firstMatch(of: /(?i)(?:^|\s)@([a-z]*)$/).map { String($0.1).lowercased() }
    }

    /// The query with the half-typed `@…` taken back out.
    static func stripFragment(_ query: String) -> String {
        guard let match = query.firstMatch(of: /(?i)(?:^|\s)@([a-z]*)$/) else { return query }
        return String(query[..<match.range.lowerBound]).trimmingCharacters(in: .whitespaces)
    }
}

typealias TranscriptHit = Components.Schemas.GetApiSearch200.HitsPayloadPayload

/// The transcripts' full-text search: 150ms after the last keystroke, two
/// characters or more, one hit per conversation, ten at most; any keystroke
/// drops what is in flight.
@MainActor
@Observable
final class JumpSearch {
    private(set) var hits: [TranscriptHit] = []
    private(set) var pending = false
    @ObservationIgnored private var task: Task<Void, Never>?
    private let hub: HubConnection

    init(hub: HubConnection) {
        self.hub = hub
    }

    func update(_ query: String, author: JumpAuthor?) {
        task?.cancel()
        let parsed = JumpAuthor.parse(query)
        let scope = author ?? parsed.author
        guard parsed.text.count >= 2, JumpAuthor.fragment(query) == nil else {
            hits = []
            pending = false
            return
        }
        pending = true
        task = Task { @MainActor [weak self, hub] in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            do {
                let response = try await hub.api.search.transcripts(.init(query: .init(q: parsed.text, limit: "20", role: scope?.role)))
                guard !Task.isCancelled, let self else { return }
                var seen = Set<String>()
                let next = Array(try response.ok.body.json.hits.filter { seen.insert($0.sessionId).inserted }.prefix(10))
                if next.map(\.docId) != hits.map(\.docId) { hits = next }
                pending = false
            } catch {
                guard !Task.isCancelled, let self else { return }
                hits = []
                pending = false
            }
        }
    }
}

// MARK: Palette

/// What opened the palette: ⌘K, or the button tapped.
enum JumpOpener {
    case key
    case view(UIView)
}

/// The palette (Command.Dialog at 9% from the top, up to 672pt wide, 82%
/// tall at most): the kit dialog's recess frame 7pt round one sunken well,
/// cut to the frame's radius less that inset, holding the search line, the
/// groups and the key hints, each divided by the hairline. From ⌘K it only
/// fades in over `durControl`, scrim and all; from the Jump button it grows
/// out of the button from the pop scale and rise over `durPop` on the
/// drawer curve. Rows that arrive, leave or change rank move as every list
/// does: moves over `durPanel` in-out, arrivals fading in, leavers out over
/// `durExit`.
final class JumpPaletteController: UIViewController, UIViewControllerTransitioningDelegate, UITextFieldDelegate {
    var onProject: (String) -> Void = { _ in }
    var onMachine: (String) -> Void = { _ in }
    var onConversation: (String) -> Void = { _ in }

    private let hub: HubConnection
    private let home: HomeModel
    private let opener: JumpOpener
    private let search: JumpSearch
    private var index: JumpIndex
    private let frameView = UIView()
    private let well = UIView()
    private let field = UITextField()
    private let chip = UIStackView()
    private let scroll = UIScrollView()
    private let list = UIStackView()
    private var listHeight: NSLayoutConstraint!
    private var author: JumpAuthor?
    /// Every row on screen, keyed by its identity, so a requery moves rows rather than replacing them.
    private var rowViews: [String: UIView] = [:]
    /// What Return opens, in list order, and which one is selected.
    private var selectable: [(id: String, action: () -> Void)] = []
    private var selected = 0

    init(hub: HubConnection, home: HomeModel, opener: JumpOpener) {
        self.hub = hub
        self.home = home
        self.opener = opener
        search = JumpSearch(hub: hub)
        index = JumpIndex.build(hub: hub, home: home)
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("JumpPaletteController is built in code")
    }

    private static let inset = 7.0
    /// A row's inset inside the well's 1pt edge: the list's 4 and the group's 4.
    private static let listInset = 8.0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.accessibilityViewIsModal = true
        frameView.backgroundColor = Palette.surfaceRecess
        frameView.layer.cornerRadius = Radius.radiusModal
        frameView.layer.cornerCurve = .continuous
        frameView.boxShadow = Shadow.shadowOverlay
        frameView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(frameView)
        well.backgroundColor = Palette.surfaceRecess
        // `.jump-well`: `calc(var(--radius-lg) - var(--jump-inset))`.
        well.layer.cornerRadius = Radius.radiusLg - Self.inset
        well.layer.cornerCurve = .continuous
        well.layer.borderWidth = 1
        well.clipsToBounds = true
        well.translatesAutoresizingMaskIntoConstraints = false
        frameView.addSubview(well)

        // The search line: the glyph, the author chip, the field, flex siblings.
        field.font = fieldFont
        field.textColor = Palette.inkStrong
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.returnKeyType = .go
        field.clearButtonMode = .never
        field.delegate = self
        field.accessibilityLabel = "Jump to"
        field.addAction(UIAction { [weak self] _ in self?.queryChanged() }, for: .editingChanged)
        chip.isHidden = true
        let searchRow = UIStackView(arrangedSubviews: [GlyphView(.search, size: 16, tint: Palette.inkMuted), chip, field])
        searchRow.spacing = 7
        searchRow.alignment = .center
        searchRow.isLayoutMarginsRelativeArrangement = true
        searchRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 11, bottom: 0, trailing: 11)
        // `.jump-search { height: 42px }`, its hairline foot included: 41 over the rule.
        searchRow.heightAnchor.constraint(equalToConstant: 41).isActive = true

        list.axis = .vertical
        list.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(list)
        scroll.keyboardDismissMode = .onDrag
        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        listHeight = scroll.heightAnchor.constraint(equalToConstant: 0)
        listHeight.priority = .defaultHigh

        let footer = UIStackView(arrangedSubviews: [hint("↑↓", "navigate"), hint("↵", "open"), hint("esc", "close"), UIView()])
        footer.spacing = 16
        footer.isLayoutMarginsRelativeArrangement = true
        footer.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 7, leading: 12, bottom: 7, trailing: 12)

        let column = UIStackView(arrangedSubviews: [searchRow, rule(), scroll, rule(), footer])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        well.addSubview(column)

        // `sm:max-w-2xl`: 672pt wherever the window has it; a long row truncates, it never widens the panel.
        let wanted = frameView.widthAnchor.constraint(equalToConstant: 672)
        wanted.priority = .required - 1
        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            wanted,
            frameView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -32),
            frameView.topAnchor.constraint(equalTo: view.topAnchor, constant: UIScreen.main.bounds.height * 0.09),
            frameView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: 0.82),
            frameView.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -16),
            well.topAnchor.constraint(equalTo: frameView.topAnchor, constant: Self.inset),
            well.bottomAnchor.constraint(equalTo: frameView.bottomAnchor, constant: -Self.inset),
            well.leadingAnchor.constraint(equalTo: frameView.leadingAnchor, constant: Self.inset),
            well.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -Self.inset),
            // Everything stands inside the well's 1pt border.
            column.topAnchor.constraint(equalTo: well.topAnchor, constant: 1),
            column.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -1),
            column.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: 1),
            column.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: -1),
            listHeight,
            // `.jump-list` pads 4 and each group 4 more.
            list.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Self.listInset),
            list.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Self.listInset),
            list.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Self.listInset),
            list.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Self.listInset),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (palette: JumpPaletteController, _: UITraitCollection) in palette.paint() }
        paint()
        placeholder()
        render(animated: false)
        follow()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        field.becomeFirstResponder()
    }

    private func paint() {
        well.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    private func rule() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    /// A key hint (ui/kbd): a 20pt recess tile in muted meta, then its word.
    private func hint(_ key: String, _ word: String) -> UIView {
        let kbd = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
        kbd.text = key
        kbd.textAlignment = .center
        let tile = UIView()
        tile.backgroundColor = Palette.surfaceRecess
        tile.layer.cornerRadius = Radius.radiusXs
        kbd.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(kbd)
        NSLayoutConstraint.activate([
            tile.heightAnchor.constraint(equalToConstant: 20),
            tile.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            kbd.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: 4),
            kbd.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -4),
            kbd.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
        ])
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.text = word
        let row = UIStackView(arrangedSubviews: [tile, label])
        row.spacing = 4
        row.alignment = .center
        return row
    }

    /// `.jump-field` is body type; under a finger every field is 16pt
    /// (app.css, `pointer: coarse`: `font-size: 16px`).
    private var fieldFont: UIFont {
        traitCollection.userInterfaceIdiom == .mac ? TypeScale.typeBody.font : TypeScale.typeBody.font(16)
    }

    private func placeholder() {
        let text = author == nil ? "Jump to a project, machine, or session…" : "Search these messages…"
        field.attributedPlaceholder = NSAttributedString(string: text, attributes: [.font: fieldFont, .foregroundColor: Palette.inkMuted])
    }

    /// Follows the fleet and the search while the palette is up.
    private func follow() {
        withObservationTracking {
            _ = search.hits
            _ = search.pending
            _ = hub.fleet.rows
            _ = hub.fleet.catalogs
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.index = JumpIndex.build(hub: self.hub, home: self.home)
                self.render(animated: true)
                self.follow()
            }
        }
    }

    // MARK: Query

    private var query: String { field.text ?? "" }

    private func queryChanged() {
        // A token typed out in full becomes the same chip the menu makes.
        let parsed = JumpAuthor.parse(query)
        if let typed = parsed.author {
            setAuthor(typed)
            field.text = parsed.text
        }
        selected = 0
        search.update(query, author: author)
        render(animated: true)
    }

    private func setAuthor(_ next: JumpAuthor?) {
        author = next
        chip.arrangedSubviews.forEach { $0.removeFromSuperview() }
        placeholder()
        guard let next else {
            chip.isHidden = true
            search.update(query, author: nil)
            return
        }
        // The chip: the brand wash in its own ink inside a real edge, the
        // author's mark, its name, and its own ×.
        let mark = GlyphView(next.glyph, size: 12, tint: Palette.brandInk)
        mark.alpha = 0.75
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.brandInk)
        name.text = next.label
        let off = UIButton(type: .system)
        off.setAttributedTitle(NSAttributedString(string: "×", attributes: TypeScale.typeLabel.attributes(color: Palette.brandInk.withAlphaComponent(0.65))), for: .normal)
        off.accessibilityLabel = "Clear author filter"
        off.addAction(UIAction { [weak self] _ in
            self?.setAuthor(nil)
            self?.field.becomeFirstResponder()
            self?.render(animated: true)
        }, for: .primaryActionTriggered)
        off.widthAnchor.constraint(equalToConstant: 14).isActive = true
        [mark, name, off].forEach(chip.addArrangedSubview)
        chip.spacing = 4
        chip.alignment = .center
        chip.isLayoutMarginsRelativeArrangement = true
        chip.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 7, bottom: 0, trailing: 3)
        chip.backgroundColor = Palette.brandWash
        chip.layer.cornerRadius = 10.5
        chip.layer.borderWidth = 1
        chip.layer.borderColor = Palette.actionSolid.resolvedColor(with: traitCollection).cgColor
        chip.heightAnchor.constraint(equalToConstant: 21).isActive = true
        let wasHidden = chip.isHidden
        chip.isHidden = false
        // The chip lands rather than pops: from 0.95 over `durMorph`.
        if wasHidden, !UIAccessibility.isReduceMotionEnabled {
            chip.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
            chip.alpha = 0
            Motion.easeOut.animator(Motion.durMorph) {
                self.chip.transform = .identity
                self.chip.alpha = 1
            }.startAnimation()
        }
        search.update(query, author: next)
    }

    /// Backspace at the start takes the chip off.
    func textField(_ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        if string.isEmpty, range.location == 0, range.length == 0, author != nil {
            setAuthor(nil)
            render(animated: true)
            return false
        }
        return true
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        // Backspace in an empty field reaches here, not `shouldChangeCharactersIn`.
        if presses.contains(where: { $0.key?.keyCode == .keyboardDeleteOrBackspace }), query.isEmpty, author != nil {
            setAuthor(nil)
            render(animated: true)
            return
        }
        super.pressesBegan(presses, with: event)
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        if selectable.indices.contains(selected) { selectable[selected].action() }
        return false
    }

    // MARK: Keys

    override var keyCommands: [UIKeyCommand]? {
        let up = UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(moveUp))
        let down = UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(moveDown))
        let escape = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(close))
        for command in [up, down, escape] { command.wantsPriorityOverSystemBehavior = true }
        return [up, down, escape]
    }

    /// The list loops (`loop`): past either end comes round to the other.
    @objc private func moveUp() { select(selected - 1) }
    @objc private func moveDown() { select(selected + 1) }
    @objc private func close() { dismiss(animated: true) }

    override func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    private func select(_ next: Int) {
        guard !selectable.isEmpty else { return }
        selected = (next + selectable.count) % selectable.count
        paintSelection()
        if let row = rowViews[selectable[selected].id] {
            scroll.scrollRectToVisible(row.convert(row.bounds, to: scroll).insetBy(dx: 0, dy: -6), animated: false)
        }
    }

    private func paintSelection() {
        for (offset, item) in selectable.enumerated() {
            (rowViews[item.id] as? JumpItemView)?.selectedRow = offset == selected
        }
    }

    // MARK: List

    private func render(animated: Bool) {
        let fragment = JumpAuthor.fragment(query)
        var sections: [(key: String, heading: String?, items: [(id: String, make: () -> UIView, action: (() -> Void)?)])] = []
        if let fragment {
            let choices = JumpAuthor.allCases.filter { $0.rawValue.hasPrefix(fragment) }
            sections.append((key: "group:authors", heading: "Search messages from", items: choices.map { author in
                (id: "author:\(author.rawValue)", make: { [weak self] in
                    self?.item(glyph: author.glyph, name: NSAttributedString(string: author.label), trail: NSAttributedString(string: "@\(author.rawValue) · \(author.detail)")) ?? UIView()
                }, action: { [weak self] in
                    guard let self else { return }
                    field.text = JumpAuthor.stripFragment(query)
                    setAuthor(author)
                    selected = 0
                    render(animated: true)
                })
            }))
        } else {
            for group in index.filter(query) {
                sections.append((key: "group:\(group.name)", heading: group.name, items: group.rows.map { ranked in
                    (id: ranked.row.id, make: { [weak self] in
                        guard let self else { return UIView() }
                        return item(glyph: Self.mark(ranked.row.kind),
                                    name: Self.marked(ranked.row.label, ranked.labelRanges, role: TypeScale.typeLabel, ink: Palette.inkStrong),
                                    trail: Self.marked(ranked.row.detail, ranked.detailRanges, role: TypeScale.typeMeta, ink: Palette.inkMuted, tracking: TypeScale.trackCaps))
                    }, action: { [weak self] in self?.go(ranked.row.target) })
                }))
            }
        }
        if search.pending || !search.hits.isEmpty {
            let heading = author.map { "Transcripts · from \($0.label)" } ?? "Transcripts"
            if search.pending, search.hits.isEmpty {
                sections.append((key: "group:hits", heading: heading, items: (0 ..< 3).map { row in
                    (id: "skeleton:\(row)", make: { Self.skeletonHit(row) }, action: nil)
                }))
            } else {
                sections.append((key: "group:hits", heading: heading, items: search.hits.map { hit in
                    (id: "hit:\(hit.docId)", make: { [weak self] in self?.hitItem(hit) ?? UIView() }, action: { [weak self] in
                        guard let self else { return }
                        onConversation(hub.fleet.conversationId(sessionKey: hit.sessionId, machineId: hit.machineId, cwd: hit.cwd))
                        dismiss(animated: true)
                    })
                }))
            }
        }
        var order: [String] = []
        var arranged: [UIView] = []
        var actions: [(id: String, action: () -> Void)] = []
        let fresh = Set(rowViews.keys)
        var built: [String: UIView] = [:]
        for section in sections {
            if let heading = section.heading {
                let key = section.key
                let head = rowViews[key] ?? Self.heading(heading)
                (head as? KitLabel)?.text = heading
                built[key] = head
                order.append(key)
                arranged.append(head)
            }
            for item in section.items {
                // A row keeps its view while its identity stays; what it shows is rebuilt.
                let view: UIView
                if let kept = rowViews[item.id] as? JumpItemView {
                    kept.replace(with: item.make())
                    view = kept
                } else if let kept = rowViews[item.id], item.action == nil {
                    view = kept
                } else if let action = item.action {
                    let row = JumpItemView(content: item.make())
                    row.addAction(UIAction { _ in action() }, for: .primaryActionTriggered)
                    view = row
                } else {
                    view = item.make()
                }
                if let action = item.action, let row = view as? JumpItemView {
                    row.onSelect = action
                    actions.append((id: item.id, action: action))
                }
                built[item.id] = view
                order.append(item.id)
                arranged.append(view)
            }
        }
        if sections.isEmpty, !(search.pending || JumpAuthor.fragment(query) != nil) {
            let empty = rowViews["empty"] ?? Self.empty()
            built["empty"] = empty
            arranged.append(empty)
        }
        let leaving = fresh.subtracting(built.keys).compactMap { rowViews[$0] }
        let arriving = Set(built.keys).subtracting(fresh)
        rowViews = built
        selectable = actions
        selected = min(selected, max(0, actions.count - 1))

        let still = !animated || UIAccessibility.isReduceMotionEnabled || view.window == nil
        // Leavers fade where they stand over `durExit`.
        for gone in leaving {
            let frame = gone.convert(gone.bounds, to: scroll)
            list.removeArrangedSubview(gone)
            gone.removeFromSuperview()
            guard !still else { continue }
            gone.translatesAutoresizingMaskIntoConstraints = true
            gone.frame = frame
            scroll.addSubview(gone)
            Motion.easeOut.animator(Motion.durExit) { gone.alpha = 0 }.startAnimation()
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durExit) { gone.removeFromSuperview() }
        }
        for (position, row) in arranged.enumerated() {
            if list.arrangedSubviews.firstIndex(of: row) != position { list.insertArrangedSubview(row, at: position) }
        }
        // Each group pads itself 4 top and bottom, so two groups stand 8 apart.
        let headings = Set(sections.compactMap { $0.heading == nil ? nil : $0.key })
        for (position, row) in arranged.enumerated() {
            let next = position + 1 < order.count ? order[position + 1] : nil
            list.setCustomSpacing(next.map(headings.contains) == true ? 8 : 0, after: row)
        }
        for row in arriving.compactMap({ built[$0] }) where !still { row.alpha = 0 }
        paintSelection()
        let natural = list.systemLayoutSizeFitting(CGSize(width: max(1, scroll.bounds.width - Self.listInset * 2), height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + Self.listInset * 2
        listHeight.constant = natural
        if still {
            view.layoutIfNeeded()
            for row in arriving.compactMap({ built[$0] }) { row.alpha = 1 }
            return
        }
        Motion.easeInOut.animator(Motion.durPanel) { self.view.layoutIfNeeded() }.startAnimation()
        Motion.easeOut.animator(Motion.durPop) {
            for row in arriving.compactMap({ built[$0] }) { row.alpha = 1 }
        }.startAnimation()
    }

    private func go(_ target: JumpTarget) {
        dismiss(animated: true) { [weak self] in
            guard let self else { return }
            switch target {
            case let .project(id): onProject(id)
            case let .machine(id): onMachine(id)
            case let .conversation(id): onConversation(id)
            }
        }
    }

    /// Drawn marks, one stroke weight: a folder, a monitor, a chip, a chat.
    private static func mark(_ kind: JumpKind) -> Glyph {
        switch kind {
        case .project: .folder
        case .machine: .monitor
        case .live: .cpu
        case .stored: .chat
        }
    }

    /// Text with the part the query matched in strong ink and weight (JumpMatch).
    private static func marked(_ text: String, _ ranges: [Range<Int>], role: TypeRole, ink: UIColor, tracking: Double = 0) -> NSAttributedString {
        let out = NSMutableAttributedString(string: text, attributes: role.attributes(color: ink, tracking: tracking))
        let strong: UIFont = role.withWeight(TypeScale.weightStrong).font
        for range in ranges where range.upperBound <= text.count {
            let start = text.index(text.startIndex, offsetBy: range.lowerBound)
            let end = text.index(text.startIndex, offsetBy: range.upperBound)
            out.addAttributes([NSAttributedString.Key.font: strong, NSAttributedString.Key.foregroundColor: Palette.inkStrong], range: NSRange(start ..< end, in: text))
        }
        return out
    }

    private static func heading(_ text: String) -> UIView {
        // The group heading: label type, muted, `padding: 6px 8px`.
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground)
        label.text = text
        label.accessibilityTraits = .header
        let box = UIStackView(arrangedSubviews: [label])
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8)
        return box
    }

    private static func empty() -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.foreground)
        label.text = "Nothing matches that."
        label.textAlignment = .center
        let box = UIStackView(arrangedSubviews: [label])
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 24, leading: 0, bottom: 24, trailing: 0)
        return box
    }

    /// One row: the mark in muted ink, the name, and the trailing fact at most 45% wide.
    private func item(glyph: Glyph, name: NSAttributedString, trail: NSAttributedString) -> UIView {
        let nameLabel = UILabel()
        nameLabel.attributedText = name
        nameLabel.lineBreakMode = .byTruncatingTail
        nameLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        // `.jump-name` is `flex: 1`: it takes the room, so every trail ends on one edge.
        nameLabel.setContentHuggingPriority(.defaultLow - 1, for: .horizontal)
        let trailLabel = UILabel()
        trailLabel.attributedText = trail
        trailLabel.lineBreakMode = .byTruncatingTail
        trailLabel.setContentCompressionResistancePriority(.defaultLow + 1, for: .horizontal)
        trailLabel.setContentHuggingPriority(.required, for: .horizontal)
        // The command item's check slot (`cn-command-item-indicator`): 16pt at
        // the row's end, drawn only on a checked item, its room always kept.
        let tick = UIView()
        tick.widthAnchor.constraint(equalToConstant: 16).isActive = true
        let row = UIStackView(arrangedSubviews: [GlyphView(glyph, size: 16, tint: Palette.inkMuted), nameLabel, trailLabel, tick])
        row.spacing = 8
        row.alignment = .center
        trailLabel.widthAnchor.constraint(lessThanOrEqualTo: row.widthAnchor, multiplier: 0.45).isActive = true
        row.accessibilityLabel = "\(name.string), \(trail.string)"
        return row
    }

    /// A transcript row: which conversation the line came out of, in meta,
    /// then the line itself in body type with the matched terms strong.
    private func hitItem(_ hit: TranscriptHit) -> UIView {
        let leaf = hit.cwd.flatMap { $0.split(separator: "/").last.map(String.init) }
        let title = index.sessionTitles[hit.sessionId] ?? leaf ?? String(hit.sessionId.prefix(8))
        let host = hub.fleet.machines.first { $0.machineId == hit.machineId }?.hostname ?? hit.machineId
        let head = item(glyph: .document, name: NSAttributedString(string: title, attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)),
                        trail: NSAttributedString(string: "\(host) · \(hit.role)", attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted, tracking: TypeScale.trackCaps)))
        let snippet = UILabel()
        snippet.lineBreakMode = .byTruncatingTail
        let line = NSMutableAttributedString()
        for (i, part) in hit.snippet.split(separator: /「|」/, omittingEmptySubsequences: false).enumerated() {
            let role = i % 2 == 1 ? TypeScale.typeBody.withWeight(TypeScale.weightStrong) : TypeScale.typeBody
            line.append(NSAttributedString(string: String(part), attributes: role.attributes(color: Palette.inkStrong)))
        }
        snippet.attributedText = line
        let indented = UIStackView(arrangedSubviews: [snippet])
        indented.isLayoutMarginsRelativeArrangement = true
        indented.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 22, bottom: 0, trailing: 0)
        let column = UIStackView(arrangedSubviews: [head, indented])
        column.axis = .vertical
        column.spacing = 2
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0)
        column.accessibilityLabel = "\(title), \(host), \(hit.role): \(line.string)"
        return column
    }

    /// The shape of what is coming: hit rows drawn at their height.
    private static func skeletonHit(_ row: Int) -> UIView {
        let mark = SkeletonView(height: 16)
        mark.widthAnchor.constraint(equalToConstant: 16).isActive = true
        let title = SkeletonView(height: 7)
        let titleWidth = UIView()
        let head = UIStackView(arrangedSubviews: [mark, title, titleWidth])
        head.spacing = 8
        head.alignment = .center
        title.widthAnchor.constraint(equalTo: head.widthAnchor, multiplier: Double(38 - row * 6) / 100).isActive = true
        let line = SkeletonView(height: 7)
        let lineRow = UIStackView(arrangedSubviews: [line, UIView()])
        lineRow.isLayoutMarginsRelativeArrangement = true
        lineRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 22, bottom: 0, trailing: 0)
        line.widthAnchor.constraint(equalTo: lineRow.widthAnchor, multiplier: Double(74 - row * 9) / 100).isActive = true
        let column = UIStackView(arrangedSubviews: [head, lineRow])
        column.axis = .vertical
        column.spacing = 10
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)
        column.isAccessibilityElement = false
        column.accessibilityElementsHidden = true
        return column
    }

    // MARK: Presentation

    func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        ScrimPresentation(presentedViewController: presented, presenting: presenting) { [weak self] in self?.dismiss(animated: true) }
    }

    func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        JumpAnimator(presenting: true, opener: opener)
    }

    func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        JumpAnimator(presenting: false, opener: opener)
    }

    fileprivate var panel: UIView { frameView }
}

/// One selectable row (`kit-item`): `--radius-sm`, 32pt at a desk and 44
/// under a finger, 10pt in; the selected one (arrow keys, a pointer, a
/// press) sits on the hover ground.
private final class JumpItemView: TapControl {
    var onSelect: () -> Void = {}
    private var content: UIView
    private var hovering = false
    var selectedRow = false { didSet { paint() } }

    init(content: UIView) {
        self.content = content
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        heightAnchor.constraint(greaterThanOrEqualToConstant: traitCollection.userInterfaceIdiom == .mac ? 32 : 44).isActive = true
        place(content)
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    func replace(with next: UIView) {
        content.removeFromSuperview()
        content = next
        place(next)
    }

    private func place(_ view: UIView) {
        view.isUserInteractionEnabled = false
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(greaterThanOrEqualTo: topAnchor),
            view.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor),
            view.centerYAnchor.constraint(equalTo: centerYAnchor),
            view.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            view.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
        ])
        accessibilityLabel = view.accessibilityLabel
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        paint()
    }

    private func paint() {
        let on = isHighlighted || hovering || selectedRow
        Motion.easeOut.animator(Motion.durControl) {
            self.backgroundColor = on ? Palette.surfaceHover : .clear
        }.startAnimation()
        accessibilityTraits = selectedRow ? [.button, .selected] : .button
    }
}

/// ⌘K fades the palette in over `durControl`; the Jump button grows it out
/// of the button from the pop scale and rise over `durPop` on the drawer
/// curve. It leaves over `durExit`.
private final class JumpAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool
    private let opener: JumpOpener

    init(presenting: Bool, opener: JumpOpener) {
        self.presenting = presenting
        self.opener = opener
    }

    private var pops: Bool {
        if case .view = opener { return !UIAccessibility.isReduceMotionEnabled }
        return false
    }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        presenting ? (pops ? Motion.durPop : Motion.durControl) : Motion.durExit
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        let key: UITransitionContextViewKey = presenting ? .to : .from
        guard let view = context.view(forKey: key),
              let palette = context.viewController(forKey: presenting ? .to : .from) as? JumpPaletteController else {
            context.completeTransition(true)
            return
        }
        if presenting {
            view.frame = context.containerView.bounds
            context.containerView.addSubview(view)
            view.layoutIfNeeded()
            view.alpha = 0
            if pops, case let .view(source) = opener {
                // Scaled about the button's centre: the panel's own centre moved
                // there, scaled, and moved back, so its layout is never touched.
                let panel = palette.panel
                let from = source.convert(CGPoint(x: source.bounds.midX, y: source.bounds.midY), to: panel)
                let dx = from.x - panel.bounds.midX
                let dy = from.y - panel.bounds.midY
                let scale = Motion.popScale
                panel.transform = CGAffineTransform(translationX: dx * (1 - scale), y: dy * (1 - scale) - Motion.popRise).scaledBy(x: scale, y: scale)
            }
        }
        let curve = presenting && pops ? Motion.easeDrawer : Motion.easeOut
        let animator = curve.animator(transitionDuration(using: context)) { [presenting] in
            view.alpha = presenting ? 1 : 0
            if presenting { palette.panel.transform = .identity }
        }
        animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
        animator.startAnimation()
    }
}
