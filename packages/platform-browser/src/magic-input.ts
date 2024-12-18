import { distinctUntilChanged, filter, fromEvent, map, merge, Observable, Subject, Subscription } from '@tanbo/stream'
import { Injectable } from '@viewfly/core'
import {
  Commander,
  CompositionStartEventData,
  ContentType,
  Controller,
  Event,
  invokeListener,
  Keyboard,
  Scheduler,
  Selection,
  Slot,
  Textbus
} from '@textbus/core'

import { createElement, getLayoutRectByRange } from './_utils/uikit'
import { Parser } from './parser'
import { isFirefox, isMac, isSafari, isWindows } from './_utils/env'
import { VIEW_MASK } from './injection-tokens'
import { Caret, CaretLimit, CaretPosition, Input } from './types'
import { DomAdapter } from './dom-adapter'

const iframeHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>Textbus</title>
  <style>
    html {position: fixed; left:0; overflow: hidden}
    html, body{height: 100%;width:100%}
    body{margin:0; overflow: hidden}
    textarea{width: 2000px;height: 100%;opacity: 0; padding: 0; outline: none; border: none; position: absolute; left:0; top:0;}
  </style>
</head>
<body>
</body>
</html>
`

interface CaretStyle {
  height: string
  lineHeight: string
  fontSize: string
}

class ExperimentalCaret implements Caret {
  onPositionChange: Observable<CaretPosition | null>
  onStyleChange: Observable<CaretStyle>
  elementRef: HTMLElement
  changeFromSelf = false

  getLimit = function (): CaretLimit {
    return {
      top: 0,
      bottom: document.documentElement.clientHeight
    }
  }

  get rect() {
    return this.caret.getBoundingClientRect()
  }

  private timer: any = null
  private caret: HTMLElement

  private set display(v: boolean) {
    this._display = v
    this.caret.style.visibility = v ? 'visible' : 'hidden'
  }

  private get display() {
    return this._display
  }

  private _display = true
  private flashing = true

  private subscription = new Subscription()

  private positionChangeEvent = new Subject<CaretPosition | null>()
  private styleChangeEvent = new Subject<CaretStyle>()
  private oldRange: Range | null = null

  constructor(
    private domRenderer: DomAdapter,
    private scheduler: Scheduler,
    private editorMask: HTMLElement) {
    this.onPositionChange = this.positionChangeEvent.pipe(distinctUntilChanged())
    this.onStyleChange = this.styleChangeEvent.asObservable()
    this.elementRef = createElement('div', {
      styles: {
        position: 'absolute',
        width: '2px',
        pointerEvents: 'none'
      },
      children: [
        this.caret = createElement('span', {
          styles: {
            width: '100%',
            height: '100%',
            position: 'absolute',
            left: 0,
            top: 0
          }
        })
      ]
    })

    this.subscription.add(
      fromEvent(document, 'mousedown').subscribe(() => {
        this.flashing = false
      }),
      fromEvent(document, 'mouseup').subscribe(() => {
        this.flashing = true
      }),
    )
    this.editorMask.appendChild(this.elementRef)
  }

  refresh() {
    if (this.oldRange) {
      this.show(this.oldRange, false)
    }
  }

  show(range: Range, restart: boolean) {
    this.oldRange = range
    if (restart || this.scheduler.lastChangesHasLocalUpdate) {
      clearTimeout(this.timer)
    }
    this.updateCursorPosition(range)
    if (range.collapsed) {
      if (restart || this.scheduler.lastChangesHasLocalUpdate) {
        this.display = true
        const toggleShowHide = () => {
          this.display = !this.display || !this.flashing
          this.timer = setTimeout(toggleShowHide, 400)
        }
        clearTimeout(this.timer)
        this.timer = setTimeout(toggleShowHide, 400)
      }
    } else {
      this.display = false
      clearTimeout(this.timer)
    }
  }

  hide() {
    this.display = false
    clearTimeout(this.timer)
    this.positionChangeEvent.next(null)
  }

  destroy() {
    clearTimeout(this.timer)
    // this.caret.
    this.subscription.unsubscribe()
  }

  private updateCursorPosition(nativeRange: Range) {
    const startContainer = nativeRange.startContainer

    const node = (startContainer.nodeType === Node.ELEMENT_NODE ? startContainer : startContainer.parentNode) as HTMLElement
    if (node?.nodeType !== Node.ELEMENT_NODE) {
      this.positionChangeEvent.next(null)
      return
    }
    const compositionNode = this.domRenderer.compositionNode
    if (compositionNode) {
      nativeRange = nativeRange.cloneRange()
      nativeRange.selectNodeContents(compositionNode)
      nativeRange.collapse()
    }
    const rect = getLayoutRectByRange(nativeRange)
    const { fontSize, lineHeight, color, writingMode } = getComputedStyle(node)

    let height: number
    if (isNaN(+lineHeight)) {
      const f = parseFloat(lineHeight)
      if (isNaN(f)) {
        height = parseFloat(fontSize)
      } else {
        height = f
      }
    } else {
      height = parseFloat(fontSize) * parseFloat(lineHeight)
    }

    const boxHeight = Math.max(Math.floor(Math.max(height, rect.height)), 12)
    // const boxHeight = Math.floor(height)

    let rectTop = rect.top
    if (rect.height < height) {
      rectTop -= (height - rect.height) / 2
    }

    rectTop = Math.floor(rectTop)

    const containerRect = this.editorMask.getBoundingClientRect()

    const top = Math.floor(rectTop - containerRect.top)
    const left = Math.floor(rect.left + rect.width / 2 - containerRect.left)
    let rotate = 0
    if (nativeRange.collapsed) {
      rotate = Math.round(Math.atan2(rect.width, rect.height) * 180 / Math.PI)

      if (rotate !== 0) {
        const hackEle = document.createElement('span')
        // eslint-disable-next-line max-len
        hackEle.style.cssText = 'display: inline-block; width: 10px; height: 10px; position: relative; contain: layout style size; writing-mode: inherit'
        const pointEle = document.createElement('span')
        pointEle.style.cssText = 'position: absolute; left: 0; top: 0; width:0;height:0'
        hackEle.append(pointEle)
        node.append(hackEle)

        const t1 = pointEle.getBoundingClientRect().top
        pointEle.style.right = '0'
        pointEle.style.left = ''
        const t2 = pointEle.getBoundingClientRect().top

        if (t2 < t1) {
          rotate = -rotate
        }
        hackEle.remove()
      }
    }
    if (rotate === 0 && (writingMode === 'vertical-lr' || writingMode === 'vertical-rl')) {
      rotate += 90
    }
    Object.assign(this.elementRef.style, {
      left: left + 'px',
      top: top + 'px',
      height: boxHeight + 'px',
      lineHeight: boxHeight + 'px',
      fontSize,
      transform: `rotate(${rotate}deg)`,
    })

    this.caret.style.backgroundColor = color
    this.styleChangeEvent.next({
      height: boxHeight + 'px',
      lineHeight: boxHeight + 'px',
      fontSize
    })
    this.positionChangeEvent.next({
      left,
      top: rectTop,
      height: boxHeight
    })

    if (this.changeFromSelf) {
      this.changeFromSelf = false
      const selfRect = this.elementRef.getBoundingClientRect()
      const scrollContainer = this.getScrollContainer(startContainer)
      const scrollRect = scrollContainer === document.documentElement ?
        { top: 0, bottom: document.documentElement.clientHeight } :
        scrollContainer.getBoundingClientRect()
      const limit = this.getLimit()

      const top = Math.max(limit.top, scrollRect.top)
      const bottom = Math.min(limit.bottom, scrollRect.bottom)

      if (selfRect.top < top) {
        scrollContainer.scrollTop -= top - selfRect.top
      } else if (selfRect.bottom > bottom) {
        scrollContainer.scrollTop += selfRect.bottom - bottom
      }
    }
  }

  private getScrollContainer(container: Node): Element {
    while (container) {
      if (container instanceof Element) {
        const styles = getComputedStyle(container)
        if (styles.overflow !== 'visible' || styles.overflowX !== 'visible' || styles.overflowY !== 'visible') {
          return container
        }
      }
      container = container.parentNode as Node
    }
    return document.documentElement
  }
}


/**
 * Textbus PC 端输入实现
 */
@Injectable()
export class MagicInput extends Input {
  composition = false
  onReady: Promise<void>
  caret = new ExperimentalCaret(this.domAdapter, this.scheduler, this.textbus.get(VIEW_MASK))

  set disabled(b: boolean) {
    this._disabled = b
    if (b && this.textarea) {
      this.textarea.disabled = b
    }
  }

  get disabled() {
    return this._disabled
  }

  private isSafari = isSafari()
  private isFirefox = isFirefox()
  private isMac = isMac()
  private isWindows = isWindows()
  private _disabled = false
  private container = this.createEditableFrame()

  private subscription = new Subscription()
  private doc!: Document

  private textarea: HTMLTextAreaElement | null = null

  private isFocus = false
  private nativeFocus = false

  private ignoreComposition = false // 有 bug 版本搜狗拼音

  constructor(private domAdapter: DomAdapter,
              private parser: Parser,
              private keyboard: Keyboard,
              private commander: Commander,
              private selection: Selection,
              private controller: Controller,
              private scheduler: Scheduler,
              private textbus: Textbus) {
    super()
    this.onReady = new Promise<void>(resolve => {
      this.subscription.add(
        fromEvent(this.container, 'load').subscribe(() => {
          const doc = this.container.contentDocument!
          doc.open()
          doc.write(iframeHTML)
          doc.close()
          this.doc = doc
          this.init()
          resolve()
        }),
        controller.onReadonlyStateChange.subscribe(() => {
          if (controller.readonly) {
            this.blur()
          }
        })
      )
    })

    this.caret.elementRef.append(this.container)
  }

  focus(range: Range, restart: boolean) {
    if (!this.disabled) {
      this.caret.show(range, restart)
    }
    if (this.controller.readonly) {
      return
    }
    if (!this.isFocus) {
      this.textarea?.focus()
      setTimeout(() => {
        if (!this.nativeFocus && this.isFocus) {
          this.reInit()
        }
      })
    }
    this.isFocus = true
  }

  blur() {
    this.caret.hide()
    this.textarea?.blur()
    this.isFocus = false
  }

  destroy() {
    this.caret.destroy()
    this.subscription.unsubscribe()
  }

  private reInit(delay = false) {
    this.subscription.unsubscribe()
    this.textarea?.parentNode?.removeChild(this.textarea)
    this.subscription = new Subscription()
    this.init()
    if (delay) {
      setTimeout(() => {
        this.textarea?.focus()
      })
    } else {
      this.textarea?.focus()
    }
  }

  private init() {
    const doc = this.doc
    const contentBody = doc.body
    const textarea = doc.createElement('textarea')
    textarea.disabled = this.disabled
    contentBody.appendChild(textarea)
    this.textarea = textarea
    this.subscription.add(
      fromEvent(textarea, 'blur').subscribe(() => {
        // if (this.isFocus) {
        //   this.isFocus = false
        //   this.reInit(true)
        // }
        this.isFocus = false
        this.nativeFocus = false
        this.caret.hide()
        if (this.domAdapter.composition) {
          const slot = this.domAdapter.composition.slot
          this.domAdapter.composition = null
          this.domAdapter.compositionNode = null
          slot.__changeMarker__.forceMarkDirtied()
        }
      }),
      fromEvent(textarea, 'focus').subscribe(() => {
        this.nativeFocus = true
      }),
      this.caret.onStyleChange.subscribe(style => {
        Object.assign(textarea.style, style)
      })
    )
    this.handleInput(textarea)
    this.handleShortcut(textarea)
    this.handleDefaultActions(textarea)
  }

  private handleDefaultActions(textarea: HTMLTextAreaElement) {
    this.subscription.add(
      fromEvent<ClipboardEvent>(isFirefox() ? textarea : document, 'copy').subscribe(ev => {
        this.copyHandler(ev)
      }),
      fromEvent<ClipboardEvent>(textarea, 'paste').subscribe(ev => {
        this.pasteHandler(ev)
      })
    )
  }

  copyHandler(ev: ClipboardEvent) {
    const selection = this.selection
    if (!selection.isSelected) {
      return
    }
    if (selection.startSlot === selection.endSlot && selection.endOffset! - selection.startOffset! === 1) {
      const content = selection.startSlot!.getContentAtIndex(selection.startOffset!)
      if (typeof content === 'object') {
        const clipboardData = ev.clipboardData!
        const nativeSelection = document.getSelection()!
        const range = nativeSelection.getRangeAt(0)
        const div = document.createElement('div')
        const fragment = range.cloneContents()
        div.append(fragment)
        clipboardData.setData('text/html', div.innerHTML)
        clipboardData.setData('text', div.innerText)
        ev.preventDefault()
      }
    }
  }

  pasteHandler(ev: ClipboardEvent) {
    const text = ev.clipboardData!.getData('Text')

    const types = Array.from(ev.clipboardData!.types || [])
    const files = Array.from(ev.clipboardData!.files)
    if (types.every(type => type === 'Files') && files.length) {
      Promise.all(files.filter(i => {
        return /image/i.test(i.type)
      }).map(item => {
        const reader = new FileReader()
        return new Promise(resolve => {
          reader.onload = (event) => {
            resolve(event.target!.result)
          }
          reader.readAsDataURL(item)
        })
      })).then(urls => {
        const html = urls.map(i => {
          return `<img src=${i}>`
        }).join('')
        this.paste(html, text)
      })
      ev.preventDefault()
      return
    }

    const div = this.doc.createElement('div')
    div.style.cssText = 'width:1px; height:10px; overflow: hidden; position: fixed; left: 50%; top: 50%; opacity:0'
    div.contentEditable = 'true'
    this.doc.body.appendChild(div)
    div.focus()
    setTimeout(() => {
      this.doc.body.removeChild(div)
      div.style.cssText = ''
      this.paste(div, text)
    })
  }

  private paste(dom: HTMLElement | string, text: string) {
    const slot = this.parser.parse(dom, new Slot([
      ContentType.BlockComponent,
      ContentType.InlineComponent,
      ContentType.Text
    ]))

    this.commander.paste(slot, text)
  }

  private handleShortcut(textarea: HTMLTextAreaElement) {
    let isWriting = false
    let isIgnore = false
    this.subscription.add(
      fromEvent(textarea, 'compositionstart').subscribe(() => {
        isWriting = true
      }),
      fromEvent(textarea, 'compositionend').subscribe(() => {
        isWriting = false
      }),
      fromEvent<InputEvent>(textarea, 'beforeinput').subscribe(ev => {
        this.ignoreComposition = false
        if (this.isSafari) {
          if (ev.inputType === 'insertFromComposition') {
            isIgnore = true
          }
        }
      }),
      fromEvent<KeyboardEvent>(textarea, 'keydown').pipe(filter(() => {
        if (this.isSafari && isIgnore) {
          isIgnore = false
          return false
        }
        return !isWriting // || !this.textarea.value
      })).subscribe(ev => {
        this.ignoreComposition = false
        let key = ev.key
        const keys = ')!@#$%^Z&*('
        const b = key === 'Process' && /Digit\d/.test(ev.code) && ev.shiftKey
        if (b) {
          // 大小写锁定为大写 + 全角 + shift + 数字键，还存在问题
          key = keys.charAt(+ev.code.substring(5))
          ev.preventDefault()
        }
        this.caret.changeFromSelf = true
        const is = this.keyboard.execShortcut({
          key: key,
          altKey: ev.altKey,
          shiftKey: ev.shiftKey,
          modKey: this.isMac ? ev.metaKey : ev.ctrlKey,
          agent: {
            key: ev.key,
            code: ev.code,
            keyCode: ev.keyCode,
          }
        })
        if (is) {
          this.ignoreComposition = true
          ev.preventDefault()
        } else {
          this.caret.changeFromSelf = false
        }
      })
    )
  }

  private handleInput(textarea: HTMLTextAreaElement) {
    let startIndex = 0
    this.subscription.add(
      fromEvent<CompositionEvent>(textarea, 'compositionstart').pipe(filter(() => {
        return !this.ignoreComposition
      })).subscribe(() => {
        if (!this.selection.isCollapsed) {
          this.caret.changeFromSelf = true
          this.commander.delete()
        }
        this.composition = true
        startIndex = this.selection.startOffset!
        const startSlot = this.selection.startSlot!
        const event = new Event<Slot, CompositionStartEventData>(startSlot, {
          index: startIndex
        })
        invokeListener(startSlot.parent!, 'onCompositionStart', event)
      }),
      fromEvent<CompositionEvent>(textarea, 'compositionupdate').pipe(filter(() => {
        return !this.ignoreComposition
      })).pipe(distinctUntilChanged((prev, next) => {
        return prev.data !== next.data
      })).subscribe(ev => {
        if (ev.data === ' ') {
          // 处理搜狗五笔不符合 composition 事件预期，会意外跳光标的问题
          return
        }
        const startSlot = this.selection.startSlot!
        this.domAdapter.composition = {
          slot: startSlot,
          text: ev.data,
          offset: ev.data.length,
          index: startIndex
        }

        this.caret.changeFromSelf = true
        this.caret.refresh()
        const event = new Event(startSlot, {
          index: startIndex,
          data: ev.data
        })

        invokeListener(startSlot.parent!, 'onCompositionUpdate', event)
        startSlot.__changeMarker__.forceMarkDirtied()
      })
    )
    let isCompositionEnd = false
    this.subscription.add(
      merge(
        fromEvent<InputEvent>(textarea, 'beforeinput').pipe(
          filter(ev => {
            ev.preventDefault()
            if (this.isFirefox && ev.inputType === 'insertFromPaste') {
              return false
            }
            if (this.isSafari) {
              isCompositionEnd = ev.inputType === 'insertFromComposition'
              return ev.inputType === 'insertText' || ev.inputType === 'insertFromComposition'
            }
            return !ev.isComposing && !!ev.data
          }),
          map(ev => {
            return ev.data as string
          })
        ),
        this.isSafari ? new Observable<string>() : fromEvent<CompositionEvent>(textarea, 'compositionend')
          .pipe(filter(() => {
            return !this.ignoreComposition
          })).pipe(
            map(ev => {
              isCompositionEnd = true
              ev.preventDefault()
              textarea.value = ''
              return ev.data
            })
          )
      ).subscribe(text => {
        this.composition = false
        this.domAdapter.composition = null
        if (text) {
          this.caret.changeFromSelf = true
          this.commander.write(text)
        } else {
          this.selection.startSlot?.__changeMarker__.forceMarkDirtied()
        }
        if (isCompositionEnd) {
          const startSlot = this.selection.startSlot
          if (startSlot) {
            const event = new Event<Slot>(startSlot, null)
            invokeListener(startSlot.parent!, 'onCompositionEnd', event)
          }
        }
        isCompositionEnd = false
      })
    )
  }

  private createEditableFrame() {
    return createElement('iframe', {
      attrs: {
        scrolling: 'no'
      },
      styles: {
        border: 'none',
        width: '100%',
        display: 'block',
        height: '100%',
        position: 'relative',
        top: this.isWindows ? '3px' : '0'
      }
    }) as HTMLIFrameElement
  }
}
