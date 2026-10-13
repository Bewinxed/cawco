import CawCoCore
import CawCoDesign
import UIKit

/// One fault, drawn the same way everywhere it appears (FleetFault.svelte):
/// named, attributed to the hub or to a machine, explained in a sentence and
/// given the affordance that resolves it, and only then, behind a
/// disclosure, quoted verbatim. A cause CawCo does not recognise shows the
/// machine's own words open, since they are all there is.
///
/// The alert recipe: a compact status-tinted block, its ink on its own tint,
/// no edge; a hub fault wears the fail tint, a machine's the attention tint.
/// `compact`: one line under a list row, the rest a tap away.
final class FleetFaultView: UIView {
    private let group: FaultGroup
    private let hub: HubConnection
    private let onResolved: (() -> Void)?
    private let ink: UIColor
    private let copy: FaultCause.Copy
    private let body = UIStackView()
    private let saids = UIStackView()
    private let acts = UIStackView()
    private let result = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var expanded: Bool
    private weak var detailsButton: UIButton?
    private weak var saidButton: UIButton?

    /// How many affected rows are named before the rest become a count: six
    /// monospace ids is about two lines, past which a list stops being taken in at a glance.
    private static let named = 6

    init(group: FaultGroup, hub: HubConnection, compact: Bool, onResolved: (() -> Void)? = nil) {
        self.group = group
        self.hub = hub
        self.onResolved = onResolved
        copy = group.cause.copy
        expanded = !compact
        let (ground, ink) = group.origin == .hub ? (Palette.statusFailBg, Palette.statusFailInk) : (Palette.statusAttnBg, Palette.statusAttnInk)
        self.ink = ink
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = ground
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous

        let title = KitLabel(TypeScale.typeLabel, ink: ink, lines: 0)
        title.text = copy.title
        let top = UIStackView(arrangedSubviews: [GlyphView(.warning, size: 16, tint: ink), title, where_()])
        top.spacing = Space.space2
        top.alignment = .center
        if compact {
            top.addArrangedSubview(UIView())
            let details = disclosure(expanded ? "Hide" : "Details") { [weak self] in self?.toggleDetails() }
            detailsButton = details
            top.addArrangedSubview(details)
        }

        body.axis = .vertical
        body.spacing = Space.space2
        body.isLayoutMarginsRelativeArrangement = true
        body.directionalLayoutMargins = .init(top: Space.space2, leading: 0, bottom: 0, trailing: 0)
        body.isHidden = !expanded
        fillBody()

        let column = UIStackView(arrangedSubviews: [top, body])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FleetFaultView is built in code")
    }

    private var machine: MachineRow? { hub.fleet.machines.first { $0.machineId == group.machineId } }
    private var online: Bool { machine?.status == "online" }
    private var machineName: String { machine?.name ?? group.machineId ?? "" }

    /// Where, never left implicit: at the hub, or the machine (its OS mark, name, harness, presence).
    private func where_() -> UIView {
        let tag = UIStackView()
        tag.spacing = Space.space1
        tag.alignment = .center
        tag.isLayoutMarginsRelativeArrangement = true
        tag.directionalLayoutMargins = .init(top: 1, leading: Space.space2, bottom: 1, trailing: Space.space2)
        tag.backgroundColor = Palette.surfaceRaised
        tag.layer.cornerRadius = 9
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        if group.origin == .hub {
            words.text = "at the hub"
        } else if let machine {
            tag.addArrangedSubview(GlyphView(.os(machine.os), size: 16, tint: Palette.inkMuted))
            words.text = machine.name + (group.harness.map { " · \($0)" } ?? "") + (online ? "" : " · offline")
        } else {
            words.text = group.machineId
        }
        tag.addArrangedSubview(words)
        tag.setContentHuggingPriority(.required, for: .horizontal)
        return tag
    }

    private func meta(_ text: String, ink: UIColor? = nil, mono: Bool = false) -> KitLabel {
        let label = KitLabel(mono ? TypeScale.typeCode : TypeScale.typeMeta, ink: ink ?? self.ink.withAlphaComponent(0.8), lines: 0)
        label.text = text
        return label
    }

    private func fillBody() {
        let shown = Array(group.faults.prefix(Self.named))
        let extra = group.faults.count - shown.count
        let names = shown.map(\.label).joined(separator: "  ") + (extra > 0 ? "  and \(extra) more" : "")
        body.addArrangedSubview(meta("\(group.scope.noun)\(group.faults.count == 1 ? "" : "s"): \(names)"))
        let why = KitLabel(TypeScale.typeBody, ink: ink, lines: 0)
        why.text = copy.why
        body.addArrangedSubview(why)
        if copy.toolchain, let reading = FleetFaults.toolchain(machine) { body.addArrangedSubview(toolchain(reading)) }

        if let detail = group.faults.first?.detail {
            if group.cause == .unknown {
                body.addArrangedSubview(pre(detail))
            } else {
                let button = disclosure("What it said") { [weak self] in self?.toggleSaid() }
                saidButton = button
                body.addArrangedSubview(button)
                saids.axis = .vertical
                saids.spacing = Space.space2
                saids.isHidden = true
                for fault in shown { if let said = fault.detail { saids.addArrangedSubview(pre("\(fault.label)\n\(said)")) } }
                body.addArrangedSubview(saids)
            }
        }
        let fix = KitLabel(TypeScale.typeBody, ink: ink, lines: 0)
        fix.text = copy.fix
        body.addArrangedSubview(fix)

        acts.spacing = Space.space2
        acts.alignment = .center
        fillActs()
        if !acts.arrangedSubviews.isEmpty { body.addArrangedSubview(acts) }
        result.isHidden = true
        body.addArrangedSubview(result)
    }

    private func toolchain(_ reading: ToolchainReading) -> UIView {
        let well = UIStackView()
        well.axis = .vertical
        well.spacing = 2
        well.isLayoutMarginsRelativeArrangement = true
        well.directionalLayoutMargins = .init(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        well.backgroundColor = Palette.surfaceRecess
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.borderWidth = 1
        well.layer.borderColor = Palette.borderHairline.cgColor
        well.addArrangedSubview(meta("claude on this machine", ink: Palette.inkMuted))
        if let used = reading.used {
            well.addArrangedSubview(meta("\(used.path)  \(used.version ?? "version unknown")  · ran this sync", ink: Palette.inkStrong, mono: true))
        }
        for other in reading.others {
            well.addArrangedSubview(meta("\(other.path)  \(other.version ?? "version unknown")", ink: Palette.inkStrong, mono: true))
        }
        if reading.shadowed {
            well.addArrangedSubview(meta("A newer claude is installed on this machine and is not the one PATH resolves first. Until that changes, updating again will not help.", ink: Palette.inkStrong))
        }
        return well
    }

    private func pre(_ text: String) -> KitPre {
        KitPre(text, fill: Palette.surfaceRecess, border: Palette.borderHairline, radius: Radius.radiusSm,
               inset: .init(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2), leading: TypeScale.leadingCode, maxHeight: 160)
    }

    /// A disclosure: a chevron that turns with what it opens, 24pt tall at least.
    private func disclosure(_ title: String, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = Glyph.chevronRight.image.resized(to: 16)
        config.imagePadding = Space.space1
        config.contentInsets = .init(top: 4, leading: Space.space2, bottom: 4, trailing: Space.space2)
        config.attributedTitle = AttributedString(title, attributes: TypeScale.typeMeta.container(color: ink))
        config.baseForegroundColor = ink
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in action() })
        button.houseStyle()
        button.alpha = 0.8
        button.contentHorizontalAlignment = .leading
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 24).isActive = true
        button.accessibilityTraits = .button
        return button
    }

    private func turn(_ button: UIButton?, open: Bool) {
        guard let image = button?.imageView else { return }
        Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durControl) {
            image.transform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        }.startAnimation()
        button?.accessibilityValue = open ? "Expanded" : "Collapsed"
    }

    private func toggleDetails() {
        expanded.toggle()
        detailsButton?.configuration?.attributedTitle = AttributedString(expanded ? "Hide" : "Details", attributes: TypeScale.typeMeta.container(color: ink))
        turn(detailsButton, open: expanded)
        fold(body, open: expanded)
    }

    private func toggleSaid() {
        let open = saids.isHidden
        turn(saidButton, open: open)
        fold(saids, open: open)
    }

    /// Folds a part open or shut: 260ms open, 160ms shut (motion/fold).
    private func fold(_ part: UIView, open: Bool) {
        let reduce = UIAccessibility.isReduceMotionEnabled
        Motion.easeOut.animator(reduce ? 0 : (open ? Motion.durPop : Motion.durExit)) {
            part.isHidden = !open
            part.alpha = open ? 1 : 0
            self.superview?.layoutIfNeeded()
        }.startAnimation()
    }

    // MARK: Remedies

    private func fillActs() {
        switch copy.action {
        case .resync:
            let button = KitButton.make("Sync this machine", glyph: .refresh, variant: .outline, height: .xs) { [weak self] in self?.resync() }
            button.isEnabled = online
            acts.addArrangedSubview(button)
            acts.addArrangedSubview(meta(online ? "Applies the fleet’s setup to this machine again and reports what came of it." : "It syncs on its own the moment it comes back."))
        case .refresh:
            let label = group.faults.count > 1 ? "Fetch all \(group.faults.count) again" : "Fetch again"
            acts.addArrangedSubview(KitButton.make(label, glyph: .refresh, variant: .outline, height: .xs) { [weak self] in self?.refresh() })
            acts.addArrangedSubview(meta("Downloads the content at the hub, once, then hands the bytes to every machine."))
        case .settle where group.scope == .skills:
            for fault in group.faults.prefix(Self.named) {
                let adopt = KitButton.make("Adopt this copy", variant: .outline, height: .xs) { [weak self] in self?.settle(fault.key, adopt: true) }
                let send = KitButton.make("Send ours", variant: .outline, height: .xs) { [weak self] in self?.settle(fault.key, adopt: false) }
                adopt.isEnabled = online
                send.isEnabled = online
                if group.faults.count > 1 { acts.addArrangedSubview(meta(fault.key, mono: true)) }
                acts.addArrangedSubview(adopt)
                acts.addArrangedSubview(send)
            }
        case .settle, .none:
            // The remedy lives in the section that owns the row (`faultHref`); this frame names it.
            acts.addArrangedSubview(meta(copy.action == .settle ? "Adopt this machine’s copy into the fleet, or overwrite it with the fleet’s, from its editor." : "Open the section to fix it."))
        }
        acts.axis = traitCollection.horizontalSizeClass == .compact ? .vertical : .horizontal
        acts.alignment = acts.axis == .vertical ? .leading : .center
    }

    private func say(_ text: String, failed: Bool) {
        result.text = text
        result.ink = failed ? Palette.statusFailInk : ink
        result.accessibilityTraits = failed ? .staticText : .updatesFrequently
        result.isHidden = false
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    private func busy(_ on: Bool) {
        for case let button as UIButton in acts.arrangedSubviews {
            button.configuration?.showsActivityIndicator = on
            button.isUserInteractionEnabled = !on
        }
    }

    private func resync() {
        guard let id = group.machineId else { return }
        busy(true)
        Task { @MainActor [weak self, hub] in
            defer { self?.busy(false) }
            do {
                try await hub.configuration.resync(machineId: id)
                self?.say("Sent. This clears once \(self?.machineName ?? "the machine") reports back.", failed: false)
                self?.onResolved?()
            } catch {
                self?.say(error.localizedDescription, failed: true)
            }
        }
    }

    private func refresh() {
        busy(true)
        Task { @MainActor [weak self, hub, group] in
            defer { self?.busy(false) }
            do {
                var still = 0
                // One at a time, in order, so the count is right.
                for fault in group.faults {
                    if try await hub.configuration.refresh(fault) { still += 1 }
                }
                self?.say(still > 0 ? "\(still) still would not fetch. The row says why." : "Fetched. The machines are being sent the files.", failed: still > 0)
                await hub.configuration.load()
                self?.onResolved?()
            } catch {
                self?.say(error.localizedDescription, failed: true)
            }
        }
    }

    private func settle(_ name: String, adopt: Bool) {
        guard let id = group.machineId else { return }
        busy(true)
        Task { @MainActor [weak self, hub] in
            defer { self?.busy(false) }
            do {
                if adopt { try await hub.configuration.adoptSkill(name, machineId: id) } else { try await hub.configuration.pushSkill(name, machineId: id) }
                let who = self?.machineName ?? ""
                self?.say(adopt ? "The fleet now keeps \(who)'s copy." : "\(who) takes the fleet's copy.", failed: false)
                self?.onResolved?()
            } catch {
                self?.say(error.localizedDescription, failed: true)
            }
        }
    }
}
