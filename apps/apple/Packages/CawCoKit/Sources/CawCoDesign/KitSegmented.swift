import UIKit

/// The kit's segmented group (ui/tabs `Tabs.List`, app.css `.kit-segmented`):
/// a `--surface-recess-deep` well at `--radius-md` with 3pt of pad, its
/// segments 30pt tall, 10pt in and 2pt apart in label type at the strong
/// weight, muted until chosen. Under the chosen one sits the thumb
/// (`--surface-lift`, `--shadow-raised`, `--radius-sm`), which glides to the
/// next, its place and size together, over `durPop` on the in-out curve; a
/// press tints the segment. Across, each segment is as wide as its name;
/// down, they fill the column and their names start at its edge.
public final class KitSegmented: UIControl {
    public enum Axis: Sendable { case across, down }

    public private(set) var selectedIndex: Int?
    private let stack = UIStackView()
    private let thumb = UIView()
    private var cells: [Segment] = []
    private var placed = false

    public init(_ labels: [String], selected: Int?, axis: Axis = .across, mono: Bool = false) {
        selectedIndex = selected
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecessDeep
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        thumb.backgroundColor = Palette.surfaceLift
        thumb.layer.cornerRadius = Radius.radiusSm
        thumb.layer.cornerCurve = .continuous
        thumb.isUserInteractionEnabled = false
        thumb.boxShadow = Shadow.shadowRaised
        thumb.alpha = 0
        addSubview(thumb)
        stack.axis = axis == .across ? .horizontal : .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 3),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 3),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -3),
        ])
        for (index, label) in labels.enumerated() {
            let cell = Segment(label, mono: mono, start: axis == .down)
            cell.addAction(UIAction { [weak self] _ in self?.choose(index) }, for: .touchUpInside)
            cells.append(cell)
            stack.addArrangedSubview(cell)
        }
        isAccessibilityElement = false
        accessibilityTraits = .tabBar
        mark()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitSegmented is built in code")
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        // The first placing, and every resize, lands; only a choice glides.
        if !gliding { place() }
        placed = true
    }

    private var gliding = false

    private func place() {
        guard let selectedIndex, cells.indices.contains(selectedIndex) else {
            thumb.alpha = 0
            return
        }
        stack.layoutIfNeeded()
        thumb.frame = cells[selectedIndex].convert(cells[selectedIndex].bounds, to: self)
        thumb.alpha = 1
    }

    private func mark() {
        for (index, cell) in cells.enumerated() { cell.chosen = index == selectedIndex }
    }

    /// Shows `index` as chosen without announcing a change.
    public func select(_ index: Int?, animated: Bool = true) {
        guard index != selectedIndex else { return }
        let from = selectedIndex
        selectedIndex = index
        Motion.easeInOut.animator(Motion.durControl) { self.mark() }.startAnimation()
        guard animated, placed, from != nil, index != nil, !UIAccessibility.isReduceMotionEnabled else {
            place()
            return
        }
        gliding = true
        let glide = UIViewPropertyAnimator(duration: Motion.durPop, timingParameters: Motion.easeInOut.parameters)
        glide.addAnimations { self.place() }
        glide.addCompletion { _ in self.gliding = false }
        glide.startAnimation()
    }

    /// Chooses the segment at `index`, as a tap does.
    public func choose(_ index: Int) {
        guard index != selectedIndex, cells.indices.contains(index) else { return }
        select(index)
        sendActions(for: .valueChanged)
    }

    private final class Segment: UIControl {
        private let label: KitLabel
        var chosen = false {
            didSet {
                label.ink = chosen ? Palette.inkStrong : Palette.inkMuted
                accessibilityTraits = chosen ? [.button, .selected] : .button
            }
        }

        init(_ text: String, mono: Bool, start: Bool) {
            // `font: weight-strong text-label / 1`, in the mono face where the list names files.
            label = KitLabel(mono ? TypeScale.typeCode.with(points: TypeScale.typeLabel.points).withWeight(.medium) : TypeScale.typeLabel.withWeight(.medium),
                             ink: Palette.inkMuted)
            super.init(frame: .zero)
            layer.cornerRadius = Radius.radiusSm
            layer.cornerCurve = .continuous
            label.text = text
            label.isUserInteractionEnabled = false
            label.lineBreakMode = .byTruncatingTail
            label.setContentCompressionResistancePriority(start ? .defaultLow : .required, for: .horizontal)
            addSubview(label)
            var pins = [
                heightAnchor.constraint(equalToConstant: 30),
                label.centerYAnchor.constraint(equalTo: centerYAnchor),
                label.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 10),
                label.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -10),
            ]
            if start {
                pins.append(label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10))
            } else {
                pins.append(label.centerXAnchor.constraint(equalTo: centerXAnchor))
                let snug = widthAnchor.constraint(equalTo: label.widthAnchor, constant: 20)
                snug.priority = .defaultHigh
                pins.append(snug)
            }
            NSLayoutConstraint.activate(pins)
            isAccessibilityElement = true
            accessibilityLabel = text
            accessibilityTraits = .button
            toolTip = text
            addInteraction(UIPointerInteraction(delegate: nil))
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("Segment is built in code")
        }

        override var isHighlighted: Bool {
            didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
        }
    }
}
