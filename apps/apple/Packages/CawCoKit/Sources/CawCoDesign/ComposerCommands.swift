import UIKit

/// One entry of a session's `/` menu (core `AvailableCommand`): what the
/// session lists, with what `supportedCommands` has said about it.
public struct ComposerCommand: Sendable, Equatable {
    /// The four families, in the menu's order (client.svelte.ts `COMMAND_ORDER`).
    public enum Kind: Int, Sendable, Comparable {
        case skill, custom, builtin, mcp

        public static func < (a: Kind, b: Kind) -> Bool { a.rawValue < b.rawValue }
    }

    /// Without the leading slash.
    public let name: String
    public let description: String?
    public let argumentHint: String?
    public let kind: Kind
    /// Its plugin, or the MCP server that lent it, when the name says so.
    public let source: String?

    /// `kind` as the harness tagged it; untagged, derived as core
    /// `classifyCommand` does: an `mcp__` prefix, the session's `skills`
    /// list, a namespace (`plugin:command`), and what remains is built in.
    public init(name: String, description: String?, argumentHint: String?, kind: Kind?, skills: [String]) {
        self.name = name
        // Both are required strings to the SDK, which sends "" for "none".
        self.description = description.flatMap { $0.isEmpty ? nil : $0 }
        self.argumentHint = argumentHint.flatMap { $0.isEmpty ? nil : $0 }
        self.kind = kind ?? (name.hasPrefix("mcp__") ? .mcp : skills.contains(name) ? .skill : name.contains(":") ? .custom : .builtin)
        // client.svelte.ts `sourceOf`.
        if name.hasPrefix("mcp__") {
            let server = name.components(separatedBy: "__").dropFirst().first ?? ""
            source = server.isEmpty ? nil : server
        } else if let colon = name.firstIndex(of: ":"), colon > name.startIndex {
            source = String(name[..<colon])
        } else {
            source = nil
        }
    }

    /// The name a row shows (Composer.svelte `displayLabel`): under its
    /// source's heading the namespace is redundant, and an MCP prompt drops
    /// its `mcp__server__` prefix. What is inserted keeps the full name.
    var label: String {
        if name.hasPrefix("mcp__") {
            let rest = name.components(separatedBy: "__").dropFirst(2).joined(separator: "__")
            return "/\(rest.isEmpty ? name : rest)"
        }
        if let source, name.hasPrefix("\(source):") {
            return "/\(name.dropFirst(source.count + 1))"
        }
        return "/\(name)"
    }

    /// The prose a row shows (command-detail.ts `cleanDetail`): a plugin's
    /// `(plugin-name)` lead is the heading above it, and the `(project)` or
    /// `(user)` scope Claude Code ends a description with says what the
    /// section already does, so both go; no prose falls back to the argument shape.
    var detail: String? {
        var prose = description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        for scope in [" (project)", " (user)", "(project)", "(user)"] where prose.hasSuffix(scope) {
            prose = String(prose.dropLast(scope.count)).trimmingCharacters(in: .whitespaces)
            break
        }
        if let source, prose.hasPrefix("(\(source))") {
            prose = prose.dropFirst(source.count + 2).trimmingCharacters(in: .whitespaces)
        }
        return prose.isEmpty ? argumentHint : prose
    }

    /// What a pick puts in the field.
    var insert: String { "/\(name)" }
}

/// The `/` being typed under the caret (Composer.svelte `token`): the word
/// from the last space or line break before the caret up to the caret,
/// when it starts with `/` and holds no whitespace.
struct SlashToken: Equatable {
    /// What follows the `/`.
    let query: String
    /// Where the `/` stands, in UTF-16 units.
    let from: Int
    /// The caret, in UTF-16 units.
    let to: Int

    init?(text: String, caret: NSRange) {
        guard caret.length == 0 else { return nil }
        let whole = text as NSString
        let at = min(caret.location, whole.length)
        let before = whole.substring(to: at) as NSString
        let space = before.rangeOfCharacter(from: .whitespacesAndNewlines, options: .backwards)
        let start = space.location == NSNotFound ? 0 : space.location + space.length
        let word = before.substring(from: start)
        guard word.hasPrefix("/") else { return nil }
        query = String(word.dropFirst())
        from = start
        to = at
    }
}

/// One titled section of the menu.
struct CommandSection: Equatable {
    let heading: String
    let commands: [ComposerCommand]

    /// `commands` filtered by `query` (a row's `/name` or its label holds
    /// it, case-insensitively, capped at 100 as the web's is) and grouped as
    /// Composer.svelte `sections` groups them: skills, then each plugin by
    /// name, then the built-ins, then each MCP server. No section is empty.
    static func sections(_ commands: [ComposerCommand], query: String) -> [CommandSection] {
        let needle = query.lowercased()
        let rows = commands.filter {
            needle.isEmpty || $0.insert.lowercased().contains(needle) || $0.label.lowercased().contains(needle)
        }.prefix(100)
        var groups: [String: (heading: String, rank: Int, sub: String, commands: [ComposerCommand])] = [:]
        var order: [String] = []
        for command in rows {
            let meta = Self.meta(command)
            if groups[meta.key] == nil {
                groups[meta.key] = (heading: meta.heading, rank: meta.rank, sub: meta.sub, commands: [])
                order.append(meta.key)
            }
            groups[meta.key]?.commands.append(command)
        }
        return order.compactMap { groups[$0] }
            .sorted { a, b in
                if a.rank != b.rank { return a.rank < b.rank }
                if a.sub != b.sub { return a.sub.localizedStandardCompare(b.sub) == .orderedAscending }
                return a.heading.localizedStandardCompare(b.heading) == .orderedAscending
            }
            .map { CommandSection(heading: $0.heading, commands: $0.commands) }
    }

    /// Composer.svelte `sectionMeta`: a command's section is its source when
    /// it has one; skills and bare built-ins keep their family's name.
    private static func meta(_ command: ComposerCommand) -> (key: String, heading: String, rank: Int, sub: String) {
        switch command.kind {
        case .skill:
            return ("skills", "Skills", 0, "")
        case .mcp:
            let server = command.source ?? ""
            return ("mcp:\(server)", server.isEmpty ? "MCP" : server, 3, server)
        case .custom, .builtin:
            if let source = command.source { return ("src:\(source)", source, 1, source) }
            return command.kind == .builtin ? ("builtin", "Built-in", 2, "") : ("commands", "Commands", 1, "")
        }
    }
}

/// The `/` menu (Composer.svelte `.menu.kit-pop`): above the pill, never
/// over it, so the sentence being written stays legible while its next word
/// is chosen. A floating surface (raised, the control border, radius 12, the
/// overlay shadow) holding the session's commands in titled sections, ruled
/// apart by a hairline: each row its name in the code face and its prose,
/// muted, on one line. The highlighted row, which Return or Tab takes, stands
/// on the hover surface. Up to 320pt tall, and the list scrolls inside it.
///
/// It grows out of the pill from below: the pop scale and an 8pt rise to
/// rest over `durPop` on the drawer curve, and back over `durExit`; with less
/// motion only the fade.
@MainActor
final class CommandMenu: UIView {
    static let maxHeight = 320.0

    /// A row was chosen.
    var onChoose: (ComposerCommand) -> Void = { _ in }
    private(set) var sections: [CommandSection] = []
    /// Every row in the order shown, for the keys.
    private var flat: [ComposerCommand] = []
    private(set) var highlight = 0
    private var rows: [CommandRow] = []
    private(set) var closing = false

    private let surface = UIView()
    private let scroll = RowScroll()
    private let stack = UIStackView()

    /// Every row is a control, and a drag that starts on one still scrolls the list.
    private final class RowScroll: UIScrollView {
        override func touchesShouldCancel(in _: UIView) -> Bool { true }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        boxShadow = Shadow.shadowOverlay
        surface.backgroundColor = Palette.surfaceRaised
        surface.layer.cornerRadius = Radius.radiusLg
        surface.layer.cornerCurve = .continuous
        surface.layer.borderWidth = 1
        surface.clipsToBounds = true
        addSubview(surface)
        scroll.showsHorizontalScrollIndicator = false
        scroll.alwaysBounceVertical = false
        scroll.contentInset = UIEdgeInsets(top: Space.space1, left: 0, bottom: Space.space1, right: 0)
        scroll.keyboardDismissMode = .none
        scroll.contentInsetAdjustmentBehavior = .never
        surface.addSubview(scroll)
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space1),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Space.space1),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space1 * 2),
        ])
        accessibilityIdentifier = "composer-commands"
        accessibilityLabel = "Commands"
        shouldGroupAccessibilityChildren = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (menu: CommandMenu, _: UITraitCollection) in
            menu.paint()
        }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CommandMenu is built in code")
    }

    private func paint() {
        surface.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    /// Shows `sections`, the first row highlighted, scrolled to the top.
    func show(_ next: [CommandSection]) {
        guard next != sections else { return }
        sections = next
        flat = next.flatMap(\.commands)
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        rows = []
        for (index, section) in next.enumerated() {
            if index > 0 {
                let rule = UIView()
                rule.backgroundColor = Palette.borderHairline
                rule.heightAnchor.constraint(equalToConstant: 1 / max(1, traitCollection.displayScale)).isActive = true
                stack.addArrangedSubview(rule)
                stack.setCustomSpacing(Space.space1, after: rule)
            }
            let heading = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, tracking: TypeScale.trackCaps)
            heading.text = section.heading.uppercased()
            heading.accessibilityLabel = section.heading
            heading.accessibilityTraits = .header
            let head = UIView()
            head.addSubview(heading)
            NSLayoutConstraint.activate([
                heading.leadingAnchor.constraint(equalTo: head.leadingAnchor, constant: Space.space2),
                heading.trailingAnchor.constraint(lessThanOrEqualTo: head.trailingAnchor, constant: -Space.space2),
                heading.topAnchor.constraint(equalTo: head.topAnchor, constant: Space.space1),
                heading.bottomAnchor.constraint(equalTo: head.bottomAnchor, constant: -Space.space2),
            ])
            stack.addArrangedSubview(head)
            for command in section.commands {
                let row = CommandRow(command, section: section.heading)
                let at = rows.count
                row.addAction(UIAction { [weak self] _ in self?.choose(at) }, for: .primaryActionTriggered)
                row.accessibilityIdentifier = "composer-command-\(at)"
                rows.append(row)
                stack.addArrangedSubview(row)
            }
            if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(Space.space1, after: last) }
        }
        highlight = 0
        paintHighlight()
        stack.layoutIfNeeded()
        scroll.contentOffset = CGPoint(x: 0, y: -scroll.contentInset.top)
    }

    /// How tall it wants to be at its width now, within `limit`.
    func height(within limit: Double) -> Double {
        surface.frame = bounds
        scroll.frame = surface.bounds
        scroll.layoutIfNeeded()
        let natural = Double(stack.frame.height + scroll.contentInset.top + scroll.contentInset.bottom)
        return min(Self.maxHeight, limit, natural)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        surface.frame = bounds
        scroll.frame = surface.bounds
    }

    // MARK: Keys

    /// ↑ and ↓ move the highlight, round the ends (`loop`).
    func step(_ by: Int) {
        guard !flat.isEmpty else { return }
        highlight = (highlight + by + flat.count) % flat.count
        paintHighlight()
        let row = rows[highlight]
        scroll.scrollRectToVisible(row.convert(row.bounds, to: scroll).insetBy(dx: 0, dy: -Space.space1), animated: false)
    }

    /// Return or Tab: the highlighted row.
    func chooseHighlighted() {
        choose(highlight)
    }

    private func choose(_ index: Int) {
        guard !closing, flat.indices.contains(index) else { return }
        onChoose(flat[index])
    }

    private func paintHighlight() {
        for (index, row) in rows.enumerated() { row.current = index == highlight }
    }

    // MARK: Coming and going

    /// From below, toward the pill it grows out of.
    private func entrance(scale: Double, rise: Double) -> CGAffineTransform {
        CGAffineTransform(translationX: 0, y: rise + bounds.height * (1 - scale) / 2).scaledBy(x: scale, y: scale)
    }

    func appear() {
        closing = false
        guard window != nil else { return }
        alpha = 0
        let still = UIAccessibility.isReduceMotionEnabled
        if !still { transform = entrance(scale: Motion.popScale, rise: Motion.popRise) }
        Motion.easeDrawer.animator(Motion.durPop) {
            self.alpha = 1
            self.transform = .identity
        }.startAnimation()
        UIAccessibility.post(notification: .announcement, argument: "\(flat.count) \(flat.count == 1 ? "command" : "commands")")
    }

    /// Fades away and leaves; `done` once it is gone.
    func disappear(done: @escaping @MainActor () -> Void) {
        closing = true
        guard window != nil else { return done() }
        let still = UIAccessibility.isReduceMotionEnabled
        let out = Motion.easeDrawer.animator(Motion.durExit) {
            self.alpha = 0
            if !still { self.transform = self.entrance(scale: Motion.popScale, rise: Motion.popRise) }
        }
        out.addCompletion { _ in done() }
        out.startAnimation()
    }
}

/// One row of the `/` menu (`[data-slot="command-item"]`): 44pt tall under a
/// finger, radius 8, its name in the code face at the label size and weight,
/// then its prose in the meta size, muted, cut at its end. The hover surface
/// shows under the highlighted row and under the finger.
@MainActor
final class CommandRow: UIControl {
    /// The row Return takes.
    var current = false {
        didSet { if current != oldValue { paint() } }
    }

    /// `/name` in the code face, at the label's size and the strong weight (`.e-label`).
    static let nameRole = TypeRole(weight: TypeScale.weightStrong, size: TypeScale.typeLabel.size, leading: TypeScale.typeLabel.leading, family: FontFamily.fontMono)

    init(_ command: ComposerCommand, section: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let name = KitLabel(Self.nameRole, ink: Palette.inkStrong)
        name.text = command.label
        name.setContentCompressionResistancePriority(.required, for: .horizontal)
        name.setContentHuggingPriority(.required, for: .horizontal)
        let detail = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        detail.text = command.detail
        detail.isHidden = command.detail == nil
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [name, detail])
        line.spacing = Space.space2
        line.alignment = .firstBaseline
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            line.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -Space.space2),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
            line.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space1),
        ])
        isAccessibilityElement = true
        accessibilityLabel = command.label
        accessibilityValue = command.detail
        accessibilityHint = "\(section). Inserts \(command.insert)."
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CommandRow is built in code")
    }

    override var isHighlighted: Bool {
        didSet { if isHighlighted != oldValue { paint() } }
    }

    private func paint() {
        backgroundColor = current || isHighlighted ? Palette.surfaceHover : .clear
        accessibilityTraits = current ? [.button, .selected] : .button
    }
}
