'use client'

import React from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** Optional label shown to the right of the switch, with guaranteed spacing. */
  label?: React.ReactNode
}

/**
 * Shared on/off switch. The knob keeps an even margin inside the track in both
 * states, and the label sits a comfortable distance away so it never crowds the
 * switch.
 */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="inline-flex items-center gap-4 text-sm text-muted"
    >
      <span
        className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-high border border-white/20'}`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </span>
      {label != null && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}
