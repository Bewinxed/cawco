import CawCoCore
import CawCoDesign
import os
import UIKit

/// Under Caw's note asking whether to build a design system
/// (transcript/DesignOfferActions.svelte, core ProjectNoteEvent `design-offer`):
/// Build and Not now while it stands, then what was answered, read from the
/// hub as it is now (`/api/projects/:id/design-offer`). Build files the
/// task; nothing is built before it. `space-2` apart, wrapping, the
/// refusal's words in the fail ink under them.
final class DesignOfferActionsView: UIStackView {
    private let projectId: String
    private weak var hub: HubConnection?
    private let openTask: (_ projectId: String, _ taskId: String) -> Void
    private var now: DesignOffer?
    private var acting: Acting?
    private enum Acting { case build, dismiss }
    private var problem: String?
    private let line = UIStackView()
    private let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let fault = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var build: UIButton!
    private var notNow: UIButton!
    private var open: UIButton!
    #if DEBUG
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Transcript")
    #endif

    init(projectId: String, hub: HubConnection?, openTask: @escaping (_ projectId: String, _ taskId: String) -> Void) {
        self.projectId = projectId
        self.hub = hub
        self.openTask = openTask
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        alignment = .leading
        build = KitButton.make(Words.Offers.build, variant: .outline, height: .xs) { [weak self] in self?.act(.build) }
        notNow = KitButton.make(Words.Offers.notNow, variant: .ghost, height: .xs) { [weak self] in self?.act(.dismiss) }
        open = KitButton.make(Words.Offers.open, variant: .ghost, height: .xs) { [weak self] in
            guard let self, let task = now?.builtTaskId else { return }
            self.openTask(projectId, task)
        }
        for part in [build!, notNow!, said, open!] as [UIView] { line.addArrangedSubview(part) }
        line.spacing = Space.space2
        line.alignment = .center
        // The row stands at its controls' height from the first frame, so the read arriving moves nothing.
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHXs).isActive = true
        addArrangedSubview(line)
        addArrangedSubview(fault)
        paint()
        read()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) { fatalError("DesignOfferActionsView is built in code") }

    private func read() {
        guard let hub else { return }
        Task { [weak self, projectId] in
            do {
                let read = try await hub.designOffer(projectId)
                self?.now = read
            } catch {
                self?.problem = error.localizedDescription
            }
            self?.paint()
        }
    }

    private func act(_ what: Acting) {
        guard acting == nil, let hub else { return }
        acting = what
        problem = nil
        paint()
        Task { [weak self, projectId] in
            do {
                let after = try await hub.answerDesignOffer(projectId, build: what == .build)
                self?.now = after
            } catch {
                self?.problem = (error as? TaskRefusal)?.message ?? error.localizedDescription
            }
            self?.acting = nil
            self?.paint()
        }
    }

    private func paint() {
        let answer = now?.answer
        let standing = answer == .open
        build.isHidden = !standing
        notNow.isHidden = !standing
        build.isEnabled = acting == nil
        notNow.isEnabled = acting == nil
        build.configuration?.showsActivityIndicator = acting == .build
        notNow.configuration?.showsActivityIndicator = acting == .dismiss
        KitButton.setTitle(acting == .build ? Words.Offers.filing : Words.Offers.build, of: build, variant: .outline, height: .xs)
        KitButton.setTitle(acting == .dismiss ? Words.Offers.notNowPending : Words.Offers.notNow, of: notNow, variant: .ghost, height: .xs)
        switch answer {
        case .built?: said.text = Words.Offers.filed
        case .dismissed?: said.text = Words.Offers.notNow
        default: said.text = nil
        }
        said.isHidden = said.text == nil
        open.isHidden = !(answer == .built && now?.builtTaskId != nil)
        fault.text = problem
        fault.isHidden = problem == nil
        #if DEBUG
        let state = "design offer \(projectId) answer=\(answer.map { "\($0)" } ?? "-") acting=\(acting.map { "\($0)" } ?? "-") task=\(now?.builtTaskId ?? "-") problem=\(problem ?? "-")"
        Self.log.notice("probe \(state, privacy: .public)")
        #endif
        remeasureRow()
    }
}
