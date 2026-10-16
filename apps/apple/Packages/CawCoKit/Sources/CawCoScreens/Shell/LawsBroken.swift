import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// Every system law the hub caught broken since it started (core
/// invariant.ts, hub laws.ts), one destructive alert each, standing over the
/// whole shell until the hub restarts, as the web's LawsBroken.svelte does: a
/// broken law is a programmer's error, the frame or request it was found in
/// failed, and the board may be behind until it is fixed, so it is never
/// dismissed. `space-3` in from the top and the sides, as wide as the
/// composer at most, the alerts `space-2` apart.
@MainActor
final class LawsBrokenShelf: UIView {
    private let hub: HubConnection
    private let stack = UIStackView()

    init(hub: HubConnection) {
        self.hub = hub
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
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
        isHidden = true
        watch()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("LawsBrokenShelf is built in code")
    }

    /// Pins the shelf over `host`: under its top safe edge, centred, at most the composer's width.
    func stand(in host: UIView) {
        host.addSubview(self)
        let wide = widthAnchor.constraint(equalToConstant: Size.cComposerW)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: Space.space3),
            centerXAnchor.constraint(equalTo: host.centerXAnchor),
            leadingAnchor.constraint(greaterThanOrEqualTo: host.safeAreaLayoutGuide.leadingAnchor, constant: Space.space3),
            trailingAnchor.constraint(lessThanOrEqualTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -Space.space3),
            wide,
        ])
    }

    /// One alert per law, read again whenever the hub's list changes.
    private func watch() {
        withObservationTracking {
            show(hub.fleet.lawsBroken)
        } onChange: { [weak self] in
            Task { @MainActor in self?.watch() }
        }
    }

    private func show(_ broken: [Components.Schemas.LawBroken]) {
        for alert in stack.arrangedSubviews {
            alert.removeFromSuperview()
        }
        for law in broken {
            stack.addArrangedSubview(alert(for: law))
        }
        isHidden = broken.isEmpty
        superview?.bringSubviewToFront(self)
    }

    /// The web's alert: the law's name as its title; its statement, the facts, and how often under it.
    private func alert(for law: Components.Schemas.LawBroken) -> KitAlert {
        let ink = Palette.statusFailInk
        var lines = [law.statement, law.words]
        if law.count > 1 {
            lines.append("Caught \(Int(law.count)) times since the hub started.")
        }
        let under = lines.map { text -> UIView in
            let line = KitLabel(TypeScale.typeBody, ink: ink, lines: 0)
            line.text = text
            return line
        }
        return KitAlert("Law broken: \(law.law.rawValue)", tone: .destructive, glyph: .failed, under: under)
    }
}
