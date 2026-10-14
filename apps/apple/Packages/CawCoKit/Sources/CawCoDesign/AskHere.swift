import UIKit

/// A question standing in the page, under the control that asked it
/// (AskHere.svelte and ask-here.svelte.ts; DESIGN.md, The Open Page Rule):
/// no scrim and no hold, the rest of the screen live. It unfolds where it
/// was asked as a raised tile (the title in the label role, what it does in
/// meta), and VoiceOver and the keyboard land on its Cancel. Its confirm
/// runs the work and stays pending until it ends; a refusal stays under the
/// question in the refuser's words, the button the way to try again, and
/// only work that went puts it away. Cancel puts it away; once the work is
/// sent it can't be called back, so Cancel waits. One question at a time: a
/// new ask takes the place of the last.
public final class AskHere: UIView {
    public struct Request {
        public let title: String
        /// The consequence, in plain words.
        public let body: String?
        public let confirmLabel: String
        public let pendingLabel: String?
        public let cancelLabel: String
        public let destructive: Bool
        /// The work; a throw is a refusal, its description said under the question.
        public let run: () async throws -> Void

        public init(title: String, body: String? = nil, confirmLabel: String, pendingLabel: String? = nil,
                    cancelLabel: String = "Cancel", destructive: Bool = false, run: @escaping () async throws -> Void) {
            self.title = title
            self.body = body
            self.confirmLabel = confirmLabel
            self.pendingLabel = pendingLabel
            self.cancelLabel = cancelLabel
            self.destructive = destructive
            self.run = run
        }
    }

    /// The question standing now, or nil.
    public private(set) var asked: Request?
    /// It unfolded or folded: the host keeps it in view.
    public var onResize: () -> Void = {}

    private let tile = UIView()
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let bodyLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// RowFault.svelte's reason: the refuser's words in the fail status's ink.
    private let failure = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let actions = UIStackView()
    private var cancel: UIButton!
    private var confirm: UIButton?
    private var running = false
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
        bodyLabel.wrap = .pretty
        failure.isHidden = true
        cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in _ = self?.escape() }
        actions.addArrangedSubview(UIView())
        actions.addArrangedSubview(cancel)
        actions.spacing = Space.space2
        actions.alignment = .center
        let column = UIStackView(arrangedSubviews: [titleLabel, bodyLabel, failure, actions])
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
        bodyLabel.text = request.body
        bodyLabel.isHidden = request.body == nil
        failure.text = nil
        failure.isHidden = true
        KitButton.setTitle(request.cancelLabel, of: cancel, variant: .ghost, height: .sm)
        // The confirm in the question's own variant: a button keeps the paint it was made with.
        confirm?.removeFromSuperview()
        let confirm = KitButton.make(request.confirmLabel, variant: request.destructive ? .destructive : .action, height: .sm) { [weak self] in self?.accept() }
        actions.addArrangedSubview(confirm)
        self.confirm = confirm
        cancel.isEnabled = true
        accessibilityLabel = request.title
        unfold(true)
        // In hand as it opens: VoiceOver and the keyboard's focus on Cancel.
        UIAccessibility.post(notification: .layoutChanged, argument: cancel)
        if let focus = UIFocusSystem.focusSystem(for: self) { focus.requestFocusUpdate(to: cancel) }
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
        let variant: KitButton.Variant = request.destructive ? .destructive : .action
        KitButton.setTitle(on ? request.pendingLabel ?? request.confirmLabel : request.confirmLabel, of: confirm, variant: variant, height: .sm)
        confirm.configuration?.showsActivityIndicator = on
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
        "title=\(titleLabel.text ?? "") body=\(bodyLabel.text ?? "") failure=\(failure.isHidden ? "none" : failure.text ?? "")"
    }
    #endif
}
