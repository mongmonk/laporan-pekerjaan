import { describe, it, expect } from 'vitest'
import { createReport, updateReport, deleteReport } from '../public/_worker.js'

const ISO = '2026-06-10T08:00:00.000Z'

describe('createReport', () => {
  it('appends a new report with all fields and generated id', () => {
    const { arr, report } = createReport([], {
      title: 'A', description: 'desc', url: 'https://a.dev', git_url: 'https://git/a', status: 'done', date: '2026-06-10',
    }, 123, ISO)
    expect(arr).toHaveLength(1)
    expect(report.id).toBe('report:123')
    expect(report).toMatchObject({
      title: 'A', description: 'desc', url: 'https://a.dev', git_url: 'https://git/a',
      status: 'done', date: '2026-06-10', created_at: ISO,
    })
  })

  it('defaults optional fields (url, git_url, description) to empty and status to pending', () => {
    const { report } = createReport([], { title: 'B', date: '2026-06-10' }, 1, ISO)
    expect(report).toMatchObject({ description: '', url: '', git_url: '', status: 'pending' })
  })

  it('uses today (from nowIso) when date missing', () => {
    const { report } = createReport([], { title: 'C' }, 1, ISO)
    expect(report.date).toBe('2026-06-10')
  })
})

describe('updateReport', () => {
  const base = [{ id: 'report:1', title: 'old', description: 'o', url: '', git_url: '', status: 'pending', date: '2026-06-01', created_at: ISO }]

  it('replaces fields by id and sets updated_at', () => {
    const { arr, report } = updateReport(base, 'report:1', {
      title: 'new', description: 'n', url: 'https://x', git_url: 'https://g', status: 'done', date: '2026-06-02',
    }, '2026-06-11T00:00:00.000Z')
    expect(report).toMatchObject({ id: 'report:1', title: 'new', url: 'https://x', git_url: 'https://g', status: 'done', date: '2026-06-02', updated_at: '2026-06-11T00:00:00.000Z' })
    expect(report.created_at).toBe(ISO)
    expect(arr[0]).toBe(report)
  })

  it('returns report:null when id not found', () => {
    const { arr, report } = updateReport(base, 'report:999', { title: 'x' }, ISO)
    expect(report).toBeNull()
    expect(arr).toBe(base)
  })
})

describe('deleteReport', () => {
  it('removes the report with matching id', () => {
    const arr = [{ id: 'report:1' }, { id: 'report:2' }]
    expect(deleteReport(arr, 'report:1')).toEqual([{ id: 'report:2' }])
  })
})

import { getIndex, migrate, putIndex } from '../public/_worker.js'

function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    async get(k) { return store.has(k) ? store.get(k) : null },
    async put(k, v) { store.set(k, v) },
    async delete(k) { store.delete(k) },
    async list({ prefix } = {}) {
      const keys = [...store.keys()]
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }))
      return { keys, list_complete: true }
    },
    _store: store,
  }
}

describe('getIndex + migrate', () => {
  it('returns parsed index when reports:index exists (no migration)', async () => {
    const KV = makeKV({ 'reports:index': JSON.stringify([{ id: 'report:1', title: 'x' }]) })
    const out = await getIndex({ REPORTS_KV: KV })
    expect(out).toEqual([{ id: 'report:1', title: 'x' }])
  })

  it('migrates legacy report:* keys into the index and deletes old keys', async () => {
    const KV = makeKV({
      'report:1': JSON.stringify({ id: 'report:1', title: 'a' }),
      'report:2': JSON.stringify({ id: 'report:2', title: 'b' }),
    })
    const out = await getIndex({ REPORTS_KV: KV })
    expect(out).toHaveLength(2)
    expect(JSON.parse(KV._store.get('reports:index'))).toHaveLength(2)
    expect(KV._store.has('report:1')).toBe(false)
    expect(KV._store.has('report:2')).toBe(false)
  })

  it('migration writes index before deleting (safe ordering): index present even if we inspect store after', async () => {
    const KV = makeKV({ 'report:1': JSON.stringify({ id: 'report:1' }) })
    await migrate({ REPORTS_KV: KV })
    expect(KV._store.has('reports:index')).toBe(true)
  })

  it('empty store migrates to empty index', async () => {
    const KV = makeKV({})
    const out = await getIndex({ REPORTS_KV: KV })
    expect(out).toEqual([])
  })

  it('putIndex serializes the array', async () => {
    const KV = makeKV({})
    await putIndex({ REPORTS_KV: KV }, [{ id: 'report:9' }])
    expect(KV._store.get('reports:index')).toBe('[{"id":"report:9"}]')
  })
})

import worker from '../public/_worker.js'

function makeEnv(kvInitial = {}) {
  return {
    REPORTS_KV: makeKV(kvInitial),
    ASSETS: { fetch: async () => new Response('static', { status: 200 }) },
    AUTH_PASSWORD: 'Bismillah',
  }
}
const authHeaders = { Authorization: 'Bearer authenticated', 'Content-Type': 'application/json' }

describe('fetch handler', () => {
  it('rejects /api/reports without Authorization', async () => {
    const res = await worker.fetch(new Request('https://x/api/reports'), makeEnv())
    expect(res.status).toBe(401)
  })

  it('auth accepts correct password from env', async () => {
    const res = await worker.fetch(
      new Request('https://x/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'Bismillah' }) }),
      makeEnv()
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ token: 'authenticated' })
  })

  it('GET reports returns migrated legacy data', async () => {
    const env = makeEnv({ 'report:1': JSON.stringify({ id: 'report:1', title: 'old' }) })
    const res = await worker.fetch(new Request('https://x/api/reports', { headers: authHeaders }), env)
    const body = await res.json()
    expect(body.reports).toHaveLength(1)
    expect(env.REPORTS_KV._store.has('report:1')).toBe(false)
  })

  it('POST then GET round-trips a new report', async () => {
    const env = makeEnv()
    const post = await worker.fetch(new Request('https://x/api/reports', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ title: 'New', url: 'https://n', git_url: 'https://g', status: 'progress', date: '2026-06-10' }),
    }), env)
    expect(post.status).toBe(201)
    const get = await worker.fetch(new Request('https://x/api/reports', { headers: authHeaders }), env)
    const body = await get.json()
    expect(body.reports[0]).toMatchObject({ title: 'New', url: 'https://n', git_url: 'https://g', status: 'progress' })
  })

  it('PUT updates and DELETE removes', async () => {
    const env = makeEnv()
    const post = await worker.fetch(new Request('https://x/api/reports', {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ title: 'T', date: '2026-06-10' }),
    }), env)
    const { report } = await post.json()

    const put = await worker.fetch(new Request('https://x/api/reports/' + report.id, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ title: 'T2', date: '2026-06-10', status: 'done' }),
    }), env)
    expect((await put.json()).report).toMatchObject({ title: 'T2', status: 'done' })

    const del = await worker.fetch(new Request('https://x/api/reports/' + report.id, { method: 'DELETE', headers: authHeaders }), env)
    expect(await del.json()).toEqual({ success: true })

    const get = await worker.fetch(new Request('https://x/api/reports', { headers: authHeaders }), env)
    expect((await get.json()).reports).toHaveLength(0)
  })

  it('PUT unknown id returns 404', async () => {
    const env = makeEnv()
    const put = await worker.fetch(new Request('https://x/api/reports/report:nope', {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ title: 'x', date: '2026-06-10' }),
    }), env)
    expect(put.status).toBe(404)
  })
})
