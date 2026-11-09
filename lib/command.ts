// A keyboard command from the manifest: its id, localized description and current shortcut, empty when unset.
export type Command = {
  readonly command: string
  readonly name: string
  readonly shortcut: string
}
