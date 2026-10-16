import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
import UIKit
import WebKit

/// One row's view in a list cell, `px-5` in; the view may be one the sheet
/// keeps (a field, the activity's composer), which moves in without leaving
/// the window it is in.
final class HostCell: UICollectionViewCell {
    private weak var hosted: UIView?
    private var topConstraint: NSLayoutConstraint?

    /// Sized at the width the list gives it with its content laid out at
    /// that width first. A view whose height follows its width (MessageBody,
    /// WrapLayout) learns the width only by being laid out at it; UIKit's
    /// fitting lays nothing out, so a row the list sized off screen, after
    /// the sheet changed width, kept the height of the width before (the
    /// acceptance criteria 172pt where 636pt wide needs 268).
    override func preferredLayoutAttributesFitting(_ layoutAttributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        if abs(bounds.width - layoutAttributes.size.width) > 0.5 {
            frame.size.width = layoutAttributes.size.width
        }
        layoutIfNeeded()
        return super.preferredLayoutAttributesFitting(layoutAttributes)
    }

    func host(_ view: UIView, top: Double) {
        backgroundConfiguration = .clear()
        if hosted === view, view.superview === contentView {
            topConstraint?.constant = top
            return
        }
        contentView.subviews.forEach { $0.removeFromSuperview() }
        view.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(view)
        hosted = view
        let topConstraint = view.topAnchor.constraint(equalTo: contentView.topAnchor, constant: top)
        self.topConstraint = topConstraint
        NSLayoutConstraint.activate([
            topConstraint,
            view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Space.space5),
            view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Space.space5),
        ])
    }
}

/// The kit's Checkbox (ui/checkbox): 16pt at `--radius-xs` on the input
/// border; checked, the action's solid with its tick in `on-action`, which
/// fades in over `--dur-toggle`. It stands 16pt wide in its row, as the web's does.
final class TaskCheckbox: UIControl {
    private let box = UIView()
    private let tick = GlyphView(.tick, size: 12, tint: Palette.onAction)

    init(checked: Bool) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        box.isUserInteractionEnabled = false
        box.layer.cornerRadius = Radius.radiusXs
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.translatesAutoresizingMaskIntoConstraints = false
        tick.translatesAutoresizingMaskIntoConstraints = false
        addSubview(box)
        box.addSubview(tick)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.iconMd),
            heightAnchor.constraint(equalToConstant: Size.iconMd),
            box.topAnchor.constraint(equalTo: topAnchor),
            box.bottomAnchor.constraint(equalTo: bottomAnchor),
            box.leadingAnchor.constraint(equalTo: leadingAnchor),
            box.trailingAnchor.constraint(equalTo: trailingAnchor),
            tick.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            tick.centerYAnchor.constraint(equalTo: box.centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (control: TaskCheckbox, _: UITraitCollection) in control.paint() }
        self.checked = checked
        accessibilityValue = checked ? "Checked" : "Not checked"
        tick.alpha = checked ? 1 : 0
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskCheckbox is built in code")
    }

    /// Whether it is ticked; a change fades the tick over `--dur-toggle`.
    var checked = false {
        didSet {
            guard checked != oldValue else { return }
            accessibilityValue = checked ? "Checked" : "Not checked"
            paint()
            Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durToggle) { self.tick.alpha = self.checked ? 1 : 0 }.startAnimation()
        }
    }

    private func paint() {
        box.backgroundColor = checked ? Palette.actionSolid : .clear
        box.layer.borderColor = (checked ? Palette.actionSolid : Palette.input).resolvedColor(with: traitCollection).cgColor
    }

    /// A tap that ends inside, as UIKit's touch-up-inside reads it, is the
    /// action (RailViews' rows do the same): a touch the window's reach
    /// handed over counts.
    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }
}

/// A pressable row (`press-tint`): its content on a ground that takes
/// `--surface-hover` while pressed.
final class TaskPressRow: UIControl {
    let label: KitLabel
    private let stack = UIStackView()
    private var edges: [NSLayoutConstraint] = []

    init(lines: Int) {
        label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: lines)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(label)
        stack.spacing = Space.space2
        stack.alignment = .center
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        inset(NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space1, bottom: Space.space1, trailing: Space.space1))
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskPressRow is built in code")
    }

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }

    func inset(_ insets: NSDirectionalEdgeInsets) {
        NSLayoutConstraint.deactivate(edges)
        edges = [
            stack.topAnchor.constraint(equalTo: topAnchor, constant: insets.top),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -insets.bottom),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: insets.leading),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -insets.trailing),
        ]
        NSLayoutConstraint.activate(edges)
    }

    private var ground: UIColor?

    override var backgroundColor: UIColor? {
        didSet { if !isHighlighted { ground = backgroundColor } }
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            super.backgroundColor = isHighlighted ? Palette.surfaceHover : ground
        }
    }

    override var accessibilityLabel: String? {
        get { super.accessibilityLabel ?? label.text }
        set { super.accessibilityLabel = newValue }
    }
}

/// One of a task file's own text sections (tasks/TextSection.svelte): read
/// as markdown, edited as the text it is. Save writes it back through the
/// hub; a refusal stays under the field with the draft kept.
final class TaskTextPart: UIView, UITextViewDelegate {
    private let heading: String
    private let empty: String
    private let onSave: (String) async throws -> Void
    var onResize: (() -> Void)?
    private let stack = UIStackView()
    private let markdown = MarkdownDocumentView()
    private let emptyLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkSubtle, lines: 0)
    private let editor = UITextView()
    private let problem = TaskSheetController.problemLabel()
    private var editButton: UIButton!
    private var saveButton: UIButton!
    private let editing = UIStackView()
    private var draft: String?
    private var saving = false

    /// The section's text as the hub last wrote it; a draft in progress keeps its own.
    var text = "" {
        didSet {
            guard text != oldValue else { return }
            markdown.setSource(text)
            showRead()
        }
    }

    init(heading: String, empty: String, onSave: @escaping (String) async throws -> Void) {
        self.heading = heading
        self.empty = empty
        self.onSave = onSave
        super.init(frame: .zero)
        accessibilityIdentifier = "task-text-\(heading.lowercased().replacing(" ", with: "-"))"
        editButton = KitButton.make("Edit", variant: .ghost, height: .xs) { [weak self] in self?.beginEditing() }
        saveButton = KitButton.make("Save", variant: .outline, height: .sm) { [weak self] in self?.save() }
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in self?.cancel() }
        emptyLabel.text = empty
        // `font-mono text-label` in the kit's textarea.
        editor.font = TypeScale.typeCode.with(points: TypeScale.typeLabel.points).font
        editor.textColor = Palette.inkStrong
        editor.backgroundColor = Palette.surfaceRaised
        editor.isScrollEnabled = false
        editor.layer.cornerRadius = Radius.radiusMd
        editor.layer.cornerCurve = .continuous
        editor.layer.borderWidth = 1
        editor.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        editor.accessibilityLabel = heading
        editor.delegate = self
        editor.heightAnchor.constraint(greaterThanOrEqualToConstant: 64).isActive = true
        let actions = UIStackView(arrangedSubviews: [UIView(), cancel, saveButton])
        actions.spacing = Space.space1
        actions.alignment = .center
        editing.axis = .vertical
        editing.spacing = Space.space2
        for part in [editor, problem, actions] as [UIView] { editing.addArrangedSubview(part) }
        stack.axis = .vertical
        stack.spacing = Space.space2
        for part in [TaskSheetController.sectionHead(heading, count: nil, trailing: editButton), markdown, emptyLabel, editing] as [UIView] {
            stack.addArrangedSubview(part)
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (part: TaskTextPart, _: UITraitCollection) in part.paintEditor() }
        paintEditor()
        showRead()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskTextPart is built in code")
    }

    private func paintEditor() {
        editor.layer.borderColor = (editor.isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
    }

    private func showRead() {
        let reading = draft == nil
        editing.isHidden = reading
        editButton.isHidden = !reading
        markdown.isHidden = !reading || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        emptyLabel.isHidden = !reading || !markdown.isHidden
        onResize?()
    }

    private func beginEditing() {
        draft = text
        editor.text = text
        problem.isHidden = true
        showRead()
        editor.becomeFirstResponder()
    }

    private func cancel() {
        draft = nil
        problem.isHidden = true
        editor.resignFirstResponder()
        showRead()
    }

    private func save() {
        guard let draft, !saving else { return }
        saving = true
        saveButton.isEnabled = false
        KitButton.setTitle("Saving…", of: saveButton, variant: .outline, height: .sm)
        Task {
            do {
                try await onSave(draft)
                self.draft = nil
                editor.resignFirstResponder()
                problem.isHidden = true
            } catch {
                problem.text = error.localizedDescription
                problem.isHidden = false
            }
            saving = false
            saveButton.isEnabled = true
            KitButton.setTitle("Save", of: saveButton, variant: .outline, height: .sm)
            showRead()
        }
    }

    func textViewDidChange(_ textView: UITextView) {
        draft = textView.text
        onResize?()
    }

    func textViewDidBeginEditing(_: UITextView) { paintEditor() }
    func textViewDidEndEditing(_: UITextView) { paintEditor() }
}

#if DEBUG
/// The task sheet's parts as `TaskSheet` lines
/// (scripts/probe-kit/specs/ios-task-review.ts): every view named
/// `task-…` that stands in the window, its frame (in the body's content
/// points for a part of the list, so a scroll moves none of them; in the
/// window's for the frame's own panes), whether it shows, and what it says.
/// A line is logged when a part comes, changes or goes.
enum TaskSheetProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "TaskSheet")
    private static var last: [String: String] = [:]

    static func report(_ root: UIView, body: UICollectionView) {
        var lines: [String: String] = [:]
        var showing: Set<String> = []
        visit(root) { view in
            guard let id = view.accessibilityIdentifier, id.hasPrefix("task-") else { return }
            let shows = !hidden(view)
            // A row's last drawing can linger in a cell the list keeps hidden for reuse: the one shown wins.
            guard shows || !showing.contains(id) else { return }
            if shows { showing.insert(id) }
            let inBody = view !== body && view.isDescendant(of: body)
            let frame = view.convert(view.bounds, to: inBody ? body : nil)
            var line = "part \(id) in=\(inBody ? "body" : "window") frame=\(box(frame)) shows=\(shows)"
            if let words = says(view) { line += " says=\(words.replacing("\n", with: " "))" }
            lines[id] = line
        }
        for (id, line) in lines.sorted(by: { $0.key < $1.key }) where last[id] != line {
            log.notice("\(line, privacy: .public)")
        }
        for id in last.keys where lines[id] == nil {
            log.notice("gone \(id, privacy: .public)")
        }
        last = lines
    }

    /// Every view under `view`, but not into a transcript, a page or a document, which hold no part.
    private static func visit(_ view: UIView, _ each: (UIView) -> Void) {
        each(view)
        guard !(view is TranscriptView || view is WKWebView || view is MarkdownDocumentView) else { return }
        for sub in view.subviews { visit(sub, each) }
    }

    private static func hidden(_ view: UIView) -> Bool {
        var at: UIView? = view
        while let current = at {
            if current.isHidden || current.alpha == 0 { return true }
            at = current.superview
        }
        return view.window == nil
    }

    private static func says(_ view: UIView) -> String? {
        switch view {
        case let tabs as KitSegmented: "selected=\(tabs.selectedIndex.map(String.init) ?? "none")"
        case let list as UICollectionView:
            String(format: "offset=%.1f foot=%.1f safe=%.1f", list.contentOffset.y + list.adjustedContentInset.top,
                   list.adjustedContentInset.bottom, list.safeAreaInsets.bottom)
        case let label as UILabel: label.text
        case let button as UIButton: button.configuration?.title ?? button.currentTitle ?? button.accessibilityLabel
        default: view.accessibilityLabel
        }
    }

    private static func box(_ rect: CGRect) -> String {
        String(format: "%.1f,%.1f,%.1f,%.1f", rect.minX, rect.minY, rect.width, rect.height)
    }
}
#endif
