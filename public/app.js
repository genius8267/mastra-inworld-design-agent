const $log = document.getElementById("log");
const $frame = document.getElementById("preview-frame");
const $debugToggle = document.getElementById("debug-toggle");
const $debugDrawer = document.getElementById("debug-drawer");
const $debugClear = document.getElementById("debug-clear");

let loadedFonts = new Set();
let voiceStatus = "off"; // "off" | "connecting" | "on"
let lastCtaLabel = "";

const TOOLS = [
  { id: "set_theme", label: "set_theme", desc: "change bg, text, or accent colors" },
  { id: "set_typography", label: "set_typography", desc: "swap Google Fonts or scale text" },
  { id: "set_copy", label: "set_copy", desc: "rewrite headline, subhead, body, or CTA" },
  { id: "set_layout", label: "set_layout", desc: "alignment and hero variant" },
  { id: "add_feature", label: "add_feature", desc: "append a new feature card" },
  { id: "remove_feature", label: "remove_feature", desc: "delete a feature card by index" },
  { id: "update_feature", label: "update_feature", desc: "edit an existing feature card" },
  { id: "apply_preset", label: "apply_preset", desc: "dark, cream, ocean, sunset, mono, forest, neon, default" },
  { id: "set_marquee", label: "set_marquee", desc: "change the top scrolling marquee text" },
  { id: "reset", label: "reset", desc: "restore everything to defaults" },
];

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function appendMessage(role, content) {
  const li = document.createElement("li");
  li.dataset.role = role;
  const label = document.createElement("span");
  label.className = "bubble-label";
  label.textContent = role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  li.appendChild(label);
  li.appendChild(bubble);
  $log.appendChild(li);
  $log.scrollTop = $log.scrollHeight;
  return bubble;
}

function ensureFont(family) {
  if (!family || loadedFonts.has(family)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(family);
}

function render(state) {
  const { theme, typography, layout, copy, features, marquee } = state;
  ensureFont(typography.fontFamily);

  $frame.style.setProperty("--site-bg", theme.bg);
  $frame.style.setProperty("--site-text", theme.text);
  $frame.style.setProperty("--site-accent", theme.accent);
  $frame.style.setProperty("--site-scale", String(typography.scale));
  $frame.style.fontFamily = `'${typography.fontFamily}', system-ui, sans-serif`;

  lastCtaLabel = copy.cta;

  const featuresHtml = (features || [])
    .map(
      (f) => `
        <article class="site-feature">
          <h3>${escape(f.title)}</h3>
          <p>${escape(f.body)}</p>
        </article>`,
    )
    .join("");

  const marqueeHtml = marquee
    ? `<marquee class="site-marquee" behavior="scroll" direction="left" scrollamount="6">${escape(marquee)}</marquee>`
    : "";

  $frame.innerHTML = `
    <section class="site-hero" data-alignment="${escape(layout.alignment)}" data-variant="${escape(layout.heroVariant)}">
      <div>
        <h1>${escape(copy.headline)}</h1>
        <p class="site-subhead">${escape(copy.subheadline)}</p>
        <p class="site-body">${escape(copy.body)}</p>
      </div>
      ${layout.heroVariant === "split" ? '<div aria-hidden="true"></div>' : ""}
    </section>
    ${featuresHtml ? `<section class="site-features">${featuresHtml}</section>` : ""}
    <section class="site-tools" aria-label="Tools the agent can call">
      <h3>Tools the agent can call</h3>
      <ul class="site-tools__list">
        ${TOOLS.map(
          (t) =>
            `<li class="site-tool" data-tool="${escape(t.id)}"><code class="site-tool__name">${escape(t.label)}</code> <span class="site-tool__desc">${escape(t.desc)}</span></li>`,
        ).join("")}
      </ul>
    </section>
    <div class="site-cta-wrap">
      <button id="site-cta" type="button" class="site-cta">
        <span class="site-cta__dot" aria-hidden="true"></span>
        <span class="site-cta__label">${renderCtaLabel(copy.cta)}</span>
      </button>
    </div>
    ${marqueeHtml}
  `;

  applyVoiceStatusToCta();
}

function highlightTool(name) {
  if (!name) return;
  const li = document.querySelector(`.site-tool[data-tool="${CSS.escape(name)}"]`);
  if (!li) return;
  li.classList.remove("is-active");
  // Restart the animation by forcing a reflow.
  void li.offsetWidth;
  li.classList.add("is-active");
  clearTimeout(li._fadeTimer);
  li._fadeTimer = setTimeout(() => li.classList.remove("is-active"), 1800);
}

function renderCtaLabel(text) {
  const lines = String(text).split(/\r?\n/);
  const [first, ...rest] = lines;
  const main = `<span class="site-cta__main">${escape(first)}</span>`;
  const sub = rest.length
    ? `<span class="site-cta__sub">${escape(rest.join(" "))}</span>`
    : "";
  return main + sub;
}

function applyVoiceStatusToCta() {
  const btn = document.getElementById("site-cta");
  if (!btn) return;
  btn.dataset.voice = voiceStatus;
  const label = btn.querySelector(".site-cta__label");
  if (!label) return;
  if (voiceStatus === "connecting") label.innerHTML = `<span class="site-cta__main">Connecting…</span>`;
  else if (voiceStatus === "on") label.innerHTML = `<span class="site-cta__main">Listening — tap to stop</span>`;
  else label.innerHTML = renderCtaLabel(lastCtaLabel);
}

async function loadInitialState() {
  const res = await fetch("/api/state");
  if (!res.ok) {
    appendMessage("system", `Could not load initial state (${res.status})`);
    return;
  }
  render(await res.json());
}

/* ---------- Debug drawer ---------- */

function setDebugOpen(open) {
  $debugDrawer.hidden = !open;
  $debugToggle.setAttribute("aria-pressed", open ? "true" : "false");
}

$debugToggle.addEventListener("click", () => {
  setDebugOpen($debugDrawer.hidden);
});
$debugClear.addEventListener("click", () => {
  $log.innerHTML = "";
});

/* ---------- Voice (OpenAI Realtime via SSE + chunked POSTs) ---------- */

const SAMPLE_RATE = 24_000;
const MIC_FLUSH_MS = 80;

const RECORDER_WORKLET = `
class RecorderWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length > 0) {
      this.port.postMessage(ch.slice(0));
    }
    return true;
  }
}
registerProcessor('recorder', RecorderWorklet);
`;

const voice = {
  active: false,
  sessionId: null,
  evt: null,
  stream: null,
  ctxIn: null,
  ctxOut: null,
  source: null,
  worklet: null,
  pending: [],
  flushTimer: null,
  outCursor: 0,
  activeAudio: new Set(),
  bubbles: { user: null, assistant: null },
};

function floatToPCM16(f32) {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return i16;
}

function pcm16ToFloat(i16) {
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
  return f32;
}

function decodeAudio(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function setVoiceUI(state) {
  // state: "off" | "connecting" | "on"
  voice.active = state === "on";
  voiceStatus = state;
  applyVoiceStatusToCta();
}

function appendTranscript(role, text) {
  if (text === "\n") {
    voice.bubbles[role] = null;
    return;
  }
  if (!voice.bubbles[role]) {
    voice.bubbles[role] = appendMessage(role, "");
  }
  voice.bubbles[role].textContent += text;
  $log.scrollTop = $log.scrollHeight;
}

function playPcmChunk(i16) {
  if (!voice.ctxOut) return;
  const f32 = pcm16ToFloat(i16);
  const buf = voice.ctxOut.createBuffer(1, f32.length, SAMPLE_RATE);
  buf.copyToChannel(f32, 0);
  const src = voice.ctxOut.createBufferSource();
  src.buffer = buf;
  src.connect(voice.ctxOut.destination);
  const startAt = Math.max(voice.outCursor, voice.ctxOut.currentTime);
  src.start(startAt);
  voice.outCursor = startAt + f32.length / SAMPLE_RATE;
  voice.activeAudio.add(src);
  src.onended = () => voice.activeAudio.delete(src);
}

function stopAllAudio() {
  for (const src of voice.activeAudio) {
    try { src.stop(); } catch {}
  }
  voice.activeAudio.clear();
  voice.outCursor = voice.ctxOut ? voice.ctxOut.currentTime : 0;
}

function scheduleFlush() {
  if (voice.flushTimer) return;
  voice.flushTimer = setTimeout(flushMic, MIC_FLUSH_MS);
}

async function flushMic() {
  voice.flushTimer = null;
  if (!voice.active || !voice.sessionId || voice.pending.length === 0) return;
  let total = 0;
  for (const c of voice.pending) total += c.length;
  const merged = new Int16Array(total);
  let off = 0;
  for (const c of voice.pending) {
    merged.set(c, off);
    off += c.length;
  }
  voice.pending.length = 0;
  try {
    await fetch(`/api/voice/append?sid=${encodeURIComponent(voice.sessionId)}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: merged.buffer,
    });
  } catch (err) {
    console.warn("voice append failed", err);
  }
}

function onMicChunk(f32) {
  if (!voice.active) return;
  voice.pending.push(floatToPCM16(f32));
  scheduleFlush();
}

async function startVoice() {
  if (voice.active) return;
  setVoiceUI("connecting");
  try {
    const startRes = await fetch("/api/voice/start", { method: "POST" });
    if (!startRes.ok) {
      const msg = await startRes.text();
      throw new Error(`start failed (${startRes.status}): ${msg}`);
    }
    const { sessionId } = await startRes.json();
    voice.sessionId = sessionId;

    voice.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    voice.ctxIn = new AudioContext({ sampleRate: SAMPLE_RATE });
    voice.ctxOut = new AudioContext({ sampleRate: SAMPLE_RATE });
    voice.outCursor = voice.ctxOut.currentTime;

    const blobUrl = URL.createObjectURL(
      new Blob([RECORDER_WORKLET], { type: "application/javascript" }),
    );
    await voice.ctxIn.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);
    voice.source = voice.ctxIn.createMediaStreamSource(voice.stream);
    voice.worklet = new AudioWorkletNode(voice.ctxIn, "recorder");
    voice.worklet.port.onmessage = (e) => onMicChunk(e.data);
    voice.source.connect(voice.worklet);

    voice.evt = new EventSource(
      `/api/voice/events?sid=${encodeURIComponent(sessionId)}`,
    );
    voice.evt.addEventListener("audio", (e) => {
      const { b64 } = JSON.parse(e.data);
      playPcmChunk(decodeAudio(b64));
    });
    voice.evt.addEventListener("transcript", (e) => {
      const { text, role } = JSON.parse(e.data);
      appendTranscript(role, text);
    });
    voice.evt.addEventListener("state", (e) => {
      try { render(JSON.parse(e.data)); } catch {}
    });
    voice.evt.addEventListener("tool", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const name = payload.toolName || payload.tool || "tool";
        appendMessage("system", `tool: ${name}(${JSON.stringify(payload.args || {})})`);
        highlightTool(name);
      } catch {}
    });
    voice.evt.addEventListener("turn.done", () => {
      voice.bubbles.user = null;
      voice.bubbles.assistant = null;
    });
    voice.evt.addEventListener("error", (e) => {
      try {
        const { message } = JSON.parse(e.data);
        appendMessage("system", `voice error: ${message}`);
      } catch {
        appendMessage("system", "voice error");
      }
    });
    voice.evt.addEventListener("closed", () => {
      stopVoice(false);
    });
    voice.evt.onerror = () => {
      if (voice.evt && voice.evt.readyState === EventSource.CLOSED) {
        appendMessage("system", "voice stream disconnected");
        stopVoice(false);
      }
    };

    setVoiceUI("on");
    appendMessage("system", "voice on — say what to change.");
  } catch (err) {
    appendMessage("system", `voice start failed: ${err?.message ?? err}`);
    await stopVoice(true);
  }
}

async function stopVoice(notifyServer = true) {
  const sid = voice.sessionId;
  if (voice.flushTimer) {
    clearTimeout(voice.flushTimer);
    voice.flushTimer = null;
  }
  if (voice.evt) {
    voice.evt.close();
    voice.evt = null;
  }
  if (voice.worklet) {
    try { voice.worklet.port.onmessage = null; voice.worklet.disconnect(); } catch {}
    voice.worklet = null;
  }
  if (voice.source) {
    try { voice.source.disconnect(); } catch {}
    voice.source = null;
  }
  if (voice.stream) {
    for (const t of voice.stream.getTracks()) t.stop();
    voice.stream = null;
  }
  stopAllAudio();
  if (voice.ctxIn) { try { await voice.ctxIn.close(); } catch {} voice.ctxIn = null; }
  if (voice.ctxOut) { try { await voice.ctxOut.close(); } catch {} voice.ctxOut = null; }
  voice.pending.length = 0;
  voice.bubbles.user = null;
  voice.bubbles.assistant = null;
  voice.sessionId = null;
  setVoiceUI("off");
  if (notifyServer && sid) {
    try {
      await fetch(`/api/voice/stop?sid=${encodeURIComponent(sid)}`, { method: "POST" });
    } catch {}
  }
}

// CTA button is inside the preview frame and re-rendered on each state
// update, so delegate from the frame.
$frame.addEventListener("click", (e) => {
  const btn = e.target instanceof Element ? e.target.closest("#site-cta") : null;
  if (!btn) return;
  if (voice.active) stopVoice();
  else startVoice();
});

loadInitialState();
