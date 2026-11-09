import type { Component } from 'svelte'
import type { Renderable } from 'svelte-french-toast'
import Symbol from '~/components/symbol.svelte'
import type { SymbolName } from './symbols'

// svelte-french-toast mounts the icon with no props, so the name is bound into a component here.
// Its Renderable still names the Svelte 4 class type; a Svelte 5 component is a function it mounts the same way.
export const toastIcon = (name: SymbolName): Renderable => {
  const icon: Component = (internals, props) =>
    Symbol(internals, { ...props, name, size: '20px' })
  return icon as unknown as Renderable
}
