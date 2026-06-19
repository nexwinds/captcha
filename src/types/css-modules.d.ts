/**
 * CSS module ambient declarations.
 *
 * Importing `import styles from './x.module.css'` produces a typed record
 * keyed by the class names defined in the CSS file. We type it loosely
 * (`Record<string, string>`) so consumers can add classes without a
 * generator step.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

declare module '*.module.scss' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

/**
 * Plain CSS imports return a no-op string at runtime (the bundler emits
 * the side-effecting stylesheet). Used for the optional `./styles` export.
 */
declare module '*.css'
