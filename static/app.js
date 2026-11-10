'use strict';
/* Airhead browser code: menus, avatars, one-device games, community topics, and online games over a WebSocket. */

const CARD_COLORS = ['coral','sky','sun','grape','mint'];
const ROUNDS = 10, STRIKES = 3, QTIME = 20;
let NEED_VOTES = 3;

/* ---------- avatar ---------- */
const AV = {
  skin:['#F9D9B8','#EDBA8C','#D69462','#AE6430','#7E4626','#57301A'],
  hair:['none','short','spiky','bob','curly','mohawk','bun'],
  hairColor:['#2A1A10','#6B3E1F','#C9883A','#F0CF68','#D9452B','#8657D6','#22C99B','#ECECEC'],
  eyes:['dots','happy','wink','glasses','sleepy'],
  mouth:['smile','grin','o','flat','tongue'],
  hat:['none','cap','party','crown','beanie'],
  shirt:['#FF4F6D','#3E7BFA','#FFC93C','#22C99B','#7C4DFF','#1D1340','#FF8A3D','#F2F2F2']
};
const AV_LABELS = {skin:'Skin',hair:'Hair',hairColor:'Hair color',eyes:'Eyes',mouth:'Mouth',hat:'Hat',shirt:'Shirt'};
const COLOR_PARTS = new Set(['skin','hairColor','shirt']);
const pick = a => a[Math.floor(Math.random()*a.length)];
const randomAvatar = () => ({skin:pick(AV.skin),hair:pick(AV.hair),hairColor:pick(AV.hairColor),eyes:pick(AV.eyes),mouth:pick(AV.mouth),
  hat:Math.random()<.55?'none':pick(AV.hat.slice(1)),shirt:pick(AV.shirt)});
// Avatars from other players are only drawn with known values.
const okAv = a => { const o = {}; for(const k of Object.keys(AV)) o[k] = (a && AV[k].includes(a[k])) ? a[k] : AV[k][0]; return o; };
const INK = '#1D1340';

function hairBack(a){
  if(a.hair==='bob') return `<path d="M40 130 Q34 40 100 40 Q166 40 160 130Z" fill="${a.hairColor}"/>`;
  if(a.hair==='bun') return `<circle cx="100" cy="40" r="21" fill="${a.hairColor}"/>`;
  return '';
}
function hairFront(a){
  const c = a.hairColor;
  switch(a.hair){
    case 'short': case 'bun': return `<path d="M45 98 Q44 42 100 42 Q156 42 155 98 Q148 68 100 64 Q52 68 45 98Z" fill="${c}"/>`;
    case 'spiky': return `<path d="M45 96 L50 58 L64 72 L70 40 L86 62 L100 30 L114 62 L130 40 L136 72 L150 58 L155 96 Q146 70 100 66 Q54 70 45 96Z" fill="${c}"/>`;
    case 'bob': return `<path d="M46 104 Q48 46 100 46 Q152 46 154 104 Q140 70 100 70 Q70 70 46 104Z" fill="${c}"/>`;
    case 'curly': { let s=''; for(let i=0;i<9;i++){const g=Math.PI*(1.04+i*.92/8); s+=`<circle cx="${(100+52*Math.cos(g)).toFixed(1)}" cy="${(98+50*Math.sin(g)).toFixed(1)}" r="15" fill="${c}"/>`} return s; }
    case 'mohawk': return `<path d="M89 66 Q88 16 100 8 Q112 16 111 66Z" fill="${c}"/>`;
    default: return '';
  }
}
function hatSVG(h){
  switch(h){
    case 'cap': return `<path d="M47 84 Q48 38 100 38 Q152 38 153 84Z" fill="#E0344C"/><path d="M120 80 L180 86 Q182 96 160 96 L118 90Z" fill="#A61F35"/><circle cx="100" cy="40" r="5" fill="#A61F35"/>`;
    case 'party': return `<path d="M76 54 L100 -6 L124 54Z" fill="#3E7BFA"/><path d="M85 34 H115 M91 18 H109" stroke="#FFC93C" stroke-width="6"/><circle cx="100" cy="-8" r="8" fill="#FF4F6D"/>`;
    case 'crown': return `<path d="M62 56 L58 20 L80 40 L100 12 L120 40 L142 20 L138 56Z" fill="#FFC93C" stroke="#B87F00" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="44" r="5" fill="#FF4F6D"/><circle cx="78" cy="48" r="4" fill="#3E7BFA"/><circle cx="122" cy="48" r="4" fill="#22C99B"/>`;
    case 'beanie': return `<path d="M46 86 Q46 32 100 32 Q154 32 154 86Z" fill="#22C99B"/><rect x="42" y="78" width="116" height="16" rx="8" fill="#139C77"/><circle cx="100" cy="27" r="12" fill="#F3EEFF"/>`;
    default: return '';
  }
}
function eyesSVG(e){
  const st = `fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"`;
  const dot = x => `<circle cx="${x}" cy="100" r="6.5" fill="${INK}"/><circle cx="${x+2}" cy="98" r="2" fill="#fff"/>`;
  switch(e){
    case 'happy': return `<path d="M71 103 Q80 92 89 103 M111 103 Q120 92 129 103" ${st}/>`;
    case 'wink': return dot(80)+`<path d="M111 101 H129" ${st}/>`;
    case 'glasses': return `<circle cx="80" cy="100" r="14" fill="#fff" fill-opacity=".35" stroke="${INK}" stroke-width="4"/><circle cx="120" cy="100" r="14" fill="#fff" fill-opacity=".35" stroke="${INK}" stroke-width="4"/><path d="M94 100 H106" stroke="${INK}" stroke-width="4"/><circle cx="80" cy="100" r="4" fill="${INK}"/><circle cx="120" cy="100" r="4" fill="${INK}"/>`;
    case 'sleepy': return `<path d="M71 100 Q80 107 89 100 M111 100 Q120 107 129 100" ${st}/>`;
    default: return dot(80)+dot(120);
  }
}
function mouthSVG(m){
  const st = `fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"`;
  switch(m){
    case 'grin': return `<path d="M82 120 Q100 150 118 120Z" fill="${INK}"/><path d="M86 121 H114 L112 127 H88Z" fill="#fff"/>`;
    case 'o': return `<ellipse cx="100" cy="129" rx="8" ry="10" fill="${INK}"/>`;
    case 'flat': return `<path d="M88 128 H112" ${st}/>`;
    case 'tongue': return `<path d="M94 130 Q100 144 106 130Z" fill="#FF6680"/><path d="M86 124 Q100 138 114 124" ${st}/>`;
    default: return `<path d="M86 124 Q100 138 114 124" ${st}/>`;
  }
}
function avatarSVG(a, scale=1, cls=''){
  return `<svg class="av ${cls}" viewBox="0 0 200 350" aria-hidden="true">
  <g transform="translate(0 90)"><path d="M38 260 Q40 186 100 183 Q160 186 162 260Z" fill="${a.shirt}"/>
  <rect x="89" y="146" width="22" height="42" rx="9" fill="${a.skin}"/><path d="M92 186 Q100 194 108 186" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="4"/></g>
  <g transform="translate(100 248)"><g class="head" style="transform:scale(${scale})"><g transform="translate(-100 -158)">
   ${hairBack(a)}<path d="M92 150 L100 162 L108 150Z" fill="${a.skin}"/><circle cx="100" cy="100" r="55" fill="${a.skin}"/>
   <ellipse cx="76" cy="70" rx="13" ry="7" fill="#fff" opacity=".4" transform="rotate(-35 76 70)"/>
   <circle cx="69" cy="118" r="8" fill="#FF4F6D" opacity=".22"/><circle cx="131" cy="118" r="8" fill="#FF4F6D" opacity=".22"/>
   ${eyesSVG(a.eyes)}${mouthSVG(a.mouth)}${hairFront(a)}${hatSVG(a.hat)}
  </g></g></g></svg>`;
}
const avWrap = (a, scale=1, cls='') => `<div class="avwrap">${avatarSVG(a, scale, cls)}</div>`;

/* ---------- helpers ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle = a => { a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; };
const newId = (n=10) => { const c='abcdefghijklmnopqrstuvwxyz0123456789'; let s=''; const r=crypto.getRandomValues(new Uint8Array(n)); for(const b of r) s+=c[b%c.length]; return s; };
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true, 4200); }
function show(id){
  const cur = $$('.screen').find(s => !s.hidden); if(cur && cur.id === id) return;
  $$('.screen').forEach(s => s.hidden = s.id !== id); window.scrollTo({top:0});
}
function store(k, v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); }catch(e){ return null; } }
function miniHTML(p, scale=1, cls='', extra=''){ return `<div class="mini ${cls}">${avWrap(p.av, scale, cls.includes('gone')?'out':'')}<span>${esc(p.name)}</span>${extra}</div>`; }
async function api(path, opts={}){
  const res = await fetch(path, {...opts, headers:{'Content-Type':'application/json', ...(opts.headers||{})}});
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

/* This browser's anonymous id, used for community votes and to keep your seat if you reload mid-game. */
let CLIENT = store('airhead.client');
if(typeof CLIENT !== 'string' || !/^[a-z0-9]{8,40}$/.test(CLIENT)){ CLIENT = newId(20); store('airhead.client', CLIENT); }

/* ---------- roster ---------- */
let roster = store('airhead.roster');
if(!Array.isArray(roster) || !roster.length) roster = [{id:newId(), name:'Bubbles', av:randomAvatar()}];
roster.forEach(p => { p.av = okAv(p.av); p.name = String(p.name || 'Player').slice(0,14); });
let editing = roster[0].id;
const saveRoster = () => store('airhead.roster', roster);

function renderLineup(){
  $('#lineupCount').textContent = roster.length === 1 ? 'Solo' : `${roster.length} players`;
  $('#lineupAvs').innerHTML = roster.map(p => miniHTML(p)).join('');
}
function renderPlayers(){
  const p = roster.find(r => r.id === editing) || roster[0]; editing = p.id;
  $('#pgrid').innerHTML = roster.map(r => `<button class="pcard" data-pid="${r.id}" aria-pressed="${r.id===editing}">${avWrap(r.av)}<span>${esc(r.name)}</span></button>`).join('')
    + (roster.length < 8 ? `<button class="pcard addcard" id="addPlayer">+ Add player</button>` : '');
  $('#edPreview').innerHTML = avatarSVG(p.av);
  $('#pName').value = p.name;
  $('#edRemove').disabled = roster.length <= 1;
  $('#edOpts').innerHTML = Object.keys(AV).map(part => `<div class="optrow"><span class="eyebrow">${AV_LABELS[part]}</span><div class="row" style="gap:6px">${
    AV[part].map(v => COLOR_PARTS.has(part)
      ? `<button class="sw" style="background:${v}" data-part="${part}" data-val="${v}" aria-label="${AV_LABELS[part]} ${v}" aria-pressed="${p.av[part]===v}"></button>`
      : `<button class="opt" data-part="${part}" data-val="${v}" aria-pressed="${p.av[part]===v}">${v}</button>`).join('')}</div></div>`).join('');
}
$('#pgrid').addEventListener('click', e => {
  if(e.target.closest('#addPlayer')){
    const used = new Set(roster.map(r=>r.name));
    const name = ['Bubbles','Zeppelin','Puff','Nimbus','Breezy','Gusty','Floaty','Helio','Blimp'].find(n=>!used.has(n)) || `Player ${roster.length+1}`;
    const np = {id:newId(), name, av:randomAvatar()}; roster.push(np); editing = np.id; saveRoster(); renderPlayers(); return;
  }
  const b = e.target.closest('[data-pid]'); if(b){ editing = b.dataset.pid; renderPlayers(); }
});
$('#edOpts').addEventListener('click', e => {
  const b = e.target.closest('[data-part]'); if(!b) return;
  const p = roster.find(r=>r.id===editing); p.av[b.dataset.part] = b.dataset.val; saveRoster(); renderPlayers();
});
$('#pName').addEventListener('input', e => {
  const p = roster.find(r=>r.id===editing); p.name = e.target.value.trim() || 'Player'; saveRoster();
  const card = $(`.pcard[data-pid="${p.id}"] span`); if(card) card.textContent = p.name;
});
$('#edRandom').onclick = () => { const p = roster.find(r=>r.id===editing); p.av = randomAvatar(); saveRoster(); renderPlayers(); };
$('#edRemove').onclick = () => { if(roster.length<=1) return; roster = roster.filter(r=>r.id!==editing); editing = roster[0].id; saveRoster(); renderPlayers(); };
let playersReturn = 'scr-home';
$('#editPlayers').onclick = () => { playersReturn = 'scr-home'; renderPlayers(); show('scr-players'); };
$('#playersDone').onclick = () => {
  renderLineup();
  if(playersReturn === 'scr-online'){ renderOnlineEntry(); show('scr-online'); } else show('scr-home');
};
$$('[data-home]').forEach(b => b.onclick = goHome);
function goHome(){ leaveOnline(); stopTimer(); if(game) game.dead = true; game = null; renderLineup(); renderDailyCard(); loadTopics(); show('scr-home'); }

/* ---------- tabs ---------- */
function setTab(which){
  $('#tabTopics').setAttribute('aria-selected', which==='topics'); $('#tabCommunity').setAttribute('aria-selected', which==='community');
  $('#paneTopics').hidden = which!=='topics'; $('#paneCommunity').hidden = which!=='community';
}
$('#tabTopics').onclick = () => setTab('topics');
$('#tabCommunity').onclick = () => { setTab('community'); loadMine(); };
$('#goCommunity').onclick = () => { setTab('community'); loadMine(); };

/* ---------- topics and community (server) ---------- */
let TOPICS = [], community = [], COUNTS = {}, topicsState = 'loading';
const addedCommunity = () => community.filter(t => t.added);
const findTopic = key => TOPICS.find(t => t.key === key) || community.find(t => t.key === key);
const qCount = (key, sub) => { const c = COUNTS[key]; if(!c) return 0; return sub === undefined ? c.total : (c.subs[sub] || 0); };

async function loadTopics(){
  try{
    const data = await api('/api/topics?client=' + encodeURIComponent(CLIENT));
    TOPICS = data.builtin; community = data.community; COUNTS = data.counts || {}; NEED_VOTES = data.needVotes || 3; topicsState = 'live';
  }catch(e){ if(!TOPICS.length) topicsState = 'off'; }
  renderTopics(); renderCommunity(); renderQuestionForm();
}
setInterval(() => { if(!$('#scr-home').hidden) loadTopics(); }, 30000);

// Only mention community questions once a topic has some; "none yet" on every card made the menu look empty.
const countLabel = key => { const n = qCount(key); return n ? ` · ${n} community question${n === 1 ? '' : 's'}` : ''; };
const TOPIC_ICONS = {science:'🔬', history:'🏛️', geography:'🌍', space:'🪐', movies:'🎬', music:'🎵', sports:'🏀',
  food:'🍕', animals:'🦁', games:'🎮', words:'📚', tech:'💻'};
function topicCard(t, i, meta){
  const color = CARD_COLORS[i % CARD_COLORS.length];
  return `<button class="tcard c-${color}" data-topic="${esc(t.key)}"><span class="ticon" aria-hidden="true">${TOPIC_ICONS[t.key] || '✨'}</span><h3>${esc(t.name)}</h3>
    <div class="subs">${esc((t.blurb ? t.blurb : t.subs.slice(0,4).join(' · ')))}</div><div class="meta">${meta}</div></button>`;
}
function renderTopics(){
  $('#topicGrid').innerHTML = TOPICS.length ? TOPICS.map((t,i) => topicCard(t, i, `${t.subs.length} subtopics${countLabel(t.key)}`)).join('')
    : `<p class="note">${topicsState==='off' ? 'Couldn\'t load topics. Check your connection and reload the page.' : 'Loading topics…'}</p>`;
  const added = addedCommunity();
  $('#communityGrid').innerHTML = added.map((t,i) => topicCard(t, i+2, `Community topic${countLabel(t.key)}`)).join('');
  const empty = $('#communityEmpty');
  empty.hidden = added.length > 0;
  empty.textContent = topicsState === 'loading' ? 'Loading community topics…'
    : `No community topics on the menu yet. Suggest one in the Community tab. It joins this list at ${NEED_VOTES} votes.`;
}
function renderCommunity(){
  const note = $('#cloudNote');
  note.hidden = topicsState === 'live';
  note.textContent = topicsState === 'off' ? 'Couldn\'t reach the server. Check your connection and reload the page.' : 'Loading community topics…';
  $('#cSubmit').disabled = topicsState !== 'live';
  const list = [...community].sort((a,b) => b.votes-a.votes || b.created-a.created);
  if(!list.length){ $('#proposalList').innerHTML = topicsState==='live' ? '<p class="note">No suggestions yet. Be the first.</p>' : ''; return; }
  $('#proposalList').innerHTML = list.map(t => `<div class="prop">
      <button class="votebtn" data-vote="${esc(t.id)}" aria-pressed="${t.voted}" ${t.mine?'disabled':''} title="${t.mine?'You can\'t vote for your own topic':'Vote'}">▲<span>${t.votes}</span><small>of ${NEED_VOTES}</small></button>
      <div class="body"><h4>${esc(t.name)} ${t.added?'<span class="pill">On the menu</span>':''}</h4>
        ${t.blurb?`<p class="muted">${esc(t.blurb)}</p>`:''}
        <div class="chips">${t.subs.map(s=>`<span class="chip">${esc(s)}</span>`).join('')}</div>
        ${t.mine?`<button class="linkbtn" data-del="${esc(t.id)}">Delete my topic</button>`:''}
      </div></div>`).join('');
}
let writing = false;
$('#proposeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#cMsg'); msg.className = 'formmsg err';
  const name = $('#cName').value.trim(), blurb = $('#cBlurb').value.trim();
  const subs = [...new Set($('#cSubs').value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean))];
  if(name.length < 2){ msg.textContent = 'Give the topic a name of at least 2 characters.'; return; }
  if(subs.length < 5 || subs.length > 12){ msg.textContent = `Add between 5 and 12 subtopics. You have ${subs.length}.`; return; }
  if(writing) return; writing = true; $('#cSubmit').disabled = true;
  try{
    await api('/api/topics', {method:'POST', body:JSON.stringify({client:CLIENT, name, blurb, subs})});
    $('#cName').value = $('#cBlurb').value = $('#cSubs').value = '';
    msg.className = 'formmsg ok'; msg.textContent = `Submitted "${name}". It needs ${NEED_VOTES} votes from other players to join the menu.`;
    await loadTopics();
  }catch(err){ msg.textContent = err.message; }
  finally{ writing = false; $('#cSubmit').disabled = topicsState !== 'live'; }
});
$('#proposalList').addEventListener('click', async e => {
  const v = e.target.closest('[data-vote]'), d = e.target.closest('[data-del]');
  if(writing) return;
  if(v){
    writing = true;
    try{ await api(`/api/topics/${encodeURIComponent(v.dataset.vote)}/vote`, {method:'POST', body:JSON.stringify({client:CLIENT})}); await loadTopics(); }
    catch(err){ toast(err.message); } finally{ writing = false; }
  } else if(d){
    if(d.dataset.armed !== '1'){ d.dataset.armed = '1'; d.textContent = 'Tap again to confirm'; setTimeout(()=>{ if(d.isConnected){ d.dataset.armed=''; d.textContent = 'Delete my topic'; } }, 3000); return; }
    writing = true;
    try{ await api(`/api/topics/${encodeURIComponent(d.dataset.del)}`, {method:'DELETE', body:JSON.stringify({client:CLIENT})}); toast('Topic deleted.'); await loadTopics(); }
    catch(err){ toast(err.message); } finally{ writing = false; }
  }
});

/* ---------- community questions ---------- */
function renderQuestionForm(keepTopic, keepSub){
  const sel = $('#qTopic'), cur = keepTopic || sel.value;
  const all = [...TOPICS, ...community];
  sel.innerHTML = all.map(t => `<option value="${esc(t.key)}">${esc(t.name)}${t.key.startsWith('c:') ? (t.added ? ' (community)' : ' (community, not on the menu yet)') : ''}</option>`).join('');
  if(all.some(t => t.key === cur)) sel.value = cur;
  renderSubSelect(keepSub);
}
function renderSubSelect(keepSub){
  const t = findTopic($('#qTopic').value), sub = $('#qSub'), cur = keepSub !== undefined ? keepSub : sub.value;
  if(!t){ sub.innerHTML = ''; return; }
  sub.innerHTML = `<option value="">Any subtopic (${qCount(t.key, '')})</option>` +
    t.subs.map(s => `<option value="${esc(s)}">${esc(s)} (${qCount(t.key, s)})</option>`).join('');
  if([...sub.options].some(o => o.value === cur)) sub.value = cur;
}
$('#qTopic').addEventListener('change', () => renderSubSelect(''));
async function loadMine(){
  try{
    const data = await api('/api/questions/mine?client=' + encodeURIComponent(CLIENT));
    const qs = data.questions;
    $('#qCountNote').textContent = qs.length ? `You've written ${qs.length} question${qs.length === 1 ? '' : 's'}. Thank you!` : 'Questions you write show up here.';
    $('#myQuestions').innerHTML = qs.map(q => `<div class="prop"><div class="body">
      <h4>${esc(q.q)}</h4><p class="muted">${esc(q.topicName)}${q.sub ? ' · ' + esc(q.sub) : ''} · Answer: ${esc(q.answer)}</p>
      ${q.hidden ? '<p class="formmsg err">Taken out of games after reports from players.</p>' : q.reports ? `<p class="muted">${q.reports} report${q.reports === 1 ? '' : 's'}</p>` : ''}
      <button class="linkbtn" data-qdel="${esc(q.id)}">Delete</button></div></div>`).join('');
  }catch(e){ $('#qCountNote').textContent = ''; }
}
$('#questionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#qMsg'); msg.className = 'formmsg err';
  const body = {client:CLIENT, topic:$('#qTopic').value, sub:$('#qSub').value, q:$('#qWrite').value.trim(),
    answer:$('#qAnswer').value.trim(), wrong:[$('#qWrong1').value.trim(), $('#qWrong2').value.trim(), $('#qWrong3').value.trim()], level:+$('#qLevel').value};
  if(body.q.length < 10){ msg.textContent = 'Write a question of at least 10 characters.'; return; }
  if(!body.answer || body.wrong.some(w => !w)){ msg.textContent = 'Fill in the right answer and all three wrong answers.'; return; }
  if(writing) return; writing = true; $('#qSubmit').disabled = true;
  try{
    const r = await api('/api/questions', {method:'POST', body:JSON.stringify(body)});
    ['#qWrite','#qAnswer','#qWrong1','#qWrong2','#qWrong3'].forEach(s => $(s).value = '');
    msg.className = 'formmsg ok'; msg.textContent = `Added to ${r.topicName}${r.sub ? ' · ' + r.sub : ''}. Write another?`;
    $('#qWrite').focus();
    await Promise.all([loadTopics(), loadMine()]);
  }catch(err){ msg.textContent = err.message; }
  finally{ writing = false; $('#qSubmit').disabled = false; }
});
$('#myQuestions').addEventListener('click', async e => {
  const d = e.target.closest('[data-qdel]'); if(!d || writing) return;
  if(d.dataset.armed !== '1'){ d.dataset.armed = '1'; d.textContent = 'Tap again to delete'; setTimeout(()=>{ if(d.isConnected){ d.dataset.armed=''; d.textContent = 'Delete'; } }, 3000); return; }
  writing = true;
  try{ await api(`/api/questions/${encodeURIComponent(d.dataset.qdel)}`, {method:'DELETE', body:JSON.stringify({client:CLIENT})}); await Promise.all([loadTopics(), loadMine()]); }
  catch(err){ toast(err.message); } finally{ writing = false; }
});
function openWriter(topicKey, sub){
  goHome(); setTab('community'); renderQuestionForm(topicKey, sub || ''); loadMine();
  $('#questionForm').scrollIntoView({behavior:'smooth', block:'start'}); $('#qWrite').focus({preventScroll:true});
}
async function report(qid, btn){
  if(!qid || qid.startsWith('b')) return;
  btn.disabled = true;
  try{ await api(`/api/questions/${encodeURIComponent(qid)}/report`, {method:'POST', body:JSON.stringify({client:CLIENT})}); btn.textContent = 'Reported. Thanks for keeping questions accurate.'; }
  catch(err){ btn.textContent = err.message; }
}
const reportable = q => q && q.id && !String(q.id).startsWith('b');
function resetReport(btn, q){ btn.hidden = true; btn.disabled = false; btn.textContent = 'Report a problem with this question'; btn.dataset.qid = reportable(q) ? q.id : ''; }

/* ---------- topic select -> wheel (one device) ---------- */
document.addEventListener('click', e => {
  const c = e.target.closest('[data-topic]'); if(!c) return;
  const t = findTopic(c.dataset.topic); if(t) startWheel(t);
});

let wheel = null;
const WHEEL_COLORS = ['coral','sun','sky','mint','grape'];
const WHEEL_TEXT = {coral:'#fff', sun:INK, sky:'#fff', mint:INK, grape:'#fff'};
function startWheel(topic){
  const spins = Math.min(roster.length <= 2 ? 3 : 5, topic.subs.length);
  wheel = {topic, items:[...topic.subs], picks:[], spins, rot:0, spinning:false};
  $('#wheelEyebrow').textContent = topic.name;
  $('#wheelTitle').textContent = `Spin ${spins} times for subtopics`;
  $('#toVote').hidden = true; $('#spinBtn').hidden = false;
  renderSlots(); show('scr-wheel'); requestAnimationFrame(() => drawWheel());
}
function renderSlots(){
  $('#slots').innerHTML = Array.from({length:wheel.spins}, (_,i) => wheel.picks[i]
    ? `<div class="slot filled"><b>${i+1}</b>${esc(wheel.picks[i])}</div>` : `<div class="slot"><b>${i+1}</b><span class="muted">Spin to fill</span></div>`).join('');
  const left = wheel.spins - wheel.picks.length;
  $('#spinBtn').textContent = left ? `Spin (${wheel.picks.length+1} of ${wheel.spins})` : 'Done';
  $('#spinBtn').disabled = wheel.spinning || !left;
  $('#hub').textContent = left ? left : '✓';
}
function drawWheel(highlight=-1, c=$('#wheel'), w=wheel){
  const size = c.clientWidth || 360, dpr = window.devicePixelRatio || 1;
  if(c.width !== Math.round(size*dpr)){ c.width = c.height = Math.round(size*dpr); }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size,size);
  const cs = getComputedStyle(document.documentElement), n = w.items.length, seg = Math.PI*2/n, R = size/2;
  for(let i=0;i<n;i++){
    const col = WHEEL_COLORS[i % WHEEL_COLORS.length] === 'coral' && i===n-1 && n%5===1 ? 'sky' : WHEEL_COLORS[i % WHEEL_COLORS.length];
    const a0 = w.rot + i*seg;
    ctx.beginPath(); ctx.moveTo(R,R); ctx.arc(R,R,R,a0,a0+seg); ctx.closePath();
    ctx.fillStyle = cs.getPropertyValue('--'+col).trim(); ctx.globalAlpha = (highlight>=0 && highlight!==i) ? .45 : 1; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = cs.getPropertyValue('--edge').trim(); ctx.stroke();
    // Labels on the left half would read upside down, so turn them around to read left to right.
    const mid = a0 + seg/2, flip = Math.cos(mid) < 0;
    ctx.save(); ctx.translate(R,R); ctx.rotate(flip ? mid + Math.PI : mid); ctx.textAlign = flip ? 'left' : 'right'; ctx.textBaseline='middle';
    ctx.fillStyle = WHEEL_TEXT[col];
    // Shrink long labels so they stop short of the hub, then trim if they still don't fit.
    const maxW = R*0.62; let px = Math.max(11, Math.min(16, size/26)), label = w.items[i];
    const setFont = () => ctx.font = `800 ${px}px "Bricolage Grotesque", system-ui, sans-serif`;
    setFont();
    while(ctx.measureText(label).width > maxW && px > 10){ px -= .5; setFont(); }
    while(ctx.measureText(label).width > maxW && label.length > 4) label = label.slice(0, -2) + '…';
    ctx.fillText(label, flip ? -(R-24) : R-24, 0); ctx.restore();
  }
}
window.addEventListener('resize', () => {
  if(wheel && !$('#scr-wheel').hidden) drawWheel();
  if(online && online.wheel && !online.wheel.anim && !$('#scr-owheel').hidden) drawWheel(-1, $('#owheel'), online.wheel);
});
$('#spinBtn').onclick = () => {
  if(wheel.spinning || wheel.picks.length >= wheel.spins) return;
  wheel.spinning = true; renderSlots();
  const n = wheel.items.length, seg = Math.PI*2/n, target = Math.floor(Math.random()*n);
  const jitter = (Math.random()-.5)*seg*.6;
  const base = -Math.PI/2 - (target+.5)*seg + jitter;
  const from = wheel.rot, twoPi = Math.PI*2;
  let to = base; while(to < from + twoPi*5) to += twoPi;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, dur = reduce ? 300 : 3600, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now-t0)/dur), e = 1 - Math.pow(1-k, 4);
    wheel.rot = from + (to-from)*e; drawWheel();
    if(k < 1) return requestAnimationFrame(step);
    wheel.rot = to % twoPi; drawWheel(target);
    setTimeout(() => {
      wheel.picks.push(wheel.items[target]); wheel.items.splice(target,1); wheel.spinning = false;
      drawWheel(); renderSlots();
      if(wheel.picks.length >= wheel.spins){ $('#spinBtn').hidden = true; $('#toVote').hidden = false; $('#toVote').textContent = roster.length===1 ? 'Pick your subtopic' : 'Vote on a subtopic'; $('#toVote').focus(); }
    }, reduce ? 100 : 700);
  };
  requestAnimationFrame(step);
};
$('#toVote').onclick = startVote;

/* ---------- vote (one device) ---------- */
let ballot = {};
function startVote(){
  ballot = {};
  $('#voteEyebrow').textContent = `${wheel.topic.name} · ${wheel.picks.length} options`;
  if(roster.length === 1){
    $('#voteTitle').textContent = 'Pick your subtopic';
    $('#voteBody').innerHTML = `<div class="ocards">${wheel.picks.map((s,i)=>`<button class="tcard c-${CARD_COLORS[i%5]}" data-solo="${i}" style="min-height:110px"><h3>${esc(s)}</h3><div class="meta">Play this</div></button>`).join('')}</div>`;
  } else {
    $('#voteTitle').textContent = 'Everyone votes for one subtopic';
    renderBallot();
  }
  show('scr-vote');
}
function renderBallot(){
  const all = roster.every(p => ballot[p.id] !== undefined);
  $('#voteBody').innerHTML = `<p class="muted">Pass the device around. Each player taps one subtopic.</p>
    <div>${roster.map(p => `<div class="vrow">${miniHTML(p)}<div class="vchips">${wheel.picks.map((s,i)=>
      `<button class="opt" data-voter="${p.id}" data-opt="${i}" aria-pressed="${ballot[p.id]===i}">${esc(s)}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="row"><button id="countVotes" class="btn primary" ${all?'':'disabled'}>Count the votes</button>
    <span class="muted">${roster.filter(p=>ballot[p.id]!==undefined).length} of ${roster.length} voted</span></div>`;
}
$('#voteBody').addEventListener('click', e => {
  const solo = e.target.closest('[data-solo]'); if(solo) return beginGame(wheel.picks[+solo.dataset.solo]);
  const b = e.target.closest('[data-voter]'); if(b){ ballot[b.dataset.voter] = +b.dataset.opt; renderBallot(); return; }
  if(e.target.closest('#countVotes')){
    const counts = wheel.picks.map((_,i) => Object.values(ballot).filter(v=>v===i).length);
    const max = Math.max(...counts), tied = counts.map((c,i)=>c===max?i:-1).filter(i=>i>=0), win = pick(tied);
    $('#voteBody').innerHTML = `<div class="tally">${wheel.picks.map((s,i)=>`<div class="bar"><span>${esc(s)}</span><i><em style="width:${counts[i]/roster.length*100}%"></em></i><b>${counts[i]}</b></div>`).join('')}</div>
      <h2>${esc(wheel.picks[win])} wins${tied.length>1?' the tiebreak':''}!</h2>
      <div class="row"><button id="startGame" class="btn primary" data-win="${win}">Start the game</button></div>`;
    $('#startGame').focus();
  }
  const s = e.target.closest('#startGame'); if(s) beginGame(wheel.picks[+s.dataset.win]);
});

/* ---------- questions (one device) ---------- */
async function refill(){
  const g = game;
  try{
    const avoid = [...g.asked, ...g.pool.map(q => q.q)];
    const data = await api('/api/questions/draw', {method:'POST', body:JSON.stringify({topic:g.topic.key, sub:g.sub, round:g.round, avoid})});
    if(g.dead) return;
    if(data.info.bank > 0 && !g.bankNoted){ g.bankNoted = true; toast(mixedNote(g.sub)); }
    const have = new Set(avoid);
    g.pool.push(...data.questions.filter(q => !have.has(q.q)));
  }catch(e){ if(!g.dead) toast(e.message); }
}
const mixedNote = sub => `There aren't many ${sub} questions yet, so general knowledge questions are mixed in. You can add more in the Community tab.`;
function ensurePool(min){
  const g = game;
  if(g.daily || g.pool.length >= min) return Promise.resolve();  // daily games use a fixed list
  if(!g.fetching) g.fetching = refill().finally(() => { g.fetching = null; });
  return g.fetching;
}

/* ---------- game (one device) ---------- */
let game = null, timerRAF = 0;
async function beginGame(sub){
  game = {topic:wheel.topic, sub, round:1, pool:[], asked:[], fetching:null, dead:false,
    players: roster.map(p => ({...p, av:{...p.av}, status:'playing', correct:0, strikes:0, total:0, reached:1})), cur:-1, q:null, answered:false};
  $('#loadTitle').textContent = 'Inflating questions…';
  $('#loadSub').textContent = `Gathering ${sub} questions.`;
  show('scr-load');
  const g = game;
  await ensurePool(1);
  if(g.dead || game !== g) return;
  if(!game.pool.length){ toast('No questions could be loaded.'); return goHome(); }
  roundIntro();
}
const need = () => game.round;
const alivePlayers = () => game.players.filter(p => p.status !== 'eliminated');
function roundIntro(){
  for(const p of alivePlayers()){ p.status='playing'; p.correct=0; p.strikes=0; p.reached=game.round; }
  $('#roundEyebrow').textContent = `${game.topic.name} · ${game.sub}`;
  $('#roundNum').textContent = `Round ${game.round}`;
  $('#roundRule').textContent = `Get ${need()} right to pop your head`;
  $('#roundPips').innerHTML = Array.from({length:ROUNDS},(_,i)=>`<span class="pip ${i<game.round?'on':''}"></span>`).join('');
  $('#roundNote').textContent = 'Three misses in this round and your head deflates. You\'re out.';
  $('#roundGo').hidden = false; $('#roundWait').hidden = true;
  if(game.daily){ $('#roundEyebrow').textContent = `Daily Airhead #${game.number} · mixed trivia`; saveDailyProgress(false); }
  $('#roundCrowd').innerHTML = game.players.map(p => miniHTML(p, 1, p.status==='eliminated'?'gone':'', p.status==='eliminated'?`<span class="st">Out in R${p.reached}</span>`:'')).join('');
  show('scr-round'); $('#roundGo').focus();
  ensurePool(8);
}
$('#roundGo').onclick = () => {
  if(online){ if(online.g && online.g.isHost) send({t:'round'}); return; }
  game.cur = -1; nextTurn();
};
function nextTurn(){
  const ps = game.players, n = ps.length;
  for(let k=1;k<=n;k++){ const i = (game.cur + k) % n; if(ps[i].status === 'playing'){ game.cur = i; return askQuestion(); } }
  endRound();
}
async function askQuestion(){
  const p = game.players[game.cur], g = game;
  if(!game.pool.length){
    show('scr-load'); $('#loadTitle').textContent = 'Fetching more questions…'; $('#loadSub').textContent = '';
    await ensurePool(1); if(g.dead || game!==g) return;
    if(!game.pool.length) return finish('empty');
  }
  if(game.pool.length < 6) ensurePool(6);
  game.q = game.pool.shift(); game.asked.push(game.q.q); game.answered = false;
  if(game.daily){ game.qi++; saveDailyProgress(true); }
  $('#pRound').textContent = `Round ${game.round} of ${ROUNDS}`;
  $('#pSub').textContent = game.daily ? `Daily Airhead #${game.number}` : game.sub;
  $('#qTag').hidden = !game.q.topic;
  $('#qTag').textContent = game.q.topic ? game.q.topic + (game.q.sub ? ' · ' + game.q.sub : '') : '';
  $('#whoName').textContent = game.players.length > 1 ? `${p.name}'s turn` : p.name;
  $('#stageAv').innerHTML = avatarSVG(p.av, headScale(p));
  renderProgress(p);
  $('#qText').textContent = game.q.q;
  $('#choices').innerHTML = game.q.choices.map((c,i)=>`<button class="choice" data-i="${i}"><kbd>${i+1}</kbd><span>${esc(c)}</span></button>`).join('');
  $('#feedback').textContent = ''; $('#feedback').className = 'feedback';
  $('#nextBtn').hidden = true;
  resetReport($('#reportBtn'), game.q);
  renderOthers();
  show('scr-play');
  startTimer();
}
const headScale = p => p.status==='passed' ? 1 : 1 + 0.85 * (p.correct / need());
function renderProgress(p){
  $('#progTxt').textContent = `${p.correct} of ${need()} right`;
  $('#strikes').innerHTML = Array.from({length:STRIKES},(_,i)=>`<span class="strike ${i<p.strikes?'on':''}" aria-label="${i<p.strikes?'miss':'no miss'}">✕</span>`).join('');
}
function renderOthers(){
  $('#others').innerHTML = game.players.filter(p=>p.status!=='eliminated').map(p => {
    const st = p.status==='passed' ? 'Popped' : p.status==='out' ? 'Out' : `${p.correct}/${need()}`;
    const cls = (p === game.players[game.cur] ? 'active ' : '') + (p.status==='out' ? 'gone' : '');
    return `<div class="mini ${cls}"><div class="avwrap">${avatarSVG(p.av, p.status==='passed'?1:headScale(p), p.status==='passed'?'popped':p.status==='out'?'out':'')}</div><span>${esc(p.name)}</span><span class="st">${st}</span></div>`;
  }).join('');
}
function startTimer(){
  stopTimer();
  const bar = $('#timerBar'), box = $('#timer'), end = performance.now() + QTIME*1000;
  const tick = now => {
    const left = Math.max(0, end - now);
    bar.style.transform = `scaleX(${left/(QTIME*1000)})`; box.classList.toggle('low', left < 5000);
    if(left <= 0) return answer(-1);
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}
function stopTimer(){ cancelAnimationFrame(timerRAF); timerRAF = 0; }
$('#choices').addEventListener('click', e => { const b = e.target.closest('.choice'); if(b) answer(+b.dataset.i); });
document.addEventListener('keydown', e => {
  if(!$('#scr-oplay').hidden && online){ if(/^[1-4]$/.test(e.key)) oAnswer(+e.key - 1); return; }
  if($('#scr-play').hidden || !game) return;
  if(!game.answered && /^[1-4]$/.test(e.key)) answer(+e.key-1);
  else if(game.answered && e.key==='Enter' && !$('#nextBtn').hidden && document.activeElement!==$('#nextBtn')){ e.preventDefault(); $('#nextBtn').click(); }
});
function answer(i){
  if(!game || game.answered) return;
  game.answered = true; stopTimer();
  const p = game.players[game.cur], ok = i === game.q.correct;
  if(game.daily){ (game.log[game.round-1] = game.log[game.round-1] || []).push(ok); }
  $$('#choices .choice').forEach((b,j) => { b.disabled = true; if(j===game.q.correct) b.classList.add('right'); else if(j===i) b.classList.add('wrong'); else b.classList.add('dim'); });
  const fb = $('#feedback'), svg = $('#stageAv .av');
  if(ok){
    p.correct++; p.total++;
    if(p.correct >= need()){
      p.status = 'passed';
      svg.querySelector('.head').style.transform = `scale(1.9)`;
      setTimeout(() => popHead($('#stageAv'), svg), 380);
      fb.className = 'feedback good'; fb.textContent = game.round===ROUNDS ? 'POP! Round 10 cleared!' : `POP! ${p.name} is through to round ${game.round+1}.`;
    } else {
      svg.querySelector('.head').style.transform = `scale(${headScale(p)})`;
      fb.className = 'feedback good'; fb.textContent = `Correct! ${need()-p.correct} more to pop.`;
    }
  } else {
    p.strikes++;
    const right = game.q.choices[game.q.correct];
    if(p.strikes >= STRIKES){ p.status = 'out'; svg.classList.add('out'); fb.className='feedback bad'; fb.textContent = `${i<0?'Time\'s up':'Wrong'}. That's 3 misses, ${p.name} is out. (It was ${right}.)`; }
    else { svg.classList.add('wobble'); fb.className='feedback bad'; fb.textContent = `${i<0?'Time\'s up!':'Not quite.'} It was ${right}.`; }
  }
  renderProgress(p); renderOthers();
  if(game.daily) saveDailyProgress(false);
  $('#reportBtn').hidden = !$('#reportBtn').dataset.qid;
  const nb = $('#nextBtn'); nb.hidden = false;
  const nextP = upcomingPlayer();
  nb.textContent = nextP ? (game.players.length>1 && nextP!==p ? `Next: ${nextP.name}` : 'Next question') : 'Finish round';
  setTimeout(() => nb.focus(), 50);
}
function upcomingPlayer(){
  const ps = game.players, n = ps.length;
  for(let k=1;k<=n;k++){ const q = ps[(game.cur+k)%n]; if(q.status==='playing') return q; }
  return null;
}
$('#nextBtn').onclick = () => nextTurn();
$('#reportBtn').onclick = () => report($('#reportBtn').dataset.qid, $('#reportBtn'));
$('#opReport').onclick = () => report($('#opReport').dataset.qid, $('#opReport'));
$('#writeBtn').onclick = () => {
  const g = online && online.g ? online.g : game;
  if(g && g.topic && !g.daily) openWriter(g.topic.key, g.sub); else openWriter();
};
function popHead(wrap, svg){
  svg.classList.add('popped');
  const y = (248 - 58*1.9) / 350 * 100, colors = ['#FF4F6D','#FFC93C','#3E7BFA','#22C99B','#7C4DFF'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduce) for(let i=0;i<22;i++){
    const s = document.createElement('span'), ang = Math.random()*Math.PI*2, d = 60 + Math.random()*110;
    s.className = 'confetto'; s.style.left = '50%'; s.style.top = y+'%'; s.style.background = colors[i%5];
    s.style.setProperty('--dx', Math.cos(ang)*d+'px'); s.style.setProperty('--dy', Math.sin(ang)*d+'px'); s.style.setProperty('--rot', (Math.random()*720-360)+'deg');
    wrap.appendChild(s); setTimeout(()=>s.remove(), 1000);
  }
  const t = document.createElement('span'); t.className='poptext'; t.style.top = y+'%'; t.textContent='POP!'; wrap.appendChild(t); setTimeout(()=>t.remove(), 1150);
}
function endRound(){
  const inRound = game.players.filter(p => p.status==='passed' || p.status==='out');
  const passed = inRound.filter(p => p.status==='passed');
  inRound.forEach(p => { if(p.status==='out') p.status = 'eliminated'; });
  if(!passed.length){
    if(game.players.length === 1 || game.solo) return finish('solo-out');
    const best = Math.max(...inRound.map(p=>p.correct));
    return finish('all-out', inRound.filter(p=>p.correct===best));
  }
  if(game.round >= ROUNDS) return finish('cleared', passed);
  if(game.players.length > 1 && !game.solo && passed.length === 1) return finish('last', passed);
  game.round++; roundIntro();
}
const END_TEXT = (reason, one, many, round, sub, total) => ({
  'cleared': [many ? 'Airheads, all of you!' : `${one} is the ultimate Airhead!`, `Cleared all ${ROUNDS} rounds of ${sub}. That's ${ROUNDS*(ROUNDS+1)/2} right answers.`],
  'last': [`${one} is the last head standing!`, `Everyone else deflated by round ${round}.`],
  'all-out': [many ? 'A tie in the deflation!' : one ? `${one} wins!` : 'Everyone deflated', `Everyone ran out of air in round ${round}. Most right answers that round takes it.`],
  'solo-out': [`You made it to round ${round}`, `${total} right answers in total on ${sub}.`],
  'empty': ['Out of questions', 'There were no more questions to ask. Here is where everyone stood.']
}[reason] || ['Game over', '']);
function finish(reason, winners=[]){
  stopTimer();
  if(game.daily) return finishDaily(reason);
  $('#dailyBox').hidden = true; $('#writeBtn').textContent = 'Write questions for this topic';
  const ps = game.players, winIds = new Set(winners.map(w=>w.id));
  const ranked = [...ps].sort((a,b) => (winIds.has(b.id)-winIds.has(a.id)) || (b.reached-a.reached) || (b.total-a.total));
  const T = END_TEXT(reason, winners.length===1 ? winners[0].name : '', winners.length>1, game.round, game.sub, ps.reduce((s,p)=>s+p.total,0));
  if(reason === 'last') T[1] += ` Keep going solo to chase round ${ROUNDS}.`;
  $('#endEyebrow').textContent = `${game.topic.name} · ${game.sub}`;
  $('#endTitle').textContent = T[0]; $('#endSub').textContent = T[1];
  const crowned = p => ({...p, av:{...p.av, hat:'crown'}});
  $('#podium').innerHTML = winners.map(w => miniHTML(crowned(w), 1.25)).join('');
  $('#board').innerHTML = ranked.map((p,i) => `<div class="brow"><b>${i+1}</b>${avWrap(winIds.has(p.id)?crowned(p).av:p.av)}<span>${esc(p.name)}</span><span class="muted">Round ${p.reached} · ${p.total} right</span></div>`).join('');
  $('#keepGoing').hidden = reason !== 'last';
  $('#againBtn').hidden = false; $('#againBtn').textContent = 'Play this topic again';
  show('scr-end');
}
$('#keepGoing').onclick = () => { game.solo = true; game.round++; roundIntro(); };
$('#againBtn').onclick = () => {
  if(online){ if(online.g && online.g.isHost) send({t:'lobby'}); return; }
  const t = game ? game.topic : wheel.topic; game = null; startWheel(t);
};
let quitArmed = 0;
$('#quitBtn').onclick = () => {
  if(Date.now() - quitArmed < 3000){ quitArmed = 0; return goHome(); }
  quitArmed = Date.now(); $('#quitBtn').textContent = 'Tap again to quit';
  setTimeout(() => $('#quitBtn').textContent = 'Quit game', 3000);
};

/* ---------- daily game ----------
   One solo game a day with the same questions for everyone. Progress is saved in this browser after
   every question, so reloading resumes the game instead of starting over (a question left open
   counts as a miss). */
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let dailyHist = store('airhead.daily');
if(!dailyHist || typeof dailyHist !== 'object') dailyHist = {};
let dailyData = null, countdownT = 0;
const saveHist = () => store('airhead.daily', dailyHist);

function dailyStats(){
  const done = d => dailyHist[d] && dailyHist[d].done;
  let cur = 0; const d = new Date();
  if(!done(localDate(d))) d.setDate(d.getDate() - 1);
  while(done(localDate(d))){ cur++; d.setDate(d.getDate() - 1); }
  const days = Object.keys(dailyHist).filter(done).sort();
  let best = 0, run = 0, prev = null;
  for(const k of days){
    const t = new Date(k + 'T12:00:00');
    run = prev && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return {cur, best, played: days.length, bestRound: days.reduce((m, k) => Math.max(m, dailyHist[k].round || 0), 0)};
}
async function loadDaily(){
  const today = localDate();
  if(dailyData && dailyData.date === today) return dailyData;
  dailyData = await api('/api/daily?date=' + today);
  return dailyData;
}
function renderDailyCard(){
  const today = localDate(), h = dailyHist[today], s = dailyStats();
  $('#dailyAv').innerHTML = avWrap(roster[0].av);
  const num = (h && h.number) || (dailyData && dailyData.date === today && dailyData.number);
  $('#dailyEyebrow').textContent = `Daily Airhead${num ? ' #' + num : ''} · ${new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'})}`;
  if(h && h.done){
    $('#dailyTitle').textContent = h.cleared ? 'You cleared all 10 rounds today!' : `You reached round ${h.round} today`;
    $('#dailySub').textContent = `${h.total} right answer${h.total === 1 ? '' : 's'}. A new game starts at midnight.`;
    $('#dailyPlay').textContent = 'See your results';
  } else if(h && h.progress){
    $('#dailyTitle').textContent = 'Your game is waiting';
    $('#dailySub').textContent = `You're in round ${h.progress.round}. Pick up where you left off.`;
    $('#dailyPlay').textContent = 'Continue today\'s game';
  } else {
    $('#dailyTitle').textContent = 'Today\'s game';
    $('#dailySub').textContent = 'Everyone gets the same questions today, mixed from every topic. You get one try.';
    $('#dailyPlay').textContent = 'Play today\'s game';
  }
  $('#dailyStreak').hidden = !s.cur;
  $('#dailyStreak').textContent = `${s.cur}-day streak`;
}
function saveDailyProgress(openQuestion){
  // openQuestion: a question is on screen and unanswered, so save it as a miss until it's answered.
  const p = game.players[0], h = dailyHist[game.date];
  const log = game.log.map(r => r.slice());
  let strikes = p.strikes;
  if(openQuestion){ strikes++; (log[game.round-1] = log[game.round-1] || []).push(false); }
  h.progress = {qi: game.qi, round: game.round, correct: p.correct, strikes, total: p.total, log};
  saveHist();
}
async function startDaily(){
  const today = localDate(), h = dailyHist[today];
  if(h && h.done) return showDailyResults(today);
  $('#loadTitle').textContent = 'Inflating today\'s game…'; $('#loadSub').textContent = '';
  show('scr-load');
  let data;
  try{ data = await loadDaily(); }catch(e){ toast(e.message); return goHome(); }
  if(!data.questions.length){ toast('Today\'s game has no questions yet. Try again soon.'); return goHome(); }
  const p0 = roster[0];
  game = {daily:true, date:today, number:data.number, topic:{key:'daily', name:`Daily Airhead #${data.number}`}, sub:'Mixed trivia',
    round:1, pool:data.questions.slice(), asked:[], fetching:null, dead:false, qi:0, log:[],
    players:[{...p0, av:{...p0.av}, status:'playing', correct:0, strikes:0, total:0, reached:1}], cur:-1, q:null, answered:false};
  if(!dailyHist[today]) dailyHist[today] = {number:data.number, done:false};
  const pr = dailyHist[today].progress;
  if(pr){
    const p = game.players[0];
    Object.assign(game, {qi:pr.qi, round:pr.round, log:pr.log || [], pool:data.questions.slice(pr.qi)});
    Object.assign(p, {correct:pr.correct, strikes:pr.strikes, total:pr.total, reached:pr.round});
    if(p.strikes >= STRIKES){ p.status = 'eliminated'; return finishDaily('solo-out'); }
    if(p.correct >= pr.round){ p.status = 'passed'; return endRound(); }
    if(p.correct || p.strikes){ game.cur = -1; return nextTurn(); }  // resume mid-round
  }
  roundIntro();
}
$('#dailyPlay').onclick = startDaily;

function shareText(h){
  const rows = (h.log || []).map((r, i) => {
    const popped = r.filter(Boolean).length >= i + 1;
    return `R${i+1} ${r.map(ok => ok ? '🟩' : '🟥').join('')}${popped ? ' 💥' : ''}`;
  });
  const head = `Airhead #${h.number} · ${h.cleared ? 'Cleared all 10 rounds' : 'Round ' + h.round} · ${h.total} right`;
  const dare = h.cleared ? 'I cleared all 10. Can you?' : `Can you beat round ${h.round}?`;
  return [head, ...rows, '', dare, location.origin].join('\n');
}
async function finishDaily(reason){
  const p = game.players[0], today = game.date;
  const h = {number:game.number, done:true, round:p.reached, total:p.total, cleared:reason === 'cleared', log:game.log};
  dailyHist[today] = h; saveHist();
  showDailyResults(today);
  try{
    const stats = await api('/api/daily/result', {method:'POST', body:JSON.stringify({client:CLIENT, date:today, round:h.round, total:h.total})});
    renderBeat(stats);
  }catch(e){ $('#dailyBeat').textContent = ''; }
}
function renderBeat(stats){
  $('#dailyBeat').textContent = stats.players <= 1 ? 'You\'re one of the first to play today.'
    : stats.beat ? `You did better than ${stats.beat}% of the ${stats.players} people who played today. The average was round ${stats.avgRound}.`
    : `${stats.players} people have played today. The average was round ${stats.avgRound}.`;
}
function showDailyResults(date){
  const h = dailyHist[date], s = dailyStats();
  $('#endEyebrow').textContent = `Daily Airhead #${h.number}`;
  $('#endTitle').textContent = h.cleared ? 'You cleared all 10 rounds!' : `You reached round ${h.round}`;
  $('#endSub').textContent = `${h.total} right answer${h.total === 1 ? '' : 's'} today.`;
  $('#podium').innerHTML = miniHTML({name:roster[0].name, av: h.cleared ? {...roster[0].av, hat:'crown'} : roster[0].av}, 1.25);
  $('#board').innerHTML = '';
  $('#dailyStats').innerHTML = [['Played', s.played], ['Streak', s.cur], ['Best streak', s.best], ['Best round', s.bestRound]]
    .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  $('#shareText').textContent = shareText(h);
  $('#dailyBeat').textContent = '';
  $('#dailyBox').hidden = false;
  $('#keepGoing').hidden = true; $('#againBtn').hidden = true;
  $('#writeBtn').textContent = 'Write questions';
  show('scr-end');
  tickCountdown();
  api(`/api/daily/stats?date=${date}&client=${encodeURIComponent(CLIENT)}`).then(renderBeat).catch(() => {});
}
function tickCountdown(){
  clearTimeout(countdownT);
  if($('#scr-end').hidden || $('#dailyBox').hidden) return;
  const now = new Date(), next = new Date(now); next.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  $('#countdown').textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
  countdownT = setTimeout(tickCountdown, 1000);
}
$('#shareBtn').onclick = async () => {
  const text = $('#shareText').textContent;
  if(navigator.share && matchMedia('(pointer: coarse)').matches){
    try{ await navigator.share({text}); return; }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere to share.'); }
  catch(e){ const r = document.createRange(); r.selectNodeContents($('#shareText')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Select and copy the text above to share.'); }
};

/* ---------- online games ----------
   The server runs every online game. This page sends actions (spin, vote, answer…) and
   draws whatever state the server sends back. */
let online = null;
function send(msg){ if(online && online.ws && online.ws.readyState === 1) online.ws.send(JSON.stringify(msg)); }

function renderOnlineEntry(){ $('#oMe').innerHTML = miniHTML(roster[0]); }
$('#playOnline').onclick = () => { renderOnlineEntry(); $('#oMsg').textContent = ''; show('scr-online'); };
$('#oEdit').onclick = () => { playersReturn = 'scr-online'; editing = roster[0].id; renderPlayers(); show('scr-players'); };
$('#oHost').onclick = () => connect(null);
$('#oJoinForm').addEventListener('submit', e => {
  e.preventDefault();
  const c = $('#oCode').value.toUpperCase().replace(/[^A-Z]/g, '');
  if(c.length !== 4){ $('#oMsg').className = 'formmsg err'; $('#oMsg').textContent = 'Enter the 4-letter code from your host.'; return; }
  connect(c);
});

function connect(code){
  leaveOnline();
  const msg = $('#oMsg'); msg.className = 'formmsg'; msg.textContent = 'Connecting…';
  online = {ws:null, code, g:null, lastQ:0, myAns:null, spinSeq:0, wheel:null, myPrev:null, tRAF:0, deadline:0, retries:0, closing:false};
  openSocket();
}
function openSocket(){
  const o = online;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  o.ws = ws;
  ws.onopen = () => {
    o.retries = 0;
    const p = roster[0];
    ws.send(JSON.stringify({t:'hello', client:CLIENT, name:p.name, av:p.av}));
    ws.send(JSON.stringify(o.code ? {t:'join', code:o.code} : {t:'create'}));
  };
  ws.onmessage = ev => {
    if(online !== o) return;
    let m; try{ m = JSON.parse(ev.data); }catch(e){ return; }
    if(m.t === 'state'){ o.code = m.g.code; $('#oMsg').textContent = ''; renderOnline(m.g); }
    else if(m.t === 'error'){
      if(!o.g){ $('#oMsg').className = 'formmsg err'; $('#oMsg').textContent = m.msg; o.closing = true; ws.close(); online = null; }
      else toast(m.msg);
    }
  };
  ws.onclose = () => {
    if(online !== o || o.closing) return;
    if(!o.g){ $('#oMsg').className = 'formmsg err'; $('#oMsg').textContent = 'Couldn\'t connect to the game server. Try again in a moment.'; online = null; return; }
    // Lost the connection mid-game: rejoin the same code. The server keeps this browser's seat.
    if(o.retries++ < 6){ toast('Reconnecting…'); setTimeout(() => { if(online === o) openSocket(); }, 1000 * o.retries); }
    else { goHome(); toast('Lost the connection to the game.'); }
  };
}
function leaveOnline(){
  if(!online) return;
  const o = online; online = null; o.closing = true;
  cancelAnimationFrame(o.tRAF);
  try{ if(o.ws.readyState === 1) o.ws.send(JSON.stringify({t:'leave'})); o.ws.close(); }catch(e){}
}

const myPl = g => g.players.find(pl => pl.p === g.you);
const plView = (pl, suffix='') => ({name: pl.n + suffix, av: okAv(pl.av)});
function renderOnline(g){
  if(!online) return;
  const prev = online.g; online.g = g;
  switch(g.ph){
    case 'lobby': return renderLobby(g);
    case 'wheel': return renderOWheel(g);
    case 'vote': case 'voted': return renderOVote(g);
    case 'load':
      $('#loadTitle').textContent = 'Inflating questions…';
      $('#loadSub').textContent = g.sub ? `Gathering ${g.sub} questions.` : '';
      return show('scr-load');
    case 'ri': return renderORound(g);
    case 'q': case 'rv': return renderOPlay(g, prev);
    case 'end': return renderOEnd(g);
  }
}
function renderLobby(g){
  online.wheel = null;
  $('#lCode').textContent = g.code;
  $('#lCount').textContent = `${g.players.length} of 8 players`;
  $('#lPlayers').innerHTML = g.players.map(pl => miniHTML(plView(pl, pl.p === g.you ? ' (you)' : ''))).join('');
  $('#lHost').hidden = !g.isHost; $('#lWait').hidden = g.isHost;
  $('#lWait').textContent = myPl(g) ? 'You\'re in. Waiting for the host to pick a topic…' : 'This game is full (8 players). You can watch.';
  if(g.isHost){
    const sel = $('#lTopic'), all = [...TOPICS, ...addedCommunity()], cur = sel.value;
    sel.innerHTML = all.map(t => `<option value="${esc(t.key)}">${esc(t.name)}${t.key.startsWith('c:') ? ' (community)' : ''}${countLabel(t.key)}</option>`).join('');
    if(all.some(t => t.key === cur)) sel.value = cur;
  }
  show('scr-lobby');
}
$('#lStart').onclick = () => send({t:'start', topic:$('#lTopic').value});
const inviteLink = code => `${location.origin}/?join=${code}`;
$('#lInvite').onclick = async () => {
  if(!online || !online.code) return;
  const url = inviteLink(online.code), text = `Play Airhead with me! Game code ${online.code}`;
  if(navigator.share && matchMedia('(pointer: coarse)').matches){
    try{ await navigator.share({title:'Airhead', text, url}); return; }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(url); toast('Invite link copied. Paste it to your friends.'); }
  catch(e){ toast(`Share this link: ${url}`); }
};
// Opened from an invite link (/?join=ABCD): go to Play online with the code filled in.
// Joining is still one tap, so people can set their name and avatar first.
function openInvite(){
  const params = new URLSearchParams(location.search), code = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if(!code) return;
  history.replaceState(null, '', location.pathname);
  if(code.length !== 4) return;
  renderOnlineEntry();
  $('#oCode').value = code;
  $('#oMsg').className = 'formmsg'; $('#oMsg').textContent = `You're invited to game ${code}. Check your name and avatar, then tap Join.`;
  show('scr-online');
  $('#oJoin').focus();
}
$('#owSpin').onclick = () => send({t:'spin'});
function renderOWheel(g){
  const w = g.wheel;
  show('scr-owheel');
  $('#owEyebrow').textContent = g.topic.name;
  $('#owTitle').textContent = `Spin ${w.spins} times for subtopics`;
  $('#owSlots').innerHTML = Array.from({length:w.spins}, (_, i) => w.picks[i]
    ? `<div class="slot filled"><b>${i+1}</b>${esc(w.picks[i])}</div>` : `<div class="slot"><b>${i+1}</b><span class="muted">${g.isHost ? 'Spin to fill' : 'Waiting for a spin'}</span></div>`).join('');
  const left = w.spins - w.picks.length;
  $('#owHub').textContent = left ? left : '✓';
  $('#owSpin').hidden = !g.isHost || !left;
  $('#owSpin').disabled = w.busy;
  $('#owSpin').textContent = `Spin (${w.picks.length + 1} of ${w.spins})`;
  $('#owWait').hidden = g.isHost && left > 0;
  $('#owWait').textContent = left ? 'The host is spinning the wheel.' : 'All spun. Voting starts in a moment…';
  if(!online.wheel) online.wheel = {rot:0, items:w.items, anim:false};
  const ow = online.wheel, canvas = $('#owheel');
  if(w.spin && w.spin.seq > online.spinSeq){
    online.spinSeq = w.spin.seq;
    ow.items = w.items; ow.anim = true;
    const n = ow.items.length, seg = Math.PI*2/n, twoPi = Math.PI*2;
    const base = -Math.PI/2 - (w.spin.t + .5)*seg + (Number(w.spin.j) || 0)*seg*.6;
    const from = ow.rot; let to = base; while(to < from + twoPi*5) to += twoPi;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, dur = reduce ? 300 : 3600, t0 = performance.now();
    const step = now => {
      if(!online || online.wheel !== ow) return;
      const k = Math.min(1, (now - t0)/dur), e = 1 - Math.pow(1 - k, 4);
      ow.rot = from + (to - from)*e; drawWheel(-1, canvas, ow);
      if(k < 1) return requestAnimationFrame(step);
      ow.rot = to % twoPi; drawWheel(w.spin.t, canvas, ow); ow.anim = false;
    };
    requestAnimationFrame(step);
  } else if(!ow.anim){
    ow.items = w.items; requestAnimationFrame(() => drawWheel(-1, canvas, ow));
  }
}
function renderOVote(g){
  const me = myPl(g);
  show('scr-ovote');
  const v = g.vote;
  if(g.ph === 'vote'){
    $('#ovEyebrow').textContent = `${g.topic.name} · ${v.opts.length} options`;
    $('#ovTitle').textContent = me ? 'Vote for a subtopic' : 'Players are voting';
    const here = g.players.filter(pl => pl.on);
    $('#ovBody').innerHTML = `<div class="ocards">${v.opts.map((s, i) => `<button class="tcard c-${CARD_COLORS[i%5]}" data-ov="${i}" style="min-height:110px;${v.mine === i ? 'outline:4px solid var(--ink);outline-offset:3px' : ''}" ${me ? '' : 'disabled'}><h3>${esc(s)}</h3><div class="meta">${v.mine === i ? 'Your vote' : 'Vote for this'}</div></button>`).join('')}</div>
      <div><div class="eyebrow" style="margin-bottom:6px">${v.who.length} of ${here.length} voted</div>
      <div class="others">${here.map(pl => miniHTML(plView(pl), 1, '', v.who.includes(pl.p) ? '<span class="tick">Voted</span>' : '<span class="st">Thinking</span>')).join('')}</div></div>
      ${g.isHost ? `<div class="row"><button id="ovCount" class="btn" ${v.who.length ? '' : 'disabled'}>Count votes now</button><span class="muted">Votes are counted automatically once everyone has voted.</span></div>` : ''}`;
  } else {
    const t = g.tally, total = t.counts.reduce((a, b) => a + b, 0) || 1;
    $('#ovTitle').textContent = 'The votes are in';
    $('#ovBody').innerHTML = `<div class="tally">${v.opts.map((s, i) => `<div class="bar"><span>${esc(s)}</span><i><em style="width:${Number(t.counts[i])/total*100}%"></em></i><b>${Number(t.counts[i])}</b></div>`).join('')}</div>
      <h2>${esc(v.opts[t.win])} wins${t.tie ? ' the tiebreak' : ''}!</h2>
      ${g.isHost ? '<div class="row"><button id="ovStart" class="btn primary">Start the game</button></div>' : '<p class="note">Waiting for the host to start the game…</p>'}`;
  }
}
$('#ovBody').addEventListener('click', e => {
  const b = e.target.closest('[data-ov]');
  if(b) send({t:'vote', i:+b.dataset.ov});
  if(e.target.closest('#ovCount')) send({t:'count'});
  if(e.target.closest('#ovStart')) send({t:'begin'});
});
$('#roundBetPicks').addEventListener('click', e => {
  const b = e.target.closest('[data-bet]');
  if(b && online) send({t:'bet', p:b.dataset.bet});
});
function renderORound(g){
  $('#roundEyebrow').textContent = `${g.topic.name} · ${g.sub}`;
  $('#roundNum').textContent = `Round ${g.round}`;
  $('#roundRule').textContent = `First to ${g.need} right pops`;
  $('#roundNote').textContent = g.final
    ? `Final two! First to ${g.need} right wins the game. Only the first right answer scores.`
    : g.players.filter(pl => pl.s !== 'elim').length > 1
    ? 'Only the first right answer scores. A wrong guess locks you out until the next try. The last head left unpopped is out.'
    : `Get ${g.need} right to pop and move on.`;
  $('#roundPips').innerHTML = Array.from({length:ROUNDS}, (_, i) => `<span class="pip ${i < g.round ? 'on' : ''}"></span>`).join('');
  const nameOf = seat => { const pl = g.players.find(x => x.p === seat); return pl ? (pl.p === g.you ? 'You' : pl.n) : 'Someone'; };
  const names = seats => seats.map(nameOf).join(' and ');
  const bettors = g.players.filter(pl => pl.betting);
  if(g.final && bettors.length) $('#roundNote').textContent = `Final two! First to ${g.need} right wins, unless ${names(bettors.map(pl => pl.p))} guessed who pops first.`;
  // what happened last round
  const n = g.news, news = [];
  if(n){
    if(n.first) news.push(`${nameOf(n.first)} popped first.`);
    if(n.back.length) news.push(`${names(n.back)} guessed right and ${n.back.length > 1 || n.back[0] === g.you ? 'are' : 'is'} back in!`);
    if(n.wrong.length) news.push(`${names(n.wrong)} guessed wrong and ${n.wrong.length > 1 || n.wrong[0] === g.you ? 'are' : 'is'} out for good.`);
    if(n.out.length) news.push(`${names(n.out)} ${n.out.length > 1 || n.out[0] === g.you ? 'were' : 'was'} the last head left unpopped.`);
  }
  $('#roundNews').hidden = !news.length; $('#roundNews').textContent = news.join(' ');
  // my bet, if I was just knocked out
  const me = myPl(g), racing = g.players.filter(pl => pl.s !== 'elim');
  $('#roundBet').hidden = !(me && me.betting);
  if(me && me.betting){
    $('#roundBetPicks').innerHTML = racing.map(pl => `<button class="betpick ${me.bet === pl.p ? 'on' : ''}" data-bet="${pl.p}" aria-pressed="${me.bet === pl.p}">${avWrap(okAv(pl.av), 1, '')}<span>${esc(pl.n)}</span></button>`).join('');
  }
  $('#roundCrowd').innerHTML = g.players.map(pl => {
    const out = pl.s === 'elim';
    const tag = pl.betting ? `<span class="st">${pl.bet ? 'Bet on ' + esc(nameOf(pl.bet)) : 'Guessing…'}</span>`
      : out ? `<span class="st">Out in R${pl.r}</span>` : !pl.on ? '<span class="st">Away</span>' : '';
    return miniHTML(plView(pl, pl.p === g.you ? ' (you)' : ''), 1, out ? 'gone' : '', tag);
  }).join('');
  $('#roundGo').hidden = !g.isHost; $('#roundWait').hidden = g.isHost;
  $('#roundWait').textContent = me && me.betting ? (me.bet ? 'Bet placed. Waiting for the host to start the round…' : 'Pick before the host starts the round.')
    : me && me.s === 'elim' ? 'You\'re out, but you can watch. Waiting for the host…' : 'Waiting for the host to start the round…';
  const undecided = bettors.filter(pl => !pl.bet && pl.p !== g.you);
  $('#roundBetWait').hidden = !(g.isHost && undecided.length);
  $('#roundBetWait').textContent = `${names(undecided.map(pl => pl.p))} ${undecided.length > 1 ? 'are' : 'is'} still guessing. If you start now, they lose their chance.`;
  online.myPrev = null;
  show('scr-round');
}
const oScale = (pl, round) => 1 + 0.85 * (pl.c / round);
function renderOPlay(g, prev){
  const q = g.q, me = myPl(g);
  show('scr-oplay');
  const newQ = q.n !== online.lastQ;
  const newTry = newQ || !prev || !prev.q || prev.q.attempt !== q.attempt;
  if(newTry){ online.pending = null; online.tryLen = q.dl || QTIME*1000; }
  if(newQ){
    online.lastQ = q.n;
    $('#opRound').textContent = `Round ${g.round} of ${ROUNDS}`;
    $('#opSub').textContent = g.sub;
    $('#opQ').textContent = q.t;
    $('#opChoices').innerHTML = q.c.map((c, i) => `<button class="choice" data-oi="${i}"><kbd>${i+1}</kbd><span>${esc(c)}</span></button>`).join('');
    $('#opFb').textContent = '';
    resetReport($('#opReport'), q);
    if(g.mixed && !online.mixedNoted){ online.mixedNoted = true; toast(mixedNote(g.sub)); }
  }
  if(g.ph === 'q'){
    online.deadline = performance.now() + q.dl;
    cancelAnimationFrame(online.tRAF); online.tRAF = requestAnimationFrame(oTick);
  }
  // stage: me, or a note for people watching
  if(me){
    $('#opWho').textContent = me.n;
    const popNow = me.s === 'passed' && online.myPrev === 'playing';
    if(newQ || popNow || online.myPrev !== me.s || !$('#opStage .av')){
      const cls = me.s === 'passed' && !popNow ? 'popped' : (me.s === 'out' || me.s === 'elim') ? 'out' : '';
      $('#opStage').innerHTML = avatarSVG(okAv(me.av), popNow ? 1.9 : oScale(me, g.need), cls);
      if(popNow) setTimeout(() => { const svg = $('#opStage .av'); if(svg) popHead($('#opStage'), svg); }, 300);
    } else {
      const h = $('#opStage .head'); if(h && me.s === 'playing') h.style.transform = `scale(${oScale(me, g.need)})`;
    }
    $('#opProg').textContent = me.s === 'elim' ? 'Out' : `${Math.min(me.c, g.need)} of ${g.need} right`;
    $('#opStrikes').innerHTML = '';
    online.myPrev = me.s;
  } else {
    $('#opWho').textContent = 'Watching'; $('#opStage').innerHTML = avatarSVG(roster[0].av, 1, 'out');
    $('#opProg').textContent = ''; $('#opStrikes').innerHTML = '';
  }
  // choices and feedback
  const btns = $$('#opChoices .choice'), fb = $('#opFb');
  const gone = q.gone || [];
  btns.forEach((b, j) => b.classList.toggle('gone', gone.includes(j)));
  if(g.ph === 'q'){
    const locked = Number.isInteger(q.mine);                    // I guessed wrong this try
    const waiting = !locked && online.pending && online.pending.n === q.n && online.pending.attempt === q.attempt;
    const canAnswer = me && me.s === 'playing' && !locked && !waiting && q.dl > 0;
    btns.forEach((b, j) => {
      b.disabled = !canAnswer || gone.includes(j);
      b.classList.remove('right', 'dim');
      b.classList.toggle('wrong', locked && j === q.mine);
      b.classList.toggle('picked', waiting && j === online.pending.i);
    });
    fb.className = locked ? 'feedback bad' : 'feedback';
    fb.textContent = !me ? 'You\'re watching this game.'
      : me.s === 'passed' ? 'Your head popped this round. Watch the race for the last spots.'
      : me.s !== 'playing' && me.bet ? `You bet on ${(g.players.find(pl => pl.p === me.bet) || {n:'someone'}).n} popping first. Fingers crossed!`
      : me.s !== 'playing' ? 'You\'re out. Watching the others.'
      : locked ? (q.attempt === 1 ? 'Wrong! You\'re locked out until someone gets it or everyone misses.' : 'Wrong again. Waiting for the others…')
      : waiting ? 'Checking…'
      : q.attempt === 2 ? 'Second chance! The wrong answers are gone. First right answer scores.' : '';
    if(q.attempt === 2 && !locked && !waiting && me && me.s === 'playing') fb.className = 'feedback banner';
    $('#opNext').hidden = true;
  } else {
    cancelAnimationFrame(online.tRAF);
    const rv = g.rv, right = q.c[rv.c], myWrong = rv.a[g.you];
    btns.forEach((b, j) => {
      b.disabled = true; b.classList.remove('picked', 'gone');
      b.classList.toggle('right', j === rv.c); b.classList.toggle('wrong', j === myWrong && j !== rv.c);
      b.classList.toggle('dim', j !== rv.c && j !== myWrong);
    });
    const winner = g.players.find(pl => pl.p === rv.winner);
    if(rv.winner && rv.winner === g.you){
      fb.className = 'feedback good';
      fb.textContent = me.s === 'passed' ? (g.final ? 'POP! You win!' : g.round === ROUNDS ? 'POP! Round 10 cleared!' : 'You got it first. POP! You\'re through.') : `You got it first! ${g.need - me.c} more to pop.`;
    } else if(winner){
      fb.className = 'feedback'; fb.textContent = `${winner.n} got it first. It was ${right}.`;
    } else {
      fb.className = 'feedback bad'; fb.textContent = `Nobody got it. It was ${right}.`;
    }
    const unpopped = g.players.filter(pl => pl.s === 'playing').length, alive = g.players.filter(pl => pl.s !== 'elim').length;
    $('#opNext').hidden = !g.isHost;
    $('#opNext').textContent = unpopped <= (alive > 1 ? 1 : 0) ? 'Finish round' : 'Next question';
    $('#opReport').hidden = !$('#opReport').dataset.qid;
  }
  // everyone
  const locked = new Set(g.ph === 'q' ? q.locked : []);
  $('#opCrowd').innerHTML = g.players.filter(pl => pl.s !== 'elim').map(pl => {
    let tag;
    if(g.ph === 'rv' && pl.p === g.rv.winner) tag = '<span class="tick">Got it! +1</span>';
    else if(pl.s === 'passed') tag = '<span class="tick">Popped</span>';
    else if(!pl.on) tag = '<span class="st">Away</span>';
    else if(locked.has(pl.p)) tag = '<span class="tick no">Wrong</span>';
    else tag = `<span class="st">${pl.c}/${g.need}</span>`;
    const cls = (pl.p === g.you ? 'active ' : '') + (locked.has(pl.p) ? 'gone' : '');
    const avCls = pl.s === 'passed' ? 'popped' : '';
    return `<div class="mini ${cls}"><div class="avwrap">${avatarSVG(okAv(pl.av), pl.s === 'passed' ? 1 : oScale(pl, g.need), avCls)}</div><span>${esc(pl.n)}</span>${tag}</div>`;
  }).join('');
}
$('#opNext').onclick = () => send({t:'next'});
function oTick(){
  if(!online || !online.g || online.g.ph !== 'q') return;
  const left = Math.max(0, online.deadline - performance.now());
  $('#opTimerBar').style.transform = `scaleX(${Math.min(1, left/(online.tryLen || QTIME*1000))})`;
  $('#opTimer').classList.toggle('low', left < 5000);
  if(left > 0){ online.tRAF = requestAnimationFrame(oTick); return; }
  $$('#opChoices .choice').forEach(b => b.disabled = true);
  const me = myPl(online.g);
  if(me && me.s === 'playing' && !Number.isInteger(online.g.q.mine)) $('#opFb').textContent = 'Time\'s up!';
}
function oAnswer(i){
  if(!online || !online.g) return;
  const g = online.g, me = myPl(g), q = g.q;
  if(g.ph !== 'q' || !me || me.s !== 'playing' || Number.isInteger(q.mine) || (q.gone || []).includes(i)) return;
  if(online.pending && online.pending.n === q.n && online.pending.attempt === q.attempt) return;
  if(performance.now() >= online.deadline) return;
  online.pending = {n:q.n, attempt:q.attempt, i};
  send({t:'answer', n:q.n, i});
  $$('#opChoices .choice').forEach((b, j) => { b.disabled = true; b.classList.toggle('picked', j === i); });
  $('#opFb').className = 'feedback'; $('#opFb').textContent = 'Checking…';
}
$('#opChoices').addEventListener('click', e => { const b = e.target.closest('[data-oi]'); if(b) oAnswer(+b.dataset.oi); });
function renderOEnd(g){
  cancelAnimationFrame(online.tRAF);
  const winIds = new Set(g.end.w), winners = g.players.filter(pl => winIds.has(pl.p));
  const T = END_TEXT(g.end.reason, winners.length === 1 ? winners[0].n : '', winners.length > 1, g.round, g.sub, g.players.reduce((s, p) => s + p.t, 0));
  $('#endEyebrow').textContent = `${g.topic.name} · ${g.sub}`;
  $('#endTitle').textContent = T[0]; $('#endSub').textContent = T[1];
  const crowned = pl => ({name:pl.n, av:{...okAv(pl.av), hat:'crown'}});
  $('#podium').innerHTML = winners.map(w => miniHTML(crowned(w), 1.25)).join('');
  const ranked = [...g.players].sort((a, b) => (winIds.has(b.p) - winIds.has(a.p)) || (b.r - a.r) || (b.t - a.t));
  $('#board').innerHTML = ranked.map((pl, i) => `<div class="brow"><b>${i+1}</b>${avWrap(winIds.has(pl.p) ? crowned(pl).av : okAv(pl.av))}<span>${esc(pl.n)}${pl.p === g.you ? ' (you)' : ''}</span><span class="muted">Round ${pl.r} · ${pl.t} right</span></div>`).join('');
  $('#keepGoing').hidden = true;
  $('#againBtn').hidden = !g.isHost; $('#againBtn').textContent = 'Back to the lobby';
  show('scr-end');
}

/* ---------- boot ---------- */
renderLineup(); renderTopics(); renderCommunity(); renderDailyCard();
loadTopics();
openInvite();
loadDaily().then(renderDailyCard).catch(() => {});
// A new day may have started while the page sat open.
document.addEventListener('visibilitychange', () => { if(!document.hidden && !$('#scr-home').hidden) renderDailyCard(); });
