import CawCoCore
import CawCoDesign
import UIKit

/// The usage strip under the status line (UsageMeter.svelte, owner picks a,
/// i): one strip, two lines, the window that will stop you first. Its name
/// and percent, then what matters about it (when it runs out at this pace,
/// or when it resets) over a 4pt bar with its pace tick. Near and over get a
/// faint wash and a glyph, nothing else. The strip opens every window in a
/// sheet, as the web does on touch.
final class UsageCell: HomeCell {
    private let strip = UIControl()
    private let glyph = GlyphView(.attention, size: 14)
    private let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private let percent = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private let detail = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let bar = LimitBar(height: 4)
    private let link = UIButton(type: .custom)
    private let line = UIStackView()
    var onOpen: () -> Void = {}
    /// The Usage page (`.usage-link`): the strip shows its corner link only
    /// where a page can be opened from it.
    var onPage: (() -> Void)? {
        didSet {
            link.isHidden = onPage == nil
            // The first line leaves the link its corner (`.line` 2.5rem).
            line.directionalLayoutMargins.trailing = onPage == nil ? 0 : 40
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        percent.tabular = true
        detail.tabular = true
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        for view in [glyph, name, percent, detail, UIView()] { line.addArrangedSubview(view) }
        line.spacing = Space.space1
        line.alignment = .center
        line.isLayoutMarginsRelativeArrangement = true
        line.directionalLayoutMargins = .zero
        line.isUserInteractionEnabled = false
        bar.isUserInteractionEnabled = false
        let column = UIStackView(arrangedSubviews: [line, bar])
        column.axis = .vertical
        column.spacing = 6
        column.isUserInteractionEnabled = false
        column.translatesAutoresizingMaskIntoConstraints = false
        strip.addSubview(column)
        strip.layer.cornerRadius = Radius.radiusSm
        strip.layer.cornerCurve = .continuous
        strip.addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        strip.isAccessibilityElement = true
        strip.accessibilityTraits = .button
        // The strip's edges line up with the status line's text.
        pin(strip, insets: NSDirectionalEdgeInsets(top: 0, leading: -8, bottom: 0, trailing: -8))
        // Plain meta text in the corner; on touch there is no hover, so a
        // press shows the coral the web's hover does.
        link.translatesAutoresizingMaskIntoConstraints = false
        link.setAttributedTitle(NSAttributedString(string: "Usage", attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)), for: .normal)
        link.setAttributedTitle(NSAttributedString(string: "Usage", attributes: TypeScale.typeMeta.attributes(color: Palette.meterCalm)), for: .highlighted)
        link.accessibilityTraits = .link
        link.isHidden = true
        link.addAction(UIAction { [weak self] _ in self?.onPage?() }, for: .touchUpInside)
        strip.addSubview(link)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 8),
            column.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -8),
            column.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
            strip.heightAnchor.constraint(equalToConstant: 44),
            link.topAnchor.constraint(equalTo: strip.topAnchor, constant: 6),
            link.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -8),
        ])
    }

    func configure(_ usage: Usage.Strip) {
        guard let lead = usage.lead else {
            glyph.isHidden = true
            name.isHidden = true
            percent.isHidden = true
            bar.isHidden = true
            detail.text = usage.reason
            strip.backgroundColor = .clear
            strip.accessibilityLabel = "\(usage.reason). Show every limit."
            return
        }
        let meter = lead.meter
        glyph.isHidden = !(meter.state == .near || meter.state == .over || meter.state == .reached)
        glyph.glyph = meter.state == .near ? .attention : .failed
        glyph.tintColor = meter.state == .near ? Palette.meterNear : Palette.meterOver
        name.isHidden = false
        bar.isHidden = false
        if meter.state == .reached {
            name.text = "\(usage.name) limit"
            percent.isHidden = true
        } else {
            name.text = usage.name
            percent.isHidden = false
            percent.text = "\(Int(meter.used.rounded()))%"
        }
        detail.isHidden = usage.detail.isEmpty
        detail.text = "· \(usage.detail)"
        let wash: UIColor = switch meter.state {
        case .near: Palette.meterWashNear
        case .over, .reached: Palette.meterWashOver
        case .calm, .stale: .clear
        }
        strip.backgroundColor = wash
        bar.configure(
            used: meter.used,
            elapsed: meter.elapsed,
            tone: Self.tone(meter.state),
            reached: meter.state == .reached,
            paint: Palette.surfaceRecess,
            label: usage.name
        )
        strip.accessibilityLabel = "\(usage.name) \(Int(meter.used.rounded())) percent, \(usage.detail). Show every limit."
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

/// Every limit window, grouped by provider (UsageMeter.svelte `limits`):
/// the content of the house sheet the strip opens, titled "Usage limits".
final class UsageSheetController: ObservedViewController {
    private let home: HomeModel
    private let stack = UIStackView()
    let scroll = UIScrollView()

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
        if usage.groups.isEmpty {
            let empty = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            empty.text = usage.reason
            let box = UIView()
            box.addSubview(empty)
            NSLayoutConstraint.activate([
                empty.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
                empty.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
                empty.topAnchor.constraint(equalTo: box.topAnchor, constant: 10),
                empty.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -10),
            ])
            stack.addArrangedSubview(box)
        }
        for (index, group) in usage.groups.enumerated() {
            stack.addArrangedSubview(Self.group(group, now: now, ruled: index > 0))
        }
    }

    /// One provider (`.pop-group`): 12pt in, its rows 10pt apart, a
    /// hairline above every group after the first.
    private static func group(_ group: (name: String, rows: [Usage.Row]), now: Double, ruled: Bool) -> UIView {
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 10
        column.translatesAutoresizingMaskIntoConstraints = false
        let provider = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        provider.text = group.name
        provider.accessibilityTraits = .header
        column.addArrangedSubview(provider)
        for row in group.rows {
            column.addArrangedSubview(Self.row(row, now: now))
        }
        let box = UIView()
        box.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
            column.topAnchor.constraint(equalTo: box.topAnchor, constant: 12),
            column.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -12),
        ])
        if ruled {
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
        return box
    }

    private static func row(_ row: Usage.Row, now: Double) -> UIView {
        let meter = row.meter
        let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        name.text = row.label
        let percent = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        percent.tabular = true
        percent.text = "\(Int(meter.used.rounded()))%"
        percent.setContentHuggingPriority(.required, for: .horizontal)
        let named = UIStackView(arrangedSubviews: [name])
        named.spacing = Space.space1
        named.alignment = .center
        if meter.state == .near || meter.state == .over || meter.state == .reached {
            let near = meter.state == .near
            let glyph = GlyphView(near ? .attention : .failed, size: 14, tint: near ? Palette.meterNear : Palette.meterOver)
            glyph.isAccessibilityElement = true
            glyph.accessibilityLabel = near ? "Near the limit" : meter.state == .reached ? "Limit reached" : "Nearly at the limit"
            named.insertArrangedSubview(glyph, at: 0)
        }
        let head = UIStackView(arrangedSubviews: [named, percent])
        head.alignment = .firstBaseline
        let bar = LimitBar(height: 4)
        bar.configure(used: meter.used, elapsed: meter.elapsed, tone: UsageCell.tone(meter.state), reached: meter.state == .reached, paint: Palette.surfaceRaised, label: row.label)
        let column = UIStackView(arrangedSubviews: [head, bar])
        column.axis = .vertical
        column.spacing = 6
        if let reset = meter.window.resetsAt {
            let resets = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            resets.tabular = true
            resets.text = "\(meter.used >= 100 ? "Limit reached · " : "")resets \(Usage.resetShort(reset, now: now))"
            column.addArrangedSubview(resets)
        }
        return column
    }
}
