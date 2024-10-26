import { Injectable } from '@tanbo/di'
import { NativeNode, NativeRenderer } from '@textbus/core'

/**
 * Textbus PC 端浏览器渲染能力实现
 */
@Injectable()
export class DomRenderer implements NativeRenderer {
  isSVG = new RegExp(`^(${[
    // 'a',
    'animate',
    'animateMotion',
    'animateTransform',
    'circle',
    'clipPath',
    'defs',
    'desc',
    'ellipse',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
    'filter',
    'foreignObject',
    'g',
    'image',
    'line',
    'linearGradient',
    'marker',
    'mask',
    'metadata',
    'mpath',
    'path',
    'pattern',
    'polygon',
    'polyline',
    'radialGradient',
    'rect',
    // 'script',
    'set',
    'stop',
    // 'style',
    'svg',
    'switch',
    'symbol',
    'text',
    'textPath',
    'title',
    'tspan',
    'use',
    'view'
  ].join('|')
  })$`, 'i')

  xlinkNameSpace = 'http://www.w3.org/1999/xlink'
  possibleXlinkNames = {
    xlinkActuate: 'xlink:actuate',
    xlinkactuate: 'xlink:actuate',
    'xlink:actuate': 'xlink:actuate',

    xlinkArcrole: 'xlink:arcrole',
    xlinkarcrole: 'xlink:arcrole',
    'xlink:arcrole': 'xlink:arcrole',

    xlinkHref: 'xlink:href',
    xlinkhref: 'xlink:href',
    'xlink:href': 'xlink:href',

    xlinkRole: 'xlink:role',
    xlinkrole: 'xlink:role',
    'xlink:role': 'xlink:role',

    xlinkShow: 'xlink:show',
    xlinkshow: 'xlink:show',
    'xlink:show': 'xlink:show',

    xlinkTitle: 'xlink:title',
    xlinktitle: 'xlink:title',
    'xlink:title': 'xlink:title',

    xlinkType: 'xlink:type',
    xlinktype: 'xlink:type',
    'xlink:type': 'xlink:type'
  }
  booleanProps: Record<string, string[]> = {
    input: ['disabled', 'readonly'],
    select: ['disabled', 'readonly'],
    option: ['disabled', 'selected'],
    button: ['disabled'],
    video: ['controls', 'autoplay', 'loop', 'muted'],
    audio: ['controls', 'autoplay', 'loop', 'muted'],
  }
  valueProps: Record<string, string[]> = {
    input: ['value'],
    option: ['value'],
    video: ['src'],
    audio: ['src']
  }

  listen<T = any>(node: NativeNode, type: string, callback: (ev: T) => any) {
    node.addEventListener(type, callback)
  }

  unListen(node: NativeNode, type: string, callback: (ev: any) => any) {
    node.removeEventListener(type, callback)
  }

  createTextNode(textContent: string): NativeNode {
    return document.createTextNode(DomRenderer.replaceEmpty(textContent))
  }

  createElement(name: string): NativeNode {
    if (this.isSVG.test(name)) {
      return document.createElementNS('http://www.w3.org/2000/svg', name)
    }
    return document.createElement(name)
  }

  appendChild(parent: NativeNode, newChild: NativeNode) {
    parent.appendChild(newChild)
  }

  remove(node: NativeNode) {
    node.parentNode?.removeChild(node)
  }

  insertBefore(newNode: NativeNode, ref: NativeNode) {
    ref.parentNode.insertBefore(newNode, ref)
  }

  getChildByIndex(parent: NativeNode, index: number): NativeNode | null {
    return parent.childNodes[index] || null
  }

  addClass(target: NativeNode, name: string) {
    target.classList.add(name)
  }

  removeClass(target: NativeNode, name: string) {
    target.classList.remove(name)
  }

  setStyle(target: NativeNode, key: string, value: any) {
    target.style[key] = value ?? ''
  }

  syncTextContent(target: NativeNode, content: string) {
    const c = DomRenderer.replaceEmpty(content)
    if (target.textContent !== c) {
      target.textContent = c
    }
  }

  removeStyle(target: NativeNode, key: string) {
    target.style[key] = ''
  }

  setAttribute(target: NativeNode, key: string, value: string) {
    if (this.possibleXlinkNames[key]) {
      this.setXlinkAttribute(target, this.possibleXlinkNames[key], value)
      return
    }
    target.setAttribute(key, value)
    const tag = target.tagName.toLowerCase()
    const booleanTagNames = this.booleanProps[tag]
    const valueTagNames = this.valueProps[tag]
    if (booleanTagNames && booleanTagNames.includes(key)) {
      target[key] = Boolean(value)
    }
    if (valueTagNames && valueTagNames.includes(key)) {
      target[key] = value
    }
  }

  removeAttribute(target: NativeNode, key: string) {
    if (this.possibleXlinkNames[key]) {
      this.removeXlinkAttribute(target, this.possibleXlinkNames[key])
    }
    target.removeAttribute(key)
    const tag = target.tagName.toLowerCase()
    const booleanTagNames = this.booleanProps[tag]
    const valueTagNames = this.valueProps[tag]
    if (booleanTagNames && booleanTagNames.includes(key)) {
      target[key] = false
    }
    if (valueTagNames && valueTagNames.includes(key)) {
      target[key] = ''
    }
  }

  setXlinkAttribute(target: NativeNode, key: string, value: string) {
    target.setAttributeNS(this.xlinkNameSpace, key, value)
  }

  removeXlinkAttribute(target: NativeNode, key: string) {
    target.removeAttributeNS(this.xlinkNameSpace, key)
  }

  replace(newChild: NativeNode, oldChild: NativeNode) {
    oldChild.parentNode.replaceChild(newChild, oldChild)
  }

  copy() {
    document.execCommand('copy')
  }

  static replaceEmpty(s: string) {
    const empty = '\u00a0'
    return s.replace(/\s\s+/g, str => {
      return ' ' + Array.from({
        length: str.length - 1
      }).fill(empty).join('')
    }).replace(/^\s|\s$/g, empty)
  }
}