import React from 'react'

/**
 * The ROamly wordmark, including the pill.
 *
 * `fill="currentColor"` on the word and the two pill classes below are what let
 * one file serve both themes: the letters take the surrounding text colour, the
 * pill inverts against it. No second asset, no dark-mode variant to keep in
 * sync, and it stays correct if the accent or the surface ever changes.
 */
/**
 * `pill={false}` draws the word alone, for the places where ROamly itself is
 * meant rather than its index: the viewBox then ends where the word does.
 */
export default function RoamlyMark({ pill = true, ...props }: React.SVGProps<SVGSVGElement> & { pill?: boolean }): React.ReactElement {
  return (
    <>
      <style>{`
        .roamly-mark .pill-bg { fill: currentColor; }
        .roamly-mark .pill-fg { fill: var(--bg-card); }
      `}</style>
      <svg
        {...props}
        className={`roamly-mark ${props.className ?? ''}`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={pill ? '0 0 300 64' : '0 0 196 64'}
        fill="currentColor"
        role="img"
        aria-label="ROamly Places API"
      >
        <text
          x="4"
          y="44"
          fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          fontSize="40"
          fontWeight={800}
          letterSpacing="-1"
          fill="currentColor"
        >
          ROamly
        </text>
        {pill && (
          <>
            <rect x="208" y="12" width="84" height="40" rx="20" className="pill-bg" />
            <text
              x="250"
              y="40"
              textAnchor="middle"
              fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
              fontSize="24"
              fontWeight={800}
              letterSpacing="1"
              className="pill-fg"
            >
              API
            </text>
          </>
        )}
      </svg>
    </>
  )
}
