import CawCoDesign
import UIKit

// The first-prompt editor (spawn/PromptEditor.svelte, TriggerMenu.svelte):
// it grows from 44pt to 120pt, finds `@` / `/` at the caret and inserts
// chips. The prompt that is sent is its text with each chip as `@name` or
// `/name`. A lead chip opens it and is sent as nothing; deleting it leaves
// continue mode.

/// One row of the `@` / `/` menu (ns-types.ts `MenuItem`).
struct NsMenuItem {
    let key: String
    let label: String
    let kind: String
    let glyph: Glyph
    let hue: UIColor
    /// What the chip becomes in the prompt that is sent.
    let serial: String
    let apply: () -> Void
}

/// A chip in the prompt: drawn once as an image the line holds, carrying what it is sent as.
nonisolated private final class ChipAttachment: NSTextAttachment {
    let key: String
    let label: String
    let serial: String
    let lead: Bool
    let mark: UIImage
    let hue: UIColor?

    init(key: String, label: String, serial: String, lead: Bool, mark: UIImage, hue: UIColor?) {
        self.key = key
        self.label = label
        self.serial = serial
        self.lead = lead
        self.mark = mark
        self.hue = hue
        super.init(data: nil, ofType: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ChipAttachment is built in code") }

    /// `.ns-chip`: the line less 1pt above and below, 5pt and 7pt in, 5pt
    /// between its mark and its strong label, on the fill with the control
    /// border at `--radius-sm`. It is centred on the text's own line.
    @MainActor
    func draw(line: Double, font: UIFont, traits: UITraitCollection) {
        let role = TypeScale.typeLabel.with(weight: .medium, leading: 1)
        let side = lead ? 16.0 : 12.0
        let text = NSAttributedString(string: label, attributes: [.font: role.font, .foregroundColor: Palette.inkStrong.resolvedColor(with: traits)])
        let textSize = text.size()
        let width = (1 + 5 + side + 5 + textSize.width + 7 + 1).rounded(.up)
        let size = CGSize(width: width, height: line)
        image = UIGraphicsImageRenderer(size: size).image { _ in
            let box = CGRect(x: 1, y: 1, width: width - 2, height: line - 2)
            let path = UIBezierPath(roundedRect: box.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusSm)
            Palette.surfaceFill.resolvedColor(with: traits).setFill()
            path.fill()
            Palette.borderControl.resolvedColor(with: traits).setStroke()
            path.lineWidth = 1
            path.stroke()
            let markBox = CGRect(x: 6, y: (line - side) / 2, width: side, height: side)
            if let hue {
                mark.withTintColor(hue.resolvedColor(with: traits), renderingMode: .alwaysOriginal).draw(in: markBox)
            } else {
                mark.draw(in: markBox)
            }
            text.draw(at: CGPoint(x: 6 + side + 5, y: (line - textSize.height) / 2))
        }
        bounds = CGRect(x: 0, y: (font.ascender + font.descender) / 2 - line / 2, width: width, height: line)
    }
}

/// The text view: plain-text paste, and the keys the menu and the form take.
private final class PromptTextView: UITextView {
    var menuOpen: () -> Bool = { false }
    var onMenuKey: (String) -> Void = { _ in }
    var onSubmit: () -> Void = {}

    override func paste(_: Any?) {
        // Plain text keeps the prompt's own type and its chips.
        guard let text = UIPasteboard.general.string, let range = selectedTextRange else { return }
        replace(range, withText: text)
        scrollRangeToVisible(selectedRange)
    }

    override var keyCommands: [UIKeyCommand]? {
        var commands = [UIKeyCommand(input: "\r", modifierFlags: .command, action: #selector(submit))]
        if menuOpen() {
            for input in [UIKeyCommand.inputUpArrow, UIKeyCommand.inputDownArrow, UIKeyCommand.inputEscape, "\t"] {
                commands.append(UIKeyCommand(input: input, modifierFlags: [], action: #selector(menuKey(_:))))
            }
        }
        for command in commands { command.wantsPriorityOverSystemBehavior = true }
        return commands
    }

    @objc private func submit() { onSubmit() }
    @objc private func menuKey(_ command: UIKeyCommand) { onMenuKey(command.input ?? "") }
}

final class PromptEditorView: UIView, UITextViewDelegate {
    private let text = PromptTextView()
    private let placeholder = UILabel()
    private var height: NSLayoutConstraint!
    private let phone: Bool
    private let role: TypeRole
    private var menu: (type: Character, query: String, range: NSRange)?
    private var items: [NsMenuItem] = []
    private var index = 0
    private let menuView = TriggerMenuView()
    private var leadGone = false

    /// The view the menu is drawn in, over the whole form.
    weak var menuHost: UIView?
    var menuItems: (Character, String) -> [NsMenuItem] = { _, _ in [] }
    var onChange: (String) -> Void = { _ in }
    var onSubmit: () -> Void = {}
    /// The reader deleted the lead chip.
    var onLeadRemove: () -> Void = {}

    /// A chip the editor opens with, sent as nothing (continue mode's source session).
    var lead: (harness: String, label: String, title: String)? {
        didSet { syncLead() }
    }

    init(phone: Bool) {
        self.phone = phone
        role = TypeScale.typeBody.with(weight: .regular, points: phone ? 16 : nil, leading: 1.55)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        text.backgroundColor = .clear
        text.delegate = self
        text.textContainerInset = UIEdgeInsets(top: 12, left: 16, bottom: 6, right: 16)
        text.textContainer.lineFragmentPadding = 0
        text.typingAttributes = base
        text.autocapitalizationType = .sentences
        text.accessibilityLabel = "First prompt"
        text.translatesAutoresizingMaskIntoConstraints = false
        text.menuOpen = { [weak self] in self?.menu != nil }
        text.onMenuKey = { [weak self] key in self?.menuKey(key) }
        text.onSubmit = { [weak self] in self?.onSubmit() }
        addSubview(text)
        placeholder.isUserInteractionEnabled = false
        placeholder.isAccessibilityElement = false
        placeholder.lineBreakMode = .byTruncatingTail
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        // The hint would only truncate at a phone's width; the question survives whole.
        let hint = phone ? "" : " @ machine or project · / skills and plugins"
        placeholder.attributedText = NSAttributedString(string: "What should the agent do first?" + hint, attributes: role.attributes(color: Palette.inkSubtle))
        addSubview(placeholder)
        height = heightAnchor.constraint(equalToConstant: phone ? 120 : 44)
        NSLayoutConstraint.activate([
            height,
            text.topAnchor.constraint(equalTo: topAnchor),
            text.bottomAnchor.constraint(equalTo: bottomAnchor),
            text.leadingAnchor.constraint(equalTo: leadingAnchor),
            text.trailingAnchor.constraint(equalTo: trailingAnchor),
            placeholder.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            placeholder.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            placeholder.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])
        menuView.onPick = { [weak self] item in self?.insert(item) }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: PromptEditorView, _: UITraitCollection) in view.redrawChips() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PromptEditorView is built in code") }

    private var base: [NSAttributedString.Key: Any] {
        var attributes = role.attributes(color: Palette.inkStrong)
        if let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byWordWrapping
            attributes[.paragraphStyle] = paragraph
        }
        return attributes
    }

    // MARK: Value

    /// The prompt as it is sent: chips as what they stand for, trimmed.
    var value: String {
        var out = ""
        let content = text.attributedText ?? NSAttributedString()
        content.enumerateAttributes(in: NSRange(location: 0, length: content.length)) { attributes, range, _ in
            if let chip = attributes[.attachment] as? ChipAttachment {
                out += chip.serial
            } else {
                out += content.attributedSubstring(from: range).string
            }
        }
        return out.replacingOccurrences(of: "\u{a0}", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// A prompt the form set itself (kept across a relaunch, or a failed
    /// continuation's, restored) is shown as the text it serialises to.
    func set(_ next: String) {
        guard next != value else { return }
        let content = NSMutableAttributedString()
        if let chip = leadChip() {
            content.append(chipText(chip))
            content.append(NSAttributedString(string: " ", attributes: base))
        }
        content.append(NSAttributedString(string: next, attributes: base))
        text.attributedText = content
        text.typingAttributes = base
        changed(notify: false)
    }

    func focusAtEnd() {
        text.becomeFirstResponder()
        text.selectedRange = NSRange(location: text.attributedText.length, length: 0)
    }

    var isEditing: Bool { text.isFirstResponder }

    private func changed(notify: Bool) {
        placeholder.isHidden = text.attributedText.length > 0
        grow()
        if notify { onChange(value) }
    }

    /// 44pt at rest, 120pt while it has focus, text or its menu (always 120 on a phone).
    private func grow() {
        guard !phone else { return }
        let next: Double = text.isFirstResponder || text.attributedText.length > 0 || menu != nil ? 120 : 44
        guard height.constant != next else { return }
        height.constant = next
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        Motion.easeInOut.animator(Motion.durPop) { self.window?.layoutIfNeeded() }.startAnimation()
    }

    // MARK: Chips

    private func chipText(_ chip: ChipAttachment) -> NSAttributedString {
        chip.draw(line: (role.lineHeight - 0).rounded(), font: role.font, traits: traitCollection)
        let text = NSMutableAttributedString(attachment: chip)
        var attributes = base
        attributes[.baselineOffset] = nil
        text.addAttributes(attributes, range: NSRange(location: 0, length: text.length))
        return text
    }

    private func redrawChips() {
        let content = text.attributedText ?? NSAttributedString()
        content.enumerateAttribute(.attachment, in: NSRange(location: 0, length: content.length)) { value, range, _ in
            guard let chip = value as? ChipAttachment else { return }
            chip.draw(line: role.lineHeight.rounded(), font: role.font, traits: traitCollection)
            text.layoutManager.invalidateDisplay(forCharacterRange: range)
        }
    }

    private func leadChip() -> ChipAttachment? {
        var found: ChipAttachment?
        let content = text.attributedText ?? NSAttributedString()
        content.enumerateAttribute(.attachment, in: NSRange(location: 0, length: content.length)) { value, _, stop in
            if let chip = value as? ChipAttachment, chip.lead {
                found = chip
                stop.pointee = true
            }
        }
        return found
    }

    private func syncLead() {
        let current = leadChip()
        guard (lead != nil) != (current != nil) else { return }
        let content = NSMutableAttributedString(attributedString: text.attributedText ?? NSAttributedString())
        if current != nil {
            dropLead(in: content)
        } else if let lead {
            leadGone = false
            let mark: UIImage = switch lead.harness {
            case "claude": BrandLogo.claude.image
            case "opencode": BrandLogo.opencode.image
            default: Glyph.logoPi.image.withTintColor(Palette.inkStrong.resolvedColor(with: traitCollection), renderingMode: .alwaysOriginal)
            }
            let chip = ChipAttachment(key: "continue-source", label: lead.label, serial: "", lead: true, mark: mark, hue: nil)
            chip.accessibilityLabel = lead.title
            content.insert(NSAttributedString(string: " ", attributes: base), at: 0)
            content.insert(chipText(chip), at: 0)
        }
        text.attributedText = content
        text.typingAttributes = base
        changed(notify: false)
    }

    /// The lead chip goes, and the space that followed it.
    private func dropLead(in content: NSMutableAttributedString) {
        content.enumerateAttribute(.attachment, in: NSRange(location: 0, length: content.length)) { value, range, stop in
            guard let chip = value as? ChipAttachment, chip.lead else { return }
            var cut = range
            let string = content.string as NSString
            while NSMaxRange(cut) < string.length, [" ", "\u{a0}"].contains(string.substring(with: NSRange(location: NSMaxRange(cut), length: 1))) {
                cut.length += 1
            }
            content.deleteCharacters(in: cut)
            stop.pointee = true
        }
    }

    // MARK: The `@` / `/` menu

    /// `@` or `/` at the start or after a space, then the word typed so far, up to the caret.
    private func detect() {
        let selection = text.selectedRange
        guard text.isFirstResponder, selection.length == 0 else {
            closeMenu()
            return
        }
        let content = text.attributedText ?? NSAttributedString()
        let string = content.string as NSString
        // Only the run of text the caret is in: a chip ends it.
        var start = selection.location
        while start > 0, string.character(at: start - 1) != 0xFFFC { start -= 1 }
        let before = string.substring(with: NSRange(location: start, length: selection.location - start))
        guard let match = before.firstMatch(of: /(^|[\s\u{a0}])([@\/])([\w.\/\-]*)$/) else {
            closeMenu()
            return
        }
        let type = Character(String(match.2))
        let query = String(match.3)
        let length = 1 + (query as NSString).length
        let wasOpen = menu != nil
        menu = (type, query, NSRange(location: selection.location - length, length: length))
        items = menuItems(type, query)
        index = min(wasOpen ? index : 0, max(0, items.count - 1))
        grow()
        showMenu(entering: !wasOpen)
    }

    private func showMenu(entering: Bool) {
        guard let host = menuHost, let caret = text.selectedTextRange.map({ text.caretRect(for: $0.end) }) else { return }
        menuView.show(items, index: index)
        let anchor = text.convert(caret, to: host)
        let width = phone ? host.bounds.width - 24 : 300
        let tall = min(menuView.fittingHeight(width: width), phone ? host.bounds.height * 0.55 : 440)
        let keyboard = host.keyboardLayoutGuide.layoutFrame
        let floor = min(host.bounds.maxY - host.safeAreaInsets.bottom, keyboard.height > 0 ? keyboard.minY : .greatestFiniteMagnitude) - 8
        let ceiling = host.safeAreaInsets.top + 8
        var y = anchor.maxY + 6
        let above = y + tall > floor && anchor.minY - 6 - tall >= ceiling
        if above { y = anchor.minY - 6 - tall }
        y = min(max(y, ceiling), floor - tall)
        let x = min(max(anchor.minX, 12), host.bounds.width - 12 - width)
        let frame = CGRect(x: x, y: y, width: width, height: tall)
        if menuView.superview !== host { host.addSubview(menuView) }
        host.bringSubviewToFront(menuView)
        guard entering else {
            menuView.frame = frame
            return
        }
        // `.ns-pop`: out of the pop scale, 8pt from its trigger's side, over `durPop` on the drawer curve.
        menuView.layer.anchorPoint = CGPoint(x: 0, y: above ? 1 : 0)
        menuView.transform = .identity
        menuView.frame = frame
        guard !UIAccessibility.isReduceMotionEnabled else {
            menuView.alpha = 1
            return
        }
        menuView.alpha = 0
        menuView.transform = CGAffineTransform(translationX: 0, y: above ? Motion.popRise : -Motion.popRise).scaledBy(x: Motion.popScale, y: Motion.popScale)
        Motion.easeDrawer.animator(Motion.durPop) {
            self.menuView.alpha = 1
            self.menuView.transform = .identity
        }.startAnimation()
    }

    private func closeMenu() {
        guard menu != nil else { return }
        menu = nil
        grow()
        let view = menuView
        let leave = Motion.easeOut.animator(Motion.durExit) { view.alpha = 0 }
        // Gone, it takes no touches from the form under it.
        leave.addCompletion { [weak self] _ in if self?.menu == nil { view.removeFromSuperview() } }
        leave.startAnimation()
    }

    private func menuKey(_ key: String) {
        guard menu != nil else { return }
        let count = max(1, items.count)
        switch key {
        case UIKeyCommand.inputDownArrow:
            index = (index + 1) % count
            menuView.move(to: index)
        case UIKeyCommand.inputUpArrow:
            index = (index - 1 + count) % count
            menuView.move(to: index)
        case "\t":
            if items.indices.contains(index) { insert(items[index]) }
        default:
            closeMenu()
        }
    }

    private func insert(_ item: NsMenuItem) {
        guard let menu else { return }
        let chip = ChipAttachment(key: item.key, label: item.label, serial: item.serial, lead: false, mark: item.glyph.image, hue: item.hue)
        let piece = NSMutableAttributedString(attributedString: chipText(chip))
        piece.append(NSAttributedString(string: " ", attributes: base))
        text.textStorage.replaceCharacters(in: menu.range, with: piece)
        text.selectedRange = NSRange(location: menu.range.location + piece.length, length: 0)
        text.typingAttributes = base
        item.apply()
        closeMenu()
        changed(notify: true)
    }

    // MARK: UITextViewDelegate

    func textView(_: UITextView, shouldChangeTextIn _: NSRange, replacementText replacement: String) -> Bool {
        // Return takes the menu's highlighted row while the menu is open.
        if replacement == "\n", menu != nil, items.indices.contains(index) {
            insert(items[index])
            return false
        }
        return true
    }

    func textViewDidChange(_: UITextView) {
        text.typingAttributes = base
        changed(notify: true)
        detect()
        if lead != nil, leadChip() == nil, !leadGone {
            leadGone = true
            // The space that followed the chip goes with it.
            let content = text.textStorage
            let string = content.string as NSString
            var cut = 0
            while cut < string.length, [" ", "\u{a0}"].contains(string.substring(with: NSRange(location: cut, length: 1))) { cut += 1 }
            if cut > 0 { content.deleteCharacters(in: NSRange(location: 0, length: cut)) }
            changed(notify: true)
            onLeadRemove()
        }
    }

    func textViewDidChangeSelection(_: UITextView) {
        text.typingAttributes = base
        if text.isFirstResponder { detect() }
    }

    func textViewDidBeginEditing(_: UITextView) {
        grow()
    }

    func textViewDidEndEditing(_: UITextView) {
        closeMenu()
        grow()
    }
}

/// The `@` / `/` menu's card (TriggerMenu.svelte on `.ns-pop`): 4pt in, 36pt
/// rows 2pt apart, the highlight sliding to the row the keys are on.
private final class TriggerMenuView: UIView {
    private let card = UIView()
    private let scroll = UIScrollView()
    private let rows = UIStackView()
    private let highlight = UIView()
    private var items: [NsMenuItem] = []
    var onPick: (NsMenuItem) -> Void = { _ in }

    init() {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowOverlay
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.clipsToBounds = true
        card.frame = bounds
        card.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(card)
        scroll.frame = card.bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        card.addSubview(scroll)
        highlight.backgroundColor = Palette.surfaceFill
        highlight.layer.cornerRadius = Radius.radiusSm
        highlight.layer.cornerCurve = .continuous
        scroll.addSubview(highlight)
        rows.axis = .vertical
        rows.spacing = 2
        rows.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(rows)
        NSLayoutConstraint.activate([
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 4),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -4),
            rows.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 4),
            rows.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -4),
        ])
        accessibilityLabel = "Insert"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TriggerMenuView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("TriggerMenuView is built in code") }

    private func paint() {
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    func fittingHeight(width _: Double) -> Double {
        items.isEmpty ? 8 + 36 : 8 + Double(items.count) * 36 + Double(items.count - 1) * 2
    }

    func show(_ next: [NsMenuItem], index: Int) {
        items = next
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for item in next {
            let tile = NsTile(GlyphView(item.glyph, size: 12, tint: item.hue), side: 22)
            tile.layer.cornerRadius = Radius.radiusXs
            let label = KitLabel(TypeScale.typeLabel.with(weight: .medium, leading: 1.2), ink: Palette.inkStrong)
            label.text = item.label
            label.lineBreakMode = .byTruncatingTail
            label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let kind = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            kind.text = item.kind
            kind.setContentCompressionResistancePriority(.required, for: .horizontal)
            kind.setContentHuggingPriority(.required, for: .horizontal)
            let content = UIStackView(arrangedSubviews: [tile, label, kind])
            content.spacing = 9
            content.alignment = .center
            let row = MenuRow(content)
            row.accessibilityLabel = "\(item.label), \(item.kind)"
            row.addAction(UIAction { [weak self] _ in self?.onPick(item) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
        }
        if next.isEmpty {
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            none.text = "No matches"
            let box = UIStackView(arrangedSubviews: [none])
            box.isLayoutMarginsRelativeArrangement = true
            box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 10, leading: 8, bottom: 10, trailing: 8)
            rows.addArrangedSubview(box)
        }
        highlight.alpha = next.isEmpty ? 0 : 1
        place(index)
    }

    func move(to index: Int) {
        guard !UIAccessibility.isReduceMotionEnabled else {
            place(index)
            return
        }
        Motion.easeInOut.animator(Motion.durControl) { self.place(index) }.startAnimation()
    }

    private func place(_ index: Int) {
        highlight.frame = CGRect(x: 4, y: 4 + Double(index) * 38, width: max(0, bounds.width - 8), height: 36)
        scroll.scrollRectToVisible(highlight.frame.insetBy(dx: 0, dy: -4), animated: false)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        highlight.frame.size.width = max(0, bounds.width - 8)
    }
}

private final class MenuRow: UIControl {
    init(_ content: UIView) {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 36),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MenuRow is built in code") }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }
}
