import XCTest
@testable import CinemaCompanion
final class SubtitlesTests: XCTestCase {
    func testSRTAndNoFutureSpoilers() {
        let cues = Subtitles.parse("1\n00:00:01,000 --> 00:00:03,000\nFirst\n\n2\n00:00:03,500 --> 00:00:06,000\nSecond")
        XCTAssertEqual(cues.count, 2)
        XCTAssertEqual(Subtitles.through(4, cues: cues).map(\.text), ["First"])
    }
    func testVTTAndMalformedBlocks() {
        let cues = Subtitles.parse("WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<b>Hello</b>\n\ninvalid\n00:02.000 --> 00:01.000\nNo")
        XCTAssertEqual(cues, [SubtitleCue(start: 1, end: 2, text: "Hello")])
    }
}
