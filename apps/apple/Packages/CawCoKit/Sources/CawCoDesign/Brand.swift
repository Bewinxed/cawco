import UIKit

/// The dashboard's bitmap, including its original spark field and head crop.
public enum CawCoBrand {
    public static var icon: UIImage {
        UIImage(named: "CawCoIcon", in: .module, compatibleWith: nil)!
    }

    /// Nunito 1000 with the web's tracking, inside the existing body line box.
    public static var wordmarkRole: TypeRole {
        TypeRole(weight: .black,
                 size: TypeScale.typeBody.size,
                 leading: TypeScale.leadingKpi,
                 family: FontFamily.fontWordmark,
                 tracking: TypeScale.trackWordmark)
    }
}
