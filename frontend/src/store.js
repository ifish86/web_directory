import { reactive } from 'vue'

export const store = reactive({
  services: [],
  settings: { siteTitle: 'Device Portals', siteSubtitle: '' },
  authed: !!localStorage.getItem('portal_token'),
  lastScan: null,
  scanning: false,
  loading: false,
  isDefaultPassword: false
})
