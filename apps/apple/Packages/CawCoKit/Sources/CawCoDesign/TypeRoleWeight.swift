import UIKit

public extension TypeRole {
    /// The role at another weight, as a web rule that keeps a role's size but
    /// restates its weight (`text-label` on a row that is not `font-medium`).
    func withWeight(_ weight: UIFont.Weight) -> TypeRole {
        TypeRole(weight: weight, size: size, leading: leading, family: family)
    }
}
