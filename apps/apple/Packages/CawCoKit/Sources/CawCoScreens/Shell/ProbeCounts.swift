#if DEBUG
/// How often the shell laid itself out, placed Caw's panel and made the
/// panel's rows again, for a simulator probe (DEBUG only): `-shell-probe`'s
/// once-a-second `probe loops` line says how many of each came since the
/// line before it. A layout pass that sets off another runs these into the
/// thousands a second, and a main thread kept busy that way is what XCTest
/// reports as "process main thread busy".
enum ProbeCounts {
    static var shellLayouts = 0
    static var panelPlaces = 0
    static var panelRows = 0
}
#endif
