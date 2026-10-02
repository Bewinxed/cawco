/// What a session is doing: the status vocabulary every surface shows.
public enum SessionStatus: CaseIterable, Hashable, Sendable {
    case starting
    case working
    case needsYou
    case idle
    case done
    case stopped
    case error
    case unknown
}
