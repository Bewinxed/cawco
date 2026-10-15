import CawCoDesign
public import UIKit

/// One line of a unified diff.
struct DiffLine {
    enum Kind { case context, addition, deletion }
    let kind: Kind
    let text: String
    let old: Int?
    let new: Int?
}

/// A diff's hunks: changed lines with their context, the unchanged runs
/// between them collapsed to a count.
enum DiffModel {
    enum Part {
        case lines([DiffLine])
        case collapsed(Int)
    }

    static let context = 3

    /// The line diff of two texts (LineDiff: an LCS over lines; Myers would give
    /// the same script on the inputs an edit call carries, which are a few
    /// hundred lines). A row shows its line without the newline that ends it.
    static func parts(old: String, new: String) -> [Part] {
        let a = LineDiff.lines(old), b = LineDiff.lines(new)
        func shown(_ line: String) -> String { line.hasSuffix("\n") ? String(line.dropLast()) : line }
        let script: [DiffLine] = LineDiff.script(a, b).map { step in
            switch step {
            case let .context(i, j): DiffLine(kind: .context, text: shown(a[i]), old: i + 1, new: j + 1)
            case let .deletion(i): DiffLine(kind: .deletion, text: shown(a[i]), old: i + 1, new: nil)
            case let .addition(j): DiffLine(kind: .addition, text: shown(b[j]), old: nil, new: j + 1)
            }
        }
        // Keep `context` lines around each change; collapse the rest.
        var keep = [Bool](repeating: false, count: script.count)
        for (k, line) in script.enumerated() where line.kind != .context {
            for x in max(0, k - context) ... min(script.count - 1, k + context) { keep[x] = true }
        }
        var parts: [Part] = []
        var run: [DiffLine] = []
        var hidden = 0
        for (k, line) in script.enumerated() {
            if keep[k] {
                if hidden > 0 { parts.append(.collapsed(hidden)); hidden = 0 }
                run.append(line)
            } else {
                if !run.isEmpty { parts.append(.lines(run)); run = [] }
                hidden += 1
            }
        }
        if !run.isEmpty { parts.append(.lines(run)) }
        if hidden > 0, !parts.isEmpty { parts.append(.collapsed(hidden)) }
        return parts
    }
}

/// A file's diff inline (DiffView.svelte over @pierre/diffs): the path on a
/// card header, then the unified rows — numbers, markers, the code in its
/// colours — in a box up to 400pt tall that scrolls both ways.
public final class DiffView: UIView {
    private let env: RowEnv
    private let header = UIView()
    private let path = WrapLabel()
    private let expand = UIButton(type: .system)
    private let scroll = UIScrollView()
    private let rows = UIView()
    private var fit: NSLayoutConstraint!
    private var source: (path: String, old: String, new: String)?
    /// How tall the rows stand before they scroll, in points.
    private var cap = Size.txDiffCap

    /// The same measured diff outside a transcript. With no custom action,
    /// Expand opens the transcript's existing lightbox from this view's window.
    public convenience init(path: String, old: String, new: String, cap: Double = Size.txDiffCap, onExpand: ((UIView) -> Void)? = nil) {
        let env = RowEnv()
        env.openLightbox = { [weak env] item, source in
            if let onExpand { onExpand(source); return }
            guard let env, var host = source.window?.rootViewController else { return }
            while let shown = host.presentedViewController { host = shown }
            host.present(Lightbox(item, env: env), animated: !UIAccessibility.isReduceMotionEnabled)
        }
        self.init(env: env)
        self.cap = cap
        configure(path: path, old: old, new: new)
    }

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        clipsToBounds = true
        header.translatesAutoresizingMaskIntoConstraints = false
        let rule = UIView()
        rule.translatesAutoresizingMaskIntoConstraints = false
        expand.setImage(Glyph.maximize.image, for: .normal)
        expand.tintColor = Palette.mutedForeground
        expand.translatesAutoresizingMaskIntoConstraints = false
        expand.accessibilityLabel = "Expand diff"
        expand.addAction(UIAction { [weak self] _ in self?.openFull() }, for: .touchUpInside)
        header.addSubview(path)
        header.addSubview(expand)
        header.addSubview(rule)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        rows.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(rows)
        addSubview(header)
        addSubview(scroll)
        rule.tag = 1
        fit = scroll.heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: leadingAnchor),
            header.trailingAnchor.constraint(equalTo: trailingAnchor),
            header.topAnchor.constraint(equalTo: topAnchor),
            path.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Size.txDiffHeadInline),
            path.topAnchor.constraint(equalTo: header.topAnchor, constant: Size.txDiffHeadBlock),
            path.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -Size.txDiffHeadBlock),
            expand.leadingAnchor.constraint(equalTo: path.trailingAnchor, constant: Space.space2),
            expand.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Size.txDiffHeadInline),
            expand.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            expand.widthAnchor.constraint(equalToConstant: Size.cBtnHXs),
            expand.heightAnchor.constraint(equalToConstant: Size.cBtnHXs),
            rule.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            rule.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.topAnchor.constraint(equalTo: header.bottomAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            fit,
            rows.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            rows.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            rows.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            rows.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            rows.widthAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: DiffView, _: UITraitCollection) in view.draw() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(path: String, old: String, new: String) {
        source = (path, old, new)
        draw()
    }

    /// The file's language, for its colours (diff-language.ts, by extension).
    private static func language(_ path: String) -> String? {
        switch (path as NSString).pathExtension.lowercased() {
        case "ts", "mts", "cts", "js", "mjs", "cjs", "tsx", "jsx", "svelte": "typescript"
        case "json", "jsonc": "json"
        case "py": "python"
        case "sh", "bash", "zsh": "bash"
        case "html", "xml", "svg": "xml"
        default: nil
        }
    }

    private func draw() {
        guard let source else { return }
        let traits = traitCollection
        let dark = traits.userInterfaceStyle == .dark
        backgroundColor = Palette.muted
        layer.borderColor = Palette.border.resolvedColor(with: traits).cgColor
        header.backgroundColor = Palette.card
        header.viewWithTag(1)?.backgroundColor = Palette.border
        path.attributedText = Styled.string(source.path, TypeScale.typeMeta, color: Palette.mutedForeground, size: TypeScale.textMeta,
                                            mono: true, lineBreak: .byCharWrapping)
        rows.subviews.forEach { $0.removeFromSuperview() }
        let parts = DiffModel.parts(old: source.old, new: source.new)
        let font = TypeScale.typeCode.font(TypeScale.textMeta)
        let row = Size.txDiffRow
        let numbers = parts.flatMap { part -> [DiffLine] in if case let .lines(lines) = part { return lines } else { return [] } }
        let widest = numbers.map { max($0.old ?? 0, $0.new ?? 0) }.max() ?? 0
        let digit = ("0" as NSString).size(withAttributes: [.font: font]).width
        let gutter = ceil(Double(String(widest).count) * digit) + Space.space2 * 2
        let palette = DiffPalette(dark: dark)
        rows.backgroundColor = Palette.codeBg
        let language = Self.language(source.path)
        var y = 0.0
        var widestLine = 0.0
        for part in parts {
            switch part {
            case let .collapsed(count):
                let bar = UILabel(frame: CGRect(x: 0, y: y, width: 0, height: Size.txDiffBar))
                bar.backgroundColor = palette.separator
                bar.attributedText = Styled.string("  \(count) unmodified line\(count == 1 ? "" : "s")", TypeScale.typeMeta,
                                                   color: Palette.inkMuted, size: TypeScale.textMeta, mono: true)
                bar.autoresizingMask = [.flexibleWidth]
                rows.addSubview(bar)
                y += Size.txDiffBar
            case let .lines(lines):
                let text = lines.map(\.text).joined(separator: "\n")
                let runs = Highlight.colors(text, language: language)
                var offset = 0
                for line in lines {
                    // A changed row is one translucent strip over code-bg, the
                    // gutter included; a context row's gutter is a step off it.
                    let (back, ink): (UIColor, UIColor) = switch line.kind {
                    case .addition: (Palette.diffAddBg, Palette.success11)
                    case .deletion: (Palette.diffDelBg, Palette.error11)
                    case .context: (.clear, Palette.inkMuted)
                    }
                    let strip = UIView(frame: CGRect(x: 0, y: y, width: 0, height: row))
                    strip.backgroundColor = back
                    strip.autoresizingMask = [.flexibleWidth]
                    rows.addSubview(strip)
                    if line.kind == .context {
                        let gutterBack = UIView(frame: CGRect(x: 0, y: y, width: gutter, height: row))
                        gutterBack.backgroundColor = palette.gutter
                        rows.addSubview(gutterBack)
                    }
                    let number = UILabel(frame: CGRect(x: 0, y: y, width: gutter - Space.space2, height: row))
                    number.textAlignment = .right
                    number.attributedText = Styled.string((line.new ?? line.old).map(String.init) ?? "", TypeScale.typeMeta,
                                                          color: ink, size: TypeScale.textMeta, mono: true, tabular: true)
                    rows.addSubview(number)
                    let code = NSMutableAttributedString(string: line.text, attributes: [.font: font, .foregroundColor: Palette.codeInk])
                    for (range, color) in runs ?? [] {
                        let local = NSIntersectionRange(range, NSRange(location: offset, length: (line.text as NSString).length))
                        if local.length > 0 { code.addAttribute(.foregroundColor, value: color, range: NSRange(location: local.location - offset, length: local.length)) }
                    }
                    offset += (line.text as NSString).length + 1
                    let label = UILabel()
                    label.attributedText = code
                    let width = ceil(label.intrinsicContentSize.width)
                    label.frame = CGRect(x: gutter + Space.space2, y: y, width: width, height: row)
                    rows.addSubview(label)
                    widestLine = max(widestLine, gutter + Space.space2 * 2 + width)
                    y += row
                }
            }
        }
        rows.frame.size = CGSize(width: widestLine, height: y)
        rows.constraints.filter { $0.firstAttribute == .height || $0.firstAttribute == .width }.forEach { rows.removeConstraint($0) }
        NSLayoutConstraint.activate([
            rows.heightAnchor.constraint(equalToConstant: y),
            rows.widthAnchor.constraint(equalToConstant: widestLine).withPriority(.defaultLow),
        ])
        fit.constant = min(cap, y)
        accessibilityLabel = "Diff of \(source.path)"
    }

    private func openFull() {
        guard let source else { return }
        env.openLightbox(.diff(path: source.path, old: source.old, new: source.new), self)
    }
}

/// The diff's two grounds a step off code-bg, as @pierre/diffs mixes its
/// context gutter and the bar between hunks. Everything else a diff draws is a
/// shared token, as the web diff's is (app.css): its rows' diff-add-bg and
/// diff-del-bg over code-bg, the syntax tokens, and line numbers in ink-muted
/// and each ramp's text step (success-11, error-11).
struct DiffPalette {
    let gutter: UIColor
    let separator: UIColor

    init(dark: Bool) {
        let ground = Palette.codeBg.resolvedColor(with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light))
        let mixer: UIColor = dark ? .white : .black
        gutter = Self.mix(ground, mixer, dark ? 0.075 * 0.45 : 0.015 * 0.9)
        separator = Self.mix(ground, mixer, dark ? 0.15 : 0.04)
    }

    static func mix(_ a: UIColor, _ b: UIColor, _ share: Double) -> UIColor {
        var (r1, g1, b1, a1) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        var (r2, g2, b2, a2) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let t = CGFloat(share)
        return UIColor(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, alpha: a1 + (a2 - a1) * t)
    }
}

extension NSLayoutConstraint {
    func withPriority(_ priority: UILayoutPriority) -> NSLayoutConstraint {
        self.priority = priority
        return self
    }
}
