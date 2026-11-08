import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { browser, type Browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { SnagDB } from '~/background/db'
import { ShotStore } from '~/background/shot-store'
import { Throttle } from '~/background/throttle'
import { CaptureError, DownloadError, toError } from '~/lib/errors'
import { ReplyCodec } from '~/lib/reply'
import { SettingsStore } from '~/lib/settings'
import {
  openOptionsStream,
  downloadFileStream,
  type FileDownload,
  captureMode,
  captureVisibleTabStream,
  listShotsStream,
  pickElement,
  removeShotsStream,
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

const toolbarAction = () =>
  match(import.meta.env.MANIFEST_VERSION)
    .with(2, () => browser.browserAction)
    .otherwise(() => browser.action)

// Tab-specific badge and title, which the browser resets when the tab navigates.
const flag = (tabId: number, text: string, title: string) => {
  const action = toolbarAction()
  void Promise.all([
    action.setBadgeText({ tabId, text }),
    action.setTitle({ tabId, title }),
  ])
}

// The content script is injected on first use, so a tab without a receiver gets it before the message is sent again.
// Tabs that block content scripts, like the Web Store or chrome:// pages, fail both.
const sendToActiveTab = (send: Send) =>
  activeTabId().andThen((tabId) =>
    match(tabId)
      .with(P.number, (tabId) =>
        deliver(send, tabId)
          .orElse(() => inject(tabId).andThen(() => deliver(send, tabId)))
          .andTee(() => {
            flag(tabId, '', browser.runtime.getManifest().name)
          })
          .orTee(() => {
            flag(tabId, '!', 'Snag cannot run on this page')
          }),
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

const download = ({ url, filename, saveAs }: FileDownload) =>
  ResultAsync.fromPromise(
    browser.permissions.contains({ permissions: ['downloads'] }),
    toError(DownloadError),
  ).andThen((granted) =>
    match(granted)
      .with(true, () =>
        ResultAsync.fromPromise(
          browser.downloads.download({ url, filename, saveAs }),
          toError(DownloadError),
        ),
      )
      .with(false, () =>
        errAsync(new DownloadError('Downloads are not allowed')),
      )
      .exhaustive(),
  )

export default defineBackground(() => {
  const store = new ShotStore(new SnagDB())

  captureVisibleTabStream.subscribe(([, sender, respond]) => {
    void ReplyCodec.encode(captureTab(sender)).then(respond)
  })
  listShotsStream.subscribe(([, , respond]) => {
    void ReplyCodec.encode(store.list()).then(respond)
  })
  saveShotStream.subscribe(([shot, , respond]) => {
    void ReplyCodec.encode(
      SettingsStore.load().andThen(({ limit }) => store.save(shot, limit)),
    ).then(respond)
  })
  removeShotsStream.subscribe(([ids, , respond]) => {
    void ReplyCodec.encode(store.remove(ids)).then(respond)
  })
  openOptionsStream.subscribe(() => {
    void browser.runtime.openOptionsPage()
  })
  downloadFileStream.subscribe(([file, , respond]) => {
    void ReplyCodec.encode(download(file)).then(respond)
  })
  shotImageUrlStream.subscribe(([id, , respond]) => {
    void ReplyCodec.encode(store.imageUrl(id)).then(respond)
  })

  void toolbarAction().setBadgeBackgroundColor({ color: '#ff3366' })

  toolbarAction().onClicked.addListener(() => {
    void sendToActiveTab(togglePopup.toTab)
  })

  browser.commands.onCommand.addListener((command) => {
    void match(command)
      .with('toggle-popup', () => sendToActiveTab(togglePopup.toTab))
      .with('pick-element', () => sendToActiveTab(pickElement.toTab))
      .with('snag-selection', () =>
        sendToActiveTab((options) => captureMode('selection', options)),
      )
      .with('snag-visible', () =>
        sendToActiveTab((options) => captureMode('visible', options)),
      )
      .with('snag-page', () =>
        sendToActiveTab((options) => captureMode('page', options)),
      )
      .otherwise(() => undefined)
  })
})
