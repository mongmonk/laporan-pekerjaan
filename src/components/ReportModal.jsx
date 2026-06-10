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
            <button type="submit" aria-label={isEdit ? 'Simpan Perubahan' : 'Tambah Laporan'} className="btn btn-primary">{isEdit ? 'Simpan Perubahan' : 'Simpan'}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          </div>
        </form>
      </div>
    </div>
  )
}
