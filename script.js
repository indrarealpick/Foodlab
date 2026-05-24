/* ================================================================
   OTAFF SRS — SM-2 Spaced Repetition + Full App
   Source: OTAFF 飲食料品製造業 特定技能1号 学習テキスト 第5.0版
   ================================================================ */

// ================================================================
// SM-2 ALGORITHM (Anki-style)
// ================================================================
const SM2 = {
  /* quality: 1=Again 2=Hard 3=Good 4=Easy */
  review(card, q) {
    let { interval = 0, ef = 2.5, reps = 0 } = card;
    if (q >= 3) {
      interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ef);
      reps++;
    } else { interval = 1; reps = 0; }
    ef = Math.max(1.3, Math.min(2.5, ef + (0.1 - (4 - q) * (0.08 + (4 - q) * 0.02))));
    ef = Math.round(ef * 100) / 100;
    const next = new Date(); next.setDate(next.getDate() + interval);
    return { interval, ef, reps, next: next.toISOString().slice(0,10), lq: q, lr: today() };
  },
  previewAll(card) {
    const out = {};
    [1,2,3,4].forEach(q => { const r = this.review({...card}, q); out[q] = fmtDays(r.interval); });
    return out;
  },
  isDue(card) { return !card.next || card.next <= today(); },
  isNew(card) { return !card.reps || card.reps === 0; }
};

function today() { return new Date().toISOString().slice(0,10); }
function fmtDays(d) {
  if (d <= 0) return '<1hari';
  if (d === 1) return '1hari';
  if (d < 7) return d+'hari';
  if (d < 30) return Math.round(d/7)+'mgg';
  return Math.round(d/30)+'bln';
}

// ================================================================
// STATE
// ================================================================
let vocab = null;
let state = { cards:{}, streak:0, lastStudy:null, dayDone:0, dayDate:null };
let sess = { mode:null, queue:[], idx:0, ok:0, sk:0, catId:null, flipped:false };

function loadState() {
  try { const s=localStorage.getItem('otaffsrs3'); if(s) state={...state,...JSON.parse(s)}; } catch(e){}
}
function saveState() {
  try { localStorage.setItem('otaffsrs3', JSON.stringify(state)); } catch(e){}
}
function gc(kanji) { if(!state.cards[kanji]) state.cards[kanji]={}; return state.cards[kanji]; }
function sc(kanji, data) { state.cards[kanji]={...gc(kanji),...data}; }

// ================================================================
// COMPUTED STATS
// ================================================================
function totalW() { return vocab ? vocab.categories.reduce((s,c)=>s+c.words.length,0) : 0; }
function learnedW() { return Object.values(state.cards).filter(c=>c.reps>0).length; }
function dueWords(catId) {
  if(!vocab) return [];
  let out=[];
  vocab.categories.forEach(cat=>{
    if(catId&&catId!=='all'&&cat.id!==catId) return;
    cat.words.forEach(w=>{ if(SM2.isDue(gc(w.kanji))) out.push({...w,catId:cat.id,catName:cat.name,catIcon:cat.icon,catColor:cat.color}); });
  });
  return out;
}
function dueCount() { return dueWords('all').length; }
function catLearned(catId) {
  if(!vocab) return 0;
  const cat=vocab.categories.find(c=>c.id===catId); if(!cat) return 0;
  return cat.words.filter(w=>gc(w.kanji).reps>0).length;
}
function catDue(catId) { return dueWords(catId).length; }

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function greet() {
  const h=new Date().getHours();
  return h<12?'おはようございます 🌅':h<17?'こんにちは ☀️':'こんばんは 🌙';
}
function fmtDate() {
  return new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'});
}

function toast(msg, dur=2200) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.remove('hidden');
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(t._t);
  t._t=setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.classList.add('hidden'),300); },dur);
}

function updStreak() {
  const td=today();
  if(state.lastStudy!==td) {
    const yest=new Date(); yest.setDate(yest.getDate()-1);
    state.streak = state.lastStudy===yest.toISOString().slice(0,10)?(state.streak||0)+1:1;
    state.lastStudy=td;
  }
  if(state.dayDate!==td){ state.dayDate=td; state.dayDone=0; }
}

// ================================================================
// NAVIGATION
// ================================================================
function showView(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const v=document.getElementById('v-'+id); if(v) v.classList.add('active');
  document.querySelectorAll('.nb').forEach(b=>b.classList.toggle('active',b.dataset.v===id));
  window.scrollTo({top:0,behavior:'smooth'});
}

function updHdr() {
  document.getElementById('h-due').textContent=dueCount();
  document.getElementById('h-str').textContent=state.streak||0;
}

// ================================================================
// HOME
// ================================================================
function renderHome() {
  document.getElementById('th-greet').textContent=greet();
  document.getElementById('th-date').textContent=fmtDate();
  const due=dueCount(),learned=learnedW(),total=totalW(),newW=total-learned;
  const pct=total>0?Math.round(learned/total*100):0;
  document.getElementById('tn-due').textContent=due;
  document.getElementById('tn-new').textContent=newW;
  document.getElementById('tn-lrn').textContent=learned;
  document.getElementById('th-prog-fill').style.width=pct+'%';
  document.getElementById('th-prog-pct').textContent=pct+'%';
  const grid=document.getElementById('cat-grid'); if(!vocab||!grid) return;
  grid.innerHTML=vocab.categories.map(cat=>{
    const t=cat.words.length,l=catLearned(cat.id),d=catDue(cat.id),p=Math.round(l/t*100);
    return `<div class="ccard" style="--cc:${cat.color}" onclick="openCat('${cat.id}')">
      <span class="cc-ic">${cat.icon}</span>
      <div class="cc-nm">${cat.name}</div>
      <div class="cc-id">${cat.name_id||''}</div>
      <div class="cc-cnt">${l}/${t} · 📚${d}due</div>
      <div class="cc-bar"><div class="cc-fill" style="width:${p}%;background:${cat.color}"></div></div>
    </div>`;
  }).join('');
  updHdr();
}

function openCat(catId) { showCatSel('fc',catId); }

// ================================================================
// CATEGORY SELECT
// ================================================================
function showCatSel(mode) {
  sess.pendingMode=mode;
  const labels={srs:'SRS レビュー',fc:'フラッシュカード',jp:'日本語→インドネシア語',id:'インドネシア語→日本語'};
  document.getElementById('cs-title').textContent=`カテゴリー — ${labels[mode]||mode}`;
  document.getElementById('cs-desc').textContent='学習するカテゴリーを選んでください';
  if(!vocab) return;
  document.getElementById('cs-grid').innerHTML=`
    <div class="cscard all" onclick="startSess('${mode}','all')">
      <span class="csc-ic">🌟</span>
      <div class="csc-nm">全カテゴリー</div>
      <div class="csc-cnt">${totalW()} 単語</div>
    </div>
    ${vocab.categories.map(cat=>`
    <div class="cscard" onclick="startSess('${mode}','${cat.id}')">
      <span class="csc-ic">${cat.icon}</span>
      <div class="csc-nm">${cat.name}</div>
      <div class="csc-cnt">${cat.words.length}語 · ${catDue(cat.id)}due</div>
    </div>`).join('')}`;
  showView('cs');
}

// ================================================================
// BUILD QUEUE
// ================================================================
function buildQ(catId, mode) {
  if(!vocab) return [];
  let words=[];
  vocab.categories.forEach(cat=>{
    if(catId!=='all'&&cat.id!==catId) return;
    cat.words.forEach(w=>words.push({...w,catId:cat.id,catName:cat.name,catIcon:cat.icon,catColor:cat.color}));
  });
  if(mode==='srs') {
    let due=words.filter(w=>SM2.isDue(gc(w.kanji)));
    if(!due.length) due=shuffle(words);
    const newW=due.filter(w=>SM2.isNew(gc(w.kanji)));
    const revW=due.filter(w=>!SM2.isNew(gc(w.kanji))).sort((a,b)=>(gc(a.kanji).next||'').localeCompare(gc(b.kanji).next||''));
    return [...newW,...revW];
  }
  return shuffle(words);
}

function startSess(mode, catId) {
  const q=buildQ(catId,mode);
  if(!q.length){ toast('単語が見つかりません'); return; }
  sess={mode,queue:q,idx:0,ok:0,sk:0,catId,flipped:false};
  updStreak();
  if(mode==='srs') startSRS();
  else if(mode==='fc') startFC();
  else if(mode==='jp') startType('jp');
  else if(mode==='id') startType('id');
}

// ================================================================
// SRS MODE
// ================================================================
function startSRS() { showView('srs'); renderSRS(); setupSwipe('srs-card','srs'); }

function renderSRS() {
  const w=sess.queue[sess.idx]; if(!w) return;
  el('srs-ct').textContent=sess.queue.length;
  el('srs-ci').textContent=sess.idx+1;
  el('srs-pbar').style.width=(sess.idx/sess.queue.length*100)+'%';
  setcat('sc-cat',w);
  el('sc-kanji').textContent=w.kanji;
  el('sc-furi').textContent=w.furigana;
  el('sc-rom').textContent=w.romaji||'';
  el('sc-kanji-b').textContent=w.kanji;
  el('sc-furi-b').textContent=w.furigana;
  el('sc-ans').textContent=w.indonesia;
  el('sc-desc').textContent=w.desc||'';
  const card=el('srs-card');
  card.classList.remove('flipped','so-l','so-r');
  card.style.transform='';
  sess.flipped=false;
  el('srs-rating').classList.add('hidden');
  el('srs-flip-hint').classList.remove('hidden');
}

function flipSRS() {
  if(sess.flipped) return;
  el('srs-card').classList.add('flipped');
  sess.flipped=true;
  el('srs-flip-hint').classList.add('hidden');
  el('srs-rating').classList.remove('hidden');
  const w=sess.queue[sess.idx];
  const p=SM2.previewAll(gc(w.kanji));
  [1,2,3,4].forEach(q=>{ el('rv-'+q).textContent=p[q]; });
}

function rateSRS(q) {
  const w=sess.queue[sess.idx];
  sc(w.kanji, SM2.review(gc(w.kanji),q));
  const card=el('srs-card');
  if(q>=3){
    sess.ok++; state.dayDone++;
    toast(q===4?'🎉 完璧！':'✅ 正解！');
    card.classList.add('so-r');
  } else {
    sess.sk++;
    sess.queue.push({...sess.queue[sess.idx]});
    toast('🔄 もう一度後で');
    card.classList.add('so-l');
  }
  saveState(); updHdr();
  setTimeout(()=>{ sess.idx++; sess.idx>=sess.queue.length?showDone():renderSRS(); },360);
}

// ================================================================
// FLASHCARD MODE
// ================================================================
function startFC() {
  showView('fc');
  const cat=sess.catId==='all'?'全カテゴリー':(vocab.categories.find(c=>c.id===sess.catId)?.name||'');
  el('fc-title').textContent=cat;
  renderFC();
  setupSwipe('fc-card','fc');
}

function renderFC() {
  const w=sess.queue[sess.idx]; if(!w) return;
  el('fc-ct').textContent=sess.queue.length;
  el('fc-ci').textContent=sess.idx+1;
  el('fc-pbar').style.width=(sess.idx/sess.queue.length*100)+'%';
  setcat('fc-cat',w);
  el('fc-kanji').textContent=w.kanji;
  el('fc-furi').textContent=w.furigana;
  el('fc-rom').textContent=w.romaji||'';
  el('fc-kanji-b').textContent=w.kanji;
  el('fc-furi-b').textContent=w.furigana;
  el('fc-ans').textContent=w.indonesia;
  el('fc-desc').textContent=w.desc||'';
  const card=el('fc-card');
  card.classList.remove('flipped','so-l','so-r');
  card.style.transform='';
  sess.flipped=false;
}

function flipFC() {
  const card=el('fc-card');
  sess.flipped=!sess.flipped;
  card.classList.toggle('flipped',sess.flipped);
}

function nextFC(result) {
  const w=sess.queue[sess.idx];
  const card=el('fc-card');
  if(result==='got'){
    sc(w.kanji, SM2.review(gc(w.kanji),3));
    sess.ok++;
    card.classList.add('so-r');
    toast('✅ 正解！');
  } else {
    sess.sk++;
    card.classList.add('so-l');
  }
  saveState(); updHdr();
  setTimeout(()=>{ sess.idx++; sess.idx>=sess.queue.length?showDone():renderFC(); },360);
}

// ================================================================
// TYPING MODES (JP→ID and ID→JP)
// ================================================================
function startType(mode) {
  showView(mode);
  renderType(mode);
}

function renderType(mode) {
  const w=sess.queue[sess.idx]; if(!w) return;
  const pfx=mode==='jp'?'jp':'id';
  el(pfx+'-ct').textContent=sess.queue.length;
  el(pfx+'-ci').textContent=sess.idx+1;
  el(pfx+'-pbar').style.width=(sess.idx/sess.queue.length*100)+'%';

  if(mode==='jp') {
    el('tp-kanji').textContent=w.kanji;
    el('tp-furi').textContent=w.furigana;
    el('tp-desc').textContent=w.desc||'';
  } else {
    el('tid-word').textContent=w.indonesia;
    el('tid-desc').textContent=w.desc||'';
  }
  const inId=mode==='jp'?'tp-in':'tid-in';
  const fbId=mode==='jp'?'tp-fb':'tid-fb';
  const inp=el(inId);
  inp.value=''; inp.className=''; inp.disabled=false;
  el(mode==='jp'?'tp-sub':'tid-sub').disabled=false;
  el(fbId).classList.add('hidden');
  inp.focus();
}

function checkType(mode) {
  const w=sess.queue[sess.idx];
  const inId=mode==='jp'?'tp-in':'tid-in';
  const fbId=mode==='jp'?'tp-fb':'tid-fb';
  const inp=el(inId);
  const ans=inp.value.trim().toLowerCase();
  let correct, correctDisplay;
  if(mode==='jp') {
    correct=w.indonesia.toLowerCase();
    correctDisplay=w.indonesia;
  } else {
    correct=w.kanji;
    correctDisplay=`${w.kanji}（${w.furigana}）`;
  }
  const ok=isMatch(ans, correct, mode);
  inp.disabled=true;
  el(mode==='jp'?'tp-sub':'tid-sub').disabled=true;
  const sfx=mode==='jp'?'1':'2';
  el('tp-fb').classList[mode==='jp'?'remove':'add']('hidden');
  el('tid-fb').classList[mode==='id'?'remove':'add']('hidden');
  el(`fb-ic${sfx}`).textContent=ok?'✅':'❌';
  el(`fb-ans${sfx}`).textContent=ok?correctDisplay:'正解: '+correctDisplay;
  el(`fb-ans${sfx}`).style.color=ok?'var(--green)':'var(--orange)';
  el(`fb-you${sfx}`).textContent='あなた: '+(inp.value||'(空白)');
  if(ok) {
    inp.classList.add('ok');
    sc(w.kanji, SM2.review(gc(w.kanji),3));
    sess.ok++;
    saveState(); updHdr();
    toast('✅ 正解！');
  } else {
    inp.classList.add('ng');
    sess.sk++;
    toast('❌ '+correctDisplay, 2800);
  }
}

function isMatch(ans, correct, mode) {
  if(!ans) return false;
  const c=correct.toLowerCase();
  if(ans===c) return true;
  if(mode==='jp') {
    // flexible: contains, starts with, levenshtein
    if(c.includes(ans)&&ans.length>=Math.max(3,c.length*0.55)) return true;
    if(ans.includes(c)) return true;
    if(lev(ans,c)<=Math.floor(c.length*0.2)) return true;
  } else {
    // For JP→JP: match kanji or furigana
    const w=sess.queue[sess.idx];
    const furi=w.furigana.toLowerCase();
    if(ans===furi) return true;
    if(lev(ans,c)<=1||lev(ans,furi)<=1) return true;
  }
  return false;
}

function lev(a,b) {
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function nextType(mode) {
  sess.idx++;
  if(sess.idx>=sess.queue.length) showDone();
  else renderType(mode);
}

// ================================================================
// COMPLETE
// ================================================================
function showDone() {
  updStreak(); saveState(); updHdr();
  el('ds-ok').textContent=sess.ok;
  el('ds-sk').textContent=sess.sk;
  el('ds-tot').textContent=sess.queue.length;
  const pct=Math.round(sess.ok/sess.queue.length*100);
  el('done-em').textContent=pct>=90?'🏆':pct>=70?'⭐':pct>=50?'💪':'📚';
  const msgs={90:'完璧です！OTAFFの達人！',70:'素晴らしい！続けましょう！',50:'よく頑張りました！毎日続けよう！',0:'練習を続けましょう！必ず上達します！'};
  el('done-msg').textContent=pct>=90?msgs[90]:pct>=70?msgs[70]:pct>=50?msgs[50]:msgs[0];
  showView('done');
  renderHome();
}

// ================================================================
// REVIEW LIST
// ================================================================
function renderRev() {
  const list=el('rev-list');
  const words=[];
  if(vocab) vocab.categories.forEach(cat=>cat.words.forEach(w=>{
    const card=gc(w.kanji);
    if(card.reps>0) words.push({...w,card,catIcon:cat.icon,catColor:cat.color,catName:cat.name});
  }));
  el('rev-cnt').textContent=words.length+'語';
  list.innerHTML=!words.length?
    `<div class="rev-empty"><span>📭</span><p>まだ習得語なし<br>SRSで学習を始めよう！</p></div>`:
    words.map(w=>`<div class="ri">
      <div class="ri-badge" style="background:${w.catColor}20">${w.catIcon}</div>
      <div class="ri-body">
        <div class="ri-kj">${w.kanji}</div>
        <div class="ri-fr">${w.furigana}${w.romaji?' · '+w.romaji:''}</div>
        <div class="ri-id">${w.indonesia}</div>
        <div class="ri-iv">次回:${w.card.next||'今日'} · ${w.card.interval||0}日 · EF:${w.card.ef||2.5}</div>
      </div>
    </div>`).join('');
}

// ================================================================
// SEARCH
// ================================================================
function doSearch(q) {
  if(!q.trim()||!vocab) return;
  const query=q.toLowerCase();
  const results=[];
  vocab.categories.forEach(cat=>cat.words.forEach(w=>{
    if(w.kanji.includes(query)||w.furigana.includes(query)||w.indonesia.toLowerCase().includes(query)||(w.romaji&&w.romaji.toLowerCase().includes(query))||(w.desc&&w.desc.toLowerCase().includes(query)))
      results.push({...w,catName:cat.name,catIcon:cat.icon,catColor:cat.color});
  }));
  el('srch-cnt').textContent=results.length+'件';
  el('srch-list').innerHTML=!results.length?
    `<div class="srch-empty"><p>"${q}" の検索結果なし</p></div>`:
    results.map(w=>`<div class="si">
      <div class="si-kj">${w.kanji}</div>
      <div class="si-fr">${w.furigana}${w.romaji?' · '+w.romaji:''}</div>
      <div class="si-id">${w.indonesia}</div>
      <div class="si-desc">${w.desc||''}</div>
      <div class="si-cat">${w.catIcon} ${w.catName}</div>
    </div>`).join('');
  showView('srch');
}

// ================================================================
// SWIPE SYSTEM
// ================================================================
function setupSwipe(cardId, context) {
  const card=el(cardId); if(!card) return;
  const isFC=context==='fc';
  const lInd=el(isFC?'fc-swl':'sw-l');
  const rInd=el(isFC?'fc-swr':'sw-r');
  let sx=0,sy=0,drag=false,dx=0;

  function onStart(e){ const t=e.type==='touchstart'?e.touches[0]:e; sx=t.clientX;sy=t.clientY;drag=true;dx=0; }
  function onMove(e){
    if(!drag) return;
    const t=e.type==='touchmove'?e.touches[0]:e;
    const ddx=t.clientX-sx,ddy=t.clientY-sy;
    if(Math.abs(ddy)>Math.abs(ddx)*1.5) return;
    dx=ddx;
    const rot=sess.flipped?' rotateY(180deg)':'';
    card.style.transform=`translateX(${dx}px) rotate(${dx*0.05}deg)${rot}`;
    if(lInd) lInd.style.opacity=dx<-40?Math.min(1,(-dx-40)/80):0;
    if(rInd) rInd.style.opacity=dx>40?Math.min(1,(dx-40)/80):0;
    e.preventDefault();
  }
  function onEnd(){
    if(!drag) return; drag=false;
    card.style.transform='';
    if(lInd) lInd.style.opacity=0;
    if(rInd) rInd.style.opacity=0;
    if(dx>80) onSwipe(context,'right');
    else if(dx<-80) onSwipe(context,'left');
  }
  card.addEventListener('touchstart',onStart,{passive:true});
  card.addEventListener('touchmove',onMove,{passive:false});
  card.addEventListener('touchend',onEnd);
  card.addEventListener('mousedown',onStart);
  window.addEventListener('mousemove',e=>{if(drag)onMove(e);});
  window.addEventListener('mouseup',onEnd);
}

function onSwipe(ctx, dir) {
  if(ctx==='srs') {
    if(!sess.flipped) { flipSRS(); return; }
    rateSRS(dir==='right'?3:1);
  } else if(ctx==='fc') {
    if(!sess.flipped) { flipFC(); return; }
    if(dir==='right') nextFC('got'); else nextFC('skip');
  }
}

// ================================================================
// HELPERS
// ================================================================
function el(id){ return document.getElementById(id); }

function setcat(elId, w) {
  const e=el(elId); if(!e) return;
  e.textContent=`${w.catIcon} ${w.catName}`;
  e.style.background=w.catColor+'20';
  e.style.color=w.catColor;
}

// ================================================================
// INIT
// ================================================================
async function init() {
  loadState();
  try { const r=await fetch('vocabulary.json'); vocab=await r.json(); }
  catch(e){ console.warn('vocabulary.json load failed'); vocab={categories:[]}; }
  setTimeout(()=>{
    const sp=el('splash');
    sp.classList.add('out');
    setTimeout(()=>{ sp.style.display='none'; el('app').classList.remove('hidden'); renderHome(); updHdr(); },500);
  },1900);
}

// ================================================================
// EVENT LISTENERS
// ================================================================
document.addEventListener('DOMContentLoaded',()=>{

  // Bottom nav
  document.querySelectorAll('.nb').forEach(btn=>btn.addEventListener('click',()=>{
    const v=btn.dataset.v;
    if(v==='home'){ renderHome(); showView('home'); }
    else if(v==='srs') showCatSel('srs');
    else if(v==='fc') showCatSel('fc');
    else if(v==='jp') showCatSel('jp');
  }));

  // Home mode items
  el('m-srs')?.addEventListener('click',()=>showCatSel('srs'));
  el('m-fc')?.addEventListener('click',()=>showCatSel('fc'));
  el('m-jp')?.addEventListener('click',()=>showCatSel('jp'));
  el('m-id')?.addEventListener('click',()=>showCatSel('id'));
  el('m-rev')?.addEventListener('click',()=>{ renderRev(); showView('rev'); });
  el('btn-study-now')?.addEventListener('click',()=>{ dueCount()>0?startSess('srs','all'):showCatSel('fc'); });

  // SRS
  el('srs-card')?.addEventListener('click',()=>{ if(!sess.flipped) flipSRS(); });
  el('srs-flip')?.addEventListener('click',flipSRS);
  el('srs-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  document.querySelectorAll('.rbt').forEach(btn=>btn.addEventListener('click',()=>rateSRS(parseInt(btn.dataset.q))));

  // Flashcard
  el('fc-card')?.addEventListener('click',flipFC);
  el('fc-flip')?.addEventListener('click',flipFC);
  el('fc-got')?.addEventListener('click',()=>nextFC('got'));
  el('fc-skip')?.addEventListener('click',()=>nextFC('skip'));
  el('fc-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });

  // Typing JP→ID
  el('jp-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  el('tp-sub')?.addEventListener('click',()=>checkType('jp'));
  el('tp-next')?.addEventListener('click',()=>nextType('jp'));
  el('tp-skip')?.addEventListener('click',()=>{ sess.sk++; nextType('jp'); });
  el('tp-hint')?.addEventListener('click',()=>{
    const w=sess.queue[sess.idx]; if(w) toast('💡 '+w.indonesia.substring(0,Math.ceil(w.indonesia.length/2))+'…',3000);
  });
  el('tp-in')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ if(!el('tp-fb').classList.contains('hidden')) nextType('jp'); else checkType('jp'); }
  });

  // Typing ID→JP
  el('id-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  el('tid-sub')?.addEventListener('click',()=>checkType('id'));
  el('tid-next')?.addEventListener('click',()=>nextType('id'));
  el('tid-skip')?.addEventListener('click',()=>{ sess.sk++; nextType('id'); });
  el('tid-hint')?.addEventListener('click',()=>{
    const w=sess.queue[sess.idx]; if(w) toast('💡 '+w.furigana,3000);
  });
  el('tid-in')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ if(!el('tid-fb').classList.contains('hidden')) nextType('id'); else checkType('id'); }
  });

  // Cat select & review & search back
  el('cs-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  el('rev-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  el('srch-back')?.addEventListener('click',()=>{ renderHome(); showView('home'); });

  // Complete
  el('dn-again')?.addEventListener('click',()=>startSess(sess.mode||'srs',sess.catId||'all'));
  el('dn-home')?.addEventListener('click',()=>{ renderHome(); showView('home'); });

  // Reset
  el('btn-reset')?.addEventListener('click',()=>{
    if(confirm('全ての学習記録をリセットしますか？')){
      state.cards={}; state.streak=0; state.dayDone=0;
      saveState(); renderHome(); updHdr(); toast('🔄 リセット完了');
    }
  });

  // Search
  el('btn-srch')?.addEventListener('click',()=>{
    const r=el('srch-row'); r.classList.toggle('hidden');
    if(!r.classList.contains('hidden')) el('srch-in').focus();
  });
  el('srch-x')?.addEventListener('click',()=>{ el('srch-row').classList.add('hidden'); el('srch-in').value=''; });
  el('srch-in')?.addEventListener('input',e=>{ if(e.target.value.length>=2) doSearch(e.target.value); });
  el('srch-in')?.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.value) doSearch(e.target.value); });

  init();
});
