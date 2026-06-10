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
