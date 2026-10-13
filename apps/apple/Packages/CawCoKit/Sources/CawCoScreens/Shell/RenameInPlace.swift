import CawCoCore
import CawCoDesign
import Observation
import OSLog
import UIKit

/// Renaming a session where its name stands (DESIGN.md: "Renaming edits the
/// name where it stands"): the row its menu was opened on turns into a field
/// holding its name, selected. Return asks the hub; the field holds,
/// dimmed with a spinner, until the hub's word names the session, then the
/// row is the row again under its new name. A refusal keeps what was typed
/// with the hub's reason under it, the field focused to try again. Escape,
/// or leaving the field, puts the row back as it was.
@MainActor
final class RenameInPlace: UIView, UITextFieldDelegate {
    private let field = KitField()
    private let problem = TaskSheetController.problemLabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let current: String
    private let rename: (String) async throws -> Void
    private let named: (String) -> Bool
    private var busy = false
    /// The ancestors lifted over their siblings while the field and its reason stand.
    private var lifted: [CALayer] = []
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Acts")

    /// `named`: whether the hub's word now calls the session `next`.
    @discardableResult
    static func begin(over row: UIView, current: String, rename: @escaping (String) async throws -> Void,
                      named: @escaping (String) -> Bool) -> RenameInPlace {
        row.subviews.compactMap { $0 as? RenameInPlace }.forEach { $0.close() }
        let editor = RenameInPlace(current: current, rename: rename, named: named)
        editor.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(editor)
        NSLayoutConstraint.activate([
            editor.topAnchor.constraint(equalTo: row.topAnchor),
            editor.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            editor.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            editor.heightAnchor.constraint(greaterThanOrEqualTo: row.heightAnchor),
        ])
        editor.lift(true)
        editor.alpha = 0
        Motion.easeOut.animator(Motion.durControl) { editor.alpha = 1 }.startAnimation()
        editor.field.becomeFirstResponder()
        editor.field.selectAll(nil)
        log.notice("rename in place: open on \(current, privacy: .public)")
        return editor
    }

    private init(current: String, rename: @escaping (String) async throws -> Void, named: @escaping (String) -> Bool) {
        self.current = current
        self.rename = rename
        self.named = named
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        field.text = current
        field.accessibilityLabel = "Session title"
        field.accessibilityIdentifier = "rename-in-place"
        field.returnKeyType = .done
        field.delegate = self
        spinner.hidesWhenStopped = true
        field.rightView = spinner
        field.rightViewMode = .always
        problem.accessibilityIdentifier = "rename-in-place-problem"
        let column = UIStackView(arrangedSubviews: [field, problem])
        column.axis = .vertical
        column.spacing = Space.space1
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space1),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space1),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RenameInPlace is built in code")
    }

    /// However it leaves (closed, or its row given to another session), the rows go back to their order.
    override func willMove(toSuperview next: UIView?) {
        super.willMove(toSuperview: next)
        if next == nil { lift(false) }
    }

    #if DEBUG
    /// A simulator probe types `text` and presses Return.
    func probeCommit(_ text: String) {
        field.text = text
        commit()
    }

    /// What the field draws now: its text, whether it takes input, and the reason under it.
    var probeState: String {
        "field '\(field.text ?? "")' enabled=\(field.isEnabled) busy=\(spinner.isAnimating) problem=\(problem.isHidden ? "hidden" : "'\(problem.text ?? "")'") inWindow=\(window != nil)"
    }

    func probeEscape() { escape() }
    #endif

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape))]
    }

    @objc private func escape() { close() }

    /// The field and the reason under it stand over the rows after this one:
    /// each ancestor up to the list it scrolls in comes to the front of its siblings.
    private func lift(_ on: Bool) {
        if on {
            var at: UIView? = superview
            while let view = at, !(view is UIScrollView) {
                view.layer.zPosition = 1
                lifted.append(view.layer)
                at = view.superview
            }
        } else {
            lifted.forEach { $0.zPosition = 0 }
            lifted = []
        }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        commit()
        return false
    }

    func textFieldDidEndEditing(_: UITextField) {
        // Leaving the field puts the name back; the hub's answer, while it is on its way, still lands.
        guard !busy else { return }
        close()
    }

    private func commit() {
        let next = (field.text ?? "").trimmingCharacters(in: .whitespaces)
        guard !busy else { return }
        guard !next.isEmpty, next != current else {
            close()
            return
        }
        busy = true
        field.isEnabled = false
        field.alpha = 0.7
        spinner.startAnimating()
        Self.log.notice("rename in place: in flight \(next, privacy: .public)")
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await rename(next)
                await Self.until { [named] in named(next) }
                Self.log.notice("rename in place: confirmed \(next, privacy: .public)")
                close()
            } catch {
                busy = false
                spinner.stopAnimating()
                field.alpha = 1
                field.isEnabled = true
                problem.text = error.localizedDescription
                Self.log.notice("rename in place: refused: \(error.localizedDescription, privacy: .public)")
                Motion.easeDrawer.animator(Motion.durMorph) { [self] in
                    problem.isHidden = false
                    superview?.layoutIfNeeded()
                }.startAnimation()
                UIAccessibility.post(notification: .announcement, argument: problem.text)
                field.becomeFirstResponder()
            }
        }
    }

    private func close() {
        busy = true
        field.delegate = nil
        if field.isFirstResponder { field.resignFirstResponder() }
        let fade = Motion.easeOut.animator(Motion.durExit) { [self] in alpha = 0 }
        fade.addCompletion { [self] _ in removeFromSuperview() }
        fade.startAnimation()
    }

    /// Waits for the hub's frames to say so (each change to what `done` reads
    /// asks it again), for as long as a frame takes to follow the hub's answer.
    static func until(_ done: @escaping @MainActor () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(5)
        while !done(), ContinuousClock.now < deadline {
            let once = Once()
            let timer = Task {
                try? await Task.sleep(until: deadline, clock: .continuous)
                once.fire()
            }
            await withCheckedContinuation { (resume: CheckedContinuation<Void, Never>) in
                once.arm(resume)
                let now = withObservationTracking { done() } onChange: { once.fire() }
                if now { once.fire() }
            }
            timer.cancel()
        }
    }

    /// A continuation resumed exactly once, by whichever of its callers comes
    /// first: a change, the answer already in, or the deadline (which may come
    /// before it is armed).
    private nonisolated final class Once: @unchecked Sendable {
        private let lock = NSLock()
        private var resume: CheckedContinuation<Void, Never>?
        private var fired = false

        func arm(_ next: CheckedContinuation<Void, Never>) {
            lock.lock()
            if fired {
                lock.unlock()
                next.resume()
                return
            }
            resume = next
            lock.unlock()
        }

        func fire() {
            lock.lock()
            fired = true
            let next = resume
            resume = nil
            lock.unlock()
            next?.resume()
        }
    }
}
