import { describe, it, expect } from 'vitest'
import { classify, toV1, type RawSignals } from '../src/lib/signals.js'

const low: RawSignals = {
  dwellMs: 4000,
  timeToClickMs: 120,
  mouseMovements: 25,
  keyboardInteractions: 1,
  isBot: false,
}

const medium: RawSignals = {
  dwellMs: 1200,
  timeToClickMs: 60,
  mouseMovements: 8,
  keyboardInteractions: 0,
  isBot: false,
}

const high: RawSignals = {
  dwellMs: 400,
  timeToClickMs: 30,
  mouseMovements: 1,
  keyboardInteractions: 0,
  isBot: false,
}

const critical: RawSignals = {
  dwellMs: 200,
  timeToClickMs: 20,
  mouseMovements: 0,
  keyboardInteractions: 0,
  isBot: true,
}

describe('signals v1', () => {
  it('classifies low', () => {
    expect(classify(low)).toBe('low')
  })

  it('classifies medium', () => {
    expect(classify(medium)).toBe('medium')
  })

  it('classifies high', () => {
    expect(classify(high)).toBe('high')
  })

  it('classifies critical', () => {
    expect(classify(critical)).toBe('critical')
  })

  it('toV1 includes v:1', () => {
    const v1 = toV1(low)
    expect(v1.v).toBe(1)
    expect(v1.dwellMs).toBe(low.dwellMs)
    expect(v1.timeToClickMs).toBe(low.timeToClickMs)
    expect(v1.mouseMovements).toBe(low.mouseMovements)
    expect(v1.keyboardInteractions).toBe(low.keyboardInteractions)
    expect(v1.isBot).toBeUndefined()
  })

  it('toV1 omits isBot when false', () => {
    const v1 = toV1({ ...low, isBot: false })
    expect(v1.isBot).toBeUndefined()
  })

  it('toV1 keeps isBot when true', () => {
    const v1 = toV1({ ...low, isBot: true })
    expect(v1.isBot).toBe(true)
  })

  it('toV1 clamps negative values to 0', () => {
    const v1 = toV1({ dwellMs: -5, timeToClickMs: -1, mouseMovements: -2, keyboardInteractions: -3, isBot: false })
    expect(v1.dwellMs).toBe(0)
    expect(v1.timeToClickMs).toBe(0)
    expect(v1.mouseMovements).toBe(0)
    expect(v1.keyboardInteractions).toBe(0)
  })
})
