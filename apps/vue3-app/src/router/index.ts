import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/testcase-agent',
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../components/ChatInterface.vue'),
  },
  {
    path: '/testcase-agent',
    name: 'TestCaseAgent',
    component: () => import('../views/TestCaseAgentView.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
