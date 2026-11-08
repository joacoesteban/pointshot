# Components

The UI primitives come from [Vind](https://github.com/JoacoEsteban/vind), so
both extensions look and behave alike. Most of what follows is behaviour you
only discover by breaking it.

## Ground rules

- **Global styles.** `button.scss`, `popup.scss` and `style.scss` are global
  and imported from `style.scss`, which is injected into the shadow root (and
  into the options page by `entrypoints/options/main.ts`). Component
  `<style>` blocks are scoped and land inside the shadow root through
  `emitCss: false`. A new global class can collide with a scoped one that has
  the same name: the global rule still applies to that element.
- **Rems are safe.** `@thedutchcoder/postcss-rem-to-px` converts them at build
  time, because the content UI sits on host pages with any root font size.
- **Theme root.** `themeController` marks a node with
  `data-snag-theme-root` and `data-theme`, and makes it `display: contents`.
  Tokens exist only under that node.
- **Markup-only components** keep an empty `<script lang="ts"></script>`.
  Without it `svelte-check` types the import as `any` and fails.

## Tokens

Defined per theme in `tailwind.config.ts`.

| Token                               | Used by                        |
| ----------------------------------- | ------------------------------ |
| `--_blur-bg`, `--_blur-bg-soft`     | `bg-blur`, `bg-theme`          |
| `--_blur-text-color`                | `bg-blur`, `bg-theme`, `field` |
| `--_glassy-gradient-top`, `-bottom` | `Button glassy`                |
| `--_glassy-inset-shadow-color`      | `Button glassy`                |
| `--_field-glow`                     | `field`                        |
| `--options-blended-text-color`      | `blend`                        |

`--bezier`, `--bezier-chill`, `--bezier-round-inverted` and
`--bezier-symmetric` are set on the theme root in `style.scss`.

## Primitives

### `Button` (`button.svelte`, `button.scss`)

The pill or circle with a coloured gradient. Everything else is built on it.

| Prop                                 | Effect                                            |
| ------------------------------------ | ------------------------------------------------- |
| `onclick`, `children`                | Required.                                         |
| `colorSeed`                          | Input to ColorHash. Random per instance if unset. |
| `opaque`                             | Adds `backdrop-filter: blur(6px)`.                |
| `glassy`                             | Swaps the gradient for the theme's glass tokens.  |
| `small`                              | daisyUI `btn-sm` and a 1em label.                 |
| `highlight`                          | Outline, and `aria-pressed` when not `undefined`. |
| `icon`                               | A `Symbol` before the label, at 1em.              |
| `round`, `roundSize`, `roundPadding` | Circle of that size. See below.                   |
| `disabled`, `title`, `testId`        | See below.                                        |
| `role`, `checked`                    | Only for `Toggle`.                                |

- **The colour changes on every mount.** Without `colorSeed` each instance
  draws a random seed, so a remounted button comes back in another colour.
  That is the intended look. Pass a seed when the colour carries meaning:
  `COLOR_SEEDS.cancel` (red) and `COLOR_SEEDS.accept` (green).
- **`opaque` does not make it opaque.** The name comes from Vind. The gradient
  stays at 50% alpha, and the prop only blurs what is behind the button.
- **The label cannot be coloured.** `.inner` is white with
  `mix-blend-mode: overlay`, so it takes its tone from the gradient. Pale
  gradients give low-contrast labels, which is why glassy buttons hold icons.
- **`glassy` beats `disabled`'s grey and any `colorSeed`.** All three write the
  `--_forced-*` variables, and `.glassy` is declared last. A glassy disabled
  button only fades to 50%.
- **The focus ring is `:focus`, not `:focus-visible`.** It stays after a mouse
  click until focus moves. This matches Vind.
- **`highlight` is for the selected item of a group** (the editor's tools).
  Leave it `undefined` on plain buttons: `false` announces a toggle button.
- **`round` falls back to 70px** without `roundSize`. `roundPadding` is
  usually a percentage and sets how much of the circle the icon fills.
- **`title` replaces the accessible name.** It sets both the tooltip and
  `aria-label`. Text buttons leave it empty so the label names them.
- **Layout goes on a parent.** The root is a block-level flex
  `.button-container` that centres the button in the space it gets, and the
  component takes no `class`. Wrap it in `<div class="flex">` to left-align.

### `SymbolButton` (`symbol-button.svelte`)

A round `Button` holding one `Symbol`. `title` is required, because the icon
has no text to name it. Defaults to 50px with 15% padding. The popup uses
40px with 26% to 30%, and shot cards 38px with 28%: smaller circles need
relatively more padding to keep the icon's weight.

### `Symbol` (`symbol.svelte`, `lib/symbols.ts`)

SVG icon in `currentColor`. `size` is the length of the longer side and
defaults to `100%`, so it fills its parent.

To add one, drop the JSON in `assets/symbols/`, then import it and list it in
`raw` in `lib/symbols.ts`. Each file is parsed with `zod` at module load, so a
malformed file breaks every entrypoint that imports symbols. `fillRule`
defaults to `evenodd`; set `nonzero` if the shape fills in wrong.

### `Toggle` (`toggle.svelte`, `.toggle-container` in `button.scss`)

The switch. A `Button` with `role="switch"` and a sliding knob.

- **Controlled.** It never flips itself. The caller updates `checked` in
  `onclick`, which also lets it revert when a permission is refused.
- **Off is the desaturated grey.** The grey comes from the `--_forced-*`
  variables on the wrapper. On shows the button's random gradient, so two
  switches rarely match.
- **Geometry follows `size`, the knob's diameter.** The track is `size * 2.32`
  wide and the padding derives from it, so 25px gives 58 by 34. Do not set
  width or height from outside.
- **The knob's travel mixes units.** `translateX` percentages resolve against
  the knob, and `--toggle-size` against the track, hence the `calc`.
- **It works inside a `<label>`.** A button is labelable, so clicking the row's
  text flips the switch.
- **`title` is required** and becomes the accessible name. In Playwright use
  `getByRole('switch', { name })`; `toBeChecked` reads `aria-checked`.

### `Divider` (`divider.svelte`)

An `<hr>` with `.blend` and 20px of vertical margin. For the options page: its
line relies on the backdrop to show through.

## Style classes

### `bg-blur`, `bg-blur:soft`, `bg-blur:round`

The frosted panel. Everything is `!important` so host pages cannot override
it.

- **Mount `<Filters />` in the same document.** `backdrop-filter` references
  `url(#aberration)`. Firefox and Safari skip the reference through
  `.browser-*` on the theme root.
- **Do not nest them.** An inner `bg-blur` has the outer panel as its backdrop
  root, finds nothing to blur, and renders as a flat grey. Use `bg-theme:soft`
  inside a panel.
- **It traps fixed children.** Its `filter` and `backdrop-filter` make it the
  containing block for `position: fixed` descendants.

### `bg-theme`, `bg-theme:soft`

The same token background and text colour as `bg-blur`, with no blur. Use one
class or the other, not both. `ShotCard` uses `:soft`.

### `field`

Vind's dialog input, for native controls. Goes next to the daisyUI classes:
`input input-sm input-bordered field` or `select select-sm select-bordered
field`.

- It sets `background-color`, never `background`, or the select's arrow goes.
- `--_field-glow` is a token because Vind's fixed `#fffa` swamps a small input
  in dark mode.
- `option` gets an opaque background, otherwise the native list inherits the
  translucent one.

### `blend`

Options-page text: `mix-blend-mode: color-dodge` over the `Backdrop`.

- **Put it on leaf text.** On a container it would flatten the controls inside
  it.
- **Keep ancestors from isolating it.** `transform`, `filter`, `opacity` below
  1, `isolation` or a `z-index` between the text and the backdrop leave it
  nothing to blend with, and it turns flat grey.
- It means nothing in the popup, which has no backdrop.

### `pill`

Small tinted capsule for read-only values: the version, shortcuts, the credit.
Pair it with `blend` on the options page.

### `ghost`, `force-ghost`

`ghost` fades to 10% on hover and drops pointer events on its children, so a
toast can be seen through. The element itself still takes clicks. `force-ghost` applies both all the
time, and `Popup` uses it while a capture is running.

## Content UI

### `contents/app.svelte`

The root. Holds the state, turns errors into copy by matching on their class,
and mounts everything below along with `Filters` and `Toaster`.

### `Popup` (`popup.svelte`, `popup.scss`)

- `draggable` moves it, except from `INTERACTIVE` elements in `lib/draggable.ts`.
  A control that is not a button, link or field needs adding there.
- `ghost` hides it for a capture. `inert` keeps it out of the tab order while
  closed.
- **Fields must contain their keys.** Search and the site select stop
  `keydown`, `keyup` and `keypress`, or the host page's shortcuts fire while
  typing. A new field needs all three.
- Deleting acts on `shown`, so with a filter active it removes only those
  matches, and the label changes from "Delete all" to "Delete N".
- The site select appears with two or more sites. If the filtered site loses
  its last snag, the filter clears itself.

### `ShotCard` (`shot-card.svelte`)

- Draws on a `<canvas>` through `paint`, because the page's CSP governs
  `img-src` inside the shadow root. The same goes for `Preview` and `Editor`.
- Actions show on hover and on `:focus-within`, so they stay keyboard
  reachable.
- It sits inside the popup's `bg-blur`, so it uses `bg-theme:soft`.

### `Preview` (`preview.svelte`)

- `image` is `null` until the full image arrives, and the actions that need it
  disable until then. `ShotCard` only ever has the thumbnail.
- Escape is caught on `window` in the capture phase and stopped, so the host
  page never sees it.

### `Editor` (`editor.svelte`)

- `history` is a list of sketches, and undo drops the last. The first entry is
  always the empty sketch, so undo disables at length 1.
- The selected tool uses `highlight`. Colours are buttons with `role="radio"`.
- Stroke widths and blur cells scale by `density`, so marks keep their look at
  any capture resolution.

### `Highlight` (`highlight.svelte`)

Outlines the picker's target. It recomputes on scroll (captured, so nested
scrollers count) and resize. It reads `target$` and has no callbacks.

### `Selection` (`selection.svelte`)

The drag-to-select overlay. Uses pointer capture, ignores drags under
`MIN_SIDE`, and calls `onpick` inside `pointerup`, which is the user gesture
the clipboard write needs. Do not defer it.

### `Filters` (`filters.svelte`)

Hidden SVG holding `#aberration`. Required wherever `bg-blur` renders.

### `Toaster` (`toaster.svelte`)

`svelte-french-toast` with `bg-blur ghost`.

## Options page

### `options.svelte`

- `folder` and `saveAs` are held apart from `settings`. They keep what the
  user entered until the `downloads` permission is granted or refused, and
  snap back on refusal.
- `permissions.request` needs the user gesture, so it must stay inside the
  click or change handler.

### `options/backdrop.svelte`

Random gradient with a hue rotation and a pulsing mosaic of the icon. It is
fixed at `z-index: -1`.

- Lightness is pinned to 0.35. Vind picks any colour, but Snag has small help
  text, which washes out over a pale gradient.
- Full-page screenshots paint it over the first viewport only. Scroll and
  capture instead.

### `options/row.svelte`

A label on the left and a control on the right. `as` picks the element:

- `label` (default) for form controls, so clicking the text reaches them.
- `div` when the control is an action button, or clicking the text would fire
  it.
- `li` inside a list.

### `options/footer.svelte`

Icon, bug report link and credit. Links open in a new tab.

## Left out of the port

| From Vind                                        | Why                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `Dialog`                                         | Nothing prompts. Undo covers deleting.                              |
| `WithTooltip`                                    | Card actions are inline. Needs floating-ui.                         |
| `DisplayUrl`, `BindingButton`                    | Specific to Vind's path bindings.                                   |
| `Button` `as`, `ping`, `iconPosition`, `pressed` | No caller in Snag.                                                  |
| `v_toggle-*` classes                             | No caller in Snag.                                                  |
| Options tabs                                     | Six short sections read fine on one page.                           |
| Made Tommy                                       | Its files are marked personal use. Snag ships Outfit under the OFL. |
