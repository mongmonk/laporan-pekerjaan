export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors })
    }

    // Auth endpoint
    if (path === '/api/auth' && request.method === 'POST') {
      const body = await request.json()
      if (body.password === env.AUTH_PASSWORD) {
        return json({ token: 'authenticated' }, cors)
      }
      return json({ error: 'Password salah' }, cors, 401)
    }

    // Verify auth for all /api routes
    if (path.startsWith('/api/')) {
      const auth = request.headers.get('Authorization')
      if (!auth || !auth.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, cors, 401)
      }
    }

    // GET /api/reports - list all
    if (path === '/api/reports' && request.method === 'GET') {
      const list = await env.REPORTS_KV.list({ prefix: 'report:' })
      const reports = []
      for (const key of list.keys) {
        const val = await env.REPORTS_KV.get(key.name)
        if (val) reports.push(JSON.parse(val))
      }
      return json({ reports }, cors)
    }

    // POST /api/reports - create
    if (path === '/api/reports' && request.method === 'POST') {
      const body = await request.json()
      const id = 'report:' + Date.now()
      const report = {
        id,
        title: body.title,
        description: body.description || '',
        status: body.status || 'pending',
        date: body.date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      }
      await env.REPORTS_KV.put(id, JSON.stringify(report))
      return json({ report }, cors, 201)
    }

    // PUT /api/reports/:id - update
    const putMatch = path.match(/^\/api\/reports\/(.+)$/)
    if (putMatch && request.method === 'PUT') {
      const id = putMatch[1]
      const existing = await env.REPORTS_KV.get(id)
      if (!existing) return json({ error: 'Not found' }, cors, 404)
      const body = await request.json()
      const report = {
        ...JSON.parse(existing),
        title: body.title,
        description: body.description || '',
        status: body.status || 'pending',
        date: body.date,
        updated_at: new Date().toISOString(),
      }
      await env.REPORTS_KV.put(id, JSON.stringify(report))
      return json({ report }, cors)
    }

    // DELETE /api/reports/:id - delete
    const delMatch = path.match(/^\/api\/reports\/(.+)$/)
    if (delMatch && request.method === 'DELETE') {
      const id = delMatch[1]
      await env.REPORTS_KV.delete(id)
      return json({ success: true }, cors)
    }

    // Serve static files (SPA fallback)
    return env.ASSETS.fetch(request)
  },
}

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
