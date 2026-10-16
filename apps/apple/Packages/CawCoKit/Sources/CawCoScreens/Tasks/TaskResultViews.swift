import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit
import WebKit

/// One part of a task's result in its card (tasks/ResultCard.svelte): what it
/// is called (its kind, in the reader's word, with its glyph) and its own
/// title where it has one, over the thing itself. Never a file's name. A
/// raised tile at `--radius-lg` with a hairline border, `space-4` in, its
/// head `space-3` over what it holds.
final class ResultCard: TileView {
    private let stack = UIStackView()
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)

    init(glyph: Glyph, kind: String) {
        super.init(radius: Radius.radiusLg)
        layer.borderWidth = 1
        let kindLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        kindLabel.text = kind
        kindLabel.accessibilityTraits = .header
        kindLabel.setContentHuggingPriority(.required, for: .horizontal)
        kindLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.isHidden = true
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [GlyphView(glyph, size: Size.iconMd, tint: Palette.inkMuted), kindLabel, titleLabel, UIView()])
        head.spacing = Space.space2
        head.alignment = .center
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.addArrangedSubview(head)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: Space.space4),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space4),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space4),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space4),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: ResultCard, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// The thing's own title, beside its kind (a document's front-matter `title:`).
    var title: String? {
        didSet {
            titleLabel.text = title
            titleLabel.isHidden = title == nil
        }
    }

    /// What the card holds under its head, in order.
    func setContent(_ views: [UIView]) {
        for view in stack.arrangedSubviews.dropFirst() { view.removeFromSuperview() }
        for view in views { stack.addArrangedSubview(view) }
    }
}

/// One output an attempt handed in, drawn as the thing it is
/// (tasks/ResultView.svelte): a document as a document, a page as a page in
/// a frame that runs none of its scripts, data as what it says, a table as a
/// table, a picture at its own size. A mockup (`.oui`) is shown as its text:
/// the OpenUI library that drew it is being removed (PRD D29). What it is
/// called above it is its kind, and its own title where it has one; a read
/// the hub refused is said in the hub's words where the result would be.
final class TaskOutputView: UIView {
    private let name: String
    private let kind: ResultKind
    private let card: ResultCard
    /// What it draws now: `reading`, `refused`, or what it drew the output as (the sheet's DEBUG probe reads it).
    private(set) var shown = "reading"
    /// Its kind's word and its title, as its card's head says them.
    var head: String { [kind.word, card.title].compactMap(\.self).joined(separator: " · ") }

    /// `read` answers the output's bytes and the type the hub served them as.
    init(name: String, read: @escaping () async throws -> (data: Data, type: String)) {
        self.name = name
        kind = ResultKind(name: name)
        card = ResultCard(glyph: Self.glyph(kind), kind: kind.word)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        pinEdges(card)
        card.setContent([Self.skeleton()])
        accessibilityIdentifier = "task-output-\(name)"
        Task { [weak self] in
            do {
                let answer = try await read()
                self?.show(answer.data)
            } catch {
                self?.refused(error.localizedDescription)
            }
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// ResultView's `GLYPH`.
    private static func glyph(_ kind: ResultKind) -> Glyph {
        switch kind {
        case .document: .document
        case .page: .window
        case .mockup: .palette
        case .data: .dataLayers
        case .table: .fileTable
        case .picture: .eye
        case .text: .alignLeft
        }
    }

    /// `h-4 w-2/5`, `h-3.5 w-full`, `h-3.5 w-4/5`, `space-2` apart.
    private static func skeleton() -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.alignment = .leading
        for (height, share) in [(16.0, 0.4), (14.0, 1.0), (14.0, 0.8)] {
            let bar = SkeletonView(height: height)
            stack.addArrangedSubview(bar)
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: share).isActive = true
        }
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Loading"
        return stack
    }

    private func refused(_ reason: String) {
        let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        line.text = reason
        card.setContent([line])
        shown = "refused"
    }

    private func show(_ data: Data) {
        if kind == .picture {
            let picture = Self.picture(data, name: name)
            card.setContent([picture])
            shown = picture is KitLabel ? "unreadable" : picture is ResultPage ? "svg" : "picture"
            return
        }
        let text = String(decoding: data, as: UTF8.self)
        switch kind {
        case .document:
            let document = ResultRead.document(text)
            card.title = document.title
            let body = MarkdownDocumentView(message: true)
            body.setSource(document.body)
            card.setContent([body])
            shown = "document"
        case .page:
            card.setContent([ResultPage(html: text)])
            shown = "page"
        case .data:
            do {
                card.setContent([ResultDataView(try ResultJSON.parse(text))])
                shown = "data"
            } catch {
                let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
                line.text = "This data does not read: \(error.reason)"
                card.setContent([line])
                shown = "unreadable"
            }
        case .table:
            let rows = ResultRead.delimited(text, tab: name.lowercased().hasSuffix(".tsv"))
            guard let head = rows.first else {
                card.setContent([Self.preformatted(text)])
                shown = "text"
                return
            }
            card.setContent([KitTableView(columns: head, rows: rows.dropFirst().map { row in
                head.indices.map { at in ResultDataView.cell(at < row.count ? .string(row[at]) : .null) }
            })])
            shown = "table"
        case .mockup, .text, .picture:
            card.setContent([Self.preformatted(text)])
            shown = "text"
        }
    }

    /// A picture at its own size, never stretched across the card; an SVG drawn by WebKit, which reads it.
    private static func picture(_ data: Data, name: String) -> UIView {
        if name.lowercased().hasSuffix(".svg") { return ResultPage(svg: data) }
        guard let image = UIImage(data: data, scale: 1) else {
            let line = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
            line.text = "This picture does not read."
            return line
        }
        let view = UIImageView(image: image)
        view.translatesAutoresizingMaskIntoConstraints = false
        view.contentMode = .scaleAspectFit
        view.layer.cornerRadius = Radius.radiusSm
        view.layer.cornerCurve = .continuous
        view.clipsToBounds = true
        view.isAccessibilityElement = true
        view.accessibilityLabel = "What this attempt drew"
        view.accessibilityTraits = .image
        let holder = UIView()
        holder.addSubview(view)
        // `max-inline-size: 100%; block-size: auto`: its pixels as CSS pixels, narrower where the card is.
        let own = view.widthAnchor.constraint(equalToConstant: image.size.width)
        own.priority = .defaultHigh
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: holder.topAnchor),
            view.bottomAnchor.constraint(equalTo: holder.bottomAnchor),
            view.leadingAnchor.constraint(equalTo: holder.leadingAnchor),
            view.trailingAnchor.constraint(lessThanOrEqualTo: holder.trailingAnchor),
            own,
            view.heightAnchor.constraint(equalTo: view.widthAnchor, multiplier: image.size.height / max(image.size.width, 1)),
        ])
        return holder
    }

    /// `pre.text`: the words as written, wrapping, in the mono face at meta
    /// size on `--code-bg`, `space-3` in, at `--radius-sm`.
    private static func preformatted(_ text: String) -> UIView {
        let label = KitLabel(TaskSheetController.mono, ink: Palette.inkStrong, lines: 0)
        label.text = text
        label.lineBreakMode = .byCharWrapping
        let box = UIView()
        box.backgroundColor = Palette.codeBg
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.cornerCurve = .continuous
        box.pinEdges(label, inset: Space.space3)
        return box
    }
}

/// A page an attempt wrote, drawn as a page (ResultView's sandboxed
/// `iframe`): its own document in a web view that runs none of its scripts,
/// keeps nothing, and goes nowhere from where it opened; `28rem` tall in a
/// well. An SVG picture is drawn the same way, at its own height.
final class ResultPage: UIView, WKNavigationDelegate {
    private let web: WKWebView
    private var opened = false
    private let fits: Bool
    private var height: NSLayoutConstraint!

    convenience init(html: String) {
        self.init(fits: false)
        accessibilityLabel = "The page this attempt made"
        layer.borderWidth = 1
        layer.cornerRadius = Radius.radiusSm
        // The author's page on the canvas a browser gives a page in either
        // theme (an iframe's own white), never the app's: a page that sets
        // no background keeps its black words readable at night too.
        backgroundColor = .white
        web.isOpaque = true
        web.backgroundColor = .white
        web.scrollView.backgroundColor = .white
        web.underPageBackgroundColor = .white
        web.overrideUserInterfaceStyle = .light
        web.loadHTMLString(html, baseURL: nil)
    }

    convenience init(svg: Data) {
        self.init(fits: true)
        accessibilityLabel = "What this attempt drew"
        let page = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>\
        html,body{margin:0;background:transparent}\
        img{display:block;max-width:100%;height:auto;border-radius:\(Radius.radiusSm)px}\
        </style></head><body><img alt="What this attempt drew" src="data:image/svg+xml;base64,\(svg.base64EncodedString())"></body></html>
        """
        web.loadHTMLString(page, baseURL: nil)
    }

    private init(fits: Bool) {
        self.fits = fits
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerCurve = .continuous
        clipsToBounds = true
        isAccessibilityElement = false
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.navigationDelegate = self
        web.scrollView.isScrollEnabled = !fits
        pinEdges(web)
        height = heightAnchor.constraint(equalToConstant: fits ? 1 : 448)
        height.isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (page: ResultPage, _: UITraitCollection) in page.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
    }

    /// The document it was given opens; nothing after it does (a link, a form, a refresh).
    func webView(_: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard action.targetFrame?.isMainFrame != false else { return action.navigationType == .other ? .allow : .cancel }
        return !opened && action.navigationType == .other ? .allow : .cancel
    }

    func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
        opened = true
        guard fits else { return }
        // The picture's own height, read by the app (the page runs no script of its own).
        Task { [weak self] in
            guard let value = try? await webView.evaluateJavaScript("document.images[0] ? document.images[0].getBoundingClientRect().height : 0"),
                  let points = (value as? NSNumber)?.doubleValue, points > 0 else { return }
            self?.height.constant = ceil(points)
        }
    }
}

/// A data result (a `.json` output) drawn as what it says
/// (tasks/ResultData.svelte): a record's name as its heading, its other
/// fields as labelled rows in words (a date as a date, a yes/no as one), a
/// list of like records as a table, a list of words as words. Never the
/// file, never its braces.
final class ResultDataView: UIView {
    init(_ value: ResultJSON) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        accessibilityIdentifier = "task-result-data"
        pinEdges(Self.any(value, depth: 0))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// A table cell's value in words; a link as one (ResultTable.svelte).
    static func cell(_ value: ResultJSON) -> KitTableView.Cell {
        KitTableView.Cell(value.words, link: value.url)
    }

    private static func any(_ value: ResultJSON, depth: Int) -> UIView {
        switch value {
        case let .object(fields): record(fields, value: value, depth: depth)
        case let .array(items): list(items, depth: depth)
        default: plain(value)
        }
    }

    /// A plain value: a link drawn as one, else its words (`white-space: pre-wrap`).
    private static func plain(_ value: ResultJSON, muted: Bool = false) -> UIView {
        let label = KitLabel(TypeScale.typeBody, ink: muted ? Palette.inkMuted : Palette.inkStrong, lines: 0)
        label.lineBreakMode = .byCharWrapping
        guard let url = value.url else {
            label.text = value.words
            return label
        }
        var attributes = TypeScale.typeBody.attributes(color: Palette.linkInk)
        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
        label.attributedText = NSAttributedString(string: value.words, attributes: attributes)
        label.isUserInteractionEnabled = true
        label.accessibilityTraits = .link
        label.addGestureRecognizer(UITapGestureRecognizer(target: LinkOpener.shared, action: #selector(LinkOpener.open(_:))))
        label.accessibilityValue = url.absoluteString
        return label
    }

    private static func record(_ fields: [(String, ResultJSON)], value: ResultJSON, depth: Int) -> UIView {
        let nameKey = value.nameKey
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space2
        if let nameKey, case let .string(name)? = value[nameKey] {
            // `.name` in title type at the top level; a nested record's in label type.
            let heading = KitLabel(depth == 0 ? TypeScale.typeTitle : TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
            if depth == 0 { heading.wrap = .balance }
            heading.text = name
            heading.accessibilityTraits = .header
            stack.addArrangedSubview(heading)
        }
        let shown = fields.filter { $0.0 != nameKey }
        guard !shown.isEmpty else { return stack }
        // `grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr)`, `gap: space-2 space-4`.
        let labelFont = TypeScale.typeLabel.font
        let column = shown.filter { $0.1.isPlain }.map { ceil((ResultRead.keyLabel($0.0) as NSString).size(withAttributes: [.font: labelFont]).width) }
            .reduce(96, max)
        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = Space.space2
        for (key, field) in shown {
            let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, lines: 0)
            label.text = ResultRead.keyLabel(key)
            label.accessibilityIdentifier = "task-data-label-\(key)"
            let value = any(field, depth: depth + 1)
            value.accessibilityIdentifier = "task-data-value-\(key)"
            if field.isPlain {
                // The label column at its width, the value taking the rest, the
                // two on one baseline.
                let row = UIStackView(arrangedSubviews: [label, value])
                row.spacing = Space.space4
                row.alignment = .firstBaseline
                label.widthAnchor.constraint(equalToConstant: column).isActive = true
                label.setContentHuggingPriority(.required, for: .horizontal)
                value.setContentHuggingPriority(.defaultLow, for: .horizontal)
                value.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
                grid.addArrangedSubview(row)
            } else {
                // A field whose value is a list or a record takes the row's whole width under its label.
                let row = UIStackView(arrangedSubviews: [label, value])
                row.axis = .vertical
                row.spacing = Space.space2
                grid.addArrangedSubview(row)
            }
        }
        stack.addArrangedSubview(grid)
        return stack
    }

    private static func list(_ items: [ResultJSON], depth: Int) -> UIView {
        if items.isEmpty { return plain(.string("None"), muted: true) }
        if let table = ResultJSON.table(items) {
            return KitTableView(columns: table.columns.map(ResultRead.keyLabel), rows: table.rows.map { row in
                table.columns.map { column in cell(row.last { $0.0 == column }?.1 ?? .null) }
            })
        }
        let stack = UIStackView()
        stack.axis = .vertical
        if items.allSatisfy(\.isPlain) {
            // `list-style: disc`, `padding-inline-start: space-5`.
            for item in items {
                let bullet = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
                bullet.text = "•"
                bullet.textAlignment = .right
                bullet.widthAnchor.constraint(equalToConstant: Space.space5 - Space.space1 - 2).isActive = true
                let row = UIStackView(arrangedSubviews: [bullet, plain(item)])
                row.spacing = Space.space1 + 2
                row.alignment = .firstBaseline
                stack.addArrangedSubview(row)
            }
            return stack
        }
        stack.spacing = Space.space2
        for item in items {
            let nested = UIView()
            nested.backgroundColor = Palette.surfaceRecess
            nested.layer.cornerRadius = Radius.radiusSm
            nested.layer.cornerCurve = .continuous
            nested.pinEdges(any(item, depth: depth + 1), inset: Space.space3)
            stack.addArrangedSubview(nested)
        }
        return stack
    }
}

/// Opens a data result's link where the system opens it (`target="_blank"`).
final class LinkOpener: NSObject {
    static let shared = LinkOpener()

    @objc func open(_ tap: UITapGestureRecognizer) {
        guard let label = tap.view as? UILabel, let text = label.accessibilityValue, let url = URL(string: text) else { return }
        UIApplication.shared.open(url)
    }
}

extension UIView {
    /// `view` filling this one, `inset` in on every side.
    func pinEdges(_ view: UIView, inset: Double = 0) {
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: topAnchor, constant: inset),
            view.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -inset),
            view.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset),
            view.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inset),
        ])
    }
}
