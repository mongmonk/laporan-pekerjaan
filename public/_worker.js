const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const INDEX_KEY = 'reports:index'

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env)
    } catch (err) {
      return json({ error: 'Worker exception', message: String((err && err.message) || err) }, CORS, 500)
    }
  },
}

async function handle(request, env) {
  const url = new URL(request.url)
  const path = url.pathname

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  // Auth
  if (path === '/api/auth' && request.method === 'POST') {
    const body = await request.json()
    const expected = env.AUTH_PASSWORD || 'Bismillah'
    if (body.password === expected) return json({ token: 'authenticated' }, CORS)
    return json({ error: 'Password salah' }, CORS, 401)
  }

  // Require auth for all other /api routes
  if (path.startsWith('/api/')) {
    const auth = request.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, CORS, 401)
    }
  }

  if (path === '/api/reports' && request.method === 'GET') {
    const reports = await getIndex(env)
    return json({ reports }, CORS)
  }

  if (path === '/api/reports' && request.method === 'POST') {
    const body = await request.json()
    const arr = await getIndex(env)
    const { arr: next, report } = createReport(arr, body, Date.now(), new Date().toISOString())
    await putIndex(env, next)
    return json({ report }, CORS, 201)
  }

  const m = path.match(/^\/api\/reports\/(.+)$/)
  if (m && request.method === 'PUT') {
    const body = await request.json()
    const arr = await getIndex(env)
    const { arr: next, report } = updateReport(arr, m[1], body, new Date().toISOString())
    if (!report) return json({ error: 'Not found' }, CORS, 404)
    await putIndex(env, next)
    return json({ report }, CORS)
  }
  if (m && request.method === 'DELETE') {
    const arr = await getIndex(env)
    const next = deleteReport(arr, m[1])
    await putIndex(env, next)
    return json({ success: true }, CORS)
  }

  // Static assets (SPA fallback)
  return env.ASSETS.fetch(request)
}

// ---- Pure data helpers (tested) ----
export function createReport(arr, body, nowMs, nowIso) {
  const report = {
    id: 'report:' + nowMs,
    title: body.title,
    description: body.description || '',
    url: body.url || '',
    git_url: body.git_url || '',
    status: body.status || 'pending',
    date: body.date || nowIso.split('T')[0],
    created_at: nowIso,
  }
  return { arr: [...arr, report], report }
}

export function updateReport(arr, id, body, nowIso) {
  const idx = arr.findIndex((r) => r.id === id)
  if (idx === -1) return { arr, report: null }
  const report = {
    ...arr[idx],
    title: body.title,
    description: body.description || '',
    url: body.url || '',
    git_url: body.git_url || '',
    status: body.status || 'pending',
    date: body.date,
    updated_at: nowIso,
  }
  const next = arr.slice()
  next[idx] = report
  return { arr: next, report }
}

export function deleteReport(arr, id) {
  return arr.filter((r) => r.id !== id)
}

// ---- KV index helpers ----
export async function getIndex(env) {
  const raw = await env.REPORTS_KV.get(INDEX_KEY)
  if (raw !== null) return JSON.parse(raw)
  return migrate(env)
}

export async function putIndex(env, arr) {
  await env.REPORTS_KV.put(INDEX_KEY, JSON.stringify(arr))
}

export async function migrate(env) {
  const list = await env.REPORTS_KV.list({ prefix: 'report:' })
  const arr = []
  for (const key of list.keys) {
    const val = await env.REPORTS_KV.get(key.name)
    if (val) arr.push(JSON.parse(val))
  }
  // Write index FIRST so data is safe even if deletion is interrupted.
  await env.REPORTS_KV.put(INDEX_KEY, JSON.stringify(arr))
  for (const key of list.keys) {
    await env.REPORTS_KV.delete(key.name)
  }
  return arr
}

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
