import { match, P } from 'ts-pattern'

export class Dom {
  // Steps out of an open shadow root to its host, so a lineage reaches the document.
  static parent(element: Element): Element | null {
    return match(element.parentElement)
      .with(P.nonNullable, (parent) => parent)
      .otherwise(() =>
        match(element.getRootNode())
          .with(P.instanceOf(ShadowRoot), ({ host }) => host)
          .otherwise(() => null),
      )
  }

  static ancestors(element: Element): Element[] {
    return match(Dom.parent(element))
      .with(P.nonNullable, (parent) => [parent, ...Dom.ancestors(parent)])
      .otherwise(() => [])
  }
}
