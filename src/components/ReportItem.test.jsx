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
