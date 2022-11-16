import { Injectable, Injector, Optional } from '@tanbo/di'
import {
  createElement,
  VIEW_CONTAINER,
  getLayoutRectByRange,
  SelectionBridge
} from '@textbus/browser'
import { Selection, SelectionPaths, AbstractSelection, Scheduler, Rect } from '@textbus/core'
import { fromEvent, Subject, Subscription } from '@tanbo/stream'

export interface RemoteSelection {
  id: string
  color: string
  username: string
  paths: SelectionPaths
}

export interface SelectionRect extends Rect {
  color: string
  username: string
  id: string
}

export interface RemoteSelectionCursor {
  cursor: HTMLElement
  anchor: HTMLElement
  userTip: HTMLElement
}

export abstract class CollaborateSelectionAwarenessDelegate {
  abstract getRects(abstractSelection: AbstractSelection, nativeRange: Range): false | Rect[]
}

@Injectable()
export class CollaborateCursor {
  private host = createElement('div', {
    styles: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 1
    }
  })
  private canvasContainer = createElement('div', {
    styles: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden'
    }
  })
  private canvas = createElement('canvas', {
    styles: {
      position: 'absolute',
      opacity: 0.5,
      left: 0,
      top: 0,
      width: '100%',
      height: document.documentElement.clientHeight + 'px',
      pointerEvents: 'none',
    }
  }) as HTMLCanvasElement
  private context = this.canvas.getContext('2d')!
  private tooltips = createElement('div', {
    styles: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontSize: '12px',
      zIndex: 10
    }
  })

  private onRectsChange = new Subject<SelectionRect[]>()

  private subscription = new Subscription()
  private currentSelection: RemoteSelection[] = []
  private container: HTMLElement

  constructor(private injector: Injector,
              private nativeSelection: SelectionBridge,
              private scheduler: Scheduler,
              private selection: Selection,
              @Optional() private awarenessDelegate?: CollaborateSelectionAwarenessDelegate) {
    this.container = injector.get(VIEW_CONTAINER)
    this.canvasContainer.append(this.canvas)
    this.host.append(this.canvasContainer, this.tooltips)
    this.container.prepend(this.host)
    this.subscription.add(this.onRectsChange.subscribe(rects => {
      for (const rect of rects) {
        this.context.fillStyle = rect.color
        this.context.beginPath()
        this.context.rect(rect.left, rect.top, rect.width, rect.height)
        this.context.fill()
        this.context.closePath()
      }
    }), fromEvent(window, 'resize').subscribe(() => {
      this.canvas.style.height = document.documentElement.clientHeight + 'px'
      this.refresh()
    }), this.scheduler.onDocChanged.subscribe(() => {
      this.refresh()
    }))
  }

  refresh() {
    this.draw(this.currentSelection)
  }

  destroy() {
    this.subscription.unsubscribe()
  }

  draw(paths: RemoteSelection[]) {
    this.currentSelection = paths
    const containerRect = this.container.getBoundingClientRect()
    this.canvas.style.top = containerRect.top * -1 + 'px'
    this.canvas.width = this.canvas.offsetWidth
    this.canvas.height = this.canvas.offsetHeight
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)

    const users: SelectionRect[] = []

    paths.filter(i => {
      return i.paths.anchor.length && i.paths.focus.length
    }).forEach(item => {
      const anchorPaths = [...item.paths.anchor]
      const focusPaths = [...item.paths.focus]
      const anchorOffset = anchorPaths.pop()!
      const anchorSlot = this.selection.findSlotByPaths(anchorPaths)
      const focusOffset = focusPaths.pop()!
      const focusSlot = this.selection.findSlotByPaths(focusPaths)
      if (!anchorSlot || !focusSlot) {
        return
      }

      const { focus, anchor } = this.nativeSelection.getPositionByRange({
        focusOffset,
        anchorOffset,
        focusSlot,
        anchorSlot
      })
      if (!focus || !anchor) {
        return
      }
      const nativeRange = document.createRange()
      nativeRange.setStart(anchor.node, anchor.offset)
      nativeRange.setEnd(focus.node, focus.offset)
      if ((anchor.node !== focus.node || anchor.offset !== focus.offset) && nativeRange.collapsed) {
        nativeRange.setStart(focus.node, focus.offset)
        nativeRange.setEnd(anchor.node, anchor.offset)
      }

      let rects: Rect[] | DOMRectList | false = false
      if (this.awarenessDelegate) {
        rects = this.awarenessDelegate.getRects({
          focusOffset,
          anchorOffset,
          focusSlot,
          anchorSlot
        }, nativeRange)
      }
      if (!rects) {
        rects = nativeRange.getClientRects()
      }
      const selectionRects: SelectionRect[] = []
      for (let i = rects.length - 1; i >= 0; i--) {
        const rect = rects[i]
        selectionRects.push({
          id: item.id,
          color: item.color,
          username: item.username,
          left: rect.left - containerRect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        })
      }
      this.onRectsChange.next(selectionRects)

      const cursorRange = nativeRange.cloneRange()
      cursorRange.setStart(focus.node, focus.offset)
      cursorRange.collapse(true)

      const cursorRect = getLayoutRectByRange(cursorRange)

      const rect: SelectionRect = {
        id: item.id,
        username: item.username,
        color: item.color,
        left: cursorRect.left - containerRect.left,
        top: cursorRect.top - containerRect.top,
        width: 1,
        height: cursorRect.height
      }
      if (rect.left < 0 || rect.top < 0 || rect.left > containerRect.width) {
        return
      }
      users.push(rect)
    })
    this.drawUserCursor(users)
  }

  protected drawUserCursor(rects: SelectionRect[]) {
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]
      const { cursor, userTip, anchor } = this.getUserCursor(i)
      Object.assign(cursor.style, {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        background: rect.color,
        display: 'block'
      })
      anchor.style.background = rect.color
      userTip.innerText = rect.username
      userTip.style.background = rect.color
    }

    for (let i = rects.length; i < this.tooltips.children.length; i++) {
      this.tooltips.removeChild(this.tooltips.children[i])
    }
  }

  private getUserCursor(index: number): RemoteSelectionCursor {
    let child: HTMLElement = this.tooltips.children[index] as HTMLElement
    if (child) {
      const anchor = child.children[0] as HTMLElement
      return {
        cursor: child,
        anchor,
        userTip: anchor.children[0] as HTMLElement
      }
    }
    const userTip = createElement('span', {
      styles: {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '2px',
        bottom: '100%',
        whiteSpace: 'nowrap',
        color: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.1)',
        opacity: 0.8,
        borderRadius: '3px',
        padding: '3px 5px',
        pointerEvents: 'none',
      }
    })

    const anchor = createElement('span', {
      styles: {
        position: 'absolute',
        top: '-2px',
        left: '-2px',
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        pointerEvents: 'auto',
        pointer: 'cursor',
      },
      children: [userTip]
    })
    child = createElement('span', {
      styles: {
        position: 'absolute',
      },
      children: [
        anchor
      ]
    })
    this.tooltips.append(child)
    return {
      cursor: child,
      anchor,
      userTip
    }
  }
}
