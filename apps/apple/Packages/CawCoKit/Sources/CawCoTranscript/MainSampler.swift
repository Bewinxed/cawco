#if DEBUG && arch(arm64)
import Darwin
import Foundation
import OSLog
import Synchronization

/// A simulator pass's sampling profiler for the main thread (probe-kit spec
/// `ios-scroll-up`, the app launched with `-probe-sample`), where no
/// Instruments template that samples is at hand. Every millisecond a thread
/// of its own suspends the main thread, reads its registers, walks its frame
/// pointers within its stack, and resumes it; nothing is allocated while the
/// main thread is suspended (it may hold the allocator's lock). The return
/// addresses are named afterwards (`dladdr`), and each sample where the main
/// thread was not waiting in its run loop counts once for every function on
/// its stack, filed under what the transcript was doing (`phase`). Every ten
/// seconds the functions found most often are said, as `probe sample`.
nonisolated enum MainSampler {
    /// What the transcript in view is doing: 0 neither, 1 the list scrolling, 2 a turn streaming.
    static let phase = Atomic<Int>(0)
    private static let names = ["other", "scrolling", "streaming"]
    /// Where the main thread waits for work: a sample there is not busy.
    private static let waits: Set<String> = ["mach_msg2_trap", "mach_msg_trap", "__psynch_cvwait", "__semwait_signal", "__ulock_wait", "__ulock_wait2"]

    /// Starts sampling the calling thread, the main one, when the app was launched with `-probe-sample`.
    @MainActor static func start() {
        guard ProcessInfo.processInfo.arguments.contains("-probe-sample") else { return }
        let port = mach_thread_self()
        let top = UInt(bitPattern: pthread_get_stackaddr_np(pthread_self()))
        let bottom = top - UInt(pthread_get_stacksize_np(pthread_self()))
        let thread = Thread { run(port, top: top, bottom: bottom) }
        thread.name = "dev.cawco.sampler"
        thread.qualityOfService = .userInteractive
        thread.start()
    }

    private static func run(_ port: thread_act_t, top: UInt, bottom: UInt) {
        let log = Logger(subsystem: "dev.cawco.app", category: "Transcript")
        let depth = 128
        let frames = UnsafeMutablePointer<UInt>.allocate(capacity: depth)
        var inclusive = [[String: Int]](repeating: [:], count: 3)
        var leaf = [[String: Int]](repeating: [:], count: 3)
        var busy = [0, 0, 0]
        var named: [UInt: String] = [:]
        var said = Date()
        while true {
            usleep(1000)
            let at = phase.load(ordering: .relaxed)
            let count = sample(port, into: frames, depth: depth, top: top, bottom: bottom)
            guard count > 0 else { continue }
            var stack: [String] = []
            for i in 0 ..< count {
                // Pointer-authentication bits off, as a return address carries them.
                let address = frames[i] & 0x0000_7FFF_FFFF_FFFF
                var info = Dl_info()
                guard dladdr(UnsafeRawPointer(bitPattern: address), &info) != 0, let start = info.dli_saddr else { continue }
                let key = UInt(bitPattern: start)
                if let name = named[key] {
                    stack.append(name)
                } else {
                    let name = info.dli_sname.map { String(cString: $0) } ?? "?"
                    named[key] = name
                    stack.append(name)
                }
            }
            guard let first = stack.first, !waits.contains(first) else { continue }
            busy[at] += 1
            leaf[at][first, default: 0] += 1
            for name in Set(stack) { inclusive[at][name, default: 0] += 1 }
            guard Date().timeIntervalSince(said) >= 10 else { continue }
            said = Date()
            // A line holds what the log keeps of one message (under 1 KB): the
            // functions are said a dozen at a time, most found first.
            func lines(_ counts: [String: Int], _ n: Int) -> [String] {
                let ranked = counts.sorted { $0.value > $1.value }.prefix(n).map { name, hits in "\(String(name.prefix(70))) \(hits)" }
                return stride(from: 0, to: ranked.count, by: 12).map { ranked[$0 ..< min($0 + 12, ranked.count)].joined(separator: " | ") }
            }
            for phase in [1, 2] where busy[phase] > 0 {
                log.notice("probe sample \(names[phase], privacy: .public): \(busy[phase]) busy samples")
                for (i, line) in lines(inclusive[phase], 72).enumerated() {
                    log.notice("probe sample \(names[phase], privacy: .public) on the stack \(i + 1): \(line, privacy: .public)")
                }
                for (i, line) in lines(leaf[phase], 24).enumerated() {
                    log.notice("probe sample \(names[phase], privacy: .public) leaves \(i + 1): \(line, privacy: .public)")
                }
            }
        }
    }

    /// The main thread's return addresses, innermost first, into `frames`; how many.
    private static func sample(_ port: thread_act_t, into frames: UnsafeMutablePointer<UInt>, depth: Int, top: UInt, bottom: UInt) -> Int {
        guard thread_suspend(port) == KERN_SUCCESS else { return 0 }
        defer { thread_resume(port) }
        var state = arm_thread_state64_t()
        var size = mach_msg_type_number_t(MemoryLayout<arm_thread_state64_t>.size / MemoryLayout<natural_t>.size)
        let got = withUnsafeMutablePointer(to: &state) { pointer in
            pointer.withMemoryRebound(to: natural_t.self, capacity: Int(size)) { thread_get_state(port, ARM_THREAD_STATE64, $0, &size) }
        }
        guard got == KERN_SUCCESS else { return 0 }
        // arm_thread_state64_t: x0–x28, then fp, lr, sp, pc.
        let (fp0, lr, pc) = withUnsafeBytes(of: &state) { raw in
            (raw.load(fromByteOffset: 232, as: UInt.self), raw.load(fromByteOffset: 240, as: UInt.self), raw.load(fromByteOffset: 256, as: UInt.self))
        }
        frames[0] = pc
        frames[1] = lr
        var count = 2
        var fp = fp0 & 0x0000_7FFF_FFFF_FFFF
        while count < depth, fp >= bottom, fp + 16 <= top, fp & 7 == 0, let frame = UnsafePointer<UInt>(bitPattern: fp) {
            let next = frame.pointee & 0x0000_7FFF_FFFF_FFFF
            let ret = frame.advanced(by: 1).pointee
            guard ret != 0 else { break }
            frames[count] = ret
            count += 1
            guard next > fp else { break }
            fp = next
        }
        return count
    }
}
#endif
