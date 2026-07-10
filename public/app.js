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
}

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
  todo.done = done;
  render();
  if (done) fireConfetti(checkboxEl, subject.color);
  try {
    await api(`/api/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ done }) });
  } catch (err) {
    todo.done = !done;
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
