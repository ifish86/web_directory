<template>
  <q-page class="config-page">
    <div class="q-pa-md config-wrap">
      <!-- LOGIN -->
      <div v-if="!store.authed" class="row justify-center">
        <q-card class="login-card" flat bordered>
          <q-card-section>
            <div class="text-h6">Configuration</div>
            <div class="text-caption text-grey-7 q-mt-xs">Enter the administrator password to continue.</div>
            <q-form @submit="doLogin" class="q-mt-md q-gutter-y-md">
              <q-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                label="Password"
                outlined
                dense
                autofocus
                :rules="[(v) => !!v || 'Password is required']"
              >
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility' : 'visibility_off'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
              <div v-if="loginError" class="text-negative">{{ loginError }}</div>
              <q-btn type="submit" color="primary" label="Log in" class="full-width" :loading="busy" />
            </q-form>
          </q-card-section>
        </q-card>
      </div>

      <!-- AUTHENTICATED -->
      <template v-else>
        <div class="row items-center q-mb-md">
          <div class="text-h6 col">Configuration</div>
          <q-btn flat round icon="logout" aria-label="Log out" @click="onLogout" />
        </div>

        <q-tabs
          v-model="tab"
          dense
          class="text-grey-8 bg-white rounded-borders q-mb-md"
          active-color="primary"
          indicator-color="primary"
          align="left"
          narrow-indicator
        >
          <q-tab name="services" label="Services" icon="dns" />
          <q-tab name="appearance" label="Appearance" icon="palette" />
          <q-tab name="security" label="Security" icon="lock" />
        </q-tabs>

        <q-tab-panels v-model="tab" animated class="bg-transparent">
          <!-- SERVICES -->
          <q-tab-panel name="services" class="q-pa-none">
            <div class="row items-center q-mb-md q-col-gutter-sm">
              <div class="col text-caption text-grey-7">
                <template v-if="store.lastScan">Last scan: {{ formattedScan }}</template>
                <template v-else>No scan yet</template>
              </div>
              <q-btn color="primary" icon="refresh" label="Scan now" dense unelevated :loading="scanning" @click="onScan" />
              <q-btn color="secondary" icon="add" label="Add service" dense unelevated @click="openAdd" />
            </div>

            <q-card flat bordered>
              <q-list separator>
                <q-item v-for="(s, i) in store.services" :key="s.id">
                  <q-item-section avatar>
                    <q-avatar :color="s.color || 'primary'" text-color="white" :icon="s.icon || 'public'" size="40px" />
                  </q-item-section>
                  <q-item-section style="min-width: 0">
                    <q-item-label class="row items-center">
                      <span class="ellipsis">{{ s.name }}</span>
                      <q-badge v-if="s.online === false" color="negative" class="q-ml-sm">offline</q-badge>
                      <q-badge v-else-if="s.manual" color="grey-6" class="q-ml-sm">custom</q-badge>
                    </q-item-label>
                    <q-item-label caption class="text-grey-7 ellipsis">{{ s.url }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row items-center q-gutter-xs">
                      <q-btn flat dense round icon="arrow_upward" :disable="i === 0" @click="move(i, -1)" />
                      <q-btn flat dense round icon="arrow_downward" :disable="i === store.services.length - 1" @click="move(i, 1)" />
                      <q-btn flat dense round icon="edit" @click="openEdit(s)" />
                      <q-btn flat dense round color="negative" icon="delete" @click="removeService(s)" />
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </q-tab-panel>

          <!-- APPEARANCE -->
          <q-tab-panel name="appearance" class="q-pa-none">
            <q-card flat bordered>
              <q-card-section class="q-gutter-y-md">
                <q-input v-model="appearance.siteTitle" label="Site title" outlined dense />
                <q-input v-model="appearance.siteSubtitle" label="Site subtitle" outlined dense />
                <q-input
                  v-model.number="appearance.scanIntervalMs"
                  type="number"
                  label="Scan interval (ms)"
                  outlined
                  dense
                  hint="Minimum 5000. Takes effect after backend restart."
                />
                <q-input v-model.number="appearance.probeTimeoutMs" type="number" label="Probe timeout (ms)" outlined dense />
                <q-toggle v-model="appearance.showAutoDiscovered" label="Show auto-discovered services" />
                <q-btn color="primary" label="Save settings" unelevated :loading="busy" @click="saveAppearance" />
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- SECURITY -->
          <q-tab-panel name="security" class="q-pa-none">
            <q-card flat bordered>
              <q-card-section class="q-gutter-y-md">
                <q-banner v-if="store.isDefaultPassword" class="bg-warning text-dark rounded-borders">
                  You are using the default password. Please change it.
                </q-banner>
                <q-input v-model="pw.current" :type="showPassword ? 'text' : 'password'" label="Current password" outlined dense />
                <q-input v-model="pw.next" :type="showPassword ? 'text' : 'password'" label="New password" outlined dense />
                <q-input v-model="pw.confirm" :type="showPassword ? 'text' : 'password'" label="Confirm new password" outlined dense />
                <q-btn color="primary" label="Change password" unelevated :loading="busy" @click="doChangePassword" />
              </q-card-section>
            </q-card>
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </div>

    <!-- EDIT DIALOG -->
    <q-dialog v-model="editDialog" persistent>
      <q-card style="min-width: 380px; max-width: 90vw">
        <q-card-section>
          <div class="text-h6">{{ editing.id ? 'Edit service' : 'Add service' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-md">
          <q-input v-model="editing.name" label="Name" outlined dense />
          <q-input v-model="editing.url" label="URL" outlined dense placeholder="http://127.0.0.1:8080" />
          <q-select v-model="editing.icon" :options="iconOptions" label="Icon" outlined dense>
            <template v-slot:selected-item="scope">
              <div class="row items-center">
                <q-icon :name="scope.opt" class="q-mr-xs" />
                <span>{{ scope.opt }}</span>
              </div>
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar><q-icon :name="scope.opt" /></q-item-section>
                <q-item-section><q-item-label>{{ scope.opt }}</q-item-label></q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-select v-model="editing.color" :options="colorOptions" label="Color" outlined dense>
            <template v-slot:selected-item="scope">
              <div class="row items-center">
                <q-avatar size="14px" :color="scope.opt" class="q-mr-xs" />
                <span>{{ scope.opt }}</span>
              </div>
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar><q-avatar size="16px" :color="scope.opt" /></q-item-section>
                <q-item-section><q-item-label>{{ scope.opt }}</q-item-label></q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-toggle v-if="editing.id" v-model="editing.hidden" label="Hidden from landing page" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" :loading="busy" @click="saveEdit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { store } from '../store'
import {
  login,
  logout,
  loadServices,
  loadSettings,
  saveSettings,
  addService,
  updateService,
  deleteService,
  reorder,
  changePassword,
  scanNow
} from '../api'

const $q = useQuasar()

const tab = ref('services')
const busy = ref(false)
const scanning = ref(false)

const password = ref('')
const showPassword = ref(false)
const loginError = ref('')

const appearance = reactive({
  siteTitle: '',
  siteSubtitle: '',
  scanIntervalMs: 30000,
  probeTimeoutMs: 2500,
  showAutoDiscovered: true
})

const pw = reactive({ current: '', next: '', confirm: '' })

const editDialog = ref(false)
const editing = reactive({ id: null, name: '', url: '', icon: 'public', color: 'primary', hidden: false })

const iconOptions = [
  'public', 'dashboard', 'dns', 'router', 'lan', 'storage', 'folder', 'terminal', 'web', 'cloud',
  'code', 'database', 'calendar_today', 'photo', 'movie', 'music_note', 'description', 'book',
  'security', 'lock', 'vpn_lock', 'verified_user', 'settings', 'build', 'camera', 'tv', 'monitor',
  'speaker', 'print', 'wifi', 'bluetooth', 'power', 'schedule', 'timeline', 'bar_chart', 'pie_chart',
  'map', 'place', 'notifications', 'language', 'mail', 'chat', 'account_circle', 'shopping_cart',
  'home', 'apps', 'memory', 'developer_board', 'cast', 'device_hub', 'hub', 'link'
]

const colorOptions = [
  'primary', 'secondary', 'accent', 'dark', 'positive', 'negative', 'info', 'warning',
  'teal', 'purple', 'orange', 'indigo', 'pink', 'cyan', 'deep-orange', 'light-blue',
  'green', 'red', 'amber', 'brown', 'blue-grey'
]

const formattedScan = computed(() => {
  if (!store.lastScan) return ''
  return new Date(store.lastScan).toLocaleString()
})

onMounted(async () => {
  if (!store.authed) return
  try {
    await loadSettings()
    await loadServices()
    syncAppearance()
  } catch (e) { /* handled by api */ }
})

function syncAppearance() {
  appearance.siteTitle = store.settings.siteTitle || ''
  appearance.siteSubtitle = store.settings.siteSubtitle || ''
  appearance.scanIntervalMs = store.settings.scanIntervalMs || 30000
  appearance.probeTimeoutMs = store.settings.probeTimeoutMs || 2500
  appearance.showAutoDiscovered = store.settings.showAutoDiscovered !== false
}

async function doLogin() {
  busy.value = true
  loginError.value = ''
  try {
    await login(password.value)
    await loadSettings()
    await loadServices()
    syncAppearance()
  } catch (e) {
    loginError.value = e.message
  } finally {
    busy.value = false
  }
}

function onLogout() {
  logout()
  $q.notify({ type: 'info', message: 'Logged out' })
}

async function onScan() {
  scanning.value = true
  try {
    await scanNow()
    $q.notify({ type: 'positive', message: 'Scan complete' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    scanning.value = false
  }
}

async function saveAppearance() {
  busy.value = true
  try {
    await saveSettings({ ...appearance })
    $q.notify({ type: 'positive', message: 'Settings saved' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    busy.value = false
  }
}

async function doChangePassword() {
  if (pw.next !== pw.confirm) {
    $q.notify({ type: 'negative', message: 'New passwords do not match' })
    return
  }
  busy.value = true
  try {
    await changePassword(pw.current, pw.next)
    pw.current = ''
    pw.next = ''
    pw.confirm = ''
    await loadSettings()
    $q.notify({ type: 'positive', message: 'Password changed' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    busy.value = false
  }
}

function openAdd() {
  Object.assign(editing, { id: null, name: '', url: '', icon: 'public', color: 'primary', hidden: false })
  editDialog.value = true
}

function openEdit(s) {
  Object.assign(editing, {
    id: s.id,
    name: s.name,
    url: s.url,
    icon: s.icon || 'public',
    color: s.color || 'primary',
    hidden: !!s.hidden
  })
  editDialog.value = true
}

async function saveEdit() {
  if (!editing.name || !editing.url) {
    $q.notify({ type: 'negative', message: 'Name and URL are required' })
    return
  }
  busy.value = true
  try {
    if (editing.id) {
      await updateService(editing.id, { ...editing })
    } else {
      await addService({ name: editing.name, url: editing.url, icon: editing.icon, color: editing.color, manual: true })
    }
    editDialog.value = false
    await loadServices()
    $q.notify({ type: 'positive', message: 'Service saved' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    busy.value = false
  }
}

function removeService(s) {
  $q.dialog({
    title: 'Remove service',
    message: s.manual
      ? `Remove "${s.name}" permanently?`
      : `Hide "${s.name}" from the landing page?`,
    cancel: true,
    ok: { color: 'negative', label: s.manual ? 'Remove' : 'Hide' }
  }).onOk(async () => {
    try {
      await deleteService(s.id)
      await loadServices()
      $q.notify({ type: 'positive', message: 'Service removed' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

async function move(index, dir) {
  const target = index + dir
  if (target < 0 || target >= store.services.length) return
  const list = [...store.services]
  const tmp = list[index]
  list[index] = list[target]
  list[target] = tmp
  store.services = list
  try {
    await reorder(list.map((s) => s.id))
    await loadServices()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
    await loadServices()
  }
}
</script>
