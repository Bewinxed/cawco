import CawCoDesign
public import UIKit

/// The kit's table (ui/table) in a result's frame (tasks/ResultTable.svelte):
/// a hairline border at `--radius-sm`, clipped; the head in label type, each
/// cell in body type in `--foreground`, rules under the head and every row
/// but the last. Its columns are laid out as the web lays out a
/// `width: 100%` table (TableBlock), scrolling sideways where they cannot
/// fit; a body cell wraps (`whitespace-normal`), the head does not.
public final class KitTableView: UIView {
    /// One cell: its words, and the address they open when they are one.
    public struct Cell: Sendable {
        public let text: String
        public let link: URL?

        public init(_ text: String, link: URL? = nil) {
            self.text = text
            self.link = link
        }
    }

    public init(columns: [String], rows: [[Cell]]) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.borderWidth = 1
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        clipsToBounds = true
        let table = TableBlock(metrics: .kit)
        table.configure(head: columns.map { Self.words($0, role: TypeScale.typeLabel, link: nil) },
                        rows: rows.map { $0.map { Self.words($0.text, role: TypeScale.typeBody, link: $0.link) } })
        pin(table)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: KitTableView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// A cell's words in `role`, wrapping at spaces; a link in the link's ink.
    private static func words(_ text: String, role: TypeRole, link: URL?) -> NSAttributedString {
        var attributes = role.attributes(color: Palette.foreground)
        if let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byWordWrapping
            attributes[.paragraphStyle] = paragraph
        }
        if let link { attributes[.link] = link }
        return NSAttributedString(string: text, attributes: attributes)
    }
}
