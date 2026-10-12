import CawCoCore
import CawCoDesign
import UIKit

/// The page's lead, as Rings (usage/LimitsBlock.svelte): can you keep going,
/// on which account, what happens when it runs out, and when an account is
/// back. It leads with the time until nothing can carry your new sessions
/// and that in one sentence; then one tile per Claude account in carrying
/// order, each its 56pt double dial, its figure, a sentence, its key and the
/// sessions running on it; then opencode's plan the same way.
final class UsageLimitsCard: UsageCard {
    /// Where accounts are signed in (`/config/accounts`): the gap's one action.
    var onSignIn: () -> Void = {}
    /// Where a tap's tip opens: the page.
    weak var presenter: UIViewController?
    private let body = UIStackView()
    private var shown: (view: UsageRings, fleet: FleetStore)?
    private var viewport = 0.0

    init() {
        super.init(title: "Limits")
        column.spacing = Space.space5
        column.addArrangedSubview(Self.title("Limits"))
        body.axis = .vertical
        body.spacing = Space.space5
        column.addArrangedSubview(body)
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self, UITraitUserInterfaceStyle.self]) { (card: UsageLimitsCard, _: UITraitCollection) in
            card.render()
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageLimitsCard is built in code")
    }

    func configure(_ view: UsageRings, fleet: FleetStore) {
        shown = (view, fleet)
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
        if let probe = usageProbe {
            func resets(_ view: UIView) -> [KitLabel] {
                view.subviews.flatMap { ($0 as? KitLabel).map { $0.accessibilityIdentifier == "usage-key-reset" ? [$0] : [] } ?? resets($0) }
            }
            for label in resets(self).prefix(4) {
                probe.notice("page key reset width \(label.bounds.width, privacy: .public) needs \(label.sizeThatFits(CGSize(width: 10000, height: 100)).width, privacy: .public) text \(label.attributedText?.string ?? "", privacy: .public)")
            }
        }
    }

    private func render() {
        guard let (view, fleet) = shown else { return }
        body.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard view.read, fleet.limitsRead else {
            body.addArrangedSubview(skeleton())
            return
        }
        let now = view.now
        if let lead = lead(view) {
            body.addArrangedSubview(lead)
        }
        body.addArrangedSubview(providerRow("Claude", delegates: view.claude))
        if let claude = view.claude {
            body.addArrangedSubview(TileGrid(claude.accounts.map { ring in
                tile(ring, figure: Rings.tileFigure(ring, claude, now: now), say: Rings.tileSentence(ring, claude, now: now), fleet: fleet)
            }))
            if let extra = Usage.speaking(fleet.claudeLimits, error: \.error, stale: \.stale, windows: \.windows)?.extraUsage {
                let text = extra.on ? (extra.inUse ? "on, in use" : "on") : extra.offReason.map { "off: \($0)" } ?? "off"
                body.addArrangedSubview(line("Extra usage", NSAttributedString(string: text, attributes: TypeScale.typeBody.attributes(color: Palette.inkRow))))
            }
        } else {
            body.addArrangedSubview(unknown(Usage.claudeGap(fleet.claudeLimits, machines: fleet.machines)))
        }
        let spend = fleet.spend.flatMap { $0.all > 0 ? $0 : nil }
        if view.openCode != nil || spend != nil {
            body.addArrangedSubview(providerRow("opencode Go", delegates: nil))
            if let go = view.openCode {
                body.addArrangedSubview(TileGrid([tile(go, figure: Rings.openCodeFigure(go, now: now), say: Rings.openCodeSentence(go, now: now), fleet: fleet)]))
            }
            if let spend {
                let figure = TypeScale.typeBody.figure().attributes(color: Palette.inkRow)
                let words = TypeScale.typeBody.attributes(color: Palette.inkRow)
                let said = NSMutableAttributedString()
                for (amount, after) in [(spend.today, " today, "), (spend.week, " this week, "), (spend.all, " all time")] {
                    said.append(NSAttributedString(string: Usage.money(amount), attributes: figure))
                    said.append(NSAttributedString(string: after, attributes: words))
                }
                body.addArrangedSubview(line("Spend", said))
            }
        }
    }

    // MARK: Loading

    /// `.loading`: the figure, the sentence and three tiles, waiting.
    private func skeleton() -> UIView {
        let head = SkeletonView(height: 28)
        let line = SkeletonView(height: 16)
        let stack = UIStackView(arrangedSubviews: [head, line] + (0 ..< 3).map { _ in SkeletonView(height: 192) })
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.alignment = .leading
        head.widthAnchor.constraint(equalToConstant: 96).isActive = true
        line.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: 0.75).isActive = true
        for tile in stack.arrangedSubviews.dropFirst(2) { tile.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Reading limits"
        return stack
    }

    // MARK: Lead

    /// `.lead`: the time in the KPI role (at its limit after the refresh
    /// mark), what it is of beside it on its baseline, the sentence under.
    private func lead(_ view: UsageRings) -> UIView? {
        let figure: (back: Bool, figure: String, of: String, say: [Rings.Part], muted: Bool)
        if let claude = view.claude {
            let stop = Rings.stopFigure(claude, now: view.now)
            figure = (stop.back, stop.figure, stop.of, Rings.leadSentence(claude, now: view.now), claude.stale != nil)
        } else if let go = view.openCode {
            let tile = Rings.openCodeFigure(go, now: view.now)
            figure = (tile.back, tile.figure, tile.back ? "until it’s back" : tile.label, Rings.openCodeSentence(go, now: view.now), false)
        } else {
            return nil
        }
        let kpi = KitLabel(TypeScale.typeKpi.with(points: TypeScale.typeKpi.points(viewport: viewport), tracking: -0.02),
                           ink: figure.muted ? Palette.inkMuted : Palette.inkStrong)
        kpi.tabular = true
        kpi.text = figure.figure
        kpi.setContentHuggingPriority(.required, for: .horizontal)
        kpi.accessibilityIdentifier = "usage-lead-figure"
        var parts: [UIView] = []
        if figure.back {
            parts.append(GlyphView(.refresh, size: (kpi.font.pointSize * 0.8).rounded(), tint: Palette.inkMuted))
        }
        parts.append(kpi)
        let of = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        of.wrap = .pretty
        of.text = figure.of
        parts.append(of)
        let big = UIStackView(arrangedSubviews: parts)
        big.spacing = 10
        big.alignment = .firstBaseline
        big.isAccessibilityElement = true
        big.accessibilityLabel = "\(figure.figure) \(figure.of)"
        let sentence = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        sentence.attributedText = UsageWords.text(figure.say, role: TypeScale.typeBody, ink: Palette.inkRow, traits: traitCollection)
        sentence.accessibilityIdentifier = "usage-lead"
        let stack = UIStackView(arrangedSubviews: [big, sentence])
        stack.axis = .vertical
        stack.spacing = 6
        return stack
    }

    /// `.provider`: the agent's mark and name; for Claude, where delegates go, its why on a tap.
    private func providerRow(_ name: String, delegates claude: Rings.Claude?) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = name
        label.accessibilityTraits = .header
        let mark = usageMark(name == "Claude" ? "Claude" : "opencode", side: 16)
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.widthAnchor.constraint(equalToConstant: 16).isActive = true
        mark.heightAnchor.constraint(equalToConstant: 16).isActive = true
        let row = UIStackView(arrangedSubviews: [mark, label, UIView()])
        row.spacing = 8
        row.alignment = .center
        if let claude, let to = claude.delegate {
            let why = Rings.delegateTip(claude, to: to)
            let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            words.attributedText = UsageWords.text([.text("Delegates go to "), .strong(to.name)], role: TypeScale.typeMeta, ink: Palette.inkMuted,
                                                   traits: traitCollection)
            let control = UIControl()
            words.isUserInteractionEnabled = false
            words.translatesAutoresizingMaskIntoConstraints = false
            control.addSubview(words)
            NSLayoutConstraint.activate([
                words.topAnchor.constraint(equalTo: control.topAnchor),
                words.bottomAnchor.constraint(equalTo: control.bottomAnchor),
                words.leadingAnchor.constraint(equalTo: control.leadingAnchor),
                words.trailingAnchor.constraint(equalTo: control.trailingAnchor),
            ])
            control.isAccessibilityElement = true
            control.accessibilityLabel = "Delegates go to \(to.name). \(why)"
            control.accessibilityIdentifier = "usage-page-delegates"
            control.addAction(UIAction { [weak self, weak control] _ in
                guard let self, let control, let presenter else { return }
                UsageTipController.show(why, from: control, side: .bottom, in: presenter)
            }, for: .touchUpInside)
            row.addArrangedSubview(control)
        }
        return row
    }

    // MARK: Tiles

    /// A tile (`.tile`): its head, its mark and figure, its sentence, its
    /// key, its sessions, `space-3` apart, on the recess at `radius-md`;
    /// at its limit the limit wash.
    private func tile(_ ring: Rings.Account, figure: Rings.TileFigure, say: [Rings.Part], fleet: FleetStore) -> UIView {
        let limit = ring.state == .limit
        let tile = UIView()
        tile.backgroundColor = limit ? Palette.meterWashOver.over(Palette.surfaceRecess) : Palette.surfaceRecess
        tile.layer.cornerRadius = Radius.radiusMd
        tile.layer.cornerCurve = .continuous
        tile.accessibilityIdentifier = "usage-tile-\(ring.id)"
        let ground = limit ? Palette.meterWashOver.over(Palette.surfaceRecess) : Palette.surfaceRecess

        // The head: its dot, its name (the email under a nickname), wrapping, never cut.
        let dot = UIView()
        dot.backgroundColor = AccountInk.color(ring.hue)
        dot.layer.cornerRadius = 4
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.widthAnchor.constraint(equalToConstant: 8).isActive = true
        dot.heightAnchor.constraint(equalToConstant: 8).isActive = true
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        name.lineBreakMode = .byCharWrapping
        name.text = ring.nick ?? ring.email ?? "Not signed in yet"
        let names = UIStackView(arrangedSubviews: [name])
        names.axis = .vertical
        if ring.nick != nil, let email = ring.email {
            let small = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            small.lineBreakMode = .byCharWrapping
            small.text = email
            names.addArrangedSubview(small)
        }
        let head = UIStackView(arrangedSubviews: [dot, names])
        head.spacing = 7
        head.alignment = .center

        // The mark: the 56pt dial, then the figure and what it is.
        let dial = RingsView(size: 56)
        dial.ground = ground
        dial.configure(ring, animated: false)
        dial.translatesAutoresizingMaskIntoConstraints = false
        dial.widthAnchor.constraint(equalToConstant: 56).isActive = true
        dial.heightAnchor.constraint(equalToConstant: 56).isActive = true
        let value = KitLabel(TypeScale.typeTitle.with(points: TypeScale.typeTitle.points(viewport: viewport)),
                             ink: limit || ring.state == .stale ? Palette.inkMuted : Palette.inkStrong)
        value.tabular = true
        value.text = figure.figure
        let valueRow = UIStackView(arrangedSubviews: (figure.back ? [GlyphView(.refresh, size: (value.font.pointSize * 0.8).rounded(), tint: Palette.inkMuted)] : [])
            + [value])
        valueRow.spacing = (value.font.pointSize * 0.25).rounded()
        valueRow.alignment = .center
        let small = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        small.text = figure.label
        let figureColumn = UIStackView(arrangedSubviews: [valueRow, small])
        figureColumn.axis = .vertical
        figureColumn.alignment = .leading
        figureColumn.spacing = 3
        let mark = UIStackView(arrangedSubviews: [dial, figureColumn])
        mark.spacing = 14
        mark.alignment = .center

        let sentence = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        sentence.attributedText = UsageWords.text(say, role: TypeScale.typeBody, ink: Palette.inkRow, traits: traitCollection)
        sentence.accessibilityIdentifier = "usage-tile-say"

        let stack = UIStackView(arrangedSubviews: [head, mark, sentence, key(ring), running(ring, fleet: fleet)])
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space4),
            stack.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space4),
            tile.trailingAnchor.constraint(equalTo: stack.trailingAnchor, constant: Space.space4),
            tile.bottomAnchor.constraint(greaterThanOrEqualTo: stack.bottomAnchor, constant: Space.space4),
        ])
        return tile
    }

    /// An account's key (RingsKey.svelte): one line per window, glyph | label
    /// | value | reset on 10, 52 and 84pt columns and the rest, `space-2`
    /// apart, so values line up down a tile and across the tiles in a row.
    private func key(_ ring: Rings.Account) -> UIView {
        let rows = UIStackView()
        rows.axis = .vertical
        rows.spacing = 3
        let meta = TypeScale.typeMeta
        for row in Rings.keyRows(ring, now: shown?.view.now ?? 0) {
            let glyph: UIView
            switch row.glyph {
            case .rim:
                let week = WeekMarkView()
                week.configure(ring)
                glyph = week
            case .disc:
                let disc = UIView()
                disc.backgroundColor = row.limit ? Palette.borderControl : AccountInk.color(ring.hue)
                disc.layer.cornerRadius = 4.5
                disc.alpha = ring.state == .stale ? 0.4 : 1
                let box = UIView()
                disc.frame = CGRect(x: 0.5, y: 0.5, width: 9, height: 9)
                box.addSubview(disc)
                glyph = box
            case nil:
                glyph = UIView()
            }
            glyph.translatesAutoresizingMaskIntoConstraints = false
            glyph.widthAnchor.constraint(equalToConstant: 10).isActive = true
            glyph.heightAnchor.constraint(equalToConstant: 10).isActive = true
            let label = KitLabel(meta.withWeight(.medium), ink: Palette.inkRow)
            label.text = row.label
            let value = KitLabel(meta, ink: Palette.inkStrong)
            value.attributedText = keyText(row.value, ink: Palette.inkStrong, weight: .medium)
            value.accessibilityIdentifier = "usage-key-value"
            // `.reset`: the rest of the line, end-aligned; it wraps where it
            // must (`min-inline-size: 0`), never ending in an ellipsis.
            let reset = KitLabel(meta, ink: Palette.inkMuted, lines: 0)
            reset.attributedText = keyText(row.reset, ink: Palette.inkMuted, weight: .regular, alignment: .right)
            reset.textAlignment = .right
            reset.accessibilityIdentifier = "usage-key-reset"
            reset.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            reset.setContentHuggingPriority(.defaultLow, for: .horizontal)
            let line = UIStackView(arrangedSubviews: [glyph, label, value, reset])
            line.spacing = Space.space2
            line.alignment = .center
            NSLayoutConstraint.activate([
                label.widthAnchor.constraint(equalToConstant: 52),
                value.widthAnchor.constraint(equalToConstant: 84),
            ])
            rows.addArrangedSubview(line)
        }
        return rows
    }

    /// A key line's words, its figures in the mono figure face.
    private func keyText(_ parts: [Rings.Part], ink: UIColor, weight: UIFont.Weight, alignment: NSTextAlignment = .natural) -> NSAttributedString {
        let out = NSMutableAttributedString()
        // The role's paragraph cuts its tail; a key line wraps instead, as the web's does.
        func wrapping(_ attributes: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
            guard let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle else { return attributes }
            paragraph.lineBreakMode = .byWordWrapping
            var out = attributes
            out[.paragraphStyle] = paragraph
            return out
        }
        let words = wrapping(TypeScale.typeMeta.withWeight(weight).attributes(color: ink, alignment: alignment))
        let figure = wrapping(TypeScale.typeMeta.figure(weight: weight).attributes(color: ink, alignment: alignment))
        for part in parts {
            switch part {
            case let .figure(text): out.append(NSAttributedString(string: text, attributes: figure))
            case let .text(text), let .strong(text), let .account(text, _): out.append(NSAttributedString(string: text, attributes: words))
            }
        }
        return out
    }

    /// `.running`: "Running" and its count, then each session (its project,
    /// its title, its context in thousands); or "No sessions running".
    private func running(_ ring: Rings.Account, fleet: FleetStore) -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space1
        guard !ring.sessions.isEmpty else {
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            none.text = "No sessions running"
            stack.addArrangedSubview(none)
            return stack
        }
        let heading = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        let said = NSMutableAttributedString(string: "Running ", attributes: TypeScale.typeMeta.withWeight(.medium).attributes(color: Palette.inkMuted))
        said.append(NSAttributedString(string: String(ring.sessions.count), attributes: TypeScale.typeMeta.figure(weight: .medium).attributes(color: Palette.inkMuted)))
        heading.attributedText = said
        stack.addArrangedSubview(heading)
        let list = UIStackView()
        list.axis = .vertical
        list.spacing = 2
        for row in ring.sessions {
            let what = KitLabel(TypeScale.typeMeta, ink: Palette.inkRow)
            let words = NSMutableAttributedString()
            if let project = row.projectId.flatMap({ id in fleet.projects.first { $0.id == id }?.name }) {
                words.append(NSAttributedString(string: "\(project) ", attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
            }
            words.append(NSAttributedString(string: row.title ?? row.derivedTitle ?? "untitled session", attributes: TypeScale.typeMeta.attributes(color: Palette.inkRow)))
            what.attributedText = words
            what.lineBreakMode = .byTruncatingTail
            what.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let tokens = usageFigure(ink: Palette.inkMuted)
            tokens.text = row.keepAlive?.contextTokens.flatMap { $0 > 0 ? "\(Int(($0 / 1000).rounded()))k" : nil } ?? ""
            tokens.setContentHuggingPriority(.required, for: .horizontal)
            let line = UIStackView(arrangedSubviews: [what, tokens])
            line.spacing = Space.space4
            line.isLayoutMarginsRelativeArrangement = true
            line.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 5, leading: 8, bottom: 5, trailing: 8)
            line.backgroundColor = Palette.surfaceRaised
            line.layer.cornerRadius = Radius.radiusSm
            list.addArrangedSubview(line)
        }
        stack.addArrangedSubview(list)
        return stack
    }

    /// `.line`: a name in the label role, its words after it.
    private func line(_ name: String, _ said: NSAttributedString) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = name
        label.setContentHuggingPriority(.required, for: .horizontal)
        let words = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        words.attributedText = said
        let row = UIStackView(arrangedSubviews: [label, words])
        row.spacing = Space.space3
        row.alignment = .firstBaseline
        return row
    }

    /// `.unknown`: why there is no Claude tile, and "Sign in an account" where that is the cure.
    private func unknown(_ gap: Usage.Gap) -> UIView {
        let reason = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        reason.wrap = .pretty
        reason.text = gap.reason
        reason.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [reason])
        row.spacing = Space.space3
        row.alignment = .center
        if gap.signIn {
            row.addArrangedSubview(KitButton.make("Sign in an account", glyph: .key, variant: .outline, height: .sm) { [weak self] in self?.onSignIn() })
        }
        row.addArrangedSubview(UIView())
        return row
    }
}

/// `.grid`: tiles at least 248pt wide (`minmax(15.5rem, 1fr)`), as many
/// across as fit, `space-3` apart; a row as tall as its tallest tile.
private final class TileGrid: UIView {
    private let tiles: [UIView]
    private var height: NSLayoutConstraint!
    private var laid = 0.0

    init(_ tiles: [UIView]) {
        self.tiles = tiles
        super.init(frame: .zero)
        for tile in tiles {
            tile.translatesAutoresizingMaskIntoConstraints = true
            addSubview(tile)
        }
        height = heightAnchor.constraint(equalToConstant: 0)
        height.priority = .required - 1
        height.isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TileGrid is built in code")
    }

    override func systemLayoutSizeFitting(_ target: CGSize, withHorizontalFittingPriority _: UILayoutPriority,
                                          verticalFittingPriority _: UILayoutPriority) -> CGSize {
        CGSize(width: target.width, height: lay(target.width, place: false))
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if laid != bounds.width {
            laid = bounds.width
            height.constant = lay(bounds.width, place: true)
        }
    }

    @discardableResult
    private func lay(_ width: Double, place: Bool) -> Double {
        guard width > 0 else { return 0 }
        let gap = Space.space3
        let across = max(1, Int(((width + gap) / (248 + gap)).rounded(.down)))
        let tileWidth = (width - Double(across - 1) * gap) / Double(across)
        var y = 0.0
        for start in stride(from: 0, to: tiles.count, by: across) {
            let row = Array(tiles[start ..< min(tiles.count, start + across)])
            let tall = row.map {
                $0.systemLayoutSizeFitting(CGSize(width: tileWidth, height: 0), withHorizontalFittingPriority: .required,
                                           verticalFittingPriority: .fittingSizeLevel).height
            }.max() ?? 0
            if place {
                for (i, tile) in row.enumerated() {
                    tile.frame = CGRect(x: Double(i) * (tileWidth + gap), y: y, width: tileWidth, height: tall)
                }
            }
            y += tall + gap
        }
        return max(0, y - gap)
    }
}
