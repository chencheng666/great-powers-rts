import AVFoundation
import Foundation

// 使用系统 MIDI 乐器离线渲染配器，发行包仅包含混音结果。
struct Part: Decodable {
    let program: UInt8
    let volume: Float
    let pan: Float
    let percussion: Bool
}
struct Note: Decodable {
    let part: Int
    let pitch: UInt8
    let at: Double
    let duration: Double
    let velocity: UInt8
}
struct Score: Decodable {
    let seconds: Double
    let parts: [Part]
    let notes: [Note]
}
struct Event {
    let sample: AVAudioFramePosition
    let note: Note
    let start: Bool
}

guard CommandLine.arguments.count == 3 else { fatalError("需要乐谱 JSON 与输出 WAV 路径") }
let score = try JSONDecoder().decode(Score.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let rate = 44100.0
let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
let engine = AVAudioEngine()
let reverb = AVAudioUnitReverb()
reverb.loadFactoryPreset(.largeHall)
reverb.wetDryMix = 12
let orchestraMixer = AVAudioMixerNode()
engine.attach(orchestraMixer)
engine.attach(reverb)
engine.connect(orchestraMixer, to: reverb, format: format)
engine.connect(reverb, to: engine.mainMixerNode, format: format)
let samplers: [AVAudioUnitSampler] = try score.parts.map { part in
    let sampler = AVAudioUnitSampler()
    engine.attach(sampler)
    try sampler.loadSoundBankInstrument(
        at: URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls"),
        program: part.program,
        bankMSB: UInt8(part.percussion ? kAUSampler_DefaultPercussionBankMSB : kAUSampler_DefaultMelodicBankMSB),
        bankLSB: 0
    )
    sampler.volume = part.volume
    sampler.pan = part.pan
    engine.connect(sampler, to: orchestraMixer, format: format)
    return sampler
}
let events = score.notes.flatMap { note in
    [
        Event(sample: AVAudioFramePosition((note.at * rate).rounded()), note: note, start: true),
        Event(sample: AVAudioFramePosition(((note.at + note.duration) * rate).rounded()), note: note, start: false)
    ]
}.sorted {
    if $0.sample != $1.sample { return $0.sample < $1.sample }
    return !$0.start && $1.start
}
try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
try engine.start()
var output: AVAudioFile? = try AVAudioFile(forWriting: URL(fileURLWithPath: CommandLine.arguments[2]), settings: format.settings)
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)!
var index = 0
let end = AVAudioFramePosition(score.seconds * rate)
while engine.manualRenderingSampleTime < end {
    let now = engine.manualRenderingSampleTime
    while index < events.count && events[index].sample <= now {
        let event = events[index]
        let sampler = samplers[event.note.part]
        if event.start { sampler.startNote(event.note.pitch, withVelocity: event.note.velocity, onChannel: 0) }
        else { sampler.stopNote(event.note.pitch, onChannel: 0) }
        index += 1
    }
    let next = index < events.count ? events[index].sample : end
    let count = AVAudioFrameCount(min(4096, min(end - now, max(1, next - now))))
    switch try engine.renderOffline(count, to: buffer) {
    case .success: try output?.write(from: buffer)
    case .cannotDoInCurrentContext: continue
    default: fatalError("离线音频渲染失败")
    }
}
engine.stop()
output = nil
print("交响配器渲染完成")
