import { Injectable, Injector } from '@tanbo/di'
import { ComponentLoader, SlotParser } from '@textbus/browser'
import {
  Commander,
  ComponentInitData,
  ComponentInstance,
  ContentType,
  defineComponent,
  onContextMenu,
  onSlotRemove,
  Selection,
  Slot,
  AbstractSelection,
  SlotRender,
  useContext,
  useSelf,
  useSlots,
  useState,
  Renderer,
  VElement
} from '@textbus/core'

import { I18n } from '../i18n'
import {
  autoComplete, createCell, findFocusCell, selectCells,
  serialize,
  slotsToTable,
  TableCellPosition,
  TableCellSlot,
  TableConfig, TableSlotState,
  useTableMultipleRange
} from './hooks/table-multiple-range'
import { CollaborateSelectionAwarenessDelegate } from '@textbus/collaborate'

export {
  createCell
}

@Injectable()
export class TableComponentSelectionAwarenessDelegate extends CollaborateSelectionAwarenessDelegate {
  constructor(private renderer: Renderer,
              private selection: Selection) {
    super()
  }

  override getRects(abstractSelection: AbstractSelection) {
    const { focusSlot, anchorSlot } = abstractSelection
    const focusPaths = this.selection.getPathsBySlot(focusSlot)!
    const anchorPaths = this.selection.getPathsBySlot(anchorSlot)!
    const focusIsStart = Selection.compareSelectionPaths(focusPaths, anchorPaths)
    let startSlot: Slot
    let endSlot: Slot
    if (focusIsStart) {
      startSlot = focusSlot
      endSlot = anchorSlot
    } else {
      startSlot = anchorSlot
      endSlot = focusSlot
    }
    const commonAncestorComponent = Selection.getCommonAncestorComponent(startSlot, endSlot)
    if (commonAncestorComponent?.name !== tableComponent.name) {
      return false
    }

    const startFocusSlot = findFocusCell(commonAncestorComponent, startSlot!)
    const endFocusSlot = findFocusCell(commonAncestorComponent, endSlot!)

    const state = commonAncestorComponent.state as TableConfig

    const {
      startPosition,
      endPosition
    } = selectCells(startFocusSlot as TableCellSlot, endFocusSlot as TableCellSlot, commonAncestorComponent, state.columnCount)

    const renderer = this.renderer
    const startRect = (renderer.getNativeNodeByVNode(renderer.getVNodeBySlot(startPosition.cell!)!) as HTMLElement).getBoundingClientRect()
    const endRect = (renderer.getNativeNodeByVNode(renderer.getVNodeBySlot(endPosition.cell!)!) as HTMLElement).getBoundingClientRect()

    return [{
      left: startRect.left,
      top: startRect.top,
      width: endRect.left + endRect.width - startRect.left,
      height: endRect.top + endRect.height - startRect.top
    }]
  }
}

export const tableComponent = defineComponent({
  type: ContentType.BlockComponent,
  name: 'TableComponent',
  separable: false,
  setup(data: ComponentInitData<TableConfig, TableSlotState> = {
    slots: Array.from({ length: 9 }).fill(null).map(() => createCell()),
    state: {
      columnCount: 3,
      rowCount: 3,
      useTextbusStyle: false
    }
  }) {
    let tableCells = slotsToTable(data.slots || [], data.state!.columnCount)
    const injector = useContext()
    const i18n = injector.get(I18n)
    const selection = injector.get(Selection)
    const commander = injector.get(Commander)

    let tableInfo: TableConfig = {
      columnCount: tableCells[0].map(i => i.state!.colspan).reduce((v, n) => v + n, 0),
      useTextbusStyle: data.state?.useTextbusStyle || false,
      rowCount: tableCells.length
    }

    const stateController = useState(tableInfo)

    stateController.onChange.subscribe(s => {
      tableInfo = s
    })

    const self = useSelf()
    const slots = useSlots(tableCells.flat())

    let startPosition: TableCellPosition
    let endPosition: TableCellPosition
    let hasMultipleCell = false
    useTableMultipleRange(slots, stateController, tableInfo, tableRange => {
      startPosition = tableRange.startPosition
      endPosition = tableRange.endPosition
      const is = tableRange.selectedCells.length > 1
      if (is !== hasMultipleCell) {
        hasMultipleCell = is
        self.changeMarker.forceMarkDirtied()
      }
    })

    onSlotRemove(ev => {
      ev.preventDefault()
    })

    onContextMenu(event => {
      event.useMenus([{
        iconClasses: ['textbus-icon-table'],
        label: i18n.get('components.tableComponent.contextMenuLabel'),
        submenu: [{
          iconClasses: ['textbus-icon-table-add-column-left'],
          label: i18n.get('components.tableComponent.addColumnToLeft'),
          onClick() {
            instance.addColumnToLeft()
          }
        }, {
          iconClasses: ['textbus-icon-table-add-column-right'],
          label: i18n.get('components.tableComponent.addColumnToRight'),
          onClick() {
            instance.addColumnToRight()
          }
        }, {
          iconClasses: ['textbus-icon-table-add-row-top'],
          label: i18n.get('components.tableComponent.insertRowBefore'),
          onClick() {
            instance.addRowToTop()
          }
        }, {
          iconClasses: ['textbus-icon-table-add-row-bottom'],
          label: i18n.get('components.tableComponent.insertRowAfter'),
          onClick() {
            instance.addRowToBottom()
          }
        }, {
          iconClasses: ['textbus-icon-table-delete-column-left'],
          label: i18n.get('components.tableComponent.deleteColumns'),
          onClick() {
            instance.deleteColumns()
          }
        }, {
          iconClasses: ['textbus-icon-table-delete-row-top'],
          label: i18n.get('components.tableComponent.deleteRows'),
          onClick() {
            instance.deleteRows()
          }
        }, {
          iconClasses: ['textbus-icon-table-split-columns'],
          label: i18n.get('components.tableComponent.mergeCells'),
          onClick() {
            instance.mergeCells()
          }
        }, {
          iconClasses: ['textbus-icon-table'],
          label: i18n.get('components.tableComponent.splitCells'),
          onClick() {
            instance.splitCells()
          }
        }]
      }, {
        iconClasses: ['textbus-icon-table-remove'],
        label: i18n.get('components.tableComponent.contextMenuRemoveTable'),
        onClick() {
          commander.removeComponent(self)
        }
      }])
    })

    const instance = {
      mergeCells() {
        if (!startPosition || !endPosition) {
          return
        }
        const serializedCells = serialize(tableCells)
        const minRow = startPosition.rowIndex
        const minColumn = startPosition.columnIndex
        const maxRow = endPosition.rowIndex + 1
        const maxColumn = endPosition.columnIndex + 1

        const selectedCells = serializedCells.slice(minRow, maxRow)
          .map(row => row.cellsPosition.slice(minColumn, maxColumn).filter(c => {
            return c.offsetRow === 0 && c.offsetColumn === 0
          }))
          .reduce((p, n) => {
            return p.concat(n)
          })
        const newNode = selectedCells.shift()!
        newNode.cell.updateState(draft => {
          draft.rowspan = maxRow - minRow
          draft.colspan = maxColumn - minColumn
        })

        selectedCells.forEach(cell => {
          slots.remove(cell.cell)
          const lastContent = cell.cell.getContentAtIndex(cell.cell.length - 1)
          if (
            cell.cell.isEmpty ||
            (cell.cell.length === 1 && typeof lastContent !== 'string' && lastContent.slots.last?.isEmpty)
          ) {
            return
          }
          const slot = newNode.cell
          const index = slot.isEmpty ? 0 : slot.length
          slot.retain(index)
          cell.cell.cutTo(slot)
          slot.retain(index)
        })

        const lastContent = newNode.cell.getContentAtIndex(newNode.cell.length - 1)
        if (typeof lastContent !== 'string') {
          const lastContentSlot = lastContent.slots.first
          selection.setPosition(lastContentSlot, lastContentSlot!.length)
        } else {
          selection.setPosition(newNode.cell, 0)
        }
      },
      splitCells() {
        if (!startPosition || !endPosition) {
          return
        }
        const serializedCells = serialize(tableCells)
        const minRow = startPosition.rowIndex
        const minColumn = startPosition.columnIndex
        const maxRow = endPosition.rowIndex + 1
        const maxColumn = endPosition.columnIndex + 1


        const table = serializedCells.map((tr, i) => {
          if (i < minRow || i >= maxRow) {
            return tr.cellsPosition.map(i => i.cell)
          }
          return tr.cellsPosition.map((td, index) => {
            if (index < minColumn || index >= maxColumn) {
              return td.cell
            }
            if (td.offsetRow === 0 && td.offsetColumn === 0) {
              const state = td.cell.state!
              if (state.rowspan > 1 || state.colspan > 1) {
                td.cell.updateState(draft => {
                  draft.rowspan = 1
                  draft.colspan = 1
                })
              }
              return td.cell
            }
            return createCell()
          })
        })

        const cells = Array.from(new Set(table.flat()))

        cells.forEach((newCell, index) => {
          const cell = slots.get(index)

          if (cell === newCell) {
            return
          }
          slots.insertByIndex(newCell, index)
        })
      },
      deleteColumns() {
        if (!startPosition || !endPosition) {
          return
        }
        const startIndex = startPosition.columnIndex
        const endIndex = endPosition.columnIndex
        instance.deleteColumnByIndex(startIndex, endIndex)
      },
      deleteRows() {
        if (!startPosition || !endPosition) {
          return
        }
        const startIndex = startPosition.rowIndex
        const endIndex = endPosition.rowIndex
        instance.deleteRowByIndex(startIndex, endIndex)
      },
      addRowToBottom() {
        if (!startPosition || !endPosition) {
          return
        }
        this.insertRow(endPosition.rowIndex + 1)
      },
      addRowToTop() {
        if (!startPosition || !endPosition) {
          return
        }
        this.insertRow(startPosition.rowIndex)
      },
      addColumnToRight() {
        if (!startPosition || !endPosition) {
          return
        }
        this.insertColumn(endPosition.columnIndex + 1)
      },
      addColumnToLeft() {
        if (!startPosition || !endPosition) {
          return
        }
        this.insertColumn(startPosition.columnIndex)
      },
      deleteColumnByIndex(startIndex: number, endIndex: number) {
        if (tableInfo.columnCount === 1) {
          self.parent?.removeComponent(self)
          return
        }
        const serializedCells = serialize(tableCells)
        stateController.update(draft => {
          draft.columnCount = tableInfo.columnCount - (endIndex - startIndex + 1)
        })

        serializedCells.forEach(tr => {
          for (let i = startIndex; i <= endIndex; i++) {
            const td = tr.cellsPosition[i]
            const startColumnIndex = td.columnIndex - td.offsetColumn
            if (startColumnIndex < startIndex) {
              if (startColumnIndex + td.cell.state!.colspan > endIndex) {
                td.cell.updateState(draft => {
                  draft.colspan = td.cell.state!.colspan - (endIndex - startIndex + 1)
                })
              } else {
                td.cell.updateState(draft => {
                  draft.colspan = startIndex - td.columnIndex
                })
              }
            } else if (startColumnIndex + td.cell.state!.colspan - 1 > endIndex) {
              td.cell.updateState(draft => {
                draft.colspan = td.cell.state!.colspan - (endIndex - startIndex + 1)
              })
              td.cell.cut()
            } else {
              const index = td.row.indexOf(td.cell)
              if (index > -1) {
                td.row.splice(index, 1)
              }
              slots.remove(td.cell)
            }
          }
        })
        if (slots.length === 0) {
          self.parent?.removeComponent(self)
        }
      },
      deleteRowByIndex(startIndex: number, endIndex: number) {
        if (tableInfo.rowCount === 1) {
          self.parent?.removeComponent(self)
          return
        }
        const serializedCells = serialize(tableCells)
        stateController.update(draft => {
          draft.rowCount = tableInfo.rowCount - (endIndex - startIndex + 1)
        })

        for (let i = startIndex; i <= endIndex; i++) {
          const tr = serializedCells[i]
          tr.cellsPosition.forEach(td => {
            const startRowIndex = td.rowIndex - td.offsetRow
            if (startRowIndex < startIndex) {
              if (startRowIndex + td.cell.state!.rowspan > endIndex) {
                td.cell.updateState(draft => {
                  draft.rowspan = td.cell.state!.rowspan - (endIndex - startIndex + 1)
                })
              } else {
                td.cell.updateState(draft => {
                  draft.rowspan = startIndex - td.rowIndex
                })
              }
            } else if (startRowIndex + td.cell.state!.rowspan - 1 > endIndex) {
              td.cell.updateState(draft => {
                draft.rowspan = td.cell.state!.rowspan - (endIndex - startIndex + 1)
              })
              td.cell.cut()
              const nextTr = serializedCells[i + 1]
              const afterTd = nextTr.cellsPosition.find(td2 => td2.cell === td.cell)!
              afterTd.row.splice(afterTd.row.indexOf(afterTd.cell), 0, td.cell)
            } else {
              slots.remove(td.cell)
            }
          })
        }
        if (slots.length === 0) {
          self.parent?.removeComponent(self)
        }
      },
      insertRow(index: number) {
        const serializedCells = serialize(tableCells)
        const tr: Slot[] = []
        stateController.update(draft => {
          draft.rowCount = tableInfo.rowCount + 1
        })
        if (index === 0 || index === serializedCells.length) {
          for (let i = 0; i < tableInfo.columnCount; i++) {
            tr.push(createCell())
          }
          if (index === 0) {
            slots.insertByIndex(tr, 0)
          } else {
            slots.insertByIndex(tr, slots.length)
          }
          return
        }

        const row = serializedCells[index]

        row.cellsPosition.forEach(cell => {
          if (cell.offsetRow > 0) {
            if (cell.offsetColumn === 0) {
              cell.cell.updateState(draft => {
                draft.rowspan = cell.cell.state!.rowspan + 1
              })
            }
          } else {
            tr.push(createCell())
          }
        })
        tableCells.splice(tableCells.indexOf(row.cells), 0, tr)

        const result = Array.from(new Set(tableCells.flat()))

        result.forEach((newCell, index) => {
          const cell = slots.get(index)

          if (cell === newCell) {
            return
          }
          slots.insertByIndex(newCell, index)
        })
      },
      insertColumn(index: number) {
        if (index < 0) {
          index = 0
        }
        if (index > tableInfo.columnCount) {
          index = tableInfo.columnCount
        }
        const serializedCells = serialize(tableCells)

        const table: Slot[][] = serializedCells.map(tr => {
          return tr.cellsPosition.map(td => {
            return td.cell
          })
        })

        const recordCells: Slot[] = []
        serializedCells.forEach((row, rowIndex) => {
          if (index === 0) {
            table[rowIndex].unshift(createCell())
          } else if (index === tableInfo.columnCount) {
            table[rowIndex].push(createCell())
          } else {
            const cell = row.cellsPosition[index]
            if (cell.offsetColumn > 0) {
              if (recordCells.includes(cell.cell)) {
                return
              }
              cell.cell.updateState(draft => {
                draft.colspan = cell.cell.state!.colspan + 1
              })
              recordCells.push(cell.cell)
            } else {
              table[rowIndex].splice(index, 0, createCell())
            }
          }
        })

        const cells = table.flat()
        const result = Array.from(new Set(cells))

        result.forEach((newCell, index) => {
          const cell = slots.get(index)

          if (cell === newCell) {
            return
          }
          slots.insertByIndex(newCell, index)
        })

        stateController.update(draft => {
          draft.columnCount = tableInfo.columnCount + 1
        })

        tableCells = slotsToTable(slots.toArray(), tableInfo.columnCount)
      },
      render(isOutputMode: boolean, slotRender: SlotRender): VElement {
        tableCells = slotsToTable(slots.toArray(), tableInfo.columnCount)
        return (
          <table class={'tb-table' +
            (data.state!.useTextbusStyle ? ' tb-table-textbus' : '') +
            (hasMultipleCell ? ' td-table-multiple-select' : '')}>
            <tbody>
            {
              tableCells.map(row => {
                return (
                  <tr>
                    {
                      row.map(col => {
                        return slotRender(col, () => {
                          return <td colSpan={col.state?.colspan} rowSpan={col.state?.rowspan}/>
                        })
                      })
                    }
                  </tr>
                )
              })
            }
            </tbody>
          </table>
        )
      }
    }
    return instance
  }
})

export const tableComponentLoader: ComponentLoader = {
  resources: {
    styles: [`
    .tb-table td,.tb-table th{border-width: 1px; border-style: solid; padding:3px 8px}
   .tb-table {border-spacing: 0; border-collapse: collapse; width: 100%; }
   .tb-table-textbus td, th {border-color: #aaa;}`],
    editModeStyles: ['.td-table-multiple-select *::selection{background-color: transparent!important}']
  },
  match(element: HTMLElement): boolean {
    return element.tagName === 'TABLE'
  },
  read(element: HTMLTableElement, injector: Injector, slotParser: SlotParser): ComponentInstance {
    const { tHead, tBodies, tFoot } = element
    const headers: Slot[][] = []
    const bodies: Slot[][] = []
    if (tHead) {
      Array.from(tHead.rows).forEach(row => {
        const arr: Slot[] = []
        headers.push(arr)
        Array.from(row.cells).forEach(cell => {
          const slot = createCell(cell.colSpan, cell.rowSpan)
          arr.push(slot)
          slotParser(slot, cell)
        })
      })
    }

    if (tBodies) {
      Array.of(...Array.from(tBodies), tFoot || { rows: [] }).reduce((value, next) => {
        return value.concat(Array.from(next.rows))
      }, [] as HTMLTableRowElement[]).forEach((row: HTMLTableRowElement) => {
        const arr: Slot[] = []
        bodies.push(arr)
        Array.from(row.cells).forEach(cell => {
          const slot = createCell(cell.colSpan, cell.rowSpan)
          arr.push(slot)
          slotParser(slot, cell)
        })
      })
    }
    bodies.unshift(...headers)
    const cells = autoComplete(bodies)
    return tableComponent.createInstance(injector, {
      slots: bodies.flat(),
      state: {
        useTextbusStyle: element.classList.contains('tb-table-textbus'),
        columnCount: cells[0].map(i => i.state!.colspan).reduce((v, n) => v + n, 0),
        rowCount: cells.length
      }
    })
  },
}
