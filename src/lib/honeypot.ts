/**
 * Honeypot helpers.
 *
 * The widget renders three honeypots inside the captcha root:
 *   1. a hidden text field (looks like an email input)
 *   2. a hidden link (off-screen anchor)
 *   3. a hidden checkbox (opacity 0, but in the tab order)
 *
 * All three are `aria-hidden`, `tabindex={-1}`, and positioned off-screen
 * (or with display:none for the link). Humans never touch them; bots
 * typically fill or click them. The collapsed signal is `isBot: true`
 * in the signals payload (see CLARIFY_NEXCOOKIE §M3).
 */

export interface HoneypotState {
  /** True if any of the three honeypots was interacted with. */
  isBot: boolean
  /** Granular flags for diagnostics. Not sent on the wire. */
  flags: {
    fieldFilled: boolean
    linkClicked: boolean
    checkboxChecked: boolean
  }
}

export function emptyHoneypotState(): HoneypotState {
  return {
    isBot: false,
    flags: { fieldFilled: false, linkClicked: false, checkboxChecked: false },
  }
}

export function reduceHoneypot(
  prev: HoneypotState,
  partial: Partial<HoneypotState['flags']>,
): HoneypotState {
  const flags = { ...prev.flags, ...partial }
  return {
    flags,
    isBot: flags.fieldFilled || flags.linkClicked || flags.checkboxChecked,
  }
}

/**
 * Default no-op event handlers for the three honeypots. The host
 * component wires these into the rendered DOM.
 */
export const honeypotHandlers = {
  onFieldInput: (state: HoneypotState) => reduceHoneypot(state, { fieldFilled: true }),
  onLinkClick: (state: HoneypotState) => (_e: { preventDefault: () => void }) => {
    _e.preventDefault()
    return reduceHoneypot(state, { linkClicked: true })
  },
  onCheckboxChange: (state: HoneypotState) => reduceHoneypot(state, { checkboxChecked: true }),
}
