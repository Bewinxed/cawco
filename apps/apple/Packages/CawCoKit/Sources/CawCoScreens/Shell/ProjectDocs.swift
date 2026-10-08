import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

// A project's docs (project/[id]/+page.svelte, docs.ts): the repo's own
// markdown, read through the machine's files, never stored by CawCo.

/// A markdown file in the project, by its path relative to the checkout.
struct ProjectDoc: Equatable {
    /// `README.md`, or `docs/architecture.md`: what the picker shows.
    let name: String
    let path: String

    /// docs.ts `readDocs`: the root's markdown (README, then PRD*, then NEW,
    /// then the rest by name), then `docs/` and `doc/`, each by name.
    @MainActor
    static func read(hub: HubConnection, machineId: String, cwd: String) async throws -> [ProjectDoc] {
        let markdown = { (entry: Components.Schemas.FsEntry) in
            entry.kind == .file && entry.name.range(of: #"\.mdx?$"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
        let stem = { (name: String) in name.replacingOccurrences(of: #"\.mdx?$"#, with: "", options: [.regularExpression, .caseInsensitive]).uppercased() }
        let rank = { (name: String) -> Int in
            let stem = stem(name)
            if stem == "README" { return 0 }
            if stem.hasPrefix("PRD") { return 1 }
            if stem == "NEW" { return 2 }
            return 3
        }
        let entries = try await hub.listFiles(machineId: machineId, path: cwd)
        let root = entries.filter(markdown)
            .sorted { rank($0.name) != rank($1.name) ? rank($0.name) < rank($1.name) : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            .map { ProjectDoc(name: $0.name, path: "\(cwd)/\($0.name)") }
        var nested: [ProjectDoc] = []
        for dir in entries where dir.kind == .dir && ["docs", "doc"].contains(dir.name) {
            let inside = try await hub.listFiles(machineId: machineId, path: "\(cwd)/\(dir.name)")
            nested += inside.filter(markdown).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
                .map { ProjectDoc(name: "\(dir.name)/\($0.name)", path: "\(cwd)/\(dir.name)/\($0.name)") }
        }
        return root + nested
    }
}

/// The docs card and its picker: on a phone a select above it, wider the
/// kit's segmented control across it. The card's header names the file and
/// carries Edit, or Cancel and Save; its body is the document clamped to 24
/// lines with "Read more" (lifted to 70% of the screen, scrolling), the
/// editor (a mono textarea 60% of the screen tall), a skeleton the size the
/// document will be while it is read, "No markdown yet", or why the docs
/// could not be listed. Each change cross-fades while the body's height
/// moves over `durPanel` on the in-out curve.
final class ProjectDocsView: UIStackView {
    private let hub: HubConnection
    private var machineId = ""
    private var cwd = ""
    private var loadedFor = ""
    private var docs: [ProjectDoc]?
    private var open: ProjectDoc?
    private var content = ""
    private var shown: String?
    private var draft: String?
    private var docsError: String?
    private var docError: String?
    private var saving = false
    private var expanded = false

    private let picker = UIStackView()
    private let card = TileView(radius: Radius.radiusLg)
    private let headerRow = UIStackView()
    private let nameLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeLabel.points), ink: Palette.inkMuted)
    private let errorLabel = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.error)
    private let headerActions = UIStackView()
    private let body = CrossView()
    private let document = MarkdownDocumentView()
    /// 24 lines of prose-sm's 24pt line box, and the Read more row's 36.
    private static let clamp = 24.0 * 24
    var onResize: () -> Void = {}

    init(hub: HubConnection) {
        self.hub = hub
        super.init(frame: .zero)
        axis = .vertical
        // `gap-4` between the picker and the card, beside it or under it.
        spacing = 16
        picker.axis = .horizontal
        addArrangedSubview(picker)
        nameLabel.lineBreakMode = .byTruncatingTail
        errorLabel.isHidden = true
        headerActions.spacing = Space.space2
        headerRow.addArrangedSubview(nameLabel)
        headerRow.addArrangedSubview(errorLabel)
        headerRow.addArrangedSubview(UIView())
        headerRow.addArrangedSubview(headerActions)
        headerRow.spacing = Space.space3
        headerRow.alignment = .center
        headerRow.isLayoutMarginsRelativeArrangement = true
        headerRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        headerRow.heightAnchor.constraint(greaterThanOrEqualToConstant: 30 + Space.space2 * 2).isActive = true
        let rule = UIView()
        rule.backgroundColor = Palette.border
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        let column = UIStackView(arrangedSubviews: [headerRow, rule, body])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(column)
        // `shadow-md` on the card; its content is what the corners clip.
        card.boxShadow = Shadow.shadowMd
        column.layer.cornerRadius = Radius.radiusLg
        column.layer.cornerCurve = .continuous
        column.clipsToBounds = true
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: card.topAnchor),
            column.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor),
        ])
        addArrangedSubview(card)
        render()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ProjectDocsView is built in code")
    }

    /// Reads the project's docs once per project, as the page opens.
    func load(machineId: String, cwd: String, projectId: String) {
        guard loadedFor != projectId else { return }
        loadedFor = projectId
        self.machineId = machineId
        self.cwd = cwd
        docs = nil
        open = nil
        shown = nil
        draft = nil
        docsError = nil
        render()
        Task { @MainActor [weak self, hub] in
            do {
                let listed = try await ProjectDoc.read(hub: hub, machineId: machineId, cwd: cwd)
                guard let self else { return }
                docs = listed
                render()
                if let first = listed.first { choose(first) }
            } catch {
                self?.docsError = error.localizedDescription
                self?.render()
            }
        }
    }

    /// The document on screen stays until the next is read, then the two cross-fade.
    private func choose(_ doc: ProjectDoc) {
        open = doc
        docError = nil
        draft = nil
        renderHeader()
        if let segmented, let index = docs?.firstIndex(of: doc) { segmented.select(index) } else { renderPicker() }
        Task { @MainActor [weak self, hub, machineId] in
            var next = ""
            do {
                next = try await hub.readFile(machineId: machineId, path: doc.path)
            } catch {
                if self?.open == doc { self?.docError = error.localizedDescription }
            }
            guard let self, open == doc else { return }
            content = next
            shown = doc.path
            expanded = false
            render()
        }
    }

    private func save() {
        guard let open, let text = draft, !saving else { return }
        saving = true
        docError = nil
        renderHeader()
        Task { @MainActor [weak self, hub, machineId] in
            do {
                _ = try await hub.writeFile(machineId: machineId, path: open.path, content: text)
                self?.content = text
                self?.draft = nil
            } catch {
                self?.docError = error.localizedDescription
            }
            self?.saving = false
            self?.render()
        }
    }

    // MARK: Render

    private func render() {
        renderPicker()
        renderHeader()
        renderBody()
    }

    /// How the docs are picked, by the window's width: a select on a phone,
    /// the segmented control across the reader from 768pt, and down a 192pt
    /// column beside it from 1280pt.
    enum Picker: Sendable { case select, across, column }

    var pickerMode = Picker.select {
        didSet {
            guard pickerMode != oldValue else { return }
            axis = pickerMode == .column ? .horizontal : .vertical
            alignment = pickerMode == .column ? .top : .fill
            pickerWidth.isActive = pickerMode == .column
            renderPicker()
            if (oldValue == .select) != phone { renderBody() }
        }
    }

    private lazy var pickerWidth = picker.widthAnchor.constraint(equalToConstant: 192)
    private var phone: Bool { pickerMode == .select }
    /// The body's side padding: `px-[--space-6] md:px-[--space-7]`.
    private var side: Double { phone ? Space.space6 : Space.space7 }

    private func renderPicker() {
        picker.arrangedSubviews.forEach { $0.removeFromSuperview() }
        picker.axis = pickerMode == .column ? .vertical : .horizontal
        guard let docs else {
            if docsError == nil, pickerMode == .column {
                // The well the list will stand in, five rows of it.
                let well = UIStackView()
                well.axis = .vertical
                well.spacing = 2
                well.isLayoutMarginsRelativeArrangement = true
                well.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 3, leading: 3, bottom: 3, trailing: 3)
                well.backgroundColor = Palette.surfaceRecessDeep
                well.layer.cornerRadius = Radius.radiusMd
                well.layer.cornerCurve = .continuous
                for _ in 0 ..< 5 { well.addArrangedSubview(SkeletonView(height: 30)) }
                picker.addArrangedSubview(well)
            } else if docsError == nil {
                let bar = SkeletonView(height: phone ? 36 : 30)
                if !phone { bar.widthAnchor.constraint(equalToConstant: 320).isActive = true }
                picker.addArrangedSubview(bar)
                if !phone { picker.addArrangedSubview(UIView()) }
            } else {
                picker.addArrangedSubview(statusLine("Could not list the docs"))
            }
            return
        }
        guard !docs.isEmpty else {
            picker.addArrangedSubview(statusLine("No markdown yet"))
            return
        }
        if phone {
            // The docs are a Select on a phone.
            let select = KitSelect()
            select.setValue(open?.name ?? "Select a document")
            select.configuration?.attributedTitle = AttributedString(open?.name ?? "Select a document",
                                                                     attributes: AttributeContainer(TypeScale.typeCode.with(points: TypeScale.typeLabel.points).attributes(color: Palette.foreground)))
            select.menu = UIMenu(options: .singleSelection, children: docs.map { doc in
                UIAction(title: doc.name, state: doc == open ? .on : .off) { [weak self] _ in self?.choose(doc) }
            })
            select.accessibilityLabel = "Project docs"
            picker.addArrangedSubview(select)
        } else {
            // `Tabs.List`: the kit's segmented group, its names in the mono face.
            let tabs = KitSegmented(docs.map(\.name), selected: docs.firstIndex { $0 == open }, axis: pickerMode == .column ? .down : .across, mono: true)
            tabs.accessibilityLabel = "Project docs"
            tabs.addAction(UIAction { [weak self, weak tabs] _ in
                guard let self, let index = tabs?.selectedIndex, docs.indices.contains(index) else { return }
                choose(docs[index])
            }, for: .valueChanged)
            segmented = tabs
            if pickerMode == .column {
                picker.addArrangedSubview(tabs)
                return
            }
            let scroller = UIScrollView()
            scroller.showsHorizontalScrollIndicator = false
            tabs.translatesAutoresizingMaskIntoConstraints = false
            scroller.addSubview(tabs)
            NSLayoutConstraint.activate([
                tabs.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor),
                tabs.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor),
                tabs.leadingAnchor.constraint(equalTo: scroller.contentLayoutGuide.leadingAnchor),
                tabs.trailingAnchor.constraint(equalTo: scroller.contentLayoutGuide.trailingAnchor),
                scroller.heightAnchor.constraint(equalTo: tabs.heightAnchor),
            ])
            picker.addArrangedSubview(scroller)
        }
    }

    /// The list on screen: a choice moves its thumb rather than rebuilding it.
    private weak var segmented: KitSegmented?

    private func statusLine(_ text: String) -> UIView {
        let label = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground)
        label.text = text
        label.heightAnchor.constraint(equalToConstant: 36).isActive = true
        return label
    }

    private var docsRead: Bool { docs != nil && (docs!.isEmpty || shown != nil) }

    private func renderHeader() {
        headerActions.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let open, docsRead {
            nameLabel.text = open.name
            nameLabel.font = TypeScale.typeCode.with(points: TypeScale.typeLabel.points).font
        } else if docsError != nil {
            nameLabel.text = "Docs"
            nameLabel.font = TypeScale.typeLabel.withWeight(.regular).font
        } else if docs?.isEmpty == true {
            nameLabel.text = "README.md — not in this checkout"
        } else {
            nameLabel.text = nil
        }
        errorLabel.text = docError
        errorLabel.isHidden = docError == nil
        let waiting = (docs == nil && docsError == nil) || (open != nil && !docsRead)
        if waiting {
            let bar = SkeletonView(height: 30)
            bar.widthAnchor.constraint(equalToConstant: 50).isActive = true
            headerActions.addArrangedSubview(bar)
        } else if open == nil {
            // No doc to edit.
        } else if draft == nil {
            headerActions.addArrangedSubview(KitButton.make("Edit", variant: .outline, height: .sm) { [weak self] in
                guard let self else { return }
                draft = content
                renderHeader()
                renderBody()
            })
        } else {
            let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in
                self?.draft = nil
                self?.renderHeader()
                self?.renderBody()
            }
            let save = KitButton.make(saving ? "Saving…" : "Save", variant: .outline, height: .sm) { [weak self] in self?.save() }
            save.configuration?.showsActivityIndicator = saving
            if docError != nil { save.configuration?.background.strokeColor = Palette.destructive }
            headerActions.addArrangedSubview(cancel)
            headerActions.addArrangedSubview(save)
        }
    }

    private var bodyKey = ""

    private func renderBody() {
        let state: String
        if docsError != nil { state = "unlisted" } else if docs?.isEmpty == true { state = "none" } else if shown == nil { state = "reading" } else { state = "\(shown ?? ""):\(draft == nil ? "read" : "edit"):\(expanded)" }
        let key = "\(state):\(phone)"
        if key == bodyKey, draft == nil, shown != nil {
            document.setSource(content)
            return
        }
        bodyKey = key
        let next: UIView
        if let docsError {
            let alert = KitAlert(docsError, tone: .warning)
            next = padded(alert)
        } else if docs?.isEmpty == true {
            next = empty()
        } else if shown == nil {
            next = skeleton()
        } else if let draft {
            next = editor(draft)
        } else {
            next = reader()
        }
        let previous = card.bounds.height
        body.show(next)
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return onResize() }
        layoutIfNeeded()
        if previous != card.bounds.height {
            onResize()
        }
    }

    private func padded(_ view: UIView) -> UIView {
        let box = UIStackView(arrangedSubviews: [view])
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space4, leading: side, bottom: Space.space4, trailing: side)
        return box
    }

    /// EmptyState: the document glyph, "No markdown yet", and what to do.
    private func empty() -> UIView {
        let mark = GlyphView(.document, size: 20, tint: Palette.inkMuted)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = "No markdown yet"
        let line = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground, lines: 0)
        line.text = "Add a README.md at the top of the checkout and it shows up here."
        line.textAlignment = .center
        line.wrap = .pretty
        let stack = UIStackView(arrangedSubviews: [mark, title, line])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = Space.space2
        let box = padded(stack)
        box.heightAnchor.constraint(greaterThanOrEqualToConstant: Self.clamp + 36).isActive = true
        return box
    }

    /// The size the document will stand at, clamped, with the row its Read more takes.
    private func skeleton() -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.alignment = .leading
        let head = SkeletonView(height: 24)
        stack.addArrangedSubview(head)
        stack.setCustomSpacing(Space.space3 + 12, after: head)
        var widths: [(UIView, Double)] = [(head, 0.4)]
        for _ in 0 ..< 3 {
            for (index, width) in [1.0, 1.0, 0.92, 0.6].enumerated() {
                let bar = SkeletonView(height: 14)
                stack.addArrangedSubview(bar)
                widths.append((bar, width))
                if index == 3 { stack.setCustomSpacing(Space.space3 + 20, after: bar) }
            }
        }
        let box = padded(stack)
        for (bar, width) in widths { bar.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: width).isActive = true }
        box.heightAnchor.constraint(equalToConstant: Self.clamp + 36).isActive = true
        box.clipsToBounds = true
        box.isAccessibilityElement = false
        box.accessibilityElementsHidden = true
        return box
    }

    /// The document, read to a line boundary and stopped: the last lines
    /// fade under the card's edge until Read more lifts the clamp.
    private func reader() -> UIView {
        document.setSource(content)
        let scroll = UIScrollView()
        scroll.isScrollEnabled = expanded
        let inner = padded(document)
        inner.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(inner)
        let natural = scroll.heightAnchor.constraint(equalTo: inner.heightAnchor)
        natural.priority = .defaultHigh
        let cap = scroll.heightAnchor.constraint(lessThanOrEqualToConstant: expanded ? UIScreen.main.bounds.height * 0.7 : Self.clamp)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            inner.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            inner.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            inner.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
            natural, cap,
            inner.widthAnchor.constraint(lessThanOrEqualToConstant: 72 * 7.5 + side * 2),
        ])
        let column = UIStackView(arrangedSubviews: [scroll])
        column.axis = .vertical
        column.layoutIfNeeded()
        // Measured at the card's own width: beside the list and the rail it is far narrower than the window.
        let width = max(1, card.bounds.width > 0 ? card.bounds.width : (window?.bounds.width ?? UIScreen.main.bounds.width) - 48)
        let full = inner.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        let clipped = full > Self.clamp + 4
        if clipped || expanded {
            if !expanded {
                let fade = FadeView()
                fade.translatesAutoresizingMaskIntoConstraints = false
                column.addSubview(fade)
                NSLayoutConstraint.activate([
                    fade.leadingAnchor.constraint(equalTo: scroll.leadingAnchor),
                    fade.trailingAnchor.constraint(equalTo: scroll.trailingAnchor),
                    fade.bottomAnchor.constraint(equalTo: scroll.bottomAnchor),
                    fade.heightAnchor.constraint(equalToConstant: 64),
                ])
            }
            var config = UIButton.Configuration.plain()
            config.attributedTitle = AttributedString(expanded ? "Show less" : "Read more", attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkStrong)))
            let more = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
                guard let self else { return }
                expanded.toggle()
                renderBody()
            })
            more.configurationUpdateHandler = { button in
                button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : (button.isHovered ? Palette.accent : .clear)
            }
            more.houseStyle()
            more.heightAnchor.constraint(equalToConstant: 36).isActive = true
            column.addArrangedSubview(more)
        }
        column.heightAnchor.constraint(greaterThanOrEqualToConstant: Self.clamp + 36).isActive = true
        return column
    }

    /// The editor: the file's text in mono label type, 60% of the screen tall.
    private func editor(_ text: String) -> UIView {
        let view = UITextView()
        view.text = text
        view.font = TypeScale.typeCode.with(points: TypeScale.typeLabel.points).font
        view.textColor = Palette.foreground
        view.backgroundColor = .clear
        view.autocorrectionType = .no
        view.autocapitalizationType = .none
        view.spellCheckingType = .no
        view.textContainerInset = UIEdgeInsets(top: Space.space4, left: side, bottom: Space.space4, right: side)
        view.accessibilityLabel = open?.name
        view.delegate = editorDelegate
        editorDelegate.onChange = { [weak self] value in self?.draft = value }
        view.heightAnchor.constraint(equalToConstant: UIScreen.main.bounds.height * 0.6).isActive = true
        return view
    }

    private let editorDelegate = EditorDelegate()

    private final class EditorDelegate: NSObject, UITextViewDelegate {
        var onChange: (String) -> Void = { _ in }
        func textViewDidChange(_ textView: UITextView) { onChange(textView.text) }
    }

    /// `bg-linear-to-b from-transparent to-card`.
    private final class FadeView: UIView {
        override class var layerClass: AnyClass { CAGradientLayer.self }
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: FadeView, _: UITraitCollection) in view.paint() }
            paint()
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("FadeView is built in code")
        }

        private func paint() {
            let card = Palette.surfaceRaised.resolvedColor(with: traitCollection)
            (layer as? CAGradientLayer)?.colors = [card.withAlphaComponent(0).cgColor, card.cgColor]
        }
    }
}
