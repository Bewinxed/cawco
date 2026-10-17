import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

/// A task's activity (tasks/TaskActivity.svelte): what was said about it
/// (its `## Comments`) and what happened to it (its file's history), in one
/// stream, oldest first. A run of more than three history lines folds to "N
/// changes"; All · Comments narrows it to what was said. A comment's own
/// commit is the comment, so it is not said twice.
///
/// The comment box comes last. Your comment goes where the hub sends it: a
/// live attempt reads it at once; an ended one's session continues with it,
/// or a fresh attempt starts, unless the task is done or dropped or was
/// never attempted. The hint says which.
final class TaskActivityPart: UIView, UITextViewDelegate {
    /// Where your comment goes past the file (`reaches`).
    enum Reaches: Equatable { case live(String), resumes }

    /// Writes the comment; throws the hub's refusal.
    /// A comment's words and its id, which this box chooses (`send`).
    var onComment: (String, String) async throws -> Void = { _, _ in }
    /// Reads the history again.
    var onReread: () -> Void = {}
    var onResize: () -> Void = {}

    private var comments: [TaskComment] = []
    private var history: [TaskHistoryEvent]?
    private var historyProblem: String?
    private var reaches: Reaches?
    private var only = 0
    private var openFolds: Set<String> = []

    private let stack = UIStackView()
    private let streamStack = UIStackView()
    private let choice = KitSegmented(["All", "Comments"], selected: 0)
    private let field = UITextView()
    private let placeholder = KitLabel(TypeScale.typeBody, ink: Palette.inkSubtle)
    private var sendButton: UIButton!
    private let refused = TaskSheetController.problemLabel()
    private let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var sending = false

    init() {
        super.init(frame: .zero)
        accessibilityIdentifier = "task-activity"
        choice.accessibilityLabel = "Show"
        choice.accessibilityIdentifier = "task-activity-show"
        choice.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            only = choice.selectedIndex ?? 0
            draw()
        }, for: .valueChanged)
        choice.setContentHuggingPriority(.required, for: .horizontal)
        stack.axis = .vertical
        stack.spacing = Space.space2
        streamStack.axis = .vertical
        streamStack.spacing = Space.space2
        streamStack.accessibilityIdentifier = "task-activity-stream"
        field.font = TypeScale.typeBody.font
        field.textColor = Palette.inkStrong
        field.backgroundColor = Palette.surfaceRaised
        field.isScrollEnabled = false
        field.layer.cornerRadius = Radius.radiusMd
        field.layer.cornerCurve = .continuous
        field.layer.borderWidth = 1
        field.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 44)
        field.accessibilityLabel = "Add a comment"
        field.accessibilityIdentifier = "task-comment-field"
        field.delegate = self
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        placeholder.text = "Add a comment…"
        placeholder.isUserInteractionEnabled = false
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        field.addSubview(placeholder)
        sendButton = KitButton.make("", glyph: .send, variant: .action, height: .sm) { [weak self] in self?.send() }
        sendButton.accessibilityLabel = "Send the comment"
        sendButton.accessibilityIdentifier = "task-comment-send"
        sendButton.isEnabled = false
        refused.accessibilityIdentifier = "task-comment-refused"
        let box = UIView()
        field.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(field)
        box.addSubview(sendButton)
        NSLayoutConstraint.activate([
            placeholder.topAnchor.constraint(equalTo: field.topAnchor, constant: 10),
            placeholder.leadingAnchor.constraint(equalTo: field.leadingAnchor, constant: 13),
            field.topAnchor.constraint(equalTo: box.topAnchor),
            field.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            field.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            sendButton.trailingAnchor.constraint(equalTo: field.trailingAnchor, constant: -Space.space2),
            sendButton.bottomAnchor.constraint(equalTo: field.bottomAnchor, constant: -Space.space2),
        ])
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        for part in [TaskSheetController.sectionHead("Activity", count: nil, trailing: choice), streamStack, box, refused, hint] as [UIView] {
            stack.addArrangedSubview(part)
        }
        stack.setCustomSpacing(Space.space3, after: streamStack)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (part: TaskActivityPart, _: UITraitCollection) in part.paintField() }
        paintField()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskActivityPart is built in code")
    }

    func show(comments: [TaskComment], history: [TaskHistoryEvent]?, problem: String?, reaches: Reaches?) {
        guard comments != self.comments || history != self.history || problem != historyProblem || reaches != self.reaches else { return }
        self.comments = comments
        self.history = history
        historyProblem = problem
        self.reaches = reaches
        draw()
    }

    private func paintField() {
        field.layer.borderColor = (field.isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
    }

    // MARK: The stream

    private enum Line: Equatable {
        case comment(at: Double, who: String, text: String)
        case change(at: Double, who: String, text: String)

        var at: Double {
            switch self {
            case let .comment(at, _, _), let .change(at, _, _): at
            }
        }
    }

    private enum Piece { case one(Line), fold(String, [Line]) }

    private static func who(_ name: String) -> String { name == "you" ? "You" : name }

    /// The hub's commit verbs (`update priority, labels`, `tick td-2`), said as done.
    private static func done(_ what: String) -> String {
        let verbs = ["update": "changed", "tick": "ticked", "untick": "unticked", "add": "added", "reword": "reworded"]
        guard let match = what.prefixMatch(of: /(update|tick|untick|add|reword)\b/) else { return what }
        return (verbs[String(match.output.1)] ?? String(match.output.1)) + what[match.range.upperBound...]
    }

    /// A commit, said as what it did.
    private static func change(_ event: TaskHistoryEvent) -> String {
        let why = event.reason.map { ": \($0)" } ?? ""
        switch event.kind {
        case .created: return event.stage.map { "made the task in \(TaskWords.stage($0.to))" } ?? "made the task"
        case .moved:
            if let from = event.stage?.from { return "moved it from \(TaskWords.stage(from)) to \(TaskWords.stage(event.stage?.to ?? ""))\(why)" }
            return "moved it to \(TaskWords.stage(event.stage?.to ?? ""))\(why)"
        case .archived: return "archived it"
        case .unarchived: return "took it out of the archive"
        case .renamed: return "renamed its file"
        case .deleted: return "deleted its file"
        case .edited: return "edited the file by hand\(why)"
        default: return "\(done(event.what))\(why)"
        }
    }

    /// The stream in the history's own order: each comment stands where its
    /// `commented` commit does; comments past the last one follow it.
    private var stream: [Line] {
        var waiting = said
        var lines: [Line] = []
        for event in history ?? [] {
            if event.kind == .commented {
                if !waiting.isEmpty { lines.append(waiting.removeFirst()) }
            } else {
                lines.append(.change(at: event.at, who: Self.who(event.actor.name), text: Self.change(event)))
            }
        }
        return lines + waiting
    }

    private var said: [Line] {
        comments.map { .comment(at: $0.at, who: Self.who($0.author.name), text: $0.text) }
    }

    /// History runs longer than three fold; comments always stand.
    private static func pieces(_ lines: [Line]) -> [Piece] {
        var pieces: [Piece] = []
        var run: [Line] = []
        func flush() {
            if run.count > 3 { pieces.append(.fold("fold-\(run[0].at)", run)) } else { pieces += run.map(Piece.one) }
            run = []
        }
        for line in lines {
            if case .change = line { run.append(line) } else {
                flush()
                pieces.append(.one(line))
            }
        }
        flush()
        return pieces
    }

    private var now: Double { Date.now.timeIntervalSince1970 * 1000 }

    private func draw() {
        streamStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if only == 0, let historyProblem {
            let again = KitButton.make("Try again", variant: .outline, height: .xs) { [weak self] in self?.onReread() }
            let row = UIStackView(arrangedSubviews: [TaskSheetController.problemLabel(historyProblem), again])
            row.spacing = Space.space2
            row.alignment = .center
            streamStack.addArrangedSubview(row)
        }
        let pieces = only == 1 ? said.map(Piece.one) : Self.pieces(stream)
        if history == nil, historyProblem == nil, only == 0 {
            for share in [2.0 / 3, 0.5] {
                let bar = SkeletonView(height: 14)
                streamStack.addArrangedSubview(bar)
                bar.widthAnchor.constraint(equalTo: streamStack.widthAnchor, multiplier: share).isActive = true
            }
            streamStack.alignment = .leading
        } else if pieces.isEmpty {
            streamStack.alignment = .fill
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            none.text = only == 1 ? "No comments yet." : "Nothing has happened yet."
            none.accessibilityIdentifier = "task-activity-none"
            streamStack.addArrangedSubview(none)
        } else {
            streamStack.alignment = .fill
            var index = 0
            for piece in pieces {
                switch piece {
                case let .one(line):
                    streamStack.addArrangedSubview(row(line, index: index))
                    index += 1
                case let .fold(key, lines):
                    streamStack.addArrangedSubview(fold(key, lines, from: index))
                    index += lines.count
                }
            }
        }
        switch reaches {
        case let .live(session): hint.text = "\(session) is working on this task and reads your comment now."
        case .resumes: hint.text = "Your comment picks the work up again: its last session continues, or a new session starts on it."
        case nil: hint.text = nil
        }
        hint.isHidden = hint.text == nil
        onResize()
    }

    private func row(_ line: Line, index: Int) -> UIView {
        switch line {
        case let .comment(at, who, text):
            let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            name.text = who
            name.setContentHuggingPriority(.required, for: .horizontal)
            let when = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            when.text = RailAge.ago(at, now: now)
            let by = UIStackView(arrangedSubviews: [name, when, UIView()])
            by.spacing = Space.space2
            by.alignment = .firstBaseline
            let body = MarkdownDocumentView(message: true)
            body.setSource(text)
            let card = UIStackView(arrangedSubviews: [by, body])
            card.axis = .vertical
            card.spacing = Space.space1
            card.isLayoutMarginsRelativeArrangement = true
            card.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
            card.backgroundColor = Palette.surfaceRecess
            card.layer.cornerRadius = Radius.radiusMd
            card.layer.cornerCurve = .continuous
            card.isAccessibilityElement = true
            card.accessibilityLabel = "\(who): \(text)"
            card.accessibilityIdentifier = "task-activity-comment-\(index)"
            return card
        case let .change(at, who, text):
            let mark = GlyphView(.clock, size: Size.iconSm, tint: Palette.inkSubtle)
            let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            let said = NSMutableAttributedString(string: who, attributes: TypeScale.typeLabel.with(points: TypeScale.typeMeta.points).attributes(color: Palette.inkStrong))
            said.append(NSAttributedString(string: " \(text)", attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
            words.attributedText = said
            words.lineBreakMode = .byCharWrapping
            let when = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            when.text = RailAge.ago(at, now: now)
            when.setContentHuggingPriority(.required, for: .horizontal)
            when.setContentCompressionResistancePriority(.required, for: .horizontal)
            let row = UIStackView(arrangedSubviews: [mark, words, when])
            row.spacing = Space.space2
            row.alignment = .top
            row.isAccessibilityElement = true
            row.accessibilityLabel = "\(who) \(text)"
            row.accessibilityIdentifier = "task-activity-change-\(index)"
            return row
        }
    }

    /// "N changes" over its lines, open on a press.
    private func fold(_ key: String, _ lines: [Line], from index: Int) -> UIView {
        let open = openFolds.contains(key)
        let head = TaskPressRow(lines: 1)
        head.label.font = TypeScale.typeLabel.font
        head.label.textColor = Palette.inkMuted
        head.label.text = "\(open ? "▾" : "▸") \(lines.count) changes  \(RailAge.ago(lines[0].at, now: now)) – \(RailAge.ago(lines.last?.at ?? lines[0].at, now: now))"
        head.accessibilityValue = open ? "Open" : "Folded"
        head.accessibilityIdentifier = "task-activity-fold"
        head.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            if open { openFolds.remove(key) } else { openFolds.insert(key) }
            draw()
        }, for: .primaryActionTriggered)
        let stack = UIStackView(arrangedSubviews: [head])
        stack.axis = .vertical
        stack.spacing = Space.space2
        if open {
            let inner = UIStackView(arrangedSubviews: lines.enumerated().map { row($1, index: index + $0) })
            inner.axis = .vertical
            inner.spacing = Space.space2
            inner.isLayoutMarginsRelativeArrangement = true
            inner.directionalLayoutMargins.leading = Space.space5
            stack.addArrangedSubview(inner)
        }
        return stack
    }

    // MARK: The comment box

    /// The words a comment that did not go through was sent with, and its id:
    /// the hub may have written it, so the same words sent again go under the
    /// same id, which the hub answers with the comment it has.
    private var unsent: (text: String, id: String)?

    private func send() {
        let text = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        sending = true
        sendButton.isEnabled = false
        refused.isHidden = true
        let id = unsent.flatMap { $0.text == text ? $0.id : nil } ?? UUID().uuidString.lowercased()
        Task {
            do {
                try await onComment(text, id)
                unsent = nil
                field.text = ""
                placeholder.isHidden = false
            } catch {
                // The words stay in the field with the hub's reason over them.
                unsent = (text, id)
                refused.text = error.localizedDescription
                refused.isHidden = false
            }
            sending = false
            sendButton.isEnabled = !field.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            onResize()
        }
    }

    func textViewDidChange(_ textView: UITextView) {
        placeholder.isHidden = !textView.text.isEmpty
        sendButton.isEnabled = !sending && !textView.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        onResize()
    }

    func textViewDidBeginEditing(_: UITextView) { paintField() }
    func textViewDidEndEditing(_: UITextView) { paintField() }
}

/// A task's own fields (tasks/TaskFields.svelte): the front matter keys its
/// project uses, each a key and its value; a value is edited where it
/// stands, on a tap, a list as its items with commas between. "Add field"
/// takes a key and a value. The hub takes a key out when it is set to "".
final class TaskFieldsPart: UIView {
    /// Sets keys; "" takes its key out. Throws the hub's refusal.
    var onSave: ([String: TaskField]) async throws -> Void = { _ in }
    var onResize: () -> Void = {}

    private var fields: [(key: String, value: TaskField)] = []
    private var editing: String?
    private var adding = false
    private var problem: String?
    private let stack = UIStackView()
    private let editField = TaskSheetController.compactField("")
    private let newKey = TaskSheetController.compactField("name")
    private let newValue = TaskSheetController.compactField("value")

    init() {
        super.init(frame: .zero)
        accessibilityIdentifier = "task-fields"
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        newKey.font = TaskSheetController.mono.font
        newKey.autocapitalizationType = .none
        editField.addAction(UIAction { [weak self] _ in self?.commit() }, for: .editingDidEnd)
        editField.addAction(UIAction { [weak self] _ in self?.editField.resignFirstResponder() }, for: .primaryActionTriggered)
        newValue.addAction(UIAction { [weak self] _ in self?.add() }, for: .primaryActionTriggered)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskFieldsPart is built in code")
    }

    func show(_ fields: [(key: String, value: TaskField)]) {
        self.fields = fields
        draw()
    }

    private func draw() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        stack.addArrangedSubview(TaskSheetController.sectionHead("Fields", count: nil))
        for (key, value) in fields { stack.addArrangedSubview(row(key, value)) }
        if fields.isEmpty, !adding {
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            none.text = "No fields yet. A field is any key the project uses, like priority or due."
            stack.addArrangedSubview(none)
        }
        if adding {
            let add = KitButton.make("Add", variant: .outline, height: .xs) { [weak self] in self?.add() }
            let cancel = KitButton.make("Cancel", variant: .ghost, height: .xs) { [weak self] in
                self?.adding = false
                self?.draw()
            }
            newKey.widthAnchor.constraint(equalToConstant: 96).isActive = true
            let row = UIStackView(arrangedSubviews: [newKey, newValue, add, cancel])
            row.spacing = Space.space1
            row.alignment = .center
            stack.addArrangedSubview(row)
        } else {
            let add = KitButton.make("Add field", glyph: .plus, variant: .ghost, height: .xs) { [weak self] in
                guard let self else { return }
                adding = true
                newKey.text = ""
                newValue.text = ""
                draw()
                DispatchQueue.main.async { self.newKey.becomeFirstResponder() }
            }
            add.accessibilityIdentifier = "task-field-add"
            stack.addArrangedSubview(TaskSheetController.flush(add))
        }
        if let problem { stack.addArrangedSubview(TaskSheetController.problemLabel(problem)) }
        onResize()
    }

    /// The key in its 6rem mono column, the value beside it, its × at the end.
    private func row(_ key: String, _ value: TaskField) -> UIView {
        let name = KitLabel(TaskSheetController.mono, ink: Palette.inkMuted, lines: 0)
        name.text = key
        name.lineBreakMode = .byCharWrapping
        name.widthAnchor.constraint(equalToConstant: 96).isActive = true
        let line = UIStackView(arrangedSubviews: [name])
        line.spacing = Space.space2
        line.alignment = .center
        line.accessibilityIdentifier = "task-field-\(key)"
        if editing == key {
            line.addArrangedSubview(editField)
            return line
        }
        let shown = TaskPressRow(lines: 0)
        shown.label.text = value.said
        shown.inset(NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2, bottom: Space.space1, trailing: Space.space2))
        shown.accessibilityHint = "Edit \(key)"
        shown.addAction(UIAction { [weak self] _ in self?.edit(key, value) }, for: .primaryActionTriggered)
        let drop = KitButton.make("", glyph: .close, variant: .ghost, height: .xs) { [weak self] in self?.save([key: .one("")]) }
        drop.accessibilityLabel = "Remove \(key)"
        drop.setContentHuggingPriority(.required, for: .horizontal)
        line.addArrangedSubview(shown)
        line.addArrangedSubview(drop)
        return line
    }

    private func edit(_ key: String, _ value: TaskField) {
        editing = key
        editField.text = value.said
        editField.accessibilityLabel = key
        draw()
        DispatchQueue.main.async { [weak self] in self?.editField.becomeFirstResponder() }
    }

    private func commit() {
        guard let key = editing, let was = fields.first(where: { $0.key == key })?.value else { return }
        let text = (editField.text ?? "").trimmingCharacters(in: .whitespaces)
        editing = nil
        guard text != was.said else { return draw() }
        if case .list = was {
            let items = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            save([key: items.isEmpty ? .one("") : .list(items)])
        } else {
            save([key: .one(text)])
        }
    }

    private func add() {
        let key = (newKey.text ?? "").trimmingCharacters(in: .whitespaces).lowercased().replacing(/\s+/, with: "_")
        let value = (newValue.text ?? "").trimmingCharacters(in: .whitespaces)
        adding = false
        guard !key.isEmpty, !value.isEmpty else { return draw() }
        save([key: .one(value)])
    }

    private func save(_ change: [String: TaskField]) {
        problem = nil
        draw()
        Task {
            do { try await onSave(change) } catch {
                problem = error.localizedDescription
                draw()
            }
        }
    }
}

/// A task's labels, edited where they stand (tasks/TaskLabels.svelte): each
/// badge with its × (always shown to a finger), and "+ label", a one-line
/// field offering the project's other labels. Return adds.
final class TaskLabelsPart: UIView {
    /// Writes the whole set; throws the hub's refusal.
    var onChange: ([String]) async throws -> Void = { _ in }
    var onResize: () -> Void = {}

    private var labels: [String] = []
    private var known: [String] = []
    private var adding = false
    private var problem: String?
    private let stack = UIStackView()
    private let field = TaskSheetController.compactField("label")

    init() {
        super.init(frame: .zero)
        accessibilityIdentifier = "task-labels"
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        field.autocapitalizationType = .none
        field.accessibilityLabel = "New label"
        field.accessibilityIdentifier = "task-label-field"
        field.addAction(UIAction { [weak self] _ in self?.add(self?.field.text ?? "") }, for: .primaryActionTriggered)
        field.addAction(UIAction { [weak self] _ in
            guard let self, adding, (field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty else { return }
            adding = false
            draw()
        }, for: .editingDidEnd)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskLabelsPart is built in code")
    }

    func show(_ labels: [String], known: [String]) {
        guard labels != self.labels || known != self.known || stack.arrangedSubviews.isEmpty else { return }
        self.labels = labels
        self.known = known
        draw()
    }

    private func draw() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        stack.addArrangedSubview(TaskSheetController.sectionHead("Labels", count: nil))
        var items: [UIView] = labels.map { label in
            let badge = KitBadge(label, variant: .secondary)
            let remove = KitButton.make("", glyph: .close, variant: .ghost, height: .xs) { [weak self] in
                guard let self else { return }
                save(labels.filter { $0 != label })
            }
            remove.accessibilityLabel = "Remove the label \(label)"
            let pair = UIStackView(arrangedSubviews: [badge, remove])
            pair.alignment = .center
            pair.accessibilityIdentifier = "task-label-\(label)"
            return pair
        }
        if adding {
            field.widthAnchor.constraint(equalToConstant: 128).isActive = true
            items.append(field)
        } else {
            let add = KitButton.make("label", glyph: .plus, variant: .outline, height: .xs) { [weak self] in
                guard let self else { return }
                adding = true
                field.text = ""
                draw()
                DispatchQueue.main.async { self.field.becomeFirstResponder() }
            }
            add.accessibilityLabel = "Add a label"
            add.accessibilityIdentifier = "task-label-add"
            items.append(add)
        }
        stack.addArrangedSubview(WrapLayout(items, gap: Space.space1, rowGap: Space.space1, centred: true))
        // The project's other labels, offered as you add (the web's datalist).
        let offered = known.filter { !labels.contains($0) }
        if adding, !offered.isEmpty {
            let chips = offered.map { label in
                let chip = KitButton.make(label, variant: .outline, height: .xs) { [weak self] in self?.add(label) }
                chip.accessibilityHint = "Add this label"
                return chip as UIView
            }
            stack.addArrangedSubview(WrapLayout(chips, gap: Space.space1, rowGap: Space.space1))
        }
        if let problem { stack.addArrangedSubview(TaskSheetController.problemLabel(problem)) }
        onResize()
    }

    /// `labelOf`: trimmed, in lower case.
    private func add(_ raw: String) {
        let label = raw.trimmingCharacters(in: .whitespaces).lowercased()
        adding = false
        field.text = ""
        field.resignFirstResponder()
        guard !label.isEmpty, !labels.contains(label) else { return draw() }
        save(labels + [label])
    }

    private func save(_ next: [String]) {
        problem = nil
        Task {
            do { try await onChange(next) } catch {
                problem = error.localizedDescription
                draw()
            }
        }
    }
}
