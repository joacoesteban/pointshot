<script lang="ts">
  import type { ResultAsync } from 'neverthrow'
  import type { Shot } from '~/lib/shot'
  import type { ShotViewer, Size } from '~/lib/shot-viewer'
  import Editor from './editor.svelte'
  import Preview from './preview.svelte'

  type Props = { viewer: ShotViewer }

  const { viewer }: Props = $props()

  // svelte-ignore state_referenced_locally
  const previewing$ = viewer.previewing$
  // svelte-ignore state_referenced_locally
  const editing$ = viewer.editing$
</script>

{#if $previewing$}
  <Preview
    shot={$previewing$.shot}
    image={$previewing$.image}
    onclose={() => {
      viewer.closePreview()
    }}
    oncopy={(shot: Shot) => {
      viewer.copy(shot)
    }}
    oncopytext={(text: string, label: string) => {
      viewer.copyText(text, label)
    }}
    ondownload={(shot: Shot) => {
      viewer.download(shot)
    }}
    onremove={(shot: Shot) => {
      viewer.remove(shot)
    }}
    onedit={(shot: Shot, image: string) => {
      viewer.edit(shot, image)
    }} />
{/if}
{#if $editing$}
  <Editor
    shot={$editing$.shot}
    image={$editing$.image}
    onclose={() => {
      viewer.closeEditor()
    }}
    onsave={(png: ResultAsync<Blob, Error>, size: Size) => {
      viewer.saveEdit(png, size)
    }} />
{/if}
