<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="bg-primary text-white">
      <q-toolbar>
        <q-btn flat dense round icon="apps" aria-label="Home" @click="$router.push('/')" />
        <q-toolbar-title class="text-weight-medium">
          {{ store.settings.siteTitle || 'Device Portals' }}
        </q-toolbar-title>
        <q-btn flat dense round icon="settings" aria-label="Configuration" @click="$router.push('/config')" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { store } from '../store'
</script>
