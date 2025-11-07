import { LitElement, html, css, nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property, state, query } from 'lit/decorators.js'
import Big from 'big.js'
import { throttle } from 'lodash-es'
import { styleMap } from 'lit/directives/style-map.js'

// 确保 Big.js 的配置不会因为科学计数法而出错
Big.NE = -1e6
Big.PE = 1e6

@customElement('virtual-scroll')
export class VirtualScroll extends LitElement {
  // -----------------
  // 属性 (Props)
  // -----------------

  /** 内容区域的总宽度 */
  @property({ type: Number })
  contentWidth = 0

  /** 内容区域的总高度 */
  @property({ type: Number })
  contentHeight = 0

  /** 滚动条颜色 */
  @property({ type: String })
  scrollColor = 'rgba(0, 0, 0, 0.5)'

  /** 鼠标滚轮滚动时，内容移动的数值,默认100px */
  @property({ type: Number })
  wheelAmount = 100

  /** * X轴内容偏移量
   */
  @property({ type: Number })
  get scrollX(): number {
    return this._scrollX
  }
  set scrollX(value: number) {
    const oldVal = this._scrollX
    let nextValue = value > this.maxScrollXvalue ? this.maxScrollXvalue : value
    nextValue = nextValue < 0 ? 0 : nextValue

    if (this._scrollX === nextValue) {
      return
    }
    this._scrollX = nextValue
    // 请求 Lit 更新，并告知 'scrollX' 属性已变更
    this.requestUpdate('scrollX', oldVal)
    this.dispatchEvent(
      new CustomEvent('update:scrollX', {
        detail: this._scrollX,
        bubbles: true,
        composed: true
      })
    )
  }
  private _scrollX = 0 // 私有存储

  /** * Y轴内容偏移量
   */
  @property({ type: Number })
  get scrollY(): number {
    return this._scrollY
  }
  set scrollY(value: number) {
    const oldVal = this._scrollY
    let nextValue = value > this.maxScrollYvalue ? this.maxScrollYvalue : value
    nextValue = nextValue < 0 ? 0 : nextValue

    if (this._scrollY === nextValue) {
      return
    }
    this._scrollY = nextValue
    // 请求 Lit 更新，并告知 'scrollY' 属性已变更
    this.requestUpdate('scrollY', oldVal)
    this.dispatchEvent(
      new CustomEvent('update:scrollY', {
        detail: this._scrollY,
        bubbles: true,
        composed: true
      })
    )
  }
  private _scrollY = 0 // 私有存储

  // -----------------
  // 内部状态 (State)
  // -----------------

  /** 滚动条最小尺寸 */
  @state()
  private minScrollLength = new Big(50)

  /** x轴滚动条宽度 */
  @state()
  private xScrollLength: Big.Big = new Big(0)

  /** y轴滚动条可视高度 */
  @state()
  private yScrollLength: Big.Big = new Big(0)

  /** 实际容器宽度 */
  @state()
  private practicalContainerWidth = 0

  /** 实际容器高度 */
  @state()
  private practicalContainerHeight = 0

  /** 标记当前鼠标按下的滚动条是 'x' 还是 'y' */
  @state()
  private mousedownTarget?: 'x' | 'y'

  // -----------------
  // DOM 查询
  // -----------------

  /** 滚动容器的引用 */
  @query('.virtual-scroll-container')
  private virtualScrollContainerRef!: HTMLElement

  // -----------------
  // 私有变量
  // -----------------

  private startMousePosition = { x: new Big(0), y: new Big(0) }
  private previousTranslate = { x: new Big(0), y: new Big(0) }
  private resizeObserver?: ResizeObserver
  private throttleWaitTime = 50

  // -----------------
  // 计算属性 (Getters)
  // -----------------

  /** X 轴最大滚动值 */
  private get maxScrollXvalue(): number {
    return this.contentWidth - this.practicalContainerWidth
  }

  /** Y 轴最大滚动值 */
  private get maxScrollYvalue(): number {
    return this.contentHeight - this.practicalContainerHeight
  }

  /** X滚动条偏移量 (px) */
  private get scrollXOffset(): Big.Big {
    const maxContentScroll = new Big(this.contentWidth).minus(this.practicalContainerWidth)
    const maxBarScroll = new Big(this.practicalContainerWidth).minus(this.xScrollLength)

    if (maxContentScroll.lte(0) || maxBarScroll.lte(0)) {
      return new Big(0)
    }

    return new Big(this.scrollX).div(maxContentScroll).mul(maxBarScroll)
  }

  /** Y滚动条偏移量 (px) */
  private get scrollYOffset(): Big.Big {
    const maxContentScroll = new Big(this.contentHeight).minus(this.practicalContainerHeight)
    const maxBarScroll = new Big(this.practicalContainerHeight).minus(this.yScrollLength)

    if (maxContentScroll.lte(0) || maxBarScroll.lte(0)) {
      return new Big(0)
    }

    return new Big(this.scrollY).div(maxContentScroll).mul(maxBarScroll)
  }

  // -----------------
  // 生命周期回调
  // -----------------

  connectedCallback() {
    super.connectedCallback()
    // 绑定需要在 window 上监听的事件
    window.addEventListener('mouseup', this.handleMouseUp)
    window.addEventListener('mousemove', this.handleMouseMove)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    // 清理 window 上的事件监听
    window.removeEventListener('mouseup', this.handleMouseUp)
    window.removeEventListener('mousemove', this.handleMouseMove)
    // 清理 ResizeObserver
    this.resizeObserver?.disconnect()
  }

  firstUpdated() {
    // 首次渲染后，初始化 ResizeObserver
    this.resizeObserver = new ResizeObserver(() => this.calculateSize())
    this.resizeObserver.observe(this.virtualScrollContainerRef)
    // 立刻计算一次尺寸
    this.calculateSize()
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties)
    // 监听内容尺寸变化，重新计算
    if (changedProperties.has('contentWidth') || changedProperties.has('contentHeight')) {
      this.calculateSize()
    }
  }

  // -----------------
  // 公开方法
  // -----------------

  // -----------------
  // 事件处理器
  // -----------------

  /**
   * 计算滚动条尺寸和容器实际尺寸
   */
  private calculateSize() {
    if (this.virtualScrollContainerRef) {
      const { clientWidth: containerWidth, clientHeight: containerHeight } = this.virtualScrollContainerRef
      this.practicalContainerWidth = containerWidth
      this.practicalContainerHeight = containerHeight

      if (this.contentWidth > 0) {
        const _xScrollLength = new Big(containerWidth).div(this.contentWidth).mul(containerWidth)
        this.xScrollLength = _xScrollLength.lt(this.minScrollLength) ? this.minScrollLength : _xScrollLength
      } else {
        this.xScrollLength = new Big(0)
      }

      if (this.contentHeight > 0) {
        const _yScrollLength = new Big(containerHeight).div(this.contentHeight).mul(containerHeight)
        this.yScrollLength = _yScrollLength.lt(this.minScrollLength) ? this.minScrollLength : _yScrollLength
      } else {
        this.yScrollLength = new Big(0)
      }
    }
    // 重新计算尺寸后，需要强制更新一次滚动值（以防边界变化）
    // 这将触发 public setter 中的边界检查
    this.scrollX = this.scrollX
    this.scrollY = this.scrollY
  }

  /** 滚轮事件处理 */
  private handleWheel = throttle((e: WheelEvent) => {
    const { deltaY, shiftKey } = e

    // 如果按住 shift 且 X 轴不需要滚动，则返回
    if (shiftKey && this.contentWidth <= this.practicalContainerWidth) {
      return
    }
    // 如果没按住 shift 且 Y 轴不需要滚动，则返回
    if (!shiftKey && this.contentHeight <= this.practicalContainerHeight) {
      return
    }

    const wheelAmount = deltaY < 0 ? -this.wheelAmount : this.wheelAmount
    const targetScrollValue = shiftKey ? this.scrollX + wheelAmount : this.scrollY + wheelAmount

    if (shiftKey) {
      this.scrollX = targetScrollValue
    } else {
      this.scrollY = targetScrollValue
    }
  }, this.throttleWaitTime)

  /** 滚动条鼠标按下事件 */
  private handleMouseDown(e: MouseEvent, direction: 'x' | 'y') {
    this.mousedownTarget = direction
    this.startMousePosition.x = new Big(e.clientX)
    this.startMousePosition.y = new Big(e.clientY)
    this.previousTranslate.x = this.scrollXOffset
    this.previousTranslate.y = this.scrollYOffset
    e.preventDefault()
  }

  /** 全局鼠标移动事件（节流） */
  private handleMouseMove = throttle((e: MouseEvent) => {
    if (!this.mousedownTarget) {
      return
    }

    const maxScrollBarOffset = this.mousedownTarget === 'x' ? new Big(this.practicalContainerWidth).minus(this.xScrollLength) : new Big(this.practicalContainerHeight).minus(this.yScrollLength)

    if (maxScrollBarOffset.lte(0)) return // 滚动条已满，无法拖动

    const targetScrollBarOffset =
      this.mousedownTarget === 'x'
        ? new Big(e.clientX).minus(this.startMousePosition.x).plus(this.previousTranslate.x)
        : new Big(e.clientY).minus(this.startMousePosition.y).plus(this.previousTranslate.y)

    const scrollBarOffsetValue = targetScrollBarOffset.lt(0) ? new Big(0) : targetScrollBarOffset.gt(maxScrollBarOffset) ? maxScrollBarOffset : targetScrollBarOffset

    const scrollRatio =
      this.mousedownTarget === 'x'
        ? new Big(this.contentWidth).minus(this.practicalContainerWidth).div(maxScrollBarOffset)
        : new Big(this.contentHeight).minus(this.practicalContainerHeight).div(maxScrollBarOffset)

    if (this.mousedownTarget === 'x') {
      this.scrollX = scrollBarOffsetValue.mul(scrollRatio).toNumber()
    } else if (this.mousedownTarget === 'y') {
      this.scrollY = scrollBarOffsetValue.mul(scrollRatio).toNumber()
    }
  }, this.throttleWaitTime)

  /** 全局鼠标松开事件 */
  private handleMouseUp = () => {
    this.mousedownTarget = undefined
  }

  // -----------------
  // 渲染
  // -----------------

  static styles = css`
    :host {
      display: block; /* 默认为块级元素 */
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden; /* 隐藏原生滚动条 */
    }

    .virtual-scroll-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden; /* 确保内容不会溢出容器 */
    }

    .content {
      width: 100%;
      height: 100%;
    }

    .scroll-bar {
      position: absolute;
      thickness: 10px; /* 自定义属性，用于厚度 */
      border-radius: 5px; /* calc(var(--thickness) / 2) */
      background-color: var(--scroll-color, rgba(0, 0, 0, 0.5));
      cursor: pointer;
      z-index: 10;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .scroll-bar:hover {
      opacity: 1;
    }

    .scroll-bar-x {
      bottom: 0;
      left: 0;
      height: 10px;
    }

    .scroll-bar-y {
      top: 0;
      right: 0;
      width: 10px;
    }
  `

  render() {
    // 动态计算样式
    const scrollbarXStyles = {
      width: `${this.xScrollLength.toNumber()}px`,
      transform: `translateX(${this.scrollXOffset.toNumber()}px)`,
      backgroundColor: this.scrollColor // 应用属性
    }

    const scrollbarYStyles = {
      height: `${this.yScrollLength.toNumber()}px`,
      transform: `translateY(${this.scrollYOffset.toNumber()}px)`,
      backgroundColor: this.scrollColor // 应用属性
    }

    // 条件渲染滚动条
    const renderXBar = this.xScrollLength.lt(this.practicalContainerWidth) && this.contentWidth > this.practicalContainerWidth
    const renderYBar = this.yScrollLength.lt(this.practicalContainerHeight) && this.contentHeight > this.practicalContainerHeight

    return html`
      <div class="virtual-scroll-container" @wheel=${this.handleWheel}>
        <div class="content">
          <slot></slot>
        </div>

        <!-- X 滚动条 -->
        ${renderXBar ? html` <div class="scroll-bar scroll-bar-x" style=${styleMap(scrollbarXStyles)} @mousedown=${(e: MouseEvent) => this.handleMouseDown(e, 'x')}></div> ` : nothing}

        <!-- Y 滚动条 -->
        ${renderYBar ? html` <div class="scroll-bar scroll-bar-y" style=${styleMap(scrollbarYStyles)} @mousedown=${(e: MouseEvent) => this.handleMouseDown(e, 'y')}></div> ` : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-scroll': VirtualScroll
  }
}
