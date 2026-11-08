<script lang="ts">
  import chroma from 'chroma-js'
  import logo from '~/assets/icon.png'

  // Blended text turns white over this gradient, so a paler base would wash out the small help text.
  const base = chroma.random().set('hsl.l', 0.35)
  const top = base.brighten(-1).hex()
  const bottom = base.set('hsl.h', '+25').darken(-1).hex()
</script>

<div class="backdrop" style:--_bg-1={top} style:--_bg-2={bottom}>
  <div class="mosaic" style:background-image={`url(${logo})`}></div>
</div>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(180deg, var(--_bg-1) 0%, var(--_bg-2) 100%);
    animation: hue-rotate 10s infinite;
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: oklch(var(--b1));
      opacity: 0.4;
    }
  }
  .mosaic {
    width: 100%;
    height: 100%;
    opacity: 0.3;
    background-position: center;
    background-repeat: repeat;
    animation: size 5s infinite var(--bezier-symmetric) backwards;
  }
  @keyframes hue-rotate {
    from {
      filter: hue-rotate(0deg);
    }
    to {
      filter: hue-rotate(360deg);
    }
  }
  @keyframes size {
    0%,
    100% {
      background-size: 200px;
      filter: blur(23px);
    }
    50% {
      background-size: 210px;
      filter: blur(3px);
    }
  }
</style>
