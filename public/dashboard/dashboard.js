const $ = (id) => document.getElementById(id);
const API = location.origin;
let token = sessionStorage.getItem('fms_admin_token') || '';
$('token').value = token;
const auth = () => ({Authorization:`Bearer ${$('token').value.trim()}`,'Content-Type':'application/json'});
const fmt = (s=0)=>{s=Math.max(0,Math.round(Number(s)||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return [h?`${h}h`:null,m?`${m}m`:null,`${x}s`].filter(Boolean).join(' ')};
const safe = (v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,opts={}){const r=await fetch(API+path,{...opts,headers:{...auth(),...(opts.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
async function load(){token=$('token').value.trim();sessionStorage.setItem('fms_admin_token',token);$('notice').textContent='Loading…';try{const u=await api('/api/v1/users');const all=[];for(const user of u.users||[]){const d=await api('/api/v1/devices?userId='+encodeURIComponent(user.userId));all.push(...(d.devices||[]));}render(all);$('notice').textContent=`${all.length} registered device(s). Live-call v1.7 rescans active Android notifications and foreground devices poll dashboard requests every 5 seconds.`;}catch(e){$('notice').textContent=e.message}}
function render(devices){$('devices').innerHTML=devices.map(d=>`<div class="card" id="card-${safe(d.deviceId)}"><div class="title">${safe(d.deviceName)}</div><div class="muted">${safe(d.userName)} · ${safe(d.deviceId)}</div><div class="row" style="margin-top:10px"><button onclick="requestLogs('${encodeURIComponent(d.deviceId)}')">Request latest logs</button><button class="secondary" onclick="requestCurrentCall('${encodeURIComponent(d.deviceId)}')">Request current call</button></div><div id="live-${safe(d.deviceId)}" class="live">Current call: checking…</div><div id="status-${safe(d.deviceId)}" class="status"></div><div id="logs-${safe(d.deviceId)}" class="logs hidden"></div></div>`).join('');devices.forEach(d=>refreshLive(encodeURIComponent(d.deviceId)));}
async function refreshLive(encoded){const id=decodeURIComponent(encoded);const box=$('live-'+id);try{const b=await api('/api/v1/admin/devices/'+encoded+'/live');const live=b.live;const c=live?.currentCall;if(c?.active){box.className='live call-active';const age=live.observedAt?Math.round((Date.now()-new Date(live.observedAt))/1000):null;const liveDuration=c.startedAt?Math.max(Number(c.durationSeconds||0),Math.round((Date.now()-new Date(c.startedAt))/1000)):Number(c.durationSeconds||0);const detail=[c.type,c.direction].filter(Boolean).join(' · ');const tech=[c.packageName,c.detection,c.confidence].filter(Boolean).join(' · ');box.innerHTML=`<b>☎ CURRENT CALL</b><br><span class="call-name">${safe(c.contactName||'Unknown')}</span>${c.phoneNumber?` · <b>${safe(c.phoneNumber)}</b>`:''}<br>${safe(detail)} · <b data-started="${safe(c.startedAt||'')}">${fmt(liveDuration)}</b>${c.descriptor?`<br><span class="muted">${safe(c.descriptor)}</span>`:''}${tech?`<br><span class="muted">detected: ${safe(tech)}</span>`:''}${age!=null?`<br><span class="muted">device update ${age}s ago${age>45?' · state may be stale':''}</span>`:''}`;}else{box.className='live';box.innerHTML=`<b>No active call reported</b>${live?.observedAt?`<br><span class="muted">last device update ${safe(new Date(live.observedAt).toLocaleString())}</span>`:''}`}}catch(e){box.textContent='Current call unavailable: '+e.message}}

function renderSnapshot(result){
  const usage=(result?.usageEvents||[]).slice().sort((a,b)=>Number(b.durationSeconds||0)-Number(a.durationSeconds||0)).slice(0,20);
  const calls=(result?.phoneCalls||[]).slice(-15).reverse();
  const wa=(result?.whatsappCalls||[]).slice(-15).reverse();
  const msgs=(result?.messages||[]).slice(-20).reverse();
  const rows=(title,items,fn)=>`<h4>${title}</h4>${items.length?items.map(fn).join(''):'<div class="muted">No records in snapshot.</div>'}`;
  return [
    `<div class="muted">Generated ${result?.generatedAt?new Date(Number(result.generatedAt)).toLocaleString():'now'} · last ${safe(result?.windowHours||24)}h</div>`,
    rows('Top app usage',usage,x=>`<div>${safe(x.appName||x.packageName)} — <b>${fmt(x.durationSeconds)}</b>${x.sessionCount?` · ${safe(x.sessionCount)} sessions`:''}</div>`),
    rows('Recent regular calls',calls,x=>`<div>${safe(x.contactName||x.phoneNumber||'Unknown')} ${x.phoneNumber?`· ${safe(x.phoneNumber)}`:''} — ${safe(x.direction)} · <b>${fmt(x.durationSeconds)}</b></div>`),
    rows('Recent WhatsApp calls',wa,x=>`<div>${safe(x.contactLabel||'Unknown')} ${x.matchedPhoneNumber?`· ${safe(x.matchedPhoneNumber)}`:''} — ${safe(x.direction)} · <b>${fmt(x.durationSeconds)}</b></div>`),
    rows('Recent message activity',msgs,x=>`<div>${safe(x.appName||x.packageName)} · ${safe(x.senderLabel||'Unknown')} ${x.matchedPhoneNumber?`· ${safe(x.matchedPhoneNumber)}`:''}</div>`)
  ].join('');
}

async function requestLogs(encoded){const id=decodeURIComponent(encoded),status=$('status-'+id),logs=$('logs-'+id);status.textContent='Request queued…';logs.classList.add('hidden');try{const c=await api('/api/v1/admin/devices/'+encoded+'/commands',{method:'POST',body:JSON.stringify({type:'refresh_logs'})});const deadline=Date.now()+30000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,1500));const result=await api('/api/v1/admin/commands/'+encodeURIComponent(c.commandId));if(result.command.status==='completed'){status.textContent='Fresh device snapshot received ✓';logs.classList.remove('hidden');logs.innerHTML=renderSnapshot(result.command.result);refreshLive(encoded);return;}}status.textContent='Still waiting for device. If FMS is open, v1.7 polls every 5s; otherwise Android notification activity or the periodic worker will pick it up.';}catch(e){status.textContent=e.message}}

async function requestCurrentCall(encoded){const id=decodeURIComponent(encoded),status=$('status-'+id);status.textContent='Requesting current call…';try{const c=await api('/api/v1/admin/devices/'+encoded+'/commands',{method:'POST',body:JSON.stringify({type:'current_call'})});const deadline=Date.now()+25000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,1000));const result=await api('/api/v1/admin/commands/'+encodeURIComponent(c.commandId));if(result.command.status==='completed'){status.textContent='Current-call request answered ✓';await refreshLive(encoded);return;}}status.textContent='No command response yet; showing the latest call heartbeat. If FMS is open it should normally answer within ~5–10s.';await refreshLive(encoded);}catch(e){status.textContent=e.message}}

$('load').onclick=load;
window.requestLogs=requestLogs;window.refreshLive=refreshLive;window.requestCurrentCall=requestCurrentCall;
if(token) load();
// Faster dashboard refresh is cheap for this private test and keeps call duration/state visibly current.
setInterval(()=>document.querySelectorAll('[id^="live-"]').forEach(el=>refreshLive(encodeURIComponent(el.id.slice(5)))),5000);
