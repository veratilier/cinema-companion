// Load this file before app.js, or provide the same function from your host page.
// Keep device credentials and long-lived AI keys on your server, never in a PWA bundle.
window.cinemaCompanionOnScene = async (scene) => {
  const form = new FormData();
  form.append("jpeg", scene.jpeg, "scene.jpg");
  form.append(
    "scene",
    JSON.stringify({
      source: scene.source,
      capturedAt: scene.capturedAt,
      title: scene.title,
      position: scene.position,
      subtitles: scene.subtitles,
    }),
  );

  const response = await fetch("/api/cinema/scene", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) throw new Error(`Scene request failed (${response.status}).`);
  const payload = await response.json();
  return payload.reply ?? null;
};
