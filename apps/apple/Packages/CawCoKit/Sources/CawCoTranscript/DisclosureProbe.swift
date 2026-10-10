#if DEBUG
import OSLog
import UIKit

/// A DEBUG build's account of a body opening or folding shut, a frame at a
/// time, for scripts/probe-ios-disclosure.ts: where the row above the moving
/// one, the moving row's top and foot, and the row below it stand in the
/// list's view, read off their presentation layers (what the screen shows,
/// any motion UIKit runs on its own clock included). The first line is the
/// list as it stood before the toggle changed anything; then one a frame
/// until 0.6s after it, so a settle after the motion shows too.
@MainActor
final class DisclosureProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Disclosure")
    private var watched: (serial: Int, row: String, above: String?, below: String?, start: CFTimeInterval)?
    private var serial = 0

    /// The row `row` is about to open (`open`) or fold shut; `ids` is the
    /// list's order, `cell` finds the cell an item stands in now.
    func begin(_ list: UICollectionView, row: String, open: Bool, ids: [String], cell: (String) -> UICollectionViewCell?) {
        let at = ids.firstIndex(of: row)
        let above = at.flatMap { $0 > 0 ? ids[$0 - 1] : nil }
        let below = at.flatMap { $0 + 1 < ids.count ? ids[$0 + 1] : nil }
        serial += 1
        watched = (serial, row, above, below, CACurrentMediaTime())
        Self.log.notice("begin \(self.serial) \(open ? "open" : "shut", privacy: .public) row=\(row, privacy: .public) above=\(above ?? "-", privacy: .public) below=\(below ?? "-", privacy: .public)")
        record(list, cell: cell, label: "base")
    }

    /// One frame's sample.
    func sample(_ list: UICollectionView, cell: (String) -> UICollectionViewCell?) {
        guard let watched else { return }
        guard CACurrentMediaTime() - watched.start <= 0.6 else {
            Self.log.notice("end \(watched.serial)")
            self.watched = nil
            return
        }
        record(list, cell: cell, label: "f")
    }

    private func record(_ list: UICollectionView, cell: (String) -> UICollectionViewCell?, label: String) {
        guard let watched else { return }
        let origin = (list.layer.presentation() ?? list.layer).bounds.minY
        func frame(_ id: String?) -> CGRect? {
            guard let id, let cell = cell(id) else { return nil }
            return (cell.layer.presentation() ?? cell.layer).frame
        }
        func y(_ value: CGFloat?) -> String { value.map { String(format: "%.2f", $0 - origin) } ?? "nil" }
        let row = frame(watched.row)
        let ms = Int((CACurrentMediaTime() - watched.start) * 1000)
        let line = "\(label) \(watched.serial) ms=\(ms) above=\(y(frame(watched.above)?.minY)) top=\(y(row?.minY))"
            + " foot=\(y(row?.maxY)) below=\(y(frame(watched.below)?.minY)) offset=\(String(format: "%.2f", origin))"
            + " size=\(String(format: "%.2f", list.contentSize.height)) inset=\(String(format: "%.2f", list.contentInset.bottom))"
        Self.log.notice("\(line, privacy: .public)")
    }
}
#endif
