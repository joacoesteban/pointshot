import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { browser, type Browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { SnagDB } from '~/background/db'
import { ShotStore } from '~/background/shot-store'
import { Throttle } from '~/background/throttle'
import { CaptureError, toError } from '~/lib/errors'
import { ReplyCodec } from '~/lib/reply'
import {
  captureVisibleTabStream,
  listShotsStream,
  pickElement,
  removeShotStream,
  saveShotStream,
  shotImageUrlStream,
  togglePopup,
} from '~/messages'

const activeTabId = () =>
  ResultAsync.fromPromise(
    browser.tabs.query({ active: true, currentWindow: true }),
    toError(CaptureError),
  ).map((tabs) =>
    match(tabs)
      .with([{ id: P.select(P.number) }, ...P.array()], (id) => id)
      .otherwise(() => undefined),
  )

type Send = (options: { tabId: number }) => Promise<void>

const inject = (tabId: number) =>
  ResultAsync.fromPromise(
    browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/snag.js'],
    }),
    toError(CaptureError),
  )

const deliver = (send: Send, tabId: number) =>
  ResultAsync.fromPromise(send({ tabId }), toError(CaptureError))

// The content script is injected on first use, so a tab without a receiver gets it before the message is sent again.
// Tabs that block content scripts, like the Web Store or chrome:// pages, fail both.
const sendToActiveTab = (send: Send) =>
  activeTabId().andThen((tabId) =>
    match(tabId)
      .with(P.number, (tabId) =>
        deliver(send, tabId).orElse(() =>
          inject(tabId).andThen(() => deliver(send, tabId)),
        ),
      )
      .otherwise(() => okAsync(undefined)),
  )

// Chrome rejects captureVisibleTab calls beyond two a second.
const captures = new Throttle(500)

const captureTab = (sender: Browser.runtime.MessageSender) =>
  match(sender)
    .with({ tab: { windowId: P.select(P.number) } }, (windowId) =>
      ResultAsync.fromPromise(
        captures.run(() =>
          browser.tabs.captureVisibleTab(windowId, { format: 'png' }),
        ),
        toError(CaptureError),
      ),
    )
    .otherwise(() =>
      errAsync(new CaptureError('Capture requested outside a tab')),
    )

const toolbarAction = () =>
  match(import.meta.env.MANIFEST_VERSION)
    .with(2, () => browser.browserAction)
    .otherwise(() => browser.action)

export default defineBackground(() => {
  const store = new ShotStore(new SnagDB())

  captureVisibleTabStream.subscribe(([, sender, respond]) => {
    void ReplyCodec.encode(captureTab(sender)).then(respond)
  })
  listShotsStream.subscribe(([, , respond]) => {
    void ReplyCodec.encode(store.list()).then(respond)
  })
  saveShotStream.subscribe(([shot, , respond]) => {
    void ReplyCodec.encode(store.save(shot)).then(respond)
  })
  removeShotStream.subscribe(([id, , respond]) => {
    void ReplyCodec.encode(store.remove(id)).then(respond)
  })
  shotImageUrlStream.subscribe(([id, , respond]) => {
    void ReplyCodec.encode(store.imageUrl(id)).then(respond)
  })

  toolbarAction().onClicked.addListener(() => {
    void sendToActiveTab(togglePopup.toTab)
  })

  browser.commands.onCommand.addListener((command) => {
    void match(command)
      .with('toggle-popup', () => sendToActiveTab(togglePopup.toTab))
      .with('pick-element', () => sendToActiveTab(pickElement.toTab))
      .otherwise(() => undefined)
  })
})
