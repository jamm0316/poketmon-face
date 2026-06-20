/* ------------------------------------------------------------------
 * 닮은 포켓몬 찾기 - 프론트엔드
 * 1) 사진 촬영/업로드 → base64
 * 2) 백엔드 /api/match 로 전송 → AI가 닮은 포켓몬 이름(JSON) 반환
 * 3) 포켓몬 이름으로 PokeAPI에서 이미지를 받아와 결과 표시
 * ------------------------------------------------------------------ */

import { fetchPokemonImage } from "./pokeapi.js";

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

    // 백엔드가 없는 환경(예: GitHub Pages 정적 배포)에서는 /api/match 가 없어 404
    if (res.status === 404) {
      setStatus("");
      els.result.innerHTML =
        '<p class="no-face">🧩 이 화면은 <b>프론트엔드 데모</b>예요.<br/>실제 닮은 포켓몬 분석은 AI 백엔드가 필요해서, 서버를 실행한 환경에서만 동작합니다.</p>';
      els.retryBtn.style.display = "inline-block";
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
    console.error(e);
    setStatus("");
    els.result.innerHTML = `<p class="no-face">⚠️ ${e.message}</p>`;
  }
  els.retryBtn.style.display = "inline-block";
}

/* ---------------------------- 결과 렌더 ---------------------------- */
async function renderResult(data) {
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
