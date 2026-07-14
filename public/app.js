const EMOJI_OPTIONS = ["📐", "🧪", "📖", "✍️", "🌍", "🎨", "🎵", "💻", "🌐", "🚗", "🏃", "📘"];
const COLOR_OPTIONS = [
  { name: "Fern", value: "#4b6b47" },
  { name: "Terracotta", value: "#c1704a" },
  { name: "Ochre", value: "#d3a441" },
  { name: "Eucalyptus", value: "#6e9088" },
  { name: "Moss", value: "#8fa377" },
  { name: "Plum", value: "#8c5b6b" },
];

const ENCOURAGEMENTS = [
  { min: 100, text: "Summer homework: crushed. 🎉" },
  { min: 75, text: "Almost done — so close!" },
  { min: 50, text: "Halfway there — keep going!" },
  { min: 25, text: "Building momentum 🎈" },
  { min: 1, text: "Off to a good start!" },
  { min: 0, text: "Ready when you are ✨" },
];

let state = { me: null, subjects: [] };
let selectedEmoji = EMOJI_OPTIONS[0];
let selectedColor = COLOR_OPTIONS[0].value;

const el = {
  greeting: document.getElementById("greeting"),
  encouragement: document.getElementById("encouragement"),
  overallFill: document.getElementById("overallFill"),
  overallCaption: document.getElementById("overallCaption"),
  emptyState: document.getElementById("emptyState"),
  subjectsGrid: document.getElementById("subjectsGrid"),
  addSubjectBtn: document.getElementById("addSubjectBtn"),
  modalBackdrop: document.getElementById("subjectModalBackdrop"),
  subjectForm: document.getElementById("subjectForm"),
  subjectName: document.getElementById("subjectName"),
  emojiPicker: document.getElementById("emojiPicker"),
  colorPicker: document.getElementById("colorPicker"),
  cancelSubjectBtn: document.getElementById("cancelSubjectBtn"),
  confettiLayer: document.getElementById("confettiLayer"),
  burndownCard: document.getElementById("burndownCard"),
  burndownCaption: document.getElementById("burndownCaption"),
  burndownSvg: document.getElementById("burndownSvg"),
  burndownChartWrap: document.getElementById("burndownChartWrap"),
  burndownTooltip: document.getElementById("burndownTooltip"),
};

function totalCounts(subjects) {
  let total = 0;
  let done = 0;
  for (const s of subjects) {
    total += s.todos.length;
    done += s.todos.filter((t) => t.done).length;
  }
  return { total, done };
}

function percentOf(list) {
  if (!list.length) return 0;
  return Math.round((list.filter((t) => t.done).length / list.length) * 100);
}

function encouragementFor(pct) {
  return ENCOURAGEMENTS.find((e) => pct >= e.min).text;
}

function render() {
  el.greeting.textContent = state.me ? `Hi ${state.me.name}!` : "";

  const { total, done } = totalCounts(state.subjects);
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.encouragement.textContent = encouragementFor(pct);
  el.overallFill.style.width = `${pct}%`;
  el.overallFill.dataset.full = pct >= 100 ? "true" : "false";
  el.overallCaption.textContent = total
    ? `${done} of ${total} to-dos done (${pct}%)`
    : "Add a subject to get started.";

  el.emptyState.hidden = state.subjects.length > 0;
  el.subjectsGrid.innerHTML = "";
  for (const subject of state.subjects) {
    el.subjectsGrid.appendChild(renderSubjectCard(subject));
  }

  renderBurndown(state.subjects);
}

/* ---------- Burn-down chart ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const burndown = { markers: [], vbW: 640, vbH: 200 };

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderBurndown(subjects) {
  const allTodos = subjects.flatMap((s) => s.todos);
  if (!allTodos.length) {
    el.burndownCard.hidden = true;
    return;
  }
  el.burndownCard.hidden = false;

  const total = allTodos.length;
  const createdTimes = allTodos
    .map((t) => new Date(t.created_at).getTime())
    .filter((t) => !Number.isNaN(t));
  const startDay = dayFromKey(dayKey(new Date(createdTimes.length ? Math.min(...createdTimes) : Date.now())));
  const todayDay = dayFromKey(dayKey(new Date()));

  const completedByDay = new Map();
  for (const t of allTodos) {
    if (!t.completed_at) continue;
    const d = new Date(t.completed_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    completedByDay.set(key, (completedByDay.get(key) || 0) + 1);
  }
  const sortedDayKeys = [...completedByDay.keys()].sort();

  const points = [{ date: startDay, remaining: total, isToday: startDay.getTime() === todayDay.getTime() }];
  let cumulative = 0;
  for (const key of sortedDayKeys) {
    cumulative += completedByDay.get(key);
    const date = dayFromKey(key);
    points.push({ date, remaining: total - cumulative, isToday: date.getTime() === todayDay.getTime() });
  }
  const last = points[points.length - 1];
  if (todayDay.getTime() > last.date.getTime()) {
    points.push({ date: todayDay, remaining: last.remaining, isToday: true });
  }

  drawBurndownChart(points, total);

  const doneCount = allTodos.filter((t) => t.done).length;
  el.burndownCaption.textContent = `${doneCount} of ${total} done since ${formatDay(startDay)}`;
}

function drawBurndownChart(points, total) {
  const svg = el.burndownSvg;
  svg.innerHTML = "";

  const { vbW, vbH } = burndown;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 26;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;
  const plotBottom = padT + plotH;

  let domainStart = points[0].date.getTime();
  let domainEnd = points[points.length - 1].date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (domainEnd - domainStart < oneDay) domainEnd = domainStart + oneDay;

  const scaleX = (t) => padL + ((t - domainStart) / (domainEnd - domainStart)) * plotW;
  const scaleY = (remaining) => plotBottom - (total ? (remaining / total) * plotH : 0);

  svg.appendChild(
    svgEl("line", {
      x1: padL,
      y1: plotBottom,
      x2: padL + plotW,
      y2: plotBottom,
      stroke: "var(--line)",
      "stroke-width": 1.5,
    })
  );

  const px = points.map((p) => scaleX(p.date.getTime()));
  const py = points.map((p) => scaleY(p.remaining));

  let linePath = `M ${px[0]} ${py[0]}`;
  for (let i = 1; i < points.length; i++) {
    linePath += ` L ${px[i]} ${py[i - 1]} L ${px[i]} ${py[i]}`;
  }
  const areaPath = `${linePath} L ${px[px.length - 1]} ${plotBottom} L ${px[0]} ${plotBottom} Z`;

  svg.appendChild(svgEl("path", { d: areaPath, fill: "var(--fern)", "fill-opacity": 0.12, stroke: "none" }));
  svg.appendChild(
    svgEl("path", {
      d: linePath,
      fill: "none",
      stroke: "var(--fern)",
      "stroke-width": 3,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  burndown.markers = [];
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    svg.appendChild(
      svgEl("circle", {
        cx: px[i],
        cy: py[i],
        r: isLast ? 5 : 4,
        fill: isLast ? "var(--fern)" : "var(--paper)",
        stroke: "var(--fern)",
        "stroke-width": 2,
      })
    );
    burndown.markers.push({ x: px[i], y: py[i], point: p });
  });

  const startLabel = svgEl("text", {
    x: px[0],
    y: plotBottom + 18,
    "text-anchor": "start",
    fill: "var(--ink-soft)",
    "font-size": 11,
    "font-family": "Karla, sans-serif",
  });
  startLabel.textContent = formatDay(points[0].date);
  svg.appendChild(startLabel);

  const lastPoint = points[points.length - 1];
  if (px[px.length - 1] - px[0] > 40) {
    const endLabel = svgEl("text", {
      x: px[px.length - 1],
      y: plotBottom + 18,
      "text-anchor": "end",
      fill: "var(--ink-soft)",
      "font-size": 11,
      "font-family": "Karla, sans-serif",
    });
    endLabel.textContent = lastPoint.isToday ? "today" : formatDay(lastPoint.date);
    svg.appendChild(endLabel);
  }

  const hoverLine = svgEl("line", {
    x1: px[0],
    y1: padT,
    x2: px[0],
    y2: plotBottom,
    stroke: "var(--ink-soft)",
    "stroke-width": 1,
    "stroke-dasharray": "3,3",
    opacity: 0,
  });
  svg.appendChild(hoverLine);
  const hoverDot = svgEl("circle", {
    r: 6,
    fill: "var(--fern)",
    stroke: "var(--paper)",
    "stroke-width": 2,
    opacity: 0,
  });
  svg.appendChild(hoverDot);
  burndown.hoverLine = hoverLine;
  burndown.hoverDot = hoverDot;
}

function handleBurndownMove(e) {
  if (!burndown.markers.length) return;
  const rect = el.burndownSvg.getBoundingClientRect();
  if (!rect.width) return;
  const scale = burndown.vbW / rect.width;
  const localX = (e.clientX - rect.left) * scale;

  let nearest = burndown.markers[0];
  let bestDist = Infinity;
  for (const m of burndown.markers) {
    const dist = Math.abs(m.x - localX);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = m;
    }
  }

  burndown.hoverLine.setAttribute("x1", nearest.x);
  burndown.hoverLine.setAttribute("x2", nearest.x);
  burndown.hoverLine.setAttribute("opacity", 1);
  burndown.hoverDot.setAttribute("cx", nearest.x);
  burndown.hoverDot.setAttribute("cy", nearest.y);
  burndown.hoverDot.setAttribute("opacity", 1);

  const wrapRect = el.burndownChartWrap.getBoundingClientRect();
  el.burndownTooltip.style.left = `${wrapRect.width * (nearest.x / burndown.vbW)}px`;
  el.burndownTooltip.style.top = `${wrapRect.height * (nearest.y / burndown.vbH)}px`;
  const label = nearest.point.isToday ? "today" : formatDay(nearest.point.date);
  el.burndownTooltip.textContent = `${nearest.point.remaining} left · ${label}`;
  el.burndownTooltip.hidden = false;
}

function handleBurndownLeave() {
  if (burndown.hoverLine) burndown.hoverLine.setAttribute("opacity", 0);
  if (burndown.hoverDot) burndown.hoverDot.setAttribute("opacity", 0);
  el.burndownTooltip.hidden = true;
}

el.burndownChartWrap.addEventListener("pointermove", handleBurndownMove);
el.burndownChartWrap.addEventListener("pointerleave", handleBurndownLeave);

function renderSubjectCard(subject) {
  const card = document.createElement("div");
  card.className = "subject-card";

  const tape = document.createElement("div");
  tape.className = "subject-tape";
  tape.style.background = `repeating-linear-gradient(45deg, ${subject.color}, ${subject.color} 6px, #fff 6px, #fff 12px)`;
  card.appendChild(tape);

  const head = document.createElement("div");
  head.className = "subject-head";
  head.innerHTML = `
    <span class="subject-emoji">${subject.emoji}</span>
    <h3 class="subject-name"></h3>
    <button class="subject-delete" type="button" title="Delete subject" aria-label="Delete ${subject.name}">✕</button>
  `;
  head.querySelector(".subject-name").textContent = subject.name;
  head.querySelector(".subject-delete").addEventListener("click", () => deleteSubject(subject.id));
  card.appendChild(head);

  const pct = percentOf(subject.todos);
  const bar = document.createElement("div");
  bar.className = "bracelet-bar";
  bar.innerHTML = `<div class="bracelet-fill" style="width:${pct}%; background: repeating-linear-gradient(45deg, ${subject.color}, ${subject.color} 9px, #fff2 9px, #fff2 18px), ${subject.color};" data-full="${pct >= 100}"></div>`;
  card.appendChild(bar);

  const list = document.createElement("ul");
  list.className = "todo-list";
  for (const todo of subject.todos) {
    list.appendChild(renderTodoItem(subject, todo));
  }
  card.appendChild(list);

  const form = document.createElement("form");
  form.className = "add-todo-form";
  form.dataset.subjectId = subject.id;
  form.innerHTML = `
    <input class="add-todo-input" type="text" placeholder="Add a to-do..." maxlength="80" required autocomplete="off" />
    <button class="add-todo-submit" type="submit">+</button>
  `;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    input.disabled = true;
    await addTodo(subject.id, title);
    input.disabled = false;
  });
  card.appendChild(form);

  return card;
}

function renderTodoItem(subject, todo) {
  const li = document.createElement("li");
  li.className = "todo-item";
  li.innerHTML = `
    <input type="checkbox" class="todo-check" ${todo.done ? "checked" : ""} aria-label="${todo.title}" />
    <span class="todo-title ${todo.done ? "done" : ""}"></span>
    <button class="todo-delete" type="button" aria-label="Delete to-do">✕</button>
  `;
  li.querySelector(".todo-title").textContent = todo.title;
  const checkbox = li.querySelector(".todo-check");
  checkbox.addEventListener("change", (e) => toggleTodo(subject, todo, e.target.checked, checkbox));
  li.querySelector(".todo-delete").addEventListener("click", () => deleteTodo(subject.id, todo.id));
  return li;
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadState() {
  state = await api("/api/state");
  render();
}

async function addTodo(subjectId, title) {
  const todo = await api("/api/todos", {
    method: "POST",
    body: JSON.stringify({ subject_id: subjectId, title }),
  });
  const subject = state.subjects.find((s) => s.id === subjectId);
  subject.todos.push(todo);
  render();
  const form = document.querySelector(`.add-todo-form[data-subject-id="${subjectId}"]`);
  if (form) form.querySelector("input").focus();
}

async function toggleTodo(subject, todo, done, checkboxEl) {
  const prevCompletedAt = todo.completed_at;
  todo.done = done;
  todo.completed_at = done ? new Date().toISOString() : null;
  render();
  if (done) fireConfetti(checkboxEl, subject.color);
  try {
    const result = await api(`/api/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ done }) });
    todo.completed_at = result.completed_at;
    render();
  } catch (err) {
    todo.done = !done;
    todo.completed_at = prevCompletedAt;
    render();
  }
}

async function deleteTodo(subjectId, todoId) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  subject.todos = subject.todos.filter((t) => t.id !== todoId);
  render();
  await api(`/api/todos/${todoId}`, { method: "DELETE" });
}

async function deleteSubject(subjectId) {
  state.subjects = state.subjects.filter((s) => s.id !== subjectId);
  render();
  await api(`/api/subjects/${subjectId}`, { method: "DELETE" });
}

function fireConfetti(originEl, color) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = originEl.getBoundingClientRect();
  const colors = [color, "#d3a441", "#6e9088", "#c1704a"];
  for (let i = 0; i < 14; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${rect.left + rect.width / 2 + (Math.random() * 40 - 20)}px`;
    piece.style.top = `${rect.top}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.confettiLayer.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

function buildEmojiPicker() {
  el.emojiPicker.innerHTML = "";
  for (const emoji of EMOJI_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-option";
    btn.textContent = emoji;
    btn.setAttribute("aria-pressed", emoji === selectedEmoji ? "true" : "false");
    btn.addEventListener("click", () => {
      selectedEmoji = emoji;
      [...el.emojiPicker.children].forEach((c) => c.setAttribute("aria-pressed", c === btn ? "true" : "false"));
    });
    el.emojiPicker.appendChild(btn);
  }
}

function buildColorPicker() {
  el.colorPicker.innerHTML = "";
  for (const color of COLOR_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-option";
    btn.style.background = color.value;
    btn.title = color.name;
    btn.setAttribute("aria-pressed", color.value === selectedColor ? "true" : "false");
    btn.addEventListener("click", () => {
      selectedColor = color.value;
      [...el.colorPicker.children].forEach((c) => c.setAttribute("aria-pressed", c === btn ? "true" : "false"));
    });
    el.colorPicker.appendChild(btn);
  }
}

function openModal() {
  selectedEmoji = EMOJI_OPTIONS[0];
  selectedColor = COLOR_OPTIONS[0].value;
  el.subjectName.value = "";
  buildEmojiPicker();
  buildColorPicker();
  el.modalBackdrop.hidden = false;
  el.subjectName.focus();
}

function closeModal() {
  el.modalBackdrop.hidden = true;
}

el.addSubjectBtn.addEventListener("click", openModal);
el.cancelSubjectBtn.addEventListener("click", closeModal);
el.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === el.modalBackdrop) closeModal();
});

el.subjectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.subjectName.value.trim();
  if (!name) return;
  const subject = await api("/api/subjects", {
    method: "POST",
    body: JSON.stringify({ name, emoji: selectedEmoji, color: selectedColor }),
  });
  state.subjects.push(subject);
  render();
  closeModal();
});

loadState();
