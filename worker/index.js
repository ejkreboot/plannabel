function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

function displayNameFromEmail(email) {
  const local = email.split("@")[0];
  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function getState(env, request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  const me = email ? { email, name: displayNameFromEmail(email) } : null;

  const { results: subjects } = await env.DB.prepare(
    "SELECT id, name, emoji, color FROM subjects ORDER BY sort_order, id"
  ).all();
  const { results: todos } = await env.DB.prepare(
    "SELECT id, subject_id, title, done, created_at, completed_at FROM todos ORDER BY sort_order, id"
  ).all();

  const bySubject = new Map(subjects.map((s) => [s.id, { ...s, todos: [] }]));
  for (const todo of todos) {
    const subject = bySubject.get(todo.subject_id);
    if (subject) {
      subject.todos.push({
        id: todo.id,
        title: todo.title,
        done: !!todo.done,
        created_at: todo.created_at,
        completed_at: todo.completed_at,
      });
    }
  }

  return json({ me, subjects: [...bySubject.values()] });
}

async function createSubject(env, request) {
  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return json({ error: "name is required" }, { status: 400 });
  const emoji = body.emoji || "📘";
  const color = body.color || "#4B6B47";

  const { results } = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM subjects"
  ).all();
  const sortOrder = results[0].next;

  const result = await env.DB.prepare(
    "INSERT INTO subjects (name, emoji, color, sort_order) VALUES (?, ?, ?, ?) RETURNING id, name, emoji, color"
  )
    .bind(name, emoji, color, sortOrder)
    .first();

  return json({ ...result, todos: [] }, { status: 201 });
}

async function updateSubject(env, request, id) {
  const body = await request.json();
  const fields = [];
  const values = [];
  for (const key of ["name", "emoji", "color"]) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (!fields.length) return json({ error: "no fields to update" }, { status: 400 });
  values.push(id);

  const result = await env.DB.prepare(
    `UPDATE subjects SET ${fields.join(", ")} WHERE id = ? RETURNING id, name, emoji, color`
  )
    .bind(...values)
    .first();

  if (!result) return json({ error: "not found" }, { status: 404 });
  return json(result);
}

async function deleteSubject(env, id) {
  await env.DB.prepare("DELETE FROM subjects WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

async function createTodo(env, request) {
  const body = await request.json();
  const title = (body.title || "").trim();
  const subjectId = body.subject_id;
  if (!title || !subjectId) {
    return json({ error: "subject_id and title are required" }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE subject_id = ?"
  )
    .bind(subjectId)
    .all();
  const sortOrder = results[0].next;

  const result = await env.DB.prepare(
    "INSERT INTO todos (subject_id, title, sort_order) VALUES (?, ?, ?) RETURNING id, subject_id, title, done, created_at, completed_at"
  )
    .bind(subjectId, title, sortOrder)
    .first();

  return json(
    {
      id: result.id,
      title: result.title,
      done: !!result.done,
      created_at: result.created_at,
      completed_at: result.completed_at,
    },
    { status: 201 }
  );
}

async function updateTodo(env, request, id) {
  const body = await request.json();
  const fields = [];
  const values = [];
  if (body.title !== undefined) {
    fields.push("title = ?");
    values.push(body.title);
  }
  if (body.done !== undefined) {
    fields.push("done = ?");
    values.push(body.done ? 1 : 0);
    fields.push("completed_at = ?");
    values.push(body.done ? new Date().toISOString() : null);
  }
  if (!fields.length) return json({ error: "no fields to update" }, { status: 400 });
  values.push(id);

  const result = await env.DB.prepare(
    `UPDATE todos SET ${fields.join(", ")} WHERE id = ? RETURNING id, title, done, created_at, completed_at`
  )
    .bind(...values)
    .first();

  if (!result) return json({ error: "not found" }, { status: 404 });
  return json({
    id: result.id,
    title: result.title,
    done: !!result.done,
    created_at: result.created_at,
    completed_at: result.completed_at,
  });
}

async function deleteTodo(env, id) {
  await env.DB.prepare("DELETE FROM todos WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/state" && method === "GET") {
        return await getState(env, request);
      }
      if (pathname === "/api/subjects" && method === "POST") {
        return await createSubject(env, request);
      }
      const subjectMatch = pathname.match(/^\/api\/subjects\/(\d+)$/);
      if (subjectMatch && method === "PATCH") {
        return await updateSubject(env, request, Number(subjectMatch[1]));
      }
      if (subjectMatch && method === "DELETE") {
        return await deleteSubject(env, Number(subjectMatch[1]));
      }
      if (pathname === "/api/todos" && method === "POST") {
        return await createTodo(env, request);
      }
      const todoMatch = pathname.match(/^\/api\/todos\/(\d+)$/);
      if (todoMatch && method === "PATCH") {
        return await updateTodo(env, request, Number(todoMatch[1]));
      }
      if (todoMatch && method === "DELETE") {
        return await deleteTodo(env, Number(todoMatch[1]));
      }

      return json({ error: "not found" }, { status: 404 });
    } catch (err) {
      return json({ error: err.message }, { status: 500 });
    }
  },
};
