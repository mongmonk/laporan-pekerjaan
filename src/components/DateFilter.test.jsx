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
