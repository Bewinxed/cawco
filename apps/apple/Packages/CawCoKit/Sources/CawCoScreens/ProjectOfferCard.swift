import CawCoCore
import CawCoDesign
import UIKit

/// "Make this a project" (transcript/ProjectOffer.svelte, Projects §2 "Caw
/// suggests, you escalate"): the one offer a plain session gets when it
/// outgrows itself, standing on the composer with the parked asks. Quiet by
/// design: no needs-you pill, no attention hue, one sentence naming why,
/// and two answers. Either answer is the last word: a session is never
/// offered again. Once answering joined a project that already was, the card
/// says what it joined where the offer stood, with the way there and a way
/// to put it away.
final class ProjectOfferCard: UIView {
    private let hub: HubConnection
    private let instanceId: String
    /// The answer made a new project: its Setup thread, where its Caw sets it up.
    var onSetupThread: (String) -> Void = { _ in }
    var onOpenProject: (String) -> Void = { _ in }
    /// Its height changed (a refusal under it, the offer turned into what it joined).
    var onHeight: () -> Void = {}

    private let glyph = GlyphView(.folder, size: Size.iconMd, tint: Palette.inkMuted)
    private let line = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
    private let refused = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let actions = UIStackView()
    private let body = UIStackView()
    private var pending: Pending?
    private enum Pending { case accept, dismiss }
    private var drawn: String?

    init(hub: HubConnection, instanceId: String, arriving: Bool) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        // `.offer`: the raised surface on the control border at `--radius-lg`, `space-3` in, the hairline shadow.
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowTile
        line.wrap = .pretty
        let said = UIStackView(arrangedSubviews: [glyph, line])
        said.spacing = Space.space2
        said.alignment = .center
        actions.spacing = Space.space2
        let trailing = UIStackView(arrangedSubviews: [UIView(), actions])
        body.axis = .vertical
        body.spacing = Space.space2
        for part in [said, trailing, refused] as [UIView] { body.addArrangedSubview(part) }
        refused.isHidden = true
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            body.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: ProjectOfferCard, _: UITraitCollection) in card.paintEdge() }
        paintEdge()
        // `offer-settle`: from 8pt below and clear, over twice `--dur-control` on the out curve.
        if arriving, !UIAccessibility.isReduceMotionEnabled {
            alpha = 0
            transform = CGAffineTransform(translationX: 0, y: 8)
            Motion.easeOut.animator(Motion.durControl * 2) {
                self.alpha = 1
                self.transform = .identity
            }.startAnimation()
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ProjectOfferCard is built in code") }

    private func paintEdge() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    /// The Prompt card's control dress: `space-3` in, the label in its medium weight, 44pt under a finger.
    private static func button(_ title: String, glyph: Glyph? = nil, variant: KitButton.Variant, action: @escaping () -> Void) -> UIButton {
        let button = KitButton.make(title, glyph: glyph, variant: variant, height: .sm, action: action)
        button.heightAnchor.constraint(equalToConstant: Size.cTrayChipCoarse).isActive = true
        return button
    }

    /// The offer standing, or what answering it joined; drawn again only when that changed.
    func show(offer: ProjectOffer?, joined: ProjectOfferAccepted?) {
        let key = "\(offer?.line ?? "-")|\(joined?.project.id ?? "-")|\(pending.map { "\($0)" } ?? "-")|\(refused.text ?? "")"
        guard key != drawn else { return }
        drawn = key
        actions.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let joined, offer == nil {
            line.text = Words.Offers.joined(name: joined.project.name, filed: joined.tasks.count)
            accessibilityLabel = Words.Offers.joinedLabel
            let open = Self.button(Words.Offers.openProject(name: joined.project.name), variant: .outline) { [weak self] in
                self?.onOpenProject(joined.project.id)
            }
            let away = Self.button("", glyph: .close, variant: .ghost) { [weak self] in
                guard let self else { return }
                hub.offers.dismissJoin(instanceId)
            }
            away.accessibilityLabel = Words.Offers.putAway
            actions.addArrangedSubview(open)
            actions.addArrangedSubview(away)
        } else if let offer {
            line.text = offer.line
            accessibilityLabel = Words.Offers.offerLabel
            let notNow = Self.button(Words.Offers.notNow, variant: .ghost) { [weak self] in self?.answer(.dismiss) }
            let create = Self.button(pending == .accept ? Words.Offers.makingProject : Words.Offers.createProject,
                                     glyph: .folder, variant: .action) { [weak self] in self?.answer(.accept) }
            notNow.configuration?.showsActivityIndicator = pending == .dismiss
            create.configuration?.showsActivityIndicator = pending == .accept
            notNow.isEnabled = pending == nil
            create.isEnabled = pending == nil
            actions.addArrangedSubview(notNow)
            actions.addArrangedSubview(create)
        }
        shouldGroupAccessibilityChildren = true
        onHeight()
    }


    private func answer(_ which: Pending) {
        guard pending == nil else { return }
        pending = which
        refused.text = nil
        refused.isHidden = true
        show(offer: hub.offers.offers[instanceId], joined: hub.offers.joins[instanceId])
        Task { [weak self, hub, instanceId] in
            do {
                let accepted = try await hub.answerProjectOffer(instanceId, accept: which == .accept)
                self?.pending = nil
                // A new project: Caw sets it up in its Setup thread, with the session's plan already on its board.
                if let thread = accepted?.setupThread { self?.onSetupThread(thread.id) }
            } catch {
                self?.pending = nil
                self?.refused.text = (error as? TaskRefusal)?.message ?? error.localizedDescription
                self?.refused.isHidden = false
                if let self {
                    show(offer: hub.offers.offers[instanceId], joined: hub.offers.joins[instanceId])
                }
            }
        }
    }
}
