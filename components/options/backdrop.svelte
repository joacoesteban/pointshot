<script lang="ts">
  import chroma from 'chroma-js'
  import mosaicSharp from '~/assets/mosaic-sharp.png'
  import mosaicSoft from '~/assets/mosaic-soft.png'
  import { animationState } from '~/lib/animation-state'

  // Blended text turns white over this gradient, so a paler base would wash out the small help text.
  const base = chroma.random().set('hsl.l', 0.35)
  const top = base.brighten(-1).hex()
  const bottom = base.set('hsl.h', '+25').darken(-1).hex()
</script>

<div
  class="backdrop"
  use:animationState
  style:--_bg-1={top}
  style:--_bg-2={bottom}>
  <div class="hue">
    <div class="mosaic">
      <div class="layer soft" style:background-image={`url(${mosaicSoft})`}>
      </div>
      <div class="layer sharp" style:background-image={`url(${mosaicSharp})`}>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: oklch(var(--b1));
      opacity: 0.4;
    }
  }
  .hue {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--_bg-1) 0%, var(--_bg-2) 100%);
    animation: hue-rotate 10s infinite;
  }
  /* The blur and the tile size are baked into the tiles (`mise run mosaic:bake`), so every animated property stays on the compositor. */
  .mosaic {
    position: relative;
    width: 100%;
    height: 100%;
    opacity: 0.3;
    animation: breathe 5s infinite var(--bezier-symmetric);
  }
  .layer {
    position: absolute;
    inset: 0;
    background-size: 200px;
    background-position: center;
    background-repeat: repeat;
    animation: 5s infinite var(--bezier-symmetric);
  }
  .soft {
    animation-name: soft-fade;
  }
  .sharp {
    opacity: 0;
    animation-name: sharp-fade;
  }
  @keyframes hue-rotate {
    from {
      filter: hue-rotate(0deg);
    }
    to {
      filter: hue-rotate(360deg);
    }
  }
  /* 200px tiles grow to 210px. */
  @keyframes breathe {
    50% {
      transform: scale(1.05);
    }
  }
  @keyframes soft-fade {
    50% {
      opacity: 0;
    }
  }
  @keyframes sharp-fade {
    50% {
      opacity: 1;
    }
  }
  /* After the `animation` shorthands, which reset the play state. */
  .hue,
  .mosaic,
  .layer {
    animation-play-state: var(--animation-play-state, running);
  }
</style>
