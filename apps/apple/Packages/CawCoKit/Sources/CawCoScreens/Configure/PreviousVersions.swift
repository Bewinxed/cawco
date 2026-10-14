import CawCoDesign
import UIKit

/// One superseded version as a history lists it (PreviousVersions.svelte `ListedVersion`).
struct ListedVersion {
    let id: Int
    let name: String
    let hash: String
    let createdAt: Date
    /// `fleet` for the hub's own row; `machine:<machineId>` for a copy an overwrite took off it.
    let source: String
}

/// What a fleet row used to be, newest first, each a tap from being the
/// current one again (PreviousVersions.svelte); the latest five until asked for all.
final class PreviousVersionsView: UIStackView {
    private static let latest = 5
    private let list = UIStackView()
    private var all = false
    private var versions: [ListedVersion] = []
    private var failedWords: String?
    private var restoring: Int?
    private var restoreFailed: Int?
    private let sourceLabel: (String) -> String
    var onRestore: ((ListedVersion) -> Void)?

    init(sourceLabel: @escaping (String) -> String) {
        self.sourceLabel = sourceLabel
        super.init(frame: .zero)
        axis = .vertical
        spacing = 8
        let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        note.text = "Every save keeps what it replaced. Restoring writes an old version back as this one."
        list.axis = .vertical
        list.spacing = 8
        addArrangedSubview(note)
        addArrangedSubview(list)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("PreviousVersionsView is built in code")
    }

    func set(_ versions: [ListedVersion], failed: String? = nil, restoring: Int? = nil, restoreFailed: Int? = nil) {
        self.versions = versions
        failedWords = failed
        self.restoring = restoring
        self.restoreFailed = restoreFailed
        draw()
    }

    private func draw() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let failedWords {
            let caution = KitLabel(TypeScale.typeMeta, ink: Palette.statusAttnInk, lines: 0)
            caution.text = failedWords
            list.addArrangedSubview(caution)
            return
        }
        guard !versions.isEmpty else {
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            none.text = "Nothing has been saved over yet."
            list.addArrangedSubview(none)
            return
        }
        let rows = UIStackView()
        rows.axis = .vertical
        rows.spacing = 2
        for version in all ? versions : Array(versions.prefix(Self.latest)) {
            rows.addArrangedSubview(row(version))
        }
        list.addArrangedSubview(rows)
        if versions.count > Self.latest {
            let more = KitButton.make(all ? "Show the latest 5" : "Show all \(versions.count)", variant: .ghost, height: .sm) { [weak self] in
                guard let self else { return }
                all.toggle()
                draw()
            }
            list.addArrangedSubview(UIStackView(arrangedSubviews: [more, UIView()]))
        }
    }

    private func row(_ version: ListedVersion) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        name.text = version.name
        let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        meta.text = "\(version.createdAt.formatted(date: .abbreviated, time: .shortened)) · from \(sourceLabel(version.source)) · \(version.hash.prefix(7))"
        let words = UIStackView(arrangedSubviews: [name, meta])
        words.axis = .vertical
        words.spacing = 2
        let restore = KitButton.make("Restore", variant: .outline, height: .sm) { [weak self] in self?.onRestore?(version) }
        restore.configuration?.showsActivityIndicator = restoring == version.id
        restore.isEnabled = restoring == nil || restoring == version.id
        let row = UIStackView(arrangedSubviews: [words, restore])
        row.spacing = 8
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = .init(top: 8, leading: 10, bottom: 8, trailing: 10)
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        return row
    }
}
