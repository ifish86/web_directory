<template>
  <q-card class="service-card cursor-pointer" flat bordered @click="open">
    <q-card-section class="row items-center no-wrap">
      <q-avatar
        :color="service.color || 'primary'"
        text-color="white"
        :icon="service.icon || 'public'"
        size="46px"
      />
      <div class="col q-ml-sm" style="min-width: 0">
        <div class="text-subtitle1 ellipsis">{{ service.name }}</div>
        <div class="text-caption text-grey-7 ellipsis">{{ hostLabel }}</div>
      </div>
      <div class="column items-end q-ml-xs">
        <q-badge :color="statusBadge.color" text-color="white" rounded class="q-mb-xs">
          {{ statusBadge.label }}
        </q-badge>
        <q-badge v-if="service.port" color="grey-3" text-color="grey-8" class="q-mt-xs">
          :{{ service.port }}
        </q-badge>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  service: { type: Object, required: true }
})

const hostLabel = computed(() => {
  try {
    return new URL(props.service.url).host
  } catch (e) {
    return props.service.url || ''
  }
})

const statusBadge = computed(() => {
  if (props.service.online === true) return { label: 'online', color: 'positive' }
  if (props.service.online === false) return { label: 'offline', color: 'negative' }
  return { label: 'custom', color: 'grey-7' }
})

function open() {
  if (props.service.url) window.open(props.service.url, '_blank', 'noopener,noreferrer')
}
</script>
