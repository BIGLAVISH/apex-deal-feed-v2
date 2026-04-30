let allDeals = [];
let allLenders = [];
let alertHistory = JSON.parse(localStorage.getItem('apex_alerts') || '[]');
let deferredPrompt;

const $ = id => document.getElementById(id);
const money = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick = async () => { if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; }};

document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tabPane').forEach(p=>p.classList.remove('active'));btn.classList.add('active');$(btn.dataset.tab).classList.add('active');});

$('loadDemoBtn').onclick = loadFeed;
$('searchInput').oninput = renderDeals;
$('stageFilter').onchange = renderDeals;
$('enableAlertsBtn').onclick = enableAlerts;
$('exportBtn').onclick = exportQualified;
$('csvInput').onchange = e => importCSV(e.target.files[0]);

async function loadFeed(){
  try{
    const [dealsRes,lendersRes] = await Promise.all([fetch('data/deals.json'), fetch('data/lenders.json')]);
    allDeals = await dealsRes.json();
    allLenders = await lendersRes.json();
    processAndRender();
  } catch(err){
    alert('Feed failed to load. Check data/deals.json and data/lenders.json.');
    console.error(err);
  }
}

function processAndRender(){
  allDeals = allDeals.map(d=>({ ...d, score: scoreDeal(d), stage: stageDeal(scoreDeal(d)), spread: Number(d.arv||0)-Number(d.price||0) }));
  triggerAlerts();
  renderStats(); renderDeals(); renderAlerts(); renderLenders();
}

function scoreDeal(d){
  const price = Number(d.price||0), arv = Number(d.arv||0), rent = Number(d.rent||0), tax = Number(d.tax_due||0), units = Number(d.units||1);
  const spread = arv - price;
  let s = 0;
  if(spread >= 200000) s += 40; else if(spread >= 100000) s += 32; else if(spread >= 50000) s += 22; else if(spread >= 25000) s += 12;
  const equityPct = arv ? spread/arv : 0;
  if(equityPct >= .35) s += 20; else if(equityPct >= .25) s += 14; else if(equityPct >= .15) s += 8;
  if(String(d.distress).toLowerCase()==='true') s += 18;
  if(String(d.absentee).toLowerCase()==='true') s += 12;
  if(tax >= 10000) s += 12; else if(tax >= 5000) s += 7;
  if(units >= 5) s += 10; else if(units >= 2) s += 6;
  if(rent && price){ const y = rent*12/price; if(y>=.16) s+=12; else if(y>=.12) s+=8; else if(y>=.09) s+=4; }
  if(String(d.strategy||'').toLowerCase().includes('construction') || String(d.property_type||'').toLowerCase().includes('land')) s += 8;
  return Math.min(100, Math.round(s));
}
function stageDeal(s){ if(s>=85) return 'APEX'; if(s>=70) return 'HOT'; if(s>=50) return 'WATCH'; return 'REJECT'; }

function renderStats(){
  $('totalDeals').textContent = allDeals.length;
  $('apexDeals').textContent = allDeals.filter(d=>d.stage==='APEX').length;
  $('hotDeals').textContent = allDeals.filter(d=>d.stage==='HOT').length;
  $('watchDeals').textContent = allDeals.filter(d=>d.stage==='WATCH').length;
}

function renderDeals(){
  const q = $('searchInput').value.toLowerCase(); const f = $('stageFilter').value;
  const deals = allDeals.filter(d => (f==='ALL'||d.stage===f) && JSON.stringify(d).toLowerCase().includes(q)).sort((a,b)=>b.score-a.score);
  $('dealList').innerHTML = deals.map(dealCard).join('') || '<div class="card">No matching deals.</div>';
}
function dealCard(d){
  const lenders = matchLenders(d).slice(0,3).map(l=>`<span class="lender-pill">${l.name} • ${l.difficulty}</span>`).join('');
  return `<article class="deal-card"><div class="deal-head"><div><h3>${d.address||'Unknown Address'}</h3><p class="reason">${d.city||''} ${d.state||''} • ${d.property_type||'Property'} • ${d.strategy||'Equity Play'}</p></div><span class="badge ${d.stage}">${d.stage} ${d.score}</span></div><div class="metrics"><div class="metric"><small>Price</small><strong>$${money(d.price)}</strong></div><div class="metric"><small>ARV</small><strong>$${money(d.arv)}</strong></div><div class="metric"><small>Spread</small><strong>$${money(d.spread)}</strong></div><div class="metric"><small>Rent</small><strong>$${money(d.rent)}</strong></div></div><p class="reason"><b>Why:</b> ${reasons(d).join(' • ')}</p><div>${lenders}</div></article>`;
}
function reasons(d){ const r=[]; if(d.spread>=100000) r.push('large equity spread'); if(String(d.distress).toLowerCase()==='true') r.push('distress signal'); if(String(d.absentee).toLowerCase()==='true') r.push('absentee owner'); if(Number(d.tax_due||0)>5000) r.push('tax pressure'); if(Number(d.units||1)>1) r.push('multi-unit upside'); if(!r.length) r.push('needs deeper review'); return r; }

function matchLenders(d){
  const type = String(d.property_type||'').toLowerCase(); const strategy = String(d.strategy||'').toLowerCase();
  return allLenders.filter(l=>{
    const products = String(l.products||'').toLowerCase();
    if(type.includes('land') || strategy.includes('construction')) return products.includes('land') || products.includes('construction') || products.includes('ground');
    if(strategy.includes('dscr') || strategy.includes('rental') || strategy.includes('brrrr')) return products.includes('dscr') || products.includes('rental');
    return products.includes('fix') || products.includes('bridge') || products.includes('dscr');
  }).sort((a,b)=>difficultyRank(a.difficulty)-difficultyRank(b.difficulty));
}
function difficultyRank(x){ return {Easy:1,Moderate:2,Hard:3}[x]||9; }
function renderLenders(){ $('lenderList').innerHTML = allLenders.map(l=>`<div class="deal-card"><div class="deal-head"><h3>${l.name}</h3><span class="badge ${l.difficulty==='Easy'?'HOT':l.difficulty==='Moderate'?'WATCH':'REJECT'}">${l.difficulty}</span></div><p class="reason">${l.products}</p><p class="reason">Bureau: ${l.bureau||'Varies'} • States: ${l.states||'National'}</p></div>`).join(''); }

function triggerAlerts(){
  const seen = new Set(alertHistory.map(a=>a.key));
  allDeals.filter(d=>['APEX','HOT'].includes(d.stage)).forEach(d=>{
    const key = `${d.address}-${d.score}`;
    if(!seen.has(key)){
      const item = {key, time:new Date().toLocaleString(), message:`${d.stage}: ${d.address} scored ${d.score} with $${money(d.spread)} spread`};
      alertHistory.unshift(item); seen.add(key);
      if(Notification.permission==='granted') new Notification('Apex Deal Alert', {body:item.message});
      if(navigator.vibrate) navigator.vibrate([120,60,120]);
    }
  });
  alertHistory = alertHistory.slice(0,50); localStorage.setItem('apex_alerts', JSON.stringify(alertHistory));
}
function renderAlerts(){ $('alertList').innerHTML = alertHistory.map(a=>`<div class="deal-card"><h3>${a.message}</h3><p class="reason">${a.time}</p></div>`).join('') || '<div class="card">No alerts yet.</div>'; }
async function enableAlerts(){ if(!('Notification' in window)) return alert('Browser notifications not supported.'); const p = await Notification.requestPermission(); alert(p==='granted'?'Alerts enabled.':'Alerts not enabled.'); }

function importCSV(file){
  if(!file) return; const reader = new FileReader();
  reader.onload = () => { const rows = reader.result.split(/\r?\n/).filter(Boolean); const headers = rows.shift().split(',').map(h=>h.trim()); allDeals = rows.map(row=>{ const vals=row.split(','); return Object.fromEntries(headers.map((h,i)=>[h, vals[i]?.trim()||''])); }); processAndRender(); };
  reader.readAsText(file);
}
function exportQualified(){
  const deals = allDeals.filter(d=>['APEX','HOT'].includes(d.stage));
  const headers = ['address','city','state','property_type','price','arv','rent','spread','score','stage','strategy'];
  const csv = [headers.join(','), ...deals.map(d=>headers.map(h=>`"${String(d[h]??'').replaceAll('"','""')}"`).join(','))].join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='apex_qualified_deals.csv'; a.click();
}

if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
loadFeed();
