<script lang="ts">
  import { distinctUntilChanged, fromEvent, map, merge, startWith } from 'rxjs'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import Dialog from '~/components/dialog.svelte'
  import SymbolButton from '~/components/symbol-button.svelte'
  import { t } from '~/lib/i18n'
  import { say } from './browser'
  import { COMMANDS, Shortcut, type Action } from './shortcut'
  import { tray } from './tray'

  type Props = { onclose: () => void }

  const { onclose }: Props = $props()

  let shortcuts = $state(Shortcut.all())
  let recording = $state<Action | null>(null)

  const save = (action: Action, accelerator: string) => {
    void Shortcut.save(action, accelerator)
      .andThen(tray)
      .match(
        () => {
          shortcuts = Shortcut.all()
          recording = null
        },
        () => toast.error(say('shortcutNotSet')),
      )
  }

  $effect(() => {
    // The keys reach the dialog only while its window has focus, so a hidden or unfocused library gives the shortcuts back.
    const focus = merge(
      fromEvent(window, 'focus').pipe(map(() => true)),
      fromEvent(window, 'blur').pipe(map(() => false)),
    )
      .pipe(startWith(document.hasFocus()), distinctUntilChanged())
      .subscribe((focused) => {
        void Shortcut.pause(focused)
      })
    const keys = fromEvent<KeyboardEvent>(window, 'keydown').subscribe(
      // Plain keys, like Tab and Enter, still reach the dialog's buttons.
      (event) => {
        match({ recording, accelerator: Shortcut.read(event) })
          .with(
            { recording: P.string, accelerator: P.string },
            ({ recording, accelerator }) => {
              event.preventDefault()
              save(recording, accelerator)
            },
          )
          .otherwise(() => undefined)
      },
    )
    return () => {
      focus.unsubscribe()
      keys.unsubscribe()
      void Shortcut.pause(false)
    }
  })
</script>

<Dialog title={say('shortcutTitle')} testId="pointshot-shortcut" {onclose}>
  <p class="body">{say('shortcutBody')}</p>
  <ul class="shortcuts">
    {#each COMMANDS as { action, description } (action)}
      <li>
        <span class="name">{t(description)}</span>
        <button
          type="button"
          class="keys bg-theme:soft"
          class:recording={recording === action}
          onclick={() => {
            recording = action
          }}>
          {match({ recording, shortcut: shortcuts[action] })
            .with({ recording: action }, () => say('shortcutWaiting'))
            .with({ shortcut: '' }, () => t('notSet'))
            .otherwise(({ shortcut }) => Shortcut.label(shortcut))}
        </button>
        <SymbolButton
          name="xMark"
          title={say('clearShortcut')}
          size="sm"
          disabled={shortcuts[action] === ''}
          onclick={() => {
            save(action, '')
          }} />
      </li>
    {/each}
  </ul>
</Dialog>

<style lang="scss">
  .body {
    margin: 0 0 12px;
    max-width: 30rem;
    opacity: 0.8;
  }
  .shortcuts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
    li {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  }
  .name {
    flex: 1 1 auto;
    font-weight: 600;
  }
  .keys {
    min-width: 9rem;
    padding: 0.35em 1em;
    border-radius: 999px;
    font-weight: 700;
    text-align: center;
    transition: box-shadow 0.2s var(--bezier);
    &.recording {
      box-shadow: 0 0 0 2px oklch(var(--p));
    }
  }
</style>
