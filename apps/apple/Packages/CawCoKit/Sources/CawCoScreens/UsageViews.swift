import CawCoCore
import CawCoDesign
import UIKit

/// A provider's mark at 14pt (UsageMeter.svelte `.mark`): its own logo, on a 3pt corner.
private func usageMark(_ provider: String) -> UIImageView {
    let mark = UIImageView(image: (provider == "Claude" ? BrandLogo.claude : BrandLogo.opencode).image)
    mark.contentMode = .scaleAspectFit
    mark.layer.cornerRadius = 3
    mark.clipsToBounds = true
    mark.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([mark.widthAnchor.constraint(equalToConstant: 14), mark.heightAnchor.constraint(equalToConstant: 14)])
    mark.isAccessibilityElement = false
    return mark
}

private func usagePercent(_ row: Usage.Row) -> Int { Int(row.meter.used.rounded()) }

/// The usage strip, in the rail's footer and, always, under the phone home's
/// status line (UsageMeter.svelte): one cell for each provider that is set up
/// (Claude, then opencode), equal in width. A cell is the provider's mark,
/// two numbers (its short window's percent, then its long one's) and one 4pt
/// bar split 1:2 between the two, each with its pace tick. A cell says a
/// phrase in place of its numbers only when there is something to do about
/// it. The whole strip is one control, 44pt in every state; it opens every
/// window in the house sheet.
final class UsageCell: HomeCell {
    private let strip = UIControl()
    private let cells = UIStackView()
    private let noline = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    var onOpen: () -> Void = {}
    /// The Usage page: reached from the foot of the list the strip opens.
    var onPage: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        cells.spacing = Space.space2
        cells.distribution = .fillEqually
        cells.isUserInteractionEnabled = false
        cells.translatesAutoresizingMaskIntoConstraints = false
        noline.isUserInteractionEnabled = false
        noline.translatesAutoresizingMaskIntoConstraints = false
        strip.addSubview(cells)
        strip.addSubview(noline)
        strip.layer.cornerRadius = Radius.radiusSm
        strip.layer.cornerCurve = .continuous
        strip.addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        strip.isAccessibilityElement = true
        strip.accessibilityTraits = .button
        // The strip's edges line up with the status line's text.
        pin(strip, insets: NSDirectionalEdgeInsets(top: 0, leading: -8, bottom: 0, trailing: -8))
        NSLayoutConstraint.activate([
            cells.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 8),
            cells.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -8),
            cells.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
            noline.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 8),
            noline.trailingAnchor.constraint(lessThanOrEqualTo: strip.trailingAnchor, constant: -8),
            noline.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
            strip.heightAnchor.constraint(equalToConstant: 44),
        ])
        pressTarget = strip
    }

    func configure(_ usage: Usage.Strip) {
        cells.arrangedSubviews.forEach { $0.removeFromSuperview() }
        noline.isHidden = !usage.cells.isEmpty
        noline.text = usage.empty
        guard !usage.cells.isEmpty else {
            strip.accessibilityLabel = "\(usage.empty). Show every limit."
            return
        }
        for cell in usage.cells {
            cells.addArrangedSubview(UsageStripCell(cell, ground: ground))
        }
        // Every cell, read out: what the strip's one control is called.
        let said = usage.cells.map { cell in
            let windows = [cell.short, cell.long].compactMap(\.self).map { "\($0.label) \(usagePercent($0)) percent" }.joined(separator: ", ")
            return "\(cell.name): \(windows)\(cell.phrase.map { ", \($0.text)" } ?? "")"
        }
        strip.accessibilityLabel = "\(said.joined(separator: ". ")). Show every limit."
    }

    static func tone(_ state: Usage.State) -> LimitBar.Tone {
        switch state {
        case .calm: .calm
        case .near: .near
        case .over, .reached: .over
        case .stale: .stale
        }
    }
}

/// One provider on the strip (`.cell`): its mark and its numbers or its
/// phrase over one bar, split 1:2 between the short window and the long one.
/// With something to do about it, it stands on a faint wash of its own.
private final class UsageStripCell: UIView {
    init(_ cell: Usage.Cell, ground: UIColor) {
        super.init(frame: .zero)
        let wash: UIColor? = switch cell.phrase?.tone {
        case .near: Palette.meterWashNear
        case .over: Palette.meterWashOver
        default: nil
        }
        if let wash {
            // `inset: -5px -4px`: the wash reaches past the cell's words and bar.
            let back = UIView()
            back.backgroundColor = wash
            back.layer.cornerRadius = Radius.radiusSm
            back.layer.cornerCurve = .continuous
            back.translatesAutoresizingMaskIntoConstraints = false
            addSubview(back)
            NSLayoutConstraint.activate([
                back.topAnchor.constraint(equalTo: topAnchor, constant: -5),
                back.bottomAnchor.constraint(equalTo: bottomAnchor, constant: 5),
                back.leadingAnchor.constraint(equalTo: leadingAnchor, constant: -4),
                back.trailingAnchor.constraint(equalTo: trailingAnchor, constant: 4),
            ])
        }
        let top = UIStackView(arrangedSubviews: [usageMark(cell.id)])
        top.spacing = Space.space1
        top.alignment = .center
        if let phrase = cell.phrase {
            let ink: UIColor = switch phrase.tone {
            case .near: Palette.statusAttnInk
            case .over: Palette.statusFailInk
            case .stale: Palette.inkMuted
            }
            let words = KitLabel(TypeScale.typeMeta.with(leading: 16.0 / 12), ink: ink)
            words.tabular = true
            words.text = phrase.text
            words.lineBreakMode = .byTruncatingTail
            words.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            top.addArrangedSubview(words)
        } else {
            top.addArrangedSubview(Self.figure("\(usagePercent(cell.short))%", Palette.inkStrong))
            if let long = cell.long {
                top.addArrangedSubview(Self.figure("·", Palette.inkMuted))
                top.addArrangedSubview(Self.figure("\(usagePercent(long))%", Palette.inkStrong))
            }
        }
        top.addArrangedSubview(UIView())
        // The pace tick is a gap that shows the paint the bar stands on: the wash over the ground.
        let paint = wash.map { wash in
            UIColor { traits in Self.over(wash.resolvedColor(with: traits), ground.resolvedColor(with: traits)) }
        } ?? ground
        let bars = UIStackView()
        bars.spacing = Space.space1
        bars.alignment = .center
        let short = Self.bar(cell.short, name: cell.name, paint: paint)
        bars.addArrangedSubview(short)
        if let long = cell.long {
            let second = Self.bar(long, name: cell.name, paint: paint)
            bars.addArrangedSubview(second)
            second.widthAnchor.constraint(equalTo: short.widthAnchor, multiplier: 2).isActive = true
        }
        let column = UIStackView(arrangedSubviews: [top, bars])
        column.axis = .vertical
        column.spacing = 6
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            top.heightAnchor.constraint(equalToConstant: 16),
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageStripCell is built in code")
    }

    private static func figure(_ text: String, _ ink: UIColor) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta.with(leading: 16.0 / 12), ink: ink)
        label.tabular = true
        label.text = text
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        return label
    }

    private static func bar(_ row: Usage.Row, name: String, paint: UIColor) -> LimitBar {
        let bar = LimitBar(height: 4)
        bar.configure(used: row.meter.used, elapsed: row.meter.elapsed, tone: UsageCell.tone(row.meter.state),
                      reached: row.meter.state == .reached, paint: paint, label: "\(name) \(row.label)")
        return bar
    }

    /// `top` drawn over `bottom`, as one opaque colour.
    private static func over(_ top: UIColor, _ bottom: UIColor) -> UIColor {
        var (tr, tg, tb, ta): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        top.getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
        bottom.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return UIColor(red: tr * ta + br * (1 - ta), green: tg * ta + bg * (1 - ta), blue: tb * ta + bb * (1 - ta), alpha: 1)
    }
}

/// Every limit window, grouped by provider, and the way to the Usage page
/// (UsageMeter.svelte `limits`): the content of the house sheet the strip
/// opens, titled "Usage limits".
final class UsageSheetController: ObservedViewController {
    private let home: HomeModel
    private let stack = UIStackView()
    let scroll = UIScrollView()
    /// Opens the Usage page (`.pop-foot`); the foot shows only where a page can be opened.
    var onPage: (() -> Void)?

    init(home: HomeModel) {
        self.home = home
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageSheetController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        // As tall as the list, until the sheet's own ceiling makes it scroll.
        let fit = scroll.heightAnchor.constraint(equalTo: stack.heightAnchor)
        fit.priority = .defaultLow
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
            fit,
        ])
    }

    override func refreshContent() {
        let usage = home.usage
        let now = home.now
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if usage.cells.isEmpty, usage.notes.isEmpty {
            stack.addArrangedSubview(Self.line(usage.empty, mark: nil, ruled: false))
        }
        for (index, cell) in usage.cells.enumerated() {
            stack.addArrangedSubview(Self.group(cell, now: now, ruled: index > 0))
        }
        for (index, note) in usage.notes.enumerated() {
            // A provider with no windows to show: why, and what to do about it.
            stack.addArrangedSubview(Self.line(note.text, mark: note.id, ruled: index > 0 || !usage.cells.isEmpty))
        }
        if let onPage {
            let foot = UsageFoot()
            foot.addAction(UIAction { _ in onPage() }, for: .touchUpInside)
            stack.addArrangedSubview(foot)
        }
    }

    private static func rule(in box: UIView) {
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(rule)
        NSLayoutConstraint.activate([
            rule.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            rule.topAnchor.constraint(equalTo: box.topAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
        ])
    }

    /// A line of muted meta text (`.pop-empty`, `.pop-note`): 10pt and 12pt in, led by its provider's mark where it has one.
    private static func line(_ text: String, mark: String?, ruled: Bool) -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        label.text = text
        label.wrap = .pretty
        let row = UIStackView(arrangedSubviews: (mark.map { [usageMark($0)] } ?? []) + [label])
        row.spacing = 6
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        let box = UIView()
        box.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
            row.topAnchor.constraint(equalTo: box.topAnchor, constant: 10 + (ruled ? 1 : 0)),
            row.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -10),
        ])
        if ruled { rule(in: box) }
        return box
    }

    /// One provider (`.pop-group`): 12pt in, its rows 10pt apart, a
    /// hairline above every group after the first.
    private static func group(_ cell: Usage.Cell, now: Double, ruled: Bool) -> UIView {
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 10
        column.translatesAutoresizingMaskIntoConstraints = false
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = cell.name
        name.accessibilityTraits = .header
        let provider = UIStackView(arrangedSubviews: [usageMark(cell.id), name, UIView()])
        provider.spacing = 6
        provider.alignment = .center
        column.addArrangedSubview(provider)
        for (index, row) in cell.rows.enumerated() {
            let under = index == 0 ? cell.staleAge ?? resetLine(row, now: now) : resetLine(row, now: now)
            column.addArrangedSubview(Self.row(row, under: under))
        }
        let box = UIView()
        box.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
            column.topAnchor.constraint(equalTo: box.topAnchor, constant: 12 + (ruled ? 1 : 0)),
            column.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -12),
        ])
        if ruled { rule(in: box) }
        return box
    }

    /// Under a window's name in the list: when it resets, or that it is spent.
    private static func resetLine(_ row: Usage.Row, now: Double) -> String {
        guard let reset = row.meter.window.resetsAt else {
            return row.meter.used >= 100 ? "Limit reached" : ""
        }
        let when = "resets \(Usage.resetShort(reset, now: now))"
        return row.meter.used >= 100 ? "Limit reached · \(when)" : when
    }

    /// A window (`.pop-row`): its name over when it resets, its bar, its
    /// percent, in a 104pt | rest | 32pt grid 8pt apart. A session's bar is
    /// half a longer window's: the short window reads as the short one
    /// before its name is read.
    private static func row(_ row: Usage.Row, under: String) -> UIView {
        let meter = row.meter
        let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        name.tabular = true
        name.text = row.label
        let names = UIStackView(arrangedSubviews: [name])
        names.axis = .vertical
        if !under.isEmpty {
            let sub = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            sub.tabular = true
            sub.text = under
            names.addArrangedSubview(sub)
        }
        let bar = LimitBar(height: 4)
        bar.configure(used: meter.used, elapsed: meter.elapsed, tone: UsageCell.tone(meter.state), reached: meter.state == .reached,
                      paint: Palette.surfaceRaised, label: row.label)
        let track = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        track.addSubview(bar)
        let percent = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        percent.tabular = true
        percent.textAlignment = .right
        percent.text = "\(usagePercent(row))%"
        let line = UIStackView(arrangedSubviews: [names, track, percent])
        line.spacing = 8
        line.alignment = .center
        NSLayoutConstraint.activate([
            names.widthAnchor.constraint(equalToConstant: 104),
            percent.widthAnchor.constraint(equalToConstant: 32),
            track.heightAnchor.constraint(equalToConstant: 4),
            bar.leadingAnchor.constraint(equalTo: track.leadingAnchor),
            bar.centerYAnchor.constraint(equalTo: track.centerYAnchor),
            bar.widthAnchor.constraint(equalTo: track.widthAnchor, multiplier: meter.window.group == "session" ? 0.5 : 1),
        ])
        return line
    }
}

/// The way to the page (`.pop-foot`): plain meta text on a hairline, coral while pressed.
private final class UsageFoot: UIControl {
    private let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)

    init() {
        super.init(frame: .zero)
        label.text = "Open Usage"
        label.isUserInteractionEnabled = false
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rule)
        NSLayoutConstraint.activate([
            rule.topAnchor.constraint(equalTo: topAnchor),
            rule.leadingAnchor.constraint(equalTo: leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            label.topAnchor.constraint(equalTo: topAnchor, constant: 11),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -12),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .link
        accessibilityLabel = "Open Usage"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageFoot is built in code")
    }

    override var isHighlighted: Bool {
        didSet { label.ink = isHighlighted ? Palette.meterCalm : Palette.inkStrong }
    }
}
