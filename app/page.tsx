"use client";
// HNR Title Suite — Huston Energy Corporation
// Deployed on Vercel, backed by Supabase
// All window.storage calls replaced with real Supabase reads/writes via lib/supabase.ts

import { useState, useEffect, useCallback } from "react";
import {
  getProjects, insertProject, updateProject,
  getDocLog, insertDocLog,
  kvGet, kvSet,
} from "../lib/supabase";

const STAGES = ["New","Doc retrieval","ICR / name res.","GIS mapping","Ready to lease"];
const COUNTIES = ["Major","Ellis","Woodward","Dewey","Garfield","Canadian","Blaine","Grady",
  "Stephens","Logan","Carter","Kingfisher","Alfalfa","Beaver","Beckham","Custer",
  "Grant","Harper","Woods"];
const TEAM = ["B. Sumner","K. Alvarez","T. Nguyen","M. Caldwell","Brooks Huston"];
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EDGE = (fn: string) => `${SUPABASE_URL}/functions/v1/${fn}`;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt$(n: number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0); }

const TABS = [
  ["pipeline","📋 Pipeline"],
  ["offers","💰 Offers"],
  ["calc","🧮 Interest calc"],
  ["status","📬 Letter status"],
  ["runsheet","📜 Runsheet"],
  ["skiptrace","🕵️ Skip trace"],
  ["templates","📂 Templates"],
  ["ecf","🚨 ECF alerts"],
  ["radar","📡 Drilling radar"],
  ["heirs","🔍 Heir research"],
  ["cases","📁 Cases"],
  ["documents","📄 Doc log"],
  ["records","🏛 County records"],
  ["legal","⚖️ Legal"],
];

// Shared styles
const s: Record<string, any> = {
  wrap: {display:"flex",minHeight:"100vh",fontSize:13,fontFamily:"system-ui,sans-serif"},
  sb: {width:170,flexShrink:0,borderRight:"1px solid #e2e8f0",padding:"16px 8px",display:"flex",flexDirection:"column",gap:1,background:"#f8fafc"},
  nb: (a: boolean) => ({display:"flex",alignItems:"center",gap:6,width:"100%",background:a?"#e2e8f0":"transparent",border:"none",borderRadius:6,padding:"6px 8px",fontSize:12,color:a?"#0f172a":"#64748b",cursor:"pointer",textAlign:"left" as const,fontWeight:a?500:400}),
  main: {flex:1,padding:"20px 24px",minWidth:0,overflowY:"auto" as const},
  hdr: {display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  h1: {fontWeight:500,fontSize:16,margin:0},
  sub: {fontSize:12,color:"#64748b",margin:"0 0 12px"},
  btn: (c="#3b82f6") => ({border:`1px solid ${c}`,background:"transparent",borderRadius:6,padding:"5px 10px",fontSize:12,color:c,cursor:"pointer"}),
  card: (hi: boolean) => ({border:hi?"1px solid #3b82f6":"1px solid #e2e8f0",borderLeft:hi?"3px solid #3b82f6":undefined,borderRadius:8,padding:"10px 12px",marginBottom:8,background:"#fff"}),
  badge: (c: string) => {
    const m: Record<string,{bg:string,t:string}> = {
      info:{bg:"#eff6ff",t:"#3b82f6"},green:{bg:"#f0fdf4",t:"#16a34a"},
      amber:{bg:"#fffbeb",t:"#d97706"},gray:{bg:"#f8fafc",t:"#64748b"},
      red:{bg:"#fef2f2",t:"#dc2626"},purple:{bg:"#faf5ff",t:"#7c3aed"}
    };
    const mx = m[c]||m.gray;
    return {fontSize:10,padding:"2px 7px",borderRadius:20,background:mx.bg,color:mx.t,display:"inline-block"};
  },
  inp: {border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 9px",fontSize:12,width:"100%",boxSizing:"border-box" as const},
  sel: {border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 9px",fontSize:12,width:"100%",boxSizing:"border-box" as const},
  g2: {display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8},
  g3: {display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8},
  g4: {display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8},
  lbl: {fontSize:11,color:"#64748b",display:"block",marginBottom:2},
  kanban: {display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},
  kcol: {background:"#f8fafc",borderRadius:8,padding:8,minHeight:160},
  kct: {fontSize:10,fontWeight:500,color:"#64748b",margin:"2px 4px 6px"},
  toast: {position:"fixed" as const,bottom:16,right:16,background:"#1e293b",color:"#fff",borderRadius:8,padding:"8px 16px",fontSize:12,zIndex:999,maxWidth:300},
  warn: {fontSize:12,background:"#fffbeb",color:"#92400e",borderRadius:6,padding:"7px 10px",marginBottom:8},
  info: {fontSize:12,background:"#eff6ff",color:"#1d4ed8",borderRadius:6,padding:"7px 10px",marginBottom:8},
  success: {fontSize:12,background:"#f0fdf4",color:"#15803d",borderRadius:6,padding:"7px 10px",marginBottom:8},
  tbl: {width:"100%",borderCollapse:"collapse" as const,fontSize:12},
  th: {padding:"6px 8px",textAlign:"left" as const,color:"#64748b",fontWeight:500,borderBottom:"1px solid #e2e8f0",fontSize:11},
  td: {padding:"6px 8px",borderBottom:"0.5px solid #f1f5f9"},
};

export default function App() {
  const [tab, setTab] = useState("pipeline");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  // Pipeline — real Supabase
  const [projects, setProjects] = useState<any[]>([]);
  const [docLog, setDocLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNp, setShowNp] = useState(false);
  const [np, setNp] = useState({tract:"",county:"Major",acres:"",source:"",notes:""});

  // KV-backed state (offers, letters, cases, templates, runsheets, skip, ECF)
  const [offers, setOffers] = useState<any[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [runsheets, setRunsheets] = useState<any[]>([]);
  const [skipSubjects, setSkipSubjects] = useState<any[]>([]);
  const [ecfAlerts, setEcfAlerts] = useState<any[]>([]);
  const [templateFolders, setTemplateFolders] = useState<any[]>([]);
  const [heirSaved, setHeirSaved] = useState<any[]>([]);
  const [treeVerified, setTreeVerified] = useState<Record<string,boolean>>({});

  // UI state
  const [showOffer, setShowOffer] = useState(false);
  const [newOffer, setNewOffer] = useState({ownerName:"",tract:"",county:"Major",nma:"",offerPerAcre:"",totalOffer:"",dateSent:"",response:"Pending",competitorActivity:"",notes:"",assignee:"B. Sumner"});
  const [showLetter, setShowLetter] = useState(false);
  const [newLetter, setNewLetter] = useState({ownerName:"",tract:"",county:"Major",docType:"Oil & gas lease",dateSent:"",status:"Sent",followUpDate:"",notes:"",assignee:"B. Sumner"});
  const [calc, setCalc] = useState({sourceOwner:"",sourceAcres:"",county:"Major",legal:"",pricePerAcre:"",heirs:[{name:"",relationship:"",address:""}]});
  const [calcResult, setCalcResult] = useState<any>(null);
  const [activeCase, setActiveCase] = useState<any>(null);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCase, setNewCase] = useState({title:"",type:"Probate",county:"",description:"",assignee:"B. Sumner"});
  const [newTask, setNewTask] = useState({title:"",assignee:"B. Sumner",due:"",priority:"Normal"});
  const [showNewTask, setShowNewTask] = useState(false);
  const [aiDraft, setAiDraft] = useState<string|null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiTaskTarget, setAiTaskTarget] = useState<any>(null);
  const [aiChat, setAiChat] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<string|null>(null);
  const [activeRunsheet, setActiveRunsheet] = useState<any>(null);
  const [showNewRS, setShowNewRS] = useState(false);
  const [newRS, setNewRS] = useState({title:"",county:"Major",legal:"",fromYear:"",toYear:new Date().getFullYear().toString()});
  const [newInst, setNewInst] = useState({date:"",grantor:"",grantee:"",type:"Mineral Deed",bookPage:"",legalDesc:"",notes:""});
  const [showNewInst, setShowNewInst] = useState(false);
  const [skipLoading, setSkipLoading] = useState<string|null>(null);
  const [showNewSkip, setShowNewSkip] = useState(false);
  const [newSkip, setNewSkip] = useState({name:"",lastKnownAddress:"",dob:"",source:""});
  const [activeFolder, setActiveFolder] = useState<any>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolder, setNewFolder] = useState({name:"",state:"Oklahoma",description:""});
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({name:"",type:"Oil & Gas Lease",description:"",body:"",tags:""});
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [heirForm, setHeirForm] = useState({name:"",county:"",state:"Oklahoma",dob:"",dod:"",minerals:"",notes:""});
  const [heirLoading, setHeirLoading] = useState(false);
  const [heirReport, setHeirReport] = useState<any>(null);
  const [occ, setOcc] = useState<any[]>([]);
  const [occLoading, setOccLoading] = useState(false);
  const [occCounty, setOccCounty] = useState("");
  const [recSearch, setRecSearch] = useState({county:"Major",type:"Any",legal:"",name:""});
  const [recResults, setRecResults] = useState<any>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recErr, setRecErr] = useState("");
  const [ecfFilter, setEcfFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, d, o, l, c, rs, ss, ec, tf, hr, tv] = await Promise.all([
        getProjects(), getDocLog(),
        kvGet("offers"), kvGet("letters"), kvGet("cases"),
        kvGet("runsheets"), kvGet("skipsubjects"), kvGet("ecfalerts"),
        kvGet("templatefolders"), kvGet("heirreports"), kvGet("treeVerified"),
      ]);
      setProjects(p);
      setDocLog(d);
      setOffers(o || []);
      setLetters(l || []);
      setCases(c || []);
      setRunsheets(rs || []);
      setSkipSubjects(ss || []);
      setEcfAlerts(ec || defaultEcfAlerts());
      setTemplateFolders(tf || defaultTemplateFolders());
      setHeirSaved(hr || []);
      setTreeVerified(tv || {});
    } catch(e: any) { setError("Load error: " + e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // KV save helpers
  const saveKv = async (key: string, val: any, setter: (v: any) => void) => {
    setter(val);
    await kvSet(key, val);
  };

  // Pipeline
  const addProject = async () => {
    if (!np.tract.trim()) return;
    try {
      await insertProject({...np, stage:"New", verified:false, acres: np.acres ? parseFloat(np.acres) : null});
      setNp({tract:"",county:"Major",acres:"",source:"",notes:""});
      setShowNp(false);
      await load();
      flash("✓ Project saved to Supabase.");
    } catch(e: any) { setError(e.message); }
  };
  const moveStage = async (p: any, dir: number) => {
    const i = STAGES.indexOf(p.stage);
    const next = STAGES[i + dir];
    if (!next) return;
    try { await updateProject(p.id, {stage:next}); await load(); flash(`Moved to "${next}"`); }
    catch(e: any) { setError(e.message); }
  };
  const toggleVerifyP = async (p: any) => {
    try { await updateProject(p.id, {verified:!p.verified}); await load(); flash(p.verified ? "Unverified." : "✓ Verified."); }
    catch(e: any) { setError(e.message); }
  };
  const logDoc = async (p: any, dt: string) => {
    try {
      await insertDocLog({project_id:p.id, tract:p.tract, doc_type:dt, generated_by:"B. Sumner"});
      await load(); flash("✓ Logged.");
    } catch(e: any) { setError(e.message); }
  };
  const byStage = (stage: string) => projects.filter(p => p.stage === stage);

  // Offers
  const addOffer = async () => {
    if (!newOffer.ownerName.trim()) return;
    const nma = parseFloat(newOffer.nma) || 0;
    const ppa = parseFloat(newOffer.offerPerAcre) || 0;
    const total = nma && ppa ? (nma * ppa).toFixed(2) : newOffer.totalOffer;
    const o = {id:uid(), created_at:new Date().toISOString(), ...newOffer, totalOffer:total};
    const updated = [o, ...offers];
    await saveKv("offers", updated, setOffers);
    setNewOffer({ownerName:"",tract:"",county:"Major",nma:"",offerPerAcre:"",totalOffer:"",dateSent:"",response:"Pending",competitorActivity:"",notes:"",assignee:"B. Sumner"});
    setShowOffer(false); flash("✓ Offer logged.");
  };
  const updateOfferResponse = async (id: string, response: string) => {
    await saveKv("offers", offers.map(o => o.id===id ? {...o,response} : o), setOffers);
  };

  // Letters
  const addLetter = async () => {
    if (!newLetter.ownerName.trim()) return;
    const l = {id:uid(), created_at:new Date().toISOString(), ...newLetter};
    await saveKv("letters", [l, ...letters], setLetters);
    setNewLetter({ownerName:"",tract:"",county:"Major",docType:"Oil & gas lease",dateSent:"",status:"Sent",followUpDate:"",notes:"",assignee:"B. Sumner"});
    setShowLetter(false); flash("✓ Letter tracked.");
  };
  const updateLetterStatus = async (id: string, status: string) => {
    await saveKv("letters", letters.map(l => l.id===id ? {...l,status} : l), setLetters);
  };

  // Interest calc
  const runCalc = () => {
    const src = parseFloat(calc.sourceAcres) || 0;
    const ppa = parseFloat(calc.pricePerAcre) || 0;
    const valid = calc.heirs.filter(h => h.name.trim());
    if (!src || !valid.length) { flash("Enter source acres and at least one heir."); return; }
    const nma = src / valid.length;
    setCalcResult({
      ...calc, sourceAcres:src, pricePerAcre:ppa,
      heirs: valid.map(h => ({...h, netAcres:nma.toFixed(4), totalOffer:(nma*ppa).toFixed(2)})),
      totalDisbursement: (src * ppa).toFixed(2),
      generatedAt: new Date().toISOString(),
    });
    flash("✓ Calculation complete.");
  };

  // Cases
  const addCase = async () => {
    if (!newCase.title.trim()) return;
    const c = {id:uid(), created_at:new Date().toISOString(), ...newCase, status:"Open", tasks:[]};
    const updated = [c, ...cases];
    await saveKv("cases", updated, setCases);
    setNewCase({title:"",type:"Probate",county:"",description:"",assignee:"B. Sumner"});
    setShowNewCase(false); setActiveCase(c); flash("✓ Case created.");
  };
  const addTask = async () => {
    if (!newTask.title.trim() || !activeCase) return;
    const task = {id:uid(), created_at:new Date().toISOString(), ...newTask, status:"Pending"};
    const updated = cases.map(c => c.id===activeCase.id ? {...c,tasks:[...c.tasks,task]} : c);
    await saveKv("cases", updated, setCases);
    setActiveCase(updated.find(c => c.id===activeCase.id));
    setNewTask({title:"",assignee:"B. Sumner",due:"",priority:"Normal"});
    setShowNewTask(false); flash("✓ Task added.");
  };
  const updateTask = async (taskId: string, patch: object) => {
    const updated = cases.map(c => c.id===activeCase.id
      ? {...c, tasks:c.tasks.map((t: any) => t.id===taskId ? {...t,...patch} : t)} : c);
    await saveKv("cases", updated, setCases);
    setActiveCase(updated.find((c: any) => c.id===activeCase.id));
  };
  const runAiDraft = async (task: any) => {
    setAiTaskTarget(task); setAiDraft(null); setAiDraftLoading(true);
    const ac = activeCase;
    const prompt = `You are an AI assistant for Huston Energy Corporation, Oklahoma oil and gas mineral acquisition. Complete this task for the following case.\n\nCASE: ${ac.title} | TYPE: ${ac.type} | COUNTY: ${ac.county}\nDESCRIPTION: ${ac.description}\nTASK: ${task.title}\n${uploadedDoc ? `UPLOADED DOC:\n${uploadedDoc.slice(0,1500)}` : ""}\n\nProduce a complete draft document, letter, or analysis. End with a REVIEW CHECKLIST of 3-5 specific things to verify before approving.`;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})
      });
      const data = await resp.json();
      setAiDraft((data.content||[]).filter((b:any)=>b.type==="text").map((b:any)=>b.text).join(""));
    } catch(e: any) { setAiDraft("Error: "+e.message); }
    setAiDraftLoading(false);
  };
  const approveAiDraft = async () => {
    if (!aiTaskTarget || !aiDraft) return;
    await updateTask(aiTaskTarget.id, {aiDraft, reviewed:true, status:"Complete", completedAt:new Date().toISOString()});
    setAiDraft(null); setAiTaskTarget(null); flash("✓ Task approved.");
  };
  const sendAiChat = async () => {
    if (!aiInput.trim()) return;
    const history = [...aiChat, {role:"user",content:aiInput}];
    setAiChat(history); setAiInput(""); setAiChatLoading(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,system:`AI assistant for Huston Energy Corporation Oklahoma mineral acquisition. Case: ${activeCase?.title||"none"}.`,tools:[{type:"web_search_20250305",name:"web_search"}],messages:history})
      });
      const data = await resp.json();
      const text = (data.content||[]).filter((b:any)=>b.type==="text").map((b:any)=>b.text).join("");
      setAiChat([...history, {role:"assistant",content:text}]);
    } catch(e: any) { setAiChat([...history,{role:"assistant",content:"Error: "+e.message}]); }
    setAiChatLoading(false);
  };

  // Runsheets
  const addRunsheet = async () => {
    if (!newRS.title.trim()) return;
    const rs = {id:uid(), created_at:new Date().toISOString(), ...newRS, instruments:[], status:"In progress"};
    const updated = [rs, ...runsheets];
    await saveKv("runsheets", updated, setRunsheets);
    setNewRS({title:"",county:"Major",legal:"",fromYear:"",toYear:new Date().getFullYear().toString()});
    setShowNewRS(false); setActiveRunsheet(rs); flash("✓ Runsheet created.");
  };
  const addInstrument = async () => {
    if (!newInst.grantor.trim() || !activeRunsheet) return;
    const inst = {id:uid(), ...newInst};
    const updated = runsheets.map(r => r.id===activeRunsheet.id
      ? {...r, instruments:[...r.instruments,inst].sort((a:any,b:any)=>a.date>b.date?1:-1)} : r);
    await saveKv("runsheets", updated, setRunsheets);
    setActiveRunsheet(updated.find(r => r.id===activeRunsheet.id));
    setNewInst({date:"",grantor:"",grantee:"",type:"Mineral Deed",bookPage:"",legalDesc:"",notes:""});
    setShowNewInst(false); flash("✓ Instrument added.");
  };
  const deleteInstrument = async (instId: string) => {
    const updated = runsheets.map(r => r.id===activeRunsheet.id
      ? {...r, instruments:r.instruments.filter((i:any)=>i.id!==instId)} : r);
    await saveKv("runsheets", updated, setRunsheets);
    setActiveRunsheet(updated.find(r => r.id===activeRunsheet.id));
  };

  // Skip trace
  const addSkipSubject = async () => {
    if (!newSkip.name.trim()) return;
    const subj = {id:uid(), created_at:new Date().toISOString(), ...newSkip, status:"Pending", result:null};
    await saveKv("skipsubjects", [subj, ...skipSubjects], setSkipSubjects);
    setNewSkip({name:"",lastKnownAddress:"",dob:"",source:""}); setShowNewSkip(false); flash("✓ Added.");
  };
  const runSkipTrace = async (subj: any) => {
    setSkipLoading(subj.id);
    try {
      const r = await fetch(EDGE("skip-trace"), {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPABASE_ANON}`},
        body:JSON.stringify({name:subj.name, lastKnownAddress:subj.lastKnownAddress, dob:subj.dob})
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      const updated = skipSubjects.map(s => s.id===subj.id ? {...s,status:"Complete",result:data} : s);
      await saveKv("skipsubjects", updated, setSkipSubjects);
      flash("✓ Skip trace complete.");
    } catch(e: any) { flash("TLO edge function not yet deployed: "+e.message); }
    setSkipLoading(null);
  };

  // Templates
  function defaultTemplateFolders() {
    return [
      {id:uid(),created_at:new Date().toISOString(),name:"Oklahoma Templates",state:"Oklahoma",description:"Standard Oklahoma oil and gas lease, mineral deed, and outreach templates",color:"#16a34a",templates:[
        {id:uid(),name:"OGL — Record Owner",type:"Oil & Gas Lease",description:"Standard paid-up OGL for Oklahoma record owners",tags:"OGL,lease,record owner",body:"HUSTON ENERGY CORPORATION\nP. O. Box 5318\nEnid, OK 73702\n\n[DATE]\n\n[OWNER NAME]\n[OWNER ADDRESS]\n\nRe: Oil and Gas Lease\n    Section [SECTION]-[TOWNSHIP]-[RANGE]\n    [COUNTY] County, Oklahoma\n\nDear [SALUTATION] [LAST NAME]:\n\nHuston Energy Corporation is acquiring oil and gas leases in the section of land referenced above.\n\nThrough our research of the [COUNTY] County land records, it has been determined that you own [NET ACRES] net mineral acres. We are interested in purchasing an oil and gas lease covering your mineral interest. The terms of the lease are for [TERM] years, $[BONUS] per net mineral acre with a [ROYALTY] royalty.\n\nBest Regards,\nHUSTON ENERGY CORPORATION\n\nBrooks Huston"},
        {id:uid(),name:"Mineral Deed — Heir Letter",type:"Mineral Deed",description:"Cover letter for heir mineral deed acquisition",tags:"mineral deed,heir,other owner",body:"HUSTON ENERGY CORPORATION\nP. O. Box 5318\nEnid, OK 73702\n\n[DATE]\n\n[SALUTATION] [OWNER NAME]\n[OWNER ADDRESS]\n\nRe: Mineral Deed — Section [SECTION]-[TOWNSHIP]-[RANGE]\n    [COUNTY] County, Oklahoma\n\nDear [SALUTATION] [LAST NAME]:\n\nHuston Energy Corporation is in the process of acquiring royalty and mineral interests for the tract referenced above. Your [RELATIONSHIP], [SOURCE OWNER], held an undivided [SOURCE ACRES]-acre mineral interest in this property.\n\nOur research indicates that you have inherited [NET ACRES] mineral acres. We are offering $[PRICE PER ACRE] per mineral acre.\n\nBest regards,\nHUSTON ENERGY CORPORATION\n\nBrooks Huston"},
        {id:uid(),name:"County Clerk Recording Letter",type:"County Clerk Recording Letter",description:"Standard recording cover letter for Oklahoma county clerks",tags:"county clerk,recording",body:"HUSTON ENERGY CORPORATION\n\n[DATE]\n\n[COUNTY] County Clerk\n[CLERK ADDRESS]\n\nRE: Recording: [DOCUMENT TYPE] — [GRANTOR NAME]\n\nDear Clerk:\n\nEnclosed, please find a check in the amount of $[RECORDING FEE] to cover the cost of recording the enclosed above referenced document(s). Also enclosed is a self-addressed stamped envelope for your convenience in returning recorded document(s).\n\nThanks for your cooperation.\n\nSincerely yours,\n\nHUSTON ENERGY CORPORATION\n\nCindy Eilrich\nCME/ce\nencl\n\nP. O. Box 5318 • Enid, OK 73702 • (580) 233-6030 • Email: hec@hustonenergy.com"},
      ]},
      {id:uid(),created_at:new Date().toISOString(),name:"North Dakota Templates",state:"North Dakota",description:"Templates for North Dakota mineral acquisitions",color:"#3b82f6",templates:[
        {id:uid(),name:"OGL — North Dakota Record Owner",type:"Oil & Gas Lease",description:"Standard OGL for North Dakota record owners",tags:"OGL,North Dakota,ND",body:"HUSTON ENERGY CORPORATION\nP. O. Box 5318\nEnid, OK 73702\n\n[DATE]\n\n[OWNER NAME]\n[OWNER ADDRESS]\n\nRe: Oil and Gas Lease\n    Section [SECTION]-[TOWNSHIP]-[RANGE]\n    [COUNTY] County, North Dakota\n\nDear [SALUTATION] [LAST NAME]:\n\nHuston Energy Corporation is acquiring oil and gas leases in the section of land referenced above.\n\nBest Regards,\nHUSTON ENERGY CORPORATION\n\nBrooks Huston"},
      ]},
      {id:uid(),created_at:new Date().toISOString(),name:"Texas Templates",state:"Texas",description:"Templates for Texas mineral acquisitions",color:"#dc2626",templates:[]},
    ];
  }
  function defaultEcfAlerts() {
    return [
      {id:uid(),case:"2026PD-001482",type:"Spacing",county:"Major",legal:"Sec 14-22N-18W",filed:"2026-07-18",operator:"Continental Resources",status:"New",targetAcres:640,notes:"Overlaps active pipeline tract"},
      {id:uid(),case:"2026PD-001361",type:"Pooling",county:"Dewey",legal:"Sec 11-20N-14W",filed:"2026-07-12",operator:"Devon Energy",status:"New",targetAcres:320,notes:"Near Caldwell tract"},
      {id:uid(),case:"2026PD-001290",type:"Spacing",county:"Woodward",legal:"Sec 4-21N-17W",filed:"2026-07-06",operator:"Chesapeake Energy",status:"Reviewed",targetAcres:640,notes:"Adjacent to Whitfield block"},
    ];
  }
  const saveTemplates = async (updated: any[]) => { setTemplateFolders(updated); await kvSet("templatefolders", updated); };
  const addFolder = async () => {
    if (!newFolder.name.trim()) return;
    const colors = ["#16a34a","#3b82f6","#dc2626","#7c3aed","#d97706","#0891b2"];
    const f = {id:uid(), created_at:new Date().toISOString(), ...newFolder, color:colors[templateFolders.length%colors.length], templates:[]};
    await saveTemplates([...templateFolders, f]);
    setNewFolder({name:"",state:"Oklahoma",description:""}); setShowNewFolder(false);
    setActiveFolder(f); flash("✓ Folder created.");
  };
  const addTemplate = async () => {
    if (!newTemplate.name.trim() || !activeFolder) return;
    const t = {id:uid(), created_at:new Date().toISOString(), ...newTemplate};
    const updated = templateFolders.map(f => f.id===activeFolder.id ? {...f,templates:[...f.templates,t]} : f);
    await saveTemplates(updated);
    setActiveFolder(updated.find(f => f.id===activeFolder.id));
    setNewTemplate({name:"",type:"Oil & Gas Lease",description:"",body:"",tags:""}); setShowNewTemplate(false); flash("✓ Template saved.");
  };
  const saveEditedTemplate = async () => {
    if (!editingTemplate) return;
    const updated = templateFolders.map(f => f.id===activeFolder.id
      ? {...f,templates:f.templates.map((t:any) => t.id===editingTemplate.id ? editingTemplate : t)} : f);
    await saveTemplates(updated);
    setActiveFolder(updated.find(f => f.id===activeFolder.id));
    setEditingTemplate(null); flash("✓ Template updated.");
  };
  const deleteTemplate = async (tid: string) => {
    const updated = templateFolders.map(f => f.id===activeFolder.id
      ? {...f,templates:f.templates.filter((t:any)=>t.id!==tid)} : f);
    await saveTemplates(updated); setActiveFolder(updated.find(f => f.id===activeFolder.id));
  };

  // Heir research
  const runHeirSearch = async () => {
    if (!heirForm.name.trim()) return;
    setHeirLoading(true); setHeirReport(null);
    const prompt = `You are a forensic genealogist for an Oklahoma oil and gas mineral acquisition company. Research this individual and return ONLY a JSON object.\n\nSUBJECT: ${heirForm.name}\nCounty: ${heirForm.county}\nState: ${heirForm.state||"Oklahoma"}\nDOB: ${heirForm.dob}\nDOD: ${heirForm.dod}\nMineral location: ${heirForm.minerals}\nNotes: ${heirForm.notes}\n\nSearch FamilySearch.org (LDS), Legacy.com, Findagrave, SSDI, Oklahoma probate records, Newspapers.com, and general web.\n\nReturn this exact JSON:\n{"subject":{"name":"","aka":[],"dob":"","dod":"","birthplace":"","lastResidence":"","mineralCounties":[],"confidence":85},"family":[{"name":"","relationship":"","dob":"","dod":"","lastKnownAddress":"","status":"living","heirStatus":"heir","notes":""}],"probate":{"filed":false,"county":"","caseNo":"","notes":""},"obituary":{"found":false,"source":"","summary":"","survivorsMentioned":[]},"sources":[{"type":"","source":"","relevance":""}],"researchNotes":"","confidenceScore":85,"recommendedNextSteps":[]}`;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})
      });
      const data = await resp.json();
      const text = (data.content||[]).filter((b:any)=>b.type==="text").map((b:any)=>b.text).join("");
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setHeirReport(parsed);
        const entry = {id:uid(), created_at:new Date().toISOString(), subject:heirForm.name, report:parsed};
        const updated = [entry, ...heirSaved];
        setHeirSaved(updated); await kvSet("heirreports", updated);
        flash("✓ Research complete.");
      } else { setHeirReport({_raw:text}); }
    } catch(e: any) { flash("Error: "+e.message); }
    setHeirLoading(false);
  };
  const toggleVerifyMember = async (key: string) => {
    const updated = {...treeVerified, [key]:!treeVerified[key]};
    setTreeVerified(updated); await kvSet("treeVerified", updated);
    flash(updated[key] ? "✓ Added to tree." : "Removed from tree.");
  };

  // OCC
  const queryOCC = async () => {
    setOccLoading(true); setOcc([]);
    try {
      const where = occCounty ? `UPPER(county)='${occCounty.toUpperCase()}'` : "1=1";
      const url = `https://gis.occ.ok.gov/server/rest/services/Hosted/RBDMS_WELLS/FeatureServer/0/query?where=${encodeURIComponent(where)}&outFields=api,well_name,operator,county,section,township,township_d,range,range_d,wellstatus&resultRecordCount=20&f=json`;
      const r = await fetch(url);
      const data = await r.json();
      setOcc((data.features||[]).map((f:any)=>f.attributes));
      flash(`✓ ${data.features?.length||0} wells from live OCC data.`);
    } catch(e: any) { flash("OCC query error: "+e.message); }
    setOccLoading(false);
  };

  // County records
  const searchRecords = async () => {
    setRecLoading(true); setRecErr(""); setRecResults(null);
    try {
      const r = await fetch(EDGE("county-records-search"), {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPABASE_ANON}`},
        body:JSON.stringify(recSearch)
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setRecResults(data);
    } catch(e: any) { setRecErr(e.message); }
    setRecLoading(false);
  };

  // ECF
  const markEcf = async (id: string, status: string) => {
    await saveKv("ecfalerts", ecfAlerts.map(a => a.id===id ? {...a,status} : a), setEcfAlerts);
  };

  const allTemplates = templateFolders.flatMap(f => f.templates.map((t:any)=>({...t,folderName:f.name,folderColor:f.color})));
  const searchResults = templateSearch.trim()
    ? allTemplates.filter(t =>
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.type.toLowerCase().includes(templateSearch.toLowerCase()) ||
        (t.tags||"").toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.folderName.toLowerCase().includes(templateSearch.toLowerCase()))
    : [];
  const overdueLetters = letters.filter(l => l.followUpDate && new Date(l.followUpDate) < new Date() && !["Executed","Recorded"].includes(l.status));
  const LETTER_STAGES = ["Sent","Received","Called","Responded","Executed","Recorded"];
  const statusColor = (st: string) => ({Sent:"gray",Received:"info",Called:"amber",Responded:"amber",Executed:"green",Recorded:"purple"}[st]||"gray") as string;
  const INST_TYPES = ["Mineral Deed","Oil & Gas Lease","Warranty Deed","Quitclaim Deed","Affidavit of Heirship","Probate Order","Patent","Mortgage","Release","Assignment","Correction Deed","Other"];
  const TEMPLATE_TYPES = ["Oil & Gas Lease","Mineral Deed","Cover Letter","Order of Payment","Affidavit of Heirship","County Clerk Recording Letter","Probate Petition","Quiet Title","Stipulation of Interest","Ratification","Follow-up Letter","Other"];
  const ecfCounts = {New:ecfAlerts.filter(a=>a.status==="New").length,Reviewed:ecfAlerts.filter(a=>a.status==="Reviewed").length,Actioned:ecfAlerts.filter(a=>a.status==="Actioned").length};
  const filteredEcf = ecfFilter==="All" ? ecfAlerts : ecfAlerts.filter(a=>a.status===ecfFilter);
  const ecfColor = (type:string) => ({Spacing:"#7c3aed",Pooling:"#d97706","Increased Density":"#3b82f6"}[type]||"#64748b");

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text).then(() => flash("✓ Copied."));
  const printTemplate = (t: any) => {
    const win = window.open("","_blank","width=800,height=700");
    if (!win) return;
    win.document.write(`<html><head><title>${t.name}</title><style>body{font-family:serif;padding:48px;font-size:13px;line-height:1.7}pre{white-space:pre-wrap;font-family:serif;font-size:13px}</style></head><body><pre>${t.body}</pre></body></html>`);
    win.document.close(); win.print();
  };

  // Family tree renderer
  const renderTree = (r: any) => {
    const sub = r.subject||{};
    const fam = r.family||[];
    const subjectKey = `${sub.name||heirForm.name}-subject`;
    const verified = [
      ...(treeVerified[subjectKey]?[{name:sub.name||heirForm.name,relationship:"Subject / Mineral Owner",dob:sub.dob,dod:sub.dod,status:sub.dod?"deceased":"unknown",heirStatus:"owner"}]:[]),
      ...fam.filter((_:any,i:number)=>treeVerified[`${sub.name}-${i}`])
    ];
    if (verified.length===0) return <p style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:"16px 0"}}>Verify members below to build the family tree</p>;
    const color = (m:any) => m.heirStatus==="owner"?"#7c3aed":m.status==="living"?"#16a34a":m.status==="deceased"?"#64748b":"#d97706";
    const nW=120,nH=42,gX=16,gY=56;
    const spouses=verified.filter((m:any)=>m.relationship==="spouse");
    const children=verified.filter((m:any)=>["son","daughter","child"].some((r:string)=>m.relationship?.toLowerCase().includes(r)));
    const subject=verified.find((m:any)=>m.heirStatus==="owner");
    const topRow=subject?[subject,...spouses]:spouses;
    const topW=topRow.length*(nW+gX)-gX;
    const svgW=Math.max(topW,children.length*(nW+gX)-gX,360)+40;
    const topX=(svgW-topW)/2;
    const childX=(svgW-(children.length*(nW+gX)-gX))/2;
    const svgH=children.length>0?210:100;
    return(
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{width:"100%",maxHeight:200,display:"block"}}>
        {topRow.map((m:any,i:number)=>{const x=topX+i*(nW+gX),y=10;return(<g key={i}><rect x={x} y={y} width={nW} height={nH} rx={5} fill={color(m)} fillOpacity={0.12} stroke={color(m)} strokeWidth={1.5}/><text x={x+nW/2} y={y+13} textAnchor="middle" fontSize={10} fontWeight={600} fill={color(m)}>{(m.name||"").split(" ").slice(-1)[0]}</text><text x={x+nW/2} y={y+25} textAnchor="middle" fontSize={9} fill="#64748b">{m.relationship}</text><text x={x+nW/2} y={y+36} textAnchor="middle" fontSize={9} fill="#94a3b8">{m.dob||""}{m.dod?`–${m.dod}`:""}</text></g>);})}
        {children.length>0&&topRow.length>0&&<line x1={topX+topW/2} y1={10+nH} x2={topX+topW/2} y2={10+nH+28} stroke="#e2e8f0" strokeWidth={1}/>}
        {children.length>1&&<line x1={childX+nW/2} y1={10+nH+28} x2={childX+(children.length-1)*(nW+gX)+nW/2} y2={10+nH+28} stroke="#e2e8f0" strokeWidth={1}/>}
        {children.map((m:any,i:number)=>{const x=childX+i*(nW+gX),y=10+nH+gY;return(<g key={i}><line x1={x+nW/2} y1={10+nH+28} x2={x+nW/2} y2={y} stroke="#e2e8f0" strokeWidth={1}/><rect x={x} y={y} width={nW} height={nH} rx={5} fill={color(m)} fillOpacity={0.1} stroke={color(m)} strokeWidth={1}/><text x={x+nW/2} y={y+13} textAnchor="middle" fontSize={10} fontWeight={500} fill={color(m)}>{(m.name||"").split(" ").slice(-1)[0]}</text><text x={x+nW/2} y={y+25} textAnchor="middle" fontSize={9} fill="#64748b">{m.relationship}</text></g>);})}
      </svg>
    );
  };

  return (
    <div style={s.wrap}>
      {toast && <div style={s.toast}>{toast}</div>}
      <div style={s.sb}>
        <div style={{padding:"0 4px 14px",borderBottom:"1px solid #e2e8f0",marginBottom:6}}>
          <p style={{fontWeight:700,fontSize:14,margin:0,color:"#1e293b"}}>HNR Title Suite</p>
          <p style={{fontSize:10,color:"#64748b",margin:"1px 0 0"}}>Huston Energy Corporation</p>
          <p style={{fontSize:10,color:"#16a34a",margin:"2px 0 0"}}>● Live · Supabase</p>
        </div>
        {TABS.map(([t,l])=><button key={t} style={s.nb(tab===t)} onClick={()=>setTab(t)}>{l}</button>)}
      </div>

      <div style={s.main}>
        {error && <div style={{...s.warn,background:"#fef2f2",color:"#b91c1c",marginBottom:10}}>{error} <button onClick={()=>setError("")} style={{border:"none",background:"none",cursor:"pointer",color:"#b91c1c",float:"right"}}>✕</button></div>}

        {tab==="pipeline"&&<>
          <div style={s.hdr}><p style={s.h1}>Research pipeline <span style={{fontSize:11,fontWeight:400,color:"#64748b"}}>({projects.length})</span></p><button style={s.btn("#16a34a")} onClick={()=>setShowNp(v=>!v)}>+ New project</button></div>
          {showNp&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Tract *</label><input style={s.inp} value={np.tract} onChange={e=>setNp(v=>({...v,tract:e.target.value}))} placeholder="Sec 14-22N-18W"/></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={np.county} onChange={e=>setNp(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>Acres</label><input style={s.inp} value={np.acres} onChange={e=>setNp(v=>({...v,acres:e.target.value}))} placeholder="320"/></div>
              <div><label style={s.lbl}>Source</label><input style={s.inp} value={np.source} onChange={e=>setNp(v=>({...v,source:e.target.value}))} placeholder="ECF case, tip…"/></div>
            </div>
            <div style={{marginBottom:8}}><label style={s.lbl}>Notes</label><input style={s.inp} value={np.notes} onChange={e=>setNp(v=>({...v,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addProject}>Save</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNp(false)}>Cancel</button></div>
          </div>}
          {loading?<p style={{color:"#94a3b8",fontSize:12}}>Loading from Supabase…</p>:
          <div style={s.kanban}>
            {STAGES.map(stage=>(
              <div key={stage} style={s.kcol}>
                <p style={s.kct}>{stage} ({byStage(stage).length})</p>
                {byStage(stage).map((p:any)=>(
                  <div key={p.id} style={{...s.card(!p.verified),padding:"8px 10px"}}>
                    <p style={{fontWeight:500,fontSize:11,margin:"0 0 2px"}}>{p.tract}</p>
                    <p style={{fontSize:10,color:"#64748b",margin:"0 0 4px"}}>{p.county} Co{p.acres?` · ${p.acres} ac`:""}</p>
                    {!p.verified&&<span style={s.badge("amber")}>verify</span>}
                    {p.verified&&<span style={s.badge("green")}>✓</span>}
                    <div style={{display:"flex",gap:2,marginTop:5,flexWrap:"wrap"}}>
                      <button style={{...s.btn("#94a3b8"),padding:"2px 5px",fontSize:10}} onClick={()=>moveStage(p,-1)} disabled={p.stage===STAGES[0]}>←</button>
                      <button style={{...s.btn("#3b82f6"),padding:"2px 5px",fontSize:10}} onClick={()=>moveStage(p,1)} disabled={p.stage===STAGES[4]}>→</button>
                      <button style={{...s.btn(p.verified?"#94a3b8":"#16a34a"),padding:"2px 5px",fontSize:10}} onClick={()=>toggleVerifyP(p)}>{p.verified?"✗":"✓"}</button>
                      <button style={{...s.btn("#7c3aed"),padding:"2px 5px",fontSize:10}} onClick={()=>logDoc(p,"OGL")}>OGL</button>
                      <button style={{...s.btn("#7c3aed"),padding:"2px 5px",fontSize:10}} onClick={()=>logDoc(p,"MD")}>MD</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>}
        </>}

        {tab==="offers"&&<>
          <div style={s.hdr}><p style={s.h1}>Offer tracker</p><button style={s.btn("#16a34a")} onClick={()=>setShowOffer(v=>!v)}>+ Log offer</button></div>
          <div style={s.g4}>
            {[["Total",offers.length,"gray"],["Pending",offers.filter((o:any)=>o.response==="Pending").length,"amber"],["Accepted",offers.filter((o:any)=>o.response==="Accepted").length,"green"],["Declined",offers.filter((o:any)=>o.response==="Declined").length,"red"]].map(([l,v,c])=>(
              <div key={l as string} style={{background:"#f8fafc",borderRadius:8,padding:"8px 12px"}}><p style={{fontSize:10,color:"#64748b",margin:0}}>{l}</p><p style={{fontSize:20,fontWeight:500,margin:"2px 0 0"}}>{v}</p></div>
            ))}
          </div>
          {showOffer&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Owner name *</label><input style={s.inp} value={newOffer.ownerName} onChange={e=>setNewOffer(v=>({...v,ownerName:e.target.value}))} placeholder="James Whitfield"/></div>
              <div><label style={s.lbl}>Tract</label><input style={s.inp} value={newOffer.tract} onChange={e=>setNewOffer(v=>({...v,tract:e.target.value}))} placeholder="Sec 21-18N-26W"/></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={newOffer.county} onChange={e=>setNewOffer(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>NMA</label><input style={s.inp} value={newOffer.nma} onChange={e=>{const nma=e.target.value;const total=parseFloat(nma)&&parseFloat(newOffer.offerPerAcre)?(parseFloat(nma)*parseFloat(newOffer.offerPerAcre)).toFixed(2):"";setNewOffer(v=>({...v,nma,totalOffer:total}));}} placeholder="7.5"/></div>
              <div><label style={s.lbl}>$/NMA</label><input style={s.inp} value={newOffer.offerPerAcre} onChange={e=>{const ppa=e.target.value;const total=parseFloat(newOffer.nma)&&parseFloat(ppa)?(parseFloat(newOffer.nma)*parseFloat(ppa)).toFixed(2):"";setNewOffer(v=>({...v,offerPerAcre:ppa,totalOffer:total}));}} placeholder="1000"/></div>
              <div><label style={s.lbl}>Total (auto)</label><input style={{...s.inp,background:"#f8fafc"}} value={newOffer.totalOffer?fmt$(parseFloat(newOffer.totalOffer)):""} readOnly/></div>
              <div><label style={s.lbl}>Date sent</label><input type="date" style={s.inp} value={newOffer.dateSent} onChange={e=>setNewOffer(v=>({...v,dateSent:e.target.value}))}/></div>
              <div><label style={s.lbl}>Assignee</label><select style={s.sel} value={newOffer.assignee} onChange={e=>setNewOffer(v=>({...v,assignee:e.target.value}))}>{TEAM.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={s.lbl}>Competitor activity</label><input style={s.inp} value={newOffer.competitorActivity} onChange={e=>setNewOffer(v=>({...v,competitorActivity:e.target.value}))} placeholder="Continental also sent ~$800/NMA"/></div>
              <div><label style={s.lbl}>Notes</label><input style={s.inp} value={newOffer.notes} onChange={e=>setNewOffer(v=>({...v,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addOffer}>Save</button><button style={s.btn("#94a3b8")} onClick={()=>setShowOffer(false)}>Cancel</button></div>
          </div>}
          {offers.map((o:any)=>(
            <div key={o.id} style={s.card(false)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{fontWeight:500,fontSize:13}}>{o.ownerName}</span>
                    <span style={s.badge(o.response==="Accepted"?"green":o.response==="Declined"?"red":"amber")}>{o.response}</span>
                    {o.competitorActivity&&<span style={s.badge("red")}>⚠ Competitor</span>}
                  </div>
                  <p style={{fontSize:11,color:"#64748b",margin:"0 0 2px"}}>{o.tract} · {o.county} Co · {o.nma} NMA · {fmt$(parseFloat(o.totalOffer)||0)}</p>
                  {o.competitorActivity&&<p style={{fontSize:11,color:"#dc2626",margin:0}}>{o.competitorActivity}</p>}
                </div>
                <div style={{display:"flex",gap:3,flexWrap:"wrap",maxWidth:220,justifyContent:"flex-end"}}>
                  {["Pending","Accepted","Declined","Counter","No response"].map(r=>(
                    <button key={r} style={{...s.btn(r==="Accepted"?"#16a34a":r==="Declined"?"#dc2626":"#94a3b8"),padding:"2px 6px",fontSize:10,opacity:o.response===r?1:0.5}} onClick={()=>updateOfferResponse(o.id,r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>}

        {tab==="calc"&&<>
          <p style={s.h1}>Mineral interest calculator</p>
          <p style={s.sub}>Equal division per Oklahoma descent & distribution (84 O.S. § 213)</p>
          <div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g4}>
              <div><label style={s.lbl}>Source owner</label><input style={s.inp} value={calc.sourceOwner} onChange={e=>setCalc(v=>({...v,sourceOwner:e.target.value}))} placeholder="O.F. Todd"/></div>
              <div><label style={s.lbl}>Total mineral acres</label><input style={s.inp} value={calc.sourceAcres} onChange={e=>setCalc(v=>({...v,sourceAcres:e.target.value}))} placeholder="10.00"/></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={calc.county} onChange={e=>setCalc(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>$/NMA</label><input style={s.inp} value={calc.pricePerAcre} onChange={e=>setCalc(v=>({...v,pricePerAcre:e.target.value}))} placeholder="1000"/></div>
            </div>
            <div style={{marginBottom:8}}><label style={s.lbl}>Legal description</label><input style={s.inp} value={calc.legal} onChange={e=>setCalc(v=>({...v,legal:e.target.value}))} placeholder="E/2 NE/4 Sec 21-18N-26W"/></div>
            <p style={{fontSize:11,fontWeight:500,color:"#64748b",margin:"0 0 6px"}}>Heirs</p>
            {calc.heirs.map((h:any,i:number)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1.5fr auto",gap:6,marginBottom:5}}>
                <input style={s.inp} value={h.name} onChange={e=>setCalc(v=>({...v,heirs:v.heirs.map((hh:any,j:number)=>j===i?{...hh,name:e.target.value}:hh)}))} placeholder="Heir name"/>
                <input style={s.inp} value={h.relationship} onChange={e=>setCalc(v=>({...v,heirs:v.heirs.map((hh:any,j:number)=>j===i?{...hh,relationship:e.target.value}:hh)}))} placeholder="Relationship"/>
                <input style={s.inp} value={h.address} onChange={e=>setCalc(v=>({...v,heirs:v.heirs.map((hh:any,j:number)=>j===i?{...hh,address:e.target.value}:hh)}))} placeholder="Address"/>
                <button style={{...s.btn("#dc2626"),padding:"4px 8px"}} onClick={()=>setCalc(v=>({...v,heirs:v.heirs.filter((_:any,j:number)=>j!==i)}))}>✕</button>
              </div>
            ))}
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button style={s.btn("#64748b")} onClick={()=>setCalc(v=>({...v,heirs:[...v.heirs,{name:"",relationship:"",address:""}]}))}>+ Add heir</button>
              <button style={s.btn("#16a34a")} onClick={runCalc}>Calculate</button>
            </div>
          </div>
          {calcResult&&<div style={s.card(false)}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <p style={{fontWeight:500,fontSize:13,margin:0}}>{calcResult.sourceOwner} · {calcResult.sourceAcres} ac · {calcResult.county} Co</p>
              <span style={{fontSize:13,color:"#16a34a",fontWeight:500}}>Total: {fmt$(parseFloat(calcResult.totalDisbursement))}</span>
            </div>
            <table style={s.tbl}><thead><tr>{["Heir","Relationship","Net acres","Offer amount","Address"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{calcResult.heirs.map((h:any,i:number)=><tr key={i}><td style={s.td}><strong>{h.name}</strong></td><td style={s.td}>{h.relationship}</td><td style={s.td}>{h.netAcres}</td><td style={{...s.td,color:"#16a34a",fontWeight:500}}>{fmt$(parseFloat(h.totalOffer))}</td><td style={{...s.td,color:"#64748b"}}>{h.address}</td></tr>)}</tbody></table>
            <div style={{...s.info,marginTop:8}}>Assumes equal intestate division per 84 O.S. § 213. Confirm with licensed Oklahoma attorney if a will exists.</div>
          </div>}
        </>}

        {tab==="status"&&<>
          <div style={s.hdr}><p style={s.h1}>Letter & packet status</p><button style={s.btn("#16a34a")} onClick={()=>setShowLetter(v=>!v)}>+ Log letter</button></div>
          {overdueLetters.length>0&&<div style={s.warn}>⚠ {overdueLetters.length} letter(s) past follow-up: {overdueLetters.map((l:any)=>l.ownerName).join(", ")}</div>}
          <div style={{...s.g4,gridTemplateColumns:"repeat(6,1fr)",marginBottom:12}}>
            {LETTER_STAGES.map(st=><div key={st} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px"}}><p style={{fontSize:10,color:"#64748b",margin:0}}>{st}</p><p style={{fontSize:18,fontWeight:500,margin:"1px 0 0"}}>{letters.filter((l:any)=>l.status===st).length}</p></div>)}
          </div>
          {showLetter&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Owner name *</label><input style={s.inp} value={newLetter.ownerName} onChange={e=>setNewLetter(v=>({...v,ownerName:e.target.value}))} placeholder="Dorothy Whitfield-Sims"/></div>
              <div><label style={s.lbl}>Tract</label><input style={s.inp} value={newLetter.tract} onChange={e=>setNewLetter(v=>({...v,tract:e.target.value}))} placeholder="Sec 21-18N-26W"/></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={newLetter.county} onChange={e=>setNewLetter(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>Doc type</label><select style={s.sel} value={newLetter.docType} onChange={e=>setNewLetter(v=>({...v,docType:e.target.value}))}>{["Oil & gas lease","Mineral deed","Stipulation","Ratification"].map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={s.lbl}>Date sent</label><input type="date" style={s.inp} value={newLetter.dateSent} onChange={e=>setNewLetter(v=>({...v,dateSent:e.target.value}))}/></div>
              <div><label style={s.lbl}>Follow-up date</label><input type="date" style={s.inp} value={newLetter.followUpDate} onChange={e=>setNewLetter(v=>({...v,followUpDate:e.target.value}))}/></div>
              <div><label style={s.lbl}>Assignee</label><select style={s.sel} value={newLetter.assignee} onChange={e=>setNewLetter(v=>({...v,assignee:e.target.value}))}>{TEAM.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={s.lbl}>Notes</label><input style={s.inp} value={newLetter.notes} onChange={e=>setNewLetter(v=>({...v,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addLetter}>Save</button><button style={s.btn("#94a3b8")} onClick={()=>setShowLetter(false)}>Cancel</button></div>
          </div>}
          {letters.map((l:any)=>{
            const overdue=l.followUpDate&&new Date(l.followUpDate)<new Date()&&!["Executed","Recorded"].includes(l.status);
            return(<div key={l.id} style={{...s.card(false),borderLeft:overdue?"3px solid #dc2626":undefined}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{fontWeight:500,fontSize:13}}>{l.ownerName}</span>
                    <span style={s.badge(statusColor(l.status) as string)}>{l.status}</span>
                    {overdue&&<span style={s.badge("red")}>⚠ Follow up</span>}
                  </div>
                  <p style={{fontSize:11,color:"#64748b",margin:0}}>{l.tract} · {l.county} Co · {l.assignee} · Sent: {l.dateSent||"—"}</p>
                </div>
                <div style={{display:"flex",gap:3}}>
                  {LETTER_STAGES.map(st=><button key={st} style={{...s.btn("#64748b"),padding:"2px 6px",fontSize:10,opacity:l.status===st?1:0.4}} onClick={()=>updateLetterStatus(l.id,st)}>{st}</button>)}
                </div>
              </div>
            </div>);
          })}
        </>}

        {tab==="runsheet"&&<>
          <div style={s.hdr}>
            <p style={s.h1}>Title runsheet / abstract builder{activeRunsheet&&<span style={{fontSize:11,fontWeight:400,color:"#64748b"}}> — {activeRunsheet.title}</span>}</p>
            <div style={{display:"flex",gap:6}}>
              {activeRunsheet&&<button style={s.btn("#64748b")} onClick={()=>setActiveRunsheet(null)}>← All</button>}
              {activeRunsheet&&<button style={s.btn("#7c3aed")} onClick={()=>{
                const rs=runsheets.find((r:any)=>r.id===activeRunsheet.id)||activeRunsheet;
                const win=window.open("","_blank","width=900,height=700");
                if(!win)return;
                const rows=(rs.instruments||[]).map((i:any,n:number)=>`<tr><td>${n+1}</td><td>${i.date||"—"}</td><td>${i.grantor}</td><td>${i.grantee}</td><td>${i.type}</td><td>${i.bookPage||"—"}</td><td>${i.legalDesc||"—"}</td><td>${i.notes||""}</td></tr>`).join("");
                win.document.write(`<html><head><title>Title Runsheet — ${rs.title}</title><style>body{font-family:serif;padding:36px;font-size:12px}h1{font-size:16px}table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;padding:5px 7px;background:#f8fafc;border-bottom:1px solid #cbd5e1;font-size:11px;font-weight:600}td{padding:5px 7px;border-bottom:0.5px solid #f1f5f9}tr:nth-child(even){background:#fafafa}.footer{margin-top:28px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}</style></head><body><h1>Title Runsheet / Abstract</h1><p><strong>${rs.title}</strong> · ${rs.county} County, Oklahoma · ${rs.legal||""}</p><p style="color:#64748b">Huston Energy Corporation · ${new Date().toLocaleDateString()}</p><table><thead><tr><th>#</th><th>Date</th><th>Grantor</th><th>Grantee</th><th>Type</th><th>Book/Page</th><th>Legal</th><th>Notes</th></tr></thead><tbody>${rows||"<tr><td colspan='8' style='text-align:center;color:#94a3b8;padding:16px'>No instruments</td></tr>"}</tbody></table><div class="footer">Prepared for internal use. Verify all instruments against original county clerk records before issuance of a title opinion.</div></body></html>`);
                win.document.close();win.print();
              }}>Print abstract ↗</button>}
              <button style={s.btn("#16a34a")} onClick={()=>setShowNewRS(v=>!v)}>+ New runsheet</button>
            </div>
          </div>
          {showNewRS&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Title *</label><input style={s.inp} value={newRS.title} onChange={e=>setNewRS(v=>({...v,title:e.target.value}))} placeholder="Whitfield mineral interest — Ellis Co"/></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={newRS.county} onChange={e=>setNewRS(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>Legal description</label><input style={s.inp} value={newRS.legal} onChange={e=>setNewRS(v=>({...v,legal:e.target.value}))} placeholder="E/2 NE/4 Sec 21-18N-26W"/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><label style={s.lbl}>From</label><input style={s.inp} value={newRS.fromYear} onChange={e=>setNewRS(v=>({...v,fromYear:e.target.value}))} placeholder="Patent"/></div>
                <div><label style={s.lbl}>To</label><input style={s.inp} value={newRS.toYear} onChange={e=>setNewRS(v=>({...v,toYear:e.target.value}))}/></div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addRunsheet}>Create</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewRS(false)}>Cancel</button></div>
          </div>}
          {!activeRunsheet&&<>{runsheets.length===0&&<p style={{color:"#94a3b8",fontSize:12}}>No runsheets yet.</p>}{runsheets.map((r:any)=><div key={r.id} style={{...s.card(false),display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setActiveRunsheet(r)}><div><p style={{fontWeight:500,fontSize:13,margin:"0 0 1px"}}>{r.title}</p><p style={{fontSize:11,color:"#64748b",margin:0}}>{r.county} Co · {r.instruments?.length||0} instruments</p></div><span style={{color:"#94a3b8"}}>›</span></div>)}</>}
          {activeRunsheet&&(()=>{
            const rs=runsheets.find((r:any)=>r.id===activeRunsheet.id)||activeRunsheet;
            return(<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <p style={{fontWeight:500,fontSize:12,margin:0}}>Chain of title ({rs.instruments?.length||0} instruments)</p>
                <button style={{...s.btn("#16a34a"),fontSize:11,padding:"3px 8px"}} onClick={()=>setShowNewInst(v=>!v)}>+ Add instrument</button>
              </div>
              {showNewInst&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:10}}>
                <div style={s.g2}>
                  <div><label style={s.lbl}>Date</label><input type="date" style={s.inp} value={newInst.date} onChange={e=>setNewInst(v=>({...v,date:e.target.value}))}/></div>
                  <div><label style={s.lbl}>Type</label><select style={s.sel} value={newInst.type} onChange={e=>setNewInst(v=>({...v,type:e.target.value}))}>{INST_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={s.lbl}>Grantor</label><input style={s.inp} value={newInst.grantor} onChange={e=>setNewInst(v=>({...v,grantor:e.target.value}))} placeholder="United States of America"/></div>
                  <div><label style={s.lbl}>Grantee</label><input style={s.inp} value={newInst.grantee} onChange={e=>setNewInst(v=>({...v,grantee:e.target.value}))} placeholder="John Whitfield"/></div>
                  <div><label style={s.lbl}>Book/Page</label><input style={s.inp} value={newInst.bookPage} onChange={e=>setNewInst(v=>({...v,bookPage:e.target.value}))} placeholder="Book 42 Page 317"/></div>
                  <div><label style={s.lbl}>Legal</label><input style={s.inp} value={newInst.legalDesc} onChange={e=>setNewInst(v=>({...v,legalDesc:e.target.value}))} placeholder="E/2 NE/4 Sec 21-18N-26W"/></div>
                </div>
                <div style={{marginBottom:6}}><label style={s.lbl}>Notes</label><input style={s.inp} value={newInst.notes} onChange={e=>setNewInst(v=>({...v,notes:e.target.value}))} placeholder="Title gap, probate required…"/></div>
                <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addInstrument}>Add</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewInst(false)}>Cancel</button></div>
              </div>}
              <table style={{...s.tbl,tableLayout:"fixed" as const}}>
                <thead><tr><th style={{...s.th,width:24}}>#</th><th style={{...s.th,width:88}}>Date</th><th style={s.th}>Grantor</th><th style={s.th}>Grantee</th><th style={{...s.th,width:110}}>Type</th><th style={{...s.th,width:90}}>Book/Page</th><th style={{...s.th,width:24}}></th></tr></thead>
                <tbody>{(rs.instruments||[]).map((inst:any,i:number)=>(
                  <tr key={inst.id} style={{background:i%2===0?"transparent":"#f8fafc"}}>
                    <td style={{...s.td,color:"#94a3b8"}}>{i+1}</td>
                    <td style={{...s.td,color:"#64748b"}}>{inst.date||"—"}</td>
                    <td style={s.td}><strong>{inst.grantor}</strong></td>
                    <td style={s.td}>{inst.grantee}</td>
                    <td style={s.td}><span style={s.badge(inst.type==="Patent"?"green":inst.type.includes("Deed")?"info":"gray")}>{inst.type}</span></td>
                    <td style={{...s.td,fontSize:11,color:"#64748b"}}>{inst.bookPage||"—"}</td>
                    <td style={s.td}><button style={{border:"none",background:"none",cursor:"pointer",color:"#dc2626"}} onClick={()=>deleteInstrument(inst.id)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </>);
          })()}
        </>}

        {tab==="skiptrace"&&<>
          <div style={s.hdr}><p style={s.h1}>Skip tracing — TLO / TransUnion</p><button style={s.btn("#16a34a")} onClick={()=>setShowNewSkip(v=>!v)}>+ Add subject</button></div>
          <div style={s.warn}>TLO requires a permissible purpose under DPPA/FCRA. Mineral acquisition qualifies under Purpose Code 4. TLO credentials must be stored in Supabase Vault — never in this dashboard. ~$0.15/lookup.</div>
          {showNewSkip&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Full name *</label><input style={s.inp} value={newSkip.name} onChange={e=>setNewSkip(v=>({...v,name:e.target.value}))} placeholder="James Earl Whitfield"/></div>
              <div><label style={s.lbl}>Last known address</label><input style={s.inp} value={newSkip.lastKnownAddress} onChange={e=>setNewSkip(v=>({...v,lastKnownAddress:e.target.value}))} placeholder="412 Elm St, Woodward OK"/></div>
              <div><label style={s.lbl}>Date of birth</label><input style={s.inp} value={newSkip.dob} onChange={e=>setNewSkip(v=>({...v,dob:e.target.value}))} placeholder="1948"/></div>
              <div><label style={s.lbl}>Source</label><input style={s.inp} value={newSkip.source} onChange={e=>setNewSkip(v=>({...v,source:e.target.value}))} placeholder="1962 mineral deed, Ellis Co"/></div>
            </div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addSkipSubject}>Add</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewSkip(false)}>Cancel</button></div>
          </div>}
          {skipSubjects.map((subj:any)=>(
            <div key={subj.id} style={s.card(false)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3}}>
                    <span style={{fontWeight:500,fontSize:13}}>{subj.name}</span>
                    <span style={s.badge(subj.status==="Complete"?"green":"amber")}>{subj.status}</span>
                  </div>
                  <p style={{fontSize:11,color:"#64748b",margin:"0 0 2px"}}>Last known: {subj.lastKnownAddress||"—"} · DOB: {subj.dob||"—"}</p>
                  {subj.result&&!subj.result.error&&<div style={{...s.success,marginTop:6}}>
                    <p style={{fontWeight:500,margin:"0 0 4px"}}>✓ Located</p>
                    {(subj.result.addresses||[]).slice(0,2).map((a:any,i:number)=><p key={i} style={{fontSize:11,margin:"0 0 2px"}}>{a.address} ({a.date||"recent"})</p>)}
                    {(subj.result.phones||[]).slice(0,2).map((p:any,i:number)=><p key={i} style={{fontSize:11,margin:"0 0 2px"}}>📞 {p.number} ({p.type})</p>)}
                    {subj.result.dod&&<p style={{fontSize:11,color:"#d97706",margin:0}}>⚠ DOD on file: {subj.result.dod}</p>}
                  </div>}
                </div>
                <button style={{...s.btn("#3b82f6"),padding:"4px 10px",fontSize:11,marginLeft:8}} onClick={()=>runSkipTrace(subj)} disabled={skipLoading===subj.id}>{skipLoading===subj.id?"Searching…":"Run TLO lookup ↗"}</button>
              </div>
            </div>
          ))}
          {skipSubjects.length===0&&<p style={{color:"#94a3b8",fontSize:12}}>No subjects queued. Add owners or heirs you cannot locate.</p>}
        </>}

        {tab==="templates"&&<>
          <div style={s.hdr}>
            <p style={s.h1}>Template library{activeFolder&&<span style={{fontSize:11,fontWeight:400,color:"#64748b"}}> — {activeFolder.name}</span>}</p>
            <div style={{display:"flex",gap:6}}>
              {activeFolder&&<button style={s.btn("#64748b")} onClick={()=>{setActiveFolder(null);setShowNewTemplate(false);setEditingTemplate(null);setPreviewTemplate(null);}}>← Folders</button>}
              {activeFolder&&<button style={s.btn("#16a34a")} onClick={()=>setShowNewTemplate(v=>!v)}>+ New template</button>}
              {!activeFolder&&<button style={s.btn("#16a34a")} onClick={()=>setShowNewFolder(v=>!v)}>+ New folder</button>}
            </div>
          </div>
          {!activeFolder&&<div style={{marginBottom:12}}><input style={s.inp} value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="🔍  Search all templates…"/></div>}
          {templateSearch.trim()&&<div style={{marginBottom:12}}>
            <p style={{fontSize:11,color:"#64748b",margin:"0 0 8px"}}>{searchResults.length} result(s)</p>
            {searchResults.map((t:any)=><div key={t.id} style={{...s.card(false),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{display:"flex",gap:6,marginBottom:2}}><span style={{fontWeight:500,fontSize:12}}>{t.name}</span><span style={s.badge("info")}>{t.type}</span><span style={{...s.badge("gray"),color:t.folderColor}}>{t.folderName}</span></div><p style={{fontSize:11,color:"#64748b",margin:0}}>{t.description}</p></div>
              <div style={{display:"flex",gap:4}}><button style={{...s.btn("#7c3aed"),padding:"3px 8px",fontSize:11}} onClick={()=>setPreviewTemplate(t)}>Preview</button><button style={{...s.btn("#64748b"),padding:"3px 8px",fontSize:11}} onClick={()=>copyToClipboard(t.body)}>Copy</button><button style={{...s.btn("#3b82f6"),padding:"3px 8px",fontSize:11}} onClick={()=>printTemplate(t)}>Print</button></div>
            </div>)}
          </div>}
          {showNewFolder&&!activeFolder&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g3}>
              <div><label style={s.lbl}>Folder name *</label><input style={s.inp} value={newFolder.name} onChange={e=>setNewFolder(v=>({...v,name:e.target.value}))} placeholder="Oklahoma Templates"/></div>
              <div><label style={s.lbl}>State / region</label><input style={s.inp} value={newFolder.state} onChange={e=>setNewFolder(v=>({...v,state:e.target.value}))} placeholder="Oklahoma"/></div>
              <div><label style={s.lbl}>Description</label><input style={s.inp} value={newFolder.description} onChange={e=>setNewFolder(v=>({...v,description:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addFolder}>Create folder</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewFolder(false)}>Cancel</button></div>
          </div>}
          {!activeFolder&&!templateSearch.trim()&&<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
              {templateFolders.map((f:any)=>(
                <div key={f.id} style={{border:`1px solid ${f.color}30`,borderTop:`3px solid ${f.color}`,borderRadius:8,padding:"12px 14px",cursor:"pointer",background:"#fff"}} onClick={()=>setActiveFolder(f)}>
                  <div style={{fontSize:22,marginBottom:4}}>📂</div>
                  <p style={{fontWeight:600,fontSize:13,margin:"0 0 2px",color:f.color}}>{f.name}</p>
                  <p style={{fontSize:11,color:"#64748b",margin:"0 0 6px"}}>{f.state} · {f.templates?.length||0} templates</p>
                  <span style={{...s.badge("gray"),color:f.color}}>Open →</span>
                </div>
              ))}
              <div style={{border:"2px dashed #e2e8f0",borderRadius:8,padding:"12px 14px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:110,color:"#94a3b8"}} onClick={()=>setShowNewFolder(true)}>
                <span style={{fontSize:22,marginBottom:4}}>➕</span>
                <span style={{fontSize:12}}>New folder</span>
              </div>
            </div>
            <p style={{fontSize:11,color:"#64748b"}}>{allTemplates.length} templates across {templateFolders.length} folders</p>
          </>}
          {activeFolder&&!editingTemplate&&!previewTemplate&&(()=>{
            const af=templateFolders.find((f:any)=>f.id===activeFolder.id)||activeFolder;
            return(<>
              <div style={{...s.info,marginBottom:10}}>{af.state} · {af.description} · {af.templates?.length||0} templates</div>
              {showNewTemplate&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
                <div style={s.g2}>
                  <div><label style={s.lbl}>Name *</label><input style={s.inp} value={newTemplate.name} onChange={e=>setNewTemplate(v=>({...v,name:e.target.value}))} placeholder="OGL — Record Owner"/></div>
                  <div><label style={s.lbl}>Type</label><select style={s.sel} value={newTemplate.type} onChange={e=>setNewTemplate(v=>({...v,type:e.target.value}))}>{TEMPLATE_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={s.lbl}>Description</label><input style={s.inp} value={newTemplate.description} onChange={e=>setNewTemplate(v=>({...v,description:e.target.value}))}/></div>
                  <div><label style={s.lbl}>Tags</label><input style={s.inp} value={newTemplate.tags} onChange={e=>setNewTemplate(v=>({...v,tags:e.target.value}))} placeholder="OGL,lease,record owner"/></div>
                </div>
                <label style={s.lbl}>Body — use [BRACKETS] for merge fields</label>
                <textarea style={{...s.inp,resize:"vertical" as const,fontFamily:"monospace",fontSize:11,marginBottom:8}} rows={10} value={newTemplate.body} onChange={e=>setNewTemplate(v=>({...v,body:e.target.value}))} placeholder="HUSTON ENERGY CORPORATION&#10;P. O. Box 5318&#10;Enid, OK 73702&#10;&#10;[DATE]&#10;[OWNER NAME]..."/>
                <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addTemplate}>Save template</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewTemplate(false)}>Cancel</button></div>
              </div>}
              {(af.templates||[]).length===0&&!showNewTemplate&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8"}}><p style={{fontSize:24,margin:"0 0 8px"}}>📄</p><p style={{fontSize:13}}>No templates yet.</p></div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {(af.templates||[]).map((t:any)=>(
                  <div key={t.id} style={s.card(false)}>
                    <p style={{fontWeight:500,fontSize:12,margin:"0 0 3px"}}>{t.name}</p>
                    <span style={s.badge("info")}>{t.type}</span>
                    {(t.tags||"").split(",").filter(Boolean).map((tag:string)=><span key={tag} style={{...s.badge("gray"),marginLeft:3}}>{tag.trim()}</span>)}
                    <p style={{fontSize:11,color:"#94a3b8",margin:"4px 0 8px"}}>{t.description}</p>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap" as const}}>
                      <button style={{...s.btn("#7c3aed"),padding:"3px 8px",fontSize:11}} onClick={()=>setPreviewTemplate(t)}>Preview</button>
                      <button style={{...s.btn("#3b82f6"),padding:"3px 8px",fontSize:11}} onClick={()=>setEditingTemplate({...t})}>Edit</button>
                      <button style={{...s.btn("#64748b"),padding:"3px 8px",fontSize:11}} onClick={()=>copyToClipboard(t.body)}>Copy</button>
                      <button style={{...s.btn("#16a34a"),padding:"3px 8px",fontSize:11}} onClick={()=>printTemplate(t)}>Print</button>
                      <button style={{...s.btn("#dc2626"),padding:"3px 8px",fontSize:11}} onClick={()=>deleteTemplate(t.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>);
          })()}
          {editingTemplate&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <p style={{fontWeight:500,fontSize:13,margin:0}}>Editing: {editingTemplate.name}</p>
              <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={saveEditedTemplate}>Save changes</button><button style={s.btn("#94a3b8")} onClick={()=>setEditingTemplate(null)}>Cancel</button></div>
            </div>
            <div style={s.g2}>
              <div><label style={s.lbl}>Name</label><input style={s.inp} value={editingTemplate.name} onChange={e=>setEditingTemplate((v:any)=>({...v,name:e.target.value}))}/></div>
              <div><label style={s.lbl}>Type</label><select style={s.sel} value={editingTemplate.type} onChange={e=>setEditingTemplate((v:any)=>({...v,type:e.target.value}))}>{TEMPLATE_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={s.lbl}>Description</label><input style={s.inp} value={editingTemplate.description} onChange={e=>setEditingTemplate((v:any)=>({...v,description:e.target.value}))}/></div>
              <div><label style={s.lbl}>Tags</label><input style={s.inp} value={editingTemplate.tags} onChange={e=>setEditingTemplate((v:any)=>({...v,tags:e.target.value}))}/></div>
            </div>
            <label style={s.lbl}>Body</label>
            <textarea style={{...s.inp,resize:"vertical" as const,fontFamily:"monospace",fontSize:11,marginBottom:8}} rows={14} value={editingTemplate.body} onChange={e=>setEditingTemplate((v:any)=>({...v,body:e.target.value}))}/>
            <div style={s.info}>Common merge fields: [DATE] [OWNER NAME] [OWNER ADDRESS] [SALUTATION] [LAST NAME] [COUNTY] [SECTION] [TOWNSHIP] [RANGE] [NET ACRES] [BONUS] [ROYALTY] [TERM] [TOTAL PAYMENT] [FILE NO] [RECORDING FEE]</div>
          </div>}
          {previewTemplate&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div><p style={{fontWeight:500,fontSize:13,margin:"0 0 2px"}}>{previewTemplate.name}</p><span style={s.badge("info")}>{previewTemplate.type}</span></div>
              <div style={{display:"flex",gap:6}}>
                <button style={s.btn("#64748b")} onClick={()=>copyToClipboard(previewTemplate.body)}>Copy</button>
                <button style={s.btn("#16a34a")} onClick={()=>printTemplate(previewTemplate)}>Print</button>
                <button style={s.btn("#94a3b8")} onClick={()=>setPreviewTemplate(null)}>← Back</button>
              </div>
            </div>
            <pre style={{fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap" as const,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"20px 24px",fontFamily:"serif",color:"#1e293b"}}>{previewTemplate.body}</pre>
          </div>}
        </>}

        {tab==="ecf"&&<>
          <p style={s.h1}>OCC ECF spacing & pooling alerts</p>
          <p style={s.sub}>Earliest competitive signal — spacing and pooling applications filed before any permit. Data shown is representative; see ⚙️ ECF cron setup to make this live.</p>
          <div style={s.g4}>
            {[["New",ecfCounts.New,"amber"],["Reviewed",ecfCounts.Reviewed,"info"],["Actioned",ecfCounts.Actioned,"green"],["Total",ecfAlerts.length,"gray"]].map(([l,v,c])=>(
              <div key={l as string} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",cursor:"pointer"}} onClick={()=>setEcfFilter(ecfFilter===(l as string)?"All":(l as string))}>
                <p style={{fontSize:10,color:"#64748b",margin:0}}>{l}</p>
                <p style={{fontSize:20,fontWeight:500,margin:"2px 0 0"}}>{v}</p>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {["All","New","Reviewed","Actioned"].map(f=><button key={f} style={{...s.btn(ecfFilter===f?"#3b82f6":"#94a3b8"),padding:"3px 10px",fontSize:11}} onClick={()=>setEcfFilter(f)}>{f}</button>)}
          </div>
          {filteredEcf.map((a:any)=>(
            <div key={a.id} style={{...s.card(false),borderLeft:`3px solid ${ecfColor(a.type)}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2,flexWrap:"wrap" as const}}>
                    <span style={{fontWeight:600,fontSize:13}}>{a.type}</span>
                    <span style={{...s.badge("gray"),color:ecfColor(a.type)}}>Case {a.case}</span>
                    <span style={s.badge(a.status==="New"?"amber":a.status==="Reviewed"?"info":"green")}>{a.status}</span>
                  </div>
                  <p style={{fontSize:12,margin:"0 0 2px"}}><strong>{a.legal}</strong> · {a.county} Co · Operator: {a.operator}</p>
                  {a.notes&&<p style={{fontSize:11,color:"#d97706",margin:0}}>⚠ {a.notes}</p>}
                </div>
                <div style={{display:"flex",flexDirection:"column" as const,gap:3,marginLeft:8}}>
                  <button style={{...s.btn("#d97706"),padding:"3px 8px",fontSize:11}} onClick={()=>markEcf(a.id,"Reviewed")}>Reviewed</button>
                  <button style={{...s.btn("#16a34a"),padding:"3px 8px",fontSize:11}} onClick={()=>markEcf(a.id,"Actioned")}>Actioned</button>
                  <a href="https://case.occ.ok.gov" target="_blank" rel="noreferrer" style={{...s.btn("#3b82f6"),padding:"3px 8px",fontSize:11,textDecoration:"none",textAlign:"center" as const}}>ECF ↗</a>
                </div>
              </div>
            </div>
          ))}
        </>}

        {tab==="radar"&&<>
          <p style={s.h1}>Drilling activity radar</p>
          <p style={s.sub}>Live well data from OCC public GIS (gis.occ.ok.gov).</p>
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"flex-end"}}>
            <div style={{flex:1}}><label style={s.lbl}>County</label><select style={s.sel} value={occCounty} onChange={e=>setOccCounty(e.target.value)}><option value="">All counties</option>{COUNTIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <button style={s.btn()} onClick={queryOCC}>{occLoading?"Querying…":"Query live OCC data"}</button>
          </div>
          {occ.length>0&&<table style={s.tbl}><thead><tr>{["Well","Operator","County","Sec-Twp-Rge","Status"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead><tbody>{occ.map((w:any,i:number)=><tr key={i}><td style={s.td}>{w.well_name||"(unnamed)"}</td><td style={{...s.td,color:"#64748b"}}>{w.operator||"—"}</td><td style={s.td}>{w.county||"—"}</td><td style={{...s.td,color:"#64748b"}}>{w.section}-{w.township}{w.township_d}-{w.range}{w.range_d}</td><td style={s.td}><span style={s.badge("info")}>{w.wellstatus||"—"}</span></td></tr>)}</tbody></table>}
          {!occLoading&&occ.length===0&&<p style={{color:"#94a3b8",fontSize:12}}>Select a county and click Query.</p>}
        </>}

        {tab==="heirs"&&<>
          <p style={s.h1}>Heir & beneficiary research</p>
          <div style={s.info}>Sources: FamilySearch (LDS) · Legacy.com · Findagrave · SSDI · OK Probate · Newspapers.com · General web &nbsp;|&nbsp; <strong>Pending:</strong> Ancestry.com API · FamilySearch developer key</div>
          <div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Full name *</label><input style={s.inp} value={heirForm.name} onChange={e=>setHeirForm(v=>({...v,name:e.target.value}))} placeholder="James Earl Whitfield"/></div>
              <div><label style={s.lbl}>State</label><input style={s.inp} value={heirForm.state} onChange={e=>setHeirForm(v=>({...v,state:e.target.value}))} placeholder="Oklahoma"/></div>
              <div><label style={s.lbl}>Last known county</label><input style={s.inp} value={heirForm.county} onChange={e=>setHeirForm(v=>({...v,county:e.target.value}))} placeholder="Woodward"/></div>
              <div><label style={s.lbl}>Date of birth</label><input style={s.inp} value={heirForm.dob} onChange={e=>setHeirForm(v=>({...v,dob:e.target.value}))} placeholder="1924"/></div>
              <div><label style={s.lbl}>Date of death</label><input style={s.inp} value={heirForm.dod} onChange={e=>setHeirForm(v=>({...v,dod:e.target.value}))} placeholder="circa 1985"/></div>
              <div><label style={s.lbl}>Mineral location</label><input style={s.inp} value={heirForm.minerals} onChange={e=>setHeirForm(v=>({...v,minerals:e.target.value}))} placeholder="Sec 21-18N-26W, Ellis Co"/></div>
            </div>
            <div style={{marginBottom:8}}><label style={s.lbl}>Additional context</label><textarea style={{...s.inp,resize:"vertical" as const}} rows={2} value={heirForm.notes} onChange={e=>setHeirForm(v=>({...v,notes:e.target.value}))} placeholder="Address on deed, known relatives…"/></div>
            <button style={s.btn("#16a34a")} onClick={runHeirSearch} disabled={heirLoading||!heirForm.name.trim()}>{heirLoading?"🔍 Searching…":"Run heir research ↗"}</button>
          </div>
          {heirReport&&!heirReport._raw&&(()=>{
            const r=heirReport;const sub=r.subject||{};const fam=r.family||[];
            const conf=sub.confidence||r.confidenceScore||0;
            const confColor=conf>=85?"#16a34a":conf>=60?"#d97706":"#dc2626";
            const subjectKey=`${sub.name||heirForm.name}-subject`;
            return(<div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <p style={{fontWeight:600,fontSize:14,margin:0}}>{sub.name||heirForm.name}</p>
                <div style={{textAlign:"right" as const}}><span style={{fontSize:18,fontWeight:700,color:confColor}}>{conf}%</span><p style={{fontSize:10,color:"#64748b",margin:0}}>confidence</p></div>
              </div>
              <div style={{...s.card(false),background:"#fafafa",marginBottom:10}}>
                <p style={{fontWeight:500,fontSize:12,margin:"0 0 6px"}}>Family tree — verify members to populate</p>
                {renderTree(r)}
              </div>
              <div style={{...s.card(false),marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="checkbox" checked={!!treeVerified[subjectKey]} onChange={()=>toggleVerifyMember(subjectKey)} style={{width:14,height:14}}/>
                  <div style={{flex:1}}><span style={{fontWeight:500,fontSize:12}}>{sub.name||heirForm.name}</span><span style={{...s.badge("purple"),marginLeft:6}}>Subject</span><p style={{fontSize:10,color:"#64748b",margin:"2px 0 0"}}>Born: {sub.dob||"?"} · Died: {sub.dod||"unknown"}</p></div>
                </div>
              </div>
              {fam.map((f:any,i:number)=>(
                <div key={i} style={{...s.card(false),marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="checkbox" checked={!!treeVerified[`${sub.name}-${i}`]} onChange={()=>toggleVerifyMember(`${sub.name}-${i}`)} style={{width:14,height:14,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center"}}><span style={{fontWeight:500,fontSize:12}}>{f.name}</span><span style={s.badge("gray")}>{f.relationship}</span><span style={s.badge(f.status==="living"?"green":"gray")}>{f.status}</span><span style={s.badge(f.heirStatus==="heir"?"info":"gray")}>{f.heirStatus}</span></div>
                      <p style={{fontSize:10,color:"#64748b",margin:"2px 0 0"}}>{f.dob?`Born: ${f.dob}`:""}{f.dod?` · Died: ${f.dod}`:""}{f.lastKnownAddress?` · ${f.lastKnownAddress}`:""}</p>
                    </div>
                  </div>
                </div>
              ))}
              {r.obituary?.found&&<div style={{...s.card(false),marginBottom:8}}><p style={{fontWeight:500,fontSize:12,margin:"0 0 4px"}}>Obituary</p><p style={{fontSize:12,margin:"0 0 2px"}}>{r.obituary.summary}</p><p style={{fontSize:11,color:"#3b82f6",margin:0}}>{r.obituary.source}</p></div>}
              {(r.sources||[]).length>0&&<div style={{...s.card(false),marginBottom:8}}><p style={{fontWeight:500,fontSize:12,margin:"0 0 6px"}}>Sources</p>{r.sources.map((src:any,i:number)=><div key={i} style={{fontSize:11,padding:"3px 0",borderBottom:"0.5px solid #f1f5f9"}}><span style={s.badge("info")}>{src.type}</span><span style={{marginLeft:6,color:"#64748b"}}>{src.source}</span>{src.relevance&&<span style={{marginLeft:6,color:"#94a3b8"}}>— {src.relevance}</span>}</div>)}</div>}
              {r.researchNotes&&<div style={s.warn}>{r.researchNotes}</div>}
              <button style={{...s.btn("#7c3aed"),marginTop:6}} onClick={()=>window.print()}>Print genealogical report</button>
            </div>);
          })()}
          {heirSaved.length>0&&!heirReport&&<div style={{marginTop:12}}><p style={{fontSize:11,color:"#64748b",margin:"0 0 6px"}}>Previous searches</p>{heirSaved.slice(0,5).map((h:any)=><div key={h.id} style={{...s.card(false),display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><p style={{fontWeight:500,fontSize:12,margin:0}}>{h.subject}</p><p style={{fontSize:10,color:"#94a3b8",margin:0}}>{new Date(h.created_at).toLocaleDateString()}</p></div><button style={{...s.btn(),fontSize:11,padding:"3px 8px"}} onClick={()=>setHeirReport(h.report)}>View</button></div>)}</div>}
        </>}

        {tab==="cases"&&<>
          <div style={s.hdr}>
            <p style={s.h1}>Case management{activeCase&&<span style={{fontSize:11,fontWeight:400,color:"#64748b"}}> — {activeCase.title}</span>}</p>
            <div style={{display:"flex",gap:6}}>
              {activeCase&&<button style={s.btn("#64748b")} onClick={()=>setActiveCase(null)}>← All cases</button>}
              <button style={s.btn("#16a34a")} onClick={()=>setShowNewCase(v=>!v)}>+ New case</button>
            </div>
          </div>
          {showNewCase&&<div style={{...s.card(false),background:"#f8fafc",marginBottom:12}}>
            <div style={s.g2}>
              <div><label style={s.lbl}>Title *</label><input style={s.inp} value={newCase.title} onChange={e=>setNewCase(v=>({...v,title:e.target.value}))} placeholder="Estate of James Whitfield"/></div>
              <div><label style={s.lbl}>Type</label><select style={s.sel} value={newCase.type} onChange={e=>setNewCase(v=>({...v,type:e.target.value}))}>{["Probate","Quiet Title","Mineral Acquisition","Lease Negotiation","Title Curative","Heirship Research"].map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={s.lbl}>County</label><select style={s.sel} value={newCase.county} onChange={e=>setNewCase(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={s.lbl}>Assigned to</label><select style={s.sel} value={newCase.assignee} onChange={e=>setNewCase(v=>({...v,assignee:e.target.value}))}>{TEAM.map(t=><option key={t}>{t}</option>)}</select></div>
            </div>
            <div style={{marginBottom:8}}><label style={s.lbl}>Description</label><textarea style={{...s.inp,resize:"vertical" as const}} rows={2} value={newCase.description} onChange={e=>setNewCase(v=>({...v,description:e.target.value}))}/></div>
            <div style={{display:"flex",gap:6}}><button style={s.btn("#16a34a")} onClick={addCase}>Create</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewCase(false)}>Cancel</button></div>
          </div>}
          {!activeCase&&<div>{cases.length===0&&<p style={{color:"#94a3b8",fontSize:12}}>No cases yet.</p>}{cases.map((c:any)=><div key={c.id} style={{...s.card(false),display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setActiveCase(c)}><div><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}><span style={{fontWeight:500,fontSize:13}}>{c.title}</span><span style={s.badge("amber")}>{c.type}</span><span style={s.badge("green")}>{c.status}</span></div><p style={{fontSize:11,color:"#64748b",margin:0}}>{c.county} Co · {c.assignee} · {c.tasks?.length||0} tasks</p></div><span style={{color:"#94a3b8"}}>›</span></div>)}</div>}
          {activeCase&&(()=>{
            const ac=cases.find((c:any)=>c.id===activeCase.id)||activeCase;
            const pending=(ac.tasks||[]).filter((t:any)=>t.status!=="Complete");
            const done=(ac.tasks||[]).filter((t:any)=>t.status==="Complete");
            return(<div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:12}}>
              <div>
                <div style={{...s.card(false),background:"#f8fafc",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <p style={{fontWeight:500,fontSize:12,margin:0}}>Tasks ({pending.length} pending)</p>
                    <div style={{display:"flex",gap:4}}>
                      <label style={{...s.btn("#7c3aed"),fontSize:11,padding:"3px 8px",cursor:"pointer"}}>📎 Upload<input type="file" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=(ev)=>setUploadedDoc(ev.target?.result as string);r.readAsText(f);}}} style={{display:"none"}}/></label>
                      <button style={{...s.btn("#16a34a"),fontSize:11,padding:"3px 8px"}} onClick={()=>setShowNewTask(v=>!v)}>+ Task</button>
                    </div>
                  </div>
                  {uploadedDoc&&<p style={{fontSize:10,color:"#16a34a",margin:0}}>📄 Doc uploaded — AI will use as context.</p>}
                  {showNewTask&&<div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:8,marginTop:8}}>
                    <div style={s.g2}>
                      <div style={{gridColumn:"1/-1"}}><label style={s.lbl}>Task *</label><input style={s.inp} value={newTask.title} onChange={e=>setNewTask(v=>({...v,title:e.target.value}))} placeholder="Draft probate petition…"/></div>
                      <div><label style={s.lbl}>Assign to</label><select style={s.sel} value={newTask.assignee} onChange={e=>setNewTask(v=>({...v,assignee:e.target.value}))}>{[...TEAM,"AI Assistant"].map(t=><option key={t}>{t}</option>)}</select></div>
                      <div><label style={s.lbl}>Priority</label><select style={s.sel} value={newTask.priority} onChange={e=>setNewTask(v=>({...v,priority:e.target.value}))}>{["Low","Normal","High","Urgent"].map(p=><option key={p}>{p}</option>)}</select></div>
                      <div><label style={s.lbl}>Due</label><input type="date" style={s.inp} value={newTask.due} onChange={e=>setNewTask(v=>({...v,due:e.target.value}))}/></div>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:6}}><button style={s.btn("#16a34a")} onClick={addTask}>Add</button><button style={s.btn("#94a3b8")} onClick={()=>setShowNewTask(false)}>Cancel</button></div>
                  </div>}
                </div>
                {pending.map((t:any)=><div key={t.id} style={{...s.card(false),borderLeft:`3px solid ${t.priority==="Urgent"?"#dc2626":t.priority==="High"?"#f59e0b":"#e2e8f0"}`,marginBottom:5}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1}}><p style={{fontWeight:500,fontSize:12,margin:"0 0 3px"}}>{t.title}</p><div style={{display:"flex",gap:4}}><span style={s.badge("gray")}>{t.priority}</span><span style={s.badge("gray")}>→ {t.assignee}</span></div></div>
                    <div style={{display:"flex",gap:3}}><button style={{...s.btn("#7c3aed"),padding:"2px 7px",fontSize:10}} onClick={()=>runAiDraft(t)}>🤖 AI</button><button style={{...s.btn("#16a34a"),padding:"2px 7px",fontSize:10}} onClick={()=>updateTask(t.id,{status:"Complete",completedAt:new Date().toISOString()})}>✓</button></div>
                  </div>
                </div>)}
                {done.length>0&&<><p style={{fontSize:11,color:"#64748b",margin:"8px 0 4px"}}>Done ({done.length})</p>{done.map((t:any)=><div key={t.id} style={{...s.card(false),opacity:0.6,marginBottom:4,padding:"6px 10px"}}><span style={{fontSize:12,textDecoration:"line-through",color:"#94a3b8"}}>{t.title}</span>{t.reviewed&&<span style={{...s.badge("green"),marginLeft:6}}>AI reviewed</span>}</div>)}</>}
                {aiDraftLoading&&<div style={{...s.info,marginTop:8}}>🤖 AI drafting…</div>}
                {aiDraft&&aiTaskTarget&&<div style={{border:"2px solid #7c3aed",borderRadius:8,padding:12,marginTop:8,background:"#faf5ff"}}>
                  <p style={{fontWeight:600,fontSize:13,color:"#7c3aed",margin:"0 0 6px"}}>🤖 AI Draft — Review Required</p>
                  <div style={s.warn}>Verify all facts, names, legal descriptions, and citations before approving.</div>
                  <pre style={{fontSize:11,whiteSpace:"pre-wrap" as const,lineHeight:1.5,background:"#fff",padding:10,borderRadius:6,border:"1px solid #e2e8f0",maxHeight:260,overflowY:"auto" as const}}>{aiDraft}</pre>
                  <div style={{display:"flex",gap:6,marginTop:8}}><button style={s.btn("#16a34a")} onClick={approveAiDraft}>✓ Approve</button><button style={s.btn("#dc2626")} onClick={()=>{setAiDraft(null);setAiTaskTarget(null);}}>✕ Reject</button></div>
                </div>}
              </div>
              <div style={{borderLeft:"1px solid #e2e8f0",paddingLeft:12}}>
                <p style={{fontWeight:500,fontSize:12,margin:"0 0 6px"}}>🤖 AI Assistant</p>
                <div style={{border:"1px solid #e2e8f0",borderRadius:8,height:260,overflowY:"auto" as const,padding:8,marginBottom:6,background:"#f8fafc",display:"flex",flexDirection:"column" as const,gap:6}}>
                  {aiChat.length===0&&<p style={{fontSize:11,color:"#94a3b8",textAlign:"center" as const,marginTop:40}}>Ask about this case…</p>}
                  {aiChat.map((m:any,i:number)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"88%",background:m.role==="user"?"#3b82f6":"#fff",color:m.role==="user"?"#fff":"#1e293b",border:m.role==="assistant"?"1px solid #e2e8f0":"none",borderRadius:8,padding:"6px 9px",fontSize:11,lineHeight:1.5,whiteSpace:"pre-wrap" as const}}>{m.content}</div></div>)}
                  {aiChatLoading&&<p style={{fontSize:11,color:"#7c3aed"}}>🤖 Thinking…</p>}
                </div>
                <div style={{display:"flex",gap:4}}><input style={{...s.inp,flex:1,fontSize:11}} value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAiChat()} placeholder="Ask the AI…"/><button style={{...s.btn("#7c3aed"),padding:"4px 8px",fontSize:11}} onClick={sendAiChat}>↗</button></div>
                <div style={{marginTop:6,display:"flex",flexDirection:"column" as const,gap:3}}>
                  {["Draft letter to county clerk","Next steps?","What statutes apply?"].map(q=><button key={q} style={{border:"1px solid #e2e8f0",background:"#fff",borderRadius:5,padding:"3px 7px",fontSize:10,color:"#64748b",cursor:"pointer",textAlign:"left" as const}} onClick={()=>setAiInput(q)}>{q}</button>)}
                </div>
              </div>
            </div>);
          })()}
        </>}

        {tab==="documents"&&<>
          <p style={s.h1}>Document audit log</p>
          <p style={s.sub}>All generated instruments logged here. Written to Supabase doc_log table.</p>
          {docLog.length===0&&<p style={{color:"#94a3b8",fontSize:12}}>No documents logged yet.</p>}
          {docLog.length>0&&<table style={s.tbl}><thead><tr>{["Tract","Doc type","Generated by","Date"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead><tbody>{docLog.map((d:any)=><tr key={d.id}><td style={s.td}>{d.tract||d.owner_names}</td><td style={s.td}>{d.doc_type}</td><td style={{...s.td,color:"#64748b"}}>{d.generated_by}</td><td style={{...s.td,color:"#94a3b8"}}>{new Date(d.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>}
        </>}

        {tab==="records"&&<>
          <p style={s.h1}>County records search</p>
          <p style={s.sub}>Via Supabase edge function → OKCountyRecords.com. 150 free results/day then $0.01/result.</p>
          <div style={s.g4}>
            <div><label style={s.lbl}>County</label><select style={s.sel} value={recSearch.county} onChange={e=>setRecSearch(v=>({...v,county:e.target.value}))}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label style={s.lbl}>Doc type</label><select style={s.sel} value={recSearch.type} onChange={e=>setRecSearch(v=>({...v,type:e.target.value}))}>{["Any","Mineral Deed","Oil & Gas Lease","Mortgage","Affidavit of Heirship","Quit Claim Deed"].map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={s.lbl}>Section-Twp-Rge</label><input style={s.inp} value={recSearch.legal} onChange={e=>setRecSearch(v=>({...v,legal:e.target.value}))} placeholder="14-22N-18W"/></div>
            <div><label style={s.lbl}>Grantor / Grantee</label><input style={s.inp} value={recSearch.name} onChange={e=>setRecSearch(v=>({...v,name:e.target.value}))} placeholder="Whitfield"/></div>
          </div>
          <button style={s.btn()} onClick={searchRecords}>{recLoading?"Searching…":"Search county records"}</button>
          {recErr&&<p style={{color:"#dc2626",fontSize:12,marginTop:6}}>{recErr}</p>}
          {recResults&&Array.isArray(recResults)&&recResults.length===0&&<p style={{color:"#94a3b8",fontSize:12,marginTop:8}}>No instruments found.</p>}
          {recResults&&Array.isArray(recResults)&&recResults.length>0&&<div style={{marginTop:10}}>
            <table style={s.tbl}><thead><tr>{["Parties","Type","Legal","Book/Page","Recorded"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{recResults.map((r:any,i:number)=><tr key={i}><td style={s.td}>{(r.parties||[]).map((p:any)=>p.name).join(" / ")}</td><td style={{...s.td,color:"#64748b"}}>{r.type}</td><td style={{...s.td,color:"#64748b"}}>{(r.legal_descriptions||[]).map((l:any)=>l.legal).join("; ")}</td><td style={{...s.td,color:"#94a3b8"}}>{r.book}/{r.beginning_page}</td><td style={{...s.td,color:"#94a3b8"}}>{r.returned_date?new Date(r.returned_date).toLocaleDateString():""}</td></tr>)}</tbody></table>
          </div>}
        </>}

        {tab==="legal"&&<>
          <p style={s.h1}>Legal work — probate & quiet title</p>
          <p style={s.sub}>Generate first-draft petitions based on your filing history. Attorney review required before any filing.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
            <button style={s.btn()} onClick={()=>alert("Open the probate petition generator in a new case under Case mgmt → + New case")}>+ New probate matter</button>
            <button style={s.btn("#7c3aed")} onClick={()=>alert("Open a quiet title suit under Case mgmt → + New case → Quiet Title")}>+ New quiet title suit</button>
          </div>
          <div style={{...s.info,marginTop:12}}>Legal drafts are handled through the Case mgmt tab — create a case, add tasks, and use the 🤖 AI draft button on each task to generate first drafts for review. Probate petition generator is also available in the Legal work section of the full dashboard widget.</div>
        </>}

      </div>
    </div>
  );
}
