import CawCoCore
import CawCoDesign
import CawCoTranscript
import SafariServices
import UIKit

/// A task's review (tasks/TaskReview.svelte): a message from the session
/// that worked it, then what that session presented. Three bands and the
/// decision; only the stage scrolls.
/// 1. The result: the session (its mark and title, and Open ↗), its words at
///    most three lines with More, the `Check:` line, and what it attached
///    (files and links), one wrapping row. A session that failed or was
///    stopped says so, in the hub's words.
/// 2. The stage: the artifact the session presented, drawn whole by the
///    preview's own renderer (PreviewController, inset). Nothing presented:
///    its words whole, with what to check as a list. A file's format is never drawn here.
/// 3. The decision, pinned: Approve → the next stage the moves allow you, and
///    Send back, whose note takes the bar's place with the stage still in
///    view. A session that failed or was stopped: Try again in Approve's place.
///
/// The web's two columns start at a 56rem review; the app's sheet is 42rem
/// at its widest, so the review stands in its one column there too.
final class TaskReviewView: UIView, UITextViewDelegate {
    struct Context {
        let hub: HubConnection
        let home: HomeModel
        let projectId: String
        /// The controller the stage's preview stands in, and links open over.
        weak var host: UIViewController?
        /// Moves the task; throws the hub's refusal.
        let move: (String) async throws -> TaskView
        /// The hub wrote the task.
        let changed: (TaskView) -> Void
        /// Opens a session, the sheet put away first.
        let openSession: (String) -> Void
    }

    private let context: Context
    private var task: TaskView?
    private var stages: StagesView?

    private let resultBand = UIStackView()
    private let stageBand = UIView()
    private let stageScroll = UIScrollView()
    private let stageWords = UIStackView()
    private let decideBand = UIStackView()
    private let stageRule = UIView()
    private let decideRule = UIView()
    private var decideBottom: NSLayoutConstraint!
    private var artifact: ArtifactStage?

    private var more = false
    private var note: String?
    private let noteField = UITextView()
    private let notePlaceholder = KitLabel(TypeScale.typeBody, ink: Palette.inkSubtle)
    private var approving = false
    private var sending = false
    private var retrying = false
    private var problem: String?

    init(context: Context) {
        self.context = context
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        accessibilityIdentifier = "task-review"
        resultBand.axis = .vertical
        resultBand.spacing = Space.space2
        resultBand.accessibilityIdentifier = "task-band-result"
        stageBand.accessibilityIdentifier = "task-band-stage"
        stageWords.axis = .vertical
        stageWords.spacing = Space.space2
        decideBand.axis = .vertical
        decideBand.spacing = Space.space2
        decideBand.accessibilityIdentifier = "task-band-decide"
        for rule in [stageRule, decideRule] {
            rule.backgroundColor = Palette.borderHairline
            rule.translatesAutoresizingMaskIntoConstraints = false
        }
        stageScroll.translatesAutoresizingMaskIntoConstraints = false
        stageScroll.alwaysBounceVertical = true
        stageWords.translatesAutoresizingMaskIntoConstraints = false
        stageScroll.addSubview(stageWords)
        stageBand.addSubview(stageScroll)
        stageBand.translatesAutoresizingMaskIntoConstraints = false
        // The stage takes what the bands leave (`minmax(0, 1fr)`); the result and the decision keep their own height.
        stageBand.setContentHuggingPriority(.init(1), for: .vertical)
        stageBand.setContentCompressionResistancePriority(.init(1), for: .vertical)
        for band in [resultBand, decideBand] {
            band.setContentCompressionResistancePriority(.required, for: .vertical)
            band.setContentHuggingPriority(.required, for: .vertical)
        }
        for band in [resultBand, decideBand] { band.translatesAutoresizingMaskIntoConstraints = false }
        for part in [resultBand, stageRule, stageBand, decideRule, decideBand] as [UIView] { addSubview(part) }
        let inline = Space.space5
        decideBottom = decideBand.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3)
        NSLayoutConstraint.activate([
            resultBand.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            resultBand.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inline),
            resultBand.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inline),
            stageRule.topAnchor.constraint(equalTo: resultBand.bottomAnchor, constant: Space.space3),
            stageRule.leadingAnchor.constraint(equalTo: leadingAnchor),
            stageRule.trailingAnchor.constraint(equalTo: trailingAnchor),
            stageRule.heightAnchor.constraint(equalToConstant: 1),
            stageBand.topAnchor.constraint(equalTo: stageRule.bottomAnchor),
            stageBand.leadingAnchor.constraint(equalTo: leadingAnchor),
            stageBand.trailingAnchor.constraint(equalTo: trailingAnchor),
            decideRule.topAnchor.constraint(equalTo: stageBand.bottomAnchor),
            decideRule.leadingAnchor.constraint(equalTo: leadingAnchor),
            decideRule.trailingAnchor.constraint(equalTo: trailingAnchor),
            decideRule.heightAnchor.constraint(equalToConstant: 1),
            decideBand.topAnchor.constraint(equalTo: decideRule.bottomAnchor, constant: Space.space3),
            decideBand.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inline),
            decideBand.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inline),
            decideBottom,
            stageScroll.topAnchor.constraint(equalTo: stageBand.topAnchor),
            stageScroll.bottomAnchor.constraint(equalTo: stageBand.bottomAnchor),
            stageScroll.leadingAnchor.constraint(equalTo: stageBand.leadingAnchor),
            stageScroll.trailingAnchor.constraint(equalTo: stageBand.trailingAnchor),
            stageWords.topAnchor.constraint(equalTo: stageScroll.contentLayoutGuide.topAnchor, constant: Space.space3),
            stageWords.bottomAnchor.constraint(equalTo: stageScroll.contentLayoutGuide.bottomAnchor, constant: -Space.space3),
            stageWords.leadingAnchor.constraint(equalTo: stageScroll.frameLayoutGuide.leadingAnchor, constant: inline),
            stageWords.trailingAnchor.constraint(equalTo: stageScroll.frameLayoutGuide.trailingAnchor, constant: -inline),
        ])
        noteField.font = TypeScale.typeBody.font
        noteField.textColor = Palette.inkStrong
        noteField.backgroundColor = Palette.surfaceRaised
        noteField.isScrollEnabled = false
        noteField.layer.cornerRadius = Radius.radiusMd
        noteField.layer.cornerCurve = .continuous
        noteField.layer.borderWidth = 1
        noteField.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        noteField.accessibilityLabel = "What should change"
        noteField.accessibilityIdentifier = "task-send-back-note"
        noteField.delegate = self
        noteField.heightAnchor.constraint(greaterThanOrEqualToConstant: 64).isActive = true
        notePlaceholder.text = "What should change"
        notePlaceholder.isUserInteractionEnabled = false
        notePlaceholder.translatesAutoresizingMaskIntoConstraints = false
        noteField.addSubview(notePlaceholder)
        NSLayoutConstraint.activate([
            notePlaceholder.topAnchor.constraint(equalTo: noteField.topAnchor, constant: 8),
            notePlaceholder.leadingAnchor.constraint(equalTo: noteField.leadingAnchor, constant: 13),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TaskReviewView, _: UITraitCollection) in view.paintNote() }
        paintNote()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskReviewView is built in code")
    }

    /// The decision band stands clear of the home indicator (`max(space-3, safe area)`).
    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        decideBottom.constant = -max(Space.space3, safeAreaInsets.bottom)
    }

    private func paintNote() {
        noteField.layer.borderColor = (noteField.isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
    }

    // MARK: What it reads

    private var newest: TaskAttempt? { task?.attempts.first }

    /// The newest session failed or was stopped, and none runs since.
    private var ended: Bool {
        guard let task, let newest else { return false }
        return !task.liveAttempt && (newest.state == .failed || newest.state == .cancelled)
    }

    private struct Shown {
        let from: TaskAttempt?
        let summary: String
        let check: [String]
        let presented: Handed?
        let attached: [Handed]
        let whole: String
    }

    private func shown(_ task: TaskView) -> Shown {
        let review = TaskWords.review(of: task)
        let from = ended ? newest : (review?.attempt ?? newest)
        let result = ended ? newest?.result : nil
        let handed = ended ? (result?.artifacts.compactMap(Handed.init) ?? []) : (review?.handed ?? [])
        let drawn = handed.filter { if case .artifact = $0 { true } else { false } }
        let presented = drawn.first(where: \.primary) ?? drawn.first
        return Shown(from: from,
                     summary: ended ? result?.summary ?? "" : review?.summary ?? "",
                     check: ended ? result?.check ?? [] : review?.check ?? [],
                     presented: presented,
                     attached: handed.filter { $0 != presented },
                     whole: ended ? result?.summary ?? "" : review?.whole ?? "")
    }

    // MARK: Drawing

    func show(_ task: TaskView, stages: StagesView?) {
        if self.task?.id != task.id {
            more = false
            note = nil
            problem = nil
        }
        self.task = task
        self.stages = stages
        let shown = shown(task)
        drawResult(task, shown)
        drawStage(shown)
        drawDecide(task)
    }

    private func drawResult(_ task: TaskView, _ shown: Shown) {
        resultBand.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let wordsStage = shown.presented == nil && !shown.whole.isEmpty
        if let from = shown.from {
            resultBand.addArrangedSubview(sessionRow(from))
            if ended, let how = newest?.endedHow {
                let line = KitLabel(TypeScale.typeBody, ink: newest?.state == .failed ? Palette.statusFailInk : Palette.inkMuted, lines: 0)
                line.lineBreakMode = .byCharWrapping
                line.text = how
                line.accessibilityIdentifier = "task-review-ended"
                resultBand.addArrangedSubview(line)
            }
        }
        if !shown.summary.isEmpty, !wordsStage {
            resultBand.addArrangedSubview(ReviewWords(summary: shown.summary, check: shown.check, open: more) { [weak self] open in
                self?.more = open
            })
        }
        if !shown.attached.isEmpty {
            let links = shown.attached.map { one -> UIView in
                let button = AttachmentButton(one)
                button.addAction(UIAction { [weak self] _ in self?.open(one) }, for: .primaryActionTriggered)
                return button
            }
            let row = WrapLayout(links, gap: Space.space3, rowGap: Space.space1)
            row.accessibilityIdentifier = "task-review-attachments"
            resultBand.addArrangedSubview(row)
        }
        if resultBand.arrangedSubviews.isEmpty {
            resultBand.addArrangedSubview(UIView())
        }
    }

    /// The session: its mark and title, Failed or Stopped when it ended so, and Open ↗.
    private func sessionRow(_ from: TaskAttempt) -> UIView {
        let row = context.hub.fleet.byId[from.instanceId]
        let mark = SessionMarkView()
        let status: MarkStatus = ended && newest?.state == .failed ? .fail : HomeViewController.status(row, home: context.home, done: true)
        mark.configure(id: from.instanceId, place: row?.cwd ?? from.instanceId, status: status)
        mark.isUserInteractionEnabled = false
        mark.setContentHuggingPriority(.required, for: .horizontal)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = TaskSheetController.sessionName(from.instanceId, hub: context.hub)
        name.lineBreakMode = .byTruncatingTail
        name.accessibilityIdentifier = "task-review-session"
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        var items: [UIView] = [mark, name]
        if ended, let newest {
            let badge = newest.state == .failed ? KitBadge("Failed", variant: .fail, glyph: .failed) : KitBadge("Stopped", variant: .secondary)
            badge.accessibilityIdentifier = "task-review-ended-badge"
            badge.setContentHuggingPriority(.required, for: .horizontal)
            items.append(badge)
        }
        items.append(UIView())
        let open = KitButton.make("Open", glyph: .external, variant: .ghost, height: .xs) { [weak self] in
            self?.context.openSession(from.instanceId)
        }
        open.accessibilityLabel = "Open its session"
        open.accessibilityIdentifier = "task-review-open"
        open.setContentHuggingPriority(.required, for: .horizontal)
        open.setContentCompressionResistancePriority(.required, for: .horizontal)
        items.append(open)
        let line = UIStackView(arrangedSubviews: items)
        line.spacing = Space.space2
        line.alignment = .center
        return line
    }

    private func drawStage(_ shown: Shown) {
        if case let .artifact(id, _, _) = shown.presented {
            stageScroll.isHidden = true
            if artifact?.artifactId != id {
                artifact?.leave()
                let stage = ArtifactStage(artifactId: id, hub: context.hub, host: context.host)
                stage.translatesAutoresizingMaskIntoConstraints = false
                stageBand.addSubview(stage)
                NSLayoutConstraint.activate([
                    stage.topAnchor.constraint(equalTo: stageBand.topAnchor, constant: Space.space3),
                    stage.bottomAnchor.constraint(equalTo: stageBand.bottomAnchor, constant: -Space.space3),
                    stage.leadingAnchor.constraint(equalTo: stageBand.leadingAnchor, constant: Space.space5),
                    stage.trailingAnchor.constraint(equalTo: stageBand.trailingAnchor, constant: -Space.space5),
                ])
                artifact = stage
            }
            return
        }
        artifact?.leave()
        artifact = nil
        stageScroll.isHidden = false
        stageWords.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if !shown.whole.isEmpty {
            let words = MarkdownDocumentView(message: true)
            words.setSource(shown.whole)
            words.accessibilityIdentifier = "task-review-words"
            stageWords.addArrangedSubview(words)
            if !shown.check.isEmpty {
                let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
                head.text = "Check"
                head.accessibilityTraits = .header
                stageWords.setCustomSpacing(Space.space2 * 2, after: words)
                stageWords.addArrangedSubview(head)
                let list = MarkdownDocumentView(message: true)
                list.setSource(shown.check.map { "- \($0)" }.joined(separator: "\n"))
                list.accessibilityIdentifier = "task-review-check"
                stageWords.addArrangedSubview(list)
            }
        } else {
            let none = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
            none.text = !shown.attached.isEmpty ? "Nothing presented, only its files." : shown.from != nil ? "Nothing handed in." : "No session has worked on it."
            none.accessibilityIdentifier = "task-review-none"
            stageWords.addArrangedSubview(none)
        }
    }

    private var approveTo: TaskStage? { task.flatMap { task in stages.flatMap { TaskWords.approveTarget($0, from: task.stage) } } }
    private var backTo: TaskStage? { task.flatMap { task in stages.flatMap { TaskWords.sendBackTarget($0, from: task.stage) } } }

    private func drawDecide(_ task: TaskView) {
        decideBand.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let deciding = task.kind == .you
        let open = ended || (deciding && (approveTo != nil || backTo != nil))
        decideBand.isHidden = !open
        decideRule.isHidden = !open
        decideBottom.isActive = open
        guard open else { return }
        if let problem { decideBand.addArrangedSubview(TaskSheetController.problemLabel(problem)) }
        if note == nil || backTo == nil {
            var acts: [UIView] = []
            if ended {
                let again = KitButton.make(retrying ? "Starting…" : "Try again", variant: .action, height: .sm) { [weak self] in self?.tryAgain() }
                again.isEnabled = !retrying
                again.accessibilityIdentifier = "task-try-again"
                acts.append(again)
            } else if deciding, let approveTo {
                let approve = KitButton.make(approving ? "Approving…" : "Approve → \(TaskWords.stage(approveTo.name))", variant: .action, height: .sm) { [weak self] in
                    self?.approve()
                }
                approve.isEnabled = !approving
                approve.accessibilityIdentifier = "task-approve"
                acts.append(approve)
            }
            if deciding, backTo != nil {
                let back = KitButton.make("Send back", variant: .outline, height: .sm) { [weak self] in self?.openNote() }
                back.isEnabled = !approving && !retrying
                back.accessibilityIdentifier = "task-send-back"
                acts.append(back)
            }
            decideBand.addArrangedSubview(Self.acts(acts))
            return
        }
        guard let backTo else { return }
        noteField.text = note
        notePlaceholder.isHidden = !(note ?? "").isEmpty
        decideBand.addArrangedSubview(noteField)
        let goes = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        goes.text = "Goes on the task as your comment."
        decideBand.addArrangedSubview(goes)
        let typed = !(note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let send = KitButton.make(sending ? "Sending back…" : "Send back → \(TaskWords.stage(backTo.name))", variant: .action, height: .sm) { [weak self] in
            self?.sendBack()
        }
        send.isEnabled = typed && !sending
        send.accessibilityIdentifier = "task-send-back-send"
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in
            self?.note = nil
            self?.noteField.resignFirstResponder()
            self?.redraw()
        }
        cancel.isEnabled = !sending
        decideBand.addArrangedSubview(Self.acts([send, cancel]))
    }

    /// `.acts`: the buttons at their own size in one row from its start (a
    /// WrapLayout set them at their words' height, 17pt, under the kit's).
    private static func acts(_ buttons: [UIView]) -> UIView {
        for button in buttons { button.setContentHuggingPriority(.required, for: .horizontal) }
        let row = UIStackView(arrangedSubviews: buttons + [UIView()])
        row.spacing = Space.space2
        row.alignment = .center
        return row
    }

    private func redraw() {
        guard let task else { return }
        show(task, stages: stages)
    }

    // MARK: Acting

    private func approve() {
        guard let approveTo, !approving else { return }
        approving = true
        problem = nil
        redraw()
        Task {
            do { _ = try await context.move(approveTo.name) } catch { problem = error.localizedDescription }
            approving = false
            redraw()
        }
    }

    /// A new session on the task, as the board's Retry starts one (the hub's `retry`).
    private func tryAgain() {
        guard let task, !retrying else { return }
        retrying = true
        problem = nil
        redraw()
        Task {
            do {
                let api = try ProjectTasks(hub: context.hub, projectId: context.projectId)
                try await api.retry(task.id)
                context.changed(try await api.read(task.id))
            } catch { problem = error.localizedDescription }
            retrying = false
            redraw()
        }
    }

    private func openNote() {
        note = ""
        redraw()
        DispatchQueue.main.async { [weak self] in self?.noteField.becomeFirstResponder() }
    }

    /// The note a Send back that did not go through carried, and its comment's
    /// id: the same note again goes under it, so the hub writes it once.
    private var noteSent: (text: String, id: String)?

    /// Your note goes on the task as your comment, then the task goes back.
    private func sendBack() {
        guard let task, let backTo, let text = note?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, !sending else { return }
        sending = true
        problem = nil
        redraw()
        let id = noteSent.flatMap { $0.text == text ? $0.id : nil } ?? UUID().uuidString.lowercased()
        noteSent = (text, id)
        Task {
            do {
                let api = try ProjectTasks(hub: context.hub, projectId: context.projectId)
                context.changed(try await api.comment(task.id, text: text, id: id))
                _ = try await context.move(backTo.name)
                noteSent = nil
                note = nil
                noteField.resignFirstResponder()
            } catch { problem = error.localizedDescription }
            sending = false
            redraw()
        }
    }

    func textViewDidChange(_ textView: UITextView) {
        note = textView.text
        notePlaceholder.isHidden = !textView.text.isEmpty
        // Send back wakes as the note gets words.
        if let send = decideBand.firstDescendant(identified: "task-send-back-send") as? UIButton {
            send.isEnabled = !textView.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending
        }
    }

    func textViewDidBeginEditing(_: UITextView) { paintNote() }
    func textViewDidEndEditing(_: UITextView) { paintNote() }

    /// What it attached, where the web's link opens it: a link or a file in
    /// Safari over the sheet (`target="_blank"`); an artifact in its session.
    private func open(_ one: Handed) {
        guard let task else { return }
        let hub = context.hub
        switch one {
        case let .link(url, _, _):
            present(URL(string: url))
        case let .file(path, _, _, _):
            guard let address = hub.address else { return }
            var url = address.appending(path: "api/projects").appending(path: context.projectId)
            if task.outputs.contains(path) {
                url = url.appending(path: "tasks").appending(path: task.id).appending(path: "outputs/file")
                url.append(queryItems: [URLQueryItem(name: "name", value: path)])
            } else {
                url = url.appending(path: "folder/raw")
                url.append(queryItems: [URLQueryItem(name: "path", value: path)])
            }
            present(url)
        case let .artifact(id, _, _):
            Task {
                guard let found = try? await hub.findArtifact(id) else { return }
                if !found.shown { hub.openArtifact(id, in: found.instanceId) }
                context.openSession(found.instanceId)
            }
        }
    }

    private func present(_ url: URL?) {
        guard let url, let host = context.host, ["http", "https"].contains(url.scheme ?? "") else { return }
        host.present(SFSafariViewController(url: url), animated: true)
    }
}

/// The summary at most two lines and the check at most one until More
/// (`.words`): the check is never the line clipped away; More stands at the
/// end of the last line, and only when something is clipped.
private final class ReviewWords: UIStackView {
    private let summaryLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 2)
    private let checkLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 1)
    private var moreButton: UIButton!
    private var open: Bool
    private let onToggle: (Bool) -> Void

    init(summary: String, check: [String], open: Bool, onToggle: @escaping (Bool) -> Void) {
        self.open = open
        self.onToggle = onToggle
        super.init(frame: .zero)
        axis = .vertical
        accessibilityIdentifier = "task-review-words"
        summaryLabel.text = summary
        summaryLabel.wrap = .pretty
        summaryLabel.accessibilityIdentifier = "task-review-summary"
        addArrangedSubview(summaryLabel)
        let checked = NSMutableAttributedString(string: "Check: ", attributes: TypeScale.typeBody.withWeight(TypeScale.weightStrong).attributes(color: Palette.inkStrong))
        checked.append(NSAttributedString(string: check.joined(separator: " · "), attributes: TypeScale.typeBody.attributes(color: Palette.inkMuted)))
        checkLabel.attributedText = checked
        checkLabel.isHidden = check.isEmpty
        checkLabel.accessibilityIdentifier = "task-review-check-line"
        moreButton = KitButton.make(open ? "Less" : "More", variant: .ghost, height: .xs) { [weak self] in self?.toggle() }
        moreButton.accessibilityIdentifier = "task-review-more"
        moreButton.setContentHuggingPriority(.required, for: .horizontal)
        moreButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        let tail = UIStackView(arrangedSubviews: [checkLabel, UIView(), moreButton])
        tail.spacing = Space.space2
        tail.alignment = .firstBaseline
        addArrangedSubview(tail)
        apply()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ReviewWords is built in code")
    }

    private func toggle() {
        open.toggle()
        onToggle(open)
        apply()
        KitButton.setTitle(open ? "Less" : "More", of: moreButton, variant: .ghost, height: .xs)
    }

    private func apply() {
        summaryLabel.numberOfLines = open ? 0 : 2
        checkLabel.numberOfLines = open ? 0 : 1
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Clipped: the summary past its two lines, or the check past its one.
        let clipped = [summaryLabel, checkLabel].contains { label in
            guard !label.isHidden, label.bounds.width > 0 else { return false }
            let whole = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
            return whole > label.bounds.height + 1
        }
        let shows = clipped || open
        if moreButton.isHidden == shows { moreButton.isHidden = !shows }
    }
}

/// One thing it attached (`.attachment`): its glyph and name in muted label
/// type, a link that opens it; 44pt tall to a finger.
private final class AttachmentButton: UIControl {
    init(_ one: Handed) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let glyph: Glyph = switch one {
        case .link: .link
        case .artifact: .window
        case .file: .document
        }
        let icon = GlyphView(glyph, size: Size.iconSm, tint: Palette.inkMuted)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        name.lineBreakMode = .byTruncatingTail
        if case let .link(url, _, _) = one {
            name.text = "\(one.name) · \(URL(string: url)?.host() ?? url)"
        } else {
            name.text = one.name
        }
        let row = UIStackView(arrangedSubviews: [icon, name])
        row.spacing = Space.space1
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .link
        accessibilityLabel = name.text
        accessibilityIdentifier = "task-attachment-\(one.name)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AttachmentButton is built in code")
    }

    override var isHighlighted: Bool {
        didSet { alpha = isHighlighted ? 0.6 : 1 }
    }

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }
}

/// What a session presented (tasks/stage/ArtifactStage.svelte): drawn by the
/// preview's own renderer, inset. The hub serves a session one artifact at a
/// time, so it is put on its session's panel first, and put back should the
/// panel move on to another.
private final class ArtifactStage: UIView {
    let artifactId: String
    private let hub: HubConnection
    private weak var host: UIViewController?
    private var preview: PreviewController?
    private var instanceId: String?
    private let cover = UIView()
    private let problem = TaskSheetController.problemLabel()
    private var watching = true

    init(artifactId: String, hub: HubConnection, host: UIViewController?) {
        self.artifactId = artifactId
        self.hub = hub
        self.host = host
        super.init(frame: .zero)
        accessibilityIdentifier = "task-review-artifact"
        cover.backgroundColor = Palette.surfaceRecess
        cover.layer.cornerRadius = Radius.radiusSm
        cover.layer.borderWidth = 1
        cover.layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
        pinEdges(cover)
        pinEdges(problem)
        Task { await find() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ArtifactStage is built in code")
    }

    private func find() async {
        do {
            let found = try await hub.findArtifact(artifactId)
            instanceId = found.instanceId
            if !found.shown { hub.openArtifact(artifactId, in: found.instanceId) }
            stand(found.instanceId)
            watch()
        } catch {
            problem.text = error.localizedDescription
            problem.isHidden = false
            cover.isHidden = true
        }
    }

    private func stand(_ instanceId: String) {
        guard preview == nil, let host else { return }
        let controller = PreviewController(hub: hub, instanceId: instanceId)
        host.addChild(controller)
        controller.standsInset()
        pinEdges(controller.view)
        controller.didMove(toParent: host)
        preview = controller
        cover.isHidden = true
    }

    /// Its panel moved on to another artifact: this one is brought back to it.
    private func watch() {
        guard watching, let instanceId else { return }
        let showing = withObservationTracking {
            hub.previews.byInstance[instanceId]?.artifact.id
        } onChange: { [weak self] in
            DispatchQueue.main.async { self?.watch() }
        }
        if let showing, showing != artifactId { hub.openArtifact(artifactId, in: instanceId) }
    }

    /// The review drew something else: the preview goes with it.
    func leave() {
        watching = false
        preview?.willMove(toParent: nil)
        preview?.view.removeFromSuperview()
        preview?.removeFromParent()
        preview = nil
        removeFromSuperview()
    }

    private func pinEdges(_ view: UIView) {
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: topAnchor),
            view.bottomAnchor.constraint(equalTo: bottomAnchor),
            view.leadingAnchor.constraint(equalTo: leadingAnchor),
            view.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
    }
}

extension UIView {
    /// The first view under this one with that accessibility identifier.
    func firstDescendant(identified id: String) -> UIView? {
        for sub in subviews {
            if sub.accessibilityIdentifier == id { return sub }
            if let found = sub.firstDescendant(identified: id) { return found }
        }
        return nil
    }
}
