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
