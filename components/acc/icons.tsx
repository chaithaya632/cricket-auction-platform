import type { SVGProps } from "react"

/**
 * Minimal cricket-themed line icons that follow the Lucide stroke style
 * (24x24 viewBox, currentColor stroke). Used where Lucide has no equivalent.
 */

export function Bat(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L9 15l-3-3 8.5-8.5Z" />
      <path d="m6 12-2.5 2.5a2.12 2.12 0 0 0 3 3L9 15" />
    </svg>
  )
}

export function Ball(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 4.5c1.5 4 1.5 11 0 15" />
      <path d="M6.2 6.2c.8 3.6.8 8 0 11.6" />
    </svg>
  )
}

export function Gloves(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M6 11V6a2 2 0 0 1 4 0v4" />
      <path d="M10 10V4a2 2 0 0 1 4 0v6" />
      <path d="M14 10V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-2a2 2 0 0 1 2-2" />
    </svg>
  )
}

export function VerifiedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
