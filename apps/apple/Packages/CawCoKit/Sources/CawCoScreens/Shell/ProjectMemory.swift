import CawCoCore
import CawCoDesign
import UIKit

/// The project's CLAUDE.md as the page's rail shows it (MemoryCard.svelte
/// with a `summary`): the file's name in the header, and one line about the
/// file in place of its markdown (the docs card beside it is where it is
/// read). Every state is the same height, two lines of meta type, so nothing
/// under it moves when the file answers: a skeleton while it is read, the
/// summary once it is there, and the empty text when it is not, which is
/// the way in to writing one on a machine that is up. A failed read says so
/// in the header. Edit opens the house markdown editor in the card when one
/// is given (`editor`).
final class ProjectMemoryCard: TileView {
    /// The house markdown editor, when the app has one: markdown in, edits out.
    var editor: ((String, @escaping (String) -> Void) -> UIView)? { didSet { render() } }

    private let hub: HubConnection
    private var machineId = ""
    private var path = ""
    private var loadedFor = ""
    private var content: String?
    private var read = false
    private var failure: String?
    private var online = false
    private var machineName = ""
    private var editing = false
    private var draft = ""
    private var saving = false
    private var saveFailed = false

    private let header = UIStackView()
    private let name = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeLabel.points), ink: Palette.mutedForeground)
    private let meta = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.error)
    private let actions = UIStackView()
    private let body = CrossView()
    private let footer = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground, lines: 0)
    private var bodyKey = ""

    init(hub: HubConnection) {
        self.hub = hub
        super.init(radius: Radius.radiusLg)
        boxShadow = Shadow.shadowMd
        name.text = "CLAUDE.md"
        meta.isHidden = true
        actions.spacing = Space.space2
        header.addArrangedSubview(name)
        header.addArrangedSubview(meta)
        header.addArrangedSubview(UIView())
        header.addArrangedSubview(actions)
        header.spacing = Space.space3
        header.alignment = .center
        header.isLayoutMarginsRelativeArrangement = true
        header.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        header.heightAnchor.constraint(greaterThanOrEqualToConstant: 24 + Space.space2 * 2).isActive = true
        let rule = UIView()
        rule.backgroundColor = Palette.border.withAlphaComponent(0.5)
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        footer.text = "This file is the repo's own — commit it to share it. Git is its sync; CawCo does not replicate it."
        let footerBox = UIStackView(arrangedSubviews: [footer])
        footerBox.isLayoutMarginsRelativeArrangement = true
        footerBox.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        footerBox.isHidden = true
        let column = UIStackView(arrangedSubviews: [header, rule, body, footerBox])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        column.layer.cornerRadius = Radius.radiusLg
        column.layer.cornerCurve = .continuous
        column.clipsToBounds = true
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        render()
    }

    func load(machineId: String, cwd: String, projectId: String, online: Bool, machineName: String) {
        self.online = online
        self.machineName = machineName
        defer { render() }
        guard loadedFor != projectId else { return }
        loadedFor = projectId
        self.machineId = machineId
        path = "\(cwd)/CLAUDE.md"
        content = nil
        read = false
        failure = nil
        editing = false
        Task { @MainActor [weak self, hub, path] in
            do {
                let text = try await hub.readFile(machineId: machineId, path: path)
                self?.content = text
            } catch {
                // A file that is not there is the empty card, not an error.
                if !error.localizedDescription.contains("does not exist") { self?.failure = error.localizedDescription }
            }
            self?.read = true
            self?.render()
        }
    }

    /// Two lines of meta type: one size in every state.
    private static let boxHeight = (TypeScale.typeMeta.points * 1.35 * 2).rounded(.up) + Space.space2 * 2

    private func render() {
        meta.text = failure
        meta.isHidden = failure == nil
        actions.arrangedSubviews.forEach { $0.removeFromSuperview() }
        (footer.superview as? UIStackView)?.isHidden = !editing
        if editing {
            var ghost = UIButton.Configuration.plain()
            ghost.attributedTitle = AttributedString("Cancel", attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkStrong)))
            ghost.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
            let cancel = UIButton(configuration: ghost, primaryAction: UIAction { [weak self] _ in
                self?.editing = false
                self?.render()
            })
            cancel.isEnabled = !saving
            cancel.houseStyle()
            let save = KitButton.make(saving ? "Saving…" : "Save", variant: .outline, height: .xs) { [weak self] in self?.save() }
            save.isEnabled = draft != (content ?? "")
            save.configuration?.showsActivityIndicator = saving
            if saveFailed { save.configuration?.background.strokeColor = Palette.destructive }
            actions.addArrangedSubview(cancel)
            actions.addArrangedSubview(save)
        } else if !read {
            let bar = SkeletonView(height: 24)
            bar.widthAnchor.constraint(equalToConstant: 40).isActive = true
            actions.addArrangedSubview(bar)
        } else if canEdit, content != nil {
            actions.addArrangedSubview(KitButton.make("Edit", variant: .outline, height: .xs) { [weak self] in self?.edit() })
        }

        let key = editing ? "editing" : (!read ? "loading" : (content == nil ? "empty:\(online)" : "summary"))
        guard key != bodyKey else { return }
        bodyKey = key
        switch key {
        case "loading":
            let lines = UIStackView(arrangedSubviews: [SkeletonView(height: 12), SkeletonView(height: 12)])
            lines.axis = .vertical
            lines.spacing = Space.space2
            lines.arrangedSubviews[1].widthAnchor.constraint(equalTo: lines.widthAnchor, multiplier: 2.0 / 3).isActive = true
            body.show(box(lines))
        case "editing":
            guard let editor else { return }
            let view = editor(draft) { [weak self] text in
                self?.draft = text
                self?.render()
            }
            view.heightAnchor.constraint(lessThanOrEqualToConstant: UIScreen.main.bounds.height * 0.6).isActive = true
            body.show(view, holdHeight: true)
        case "summary":
            body.show(box(line("Project memory — every session started here reads it.")))
        default:
            let text = online
                ? "No CLAUDE.md in this project — click to create it."
                : "No machine online — \(machineName) has to be up to read this file."
            if online, canEdit {
                // The empty card is the way in to writing one.
                let row = TapControl()
                let label = line(text)
                label.isUserInteractionEnabled = false
                let inner = box(label)
                inner.isUserInteractionEnabled = false
                inner.translatesAutoresizingMaskIntoConstraints = false
                row.addSubview(inner)
                NSLayoutConstraint.activate([
                    inner.topAnchor.constraint(equalTo: row.topAnchor),
                    inner.bottomAnchor.constraint(equalTo: row.bottomAnchor),
                    inner.leadingAnchor.constraint(equalTo: row.leadingAnchor),
                    inner.trailingAnchor.constraint(equalTo: row.trailingAnchor),
                ])
                row.addAction(UIAction { [weak self] _ in self?.edit() }, for: .primaryActionTriggered)
                row.isAccessibilityElement = true
                row.accessibilityLabel = text
                row.accessibilityTraits = .button
                body.show(row)
            } else {
                body.show(box(line(text)))
            }
        }
    }

    /// Writing is offered while the machine is up and the app has an editor.
    private var canEdit: Bool { online && editor != nil }

    private func line(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground, lines: 2)
        label.text = text
        return label
    }

    private func box(_ view: UIView) -> UIView {
        let stack = UIStackView(arrangedSubviews: [view, UIView()])
        stack.axis = .vertical
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        stack.heightAnchor.constraint(equalToConstant: Self.boxHeight).isActive = true
        return stack
    }

    private func edit() {
        guard canEdit else { return }
        draft = content ?? ""
        editing = true
        render()
    }

    private func save() {
        guard !saving else { return }
        saving = true
        saveFailed = false
        failure = nil
        render()
        Task { @MainActor [weak self, hub, machineId, path, draft] in
            do {
                _ = try await hub.writeFile(machineId: machineId, path: path, content: draft)
                self?.content = draft
                self?.editing = false
            } catch {
                self?.saveFailed = true
                self?.failure = error.localizedDescription
            }
            self?.saving = false
            self?.render()
        }
    }
}
