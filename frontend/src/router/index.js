import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('../pages/IndexPage.vue') },
      { path: 'config', name: 'config', component: () => import('../pages/ConfigPage.vue') }
    ]
  }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
