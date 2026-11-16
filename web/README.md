# Cinema Companion PWA Lite

This directory is a build-free progressive web app for the portable part of Cinema Companion. It plays a local video or a host-provided HTTPS media URL, imports SRT/VTT subtitles, captures the current frame, and gives the resulting scene to a host adapter.

Run it from an HTTP origin rather than opening `index.html` directly:

```sh
cd web
python3 -m http.server 4173
```

Then open <http://localhost:4173>. HTTPS is required outside localhost for service workers, installability and media-capture APIs.

## Host adapter

Provide an async function before `app.js` runs:

```js
window.cinemaCompanionOnScene = async (scene) => {
  // scene.jpeg is a Blob. Send it and the metadata to your authenticated server.
  return "Optional reply shown in the PWA";
};
```

The full payload is:

```ts
type SharedScene = {
  source: "movie" | "screen";
  jpeg: Blob;
  capturedAt: string;
  title: string | null;
  position: number | null;
  subtitles: Array<{ start: number; end: number; text: string }>;
};
```

See `host-adapter.example.js` for a multipart request. Keep AI keys and long-lived device credentials on the server. The PWA does not send frames anywhere unless the embedding host supplies this function. It also dispatches a `cinema-companion-scene` browser event for hosts that prefer an event boundary.

Remote videos must be HTTPS, browser-playable, and return a suitable `Access-Control-Allow-Origin` header; otherwise playback may work while canvas frame capture is blocked. The optional Bilibili helper in `../server` still needs an authenticated HTTP host that returns a short-lived signed media URL.

## Platform boundary

Local movie playback, subtitle parsing and manual current-frame sharing are the reliable cross-platform path. Screen sharing is progressive enhancement through `getDisplayMedia()` and always requires a user action and browser permission. Desktop browsers commonly expose it. Do not promise cross-app capture, background capture, persistent screen permission or system audio on iPhone/iPad PWAs. Keep the native Swift package and ReplayKit Broadcast Upload Extension for that capability.

When the PWA becomes hidden, it deliberately stops any active display-capture track. Protected media may render black or reject capture.

## Tests

```sh
cd web
npm test
```

The tests cover subtitle parsing, spoiler filtering and playback-time formatting. Browser media capture still requires manual testing on each target browser and device.
