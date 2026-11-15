<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { ResultAsync } from 'neverthrow'
  import { fromEvent } from 'rxjs'
  import Button from '~/components/button.svelte'
  import Divider from '~/components/divider.svelte'
  import Row from '~/components/options/row.svelte'
  import Symbol from '~/components/symbol.svelte'
  import { say } from './browser'

  type Permissions = Readonly<Record<'accessibility' | 'screen', boolean>>

  type Permission = keyof Permissions

  const ROWS: readonly {
    permission: Permission
    title: string
    help: string
  }[] = [
    {
      permission: 'accessibility',
      title: say('accessibility'),
      help: say('accessibilityHelp'),
    },
    {
      permission: 'screen',
      title: say('screenRecording'),
      help: say('screenRecordingHelp'),
    },
  ]

  let granted = $state.raw<Permissions>({ accessibility: true, screen: true })

  const missing = $derived(ROWS.some(({ permission }) => !granted[permission]))

  const check = () => {
    void ResultAsync.fromPromise(
      invoke<Permissions>('permissions'),
      String,
    ).map((next) => {
      granted = next
    })
  }

  check()
  // Permissions are granted in System Settings, so coming back to the window is the moment to look again.
  fromEvent(window, 'focus').subscribe(check)
  void listen('permissions', check)
</script>

{#if missing}
  <section class="permissions">
    <h2 class="blend">{say('permissionsTitle')}</h2>
    <p class="blend">{say('permissionsBody')}</p>
    {#each ROWS as { permission, title, help } (permission)}
      <Row as="div" {title} {help}>
        {#if granted[permission]}
          <span class="allowed blend">
            <Symbol name="checkmark" size="1em" />
            {say('allowed')}
          </span>
        {:else}
          <Button
            size="sm"
            opaque
            onclick={() => {
              void invoke('grant', { permission })
            }}>{say('allow')}</Button>
        {/if}
      </Row>
    {/each}
  </section>
  <Divider />
{/if}

<style lang="scss">
  .permissions {
    margin-bottom: 8px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.5em;
    font-weight: 700;
  }
  p {
    margin: 0 0 8px;
    font-weight: 500;
  }
  .allowed {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
</style>
