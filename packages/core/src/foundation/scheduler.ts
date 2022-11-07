import { Injectable } from '@tanbo/di'
import { map, microTask, Observable, Subject, Subscription } from '@tanbo/stream'

import { ComponentInstance, invokeListener, Operation } from '../model/_api'
import { RootComponentRef } from './_injection-tokens'
import { Renderer } from './renderer'
import { Selection } from './selection'

/**
 * 数据变更源
 */
export enum ChangeOrigin {
  History,
  Local,
  Remote
}

export interface ChangeItem {
  from: ChangeOrigin
  operation: Operation
}

/**
 * Textbus 调度器，用于控制文档内容的更新及渲染
 */
@Injectable()
export class Scheduler {
  /**
   * 最后一次文档变更是否包含本地变更
   */
  get lastChangesHasLocalUpdate() {
    return this._lastChangesHasLocalUpdate
  }

  /**
   * 最后一次文档变更是否包含远程变更
   */
  get lastChangesHasRemoteUpdate() {
    return this._lastChangesHasRemoteUpdate
  }

  /**
   * 当文档发生变更时触发
   */
  onDocChange: Observable<void>

  /**
   * 当文档渲染完成时触发
   */
  onDocChanged: Observable<ChangeItem[]>

  private _lastChangesHasLocalUpdate = true
  private _lastChangesHasRemoteUpdate = false
  private changeFromRemote = false
  private changeFromHistory = false
  private instanceList = new Set<ComponentInstance>()

  private docChangedEvent = new Subject<ChangeItem[]>()
  private docChangeEvent = new Subject<void>()
  private subs: Subscription[] = []

  constructor(private rootComponentRef: RootComponentRef,
              private selection: Selection,
              private renderer: Renderer) {
    this.onDocChanged = this.docChangedEvent.asObservable()
    this.onDocChange = this.docChangeEvent.asObservable()
  }

  /**
   * 远程更新文档事务
   * @param task 事务处理函数
   */
  remoteUpdateTransact(task: () => void) {
    this.changeFromRemote = true
    task()
    this.changeFromRemote = false
  }

  /**
   * 历史记录更新文档事务
   * @param task 事务处理函数
   */
  historyApplyTransact(task: () => void) {
    this.changeFromHistory = true
    task()
    this.changeFromHistory = false
  }

  /**
   * 启动调度器，并兼听文档变更自动渲染文档
   */
  run() {
    const rootComponent = this.rootComponentRef.component
    const changeMarker = rootComponent.changeMarker
    this.renderer.render()
    let isRendered = true
    this.subs.push(
      changeMarker.onForceChange.pipe(microTask()).subscribe(() => {
        this.renderer.render()
      }),
      changeMarker.onChange.pipe(
        map(op => {
          if (isRendered) {
            isRendered = false
            this.docChangeEvent.next()
          }
          return {
            from: this.changeFromRemote ? ChangeOrigin.Remote :
              this.changeFromHistory ? ChangeOrigin.History : ChangeOrigin.Local,
            operation: op
          }
        }),
        microTask()
      ).subscribe(ops => {
        isRendered = true
        this.renderer.render()
        this._lastChangesHasRemoteUpdate = false
        this._lastChangesHasLocalUpdate = false
        ops.forEach(i => {
          if (i.from === ChangeOrigin.Remote) {
            this._lastChangesHasRemoteUpdate = true
          } else {
            this._lastChangesHasLocalUpdate = true
          }
        })
        this.selection.restore(this._lastChangesHasLocalUpdate)
        this.docChangedEvent.next(ops)
      }),
      changeMarker.onChildComponentRemoved.subscribe(instance => {
        this.instanceList.add(instance)
      }),
      this.renderer.onViewUpdated.subscribe(() => {
        this.instanceList.forEach(instance => {
          let comp = instance
          while (comp) {
            const parent = comp.parentComponent
            if (parent) {
              comp = parent
            } else {
              break
            }
          }
          if (comp !== rootComponent) {
            Scheduler.invokeChildComponentDestroyHook(comp)
          }
        })
        this.instanceList.clear()
      })
    )
  }

  /**
   * 销毁调度器
   */
  destroy() {
    this.subs.forEach(i => i.unsubscribe())
    Scheduler.invokeChildComponentDestroyHook(this.rootComponentRef.component)
    this.subs = []
  }

  private static invokeChildComponentDestroyHook(parent: ComponentInstance) {
    parent.slots.toArray().forEach(slot => {
      slot.sliceContent().forEach(i => {
        if (typeof i !== 'string') {
          Scheduler.invokeChildComponentDestroyHook(i)
        }
      })
    })
    invokeListener(parent, 'onDestroy')
  }
}
