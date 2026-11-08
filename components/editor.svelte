<script lang="ts">
  import type { ResultAsync } from 'neverthrow'
  import { filter, fromEvent } from 'rxjs'
  import { match, P } from 'ts-pattern'
  import { Img } from '~/lib/image'
  import type { Point } from '~/lib/region'
  import type { Shot } from '~/lib/shot'
  import {
    EMPTY_SKETCH,
    SketchRenderer,
    dragged,
    type Mark,
    type Sketch,
    type Tool,
  } from '~/lib/sketch'
  import type { SymbolName } from '~/lib/symbols'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import SymbolButton from './symbol-button.svelte'

  type Size = { readonly width: number; readonly height: number }

  type Props = {
    shot: Shot
    image: string
    onclose: () => void
    // Called inside the click on Save, so the image can still reach the clipboard.
    onsave: (png: ResultAsync<Blob, Error>, size: Size) => void
  }

  const { shot, image, onclose, onsave }: Props = $props()

  const TOOLS: readonly { tool: Tool; name: SymbolName; title: string }[] = [
    { tool: 'arrow', name: 'arrow', title: 'Arrow' },
    { tool: 'rectangle', name: 'rectangle', title: 'Rectangle' },
    { tool: 'text', name: 'text', title: 'Text' },
    { tool: 'blur', name: 'blur', title: 'Blur' },
    { tool: 'crop', name: 'crop', title: 'Crop' },
  ]

  const COLORS = [
    { color: '#ff3b30', label: 'Red' },
    { color: '#ffcc00', label: 'Yellow' },
    { color: '#34c759', label: 'Green' },
    { color: '#0a84ff', label: 'Blue' },
    { color: '#1c1c1e', label: 'Black' },
    { color: '#ffffff', label: 'White' },
  ] as const

  // Sizes in CSS pixels of the page the snag came from, scaled by the image's density.
  const STROKE = 3
  const TEXT_SIZE = 20
  const BLUR_CELL = 10
  // Image pixels a drag must cover before it counts as a mark.
  const MIN_DRAG = 3

  let bitmap = $state<ImageBitmap | null>(null)
  let canvas = $state<HTMLCanvasElement | null>(null)
  let tool = $state<Tool>('arrow')
  let color = $state<string>(COLORS[0].color)
  let history = $state<readonly Sketch[]>([EMPTY_SKETCH])
  let drag = $state<{ from: Point; to: Point } | null>(null)
  let typing = $state<{ at: Point; text: string } | null>(null)

  const sketch = $derived(history.at(-1) ?? EMPTY_SKETCH)
  const density = $derived(
    match(bitmap)
      .with(P.nonNullable, ({ width }) => width / shot.width)
      .otherwise(() => 1),
  )
  const size = $derived(
    match(bitmap)
      .with(P.nonNullable, ({ width, height }) => ({ width, height }))
      .otherwise(() => ({ width: 1, height: 1 })),
  )

  const markOf = (from: Point, to: Point): Mark | null =>
    match({ tool, area: dragged(from, to, size) })
      .with(
        {
          area: P.union(
            { width: P.number.lt(MIN_DRAG) },
            { height: P.number.lt(MIN_DRAG) },
          ),
          tool: P.not('arrow'),
        },
        () => null,
      )
      .with({ tool: 'arrow' }, () =>
        match(Math.hypot(to.x - from.x, to.y - from.y))
          .with(P.number.lt(MIN_DRAG), () => null)
          .otherwise(() => ({
            kind: 'arrow' as const,
            from,
            to,
            color,
            width: STROKE * density,
          })),
      )
      .with({ tool: 'rectangle' }, ({ area }) => ({
        kind: 'rectangle' as const,
        area,
        color,
        width: STROKE * density,
      }))
      .with({ tool: 'blur' }, ({ area }) => ({
        kind: 'blur' as const,
        area,
        cell: BLUR_CELL * density,
      }))
      .otherwise(() => null)

  const draft = $derived(
    match(drag)
      .with(P.nonNullable, ({ from, to }) => markOf(from, to))
      .otherwise(() => null),
  )

  const crop = $derived(
    match({ drag, tool })
      .with({ drag: P.nonNullable, tool: 'crop' }, ({ drag: { from, to } }) =>
        dragged(from, to, size),
      )
      .otherwise(() => sketch.crop),
  )

  const percent = (part: number, whole: number) =>
    `${String((part / whole) * 100)}%`

  // svelte-ignore state_referenced_locally
  void Img.bitmap(Img.dataUrlToBlob(image)).map((loaded) => {
    bitmap = loaded
  })

  $effect(() => {
    match({ canvas, bitmap, context: canvas?.getContext('2d') })
      .with(
        {
          canvas: P.nonNullable,
          bitmap: P.nonNullable,
          context: P.nonNullable,
        },
        ({ canvas, bitmap, context }) => {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          SketchRenderer.render(context, bitmap, {
            ...sketch,
            marks: [
              ...sketch.marks,
              ...match(draft)
                .with(P.nonNullable, (mark) => [mark])
                .otherwise(() => []),
            ],
          })
        },
      )
      .otherwise(() => undefined)
  })

  $effect(() => {
    const subscription = fromEvent<KeyboardEvent>(window, 'keydown', {
      capture: true,
    })
      .pipe(filter(({ key }) => key === 'Escape'))
      .subscribe((event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        match(typing)
          .with(P.nonNullable, () => {
            typing = null
          })
          .otherwise(onclose)
      })
    return () => {
      subscription.unsubscribe()
    }
  })

  const commit = (next: Sketch) => {
    history = [...history, next]
  }

  const imagePoint = ({ clientX, clientY }: PointerEvent): Point =>
    match(canvas)
      .with(P.nonNullable, (canvas) => {
        const { left, top, width } = canvas.getBoundingClientRect()
        const scale = canvas.width / width
        return { x: (clientX - left) * scale, y: (clientY - top) * scale }
      })
      .otherwise(() => ({ x: 0, y: 0 }))

  function down(event: PointerEvent) {
    const point = imagePoint(event)
    match({ tool, typing })
      .with({ typing: P.nonNullable }, () => {
        finishTyping()
      })
      .with({ tool: 'text' }, () => {
        typing = { at: point, text: '' }
      })
      .otherwise(() => {
        match(event.currentTarget)
          .with(P.instanceOf(Element), (target) => {
            target.setPointerCapture(event.pointerId)
          })
          .otherwise(() => undefined)
        drag = { from: point, to: point }
      })
  }

  function move(event: PointerEvent) {
    match(drag)
      .with(P.nonNullable, ({ from }) => {
        drag = { from, to: imagePoint(event) }
      })
      .otherwise(() => undefined)
  }

  function up() {
    match({ drag, tool, draft, crop })
      .with({ drag: P.nullish }, () => undefined)
      .with(
        {
          tool: 'crop',
          crop: {
            width: P.number.gte(MIN_DRAG),
            height: P.number.gte(MIN_DRAG),
          },
        },
        ({ crop }) => {
          commit({ ...sketch, crop })
        },
      )
      .with({ draft: P.nonNullable }, ({ draft }) => {
        commit({ ...sketch, marks: [...sketch.marks, draft] })
      })
      .otherwise(() => undefined)
    drag = null
  }

  function finishTyping() {
    match(typing)
      .with({ text: P.string.minLength(1) }, ({ at, text }) => {
        commit({
          ...sketch,
          marks: [
            ...sketch.marks,
            {
              kind: 'text',
              at,
              text,
              color,
              size: TEXT_SIZE * density,
            },
          ],
        })
      })
      .otherwise(() => undefined)
    typing = null
  }

  function save() {
    match(bitmap)
      .with(P.nonNullable, (bitmap) => {
        const { width, height } = sketch.crop ?? size
        onsave(SketchRenderer.export(bitmap, sketch), {
          width: Math.round(width / density),
          height: Math.round(height / density),
        })
      })
      .otherwise(() => undefined)
  }

  // Keys typed in the editor stop there, so the page's shortcuts do not see them.
  const contain = (event: KeyboardEvent) => {
    event.stopPropagation()
  }

  function typed(event: KeyboardEvent) {
    contain(event)
    match(event.key)
      .with('Enter', () => {
        finishTyping()
      })
      .otherwise(() => undefined)
  }

  function focus(input: HTMLInputElement) {
    input.focus()
  }
</script>

<div class="editor" data-testid="snag-editor" in:transitionIn out:transitionOut>
  <div class="panel bg-blur" role="dialog" aria-label="Edit snag">
    <header class="flex flex-wrap items-center gap-2 mb-3">
      <div class="flex items-center gap-1" role="toolbar" aria-label="Tools">
        {#each TOOLS as { tool: option, name, title } (option)}
          <SymbolButton
            {name}
            {title}
            size="36px"
            padding="26%"
            glassy
            pressed={tool === option}
            onclick={() => {
              finishTyping()
              tool = option
            }} />
        {/each}
      </div>
      <div
        class="flex items-center gap-1 mx-2"
        role="radiogroup"
        aria-label="Color">
        {#each COLORS as { color: option, label } (option)}
          <button
            type="button"
            class="swatch"
            role="radio"
            aria-checked={color === option}
            aria-label={label}
            style:background={option}
            onclick={() => {
              color = option
            }}></button>
        {/each}
      </div>
      <SymbolButton
        name="undo"
        title="Undo"
        size="36px"
        padding="26%"
        glassy
        disabled={history.length === 1}
        onclick={() => {
          history = history.slice(0, -1)
        }} />
      <div class="flex-1"></div>
      <button type="button" class="chip" onclick={onclose}>Cancel</button>
      <Button testId="snag-save-edit" disabled={bitmap === null} onclick={save}
        >Save as new snag</Button>
    </header>

    <div class="stage">
      <div class="frame">
        <canvas
          bind:this={canvas}
          class:crosshair={tool !== 'text'}
          class:texting={tool === 'text'}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}></canvas>
        {#if crop}
          <div
            class="crop"
            data-testid="snag-crop"
            style:left={percent(crop.left, size.width)}
            style:top={percent(crop.top, size.height)}
            style:width={percent(crop.width, size.width)}
            style:height={percent(crop.height, size.height)}>
          </div>
        {/if}
        {#if typing}
          <input
            class="text-entry"
            aria-label="Text"
            placeholder="Type, then Enter"
            style:left={percent(typing.at.x, size.width)}
            style:top={percent(typing.at.y, size.height)}
            style:outline-color={color}
            bind:value={typing.text}
            use:focus
            onkeydown={typed}
            onkeyup={contain}
            onkeypress={contain} />
        {/if}
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .editor {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #0008;
  }
  .panel {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    max-height: 100%;
    padding: 1em;
  }
  .stage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    overflow: hidden;
    border-radius: 10px;
    background-image: repeating-conic-gradient(#8881 0 25%, transparent 0 50%);
    background-size: 16px 16px;
  }
  .frame {
    position: relative;
    line-height: 0;
  }
  canvas {
    display: block;
    max-width: calc(100vw - 80px);
    max-height: calc(100vh - 180px);
    touch-action: none;
    &.crosshair {
      cursor: crosshair;
    }
    &.texting {
      cursor: text;
    }
  }
  .crop {
    position: absolute;
    pointer-events: none;
    border: 1px dashed #fff;
    box-shadow: 0 0 0 100vmax #0007;
  }
  .text-entry {
    position: absolute;
    min-width: 12em;
    padding: 0.2em 0.4em;
    font:
      600 16px 'Outfit',
      sans-serif;
    line-height: 1.2;
    color: #1c1c1e;
    background: #fffe;
    border-radius: 6px;
    outline: 2px solid;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 100%;
    border: 2px solid #8886;
    &[aria-checked='true'] {
      outline: 2px solid #0a84ff;
      outline-offset: 2px;
    }
  }
</style>
