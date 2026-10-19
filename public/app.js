// あれなんて車？ — 見た目は日本の道路標識（案内標識の青・緑、ヘキサ、おにぎり、補助標識）を手本にしている
const QUESTIONS = 10;

// 難易度＝販売ランキングの何位までを出題するか
const LEVELS = [
  { star: 1, top: 10, label: 'はじめて', en: 'Beginner' },
  { star: 2, top: 20, label: 'ふつう', en: 'Normal' },
  { star: 3, top: 40, label: 'くわしい', en: 'Expert' },
  { star: 4, top: 70, label: 'マニア', en: 'Maniac' },
  { star: 5, top: 100, label: '鬼', en: 'Insane' },
];

// arrow は方面案内標識の矢印の向き（度）
const MODES = {
  name: { title: '車名当て', en: 'Car Name', desc: '前から見た写真で車名を当てる', prompt: 'この車の名前は？', arrow: 0 },
  rear: { title: '後ろ姿当て', en: 'Rear View', desc: '信号待ちで見る後ろ姿から当てる', prompt: 'この後ろ姿、なんて車？', arrow: 45 },
  maker: { title: 'メーカー当て', en: 'Maker', desc: 'どこのメーカーの車か当てる', prompt: 'この車のメーカーは？', arrow: 90 },
  emblem: { title: 'エンブレム当て', en: 'Emblem', desc: 'マークだけでメーカーを当てる', prompt: 'このエンブレムはどこのメーカー？', arrow: -45 },
  newer: { title: '新型どっち？', en: 'New or Old', desc: '同じ車の新型と旧型を見分ける', prompt: '', arrow: -90 },
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
const group = (car) => (car.kind === '登録車' ? '登録車' : '軽');
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const ym = (s) => s?.replace(/^(\d{4})-0?(\d+)$/, '$1年$2月') ?? '';

function preload(url) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
}

// ---------- 標識のパーツ（SVG） ----------

// 都道府県道の路線番号標識「ヘキサ」
const hexa = (n) => `
  <svg class="hexa" viewBox="0 0 64 56" aria-hidden="true">
    <path d="M17 2h30l15 26-15 26H17L2 28z" class="hexa-plate"/>
    <path d="M19.3 6h25.4L57.4 28 44.7 50H19.3L6.6 28z" class="hexa-line"/>
    <text x="32" y="38.5" text-anchor="middle">${n}</text>
  </svg>`;

// 国道の路線番号標識「おにぎり」
const onigiri = (n) => `
  <svg class="onigiri" viewBox="0 0 60 60" aria-hidden="true">
    <path d="M5 3h50c2.5 0 3.6 2 3 4.4L50 38C46 52 38 58 30 58S14 52 10 38L2 7.4C1.4 5 2.5 3 5 3z" class="onigiri-plate"/>
    <path d="M8 7h44l-7.3 29.6C41.4 48.4 35.6 53.5 30 53.5S18.6 48.4 15.3 36.6z" class="onigiri-line"/>
    <text x="30" y="${String(n).length > 2 ? 37 : 39}" text-anchor="middle" style="font-size:${String(n).length > 2 ? 19 : 24}px">${n}</text>
  </svg>`;

// 方面案内標識の矢印
const arrow = (deg) => `
  <svg class="sign-arrow" viewBox="0 0 40 40" style="transform:rotate(${deg}deg)" aria-hidden="true">
    <path d="M20 3 33 18h-8.5v19h-9V18H7z"/>
  </svg>`;

// 走る車のシルエット（右向き）
const CAR_SHAPES = {
  sedan: { w: 100, body: 'M3 31v-6c0-3 2-5 7-5.6L29 18l11-8.4c1.5-1.1 3.2-1.6 5-1.6h19c2.3 0 4.3.9 5.8 2.6L78 18l13.6 2.2c3.5.6 5.4 2.6 5.4 5.6V31z', wheels: [22, 79], r: 6.2 },
  kei: { w: 84, body: 'M4 31V9.5C4 6.5 6 5 9 5h47.5c2.6 0 4.6 1 6 3.1L71 19l7 1.6c2.4.6 3.5 2.2 3.5 4.6V31z', wheels: [19, 66], r: 5.8 },
  truck: { w: 100, body: 'M4 31V10c0-3 1.8-4.6 4.6-4.6h17c2.3 0 3.9 1 4.8 3.2L34 18h62v13z', wheels: [17, 82], r: 5.8 },
  suv: { w: 100, body: 'M3 31v-9c0-3 2-4.6 6-5.3l13-2L30 7c1.1-1 2.5-1.5 4-1.5h38c2.1 0 3.7.8 4.8 2.5L82 15l10 1.6c3.3.6 5 2.5 5 5.4V31z', wheels: [23, 78], r: 6.6 },
};
const car = (type) => {
  const s = CAR_SHAPES[type];
  return `<svg class="car car-${type}" viewBox="0 0 ${s.w} 40" aria-hidden="true">
    <path d="${s.body}"/>
    ${s.wheels.map((x) => `<circle cx="${x}" cy="31" r="${s.r + 1.6}" class="car-gap"/><circle cx="${x}" cy="31" r="${s.r}"/>`).join('')}
  </svg>`;
};

// センターラインの上を車が走る区切り線
const roadDivider = () => `
  <div class="road-divider" aria-hidden="true">
    <div class="lane">
      <span class="runner" style="--d:0s;--t:17s">${car('kei')}</span>
      <span class="runner" style="--d:-6s;--t:21s">${car('sedan')}</span>
      <span class="runner" style="--d:-11s;--t:15s">${car('truck')}</span>
      <span class="runner" style="--d:-14s;--t:24s">${car('suv')}</span>
    </div>
  </div>`;

// 案内標識の見出し（日本語＋小さいローマ字）
const signLabel = (ja, en, tone = 'blue') => `
  <h2 class="sign-label ${tone}"><span class="ja">${ja}</span><span class="en">${en}</span></h2>`;

function photoHtml(img, { tag = '', revealCredit = false, alt = 'クイズの写真' } = {}) {
  if (!img) return `<div class="photo"><div class="noimg">写真なし</div></div>`;
  const credit = `写真: ${esc(img.artist)}${img.license ? ` / ${esc(img.license)}` : ''}`;
  return `
    <div class="photo">
      <img src="${esc(img.url)}" crossorigin="anonymous" alt="${esc(alt)}" decoding="async">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <span class="credit" data-page="${esc(img.page)}">${revealCredit ? `<a href="${esc(img.page)}" target="_blank" rel="noopener">${credit}</a>` : credit}</span>
    </div>`;
}

// ロゴの社名部分を切り落として、マークだけを表示する
function emblemHtml(e) {
  const [x, y, w, h] = e.crop;
  const aspect = (w * e.image.width) / (h * e.image.height);
  const size = aspect >= 1 ? 'width:58%' : `width:${58 * aspect}%`;
  const pos = (start, len) => (len >= 1 ? 0 : (start / (1 - len)) * 100);
  return `
    <div class="emblem-stage">
      <div class="emblem" role="img" aria-label="エンブレム" style="${size};aspect-ratio:${aspect};background-image:url('${esc(e.image.url)}');background-size:${100 / w}% ${100 / h}%;background-position:${pos(x, w)}% ${pos(y, h)}%"></div>
    </div>`;
}

const kindPlate = (c) => `<span class="kind kind-${group(c) === '軽' ? 'kei' : 'reg'}">${esc(c.kind)}</span>`;

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

// 選択肢は同じ区分（軽／登録車）から優先して選び、見た目で区別させる
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
  return sample(pool, n).map((c) => {
    if (mode === 'newer') {
      const [newer, older] = c.gens;
      return { mode, car: c, sides: shuffle([{ gen: newer, isNew: true }, { gen: older, isNew: false }]) };
    }
    const keyFn = mode === 'maker' ? (x) => x.maker : (x) => x.name;
    let wrong = distractors(c, ranged, 3, keyFn);
    if (wrong.length < 3) wrong = distractors(c, all, 3, keyFn);
    const choices = shuffle([c, ...wrong]).map((x) => ({
      label: keyFn(x),
      sub: mode === 'maker' ? '' : x.maker,
      correct: keyFn(x) === keyFn(c),
    }));
    return { mode, car: c, choices, img: mode === 'rear' ? c.gens[0].rear : c.gens[0].front };
  });
}

// ---------- 画面: ホーム ----------

function renderHome() {
  setTab('home');
  const lv = level();
  $app.innerHTML = `
    <section class="hero">
      <div class="guide green">
        <p class="guide-kicker">街でよく見る車クイズ<span>City Car Quiz</span></p>
        <h1>あれなんて車？</h1>
        <p class="guide-en">What car is that?</p>
      </div>
      <div class="aux-plate">${esc(ym(data.period.registered))}の販売ランキングで出題</div>
      <p class="hero-text">新車の販売台数が多い順に、いま日本の道を走っている車を出題します。データは毎月自動で更新。</p>
    </section>

    ${roadDivider()}

    ${signLabel('難易度', 'Difficulty')}
    <div class="levels" role="radiogroup" aria-label="難易度">
      ${LEVELS.map((l) => `
        <button class="level" role="radio" data-star="${l.star}" aria-checked="${l.star === star}" aria-label="難易度${l.star} ${l.label} ランキング${l.top}位まで">
          ${hexa(l.star)}
          <span class="level-name">${l.label}</span>
          <span class="level-top">TOP ${l.top}</span>
        </button>`).join('')}
    </div>
    <p class="level-note">販売ランキング <b>${lv.top}位</b> までの車が出ます${star >= 3 ? '。エンブレムは輸入車も出ます' : '。エンブレムは国産のみ'}</p>

    ${signLabel('モード', 'Mode')}
    <div class="modes">
      ${Object.entries(MODES).map(([key, m]) => {
        const count = questionCount(key);
        const best = load(`best:${key}:${star}`);
        const disabled = count < 4;
        return `
          <button class="mode" data-mode="${key}" ${disabled ? 'disabled' : ''}>
            <span class="mode-sign">
              ${arrow(m.arrow)}
              <span class="mode-text"><b>${m.title}</b><i>${m.en}</i></span>
            </span>
            <span class="mode-aux">
              <span>${disabled ? 'この難易度では出題できません' : `${m.desc}・${count}問`}</span>
              <span class="best">ベスト <b>${best ?? '–'}</b>${best ? `<small>/${count}</small>` : ''}</span>
            </span>
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
  renderQuestion({ mode, questions: buildQuestions(mode), index: 0, score: 0, results: [] });
  window.scrollTo({ top: 0 });
}

function questionImage(q) {
  return q.img?.url ?? q.sides?.[0].gen.front.url ?? q.emblem?.image.url;
}

// 進み具合: 道路の上を車がゴールに向かって進む
function progressRoad(state) {
  const total = state.questions.length;
  const pct = (state.index / total) * 100;
  return `
    <div class="progress-road" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${state.index}" aria-label="${state.index + 1}問目 / 全${total}問">
      <div class="progress-marks">${state.questions.map((_, i) => `<i class="${state.results[i] === true ? 'ok' : state.results[i] === false ? 'ng' : ''}"></i>`).join('')}</div>
      <span class="progress-car" style="left:calc(${pct}% * 0.9)">${car('kei')}</span>
      <span class="goal" aria-hidden="true"></span>
    </div>`;
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
      <p class="prompt">${esc(q.car.maker)} ${esc(q.car.name)} の<br>新しいモデルはどっち？</p>
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
      <button class="quit" data-go="home" aria-label="やめてホームに戻る">やめる</button>
      <span class="quiz-meta">${m.title}<span class="mini-hexa">${hexa(star)}</span></span>
      <span class="counter"><b>${state.index + 1}</b> / ${total}</span>
    </div>
    ${progressRoad(state)}
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
  state.results[state.index] = ok;
  $app.querySelector(`.progress-marks i:nth-child(${state.index + 1})`)?.classList.add(ok ? 'ok' : 'ng');

  // 回答後は写真のクレジットをリンクにする（回答前は答えが分かってしまうので文字だけ）
  $app.querySelectorAll('.photo .credit').forEach((el) => {
    el.innerHTML = `<a href="${esc(el.dataset.page)}" target="_blank" rel="noopener">${el.innerHTML}</a>`;
  });

  const isLast = state.index === state.questions.length - 1;
  let info;
  if (q.mode === 'emblem') {
    const e = q.emblem;
    info = `<p class="answer-name">${esc(e.maker)}<small>${e.domestic ? '国産' : '輸入車'}</small></p>
      <p class="fine"><a href="${esc(e.image.page)}" target="_blank" rel="noopener">ロゴ: Wikimedia Commons（${esc(e.image.license || 'パブリックドメイン')}）</a></p>`;
  } else {
    const c = q.car;
    info = `<p class="answer-name">${esc(c.maker)} ${esc(c.name)}${kindPlate(c)}</p>
      <p class="fine">販売ランキング ${c.rank}位${q.mode !== 'newer' ? `　${esc(c.gens[0].label)}` : ''}</p>
      <button class="link-btn" data-detail="${esc(c.id)}">この車をくわしく見る</button>`;
  }

  // 正解は指示標識（青）、不正解は警戒標識（黄色のひし形）
  document.getElementById('after').innerHTML = `
    <div class="feedback ${ok ? 'ok' : 'ng'}">
      <div class="verdict">
        ${ok ? '<span class="verdict-sign ok-sign" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M9 21l7.5 7.5L31 13"/></svg></span>' : '<span class="verdict-sign ng-sign" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 11v13M20 29v.5"/></svg></span>'}
        <span><b>${ok ? '正解' : '残念'}</b><i>${ok ? 'Correct' : 'Wrong'}</i></span>
      </div>
      ${info}
    </div>
    <button class="exit-btn" id="next"><span><b>${isLast ? '結果を見る' : '次の問題へ'}</b><i>${isLast ? 'Result' : 'Next'}</i></span>${arrow(90)}</button>`;
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
  const msg = rate === 1 ? '全問正解。次の難易度へどうぞ' : rate >= 0.7 ? 'かなり詳しい' : rate >= 0.4 ? 'いい調子。図鑑で復習しよう' : 'まずは図鑑で上位の車から覚えよう';
  const canLevelUp = rate === 1 && star < 5;

  const wrong = questions.filter((_, i) => state.results[i] === false);
  const wrongCars = wrong.filter((q) => q.car).map((q) => q.car);
  const wrongEmblems = wrong.filter((q) => q.emblem).map((q) => q.emblem);

  $app.innerHTML = `
    <section class="result">
      <div class="guide green result-sign">
        <p class="guide-kicker">${MODES[mode].title}<span>${MODES[mode].en}</span></p>
        <div class="score"><b>${score}</b><small>/ ${total}</small></div>
        <p class="guide-en">${state.results.map((r) => (r ? '●' : '○')).join(' ')}</p>
      </div>
      <div class="aux-plate">${isBest ? '自己ベスト更新　' : ''}${msg}</div>
      <div class="actions">
        ${canLevelUp
          ? `<button class="exit-btn" id="levelup"><span><b>難易度${star + 1}に挑戦</b><i>Level up</i></span>${arrow(90)}</button>`
          : `<button class="exit-btn" id="retry"><span><b>もう一回</b><i>Retry</i></span>${arrow(90)}</button>`}
        <button class="board-btn" data-go="home">モードを選ぶ</button>
      </div>
    </section>
    ${wrongCars.length ? `
      ${signLabel('まちがえた車', 'Review')}
      <div class="grid">${wrongCars.map(cardHtml).join('')}</div>` : ''}
    ${wrongEmblems.length ? `
      ${signLabel('まちがえたエンブレム', 'Review')}
      <div class="emblem-grid">${wrongEmblems.map((e) => `<div class="emblem-card">${emblemHtml(e)}<b>${esc(e.maker)}</b></div>`).join('')}</div>` : ''}`;
  document.getElementById('retry')?.addEventListener('click', () => startQuiz(mode));
  document.getElementById('levelup')?.addEventListener('click', () => {
    star++;
    save('star', star);
    startQuiz(mode);
  });
  window.scrollTo({ top: 0 });
}

// ---------- 画面: 図鑑 ----------

function cardHtml(c) {
  const img = c.gens?.[0]?.front;
  return `
    <button class="card" data-detail="${esc(c.id)}">
      <span class="thumb">
        ${img ? `<img src="${esc(img.url)}" crossorigin="anonymous" alt="" loading="lazy" decoding="async">` : '<span class="noimg">写真なし</span>'}
        <span class="rank" aria-label="${c.rank}位">${onigiri(c.rank)}</span>
      </span>
      <span class="meta">
        <b>${esc(c.name)}</b>
        <small>${esc(c.maker)}${kindPlate(c)}</small>
      </span>
    </button>`;
}

const zukanFilter = { q: '', kind: 'all' };

function renderZukan() {
  setTab('zukan');
  const kinds = [['all', 'すべて'], ['登録車', '登録車'], ['軽自動車', '軽'], ['軽貨物', '軽貨物']];
  $app.innerHTML = `
    <div class="guide blue zukan-sign">
      <h1>図鑑</h1>
      <p class="guide-en">Car Index — Top ${data.cars.length}</p>
    </div>
    <p class="hero-text">販売ランキング上位${data.cars.length}車種。タップすると世代ごとの写真が見られます。</p>
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
  const c = data.cars.find((x) => x.id === id);
  if (!c) return;
  const aliases = (c.aliases ?? []).filter((a) => a !== c.name);
  const month = ym(c.kind === '登録車' ? data.period.registered : data.period.kei);
  $detail.innerHTML = `
    <div class="detail-head">
      <span class="rank">${onigiri(c.rank)}</span>
      <div class="detail-title">
        <h2>${esc(c.name)}</h2>
        <p>${esc(c.maker)}${kindPlate(c)}</p>
      </div>
      <button class="close" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>
    <div class="detail-body">
      ${aliases.length ? `<p class="fine">販売名: ${aliases.map(esc).join('、')}</p>` : ''}
      <dl class="stats">
        <div><dt>販売ランキング</dt><dd>${c.rank}<small>位</small></dd></div>
        <div><dt>直近2年の台数</dt><dd>${fmt(c.units)}</dd></div>
        <div><dt>${esc(month)}</dt><dd>${fmt(c.latestMonth)}</dd></div>
      </dl>
      ${(c.gens ?? []).map((g, i) => `
        <section class="gen">
          <h3><span>${['最新モデル', 'ひとつ前', 'ふたつ前'][i]}</span>${esc(g.label)}</h3>
          <div class="pair">
            ${photoHtml(g.front, { tag: '前', revealCredit: true, alt: `${c.name} ${g.label} 前から` })}
            ${g.rear ? photoHtml(g.rear, { tag: '後ろ', revealCredit: true, alt: `${c.name} ${g.label} 後ろから` }) : ''}
          </div>
        </section>`).join('')}
      ${c.wiki ? `<a class="board-btn block" href="${esc(c.wiki)}" target="_blank" rel="noopener">Wikipediaで読む</a>` : ''}
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
    ${roadDivider()}
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
