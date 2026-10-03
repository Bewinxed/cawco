import UIKit

/// One system-managed bar recipe. These group APIs are iOS16, so they are
/// used on every supported OS; only the newer overflow priority is gated.
enum NavigationItems {
    static func configure(_ item: UINavigationItem, leading: [UIBarButtonItem] = [], prominent: [UIBarButtonItem] = [], trailing: [UIBarButtonItem] = [], overflow: [UIMenuElement] = []) {
        item.leftItemsSupplementBackButton = false
        item.leadingItemGroups = leading.isEmpty ? [] : [UIBarButtonItemGroup(barButtonItems: leading, representativeItem: nil)]
        item.pinnedTrailingGroup = prominent.isEmpty ? nil : UIBarButtonItemGroup(barButtonItems: prominent, representativeItem: nil)
        item.trailingItemGroups = trailing.isEmpty ? [] : [UIBarButtonItemGroup(barButtonItems: trailing, representativeItem: nil)]
        item.additionalOverflowItems = overflow.isEmpty ? nil : UIDeferredMenuElement.uncached { completion in completion(overflow) }
    }

    static func keepVisible(_ items: [UIBarButtonItem]) {
        if #available(iOS 27.0, macCatalyst 27.0, *) {
            for item in items { item.visibilityPriority = .high }
        }
    }
}
