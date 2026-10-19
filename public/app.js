const QUESTIONS = 10;
const RANGES = [20, 50, 100];

const MODES = {
  name: { icon: '🚗', title: '車名当て', desc: '前から見た写真で車名を当てる', prompt: 'この車の名前は？' },
  rear: { icon: '🔙', title: '後ろ姿当て', desc: '信号待ちで見る後ろ姿から当てる', prompt: '後ろ姿でわかる？ この車は？' },
  maker: { icon: '🏭', title: 'メーカー当て', desc: 'どこのメーカーの車か当てる', prompt: 'この車のメーカーは？' },
  newer: { icon: '🆕', title: '新型どっち？', desc: '同じ車の新型と旧型を見分ける', prompt: '' },
};

const $app = document.getElementById('app');
const $detail = document.getElementById('detail');

let data = null;
let range = Number(load('range')) || 50;

// ---------- utils ----------

function load(key) {
  try { return localStorage.getItem(`carquiz:${key}`); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(`carquiz:${key}`, value); } catch { /* 保存できない環境でも動かす */ }
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
const group = (car) => (car.kind === '登録車' ? '登録車' : '軽');
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const ym = (s) => s?.replace(/^(\d{4})-0?(\d+)$/, '$1年$2月') ?? '';

function preload(url) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
}

function photoHtml(img, { tag = '', revealCredit = false, alt = 'クイズの写真' } = {}) {
  if (!img) return `<div class="photo"><div class="noimg">写真なし</div></div>`;
  const credit = `写真: ${esc(img.artist)}${img.license ? ` / ${esc(img.license)}` : ''}`;
  return `
    <div class="photo">
      <img src="${esc(img.url)}" crossorigin="anonymous" alt="${esc(alt)}" decoding="async">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <span class="credit">${revealCredit ? `<a href="${esc(img.page)}" target="_blank" rel="noopener">${credit}</a>` : credit}</span>
    </div>`;
}

// ---------- 出題 ----------

function poolFor(mode) {
  const cars = data.cars.filter((c) => c.gens?.length && c.rank <= range);
  if (mode === 'rear') return cars.filter((c) => c.gens[0].rear);
  if (mode === 'newer') return cars.filter((c) => c.gens.length >= 2 && c.gens[1].front?.url !== c.gens[0].front.url);
  return cars;
}

// 選択肢は同じ区分（軽／登録車）から選んで、見た目で区別させる
function distractors(answer, all, n, keyFn) {
  const seen = new Set([keyFn(answer)]);
  const out = [];
  const same = shuffle(all.filter((c) => group(c) === group(answer)));
  const rest = shuffle(all.filter((c) => group(c) !== group(answer)));
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
  const all = data.cars.filter((c) => c.gens?.length);
  return sample(pool, QUESTIONS).map((car) => {
    if (mode === 'newer') {
      const [newer, older] = car.gens;
      const sides = shuffle([{ gen: newer, isNew: true }, { gen: older, isNew: false }]);
      return { mode, car, sides };
    }
    const keyFn = mode === 'maker' ? (c) => c.maker : (c) => c.name;
    const choices = shuffle([car, ...distractors(car, all, 3, keyFn)]).map((c) => ({
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
  const counts = Object.fromEntries(Object.keys(MODES).map((m) => [m, poolFor(m).length]));
  $app.innerHTML = `
    <section class="hero">
      <h1>街でよく見る車、<br>いくつわかる？</h1>
      <p>自販連・全軽自協の最新の販売ランキング（${esc(ym(data.period.registered))}まで）から、日本の道でよく走っている車を出題します。</p>
    </section>

    <div class="section-label">出題範囲（販売ランキング）</div>
    <div class="chips" role="group" aria-label="出題範囲">
      ${RANGES.map((r) => `<button class="chip" data-range="${r}" aria-pressed="${r === range}">TOP${r}</button>`).join('')}
    </div>

    <div class="section-label">モードを選ぶ（全${QUESTIONS}問）</div>
    <div class="modes">
      ${Object.entries(MODES).map(([key, m]) => {
        const best = load(`best:${key}:${range}`);
        const disabled = counts[key] < 4;
        return `
          <button class="mode" data-mode="${key}" ${disabled ? 'disabled' : ''}>
            <span class="mode-icon" aria-hidden="true">${m.icon}</span>
            <span><b>${m.title}</b><small>${m.desc}${disabled ? '（この範囲では出題できません）' : `・${counts[key]}車種`}</small></span>
            <span class="best">ベスト<strong>${best ? `${best}/${QUESTIONS}` : '—'}</strong></span>
          </button>`;
      }).join('')}
    </div>`;

  $app.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    range = Number(b.dataset.range);
    save('range', range);
    renderHome();
  }));
  $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startQuiz(b.dataset.mode)));
}

// ---------- 画面: クイズ ----------

function startQuiz(mode) {
  const questions = buildQuestions(mode);
  const state = { mode, questions, index: 0, score: 0, wrong: [] };
  renderQuestion(state);
}

function renderQuestion(state) {
  const q = state.questions[state.index];
  const m = MODES[q.mode];
  const next = state.questions[state.index + 1];
  if (next) preload(next.img?.url ?? next.sides?.[0].gen.front.url);

  const body = q.mode === 'newer'
    ? `
      <p class="prompt">${esc(q.car.name)}（${esc(q.car.maker)}）の<br>新しいモデルはどっち？</p>
      <div class="pair">
        ${q.sides.map((s, i) => `
          <button class="pick" data-side="${i}" aria-label="${i === 0 ? '左' : '右'}の写真">
            ${photoHtml(s.gen.front, { tag: i === 0 ? 'A' : 'B' })}
            <div class="label" data-label="${i}"></div>
          </button>`).join('')}
      </div>`
    : `
      <p class="prompt">${m.prompt}</p>
      ${photoHtml(q.img, { tag: q.mode === 'rear' ? '後ろ姿' : '' })}
      <div class="choices">
        ${q.choices.map((c, i) => `<button class="choice" data-choice="${i}">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button>`).join('')}
      </div>`;

  $app.innerHTML = `
    <div class="quiz-head">
      <span>${m.title}・TOP${range}</span>
      <span>${state.index + 1} / ${state.questions.length}</span>
      <button class="quit" data-go="home">やめる</button>
    </div>
    <div class="progress"><i style="width:${(state.index / state.questions.length) * 100}%"></i></div>
    ${body}
    <div id="after"></div>`;

  if (q.mode === 'newer') {
    $app.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
      const picked = q.sides[Number(b.dataset.side)];
      $app.querySelectorAll('[data-side]').forEach((el, i) => {
        el.disabled = true;
        el.classList.add(q.sides[i].isNew ? 'is-correct' : 'is-wrong');
        $app.querySelector(`[data-label="${i}"]`).textContent = `${q.sides[i].isNew ? '新' : '旧'}：${q.sides[i].gen.label}`;
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

  // 回答後は写真のクレジットをリンクにする
  $app.querySelectorAll('.photo .credit').forEach((el, i) => {
    const img = q.mode === 'newer' ? q.sides[i].gen.front : q.img;
    el.innerHTML = `<a href="${esc(img.page)}" target="_blank" rel="noopener">${el.innerHTML}</a>`;
  });

  const car = q.car;
  const isLast = state.index === state.questions.length - 1;
  document.getElementById('after').innerHTML = `
    <div class="feedback">
      <div class="verdict ${ok ? 'ok' : 'ng'}">${ok ? '正解！' : '残念…'}</div>
      <p><b>${esc(car.maker)} ${esc(car.name)}</b>（${esc(car.kind)}・販売ランキング${car.rank}位）
        ${q.mode !== 'newer' ? `<br>${esc(car.gens[0].label)}` : ''}</p>
      <button class="btn secondary block" data-detail="${esc(car.id)}">この車をくわしく見る</button>
    </div>
    <button class="btn block" id="next">${isLast ? '結果を見る' : '次の問題へ'}</button>`;
  document.getElementById('next').addEventListener('click', () => {
    if (isLast) renderResult(state);
    else { state.index++; renderQuestion(state); window.scrollTo({ top: 0 }); }
  });
  document.getElementById('next').focus({ preventScroll: true });
}

function renderResult(state) {
  const { mode, score, questions } = state;
  const total = questions.length;
  const bestKey = `best:${mode}:${range}`;
  const prevBest = Number(load(bestKey)) || 0;
  const isBest = score > prevBest;
  if (isBest) save(bestKey, score);
  const rate = score / total;
  const msg = rate === 1 ? '全問正解！もう街の車はバッチリ' : rate >= 0.7 ? 'かなり詳しい！' : rate >= 0.4 ? 'いい調子。図鑑で復習しよう' : 'まずは図鑑で上位の車から覚えよう';

  $app.innerHTML = `
    <section class="result">
      <div>${MODES[mode].title}・TOP${range}</div>
      <div class="score">${score}<small> / ${total}</small></div>
      <p class="msg">${isBest ? '自己ベスト更新！ ' : ''}${msg}</p>
      <div class="actions">
        <button class="btn" id="retry">もう一回</button>
        <button class="btn secondary" data-go="home">モードを選ぶ</button>
      </div>
    </section>
    ${state.wrong.length ? `
      <section class="review">
        <h2>まちがえた車</h2>
        <div class="grid">${state.wrong.map((q) => cardHtml(q.car)).join('')}</div>
      </section>` : ''}`;
  document.getElementById('retry').addEventListener('click', () => startQuiz(mode));
}

// ---------- 画面: 図鑑 ----------

function cardHtml(car) {
  const img = car.gens?.[0]?.front;
  return `
    <button class="card" data-detail="${esc(car.id)}">
      <div class="thumb">
        ${img ? `<img src="${esc(img.url)}" crossorigin="anonymous" alt="${esc(car.name)}" loading="lazy" decoding="async">` : '<div class="noimg">写真なし</div>'}
        <span class="rank">${car.rank}</span>
      </div>
      <div class="meta"><b>${esc(car.name)}</b><small>${esc(car.maker)}・${esc(car.kind)}</small></div>
    </button>`;
}

let zukanFilter = { q: '', kind: 'all' };

function renderZukan() {
  setTab('zukan');
  const kinds = [['all', 'すべて'], ['登録車', '登録車'], ['軽自動車', '軽'], ['軽貨物', '軽貨物']];
  $app.innerHTML = `
    <div class="zukan-tools">
      <input class="search" type="search" placeholder="車名・メーカーで探す" value="${esc(zukanFilter.q)}" aria-label="検索">
    </div>
    <div class="chips" role="group" aria-label="区分" style="margin-bottom:12px">
      ${kinds.map(([k, label]) => `<button class="chip" data-kind="${k}" aria-pressed="${zukanFilter.kind === k}">${label}</button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>`;

  const draw = () => {
    const q = zukanFilter.q.trim().toLowerCase();
    const list = data.cars.filter((c) =>
      (zukanFilter.kind === 'all' || c.kind === zukanFilter.kind) &&
      (!q || `${c.name} ${c.maker} ${(c.aliases ?? []).join(' ')}`.toLowerCase().includes(q)));
    document.getElementById('grid').innerHTML = list.length ? list.map(cardHtml).join('') : '<p class="loading">見つかりませんでした</p>';
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
  $detail.innerHTML = `
    <button class="close" aria-label="閉じる">✕</button>
    <div class="detail-body">
      <h2>${esc(car.name)}</h2>
      <p class="sub">${esc(car.maker)}・${esc(car.kind)}${aliases.length ? `<br>販売名: ${aliases.map(esc).join('、')}` : ''}</p>
      <div class="stats">
        <div><b>${car.rank}位</b><small>販売ランキング</small></div>
        <div><b>${fmt(car.units)}</b><small>直近2年の台数</small></div>
        <div><b>${fmt(car.latestMonth)}</b><small>${esc(ym(car.kind === '登録車' ? data.period.registered : data.period.kei))}の台数</small></div>
      </div>
      ${(car.gens ?? []).map((g, i) => `
        <div class="gen">
          <h3>${['最新モデル', 'ひとつ前のモデル', 'ふたつ前のモデル'][i]}：${esc(g.label)}</h3>
          <div class="pair">
            ${photoHtml(g.front, { tag: '前', revealCredit: true, alt: `${car.name} ${g.label} 前から` })}
            ${g.rear ? photoHtml(g.rear, { tag: '後ろ', revealCredit: true, alt: `${car.name} ${g.label} 後ろから` }) : ''}
          </div>
        </div>`).join('')}
      ${car.wiki ? `<p><a class="btn secondary block" href="${esc(car.wiki)}" target="_blank" rel="noopener">Wikipediaで読む</a></p>` : ''}
    </div>`;
  $detail.querySelector('.close').addEventListener('click', () => $detail.close());
  $detail.showModal();
  $detail.scrollTop = 0;
}

// ---------- 共通 ----------

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.go === name));
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
    データ更新: ${esc(updated)}（登録車 ${esc(ym(data.period.registered))}・軽自動車 ${esc(ym(data.period.kei))} までの販売台数）<br>
    ランキングは直近2年の同じ期間（1月〜最新月）の新車販売台数の合計で、毎月自動で更新されます。<br>
    出典: ${data.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join('、')}<br>
    写真は Wikimedia Commons のもので、各写真の作者・ライセンス（CC BY-SA など）に従って掲載しています。`;
}

async function init() {
  try {
    const res = await fetch('data/cars.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $app.innerHTML = '<p class="error">データを読み込めませんでした。通信状況を確認して再読み込みしてください。</p>';
    return;
  }
  renderFooter();
  go(location.hash === '#zukan' ? 'zukan' : 'home');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
