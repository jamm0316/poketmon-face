import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.warn(
    "⚠️  ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. /api/match 호출 시 503을 반환합니다."
  );
}

const client = apiKey ? new Anthropic({ apiKey }) : null;

const app = express();
// 사진 base64는 용량이 커서 한도를 넉넉히
app.use(express.json({ limit: "12mb" }));
app.use(express.static(__dirname));

// 닮은 포켓몬 추천 결과의 JSON 스키마 (구조화된 출력)
const MATCH_SCHEMA = {
  type: "object",
  properties: {
    face_found: {
      type: "boolean",
      description: "사진에서 사람 얼굴을 찾았으면 true, 아니면 false",
    },
    best_match: {
      type: "object",
      properties: {
        name_en: {
          type: "string",
          description: "포켓몬 영문 이름 (소문자, PokeAPI 조회용. 예: pikachu)",
        },
        name_ko: { type: "string", description: "포켓몬 한글 이름" },
        similarity: {
          type: "integer",
          description: "닮은 정도 (60~99 사이 정수)",
        },
        reason: {
          type: "string",
          description: "왜 닮았는지 한국어로 1~2문장. 재미있고 친근하게.",
        },
      },
      required: ["name_en", "name_ko", "similarity", "reason"],
      additionalProperties: false,
    },
    runner_ups: {
      type: "array",
      description: "그 외에 닮은 포켓몬 2개",
      items: {
        type: "object",
        properties: {
          name_en: { type: "string" },
          name_ko: { type: "string" },
          similarity: { type: "integer" },
        },
        required: ["name_en", "name_ko", "similarity"],
        additionalProperties: false,
      },
    },
  },
  required: ["face_found", "best_match", "runner_ups"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `너는 사람 얼굴 사진을 보고 가장 닮은 포켓몬을 골라주는 재미있는 감별사야.
- 얼굴의 윤곽, 표정, 분위기, 헤어스타일, 색감 등을 종합적으로 보고 어울리는 포켓몬을 골라.
- 1세대~9세대 어떤 포켓몬이든 가능하지만, 사람들이 잘 아는 유명한 포켓몬을 우선해.
- name_en은 반드시 PokeAPI에서 조회 가능한 영문 소문자 이름이어야 해 (예: pikachu, psyduck, snorlax, gengar).
- 외모 평가는 절대 비하하지 말고 긍정적이고 유쾌하게 표현해.
- 사람 얼굴이 안 보이면 face_found를 false로 하고 나머지는 적당히 채워.

반드시 아래 형태의 JSON "하나만" 출력해. 다른 설명이나 코드블록 표시 없이 JSON만:
{"face_found": true, "best_match": {"name_en": "psyduck", "name_ko": "고라파덕", "similarity": 85, "reason": "..."}, "runner_ups": [{"name_en": "...", "name_ko": "...", "similarity": 78}, {"name_en": "...", "name_ko": "...", "similarity": 72}]}`;

// 모델 응답 텍스트에서 JSON 객체를 안전하게 추출한다.
function parseResult(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("JSON 파싱 실패");
  }
}

app.post("/api/match", async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았어요.",
    });
  }

  const { image, mediaType } = req.body || {};
  if (!image || !mediaType) {
    return res.status(400).json({ error: "image와 mediaType이 필요합니다." });
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: MATCH_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: image },
            },
            {
              type: "text",
              text: "이 사람과 가장 닮은 포켓몬을 골라줘.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(502).json({ error: "AI 응답을 파싱하지 못했어요." });
    }
    const result = parseResult(textBlock.text);
    res.json(result);
  } catch (err) {
    console.error("AI 호출 오류:", err);
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
      error: "AI 분석 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
    });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(client) });
});

app.listen(PORT, () => {
  console.log(`🚀 닮은 포켓몬 찾기 서버 실행 중: http://localhost:${PORT}`);
});
