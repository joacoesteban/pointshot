type Styled = Element & ElementCSSInlineStyle

const isStyled = (element: Element): element is Styled =>
  element instanceof HTMLElement || element instanceof SVGElement

export class InlineStyle {
  // Sets each property as important and returns a function that puts back the inline values it replaced.
  static override(
    elements: readonly Element[],
    properties: Readonly<Record<string, string>>,
  ) {
    const styles = elements.filter(isStyled).map(({ style }) => style)
    const saved = styles.flatMap((style) =>
      Object.keys(properties).map((name) => ({
        style,
        name,
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name),
      })),
    )
    styles.forEach((style) => {
      Object.entries(properties).forEach(([name, value]) => {
        style.setProperty(name, value, 'important')
      })
    })
    return () => {
      saved.forEach(({ style, name, value, priority }) => {
        style.setProperty(name, value, priority)
      })
    }
  }
}
