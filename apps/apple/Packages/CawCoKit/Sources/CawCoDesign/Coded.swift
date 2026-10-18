import UIKit

public extension TypeRole {
    /// Shared words that name code (a slug, a path, `${VAR}`), as
    /// Coded.svelte sets them: core marks each such run with backticks, set
    /// here in the code face at this role's size; the rest in this role.
    func coded(_ text: String, color: UIColor) -> NSAttributedString {
        let code = TypeScale.typeCode.with(points: points)
        let made = NSMutableAttributedString()
        for (at, run) in text.components(separatedBy: "`").enumerated() where !run.isEmpty {
            made.append(NSAttributedString(string: run, attributes: (at % 2 == 1 ? code : self).attributes(color: color)))
        }
        return made
    }
}
