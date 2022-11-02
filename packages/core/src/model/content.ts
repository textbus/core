import { ComponentInstance, ComponentLiteral } from './component'

/**
 * Textbus 内容管理类
 */
export class Content {
  private data: Array<string | ComponentInstance> = []

  get length() {
    return this.data.reduce((p, n) => p + n.length, 0)
  }

  correctIndex(index: number, toEnd: boolean) {
    if (index === 0 || index === this.length) {
      return index
    }
    let i = 0
    for (const item of this.data) {
      const itemLength = item.length
      if (typeof item === 'string') {
        if (index > i && index < i + itemLength) {
          const segmenter = new Intl.Segmenter()
          const segments = segmenter.segment(item)
          const points = [...segments]
          let offset = 0
          for (const p of points) {
            const segmentLength = p.segment.length
            if (index > i + offset && index < i + offset + segmentLength) {
              return toEnd ? i + offset + segmentLength : i + offset
            }
            offset += segmentLength
          }
        }
      }
      i += itemLength
      if (i >= index) {
        break
      }
    }
    return index
  }

  insert(index: number, content: string | ComponentInstance) {
    if (index >= this.length) {
      this.append(content)
    } else {
      let i = 0 // 当前内容下标
      let ii = 0 // 当前数组元素下标
      for (const el of this.data) {
        if (index >= i) {
          if (typeof el === 'string') {
            if (index >= i && index < i + el.length) {
              const cc = [el.slice(0, index - i), content, el.slice(index - i)].filter(i => i)
              if (typeof content === 'string') {
                this.data.splice(ii, 1, cc.join(''))
              } else {
                this.data.splice(ii, 1, ...cc)
              }
              break
            }
          } else if (index === i) {
            const prev = this.data[ii - 1]
            if (typeof prev === 'string' && typeof content === 'string') {
              this.data[ii - 1] = prev + content
            } else if (i === 0) {
              this.data.unshift(content)
            } else {
              this.data.splice(ii, 0, content)
            }
            break
          }
        }
        ii++
        i += el.length
      }
    }
  }

  append(content: ComponentInstance | string) {
    const lastChildIndex = this.data.length - 1
    const lastChild = this.data[lastChildIndex]
    if (typeof lastChild === 'string' && typeof content === 'string') {
      this.data[lastChildIndex] = lastChild + content
    } else {
      this.data.push(content)
    }
  }

  cut(startIndex = 0, endIndex = this.length): Array<string | ComponentInstance> {
    if (endIndex <= startIndex) {
      return []
    }
    const discardedContents = this.slice(startIndex, endIndex)
    const elements = this.slice(0, startIndex).concat(this.slice(endIndex, this.length))
    this.data = []
    elements.forEach(item => this.append(item))
    return discardedContents
  }

  slice(startIndex = 0, endIndex = this.length): Array<string | ComponentInstance> {
    if (startIndex >= endIndex) {
      return []
    }
    startIndex = this.correctIndex(startIndex, false)
    endIndex = this.correctIndex(endIndex, true)
    let index = 0
    const result: Array<string | ComponentInstance> = []
    for (const el of this.data) {
      const fragmentStartIndex = index
      const len = el.length
      const fragmentEndIndex = index + len
      index += len

      if (startIndex < fragmentEndIndex && endIndex > fragmentStartIndex) {
        if (typeof el === 'string') {
          const min = Math.max(0, startIndex - fragmentStartIndex)
          const max = Math.min(fragmentEndIndex, endIndex) - fragmentStartIndex
          result.push(el.slice(min, max))
        } else {
          result.push(el)
        }
      }

    }
    return result
  }

  toJSON(): Array<string | ComponentLiteral> {
    return this.data.map(i => {
      if (typeof i === 'string') {
        return i
      }
      return i.toJSON()
    })
  }

  indexOf(element: ComponentInstance): number {
    let index = 0
    for (const item of this.data) {
      if (item === element) {
        return index
      }
      index += item.length
    }
    return -1
  }

  getContentAtIndex(index: number) {
    return this.slice(index, index + 1)[0]
  }

  toGrid() {
    const splitPoints = [0]
    let index = 0
    this.data.forEach(i => {
      index += i.length
      splitPoints.push(index)
    })
    return [...splitPoints]
  }

  toString() {
    return this.data.map(i => {
      if (typeof i === 'string') {
        return i
      }
      return i.toString()
    }).join('')
  }
}
