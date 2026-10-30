import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Spend (routes/config/spend/+page.svelte): what reaching a
/// project's budget does where the project sets nothing of its own
/// (project-caps.ts in the hub). A project sets its budget, and may set its
/// own answer to this, on its Usage tile. The choice is written as it is
/// made; a refusal puts the old one back and says why under the field.
final class SpendSectionController: ConfigSectionController {
    private let select = KitSelect()
    private var field: ConfigField!
    private var onCap: String?
    private var refused: String?
    private var writing = false

    #if DEBUG
    func probeChoose(_ value: String) { choose(value) }
    #endif

    override func viewDidLoad() {
        super.viewDidLoad()
        select.accessibilityIdentifier = "spend.on-cap"
        // The fleet's answers, listed as the select opens.
        select.menuOnOpen { [weak self] in
            Words.Spend.onCaps.map { each in
                UIAction(title: each.label, state: each.value == self?.onCap ? .on : .off) { [weak self] _ in self?.choose(each.value) }
            }
        }
        // `max-w-sm`: the select at most 384pt, in a box that spans the column.
        field = ConfigField(label: Words.Spend.onCap, control: CapBox(select, max: 384))
        let note = metaLine(Words.Spend.note)
        let group = UIStackView(arrangedSubviews: [CapBox.measure(note, TypeScale.typeMeta), field])
        group.axis = .vertical
        group.spacing = 8
        group.alignment = .fill
        setContent([group])
        draw()
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await read() }
    }

    private func read() async {
        do {
            let output = try await hub.api.spend.settings()
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            onCap = try ok.body.json.onCap.rawValue
            problem = nil
            ready = true
        } catch {
            if onCap == nil { problem = Words.Spend.unread(clause: CawStore.failureWords(error)) }
        }
        draw()
    }

    /// The choice, written at once; refused, the old one stands again with why.
    private func choose(_ next: String) {
        guard next != onCap, let payload = Operations.PutApiSpendSettings.Input.Body.JsonPayload.OnCapPayload(rawValue: next) else { return }
        let was = onCap
        onCap = next
        refused = nil
        writing = true
        draw()
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { writing = false }
            do {
                let output = try await hub.api.spend.save(.init(body: .json(.init(onCap: payload))))
                guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
                onCap = try ok.body.json.onCap.rawValue
            } catch {
                onCap = was
                refused = CawStore.failureWords(error)
            }
            draw()
        }
    }

    private func draw() {
        guard isViewLoaded else { return }
        let chosen = Words.Spend.onCaps.first { $0.value == onCap }
        select.setValue(chosen?.label ?? "")
        select.isEnabled = hub.writesBlocked == nil
        field.say(hint: chosen?.means, problem: refused)
    }
}
