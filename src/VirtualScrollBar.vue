<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import Big from 'big.js'
import { throttle } from 'lodash-es'

const props = defineProps({
  contentWidth: {
    type: Number,
    required: true,
  },
  contentHeight: {
    type: Number,
    required: true,
  },
  scrollColor: {
    type: String,
    default: 'rgba(0, 0, 0, 0.5)',
  },
  /** 鼠标滚轮滚动时，内容移动的数值,默认100px */
  wheelAmount: {
    type: Number,
    default: 100,
  },
})

const scrollX = defineModel<number>('scrollX', {
  default: 0,
})
const scrollY = defineModel<number>('scrollY', {
  default: 0,
})

watch(scrollY, (newVal) => {
  if (newVal > maxScrollYValue.value) {
    scrollY.value = maxScrollYValue.value
  } else if (newVal < 0) {
    scrollY.value = 0
  }
})

watch(scrollX, (newVal) => {
  if (newVal > maxScrollXValue.value) {
    scrollX.value = maxScrollXValue.value
  } else if (newVal < 0) {
    scrollX.value = 0
  }
})

const virtualScrollContainerRef = useTemplateRef('virtualScrollContainer')
/** 滚动条最小尺寸 */
const minScrollLength = new Big(50)

/** x轴滚动条宽度 */
const xScrollLength = ref<Big.Big>(new Big(0))
/** y轴滚动条可视高度 */
const yScrollLength = ref<Big.Big>(new Big(0))

/** 实际容器宽度 */
const practicalContainerWidth = ref(0)
/** 实际容器高度 */
const practicalContainerHeight = ref(0)

const maxScrollXValue = computed(() => props.contentWidth - practicalContainerWidth.value)
const maxScrollYValue = computed(() => props.contentHeight - practicalContainerHeight.value)

//#region 计算滚动条尺寸和容器实际尺寸

const calculateSize = () => {
  if (virtualScrollContainerRef.value) {
    const { clientWidth: containerWidth, clientHeight: containerHeight } =
      virtualScrollContainerRef.value
    practicalContainerWidth.value = containerWidth
    practicalContainerHeight.value = containerHeight

    const _xScrollLength = new Big(containerWidth).div(props.contentWidth).mul(containerWidth)
    const xScrollLengthLessThanMinimum = _xScrollLength.lt(minScrollLength)
    xScrollLength.value = xScrollLengthLessThanMinimum ? minScrollLength : _xScrollLength

    const _yScrollLength = new Big(containerHeight).div(props.contentHeight).mul(containerHeight)
    const yScrollLengthLessThanMinimum = _yScrollLength.lt(minScrollLength)
    yScrollLength.value = yScrollLengthLessThanMinimum ? minScrollLength : _yScrollLength
  }
  // eslint-disable-next-line no-self-assign
  scrollX.value = scrollX.value
  // eslint-disable-next-line no-self-assign
  scrollY.value = scrollY.value
}

watch([() => props.contentWidth, () => props.contentHeight], () => {
  calculateSize()
})
let resizeObserver: InstanceType<typeof ResizeObserver>
onMounted(() => {
  resizeObserver = new ResizeObserver(() => calculateSize())
  resizeObserver.observe(virtualScrollContainerRef.value!)
})
onUnmounted(() => {
  resizeObserver.disconnect()
})

//#endregion

const mousedownTarget = ref<'x' | 'y'>()
const startMousePosition = { x: new Big(0), y: new Big(0) }
const previousTranslate = { x: new Big(0), y: new Big(0) }

/** X滚动条偏移量 */
const scrollXOffset = computed(() => {
  if (props.contentWidth <= practicalContainerWidth.value) {
    return new Big(0)
  }
  return new Big(scrollX.value)
    .div(new Big(props.contentWidth).minus(practicalContainerWidth.value))
    .mul(new Big(practicalContainerWidth.value).minus(xScrollLength.value))
})

/** Y滚动条偏移量 */
const scrollYOffset = computed(() => {
  if (props.contentHeight <= practicalContainerHeight.value) {
    return new Big(0)
  }
  return new Big(scrollY.value)
    .div(new Big(props.contentHeight).minus(practicalContainerHeight.value))
    .mul(new Big(practicalContainerHeight.value).minus(yScrollLength.value))
})

const beforeMousemove = (m: MouseEvent) => {
  startMousePosition.x = new Big(m.clientX)
  startMousePosition.y = new Big(m.clientY)
  previousTranslate.x = scrollXOffset.value
  previousTranslate.y = scrollYOffset.value
  m.preventDefault()
}

const throttleWaitTime = 50
/**
 * 滚动条拖动事件
 */
const mousemove = throttle((e: MouseEvent) => {
  if (!mousedownTarget.value) {
    return
  }
  const targetScrollBarOffset =
    mousedownTarget.value === 'x'
      ? new Big(e.clientX).minus(startMousePosition.x).plus(previousTranslate.x)
      : new Big(e.clientY).minus(startMousePosition.y).plus(previousTranslate.y)
  const maxScrollBarOffset =
    mousedownTarget.value === 'x'
      ? new Big(practicalContainerWidth.value).minus(xScrollLength.value!)
      : new Big(practicalContainerHeight.value).minus(yScrollLength.value)
  const scrollBarOffsetValue = targetScrollBarOffset.lt(0)
    ? new Big(0)
    : targetScrollBarOffset.gt(maxScrollBarOffset)
      ? maxScrollBarOffset
      : targetScrollBarOffset

  const scrollRatio =
    mousedownTarget.value === 'x'
      ? new Big(props.contentWidth).minus(practicalContainerWidth.value).div(maxScrollBarOffset)
      : new Big(props.contentHeight).minus(practicalContainerHeight.value).div(maxScrollBarOffset)

  if (mousedownTarget.value === 'x') {
    scrollX.value = new Big(scrollBarOffsetValue).mul(scrollRatio).toNumber()
  } else if (mousedownTarget.value === 'y') {
    scrollY.value = new Big(scrollBarOffsetValue).mul(scrollRatio).toNumber()
  }
}, throttleWaitTime)
const mouseup = () => {
  mousedownTarget.value = undefined
}
onMounted(() => {
  window.addEventListener('mouseup', mouseup)
  window.addEventListener('mousemove', mousemove)
})
onUnmounted(() => {
  window.removeEventListener('mouseup', mouseup)
  window.removeEventListener('mousemove', mousemove)
})

/**
 * 滚轮事件
 * @param e
 */
const scrollHandle = throttle((e: WheelEvent) => {
  const { deltaY, shiftKey } = e
  if (shiftKey && props.contentWidth <= practicalContainerWidth.value) {
    return
  }
  if (!shiftKey && props.contentHeight <= practicalContainerHeight.value) {
    return
  }
  const wheelAmount = deltaY < 0 ? -props.wheelAmount : props.wheelAmount
  const targetScrollValue = shiftKey ? scrollX.value + wheelAmount : scrollY.value + wheelAmount

  if (shiftKey) {
    scrollX.value = targetScrollValue
  } else {
    scrollY.value = targetScrollValue
  }
}, throttleWaitTime)
</script>

<template>
  <div class="virtual-scroll-container" ref="virtualScrollContainer" @wheel="scrollHandle">
    <slot></slot>
    <div
      class="scroll-bar scroll-bar-x"
      v-show="xScrollLength.lt(practicalContainerWidth)"
      @mousedown="((mousedownTarget = 'x'), beforeMousemove($event))"
    ></div>
    <div
      class="scroll-bar scroll-bar-y"
      v-show="yScrollLength.lt(practicalContainerHeight)"
      @mousedown="((mousedownTarget = 'y'), beforeMousemove($event))"
    ></div>
  </div>
</template>

<style scoped lang="scss">
.virtual-scroll-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;

  .scroll-bar {
    position: absolute;
    $thickness: 10px;
    border-radius: calc($thickness / 2);
    background-color: v-bind(scrollColor);
    cursor: pointer;

    &.scroll-bar-x {
      bottom: 0;
      left: 0;
      width: v-bind('xScrollLength.toNumber() + "px"');
      height: $thickness;
      transform: translateX(v-bind('scrollXOffset.toNumber() + "px"'));
    }

    &.scroll-bar-y {
      top: 0;
      right: 0;
      width: $thickness;
      height: v-bind('yScrollLength.toNumber() + "px"');
      transform: translateY(v-bind('scrollYOffset.toNumber() + "px"'));
    }
  }
}
</style>
