import '@testing-library/jest-dom/vitest'

// Tell React we're in an act()-aware test environment so it doesn't warn
// about state updates outside act() (the warnings are informational and
// tests still pass; we just silence them for clean output).
// @ts-expect-error - global flag injected for React 18+
globalThis.IS_REACT_ACT_ENVIRONMENT = true
