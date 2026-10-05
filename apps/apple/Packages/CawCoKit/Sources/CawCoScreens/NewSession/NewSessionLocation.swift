import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// Location (spawn/LocationChip.svelte over LocationSection.svelte, embedded):
// Existing files | Clone from GitHub. The directory browser lists the chosen
// machine's real filesystem.

enum LocationMode { case dir, repo }

/// A panel that opens by growing to its content's height and folds shut the
/// same way (motion/fold.svelte.ts): the caller lays it out inside its own
/// animation over `durPanel` on the in-out curve.
final class NsFold: UIView {
    private var shut: NSLayoutConstraint!
    private var full: NSLayoutConstraint!
    private(set) var open: Bool

    init(_ content: UIView, open: Bool) {
        self.open = open
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        shut = heightAnchor.constraint(equalToConstant: 0)
        full = content.bottomAnchor.constraint(equalTo: bottomAnchor)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: topAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        set(open)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsFold is built in code") }

    func set(_ next: Bool) {
        open = next
        // One at a time, the outgoing one first, so the two never conflict.
        if next { shut.isActive = false; full.isActive = true } else { full.isActive = false; shut.isActive = true }
        accessibilityElementsHidden = !next
        isUserInteractionEnabled = next
    }
}

final class LocationPopover: NsPopoverController, UITextFieldDelegate {
    struct Seed {
        var mode: LocationMode
        var dir: String
        var repo: String
        var locked: Bool
        var machineId: String
        var machineName: String
    }

    private let hub: HubConnection
    private var seed: Seed
    var onMode: (LocationMode) -> Void = { _ in }
    var onDir: (String) -> Void = { _ in }
    var onRepo: (String) -> Void = { _ in }
    var onOverride: () -> Void = {}
    /// The location is set (Return in a field, or "Use this folder"): the popover closes.
    var onCommit: () -> Void = {}

    private let field = UIView()
    private let dirInput = UITextField()
    private let repoInput = UITextField()
    private let trailing = UIStackView()
    private lazy var browse = NsLabelButton(bordered: true, height: phone ? 44 : 30)
    private var browserFold: NsFold!
    private var repoFold: NsFold!
    private let repoBody = UIStackView()
    private let note = KitLabel(TypeScale.typeMeta, lines: 0)
    // The browser.
    private var browsing = false
    private var path = "~"
    private var folders: [Components.Schemas.FsEntry] = []
    private var listing = false
    private var listError = ""
    private var request = 0
    private let ancestors = UIStackView()
    private let current = UIButton(type: .custom)
    private let folderRows = UIStackView()
    private let usePath = KitLabel(TypeScale.typeMeta.with(weight: .regular, leading: 1.3, family: FontFamily.fontMono), ink: Palette.inkMuted)

    private var phone: Bool { traitCollection.horizontalSizeClass == .compact }
    private var mono: TypeRole { TypeScale.typeLabel.with(weight: .regular, points: phone ? 16 : nil, leading: 1.4, family: FontFamily.fontMono) }
    private static let strong = TypeScale.typeLabel.with(weight: .medium, leading: 1)

    init(hub: HubConnection, seed: Seed) {
        self.hub = hub
        self.seed = seed
        super.init(width: 440, gap: 2)
        resize = (Motion.durPanel, Motion.easeInOut)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 8
        column.alignment = .fill
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4)

        // The GitHub mark as the web draws it, at 60% while it is not the chosen source.
        let github = BrandLogo.github.image
        let source = NsSegmented([
            ("Existing files", Glyph.folder.image, Palette.hueAmber500, nil),
            ("Clone from GitHub", github, nil, nsSized(github, 16, template: false, alpha: 0.6)),
        ], selected: seed.mode == .dir ? 0 : 1)
        source.onChange = { [weak self] index in self?.choose(index == 0 ? .dir : .repo) }
        // `justify-self: start`: the switch hugs its items.
        source.setContentHuggingPriority(.required, for: .horizontal)
        let sourceRow = UIStackView(arrangedSubviews: [source, UIView()])
        column.addArrangedSubview(sourceRow)

        buildField()
        column.addArrangedSubview(field)
        buildRepo()
        column.addArrangedSubview(repoFold)
        // The fold shut leaves no gap of its own under the field.
        column.setCustomSpacing(seed.mode == .repo ? 8 : 0, after: field)
        self.column = column
        rows.addArrangedSubview(column)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (popover: LocationPopover, _: UITraitCollection) in popover.paint() }
        paint()
        renderTrailing()
        fit()
        arrive()
    }

    private var column: UIStackView!

    private func input(_ input: UITextField, placeholder: String, label: String) {
        input.font = mono.font
        input.textColor = Palette.inkStrong
        input.attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.font: mono.font, .foregroundColor: Palette.inkSubtle])
        input.autocapitalizationType = .none
        input.autocorrectionType = .no
        input.spellCheckingType = .no
        input.smartDashesType = .no
        input.smartQuotesType = .no
        input.returnKeyType = .done
        input.delegate = self
        input.accessibilityLabel = label
        input.setContentHuggingPriority(UILayoutPriority(1), for: .horizontal)
        input.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }

    // MARK: The directory field and its browser

    private func buildField() {
        field.layer.cornerRadius = Radius.radiusMd
        field.layer.cornerCurve = .continuous
        field.layer.borderWidth = 1
        field.clipsToBounds = true
        input(dirInput, placeholder: "~/code/project", label: "Directory")
        dirInput.text = seed.dir
        dirInput.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            seed.dir = dirInput.text ?? ""
            onDir(seed.dir)
        }, for: .editingChanged)
        trailing.spacing = 8
        trailing.alignment = .center
        // The path takes the room; what trails it keeps its own width.
        trailing.setContentHuggingPriority(.required, for: .horizontal)
        trailing.setContentCompressionResistancePriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [GlyphView(.folderOpen, size: 16, tint: Palette.hueAmber500), dirInput, trailing])
        row.spacing = 8
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 6)
        row.heightAnchor.constraint(equalToConstant: phone ? 56 : 42).isActive = true

        browse.addAction(UIAction { [weak self] _ in self?.toggleBrowse() }, for: .touchUpInside)

        browserFold = NsFold(buildBrowser(), open: false)
        let stack = UIStackView(arrangedSubviews: [row, browserFold])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        field.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: field.topAnchor),
            stack.bottomAnchor.constraint(equalTo: field.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: field.trailingAnchor),
        ])
    }

    private func paint() {
        let traits = traitCollection
        field.backgroundColor = seed.locked ? Palette.surfaceRecess : Palette.surfaceRaised
        field.layer.borderColor = Palette.borderControl.resolvedColor(with: traits).cgColor
    }

    /// Locked to a project: its badge and Override. Otherwise Browse, or Close while browsing.
    private func renderTrailing() {
        trailing.arrangedSubviews.forEach { $0.removeFromSuperview() }
        dirInput.isEnabled = !seed.locked
        if seed.locked {
            let badge = KitLabel(Self.strong, ink: Palette.statusLiveInk)
            badge.text = "From project"
            let pill = UIView()
            pill.backgroundColor = Palette.statusLiveBg
            pill.layer.cornerRadius = Radius.radiusSm
            pill.layer.cornerCurve = .continuous
            pill.translatesAutoresizingMaskIntoConstraints = false
            pill.addSubview(badge)
            NSLayoutConstraint.activate([
                pill.heightAnchor.constraint(equalToConstant: 24),
                badge.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 8),
                badge.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -8),
                badge.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
            ])
            let override = NsLabelButton(bordered: false, height: phone ? 44 : 30)
            override.show(nil, "Override")
            override.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                seed.locked = false
                onOverride()
                paint()
                renderTrailing()
                dirInput.becomeFirstResponder()
            }, for: .touchUpInside)
            for (i, view) in [pill, override].enumerated() {
                trailing.addArrangedSubview(view)
                enter(view, delay: Double(i) * 0.04)
            }
        } else {
            browse.show(browsing ? .chevronUp : .search, browsing ? "Close" : "Browse")
            browse.isEnabled = !seed.machineId.isEmpty
            browse.accessibilityValue = browsing ? "Expanded" : "Collapsed"
            if browse.superview == nil {
                trailing.addArrangedSubview(browse)
            }
        }
    }

    /// `.ns-in`: from 8pt down and transparent, over `durFade` on the out curve.
    private func enter(_ view: UIView, delay: Double) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        view.alpha = 0
        view.transform = CGAffineTransform(translationX: 0, y: 8)
        Motion.easeOut.animator(Motion.durFade) {
            view.alpha = 1
            view.transform = .identity
        }.startAnimation(afterDelay: delay)
    }

    private func buildBrowser() -> UIView {
        let browser = UIStackView()
        browser.axis = .vertical

        // Crumbs: the machine, then the trail; the last segment is where it stands.
        let machine = KitLabel(Self.strong, ink: Palette.inkStrong)
        machine.text = seed.machineName
        let dot = UIView()
        dot.backgroundColor = Palette.hueGreen500
        dot.layer.cornerRadius = 3
        dot.translatesAutoresizingMaskIntoConstraints = false
        let pillRow = UIStackView(arrangedSubviews: [dot, machine])
        pillRow.spacing = 6
        pillRow.alignment = .center
        pillRow.translatesAutoresizingMaskIntoConstraints = false
        let pill = UIView()
        pill.backgroundColor = Palette.surfaceLift
        pill.layer.cornerRadius = Radius.radiusSm
        pill.layer.cornerCurve = .continuous
        pill.addSubview(pillRow)
        pill.setContentHuggingPriority(.required, for: .horizontal)
        pill.setContentCompressionResistancePriority(.required, for: .horizontal)
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 6),
            dot.heightAnchor.constraint(equalToConstant: 6),
            pill.heightAnchor.constraint(equalToConstant: 24),
            pillRow.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 8),
            pillRow.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -8),
            pillRow.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
        ])
        ancestors.spacing = 2
        ancestors.alignment = .center
        ancestors.translatesAutoresizingMaskIntoConstraints = false
        let ancestorScroll = UIScrollView()
        ancestorScroll.showsHorizontalScrollIndicator = false
        ancestorScroll.addSubview(ancestors)
        ancestorScroll.setContentHuggingPriority(.defaultLow, for: .horizontal)
        ancestorScroll.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let shrink = ancestorScroll.widthAnchor.constraint(equalTo: ancestors.widthAnchor)
        shrink.priority = .defaultLow
        NSLayoutConstraint.activate([
            ancestors.topAnchor.constraint(equalTo: ancestorScroll.contentLayoutGuide.topAnchor),
            ancestors.bottomAnchor.constraint(equalTo: ancestorScroll.contentLayoutGuide.bottomAnchor),
            ancestors.leadingAnchor.constraint(equalTo: ancestorScroll.contentLayoutGuide.leadingAnchor),
            ancestors.trailingAnchor.constraint(equalTo: ancestorScroll.contentLayoutGuide.trailingAnchor),
            ancestors.heightAnchor.constraint(equalTo: ancestorScroll.frameLayoutGuide.heightAnchor),
            ancestorScroll.heightAnchor.constraint(equalToConstant: 44),
            shrink,
        ])
        self.ancestorScroll = ancestorScroll
        current.layer.cornerRadius = Radius.radiusXs
        current.layer.cornerCurve = .continuous
        current.backgroundColor = Palette.surfaceLift
        current.addAction(UIAction { [weak self] _ in self.map { $0.list($0.path) } }, for: .touchUpInside)
        current.setContentCompressionResistancePriority(.required, for: .horizontal)
        let crumbs: UIStackView
        if phone {
            // The trail takes its own line under the machine: ancestors, then where it stands.
            let trail = UIStackView(arrangedSubviews: [ancestorScroll, UIStackView(arrangedSubviews: [current, UIView()])])
            trail.axis = .vertical
            crumbs = UIStackView(arrangedSubviews: [UIStackView(arrangedSubviews: [pill, UIView()]), trail])
            crumbs.axis = .vertical
        } else {
            crumbs = UIStackView(arrangedSubviews: [pill, ancestorScroll, current, UIView()])
            crumbs.alignment = .center
            crumbs.setCustomSpacing(2, after: ancestorScroll)
        }
        crumbs.spacing = 8
        crumbs.isLayoutMarginsRelativeArrangement = true
        crumbs.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 8)

        // The folders: at most 196pt of them, scrolling inside.
        folderRows.axis = .vertical
        folderRows.spacing = 1
        folderRows.translatesAutoresizingMaskIntoConstraints = false
        let folderScroll = UIScrollView()
        folderScroll.addSubview(folderRows)
        let tall = folderScroll.heightAnchor.constraint(equalTo: folderRows.heightAnchor, constant: 12)
        tall.priority = .defaultHigh
        NSLayoutConstraint.activate([
            folderRows.topAnchor.constraint(equalTo: folderScroll.contentLayoutGuide.topAnchor, constant: 6),
            folderRows.bottomAnchor.constraint(equalTo: folderScroll.contentLayoutGuide.bottomAnchor, constant: -6),
            folderRows.leadingAnchor.constraint(equalTo: folderScroll.frameLayoutGuide.leadingAnchor, constant: 6),
            folderRows.trailingAnchor.constraint(equalTo: folderScroll.frameLayoutGuide.trailingAnchor, constant: -6),
            folderScroll.heightAnchor.constraint(lessThanOrEqualToConstant: 196),
            tall,
        ])
        self.folderScroll = folderScroll

        // Use this folder: where it stands, and the button that takes it.
        usePath.lineBreakMode = .byTruncatingMiddle
        usePath.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        usePath.setContentHuggingPriority(UILayoutPriority(1), for: .horizontal)
        let use = NsButton("Use this folder", primary: true, size: .sm) { [weak self] in self?.useFolder() }
        use.setContentCompressionResistancePriority(.required, for: .horizontal)
        let useRow = UIStackView(arrangedSubviews: [usePath, use])
        useRow.spacing = 8
        if phone {
            useRow.axis = .vertical
            useRow.alignment = .fill
            use.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        } else {
            useRow.alignment = .center
        }
        useRow.isLayoutMarginsRelativeArrangement = true
        useRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
        let useBand = UIView()
        useBand.backgroundColor = Palette.surfaceLift
        useRow.translatesAutoresizingMaskIntoConstraints = false
        useBand.addSubview(useRow)
        NSLayoutConstraint.activate([
            useRow.topAnchor.constraint(equalTo: useBand.topAnchor),
            useRow.bottomAnchor.constraint(equalTo: useBand.bottomAnchor),
            useRow.leadingAnchor.constraint(equalTo: useBand.leadingAnchor),
            useRow.trailingAnchor.constraint(equalTo: useBand.trailingAnchor),
        ])

        for view in [Self.hairline(), crumbs, Self.hairline(), folderScroll, Self.hairline(), useBand] as [UIView] { browser.addArrangedSubview(view) }
        let ground = UIView()
        ground.backgroundColor = Palette.surfaceRecess
        browser.translatesAutoresizingMaskIntoConstraints = false
        ground.addSubview(browser)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: ground.topAnchor),
            browser.bottomAnchor.constraint(equalTo: ground.bottomAnchor),
            browser.leadingAnchor.constraint(equalTo: ground.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: ground.trailingAnchor),
        ])
        return ground
    }

    private var ancestorScroll: UIScrollView!
    private var folderScroll: UIScrollView!

    private static func hairline() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    private var crumbs: [(label: String, to: String)] {
        let root = path.hasPrefix("/") ? "/" : "~"
        let rest = path.replacing(/^~\/?|^\//, with: "").split(separator: "/").map(String.init)
        return [(root, root)] + rest.indices.map { i in
            (rest[i], (root == "/" ? "" : root) + "/" + rest[...i].joined(separator: "/"))
        }
    }

    private func crumb(_ label: String, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 6, bottom: 0, trailing: 6)
        config.attributedTitle = AttributedString(label, attributes: AttributeContainer(mono.attributes(color: Palette.inkMuted)))
        let button = UIButton(configuration: config)
        button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return button
    }

    private func renderBrowser() {
        let trail = crumbs
        ancestors.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for step in trail.dropLast() {
            ancestors.addArrangedSubview(crumb(step.label) { [weak self] in self?.list(step.to) })
            let separator = KitLabel(mono, ink: Palette.neutral8)
            separator.text = "/"
            separator.isAccessibilityElement = false
            ancestors.addArrangedSubview(separator)
        }
        ancestorScroll.isHidden = trail.count < 2
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
        config.titleLineBreakMode = .byCharWrapping
        config.attributedTitle = AttributedString(trail.last?.label ?? "", attributes: AttributeContainer(mono.with(weight: .medium).attributes(color: Palette.inkStrong)))
        current.configuration = config
        current.accessibilityLabel = "\(trail.last?.label ?? ""), current folder"
        usePath.text = path

        folderRows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if trail.count > 1 {
            folderRows.addArrangedSubview(folderRow(glyph: .arrowLeft, tint: Palette.inkMuted, name: "Parent folder", ink: Palette.inkMuted, go: false) { [weak self] in
                guard let self else { return }
                list(trail[trail.count - 2].to)
            })
        }
        if listing {
            folderRows.addArrangedSubview(MachinesPopover.note("Loading folders...", pad: 24))
        } else if !listError.isEmpty {
            folderRows.addArrangedSubview(MachinesPopover.note(listError, pad: 24, ink: Palette.statusFailInk))
        } else {
            for folder in folders {
                let tint = folder.name.hasPrefix(".") ? Palette.neutral8 : Palette.hueAmber500
                folderRows.addArrangedSubview(folderRow(glyph: .folder, tint: tint, name: folder.name, ink: Palette.inkStrong, go: true) { [weak self] in
                    guard let self else { return }
                    list((path == "/" ? "" : path.replacing(/\/+$/, with: "")) + "/" + folder.name)
                })
            }
            if folders.isEmpty {
                folderRows.addArrangedSubview(MachinesPopover.note("No subfolders", pad: 24))
            }
        }
        folderScroll.setContentOffset(.zero, animated: false)
        fit()
    }

    /// `.folder`: 34pt (44 under a finger), 8pt in, 10pt between its glyph,
    /// its name in mono at label size, and the arrow that says it opens.
    private func folderRow(glyph: Glyph, tint: UIColor, name: String, ink: UIColor, go: Bool, action: @escaping () -> Void) -> UIControl {
        let label = KitLabel(TypeScale.typeLabel.with(weight: .regular, leading: 1, family: FontFamily.fontMono), ink: ink)
        label.text = name
        label.lineBreakMode = .byTruncatingTail
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        var parts: [UIView] = [GlyphView(glyph, size: 16, tint: tint), label]
        if go { parts += [UIView(), GlyphView(.arrowRight, size: 16, tint: Palette.neutral8)] } else { parts.append(UIView()) }
        let content = UIStackView(arrangedSubviews: parts)
        content.spacing = 10
        content.alignment = .center
        let row = FolderRow(content, height: phone ? 44 : 34)
        row.accessibilityLabel = name
        row.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return row
    }

    private func list(_ next: String) {
        request += 1
        let id = request
        listing = true
        listError = ""
        renderBrowser()
        Task { [weak self] in
            guard let self else { return }
            do {
                let rows = try await hub.listFiles(machineId: seed.machineId, path: next)
                guard id == request else { return }
                path = next
                folders = rows.filter { $0.kind == .dir }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            } catch {
                guard id == request else { return }
                listError = error.localizedDescription
            }
            listing = false
            renderBrowser()
        }
    }

    private func toggleBrowse() {
        setBrowsing(!browsing)
        if browsing {
            let start = (dirInput.text ?? "").trimmingCharacters(in: .whitespaces).replacing(/\/+$/, with: "")
            list(start.hasPrefix("/") || start.hasPrefix("~") ? start : "~")
        }
    }

    private func setBrowsing(_ next: Bool) {
        guard next != browsing else { return }
        browsing = next
        if next { view.endEditing(true) }
        browserFold.set(next)
        renderTrailing()
        fit()
    }

    private func useFolder() {
        seed.dir = path
        dirInput.text = path
        onDir(path)
        setBrowsing(false)
        onCommit()
    }

    // MARK: Clone from GitHub

    private func buildRepo() {
        input(repoInput, placeholder: "owner/repository", label: "Repository")
        repoInput.text = seed.repo
        repoInput.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            seed.repo = repoInput.text ?? ""
            onRepo(seed.repo)
        }, for: .editingChanged)
        let mark = UIImageView(image: BrandLogo.github.image)
        mark.alpha = 0.8
        mark.contentMode = .scaleAspectFit
        mark.translatesAutoresizingMaskIntoConstraints = false
        let row = UIStackView(arrangedSubviews: [mark, repoInput])
        row.spacing = 8
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12)
        row.translatesAutoresizingMaskIntoConstraints = false
        let box = UIView()
        box.backgroundColor = Palette.surfaceRaised
        box.layer.cornerRadius = Radius.radiusMd
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        box.addSubview(row)

        note.wrap = .pretty
        renderNote()
        let noteRow = UIStackView(arrangedSubviews: [GlyphView(.refresh, size: 16, tint: Palette.hueBlue500), note])
        noteRow.spacing = 8
        noteRow.alignment = .top
        noteRow.isLayoutMarginsRelativeArrangement = true
        noteRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 9, leading: 10, bottom: 9, trailing: 10)
        noteRow.translatesAutoresizingMaskIntoConstraints = false
        let noteBox = UIView()
        noteBox.backgroundColor = Palette.surfaceRecess
        noteBox.layer.cornerRadius = Radius.radiusMd
        noteBox.layer.cornerCurve = .continuous
        noteBox.layer.borderWidth = 1
        noteBox.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        noteBox.addSubview(noteRow)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 16),
            mark.heightAnchor.constraint(equalToConstant: 16),
            row.heightAnchor.constraint(equalToConstant: phone ? 46 : 42),
            row.topAnchor.constraint(equalTo: box.topAnchor),
            row.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            row.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            noteRow.topAnchor.constraint(equalTo: noteBox.topAnchor),
            noteRow.bottomAnchor.constraint(equalTo: noteBox.bottomAnchor),
            noteRow.leadingAnchor.constraint(equalTo: noteBox.leadingAnchor),
            noteRow.trailingAnchor.constraint(equalTo: noteBox.trailingAnchor),
        ])
        repoBody.axis = .vertical
        repoBody.spacing = 8
        repoBody.addArrangedSubview(box)
        repoBody.addArrangedSubview(noteBox)
        repoFold = NsFold(repoBody, open: seed.mode == .repo)
        repoBody.alpha = seed.mode == .repo ? 1 : 0
    }

    /// "Cloned into <dir> on each machine, pulled fresh before the agent starts."
    private func renderNote() {
        let meta = TypeScale.typeMeta
        let text = NSMutableAttributedString(string: "Cloned into ", attributes: meta.attributes(color: Palette.inkMuted))
        let dir = seed.dir.trimmingCharacters(in: .whitespaces)
        var monoInk = meta.with(family: FontFamily.fontMono).attributes(color: Palette.inkStrong)
        monoInk[.paragraphStyle] = nil
        text.append(NSAttributedString(string: dir.isEmpty ? "~" : dir, attributes: monoInk))
        text.append(NSAttributedString(string: " on each machine, pulled fresh before the agent starts.", attributes: meta.attributes(color: Palette.inkMuted)))
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.minimumLineHeight = meta.lineHeight
        paragraph.maximumLineHeight = meta.lineHeight
        text.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: text.length))
        note.attributedText = text
    }

    private func choose(_ mode: LocationMode) {
        guard mode != seed.mode else { return }
        seed.mode = mode
        if mode == .repo {
            // A clone names its own folder: no project, no lock, and a base to clone into.
            seed.locked = false
            if seed.dir.isEmpty {
                seed.dir = "~"
                dirInput.text = "~"
            }
            setBrowsing(false)
        }
        onMode(mode)
        renderNote()
        paint()
        renderTrailing()
        repoFold.set(mode == .repo)
        column.setCustomSpacing(mode == .repo ? 8 : 0, after: field)
        let show = mode == .repo
        if UIAccessibility.isReduceMotionEnabled {
            repoBody.alpha = show ? 1 : 0
        } else {
            if show { repoBody.transform = CGAffineTransform(translationX: 0, y: -12) }
            Motion.easeInOut.animator(Motion.durPanel) { self.repoBody.transform = show ? .identity : CGAffineTransform(translationX: 0, y: -12) }.startAnimation()
            Motion.easeOut.animator(Motion.durPanel) { self.repoBody.alpha = show ? 1 : 0 }.startAnimation()
        }
        fit()
    }

    // MARK: Fields

    func textFieldShouldReturn(_: UITextField) -> Bool {
        onCommit()
        return false
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        if textField === dirInput { renderNote() }
    }
}

/// A folder in the browser: a press tints it.
private final class FolderRow: UIControl {
    init(_ content: UIView, height: Double) {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: height),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("FolderRow is built in code") }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }
}
