const QUESTIONS = 10;

// 難易度＝販売ランキングの何位までを出題するか
const LEVELS = [
  { star: 1, top: 10, label: 'はじめて' },
  { star: 2, top: 20, label: 'ふつう' },
  { star: 3, top: 40, label: 'くわしい' },
  { star: 4, top: 70, label: 'マニア' },
  { star: 5, top: 100, label: '鬼' },
];

const ICONS = {
  name: '<path d="M5 16v-3l2-5c.4-1 1.2-1.5 2.2-1.5h5.6c1 0 1.8.5 2.2 1.5l2 5v3"/><path d="M4 16h16v2.5H4z"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/><path d="M7 12h10"/>',
  rear: '<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M4 11h3M17 11h3"/><rect x="9" y="12" width="6" height="3" rx=".5"/><path d="M6 17v2M18 17v2"/>',
  maker: '<path d="M3 20V10l5 3V10l5 3V6h4l1 14z"/><path d="M3 20h18"/>',
  emblem: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6.9 4M12 12l-6.9 4"/>',
  newer: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
};

const MODES = {
  name: { title: '車名当て', desc: '前から見た写真で車名を当てる', prompt: 'この車の名前は？' },
  rear: { title: '後ろ姿当て', desc: '信号待ちで見る後ろ姿から当てる', prompt: 'この後ろ姿、なんて車？' },
  maker: { title: 'メーカー当て', desc: 'どこのメーカーの車か当てる', prompt: 'この車のメーカーは？' },
  emblem: { title: 'エンブレム当て', desc: 'マークだけでメーカーを当てる', prompt: 'このエンブレムはどこのメーカー？' },
  newer: { title: '新型どっち？', desc: '同じ車の新型と旧型を見分ける', prompt: '' },
};

const DATA_URL = document.querySelector('meta[name="arenante:data"]')?.content || 'data/cars.json';

const $app = document.getElementById('app');
const $detail = document.getElementById('detail');

let data = null;
let star = Number(load('star')) || 2;

// ---------- utils ----------

function load(key) {
  try { return localStorage.getItem(`arenante:${key}`); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(`arenante:${key}`, value); } catch { /* 保存できない環境でも動かす */ }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sample = (arr, n) => shuffle(arr).slice(0, n);
const level = () => LEVELS.find((l) => l.star === star) ?? LEVELS[1];
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const group = (car) => (car.kind === '登録車' ? '登録車' : '軽');
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const ym = (s) => s?.replace(/^(\d{4})-0?(\d+)$/, '$1年$2月') ?? '';
const icon = (key) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;

function preload(url) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
}

function creditText(img) {
  return `写真: ${esc(img.artist)}${img.license ? ` / ${esc(img.license)}` : ''}`;
}

function photoHtml(img, { tag = '', revealCredit = false, alt = 'クイズの写真' } = {}) {
  if (!img) return `<div class="photo"><div class="noimg">写真なし</div></div>`;
  return `
    <div class="photo">
      <img src="${esc(img.url)}" crossorigin="anonymous" alt="${esc(alt)}" decoding="async">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <span class="credit" data-page="${esc(img.page)}">${revealCredit ? `<a href="${esc(img.page)}" target="_blank" rel="noopener">${creditText(img)}</a>` : creditText(img)}</span>
    </div>`;
}

// ロゴの社名部分を切り落として、マークだけを表示する
function emblemHtml(e) {
  const [x, y, w, h] = e.crop;
  const aspect = (w * e.image.width) / (h * e.image.height);
  const size = aspect >= 1 ? 'width:62%' : `width:${62 * aspect}%`;
  const pos = (start, len) => (len >= 1 ? 0 : (start / (1 - len)) * 100);
  return `
    <div class="emblem-stage">
      <div class="emblem" role="img" aria-label="エンブレム" style="${size};aspect-ratio:${aspect};background-image:url('${esc(e.image.url)}');background-size:${100 / w}% ${100 / h}%;background-position:${pos(x, w)}% ${pos(y, h)}%"></div>
    </div>`;
}

// ---------- 出題 ----------

function poolFor(mode) {
  const top = level().top;
  if (mode === 'emblem') return (data.emblems ?? []).filter((e) => star >= 3 || e.domestic);
  const cars = data.cars.filter((c) => c.gens?.length && c.rank <= top);
  if (mode === 'rear') return cars.filter((c) => c.gens[0].rear);
  if (mode === 'newer') return cars.filter((c) => c.gens.length >= 2 && c.gens[1].front?.url !== c.gens[0].front.url);
  return cars;
}

const questionCount = (mode) => Math.min(QUESTIONS, poolFor(mode).length);

// 選択肢は同じ区分（軽／登録車）から優先して選び、見た目で区別させる。
// 難易度が低いときはまず出題範囲の中から選ぶ
function distractors(answer, candidates, n, keyFn) {
  const seen = new Set([keyFn(answer)]);
  const out = [];
  const same = shuffle(candidates.filter((c) => group(c) === group(answer)));
  const rest = shuffle(candidates.filter((c) => group(c) !== group(answer)));
  for (const c of [...same, ...rest]) {
    const k = keyFn(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function buildQuestions(mode) {
  const pool = poolFor(mode);
  const n = questionCount(mode);

  if (mode === 'emblem') {
    const makers = pool.map((e) => e.maker);
    return sample(pool, n).map((e) => ({
      mode,
      emblem: e,
      choices: shuffle([e.maker, ...sample(makers.filter((m) => m !== e.maker), 3)]).map((m) => ({ label: m, correct: m === e.maker })),
    }));
  }

  const ranged = data.cars.filter((c) => c.gens?.length && c.rank <= Math.max(level().top, 20));
  const all = data.cars.filter((c) => c.gens?.length);
  return sample(pool, n).map((car) => {
    if (mode === 'newer') {
      const [newer, older] = car.gens;
      return { mode, car, sides: shuffle([{ gen: newer, isNew: true }, { gen: older, isNew: false }]) };
    }
    const keyFn = mode === 'maker' ? (c) => c.maker : (c) => c.name;
    let wrong = distractors(car, ranged, 3, keyFn);
    if (wrong.length < 3) wrong = distractors(car, all, 3, keyFn);
    const choices = shuffle([car, ...wrong]).map((c) => ({
      label: keyFn(c),
      sub: mode === 'maker' ? '' : c.maker,
      correct: keyFn(c) === keyFn(car),
    }));
    return { mode, car, choices, img: mode === 'rear' ? car.gens[0].rear : car.gens[0].front };
  });
}

// ---------- 画面: ホーム ----------

function renderHome() {
  setTab('home');
  $app.innerHTML = `
    <section class="hero">
      <div class="plate" aria-hidden="true">
        <span class="plate-top">街 500</span>
        <span class="plate-main"><small>く</small>39-63</span>
      </div>
      <h1>街でよく見る車、<br>いくつわかる？</h1>
      <p>最新の販売ランキング（${esc(ym(data.period.registered))}まで）から、いま日本の道を走っている車を出題します。データは毎月自動で更新。</p>
    </section>

    <h2 class="section-label">難易度</h2>
    <div class="levels" role="radiogroup" aria-label="難易度">
      ${LEVELS.map((l) => `
        <button class="level" role="radio" data-star="${l.star}" aria-checked="${l.star === star}">
          <span class="level-star">★${l.star}</span>
          <span class="level-name">${l.label}</span>
          <span class="level-top">TOP${l.top}</span>
        </button>`).join('')}
    </div>
    <p class="level-note">販売ランキング<b>${level().top}位まで</b>の車から出題${star >= 3 ? '・エンブレムは輸入車も' : '・エンブレムは国産のみ'}</p>

    <h2 class="section-label">モード</h2>
    <div class="modes">
      ${Object.entries(MODES).map(([key, m]) => {
        const count = questionCount(key);
        const best = load(`best:${key}:${star}`);
        const disabled = count < 4;
        return `
          <button class="mode" data-mode="${key}" ${disabled ? 'disabled' : ''}>
            <span class="mode-icon">${icon(key)}</span>
            <span class="mode-text"><b>${m.title}</b><small>${disabled ? 'この難易度では出題できません' : `${m.desc}・${count}問`}</small></span>
            <span class="best"><small>ベスト</small>${best ? `${best}<i>/${count}</i>` : '—'}</span>
          </button>`;
      }).join('')}
    </div>`;

  $app.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', () => {
    star = Number(b.dataset.star);
    save('star', star);
    renderHome();
  }));
  $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startQuiz(b.dataset.mode)));
}

// ---------- 画面: クイズ ----------

function startQuiz(mode) {
  renderQuestion({ mode, questions: buildQuestions(mode), index: 0, score: 0, wrong: [] });
  window.scrollTo({ top: 0 });
}

function questionImage(q) {
  return q.img?.url ?? q.sides?.[0].gen.front.url ?? q.emblem?.image.url;
}

function renderQuestion(state) {
  const q = state.questions[state.index];
  const m = MODES[q.mode];
  const total = state.questions.length;
  const next = state.questions[state.index + 1];
  if (next) preload(questionImage(next));

  let body;
  if (q.mode === 'newer') {
    body = `
      <p class="prompt">${esc(q.car.name)}<span>（${esc(q.car.maker)}）</span>の<br>新しいモデルはどっち？</p>
      <div class="pair">
        ${q.sides.map((s, i) => `
          <button class="pick" data-side="${i}" aria-label="${i === 0 ? 'A' : 'B'}の写真">
            ${photoHtml(s.gen.front, { tag: i === 0 ? 'A' : 'B' })}
            <span class="pick-label" data-label="${i}"></span>
          </button>`).join('')}
      </div>`;
  } else {
    const visual = q.mode === 'emblem' ? emblemHtml(q.emblem) : photoHtml(q.img, { tag: q.mode === 'rear' ? '後ろ姿' : '' });
    body = `
      <p class="prompt">${m.prompt}</p>
      ${visual}
      <div class="choices">
        ${q.choices.map((c, i) => `<button class="choice" data-choice="${i}"><span>${esc(c.label)}</span>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button>`).join('')}
      </div>`;
  }

  $app.innerHTML = `
    <div class="quiz-head">
      <button class="quit" data-go="home" aria-label="やめてホームに戻る">✕</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${state.index}">
        ${state.questions.map((_, i) => `<i class="${i < state.index ? (state.wrong.includes(state.questions[i]) ? 'ng' : 'ok') : i === state.index ? 'now' : ''}"></i>`).join('')}
      </div>
      <span class="counter">${state.index + 1}<small>/${total}</small></span>
    </div>
    <div class="quiz-meta">${m.title}・<span class="stars">${stars(star)}</span></div>
    ${body}
    <div id="after"></div>`;

  if (q.mode === 'newer') {
    $app.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
      const picked = q.sides[Number(b.dataset.side)];
      $app.querySelectorAll('[data-side]').forEach((el, i) => {
        el.disabled = true;
        el.classList.add(q.sides[i].isNew ? 'is-correct' : 'is-wrong');
        $app.querySelector(`[data-label="${i}"]`).textContent = `${q.sides[i].isNew ? '新型' : '旧型'}｜${q.sides[i].gen.label}`;
      });
      answer(state, picked.isNew);
    }));
  } else {
    $app.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      const picked = q.choices[Number(b.dataset.choice)];
      $app.querySelectorAll('[data-choice]').forEach((el, i) => {
        el.disabled = true;
        if (q.choices[i].correct) el.classList.add('is-correct');
        else if (q.choices[i] === picked) el.classList.add('is-wrong');
      });
      answer(state, picked.correct);
    }));
  }
}

function answer(state, ok) {
  const q = state.questions[state.index];
  if (ok) state.score++;
  else state.wrong.push(q);

  // 回答後は写真のクレジットをリンクにする（回答前は答えが分かってしまうので文字だけ）
  $app.querySelectorAll('.photo .credit').forEach((el) => {
    el.innerHTML = `<a href="${esc(el.dataset.page)}" target="_blank" rel="noopener">${el.innerHTML}</a>`;
  });

  const isLast = state.index === state.questions.length - 1;
  let info;
  if (q.mode === 'emblem') {
    const e = q.emblem;
    info = `<p><b>${esc(e.maker)}</b>${e.domestic ? '（国産）' : '（輸入車）'}</p>
      <p class="fine"><a href="${esc(e.image.page)}" target="_blank" rel="noopener">ロゴ: Wikimedia Commons（${esc(e.image.license || 'パブリックドメイン')}）</a></p>`;
  } else {
    const car = q.car;
    info = `<p><b>${esc(car.maker)} ${esc(car.name)}</b><span class="kind kind-${group(car) === '軽' ? 'kei' : 'reg'}">${esc(car.kind)}</span></p>
      <p class="fine">販売ランキング${car.rank}位${q.mode !== 'newer' ? `・${esc(car.gens[0].label)}` : ''}</p>
      <button class="link-btn" data-detail="${esc(car.id)}">この車をくわしく見る →</button>`;
  }

  document.getElementById('after').innerHTML = `
    <div class="feedback ${ok ? 'ok' : 'ng'}">
      <div class="verdict">${ok ? '正解！' : '残念…'}</div>
      ${info}
    </div>
    <button class="btn block" id="next">${isLast ? '結果を見る' : '次の問題へ'}</button>`;
  const $next = document.getElementById('next');
  $next.addEventListener('click', () => {
    if (isLast) renderResult(state);
    else { state.index++; renderQuestion(state); window.scrollTo({ top: 0 }); }
  });
  $next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $next.focus({ preventScroll: true });
}

function renderResult(state) {
  const { mode, score, questions } = state;
  const total = questions.length;
  const bestKey = `best:${mode}:${star}`;
  const prevBest = Number(load(bestKey)) || 0;
  const isBest = score > prevBest;
  if (isBest) save(bestKey, score);
  const rate = score / total;
  const msg = rate === 1 ? '全問正解！次の難易度に挑戦しよう' : rate >= 0.7 ? 'かなり詳しい！' : rate >= 0.4 ? 'いい調子。図鑑で復習しよう' : 'まずは図鑑で上位の車から覚えよう';
  const canLevelUp = rate === 1 && star < 5;

  const wrongCars = state.wrong.filter((q) => q.car).map((q) => q.car);
  const wrongEmblems = state.wrong.filter((q) => q.emblem).map((q) => q.emblem);

  $app.innerHTML = `
    <section class="result">
      <div class="quiz-meta">${MODES[mode].title}・<span class="stars">${stars(star)}</span></div>
      <div class="score">${score}<small>/${total}</small></div>
      ${isBest ? '<div class="badge">自己ベスト更新</div>' : ''}
      <p class="msg">${msg}</p>
      <div class="actions">
        ${canLevelUp ? `<button class="btn" id="levelup">★${star + 1}に挑戦</button>` : `<button class="btn" id="retry">もう一回</button>`}
        <button class="btn secondary" data-go="home">モードを選ぶ</button>
      </div>
    </section>
    ${wrongCars.length ? `
      <section class="review">
        <h2 class="section-label">まちがえた車</h2>
        <div class="grid">${wrongCars.map(cardHtml).join('')}</div>
      </section>` : ''}
    ${wrongEmblems.length ? `
      <section class="review">
        <h2 class="section-label">まちがえたエンブレム</h2>
        <div class="emblem-grid">${wrongEmblems.map((e) => `<div class="emblem-card">${emblemHtml(e)}<b>${esc(e.maker)}</b></div>`).join('')}</div>
      </section>` : ''}`;
  document.getElementById('retry')?.addEventListener('click', () => startQuiz(mode));
  document.getElementById('levelup')?.addEventListener('click', () => {
    star++;
    save('star', star);
    startQuiz(mode);
  });
  window.scrollTo({ top: 0 });
}

// ---------- 画面: 図鑑 ----------

function cardHtml(car) {
  const img = car.gens?.[0]?.front;
  return `
    <button class="card" data-detail="${esc(car.id)}">
      <span class="thumb">
        ${img ? `<img src="${esc(img.url)}" crossorigin="anonymous" alt="" loading="lazy" decoding="async">` : '<span class="noimg">写真なし</span>'}
        <span class="rank">${car.rank}</span>
      </span>
      <span class="meta">
        <b>${esc(car.name)}</b>
        <small>${esc(car.maker)}<span class="kind kind-${group(car) === '軽' ? 'kei' : 'reg'}">${esc(car.kind)}</span></small>
      </span>
    </button>`;
}

const zukanFilter = { q: '', kind: 'all' };

function renderZukan() {
  setTab('zukan');
  const kinds = [['all', 'すべて'], ['登録車', '登録車'], ['軽自動車', '軽'], ['軽貨物', '軽貨物']];
  $app.innerHTML = `
    <section class="zukan-head">
      <h1>図鑑</h1>
      <p>販売ランキング上位${data.cars.length}車種。タップすると世代ごとの写真が見られます。</p>
    </section>
    <input class="search" type="search" placeholder="車名・メーカーで探す" value="${esc(zukanFilter.q)}" aria-label="検索">
    <div class="chips" role="group" aria-label="区分">
      ${kinds.map(([k, label]) => `<button class="chip" data-kind="${k}" aria-pressed="${zukanFilter.kind === k}">${label}</button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>`;

  const draw = () => {
    const q = zukanFilter.q.trim().toLowerCase();
    const list = data.cars.filter((c) =>
      (zukanFilter.kind === 'all' || c.kind === zukanFilter.kind) &&
      (!q || `${c.name} ${c.maker} ${(c.aliases ?? []).join(' ')}`.toLowerCase().includes(q)));
    document.getElementById('grid').innerHTML = list.length ? list.map(cardHtml).join('') : '<p class="empty">見つかりませんでした</p>';
  };
  $app.querySelector('.search').addEventListener('input', (e) => { zukanFilter.q = e.target.value; draw(); });
  $app.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    zukanFilter.kind = b.dataset.kind;
    $app.querySelectorAll('[data-kind]').forEach((el) => el.setAttribute('aria-pressed', el === b));
    draw();
  }));
  draw();
}

function openDetail(id) {
  const car = data.cars.find((c) => c.id === id);
  if (!car) return;
  const aliases = (car.aliases ?? []).filter((a) => a !== car.name);
  const month = ym(car.kind === '登録車' ? data.period.registered : data.period.kei);
  $detail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(car.name)}</h2>
        <p class="sub">${esc(car.maker)}<span class="kind kind-${group(car) === '軽' ? 'kei' : 'reg'}">${esc(car.kind)}</span></p>
      </div>
      <button class="close" aria-label="閉じる">✕</button>
    </div>
    <div class="detail-body">
      ${aliases.length ? `<p class="fine">販売名: ${aliases.map(esc).join('、')}</p>` : ''}
      <div class="stats">
        <div><b>${car.rank}<small>位</small></b><span>販売ランキング</span></div>
        <div><b>${fmt(car.units)}</b><span>直近2年の台数</span></div>
        <div><b>${fmt(car.latestMonth)}</b><span>${esc(month)}の台数</span></div>
      </div>
      ${(car.gens ?? []).map((g, i) => `
        <div class="gen">
          <h3><span>${['最新モデル', 'ひとつ前', 'ふたつ前'][i]}</span>${esc(g.label)}</h3>
          <div class="pair">
            ${photoHtml(g.front, { tag: '前', revealCredit: true, alt: `${car.name} ${g.label} 前から` })}
            ${g.rear ? photoHtml(g.rear, { tag: '後ろ', revealCredit: true, alt: `${car.name} ${g.label} 後ろから` }) : ''}
          </div>
        </div>`).join('')}
      ${car.wiki ? `<a class="btn secondary block" href="${esc(car.wiki)}" target="_blank" rel="noopener">Wikipediaで読む</a>` : ''}
    </div>`;
  $detail.querySelector('.close').addEventListener('click', () => $detail.close());
  $detail.showModal();
  $detail.scrollTop = 0;
}

// ---------- 共通 ----------

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.go === name ? 'page' : 'false'));
}

function go(name) {
  if (name === 'zukan') renderZukan();
  else renderHome();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { go(goEl.dataset.go); return; }
  const detailEl = e.target.closest('[data-detail]');
  if (detailEl) { openDetail(detailEl.dataset.detail); return; }
  if (e.target === $detail) $detail.close(); // 背景タップで閉じる
});

function renderFooter() {
  const updated = new Date(data.updatedAt).toLocaleDateString('ja-JP');
  document.getElementById('footer').innerHTML = `
    <p>データ更新 ${esc(updated)}｜登録車 ${esc(ym(data.period.registered))}・軽自動車 ${esc(ym(data.period.kei))}までの販売台数</p>
    <p>ランキングは直近2年の同じ期間（1月〜最新月）の新車販売台数の合計です。毎月自動で更新されます。</p>
    <p>出典: ${data.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join('、')}</p>
    <p>写真・ロゴは Wikimedia Commons のもので、各作者のライセンス（CC BY-SA など）に従って掲載しています。ロゴは各社の商標です。</p>`;
}

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $app.innerHTML = '<p class="empty">データを読み込めませんでした。通信状況を確認して再読み込みしてください。</p>';
    return;
  }
  renderFooter();
  go(location.hash === '#zukan' ? 'zukan' : 'home');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
