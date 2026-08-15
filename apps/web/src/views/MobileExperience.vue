<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft, BatteryCharging, Bell, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleUserRound, Clock3, Cloud, ExternalLink, FileImage, Home, Info, Leaf, Package, Recycle,
  ShieldCheck, Sparkles, Trash2, Upload, X,
} from "lucide-vue-next";
import { apiErrorMessage } from "../api";
import { useResortStore } from "../store";

const route = useRoute();
const router = useRouter();
const store = useResortStore();
const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
const processing = ref(false);
const progressStep = ref(0);
const error = ref("");
const rejectOpen = ref(false);
const binOpen = ref(false);
const paymentOpen = ref(false);
const successOpen = ref(false);
const countryMenuOpen = ref(false);
const toast = ref("");
const weight = ref(25);
const activeScreen = computed(() => String(route.name ?? "home"));
const selectedCountry = computed(() => store.countries.find((country) => country.code === store.selectedCountryCode)
  ?? store.countries[0]);
const countryFlags: Record<string, string> = {
  DE: "🇩🇪",
  AT: "🇦🇹",
  FR: "🇫🇷",
  NL: "🇳🇱",
};
const record = computed(() => {
  const recordId = String(route.params.id ?? "");
  if (store.record?.id === recordId) return store.record;
  return store.history.find((item) => item.id === recordId) ?? null;
});
const co2Grams = computed(() => (((record.value?.estimatedDisposalCo2eKg ?? 0) * 1000)).toFixed(2));
const disposalDescription = computed(() => record.value?.environmentalImpactSummary
  ?? "No AI disposal recommendation is available for this record.");
const bars = computed(() => store.analytics.dailyCounts);
const maxBar = computed(() => Math.max(...bars.value, 1));
const reviewMaterial = computed(() => {
  const identification = store.scan?.identification;

  if (!identification) {
    return "Material uncertain";
  }

  const material =
    identification.materials[0]?.material;

  const symbol =
    identification.visibleSymbols[0]?.rawText ??
    identification.visibleSymbols[0]?.code;

  return [material, symbol]
    .filter(Boolean)
    .join(" · ");
});

watch(record, (currentRecord) => {
  if (currentRecord) weight.value = currentRecord.estimatedWeightGrams;
}, { immediate: true });

onMounted(() => store.initialize());

function navigate(path: string): void { void router.push(path); }
function showToast(message: string): void { toast.value = message; window.setTimeout(() => { toast.value = ""; }, 2800); }
function clearSession(): void { window.sessionStorage.clear(); showToast("Local session cleared"); }
function closeCountryMenuOnBlur(event: FocusEvent): void {
  const selector = event.currentTarget as HTMLElement;
  if (!selector.contains(event.relatedTarget as Node | null)) countryMenuOpen.value = false;
}
function selectCountry(code: string, enabled: boolean): void {
  if (!enabled) return;
  store.selectedCountryCode = code;
  countryMenuOpen.value = false;
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  error.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) { error.value = "Choose a JPEG, PNG or WebP image."; return; }
  if (file.size > 10 * 1024 * 1024) { error.value = "This image is larger than 10 MiB."; return; }
  store.selectFile(file);
}

async function usePhoto(): Promise<void> {
  if (!store.file) {
    error.value = "Choose or take a photo first.";
    return;
  }

  processing.value = true;
  progressStep.value = 0;
  error.value = "";

  window.setTimeout(() => {
    progressStep.value = 1;
  }, 550);

  window.setTimeout(() => {
    progressStep.value = 2;
  }, 1100);

  try {
    const scan = await store.analyze();

    window.setTimeout(() => {
      processing.value = false;
      void router.push(`/scan/${scan.id}/review`);
    }, 1650);
  } catch (cause) {
    processing.value = false;
    error.value = apiErrorMessage(cause);
  }
}

async function acceptResult(): Promise<void> {
  const accepted = await store.accept();
  await router.push(`/analysis/${accepted.id}`);
}

async function rejectResult(): Promise<void> {
  await store.reject(); rejectOpen.value = false; showToast("Your feedback has been received"); await router.push("/scan");
}

async function updateWeight(): Promise<void> { await store.updateWeight(weight.value); showToast("Footprint estimate updated."); }
async function upgrade(): Promise<void> { await store.upgradePlus(); paymentOpen.value = false; successOpen.value = true; }
</script>

<template>
  <main class="mobile-stage">
    <section class="phone-app">
      <div class="status-bar" aria-hidden="true"><strong>9:41</strong><span>● ◒ ▰</span></div>

      <div class="screen-content">
        <template v-if="activeScreen === 'home'">
          <header class="brand-header"><div class="brand"><Leaf :size="22" /><span>Re-Sort</span></div><button class="icon-button" aria-label="Notifications"><Bell :size="20" /></button></header>
          <section class="hero-copy"><p class="eyebrow"><Sparkles :size="13" />This week</p><h1>Good morning,<br />Emma.</h1></section>

          <article class="mobile-card weekly-card">
            <div class="section-title"><strong>Weekly progress</strong><span>{{ store.subscription.used }} of {{ store.subscription.weeklyLimit }} scans</span></div>
            <div class="mini-chart" aria-label="Weekly scans chart">
              <div v-for="(value,index) in bars" :key="index"><i :style="{height: `${Math.max(17, value / maxBar * 88)}px`}" :class="{ future:index===6 }"></i><small>{{ ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index] }}</small></div>
            </div>
          </article>

          <article class="mobile-card category-summary">
            <div class="section-title"><strong>Category summary</strong><span>This week</span></div>
            <div class="category-icons"><div><span><Package :size="19" /></span><small>Plastics</small><strong>4</strong></div><div><span><FileImage :size="19" /></span><small>Paper</small><strong>2</strong></div><div><span><Recycle :size="19" /></span><small>Metals</small><strong>1</strong></div><div><span><ShieldCheck :size="19" /></span><small>Glass</small><strong>0</strong></div></div>
          </article>

          <article class="mobile-card recent-mobile">
            <div class="section-title"><strong>Recent scans</strong><button @click="navigate('/history')">View all</button></div>
            <button v-for="item in store.history.slice(0,3)" :key="item.id" class="recent-item" @click="navigate(`/analysis/${item.id}`)"><span class="recent-thumb" :class="item.category.toLowerCase()"><span v-if="item.identifiedName.includes('Yogurt')">🥛</span><span v-else-if="item.identifiedName.includes('Cardboard')">📦</span><span v-else>🫙</span></span><span><strong>{{ item.identifiedName }}</strong><small>{{ new Date(item.createdAt).toLocaleDateString('en-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'}) }}</small></span><i>{{ item.materialLabel.split(' · ')[0] }}</i><ChevronRight :size="15" /></button>
          </article>
          <button class="primary-button scan-home" @click="navigate('/scan')"><Camera :size="19" />Scan an item</button>
        </template>

        <template v-else-if="activeScreen === 'scan'">
          <header class="screen-header">
            <button class="icon-button" @click="navigate('/')" aria-label="Back"><ArrowLeft /></button>
            <h2>Scan & Sort</h2>
            <div class="country-selector" @focusout="closeCountryMenuOnBlur" @keydown.esc="countryMenuOpen=false">
              <button class="country-chip" type="button" aria-haspopup="listbox" :aria-expanded="countryMenuOpen" @click="countryMenuOpen=!countryMenuOpen">
                <span>{{ countryFlags[selectedCountry?.code ?? 'DE'] }}</span>
                {{ selectedCountry?.name ?? 'Germany' }}
                <ChevronDown :size="15" :class="{ rotated: countryMenuOpen }" />
              </button>
              <div v-if="countryMenuOpen" class="country-menu" role="listbox" aria-label="Available countries">
                <button
                  v-for="country in store.countries"
                  :key="country.code"
                  type="button"
                  role="option"
                  :aria-selected="country.code===store.selectedCountryCode"
                  :disabled="!country.enabled"
                  @click="selectCountry(country.code, country.enabled)"
                >
                  <span class="country-flag">{{ countryFlags[country.code] ?? '🌍' }}</span>
                  <span class="country-name">{{ country.name }}</span>
                  <Check v-if="country.code===store.selectedCountryCode" :size="16" class="country-check" />
                  <span v-else-if="!country.enabled" class="coming-soon-tag">{{ country.label ?? 'Coming soon' }}</span>
                </button>
                <p>Germany-wide guidance is currently supported.</p>
              </div>
            </div>
          </header>
          <section v-if="processing" class="processing-screen">
            <div class="scan-preview processing"><img v-if="store.previewUrl" :src="store.previewUrl" alt="Selected item" /><div v-else class="cup-object"><span></span></div><i class="scan-line"></i></div>
            <span class="demo-badge">AI image analysis</span><h1>Looking closely…</h1><ol><li v-for="(label,index) in ['Uploading','Identifying','Preparing result']" :key="label" :class="{active:index<=progressStep}"><span>{{ index < progressStep ? '✓' : index+1 }}</span>{{ label }}</li></ol>
          </section>
          <template v-else>
            <div class="camera-stage" :class="{selected:store.previewUrl}">
              <img v-if="store.previewUrl" :src="store.previewUrl" alt="Photo ready for analysis" />
              <div v-else class="camera-backdrop"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span><Camera :size="39" /><p>Center one item in the frame</p></div>
              <span class="flash">ϟ</span>
            </div>
            <p class="photo-tip"><Leaf :size="14" />If the product has a recycling or disposal symbol, make sure it is clearly visible in the photo.</p>
            <p v-if="error" class="error-copy"><Info :size="15" />{{ error }}</p>
            <div class="scan-actions" v-if="!store.previewUrl"><label class="primary-button"><Camera :size="19" />Take a photo<input ref="cameraInput" class="sr-only" type="file" accept="image/*" capture="environment" @change="onFile" /></label><label class="outline-button"><FileImage :size="19" />Choose from photos<input ref="galleryInput" class="sr-only" type="file" accept="image/*" @change="onFile" /></label></div>
            <div class="scan-actions" v-else><button class="primary-button" @click="usePhoto"><Upload :size="19" />Use this photo</button><button class="outline-button" @click="galleryInput?.click()"><FileImage :size="19" />Choose another</button><input ref="galleryInput" class="sr-only" type="file" accept="image/*" @change="onFile" /></div>
            <div class="scan-meta"><span>{{ store.subscription.used }} / {{ store.subscription.weeklyLimit }} scans used</span><span>Metadata removed before analysis</span></div>
          </template>
        </template>

        <template v-else-if="activeScreen === 'review'">
          <header class="screen-header"><button class="icon-button" @click="navigate('/scan')"><ArrowLeft /></button><h2>Review</h2><button class="icon-button" @click="navigate('/scan')"><X /></button></header>
          <div class="review-photo"><img v-if="store.previewUrl" :src="store.previewUrl" alt="Scanned waste item" /><div v-else class="cup-object big"><span></span></div></div>
          <section class="review-details">
            <h1>{{ store.scan?.identification.primaryObject ?? 'No AI identification' }}</h1>
            <span v-if="store.scan" class="confidence"><ShieldCheck :size="17" />AI confidence · {{ Math.round(store.scan.identification.overallConfidence*100) }}%</span>
            <div class="material-row"><Recycle :size="22" /><span>{{ reviewMaterial }}</span><Info :size="17" /></div>
            <div v-if="store.scan" class="ai-route-preview">
              <span>AI waste type</span>
              <strong>{{ store.scan.identification.disposalRecommendation.wasteTypeLabel }}</strong>
              <span>Recommended bin or route</span>
              <strong>{{ store.scan.identification.disposalRecommendation.binLabel }}</strong>
            </div>
            <div class="correct-block"><h3>Is this correct?</h3><button class="confirm-button" :disabled="!store.scan" @click="acceptResult"><Check :size="21" />Yes, this is correct</button><button class="text-link" @click="rejectOpen=true">No, report an issue</button></div>
            <p class="fine-note"><Info :size="14" />AI identifies the item and provides the waste type, bin or collection route, and disposal instructions. Low-confidence results require local guidance.</p>
          </section>
        </template>

        <template v-else-if="activeScreen === 'analysis'">
          <header class="screen-header"><button class="icon-button" @click="router.back()"><ArrowLeft /></button><h2>Analysis</h2><button class="icon-button"><Upload :size="18" /></button></header>
          <article class="analysis-route">
            <div class="bin-illustration" :class="record?.category.toLowerCase()"><Trash2 :size="43" /><span><Leaf v-if="record?.category==='ORGANIC'" :size="20" /><BatteryCharging v-else-if="record?.category==='BATTERY'" :size="20" /><FileImage v-else-if="record?.category==='PAPER_CARDBOARD'" :size="20" /><Recycle v-else :size="20" /></span></div>
            <div>
              <p class="route-identification">AI identified · {{ record?.identifiedName ?? 'No item' }}</p>
              <h1>{{ record?.binLabel ?? 'No disposal recommendation' }}</h1>
              <p class="route-type">{{ record?.wasteTypeLabel }}<span v-if="record?.materialLabel"> · {{ record.materialLabel }}</span></p>
              <p>{{ disposalDescription }}</p>
            </div>
            <section><h3>Disposal instructions</h3><ul><li v-for="step in record?.preparationSteps" :key="step"><CheckCircle2 :size="17" />{{ step }}</li></ul></section>
          </article>
          <button class="better-choice"><span><Leaf :size="24" /></span><span><strong>Better choice</strong><small>{{ record?.reuseSuggestions[0] }}</small></span><ChevronRight :size="17" /></button>
          <article class="footprint-card"><div class="section-title"><strong><Leaf :size="17" />Estimated disposal footprint</strong><span>Proxy</span></div><div class="footprint-value"><span><strong>{{ co2Grams }} g</strong><small>CO₂e</small></span><div class="impact-bars"><i></i><i></i><i></i></div></div><label>Estimated item weight<div><input v-model.number="weight" type="number" min="1" max="100000" /><span>g</span><button @click="updateWeight">Update</button></div></label><p>This is an indicative end-of-life estimate, not a full product life-cycle assessment.</p></article>
          <div class="source-row"><span>Rule-set {{ record?.ruleSetVersion }}</span><a :href="record?.sourceUrls[0]" target="_blank" rel="noreferrer">Local guidance <ExternalLink :size="12" /></a></div>
          <button class="primary-button full" @click="navigate('/scan')"><Camera :size="19" />Scan another item</button>
        </template>

        <template v-else-if="activeScreen === 'plan'">
          <header class="simple-header"><p class="eyebrow"><Sparkles :size="13" />Plans & quota</p><h1>Choose your plan</h1><p>{{ store.subscription.used }} scans used this week · resets Monday</p></header>
          <section class="plan-stack">
            <article class="plan-card" :class="{current:store.subscription.plan==='FREE'}"><div class="plan-title"><h2>Free</h2><p>€0 <small>/ month</small></p></div><span>10 scans/week</span><ul><li><Check />Basic sorting guidance</li><li><Check />Recent scan history</li></ul><b v-if="store.subscription.plan==='FREE'">Current plan</b></article>
            <article class="plan-card plus" :class="{current:store.subscription.plan==='PLUS'}"><i>Most popular</i><div class="plan-title"><h2>Plus</h2><p>€9.99 <small>/ month</small></p></div><span>100 scans/week</span><ul><li><Check />Enhanced verification</li><li><Check />Unlimited scan history</li><li><Check />Impact tracking</li></ul><b v-if="store.subscription.plan==='PLUS'">Current plan</b><button v-else class="primary-button full" @click="paymentOpen=true">Choose Plus</button></article>
            <article class="plan-card disabled"><div class="plan-title"><h2>Household</h2><p>€17.99 <small>/ month</small></p></div><span>250 scans/week · 4 accounts</span><ul><li><Check />Everything in Plus</li><li><Check />Optional child accounts</li></ul><strong>Coming soon</strong></article>
          </section>
          <p class="accuracy-copy">Accuracy figures are product benchmark targets, not a guarantee for every image.</p>
          <button class="bin-connect" @click="binOpen=true"><Trash2 :size="19" />Connect with your Re-Sort Bin</button>
        </template>

        <template v-else-if="activeScreen === 'history'">
          <header class="simple-header"><p class="eyebrow"><Clock3 :size="13" />Accepted records</p><h1>Scan history</h1><p>Only confirmed items affect your impact dashboard.</p></header>
          <section class="history-list"><button v-for="item in store.history" :key="item.id" @click="navigate(`/analysis/${item.id}`)"><span class="history-icon">{{ item.category==='PAPER_CARDBOARD'?'📦':item.category==='GLASS_PACKAGING'?'🫙':'🥛' }}</span><span><strong>{{ item.identifiedName }}</strong><small>{{ item.materialLabel }} · {{ item.binLabel }}</small></span><span><b>{{ item.estimatedWeightGrams }} g</b><small>{{ new Date(item.createdAt).toLocaleDateString('en-DE') }}</small></span><ChevronRight :size="16" /></button></section>
        </template>

        <template v-else-if="activeScreen === 'impact'">
          <header class="simple-header"><p class="eyebrow"><Leaf :size="13" />7-day insights</p><h1>Your impact</h1><p>Practical patterns from accepted records.</p></header>
          <div class="impact-grid"><article><Recycle /><strong>{{ store.analytics.totalAccepted }}</strong><small>items sorted</small></article><article><Package /><strong>{{ store.analytics.totalWeightGrams }} g</strong><small>estimated weight</small></article><article><Cloud /><strong>{{ (store.analytics.totalDisposalCo2eKg*1000).toFixed(1) }} g</strong><small>disposal CO₂e</small></article></div>
          <article class="insight-card"><span><Leaf /></span><div><h2>Refill before replacing</h2><p>You sorted several lightweight packages. Try one refill or reusable packaging swap on your next shop.</p></div></article><article class="insight-card"><span><BatteryCharging /></span><div><h2>Return batteries together</h2><p>Keep used batteries dry and take them to a retailer or municipal collection point.</p></div></article>
        </template>

        <template v-else-if="activeScreen === 'profile'">
          <header class="simple-header"><p class="eyebrow"><CircleUserRound :size="13" />Local demo</p><h1>Your profile</h1><p>Manage the local session and connection status.</p></header>
          <article class="profile-card"><span>EM</span><div><h2>Emma</h2><p>@demo · {{ store.subscription.plan==='PLUS'?'Plus':'Free' }} plan</p></div></article><article class="connection-card"><div><span :class="store.apiOnline?'online':'offline'"></span><div><strong>{{ store.apiOnline?'Local API connected':'Frontend fallback active' }}</strong><small>{{ store.apiOnline?'NestJS · localhost:3000':'Start pnpm dev for the full API flow' }}</small></div></div><p>When ngrok is connected to port 5173, the same origin proxy forwards `/api` to the local backend.</p></article><button class="outline-button full" @click="clearSession">Clear local session</button>
        </template>
      </div>

      <nav class="bottom-nav" aria-label="Main navigation"><button :class="{active:activeScreen==='home'}" @click="navigate('/')"><Home /><span>Home</span></button><button class="scan-nav" :class="{active:['scan','review','analysis'].includes(activeScreen)}" @click="navigate('/scan')"><span><Camera /></span><b>Scan</b></button><button :class="{active:activeScreen==='history'}" @click="navigate('/history')"><Clock3 /><span>History</span></button><button :class="{active:activeScreen==='impact'}" @click="navigate('/impact')"><Leaf /><span>Impact</span></button><button :class="{active:['profile','plan'].includes(activeScreen)}" @click="navigate('/profile')"><CircleUserRound /><span>Profile</span></button></nav>
    </section>

    <div v-if="rejectOpen" class="modal-layer" @click.self="rejectOpen=false"><section class="modal"><button class="modal-close" @click="rejectOpen=false"><X /></button><span class="success-icon"><Info /></span><h2>Report this result?</h2><p>Your feedback will be stored without creating a waste record. The processed image still counts toward this week’s quota.</p><button class="primary-button full" @click="rejectResult">Send feedback</button><button class="text-link" @click="rejectOpen=false">Cancel</button></section></div>
    <div v-if="binOpen" class="modal-layer" @click.self="binOpen=false"><section class="modal"><button class="modal-close" @click="binOpen=false"><X /></button><span class="success-icon"><Trash2 /></span><h2>Re-Sort Bin connection</h2><p>Smart bin connectivity is coming soon. Your current account will be ready to connect when the hardware integration is available.</p><button class="primary-button full" @click="binOpen=false">Got it</button></section></div>
    <div v-if="paymentOpen" class="modal-layer" @click.self="paymentOpen=false"><section class="modal payment"><button class="modal-close" @click="paymentOpen=false"><X /></button><p class="eyebrow"><ShieldCheck :size="13" />Demo checkout</p><h2>Upgrade to Plus</h2><div class="order-line"><span>Plus · monthly</span><strong>€9.99</strong></div><div class="demo-card"><small>RE-SORT DEMO</small><strong>4242 4242 4242 4242</strong><span>NO CARD DATA IS SENT</span></div><p>No card number, CVV or expiry is stored. Confirmation sends only `tok_demo_visa`.</p><button class="primary-button full" @click="upgrade">Confirm demo payment</button></section></div>
    <div v-if="successOpen" class="modal-layer"><section class="modal"><button class="modal-close" @click="successOpen=false"><X /></button><span class="success-icon"><Check /></span><h2>Payment successful — Plus is now active.</h2><p>Your weekly limit is now 100 scans. Current usage was preserved.</p><button class="primary-button full" @click="successOpen=false">Continue</button></section></div>
    <div v-if="toast" class="toast" role="status"><CheckCircle2 />{{ toast }}</div>
  </main>
</template>

<style scoped>
.ai-route-preview {
  margin-top: 10px;
  padding: 11px;
  border: 1px solid #c8d2c0;
  border-radius: 9px;
  background: #eff3e8;
  display: grid;
  gap: 3px;
}

.ai-route-preview span,
.route-identification,
.route-type {
  color: #687068;
  font-size: 9px;
}

.ai-route-preview strong + span {
  margin-top: 7px;
}

.route-identification {
  margin: 3px 0 5px;
  text-transform: uppercase;
  letter-spacing: .06em;
  font-weight: 700;
}

.route-type {
  margin-bottom: 7px;
}

.country-selector {
  position: relative;
}

.country-chip svg {
  transition: transform .18s ease;
}

.country-chip svg.rotated {
  transform: rotate(180deg);
}

.country-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  right: 0;
  width: 238px;
  padding: 6px;
  border: 1px solid #cbc8bb;
  border-radius: 12px;
  background: #fffdf7;
  box-shadow: 0 15px 38px rgba(44, 49, 43, .18);
}

.country-menu button {
  width: 100%;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 7px;
  text-align: left;
}

.country-menu button:not(:disabled):hover,
.country-menu button[aria-selected="true"] {
  background: #eff3e8;
}

.country-menu button:disabled {
  cursor: not-allowed;
  opacity: .72;
}

.country-flag {
  font-size: 17px;
}

.country-name {
  font-weight: 650;
}

.country-check {
  color: #1e5c45;
}

.coming-soon-tag {
  padding: 4px 6px;
  border-radius: 99px;
  background: #f4e7bf;
  color: #8d6200;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
}

.country-menu p {
  margin: 5px 6px 3px;
  padding-top: 8px;
  border-top: 1px solid #e1ddd2;
  color: #73766f;
  font-size: 8px;
  line-height: 1.4;
}

.bin-illustration.organic {
  background: #e4edda;
  color: #3f7046;
}
</style>
