import SwiftUI

/// A type role from the token source (`TypeScale.type*`): weight, size, line
/// height and font stack. `size` is a range because title and kpi are fluid
/// on the web; every other role's range is one value.
public struct TypeRole: Sendable {
    public let weight: Font.Weight
    public let size: ClosedRange<Double>
    /// Line height as a multiple of the size.
    public let leading: Double
    /// The CSS font stack, first choice first.
    public let family: [String]
}
