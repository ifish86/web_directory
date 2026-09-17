<template>
  <q-page class="index-page">
    <div class="hero text-center">
      <h1 class="hero-title q-mb-sm">{{ store.settings.siteTitle || 'Device Portals' }}</h1>
      <p class="hero-sub q-mb-none">{{ store.settings.siteSubtitle || 'Web interfaces running on this device' }}</p>
    </div>

    <div class="q-pa-lg">
      <div v-if="store.loading && !store.services.length" class="row justify-center q-pa-xl">
        <q-spinner color="primary" size="3em" />
      </div>

      <div v-else-if="!visibleServices.length" class="empty-state text-center">
        <q-icon name="dns" size="4rem" color="grey-5" />
        <div class="q-mt-md text-grey-7">No web interfaces detected yet.</div>
        <div class="text-caption text-grey-6">Use the settings icon (top right) to add one manually.</div>
      </div>

      <div v-else class="row q-col-gutter-md">
        <div v-for="s in visibleServices" :key="s.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
          <service-card :service="s" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { store } from '../store'
import { loadServices, loadSettings } from '../api'
import ServiceCard from '../components/ServiceCard.vue'

const visibleServices = computed(() => store.services.filter((s) => !s.hidden))

let timer = null

onMounted(async () => {
  store.loading = true
  try {
    await loadSettings()
    await loadServices()
  } finally {
    store.loading = false
  }
  timer = setInterval(() => {
    loadServices().catch(() => {})
  }, 15000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
