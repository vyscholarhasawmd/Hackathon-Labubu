import { createRouter,createWebHistory } from "vue-router";
import { useAuthStore } from "./auth.store";
import { pinia } from "./pinia";
import AuthView from "./views/AuthView.vue";
import MobileExperience from "./views/MobileExperience.vue";

export const router=createRouter({history:createWebHistory(),routes:[
  {path:"/login",name:"login",component:AuthView,meta:{guest:true}},
  {path:"/register",name:"register",component:AuthView,meta:{guest:true}},
  {path:"/",name:"home",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/scan",name:"scan",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/scan/:id/review",name:"review",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/analysis/:id",name:"analysis",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/history",name:"history",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/impact",name:"impact",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/subscription",name:"plan",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/profile",name:"profile",component:MobileExperience,meta:{requiresAuth:true}},
  {path:"/:pathMatch(.*)*",redirect:"/"},
],scrollBehavior:()=>({top:0})});

router.beforeEach(async(to)=>{const auth=useAuthStore(pinia);await auth.restore();if(to.meta.requiresAuth&&!auth.authenticated)return {name:"login",query:{redirect:to.fullPath}};if(to.meta.guest&&auth.authenticated)return {name:"home"};return true;});
window.addEventListener("resort:session-expired",()=>{const auth=useAuthStore(pinia);auth.$reset();void router.replace({name:"login",query:{redirect:router.currentRoute.value.fullPath}});});
