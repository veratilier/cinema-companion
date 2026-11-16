import { formatTime, normalizeWatchInterval, parseSubtitles, subtitlesThrough } from "./lib.js";

const byID = (id) => document.getElementById(id);
const elements = {
  fileVideo: byID("file-video"),
  fileSubtitles: byID("file-subtitles"),
  remoteUrl: byID("remote-url"),
  loadUrl: byID("load-url"),
  movie: byID("movie"),
  movieEmpty: byID("movie-empty"),
  movieTitle: byID("movie-title"),
  moviePosition: byID("movie-position"),
  subtitleState: byID("subtitle-state"),
  subtitleNow: byID("subtitle-now"),
  shareMovie: byID("share-movie"),
  screenStart: byID("screen-start"),
  screenStop: byID("screen-stop"),
  shareScreen: byID("share-screen"),
  screenVideo: byID("screen-video"),
  screenNote: byID("screen-note"),
  capturePreview: byID("capture-preview"),
  sceneJson: byID("scene-json"),
  reply: byID("reply"),
  status: byID("status"),
  install: byID("install"),
  autoSource: byID("auto-source"),
  autoInterval: byID("auto-interval"),
  customInterval: byID("custom-interval"),
  customIntervalWrap: byID("custom-interval-wrap"),
  autoToggle: byID("auto-toggle"),
  autoState: byID("auto-state"),
};

const state = {
  localURL: null,
  cues: [],
  screenStream: null,
  previewURL: null,
  deferredInstall: null,
  sharing: false,
  autoWatch: {
    active: false,
    timer: null,
    source: "movie",
    interval: 0,
    lastMoviePosition: null,
    generation: 0,
  },
};

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function setMovieSource(source, title) {
  stopAutoWatch("Timed watching stopped because the movie changed.");
  state.cues = [];
  elements.fileSubtitles.value = "";
  elements.subtitleState.textContent = "No subtitles loaded";
  elements.subtitleNow.textContent = "No active subtitle";
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
  updateShareControls();
}

elements.fileVideo.addEventListener("change", (event) => {
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

elements.fileSubtitles.addEventListener("change", async (event) => {
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
    return false;
  }

  const result = await handler(scene);
  elements.reply.textContent = typeof result === "string" ? result : "";
  return true;
}

async function share(source) {
  if (state.sharing) return;
  state.sharing = true;
  updateShareControls();
  setStatus("Preparing scene…");
  try {
    const video = source === "movie" ? elements.movie : elements.screenVideo;
    const jpeg = await captureFrame(video, source === "movie" ? 0.82 : 0.68);
    const position = source === "movie" ? Math.max(0, elements.movie.currentTime) : null;
    const sent = await deliver({
      source,
      jpeg,
      capturedAt: new Date().toISOString(),
      title: source === "movie" ? elements.movieTitle.textContent : null,
      position,
      subtitles: source === "movie" ? subtitlesThrough(position, state.cues) : [],
    });
    setStatus(sent ? "Scene shared with the host adapter." : "Scene captured locally; no host adapter is connected.", sent ? "success" : "");
  } catch (error) {
    const corsHint = error?.name === "SecurityError" ? " The media server must allow CORS for frame capture." : "";
    setStatus(`${error.message || "Unable to share this frame."}${corsHint}`, "error");
  } finally {
    state.sharing = false;
    updateShareControls();
  }
}

function updateShareControls() {
  elements.shareMovie.disabled = state.sharing || !elements.movie.src;
  elements.shareScreen.disabled = state.sharing || !state.screenStream;
}

elements.shareMovie.addEventListener("click", () => share("movie"));
elements.shareScreen.addEventListener("click", () => share("screen"));

function stopScreenShare() {
  if (state.autoWatch.active && state.autoWatch.source === "screen") {
    stopAutoWatch("Timed watching stopped because screen sharing ended.");
  }
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
    updateShareControls();
    setStatus("Screen sharing started.", "success");
  } catch (error) {
    stopScreenShare();
    setStatus(error.message || "Screen sharing was not started.", "error");
  }
});

elements.screenStop.addEventListener("click", stopScreenShare);

function updateAutoControls() {
  const custom = elements.autoInterval.value === "custom";
  const interval = normalizeWatchInterval(custom ? elements.customInterval.value : elements.autoInterval.value);
  elements.customIntervalWrap.hidden = !custom;
  elements.customInterval.disabled = state.autoWatch.active;
  elements.autoToggle.disabled = !state.autoWatch.active && interval === 0;
  elements.autoToggle.textContent = state.autoWatch.active ? "Stop timed watching" : "Start timed watching";
  elements.autoSource.disabled = state.autoWatch.active;
  elements.autoInterval.disabled = state.autoWatch.active;
}

function stopAutoWatch(message = "Timed watching is off. Share a frame manually whenever you want.") {
  if (state.autoWatch.timer) clearTimeout(state.autoWatch.timer);
  state.autoWatch.timer = null;
  state.autoWatch.active = false;
  state.autoWatch.generation++;
  state.autoWatch.lastMoviePosition = null;
  if (elements.autoState) elements.autoState.textContent = message;
  if (elements.autoToggle) updateAutoControls();
}

function scheduleAutoWatch() {
  if (!state.autoWatch.active) return;
  elements.autoState.textContent = `Watching ${state.autoWatch.source} every ${state.autoWatch.interval} seconds. Next scene is scheduled automatically.`;
  state.autoWatch.timer = window.setTimeout(runAutoWatch, state.autoWatch.interval * 1000);
}

async function runAutoWatch() {
  state.autoWatch.timer = null;
  if (!state.autoWatch.active) return;
  const generation = state.autoWatch.generation;
  if (document.hidden) {
    stopAutoWatch("Timed watching stopped when the PWA left the foreground.");
    return;
  }

  const source = state.autoWatch.source;
  if (source === "movie") {
    if (!elements.movie.src || elements.movie.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      stopAutoWatch("Timed watching stopped because no playable movie is loaded.");
      return;
    }
    const position = elements.movie.currentTime;
    if (
      state.autoWatch.lastMoviePosition !== null &&
      Math.abs(position - state.autoWatch.lastMoviePosition) < 0.25
    ) {
      elements.autoState.textContent = "Waiting for movie playback before sharing another scene.";
      scheduleAutoWatch();
      return;
    }
    state.autoWatch.lastMoviePosition = position;
  } else if (!state.screenStream) {
    stopAutoWatch("Timed watching stopped because screen sharing is not active.");
    return;
  }

  await share(source);
  if (state.autoWatch.active && state.autoWatch.generation === generation) scheduleAutoWatch();
}

elements.autoInterval.addEventListener("change", updateAutoControls);
elements.customInterval.addEventListener("input", updateAutoControls);
elements.autoToggle.addEventListener("click", async () => {
  if (state.autoWatch.active) {
    stopAutoWatch();
    return;
  }

  const interval = normalizeWatchInterval(elements.autoInterval.value === "custom" ? elements.customInterval.value : elements.autoInterval.value);
  const source = elements.autoSource.value;
  if (!interval) return;
  if (source === "movie" && (!elements.movie.src || elements.movie.readyState < HTMLMediaElement.HAVE_METADATA)) {
    setStatus("Load a movie before starting timed watching.", "error");
    return;
  }
  if (source === "screen" && !state.screenStream) {
    setStatus("Start screen sharing before choosing the shared screen as the timed source.", "error");
    return;
  }

  state.autoWatch.active = true;
  state.autoWatch.source = source;
  state.autoWatch.interval = interval;
  state.autoWatch.lastMoviePosition = null;
  updateAutoControls();
  elements.autoState.textContent = `Timed watching started for ${source}.`;
  await runAutoWatch();
});

updateAutoControls();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (state.autoWatch.active) stopAutoWatch("Timed watching stopped when the PWA left the foreground.");
  if (state.screenStream) stopScreenShare();
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
  stopAutoWatch();
  stopScreenShare();
  if (state.localURL) URL.revokeObjectURL(state.localURL);
  if (state.previewURL) URL.revokeObjectURL(state.previewURL);
});
