// 自販連（登録車）と全軽自協（軽自動車）の公開ランキングを取得し、
// Wikipedia の写真を付けて public/data/cars.json を生成する。
// 失敗したときは既存の cars.json を上書きせずに終了コード 1 で終わる。

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'cars.json');
const CACHE_FILE = path.join(ROOT, 'data', 'image-cache.json');
const OVERRIDES_FILE = path.join(ROOT, 'data', 'overrides.json');

const JADA_PAGE = 'https://www.jada.or.jp/pages/340/';
const KEI_PAGE = 'https://www.zenkeijikyo.or.jp/statistics/tushosoku';
const TOP_N = 100;
// Wikimedia の利用規約に従い、連絡先（リポジトリURLなど）を環境変数 CONTACT で渡す
const UA = `CarQuizJP/1.0 (${process.env.CONTACT || 'hobby quiz site'}) node-fetch`;

const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'text') {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 && attempt < 4) {
      await sleep((Number(res.headers.get('retry-after')) || 5 * 2 ** attempt) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
  }
}

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

// ---------- 自販連: 登録車 ----------

async function fetchJada() {
  const html = await get(JADA_PAGE);
  const links = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    const file = href.match(/[?&]file=([^&]+\.xlsx?)/)?.[1] ?? (/\.xlsx?$/.test(href) ? href : null);
    if (file) links.add(new URL(file, JADA_PAGE).href);
  }
  if (links.size === 0) throw new Error('自販連: Excel へのリンクが見つかりません');

  // monthly[YYYY-MM] = [{ name, maker, units }]
  const monthly = {};
  for (const url of links) {
    const wb = XLSX.read(await get(url, 'buffer'));
    for (const sheetName of wb.SheetNames) {
      const m = norm(sheetName).match(/^(\d{4})年(\d{1,2})月$/);
      if (!m) continue;
      const key = `${m[1]}-${m[2].padStart(2, '0')}`;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });
      const list = rows
        .filter((r) => typeof r[0] === 'number' && r[1] && typeof r[3] === 'number')
        .map((r) => ({ name: norm(r[1]), maker: norm(r[2]), units: r[3] }));
      if (list.length) monthly[key] = list;
    }
  }
  const months = Object.keys(monthly).sort();
  if (months.length === 0) throw new Error('自販連: 月次データを読み取れません');

  // 全軽自協の「本年累計＋前年累計」と揃えて、直近2年の1月〜最新月を合計する
  const latest = months.at(-1);
  const [y, mm] = latest.split('-').map(Number);
  const totals = new Map();
  for (const key of months) {
    const [ky, km] = key.split('-').map(Number);
    if ((ky !== y && ky !== y - 1) || km > mm) continue;
    for (const c of monthly[key]) {
      const id = `${c.maker}|${c.name}`;
      const t = totals.get(id) ?? { name: c.name, maker: c.maker, units: 0, latestMonth: 0 };
      t.units += c.units;
      if (key === latest) t.latestMonth = c.units;
      totals.set(id, t);
    }
  }
  return { latest, cars: [...totals.values()].map((c) => ({ ...c, kind: '登録車' })) };
}

// ---------- 全軽自協: 軽自動車 ----------

const stripTags = (s) => norm(s.replace(/<[^>]*>/g, ''));

async function fetchKei() {
  const html = await get(KEI_PAGE);
  const title = norm(html.match(/class="single-title">([^<]+)/)?.[1]);
  const tm = title.match(/(\d{4})年(\d{1,2})月/);
  if (!tm) throw new Error('全軽自協: 対象月が読み取れません');
  const latest = `${tm[1]}-${tm[2].padStart(2, '0')}`;

  const table = html.match(/<table class="allname">([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error('全軽自協: 通称名別の表が見つかりません');

  const cars = [];
  let category = '';
  let maker = '';
  for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[2]));
    if (cells.length < 9) continue;
    // 末尾8列が数値（本月, 前月, 前月比, 前年同月, 前年同月比, 本年累計, 前年累計, 前年累計比）
    const lead = cells.slice(0, cells.length - 8);
    const [thisMonth, , , , , ytd, prevYtd] = cells.slice(-8).map((v) => Number(v.replace(/,/g, '')) || 0);
    const name = lead.at(-1);
    if (lead.length === 3) { category = lead[0].replace(/\s/g, ''); maker = lead[1]; }
    else if (lead.length === 2) maker = lead[0];
    if (!name || /計|その他/.test(name) || /計/.test(maker)) continue;
    cars.push({
      name,
      maker,
      units: ytd + prevYtd,
      latestMonth: thisMonth,
      kind: category.includes('貨') ? '軽貨物' : '軽自動車',
    });
  }
  if (cars.length < 10) throw new Error(`全軽自協: 車種が少なすぎます (${cars.length})`);
  return { latest, cars };
}

// ---------- Wikipedia の写真 ----------
// 車の記事には世代ごとに「Infobox_自動車のスペック表」があり、
// 1枚目画像名=フロント、2枚目画像名=リア のように写真が並んでいる。
// 現行（いちばん新しい）世代の表から前・後ろの写真を取る。

async function wikiApi(params) {
  const u = new URL('https://ja.wikipedia.org/w/api.php');
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: 2, ...params })) {
    u.searchParams.set(k, v);
  }
  return JSON.parse(await get(u));
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
// ファイル名は全角記号（例: デリカ D：2）を含むことがあるので NFKC 正規化しない
const cleanFile = (s) => String(s).trim().replace(/^\[\[/, '').replace(/^(ファイル|File|画像|Image):/i, '').split('|')[0].replace(/\]\]$/, '').trim();
const cleanText = (s) => norm(String(s ?? '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/<[^>]*>/g, ' ').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, ''));

const IMG_RE = /\.(jpe?g|png|webp)$/i;
// 販売期間が「2022年12月 - （発表…）」「2015年 - 現在」のように終わりの年がなければ現行
const isOpenPeriod = (s) => /現在/.test(s) || /[-－～〜–―](?!\s*\d)/.test(s);
// 日本で普通に走っていない仕様の表は「最新世代」に選ばない
const SPECIAL_RE = /モータースポーツ|レース|競技|海外|輸出|北米|欧州|中国|アジア|インド|タイ仕様|豪州|南米|中東|コンセプト|パトカー|電気自動車|^EV|派生|特装|福祉|教習/;

function parseGenerations(wikitext) {
  const gens = [];
  let heading = '';
  const lines = wikitext.split('\n');
  let section = null; // 表がない世代の見出し（別記事へのリンクや本文の写真で代用する）
  const flushSection = () => {
    if (section && !section.hasInfobox && (section.sub || section.thumb) && /代目|初代/.test(section.label)) {
      gens.push({ label: section.label, period: '', current: isOpenPeriod(section.label), front: section.thumb, rear: null, sub: section.sub });
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^==\s*([^=].*?)\s*==\s*$/);
    if (h) {
      flushSection();
      heading = cleanText(h[1].replace(/\{\{\s*(?:visible anchor|vanc|vanchor)\s*\|([^}|]*)[^}]*\}\}/gi, '$1'));
      section = { label: heading, hasInfobox: false, sub: null, thumb: null };
      continue;
    }
    if (section && !section.hasInfobox) {
      const sub = lines[i].match(/\{\{\s*(?:main|see also|詳細記事)\s*\|([^}|]+)/i);
      if (sub && !section.sub) section.sub = norm(sub[1]);
      const thumb = lines[i].match(/\[\[(?:ファイル|File|画像):([^|\]]+)\|[^\]]*thumb/i);
      if (thumb && !section.thumb && IMG_RE.test(thumb[1].trim())) section.thumb = cleanFile(thumb[1]);
    }
    if (!/\{\{\s*Infobox[ _]自動車のスペック表/i.test(lines[i])) continue;
    if (section) section.hasInfobox = true;

    const params = {};
    // 表の終わり（"}}" で始まる行・次の表・次の見出し）まで読む
    for (let j = i + 1; j < lines.length && !/^\s*\}\}|^==|\{\{\s*Infobox/i.test(lines[j]); j++) {
      const m = lines[j].match(/^\s*\|\s*([^=]+?)\s*=\s*(.*)$/);
      if (m && !(m[1] in params)) params[m[1]] = m[2];
    }
    const photos = [];
    for (let n = 1; n <= 6; n++) {
      const file = params[`${n}枚目画像名`];
      if (file) photos.push({ file: cleanFile(file), desc: cleanText(params[`${n}枚目画像の説明`]) });
    }
    if (!photos.length && params['画像']) photos.push({ file: cleanFile(params['画像']), desc: '' });
    // 内装・エンジンルームなどの写真はクイズに使えないので除く
    const valid = photos.filter((p) => IMG_RE.test(p.file) && !/interior|室内|内装|インテリア|インパネ|cockpit|dashboard|engine|エンジン|荷室|seat|シート/i.test(p.desc + p.file));
    if (!valid.length) continue;

    const rear = valid.find((p) => /リア|後部|後方|後ろ|rear|back/i.test(p.desc + p.file));
    const front = valid.find((p) => p !== rear && /フロント|前|front/i.test(p.desc + p.file)) ?? valid.find((p) => p !== rear) ?? valid[0];
    const period = cleanText(params['販売期間']);
    // 同じ世代の見出しに複数の表がある（例: ジムニーとジムニーシエラ）ときは最初の表を使う
    if (heading && gens.some((g) => g.label === heading)) continue;
    gens.push({
      label: heading || cleanText(params['車名補']),
      period,
      current: isOpenPeriod(period) || isOpenPeriod(heading),
      front: front.file,
      rear: rear?.file ?? null,
      lead: !heading, // 記事冒頭の全体まとめの表
    });
  }
  flushSection();

  // 「○代目」の表（冒頭のまとめ・特殊仕様・派生モデルを除く）のうち、販売中で最後のものを最新世代とする。
  // 世代の見出しがない車（1代目だけの車など）は冒頭の表、なければ残りの表から選ぶ
  const normal = gens.filter((g) => !g.lead && !SPECIAL_RE.test(g.label));
  const numbered = normal.filter((g) => /代目|初代/.test(g.label));
  const lead = gens.filter((g) => g.lead);
  // （「歴史（スズキOEM以降）」のように現行が「○代目」でない見出しにある車は、販売中の表を優先）
  const hasCurrent = (p) => p.some((g) => g.current);
  const pool = [numbered, normal].find(hasCurrent) ?? [numbered, lead, normal, gens].find((p) => p.length);
  if (!pool) return [];
  let cur = pool.findLastIndex((g) => g.current);
  if (cur < 0) cur = pool.length - 1;
  return pool.slice(Math.max(0, cur - 2), cur + 1).reverse();
}

// 記事名 → { title, gens } を最大50件ずつまとめて引く（リダイレクトも解決）
async function lookupArticles(titles, depth = 0) {
  const found = new Map();
  for (const batch of chunks([...new Set(titles)], 50)) {
    const j = await wikiApi({ titles: batch.join('|'), redirects: 1, prop: 'revisions', rvprop: 'content', rvslots: 'main' });
    const alias = new Map(batch.map((t) => [t, t]));
    for (const { from, to } of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) {
      for (const [orig, cur] of alias) if (cur === from) alias.set(orig, to);
    }
    const pages = new Map((j.query?.pages ?? []).map((p) => [p.title, p]));
    for (const [orig, cur] of alias) {
      const p = pages.get(cur);
      const text = p?.revisions?.[0]?.slots?.main?.content;
      if (!text) continue;
      const gens = parseGenerations(text);
      if (gens.length) found.set(orig, { title: p.title, gens });
    }
    await sleep(1000);
  }

  // 世代ごとの別記事（例: スズキ・ワゴンR (6代目)）があれば、その表の写真で置き換える
  if (!depth) {
    const subs = [...found.values()].flatMap((a) => a.gens.filter((g) => g.sub).map((g) => g.sub));
    const subArticles = subs.length ? await lookupArticles(subs, 1) : new Map();
    for (const a of found.values()) {
      for (const g of a.gens) {
        const s = g.sub && subArticles.get(g.sub)?.gens[0];
        if (s) { g.front = s.front; g.rear = s.rear; }
        delete g.sub;
      }
      a.gens = a.gens.filter((g) => g.front);
    }
  }
  return found;
}

const key = (s) => norm(s).toLowerCase().replace(/[\s・:：\-－/／.]/g, '');
// Wikipedia の記事名で使われるメーカー表記
const wikiMaker = (maker) => ({ SUBARU: 'スバル', MAZDA: 'マツダ', LEXUS: 'レクサス' })[maker] ?? maker;

// 記事名で見つからなければ検索する。誤ヒット（プリウス→プリウスα など）を防ぐため、
// 記事名の「・」以降が販売名の先頭と一致するもの（ハイゼットトラック→ハイゼット など）だけ採用する
async function searchArticle(car) {
  const j = await wikiApi({ list: 'search', srsearch: `${car.maker} ${car.name}`, srlimit: 8 });
  const hit = (j.query?.search ?? []).find((r) => {
    const [head, ...rest] = r.title.split('・');
    const tail = rest.join('・');
    return tail && key(head) === key(wikiMaker(car.maker)) && key(car.name).startsWith(key(tail));
  });
  if (!hit) return null;
  return (await lookupArticles([hit.title])).get(hit.title) ?? null;
}

// ファイル名 → サムネイルURLと作者・ライセンス（Commons の写真も ja.wikipedia 経由で引ける）
async function lookupImages(files) {
  const found = new Map();
  for (const batch of chunks([...new Set(files)], 50)) {
    const j = await wikiApi({
      titles: batch.map((f) => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: 800,
    });
    const alias = new Map(batch.map((f) => [`File:${f}`, f]));
    for (const { from, to } of j.query?.normalized ?? []) {
      if (alias.has(from)) alias.set(to, alias.get(from));
    }
    for (const p of j.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      const file = alias.get(p.title);
      if (!ii || !file) continue;
      const meta = ii.extmetadata ?? {};
      found.set(file, {
        url: ii.thumburl ?? ii.url,
        page: ii.descriptionurl,
        artist: cleanText(meta.Artist?.value ?? '不明').slice(0, 80),
        license: cleanText(meta.LicenseShortName?.value ?? ''),
      });
    }
    await sleep(1000);
  }
  return found;
}

const CACHE_DAYS = 25; // 新型が出たら写真も切り替わるよう、毎月取り直す

async function attachImages(cars, overrides) {
  const cache = readJson(CACHE_FILE, {});
  const keyOf = (car) => `${car.id}|${JSON.stringify(overrides[car.id] ?? {})}`;
  const fresh = (e) => e && Date.now() - Date.parse(e.fetchedAt) < CACHE_DAYS * 864e5;
  const todo = cars.filter((c) => !fresh(cache[keyOf(c)]));

  if (todo.length) {
    const titleOf = (c) => overrides[c.id]?.wiki ?? `${wikiMaker(c.maker)}・${c.name}`;
    const articles = await lookupArticles(todo.map(titleOf));
    const resolved = new Map();
    for (const car of todo) {
      let a = articles.get(titleOf(car));
      if (!a && !overrides[car.id]?.wiki) {
        try { a = await searchArticle(car); } catch (e) { console.warn(`検索に失敗: ${car.id}: ${e.message}`); }
        await sleep(1000);
      }
      if (a) resolved.set(car.id, a);
    }
    const files = [...resolved.values()].flatMap((a) => a.gens.flatMap((g) => [g.front, g.rear])).filter(Boolean);
    const images = await lookupImages(files);
    for (const car of todo) {
      const a = resolved.get(car.id);
      if (!a) { delete cache[keyOf(car)]; continue; }
      const gens = a.gens
        .map((g) => ({ label: g.label, period: g.period, front: images.get(g.front) ?? null, rear: images.get(g.rear) ?? null }))
        .filter((g) => g.front);
      if (gens.length) cache[keyOf(car)] = { wiki: a.title, gens, fetchedAt: new Date().toISOString() };
    }
  }

  for (const car of cars) {
    const hit = cache[keyOf(car)];
    if (hit) {
      car.wikiTitle = hit.wiki;
      car.wiki = `https://ja.wikipedia.org/wiki/${encodeURIComponent(hit.wiki)}`;
      car.gens = hit.gens;
    } else {
      console.warn(`写真なし: ${car.id}（data/overrides.json で記事名を指定できます）`);
    }
  }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1) + '\n');
}

// ---------- main ----------

function mergeBy(cars, keyFn, onMerge) {
  const merged = new Map();
  for (const c of cars) {
    const k = keyFn(c);
    const prev = merged.get(k);
    if (!prev) { merged.set(k, { ...c, aliases: c.aliases ?? [c.name], unitsMain: c.units }); continue; }
    prev.units += c.units;
    prev.latestMonth += c.latestMonth;
    prev.aliases = [...new Set([...prev.aliases, ...(c.aliases ?? [c.name])])];
    if (c.units > prev.unitsMain) { prev.kind = c.kind; prev.unitsMain = c.units; }
    onMerge?.(prev, c);
  }
  return [...merged.values()].map(({ unitsMain, ...c }) => c);
}

async function main() {
  const [jada, kei] = await Promise.all([fetchJada(), fetchKei()]);
  const overrides = readJson(OVERRIDES_FILE, {});

  // 1) 同じメーカー・車名を合算（例: ジムニー（軽）＋ジムニー（シエラ等、登録車））
  let cars = [...jada.cars, ...kei.cars]
    .map((c) => ({ ...c, id: `${c.maker}|${c.name}` }))
    .filter((c) => !overrides[c.id]?.exclude);
  cars = mergeBy(cars, (c) => c.id)
    .sort((a, b) => b.units - a.units)
    .slice(0, TOP_N + 40);

  await attachImages(cars, overrides);

  // 2) 同じ Wikipedia 記事（＝同じ写真）になった販売名は1車種にまとめる
  //    例: ミニキャブバン／ミニキャブトラック → ミニキャブ、RX350／RX500H → RX
  cars = mergeBy(cars, (c) => c.wikiTitle ?? c.id, (prev) => {
    prev.name = overrides[prev.id]?.name ?? prev.wikiTitle.split('・').slice(1).join('・').replace(/\s*\(.*\)$/, '');
  })
    .sort((a, b) => b.units - a.units)
    .slice(0, TOP_N)
    .map(({ wikiTitle, ...c }, i) => ({ rank: i + 1, ...c, maker: wikiMaker(c.maker), name: overrides[c.id]?.name ?? c.name }));

  const withImage = cars.filter((c) => c.gens).length;
  if (withImage < 30) throw new Error(`写真のある車種が少なすぎます (${withImage})`);

  const out = {
    updatedAt: new Date().toISOString(),
    period: { registered: jada.latest, kei: kei.latest },
    sources: [
      { name: '一般社団法人 日本自動車販売協会連合会（自販連）', url: JADA_PAGE },
      { name: '一般社団法人 全国軽自動車協会連合会（全軽自協）', url: KEI_PAGE },
      { name: 'Wikipedia / Wikimedia Commons（写真）', url: 'https://ja.wikipedia.org/' },
    ],
    cars,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n');
  console.log(`OK: ${cars.length} 車種（写真あり ${withImage}）登録車 ${jada.latest} / 軽 ${kei.latest}`);
}

main().catch((e) => {
  console.error('更新に失敗しました（既存データはそのまま）:', e.message);
  process.exit(1);
});
