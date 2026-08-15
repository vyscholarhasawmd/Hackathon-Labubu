"use client";

import {
  AlertCircle,
  ArrowLeft,
  BatteryCharging,
  Bell,
  Milk,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  Droplets,
  ExternalLink,
  FileImage,
  Gauge,
  History,
  Home,
  Info,
  Leaf,
  LogOut,
  Package,
  Pencil,
  Recycle,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type RefObject } from "react";

type View = "dashboard" | "scan" | "review" | "analysis" | "history" | "impact" | "subscription" | "settings";
type ModalKind = "reject" | "bin" | "payment" | "payment-success" | "delete" | null;
type Plan = "FREE" | "PLUS";

const PHOTO_TIP = "If the product has a recycling or disposal symbol, make sure it is clearly visible in the photo.";
const LOCAL_WARNING = "Local collection rules may differ. Check your municipality’s Abfall-ABC or recycling center guidance.";
const ACCURACY_NOTE = "Accuracy figures are product benchmark targets, not a guarantee for every image. Image quality and visible labels affect results.";
const CARBON_NOTE = "This is an indicative end-of-life estimate based on item weight and a versioned waste-treatment proxy. It is not a full product life-cycle assessment and local German treatment emissions may differ.";

const scanRows = [
  { id: 1, emoji: "🥛", name: "Yogurt cup", category: "Lightweight packaging", material: "Plastic · PP 5", route: "Yellow bin or sack", weight: "25 g", carbon: "0.12 g", time: "Today, 8:24 AM" },
  { id: 2, emoji: "🥫", name: "Aluminium can", category: "Lightweight packaging", material: "Metal · ALU", route: "Yellow bin or sack", weight: "20 g", carbon: "0.09 g", time: "Yesterday, 6:15 PM" },
  { id: 3, emoji: "🫙", name: "Glass jar", category: "Glass packaging", material: "Glass", route: "Glass container", weight: "320 g", carbon: "1.49 g", time: "Yesterday, 1:02 PM" },
  { id: 4, emoji: "📦", name: "Cardboard box", category: "Paper & cardboard", material: "Paper · Cardboard", route: "Blue paper bin", weight: "82 g", carbon: "0.38 g", time: "Tue, 9:11 AM" },
  { id: 5, emoji: "🍌", name: "Banana peel", category: "Organic", material: "Organic", route: "Bio bin", weight: "94 g", carbon: "0.85 g", time: "Mon, 7:42 PM" },
  { id: 6, emoji: "🧴", name: "Shampoo bottle", category: "Lightweight packaging", material: "Plastic · HDPE 2", route: "Yellow bin or sack", weight: "42 g", carbon: "0.20 g", time: "Sun, 10:15 AM" },
  { id: 7, emoji: "🔋", name: "AA battery", category: "Battery", material: "Battery", route: "Collection point", weight: "24 g", carbon: "—", time: "Sat, 3:31 PM" },
];

const chartBars = [3, 5, 4, 7, 6, 2, 3];

function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header><h2 id="modal-title">{title}</h2><button ref={closeRef} className="icon-button" aria-label="Close dialog" type="button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}

function CupVisual({ preview, compact = false }: { preview: string | null; compact?: boolean }) {
  if (preview) return (
    // Blob URLs are local user previews and cannot use the framework image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={compact ? "item-photo compact" : "item-photo"} src={preview} alt="Selected waste item preview" />
  );
  return (
    <div className={compact ? "cup-visual compact" : "cup-visual"} role="img" aria-label="Illustration of a yogurt cup">
      <span className="cup-rim" /><span className="cup-body"><i>yogurt</i><b>PP 5</b></span><span className="cup-shadow" />
    </div>
  );
}

function MetricDonut() {
  return <div className="donut" aria-label="Category share: plastic 46%, paper 24%, metal 12%, glass 10%, other 8%"><div><strong>7</strong><small>items</small></div></div>;
}

export function ReSortApp() {
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [scanError, setScanError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [used, setUsed] = useState(7);
  const [weight, setWeight] = useState(25);
  const [editingWeight, setEditingWeight] = useState(false);
  const [toast, setToast] = useState("");
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [paymentDecline, setPaymentDecline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const weeklyLimit = plan === "PLUS" ? 100 : 10;

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function go(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanError("");
    if (!file.type.startsWith("image/")) { setScanError("Choose a JPEG, PNG or WebP image."); return; }
    if (file.size > 10 * 1024 * 1024) { setScanError("This image is larger than the 10 MiB limit."); return; }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
  }

  function beginProcessing() {
    setProcessing(true);
    setProcessStep(0);
    setUsed((value) => Math.min(value + 1, weeklyLimit));
    window.setTimeout(() => setProcessStep(1), 700);
    window.setTimeout(() => setProcessStep(2), 1450);
    window.setTimeout(() => { setProcessing(false); go("review"); }, 2250);
  }

  function resetScan() {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName("");
    setScanError("");
    if (fileRef.current) fileRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    go("scan");
  }

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggedIn(true);
    go("dashboard");
    announce(authMode === "login" ? "Welcome back to Re-Sort." : "Your demo account is ready.");
  }

  function saveWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditingWeight(false);
    announce("Footprint estimate updated.");
  }

  const carbonGrams = ((weight / 1_000_000) * 4.65358 * 1000).toFixed(2);
  const visibleHistory = scanRows.filter((row) => !deletedIds.includes(row.id) && (historyFilter === "All" || row.category === historyFilter));

  if (!loggedIn) {
    return (
      <main className="auth-page">
        <section className="auth-story">
          <div className="brand auth-brand"><Leaf size={29} /><span>Re-Sort</span></div>
          <div><p className="eyebrow visible"><Sparkles size={14} /> Germany · Demo AI</p><h1>Sort with confidence.<br />Live a little lighter.</h1><p>Photo-based waste guidance, versioned German sorting rules and a clear view of your weekly impact.</p></div>
          <div className="auth-facts"><span><ShieldCheck size={18} /> EXIF metadata removed</span><span><Recycle size={18} /> Rule-set DE-FEDERAL-2026.08</span></div>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <p className="eyebrow visible">{authMode === "login" ? "Welcome back" : "Create an account"}</p>
            <h2>{authMode === "login" ? "Log in to Re-Sort" : "Start sorting smarter"}</h2>
            <p className="muted">Use the pre-filled local demo credentials. No real account is created.</p>
            <form onSubmit={submitAuth}>
              <label>Username<input name="username" defaultValue="demo" minLength={3} required autoComplete="username" /></label>
              <label>Password<input name="password" type="password" defaultValue="Demo12345!" minLength={10} required autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>
              {authMode === "register" && <label className="check-label"><input type="checkbox" required /> <span>I agree to the demo terms and privacy notice.</span></label>}
              <button className="primary-button full" type="submit">{authMode === "login" ? "Log in" : "Create account"}<ChevronRight size={17} /></button>
            </form>
            <button className="text-button auth-switch" type="button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Log in"}</button>
          </div>
        </section>
      </main>
    );
  }

  const navItems = [
    { id: "dashboard" as View, label: "Dashboard", icon: Home },
    { id: "scan" as View, label: "Scan & Sort", icon: ScanLine },
    { id: "history" as View, label: "History", icon: History },
    { id: "impact" as View, label: "Impact", icon: Leaf },
    { id: "subscription" as View, label: "Subscription", icon: WalletCards },
    { id: "settings" as View, label: "Settings", icon: Settings },
  ];
  const activeNav = view === "review" ? "scan" : view === "analysis" ? "history" : view;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => go("dashboard")}><Leaf size={25} strokeWidth={1.8} /><span>Re-Sort</span></button>
        <nav className="side-nav" aria-label="Primary navigation">
          {navItems.map(({ id, label, icon: Icon }) => <button className={activeNav === id ? "nav-item active" : "nav-item"} key={id} type="button" onClick={() => go(id)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{id === "scan" && <i>{weeklyLimit - used}</i>}</button>)}
        </nav>
        <section className="sidebar-impact"><Leaf size={28} strokeWidth={1.3} /><h3>Small choices,<br />big impact.</h3><p>Every item you sort correctly helps build a cleaner future.</p><button type="button" onClick={() => go("impact")}>See your impact <ChevronRight size={14} /></button></section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title"><span>{view === "scan" ? "Scan & Sort" : view === "review" ? "Review result" : view === "analysis" ? "Disposal analysis" : view[0].toUpperCase() + view.slice(1)}</span><i>Germany</i></div>
          <nav aria-label="Page navigation"><button className={view === "dashboard" ? "top-active" : ""} onClick={() => go("dashboard")} type="button">Dashboard</button><button className={view === "history" ? "top-active" : ""} onClick={() => go("history")} type="button">History</button><button className={view === "impact" ? "top-active" : ""} onClick={() => go("impact")} type="button">Impact</button><button className={view === "subscription" ? "top-active" : ""} onClick={() => go("subscription")} type="button">Subscription</button></nav>
          <div className="profile-tools"><button aria-label="Notifications" type="button" onClick={() => announce("You’re all caught up.")}><Bell size={19} /></button><button className="avatar" type="button" onClick={() => go("settings")}>EM</button></div>
        </header>

        <div className={`page-content ${view === "dashboard" ? "dashboard-content" : ""}`}>
          {view === "dashboard" && <Dashboard used={used} limit={weeklyLimit} onScan={() => go("scan")} onHistory={() => go("history")} onImpact={() => go("impact")} onAnalysis={() => go("analysis")} />}

          {view === "scan" && <ScanPage preview={preview} fileName={fileName} error={scanError} used={used} limit={weeklyLimit} processing={processing} processStep={processStep} fileRef={fileRef} galleryRef={galleryRef} chooseFile={chooseFile} beginProcessing={beginProcessing} resetScan={resetScan} />}

          {view === "review" && <ReviewPage preview={preview} onBack={resetScan} onAccept={() => go("analysis")} onReject={() => setModal("reject")} />}

          {view === "analysis" && <AnalysisPage preview={preview} weight={weight} carbonGrams={carbonGrams} editing={editingWeight} setWeight={setWeight} setEditing={setEditingWeight} saveWeight={saveWeight} onScan={resetScan} onDashboard={() => go("dashboard")} />}

          {view === "history" && <HistoryPage rows={visibleHistory} filter={historyFilter} setFilter={setHistoryFilter} onOpen={() => go("analysis")} onDelete={(id) => { setDeleteTarget(id); setModal("delete"); }} />}

          {view === "impact" && <ImpactPage onScan={() => go("scan")} />}

          {view === "subscription" && <SubscriptionPage plan={plan} used={used} limit={weeklyLimit} onUpgrade={() => setModal("payment")} onFree={() => { setPlan("FREE"); announce("Your plan is now Free."); }} onBin={() => setModal("bin")} />}

          {view === "settings" && <SettingsPage plan={plan} onLogout={() => setLoggedIn(false)} />}
        </div>

        <nav className="bottom-nav" aria-label="Mobile navigation">
          {[{id:"dashboard" as View,label:"Home",icon:Home},{id:"scan" as View,label:"Scan",icon:ScanLine},{id:"history" as View,label:"History",icon:History},{id:"subscription" as View,label:"Plan",icon:WalletCards},{id:"settings" as View,label:"Profile",icon:UserRound}].map(({id,label,icon:Icon}) => <button className={activeNav === id ? "active" : ""} type="button" key={id} onClick={() => go(id)}><Icon size={id === "scan" ? 22 : 19} />{label}</button>)}
        </nav>
      </section>

      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}

      {modal === "reject" && <Modal title="Your feedback has been received" onClose={() => setModal(null)}><div className="success-mark"><Check size={25} /></div><p>Thank you. This helps us improve identification quality. This scan still counts toward your weekly quota because the image was processed.</p><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setModal(null)}>Stay here</button><button className="primary-button" type="button" onClick={() => { setModal(null); resetScan(); }}>Scan another item</button></div></Modal>}

      {modal === "bin" && <Modal title="Re-Sort Bin connection" onClose={() => setModal(null)}><div className="modal-icon"><Recycle size={29} /></div><p>Smart bin connectivity is coming soon. Your current account will be ready to connect when the hardware integration is available.</p><button className="primary-button full" type="button" onClick={() => setModal(null)}>Got it</button></Modal>}

      {modal === "payment" && <Modal title="Upgrade to Plus" onClose={() => setModal(null)} className="payment-modal"><div className="order-summary"><div><span>Re-Sort Plus</span><small>100 scans per week</small></div><strong>€9.99 <small>/ month</small></strong></div><div className="fake-card"><span>DEMO PAYMENT</span><strong>{paymentDecline ? "4000 0000 0000 0002" : "4242 4242 4242 4242"}</strong><div><small>VALID THRU<br />12/30</small><b>VISA</b></div></div><label className="check-label"><input type="checkbox" checked={paymentDecline} onChange={(event) => setPaymentDecline(event.target.checked)} /><span>Simulate a declined payment</span></label><p className="privacy-copy"><ShieldCheck size={15} /> No card number, CVV or expiry is sent or stored. This is a demo transaction.</p><button className="primary-button full" type="button" onClick={() => { if (paymentDecline) { announce("Demo payment declined. Try the success card."); return; } setPlan("PLUS"); setModal("payment-success"); }}>Confirm demo payment</button></Modal>}

      {modal === "payment-success" && <Modal title="Payment successful — Plus is now active." onClose={() => setModal(null)}><div className="success-mark"><Sparkles size={25} /></div><p>Your weekly limit is now 100 scans. Your current week’s usage has been preserved.</p><button className="primary-button full" type="button" onClick={() => setModal(null)}>Continue with Plus</button></Modal>}

      {modal === "delete" && <Modal title="Delete this waste record?" onClose={() => setModal(null)}><p>The record and its item image will be removed from this demo history. Your weekly quota will not change.</p><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" type="button" onClick={() => { if (deleteTarget !== null) setDeletedIds((ids) => [...ids, deleteTarget]); setModal(null); announce("Waste record deleted."); }}>Delete record</button></div></Modal>}
    </main>
  );
}

function Dashboard({ used, limit, onScan, onHistory, onImpact, onAnalysis }: { used: number; limit: number; onScan: () => void; onHistory: () => void; onImpact: () => void; onAnalysis: () => void }) {
  return <>
    <section className="welcome-row"><div><p className="eyebrow visible"><Sparkles size={14} /> Weekly overview</p><h1>Good morning, Emma.</h1><p>Here’s your sorting overview for this week.</p></div><button className="primary-cta" type="button" onClick={onScan}><Camera size={20} /> Scan an item</button></section>
    <section className="metrics-grid">
      <article className="card progress-card"><div className="card-title"><span>Weekly progress</span><Gauge size={18} /></div><p className="progress-number"><strong>{used}</strong> of {limit}</p><p>scans used</p><div className="progress-track"><span style={{ width: `${(used / limit) * 100}%` }} /></div><p className="reset-copy"><Clock3 size={14} /> Resets Monday</p></article>
      <article className="card chart-card"><div className="card-title"><span>Daily waste scans</span><span className="demo-pill">Demo AI</span></div><div className="bar-chart" aria-label="Scans by weekday">{chartBars.map((height, index) => <div className="bar-column" key={index}><span className="bar-value">{height}</span><i style={{ height: `${height * 15}px` }} /><small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</small></div>)}</div></article>
      <article className="card category-card"><div className="card-title"><span>By category</span><Package size={18} /></div><MetricDonut /><ul><li><i className="dot plastic" />Plastic <span>46%</span></li><li><i className="dot paper" />Paper <span>24%</span></li><li><i className="dot metal" />Metal <span>12%</span></li><li><i className="dot glass" />Glass <span>10%</span></li><li><i className="dot other" />Other <span>8%</span></li></ul></article>
    </section>
    <section className="lower-grid">
      <article className="card recent-card"><div className="card-title"><h2>Recent scans</h2><button type="button" onClick={onHistory}>View all</button></div><div className="scan-list">{scanRows.slice(0,4).map(scan => <button type="button" className="scan-row" key={scan.id} onClick={onAnalysis}><span className="scan-thumb">{scan.emoji}</span><strong>{scan.name}</strong><span>{scan.material}</span><i>✓</i><small>{scan.time}</small><ChevronRight size={16} /></button>)}</div></article>
      <article className="tip-card"><div className="tip-heading"><Leaf size={29} strokeWidth={1.4} /><h2>Sustainability tip</h2></div><p>Rinse containers lightly to remove residues. It improves recycling quality and reduces emissions.</p><button type="button" onClick={onImpact}>See more tips <ChevronRight size={14} /></button><div className="bottle-art" aria-hidden="true"><Milk size={96} strokeWidth={1} /></div></article>
    </section>
  </>;
}

function ScanPage({ preview, fileName, error, used, limit, processing, processStep, fileRef, galleryRef, chooseFile, beginProcessing, resetScan }: { preview: string | null; fileName: string; error: string; used: number; limit: number; processing: boolean; processStep: number; fileRef: RefObject<HTMLInputElement | null>; galleryRef: RefObject<HTMLInputElement | null>; chooseFile: (event: ChangeEvent<HTMLInputElement>) => void; beginProcessing: () => void; resetScan: () => void }) {
  if (processing) return <section className="process-page"><div className="process-visual"><CupVisual preview={preview} compact /><span className="scan-beam" /></div><span className="demo-pill">Demo AI</span><h1>Looking closely at your item…</h1><p>We remove image metadata before identification.</p><ol className="process-steps">{["Uploading", "Identifying", "Preparing result"].map((step,index) => <li className={index < processStep ? "done" : index === processStep ? "current" : ""} key={step}><span>{index < processStep ? <Check size={15} /> : index + 1}</span><strong>{step}</strong></li>)}</ol></section>;
  return <section className="narrow-page scan-page"><div className="page-heading"><p className="eyebrow visible"><ScanLine size={14} /> Module 01</p><h1>Scan & Sort</h1><p>Take a clear photo and we’ll identify the item before applying versioned German disposal guidance.</p></div><div className="country-select"><span>Country</span><button type="button"><span className="flag-de">🇩🇪</span><strong>Germany</strong><small>Only available country</small><ChevronDown size={17} /></button></div><div className="info-banner"><Info size={19} /><p>Sorting rules can vary by municipality. Re-Sort currently uses Germany-wide guidance and will show a local-check warning where needed.</p></div><div className="tip-banner"><Leaf size={21} /><p>{PHOTO_TIP}</p></div>
    {!preview ? <div className="upload-zone"><div className="camera-orbit"><Camera size={33} strokeWidth={1.6} /></div><h2>Show us what you’re sorting</h2><p>Keep one item centered and make labels visible.</p><div className="upload-actions"><label className="primary-button"><Camera size={18} />Take a photo<input ref={fileRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={chooseFile} /></label><label className="secondary-button"><FileImage size={18} />Choose from photos<input ref={galleryRef} className="sr-only" type="file" accept="image/*" onChange={chooseFile} /></label></div><button className="demo-photo-button" type="button" onClick={() => { setTimeout(() => {}, 0); galleryRef.current?.click(); }}>JPEG, PNG or WebP · up to 10 MiB</button></div>
    : <div className="preview-card"><div className="preview-image-wrap"><CupVisual preview={preview} /><span>Photo preview</span></div><div className="preview-details"><span className="demo-pill">Ready to scan</span><h2>{fileName || "Selected item"}</h2><p>Your image will only upload after you choose “Use this photo”.</p><div className="upload-actions"><button className="primary-button" type="button" onClick={beginProcessing} disabled={used >= limit}><Upload size={18} />Use this photo</button><button className="secondary-button" type="button" onClick={resetScan}>Choose another</button></div></div></div>}
    {error && <p className="field-error" role="alert"><AlertCircle size={16} />{error}</p>}<div className="quota-card"><div><strong>{used} of {limit} scans used this week</strong><span>Resets Monday</span></div><div className="progress-track"><span style={{width:`${(used/limit)*100}%`}} /></div></div><p className="privacy-copy"><ShieldCheck size={15} /> Images are processed to identify waste. Metadata is removed before analysis.</p>
  </section>;
}

function ReviewPage({ preview, onBack, onAccept, onReject }: { preview: string | null; onBack: () => void; onAccept: () => void; onReject: () => void }) {
  return <section className="review-page"><button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} />Take another photo</button><div className="review-layout"><div className="review-visual"><CupVisual preview={preview} /><span className="demo-pill">Demo AI</span></div><div className="review-copy"><p className="eyebrow visible">We identified this as</p><h1>Yogurt cup</h1><div className="confidence high"><CheckCircle2 size={17} />High confidence · 84%</div><div className="material-chips"><span>Plastic</span><span>PP 5</span><span>Packaging</span></div><div className="evidence-block"><h2>What we can see</h2><ul><li><Check size={16} />A lightweight food container</li><li><Check size={16} />Primary material appears to be polypropylene</li><li><Check size={16} />No deposit or hazard symbol detected</li></ul></div><h2 className="correct-title">Is this correct?</h2><div className="decision-actions"><button className="accept-button" type="button" onClick={onAccept}><Check size={19} />Yes, this is correct</button><button className="text-button" type="button" onClick={onReject}>No, report an issue</button></div><p className="ai-note"><Info size={14} />AI identifies the item and materials. A deterministic rule engine chooses the disposal route.</p></div></div></section>;
}

function AnalysisPage({ preview, weight, carbonGrams, editing, setWeight, setEditing, saveWeight, onScan, onDashboard }: { preview: string | null; weight: number; carbonGrams: string; editing: boolean; setWeight: (value:number)=>void; setEditing: (value:boolean)=>void; saveWeight: (event:FormEvent<HTMLFormElement>)=>void; onScan:()=>void; onDashboard:()=>void }) {
  return <section className="analysis-page"><div className="analysis-hero"><div className="analysis-image"><CupVisual preview={preview} compact /></div><div><p className="eyebrow visible"><CheckCircle2 size={14} />High confidence · Germany</p><h1>Yogurt cup</h1><div className="material-chips"><span>Plastic</span><span>PP 5</span><span>Lightweight packaging</span></div></div><span className="demo-pill">Demo AI</span></div><div className="analysis-grid"><article className="analysis-card route-card"><p className="section-kicker">Where it goes</p><div className="route-heading"><span className="bin-icon"><Trash2 size={31} /></span><div><h2>Yellow bin or sack</h2><p>For lightweight packaging</p></div></div><div className="warning-box"><AlertCircle size={17} /><p>{LOCAL_WARNING}</p></div></article><article className="analysis-card"><p className="section-kicker">Before you dispose of it</p><ol className="prep-list"><li><span>1</span><p><strong>Empty contents</strong><small>“Restentleert” is enough.</small></p><CheckCircle2 size={18} /></li><li><span>2</span><p><strong>No need to wash</strong><small>A light rinse is optional.</small></p><CheckCircle2 size={18} /></li><li><span>3</span><p><strong>Separate easy components</strong><small>Remove a foil lid if possible.</small></p><CheckCircle2 size={18} /></li><li><span>4</span><p><strong>Do not nest packages</strong><small>Keep different materials loose.</small></p><CheckCircle2 size={18} /></li></ol></article><article className="analysis-card reuse-card"><p className="section-kicker">Can it be reused or recycled?</p><div><Recycle size={28} /><p><strong>Better choice next time</strong><br />Choose refill or reusable containers where practical. This PP cup is recyclable where local lightweight-packaging collection accepts it.</p></div></article><article className="analysis-card impact-card"><p className="section-kicker">Environmental impact</p><p>Separating lightweight packaging helps keep recoverable plastic out of residual waste. Clean material streams can improve sorting quality, while reducing packaging at the source usually has the greatest benefit.</p></article><article className="analysis-card footprint-card"><div className="card-title"><p className="section-kicker">Estimated disposal footprint</p><Cloud size={20} /></div><div className="footprint-metrics"><div><Cloud size={22} /><strong>{carbonGrams} g</strong><span>CO₂e</span></div><div><Droplets size={22} /><strong>3.2 L</strong><span>Water context</span></div><div><Leaf size={22} /><strong>{weight} g</strong><span>Waste weight</span></div></div>{editing ? <form className="weight-form" onSubmit={saveWeight}><label>Item weight<input type="number" min={1} max={100000} value={weight} onChange={(event)=>setWeight(Number(event.target.value))} />g</label><button className="small-button" type="submit">Save</button></form> : <button className="edit-weight" type="button" onClick={()=>setEditing(true)}><Pencil size={14} />Edit estimated weight</button>}<p className="fine-print">Weight is estimated from the image. Edit it for a better footprint estimate.</p><p className="disclosure">{CARBON_NOTE}</p><div className="source-chip">DESNZ-2026-WASTE-PROXY-v1 · recycling delivery proxy</div></article><article className="analysis-card sources-card"><p className="section-kicker">Why this recommendation?</p><a href="https://www.gesetze-im-internet.de/verpackdg/__38.html" target="_blank" rel="noreferrer">German Packaging Law §38 <ExternalLink size={14} /></a><a href="https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt" target="_blank" rel="noreferrer">German Environment Agency guidance <ExternalLink size={14} /></a><p>Rule-set DE-FEDERAL-2026.08 · effective 12 Aug 2026</p></article></div><footer className="analysis-footer"><p>Re-Sort provides informational guidance, not legal advice. Follow labels and local authority instructions.</p><div><button className="secondary-button" type="button" onClick={onDashboard}>View dashboard</button><button className="primary-button" type="button" onClick={onScan}><Camera size={17} />Scan another item</button></div></footer></section>;
}

function HistoryPage({ rows, filter, setFilter, onOpen, onDelete }: { rows: typeof scanRows; filter:string; setFilter:(value:string)=>void; onOpen:()=>void; onDelete:(id:number)=>void }) {
  const filters = ["All", "Lightweight packaging", "Glass packaging", "Paper & cardboard", "Organic", "Battery"];
  return <section className="wide-page"><div className="page-heading row-heading"><div><p className="eyebrow visible"><History size={14} />Accepted records only</p><h1>Sorting history</h1><p>Review your accepted items, disposal routes and estimates.</p></div><button className="secondary-button" type="button"><CalendarDays size={17} />Last 30 days</button></div><div className="history-tools"><div className="search-field"><Search size={17} /><input aria-label="Search history" placeholder="Search scanned items" /></div><div className="filter-row" aria-label="Filter by category">{filters.map(item=><button className={filter===item?"active":""} type="button" key={item} onClick={()=>setFilter(item)}>{item}</button>)}</div></div><div className="history-summary"><span><strong>{rows.length}</strong> accepted items</span><span><strong>783 g</strong> estimated weight</span><span><strong>3.13 g</strong> disposal CO₂e</span></div><div className="history-list">{rows.length ? rows.map(row=><article className="history-row" key={row.id}><button className="history-main" type="button" onClick={onOpen}><span className="history-emoji">{row.emoji}</span><span><strong>{row.name}</strong><small>{row.material}</small></span><span className="route-label">{row.route}</span><span><strong>{row.weight}</strong><small>{row.carbon} CO₂e</small></span><time>{row.time}</time><ChevronRight size={17} /></button><button className="history-delete" type="button" aria-label={`Delete ${row.name}`} onClick={()=>onDelete(row.id)}><Trash2 size={16} /></button></article>) : <div className="empty-state"><Recycle size={35} /><h2>No records in this category</h2><p>Try another filter to see your accepted scans.</p></div>}</div></section>;
}

function ImpactPage({ onScan }: { onScan:()=>void }) {
  return <section className="wide-page impact-page"><div className="page-heading row-heading"><div><p className="eyebrow visible"><Leaf size={14} />7-day insights</p><h1>Your sorting impact</h1><p>Useful patterns from accepted records, without overstating the numbers.</p></div><button className="primary-button" type="button" onClick={onScan}><Camera size={17} />Scan an item</button></div><div className="impact-summary-grid"><article><span><Recycle size={24} /></span><strong>6 of 7</strong><p>items directed to material recovery or special collection</p></article><article><span><Package size={24} /></span><strong>3</strong><p>lightweight packages this week</p></article><article><span><BatteryCharging size={24} /></span><strong>1</strong><p>battery kept out of household bins</p></article></div><div className="impact-layout"><article className="card category-insight"><div className="card-title"><h2>Category pattern</h2><span className="demo-pill">Accepted only</span></div><div className="large-donut"><MetricDonut /></div><ul><li><span className="dot plastic" />Lightweight packaging<strong>43%</strong></li><li><span className="dot paper" />Paper & cardboard<strong>14%</strong></li><li><span className="dot glass" />Glass packaging<strong>14%</strong></li><li><span className="dot organic" />Organic<strong>14%</strong></li><li><span className="dot other" />Battery<strong>14%</strong></li></ul></article><article className="suggestions-panel"><p className="section-kicker">Suggestions for this week</p><div className="suggestion"><span>01</span><div><h3>Refill before replacing</h3><p>You sorted several lightweight packages. Try one refill or reusable-packaging swap on your next shop.</p></div></div><div className="suggestion"><span>02</span><div><h3>Return batteries together</h3><p>Keep used batteries in a dry container and take them to a retailer or municipal collection point.</p></div></div><div className="suggestion"><span>03</span><div><h3>Keep paper clean and dry</h3><p>Separating food residue helps preserve paper quality for recycling.</p></div></div></article></div><div className="legal-note"><Info size={17} /><p>These suggestions are deterministic and based on your accepted record categories. They are not a product life-cycle assessment.</p></div></section>;
}

function SubscriptionPage({ plan, used, limit, onUpgrade, onFree, onBin }: { plan:Plan; used:number; limit:number; onUpgrade:()=>void; onFree:()=>void; onBin:()=>void }) {
  return <section className="pricing-page"><div className="page-heading centered"><p className="eyebrow visible"><WalletCards size={14} />Plans & quota</p><h1>A plan for every sorting habit.</h1><p>Upgrade the weekly scan allowance while keeping every result honest and explainable.</p></div><div className="plan-status"><div><span>Current plan</span><strong>{plan === "PLUS" ? "Plus" : "Free"}</strong></div><div className="quota-inline"><span>{used} of {limit} scans used · resets Monday</span><div className="progress-track"><i style={{width:`${(used/limit)*100}%`}} /></div></div></div><div className="pricing-grid"><article className={plan==="FREE"?"pricing-card current":"pricing-card"}><Leaf size={27} /><h2>Free</h2><p className="price">€0 <small>/ month</small></p><ul><li><Check size={15} />10 images per week</li><li><Check size={15} />Target AI accuracy ~80%</li><li><Check size={15} />Personal dashboard</li></ul>{plan==="FREE"?<span className="current-badge">Current plan</span>:<button className="secondary-button full" type="button" onClick={onFree}>Switch to Free now</button>}</article><article className={plan==="PLUS"?"pricing-card featured current":"pricing-card featured"}><div className="popular-tag">MOST POPULAR</div><Sparkles size={27} /><h2>Plus</h2><p className="price orange">€9.99 <small>/ month</small></p><ul><li><Check size={15} />100 images per week</li><li><Check size={15} />Target AI accuracy ~90%</li><li><Check size={15} />Enhanced image detail</li><li><Check size={15} />Verification for uncertain scans</li><li><Check size={15} />Dashboard and history</li></ul>{plan==="PLUS"?<span className="current-badge">Current plan</span>:<button className="primary-button full" type="button" onClick={onUpgrade}>Upgrade to Plus</button>}</article><article className="pricing-card disabled"><UsersRound size={27} /><h2>Household <span>Coming soon</span></h2><p className="price">€17.99 <small>/ month</small></p><ul><li><Check size={15} />250 images per week</li><li><Check size={15} />Target AI accuracy &gt;90%</li><li><Check size={15} />Up to 4 accounts</li><li><Check size={15} />Optional child accounts</li></ul><button className="secondary-button full" disabled type="button">Not available yet</button></article></div><p className="accuracy-note">* {ACCURACY_NOTE}</p><button className="bin-connect" type="button" onClick={onBin}><Recycle size={21} /><span><strong>Connect with your Re-Sort Bin</strong><small>Smart hardware connectivity is coming soon</small></span><ChevronRight size={18} /></button></section>;
}

function SettingsPage({ plan, onLogout }: { plan:Plan; onLogout:()=>void }) {
  return <section className="narrow-page settings-page"><div className="page-heading"><p className="eyebrow visible"><Settings size={14} />Account</p><h1>Settings</h1><p>Manage your local demo preferences and session.</p></div><article className="settings-card profile-card"><span className="large-avatar">EM</span><div><h2>Emma Müller</h2><p>@demo · {plan === "PLUS" ? "Plus plan" : "Free plan"}</p></div></article><article className="settings-card"><h2>Sorting region</h2><div className="setting-field"><span>Country</span><button type="button"><span>🇩🇪 Germany</span><small>Enabled</small></button></div><div className="setting-field"><span>Timezone</span><button type="button"><span>Europe/Berlin</span><ChevronDown size={16} /></button></div><p>{LOCAL_WARNING}</p></article><article className="settings-card"><h2>Privacy & data</h2><div className="setting-line"><span><ShieldCheck size={19} /><span><strong>Image privacy</strong><small>Metadata removed before analysis</small></span></span><button type="button">Learn more</button></div><div className="setting-line"><span><Clock3 size={19} /><span><strong>Image retention</strong><small>30 days in the product plan</small></span></span><button type="button">Details</button></div></article><button className="logout-button" type="button" onClick={onLogout}><LogOut size={17} />Log out of demo</button></section>;
}
