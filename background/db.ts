import Dexie, { type EntityTable } from 'dexie'
import type { Shot } from '~/lib/shot'

export class SnagDB extends Dexie {
  readonly shots: EntityTable<Shot, 'id'>

  constructor() {
    super('snag-db')
    this.version(1).stores({
      shots: 'id, createdAt',
    })
    this.shots = this.table('shots')
  }
}
