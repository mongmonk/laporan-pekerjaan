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
