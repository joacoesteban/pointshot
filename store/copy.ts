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
  'es-419': {
    point: {
      title: 'Apuntá. Clickeá. **Pegá.**',
      body: 'Capturá **cualquier parte de una página**, recortada justo en sus bordes.',
    },
    modes: {
      title:
        'O arrastrá un **área**, capturá la **ventana** o la **página completa**',
    },
    editor: {
      title:
        'Marcá lo importante con **flechas**, **recuadros**, **texto** y **desenfoque**',
    },
    library: {
      title: 'Todas tus capturas **guardadas** y **fáciles de encontrar**',
      body: 'Buscalas, filtralas por sitio, copialas de nuevo.',
    },
    local: {
      title: '**Sin cuenta.** Sin subir nada. Sin rastreo.',
    },
    note: 'El mejor día',
  },
} as const satisfies Record<Lang, unknown>
