import { Inject, Injectable, Injector } from '@tanbo/di'
import { Component, Shortcut, ZenCodingGrammarInterceptor } from '../model/_api'
import { Commander } from './commander'
import { Selection } from './selection'
import { COMPONENT_LIST, ZEN_CODING_DETECT } from './_injection-tokens'

export interface KeymapState {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
}

interface ShortcutEx {
  test(key: string): boolean

  config: Shortcut
}

interface ZenCodingInterceptor {
  /** 匹配字符 */
  match(key: string): boolean

  /** 触发键 */
  try(key: string): boolean

  /** 触发执行的方法 */
  action(content: string): boolean
}

/**
 * Textbus 键盘管理
 */
@Injectable()
export class Keyboard {
  private shortcutList: ShortcutEx[] = []
  private zenCodingInterceptors: ZenCodingInterceptor[] = []

  constructor(@Inject(COMPONENT_LIST) private components: Component[],
              @Inject(ZEN_CODING_DETECT) private markdownDetect: boolean,
              private commander: Commander,
              private injector: Injector,
              private selection: Selection) {
    components.forEach(component => {
      const config = component.zenCoding
      if (config) {
        this.zenCodingInterceptors.push(this.createZenCodingEx(component, config))
      }
    })
  }

  /**
   * 注册输入语法糖
   * @param interceptor
   */
  addZenCodingInterceptor(interceptor: ZenCodingInterceptor) {
    this.zenCodingInterceptors.unshift(interceptor)
    return {
      remove: () => {
        const index = this.zenCodingInterceptors.indexOf(interceptor)
        if (index > -1) {
          this.zenCodingInterceptors.splice(index, 1)
        }
      }
    }
  }

  /**
   * 调用快捷键
   * @param keymapState 快捷键配置
   */
  execShortcut(keymapState: KeymapState): boolean {
    if (!this.selection.isSelected) {
      return false
    }
    const key = keymapState.key
    // const reg = /\w+/.test(key) ? new RegExp(`^${key}$`, 'i') : new RegExp(`^[${key.replace(/([-^\\\]\[])/g, '\\$1')}]$`, 'i')

    const commonAncestorSlot = this.selection.commonAncestorSlot!
    if (this.markdownDetect &&
      !keymapState.ctrlKey &&
      !keymapState.shiftKey &&
      !keymapState.altKey &&
      commonAncestorSlot === this.selection.startSlot &&
      commonAncestorSlot === this.selection.endSlot) {
      for (const interceptor of this.zenCodingInterceptors) {
        const matchKey = interceptor.try(key)
        if (matchKey) {
          const activeSlotContents = commonAncestorSlot.sliceContent()
          let content = activeSlotContents[0]
          if (activeSlotContents.length > 1 || typeof content !== 'string') {
            continue
          }

          content = content.replace(/\n$/, '')

          const matchContent = interceptor.match(content)
          if (matchContent) {
            const r = interceptor.action(content)
            if (!r) {
              break
            }
            return true
          }
        }
      }
    }
    const commonAncestorComponent = this.selection.commonAncestorComponent
    if (commonAncestorComponent) {
      const is = this.handleShortcut(keymapState, commonAncestorComponent.shortcutList.map(s => this.createShortcutEx(s)))
      if (is) {
        return true
      }
    }
    return this.handleShortcut(keymapState, this.shortcutList)
  }

  /**
   * 注册快捷键
   * @param shortcut 快捷键配置
   */
  addShortcut(shortcut: Shortcut) {
    const shortcutEx = this.createShortcutEx(shortcut)
    this.shortcutList.unshift(shortcutEx)
    return {
      remove: () => {
        const index = this.shortcutList.indexOf(shortcutEx)
        if (index > -1) {
          this.shortcutList.splice(index, 1)
        }
      }
    }
  }

  private handleShortcut(keymap: KeymapState, shortcutList: ShortcutEx[]) {
    for (const ex of shortcutList) {
      const config = ex.config
      if (ex.test(keymap.key) &&
        !!config.keymap.altKey === keymap.altKey &&
        !!config.keymap.shiftKey === keymap.shiftKey &&
        !!config.keymap.ctrlKey === keymap.ctrlKey) {
        const b = config.action(keymap.key)
        if (b !== false) {
          return true
        }
      }
    }
    return false
  }

  private createZenCodingEx(component: Component, config: ZenCodingGrammarInterceptor) {
    const selection = this.selection
    const commander = this.commander
    return {
      match(content: string) {
        return typeof config.match === 'function' ? config.match(content) : config.match.test(content)
      },
      try(key: string): boolean {
        if (typeof config.key === 'string') {
          return key.toLowerCase() === config.key.toLowerCase()
        }
        if (typeof config.key === 'function') {
          return config.key(key)
        }
        if (Array.isArray(config.key)) {
          return config.key.some(item => item.toLowerCase() === key.toLowerCase())
        }
        return config.key.test(key)
      },
      action: (content: string) => {
        const commonAncestorSlot = selection.commonAncestorSlot!
        const initData = config.generateInitData(content, this.injector)
        const newInstance = component.createInstance(this.injector, initData)
        if (commonAncestorSlot.schema.includes(newInstance.type)) {
          selection.selectSlot(commonAncestorSlot)
          commander.delete()
          commander.insert(newInstance)
        } else {
          const parentComponent = commonAncestorSlot.parent
          if (parentComponent && parentComponent.slots.length > 1) {
            return false
          }
          const parentSlot = parentComponent?.parent
          if (!parentSlot) {
            return false
          }
          selection.selectComponent(parentComponent)
          commander.delete()
          commander.insert(newInstance)
        }
        const newSlot = newInstance.slots.first
        if (newSlot) {
          selection.setPosition(newSlot, 0)
        } else if (newInstance.parent) {
          const index = newInstance.parent.indexOf(newInstance)
          selection.setPosition(newInstance.parent, index + 1)
        }
        return true
      }
    }
  }

  private createShortcutEx(config: Shortcut): ShortcutEx {
    const key = config.keymap.key
    return {
      config,
      test(k: string): boolean {
        if (typeof key === 'string') {
          return k.toLowerCase() === key.toLowerCase()
        } else if (Array.isArray(key)) {
          return key.some(v => {
            return k.toLowerCase() === v.toLowerCase()
          })
        } else if (typeof key.match === 'function') {
          return key.match(k)
        }
        return key.match.test(k)
      }
    }
  }
}
