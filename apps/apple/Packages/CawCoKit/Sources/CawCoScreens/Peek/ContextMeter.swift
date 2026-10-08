import CawCoCore
import CawCoDesign
import UIKit

/// How full the session's context window is (ContextMeter.svelte). Quiet
/// until it matters: a glyph and a percentage at rest, taking a warning ink
/// as the window fills, and the whole pill saying "Compacting" for as long
/// as the session says it is doing that. Pressed, it opens the window's
/// breakdown, and asks the session for a fresh reading as it does.
///
/// The numbers are the SDK's own (`getContextUsage`); the swatches are this
/// app's chart ramp, by position.
final class ContextMeterView: UIControl {
    struct Compaction: Equatable {
        var at: Double
        var preTokens: Double
        var manual: Bool
        var failed: Bool
        var error: String?
    }

    struct Reading {
        var usage: ContextUsage?
        var compacting = false
        var compaction: Compaction?
    }

    /// A compaction is worth showing for a while, then it is just history.
    private static let recent = 60000.0
    static let swatches = [Palette.chart2, Palette.chart3, Palette.chart4, Palette.chart5, Palette.chart1]

    private let glyph = GlyphView(.layers, size: 14)
    private let figure = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground)
    private let compacted = GlyphView(.sparkles, size: Size.iconSm, tint: Palette.mutedForeground)
    private var reading = Reading()
    private weak var open: ContextPopover?
    /// Asks the session for a fresh reading, as the breakdown opens.
    var onRefresh: () -> Void = {}
    /// What the breakdown presents over.
    var presenter: () -> UIViewController? = { nil }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        figure.tabular = true
        let row = UIStackView(arrangedSubviews: [glyph, figure, compacted])
        row.spacing = 6
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 28),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        addAction(UIAction { [weak self] _ in self?.present() }, for: .touchUpInside)
        addInteraction(UIPointerInteraction())
        isAccessibilityElement = true
        accessibilityTraits = .button
        draw()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ContextMeterView is built in code")
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.muted : .clear }
    }

    func configure(_ next: Reading) {
        reading = next
        draw()
        open?.configure(next)
    }

    static func ink(_ usage: ContextUsage?) -> UIColor {
        let percentage = usage?.percentage ?? 0
        if percentage >= 90 { return Palette.destructive }
        if percentage >= 70 { return Palette.warning }
        return Palette.mutedForeground
    }

    private func draw() {
        let shown = Int((reading.usage?.percentage ?? 0).rounded())
        if reading.compacting {
            glyph.glyph = .sparkles
            glyph.tintColor = Palette.foreground
            figure.ink = Palette.foreground
            figure.text = "Compacting"
            compacted.isHidden = true
            accessibilityLabel = "Compacting context"
            pulse(true)
            return
        }
        pulse(false)
        let ink = Self.ink(reading.usage)
        glyph.glyph = .layers
        glyph.tintColor = ink
        figure.ink = ink
        figure.text = reading.usage == nil ? "—" : "\(shown)%"
        let recently = reading.compaction.map { Date().timeIntervalSince1970 * 1000 - $0.at < Self.recent } ?? false
        compacted.isHidden = !recently
        accessibilityLabel = reading.usage == nil ? "Context usage unknown. Show the breakdown." : "Context \(shown)% used. Show the breakdown."
    }

    /// Tailwind's `animate-pulse`: to half opacity and back, every 2s.
    private func pulse(_ on: Bool) {
        let key = "pulse"
        guard on, !UIAccessibility.isReduceMotionEnabled else {
            glyph.layer.removeAnimation(forKey: key)
            return
        }
        guard glyph.layer.animation(forKey: key) == nil else { return }
        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [1, 0.5, 1]
        fade.keyTimes = [0, 0.5, 1]
        fade.duration = 2
        fade.repeatCount = .infinity
        fade.timingFunction = CAMediaTimingFunction(controlPoints: 0.4, 0, 0.6, 1)
        glyph.layer.add(fade, forKey: key)
    }

    private func present() {
        guard let presenter = presenter() else { return }
        onRefresh()
        let popover = ContextPopover()
        popover.configure(reading)
        open = popover
        _ = KitPopover.present(popover, from: self, in: presenter, align: .end)
    }
}

/// The context window's breakdown (ContextMeter.svelte's popover): what
/// fills it, by category, and what the last compaction did.
final class ContextPopover: KitPopoverController {
    private static let width = 288.0
    private let column = UIStackView()
    private var reading = ContextMeterView.Reading()

    private static let figures: NumberFormatter = {
        let format = NumberFormatter()
        format.numberStyle = .decimal
        format.maximumFractionDigits = 0
        return format
    }()

    private static func figure(_ value: Double) -> String {
        figures.string(from: NSNumber(value: value)) ?? "\(Int(value))"
    }

    private static func compact(_ tokens: Double) -> String {
        tokens >= 1000 ? "\(Int((tokens / 1000).rounded()))k" : "\(Int(tokens))"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(column)
        // `p-0` inside the popover's 1pt border: the parts stand inside it.
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: card.topAnchor, constant: 1),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 1),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -1),
            column.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -1),
        ])
        draw()
    }

    func configure(_ next: ContextMeterView.Reading) {
        reading = next
        if isViewLoaded { draw() }
    }

    private func seam() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.border
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    private func padded(_ view: UIView, x: Double = 12, y: Double) -> UIView {
        let box = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: box.topAnchor, constant: y),
            view.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -y),
            view.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: x),
            view.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -x),
        ])
        return box
    }

    private func label(_ text: String, ink: UIColor = Palette.foreground, lines: Int = 1) -> KitLabel {
        let label = KitLabel(TypeScale.typeLabel, ink: ink, lines: lines)
        label.text = text
        label.wrap = .pretty
        return label
    }

    private func draw() {
        column.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let usage = reading.usage

        let head = UIStackView(arrangedSubviews: [GlyphView(.layers, size: Size.iconMd, tint: Palette.mutedForeground), label("Context window"), UIView()])
        head.spacing = 8
        head.alignment = .center
        if let usage {
            let figure = label("\(Int(usage.percentage.rounded()))%", ink: ContextMeterView.ink(usage))
            figure.tabular = true
            head.addArrangedSubview(figure)
        }
        column.addArrangedSubview(padded(head, y: 10))
        column.addArrangedSubview(seam())

        if let usage {
            let bar = UIStackView()
            bar.backgroundColor = Palette.muted
            bar.layer.cornerRadius = 3
            bar.clipsToBounds = true
            bar.heightAnchor.constraint(equalToConstant: 6).isActive = true
            for (index, category) in usage.categories.enumerated() where category.tokens > 0 && usage.totalTokens > 0 {
                let part = UIView()
                part.backgroundColor = ContextMeterView.swatches[index % ContextMeterView.swatches.count]
                bar.addArrangedSubview(part)
                part.widthAnchor.constraint(equalTo: bar.widthAnchor, multiplier: category.tokens / usage.totalTokens).isActive = true
            }
            bar.addArrangedSubview(UIView())
            let used = label("\(Self.figure(usage.totalTokens)) of \(Self.figure(usage.maxTokens)) tokens used", ink: Palette.mutedForeground)
            used.tabular = true
            let top = UIStackView(arrangedSubviews: [bar, used])
            top.axis = .vertical
            top.spacing = 8
            column.addArrangedSubview(padded(top, y: 10))
            column.addArrangedSubview(seam())

            let list = UIStackView()
            list.axis = .vertical
            for (index, category) in usage.categories.enumerated() {
                let swatch = UIView()
                swatch.backgroundColor = ContextMeterView.swatches[index % ContextMeterView.swatches.count]
                swatch.layer.cornerRadius = Radius.radiusHair
                swatch.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([swatch.widthAnchor.constraint(equalToConstant: 8), swatch.heightAnchor.constraint(equalToConstant: 8)])
                let name = label(category.name)
                name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
                let tokens = label(Self.compact(category.tokens), ink: Palette.mutedForeground)
                tokens.tabular = true
                tokens.setContentHuggingPriority(.required, for: .horizontal)
                tokens.setContentCompressionResistancePriority(.required, for: .horizontal)
                let row = UIStackView(arrangedSubviews: [swatch, name, tokens])
                row.spacing = 8
                row.alignment = .center
                list.addArrangedSubview(padded(row, x: 0, y: 4))
            }
            let scroll = UIScrollView()
            let inner = padded(list, y: 8)
            inner.translatesAutoresizingMaskIntoConstraints = false
            scroll.addSubview(inner)
            let fits = scroll.heightAnchor.constraint(equalTo: inner.heightAnchor)
            fits.priority = .defaultHigh
            NSLayoutConstraint.activate([
                inner.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
                inner.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
                inner.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
                inner.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
                scroll.heightAnchor.constraint(lessThanOrEqualToConstant: 224),
                fits,
            ])
            column.addArrangedSubview(scroll)
        } else {
            let none = label("No reading yet. A session has to be running to report what its window holds.", ink: Palette.mutedForeground, lines: 0)
            column.addArrangedSubview(padded(none, y: 16))
        }

        if reading.compacting {
            let glyph = GlyphView(.sparkles, size: 14, tint: Palette.foreground)
            let row = UIStackView(arrangedSubviews: [glyph, label("Compacting now — the session is rewriting its own context.", lines: 0)])
            row.spacing = 8
            row.alignment = .top
            column.addArrangedSubview(seam())
            column.addArrangedSubview(padded(row, y: 8))
        } else if let compaction = reading.compaction {
            let words = compaction.failed
                ? "Last compaction failed\(compaction.error.map { ": \($0)" } ?? ".")"
                : "Compacted \(compaction.manual ? "on request" : "automatically") from \(Self.figure(compaction.preTokens)) tokens."
            column.addArrangedSubview(seam())
            column.addArrangedSubview(padded(label(words, ink: Palette.mutedForeground, lines: 0), y: 8))
        }

        let height = column.systemLayoutSizeFitting(CGSize(width: Self.width - 2, height: UIView.layoutFittingCompressedSize.height),
                                                    withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + 2
        preferredContentSize = CGSize(width: Self.width, height: height)
    }
}
