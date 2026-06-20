# 🔍 닮은 포켓몬 찾기 (poketmon-face)

사진을 찍거나 올리면 **AI(Claude 비전 모델)** 가 얼굴을 보고 가장 닮은 포켓몬을 골라주고,
그 포켓몬 이미지를 **PokeAPI에서 이름으로 가져와** 보여주는 웹앱입니다.

## 동작 방식

```
[브라우저] 사진 촬영/업로드
   │  base64 이미지
   ▼
[백엔드 /api/match]  ── Claude 비전 모델 ──▶  닮은 포켓몬 이름(JSON)
   │
   ▼
[브라우저] 포켓몬 이름으로 PokeAPI 이미지 조회 → 결과 표시
```

- **백엔드(Express)**: 이미지를 받아 Claude(`claude-opus-4-8`) 비전 모델에 보내고,
  구조화된 출력(JSON 스키마)으로 `{ 닮은 포켓몬 이름, 닮은 이유, 일치율 }` 을 받습니다.
  API 키는 서버 환경변수(`ANTHROPIC_API_KEY`)에만 보관되어 브라우저에 노출되지 않습니다.
- **프론트엔드(정적)**: AI가 돌려준 포켓몬 영문 이름으로
  [PokeAPI](https://pokeapi.co)에서 공식 아트워크 이미지를 가져옵니다.

## 로컬 실행

```bash
# 1) 의존성 설치
npm install

# 2) API 키 설정
cp .env.example .env       # .env 를 열어 ANTHROPIC_API_KEY 입력
export $(grep -v '^#' .env | xargs)   # 또는 직접 export ANTHROPIC_API_KEY=sk-ant-...

# 3) 실행
npm start                  # http://localhost:3000
```

> 키 없이 실행하면 화면은 뜨지만 `/api/match` 호출 시 503을 반환합니다.

## 배포

서버가 필요하므로 정적 호스팅(GitHub Pages)으로는 동작하지 않습니다.
Node 호스팅(Render, Railway, Fly.io 등)에 올리거나 Docker로 실행하세요.

```bash
# Docker
docker build -t poketmon-face .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... poketmon-face
```

배포 플랫폼에서는 환경변수 `ANTHROPIC_API_KEY`(필수)와 `PORT`(선택)를 설정하면 됩니다.

## 구성

| 경로 | 설명 |
|------|------|
| `server.js` | Express 서버 + Claude 비전 API 호출 |
| `index.html`, `css/`, `js/` | 프론트엔드 |
| `js/app.js` | 촬영/업로드 → 분석 요청 → 결과 렌더 |
| `js/pokeapi.js` | 포켓몬 이름 → PokeAPI 이미지 |

---

재미로 즐기는 앱이에요 · 포켓몬 이미지 © Nintendo / Game Freak
