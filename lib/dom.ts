import { match, P } from 'ts-pattern'
import type { Area, Point } from './region'

type FrameElement = Element & {
  readonly contentDocument: Document | null
  readonly contentWindow: Window | null
}

export type Frame = {
  readonly view: Window
  readonly document: Document
}

// Same-origin frames hand out nodes from their own realm, which fail instanceof checks against this one.
const isElement = (value: unknown): value is Element =>
  match(value)
    .with({ nodeType: 1, tagName: P.string }, () => true)
    .otherwise(() => false)

const isShadowRoot = (value: unknown): value is ShadowRoot =>
  match(value)
    .with({ nodeType: 11, host: P.when(isElement) }, () => true)
    .otherwise(() => false)

const isFrame = (element: Element): element is FrameElement =>
  ['IFRAME', 'FRAME'].includes(element.tagName.toUpperCase())

const frameOf = (document: Document) =>
  match(document.defaultView?.frameElement)
    .with(P.when(isElement), (frame) => frame)
    .otherwise(() => null)

const contentOf = (element: Element) =>
  match(element)
    .with(P.when(isFrame), ({ contentDocument, contentWindow }) =>
      match({ document: contentDocument, view: contentWindow })
        .with(
          { document: P.nonNullable, view: P.nonNullable },
          (frame): Frame => frame,
        )
        .otherwise(() => null),
    )
    .otherwise(() => null)

export class Dom {
  static readonly isElement = isElement

  // Steps out of open shadow roots and same-origin frames, so a lineage reaches the top document.
  static parent(element: Element): Element | null {
    return match(element.parentElement)
      .with(P.nonNullable, (parent) => parent)
      .otherwise(() =>
        match(element.parentNode)
          .with(P.when(isShadowRoot), ({ host }) => host)
          .otherwise(() => frameOf(element.ownerDocument)),
      )
  }

  static ancestors(element: Element): Element[] {
    return match(Dom.parent(element))
      .with(P.nonNullable, (parent) => [parent, ...Dom.ancestors(parent)])
      .otherwise(() => [])
  }

  // Children as they render: a shadow root's, or the body of a same-origin frame.
  static children(element: Element): Element[] {
    return match(element)
      .with({ shadowRoot: { children: P.select() } }, (children) => [
        ...children,
      ])
      .otherwise(() =>
        match(contentOf(element))
          .with({ document: { body: P.select(P.nonNullable) } }, (body) => [
            body,
          ])
          .otherwise(() => [...element.children]),
      )
  }

  static siblings(element: Element): Element[] {
    return match(element.parentNode)
      .with({ children: P.select() }, (children) => [...children])
      .otherwise(() => [element])
  }

  // The document and those of the frames around it, innermost first.
  static documents(document: Document): Document[] {
    return [
      document,
      ...match(frameOf(document))
        .with(P.nonNullable, ({ ownerDocument }) =>
          Dom.documents(ownerDocument),
        )
        .otherwise(() => []),
    ]
  }

  static style(element: Element): CSSStyleDeclaration {
    return (element.ownerDocument.defaultView ?? window).getComputedStyle(
      element,
    )
  }

  // Where a document's viewport sits in the top window's viewport.
  static offset(document: Document): Point {
    return match(frameOf(document))
      .with(P.nonNullable, (frame) => {
        const { left, top } = frame.getBoundingClientRect()
        const { paddingLeft, paddingTop } = Dom.style(frame)
        const outer = Dom.offset(frame.ownerDocument)
        return {
          x: outer.x + left + frame.clientLeft + parseFloat(paddingLeft),
          y: outer.y + top + frame.clientTop + parseFloat(paddingTop),
        }
      })
      .otherwise(() => ({ x: 0, y: 0 }))
  }

  // The element's client rect in the top window's viewport.
  static rect(element: Element): Area {
    const { left, top, width, height } = element.getBoundingClientRect()
    const { x, y } = Dom.offset(element.ownerDocument)
    return { left: left + x, top: top + y, width, height }
  }

  // The part of the top window's viewport a document shows.
  static viewport(document: Document): Area {
    const { x, y } = Dom.offset(document)
    const { clientWidth, clientHeight } = document.documentElement
    return { left: x, top: y, width: clientWidth, height: clientHeight }
  }

  static frames(document: Document = window.document): Frame[] {
    return [...document.querySelectorAll('iframe, frame')].flatMap((element) =>
      match(contentOf(element))
        .with(P.nonNullable, (frame) => [frame, ...Dom.frames(frame.document)])
        .otherwise(() => []),
    )
  }

  // The topmost accepted element under a point of the root's viewport, looking into open shadow roots and same-origin frames.
  static elementAt(
    root: Document | ShadowRoot,
    { x, y }: Point,
    accept: (element: Element) => boolean,
  ): Element | null {
    const [element = null] = root.elementsFromPoint(x, y).filter(accept)
    return match(element)
      .with({ shadowRoot: P.nonNullable }, (host) =>
        match(
          Dom.elementAt(
            host.shadowRoot,
            { x, y },
            (inner) => inner !== host && accept(inner),
          ),
        )
          .with(P.nonNullable, (inner) => inner)
          .otherwise(() => host),
      )
      .with(P.nonNullable, (element) =>
        match(contentOf(element))
          .with(P.nonNullable, ({ document }) => {
            const outer = Dom.offset(element.ownerDocument)
            const inner = Dom.offset(document)
            return (
              Dom.elementAt(
                document,
                { x: x + outer.x - inner.x, y: y + outer.y - inner.y },
                accept,
              ) ?? element
            )
          })
          .otherwise(() => element),
      )
      .otherwise(() => null)
  }
}
