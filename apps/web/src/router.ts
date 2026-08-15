import { createRouter, createWebHistory } from "vue-router";
import MobileExperience from "./views/MobileExperience.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: MobileExperience },
    { path: "/scan", name: "scan", component: MobileExperience },
    { path: "/scan/:id/review", name: "review", component: MobileExperience },
    { path: "/analysis/:id", name: "analysis", component: MobileExperience },
    { path: "/history", name: "history", component: MobileExperience },
    { path: "/impact", name: "impact", component: MobileExperience },
    { path: "/subscription", name: "plan", component: MobileExperience },
    { path: "/profile", name: "profile", component: MobileExperience },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
