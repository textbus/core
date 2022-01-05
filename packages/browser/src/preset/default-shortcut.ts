import { Injectable } from '@tanbo/di'
import { Commander, History, TBSelection } from '@textbus/core'

import { Input, TBPlugin } from '../core/_api'

@Injectable()
export class DefaultShortcut implements TBPlugin {
  constructor(private selection: TBSelection,
              private history: History,
              private commander: Commander,
              private input: Input) {
  }

  setup() {
    const input = this.input
    input.addShortcut({
      keymap: {
        key: 'Enter'
      },
      action: () => {
        this.commander.enter()
      }
    })
    input.addShortcut({
      keymap: {
        key: 'Enter',
        shiftKey: true
      },
      action: () => {
        const startOffset = this.selection.startOffset!
        const startSlot = this.selection.startSlot!
        const isToEnd = startOffset === startSlot.length || startSlot.isEmpty
        const content = isToEnd ? '\n\n' : '\n'
        const isInserted = this.commander.insert(content)
        if (isInserted && isToEnd) {
          this.selection.setLocation(startSlot, startOffset + 1)
        }
      }
    })
    input.addShortcut({
      keymap: {
        key: ['Delete', 'Backspace']
      },
      action: (key) => {
        this.commander.delete(key === 'Backspace')
      }
    })
    input.addShortcut({
      keymap: {
        key: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
      },
      action: (key) => {
        switch (key) {
          case 'ArrowLeft':
            this.selection.toPrevious()
            break
          case 'ArrowRight':
            this.selection.toNext()
            break
          case 'ArrowUp':
            this.selection.toPreviousLine()
            break
          case 'ArrowDown':
            this.selection.toNextLine()
            break
        }
      }
    })

    input.addShortcut({
      keymap: {
        key: 'a',
        ctrlKey: true
      },
      action: () => {
        this.selection.selectAll()
      }
    })
    input.addShortcut({
      keymap: {
        key: 'c',
        ctrlKey: true
      },
      action: () => {
        this.commander.copy()
      }
    })
    input.addShortcut({
      keymap: {
        key: 'x',
        ctrlKey: true
      },
      action: () => {
        this.commander.cut()
      }
    })
    input.addShortcut({
      keymap: {
        key: 'z',
        ctrlKey: true
      },
      action: () => {
        this.history.back()
      }
    })
    input.addShortcut({
      keymap: {
        key: 'z',
        ctrlKey: true,
        shiftKey: true
      },
      action: () => {
        this.history.forward()
      }
    })
  }
}