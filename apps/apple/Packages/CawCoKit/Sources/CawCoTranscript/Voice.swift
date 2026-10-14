import CawCoCore
import CawCoDesign
import UIKit

/// Who answers in a transcript when it is not a harness session's agent
/// (transcript/voice.ts): a pane hosting one (a project's Caw thread) says
/// so here, and the rows draw it. His face stands in the speaker line's
/// mark; `accessory` draws what a reply carries under it (the tasks it is
/// about as cards, the files it wrote as chips), by the reply's block id. A
/// transcript with a voice is bare (Transcript.svelte `bare`): nothing
/// stands in for rows not there yet.
@MainActor
public struct TranscriptVoice {
    /// Who answers, on the speaker line (Transcript.svelte `agentName`).
    public var name: String
    /// What each reply carries under it, by its block's id.
    public var extras: [String: ThreadExtras]
    /// Moves when what `accessory` draws from changed (the tasks were read
    /// again): every reply's extras are drawn again.
    public var revision: Int
    /// The view for a reply's extras: its tasks' cards and its files' chips.
    public var accessory: (ThreadExtras, _ blockId: String) -> UIView?

    public init(name: String, extras: [String: ThreadExtras], revision: Int = 0, accessory: @escaping (ThreadExtras, String) -> UIView?) {
        self.name = name
        self.extras = extras
        self.revision = revision
        self.accessory = accessory
    }
}

/// What a reply carries, under its words and on their edge (MessageRow.svelte's
/// `voice.tasks` and `voice.files` under a turn).
final class VoiceExtrasView: UIView, RowContent {
    private let env: RowEnv
    private var drawn: UIView?

    required init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ item: Item) {
        guard case let .voice(blockId, extras) = item.kind else { return }
        drawn?.removeFromSuperview()
        guard let view = env.voice?.accessory(extras, blockId) else { drawn = nil; return }
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: leadingAnchor),
            view.trailingAnchor.constraint(equalTo: trailingAnchor),
            view.topAnchor.constraint(equalTo: topAnchor),
            view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        drawn = view
    }
}
