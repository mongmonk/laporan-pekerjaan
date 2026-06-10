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
