<script setup lang="ts">
import { VirtualScrollBar } from '../src'
import { ref, watch } from 'vue'
const scrollY = ref(0)

watch(scrollY, () => {
  console.log(scrollY.value)
})
</script>

<template>
  <div style="height: 500px; width: 500px">
    <virtual-scroll-bar
      :content-width="500"
      :content-height="10000"
      v-model:scroll-y="scrollY"
    ></virtual-scroll-bar>
  </div>
  <button @click="scrollY = 100000">111111</button>
</template>

<style scoped></style>
