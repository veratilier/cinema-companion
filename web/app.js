import { formatTime, parseSubtitles, subtitlesThrough } from "./lib.js";

const elements = Object.fromEntries(
  [
    "file-video",
    "file-subtitles",
    "remote-url",
    "load-url",
    "movie",
    "movie-empty",
    "movie-title",
    "movie-position",
    "subtitle-state",
    "subtitle-now",
    "share-movie",
    "screen-start",
    "screen-stop",
    "share-screen",
    "screen-video",
    "screen-note",
    "capture-preview",
    "scene-json",
    "reply",
    "status",
    "install",
  ].map((id) => [id, document.getElementById(id)]),
);

const state = {
  localURL: null,
  cues: [],
  screenStream: null,
  previewURL: null,
  deferredInstall: null,
};

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function setMovieSource(source, title) {
  if (state.localURL) {
    URL.revokeObjectURL(state.localURL);
    state.localURL = null;
  }
  elements.movie.pause();
  elements.movie.removeAttribute("src");
  elements.movie.crossOrigin = "anonymous";
  elements.movie.src = source;
  elements.movie.load();
  elements.movieTitle.textContent = title;
  elements.movieEmpty.hidden = true;
  elements.movie.hidden = false;
  elements.shareMovie.disabled = false;
}

elements["file-video"].addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const localURL = URL.createObjectURL(file);
  setMovieSource(localURL, file.name.replace(/\.[^.]+$/, ""));
  state.localURL = localURL;
  setStatus("Local video loaded.", "success");
});

elements.loadUrl.addEventListener("click", () => {
  const value = elements.remoteUrl.value.trim();
  if (!value) {
    setStatus("Paste an HTTPS media URL first.", "error");
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    setStatus("That media URL is not valid.", "error");
    return;
  }
  if (url.protocol !== "https:") {
    setStatus("Remote media must use HTTPS.", "error");
    return;
  }
  setMovieSource(url.href, url.pathname.split("/").pop() || "Remote media");
  setStatus("Remote media address loaded. Frame sharing also requires CORS permission from its server.", "success");
});

elements["file-subtitles"].addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    state.cues = parseSubtitles(await file.text());
    if (!state.cues.length) throw new Error("No readable subtitle cues found.");
    elements.subtitleState.textContent = `${state.cues.length} subtitle cues loaded`;
    setStatus("Subtitles loaded.", "success");
    updatePlaybackState();
  } catch (error) {
    state.cues = [];
    elements.subtitleState.textContent = "No subtitles loaded";
    setStatus(error.message || "Unable to read subtitles.", "error");
  }
});

function updatePlaybackState() {
  elements.moviePosition.textContent = formatTime(elements.movie.currentTime);
  const current = state.cues.filter(
    (cue) => cue.start <= elements.movie.currentTime && cue.end >= elements.movie.currentTime,
  );
  elements.subtitleNow.textContent = current.map((cue) => cue.text).join(" ") || "No active subtitle";
}

elements.movie.addEventListener("timeupdate", updatePlaybackState);
elements.movie.addEventListener("loadedmetadata", updatePlaybackState);
elements.movie.addEventListener("error", () => {
  setStatus("The browser could not play this media address.", "error");
});

async function captureFrame(video, quality = 0.82) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error("No video frame is available yet.");
  }
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to encode this frame."))),
      "image/jpeg",
      quality,
    );
  });
}

async function deliver(scene) {
  if (state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.previewURL = URL.createObjectURL(scene.jpeg);
  elements.capturePreview.src = state.previewURL;
  elements.capturePreview.hidden = false;
  elements.sceneJson.textContent = JSON.stringify(
    {
      ...scene,
      jpeg: `<Blob ${scene.jpeg.size} bytes>`,
    },
    null,
    2,
  );
  elements.reply.textContent = "";

  const handler = window.cinemaCompanionOnScene;
  window.dispatchEvent(new CustomEvent("cinema-companion-scene", { detail: scene }));
  if (typeof handler !== "function") {
    elements.reply.textContent = "Scene captured locally. Add a host adapter to send it to your AI.";
    return;
  }

  const result = await handler(scene);
  elements.reply.textContent = typeof result === "string" ? result : "";
}

async function share(source) {
  const button = source === "movie" ? elements.shareMovie : elements.shareScreen;
  button.disabled = true;
  setStatus("Preparing scene…");
  try {
    const video = source === "movie" ? elements.movie : elements.screenVideo;
    const jpeg = await captureFrame(video, source === "movie" ? 0.82 : 0.68);
    const position = source === "movie" ? Math.max(0, elements.movie.currentTime) : null;
    await deliver({
      source,
      jpeg,
      capturedAt: new Date().toISOString(),
      title: source === "movie" ? elements.movieTitle.textContent : null,
      position,
      subtitles: source === "movie" ? subtitlesThrough(position, state.cues) : [],
    });
    setStatus("Scene shared with the host adapter.", "success");
  } catch (error) {
    const corsHint = error?.name === "SecurityError" ? " The media server must allow CORS for frame capture." : "";
    setStatus(`${error.message || "Unable to share this frame."}${corsHint}`, "error");
  } finally {
    button.disabled = source === "screen" ? !state.screenStream : false;
  }
}

elements.shareMovie.addEventListener("click", () => share("movie"));
elements.shareScreen.addEventListener("click", () => share("screen"));

function stopScreenShare() {
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.screenStream = null;
  elements.screenVideo.srcObject = null;
  elements.screenVideo.hidden = true;
  elements.screenStart.disabled = !navigator.mediaDevices?.getDisplayMedia;
  elements.screenStop.disabled = true;
  elements.shareScreen.disabled = true;
}

if (navigator.mediaDevices?.getDisplayMedia) {
  elements.screenNote.textContent = "This browser exposes screen capture. Permission is requested every time you start.";
  elements.screenStart.disabled = false;
} else {
  elements.screenNote.textContent = "Screen capture is not exposed by this browser. Local movie sharing still works.";
}

elements.screenStart.addEventListener("click", async () => {
  try {
    stopScreenShare();
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    state.screenStream = stream;
    elements.screenVideo.srcObject = stream;
    elements.screenVideo.hidden = false;
    await elements.screenVideo.play();
    stream.getVideoTracks()[0]?.addEventListener("ended", stopScreenShare, { once: true });
    elements.screenStart.disabled = true;
    elements.screenStop.disabled = false;
    elements.shareScreen.disabled = false;
    setStatus("Screen sharing started.", "success");
  } catch (error) {
    stopScreenShare();
    setStatus(error.message || "Screen sharing was not started.", "error");
  }
});

elements.screenStop.addEventListener("click", stopScreenShare);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.screenStream) stopScreenShare();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstall = event;
  elements.install.hidden = false;
});

elements.install.addEventListener("click", async () => {
  if (!state.deferredInstall) return;
  await state.deferredInstall.prompt();
  state.deferredInstall = null;
  elements.install.hidden = true;
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

window.addEventListener("pagehide", () => {
  stopScreenShare();
  if (state.localURL) URL.revokeObjectURL(state.localURL);
  if (state.previewURL) URL.revokeObjectURL(state.previewURL);
});
