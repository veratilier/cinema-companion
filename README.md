# Cinema Companion

A small iOS-oriented toolkit extracted from a personal cinema feature. It separates **screen sharing** from **media import**, and leaves AI, identity, storage and credentials to the host app.

## What is included

- **In-app screen sharing:** a ReplayKit foreground capture helper and a SwiftUI demo for sampling and sharing the current host-app screen. It stops when the app goes to the background or the view closes.
- **Cross-app screen sharing:** a reusable JPEG frame sampler and an example Broadcast Upload Extension. The host must add the extension, configure its own secure transport, supply user controls, and explicitly start and stop the system broadcast. The example intentionally does not upload frames by itself.
- **Import media:** choose a local video, play it with AVPlayer, optionally load SRT/VTT, and share the current frame, title, playback time and already-finished subtitle cues. Audio is not sent.
- **Optional Bilibili import helpers:** `server/media_import.py` prepares a temporary compatible video through yt-dlp and ffmpeg. These are integration helpers, **not a standalone HTTP server**. See [server integration](docs/server.md).

The package does not include an AI, a backend endpoint, any credentials, an app project, a complete broadcast transport, or automatic commentary. Supply a closure to `CinemaView` that sends a `SharedScene` to your own backend and returns an optional reply. Choose and implement your own user consent, access control, credential storage, rate limits, retention, and UI. A model receives still images, not continuous video; protected content may be black. Device capture, audio restrictions, background behavior and supported video sites must be verified on real devices.

## Add to an iOS app

Add the repository as a local Swift package in Xcode and link the `CinemaCompanion` library to an iOS app target (iOS 16+). Present `CinemaView` from SwiftUI:

```swift
import SwiftUI
import CinemaCompanion

struct Example: View {
    var body: some View {
        CinemaView { scene in
            // Implement your own authorized transport. Handle `scene.jpeg`,
            // `scene.source`, `scene.position`, and `scene.subtitles`.
            // Never embed real credentials into source code.
            return nil
        }
    }
}
```

To share another app's screen, create a Broadcast Upload Extension, link the package, and adapt `Examples/BroadcastExtension/SampleHandler.swift`. The containing app must present Apple's broadcast picker and provide the transport and session lifecycle. iOS owns the consent UI. Neither example captures audio.

## Verify

```sh
python3 -m unittest discover -s python_tests -v
swift test
```

To compile the iOS-only views, run an iOS simulator build with Xcode. Simulator builds do not establish that ReplayKit, signing, or a broadcast extension works on a physical device.

## Data and media

Frames and subtitle text are sent only when the host's callback does so. The package has no built-in AI or endpoint. The optional server module stores temporary video and state locally; it accepts only supported Bilibili URLs and does not bypass DRM, account, or region restrictions. Read the host application's data policies and the platform's terms before use.

This project is intended as an integration starting point, not a complete deployable service. You must write and secure the host API and configure cleanup before exposing it to a network.
