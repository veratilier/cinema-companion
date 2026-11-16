import Foundation

/// A subtitle cue with a time range in seconds.
public struct SubtitleCue: Equatable, Sendable {
    public let start: TimeInterval
    public let end: TimeInterval
    public let text: String
    public init(start: TimeInterval, end: TimeInterval, text: String) {
        self.start = start; self.end = end; self.text = text
    }
}

public enum Subtitles {
    /// Parses common SRT and WebVTT cue blocks; malformed blocks are skipped.
    public static func parse(_ input: String) -> [SubtitleCue] {
        let normalized = input.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        return normalized.components(separatedBy: "\n\n").compactMap { block in
            let lines = block.components(separatedBy: "\n")
            guard let index = lines.firstIndex(where: { $0.contains("-->") }) else { return nil }
            let times = lines[index].components(separatedBy: "-->")
            guard times.count == 2, let start = time(times[0]), let end = time(times[1]), end > start else { return nil }
            let text = lines.dropFirst(index + 1).joined(separator: " ").replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
            guard !text.isEmpty else { return nil }
            return SubtitleCue(start: start, end: end, text: text)
        }
    }
    /// Returns only cues that have already ended, preventing future dialogue spoilers.
    public static func through(_ position: TimeInterval, cues: [SubtitleCue], lookback: TimeInterval = 15) -> [SubtitleCue] {
        cues.filter { $0.end <= position && $0.end >= max(0, position - max(0, lookback)) }
    }
    private static func time(_ value: String) -> TimeInterval? {
        let value = value.trimmingCharacters(in: .whitespaces).split(separator: " ").first ?? ""
        let parts = value.replacingOccurrences(of: ",", with: ".").split(separator: ":")
        guard parts.count == 2 || parts.count == 3 else { return nil }
        var seconds = 0.0
        for part in parts { guard let n = Double(part), n.isFinite, n >= 0 else { return nil }; seconds = seconds * 60 + n }
        return seconds
    }
}
