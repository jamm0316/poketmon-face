// AI가 돌려준 "포켓몬 영문 이름"으로 PokeAPI에서 이미지(스프라이트)를 가져온다.
// 즉, 이름 기반으로 인터넷에서 포켓몬 사진을 받아오는 부분.

const POKEAPI = "https://pokeapi.co/api/v2/pokemon";
const cache = new Map();

// 이름을 PokeAPI 조회용으로 정규화 (소문자, 공백/특수문자 → 하이픈)
function normalize(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[\s_]+/g, "-");
}

// 영문 이름 → { id, sprite } (실패 시 sprite=null)
export async function fetchPokemonImage(nameEn) {
  const key = normalize(nameEn);
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await fetch(`${POKEAPI}/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`PokeAPI ${res.status}`);
    const data = await res.json();

    const sprite =
      data?.sprites?.other?.["official-artwork"]?.front_default ||
      data?.sprites?.other?.home?.front_default ||
      data?.sprites?.front_default ||
      null;

    const result = { id: data.id, sprite };
    cache.set(key, result);
    return result;
  } catch (e) {
    console.warn(`포켓몬 이미지 조회 실패 (${key}):`, e.message);
    const result = { id: null, sprite: null };
    cache.set(key, result);
    return result;
  }
}

const MAX_DEX = 386; // 1~3세대 (관동·성도·호연) 도감 상한

// 랜덤 포켓몬 1마리의 이름/외형 분류/도감 설명을 가져온다. (백엔드 미연결 시 데모용)
export async function fetchRandomPokemon() {
  const id = 1 + Math.floor(Math.random() * MAX_DEX);
  try {
    const res = await fetch(`${POKEAPI}/${id}`);
    if (!res.ok) throw new Error(`PokeAPI ${res.status}`);
    const data = await res.json();
    const name_en = data.name;

    let name_ko = name_en;
    let genus_ko = ""; // 외형 분류 (예: 쥐포켓몬)
    let flavor_ko = ""; // 도감 설명 (성격/일화/스토리)
    try {
      const sres = await fetch(data.species.url);
      if (sres.ok) {
        const sdata = await sres.json();
        const ko = sdata.names?.find((n) => n.language?.name === "ko");
        if (ko?.name) name_ko = ko.name;
        const g = sdata.genera?.find((x) => x.language?.name === "ko");
        if (g?.genus) genus_ko = g.genus;
        // 한글 도감 설명 중 하나를 골라 공백 정리
        const koFlavors = (sdata.flavor_text_entries || []).filter(
          (x) => x.language?.name === "ko"
        );
        const f = koFlavors[Math.floor(Math.random() * koFlavors.length)];
        if (f?.flavor_text) flavor_ko = f.flavor_text.replace(/\s+/g, " ").trim();
      }
    } catch {
      /* 부가 정보 실패 시 이름만 사용 */
    }

    return { id, name_en, name_ko, genus_ko, flavor_ko };
  } catch (e) {
    console.warn(`랜덤 포켓몬 조회 실패 (${id}):`, e.message);
    return null;
  }
}

// 서로 다른 랜덤 포켓몬 n마리
export async function fetchRandomPokemons(n) {
  const seen = new Set();
  const list = [];
  let attempts = 0;
  while (list.length < n && attempts < n * 4) {
    attempts++;
    const p = await fetchRandomPokemon();
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      list.push(p);
    }
  }
  return list;
}
