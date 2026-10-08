import CawCoDesign
import UIKit

/// Pictures by URL, fetched once and kept while memory allows.
@MainActor
final class ImageStore {
    static let shared = ImageStore()
    private let cache = NSCache<NSURL, UIImage>()
    private var waiting: [URL: [(UIImage?) -> Void]] = [:]
    private var failed = Set<URL>()

    func cached(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }

    func load(_ url: URL, done: @escaping (UIImage?) -> Void) {
        if let image = cached(url) { done(image); return }
        if failed.contains(url) { done(nil); return }
        if waiting[url] != nil { waiting[url]?.append(done); return }
        waiting[url] = [done]
        Task {
            let image: UIImage? = await {
                guard let (data, response) = try? await URLSession.shared.data(from: url),
                      (response as? HTTPURLResponse).map({ (200 ..< 300).contains($0.statusCode) }) ?? true else { return nil }
                return await Self.decode(data)
            }()
            if let image { cache.setObject(image, forKey: url as NSURL) } else { failed.insert(url) }
            for callback in waiting.removeValue(forKey: url) ?? [] { callback(image) }
        }
    }

    @concurrent
    private static func decode(_ data: Data) async -> UIImage? {
        UIImage(data: data)?.preparingForDisplay()
    }
}

/// A picture in the transcript (Shot.svelte): a 240pt box at its own size
/// inside it (or a 48pt thumbnail, cropped), a skeleton standing in until it
/// loads and fades in, "Image not available" when it never does, its caption
/// and path under it. Tapping it opens the lightbox.
final class ShotView: UIView {
    private let env: RowEnv
    private let thumb: Bool
    private let box = UIControl()
    private let image = UIImageView()
    private let skeleton = UIView()
    private let missing = UIStackView()
    private let caption = UIStackView()
    private var url: URL?
    private var aspect: NSLayoutConstraint?
    private var widthCap: NSLayoutConstraint?
    var onOpen: () -> Void = {}

    init(env: RowEnv, thumb: Bool) {
        self.env = env
        self.thumb = thumb
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        box.translatesAutoresizingMaskIntoConstraints = false
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.clipsToBounds = true
        box.addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        image.translatesAutoresizingMaskIntoConstraints = false
        image.contentMode = thumb ? .scaleAspectFill : .scaleAspectFit
        image.clipsToBounds = true
        image.isUserInteractionEnabled = false
        skeleton.translatesAutoresizingMaskIntoConstraints = false
        skeleton.backgroundColor = Palette.surfaceRecess
        skeleton.isUserInteractionEnabled = false
        box.addSubview(skeleton)
        box.addSubview(image)
        box.pin(skeleton)
        missing.axis = .vertical
        missing.alignment = .leading
        missing.spacing = Space.space1
        missing.isUserInteractionEnabled = false
        missing.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(missing)
        caption.axis = .vertical
        caption.spacing = Space.space1
        let column = UIStackView(arrangedSubviews: [box, caption])
        column.axis = .vertical
        column.alignment = .fill
        column.spacing = Space.space2
        pin(column)
        let side = thumb ? Size.txShotThumb : Size.txShot
        NSLayoutConstraint.activate([
            box.heightAnchor.constraint(equalToConstant: side),
            image.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            image.topAnchor.constraint(equalTo: box.topAnchor),
            image.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            missing.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
            missing.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor, constant: -Space.space3),
            missing.centerYAnchor.constraint(equalTo: box.centerYAnchor),
        ])
        if thumb {
            box.widthAnchor.constraint(equalToConstant: side).isActive = true
            image.trailingAnchor.constraint(equalTo: box.trailingAnchor).isActive = true
        } else {
            image.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor).isActive = true
        }
        box.isAccessibilityElement = true
        box.accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (shot: ShotView, _: UITraitCollection) in
            shot.box.layer.borderColor = Palette.borderHairline.resolvedColor(with: shot.traitCollection).cgColor
        }
        box.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ url: URL, alt: String, caption text: String? = nil, path: String? = nil) {
        self.url = url
        box.accessibilityLabel = "Open \(alt)"
        caption.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (line, mono) in [(text, false), (path, true)] {
            guard let line else { continue }
            let label = WrapLabel()
            label.attributedText = Styled.string(line, TypeScale.typeMeta, color: Palette.inkMuted, mono: mono, lineBreak: .byCharWrapping)
            caption.addArrangedSubview(label)
        }
        caption.isHidden = caption.arrangedSubviews.isEmpty
        missing.arrangedSubviews.forEach { $0.removeFromSuperview() }
        missing.isHidden = true
        let pathLabel = path
        if let held = ImageStore.shared.cached(url) {
            show(held, fade: false)
            return
        }
        image.image = nil
        image.alpha = 0
        skeleton.isHidden = false
        ImageStore.shared.load(url) { [weak self] loaded in
            guard let self, self.url == url else { return }
            if let loaded { show(loaded, fade: true) } else { fail(pathLabel) }
        }
    }

    private func show(_ picture: UIImage, fade: Bool) {
        image.image = picture
        skeleton.isHidden = true
        if !thumb {
            // Its own box at contain scale: never wider than the card or its pixels, never taller than 240.
            aspect?.isActive = false
            widthCap?.isActive = false
            let ratio = picture.size.width / max(1, picture.size.height)
            aspect = image.widthAnchor.constraint(equalTo: image.heightAnchor, multiplier: ratio)
            aspect?.priority = .defaultHigh
            widthCap = image.widthAnchor.constraint(lessThanOrEqualToConstant: picture.size.width)
            NSLayoutConstraint.activate([aspect!, widthCap!])
        }
        if fade, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durControl) { self.image.alpha = 1 }.startAnimation()
        } else { image.alpha = 1 }
    }

    private func fail(_ path: String?) {
        skeleton.isHidden = true
        box.backgroundColor = Palette.surfaceRecess
        let say = WrapLabel()
        say.attributedText = Styled.string(thumb ? "" : "Image not available", TypeScale.typeMeta, color: Palette.inkMuted)
        missing.addArrangedSubview(say)
        if let path, !thumb {
            let label = WrapLabel()
            label.attributedText = Styled.string(path, TypeScale.typeMeta, color: Palette.inkMuted, mono: true, lineBreak: .byCharWrapping)
            missing.addArrangedSubview(label)
        }
        missing.isHidden = false
        box.isEnabled = false
    }
}

/// An attached text file (DocThumb.svelte): the thumbnail's 48pt box, widened
/// to its name, the head of the name giving way before its tail does.
final class DocThumb: UIControl {
    let name: String
    var onOpen: () -> Void = {}

    /// `meta` is the line under the name: a text's lines and size, or a file's size.
    init(name: String, meta metaLine: String) {
        self.name = name
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        let glyph = GlyphView(.document, size: 24, tint: Palette.inkMuted)
        let tail = 8
        let cut = max(0, name.count - tail)
        let head = LineLabel(hug: .defaultHigh, resist: .defaultLow)
        head.attributedText = Styled.string(String(name.prefix(cut)), TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingUi)
        let end = LineLabel(hug: .required, resist: .required)
        end.attributedText = Styled.string(String(name.suffix(name.count - cut)), TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingUi)
        let nameLine = UIStackView(arrangedSubviews: [head, end])
        let meta = LineLabel()
        meta.attributedText = Styled.string(metaLine, TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingUi, tabular: true)
        let text = UIStackView(arrangedSubviews: [nameLine, meta])
        text.axis = .vertical
        let row = railLine([glyph, text])
        row.isUserInteractionEnabled = false
        pin(row, insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space3))
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: Size.txShotThumb),
            widthAnchor.constraint(lessThanOrEqualToConstant: 16 * TypeScale.textBody + 32),
        ])
        addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        isAccessibilityElement = true
        accessibilityLabel = "Open \(name)"
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (doc: DocThumb, _: UITraitCollection) in doc.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() { layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor }

    override var isHighlighted: Bool { didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : Palette.surfaceRecess } }

    /// "12 lines · 2.3 KB".
    static func size(_ content: String) -> String {
        let lines = content.split(separator: "\n", omittingEmptySubsequences: false).count
        let bytes = content.utf8.count
        let kb = 1024.0
        let size = Double(bytes) >= kb * kb ? String(format: "%.1f MB", Double(bytes) / kb / kb)
            : Double(bytes) >= kb ? String(format: "%.1f KB", Double(bytes) / kb) : "\(bytes) B"
        return "\(lines) \(lines == 1 ? "line" : "lines") · \(size)"
    }
}

/// The lightbox (Lightbox.svelte): a message's pictures over the scrim,
/// swiped between, zoomed out of the thumbnail tapped; or a document — an
/// attached file, a diff in full — on a sheet.
final class Lightbox: UIViewController, UIScrollViewDelegate {
    /// A picture and what the bar under it says: its caption and its path.
    struct Picture {
        let url: URL
        var caption: String?
        var path: String?
    }

    enum Item {
        case images([Picture], index: Int)
        case text(name: String, content: String)
        case diff(path: String, old: String, new: String)
    }

    private let item: Item
    private let env: RowEnv
    private let pager = UIScrollView()
    private let counter = UILabel()
    private var index = 0
    private var zooms: [UIScrollView] = []
    private let lines = UIStackView()
    private let original = UIButton(type: .system)

    init(_ item: Item, env: RowEnv) {
        self.item = item
        self.env = env
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .overFullScreen
        modalTransitionStyle = .crossDissolve
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The scrim: the page itself, translucent, blurred by --scrim-blur.
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        blur.alpha = 0.35
        view.pin(blur)
        let scrim = UIView()
        scrim.backgroundColor = Palette.scrim
        view.pin(scrim)
        switch item {
        case let .images(pictures, start): images(pictures, start: start)
        case let .text(name, content): sheet(name: name, content: content, diff: nil)
        case let .diff(path, old, new): sheet(name: path, content: "", diff: (old, new))
        }
    }

    /// The picture viewer's chrome (`.cawco-pswp .pswp__button`): 44pt on the
    /// raised surface inside a hairline, its glyph 20pt.
    private func button(_ glyph: Glyph, label: String, action: @escaping () -> Void) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setImage(glyph.image.resized(to: Size.iconLg), for: .normal)
        button.tintColor = Palette.inkStrong
        button.backgroundColor = Palette.surfaceRaised
        button.layer.cornerRadius = Radius.radiusSm
        button.layer.borderWidth = 1
        button.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        button.accessibilityLabel = label
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        NSLayoutConstraint.activate([button.widthAnchor.constraint(equalToConstant: Size.cBtnHLg), button.heightAnchor.constraint(equalToConstant: Size.cBtnHLg)])
        return button
    }

    private func images(_ pictures: [Picture], start: Int) {
        index = start
        pager.isPagingEnabled = true
        pager.showsHorizontalScrollIndicator = false
        pager.delegate = self
        view.pin(pager)
        var previous: UIView?
        for shown in pictures {
            let zoom = UIScrollView()
            zoom.translatesAutoresizingMaskIntoConstraints = false
            zoom.maximumZoomScale = 4
            zoom.delegate = self
            zooms.append(zoom)
            let picture = UIImageView()
            picture.contentMode = .scaleAspectFit
            picture.translatesAutoresizingMaskIntoConstraints = false
            ImageStore.shared.load(shown.url) { picture.image = $0 }
            zoom.addSubview(picture)
            pager.addSubview(zoom)
            NSLayoutConstraint.activate([
                zoom.topAnchor.constraint(equalTo: pager.frameLayoutGuide.topAnchor),
                zoom.bottomAnchor.constraint(equalTo: pager.frameLayoutGuide.bottomAnchor),
                zoom.widthAnchor.constraint(equalTo: pager.frameLayoutGuide.widthAnchor),
                zoom.leadingAnchor.constraint(equalTo: previous?.trailingAnchor ?? pager.contentLayoutGuide.leadingAnchor),
                picture.widthAnchor.constraint(equalTo: zoom.frameLayoutGuide.widthAnchor),
                picture.heightAnchor.constraint(equalTo: zoom.frameLayoutGuide.heightAnchor),
                picture.leadingAnchor.constraint(equalTo: zoom.contentLayoutGuide.leadingAnchor),
                picture.trailingAnchor.constraint(equalTo: zoom.contentLayoutGuide.trailingAnchor),
                picture.topAnchor.constraint(equalTo: zoom.contentLayoutGuide.topAnchor),
                picture.bottomAnchor.constraint(equalTo: zoom.contentLayoutGuide.bottomAnchor),
            ])
            previous = zoom
        }
        previous?.trailingAnchor.constraint(equalTo: pager.contentLayoutGuide.trailingAnchor).isActive = true
        pager.contentLayoutGuide.heightAnchor.constraint(equalTo: pager.frameLayoutGuide.heightAnchor).isActive = true
        // The top bar (`.pswp__top-bar`, `space-2` in): the counter at its
        // start, zoom then close at its end `space-2` apart, close 6pt in
        // from the bar's padding (PhotoSwipe's `--close` margin).
        let close = button(.close, label: "Close image") { [weak self] in self?.dismiss(animated: true) }
        let zoom = button(.zoomIn, label: "Zoom") { [weak self] in self?.toggleZoom() }
        counter.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(close)
        view.addSubview(zoom)
        view.addSubview(counter)
        let bar = describeBar()
        view.addSubview(bar)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: safe.topAnchor, constant: Space.space2),
            close.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -(Space.space2 + 6)),
            zoom.topAnchor.constraint(equalTo: close.topAnchor),
            zoom.trailingAnchor.constraint(equalTo: close.leadingAnchor, constant: -Space.space2),
            counter.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space2 * 2),
            counter.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            // `.pswp__description`: `space-3` in from the sides and the foot.
            bar.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space3),
            bar.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space3),
            bar.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -Space.space3),
        ])
        show(pictures)
        view.layoutIfNeeded()
        pager.contentOffset.x = Double(start) * view.bounds.width
    }

    /// The bar under the picture (`.pswp__description`): its caption and its
    /// path, then the way to the original; on the recess inside a hairline.
    private func describeBar() -> UIView {
        lines.axis = .vertical
        lines.setContentHuggingPriority(.defaultLow, for: .horizontal)
        original.setContentHuggingPriority(.required, for: .horizontal)
        original.setContentCompressionResistancePriority(.required, for: .horizontal)
        original.addAction(UIAction { [weak self] _ in self?.openOriginal() }, for: .primaryActionTriggered)
        let row = UIStackView(arrangedSubviews: [lines, original])
        row.spacing = Space.space3
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous
        row.layer.borderWidth = 1
        row.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        row.translatesAutoresizingMaskIntoConstraints = false
        return row
    }

    private var pictures: [Picture] {
        if case let .images(pictures, _) = item { return pictures }
        return []
    }

    /// The counter and the bar, for the picture on screen.
    private func show(_ pictures: [Picture]) {
        counter.isHidden = pictures.count < 2
        counter.attributedText = Styled.string("\(index + 1) / \(pictures.count)", TypeScale.typeMeta, color: Palette.inkMuted, tabular: true)
        guard pictures.indices.contains(index) else { return }
        let shown = pictures[index]
        lines.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (text, role) in [(shown.caption, TypeScale.typeMeta), (shown.path, TypeScale.typeCode.with(points: TypeScale.typeMeta.points))] {
            guard let text, !text.isEmpty else { continue }
            let line = KitLabel(role, ink: Palette.inkMuted, lines: 0)
            line.text = text
            lines.addArrangedSubview(line)
        }
        // A picture carried in the transcript itself has no page to open: it is offered as a file.
        let inline = shown.url.scheme == "data"
        var words = AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.inkMuted))
        words.underlineStyle = .single
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(inline ? "Save original" : "Open original", attributes: words)
        config.contentInsets = .zero
        original.configuration = config
    }

    private func openOriginal() {
        guard pictures.indices.contains(index) else { return }
        let url = pictures[index].url
        guard url.scheme == "data" else {
            UIApplication.shared.open(url)
            return
        }
        ImageStore.shared.load(url) { [weak self] image in
            guard let self, let image else { return }
            let share = UIActivityViewController(activityItems: [image], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = original
            present(share, animated: true)
        }
    }

    /// The zoom button: the picture on screen to twice its fitted size, or back.
    private func toggleZoom() {
        guard zooms.indices.contains(index) else { return }
        let zoom = zooms[index]
        zoom.setZoomScale(zoom.zoomScale > 1 ? 1 : 2, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { scrollView === pager ? nil : scrollView.subviews.first }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        guard scrollView === pager, view.bounds.width > 0 else { return }
        index = Int((scrollView.contentOffset.x / view.bounds.width).rounded())
        show(pictures)
    }

    private func sheet(name: String, content: String, diff: (old: String, new: String)?) {
        let sheet = UIView()
        sheet.translatesAutoresizingMaskIntoConstraints = false
        sheet.backgroundColor = Palette.surfaceRaised
        sheet.layer.cornerRadius = Radius.radiusSm
        sheet.layer.borderWidth = 1
        sheet.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        sheet.boxShadow = Shadow.shadowTile
        let title = LineLabel()
        title.attributedText = Styled.string(name, TypeScale.typeLabel, color: Palette.inkStrong)
        // `.doc-head`'s CopyButton and close: ghost icon buttons (`size="icon"`, `touch-hit`).
        let copy = KitButton.make("", glyph: .copy, variant: .ghost) {
            UIPasteboard.general.string = diff?.new ?? content
        }
        copy.accessibilityLabel = "Copy \(name)"
        let close = KitButton.make("", glyph: .close, variant: .ghost) { [weak self] in self?.dismiss(animated: true) }
        close.accessibilityLabel = "Close document"
        let head = railLine([title, copy, close], spacing: Space.space1)
        let headBox = UIView()
        headBox.pin(head, insets: UIEdgeInsets(top: Space.space2, left: Space.space4, bottom: Space.space2, right: Space.space2))
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        let scroll = UIScrollView()
        let body: UIView
        if let diff {
            let view = DiffView(env: env)
            view.configure(path: name, old: diff.old, new: diff.new)
            body = view
        } else {
            let ext = (name as NSString).pathExtension.lowercased()
            if ext == "md" || ext == "markdown" {
                let text = MessageBody()
                text.configure(content)
                body = text
            } else {
                let well = CodeWell()
                var shown = content
                if ext == "json", let data = content.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data),
                   let pretty = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted]) {
                    shown = String(decoding: pretty, as: UTF8.self)
                }
                well.configure(language: ext, text: shown)
                body = well
            }
        }
        body.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(body)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        let column = UIStackView(arrangedSubviews: [headBox, rule, scroll])
        column.axis = .vertical
        // The head and the body stand inside the sheet's 1pt border.
        sheet.pin(column, insets: UIEdgeInsets(top: 1, left: 1, bottom: 1, right: 1))
        view.addSubview(sheet)
        let safe = view.safeAreaLayoutGuide
        let fit = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fit.priority = .defaultLow
        // `inline-size: min(100%, 60rem)` inside `.doc-view`'s `space-4` padding, centred.
        let wide = sheet.widthAnchor.constraint(equalTo: safe.widthAnchor, constant: -Space.space4 * 2)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            sheet.leadingAnchor.constraint(greaterThanOrEqualTo: safe.leadingAnchor, constant: Space.space4),
            sheet.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -Space.space4),
            sheet.widthAnchor.constraint(lessThanOrEqualToConstant: 960),
            wide,
            sheet.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            sheet.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            sheet.heightAnchor.constraint(lessThanOrEqualTo: safe.heightAnchor, multiplier: 0.86),
            body.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space4),
            body.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Space.space4),
            body.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            body.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space4),
            body.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space4 * 2),
            fit,
        ])
    }
}
