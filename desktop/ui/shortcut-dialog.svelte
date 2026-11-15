<script lang="ts">
  import { fromEvent } from 'rxjs'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import Button from '~/components/button.svelte'
  import Dialog from '~/components/dialog.svelte'
  import { t } from '~/lib/i18n'
  import { say } from './browser'
  import { Shortcut } from './shortcut'
  import { tray } from './tray'

  type Props = { onclose: () => void }

  const { onclose }: Props = $props()

  let recorded = $state<string | null>(null)

  const close = () => {
    void Shortcut.pause(false).match(onclose, onclose)
  }

  const save = (accelerator: string) => {
    void Shortcut.save(accelerator)
      .andThen(tray)
      .match(close, () => toast.error(say('shortcutNotSet')))
  }

  $effect(() => {
    void Shortcut.pause(true)
    const subscription = fromEvent<KeyboardEvent>(window, 'keydown').subscribe(
      // Plain keys, like Tab and Enter, still reach the dialog's buttons.
      (event) => {
        match(Shortcut.read(event))
          .with(P.string, (accelerator) => {
            event.preventDefault()
            recorded = accelerator
          })
          .otherwise(() => undefined)
      },
    )
    return () => {
      subscription.unsubscribe()
    }
  })
</script>

<Dialog
  title={say('shortcutTitle')}
  testId="pointshot-shortcut"
  onclose={close}>
  <div class="recorder">
    <p class="body">{say('shortcutBody')}</p>
    <kbd class="keys bg-theme:soft">
      {match(recorded)
        .with(P.string, (accelerator) => Shortcut.label(accelerator))
        .otherwise(() => say('shortcutWaiting'))}
    </kbd>
  </div>
  {#snippet footer()}
    <div class="flex-1"></div>
    <div class="flex items-center gap-2">
      <Button icon="xMark" onclick={close}>{t('cancel')}</Button>
      <Button
        icon="checkmark"
        disabled={recorded === null}
        onclick={() => {
          match(recorded)
            .with(P.string, save)
            .otherwise(() => undefined)
        }}>{say('save')}</Button>
    </div>
  {/snippet}
</Dialog>

<style lang="scss">
  .recorder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    min-width: 20rem;
  }
  .body {
    margin: 0;
    opacity: 0.8;
  }
  .keys {
    padding: 0.5em 1.2em;
    border-radius: 999px;
    font-size: 1.5em;
    font-weight: 700;
    font-family: inherit;
  }
</style>
