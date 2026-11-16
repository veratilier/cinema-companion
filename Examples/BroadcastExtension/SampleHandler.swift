import ReplayKit
import CinemaCompanion

/// Add this file to your own Broadcast Upload Extension target.
/// Replace the callback with your own bounded, authenticated frame transport.
final class SampleHandler: RPBroadcastSampleHandler {
    private let sampler = BroadcastFrameSampler(interval: 10)
    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        sampler.reset()
        sampler.onFrame = { jpeg in
            // TODO: hand `jpeg` to your host's authenticated, cancellable transport.
            // Do not block this callback; use backpressure and discard stale frames.
            _ = jpeg
        }
    }
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        sampler.accept(sampleBuffer, type: sampleBufferType)
    }
    override func broadcastFinished() { sampler.onFrame = nil }
}
