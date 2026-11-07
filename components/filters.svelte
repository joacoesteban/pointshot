<script lang="ts"></script>

<div style="display: none">
  <svg>
    <filter id="aberration">
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0">
      </feColorMatrix>
      <feOffset dx="-10" dy="0" result="r"> </feOffset>
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
        result="g">
      </feColorMatrix>
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0">
      </feColorMatrix>
      <feOffset dx="10" dy="0" result="b"> </feOffset>
      <feBlend in="r" in2="g" result="rg" mode="screen"> </feBlend>
      <feBlend in="rg" in2="b" mode="screen"> </feBlend>
    </filter>
  </svg>
</div>
