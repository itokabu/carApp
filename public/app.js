// あれなんて車？
// ホーム・図鑑は日本の道路標識（案内標識・ヘキサ・おにぎり・補助標識）、
// クイズ画面は運転免許の学科試験（問題用紙・マークシート・赤ペンの採点）を手本にしている
const QUESTIONS = 10;

// 難易度＝販売ランキングの何位から何位までを出題するか（上の難易度ほど街で見かけにくい車）
const LEVELS = [
  { star: 1, from: 1, to: 10, label: 'はじめて' },
  { star: 2, from: 11, to: 25, label: 'ふつう' },
  { star: 3, from: 26, to: 45, label: 'くわしい' },
  { star: 4, from: 46, to: 70, label: 'マニア' },
  { star: 5, from: 71, to: 100, label: '鬼' },
];

// arrow は方面案内標識の矢印の向き（度）
const MODES = {
  name: { title: '車名当て', desc: '前から見た写真で当てる', prompt: 'この車の名前はどれか。', arrow: 0 },
  rear: { title: '後ろ姿当て', desc: '信号待ちの後ろ姿で当てる', prompt: 'この後ろ姿の車の名前はどれか。', arrow: 45 },
  maker: { title: 'メーカー当て', desc: 'どこのメーカーか当てる', prompt: 'この車のメーカーはどれか。', arrow: 90 },
  emblem: { title: 'エンブレム当て', desc: 'マークだけで当てる', prompt: 'このエンブレムのメーカーはどれか。', arrow: -45 },
  newer: { title: '新型どっち？', desc: '新型と旧型を見分ける', prompt: '', arrow: -90 },
};

const DATA_URL = document.querySelector('meta[name="arenante:data"]')?.content || 'data/cars.json';

const $app = document.getElementById('app');
const $detail = document.getElementById('detail');
const $lightbox = document.getElementById('lightbox');

let data = null;
let star = Number(load('star')) || 1;
let quiz = null; // 出題中の状態（キーボード操作用）

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
const level = () => LEVELS.find((l) => l.star === star) ?? LEVELS[0];
const group = (car) => (car.kind === '登録車' ? '登録車' : '軽');
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const ym = (s) => s?.replace(/^(\d{4})-0?(\d+)$/, '$1年$2月') ?? '';
const MARKS = ['①', '②', '③', '④'];

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

// 案内標識の見出し
const signLabel = (text, tone = 'blue') => `<h2 class="sign-label ${tone}">${text}</h2>`;

// 赤ペンの採点（丸・バツ）
const RED_CIRCLE = '<svg class="redpen" viewBox="0 0 100 100" aria-hidden="true"><path d="M52 8C26 6 9 25 10 50c1 24 20 41 43 40 23-1 38-19 37-41C89 26 72 9 47 12"/></svg>';
const RED_CROSS = '<svg class="redpen" viewBox="0 0 100 100" aria-hidden="true"><path d="M18 16 84 86M82 14 20 84"/></svg>';

const ZOOM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';

// 写真。タップで全体を拡大表示できる（クイズ中は答えが分からないよう、拡大画面にも車名は出さない）
function photoHtml(img, { tag = '', revealCredit = false, alt = 'クイズの写真', caption = '' } = {}) {
  if (!img) return `<div class="photo"><div class="noimg">写真なし</div></div>`;
  const credit = `写真: ${esc(img.artist)}${img.license ? ` / ${esc(img.license)}` : ''}`;
  return `
    <div class="photo">
      <img src="${esc(img.url)}" crossorigin="anonymous" alt="${esc(alt)}" decoding="async">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <button class="zoom" data-zoom="${esc(img.url)}" data-page="${esc(img.page)}" data-credit="${credit}" data-caption="${esc(caption)}" aria-label="写真を拡大">${ZOOM}</button>
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

const inLevel = (c, lv = level()) => c.rank >= lv.from && c.rank <= lv.to;

function poolFor(mode) {
  if (mode === 'emblem') {
    const all = data.emblems ?? [];
    if (star <= 2) return all.filter((e) => e.domestic);
    if (star === 3) return all;
    return all.filter((e) => !e.domestic);
  }
  const cars = data.cars.filter((c) => c.gens?.length && inLevel(c));
  if (mode === 'rear') return cars.filter((c) => c.gens[0].rear);
  if (mode === 'newer') return cars.filter((c) => c.gens.length >= 2 && c.gens[1].front?.url !== c.gens[0].front.url);
  return cars;
}

const questionCount = (mode) => Math.min(QUESTIONS, poolFor(mode).length);

// 外れの選択肢は、正解に近い順位の車から選ぶ（鬼ならほかの選択肢もマイナーな車になる）。
// 同じ区分（軽／登録車）を優先して、見た目で区別させる
function distractors(answer, n, keyFn) {
  const all = data.cars.filter((c) => c.gens?.length);
  const byDistance = (c) => Math.abs(c.rank - answer.rank) + Math.random() * 12;
  const ordered = [...all].sort((a, b) => byDistance(a) - byDistance(b));
  const pick = (list) => {
    const seen = new Set([keyFn(answer)]);
    const out = [];
    for (const c of list) {
      if (seen.has(keyFn(c))) continue;
      seen.add(keyFn(c));
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  };
  const same = pick(ordered.filter((c) => group(c) === group(answer)));
  return same.length === n ? same : [...same, ...pick(ordered.filter((c) => !same.includes(c)))].slice(0, n);
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

  return sample(pool, n).map((c) => {
    if (mode === 'newer') {
      const [newer, older] = c.gens;
      return { mode, car: c, sides: shuffle([{ gen: newer, isNew: true }, { gen: older, isNew: false }]) };
    }
    const keyFn = mode === 'maker' ? (x) => x.maker : (x) => x.name;
    const choices = shuffle([c, ...distractors(c, 3, keyFn)]).map((x) => ({
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
  quiz = null;
  const lv = level();
  $app.innerHTML = `
    <section class="hero">
      <div class="guide green">
        <p class="guide-kicker">街でよく見る車クイズ</p>
        <h1>あれなんて車？</h1>
      </div>
      <div class="aux-plate">${esc(ym(data.period.registered))}の販売ランキングで出題</div>
      <p class="hero-text">新車の販売台数が多い車ほど、街でよく見かける車。いま日本の道を走っている車を、ランキングをもとに出題します。データは毎月自動で更新。</p>
    </section>

    ${roadDivider()}

    ${signLabel('難易度')}
    <div class="levels" role="radiogroup" aria-label="難易度">
      ${LEVELS.map((l) => `
        <button class="level" role="radio" data-star="${l.star}" aria-checked="${l.star === star}" aria-label="難易度${l.star} ${l.label} ランキング${l.from}位から${l.to}位">
          ${hexa(l.star)}
          <span class="level-name">${l.label}</span>
          <span class="level-top">${l.from}〜${l.to}位</span>
        </button>`).join('')}
    </div>
    <p class="level-note">販売ランキング <b>${lv.from}〜${lv.to}位</b> の車が出ます。エンブレムは${star <= 2 ? '国産のみ' : star === 3 ? '国産と輸入車' : '輸入車のみ'}</p>

    ${signLabel('モード')}
    <div class="modes">
      ${Object.entries(MODES).map(([key, m]) => {
        const count = questionCount(key);
        const best = load(`best:${key}:${star}`);
        const disabled = count < 4;
        return `
          <button class="mode" data-mode="${key}" ${disabled ? 'disabled' : ''}>
            <span class="mode-sign">
              ${arrow(m.arrow)}
              <b>${m.title}</b>
            </span>
            <span class="mode-aux">
              <span class="mode-desc">${disabled ? 'この難易度では出題できません' : m.desc}</span>
              <span class="best">${disabled ? '' : `${count}問　ベスト <b>${best ?? '–'}</b>`}</span>
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

// ---------- 画面: クイズ（学科試験の問題用紙） ----------

function startQuiz(mode) {
  quiz = { mode, questions: buildQuestions(mode), index: 0, score: 0, results: [], answered: false };
  renderQuestion();
}

function questionImage(q) {
  return q.img?.url ?? q.sides?.[0].gen.front.url ?? q.emblem?.image.url;
}

// 進み具合: 道路の上を車がゴールに向かって進む
function progressRoad() {
  const total = quiz.questions.length;
  return `
    <div class="progress-road" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${quiz.index}" aria-label="${quiz.index + 1}問目 / 全${total}問">
      <div class="progress-marks">${quiz.questions.map((_, i) => `<i class="${quiz.results[i] === true ? 'ok' : quiz.results[i] === false ? 'ng' : ''}"></i>`).join('')}</div>
      <span class="progress-car" style="left:calc(${(quiz.index / total) * 100}% * 0.9)">${car('kei')}</span>
      <span class="goal" aria-hidden="true"></span>
    </div>`;
}

function renderQuestion() {
  const q = quiz.questions[quiz.index];
  const m = MODES[q.mode];
  const total = quiz.questions.length;
  const next = quiz.questions[quiz.index + 1];
  if (next) preload(questionImage(next));
  quiz.answered = false;

  let visual;
  let answers;
  if (q.mode === 'newer') {
    visual = `
      <div class="pair">
        ${q.sides.map((s, i) => `
          <div class="pick-wrap">
            ${photoHtml(s.gen.front, { tag: i === 0 ? 'A' : 'B' })}
            <span class="pick-label" data-label="${i}"></span>
          </div>`).join('')}
      </div>`;
    answers = `
      <ol class="sheet-choices two">
        ${q.sides.map((_, i) => `<li><button class="choice" data-side="${i}"><span class="mark">${MARKS[i]}</span><span class="label">${i === 0 ? 'Aの写真' : 'Bの写真'}</span></button></li>`).join('')}
      </ol>`;
  } else {
    visual = q.mode === 'emblem' ? emblemHtml(q.emblem) : photoHtml(q.img, { tag: q.mode === 'rear' ? '後ろ姿' : '' });
    answers = `
      <ol class="sheet-choices">
        ${q.choices.map((c, i) => `<li><button class="choice" data-choice="${i}"><span class="mark">${MARKS[i]}</span><span class="label">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span></button></li>`).join('')}
      </ol>`;
  }
  const prompt = q.mode === 'newer' ? `${esc(q.car.maker)} ${esc(q.car.name)}の新しいモデルはどちらか。` : m.prompt;

  $app.innerHTML = `
    <div class="quiz">
      <div class="quiz-head">
        <button class="quit" data-go="home">やめる</button>
        <span class="quiz-meta">${m.title}<span class="mini-hexa">${hexa(star)}</span></span>
        <span class="counter"><b>${quiz.index + 1}</b> / ${total}</span>
      </div>
      ${progressRoad()}
      <div class="quiz-body">
        <div class="quiz-visual">${visual}</div>
        <div class="sheet">
          <p class="sheet-no">第${quiz.index + 1}問</p>
          <p class="sheet-q">${prompt}</p>
          ${answers}
          <div class="sheet-after" id="after"></div>
          <p class="keys" aria-hidden="true">キー操作　<kbd>1</kbd>〜<kbd>${q.mode === 'newer' ? 2 : 4}</kbd> で回答　<kbd>Enter</kbd> で次へ</p>
        </div>
      </div>
    </div>`;

  $app.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.choice))));
  $app.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.side))));
  window.scrollTo({ top: 0 });
}

function choose(i) {
  if (!quiz || quiz.answered) return;
  const q = quiz.questions[quiz.index];
  let ok;
  if (q.mode === 'newer') {
    if (!q.sides[i]) return;
    ok = q.sides[i].isNew;
    $app.querySelectorAll('[data-side]').forEach((el, j) => {
      el.disabled = true;
      markChoice(el, q.sides[j].isNew, j === i);
      $app.querySelector(`[data-label="${j}"]`).textContent = `${q.sides[j].isNew ? '新型' : '旧型'}　${q.sides[j].gen.label}`;
    });
  } else {
    if (!q.choices[i]) return;
    ok = q.choices[i].correct;
    $app.querySelectorAll('[data-choice]').forEach((el, j) => {
      el.disabled = true;
      markChoice(el, q.choices[j].correct, j === i);
    });
  }
  answer(ok);
}

// 選んだマークを塗りつぶし、正解には赤丸、選んだ不正解には赤いバツ
function markChoice(el, correct, picked) {
  if (picked) el.classList.add('is-picked');
  if (correct) { el.classList.add('is-correct'); el.insertAdjacentHTML('beforeend', RED_CIRCLE); }
  else if (picked) { el.classList.add('is-wrong'); el.insertAdjacentHTML('beforeend', RED_CROSS); }
}

function answer(ok) {
  const q = quiz.questions[quiz.index];
  quiz.answered = true;
  if (ok) quiz.score++;
  quiz.results[quiz.index] = ok;
  $app.querySelector(`.progress-marks i:nth-child(${quiz.index + 1})`)?.classList.add(ok ? 'ok' : 'ng');

  // 回答後は写真のクレジットをリンクにする（回答前は答えが分かってしまうので文字だけ）
  $app.querySelectorAll('.photo .credit').forEach((el) => {
    el.innerHTML = `<a href="${esc(el.dataset.page)}" target="_blank" rel="noopener">${el.innerHTML}</a>`;
  });

  const isLast = quiz.index === quiz.questions.length - 1;
  let info;
  if (q.mode === 'emblem') {
    const e = q.emblem;
    info = `<b>${esc(e.maker)}</b>（${e.domestic ? '国産' : '輸入車'}）`;
  } else {
    const c = q.car;
    info = `<b>${esc(c.maker)} ${esc(c.name)}</b>${kindPlate(c)}<span class="fine">ランキング${c.rank}位${q.mode !== 'newer' ? `・${esc(c.gens[0].label)}` : ''}</span>
      <button class="link-btn" data-detail="${esc(c.id)}">くわしく</button>`;
  }

  document.getElementById('after').innerHTML = `
    <div class="result-line ${ok ? 'ok' : 'ng'}">
      <span class="stamp">${ok ? '正解' : '不正解'}</span>
      <span class="answer-info">${info}</span>
    </div>
    <button class="next-btn" id="next">${isLast ? '採点結果を見る' : '次の問題へ'}<span aria-hidden="true">→</span></button>`;
  const $next = document.getElementById('next');
  $next.addEventListener('click', goNext);
  $next.focus({ preventScroll: true });
}

function goNext() {
  if (!quiz?.answered) return;
  if (quiz.index === quiz.questions.length - 1) renderResult();
  else { quiz.index++; renderQuestion(); }
}

// PC ではキーボードでポンポン進める
document.addEventListener('keydown', (e) => {
  if (!quiz || $detail.open || $lightbox.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-4]$/.test(e.key) && !quiz.answered) { e.preventDefault(); choose(Number(e.key) - 1); return; }
  if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') && quiz.answered) {
    if (document.activeElement?.closest?.('.link-btn')) return;
    e.preventDefault();
    goNext();
  }
});

function renderResult() {
  const { mode, score, questions, results } = quiz;
  const total = questions.length;
  const bestKey = `best:${mode}:${star}`;
  const prevBest = Number(load(bestKey)) || 0;
  const isBest = score > prevBest;
  if (isBest) save(bestKey, score);
  const rate = score / total;
  const msg = rate === 1 ? '満点です。次の難易度へどうぞ' : rate >= 0.7 ? '合格。かなり詳しい' : rate >= 0.4 ? 'あと少し。図鑑で復習しよう' : 'まずは図鑑で覚えよう';
  const canLevelUp = rate === 1 && star < 5;

  const wrong = questions.filter((_, i) => results[i] === false);
  const wrongCars = wrong.filter((q) => q.car).map((q) => q.car);
  const wrongEmblems = wrong.filter((q) => q.emblem).map((q) => q.emblem);
  const lv = level();
  quiz = null;

  $app.innerHTML = `
    <section class="score-sheet">
      <p class="sheet-no">採点結果　${MODES[mode].title}・難易度${lv.star}（${lv.from}〜${lv.to}位）</p>
      <div class="score"><b>${score}</b><small>点 / ${total}点</small>${rate >= 0.7 ? RED_CIRCLE : ''}</div>
      <ol class="tally">${results.map((r, i) => `<li class="${r ? 'ok' : 'ng'}"><span>${i + 1}</span>${r ? '○' : '×'}</li>`).join('')}</ol>
      <p class="msg">${isBest ? '<span class="best-stamp">自己ベスト</span>' : ''}${msg}</p>
      <div class="actions">
        ${canLevelUp
          ? `<button class="next-btn" id="levelup">難易度${star + 1}に挑戦<span aria-hidden="true">→</span></button>`
          : `<button class="next-btn" id="retry">もう一回<span aria-hidden="true">→</span></button>`}
        <button class="board-btn" data-go="home">モードを選ぶ</button>
      </div>
    </section>
    ${wrongCars.length ? `
      ${signLabel('まちがえた車')}
      <div class="grid">${wrongCars.map(cardHtml).join('')}</div>` : ''}
    ${wrongEmblems.length ? `
      ${signLabel('まちがえたエンブレム')}
      <div class="emblem-grid">${wrongEmblems.map((e) => `<div class="emblem-card">${emblemHtml(e)}<b>${esc(e.maker)}</b></div>`).join('')}</div>` : ''}`;
  document.getElementById('retry')?.addEventListener('click', () => startQuiz(mode));
  document.getElementById('levelup')?.addEventListener('click', () => {
    star++;
    save('star', star);
    startQuiz(mode);
  });
  document.querySelector('#retry, #levelup')?.focus({ preventScroll: true });
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
  quiz = null;
  const kinds = [['all', 'すべて'], ['登録車', '登録車'], ['軽自動車', '軽'], ['軽貨物', '軽貨物']];
  $app.innerHTML = `
    <div class="guide blue zukan-sign">
      <h1>図鑑</h1>
      <p class="guide-sub">販売ランキング上位${data.cars.length}車種</p>
    </div>
    <p class="hero-text">タップすると世代ごとの写真が見られます。</p>
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
            ${photoHtml(g.front, { tag: '前', revealCredit: true, alt: `${c.name} ${g.label} 前から`, caption: `${c.name}　${g.label}　前` })}
            ${g.rear ? photoHtml(g.rear, { tag: '後ろ', revealCredit: true, alt: `${c.name} ${g.label} 後ろから`, caption: `${c.name}　${g.label}　後ろ` }) : ''}
          </div>
        </section>`).join('')}
      ${c.wiki ? `<a class="board-btn block" href="${esc(c.wiki)}" target="_blank" rel="noopener">Wikipediaで読む</a>` : ''}
    </div>`;
  $detail.querySelector('.close').addEventListener('click', () => $detail.close());
  $detail.showModal();
  $detail.scrollTop = 0;
}

// 写真の拡大表示（切り抜かずに全体を見せる）
function openLightbox(btn) {
  $lightbox.innerHTML = `
    <figure>
      <img src="${esc(btn.dataset.zoom)}" crossorigin="anonymous" alt="${esc(btn.dataset.caption || '拡大した写真')}">
      <figcaption>
        ${btn.dataset.caption ? `<b>${esc(btn.dataset.caption)}</b>` : ''}
        <a href="${esc(btn.dataset.page)}" target="_blank" rel="noopener">${btn.dataset.credit}</a>
      </figcaption>
    </figure>
    <button class="close" aria-label="閉じる" autofocus><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  $lightbox.querySelector('.close').addEventListener('click', () => $lightbox.close());
  $lightbox.showModal();
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
  // 写真のどこを押しても拡大（クレジットのリンクは除く）
  const zoomEl = e.target.closest('[data-zoom]') ?? (!e.target.closest('a') && e.target.closest('.photo')?.querySelector('[data-zoom]'));
  if (zoomEl && !$lightbox.open) { openLightbox(zoomEl); return; }
  const goEl = e.target.closest('[data-go]');
  if (goEl) { go(goEl.dataset.go); return; }
  const detailEl = e.target.closest('[data-detail]');
  if (detailEl) { openDetail(detailEl.dataset.detail); return; }
  // 背景や拡大写真のタップで閉じる
  if (e.target === $detail) $detail.close();
  if ($lightbox.open && !e.target.closest('a, figcaption')) $lightbox.close();
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
