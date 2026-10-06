// This file is a port of Cuelume 0.2.4 (https://github.com/danielwh2/cuelume),
// dist/audio/engine.js, dist/sounds/context.js and dist/sounds/recipes.js:
// the default theme's `select`, `open` and `close` cues, their layers,
// envelopes, glides and noise, the per-play shaping (emphasis, cadence,
// direction, strike variation), the one-voice-per-cue release, the shared
// room and the output stage, synthesized on the audio thread.
//
// MIT License
//
// Copyright (c) 2026 Daniel Belyi
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// The same notice ships in the app as Resources/Licenses/Cuelume.txt.

import Accelerate
import AudioToolbox
import AVFoundation
import os
import QuartzCore

/// The cues the composer plays, by Cuelume's names.
public enum CueName: Int, Sendable, CaseIterable {
    /// A crisp detent over a small wooden knock.
    case select
    /// Air drawing upward with a light note swelling inside it.
    case open
    /// The same air falling shut over a low, damped mallet note.
    case close
}

/// How much the action matters (context.js `EMPHASIS`): the arrangement
/// plays the layers marked at or under it.
public enum CueEmphasis: Int, Sendable {
    case subtle, normal, strong
}

/// One layer of a recipe (recipes.js `ToneLayer` / `NoiseLayer`).
struct CueLayer: Sendable {
    enum Source: Sendable {
        case sine
        case bandpass
        case lowpass
    }

    var source: Source
    /// A tone's frequency, or a noise layer's filter frequency, in Hz.
    var frequency: Double
    var glideTo: Double?
    var glideTime: Double?
    /// The filter's Q: linear for a bandpass, in dB for a lowpass (Web Audio's reading).
    var filterQ = 1.0
    var attack: Double
    var decay: Double
    var peak: Double
    var offset = 0.0
    /// The emphasis from which the layer plays (`from`, subtle when absent).
    var from = CueEmphasis.subtle

    var isTone: Bool {
        if case .sine = source { return true }
        return false
    }

    /// recipes.js `knock`: a sine struck sharp that drops to `frequency` in 18 ms.
    static func knock(_ frequency: Double, _ decay: Double, _ peak: Double, from: CueEmphasis = .subtle) -> CueLayer {
        CueLayer(source: .sine, frequency: frequency * 1.6, glideTo: frequency, glideTime: 0.018, attack: 0.001, decay: decay, peak: peak, from: from)
    }
}

/// A cue's recipe (recipes.js `RECIPES`, the default theme).
struct CueRecipe: Sendable {
    var masterGain: Double
    var layers: [CueLayer]
    /// How much more than the rest the cue rings into the room (`room`).
    var room = 1.0
    /// Per-strike variation, for a cue that has it (`vary`). None of these three does.
    var vary: (pitch: Double, level: Double)?

    static func of(_ cue: CueName) -> CueRecipe {
        switch cue {
        case .select:
            CueRecipe(masterGain: 0.306, layers: [
                CueLayer(source: .bandpass, frequency: 2800, filterQ: 2.2, attack: 0.001, decay: 0.008, peak: 0.16, from: .normal),
                .knock(415, 0.016, 0.03),
                .knock(208, 0.025, 0.025, from: .strong),
            ])
        case .open:
            CueRecipe(masterGain: 0.335, layers: [
                CueLayer(source: .bandpass, frequency: 600, glideTo: 1500, glideTime: 0.1, filterQ: 1.4, attack: 0.05, decay: 0.06, peak: 0.168),
                CueLayer(source: .sine, frequency: 659.25, attack: 0.05, decay: 0.12, peak: 0.015),
                CueLayer(source: .sine, frequency: 1318.51, attack: 0.05, decay: 0.05, peak: 0.005, from: .normal),
                CueLayer(source: .lowpass, frequency: 250, filterQ: 0.7, attack: 0.04, decay: 0.08, peak: 0.12, from: .strong),
            ])
        case .close:
            CueRecipe(masterGain: 0.258, layers: [
                CueLayer(source: .bandpass, frequency: 1400, glideTo: 540, glideTime: 0.07, filterQ: 1.4, attack: 0.02, decay: 0.06, peak: 0.216),
                CueLayer(source: .sine, frequency: 261.63, attack: 0.003, decay: 0.08, peak: 0.02),
                CueLayer(source: .bandpass, frequency: 350, filterQ: 2, attack: 0.001, decay: 0.03, peak: 0.2, from: .normal),
                CueLayer(source: .bandpass, frequency: 165, filterQ: 2, attack: 0.001, decay: 0.04, peak: 0.3, from: .strong),
            ])
        }
    }
}

/// The shape one play bends its recipe by (context.js `shapeFor`).
struct CueShape {
    var pitch = 1.0
    var level = 1.0
    var length = 1.0
    var bright = 1.0
    var tail = 1.0

    /// Layers centred at or above this are the bright ones (`BRIGHT_HZ`).
    static let brightHz = 2500.0

    /// `emphasis`, `cadence` for a cue that takes it, and `select`'s direction.
    static func of(_ cue: CueName, emphasis: CueEmphasis, direction: Int, sinceLastMs: Double) -> CueShape {
        var shape = CueShape()
        switch emphasis {
        case .subtle: shape.level *= 0.8; shape.length *= 0.85; shape.bright *= 0.75
        case .normal: break
        case .strong: shape.pitch *= 0.98; shape.level *= 1.08; shape.length *= 1.2; shape.bright *= 1.1
        }
        if cue == .select {
            // `cadence`: repeats closer than 70 ms play fully lightened, slower than 220 ms not at all.
            let speed = min(1, max(0, (220 - sinceLastMs) / (220 - 70)))
            shape.level *= 1 - 0.22 * speed
            shape.length *= 1 - 0.25 * speed
            shape.bright *= 1 - 0.2 * speed
            shape.tail *= 1 - 0.8 * speed
            // A later option rises, an earlier one falls (`DIRECTION_STEP`).
            if direction != 0 { shape.pitch *= 1 + 0.05 * Double(direction.signum()) }
        }
        return shape
    }
}

/// One shaped layer, in the render thread's units: samples from the play's start.
struct CueVoicing: Sendable {
    var source: CueLayer.Source
    var frequency: Double
    var glideTo: Double?
    var glide: Double
    var filterQ: Double
    var attack: Double
    var decay: Double
    var peak: Double
    var offset: Int
    /// Where the source stops: its envelope's end and engine.js's 50 ms of padding.
    var stop: Int
    /// Where in the shared noise this play's noise begins (a different stretch every time).
    var noiseStart: Int
}

/// Up to four layers, inline: a play crosses to the audio thread without
/// anything the audio thread would ever have to free.
struct CueVoicings: Sendable {
    private var a, b, c, d: CueVoicing?
    private(set) var count = 0

    mutating func append(_ voicing: CueVoicing) {
        switch count {
        case 0: a = voicing
        case 1: b = voicing
        case 2: c = voicing
        case 3: d = voicing
        default: return
        }
        count += 1
    }

    subscript(index: Int) -> CueVoicing {
        switch index {
        case 0: a!
        case 1: b!
        case 2: c!
        default: d!
        }
    }
}

/// One play, as the main thread hands it over.
struct CuePlay: Sendable {
    var cue: Int
    var serial: Int
    var master: Double
    var send: Double
    var voicings: CueVoicings
    /// Samples from its start until it is let go (engine.js's cleanup).
    var length: Int
}

/// Cuelume's engine on one `AVAudioSourceNode`: every play's layers summed
/// into its master gain, the master into the output and, at the room's send,
/// into the shared room (a lowpass into a convolver), then the output gain
/// and the limiter. The main thread shapes each play (`play`) and posts it;
/// the audio thread renders. Nothing on the audio thread allocates, frees or
/// waits: the posted plays are swapped in under a lock it only tries.
final class CueSynth: @unchecked Sendable {
    let sampleRate: Double

    // engine.js's constants.
    private static let sourceStopPadding = 0.05
    private static let cleanupMargin = 0.05
    private static let outputGain = 4.0
    private static let noiseSeconds = 2.0
    private static let roomSeconds = 0.25
    private static let roomPredelay = 0.008
    private static let roomLowpass = 3500.0
    private static let flatQ = -3.0
    private static let roomSend = 0.08
    private static let roomDecayDb = 60.0
    private static let releaseTime = 0.08
    private static let decayJitter = 0.1
    private static let modeJitter = 0.005

    // MARK: Main thread

    private let inbox: OSAllocatedUnfairLock<[CuePlay]>
    private var serial = 0
    private var lastPlayed: [CueName: Double] = [:]

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        var waiting: [CuePlay] = []
        waiting.reserveCapacity(16)
        inbox = OSAllocatedUnfairLock(initialState: waiting)
        let noiseLength = max(1, Int(Self.noiseSeconds * sampleRate))
        noise = (0 ..< noiseLength).map { _ in Float.random(in: -1 ..< 1) }
        walls = Biquad.lowpass(Self.roomLowpass, q: Self.flatQ, rate: sampleRate)
        room = Room(sampleRate: sampleRate, seconds: Self.roomSeconds, predelay: Self.roomPredelay, decayDb: Self.roomDecayDb)
        limiter = Limiter(sampleRate: sampleRate)
        incoming.reserveCapacity(16)
        voices.reserveCapacity(Self.voiceLimit)
    }

    /// engine.js `play` → `renderRecipe`, the main thread's half: the
    /// recipe arranged for `emphasis`, shaped for this play, posted.
    func play(_ cue: CueName, emphasis: CueEmphasis = .subtle, direction: Int = 0, volume: Double = 1) {
        let now = CACurrentMediaTime() * 1000
        let since = now - (lastPlayed[cue] ?? -.infinity)
        lastPlayed[cue] = now
        let recipe = CueRecipe.of(cue)
        let shape = CueShape.of(cue, emphasis: emphasis, direction: direction, sinceLastMs: since)
        let nudge = { (amount: Double) in 1 + (Double.random(in: 0 ..< 1) * 2 - 1) * amount }
        let strike = recipe.vary.map { (pitch: nudge($0.pitch), force: nudge($0.level)) } ?? (pitch: 1, force: 1)
        var voicings = CueVoicings()
        var end = 0.0
        for layer in recipe.layers where emphasis.rawValue >= layer.from.rawValue {
            // context.js `layerFactors`, bounded so no context runs away with a cue.
            let gain = shape.level * (layer.frequency >= CueShape.brightHz ? shape.bright : 1) * (layer.offset > 0 ? shape.tail : 1)
            let factorPitch = min(1.25, max(0.75, shape.pitch))
            let factorGain = min(1.5, max(0, gain))
            let factorLength = min(1.6, max(0.6, shape.length))
            // engine.js `shaped`: a harder strike raises a noise layer's filter with its level.
            let tune = layer.isTone ? (recipe.vary == nil ? 1 : nudge(Self.modeJitter)) : strike.force
            let pitch = factorPitch * strike.pitch * tune
            let decay = layer.decay * factorLength * (recipe.vary == nil ? 1 : nudge(Self.decayJitter))
            let span = layer.offset + layer.attack + decay + Self.sourceStopPadding
            end = max(end, span)
            voicings.append(CueVoicing(
                source: layer.source, frequency: layer.frequency * pitch, glideTo: layer.glideTo.map { $0 * pitch },
                glide: (layer.glideTime ?? layer.attack + decay) * sampleRate, filterQ: layer.filterQ,
                attack: layer.attack * sampleRate, decay: decay * sampleRate, peak: layer.peak * factorGain * strike.force,
                offset: Int((layer.offset * sampleRate).rounded()), stop: Int((span * sampleRate).rounded()),
                noiseStart: Int.random(in: 0 ..< noise.count)
            ))
        }
        serial += 1
        let play = CuePlay(cue: cue.rawValue, serial: serial, master: recipe.masterGain * volume, send: Self.roomSend * recipe.room,
                           voicings: voicings, length: Int(((end + Self.cleanupMargin) * sampleRate).rounded()))
        inbox.withLock { $0.append(play) }
    }

    /// The node the engine pulls this synth's audio from.
    func makeNode() -> AVAudioSourceNode? {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else { return nil }
        return AVAudioSourceNode(format: format) { [self] silence, _, frames, list in
            silence.pointee = ObjCBool(render(Int(frames), into: list))
            return noErr
        }
    }

    // MARK: Audio thread

    private struct Voice {
        var play: CuePlay
        var start: Int
        var release = Int.max
        var phase = SIMD4<Double>.zero
        var x1 = SIMD4<Double>.zero
        var x2 = SIMD4<Double>.zero
        var y1 = SIMD4<Double>.zero
        var y2 = SIMD4<Double>.zero
    }

    private static let voiceLimit = 32
    private var incoming: [CuePlay] = []
    private var voices: [Voice] = []
    /// Each cue's latest play: playing it again releases that one (one voice per cue).
    private var latest = [Int](repeating: -1, count: CueName.allCases.count)
    private var clock = 0
    private let noise: [Float]
    private var walls: Biquad
    private let room: Room
    private var limiter: Limiter

    /// Renders `frames` into the node's two channels; true when it was silence.
    private func render(_ frames: Int, into list: UnsafeMutablePointer<AudioBufferList>) -> Bool {
        admit()
        let buffers = UnsafeMutableAudioBufferListPointer(list)
        guard buffers.count >= 2, let left = buffers[0].mData?.assumingMemoryBound(to: Float.self),
              let right = buffers[1].mData?.assumingMemoryBound(to: Float.self) else { return true }
        if voices.isEmpty, room.quiet, limiter.resting {
            for i in 0 ..< frames { left[i] = 0; right[i] = 0 }
            clock += frames
            return true
        }
        for i in 0 ..< frames {
            let t = clock + i
            var dry = 0.0
            var send = 0.0
            for v in voices.indices {
                let gain = master(voices[v], at: t)
                let sound = sample(&voices[v], at: t) * gain
                dry += sound
                send += sound * voices[v].play.send
            }
            let wet = room.process(walls.process(send))
            let out = limiter.process(left: (dry + wet.left) * Self.outputGain, right: (dry + wet.right) * Self.outputGain)
            left[i] = Float(out.left)
            right[i] = Float(out.right)
        }
        clock += frames
        // The room rings on by itself once the last source has fed it.
        var v = 0
        while v < voices.count {
            if clock >= voices[v].start + voices[v].play.length {
                voices.swapAt(v, voices.count - 1)
                voices.removeLast()
            } else {
                v += 1
            }
        }
        return false
    }

    /// Takes what the main thread posted, if the lock is free this time.
    private func admit() {
        let took: Bool? = inbox.withLockIfAvailable { waiting in
            guard !waiting.isEmpty else { return false }
            swap(&waiting, &self.incoming)
            return true
        }
        guard took == true else { return }
        for index in incoming.indices {
            let play = incoming[index]
            // engine.js: the cue's last play fades over RELEASE_TIME instead of stacking.
            for v in voices.indices where voices[v].play.cue == play.cue && voices[v].play.serial == latest[play.cue] && voices[v].release == .max {
                voices[v].release = clock
            }
            latest[play.cue] = play.serial
            if voices.count == Self.voiceLimit { voices.remove(at: 0) }
            voices.append(Voice(play: play, start: clock))
        }
        incoming.removeAll(keepingCapacity: true)
    }

    /// The play's master gain: steady, then from its release an exponential
    /// ramp to 0.0001 over RELEASE_TIME (`exponentialRampToValueAtTime`).
    private func master(_ voice: Voice, at t: Int) -> Double {
        guard t >= voice.release else { return voice.play.master }
        let progress = Double(t - voice.release) / (Self.releaseTime * sampleRate)
        return progress < 1 ? voice.play.master * pow(0.0001 / voice.play.master, progress) : 0.0001
    }

    /// The sum of the play's layers at `t`, each under its envelope: a
    /// straight swell to its peak over the attack, an exponential fall to
    /// 0.0001 over the decay, then held there until its source stops.
    private func sample(_ voice: inout Voice, at t: Int) -> Double {
        var sum = 0.0
        let local = t - voice.start
        for l in 0 ..< voice.play.voicings.count {
            let layer = voice.play.voicings[l]
            let n = local - layer.offset
            guard n >= 0, local < layer.stop else { continue }
            let at = Double(n)
            let envelope: Double = if at < layer.attack {
                layer.peak * at / layer.attack
            } else if at < layer.attack + layer.decay {
                layer.peak * pow(0.0001 / layer.peak, (at - layer.attack) / layer.decay)
            } else {
                0.0001
            }
            var frequency = layer.frequency
            if let to = layer.glideTo {
                frequency = at < layer.glide ? layer.frequency * pow(to / layer.frequency, at / layer.glide) : to
            }
            switch layer.source {
            case .sine:
                sum += sin(voice.phase[l]) * envelope
                var phase = voice.phase[l] + 2 * .pi * frequency / sampleRate
                if phase > 2 * .pi { phase -= 2 * .pi }
                voice.phase[l] = phase
            case .bandpass, .lowpass:
                let x = Double(noise[(layer.noiseStart + n) % noise.count])
                let f = layer.source == .bandpass ? Biquad.bandpass(frequency, q: layer.filterQ, rate: sampleRate)
                    : Biquad.lowpass(frequency, q: layer.filterQ, rate: sampleRate)
                let y = f.b0 * x + f.b1 * voice.x1[l] + f.b2 * voice.x2[l] - f.a1 * voice.y1[l] - f.a2 * voice.y2[l]
                voice.x2[l] = voice.x1[l]
                voice.x1[l] = x
                voice.y2[l] = voice.y1[l]
                voice.y1[l] = y
                sum += y * envelope
            }
        }
        return sum
    }

}

// MARK: The filters

/// A Web Audio `BiquadFilterNode`'s coefficients (the Audio EQ Cookbook, as
/// the Web Audio API specifies them, normalised by a0), and its state for
/// one running filter.
struct Biquad {
    var b0 = 0.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    /// A bandpass of constant 0 dB peak gain; its Q is linear.
    static func bandpass(_ frequency: Double, q: Double, rate: Double) -> Biquad {
        let w0 = 2 * Double.pi * min(frequency, rate / 2) / rate
        let alpha = sin(w0) / (2 * q)
        let a0 = 1 + alpha
        return Biquad(b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: -2 * cos(w0) / a0, a2: (1 - alpha) / a0)
    }

    /// A lowpass; Web Audio reads its Q in dB.
    static func lowpass(_ frequency: Double, q: Double, rate: Double) -> Biquad {
        let w0 = 2 * Double.pi * min(frequency, rate / 2) / rate
        let alpha = sin(w0) / (2 * pow(10, q / 20))
        let cosw = cos(w0)
        let a0 = 1 + alpha
        return Biquad(b0: (1 - cosw) / 2 / a0, b1: (1 - cosw) / a0, b2: (1 - cosw) / 2 / a0, a1: -2 * cosw / a0, a2: (1 - alpha) / a0)
    }

    init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
        self.b0 = b0
        self.b1 = b1
        self.b2 = b2
        self.a1 = a1
        self.a2 = a2
    }

    mutating func process(_ x: Double) -> Double {
        var y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        // A tail this far under the noise floor is silence, so the room can rest.
        if abs(y) < 1e-12 { y = 0 }
        x2 = x1
        x1 = x
        y2 = y1
        y1 = y
        return y
    }
}

// MARK: The room

/// engine.js `buildRoom`'s convolver: a 250 ms burst of reflections, each
/// channel its own noise, silent for the 8 ms predelay, falling 60 dB over
/// its length, scaled to unit energy and convolved unnormalised. Convolved
/// here by uniformly partitioned overlap-save (vDSP's real FFT): the
/// predelay's first block of silence is taken off the response, which pays
/// for the block of latency the partitioning costs, so the room lands where
/// Web Audio's direct convolution puts it.
final class Room: @unchecked Sendable {
    private static let block = 256
    private static let log2n: vDSP_Length = 9
    private let setup: FFTSetup
    private let partitions: Int
    /// Each channel's response, partition by partition, as spectra.
    private let responseRe: [UnsafeMutablePointer<Float>]
    private let responseIm: [UnsafeMutablePointer<Float>]
    /// The input's last `partitions` spectra, newest at `slot`.
    private let historyRe: UnsafeMutablePointer<Float>
    private let historyIm: UnsafeMutablePointer<Float>
    private var slot = 0
    private let time: UnsafeMutablePointer<Float>
    private let accRe: UnsafeMutablePointer<Float>
    private let accIm: UnsafeMutablePointer<Float>
    private let input: UnsafeMutablePointer<Float>
    private let previous: UnsafeMutablePointer<Float>
    private let output: [UnsafeMutablePointer<Float>]
    private var position = 0
    /// Blocks of silence in a row: past `partitions` of them the history is
    /// all zeros and a block costs nothing.
    private var silentBlocks = Int.max / 2

    var quiet: Bool { silentBlocks > partitions + 1 }

    init(sampleRate: Double, seconds: Double, predelay: Double, decayDb: Double) {
        let block = Self.block
        guard let setup = vDSP_create_fftsetup(Self.log2n, FFTRadix(kFFTRadix2)) else {
            preconditionFailure("vDSP could not set up a \(2 * block)-point FFT")
        }
        let length = max(1, Int(seconds * sampleRate))
        let fall = decayDb / 20 * log(10.0)
        var lead = 0
        while lead < length, Double(lead) / sampleRate < predelay { lead += 1 }
        let dropped = min(block, lead)
        let kept = max(1, length - dropped)
        let partitions = (kept + block - 1) / block
        func buffer(_ count: Int) -> UnsafeMutablePointer<Float> {
            let pointer = UnsafeMutablePointer<Float>.allocate(capacity: count)
            pointer.initialize(repeating: 0, count: count)
            return pointer
        }
        let time = buffer(block * 2)
        var re: [UnsafeMutablePointer<Float>] = []
        var im: [UnsafeMutablePointer<Float>] = []
        for _ in 0 ..< 2 {
            var impulse = (0 ..< length).map { i -> Double in
                let t = Double(i) / sampleRate
                return t < predelay ? 0 : (2 * Double.random(in: 0 ..< 1) - 1) * exp(-fall * t / seconds)
            }
            // Unit energy: a send's gain is then the room's level against the dry sound.
            let energy = impulse.reduce(0) { $0 + $1 * $1 }
            let scale = energy > 0 ? 1 / energy.squareRoot() : 0
            for i in impulse.indices { impulse[i] *= scale }
            let channelRe = buffer(partitions * block)
            let channelIm = buffer(partitions * block)
            for p in 0 ..< partitions {
                for i in 0 ..< block * 2 { time[i] = 0 }
                for i in 0 ..< block {
                    let at = dropped + p * block + i
                    if at < length { time[i] = Float(impulse[at]) }
                }
                Self.forward(setup, time, channelRe + p * block, channelIm + p * block)
            }
            re.append(channelRe)
            im.append(channelIm)
        }
        for i in 0 ..< block * 2 { time[i] = 0 }
        self.setup = setup
        self.partitions = partitions
        self.time = time
        responseRe = re
        responseIm = im
        historyRe = buffer(partitions * block)
        historyIm = buffer(partitions * block)
        accRe = buffer(block)
        accIm = buffer(block)
        input = buffer(block)
        previous = buffer(block)
        output = [buffer(block), buffer(block)]
    }

    deinit {
        vDSP_destroy_fftsetup(setup)
        for pointer in responseRe + responseIm + output + [historyRe, historyIm, time, accRe, accIm, input, previous] {
            pointer.deallocate()
        }
    }

    /// One sample in, the room's two channels out.
    func process(_ x: Double) -> (left: Double, right: Double) {
        input[position] = Float(x)
        let out = (left: Double(output[0][position]), right: Double(output[1][position]))
        position += 1
        if position == Self.block {
            position = 0
            convolve()
        }
        return out
    }

    private func convolve() {
        let block = Self.block
        let half = block
        var peak: Float = 0
        vDSP_maxmgv(input, 1, &peak, vDSP_Length(block))
        silentBlocks = peak == 0 ? silentBlocks + 1 : 0
        guard !quiet else {
            for c in 0 ..< 2 { for i in 0 ..< block { output[c][i] = 0 } }
            return
        }
        // [the previous block, this block], into the history's next slot.
        for i in 0 ..< block {
            time[i] = previous[i]
            time[block + i] = input[i]
            previous[i] = input[i]
        }
        slot = (slot + 1) % partitions
        Self.forward(setup, time, historyRe + slot * half, historyIm + slot * half)
        // Real FFT spectra are packed: bin 0 holds DC in its real part and Nyquist in its imaginary one.
        let scale = 1 / Float(4 * 2 * block)
        for c in 0 ..< 2 {
            for i in 0 ..< half { accRe[i] = 0; accIm[i] = 0 }
            var dc: Float = 0
            var nyquist: Float = 0
            var acc = DSPSplitComplex(realp: accRe, imagp: accIm)
            for p in 0 ..< partitions {
                let s = (slot - p + partitions) % partitions
                var x = DSPSplitComplex(realp: historyRe + s * half, imagp: historyIm + s * half)
                var h = DSPSplitComplex(realp: responseRe[c] + p * half, imagp: responseIm[c] + p * half)
                dc += x.realp[0] * h.realp[0]
                nyquist += x.imagp[0] * h.imagp[0]
                var sum = acc
                vDSP_zvma(&x, 1, &h, 1, &sum, 1, &acc, 1, vDSP_Length(half))
            }
            accRe[0] = dc
            accIm[0] = nyquist
            vDSP_fft_zrip(setup, &acc, 1, Self.log2n, FFTDirection(FFT_INVERSE))
            time.withMemoryRebound(to: DSPComplex.self, capacity: half) { vDSP_ztoc(&acc, 1, $0, 2, vDSP_Length(half)) }
            // The last block of the overlap-save is this block's output, and the next block's room.
            for i in 0 ..< block { output[c][i] = time[block + i] * scale }
        }
    }

    /// `time` (two blocks) to its packed spectrum in `re` and `im` (a block each).
    private static func forward(_ setup: FFTSetup, _ time: UnsafeMutablePointer<Float>,
                                _ re: UnsafeMutablePointer<Float>, _ im: UnsafeMutablePointer<Float>) {
        var split = DSPSplitComplex(realp: re, imagp: im)
        time.withMemoryRebound(to: DSPComplex.self, capacity: block) { vDSP_ctoz($0, 2, &split, 1, vDSP_Length(block)) }
        vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
    }
}

// MARK: The output stage

/// engine.js `getOutput`'s limiter, a `DynamicsCompressorNode` at threshold
/// −8 dB, knee 6 dB, ratio 12, attack 2 ms, release 80 ms. Its static curve
/// and its makeup gain are Chromium's (DynamicsCompressorKernel: the knee's
/// exponential, its k solved to meet the ratio's slope, makeup
/// (1 / curve(1))^0.6), so a cue under the threshold, which every one of
/// these is, comes out at exactly Chromium's level. Above it, the gain
/// follows a plain attack and release rather than Chromium's adaptive
/// release, and without its 6 ms look-ahead.
struct Limiter {
    private let linearThreshold: Double
    private let kneeThreshold: Double
    private let kneeThresholdDb: Double
    private let yKneeThresholdDb: Double
    private let slope: Double
    private let k: Double
    private let makeup: Double
    private let attack: Double
    private let release: Double
    private var gain = 1.0

    /// Whether the limiter is at rest (passing its makeup gain alone).
    var resting: Bool { gain >= 0.999_999 }

    init(sampleRate: Double, threshold: Double = -8, knee: Double = 6, ratio: Double = 12, attack: Double = 0.002, release: Double = 0.08) {
        let linearThreshold = Self.linear(threshold)
        let slope = 1 / ratio
        let kneeThresholdDb = threshold + knee
        let kneeThreshold = Self.linear(kneeThresholdDb)
        func kneeCurve(_ x: Double, _ k: Double) -> Double {
            x < linearThreshold ? x : linearThreshold + (1 - exp(-k * (x - linearThreshold))) / k
        }
        func slopeAt(_ x: Double, _ k: Double) -> Double {
            guard x >= linearThreshold else { return 1 }
            let x2 = x * 1.001
            return (Self.decibels(kneeCurve(x2, k)) - Self.decibels(kneeCurve(x, k))) / (Self.decibels(x2) - Self.decibels(x))
        }
        // `kAtSlope`: the knee's k, by geometric bisection, where the knee meets the ratio's slope.
        var low = 0.1, high = 10000.0, k = 5.0
        for _ in 0 ..< 15 {
            if slopeAt(kneeThreshold, k) < slope { high = k } else { low = k }
            k = (low * high).squareRoot()
        }
        let yKneeThresholdDb = Self.decibels(kneeCurve(kneeThreshold, k))
        // `saturate(1, k)`: what the curve makes of full scale.
        let fullRange = 1 < kneeThreshold ? kneeCurve(1, k) : Self.linear(yKneeThresholdDb + slope * (0 - kneeThresholdDb))
        self.linearThreshold = linearThreshold
        self.kneeThreshold = kneeThreshold
        self.kneeThresholdDb = kneeThresholdDb
        self.yKneeThresholdDb = yKneeThresholdDb
        self.slope = slope
        self.k = k
        makeup = pow(1 / fullRange, 0.6)
        self.attack = exp(-1 / (attack * sampleRate))
        self.release = exp(-1 / (release * sampleRate))
    }

    private static func linear(_ db: Double) -> Double { pow(10, db / 20) }
    private static func decibels(_ x: Double) -> Double { x > 0 ? 20 * log10(x) : -1000 }

    /// `saturate`: the knee below its end, the ratio above it.
    private func saturate(_ x: Double) -> Double {
        if x < kneeThreshold {
            return x < linearThreshold ? x : linearThreshold + (1 - exp(-k * (x - linearThreshold))) / k
        }
        return Self.linear(yKneeThresholdDb + slope * (Self.decibels(x) - kneeThresholdDb))
    }

    mutating func process(left: Double, right: Double) -> (left: Double, right: Double) {
        let level = max(abs(left), abs(right))
        let target = level > linearThreshold ? saturate(level) / level : 1
        let coefficient = target < gain ? attack : release
        gain = target + (gain - target) * coefficient
        let total = gain * makeup
        return (left * total, right * total)
    }
}
