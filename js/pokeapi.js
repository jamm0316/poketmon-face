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

const MAX_DEX = 1025; // 9세대까지 대략적인 도감 번호 상한

// 랜덤 포켓몬 1마리의 영문/한글 이름을 가져온다. (백엔드 미연결 시 데모용)
export async function fetchRandomPokemon() {
  const id = 1 + Math.floor(Math.random() * MAX_DEX);
  try {
    const res = await fetch(`${POKEAPI}/${id}`);
    if (!res.ok) throw new Error(`PokeAPI ${res.status}`);
    const data = await res.json();
    const name_en = data.name;

    let name_ko = name_en;
    try {
      const sres = await fetch(data.species.url);
      if (sres.ok) {
        const sdata = await sres.json();
        const ko = sdata.names?.find((n) => n.language?.name === "ko");
        if (ko?.name) name_ko = ko.name;
      }
    } catch {
      /* 한글 이름 실패 시 영문 사용 */
    }

    return { id, name_en, name_ko };
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
