import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// A ledger (the routines page's tables: the task table's band and rows):
/// its band, `cToolbarCtl` tall on the band surface, each head in caps label
/// type, muted; then its rows, at least `cBtnHLg` tall, `space-2` by
/// `space-3` in, meta type, a hairline between them. Columns are fixed
/// widths but one, which takes the rest.
struct LedgerColumn {
    /// Its head; nil for a column read out but not drawn (`sr-only`).
    let head: String?
    /// What a screen reader hears for a headless column.
    let said: String?
    /// Its width; nil for the column that takes the rest.
    let width: Double?
    /// The cell's end padding is the column's own (a state column has none).
    var trailing = Space.space3

    static func fixed(_ head: String?, said: String? = nil, width: Double, trailing: Double = Space.space3) -> LedgerColumn {
        LedgerColumn(head: head, said: said, width: width, trailing: trailing)
    }

    static func rest(_ head: String) -> LedgerColumn {
        LedgerColumn(head: head, said: nil, width: nil)
    }
}

enum LedgerParts {
    /// The band: each column's head.
    @MainActor
    static func band(_ columns: [LedgerColumn]) -> UIView {
        let band = UIView()
        band.backgroundColor = Palette.surfaceBand
        let row = cells(columns, columns.map { column -> UIView in
            let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, tracking: TypeScale.trackCaps)
            head.text = column.head?.uppercased()
            head.isAccessibilityElement = column.head != nil
            return head
        }, inset: 0)
        band.addSubview(row)
        NSLayoutConstraint.activate([
            band.heightAnchor.constraint(equalToConstant: Size.cToolbarCtl),
            row.leadingAnchor.constraint(equalTo: band.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: band.trailingAnchor),
            row.centerYAnchor.constraint(equalTo: band.centerYAnchor),
        ])
        return band
    }

    /// One row's cells at their columns' widths, each `space-3` in, centred on the row.
    @MainActor
    static func cells(_ columns: [LedgerColumn], _ views: [UIView], inset: Double = Space.space2) -> UIStackView {
        let row = UIStackView()
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        for (column, view) in zip(columns, views) {
            let cell = UIView()
            view.translatesAutoresizingMaskIntoConstraints = false
            cell.addSubview(view)
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: cell.topAnchor, constant: inset),
                view.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -inset),
                view.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: Space.space3),
                view.trailingAnchor.constraint(lessThanOrEqualTo: cell.trailingAnchor, constant: -column.trailing),
            ])
            if let width = column.width {
                cell.widthAnchor.constraint(equalToConstant: width).isActive = true
                cell.setContentHuggingPriority(.required, for: .horizontal)
            } else {
                cell.setContentHuggingPriority(.init(1), for: .horizontal)
                cell.setContentCompressionResistancePriority(.init(1), for: .horizontal)
                view.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -column.trailing).isActive = true
            }
            row.addArrangedSubview(cell)
        }
        return row
    }

    /// A row: its cells, at least `cBtnHLg` tall, with the hairline over it unless it is the first.
    @MainActor
    static func row(_ columns: [LedgerColumn], _ views: [UIView], first: Bool) -> UIView {
        let box = UIView()
        let line = cells(columns, views)
        box.addSubview(line)
        NSLayoutConstraint.activate([
            box.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            line.topAnchor.constraint(greaterThanOrEqualTo: box.topAnchor),
            line.bottomAnchor.constraint(lessThanOrEqualTo: box.bottomAnchor),
            line.centerYAnchor.constraint(equalTo: box.centerYAnchor),
            line.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        ])
        if !first { box.addSubview(Hairline(top: true)) }
        return box
    }

    /// A word in the meta type and muted ink, one line, cut at its end.
    @MainActor
    static func meta(_ text: String?, ink: UIColor = Palette.inkMuted) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: ink)
        label.text = text
        label.tabular = true
        label.lineBreakMode = .byTruncatingTail
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }

    /// A service's mark (ProviderLogo.svelte) at 16pt in the row's lead; nothing for a service nobody draws.
    @MainActor
    static func mark(_ service: String) -> UIView {
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([box.widthAnchor.constraint(equalToConstant: Size.cRowLead), box.heightAnchor.constraint(equalToConstant: Size.iconMd)])
        if let logo = BrandLogo.provider(service.lowercased()) {
            let image = UIImageView(image: logo.image)
            image.tintColor = Palette.inkStrong
            image.contentMode = .scaleAspectFit
            image.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(image)
            NSLayoutConstraint.activate([
                image.widthAnchor.constraint(equalToConstant: Size.iconMd),
                image.heightAnchor.constraint(equalToConstant: Size.iconMd),
                image.centerXAnchor.constraint(equalTo: box.centerXAnchor),
                image.centerYAnchor.constraint(equalTo: box.centerYAnchor),
            ])
        }
        box.isAccessibilityElement = true
        box.accessibilityLabel = service
        return box
    }

    /// The whole of a cell, where a pointer that rests on it reads it (the web's `title`).
    @MainActor
    static func tip(_ view: UIView, _ text: String?) {
        view.interactions.filter { $0 is UIToolTipInteraction }.forEach { view.removeInteraction($0) }
        guard let text, !text.isEmpty else { return }
        view.addInteraction(UIToolTipInteraction(defaultToolTip: text))
    }
}

/// A hairline along a row's top, in the hairline border ink.
final class Hairline: UIView {
    init(top: Bool) {
        super.init(frame: .zero)
        backgroundColor = Palette.borderHairline
        isUserInteractionEnabled = false
        autoresizingMask = [.flexibleWidth, top ? .flexibleBottomMargin : .flexibleTopMargin]
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("Hairline is built in code")
    }

    /// `border-block-start: 1px`, across its row.
    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        guard let superview else { return }
        frame = CGRect(x: 0, y: 0, width: superview.bounds.width, height: 1)
    }
}

/// How a run, a read or an action went, one vocabulary across the routines
/// page (RunStatus.svelte): its glyph's shape and hue say how it went, the
/// words what or when, on one line in tabular figures. `said` is what the
/// glyph alone says to the eye, read out before the words.
final class RunStatusView: UIView {
    enum Status { case done, failed, running, neutral, waiting }

    private let glyph = GlyphView(.passed, size: Size.iconSm, tint: Palette.statusDoneGlyph)
    private let spinner = KitSpinner(side: Size.iconSm, tint: Palette.statusLiveGlyph)
    private let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)

    init() {
        super.init(frame: .zero)
        words.tabular = true
        words.lineBreakMode = .byTruncatingTail
        let row = UIStackView(arrangedSubviews: [glyph, spinner, words])
        row.spacing = Space.space1
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RunStatusView is built in code")
    }

    func show(_ status: Status, text: String, said: String? = nil, title: String? = nil) {
        spinner.isHidden = status != .running
        glyph.isHidden = status == .running
        switch status {
        case .done:
            glyph.glyph = .passed
            glyph.tintColor = Palette.statusDoneGlyph
            words.ink = Palette.inkMuted
        case .failed:
            glyph.glyph = .failed
            glyph.tintColor = Palette.statusFailGlyph
            words.ink = Palette.statusFailInk
        case .running:
            words.ink = Palette.statusLiveInk
        case .waiting:
            glyph.glyph = .attention
            glyph.tintColor = Palette.statusAttnGlyph
            words.ink = Palette.statusAttnInk
        case .neutral:
            glyph.glyph = .minusCircle
            glyph.tintColor = Palette.inkSubtle
            words.ink = Palette.inkMuted
        }
        words.text = text
        accessibilityLabel = [said, text].compactMap(\.self).joined(separator: ", ")
        LedgerParts.tip(self, title)
    }
}
