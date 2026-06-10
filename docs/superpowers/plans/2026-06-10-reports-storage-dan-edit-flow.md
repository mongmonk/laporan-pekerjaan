# Reports Storage + Edit Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan penyimpanan KV ke satu index key (dengan migrasi otomatis), ganti form tambah/edit jadi modal, tambah field URL & Git URL, dan tambah filter tanggal (hari/bulan/rentang).

**Architecture:** Backend Cloudflare Pages `_worker.js` direfaktor agar logika data jadi fungsi murni yang bisa diuji + helper KV `getIndex/putIndex/migrate`. Frontend React dipecah dari satu `App.jsx` monolitik menjadi komponen terfokus (`ReportModal`, `ReportItem`, `DateFilter`) plus modul logika murni (`src/lib/reports.js`). Vitest dipasang untuk menguji logika berisiko (migrasi, CRUD array, filter) dan perilaku komponen kunci.

**Tech Stack:** React 18 + Vite, Cloudflare Pages advanced-mode `_worker.js` + KV, date-fns, Vitest + @testing-library/react + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-10-reports-storage-dan-edit-flow-design.md`

---

## File Structure

**Backend**
- Modify: `public/_worker.js` — tambah named export fungsi murni (`createReport`, `updateReport`, `deleteReport`) + helper KV (`getIndex`, `putIndex`, `migrate`); wire `fetch` handler memakai helper.

**Frontend (baru — pecah dari App.jsx)**
- Create: `src/lib/reports.js` — `shortHost(url)`, `filterReports(reports, criteria)` (logika murni).
- Create: `src/components/ReportModal.jsx` — form tambah/edit dalam modal.
- Create: `src/components/ReportItem.jsx` — kartu laporan + link URL/Git (dipindah dari App.jsx).
- Create: `src/components/DateFilter.jsx` — pemilih mode tanggal + input.
- Modify: `src/App.jsx` — pakai modal & filter, hapus form inline, update export CSV/PDF.
- Modify: `src/index.css` — gaya modal, segmented, link, filter.

**Tests**
- Create: `test/worker.test.js`, `src/lib/reports.test.js`, `src/components/ReportModal.test.jsx`, `src/components/ReportItem.test.jsx`, `src/components/DateFilter.test.jsx`.
- Create: `src/test/setup.js` (jest-dom), config di `vite.config.js`.

---

## Task 1: Pasang Vitest + testing library

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/test/setup.js`
- Create: `src/test/smoke.test.js`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest@^2.1.0 jsdom@^25.0.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.5.0 @testing-library/user-event@^14.5.0
```
Expected: paket masuk ke `devDependencies`.

- [ ] **Step 2: Add test script to package.json**

Di `package.json`, bagian `"scripts"`, tambahkan baris `test`:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Configure vitest in vite.config.js**

Ganti seluruh isi `vite.config.js` dengan:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
```

- [ ] **Step 4: Create test setup file**

Create `src/test/setup.js`:
```js
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create a smoke test**

Create `src/test/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2)
  })
  it('has Request/Response globals for worker tests', () => {
    expect(typeof Request).toBe('function')
    expect(typeof Response).toBe('function')
  })
})
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: PASS (2 tests). Jika `Request`/`Response` undefined, jalankan dengan Node 18+ (`node -v` harus ≥ 18).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js src/test/smoke.test.js
git commit -m "test: setup vitest + testing-library"
```

---

## Task 2: Fungsi murni CRUD laporan (worker)

**Files:**
- Modify: `public/_worker.js`
- Create: `test/worker.test.js`

- [ ] **Step 1: Write failing tests for createReport/updateReport/deleteReport**

Create `test/worker.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/worker.test.js`
Expected: FAIL — `createReport is not a function` (belum diexport).

- [ ] **Step 3: Refactor `public/_worker.js` to export pure helpers**

Ganti seluruh isi `public/_worker.js` dengan:
```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/worker.test.js`
Expected: PASS (semua test di blok createReport/updateReport/deleteReport).

- [ ] **Step 5: Commit**

```bash
git add public/_worker.js test/worker.test.js
git commit -m "refactor(worker): pure createReport/updateReport/deleteReport helpers"
```

---

## Task 3: getIndex + migrasi otomatis (worker)

**Files:**
- Modify: `test/worker.test.js`

- [ ] **Step 1: Add a fake KV + migration tests**

Tambahkan di akhir `test/worker.test.js`:
```js
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
    // index written
    expect(JSON.parse(KV._store.get('reports:index'))).toHaveLength(2)
    // old keys removed
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
```

- [ ] **Step 2: Run to verify pass**

Run: `npm test -- test/worker.test.js`
Expected: PASS (helper `getIndex/migrate/putIndex` sudah diexport di Task 2, jadi test ini langsung hijau).

- [ ] **Step 3: Commit**

```bash
git add test/worker.test.js
git commit -m "test(worker): cover getIndex + auto-migration with fake KV"
```

---

## Task 4: Integrasi fetch handler (worker end-to-end)

**Files:**
- Modify: `test/worker.test.js`

- [ ] **Step 1: Add end-to-end handler tests**

Tambahkan di akhir `test/worker.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify pass**

Run: `npm test -- test/worker.test.js`
Expected: PASS (semua blok). Jika `new Request(...).json()` error, pastikan Node ≥ 18.

- [ ] **Step 3: Commit**

```bash
git add test/worker.test.js
git commit -m "test(worker): end-to-end fetch handler (auth, CRUD, migration)"
```

---

## Task 5: Modul logika frontend (`src/lib/reports.js`)

**Files:**
- Create: `src/lib/reports.js`
- Create: `src/lib/reports.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/lib/reports.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { shortHost, filterReports, currentMonthRange } from './reports.js'

describe('shortHost', () => {
  it('strips protocol and www, drops trailing slash', () => {
    expect(shortHost('https://www.example.com/')).toBe('example.com')
  })
  it('keeps path', () => {
    expect(shortHost('https://github.com/user/repo')).toBe('github.com/user/repo')
  })
  it('returns empty string for empty input', () => {
    expect(shortHost('')).toBe('')
  })
  it('returns raw string when not a valid URL', () => {
    expect(shortHost('not a url')).toBe('not a url')
  })
})

describe('filterReports', () => {
  const reports = [
    { id: 'a', status: 'done', date: '2026-06-01' },
    { id: 'b', status: 'pending', date: '2026-06-10' },
    { id: 'c', status: 'done', date: '2026-07-05' },
  ]
  it('returns all when no criteria', () => {
    expect(filterReports(reports, {})).toHaveLength(3)
  })
  it('filters by status', () => {
    expect(filterReports(reports, { status: 'done' }).map((r) => r.id)).toEqual(['a', 'c'])
  })
  it('filters by exact day', () => {
    expect(filterReports(reports, { dateMode: 'day', day: '2026-06-10' }).map((r) => r.id)).toEqual(['b'])
  })
  it('filters by month (YYYY-MM)', () => {
    expect(filterReports(reports, { dateMode: 'month', month: '2026-06' }).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('filters by inclusive range', () => {
    expect(filterReports(reports, { dateMode: 'range', from: '2026-06-05', to: '2026-07-10' }).map((r) => r.id)).toEqual(['b', 'c'])
  })
  it('combines status AND date (AND semantics)', () => {
    expect(filterReports(reports, { status: 'done', dateMode: 'month', month: '2026-06' }).map((r) => r.id)).toEqual(['a'])
  })
  it('ignores empty date inputs (treats as no date filter)', () => {
    expect(filterReports(reports, { dateMode: 'day', day: '' })).toHaveLength(3)
  })
})

describe('currentMonthRange', () => {
  it('returns first and last day of the given month', () => {
    expect(currentMonthRange(new Date(2026, 5, 15))).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })
  it('handles February correctly', () => {
    expect(currentMonthRange(new Date(2026, 1, 3))).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('pads single-digit months/days', () => {
    expect(currentMonthRange(new Date(2026, 0, 1))).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/reports.test.js`
Expected: FAIL — cannot find module `./reports.js`.

- [ ] **Step 3: Implement `src/lib/reports.js`**

Create `src/lib/reports.js`:
```js
export function shortHost(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    const s = u.host.replace(/^www\./, '') + u.pathname
    return s.replace(/\/$/, '')
  } catch {
    return url
  }
}

export function filterReports(reports, criteria) {
  const { status = 'all', dateMode = 'all', day = '', month = '', from = '', to = '' } = criteria || {}
  return reports.filter((r) => {
    if (status !== 'all' && r.status !== status) return false
    if (dateMode === 'day' && day) return r.date === day
    if (dateMode === 'month' && month) return (r.date || '').slice(0, 7) === month
    if (dateMode === 'range') {
      if (from && r.date < from) return false
      if (to && r.date > to) return false
    }
    return true
  })
}

export function currentMonthRange(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const pad = (n) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).getDate()
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/reports.test.js`
Expected: PASS (semua test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports.js src/lib/reports.test.js
git commit -m "feat(lib): shortHost + filterReports pure helpers"
```

---

## Task 6: Komponen `ReportModal`

**Files:**
- Create: `src/components/ReportModal.jsx`
- Create: `src/components/ReportModal.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ReportModal.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportModal from './ReportModal.jsx'

describe('ReportModal', () => {
  it('shows "Tambah" title in create mode', () => {
    render(<ReportModal report={null} onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/Tambah Laporan/i)).toBeInTheDocument()
  })

  it('prefills fields in edit mode', () => {
    const report = { id: 'report:1', title: 'Judul', description: 'Desc', url: 'https://a', git_url: 'https://g', status: 'progress', date: '2026-06-10' }
    render(<ReportModal report={report} onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/Edit Laporan/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Judul')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://a')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://g')).toBeInTheDocument()
  })

  it('submits with edited values including url/git_url and chosen status', () => {
    const onSave = vi.fn()
    render(<ReportModal report={null} onSave={onSave} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Judul Pekerjaan/i), { target: { value: 'Baru' } })
    fireEvent.change(screen.getByLabelText(/URL Aplikasi/i), { target: { value: 'https://app' } })
    fireEvent.change(screen.getByLabelText(/Git URL/i), { target: { value: 'https://git' } })
    fireEvent.click(screen.getByRole('button', { name: /In Progress/i }))
    fireEvent.click(screen.getByRole('button', { name: /Tambah Laporan/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'Baru', url: 'https://app', git_url: 'https://git', status: 'progress' })
  })

  it('does not submit when title is empty', () => {
    const onSave = vi.fn()
    render(<ReportModal report={null} onSave={onSave} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Tambah Laporan/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('closes on Escape, on ✕, and on scrim click', () => {
    const onClose = vi.fn()
    const { container } = render(<ReportModal report={null} onSave={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText(/Tutup/i))
    fireEvent.mouseDown(container.querySelector('.modal-scrim'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/components/ReportModal.test.jsx`
Expected: FAIL — cannot find module `./ReportModal.jsx`.

- [ ] **Step 3: Implement `src/components/ReportModal.jsx`**

Create `src/components/ReportModal.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react'

const STATUSES = [
  ['pending', '⏳ Pending'],
  ['progress', '🔄 In Progress'],
  ['done', '✅ Done'],
]

export default function ReportModal({ report, onSave, onClose }) {
  const isEdit = !!report
  const [date, setDate] = useState(report?.date || new Date().toISOString().split('T')[0])
  const [title, setTitle] = useState(report?.title || '')
  const [description, setDescription] = useState(report?.description || '')
  const [url, setUrl] = useState(report?.url || '')
  const [gitUrl, setGitUrl] = useState(report?.git_url || '')
  const [status, setStatus] = useState(report?.status || 'pending')
  const firstRef = useRef(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ ...(report || {}), date, title, description, url, git_url: gitUrl, status })
  }

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{isEdit ? '✏️ Edit Laporan' : '+ Tambah Laporan'}</h3>
          <button type="button" className="modal-x" aria-label="Tutup" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>Tanggal</span>
            <input ref={firstRef} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Judul Pekerjaan</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Meeting dengan klien" />
          </label>
          <label className="field">
            <span>Deskripsi</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field">
            <span>URL Aplikasi</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label className="field">
            <span>Git URL</span>
            <input type="url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/..." />
          </label>
          <div className="field">
            <span>Status</span>
            <div className="seg">
              {STATUSES.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={`seg-btn seg-${v} ${status === v ? 'on' : ''}`}
                  onClick={() => setStatus(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary">{isEdit ? 'Simpan Perubahan' : 'Tambah Laporan'}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

Note: `<label>` membungkus `<span>label</span>` + input, sehingga `getByLabelText` cocok berdasarkan teks span.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/components/ReportModal.test.jsx`
Expected: PASS (semua test).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportModal.jsx src/components/ReportModal.test.jsx
git commit -m "feat(ui): ReportModal with url/git_url fields + segmented status"
```

---

## Task 7: Komponen `ReportItem` (kartu + link)

**Files:**
- Create: `src/components/ReportItem.jsx`
- Create: `src/components/ReportItem.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ReportItem.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportItem from './ReportItem.jsx'

const base = { id: 'report:1', title: 'Judul', description: 'Desc', url: '', git_url: '', status: 'done', date: '2026-06-10' }

describe('ReportItem', () => {
  it('renders title, description and status label', () => {
    render(<ReportItem report={base} onEdit={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('Judul')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders clickable links (new tab) when url/git_url present', () => {
    render(<ReportItem report={{ ...base, url: 'https://app.dev/', git_url: 'https://github.com/u/r' }} onEdit={() => {}} onDelete={() => {}} />)
    const app = screen.getByRole('link', { name: /app\.dev/i })
    const git = screen.getByRole('link', { name: /github\.com\/u\/r/i })
    expect(app).toHaveAttribute('href', 'https://app.dev/')
    expect(app).toHaveAttribute('target', '_blank')
    expect(git).toHaveAttribute('href', 'https://github.com/u/r')
  })

  it('renders no links when both empty', () => {
    render(<ReportItem report={base} onEdit={() => {}} onDelete={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('calls onEdit and onDelete', () => {
    const onEdit = vi.fn(); const onDelete = vi.fn()
    render(<ReportItem report={base} onEdit={onEdit} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /Hapus/i }))
    expect(onEdit).toHaveBeenCalledWith(base)
    expect(onDelete).toHaveBeenCalledWith('report:1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/components/ReportItem.test.jsx`
Expected: FAIL — cannot find module `./ReportItem.jsx`.

- [ ] **Step 3: Implement `src/components/ReportItem.jsx`**

Create `src/components/ReportItem.jsx`:
```jsx
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { shortHost } from '../lib/reports.js'

const LABELS = { pending: 'Pending', progress: 'In Progress', done: 'Done' }

export default function ReportItem({ report, onEdit, onDelete }) {
  return (
    <div className="report-item">
      <div className="report-content">
        <div className="report-date">
          {format(new Date(report.date), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
        </div>
        <div className="report-title">{report.title}</div>
        {report.description && <div className="report-desc">{report.description}</div>}
        {(report.url || report.git_url) && (
          <div className="report-links">
            {report.url && (
              <a className="report-link" href={report.url} target="_blank" rel="noopener noreferrer">
                🔗 {shortHost(report.url)}
              </a>
            )}
            {report.git_url && (
              <a className="report-link" href={report.git_url} target="_blank" rel="noopener noreferrer">
                🐙 {shortHost(report.git_url)}
              </a>
            )}
          </div>
        )}
        <span className={`status-badge status-${report.status}`}>{LABELS[report.status]}</span>
      </div>
      <div className="report-actions">
        <button className="btn btn-warning" onClick={() => onEdit(report)}>Edit</button>
        <button className="btn btn-danger" onClick={() => onDelete(report.id)}>Hapus</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/components/ReportItem.test.jsx`
Expected: PASS (semua test).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportItem.jsx src/components/ReportItem.test.jsx
git commit -m "feat(ui): ReportItem component with clickable url/git links"
```

---

## Task 8: Komponen `DateFilter`

**Files:**
- Create: `src/components/DateFilter.jsx`
- Create: `src/components/DateFilter.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/DateFilter.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DateFilter from './DateFilter.jsx'

const value = { dateMode: 'all', day: '', month: '', from: '', to: '' }

describe('DateFilter', () => {
  it('renders four mode buttons', () => {
    render(<DateFilter value={value} onChange={() => {}} />)
    ;['Semua', 'Hari', 'Bulan', 'Rentang'].forEach((m) =>
      expect(screen.getByRole('button', { name: m })).toBeInTheDocument()
    )
  })

  it('switching to Hari emits dateMode day', () => {
    const onChange = vi.fn()
    render(<DateFilter value={value} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hari' }))
    expect(onChange).toHaveBeenCalledWith({ ...value, dateMode: 'day' })
  })

  it('shows one date input in day mode and emits day on change', () => {
    const onChange = vi.fn()
    const { container } = render(<DateFilter value={{ ...value, dateMode: 'day' }} onChange={onChange} />)
    const input = container.querySelector('input[type="date"]')
    fireEvent.change(input, { target: { value: '2026-06-10' } })
    expect(onChange).toHaveBeenCalledWith({ ...value, dateMode: 'day', day: '2026-06-10' })
  })

  it('shows month input in month mode', () => {
    const { container } = render(<DateFilter value={{ ...value, dateMode: 'month' }} onChange={() => {}} />)
    expect(container.querySelector('input[type="month"]')).toBeInTheDocument()
  })

  it('shows two date inputs in range mode', () => {
    const { container } = render(<DateFilter value={{ ...value, dateMode: 'range' }} onChange={() => {}} />)
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/components/DateFilter.test.jsx`
Expected: FAIL — cannot find module `./DateFilter.jsx`.

- [ ] **Step 3: Implement `src/components/DateFilter.jsx`**

Create `src/components/DateFilter.jsx`:
```jsx
const MODES = [
  ['all', 'Semua'],
  ['day', 'Hari'],
  ['month', 'Bulan'],
  ['range', 'Rentang'],
]

export default function DateFilter({ value, onChange }) {
  const { dateMode, day, month, from, to } = value
  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className="date-filter">
      <div className="seg">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`seg-btn ${dateMode === m ? 'on' : ''}`}
            onClick={() => set({ dateMode: m })}
          >
            {label}
          </button>
        ))}
      </div>
      {dateMode === 'day' && (
        <input type="date" value={day} onChange={(e) => set({ day: e.target.value })} />
      )}
      {dateMode === 'month' && (
        <input type="month" value={month} onChange={(e) => set({ month: e.target.value })} />
      )}
      {dateMode === 'range' && (
        <>
          <input type="date" value={from} onChange={(e) => set({ from: e.target.value })} />
          <span className="dash">—</span>
          <input type="date" value={to} onChange={(e) => set({ to: e.target.value })} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/components/DateFilter.test.jsx`
Expected: PASS (semua test).

- [ ] **Step 5: Commit**

```bash
git add src/components/DateFilter.jsx src/components/DateFilter.test.jsx
git commit -m "feat(ui): DateFilter (semua/hari/bulan/rentang)"
```

---

## Task 9: Rangkai `App.jsx` (modal + filter + export)

**Files:**
- Modify: `src/App.jsx`

Konteks: `App.jsx` saat ini berisi `api/login` helpers, `LoginScreen`, `ReportForm`, `ReportItem` (inline), `exportCSV`, `exportPDF`, dan `App`. Tugas ini: hapus `ReportForm` & `ReportItem` inline, impor komponen baru, ganti state form → modal, tambahkan state & UI filter, dan update export.

- [ ] **Step 1: Replace imports + remove inline ReportForm/ReportItem**

Di bagian atas `src/App.jsx`, ganti baris import menjadi:
```jsx
import React, { useState, useEffect, useCallback } from 'react'
import ReportModal from './components/ReportModal.jsx'
import ReportItem from './components/ReportItem.jsx'
import DateFilter from './components/DateFilter.jsx'
import { filterReports, currentMonthRange } from './lib/reports.js'
```
Hapus seluruh fungsi `function ReportForm(...) { ... }` dan `function ReportItem(...) { ... }` yang ada di file ini (komponen item kini diimpor; form digantikan modal). Pertahankan `api`, `login`, `LoginScreen`.

- [ ] **Step 2: Update exportCSV/exportPDF to include URL & Git URL**

Ganti fungsi `exportCSV` menjadi:
```jsx
function exportCSV(reports) {
  const header = 'Tanggal,Judul,Deskripsi,URL,Git URL,Status\n'
  const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`
  const rows = reports
    .map((r) => [r.date, r.title, r.description, r.url, r.git_url, r.status].map(esc).join(','))
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `laporan-harian-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```
Ganti baris `<tr>` di `exportPDF` (header & body) untuk menambah dua kolom. Ganti blok template `rows` dan header tabel menjadi:
```jsx
  const rows = reports
    .map(
      (r) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.title}</td>
        <td>${r.description || '-'}</td>
        <td>${r.url || '-'}</td>
        <td>${r.git_url || '-'}</td>
        <td>${r.status}</td>
      </tr>`
    )
    .join('')
```
dan ganti baris `<thead>...`:
```jsx
    <table><thead><tr><th>Tanggal</th><th>Judul</th><th>Deskripsi</th><th>URL</th><th>Git URL</th><th>Status</th></tr></thead>
```
Catatan: `exportPDF` memakai `format(...)` dari date-fns untuk timestamp; karena import date-fns dihapus dari App.jsx di Step 1, ganti baris timestamp `<p>Tanggal Export: ...</p>` menjadi:
```jsx
    <p>Tanggal Export: ${new Date().toLocaleString('id-ID')}</p>
```

- [ ] **Step 3: Replace App component body (state + render)**

Ganti seluruh `export default function App() { ... }` menjadi:
```jsx
export default function App() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(AUTH_KEY))
  const [reports, setReports] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState({ dateMode: 'range', day: '', month: '', ...currentMonthRange() })
  const [loading, setLoading] = useState(true)

  const loadReports = useCallback(async () => {
    setLoading(true)
    const data = await api('/reports')
    if (data?.reports) setReports(data.reports)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authed) loadReports()
  }, [authed, loadReports])

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (report) => { setEditing(report); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const handleSave = async (report) => {
    if (report.id) {
      await api(`/reports/${report.id}`, { method: 'PUT', body: JSON.stringify(report) })
    } else {
      await api('/reports', { method: 'POST', body: JSON.stringify(report) })
    }
    closeModal()
    loadReports()
  }

  const handleDelete = async (reportId) => {
    if (!window.confirm('Yakin hapus laporan ini?')) return
    await api(`/reports/${reportId}`, { method: 'DELETE' })
    loadReports()
  }

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const filtered = filterReports(reports, { status: statusFilter, ...dateFilter })
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))
  const stats = {
    total: reports.length,
    done: reports.filter((r) => r.status === 'done').length,
    progress: reports.filter((r) => r.status === 'progress').length,
  }

  return (
    <div className="app">
      <div className="header">
        <h1>📋 Laporan Harian</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Laporan</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--success)' }}>{stats.done}</div>
          <div className="stat-label">Selesai</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--warning)' }}>{stats.progress}</div>
          <div className="stat-label">In Progress</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openAdd}>+ Tambah Laporan</button>
        <div className="export-btns">
          <button className="btn btn-ghost" onClick={() => exportCSV(sorted)}>📄 Export CSV</button>
          <button className="btn btn-ghost" onClick={() => exportPDF(sorted)}>🖨️ Export PDF</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="pending">⏳ Pending</option>
          <option value="progress">🔄 In Progress</option>
          <option value="done">✅ Done</option>
        </select>
        <DateFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="report-list">
        {loading ? (
          <div className="empty-state">Memuat...</div>
        ) : sorted.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📝</div>
            <p>Belum ada laporan. Tambahkan yang pertama!</p>
          </div>
        ) : (
          sorted.map((r) => (
            <ReportItem key={r.id} report={r} onEdit={openEdit} onDelete={handleDelete} />
          ))
        )}
      </div>

      {modalOpen && (
        <ReportModal report={editing} onSave={handleSave} onClose={closeModal} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the full test suite + build**

Run: `npm test`
Expected: PASS (semua file test).
Run: `npm run build`
Expected: build sukses, tidak ada error import (memastikan App.jsx tidak lagi mereferensi `ReportForm`/`format` yang dihapus).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): wire modal add/edit, date filter, and export columns"
```

---

## Task 10: Gaya CSS (modal, segmented, link, filter)

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append styles to src/index.css**

Tambahkan di akhir `src/index.css`:
```css
/* ---- Modal ---- */
.modal-scrim {
  position: fixed; inset: 0; background: rgba(2, 6, 23, 0.7);
  display: flex; align-items: center; justify-content: center;
  padding: 16px; z-index: 50;
  animation: scrim-in 0.15s ease-out;
}
@keyframes scrim-in { from { opacity: 0 } to { opacity: 1 } }
.modal {
  width: min(480px, 100%); max-height: 90vh; overflow-y: auto;
  background: #111c33; border: 1px solid #2b3c5c; border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); padding: 20px;
  animation: modal-in 0.16s ease-out;
}
@keyframes modal-in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.modal-head h3 { margin: 0; font-size: 18px; }
.modal-x {
  width: 30px; height: 30px; border: none; cursor: pointer;
  border-radius: 8px; background: #1b2742; color: #94a3b8; font-size: 15px;
}
.modal-x:hover { background: #243355; color: #e2e8f0; }
.modal .field { display: block; margin-top: 12px; }
.modal .field > span {
  display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px;
  color: #7c8aa5; margin-bottom: 5px;
}
.modal .field input, .modal .field textarea { width: 100%; }
.modal-actions { display: flex; gap: 10px; margin-top: 18px; }
.modal-actions .btn-primary { flex: 1; }

/* ---- Segmented (status) ---- */
.seg { display: flex; gap: 8px; }
.seg-btn {
  flex: 1; cursor: pointer; font-size: 13px; padding: 9px 6px;
  border-radius: 9px; background: #0a1322; border: 1px solid #2a3a57; color: #8aa0bd;
}
.seg-btn.on { border-color: #3b82f6; color: #fff; background: rgba(59, 130, 246, 0.18); }
.seg-btn.seg-progress.on { border-color: #f59e0b; color: #fcd34d; background: rgba(245, 158, 11, 0.14); }
.seg-btn.seg-done.on { border-color: #22c55e; color: #86efac; background: rgba(34, 197, 94, 0.14); }

/* ---- Report links ---- */
.report-links { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.report-link { font-size: 12.5px; color: #60a5fa; text-decoration: none; width: fit-content; }
.report-link:hover { text-decoration: underline; }

/* ---- Filter bar ---- */
.filter-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.date-filter { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.date-filter .seg { display: inline-flex; gap: 0; border: 1px solid #2a3a57; border-radius: 9px; overflow: hidden; }
.date-filter .seg-btn { flex: none; border: none; border-right: 1px solid #1f2c44; border-radius: 0; }
.date-filter .seg-btn:last-child { border-right: none; }
.date-filter .seg-btn.on { background: #3b82f6; color: #fff; }
.date-filter .dash { color: #64748b; }
```

Catatan: variabel `--success`/`--warning` dan kelas dasar (`.btn`, `.report-item`, `.stat-card`, dll) sudah ada di `index.css`; tugas ini hanya menambah gaya baru.

- [ ] **Step 2: Build to confirm CSS compiles**

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: modal, segmented status, links, and filter bar"
```

---

## Task 11: Verifikasi manual + deploy

**Files:** none (deploy + manual QA)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: semua test PASS.

- [ ] **Step 2: Local preview smoke test**

Run: `npm run build && npm run preview`
Buka URL preview. Karena `/api/*` tidak jalan di preview lokal (tanpa worker+KV), cukup verifikasi: layar login muncul; UI tidak error di console. (Verifikasi fungsional penuh dilakukan setelah deploy.)

- [ ] **Step 3: Commit any build output if tracked, then push**

```bash
git add -A
git commit -m "chore: build output" || echo "nothing to commit"
git push origin main
```
Expected: push sukses; Cloudflare Pages auto-rebuild.

- [ ] **Step 4: Post-deploy functional verification**

Tunggu rebuild (~1-2 menit), lalu di `https://laporan-pekerjaan.pages.dev`:
- Login `Bismillah` → masuk.
- **Migrasi:** 6 laporan lama tetap muncul (data terbawa ke `reports:index`).
- Klik **Edit** di laporan paling bawah → modal terbuka di tengah, halaman tidak lompat; ubah judul → Simpan → berubah.
- **Tambah** laporan baru dengan URL & Git URL → muncul; link tampil sebagai teks pendek, klik buka tab baru.
- **Default filter:** saat app dibuka, mode Rentang sudah terisi tanggal 1–akhir bulan ini
  (hanya laporan bulan berjalan yang tampil).
- **Filter:** mode Hari/Bulan/Rentang menyaring benar; digabung dengan filter Status.
- **Export CSV & PDF** berisi kolom URL & Git URL dan mengikuti filter aktif.
- Tutup modal via ✕, Batal, scrim, Esc — semua bekerja.

- [ ] **Step 5: (Opsional) Verifikasi key KV bersih**

Bila wrangler login ke akun yang benar, konfirmasi hanya `reports:index` tersisa (key `report:*` lama terhapus). Bila tidak, lewati — sudah dicakup test migrasi.

---

## Self-Review (diisi penulis plan)

- **Spec coverage:** Bagian 1 (storage+migrasi) → Task 2,3,4; field url/git_url → Task 2,6,7,9; Bagian 2 (modal) → Task 6,9,10; Bagian 3 (filter) → Task 5,8,9; Bagian 4 (export) → Task 9. ✓
- **Placeholder scan:** tidak ada TBD/TODO; semua step memuat kode nyata. ✓
- **Type consistency:** field laporan konsisten (`git_url` di worker, modal, item, export); helper `getIndex/putIndex/migrate/createReport/updateReport/deleteReport` dipakai dengan signature sama di seluruh task; `filterReports` menerima `{status, dateMode, day, month, from, to}` dan App mengirim `{ status: statusFilter, ...dateFilter }` yang cocok. ✓
