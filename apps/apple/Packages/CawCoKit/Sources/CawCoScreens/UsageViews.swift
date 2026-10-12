import CawCoAPI
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

// The usage strip and what it opens (lib/cawco/UsageMeter.svelte), drawn as
// Rings: in the rail's footer and, always, under the phone home's status
// line. The strip is one control; it opens the web's sheet view (on touch the
// web opens the house bottom sheet): Claude's head and its time, the relay
// bar, every account as a cell of the dial wall, and the way to the Usage page.

/// A provider's mark (UsageMeter.svelte `.mark`): its own logo on a 3pt corner.
func usageMark(_ provider: String, side: Double = 14) -> UIImageView {
    let mark = UIImageView(image: (provider == "Claude" ? BrandLogo.claude : BrandLogo.opencode).image)
    mark.contentMode = .scaleAspectFit
    mark.layer.cornerRadius = 3
    mark.clipsToBounds = true
    mark.frame = CGRect(x: 0, y: 0, width: side, height: side)
    mark.isAccessibilityElement = false
    return mark
}

/// A figure alone in the mono figure face (`mono-figure`), on `role`'s line.
func usageFigure(_ role: TypeRole = TypeScale.typeMeta, ink: UIColor, weight: UIFont.Weight? = nil) -> KitLabel {
    let label = KitLabel(role.figure(weight: weight), ink: ink)
    label.tabular = true
    label.isAccessibilityElement = false
    return label
}

/// What `-usage-probe` reads back: the app's own word on what it drew.
let usageProbe: Logger? = ProcessInfo.processInfo.arguments.contains("-usage-probe") ? Logger(subsystem: "dev.cawco.app", category: "UsageProbe") : nil

// MARK: The strip

/// The usage strip (UsageMeter.svelte `face`): a cell for Claude, then one
/// for opencode. Claude's cell is its mark, one 16pt ring per account in
/// carrying order, the time until nothing can carry your new sessions
/// ("3h 10m", "5h+") and under it who takes over next ("then design") or
/// when you're back. The whole strip is one control, 44pt in the rail and
/// 56pt on the phone home's raised card, in every state.
final class UsageCell: HomeCell {
    enum Variant { case rail, home }

    private let strip = UIControl()
    private let face = StripFace()
    var onOpen: () -> Void = {}
    var variant = Variant.rail {
        didSet { place() }
    }

    /// How far in from the cell's edge its words start: the rail's rows'
    /// own inset in the rail; under the phone's status line, its text's.
    var textInset: Double = 0 {
        didSet { place() }
    }

    private var height: NSLayoutConstraint!
    private var faceEdges: [NSLayoutConstraint] = []

    override var ground: UIColor {
        didSet { if height != nil { place() } }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        face.isUserInteractionEnabled = false
        face.translatesAutoresizingMaskIntoConstraints = false
        strip.addSubview(face)
        strip.layer.cornerCurve = .continuous
        strip.addAction(UIAction { [weak self] _ in self?.onOpen() }, for: .touchUpInside)
        strip.isAccessibilityElement = true
        strip.accessibilityTraits = .button
        strip.accessibilityIdentifier = "usage-strip"
        pin(strip, insets: NSDirectionalEdgeInsets(top: 0, leading: -8, bottom: 0, trailing: -8))
        height = strip.heightAnchor.constraint(equalToConstant: 44)
        faceEdges = [
            face.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 8),
            strip.trailingAnchor.constraint(equalTo: face.trailingAnchor, constant: 8),
        ]
        NSLayoutConstraint.activate(faceEdges + [
            height,
            face.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
            face.heightAnchor.constraint(equalToConstant: StripFace.height),
        ])
        pressTarget = strip
        place()
    }

    /// 44pt in the rail; the phone home's strip stands on its own raised card, 56pt (`data-variant="home"`).
    private func place() {
        let home = variant == .home
        height.constant = home ? 56 : 44
        strip.layer.cornerRadius = home ? Radius.radiusMd : Radius.radiusSm
        strip.backgroundColor = home ? Palette.surfaceRaised : .clear
        face.ground = home ? Palette.surfaceRaised : ground
        face.gap = home ? Space.space6 : Space.space2
        // The rail's words start on its content edge; the home card's
        // `space-4` inside its own edge, which stands on the status line's.
        let inset = home ? Space.space4 + textInset - 8 : 8 + textInset
        for edge in faceEdges { edge.constant = inset }
    }

    func configure(_ view: UsageRings, gap: Usage.Gap?, empty: String) {
        face.configure(view, gap: gap, empty: empty)
        strip.accessibilityLabel = face.label
        place()
    }
}

/// The strip's face: its cells, one 34pt row (the first line, 3pt, the
/// caption). Where the room is too narrow for both, opencode's cell steps
/// off (it stays in the label and the sheet) rather than Claude's answer
/// being cut.
private final class StripFace: UIView {
    static let height = 34.0
    /// One mark's room in the strip: 16pt and the 4pt between marks (`SLOT`).
    static let slot = 20.0

    var ground: UIColor = Palette.sidebar { didSet { rings.forEach { $0.ground = ground } } }
    var gap = Space.space2 { didSet { setNeedsLayout() } }
    private(set) var label = ""

    private let noline = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let claudeMark = usageMark("Claude")
    private var rings: [RingsView] = []
    private let more = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    /// Nothing can carry you now: the refresh mark before when an account is back (`data-strip-back`).
    private let backGlyph = GlyphView(.refresh, size: 12, tint: Palette.inkMuted)
    private var claudeBack = false
    private let digits = usageFigure(TypeScale.typeLabel, ink: Palette.inkStrong, weight: .medium)
    private let caption = KitLabel(TypeScale.typeMeta.with(leading: 15.0 / 12), ink: Palette.inkMuted)
    private let goMark = usageMark("opencode")
    private let goRing = RingsView(size: 16)
    private let goGlyph = GlyphView(.refresh, size: 12, tint: Palette.inkMuted)
    private let goDigits = usageFigure(TypeScale.typeLabel, ink: Palette.inkStrong, weight: .medium)
    private let goWeekMark = WeekMarkView()
    private let goWeek = usageFigure(TypeScale.typeMeta.with(leading: 15.0 / 12), ink: Palette.inkMuted)
    private var view: UsageRings?
    private var captionParts: [Rings.Part] = []
    /// opencode's cell as its reading draws it: at its limit (the refresh mark), and with a week.
    private var goBack = false
    private var goHasWeek = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        caption.lineBreakMode = .byTruncatingTail
        more.textAlignment = .center
        for part in [noline, claudeMark, more, backGlyph, digits, caption, goMark, goRing, goGlyph, goDigits, goWeekMark, goWeek] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = true
            addSubview(part)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (face: StripFace, _: UITraitCollection) in face.typeset() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StripFace is built in code")
    }

    func configure(_ view: UsageRings, gap: Usage.Gap?, empty: String) {
        self.view = view
        let shown = view.claude != nil || view.openCode != nil
        noline.isHidden = shown
        noline.text = gap?.short ?? empty
        let accounts = view.claude?.accounts ?? []
        while rings.count < accounts.count {
            let ring = RingsView(size: 16)
            ring.ground = ground
            ring.translatesAutoresizingMaskIntoConstraints = true
            addSubview(ring)
            rings.append(ring)
        }
        while rings.count > accounts.count {
            rings.removeLast().removeFromSuperview()
        }
        for (ring, account) in zip(rings, accounts) {
            ring.configure(account, animated: true)
        }
        claudeBack = false
        if let claude = view.claude {
            let stop = Rings.stopFigure(claude, now: view.now, nameOf: view.nameOf)
            claudeBack = stop.back
            digits.text = stop.figure
            digits.ink = claude.stale != nil ? Palette.inkMuted : Palette.inkStrong
            captionParts = Rings.caption(claude, now: view.now, nameOf: view.nameOf)
        }
        for part in [claudeMark, digits, caption] as [UIView] {
            part.isHidden = view.claude == nil
        }
        backGlyph.isHidden = !claudeBack
        let go = view.openCode
        for part in [goMark, goRing, goDigits] as [UIView] {
            part.isHidden = go == nil
        }
        if let go {
            goRing.configure(go, animated: true)
            let time = Rings.cellTime(go, nil, now: view.now)
            goBack = if case .back = time { true } else { false }
            goGlyph.isHidden = !goBack
            if case let .stop(figure, guess) = time {
                goDigits.text = guess ? "~\(figure)" : figure
            } else {
                goDigits.text = time.figure ?? ""
            }
            let week = Rings.weekLeft(go)
            goHasWeek = week != nil
            goWeekMark.isHidden = week == nil
            goWeek.isHidden = week == nil
            goWeekMark.configure(go)
            goWeek.text = week.map { "\(Rings.number($0))%" }
        } else {
            goBack = false
            goHasWeek = false
        }
        typeset()
        label = triggerLabel(view, gap: gap, empty: empty)
        setNeedsLayout()
    }

    private func typeset() {
        caption.attributedText = UsageWords.text(captionParts, role: TypeScale.typeMeta.with(leading: 15.0 / 12), ink: Palette.inkMuted,
                                                 strongInk: Palette.inkRow, traits: traitCollection)
    }

    /// The strip read out (`triggerLabel`).
    private func triggerLabel(_ view: UsageRings, gap: Usage.Gap?, empty: String) -> String {
        guard view.claude != nil || view.openCode != nil else { return "\(gap?.short ?? empty). Show every limit." }
        var said: [String] = []
        if let claude = view.claude {
            said.append("Claude · \(Rings.stopFigure(claude, now: view.now, nameOf: view.nameOf).said) · "
                + Rings.plain(Rings.caption(claude, now: view.now, nameOf: view.nameOf)))
        }
        if let go = view.openCode {
            said.append(Rings.cellLabel(go, nil, name: "opencode Go", now: view.now))
        }
        return "\(said.joined(separator: ". ")). Show every limit."
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        noline.frame = CGRect(x: 0, y: (Self.height - TypeScale.typeMeta.lineHeight) / 2, width: width, height: TypeScale.typeMeta.lineHeight)
        guard let view else { return }
        let line = 16.0
        let capTop = line + 3
        let capHeight = 15.0
        // opencode's cell, as wide as it says.
        var goWidth = 0.0
        if view.openCode != nil {
            let digitsWidth = goDigits.intrinsicContentSize.width
            let l1 = 14 + 6 + 16 + (goBack ? 6 + 12 : 0) + 6 + digitsWidth
            let cap = goHasWeek ? WeekMarkView.side + 4 + goWeek.intrinsicContentSize.width : 0
            goWidth = max(l1, cap)
        }
        var claudeWidth = width
        var goShown = view.openCode != nil
        if let claude = view.claude {
            let n = Double(claude.accounts.count)
            // The refresh mark and its gap stand before the digits when nothing carries you now.
            let digitsWidth = digits.intrinsicContentSize.width
            let backWidth = claudeBack ? 12.0 + 6 : 0
            // The web's flex row: Claude's cell asks for its first line with one
            // ring's room (the rings stand absolutely, a ring's width their
            // least) or its caption, whichever is wider; where that, the gap
            // and opencode's cell overrun the strip, opencode's cell wraps onto
            // a line the strip does not show (measured on the bench: "then
            // bewinxed" keeps it from 228pt, drops it at 216pt).
            // The caption's own width on one line, whatever room it was last laid in.
            let captionWidth = (caption.attributedText?.boundingRect(with: CGSize(width: 10000, height: 100), options: [.usesLineFragmentOrigin],
                                                                     context: nil).width ?? 0).rounded(.up)
            let asks = max(14 + 6 + 16 + 6 + backWidth + digitsWidth, captionWidth)
            goShown = goShown && asks + gap + goWidth <= width
            usageProbe?.notice("strip wrap asks \(asks, privacy: .public) caption \(captionWidth, privacy: .public) gap \(self.gap, privacy: .public) go \(goWidth, privacy: .public) width \(width, privacy: .public) goShown \(goShown, privacy: .public)")
            claudeWidth = goShown ? width - gap - goWidth : width
            claudeMark.frame = CGRect(x: 0, y: (line - 14) / 2, width: 14, height: 14)
            let room = max(16, min(n * Self.slot - 4, claudeWidth - 14 - 6 - 6 - backWidth - digitsWidth))
            let fit = max(1, Int(((room + 4) / Self.slot).rounded(.down)))
            let shownCount = claude.accounts.count > fit ? fit - 1 : claude.accounts.count
            let extra = claude.accounts.count - shownCount
            let places = shownCount + (extra > 0 ? 1 : 0)
            func slotAt(_ i: Int) -> Double {
                places < 2 ? 0 : min(Double(i) * Self.slot, (room - 16) * Double(i) / Double(places - 1))
            }
            let marksX = 14.0 + 6
            for (i, ring) in rings.enumerated() {
                ring.isHidden = i >= shownCount
                ring.frame = CGRect(x: marksX + slotAt(i), y: 0, width: 16, height: 16)
            }
            more.isHidden = extra == 0
            more.text = "+\(extra)"
            more.frame = CGRect(x: marksX + slotAt(shownCount), y: 0, width: max(16, more.intrinsicContentSize.width), height: 16)
            backGlyph.frame = CGRect(x: marksX + room + 6, y: 2, width: 12, height: 12)
            digits.frame = CGRect(x: marksX + room + 6 + backWidth, y: 0, width: digitsWidth, height: line)
            caption.frame = CGRect(x: 0, y: capTop, width: claudeWidth, height: capHeight)
            usageProbe?.notice("strip marks \(shownCount, privacy: .public) more \(extra, privacy: .public) width \(width, privacy: .public) digits \(self.digits.text ?? "", privacy: .public) caption \(self.caption.text ?? "", privacy: .public)")
        } else {
            claudeWidth = 0
        }
        // What stands of opencode's cell: all of it where it holds the line, else none.
        for part in [goMark, goRing, goDigits] as [UIView] {
            part.isHidden = !goShown
        }
        goGlyph.isHidden = !(goShown && goBack)
        goWeekMark.isHidden = !(goShown && goHasWeek)
        goWeek.isHidden = !(goShown && goHasWeek)
        guard goShown else { return }
        var x = view.claude == nil ? 0 : claudeWidth + gap
        goMark.frame = CGRect(x: x, y: (line - 14) / 2, width: 14, height: 14)
        x += 14 + 6
        goRing.frame = CGRect(x: x, y: 0, width: 16, height: 16)
        x += 16 + 6
        if goBack {
            goGlyph.frame = CGRect(x: x, y: 2, width: 12, height: 12)
            x += 12 + 6
        }
        goDigits.frame = CGRect(x: x, y: 0, width: goDigits.intrinsicContentSize.width, height: line)
        let capX = view.claude == nil ? 0 : claudeWidth + gap
        goWeekMark.frame = CGRect(x: capX, y: capTop + (capHeight - WeekMarkView.side) / 2, width: WeekMarkView.side, height: WeekMarkView.side)
        goWeek.frame = CGRect(x: capX + WeekMarkView.side + 4, y: capTop, width: goWeek.intrinsicContentSize.width, height: capHeight)
    }
}

// MARK: The sheet

/// What the strip opens (UsageMeter.svelte `limits`, the sheet on touch):
/// Claude's head (its mark and name, the time until nothing can carry your
/// new sessions) and the relay bar standing still above the accounts, which
/// scroll and end on a whole row, then the way to the Usage page.
final class UsageSheetController: ObservedViewController {
    private let home: HomeModel
    private let column = UIStackView()
    private let head = UIView()
    private let provider = UIStackView()
    private let kpi = KitLabel(TypeScale.typeKpi, ink: Palette.inkStat)
    /// The KPI, after the refresh mark when nothing can carry you now (`data-stop-back`).
    private let kpiRow = UIStackView()
    /// The KPI's tip (`stopFigure`'s).
    private var kpiTip = ""
    private let relay = RelayView()
    private let wall = UsageWallView()
    private let below = UIStackView()
    private let content = UIView()
    private let foot = UIView()
    private var fade: EdgeFade?
    private var naturalHeight: NSLayoutConstraint!
    private var foldHeight: NSLayoutConstraint!
    private var measuredWidth = 0.0
    private var needsMeasure = true
    private var rankedAt: Double?
    private var rankedFor: Components.Schemas.ProviderForecast?
    /// The cell a band stands for, while its tip is open (`lit`).
    private var lit: String?
    let scroll = UIScrollView()
    /// Opens the Usage page; the foot shows only where a page can be opened.
    var onPage: (() -> Void)?
    /// A session was opened from a sessions list: the sheet goes away, as a menu does.
    var onOpenSession: ((String) -> Void)?
    /// Where an account is signed in (`/config/accounts`): the gap's one action.
    var onSignIn: (() -> Void)?

    init(home: HomeModel) {
        self.home = home
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageSheetController is built in code")
    }

    /// `.usage-sheet .pop-head`: 4pt above, 18pt each side, 12pt under.
    private static let headPad = NSDirectionalEdgeInsets(top: 4, leading: 18, bottom: 12, trailing: 18)
    /// `.usage-sheet .group`: 12pt each side, `space-3` above (`.orgs`), 8pt under.
    static let groupPad = 12.0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "usage-sheet"
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: view.topAnchor),
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            column.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
        ])

        // The head: the Claude mark and "Claude" at the start, the time at the end; the relay under them.
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = "Claude"
        name.accessibilityTraits = .header
        let mark = usageMark("Claude")
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.widthAnchor.constraint(equalToConstant: 14).isActive = true
        mark.heightAnchor.constraint(equalToConstant: 14).isActive = true
        provider.addArrangedSubview(mark)
        provider.addArrangedSubview(name)
        provider.spacing = 7
        provider.alignment = .center
        kpi.tabular = true
        kpi.isUserInteractionEnabled = true
        kpi.isAccessibilityElement = true
        kpi.accessibilityTraits = .image
        kpi.accessibilityIdentifier = "usage-kpi"
        kpi.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(kpiTapped)))
        kpiRow.addArrangedSubview(kpi)
        kpiRow.alignment = .center
        let line = UIStackView(arrangedSubviews: [provider, UIView(), kpiRow])
        line.alignment = .center
        line.spacing = Space.space2
        let headColumn = UIStackView(arrangedSubviews: [line, relay])
        headColumn.axis = .vertical
        headColumn.spacing = Space.space2
        headColumn.translatesAutoresizingMaskIntoConstraints = false
        head.addSubview(headColumn)
        NSLayoutConstraint.activate([
            headColumn.topAnchor.constraint(equalTo: head.topAnchor, constant: Self.headPad.top),
            headColumn.leadingAnchor.constraint(equalTo: head.leadingAnchor, constant: Self.headPad.leading),
            head.trailingAnchor.constraint(equalTo: headColumn.trailingAnchor, constant: Self.headPad.trailing),
            head.bottomAnchor.constraint(equalTo: headColumn.bottomAnchor, constant: Self.headPad.bottom),
        ])
        relay.onBand = { [weak self] seg, band in self?.bandTapped(seg, band) }

        // The accounts: the wall, then any provider's note, scrolling under the edge fade.
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.accessibilityIdentifier = "usage-accounts"
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        below.axis = .vertical
        below.translatesAutoresizingMaskIntoConstraints = false
        wall.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(wall)
        content.addSubview(below)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
            wall.topAnchor.constraint(equalTo: content.topAnchor),
            wall.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            wall.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            below.topAnchor.constraint(equalTo: wall.bottomAnchor),
            below.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            below.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            below.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
        naturalHeight = scroll.heightAnchor.constraint(equalToConstant: 0)
        naturalHeight.priority = .defaultHigh - 1
        naturalHeight.isActive = true
        foldHeight = scroll.heightAnchor.constraint(lessThanOrEqualToConstant: 10000)
        foldHeight.isActive = true
        fade = EdgeFade(scroll, length: 40)
        wall.onDial = { [weak self] ring, name in self?.tip(Rings.dialTip(ring, ring.id == "opencode" ? nil : self?.shownClaude, now: self?.shownNow ?? 0),
                                                            title: name) }
        wall.onTip = { [weak self] words in self?.tip(words, title: nil) }
        wall.onChip = { [weak self] ring, name, cell in self?.sessions(ring, name: name, cell: cell) }

        // The foot: Open usage, an outline button over a hairline, the touch floor's height.
        let button = KitButton.make("Open usage", variant: .outline, height: .lg) { [weak self] in self?.onPage?() }
        button.translatesAutoresizingMaskIntoConstraints = false
        foot.addSubview(button)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        foot.addSubview(rule)
        NSLayoutConstraint.activate([
            rule.topAnchor.constraint(equalTo: foot.topAnchor),
            rule.leadingAnchor.constraint(equalTo: foot.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: foot.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            button.topAnchor.constraint(equalTo: rule.bottomAnchor, constant: 10),
            button.leadingAnchor.constraint(equalTo: foot.leadingAnchor, constant: 14),
            foot.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: 14),
            foot.bottomAnchor.constraint(equalTo: button.bottomAnchor, constant: 10),
            button.heightAnchor.constraint(equalToConstant: 44),
        ])
        let headRule = UIView()
        headRule.backgroundColor = Palette.borderHairline
        headRule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        column.addArrangedSubview(head)
        column.addArrangedSubview(headRule)
        column.addArrangedSubview(scroll)
        column.addArrangedSubview(foot)
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (controller: UsageSheetController, _: UITraitCollection) in
            controller.needsMeasure = true
            controller.view.setNeedsLayout()
        }
    }

    private var shownClaude: Rings.Claude?
    private var shownNow = 0.0

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = scroll.bounds.width
        guard width > 0 else { return }
        if needsMeasure || measuredWidth != width {
            needsMeasure = false
            measuredWidth = width
            foldHeight.constant = 10000
            let wallHeight = wall.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                          verticalFittingPriority: .fittingSizeLevel).height
            let belowHeight = below.arrangedSubviews.isEmpty ? 0 : below.systemLayoutSizeFitting(
                CGSize(width: width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
            ).height
            let natural = wallHeight + belowHeight
            naturalHeight.constant = natural
            view.layoutIfNeeded()
        }
        // The fold (`wholeRows`): when the accounts scroll, they end on the
        // deepest cell or section foot that fits the room they are given.
        let room = scroll.bounds.height
        if room + 1 < naturalHeight.constant {
            let feet = wall.feet.map { $0 + wall.frame.minY }.filter { $0 <= room + 0.5 }
            if let deepest = feet.max(), deepest > 0, abs(foldHeight.constant - deepest) > 0.5 {
                foldHeight.constant = deepest
            }
        }
        usageProbe?.notice("sheet accounts height \(self.scroll.bounds.height, privacy: .public) natural \(self.naturalHeight.constant, privacy: .public)")
    }

    override func refreshContent() {
        let usage = home.usage
        let now = usage.now
        shownClaude = usage.claude
        shownNow = now
        // The wall ranks at the last reading's moment: the minute moving on never reorders it.
        if rankedAt == nil || rankedFor != home.usageForecast {
            rankedAt = now
            rankedFor = home.usageForecast
        }
        let gap = home.usageGap(usage)
        let notes = home.usageNotes(usage, gap: gap)
        head.isHidden = usage.claude == nil
        if let claude = usage.claude {
            kpi.role = TypeScale.typeKpi.with(points: TypeScale.typeKpi.points(viewport: Double(view.window?.bounds.width ?? view.bounds.width)))
            let stop = Rings.stopFigure(claude, now: now, nameOf: usage.nameOf)
            kpi.text = stop.figure
            kpi.ink = claude.stale != nil ? Palette.inkMuted : Palette.inkStat
            kpi.accessibilityLabel = stop.said
            kpiTip = stop.tip
            // The refresh mark at 0.8 of the figure's size, a quarter of it before the figure (`.kpi-glyph`).
            for glyph in kpiRow.arrangedSubviews where glyph is GlyphView {
                glyph.removeFromSuperview()
            }
            if stop.back {
                kpiRow.insertArrangedSubview(GlyphView(.refresh, size: (kpi.font.pointSize * 0.8).rounded(), tint: Palette.inkMuted), at: 0)
            }
            kpiRow.spacing = (kpi.font.pointSize * 0.25).rounded()
            let segments = Rings.segments(usage.spans, accounts: claude.accounts, now: now)
            relay.configure(segments, stopKey: Rings.stopKey(segments, stopAt: claude.stopAt, now: now), names: usage.nameOf)
            usageProbe?.notice("now \(Int(now), privacy: .public) kpi \(stop.figure, privacy: .public) back \(stop.back, privacy: .public) bands \(segments.compactMap { seg in seg.ring.map { Rings.bandTip(seg, name: usage.nameOf($0)) } }.joined(separator: " | "), privacy: .public)")
            usageProbe?.notice("relay \(segments.map { "\($0.ring?.id ?? "blank"):\(Int($0.ms / 60000))" }.joined(separator: ","), privacy: .public) stop \(Rings.stopKey(segments, stopAt: claude.stopAt, now: now) ?? "none", privacy: .public)")
        }
        wall.configure(usage, rankedAt: rankedAt ?? now, lit: lit)
        below.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if usage.claude == nil, usage.openCode == nil, gap == nil, notes.isEmpty {
            below.addArrangedSubview(Self.line(home.usageEmpty(usage), mark: nil, ruled: false))
        }
        if let gap {
            below.addArrangedSubview(gapView(gap, ruled: false))
        }
        for (index, note) in notes.enumerated() {
            below.addArrangedSubview(Self.line(note.text, mark: note.id, ruled: index > 0 || gap != nil || usage.claude != nil || usage.openCode != nil))
        }
        foot.isHidden = onPage == nil
        needsMeasure = true
        view.setNeedsLayout()
    }

    /// Claude's gap (`.pop-gap`): the whole why the strip's line stands for, and the sign-in when it fixes it.
    private func gapView(_ gap: Usage.Gap, ruled: Bool) -> UIView {
        let box = Self.line(gap.reason, mark: "Claude", ruled: ruled)
        guard gap.signIn, let onSignIn else { return box }
        let column = UIStackView(arrangedSubviews: [box, KitButton.make("Sign in an account", glyph: .key, variant: .outline, height: .sm) { [weak self] in
            self?.dismiss(animated: true) { onSignIn() }
        }])
        column.axis = .vertical
        column.alignment = .leading
        column.spacing = Space.space2
        return column
    }

    /// A line of muted meta (`.pop-empty`, `.pop-note`): 10pt above and below, 12pt in, led by its provider's mark.
    private static func line(_ text: String, mark: String?, ruled: Bool) -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        label.text = text
        label.wrap = .pretty
        let row = UIStackView(arrangedSubviews: (mark.map { [usageMark($0)] } ?? []) + [label])
        row.spacing = 6
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        let box = UIView()
        box.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
            row.topAnchor.constraint(equalTo: box.topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -10),
        ])
        if ruled {
            let rule = UIView()
            rule.backgroundColor = Palette.borderHairline
            rule.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(rule)
            NSLayoutConstraint.activate([
                rule.leadingAnchor.constraint(equalTo: box.leadingAnchor),
                rule.trailingAnchor.constraint(equalTo: box.trailingAnchor),
                rule.topAnchor.constraint(equalTo: box.topAnchor),
                rule.heightAnchor.constraint(equalToConstant: 1),
            ])
        }
        return box
    }

    // MARK: Tips

    /// A cell's tip covers no cell: in the sheet, which has no free edge, it
    /// stands over its head, above the accounts.
    private func tip(_ words: String, title: String?) {
        let top = CGRect(x: Self.groupPad, y: scroll.bounds.minY, width: scroll.bounds.width - 2 * Self.groupPad, height: 0)
        UsageTipController.show(words, title: title, from: scroll, rect: top, side: .top, in: self)
    }

    @objc private func kpiTapped() {
        UsageTipController.show(kpiTip, from: kpi, side: .bottom, in: self)
    }

    /// A band names its account and its span above the bar, and lights its cell while open.
    private func bandTapped(_ seg: Rings.Segment, _ band: UIView) {
        guard let ring = seg.ring else { return }
        lit = ring.id
        wall.light(ring.id)
        UsageTipController.show(Rings.bandTip(seg, name: home.usage.nameOf(ring)), from: band, side: .top, in: self) { [weak self] in
            self?.lit = nil
            self?.wall.light(nil)
        }
    }

    /// The sessions an account carries, in a card hung 4pt under its cell's
    /// row, as wide as the wall (SessionsChip.svelte).
    private func sessions(_ ring: Rings.Account, name: String, cell: CGRect) {
        let list = UsageSessionsController(ring.sessions, name: name, home: home) { [weak self] id in
            self?.dismiss(animated: true) { self?.onOpenSession?(id) }
        }
        list.reach = wall.reach(below: cell, own: list.ownHeight)
        // The wall's own grid, inside the group's padding.
        let grid = wall.bounds.width - 2 * Self.groupPad
        list.preferredContentSize = CGSize(width: grid, height: max(list.ownHeight, list.reach))
        KitPopover.present(list, from: wall, rect: CGRect(x: Self.groupPad, y: cell.minY, width: grid, height: cell.height), in: self,
                           align: .start, side: .bottom, offset: 4)
    }
}

// MARK: The dial wall

/// The accounts (the dial wall): one grid, two columns of cells, `space-1`
/// gaps; each wall column is five tracks: the dial (32pt), the status slot
/// (12pt), the time (the rest), the week's mark (10pt) and the week's share
/// (as wide as "100%" in the figure face), so every dial, slot, time, mark
/// and share's end stands on one x down the wall. Each organization, and
/// the ungrouped run, starts its own row; opencode Go stands on the wall's
/// own grid after the hairline that parts the providers.
final class UsageWallView: UIView {
    /// A dial was tapped: its account and the name its cell shows.
    var onDial: (Rings.Account, String) -> Void = { _, _ in }
    /// A mark with its own words was tapped (the status slot, the delegates' mark, the carrier's cell).
    var onTip: (String) -> Void = { _ in }
    /// A session count was tapped: its account, its name, and its cell's row in the wall.
    var onChip: (Rings.Account, String, CGRect) -> Void = { _, _, _ in }

    private enum Item {
        case head(KitLabel)
        case cell(UsageCellView)
        case seam(UIView)
    }

    private var items: [Item] = []
    private var cells: [String: UsageCellView] = [:]
    private var height: NSLayoutConstraint!
    private var laidWidth = 0.0
    /// Each row's foot: where the fold may fall.
    private(set) var feet: [Double] = []
    /// Every cell's and head's frame: what a sessions card covers whole or not at all.
    private var zones: [CGRect] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        height = heightAnchor.constraint(equalToConstant: 0)
        height.priority = .required - 1
        height.isActive = true
        accessibilityIdentifier = "usage-wall"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageWallView is built in code")
    }

    func configure(_ view: UsageRings, rankedAt: Double, lit: String?) {
        items.forEach { item in
            switch item {
            case let .head(label): label.removeFromSuperview()
            case let .cell(cell): cell.removeFromSuperview()
            case let .seam(seam): seam.removeFromSuperview()
            }
        }
        items = []
        var kept: [String: UsageCellView] = [:]
        let names = view.names
        func cell(_ ring: Rings.Account, _ c: Rings.Claude?) -> UsageCellView {
            let one = cells[ring.id] ?? UsageCellView()
            kept[ring.id] = one
            let name = c == nil ? Rings.ShownName(domain: "", local: "opencode Go") : names[ring.id] ?? Rings.ShownName(domain: "", local: ring.name)
            one.configure(ring, c, name: name, now: view.now)
            one.lit = ring.id == lit
            one.onDial = { [weak self] in self?.onDial(ring, name.whole) }
            one.onTip = { [weak self] words in self?.onTip(words) }
            one.onChip = { [weak self, weak one] in
                guard let self, let one else { return }
                onChip(ring, name.whole, one.frame)
            }
            addSubview(one)
            return one
        }
        if let claude = view.claude {
            for block in Rings.wall(claude, rankedAt: rankedAt) {
                if let head = block.head {
                    let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
                    label.text = head
                    label.accessibilityTraits = .header
                    label.translatesAutoresizingMaskIntoConstraints = true
                    addSubview(label)
                    items.append(.head(label))
                }
                for ring in block.cells {
                    items.append(.cell(cell(ring, claude)))
                }
            }
        }
        if let go = view.openCode {
            if view.claude != nil {
                let seam = UIView()
                seam.backgroundColor = Palette.borderHairline
                addSubview(seam)
                items.append(.seam(seam))
            }
            items.append(.cell(cell(go, nil)))
        }
        cells = kept
        laidWidth = 0
        setNeedsLayout()
        invalidateIntrinsicContentSize()
        if bounds.width > 0 { layoutWall(bounds.width) }
    }

    /// While a relay band's tip is open its cell takes the hover wash.
    func light(_ id: String?) {
        for (key, cell) in cells {
            cell.lit = key == id
        }
    }

    /// The share track: as wide as "100%" in the figure face.
    private static var shareWidth: Double {
        let label = usageFigure(ink: Palette.inkMuted)
        label.text = "100%"
        return label.intrinsicContentSize.width.rounded(.up)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width != laidWidth { layoutWall(bounds.width) }
    }

    override func systemLayoutSizeFitting(_ target: CGSize, withHorizontalFittingPriority _: UILayoutPriority,
                                          verticalFittingPriority _: UILayoutPriority) -> CGSize {
        CGSize(width: target.width, height: layoutWall(target.width, place: false))
    }

    /// Lays the wall out at `width` and returns its height.
    @discardableResult
    private func layoutWall(_ width: Double, place: Bool = true) -> Double {
        let pad = UsageSheetController.groupPad
        let gap = Space.space1
        let inner = width - 2 * pad
        let share = Self.shareWidth
        let cellWidth = max(0, (inner - gap) / 2)
        let tracks = UsageCellView.Tracks(cellWidth: cellWidth, shareWidth: share)
        var y = Space.space3
        var feet: [Double] = []
        var zones: [CGRect] = []
        var row: [UsageCellView] = []
        var first = true
        func endRow() {
            guard !row.isEmpty else { return }
            let tall = row.map { $0.height(tracks) }.max() ?? 0
            for (i, cell) in row.enumerated() {
                let frame = CGRect(x: pad + Double(i) * (cellWidth + gap), y: y, width: cellWidth, height: tall)
                if place {
                    cell.frame = frame
                    cell.lay(tracks)
                }
                zones.append(frame)
            }
            y += tall
            feet.append(y)
            y += gap
            row = []
            first = false
        }
        var blockIndex = 0
        for item in items {
            switch item {
            case let .head(label):
                endRow()
                // Every block after the first stands `space-3` from the one before.
                if blockIndex > 0 { y += Space.space3 - Space.space1 }
                let line = TypeScale.typeMeta.lineHeight
                let frame = CGRect(x: pad + Space.space1, y: y, width: inner - Space.space1, height: line)
                if place { label.frame = frame }
                zones.append(CGRect(x: pad, y: y, width: inner, height: line + 2))
                y += line + 2
                feet.append(y)
                y += gap
                blockIndex += 1
                first = false
            case let .cell(cell):
                row.append(cell)
                if row.count == 2 { endRow() }
            case let .seam(seam):
                endRow()
                // The providers' hairline, edge to edge, `space-1` above and below.
                y += Space.space1
                if place { seam.frame = CGRect(x: 0, y: y, width: width, height: 1) }
                y += 1 + Space.space1 + gap
                blockIndex += 1
            }
        }
        endRow()
        _ = first
        // The last row's gap goes; the group's 8pt foot pad stands under it.
        let total = (items.isEmpty ? 0 : y - gap + 8)
        if place {
            laidWidth = width
            self.feet = feet
            self.zones = zones
            if height.constant != total { height.constant = total }
            if let probe = usageProbe {
                for item in items {
                    if case let .cell(cell) = item { probe.notice("\(cell.probeLine(in: self), privacy: .public)") }
                }
            }
        }
        return total
    }

    /// How tall a sessions card hung 4pt under `cell` must stand so its foot
    /// covers whole cells or none (SessionsChip.svelte `reach`); 0: its own.
    func reach(below cell: CGRect, own: Double) -> Double {
        let top = cell.maxY + 4
        var end = top + own + 2
        var moved = true
        while moved {
            moved = false
            for zone in zones where zone != cell && zone.minY < end - 0.5 && end < zone.maxY - 0.5 {
                end = zone.maxY
                moved = true
            }
        }
        return end - top > own + 2.5 ? end - top - 2 : 0
    }
}

/// A cell of the dial wall (UsageMeter.svelte `cellBody`): one row on its
/// column's five tracks, `space-1` in on every side. The dial on both lines;
/// its name on the first (the Go plan's led by its mark), the delegates'
/// mark after it where new delegates start, the sessions it runs at the
/// line's end; the status slot, how long it lasts, the week's mark and its
/// share on the second.
final class UsageCellView: UIView {
    /// The five tracks' x's inside a cell, the subgrid's (its 4pt padding on its edge tracks).
    struct Tracks {
        let dialX: Double
        let slotX: Double
        let timeX: Double
        let timeWidth: Double
        let markX: Double
        let shareX: Double
        let shareWidth: Double

        init(cellWidth: Double, shareWidth: Double) {
            let pad = Space.space1
            let gap = Space.space1
            dialX = pad
            slotX = pad + 32 + gap
            timeX = slotX + 12 + gap
            let rest = cellWidth - timeX - gap - WeekMarkView.side - gap - shareWidth - pad
            timeWidth = max(0, rest)
            markX = timeX + timeWidth + gap
            shareX = markX + WeekMarkView.side + gap
            self.shareWidth = shareWidth
        }

        /// The first line's room: from the time's x to the share's end.
        var lineWidth: Double { shareX + shareWidth - timeX }
    }

    var onDial: () -> Void = {}
    var onTip: (String) -> Void = { _ in }
    var onChip: () -> Void = {}
    var lit = false { didSet { paint() } }

    private let dial = UIControl()
    private let rings = RingsView(size: 32)
    private let goMark = usageMark("opencode", side: 16)
    private let name = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 0)
    private let delegates = UIControl()
    private let delegatesGlyph = GlyphView(.toolTask, size: 12, tint: Palette.inkRow)
    private let chip = UIControl()
    private let chipFigure = usageFigure(ink: Palette.inkRow)
    private let status = UIControl()
    private let refresh = GlyphView(.refresh, size: 12, tint: Palette.inkMuted)
    private let tilde = usageFigure(ink: Palette.inkMuted)
    private let time = usageFigure(ink: Palette.inkRow)
    private let weekMark = WeekMarkView()
    private let share = usageFigure(ink: Palette.inkMuted)
    private let edge = CAShapeLayer()
    private var ring: Rings.Account?
    private var carrying = false
    private var go = false
    private var shown = Rings.ShownName(domain: "", local: "")
    private var statusTip: String?
    private var delegatesTip: String?

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        edge.fillColor = nil
        edge.lineWidth = 1
        layer.addSublayer(edge)
        dial.addSubview(rings)
        dial.isAccessibilityElement = true
        dial.accessibilityTraits = .button
        dial.addAction(UIAction { [weak self] _ in self?.onDial() }, for: .touchUpInside)
        delegates.addSubview(delegatesGlyph)
        delegates.isAccessibilityElement = true
        delegates.accessibilityTraits = .image
        delegates.accessibilityIdentifier = "usage-delegates"
        delegates.addAction(UIAction { [weak self] _ in
            guard let self, let words = delegatesTip else { return }
            onTip(words)
        }, for: .touchUpInside)
        chip.addSubview(chipFigure)
        chip.backgroundColor = Palette.surfaceRecess
        chip.layer.cornerRadius = 5
        chip.layer.cornerCurve = .continuous
        chip.isAccessibilityElement = true
        chip.accessibilityTraits = .button
        chip.accessibilityIdentifier = "usage-sessions-chip"
        chip.addAction(UIAction { [weak self] _ in self?.onChip() }, for: .touchUpInside)
        chipFigure.textAlignment = .center
        status.addSubview(refresh)
        status.isAccessibilityElement = true
        status.accessibilityTraits = .image
        status.addAction(UIAction { [weak self] _ in
            guard let self, let words = statusTip else { return }
            onTip(words)
        }, for: .touchUpInside)
        tilde.text = "~"
        tilde.textAlignment = .right
        share.textAlignment = .right
        // A name breaks between words, and inside one only where it must (`overflow-wrap: anywhere`).
        name.lineBreakMode = .byWordWrapping
        // Every part stands where `lay` puts it: none takes part in Auto Layout,
        // which would put a label back at the cell's corner on its next pass.
        for part in [dial, goMark, name, delegates, chip, status, tilde, time, weekMark, share, delegatesGlyph, chipFigure, refresh, rings] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = true
        }
        for part in [dial, goMark, name, delegates, chip, status, tilde, time, weekMark, share] as [UIView] {
            addSubview(part)
        }
        // The carrier's cell says, on a tap, that new sessions start there; a
        // control inside it (the dial, the count, a mark) speaks for itself instead.
        let tap = UITapGestureRecognizer(target: self, action: #selector(cellTapped))
        tap.delegate = self
        addGestureRecognizer(tap)
        accessibilityContainerType = .semanticGroup
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: UsageCellView, _: UITraitCollection) in cell.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageCellView is built in code")
    }

    @objc private func cellTapped() {
        if carrying { onTip("New sessions start here") }
    }

    func configure(_ ring: Rings.Account, _ c: Rings.Claude?, name shown: Rings.ShownName, now: Double) {
        let fresh = self.ring?.id != ring.id
        self.ring = ring
        self.shown = shown
        go = c == nil
        carrying = c?.carry?.id == ring.id
        rings.configure(ring, animated: !fresh)
        let tip = Rings.dialTip(ring, c, now: now)
        dial.accessibilityLabel = "\(shown.whole): \(tip)"
        dial.accessibilityIdentifier = "usage-dial-\(ring.id)"
        goMark.isHidden = !go
        let words = NSMutableAttributedString(string: shown.local, attributes: TypeScale.typeMeta.withWeight(.medium).attributes(color: Palette.inkStrong))
        if !shown.domain.isEmpty {
            words.append(NSAttributedString(string: shown.domain, attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
        }
        name.attributedText = words
        name.isAccessibilityElement = false
        if let c, c.delegate?.id == ring.id {
            delegatesTip = Rings.delegateTip(c, to: ring)
            delegates.isHidden = false
            delegates.accessibilityLabel = delegatesTip
        } else {
            delegatesTip = nil
            delegates.isHidden = true
        }
        let count = ring.sessions.count
        chip.isHidden = count == 0
        chipFigure.text = String(count)
        chip.accessibilityLabel = "\(count) \(count == 1 ? "session" : "sessions") on \(ring.name)"
        let cellTime = Rings.cellTime(ring, c, now: now)
        switch cellTime {
        case let .back(figure):
            statusTip = figure.map { "At its limit. Back in \($0)." } ?? "At its limit."
            status.isHidden = false
            status.accessibilityLabel = statusTip
            tilde.isHidden = true
            time.ink = Palette.inkRow
        case let .stop(_, guess):
            statusTip = nil
            status.isHidden = true
            tilde.isHidden = !guess
            time.ink = guess ? Palette.inkMuted : Palette.inkRow
        }
        time.text = cellTime.figure ?? ""
        let week = Rings.weekLeft(ring)
        weekMark.isHidden = week == nil
        share.isHidden = week == nil
        weekMark.configure(ring)
        share.text = week.map { "\(Rings.number($0))%" }
        accessibilityLabel = Rings.cellLabel(ring, c, name: shown.whole, now: now)
        accessibilityIdentifier = "usage-cell-\(ring.id)"
        rings.ground = ring.state == .limit ? Palette.meterWashOver.over(Palette.surfaceRaised) : Palette.surfaceRaised
        paint()
        setNeedsLayout()
    }

    private func paint() {
        let limit = ring?.state == .limit
        backgroundColor = lit ? Palette.surfaceHover : limit ? Palette.meterWashOver : .clear
        rings.ground = lit ? Palette.surfaceHover.over(Palette.surfaceRaised)
            : limit ? Palette.meterWashOver.over(Palette.surfaceRaised) : Palette.surfaceRaised
        edge.strokeColor = carrying ? Palette.borderButtonOutline.resolvedColor(with: traitCollection).cgColor : nil
    }

    /// The first line's parts' widths, left to right, at `tracks`.
    private func firstLine(_ tracks: Tracks) -> (nameWidth: Double, nameHeight: Double, height: Double) {
        var room = tracks.lineWidth
        if go { room -= 16 + Space.space1 }
        if !delegates.isHidden { room -= Space.space1 + 12 }
        if !chip.isHidden { room -= Space.space1 + chipWidth }
        room = max(0, room)
        let one = name.sizeThatFits(CGSize(width: 10000, height: 10000))
        var nameSize = one
        if one.width > room {
            // The domain goes under the local part when the two don't fit, and a
            // name longer than the cell wraps; never an ellipsis.
            if !shown.domain.isEmpty {
                let words = NSMutableAttributedString(string: shown.local + "\n",
                                                      attributes: TypeScale.typeMeta.withWeight(.medium).attributes(color: Palette.inkStrong))
                words.append(NSAttributedString(string: shown.domain, attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
                name.attributedText = words
            }
            nameSize = name.sizeThatFits(CGSize(width: room, height: 10000))
        }
        let width = min(room, nameSize.width.rounded(.up))
        let line = max(nameSize.height, go ? 16 : 0, chip.isHidden ? 0 : 16)
        return (width, nameSize.height, line)
    }

    private var chipWidth: Double {
        max(16, chipFigure.intrinsicContentSize.width + 2 * Space.space1)
    }

    /// Its height at `tracks`: `space-1`, the first line, the second line, `space-1`.
    func height(_ tracks: Tracks) -> Double {
        Space.space1 + firstLine(tracks).height + TypeScale.typeMeta.lineHeight + Space.space1
    }

    func lay(_ tracks: Tracks) {
        let top = Space.space1
        let first = firstLine(tracks)
        let meta = TypeScale.typeMeta.lineHeight
        let lineTwo = top + first.height
        let foot = bounds.height - Space.space1
        // The dial, centred on the two lines.
        let rowsMid = (top + lineTwo + meta) / 2
        dial.frame = CGRect(x: tracks.dialX, y: rowsMid - 16, width: 32, height: 32)
        rings.frame = dial.bounds
        // The first line, centred: [mark] name [delegates] … count.
        var x = tracks.timeX
        let mid = top + first.height / 2
        if go {
            goMark.frame = CGRect(x: x, y: mid - 8, width: 16, height: 16)
            x += 16 + Space.space1
        }
        name.frame = CGRect(x: x, y: mid - first.nameHeight / 2, width: first.nameWidth, height: first.nameHeight)
        x += first.nameWidth
        if !delegates.isHidden {
            x += Space.space1
            delegates.frame = CGRect(x: x, y: mid - 6, width: 12, height: 12)
            delegatesGlyph.frame = delegates.bounds
            x += 12
        }
        if !chip.isHidden {
            let width = chipWidth
            chip.frame = CGRect(x: tracks.shareX + tracks.shareWidth - width, y: mid - 8, width: width, height: 16)
            chipFigure.frame = chip.bounds
        }
        // The second line: the status slot, the time, the week's mark and its share.
        let lineMid = lineTwo + meta / 2
        status.frame = CGRect(x: tracks.slotX, y: lineMid - 6, width: 12, height: 12)
        refresh.frame = status.bounds
        tilde.frame = CGRect(x: tracks.slotX, y: lineTwo, width: 12, height: meta)
        time.frame = CGRect(x: tracks.timeX, y: lineTwo, width: tracks.timeWidth, height: meta)
        weekMark.frame = CGRect(x: tracks.markX, y: lineMid - WeekMarkView.side / 2, width: WeekMarkView.side, height: WeekMarkView.side)
        share.frame = CGRect(x: tracks.shareX, y: lineTwo, width: tracks.shareWidth, height: meta)
        _ = foot
        edge.frame = bounds
        edge.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusSm - 0.5).cgPath
    }

    /// A press on the count reaches 44pt tall and `space-5` / 2 to either side.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        super.point(inside: point, with: event)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if !chip.isHidden, chip.frame.insetBy(dx: -Space.space5 / 2, dy: -(44 - 16) / 2).contains(point) { return chip }
        return super.hitTest(point, with: event)
    }

    /// `-usage-probe`'s line for this cell: its x's in the wall, its words and its figures' face.
    func probeLine(in wall: UIView) -> String {
        func x(_ view: UIView) -> String { String(format: "%.2f", view.convert(view.bounds, to: wall).minX) }
        func end(_ view: UIView) -> String { String(format: "%.2f", view.convert(view.bounds, to: wall).maxX) }
        let shareInk = share.textAlignment == .right ? end(share) : x(share)
        let shareEnd = share.sizeThatFits(.zero).width
        _ = shareEnd
        return "cell \(ring?.id ?? "") name=\(shown.whole) time=\(time.text ?? "") guess=\(!tilde.isHidden) back=\(!status.isHidden) week=\(share.isHidden ? "-" : share.text ?? "") "
            + "dialX=\(x(dial)) slotX=\(x(status)) timeX=\(x(time)) markX=\(x(weekMark)) shareEnd=\(shareInk) nameX=\(x(name)) "
            + "y=\(String(format: "%.2f", frame.minY)) h=\(String(format: "%.2f", frame.height)) "
            + "timeFont=\(time.font.fontName) shareFont=\(share.font.fontName) chipFont=\(chipFigure.font.fontName) nameFont=\(name.attributedText.flatMap { $0.length > 0 ? ($0.attribute(.font, at: 0, effectiveRange: nil) as? UIFont)?.fontName : nil } ?? "") "
            + "sessions=\(chip.isHidden ? 0 : ring?.sessions.count ?? 0) delegates=\(!delegates.isHidden) carry=\(carrying) "
            + "dialTip=\((dial.accessibilityLabel ?? "").replacingOccurrences(of: "\n", with: " / ")) statusTip=\(statusTip ?? "-") delegatesTip=\(delegatesTip ?? "-")"
    }
}

extension UsageCellView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var view = touch.view
        while let at = view, at !== self {
            if at is UIControl { return false }
            view = at.superview
        }
        return true
    }
}

/// The sessions an account carries (SessionsChip.svelte's list): a card,
/// its head line the account's name as its cell shows it and how many,
/// then each session's status glyph, title and project, 44pt, each opening
/// its session and putting the sheet away.
final class UsageSessionsController: KitPopoverController {
    private let rows: [InstanceRow]
    private let name: String
    private let home: HomeModel
    private let open: (String) -> Void
    /// The height its foot reaches to so it covers whole cells (0: its own).
    var reach = 0.0

    init(_ rows: [InstanceRow], name: String, home: HomeModel, open: @escaping (String) -> Void) {
        self.rows = rows
        self.name = name
        self.home = home
        self.open = open
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageSessionsController is built in code")
    }

    /// Its own height: the head, its sessions and its 1pt edges.
    var ownHeight: Double {
        Space.space2 + TypeScale.typeMeta.lineHeight + Space.space1 + Double(rows.count) * 44 + 2
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.boxShadow = Shadow.shadowRaised
        let stack = UIStackView()
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        let head = KitLabel(TypeScale.typeMeta.withWeight(.medium), ink: Palette.inkStrong)
        head.text = "\(name) · \(rows.count == 1 ? "1 session" : "\(rows.count) sessions")"
        let headBox = UIView()
        head.translatesAutoresizingMaskIntoConstraints = false
        headBox.addSubview(head)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: headBox.topAnchor, constant: Space.space2),
            head.bottomAnchor.constraint(equalTo: headBox.bottomAnchor, constant: -Space.space1),
            head.leadingAnchor.constraint(equalTo: headBox.leadingAnchor, constant: Space.space3),
            head.trailingAnchor.constraint(equalTo: headBox.trailingAnchor, constant: -Space.space3),
        ])
        stack.addArrangedSubview(headBox)
        for row in rows {
            stack.addArrangedSubview(item(row))
        }
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor),
        ])
    }

    private func item(_ row: InstanceRow) -> UIView {
        let control = UIControl()
        let face: SessionStatusView.Face = if row.isFailed {
            .failed
        } else {
            switch home.activity(row.id) {
            case .working: .working
            case .blocked: .needsYou
            case .idle: .idle
            }
        }
        let glyph = SessionStatusView(face, compact: true)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = home.fleetTitle(row)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let project = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        project.text = home.usagePlace(row)
        project.setContentCompressionResistancePriority(.defaultLow - 1, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [glyph, title, project])
        line.spacing = Space.space2
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        control.addSubview(line)
        NSLayoutConstraint.activate([
            control.heightAnchor.constraint(equalToConstant: 44),
            line.leadingAnchor.constraint(equalTo: control.leadingAnchor, constant: Space.space3),
            line.trailingAnchor.constraint(lessThanOrEqualTo: control.trailingAnchor, constant: -Space.space3),
            line.centerYAnchor.constraint(equalTo: control.centerYAnchor),
            project.widthAnchor.constraint(lessThanOrEqualTo: control.widthAnchor, multiplier: 0.4),
        ])
        control.isAccessibilityElement = true
        control.accessibilityTraits = .link
        control.accessibilityLabel = "\(home.fleetTitle(row)), \(home.usagePlace(row))"
        control.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            dismiss(animated: true) { self.open(row.id) }
        }, for: .touchUpInside)
        return control
    }
}
