import toast from 'svelte-french-toast'
import { match, P } from 'ts-pattern'
import { Diagnostics } from './diagnostics'
import {
  ClipboardError,
  EmptyAreaError,
  QuotaError,
  StorageError,
} from './errors'
import { t } from './i18n'

// Turns an error into copy by its class, and keeps it for the diagnostics the options page copies.
export class Failure {
  static explain = (error: Error) =>
    match(error)
      .with(P.instanceOf(ClipboardError), () => t('savedClipboardBlocked'))
      .with(P.instanceOf(EmptyAreaError), () => t('nothingVisible'))
      .with(P.instanceOf(QuotaError), () => t('storageFull'))
      .with(P.instanceOf(StorageError), () => t('notSaved'))
      .otherwise(({ message }) => t('couldNotSnag', message))

  static report = (error: Error, message = Failure.explain(error)) => {
    void Diagnostics.record(error)
    toast.error(message)
  }
}
