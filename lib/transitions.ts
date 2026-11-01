import { circIn, circOut } from 'svelte/easing'
import type { TransitionConfig } from 'svelte/transition'

const popIn =
  ({ easing = circOut, duration = 200, scaleStart = 0.8 }) =>
  (_node: Element, { delay = 0 } = {}): TransitionConfig => ({
    delay,
    duration,
    easing,
    css: (t) =>
      `opacity: ${String(t)}; transform: scale(${String(
        scaleStart + (1 - scaleStart) * t,
      )})`,
  })

export const transitionIn = popIn({})
export const transitionOut = popIn({ easing: circIn, duration: 100 })
