import {
  MODEL, PRICE_PER_MTOK, JPY_PER_USD, CHUNK_MAX_CHARS, LAST_WORD_IDLE_MS, HISTORY_TURNS,
  FACES, INTENTS, GAME, TRIVIA, DEMO_SCRIPT, DEMO_KEY_MS,
} from "./config.js?v=11";

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CATS = GAME.categories;
const catOf = (id) => CATS.find((c) => c.id === id);

// ---- 状態（メモリだけ。再読み込みですべて 0 から） ----
const fresh = () => ({
  history: [], lastVariant: {},
  cost: { calls: 0, tokens: 0, usd: 0, msSum: 0, lastUsd: 0, lastMs: 0 },
  game: { terms: [], chunks: 0, startedAt: null, clearedAt: null }, // terms: {word, p, cat}
});
let S = fresh();

// ---- Jev の呼び出し（server.py 経由。server.py が logs/server.jsonl に記録する） ----
async function callJev(body, kind) {
  const t0 = performance.now();
  const res = await fetch("/api/jev", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Kind": kind }, body: JSON.stringify(body),
  });
  const out = await res.json();
  out.roundtrip = Math.round(performance.now() - t0);
  logEntry(body, out);
  if (out.status === 200) addCost(out);
  return out.status === 200 ? out.response : null;
}

// ---- 候補語の抽出（コード） ----
const norm = (w) => w.toLowerCase().replace(/\s+/g, "");
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const generic = new Set(CATS.flatMap((c) => c.aliases.map(norm)));

// 英字・カタカナのひと続き（「Amazonベック」「HT P」のような崩れも1語に）。
// 音声入力は「IAMロールAmazonレッドロック」のように区切りなしで続くので、カナ→英字の境目では分ける
const RUN = /[A-Za-z0-9ァ-ヴー][A-Za-z0-9ァ-ヴー.+#\/_-]*(?: [A-Z]{1,2}(?![A-Za-z]))?/g;
function runsOf(text) {
  const out = [];
  for (const m of text.matchAll(RUN)) {
    let at = m.index;
    for (const part of m[0].split(/(?<=[ァ-ヴー])(?=[A-Za-z])/)) { out.push({ w: part, at }); at += part.length; }
  }
  return out;
}

// 候補語: 英字・カタカナの語と、ひらがなを含まない漢字の語
function candidatesOf(text) {
  const runs = runsOf(text).map((r) => r.w);
  const kanji = [...segmenter.segment(text)].map((s) => s.segment)
    .filter((w) => w.length >= 2 && /\p{Script=Han}/u.test(w) && !/\p{Script=Hiragana}/u.test(w));
  const out = new Map();
  for (const w of [...runs, ...kanji]) {
    if (w.length < 2 || /^[\d.ー-]+$/.test(w)) continue;
    if (!out.has(norm(w))) out.set(norm(w), w);
  }
  const got = new Set(S.game.terms.map((t) => norm(t.word)));
  const all = [...out.values()];
  return {
    generics: all.filter((w) => generic.has(norm(w))),                                   // 分野名そのもの
    repeats: all.filter((w) => got.has(norm(w))),                                        // 既に獲得済み
    ask: all.filter((w) => !generic.has(norm(w)) && !got.has(norm(w))).slice(0, GAME.maxCandidates),
  };
}

// ---- 質問の組み立て ----
function buildState(segment) {
  return {
    conversation: S.history.slice(-HISTORY_TURNS).map((t) => ({ speaker: t.who === "you" ? "相手" : "聞き手", text: t.text })),
    segment,
  };
}

function termQuestion(word) {
  return {
    type: "choice",
    instructions: { word, question: GAME.termQuestion },
    criteria: { ...Object.fromEntries(CATS.map((c) => [c.id, `${c.label}: ${c.desc}`])), not_it: GAME.notIt },
  };
}


// ---- 得点 ----
const countIn = (cat) => S.game.terms.filter((t) => t.cat === cat).length;
const score = () => Math.round((CATS.reduce((n, c) => n + Math.min(countIn(c.id), GAME.perCategory), 0) / (CATS.length * GAME.perCategory)) * 100);

// ---- 入力の監視：送信ボタンは無く、新しく入った部分を次々に判定する ----
const input = $("input");
let evaluatedUpTo = 0, lastInputAt = 0, busy = false, composing = false;
input.addEventListener("input", () => { lastInputAt = Date.now(); });
input.addEventListener("compositionstart", () => { composing = true; });
input.addEventListener("compositionend", () => { composing = false; lastInputAt = Date.now(); });

setInterval(() => {
  renderTimer();
  const value = input.value;
  if (value.length < evaluatedUpTo) evaluatedUpTo = value.length; // 手で消した場合
  const idle = Date.now() - lastInputAt;
  // 区切り（空白・句読点）まで打たれた部分だけを判定する。入力が止まったら末尾まで。
  // 区切りなしで長く続くとき（音声入力など）は、最後の語の手前で区切る
  const rest = value.slice(evaluatedUpTo);
  let end = evaluatedUpTo + rest.search(/[^\s、。,.!?！？]*$/);
  if (idle >= LAST_WORD_IDLE_MS) end = value.length;
  else if (end === evaluatedUpTo && rest.length >= CHUNK_MAX_CHARS) {
    const last = runsOf(value).at(-1);
    if (last && last.at > evaluatedUpTo) end = last.at;
  }
  const seg = value.slice(evaluatedUpTo, end);
  $("idle").firstElementChild.style.width = rest.trim() && !busy ? `${Math.min(idle / LAST_WORD_IDLE_MS, 1) * 100}%` : "0";
  if (!seg.trim() || busy || composing || S.game.clearedAt) return;
  evaluatedUpTo = end;
  evaluate(seg.trim(), end - seg.length);
}, 100);

async function evaluate(segment, segStart) {
  busy = true;
  S.game.startedAt ??= Date.now();
  const { ask, repeats, generics } = candidatesOf(segment);
  const questions = {};
  ask.forEach((w, i) => {
    questions[`t${i}`] = termQuestion(w);
    questions[`n${i}`] = { type: "score", instructions: { word: w, question: GAME.nicheQuestion }, criteria: GAME.nicheLevels };
    questions[`e${i}`] = { type: "score", instructions: { word: w, question: GAME.eraQuestion }, criteria: GAME.eraLevels };
    questions[`h${i}`] = { type: "noul", instructions: { word: w, question: GAME.hardQuestion } };
    questions[`k${i}`] = {
      type: "choice", instructions: { word: w, question: GAME.triviaQuestion },
      criteria: { ...Object.fromEntries(TRIVIA.map((t) => [t.id, t.name])), none: "上のどれでもない" },
    };
  });

  // 候補語が無ければ Jev を呼ばずにコードだけで返す
  const sentAt = Date.now();
  const r = ask.length ? await callJev({ model: MODEL, state: buildState(segment), questions }, "chunk") : { answers: {} };
  busy = false;
  if (!r) return;
  const ms = ask.length ? Date.now() - sentAt : null;

  // 判定：IT 用語の確率 = 1 - not_it。分野は not_it を除いて最も高いもの
  const judged = ask.map((w, i) => {
    const probs = r.answers[`t${i}`].probabilities;
    const cat = CATS.map((c) => c.id).sort((a, b) => probs[b] - probs[a])[0];
    const k = r.answers[`k${i}`];
    return {
      word: w, p: 1 - probs.not_it, cat,
      niche: r.answers[`n${i}`].score, era: r.answers[`e${i}`].score, hard: r.answers[`h${i}`].noul,
      trivia: k.choice !== "none" && k.probabilities[k.choice] >= GAME.triviaThreshold ? k.choice : null,
    };
  });
  const hits = [];
  for (const j of judged) {
    if (j.p < GAME.threshold) j.state = "miss";
    else if (countIn(j.cat) + hits.filter((h) => h.cat === j.cat).length >= GAME.perCategory) j.state = "full";
    else { j.state = "hit"; hits.push(j); }
  }
  const before = score();
  S.game.terms.push(...hits.map(({ word, p, cat }) => ({ word, p, cat })));
  S.game.chunks++;

  // 返し：用語へのひとことリアクション（Jev の判定から選ぶ）+ まだ足りない分野のキーワードを促す
  const full = judged.find((j) => j.state === "full");
  const weakCats = CATS.filter((c) => countIn(c.id) < GAME.perCategory).sort((a, b) => countIn(a.id) - countIn(b.id));
  const weak = weakCats[0]?.label ?? "ほかの分野";
  const pick = (list, key) => {
    const pool = list.filter((v) => v !== S.lastVariant[key]);
    const v = pool[Math.floor(Math.random() * pool.length)] ?? list[0];
    S.lastVariant[key] = v;
    return v;
  };
  const fill = (tpl, word, cat) => tpl.replaceAll("{word}", word ?? "").replaceAll("{cat}", cat ? catOf(cat).label : "").replaceAll("{weak}", weak);
  const byId = (id) => INTENTS.find((i) => i.id === id);

  let intent, say;
  const trivia = hits.find((h) => h.trivia);
  if (trivia) {
    intent = byId("tech_niche");
    say = pick(TRIVIA.find((t) => t.id === trivia.trivia).lines, `trivia:${trivia.trivia}`);
  } else {
    let id, h;
    if ((h = hits.find((x) => x.era < 0.8))) id = "tech_legacy";
    else if ((h = hits.find((x) => x.era < 1.5))) id = "tech_still";
    else if ((h = hits.find((x) => x.hard >= 0.7))) id = "tech_hard";
    else if ((h = hits.find((x) => x.niche >= 1.5))) id = "tech_niche";
    else if ((h = hits.find((x) => x.era >= 2.5))) id = "tech_new";
    else if (hits.length >= 2) { id = "tech_multi"; h = { word: hits.map((x) => x.word).join("、"), cat: hits[0].cat }; }
    else if (hits.length) { id = "tech_wow"; h = hits[0]; }
    else if (generics.length) { id = "too_generic"; h = { word: generics[0] }; }
    else if (full) { id = "cat_full"; h = full; }
    else if (repeats.length) { id = "tech_repeat"; h = { word: repeats[0] }; }
    else id = "tech_off";
    intent = byId(id);
    say = fill(pick(intent.variants, id), h?.word, h?.cat);
  }
  // 用語を獲得したときは、まだ空の分野があれば「そっちのキーワード何かある？」と促す
  const empty = weakCats.find((c) => countIn(c.id) === 0);
  if (hits.length && empty && Math.random() < GAME.askRate) {
    say += `　${pick([`${empty.label}がらみで何かある？`, `次は${empty.label}のキーワード、何か思いつく？`, `${empty.label}の用語もほしいな`], "ask")}`;
  }
  S.history.push({ who: "you", text: segment }, { who: "jev", text: say, intent: intent.id });

  addFeed(segment, judged, repeats, generics, say, ms);
  setFace(intent.face);
  // 獲得した語は入力欄から抜き取り、分野のメーターへ飛ばす。着地してからメーターを更新する
  flyHits(hits, segStart);
  const gained = score() - before;
  if (S.game.terms.length && score() >= 100) S.game.clearedAt ??= Date.now(); // タイマーはここで止める
  setTimeout(() => {
    renderGame(gained, hits);
    if (score() >= 100 && $("clear").hidden) showClear();
  }, hits.length ? FLY_MS : 0);
}

// ---- 演出: 獲得した語が入力欄から抜けて、分野のメーターへ飛んでいく ----
const FLY_MS = 750;

// textarea 内の文字位置の画面座標を、同じスタイルの見えない div で測る
function textRect(ta, start, len) {
  const cs = getComputedStyle(ta), m = document.createElement("div");
  for (const k of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "width"]) m.style[k] = cs[k];
  Object.assign(m.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", top: "0", left: "-9999px", borderStyle: "solid" });
  m.textContent = ta.value.slice(0, start);
  const sp = m.appendChild(document.createElement("span"));
  sp.textContent = ta.value.slice(start, start + len) || ".";
  document.body.appendChild(m);
  const r = ta.getBoundingClientRect();
  const out = { x: r.left + sp.offsetLeft - ta.scrollLeft, y: r.top + sp.offsetTop - ta.scrollTop };
  m.remove();
  return out;
}

function flyHits(hits, segStart) {
  if (!hits.length) return;
  // 位置を測ってから、後ろの語から順に入力欄から取り除く（前の位置がずれないように）
  const found = hits.map((h) => {
    const at = input.value.toLowerCase().indexOf(h.word.toLowerCase(), segStart);
    return { h, at, from: at >= 0 ? textRect(input, at, h.word.length) : null };
  });
  if (!composing) {
    for (const f of [...found].filter((f) => f.at >= 0).sort((a, b) => b.at - a.at)) {
      const v = input.value, caret = input.selectionStart;
      const len = f.h.word.length + (v[f.at + f.h.word.length] === " " ? 1 : 0);
      input.value = v.slice(0, f.at) + v.slice(f.at + len);
      if (f.at < evaluatedUpTo) evaluatedUpTo -= Math.min(len, evaluatedUpTo - f.at);
      input.selectionStart = input.selectionEnd = caret > f.at ? Math.max(f.at, caret - len) : caret;
    }
  }
  const ta = input.getBoundingClientRect();
  found.forEach(({ h, from }, k) => {
    const c = catOf(h.cat);
    const words = $(`m-${h.cat}`).querySelector(".words");
    const lastChip = words.lastElementChild?.getBoundingClientRect();
    const wr = words.getBoundingClientRect();
    const to = { x: lastChip ? lastChip.right + 5 + k * 8 : wr.left, y: lastChip ? lastChip.top : wr.top };
    const start = from ?? { x: ta.left + ta.width / 2, y: ta.top + 10 };
    const el = document.body.appendChild(document.createElement("span"));
    el.className = "chip hit fly";
    el.style.cssText = `--c:${c.color};left:${start.x}px;top:${start.y}px`;
    el.textContent = h.word;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${to.x - start.x}px, ${to.y - start.y}px) scale(1)`;
      el.classList.add("go");
    }));
    setTimeout(() => el.remove(), FLY_MS + 50);
  });
}

// ---- 描画: いまの返し（真ん中）と履歴（新しいものが上） ----
let lastHero = null;
function addFeed(segment, judged, repeats, generics, say, ms) {
  const label = { hit: (j) => `${catOf(j.cat).label} ＋1`, full: (j) => `${catOf(j.cat).label} 満タン`, miss: () => "" };
  const chips = [
    ...judged.map((j) => `<span class="chip ${j.state}"${j.state === "hit" ? ` style="--c:${catOf(j.cat).color}"` : ""}>${esc(j.word)} <b>${(j.p * 100).toFixed(0)}%</b> ${label[j.state](j)}</span>`),
    ...generics.map((w) => `<span class="chip dup">${esc(w)} <b>分野名はNG</b></span>`),
    ...repeats.map((w) => `<span class="chip dup">${esc(w)} <b>既出</b></span>`),
  ].join("");
  const speed = ms == null ? "候補語なし（Jev 呼び出しなし）" : `⚡ Jev ${ms} ms`;
  // 直前まで真ん中にあったものを履歴へ送り、新しいものを真ん中に大きく出す
  if (lastHero) $("feed").insertAdjacentHTML("beforeend", `
    <div class="turn">
      <div class="said">${esc(lastHero.segment)}</div>
      ${lastHero.chips ? `<div class="chips">${lastHero.chips}</div>` : ""}
      <div class="reply"><span class="bubble">${esc(lastHero.say)}</span><span class="speed">${lastHero.speed}</span></div>
    </div>`);
  $("feed").scrollTop = $("feed").scrollHeight; // 履歴は古い順。常に最新（いちばん下）を見せる
  lastHero = { segment, chips, say, speed };
  $("hero").innerHTML = `<div class="bubble">${esc(say)}</div>${chips ? `<div class="chips">${chips}</div>` : ""}<span class="speed">${speed}</span>`;
}

// ---- 描画: ゲージと分野メーター ----
const rankOf = (n) => GAME.ranks.filter(([min]) => n >= min).at(-1)[1];

function initGame() {
  $("gtitle").innerHTML = `<span class="jev">Jev</span> を体感するための ${esc(GAME.title)}`;
  $("gticks").innerHTML = CATS.slice(1).map((_, i) => `<span style="left:${((i + 1) / CATS.length) * 100}%"></span>`).join("");
  $("meters").innerHTML = CATS.map((c) => `
    <div class="meter" id="m-${c.id}">
      <span class="name">${c.label}</span>
      <div class="track" style="color:${c.color}"><div class="fill" style="background:${c.color}"></div></div>
      <span class="val"><span class="num"></span></span>
      <div class="words chips"></div>
    </div>`).join("");
  renderGame();
}

function renderGame(gained = 0, hits = []) {
  const sc = score();
  $("gfill").style.width = `${sc}%`;
  $("gval").textContent = `${sc} / 100 点`;
  $("rank").textContent = rankOf(sc);
  for (const c of CATS) {
    const row = $(`m-${c.id}`);
    const n = Math.min(countIn(c.id), GAME.perCategory);
    row.querySelector(".fill").style.width = `${(n / GAME.perCategory) * 100}%`;
    row.querySelector(".num").textContent = n >= GAME.perCategory ? "満タン" : `${n} / ${GAME.perCategory}`;
    row.classList.toggle("full", n >= GAME.perCategory);
    row.querySelector(".words").innerHTML = S.game.terms.filter((t) => t.cat === c.id)
      .map((t) => `<span class="chip hit" style="--c:${c.color}">${esc(t.word)}</span>`).join("");
    if (hits.some((h) => h.cat === c.id)) {
      row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 1200);
    }
  }
  if (gained) {
    const el = $("gdelta");
    el.textContent = `+${gained}点`;
    el.className = "show up";
    const box = $("game");
    box.classList.remove("gup"); void box.offsetWidth; box.classList.add("gup");
    setTimeout(() => { el.className = ""; }, 1500);
  }
}

function elapsed() {
  const g = S.game;
  return g.startedAt ? ((g.clearedAt ?? Date.now()) - g.startedAt) / 1000 : 0;
}
function renderTimer() {
  $("gstat").textContent = `${elapsed().toFixed(1)} 秒 · 判定 ${S.game.chunks} 回`;
}

function showClear() {
  const g = S.game, c = S.cost;
  g.clearedAt ??= Date.now();
  $("clearstats").innerHTML = `
    <div class="wide">クリアタイム <b>${elapsed().toFixed(1)} 秒</b></div>
    <div>判定 <b>${g.chunks}</b> 回</div><div>平均 <b>${Math.round(c.msSum / c.calls)}</b> ms</div>
    <div class="wide">かかった費用 <b class="yen">¥${(c.usd * JPY_PER_USD).toFixed(4)}</b></div>
    <div class="wide terms">${g.terms.map((t) => `<span class="chip hit" style="--c:${catOf(t.cat).color}">${esc(t.word)}</span>`).join("")}</div>`;
  $("clear").hidden = false;
  const bits = ["🎉", "✨", "💻", "🧠", "🎓", "⚡"];
  $("confetti").innerHTML = Array.from({ length: 70 }, () =>
    `<span style="left:${Math.random() * 100}%;animation-delay:${Math.random() * 1.2}s;animation-duration:${2 + Math.random() * 2}s">${bits[Math.floor(Math.random() * bits.length)]}</span>`).join("");
  setFace("impressed");
}

// ---- 描画: ぽちょ（faces/<id>.gif → .png → 絵文字） ----
const faceCache = {};
const probe = (src) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(src); img.onerror = () => ok(null); img.src = src; });
async function setFace(id) {
  const f = FACES[id] ?? FACES.neutral;
  if (!(id in faceCache)) faceCache[id] = (await probe(`faces/${id}.gif`)) ?? (await probe(`faces/${id}.png`));
  const box = $("faceimg");
  box.innerHTML = faceCache[id] ? `<img src="${faceCache[id]}" alt="${f.label}">` : f.emoji;
  $("facelabel").textContent = f.label;
  box.classList.add("bump");
  setTimeout(() => box.classList.remove("bump"), 250);
}

// ---- 描画: コストと API ログ ----
function addCost(out) {
  const tok = out.response.usage.input_tokens;
  const usd = (tok / 1e6) * PRICE_PER_MTOK;
  const c = S.cost;
  c.calls++; c.tokens += tok; c.usd += usd; c.msSum += out.ms; c.lastUsd = usd; c.lastMs = out.ms;
  renderCost(true);
}

function renderCost(pulse) {
  const c = S.cost;
  $("yen").textContent = `¥${(c.usd * JPY_PER_USD).toFixed(4)}`;
  $("usd").textContent = `$${c.usd.toFixed(6)}`;
  $("calls").textContent = `${c.calls} 回`;
  $("tokens").textContent = c.tokens.toLocaleString();
  if (c.calls) {
    const avgUsd = c.usd / c.calls;
    $("last").textContent = `¥${(c.lastUsd * JPY_PER_USD).toFixed(4)}`;
    $("lastms").textContent = `${c.lastMs} ms`;
    $("avgms").textContent = `${Math.round(c.msSum / c.calls)} ms`;
    $("per10k").textContent = `¥${(avgUsd * JPY_PER_USD * 10000).toFixed(0)}`;
    $("per1yen").textContent = `${Math.floor(1 / (avgUsd * JPY_PER_USD)).toLocaleString()} 回`;
  } else {
    for (const id of ["last", "lastms", "avgms", "per10k", "per1yen"]) $(id).textContent = "—";
  }
  if (pulse) { $("yen").classList.remove("pulse"); void $("yen").offsetWidth; $("yen").classList.add("pulse"); }
}

function logEntry(body, out) {
  const r = out.response;
  const html = `
    <div class="entry">
      <header>
        <span class="kind turn">判定</span>
        <span class="mono">POST ${out.status}</span>
        <span class="ms mono">${out.ms} ms</span>
      </header>
      <div class="meta mono">
        ${esc(out.url)}<br>
        Authorization: ${esc(out.authorization)}<br>
        Content-Type: application/json · ${out.request_bytes} bytes<br>
        質問 ${Object.keys(body.questions).length} 個（並列）· 入力 ${r?.usage?.input_tokens ?? "—"} tok · 往復 ${out.roundtrip} ms
      </div>
      <details><summary>Request body</summary><pre>${esc(JSON.stringify(body, null, 2))}</pre></details>
      <details open><summary>Response body</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details>
    </div>`;
  const log = $("log");
  log.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  log.insertAdjacentHTML("beforeend", html);
  while (log.children.length > 30) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight; // 古い順に並べ、常に最新（いちばん下）を見せる
}

// ---- リセットと起動 ----
function resetAll() {
  S = fresh();
  input.value = ""; evaluatedUpTo = 0;
  $("feed").innerHTML = ""; $("log").innerHTML = ""; $("clear").hidden = true; $("confetti").innerHTML = "";
  $("hero").innerHTML = `<div class="placeholder">下の欄に IT 用語を話しかけてください</div>`; lastHero = null;
  initGame(); renderCost(false); setFace("neutral"); input.focus();
}
$("reset").addEventListener("click", resetAll);
$("again").addEventListener("click", resetAll);

// ---- テーマ（自動 / ライト / ダーク） ----
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { t === "auto" ? localStorage.removeItem("jev-theme") : localStorage.setItem("jev-theme", t); } catch {}
  document.querySelectorAll("#theme button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
}
document.querySelectorAll("#theme button").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.t)));
applyTheme(document.documentElement.dataset.theme ?? "auto");

initGame();
renderCost(false);
setFace("neutral");
input.focus();

// ---- デモ自動再生（?demo）と録画（?record） ----
// ?demo: 人が打っているように1文字ずつ入力する
// ?record: 「録画してデモ開始」ボタンを出す。押すとこのタブだけを録画し（アドレスバーは入らない）、
//          クリア画面を少し見せてから止めて、webm をダウンロードする
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runDemo() {
  for (const [text, pause] of DEMO_SCRIPT) {
    for (const ch of text) {
      input.value += ch;
      input.dispatchEvent(new Event("input"));
      await sleep(DEMO_KEY_MS[0] + Math.random() * (DEMO_KEY_MS[1] - DEMO_KEY_MS[0]));
    }
    await sleep(pause);
    if (!$("clear").hidden) break;
  }
  while ($("clear").hidden) await sleep(200); // 最後の判定とアニメーションを待つ
}

async function recordDemo() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 60, displaySurface: "browser", cursor: "never" }, audio: false,
    preferCurrentTab: true, selfBrowserSurface: "include",
  });
  const chunks = [];
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  $("recbtn").remove();
  input.focus();
  await sleep(600); // ボタンが消えた画面になってから録り始める（共有開始の表示も消えるのを待つ）
  rec.start();
  await sleep(1200);
  await runDemo();
  await sleep(4000); // クリア画面を見せる
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
  a.download = `jev-demo-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.webm`;
  a.click();
}

const params = new URLSearchParams(location.search);
if (params.has("record")) {
  document.body.insertAdjacentHTML("beforeend", `<button id="recbtn">● 録画してデモを始める</button>`);
  $("recbtn").addEventListener("click", () => recordDemo().catch((e) => { console.error(e); alert(`録画できませんでした: ${e.message}`); }));
} else if (params.has("demo")) {
  sleep(1500).then(runDemo);
}
