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
