<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowRight, Leaf, LockKeyhole, UserRound } from "lucide-vue-next";
import { apiErrorMessage } from "../api";
import { useAuthStore } from "../auth.store";
const route=useRoute();const router=useRouter();const auth=useAuthStore();
const username=ref(route.name==="login"?"demo":"");const password=ref(route.name==="login"?"Demo12345!":"");const error=ref("");
const registering=computed(()=>route.name==="register");
async function submit():Promise<void>{error.value="";try{if(registering.value)await auth.register(username.value,password.value);else await auth.login(username.value,password.value);const target=typeof route.query.redirect==="string"&&route.query.redirect.startsWith("/")?route.query.redirect:"/";await router.replace(target);}catch(cause){error.value=apiErrorMessage(cause);}}
</script>
<template>
  <main class="auth-stage">
    <section class="auth-brand">
      <span><Leaf /></span><p>Re-Sort</p><h1>Sort with confidence.<br><em>Waste less.</em></h1><p>Photo-based waste identification, Germany-wide sorting guidance and a record of your everyday impact.</p><div><b>01</b>Identify the item visually</div><div><b>02</b>Confirm what the AI sees</div><div><b>03</b>Get the correct bin or collection route</div>
    </section>
    <section class="auth-panel">
      <div class="auth-mobile-logo"><Leaf />Re-Sort</div><p class="auth-eyebrow">{{ registering?'Create account':'Welcome back' }}</p><h2>{{ registering?'Start sorting smarter':'Sign in to Re-Sort' }}</h2><p>{{ registering?'Create your private waste record in under a minute.':'Continue to your scans, history and impact.' }}</p>
      <form @submit.prevent="submit"><label><span>Username</span><div><UserRound /><input v-model.trim="username" autocomplete="username" minlength="3" maxlength="30" pattern="[a-zA-Z0-9._-]+" required></div></label><label><span>Password</span><div><LockKeyhole /><input v-model="password" type="password" :autocomplete="registering?'new-password':'current-password'" minlength="10" required></div></label><p v-if="error" class="auth-error" role="alert">{{ error }}</p><button :disabled="auth.busy">{{ auth.busy?'Please wait…':registering?'Create account':'Sign in' }}<ArrowRight /></button></form>
      <p class="auth-switch">{{ registering?'Already have an account?':'New to Re-Sort?' }} <RouterLink :to="registering?'/login':'/register'">{{ registering?'Sign in':'Create account' }}</RouterLink></p>
      <aside v-if="!registering"><strong>Demo account</strong><span>Username: demo</span><span>Password: Demo12345!</span></aside>
    </section>
  </main>
</template>
<style scoped>
.auth-stage{min-height:100dvh;display:grid;grid-template-columns:minmax(330px,1fr) minmax(420px,1fr);background:#f5f0e6}.auth-brand{padding:clamp(42px,8vw,110px);background:linear-gradient(145deg,#123f31,#1e654a);color:#f9f5e9;display:flex;flex-direction:column;justify-content:center}.auth-brand>span{width:58px;height:58px;border:1px solid rgba(255,255,255,.35);border-radius:50%;display:grid;place-items:center}.auth-brand>p:nth-child(2){font:29px Georgia,serif;margin:15px 0 45px}.auth-brand h1{font:clamp(44px,5vw,76px)/.95 Georgia,serif;letter-spacing:-3px;margin:0 0 24px}.auth-brand h1 em{color:#eab046;font-style:normal}.auth-brand>p:nth-child(4){max-width:520px;line-height:1.7;color:#d8e1da;margin-bottom:42px}.auth-brand>div{border-top:1px solid rgba(255,255,255,.18);padding:15px 0;display:flex;gap:20px}.auth-brand b{color:#eab046}.auth-panel{width:min(100%,520px);margin:auto;padding:42px}.auth-mobile-logo{display:none}.auth-eyebrow{color:#1e5c45;text-transform:uppercase;letter-spacing:.14em;font-weight:800;font-size:11px}.auth-panel h2{font:43px/1.05 Georgia,serif;letter-spacing:-1.5px;margin:10px 0}.auth-panel>p{color:#73766f}.auth-panel form{display:grid;gap:18px;margin-top:34px}.auth-panel label>span{display:block;font-weight:700;margin-bottom:7px}.auth-panel label>div{height:54px;border:1px solid #c7c3b7;border-radius:10px;background:#fffdf7;display:flex;align-items:center;padding:0 14px;gap:10px}.auth-panel label svg{width:19px;color:#1e5c45}.auth-panel input{border:0;outline:0;background:transparent;width:100%;height:100%;font-size:16px}.auth-panel form>button{height:55px;border:0;border-radius:10px;background:linear-gradient(135deg,#ee5419,#e66a2c);color:white;font-weight:750;display:flex;align-items:center;justify-content:center;gap:9px}.auth-panel form>button:disabled{opacity:.65}.auth-error{color:#a6412f!important;background:#f9e8e1;padding:10px;border-radius:8px}.auth-switch{text-align:center;margin-top:23px}.auth-switch a{color:#1e5c45;font-weight:700}.auth-panel aside{margin-top:28px;border:1px solid #d7d2c5;background:rgba(255,253,247,.6);border-radius:10px;padding:13px;display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px;color:#73766f}.auth-panel aside strong{grid-column:1/-1;color:#2c312b}@media(max-width:760px){.auth-stage{display:block}.auth-brand{display:none}.auth-panel{min-height:100dvh;padding:38px 24px;display:flex;flex-direction:column;justify-content:center}.auth-mobile-logo{display:flex;align-items:center;gap:7px;font:25px Georgia,serif;color:#1e5c45;margin-bottom:44px}.auth-mobile-logo svg{width:24px}.auth-panel h2{font-size:37px}.auth-panel aside{grid-template-columns:1fr}}
</style>
