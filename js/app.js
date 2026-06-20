/* ------------------------------------------------------------------
 * 닮은 포켓몬 찾기 - 프론트엔드
 * 1) 사진 촬영/업로드 → base64
 * 2) 백엔드 /api/match 로 전송 → AI가 닮은 포켓몬 이름(JSON) 반환
 * 3) 포켓몬 이름으로 PokeAPI에서 이미지를 받아와 결과 표시
 * ------------------------------------------------------------------ */

import { fetchPokemonImage, fetchRandomPokemons } from "./pokeapi.js";

const els = {
  status: document.getElementById("status"),
  fileInput: document.getElementById("fileInput"),
  cameraBtn: document.getElementById("cameraBtn"),
  uploadBtn: document.getElementById("uploadBtn"),
  video: document.getElementById("video"),
  captureBtn: document.getElementById("captureBtn"),
  cameraArea: document.getElementById("cameraArea"),
  canvas: document.getElementById("canvas"),
  preview: document.getElementById("preview"),
  result: document.getElementById("result"),
  retryBtn: document.getElementById("retryBtn"),
};

let stream = null;

/* ---------------------------- 카메라 ---------------------------- */
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    els.video.srcObject = stream;
    els.cameraArea.style.display = "block";
    els.preview.style.display = "none";
    els.result.innerHTML = "";
    els.retryBtn.style.display = "none";
  } catch (e) {
    alert("카메라를 사용할 수 없어요. 사진 업로드를 이용해 주세요.\n" + e.message);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  els.cameraArea.style.display = "none";
}

function captureFromVideo() {
  const v = els.video;
  const c = els.canvas;
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext("2d");
  // 셀카 좌우 반전 보정
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(v, 0, 0, c.width, c.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  stopCamera();
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  analyze(dataUrl);
}

/* ---------------------------- 분석 ---------------------------- */
function setStatus(msg) {
  els.status.textContent = msg;
  els.status.style.display = msg ? "block" : "none";
}

// dataURL → { mediaType, base64 }
function splitDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("이미지 형식을 읽을 수 없어요.");
  return { mediaType: m[1], base64: m[2] };
}

async function analyze(dataUrl) {
  els.preview.src = dataUrl;
  els.preview.style.display = "block";
  els.result.innerHTML = "";
  els.retryBtn.style.display = "none";
  setStatus("AI가 얼굴을 분석하는 중… 🔍");

  try {
    const { mediaType, base64 } = splitDataUrl(dataUrl);

    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, mediaType }),
    });

    // 백엔드가 없거나(예: GitHub Pages 정적 배포 → 404) 키 미설정(503)이면
    // 멈추지 않고 랜덤 포켓몬으로 무중단 진행 (데모 모드)
    if (res.status === 404 || res.status === 503) {
      await runDemoMode();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `서버 오류 (${res.status})`);
    }

    const data = await res.json();
    setStatus("");

    if (!data.face_found) {
      els.result.innerHTML =
        '<p class="no-face">😅 얼굴을 찾지 못했어요. 정면 얼굴이 잘 보이는 밝은 사진으로 다시 시도해 주세요.</p>';
      els.retryBtn.style.display = "inline-block";
      return;
    }

    await renderResult(data);
  } catch (e) {
    // 네트워크 오류 등으로 백엔드에 닿지 못해도 무중단으로 데모 진행
    console.warn("백엔드 연결 실패, 데모 모드로 진행:", e.message);
    await runDemoMode();
  }
  els.retryBtn.style.display = "inline-block";
}

/* ---------------------------- 데모 모드 ---------------------------- */
// 백엔드가 없을 때, 랜덤 포켓몬으로 결과를 만들어 무중단으로 보여준다.
async function runDemoMode() {
  setStatus("랜덤으로 골라보는 중… 🎲");
  const picks = await fetchRandomPokemons(3);
  setStatus("");

  if (picks.length === 0) {
    els.result.innerHTML =
      '<p class="no-face">⚠️ 지금은 결과를 가져올 수 없어요. 잠시 후 다시 시도해 주세요.</p>';
    return;
  }

  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const best = picks[0];
  const data = {
    face_found: true,
    best_match: {
      name_en: best.name_en,
      name_ko: best.name_ko,
      similarity: rand(75, 95),
      reason:
        "백엔드(AI)가 연결되지 않아 랜덤으로 골라본 결과예요. 서버를 연결하면 진짜로 닮은 포켓몬을 찾아드려요!",
    },
    runner_ups: picks.slice(1).map((p) => ({
      name_en: p.name_en,
      name_ko: p.name_ko,
      similarity: rand(60, 74),
    })),
  };
  await renderResult(data, { demo: true });
}

/* ---------------------------- 결과 렌더 ---------------------------- */
async function renderResult(data, opts = {}) {
  const best = data.best_match;
  const others = Array.isArray(data.runner_ups) ? data.runner_ups.slice(0, 2) : [];

  // 이름으로 이미지들을 병렬로 가져오기
  const [bestImg, ...otherImgs] = await Promise.all([
    fetchPokemonImage(best.name_en),
    ...others.map((p) => fetchPokemonImage(p.name_en)),
  ]);

  const placeholder =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#eef0f4"/><text x="50%" y="52%" font-size="40" text-anchor="middle" dominant-baseline="middle">❔</text></svg>'
    );

  const bestSprite = bestImg.sprite || placeholder;
  const percent = clampPercent(best.similarity);

  els.result.innerHTML = `
    ${opts.demo ? '<p class="demo-banner">🎲 데모 모드 — 백엔드 미연결이라 랜덤으로 골랐어요</p>' : ""}
    <div class="best-card">
      <p class="best-label">당신과 닮은 포켓몬은…</p>
      <img class="best-sprite" src="${bestSprite}" alt="${escapeHtml(best.name_ko)}" />
      <h2 class="best-name">${escapeHtml(best.name_ko)} <span>(${escapeHtml(best.name_en)})</span></h2>
      <div class="match-bar"><div class="match-fill" style="width:${percent}%"></div></div>
      <p class="best-percent">${percent}% 일치</p>
      <p class="best-reason">${escapeHtml(best.reason)}</p>
    </div>
    ${
      others.length
        ? `<div class="others">
            <p class="others-title">이런 포켓몬과도 닮았어요</p>
            <div class="others-grid">
              ${others
                .map((p, i) => {
                  const sprite = otherImgs[i]?.sprite || placeholder;
                  return `<div class="other-card">
                      <img src="${sprite}" alt="${escapeHtml(p.name_ko)}" />
                      <span class="other-name">${escapeHtml(p.name_ko)}</span>
                      <span class="other-percent">${clampPercent(p.similarity)}%</span>
                    </div>`;
                })
                .join("")}
            </div>
          </div>`
        : ""
    }
  `;
  els.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clampPercent(n) {
  const v = Math.round(Number(n) || 0);
  return Math.max(60, Math.min(99, v));
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------------------------- 이벤트 ---------------------------- */
els.cameraBtn.addEventListener("click", startCamera);
els.captureBtn.addEventListener("click", captureFromVideo);
els.uploadBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => analyze(ev.target.result);
  reader.readAsDataURL(file);
});
els.retryBtn.addEventListener("click", () => {
  els.result.innerHTML = "";
  els.preview.style.display = "none";
  els.retryBtn.style.display = "none";
  els.fileInput.value = "";
});
