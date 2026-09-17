import { store } from './store'

const BASE = '/api'

function token() {
  return localStorage.getItem('portal_token')
}

function authHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (includeAuth && token()) headers.Authorization = 'Bearer ' + token()
  return headers
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(auth),
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  let data = {}
  try {
    data = await res.json()
  } catch (e) { /* non-JSON response */ }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      store.authed = false
      localStorage.removeItem('portal_token')
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  return data
}

export async function loadServices() {
  const data = await request('/services', { auth: false })
  store.services = data.services || []
  store.lastScan = data.lastScan || null
  store.scanning = !!data.scanning
  return data
}

export async function loadSettings() {
  const data = await request('/settings', { auth: false })
  store.settings = data.settings || store.settings
  store.isDefaultPassword = !!data.isDefaultPassword
  return data
}

export async function login(password) {
  const data = await request('/auth/login', { method: 'POST', body: { password }, auth: false })
  localStorage.setItem('portal_token', data.token)
  store.authed = true
  return data
}

export function logout() {
  request('/auth/logout', { method: 'POST' }).catch(() => {})
  localStorage.removeItem('portal_token')
  store.authed = false
}

export async function saveSettings(settings) {
  const data = await request('/settings', { method: 'PUT', body: settings })
  store.settings = data.settings || store.settings
  return data
}

export async function addService(service) {
  return request('/services', { method: 'POST', body: service })
}

export async function updateService(id, service) {
  return request('/services/' + encodeURIComponent(id), { method: 'PUT', body: service })
}

export async function deleteService(id) {
  return request('/services/' + encodeURIComponent(id), { method: 'DELETE' })
}

export async function reorder(ids) {
  return request('/services/reorder', { method: 'POST', body: { ids } })
}

export async function changePassword(current, next) {
  return request('/auth/change-password', { method: 'POST', body: { current, next } })
}

export async function scanNow() {
  const data = await request('/scan', { method: 'POST' })
  store.services = data.services || store.services
  store.lastScan = data.lastScan || store.lastScan
  return data
}
