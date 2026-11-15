<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { ResultAsync } from 'neverthrow'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import Button from '~/components/button.svelte'
  import Filters from '~/components/filters.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { t } from '~/lib/i18n'
  import { transitionIn } from '~/lib/transitions'
  import { theme } from './theme'

  type Shot = {
    readonly id: number
    readonly url: string
    readonly width: number
    readonly height: number
  }

  let shots = $state.raw<readonly Shot[]>([])

  const fail = (reason: string) => {
    toast.error(t('couldNotSnag', reason))
  }

  const capture = () => {
    void ResultAsync.fromPromise(invoke<Shot | null>('capture'), String).match(
      (shot) => {
        match(shot)
          .with(P.nonNullable, (shot) => {
            shots = [shot, ...shots]
            toast.success(t('copied'))
          })
          .otherwise(() => undefined)
      },
      fail,
    )
  }

  const copy = ({ id }: Shot) => {
    void ResultAsync.fromPromise(invoke('copy', { id }), String).match(() => {
      toast.success(t('copied'))
    }, fail)
  }
</script>

<div use:theme>
  <main class="shots">
    <header>
      <h1>Pointshot</h1>
      <Button
        size="lg"
        opaque
        icon="cameraViewfinder"
        onclick={capture}>
        {t('snag')}
      </Button>
    </header>

    {#if shots.length}
      <div class="grid">
        {#each shots as shot (shot.id)}
          <button
            type="button"
            class="shot bg-theme:soft"
            title={t('copy')}
            in:transitionIn
            onclick={() => {
              copy(shot)
            }}>
            <img src={shot.url} alt="" />
            <span class="size">{shot.width} × {shot.height}</span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <h3>{t('emptyTitle')}</h3>
        <p>{t('emptyBody')}</p>
      </div>
    {/if}
  </main>
  <Filters />
  <Toaster />
</div>

<style lang="scss">
  .shots {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 100vh;
    padding: 24px;
    background-color: oklch(var(--b1));
    color: oklch(var(--bc));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h1 {
    font-size: 1.5em;
    font-weight: 700;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .shot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 16px;
    transition: transform 0.2s var(--bezier);
    &:hover {
      transform: scale(1.03);
    }
    img {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: contain;
    }
  }
  .size,
  .empty {
    color: oklch(var(--bc) / 0.6);
  }
  .size {
    font-size: 0.875em;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    padding: 64px 0;
    text-align: center;
    h3 {
      margin: 0 0 4px;
      font-size: 1.5em;
      font-weight: 700;
    }
    p {
      margin: 0;
    }
  }
</style>
