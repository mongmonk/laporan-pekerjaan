import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

const API_BASE = '/api'
const AUTH_KEY = 'daily_report_auth'

// ---- API helpers ----
async function api(path, opts = {}) {
  const token = sessionStorage.getItem(AUTH_KEY)
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (res.status === 401) {
    sessionStorage.removeItem(AUTH_KEY)
    window.location.reload()
    return null
  }
  return res.json()
}

async function login(password) {
  const res = await fetch(API_BASE + '/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error('Password salah')
  const data = await res.json()
  sessionStorage.setItem(AUTH_KEY, data.token)
  return true
}

// ---- Login Screen ----
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErr('')
    try {
      await login(pw)
      onLogin()
    } catch {
      setErr('Password salah!')
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <h2>📋 Laporan Harian</h2>
        <p>Masukkan password untuk melanjutkan</p>
        {err && <div className="error-msg">{err}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            autoFocus
          />
          <button className="btn btn-primary" disabled={loading}>
            {loading ? 'Memeriksa...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---- Report Form ----
function ReportForm({ editing, onSave, onCancel }) {
  const [title, setTitle] = useState(editing?.title || '')
  const [desc, setDesc] = useState(editing?.description || '')
  const [status, setStatus] = useState(editing?.status || 'pending')
  const [date, setDate] = useState(editing?.date || format(new Date(), 'yyyy-MM-dd'))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), description: desc.trim(), status, date, id: editing?.id })
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>{editing ? '✏️ Edit Laporan' : '➕ Tambah Laporan'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Tanggal</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Judul Pekerjaan</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Meeting dengan klien"
          />
        </div>
        <div className="form-group">
          <label>Deskripsi</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Detail pekerjaan yang dilakukan..."
          />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">⏳ Pending</option>
            <option value="progress">🔄 In Progress</option>
            <option value="done">✅ Done</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit">
            {editing ? 'Simpan Perubahan' : 'Tambah Laporan'}
          </button>
          {editing && (
            <button className="btn btn-ghost" type="button" onClick={onCancel}>
              Batal
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// ---- Report Item ----
function ReportItem({ report, onEdit, onDelete }) {
  const statusClass = `status-${report.status}`
  const statusLabel = { pending: 'Pending', progress: 'In Progress', done: 'Done' }[report.status]

  return (
    <div className="report-item">
      <div className="report-content">
        <div className="report-date">
          {format(new Date(report.date), 'EEEE, dd MMMM yyyy', { locale: id })}
        </div>
        <div className="report-title">{report.title}</div>
        {report.description && <div className="report-desc">{report.description}</div>}
        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
      </div>
      <div className="report-actions">
        <button className="btn btn-warning" onClick={() => onEdit(report)}>Edit</button>
        <button className="btn btn-danger" onClick={() => onDelete(report.id)}>Hapus</button>
      </div>
    </div>
  )
}

// ---- Export helpers ----
function exportCSV(reports) {
  const header = 'Tanggal,Judul,Deskripsi,Status\n'
  const rows = reports
    .map(
      (r) =>
        `"${r.date}","${r.title.replace(/"/g, '""')}","${(r.description || '').replace(/"/g, '""')}","${r.status}"`
    )
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `laporan-harian-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportPDF(reports) {
  const w = window.open('', '_blank')
  const rows = reports
    .map(
      (r) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.title}</td>
        <td>${r.description || '-'}</td>
        <td>${r.status}</td>
      </tr>`
    )
    .join('')
  w.document.write(`
    <html><head><title>Laporan Harian</title>
    <style>
      body { font-family: Arial; padding: 20px; }
      h1 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
      th { background: #f0f0f0; }
    </style></head><body>
    <h1>Laporan Harian</h1>
    <p>Tanggal Export: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}</p>
    <table><thead><tr><th>Tanggal</th><th>Judul</th><th>Deskripsi</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.print();</script>
    </body></html>
  `)
}

// ---- Main App ----
export default function App() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(AUTH_KEY))
  const [reports, setReports] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
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

  const handleSave = async (report) => {
    if (report.id) {
      await api(`/reports/${report.id}`, { method: 'PUT', body: JSON.stringify(report) })
    } else {
      await api('/reports', { method: 'POST', body: JSON.stringify(report) })
    }
    setShowForm(false)
    setEditing(null)
    loadReports()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus laporan ini?')) return
    await api(`/reports/${id}`, { method: 'DELETE' })
    loadReports()
  }

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const filtered = reports.filter((r) => filter === 'all' || r.status === filter)
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
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(!showForm); }}>
          {showForm ? 'Tutup' : '+ Tambah Laporan'}
        </button>
        <div className="export-btns">
          <button className="btn btn-ghost" onClick={() => exportCSV(filtered)}>📄 Export CSV</button>
          <button className="btn btn-ghost" onClick={() => exportPDF(filtered)}>🖨️ Export PDF</button>
        </div>
      </div>

      {showForm && (
        <ReportForm editing={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      <div className="filter-bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="pending">⏳ Pending</option>
          <option value="progress">🔄 In Progress</option>
          <option value="done">✅ Done</option>
        </select>
      </div>

      <div className="report-list">
        {loading ? (
          <div className="empty-state">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📝</div>
            <p>Belum ada laporan. Tambahkan yang pertama!</p>
          </div>
        ) : (
          filtered
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((r) => (
              <ReportItem key={r.id} report={r} onEdit={(r) => { setEditing(r); setShowForm(true); }} onDelete={handleDelete} />
            ))
        )}
      </div>
    </div>
  )
}
