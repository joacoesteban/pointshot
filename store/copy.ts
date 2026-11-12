import type { Lang } from './studio'

// Headlines of the described slides. `**` marks the words set in bold.
export const COPY = {
  'en-US': {
    point: {
      title: 'Point. Click. **Paste.**',
      body: 'Screenshot **anything on a page**, cut to its exact edges.',
    },
    modes: {
      title: 'Or drag an **area**, grab the **window** or the **full page**',
    },
    editor: {
      title:
        'Point things out with **arrows**, **boxes**, **text** and **blur**',
    },
    library: {
      title: 'Every screenshot **saved** and **easy to find**',
      body: 'Search them, filter by site, copy them again.',
    },
    local: {
      title: '**No account.** No uploads. No tracking.',
    },
    note: 'Best day',
  },
  es: {
    point: {
      title: 'Apunta. Clickea. **Pega.**',
      body: 'Captura **cualquier parte de una página**, recortada justo por sus bordes.',
    },
    modes: {
      title:
        'O arrastra un **área**, captura la **ventana** o la **página completa**',
    },
    editor: {
      title:
        'Destaca lo importante con **flechas**, **recuadros**, **texto** y **desenfoque**',
    },
    library: {
      title: 'Todas tus capturas **guardadas** y **fáciles de encontrar**',
      body: 'Búscalas, fíltralas por sitio, cópialas de nuevo.',
    },
    local: {
      title: '**Sin cuenta.** Sin subir nada. Sin rastreo.',
    },
    note: 'El mejor día',
  },
} as const satisfies Record<Lang, unknown>
