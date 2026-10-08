import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { bypassChip, bypassOffer, rangeWarningCopy, useRangeBypass } from './useRangeBypass'

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k)

/**
 * The ONE logic path behind the ROAMLY_PLUGINS_IGNORE_ROAMLY_RANGE warning in both admin
 * shells — the desktop panel and the phone panel render their own markup over this.
 */
describe('rangeBypass helpers', () => {
  it('bypassChip: a warning chip (not a blocker) only for a bypassed row', () => {
    expect(bypassChip(null, t)).toBeNull()
    expect(bypassChip(undefined, t)).toBeNull()
    expect(bypassChip({ roamlyRange: '>=3.2.0 <4.0.0', hostVersion: '4.0.0' }, t)).toMatchObject({
      blocked: false, warn: true, label: 'admin.plugins.dep.roamlyBypassed:{"range":">=3.2.0 <4.0.0","host":"4.0.0"}',
    })
    expect(bypassChip({ roamlyRange: null, hostVersion: '4.0.0' }, t)).toMatchObject({ label: 'admin.plugins.dep.roamlyBypassedUnknown' })
  })

  it('bypassOffer: an enabled "Install anyway" carrying what the dialog must say', () => {
    const offer = bypassOffer({ name: 'Gotify', roamly: '>=4.0.0', hostVersion: '3.3.0' }, t, 'why')
    expect(offer).toEqual({
      blocked: false, label: 'admin.plugins.installAnyway', title: 'why',
      warn: { name: 'Gotify', roamlyRange: '>=4.0.0', hostVersion: '3.3.0', onConfirm: null },
    })
    expect(bypassOffer({ name: 'X' }, t, 'why').warn).toMatchObject({ roamlyRange: null, hostVersion: '?' })
  })

  it('rangeWarningCopy: confirm vs notice title, ranged vs rangeless body', () => {
    const ranged = { name: 'G', roamlyRange: '>=4.0.0', hostVersion: '3.3.0' }
    expect(rangeWarningCopy({ ...ranged, onConfirm: () => {} }, t)).toEqual({
      confirm: true, title: 'admin.plugins.rangeBypass.title',
      body: 'admin.plugins.rangeBypass.body:{"name":"G","range":">=4.0.0","host":"3.3.0"}',
    })
    expect(rangeWarningCopy({ name: 'G', roamlyRange: null, hostVersion: '3.3.0', onConfirm: null }, t)).toEqual({
      confirm: false, title: 'admin.plugins.rangeBypass.noticeTitle',
      body: 'admin.plugins.rangeBypass.bodyUnknown:{"name":"G","host":"3.3.0"}',
    })
  })
})

describe('useRangeBypass', () => {
  it('guard runs straight through without a warning, and parks the run behind one otherwise', () => {
    const { result } = renderHook(() => useRangeBypass())
    let ran = 0
    act(() => result.current.guard(undefined, () => { ran++ }))
    expect(ran).toBe(1)
    expect(result.current.warning).toBeNull()

    act(() => result.current.guard({ name: 'G', roamlyRange: '>=4.0.0', hostVersion: '3.3.0', onConfirm: null }, () => { ran++ }))
    expect(ran).toBe(1) // nothing sent until the admin accepts
    expect(result.current.copy?.confirm).toBe(true)

    act(() => result.current.confirm())
    expect(ran).toBe(2)
    expect(result.current.warning).toBeNull()
  })

  it('dismiss drops a parked run; notice opens a plain notice only for a real marker', () => {
    const { result } = renderHook(() => useRangeBypass())
    let ran = 0
    act(() => result.current.guard({ name: 'G', roamlyRange: null, hostVersion: '3.3.0', onConfirm: null }, () => { ran++ }))
    act(() => result.current.dismiss())
    expect(ran).toBe(0)
    expect(result.current.warning).toBeNull()

    act(() => result.current.notice('roamly-new', null))
    expect(result.current.warning).toBeNull()
    act(() => result.current.notice('roamly-new', { roamlyRange: null, hostVersion: '3.3.0' }))
    expect(result.current.warning).toMatchObject({ name: 'roamly-new', onConfirm: null })
    expect(result.current.copy?.confirm).toBe(false)
    act(() => result.current.confirm()) // a notice's confirm is just a close
    expect(result.current.warning).toBeNull()
  })
})
