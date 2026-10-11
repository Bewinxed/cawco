import OSLog

/// An animation that repeats, as it starts and as it stops, in the app's
/// `Loops` log; in a DEBUG build only, where a simulator probe reads it.
/// XCTest takes an app with an animation running as never idle
/// (rdar://25562105), so a probe whose read of the screen timed out prints
/// the loops that were still on.
public enum LoopLog {
    #if DEBUG
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Loops")
    #endif

    /// `what` began repeating on `owner`; the owner's address pairs it with its `off`.
    public static func on(_ what: String, _ owner: AnyObject) {
        #if DEBUG
        log.notice("loop on \(what, privacy: .public) \(address(owner), privacy: .public)")
        #endif
    }

    /// `what` stopped on `owner`.
    public static func off(_ what: String, _ owner: AnyObject) {
        #if DEBUG
        log.notice("loop off \(what, privacy: .public) \(address(owner), privacy: .public)")
        #endif
    }

    private static func address(_ owner: AnyObject) -> String {
        String(UInt(bitPattern: ObjectIdentifier(owner).hashValue), radix: 16)
    }
}
