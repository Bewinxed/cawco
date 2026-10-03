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
    var onOpen: () -> Void = {}

    override init(frame: CGRect) {
        super.init(frame: frame)
        percent.tabular = true
        detail.tabular = true
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [glyph, name, percent, detail, UIView()])
        line.spacing = Space.space1
        line.alignment = .center
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
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 8),
            column.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -8),
            column.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
            strip.heightAnchor.constraint(equalToConstant: 44),
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

/// Every limit window, grouped by provider: the house bottom sheet the strip opens.
final class UsageSheetController: ObservedViewController {
    private let home: HomeModel
    private let stack = UIStackView()

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
        view.backgroundColor = Palette.surfaceRaised
        navigationItem.title = "Usage limits"
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space5),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space5),
        ])
    }

    override func refreshContent() {
        let usage = home.usage
        let now = home.now
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if usage.groups.isEmpty {
            let empty = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            empty.text = usage.reason
            stack.addArrangedSubview(empty)
        }
        for group in usage.groups {
            let provider = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            provider.text = group.name
            provider.accessibilityTraits = .header
            stack.addArrangedSubview(provider)
            for row in group.rows {
                stack.addArrangedSubview(Self.row(row, now: now))
            }
        }
    }

    private static func row(_ row: Usage.Row, now: Double) -> UIView {
        let meter = row.meter
        let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        name.text = row.label
        let percent = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
        percent.tabular = true
        percent.text = "\(Int(meter.used.rounded()))%"
        percent.setContentHuggingPriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [name, percent])
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
