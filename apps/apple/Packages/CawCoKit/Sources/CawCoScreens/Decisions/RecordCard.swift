import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// One card of a decided page, settled (RecordCard.svelte): the record is
/// the cards the person picked on, nothing restated in a block of its own.
/// Top to bottom, each part only when it has something: the mockup's still
/// in the chosen state, the question, the chosen option as the kit's picked
/// chip with its line (or Left open), the dials, the person's note led by
/// their own mark, the tasks it made (each opening its sheet), and a fold
/// with the options turned down, the card's why and the writer's
/// Recommended mark. Nothing shows a card, option or page id.
final class RecordCardView: TileView {
    var taskOf: (String) -> (kind: Components.Schemas.StageKind?, title: String)? = { _ in nil }
    var onOpenTask: (String) -> Void = { _ in }

    private let card: DecisionRecordCard
    /// The hub's address: a still is a path on it, as the web's `<img src>` reads it.
    private let hub: URL?
    private let column = UIStackView()
    private let still = UIImageView()
    private let fold = UIStackView()
    private var toggle: UIButton?
    private var open = false

    init(_ card: DecisionRecordCard, hub: URL?) {
        self.card = card
        self.hub = hub
        super.init(radius: Radius.radiusLg)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RecordCardView is built in code")
    }

    func show() {
        // The still bleeds to the card's top and sides at its corners, 16:10.
        let stillURL = card.still.flatMap { URL(string: $0, relativeTo: hub)?.absoluteURL }
        if let stillURL {
            still.contentMode = .scaleAspectFill
            still.clipsToBounds = true
            still.backgroundColor = Palette.surfaceRecess
            still.layer.cornerRadius = Radius.radiusLg
            still.layer.cornerCurve = .continuous
            still.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            still.translatesAutoresizingMaskIntoConstraints = false
            still.isAccessibilityElement = true
            still.accessibilityTraits = .image
            still.accessibilityLabel = chosen.first?.label
            addSubview(still)
            NSLayoutConstraint.activate([
                still.topAnchor.constraint(equalTo: topAnchor),
                still.leadingAnchor.constraint(equalTo: leadingAnchor),
                still.trailingAnchor.constraint(equalTo: trailingAnchor),
                still.heightAnchor.constraint(equalTo: still.widthAnchor, multiplier: 10.0 / 16.0),
            ])
            Task { [weak self] in
                guard let (data, response) = try? await URLSession.shared.data(for: .hub(stillURL)),
                      (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else { return }
                self?.still.image = image
            }
        }
        column.axis = .vertical
        column.alignment = .leading
        column.spacing = Space.space3
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: stillURL == nil ? topAnchor : still.bottomAnchor, constant: Space.space5),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space5),
            column.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Space.space5),
        ])

        let question = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
        question.text = card.question
        question.wrap = .pretty
        question.accessibilityTraits = .header
        column.addArrangedSubview(question)

        if chosen.isEmpty {
            let open = KitLabel(TypeScale.typeLabel, ink: Palette.inkSubtle)
            open.text = Words.Decisions.leftOpen
            column.addArrangedSubview(open)
        }
        for option in chosen {
            column.addArrangedSubview(optionRow(option, picked: true))
        }
        if !card.dials.isEmpty {
            // Each dial's name, then its value in strong ink and tabular figures.
            let dials = UILabel()
            dials.numberOfLines = 0
            let meta = TypeScale.typeMeta.font
            let figures = UIFont(descriptor: meta.fontDescriptor.addingAttributes([
                .featureSettings: [[UIFontDescriptor.FeatureKey.type: kNumberSpacingType, UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector]],
            ]), size: meta.pointSize)
            let said = NSMutableAttributedString()
            for (index, dial) in card.dials.enumerated() {
                // A dial is a `[name, value]` pair (the contract's prefixItems), read as an array.
                let pair = dial.value.map { $0 as? String ?? "" }
                let name = pair.first ?? "", value = pair.count > 1 ? pair[1] : ""
                said.append(NSAttributedString(string: "\(index > 0 ? " · " : "")\(name) ", attributes: [.font: meta, .foregroundColor: Palette.inkMuted]))
                said.append(NSAttributedString(string: value, attributes: [.font: figures, .foregroundColor: Palette.inkStrong]))
            }
            dials.attributedText = said
            column.addArrangedSubview(dials)
        }
        if !card.note.isEmpty {
            column.addArrangedSubview(noteRow(card.note))
        }
        if !card.tasks.isEmpty {
            let chips = card.tasks.map(taskChip)
            let row = WrapLayout(chips, gap: Space.space2)
            column.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: column.widthAnchor).isActive = true
        }
        if !others.isEmpty, card.options.count > 1 {
            let toggle = KitButton.make(Words.Decisions.others(count: others.count), glyph: .chevronDown, variant: .ghost, height: .xs) { [weak self] in
                self?.flip()
            }
            toggle.configuration?.imagePlacement = .trailing
            self.toggle = toggle
            column.addArrangedSubview(toggle)
            // Its words line up with the card's text: it hangs into the leading inset.
            column.setCustomSpacing(Space.space3 - Space.space1, after: column.arrangedSubviews[column.arrangedSubviews.count - 2])
            toggle.transform = .identity
            fold.axis = .vertical
            fold.alignment = .leading
            fold.spacing = Space.space2
            if !card.why.isEmpty {
                let why = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                why.text = card.why
                fold.addArrangedSubview(why)
            }
            for option in others { fold.addArrangedSubview(optionRow(option, picked: false)) }
            fold.isHidden = true
            fold.alpha = 0
            column.addArrangedSubview(fold)
            fold.widthAnchor.constraint(equalTo: column.widthAnchor).isActive = true
            NSLayoutConstraint.activate([toggle.leadingAnchor.constraint(equalTo: column.leadingAnchor, constant: -(1 + Space.space2))])
        }
    }

    private var chosen: [Components.Schemas.DecisionOption] {
        card.chosen.flatMap { id in card.options.filter { $0.id == id } }
    }

    private var others: [Components.Schemas.DecisionOption] {
        card.options.filter { !card.chosen.contains($0.id) }
    }

    /// The kit's chip, inert: picked (the brand edge, the chosen keycap), or
    /// turned down at the disabled 50%, its Recommended mark and its line after it.
    private func optionRow(_ option: Components.Schemas.DecisionOption, picked: Bool) -> UIView {
        let chip = OptionChip(key: Int(option.keycap), label: option.label)
        chip.configure(selected: picked, live: true, enabled: true)
        chip.isUserInteractionEnabled = false
        chip.alpha = picked ? 1 : 0.5
        var parts: [UIView] = [chip]
        if !picked, option.recommended {
            let tag = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            tag.text = Words.Decisions.recommended
            let box = UIView()
            box.layer.borderWidth = 1
            box.layer.cornerRadius = Radius.radiusXs
            box.layer.cornerCurve = .continuous
            box.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
            tag.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(tag)
            NSLayoutConstraint.activate([
                tag.topAnchor.constraint(equalTo: box.topAnchor),
                tag.bottomAnchor.constraint(equalTo: box.bottomAnchor),
                tag.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space1),
                tag.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space1),
            ])
            parts.append(box)
        }
        if !option.line.isEmpty {
            let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            line.text = option.line
            parts.append(line)
        }
        let row = WrapLayout(parts, gap: Space.space2, rowGap: Space.space1, centred: true)
        row.translatesAutoresizingMaskIntoConstraints = false
        return row
    }

    /// The person's words, led by their own mark (the transcript's reader mark).
    private func noteRow(_ words: String) -> UIView {
        let mark = UIView()
        mark.layer.cornerRadius = Radius.rowMarkR
        mark.layer.cornerCurve = .continuous
        mark.backgroundColor = Palette.actionSolid
        let glyph = GlyphView(.user, size: Size.rowMarkGlyph, tint: Palette.onAction)
        glyph.translatesAutoresizingMaskIntoConstraints = false
        mark.addSubview(glyph)
        mark.translatesAutoresizingMaskIntoConstraints = false
        let text = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
        text.text = words
        let row = UIStackView(arrangedSubviews: [mark, text])
        row.spacing = Space.space2
        row.alignment = .firstBaseline
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: Size.rowMark),
            mark.heightAnchor.constraint(equalToConstant: Size.rowMark),
            glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
        ])
        row.alignment = .top
        return row
    }

    /// A task it made, as the kit's Badge link: its id in mono, then once the
    /// board has it its title, in its state's hue (done or dropped); a tap opens its sheet.
    private func taskChip(_ id: String) -> UIView {
        let task = taskOf(id)
        let (ground, ink): (UIColor, UIColor) = switch task?.kind {
        case .done?: (Palette.statusDoneBg, Palette.statusDoneInk)
        case .dropped?: (Palette.statusFailBg, Palette.statusFailInk)
        default: (Palette.surfaceRecess, Palette.inkStrong)
        }
        let chip = UIControl()
        chip.backgroundColor = ground
        chip.layer.cornerRadius = Radius.radiusXs
        chip.layer.cornerCurve = .continuous
        let number = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
        number.text = id
        number.tabular = true
        let row = UIStackView(arrangedSubviews: [number])
        if let task {
            let title = KitLabel(TypeScale.typeLabel, ink: ink)
            title.text = task.title
            title.lineBreakMode = .byTruncatingTail
            title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            row.addArrangedSubview(title)
        }
        row.spacing = Space.space1
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        chip.addSubview(row)
        NSLayoutConstraint.activate([
            chip.heightAnchor.constraint(equalToConstant: 20),
            row.leadingAnchor.constraint(equalTo: chip.leadingAnchor, constant: 6),
            row.trailingAnchor.constraint(equalTo: chip.trailingAnchor, constant: -6),
            row.centerYAnchor.constraint(equalTo: chip.centerYAnchor),
        ])
        chip.isAccessibilityElement = true
        chip.accessibilityLabel = [id, task?.title].compactMap(\.self).joined(separator: ", ")
        chip.accessibilityTraits = .link
        chip.addAction(UIAction { [weak self] _ in self?.onOpenTask(id) }, for: .touchUpInside)
        return chip
    }

    /// The fold opens over `durPanel` and shuts over `durExit`, its chevron turning.
    private func flip() {
        open.toggle()
        guard let toggle else { return }
        KitButton.setTitle(open ? Words.Decisions.hideOthers : Words.Decisions.others(count: others.count), of: toggle, variant: .ghost, height: .xs)
        toggle.accessibilityValue = open ? "expanded" : "collapsed"
        let change: @MainActor @Sendable () -> Void = {
            self.fold.isHidden = !self.open
            self.fold.alpha = self.open ? 1 : 0
            toggle.imageView?.transform = self.open ? CGAffineTransform(scaleX: 1, y: -1) : .identity
            self.superview?.superview?.layoutIfNeeded()
        }
        if UIAccessibility.isReduceMotionEnabled {
            UIView.performWithoutAnimation(change)
        } else {
            Motion.easeOut.animator(open ? Motion.durPanel : Motion.durExit, animations: change).startAnimation()
        }
    }
}
