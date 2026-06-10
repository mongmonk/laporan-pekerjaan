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
