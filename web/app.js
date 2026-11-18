const POSITIVE = [
  ["Rất thường xuyên", "Thường xuyên", "Thỉnh thoảng"],
  ["Cải thiện rõ rệt", "Có cải thiện", "Không thay đổi"],
  ["Rất quan trọng", "Quan trọng", "Bình thường"],
  ["Rất cần thiết", "Cần thiết", "Bình thường"],
  ["Rất hiệu quả", "Hiệu quả", "Bình thường"],
  ["Rất đồng ý", "Đồng ý", "Phân vân"],
];
const STORE = "form-filler-ui-v2";
const DEFAULT_COHORT = [
  { grade: "Khối 9", gender: "Nữ", n: 50 },
  { grade: "Khối 9", gender: "Nam", n: 56 },
  { grade: "Khối 10", gender: "Nữ", n: 77 },
  { grade: "Khối 10", gender: "Nam", n: 50 },
  { grade: "Khối 11", gender: "Nữ", n: 121 },
  { grade: "Khối 11", gender: "Nam", n: 99 },
  { grade: "Khối 12", gender: "Nữ", n: 149 },
  { grade: "Khối 12", gender: "Nam", n: 98 },
];
const freshCohort = () => DEFAULT_COHORT.map((c) => ({ ...c }));

const state = {
  source: "",
  data: null,
  answers: {},
  pools: {},
  locked: {},
  other: {},
  editPool: {},
  cohort: freshCohort(),
  link: "",
};

const $ = (id) => document.getElementById(id);
const questions = () => (state.data?.items || []).filter((it) => it.kind === "question");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function findRow(key) {
  for (const q of questions()) {
    for (const row of q.rows) if (row.key === key) return { q, row };
  }
  return null;
}

function selectedSet(key) {
  return new Set(
    String(state.answers[key] || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .map(Number)
  );
}

function answerString(key) {
  const nums = [...selectedSet(key)].sort((a, b) => a - b).join(",");
  const rawText = state.answers[key];
  const found = findRow(key);
  const textual = found && !found.row.options.length;
  let raw = textual ? String(rawText || "").trim() : nums;
  const other = String(state.other[key] || "").trim();
  if (other) raw = raw ? `${raw}, khac: ${other}` : `khac: ${other}`;
  return raw;
}

function optionIndex(options, label) {
  const i = options.findIndex((o) => o === label);
  return i >= 0 ? i + 1 : 0;
}

function positivePool(options) {
  for (const names of POSITIVE) {
    const idxs = names.map((n) => optionIndex(options, n));
    if (idxs.every((i) => i > 0)) return idxs;
  }
  const n = Math.min(3, options.length);
  return Array.from({ length: n }, (_, i) => i + 1);
}

function demoQuestions() {
  const grade = questions().find((q) => q.title.includes("Khối lớp"));
  const gender = questions().find((q) => q.title.includes("Giới tính"));
  if (!grade?.rows[0] || !gender?.rows[0]) return null;
  return { grade, gender, gk: grade.rows[0].key, xk: gender.rows[0].key };
}

function isDemoQuestion(q) {
  return q.title.includes("Khối lớp") || q.title.includes("Giới tính");
}

function cohortCells() {
  const demo = demoQuestions();
  if (!demo) return [];
  const gOpts = demo.grade.rows[0].options;
  const xOpts = demo.gender.rows[0].options;
  const gPool = new Set(state.pools[demo.gk] || gOpts.map((_, i) => i + 1));
  const xPool = new Set(state.pools[demo.xk] || xOpts.map((_, i) => i + 1));
  return state.cohort.flatMap((c) => {
    const gi = optionIndex(gOpts, c.grade);
    const xi = optionIndex(xOpts, c.gender);
    const n = Math.max(0, Number(c.n) || 0);
    if (!gi || !xi || !n || !gPool.has(gi) || !xPool.has(xi)) return [];
    return [{ ...c, gi, xi, n }];
  });
}

function drawCell(cells) {
  const total = cells.reduce((sum, c) => sum + c.n, 0);
  if (!total) return null;
  let ticket = Math.random() * total;
  for (const cell of cells) {
    ticket -= cell.n;
    if (ticket < 0) return cell;
  }
  return cells[cells.length - 1];
}

function applyCohortSample({ force = false } = {}) {
  const demo = demoQuestions();
  if (!demo) return;
  const { gk, xk, grade, gender } = demo;
  if (!state.pools[gk]?.length) state.pools[gk] = grade.rows[0].options.map((_, i) => i + 1);
  if (!state.pools[xk]?.length) state.pools[xk] = gender.rows[0].options.map((_, i) => i + 1);
  if (force) {
    delete state.locked[gk];
    delete state.locked[xk];
  }
  if (state.locked[gk] && state.locked[xk]) return;
  let cells = cohortCells();
  if (state.locked[gk]) cells = cells.filter((c) => c.gi === Number(state.answers[gk]));
  else if (state.locked[xk]) cells = cells.filter((c) => c.xi === Number(state.answers[xk]));
  const cell = drawCell(cells);
  if (!cell) return;
  if (!state.locked[gk]) state.answers[gk] = String(cell.gi);
  if (!state.locked[xk]) state.answers[xk] = String(cell.xi);
}

function rollRow(row, q) {
  const pool = state.pools[row.key] || [];
  if (!pool.length || !row.options.length) return;
  const multi = row.multi || q.type === "checkbox";
  if (multi) {
    let picked = pool.filter(() => Math.random() < 0.5);
    if (!picked.length) picked = [pool[Math.floor(Math.random() * pool.length)]];
    state.answers[row.key] = picked.sort((a, b) => a - b).join(",");
  } else {
    state.answers[row.key] = String(pool[Math.floor(Math.random() * pool.length)]);
  }
}

function applyPreset() {
  state.locked = {};
  state.pools = {};
  state.answers = {};
  state.other = {};
  state.editPool = {};
  for (const q of questions()) {
    const t = q.title;
    for (const row of q.rows) {
      const opts = row.options;
      if (!opts.length) continue;
      if (isDemoQuestion(q)) {
        state.pools[row.key] = opts.map((_, i) => i + 1);
      } else if (t.includes("Kết quả học tập")) {
        state.pools[row.key] = [1, 2, 3].filter((n) => n <= opts.length);
        rollRow(row, q);
      } else if (t.includes("bao nhiêu thời gian cho việc tự học")) {
        const names = ["Từ 60 đến 120 phút", "Từ 30 đến dưới 60 phút", "Dưới 30 phút"];
        const pool = names.map((n) => optionIndex(opts, n)).filter(Boolean);
        state.pools[row.key] = pool.length ? pool : [2, 3, 4].filter((n) => n <= opts.length);
        rollRow(row, q);
      } else if (t.includes("thời gian sử dụng AI chiếm")) {
        state.pools[row.key] = opts.map((_, i) => i + 1);
        rollRow(row, q);
      } else if (q.type === "checkbox" || row.multi) {
        state.pools[row.key] = opts.map((_, i) => i + 1);
        rollRow(row, q);
      } else {
        state.pools[row.key] = positivePool(opts);
        rollRow(row, q);
      }
    }
  }
  applyCohortSample({ force: true });
}

function applyFirstThree() {
  state.locked = {};
  state.editPool = {};
  for (const q of questions()) {
    if (isDemoQuestion(q)) continue;
    for (const row of q.rows) {
      if (!row.options.length) continue;
      const n = Math.min(3, row.options.length);
      state.pools[row.key] = Array.from({ length: n }, (_, i) => i + 1);
      rollRow(row, q);
    }
  }
  applyCohortSample({ force: true });
}

function reroll() {
  const demo = demoQuestions();
  applyCohortSample({ force: false });
  for (const q of questions()) {
    for (const row of q.rows) {
      if (demo && (row.key === demo.gk || row.key === demo.xk)) continue;
      if (state.locked[row.key]) continue;
      rollRow(row, q);
    }
  }
}

function shuffleQuestion(qkey) {
  const q = questions().find((item) => item.key === qkey);
  if (!q) return;
  if (isDemoQuestion(q)) {
    applyCohortSample({ force: true });
    return;
  }
  for (const row of q.rows) {
    delete state.locked[row.key];
    rollRow(row, q);
  }
}

function choose(key, idx, q, row) {
  const multi = row.multi || q.type === "checkbox";
  if (multi) {
    const set = selectedSet(key);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    state.answers[key] = [...set].sort((a, b) => a - b).join(",");
  } else {
    state.answers[key] = String(idx);
  }
  state.locked[key] = true;
}

function togglePool(key, idx) {
  const pool = new Set(state.pools[key] || []);
  if (pool.has(idx)) pool.delete(idx);
  else pool.add(idx);
  state.pools[key] = [...pool].sort((a, b) => a - b);
}

function payload() {
  const answers = {};
  for (const q of questions()) {
    for (const row of q.rows) {
      const raw = answerString(row.key);
      if (raw) answers[row.key] = raw;
    }
  }
  return answers;
}

function missingRequired() {
  const out = [];
  for (const q of questions()) {
    for (const row of q.rows) {
      if (row.required && !answerString(row.key)) out.push(row.label || q.title);
    }
  }
  return out;
}

function save() {
  if (!state.source || !state.data) return;
  localStorage.setItem(STORE, JSON.stringify({
    source: state.source,
    answers: state.answers,
    pools: state.pools,
    locked: state.locked,
    other: state.other,
    cohort: state.cohort,
  }));
}

function restore(source) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!saved || saved.source !== source) return false;
    const keys = new Set(questions().flatMap((q) => q.rows.map((r) => r.key)));
    if (!Object.keys(saved.answers || {}).every((k) => keys.has(k))) return false;
    state.answers = saved.answers || {};
    state.pools = saved.pools || {};
    state.locked = saved.locked || {};
    state.other = saved.other || {};
    if (Array.isArray(saved.cohort) && saved.cohort.length === DEFAULT_COHORT.length) {
      state.cohort = saved.cohort.map((c, i) => ({
        grade: DEFAULT_COHORT[i].grade,
        gender: DEFAULT_COHORT[i].gender,
        n: Math.max(0, Number(c.n) || 0),
      }));
    }
    return true;
  } catch {
    return false;
  }
}

function optClass(key, idx) {
  const on = selectedSet(key).has(idx);
  const pool = (state.pools[key] || []).includes(idx);
  return `opt${on ? " on" : ""}${pool ? " inpool" : " out"}`;
}

function pickText(row) {
  const names = [...selectedSet(row.key)].sort((a, b) => a - b).map((i) => row.options[i - 1]).filter(Boolean);
  const other = String(state.other[row.key] || "").trim();
  if (other) names.push(`Khác: ${other}`);
  const demo = demoQuestions();
  if (demo && (row.key === demo.gk || row.key === demo.xk)) {
    const total = state.cohort.reduce((sum, c) => sum + (Number(c.n) || 0), 0);
    return `Đang chọn: ${names.join(", ") || "chưa chọn"} · random cùng câu kia theo cơ cấu ${total} học sinh`;
  }
  const poolCount = (state.pools[row.key] || []).length;
  if (!names.length && !row.options.length) return "";
  return `Đang chọn: ${names.join(", ") || "chưa chọn"}${poolCount ? ` · random trong ${poolCount} ô` : ""}`;
}

function renderCohort() {
  if (!demoQuestions()) return "";
  const grades = ["Khối 9", "Khối 10", "Khối 11", "Khối 12"];
  const nOf = (grade, gender) => Number(state.cohort.find((c) => c.grade === grade && c.gender === gender)?.n) || 0;
  const indexOf = (grade, gender) => state.cohort.findIndex((c) => c.grade === grade && c.gender === gender);
  const rows = grades.map((grade) => {
    const nu = nOf(grade, "Nữ");
    const nam = nOf(grade, "Nam");
    return `<tr>
      <th>${esc(grade.replace("Khối ", ""))}</th>
      <td><input data-cohort="${indexOf(grade, "Nữ")}" inputmode="numeric" value="${nu}" aria-label="${esc(grade)} nữ"></td>
      <td><input data-cohort="${indexOf(grade, "Nam")}" inputmode="numeric" value="${nam}" aria-label="${esc(grade)} nam"></td>
      <td data-rowtotal="${esc(grade)}">${nu + nam}</td>
    </tr>`;
  }).join("");
  const nuTotal = state.cohort.filter((c) => c.gender === "Nữ").reduce((s, c) => s + (Number(c.n) || 0), 0);
  const namTotal = state.cohort.filter((c) => c.gender === "Nam").reduce((s, c) => s + (Number(c.n) || 0), 0);
  return `<section class="card cohort">
    <div class="qhead"><h2>Cơ cấu khối × giới tính</h2><button type="button" data-act="cohort-reset">Đặt lại 700</button></div>
    <p>Khối và giới tính được bốc cùng nhau theo số lượng này. Sửa ô nếu muốn đổi tỉ lệ, rồi bấm Random lại.</p>
    <table>
      <thead><tr><th>Khối</th><th>Nữ</th><th>Nam</th><th>Tổng</th></tr></thead>
      <tbody>${rows}<tr><th>Tổng</th><td data-total="nu">${nuTotal}</td><td data-total="nam">${namTotal}</td><th data-total="all">${nuTotal + namTotal}</th></tr></tbody>
    </table>
  </section>`;
}

function paintCohortTotals() {
  const table = document.querySelector(".cohort table");
  if (!table) return;
  for (const grade of ["Khối 9", "Khối 10", "Khối 11", "Khối 12"]) {
    const nu = Number(state.cohort.find((c) => c.grade === grade && c.gender === "Nữ")?.n) || 0;
    const nam = Number(state.cohort.find((c) => c.grade === grade && c.gender === "Nam")?.n) || 0;
    const cell = table.querySelector(`[data-rowtotal="${grade}"]`);
    if (cell) cell.textContent = nu + nam;
  }
  const nuTotal = state.cohort.filter((c) => c.gender === "Nữ").reduce((s, c) => s + (Number(c.n) || 0), 0);
  const namTotal = state.cohort.filter((c) => c.gender === "Nam").reduce((s, c) => s + (Number(c.n) || 0), 0);
  const nuCell = table.querySelector("[data-total=nu]");
  const namCell = table.querySelector("[data-total=nam]");
  const allCell = table.querySelector("[data-total=all]");
  if (nuCell) nuCell.textContent = nuTotal;
  if (namCell) namCell.textContent = namTotal;
  if (allCell) allCell.textContent = nuTotal + namTotal;
}

function renderNav() {
  const nav = $("nav");
  const bits = [];
  (state.data.items || []).forEach((it, i) => {
    if (it.kind !== "heading" || !it.title) return;
    bits.push(`<a class="${it.page ? "page" : ""}" href="#h${i}">${esc(it.title)}</a>`);
  });
  nav.innerHTML = bits.join("");
}

function renderMain() {
  const y = window.scrollY;
  const bits = [];
  if (state.data.intro) {
    bits.push(`<details class="intro"><summary>Lời giới thiệu của phiếu</summary><p>${esc(state.data.intro)}</p></details>`);
  }
  bits.push(renderCohort());
  bits.push(`<p class="legend">Ô <b>đậm</b> là đáp án đang chọn. Viền đứt là vùng random. Ô mờ không được random. Bấm một đáp án để khóa hàng đó. Random lại bỏ qua hàng đã khóa. Khối và giới tính không khóa, và được bốc cùng nhau.</p>`);
  (state.data.items || []).forEach((it, i) => {
    if (it.kind === "heading") {
      if (!it.title && !it.desc) return;
      const tag = it.page ? "h2" : "h3";
      bits.push(`<div class="section-head${it.page ? " page" : ""}" id="h${i}"><${tag}>${esc(it.title)}</${tag}>${it.desc ? `<p class="note">${esc(it.desc)}</p>` : ""}</div>`);
      return;
    }
    bits.push(renderQuestion(it));
  });
  $("main").innerHTML = bits.join("");
  window.scrollTo(0, y);
  paintStats();
  save();
}

function renderQuestion(q) {
  const editing = !!state.editPool[q.key];
  const tools = `<div class="qtools">
    <button type="button" data-act="mode" data-q="${esc(q.key)}" data-mode="answer" class="${editing ? "" : "on"}">Sửa đáp án</button>
    <button type="button" data-act="mode" data-q="${esc(q.key)}" data-mode="pool" class="${editing ? "on" : ""}">Sửa vùng random</button>
    <button type="button" data-act="shuffle" data-q="${esc(q.key)}">Xáo câu này</button>
  </div>`;
  const hint = editing ? `<p class="hint">Đang sửa vùng random. Bấm ô để thêm hoặc bỏ. Rồi bấm Random lại hoặc Xáo câu này.</p>` : "";
  const rows = q.rows.map((row) => renderRow(q, row)).join("");
  return `<article class="card" id="${esc(q.key)}">
    <div class="qhead"><h2>${esc(q.title)}${q.required ? ' <span class="req">*</span>' : ""}</h2></div>
    ${q.desc ? `<p class="note">${esc(q.desc)}</p>` : ""}
    ${isDemoQuestion(q) ? `<p class="note">Random cùng ${q.title.includes("Khối") ? "giới tính" : "khối"}, theo bảng cơ cấu phía trên.</p>` : ""}
    ${q.type === "upload" ? `<p class="note">Câu tải file không điền sẵn được.</p>` : `${tools}${hint}${rows}`}
  </article>`;
}

function renderRow(q, row) {
  if (!row.options.length) {
    const value = esc(state.answers[row.key] || "");
    const field = q.type === "paragraph"
      ? `<textarea data-text="${esc(row.key)}" rows="3">${value}</textarea>`
      : `<input data-text="${esc(row.key)}" value="${value}">`;
    return `<label class="textq">${esc(row.label || "Nội dung")}${field}</label>`;
  }
  const locked = !!state.locked[row.key];
  const solo = !row.label;
  const opts = row.options.map((label, i) => {
    const idx = i + 1;
    return `<button type="button" class="${optClass(row.key, idx)}" data-opt="${idx}" data-key="${esc(row.key)}"><i>${idx}</i><span>${esc(label)}</span></button>`;
  }).join("");
  const other = row.hasOther
    ? `<label class="other">Mục khác<input data-other="${esc(row.key)}" value="${esc(state.other[row.key] || "")}" placeholder="Ghi nội dung nếu chọn mục khác"></label>`
    : "";
  const label = row.label
    ? `<div class="rowlabel"><span>${esc(row.label)}${row.required ? ' <span class="req">*</span>' : ""}</span>${locked ? `<button type="button" class="unlock" data-act="unlock" data-key="${esc(row.key)}">Bỏ khóa</button>` : ""}</div>`
    : `<div class="rowlabel">${locked ? `<button type="button" class="unlock" data-act="unlock" data-key="${esc(row.key)}">Bỏ khóa</button>` : ""}</div>`;
  return `<div class="row${solo ? " solo" : ""}${locked ? " locked" : ""}" data-row="${esc(row.key)}">${label}<div><div class="opts">${opts}</div>${other}<p class="pickline">${esc(pickText(row))}</p></div></div>`;
}

function paintStats() {
  const rows = questions().flatMap((q) => q.rows);
  const filled = rows.filter((r) => answerString(r.key)).length;
  const locked = rows.filter((r) => state.locked[r.key]).length;
  $("stats").textContent = state.data ? `${filled}/${rows.length} ô · khóa ${locked}` : "";
  const miss = missingRequired();
  $("warn").textContent = miss.length ? `Còn ${miss.length} câu bắt buộc trống. Mở form vẫn được, bạn điền nốt trên form.` : "";
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Không gọi được tool");
  return data;
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text || "";
  el.className = isError ? "error" : "";
}

async function loadForm() {
  const source = $("source").value.trim();
  const btn = $("load-btn");
  btn.disabled = true;
  setStatus("Đang đọc form…");
  try {
    const data = await post("/api/load", { source });
    state.source = source;
    state.data = data;
    state.link = "";
    const kept = restore(source);
    if (!kept) applyPreset();
    $("workspace").hidden = false;
    $("dock").hidden = false;
    renderNav();
    renderMain();
    setStatus(kept ? `${data.title}. Đã mở lại lựa chọn lần trước.` : `${data.title}. Khối và giới tính random theo cơ cấu 700 học sinh. Bấm một đáp án để khóa hàng đó.`);
  } catch (ex) {
    setStatus(ex.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function openForm() {
  setStatus("Đang tạo link…");
  try {
    const data = await post("/api/link", { source: state.source, answers: payload() });
    state.link = data.link;
    if (data.long) setStatus("Link rất dài, Google có thể từ chối. Bỏ bớt vài câu rồi tạo lại.", true);
    else setStatus(`Đã mở form trong trình duyệt mới, không cache, ${data.filled} ô. Xem lại rồi tự bấm Gửi.`);
    await post("/api/open", { link: data.link });
    paintStats();
  } catch (ex) {
    setStatus(ex.message, true);
  }
}

async function copyLink() {
  try {
    if (!state.link) {
      const data = await post("/api/link", { source: state.source, answers: payload() });
      state.link = data.link;
    }
    await navigator.clipboard.writeText(state.link);
    setStatus("Đã chép link.");
  } catch (ex) {
    setStatus(ex.message || "Không chép được link", true);
  }
}

$("load-form").addEventListener("submit", (e) => {
  e.preventDefault();
  loadForm();
});

document.body.addEventListener("click", (e) => {
  const opt = e.target.closest("[data-opt]");
  if (opt) {
    const key = opt.dataset.key;
    const found = findRow(key);
    if (!found) return;
    if (state.editPool[found.q.key]) togglePool(key, Number(opt.dataset.opt));
    else choose(key, Number(opt.dataset.opt), found.q, found.row);
    state.link = "";
    renderMain();
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || !state.data && el.dataset.act !== "load") return;
  const act = el.dataset.act;
  if (act === "preset") applyPreset();
  else if (act === "first3") applyFirstThree();
  else if (act === "reroll") reroll();
  else if (act === "clear") {
    state.answers = {};
    state.other = {};
    state.locked = {};
  } else if (act === "unlock-all") state.locked = {};
  else if (act === "cohort-reset") state.cohort = freshCohort();
  else if (act === "mode") {
    state.editPool[el.dataset.q] = el.dataset.mode === "pool";
  } else if (act === "shuffle") shuffleQuestion(el.dataset.q);
  else if (act === "unlock") delete state.locked[el.dataset.key];
  else if (act === "open") return openForm();
  else if (act === "copy") return copyLink();
  else return;
  state.link = "";
  renderMain();
});

document.body.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.other) {
    state.other[t.dataset.other] = t.value;
    if (t.value.trim()) state.locked[t.dataset.other] = true;
  } else if (t.dataset.text) {
    state.answers[t.dataset.text] = t.value;
    if (t.value.trim()) state.locked[t.dataset.text] = true;
  } else if (t.dataset.cohort != null) {
    const n = Number(t.value);
    if (t.value.trim() !== "" && !Number.isNaN(n) && n >= 0) {
      state.cohort[Number(t.dataset.cohort)].n = Math.round(n);
      paintCohortTotals();
    }
  } else return;
  state.link = "";
  save();
  paintStats();
});

loadForm();
