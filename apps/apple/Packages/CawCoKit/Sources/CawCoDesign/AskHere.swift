import UIKit

/// A question standing in the page, under the control that asked it
/// (AskHere.svelte and ask-here.svelte.ts; DESIGN.md, The Open Page Rule):
/// no scrim and no hold, the rest of the screen live. It unfolds where it
/// was asked as a raised tile (the title in the label role, what it does in
/// meta, what it reaches named as the rail names it), and VoiceOver and the
/// keyboard land on its Cancel. Its confirm runs the work and stays pending
/// until it ends; a refusal stays under the question in the refuser's
/// words, the button the way to try again, and only work that went puts it
/// away. Cancel puts it away; once the work is sent it can't be called
/// back, so Cancel waits. One question at a time: a new ask takes the place
/// of the last.
public final class AskHere: UIView {
    public struct Request {
        public let title: String
        /// The consequence, in plain words; each string a paragraph.
        public let body: [String]
        public let confirmLabel: String
        public let pendingLabel: String?
        public let cancelLabel: String
        public let destructive: Bool
        /// A grant wider than the one asked for (The Consequential Grant
        /// Rule): the confirm in the grant variant, behind the shield.
        public let grant: Bool
        /// What the action reaches, named, read again on each `refresh()`:
        /// only for a heavy action that reaches several things.
        public let items: (@MainActor () -> [AskItem])?
        /// The work; a throw is a refusal, its description said under the question.
        public let run: () async throws -> Void

        public init(title: String, body: [String] = [], confirmLabel: String, pendingLabel: String? = nil,
                    cancelLabel: String = "Cancel", destructive: Bool = false, grant: Bool = false,
                    items: (@MainActor () -> [AskItem])? = nil, run: @escaping () async throws -> Void) {
            self.title = title
            self.body = body
            self.confirmLabel = confirmLabel
            self.pendingLabel = pendingLabel
            self.cancelLabel = cancelLabel
            self.destructive = destructive
            self.grant = grant
            self.items = items
            self.run = run
        }

        fileprivate var variant: KitButton.Variant { grant ? .grant : destructive ? .destructive : .action }
    }

    /// The question standing now, or nil.
    public private(set) var asked: Request?
    /// Its work is running: Cancel waits.
    public private(set) var running = false
    /// It unfolded, folded or changed its height: the host keeps it in view.
    public var onResize: () -> Void = {}

    private let tile = UIView()
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let paragraphs = UIStackView()
    /// AskItems.svelte: what the action reaches.
    private let reach = UIStackView()
    /// RowFault.svelte's reason: the refuser's words in the fail status's ink.
    private let failure = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let actions = UIStackView()
    private var cancel: UIButton!
    private var confirm: UIButton?
    private var reached: [AskItem] = []
    /// Which question stands: work that ends after its question was replaced touches nothing.
    private var question = 0

    public init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isHidden = true
        // `.tile`: the raised surface on a hairline at `--radius-md`, `--shadow-raised`, `space-3` in.
        tile.translatesAutoresizingMaskIntoConstraints = false
        tile.backgroundColor = Palette.surfaceRaised
        tile.layer.cornerRadius = Radius.radiusMd
        tile.layer.cornerCurve = .continuous
        tile.layer.borderWidth = 1
        tile.boxShadow = Shadow.shadowRaised
        titleLabel.wrap = .balance
        titleLabel.accessibilityTraits = .header
        paragraphs.axis = .vertical
        paragraphs.spacing = Space.space2
        reach.axis = .vertical
        reach.spacing = Space.space1
        reach.accessibilityLabel = "What this reaches"
        failure.wrap = .pretty
        failure.isHidden = true
        cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in _ = self?.escape() }
        actions.addArrangedSubview(UIView())
        actions.addArrangedSubview(cancel)
        actions.spacing = Space.space2
        actions.alignment = .center
        let column = UIStackView(arrangedSubviews: [titleLabel, paragraphs, reach, failure, actions])
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(column)
        addSubview(tile)
        NSLayoutConstraint.activate([
            // `.ask-here`: `space-1` above and below, in the page's flow.
            tile.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            tile.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            tile.leadingAnchor.constraint(equalTo: leadingAnchor),
            tile.trailingAnchor.constraint(equalTo: trailingAnchor),
            column.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
            column.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space3),
        ])
        shouldGroupAccessibilityChildren = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (ask: AskHere, _: UITraitCollection) in ask.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("AskHere is built in code") }

    /// Asks `request` here, in place of any question standing.
    public func ask(_ request: Request) {
        question += 1
        asked = request
        running = false
        titleLabel.text = request.title
        paragraphs.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for text in request.body {
            let paragraph = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            paragraph.wrap = .pretty
            paragraph.text = text
            paragraphs.addArrangedSubview(paragraph)
        }
        paragraphs.isHidden = request.body.isEmpty
        reached = []
        drawReach(request.items?() ?? [])
        failure.text = nil
        failure.isHidden = true
        KitButton.setTitle(request.cancelLabel, of: cancel, variant: .ghost, height: .sm)
        // The confirm in the question's own variant: a button keeps the paint it was made with.
        confirm?.removeFromSuperview()
        let confirm = KitButton.make(request.confirmLabel, glyph: request.grant ? .shield : nil, variant: request.variant, height: .sm) { [weak self] in
            self?.accept()
        }
        actions.addArrangedSubview(confirm)
        self.confirm = confirm
        cancel.isEnabled = true
        accessibilityLabel = request.title
        unfold(true)
        // In hand as it opens: VoiceOver and the keyboard's focus on Cancel.
        UIAccessibility.post(notification: .layoutChanged, argument: cancel)
        if let focus = UIFocusSystem.focusSystem(for: self) { focus.requestFocusUpdate(to: cancel) }
    }

    /// Reads what the question reaches again (AskItems is read live): a
    /// session that ends while it stands shows it.
    public func refresh() {
        guard let asked else { return }
        drawReach(asked.items?() ?? [])
    }

    /// The question ends unanswered (ask-here.svelte.ts `dismiss`); work
    /// already sent runs on, unheard here.
    public func dismiss() {
        guard asked != nil else { return }
        asked = nil
        running = false
        unfold(false)
    }

    /// Escape (AskHere.svelte `arrive`): the question goes unless its work
    /// is already sent; false when there was nothing here to put away.
    public func escape() -> Bool {
        guard asked != nil, !running else { return false }
        dismiss()
        return true
    }

    /// The confirm: the work runs, the button pending; the question ends once
    /// it went, unless it was put away or replaced meanwhile.
    private func accept() {
        guard let request = asked, !running else { return }
        running = true
        let mine = question
        cancel.isEnabled = false
        pending(request, true)
        failure.isHidden = true
        Task { [weak self] in
            do {
                try await request.run()
                guard let self, running, question == mine else { return }
                running = false
                pending(request, false)
                asked = nil
                unfold(false)
            } catch {
                guard let self, running, question == mine else { return }
                running = false
                cancel.isEnabled = true
                pending(request, false)
                failure.text = error.localizedDescription
                failure.isHidden = false
                onResize()
                UIAccessibility.post(notification: .announcement, argument: failure.text)
            }
        }
    }

    private func pending(_ request: Request, _ on: Bool) {
        guard let confirm else { return }
        KitButton.setTitle(on ? request.pendingLabel ?? request.confirmLabel : request.confirmLabel, of: confirm, variant: request.variant, height: .sm)
        confirm.configuration?.showsActivityIndicator = on
        confirm.isUserInteractionEnabled = !on
        onResize()
    }

    /// What the action reaches, as the rail nests it: a delegate under its lead.
    private func drawReach(_ items: [AskItem]) {
        guard items != reached || reach.arrangedSubviews.isEmpty != items.isEmpty else { return }
        reached = items
        reach.arrangedSubviews.forEach { $0.removeFromSuperview() }
        reach.isHidden = items.isEmpty
        let known = Set(items.map(\.id))
        let parent = Dictionary(items.map { ($0.id, $0.parentId) }, uniquingKeysWith: { first, _ in first })
        func level(_ item: AskItem) -> Int {
            var at = 0
            var next = item.parentId
            while let id = next, known.contains(id), at < 8 {
                at += 1
                next = parent[id] ?? nil
            }
            return at
        }
        func place(under lead: String?) {
            for item in items where lead == nil ? !(item.parentId.map(known.contains) ?? false) : item.parentId == lead {
                reach.addArrangedSubview(AskItemRow(item, level: level(item)))
                place(under: item.id)
            }
        }
        place(under: nil)
        if !isHidden { onResize() }
    }

    /// Opens or shuts in place over `durControl`; with Reduce Motion, at once.
    private func unfold(_ open: Bool) {
        guard isHidden == open else { return }
        let change: @MainActor @Sendable () -> Void = {
            self.isHidden = !open
            self.alpha = open ? 1 : 0
            self.onResize()
        }
        if UIAccessibility.isReduceMotionEnabled || window == nil {
            change()
        } else {
            if open { alpha = 0 }
            Motion.easeOut.animator(Motion.durControl, animations: change).startAnimation()
        }
    }

    private func paint() {
        tile.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    #if DEBUG
    /// What a probe taps: Cancel and the confirm.
    public var probeControls: (cancel: UIView, confirm: UIView?) { (cancel, confirm) }
    /// What it says now: its title, its body and a refusal.
    public var probeWords: String {
        let body = paragraphs.arrangedSubviews.compactMap { ($0 as? KitLabel)?.text }.joined(separator: " ")
        return "title=\(titleLabel.text ?? "") body=\(body) failure=\(failure.isHidden ? "none" : failure.text ?? "")"
    }

    /// What it draws now, read off its views: the title, the confirm's label
    /// and whether it spins, Cancel's state, the refusal, and what it names.
    public var probeState: String {
        guard asked != nil, !isHidden, window != nil else { return "none on screen" }
        let label = confirm?.configuration?.attributedTitle.map { String($0.characters) } ?? ""
        let spins = confirm?.configuration?.showsActivityIndicator == true
        let names = reach.arrangedSubviews.compactMap(\.accessibilityLabel)
        return "'\(titleLabel.text ?? "")' confirm '\(label)'\(spins ? " spinning" : "") cancel \(cancel.isEnabled ? "on" : "off")"
            + (failure.isHidden ? "" : " refused '\(failure.text ?? "")'")
            + (names.isEmpty ? "" : " reaches [\(names.joined(separator: "; "))]")
    }

    /// The confirm and Cancel, pressed as a finger would.
    public func probeConfirm() { confirm?.sendActions(for: .primaryActionTriggered) }
    public func probeCancel() { cancel.sendActions(for: .primaryActionTriggered) }
    #endif
}

/// One thing a question names as reached by its action (ask-here.svelte.ts
/// `AskItem`): a session, led by its mark, with what it is doing now in a word.
public struct AskItem: Hashable, Sendable {
    public let id: String
    /// The item it hangs under, as a delegate under its lead.
    public let parentId: String?
    public let title: String
    /// Where its mark takes its hue from: the session's folder.
    public let place: String
    public let mark: MarkStatus
    /// What it is doing now, in a word ("Working", "Idle").
    public let status: String

    public init(id: String, parentId: String?, title: String, place: String, mark: MarkStatus, status: String) {
        self.id = id
        self.parentId = parentId
        self.title = title
        self.place = place
        self.mark = mark
        self.status = status
    }
}

/// One thing the question reaches (AskItems.svelte): its mark, its title,
/// and its status word at the end, stood in from its lead (`kit-nest`).
private final class AskItemRow: UIView {
    init(_ item: AskItem, level: Int) {
        super.init(frame: .zero)
        let mark = SessionMarkView(tile: 20)
        mark.configure(id: item.id, place: item.place, status: item.mark)
        let title = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkStrong)
        title.text = item.title
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let word = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        word.text = item.status
        word.setContentCompressionResistancePriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [mark, title, UIView(), word])
        line.spacing = Space.space2
        line.alignment = .center
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: topAnchor),
            line.bottomAnchor.constraint(equalTo: bottomAnchor),
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Double(level) * Space.space5),
            line.trailingAnchor.constraint(equalTo: trailingAnchor),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "\(item.title), \(item.status)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("AskItemRow is built in code") }
}
