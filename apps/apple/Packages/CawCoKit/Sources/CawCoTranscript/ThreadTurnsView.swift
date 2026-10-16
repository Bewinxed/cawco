public import CawCoAPI
public import CawCoCore
import CawCoDesign
import Foundation
public import UIKit

/// A pin's thread in the transcript's two voices (PinCard.svelte, which
/// draws each entry with MessageRow): the person's entries as the reader's
/// turn, one well for a run of them; the agent's bare under its mark and
/// name. The entries are folded and built as the transcript's own blocks
/// (Fold, Builder) and stood by the transcript's own row views (RowFactory),
/// as a branch's card stands its inner transcript (NestedRows). Under a pin,
/// not a session, so a row offers none of a session turn's actions.
public final class ThreadTurnsView: UIView {
    private let env = RowEnv()
    private let stack = UIStackView()

    public init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        pin(stack)
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The thread as it stands, the agent named `agentName`. The first turn
    /// starts at the view's top; an agent's reply that names changed files
    /// carries them under it (PinCard.svelte `.files`).
    public func show(_ entries: [PinEntry], agentName: String) {
        env.agentName = agentName
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let blocks = entries.enumerated().map { i, entry in
            let raw: [String: Any] = ["id": "e\(i)", "type": entry.by == .agent ? "assistant" : "user",
                                      "content": entry.text, "timestamp": entry.at]
            return Block(raw, signature: (try? JSONSerialization.data(withJSONObject: raw, options: .sortedKeys)) ?? Data())
        }
        var voices = Voices()
        let items = Builder(agentName: agentName, cache: env.cache).items(Fold.rows(blocks, branches: [:], voices: &voices)).items
        var above: UIView?
        for (i, item) in items.enumerated() {
            let row = RowFactory.make(item.kind, env: env)
            row.configure(item)
            if let above { stack.setCustomSpacing(item.top, after: above) }
            stack.addArrangedSubview(row)
            above = row
            // The entry an item stands for: its block's id, before a piece's own index.
            let owner = item.id.split(separator: ":").first.map(String.init)
            let next = items.indices.contains(i + 1) ? items[i + 1].id.split(separator: ":").first.map(String.init) : nil
            guard owner != next, let index = owner.flatMap({ Int($0.dropFirst()) }),
                  let files = entries[index].files, !files.isEmpty else { continue }
            let named = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted, lines: 0)
            named.text = files.joined(separator: "  ")
            stack.setCustomSpacing(Space.space1, after: row)
            stack.addArrangedSubview(named)
            above = named
        }
    }
}
