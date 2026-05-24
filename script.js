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
// ================================================================
// EMBEDDED VOCABULARY (from OTAFF Modul 5.0 official)
// ================================================================
const VOCAB_DATA = {"meta": {"source": "OTAFF 飲食料品製造業 特定技能1号評価試験 学習テキスト 第5.0版 (2024年12月)", "publisher": "一般社団法人 外国人食品産業技能評価機構 (OTAFF)", "url": "https://otaff1.jp/img/file/i_gakusyutext_jp_2412.pdf", "total": 220, "note": "All terms extracted strictly from OTAFF Module 5.0/5.1 official text"}, "categories": [{"id": "shokuhin_eisei", "name": "食品衛生", "furigana": "しょくひんえいせい", "name_id": "Sanitasi Pangan", "icon": "🛡️", "color": "#00ff88", "desc": "Bab 2 Modul OTAFF — Dasar keamanan pangan", "words": [{"kanji": "食品衛生", "furigana": "しょくひんえいせい", "romaji": "shokuhin eisei", "indonesia": "sanitasi / keamanan pangan", "desc": "Upaya agar semua makanan tidak membuat orang sakit atau terluka (Modul OTAFF Bab 2 p.5)"}, {"kanji": "衛生管理", "furigana": "えいせいかんり", "romaji": "eisei kanri", "indonesia": "manajemen sanitasi", "desc": "Mengelola produksi makanan agar yang memakannya tidak sakit atau terluka"}, {"kanji": "一般衛生管理", "furigana": "いっぱんえいせいかんり", "romaji": "ippan eisei kanri", "indonesia": "manajemen sanitasi umum", "desc": "Manajemen sanitasi yang umum dilakukan di semua area kerja untuk semua jenis makanan"}, {"kanji": "危害要因", "furigana": "きがいよういん", "romaji": "kigai youin", "indonesia": "faktor bahaya / hazard", "desc": "Penyebab orang menjadi sakit atau terluka dari makanan (OTAFF p.7)"}, {"kanji": "物理的危害要因", "furigana": "ぶつりてききがいよういん", "romaji": "butsuri teki kigai youin", "indonesia": "bahaya fisik", "desc": "Benda keras seperti logam, kaca, batu yang dapat melukai mulut/tenggorokan (p.7)"}, {"kanji": "化学的危害要因", "furigana": "かがくてききがいよういん", "romaji": "kagaku teki kigai youin", "indonesia": "bahaya kimia", "desc": "Zat kimia berbahaya seperti alergen, histamin, solanin, deterjen (p.8)"}, {"kanji": "生物的危害要因", "furigana": "せいぶつてききがいよういん", "romaji": "seibutsu teki kigai youin", "indonesia": "bahaya biologis", "desc": "Bakteri, virus, parasit, jamur penyebab keracunan makanan (p.10)"}, {"kanji": "異物", "furigana": "いぶつ", "romaji": "ibutsu", "indonesia": "benda asing", "desc": "Benda yang masuk ke dalam makanan yang seharusnya tidak ada (OTAFF p.7)"}, {"kanji": "硬質異物", "furigana": "こうしついぶつ", "romaji": "koushitsu ibutsu", "indonesia": "benda asing keras", "desc": "Benda asing keras seperti logam, kaca, batu — termasuk bahaya fisik (p.7)"}, {"kanji": "異物混入", "furigana": "いぶつこんにゅう", "romaji": "ibutsu konnyuu", "indonesia": "kontaminasi benda asing", "desc": "Masuknya benda asing ke dalam makanan selama proses produksi"}, {"kanji": "交差汚染", "furigana": "こうさおせん", "romaji": "kousa osen", "indonesia": "kontaminasi silang", "desc": "Ketika benda bersih bersentuhan dengan benda tidak bersih sehingga terkontaminasi (p.16)"}, {"kanji": "汚染", "furigana": "おせん", "romaji": "osen", "indonesia": "kontaminasi / pencemaran", "desc": "Masuknya hazard ke dalam bahan atau makanan"}, {"kanji": "食中毒", "furigana": "しょくちゅうどく", "romaji": "shokuchu doku", "indonesia": "keracunan makanan", "desc": "Penyakit yang disebabkan mengonsumsi makanan yang terkontaminasi (OTAFF p.11)"}, {"kanji": "食中毒菌", "furigana": "しょくちゅうどくきん", "romaji": "shokuchu doku kin", "indonesia": "bakteri keracunan makanan", "desc": "Bakteri penyebab keracunan makanan (OTAFF p.11)"}, {"kanji": "食中毒予防の３原則", "furigana": "しょくちゅうどくよぼうのさんげんそく", "romaji": "shokuchu doku yobou no san gensoku", "indonesia": "3 prinsip pencegahan keracunan makanan", "desc": "つけない (jauhkan) ・増やさない (cegah berkembang) ・やっつける (berantas) (p.12)"}, {"kanji": "病原性微生物", "furigana": "びょうげんせいびせいぶつ", "romaji": "byougensei biseibutsu", "indonesia": "mikroorganisme patogen", "desc": "Bakteri dan virus penyebab penyakit yang tidak dapat dilihat dengan mata biasa (p.10)"}, {"kanji": "微生物", "furigana": "びせいぶつ", "romaji": "biseibutsu", "indonesia": "mikroorganisme", "desc": "Makhluk hidup sangat kecil seperti bakteri dan virus — hanya terlihat dengan mikroskop"}, {"kanji": "細菌", "furigana": "さいきん", "romaji": "saikin", "indonesia": "bakteri", "desc": "Mikroorganisme bersel satu penyebab keracunan makanan"}, {"kanji": "ウイルス", "furigana": "ういるす", "romaji": "uirusu", "indonesia": "virus", "desc": "Agen infeksius yang berkembang di dalam tubuh yang terinfeksi"}, {"kanji": "寄生虫", "furigana": "きせいちゅう", "romaji": "kiseichu", "indonesia": "parasit", "desc": "Organisme yang hidup pada tubuh manusia/hewan dengan mengambil nutrisi (p.14)"}, {"kanji": "カビ", "furigana": "かび", "romaji": "kabi", "indonesia": "jamur / kapang", "desc": "Mikroorganisme yang dapat terlihat mata ketika sudah berkembang biak (p.14)"}, {"kanji": "芽胞", "furigana": "がほう", "romaji": "gahou", "indonesia": "endospora / spora bakteri tahan panas", "desc": "Bentuk bertahan bakteri seperti biji dengan cangkang — tahan panas dan kering (p.12)"}]}, {"id": "shokuchu_doku_kin", "name": "食中毒菌・ウイルス", "furigana": "しょくちゅうどくきん・ういるす", "name_id": "Bakteri & Virus Keracunan Makanan", "icon": "🦠", "color": "#ff4444", "desc": "Bab 2 Modul OTAFF p.11-14 — Bakteri dan virus penyebab keracunan makanan", "words": [{"kanji": "カンピロバクター属菌", "furigana": "かんぴろばくたーぞくきん", "romaji": "Campylobacter zoku kin", "indonesia": "bakteri Campylobacter", "desc": "Berkembang di tubuh → gejala: diare, sakit perut, demam. Sumber: daging (khususnya ayam) (p.11)"}, {"kanji": "サルモネラ属菌", "furigana": "さるもねらぞくきん", "romaji": "Salmonella zoku kin", "indonesia": "bakteri Salmonella", "desc": "Berkembang di tubuh → gejala: diare, sakit perut, demam. Sumber: telur ayam, daging ayam (p.11)"}, {"kanji": "腸炎ビブリオ", "furigana": "ちょうえんびぶりお", "romaji": "chouen Vibrio", "indonesia": "Vibrio parahaemolyticus", "desc": "Berkembang di tubuh, menghasilkan toksin → sakit perut, diare parah. Sumber: ikan/seafood (p.11)"}, {"kanji": "腸管出血性大腸菌", "furigana": "ちょうかんしゅっけつせいだいちょうきん", "romaji": "choukan shukketsusi daichoukin", "indonesia": "E. coli enterohemoragik (O157, O111)", "desc": "→ sakit perut, diare parah, tinja berdarah. Sumber: daging sapi, sayuran, air sumur (p.11)"}, {"kanji": "黄色ブドウ球菌", "furigana": "おうしょくぶどうきゅうきん", "romaji": "oushoku budou kyuukin", "indonesia": "Staphylococcus aureus", "desc": "Dari kulit/luka manusia → toksin TAHAN PANAS → mual, muntah, sakit perut. Sumber: onigiri, sandwich (p.11)"}, {"kanji": "セレウス菌", "furigana": "せれうすきん", "romaji": "Cereus kin", "indonesia": "bakteri Bacillus cereus", "desc": "Membuat endospora tahan panas → toksin → mual, muntah, diare. Sumber: produk biji-bijian, nasi goreng (p.11)"}, {"kanji": "ウェルシュ菌", "furigana": "うぇるしゅきん", "romaji": "Welsh kin", "indonesia": "bakteri Clostridium perfringens", "desc": "Membuat endospora tahan panas → toksin di tubuh → sakit perut, diare. Sumber: kari, stew (p.11)"}, {"kanji": "ボツリヌス菌", "furigana": "ぼつりぬすきん", "romaji": "Botulinus kin", "indonesia": "bakteri Clostridium botulinum", "desc": "Membuat endospora tahan panas → toksin → mual, muntah, kesulitan bernapas. Sumber: makanan kaleng (p.11)"}, {"kanji": "ノロウイルス", "furigana": "のろういるす", "romaji": "Norovirus", "indonesia": "norovirus", "desc": "Berkembang di usus orang terinfeksi → sakit perut, diare, muntah. Sumber: tiram, tangan (p.13)"}, {"kanji": "アニサキス", "furigana": "あにさきす", "romaji": "Anisakis", "indonesia": "Anisakis (parasit ikan laut)", "desc": "Parasit pada ikan laut (makarel, sarden, salmon, dll) → sakit perut parah jika dimakan mentah (p.14)"}, {"kanji": "毒素", "furigana": "どくそ", "romaji": "dokusu", "indonesia": "toksin / racun bakteri", "desc": "Zat beracun yang dihasilkan bakteri — toksin Staphylococcus dan Cereus TIDAK hilang dipanaskan (p.12)"}, {"kanji": "ヒスタミン", "furigana": "ひすたみん", "romaji": "histamine", "indonesia": "histamin", "desc": "Zat pada ikan merah (tuna, makarel, sarden) yang disimpan buruk → gejala seperti alergi (p.9)"}, {"kanji": "ソラニン", "furigana": "そらにん", "romaji": "solanin", "indonesia": "solanin", "desc": "Zat pada kecambah dan kulit hijau kentang → mual, muntah, diare. Cara mencegah: buang kecambah (p.10)"}, {"kanji": "ヒスタミン食中毒", "furigana": "ひすたみんしょくちゅうどく", "romaji": "histamine shokuchu doku", "indonesia": "keracunan histamin", "desc": "Keracunan akibat mengonsumsi ikan yang mengandung histamin — gejala seperti alergi (p.9-10)"}, {"kanji": "アニサキス食中毒", "furigana": "あにさきすしょくちゅうどく", "romaji": "Anisakis shokuchu doku", "indonesia": "keracunan Anisakis", "desc": "Keracunan akibat memakan ikan mentah mengandung Anisakis → sakit perut parah (p.14)"}]}, {"id": "allergen", "name": "アレルゲン管理", "furigana": "あれるげんかんり", "name_id": "Manajemen Alergen", "icon": "⚠️", "color": "#ffaa00", "desc": "Bab 2 Modul OTAFF p.8-9 — Alergen dan manajemen", "words": [{"kanji": "アレルゲン", "furigana": "あれるげん", "romaji": "arerugen", "indonesia": "alergen / zat penyebab alergi", "desc": "Zat yang menyebabkan reaksi alergi — juga disebut アレルギー物質 (p.8)"}, {"kanji": "アレルギー物質", "furigana": "あれるぎーぶっしつ", "romaji": "arerugii busshitsu", "indonesia": "bahan alergen", "desc": "Zat yang menyebabkan tubuh bereaksi berlebihan → gatal, bengkak, sulit bernapas, bahkan kematian (p.8)"}, {"kanji": "アレルギー反応", "furigana": "あれるぎーはんのう", "romaji": "arerugii hannou", "indonesia": "reaksi alergi", "desc": "Reaksi berlebihan tubuh terhadap zat tertentu → gatal, bengkak, sulit bernapas (p.8)"}, {"kanji": "特定原材料", "furigana": "とくていげんざいりょう", "romaji": "tokutei genzairyou", "indonesia": "bahan baku tertentu (wajib label)", "desc": "8 item wajib dicantumkan di label: えび, かに, くるみ, 小麦, そば, 卵, 乳, 落花生 (p.9)"}, {"kanji": "特定原材料に準ずるもの", "furigana": "とくていげんざいりょうにじゅんずるもの", "romaji": "tokutei genzairyou ni junzuru mono", "indonesia": "bahan setara bahan baku tertentu (dianjurkan label)", "desc": "20 item yang dianjurkan diberi label: アーモンド, あわび, いか, いくら, dll (p.9)"}, {"kanji": "えび", "furigana": "えび", "romaji": "ebi", "indonesia": "udang — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "かに", "furigana": "かに", "romaji": "kani", "indonesia": "kepiting — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "くるみ", "furigana": "くるみ", "romaji": "kurumi", "indonesia": "kenari (walnut) — alergen wajib label", "desc": "Dipindahkan ke 特定原材料 sejak 9 Maret 2023 (p.9)"}, {"kanji": "小麦", "furigana": "こむぎ", "romaji": "komugi", "indonesia": "gandum/terigu — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "そば", "furigana": "そば", "romaji": "soba", "indonesia": "soba (gandum soba) — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "卵", "furigana": "たまご", "romaji": "tamago", "indonesia": "telur — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "乳", "furigana": "にゅう", "romaji": "nyuu", "indonesia": "susu — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}, {"kanji": "落花生", "furigana": "らっかせい", "romaji": "rakkasei", "indonesia": "kacang tanah (peanut) — alergen wajib label", "desc": "Salah satu dari 8 特定原材料 yang wajib dicantumkan di label makanan"}]}, {"id": "ippan_eisei", "name": "一般衛生管理", "furigana": "いっぱんえいせいかんり", "name_id": "Manajemen Sanitasi Umum", "icon": "🧼", "color": "#00d4ff", "desc": "Bab 2 Modul OTAFF p.15-40 — 5S, fasilitas, pekerja, bahan baku", "words": [{"kanji": "５Ｓ", "furigana": "ごえす", "romaji": "go esu", "indonesia": "5S (Seiri, Seiton, Seisou, Seiketsu, Shitsuke)", "desc": "5 aktivitas yang dimulai huruf S — dasar manajemen tempat kerja di Jepang (p.15)"}, {"kanji": "整理", "furigana": "せいり", "romaji": "seiri", "indonesia": "S1: Ringkas — singkirkan barang tidak perlu", "desc": "Menyingkirkan barang tidak diperlukan, hanya menyimpan yang perlu (p.15)"}, {"kanji": "整頓", "furigana": "せいとん", "romaji": "seiton", "indonesia": "S2: Rapi — letakkan di tempat yang ditentukan", "desc": "Mengatur agar peralatan dapat diambil segera saat dibutuhkan (p.15)"}, {"kanji": "清掃", "furigana": "せいそう", "romaji": "seisou", "indonesia": "S3: Resik — bersihkan dan lap setiap hari", "desc": "Mencuci, menggosok, mengelap fasilitas dan peralatan agar bersih (p.15)"}, {"kanji": "清潔", "furigana": "せいけつ", "romaji": "seiketsu", "indonesia": "S4: Rawat — pertahankan kondisi bersih", "desc": "Menjaga fasilitas tidak terkontaminasi mikroorganisme patogen (p.15)"}, {"kanji": "習慣づけ", "furigana": "しゅうかんづけ", "romaji": "shuukanduke", "indonesia": "S5: Rajin / Rutinitas — biasakan mematuhi aturan", "desc": "Mampu melakukan aturan 整理, 整頓, 清掃, 清潔 secara konsisten (p.15)"}, {"kanji": "区分衛生管理", "furigana": "くぶんえいせいかんり", "romaji": "kubun eisei kanri", "indonesia": "manajemen sanitasi dengan zonasi", "desc": "Membagi area pabrik menjadi zona bersih/semi-bersih/terkontaminasi (p.16)"}, {"kanji": "ゾーニング", "furigana": "ぞーにんぐ", "romaji": "zooningu", "indonesia": "zonasi area kerja", "desc": "Pembagian area berdasarkan tingkat kebersihan untuk mencegah kontaminasi silang (p.16)"}, {"kanji": "清潔作業区域", "furigana": "せいけつさぎょうくいき", "romaji": "seiketsu sagyou kuiki", "indonesia": "area kerja bersih", "desc": "Area untuk makanan yang sudah disterilkan — mis: plating, pengemasan lauk siap saji (p.16)"}, {"kanji": "準清潔作業区域", "furigana": "じゅんせいけつさぎょうくいき", "romaji": "jun seiketsu sagyou kuiki", "indonesia": "area kerja semi-bersih", "desc": "Area untuk bahan baku sebelum disterilkan — mis: persiapan, pemanasan (p.16)"}, {"kanji": "汚染作業区域", "furigana": "おせんさぎょうくいき", "romaji": "osen sagyou kuiki", "indonesia": "area kerja terkontaminasi", "desc": "Area penerimaan bahan baku dari luar — termasuk pengemasan dalam kardus (p.16-17)"}, {"kanji": "健康チェック", "furigana": "けんこうちぇっく", "romaji": "kenkou chekku", "indonesia": "pemeriksaan kesehatan harian", "desc": "Konfirmasi tidak ada: 下痢, 発熱, 吐き気, luka di tangan sebelum mulai bekerja (p.18)"}, {"kanji": "作業服", "furigana": "さぎょうふく", "romaji": "sagyou fuku", "indonesia": "seragam kerja", "desc": "Pakaian kerja yang harus dipakai dengan benar di area produksi (p.19)"}, {"kanji": "ヘアーネット", "furigana": "へあーねっと", "romaji": "heaa netto", "indonesia": "hairnet / jaring rambut", "desc": "Wajib dipakai agar rambut tidak keluar dan masuk ke makanan (p.20)"}, {"kanji": "帽子", "furigana": "ぼうし", "romaji": "boushi", "indonesia": "topi / penutup kepala", "desc": "Dipakai di atas hairnet — rambut dan telinga tidak boleh keluar (p.20)"}, {"kanji": "マスク", "furigana": "ますく", "romaji": "masuku", "indonesia": "masker", "desc": "Harus menutup dari hidung hingga dagu — tidak boleh dilepas saat bekerja (p.23)"}, {"kanji": "手袋", "furigana": "てぶくろ", "romaji": "tebukuro", "indonesia": "sarung tangan", "desc": "Dipakai untuk mencegah hazard dari tangan pekerja ke makanan (p.26)"}, {"kanji": "エプロン", "furigana": "えぷろん", "romaji": "epuron", "indonesia": "celemek / apron", "desc": "Dipakai di atas seragam kerja untuk perlindungan tambahan (p.26)"}, {"kanji": "手洗い", "furigana": "てあらい", "romaji": "tearai", "indonesia": "cuci tangan", "desc": "Langkah paling dasar mencegah kontaminasi — wajib sebelum bekerja, sesudah toilet, dll (p.24)"}, {"kanji": "流水", "furigana": "りゅうすい", "romaji": "ryuusui", "indonesia": "air mengalir", "desc": "Cuci tangan harus menggunakan air mengalir — bukan air tergenang (p.25)"}, {"kanji": "粘着ローラー", "furigana": "ねんちゃくろーらー", "romaji": "nenchaku rooraa", "indonesia": "lint roller", "desc": "Alat untuk membersihkan rambut dan debu dari seragam sebelum masuk area kerja (p.21)"}, {"kanji": "エアーシャワー", "furigana": "えあーしゃわー", "romaji": "eaa shawaa", "indonesia": "air shower", "desc": "Alat peniup untuk membersihkan kotoran dari seragam sebelum masuk area kerja (p.21)"}, {"kanji": "受入検査", "furigana": "うけいれけんさ", "romaji": "ukoire kensa", "indonesia": "pemeriksaan penerimaan bahan baku", "desc": "Konfirmasi bahan baku yang datang sesuai pesanan dan memenuhi syarat kualitas (p.27-28)"}, {"kanji": "先入れ先出し", "furigana": "さきいれさきだし", "romaji": "saki ire saki dashi", "indonesia": "FIFO — bahan lama dipakai lebih dulu", "desc": "Bahan baku yang masuk lebih dulu digunakan lebih dulu — mencegah kadaluarsa (p.31)"}, {"kanji": "消費期限", "furigana": "しょうひきげん", "romaji": "shouhi kigen", "indonesia": "tanggal kadaluarsa (wajib habis sebelum)", "desc": "Batas akhir makanan yang belum dibuka aman dikonsumsi — TIDAK BOLEH dipakai setelah tanggal ini (p.31)"}, {"kanji": "賞味期限", "furigana": "しょうみきげん", "romaji": "shoumi kigen", "indonesia": "best before (kualitas terbaik)", "desc": "Batas akhir makanan yang belum dibuka dapat dinikmati dengan enak — pabrik umumnya tidak pakai setelah ini"}, {"kanji": "使用期限", "furigana": "しようきげん", "romaji": "shiyou kigen", "indonesia": "batas penggunaan bahan baku", "desc": "Batas terakhir bahan baku boleh digunakan — ditentukan oleh pabrik makanan yang menggunakannya (p.30)"}, {"kanji": "解凍", "furigana": "かいとう", "romaji": "kaitou", "indonesia": "pencairan / thawing", "desc": "Proses mencairkan bahan beku — ada 3 metode: alami, kulkas, air mengalir (p.31-32)"}, {"kanji": "ドリップ", "furigana": "どりっぷ", "romaji": "dori ppu", "indonesia": "drip / cairan yang keluar saat thawing", "desc": "Cairan yang keluar dari daging/ikan saat dicairkan — harus dicegah mengenai bahan lain (p.32)"}, {"kanji": "下処理", "furigana": "したしょり", "romaji": "shita shori", "indonesia": "persiapan bahan baku (pra-proses)", "desc": "Mencuci, menyortir, memotong bahan baku sebelum diproses lebih lanjut (p.32)"}]}, {"id": "kanetsu_kanri", "name": "加熱・冷却管理", "furigana": "かねつ・れいきゃくかんり", "name_id": "Manajemen Pemanasan & Pendinginan", "icon": "🌡️", "color": "#ff6b35", "desc": "Bab 2 Modul OTAFF p.33-35 — Suhu kritis pemanasan dan pendinginan", "words": [{"kanji": "加熱殺菌", "furigana": "かねつさっきん", "romaji": "kanetsu sakkin", "indonesia": "sterilisasi dengan pemanasan", "desc": "Membunuh bakteri dengan pemanasan pada suhu dan waktu tertentu (OTAFF p.33)"}, {"kanji": "中心温度", "furigana": "ちゅうしんおんど", "romaji": "chuushin ondo", "indonesia": "suhu inti bahan", "desc": "Suhu di bagian paling dalam produk — harus diukur terutama saat memanaskan daging berukuran besar (p.33)"}, {"kanji": "75℃・1分間", "furigana": "ななじゅうごど・いっぷんかん", "romaji": "75 do, ippunkan", "indonesia": "75°C selama 1 menit atau lebih", "desc": "Kondisi pemanasan minimum untuk membunuh sebagian besar bakteri keracunan makanan (OTAFF p.13)"}, {"kanji": "85℃〜90℃・90秒間", "furigana": "はちじゅうごど〜きゅうじゅうど・きゅうじゅうびょうかん", "romaji": "85-90 do, 90 byou", "indonesia": "85–90°C selama 90 detik atau lebih", "desc": "Kondisi pemanasan untuk membunuh norovirus — lebih keras dari kondisi umum (p.13)"}, {"kanji": "加熱後の冷却", "furigana": "かねつごのれいきゃく", "romaji": "kanetsu go no reikyaku", "indonesia": "pendinginan setelah pemanasan", "desc": "Setelah dipanaskan harus segera didinginkan — mencegah bakteri berkembang saat mendingin (p.33-34)"}, {"kanji": "化学殺菌", "furigana": "かがくさっきん", "romaji": "kagaku sakkin", "indonesia": "sterilisasi dengan bahan kimia", "desc": "Membunuh mikroorganisme menggunakan bahan kimia pada konsentrasi dan waktu tertentu (p.34)"}, {"kanji": "次亜塩素酸ナトリウム", "furigana": "じあえんそさんなとりうむ", "romaji": "jia ensosan natoriumu", "indonesia": "natrium hipoklorit (larutan desinfektan)", "desc": "Digunakan pada konsentrasi 200ppm untuk mendesinfeksi alat dari norovirus (p.13, p.34)"}, {"kanji": "200ppm", "furigana": "にひゃくぴーぴーえむ", "romaji": "nihyaku ppm", "indonesia": "200 ppm — konsentrasi desinfektan norovirus", "desc": "Konsentrasi larutan natrium hipoklorit untuk mendesinfeksi mesin dan peralatan dari norovirus"}, {"kanji": "加熱調理", "furigana": "かねつちょうり", "romaji": "kanetsu chouri", "indonesia": "memasak dengan panas", "desc": "Proses memasak menggunakan panas — dapat membunuh bahaya biologis jika suhu cukup (p.33)"}, {"kanji": "非加熱調理", "furigana": "ひかねつちょうり", "romaji": "hi kanetsu chouri", "indonesia": "memasak tanpa panas", "desc": "Proses produksi tanpa pemanasan — memerlukan sterilisasi kimia untuk keamanan (p.34)"}, {"kanji": "急速冷凍", "furigana": "きゅうそくれいとう", "romaji": "kyuusoku reitou", "indonesia": "pembekuan cepat", "desc": "Membekukan makanan dengan cepat untuk menjaga kualitas — lambat = tekstur memburuk (p.34)"}, {"kanji": "冷却方法", "furigana": "れいきゃくほうほう", "romaji": "reikyaku houhou", "indonesia": "metode pendinginan", "desc": "2 metode: 風冷 (pendinginan angin) dan 水冷 (pendinginan air) (p.34)"}, {"kanji": "-15℃以下", "furigana": "まいなすじゅうごどいか", "romaji": "minus 15 do ika", "indonesia": "di bawah -15°C — suhu freezer minimum (hukum)", "desc": "Standar suhu freezer berdasarkan UU Sanitasi Pangan Jepang (p.30)"}, {"kanji": "10℃以下", "furigana": "じゅうどいか", "romaji": "juu do ika", "indonesia": "di bawah 10°C — suhu kulkas minimum (hukum)", "desc": "Standar suhu kulkas berdasarkan UU Sanitasi Pangan Jepang — untuk daging, telur, ikan, dll (p.30)"}, {"kanji": "－20℃・24時間", "furigana": "まいなすにじゅうど・にじゅうよじかん", "romaji": "minus 20 do, 24 jikan", "indonesia": "-20°C selama 24 jam — membunuh Anisakis", "desc": "Kondisi pembekuan untuk membunuh parasit Anisakis dalam ikan (p.14)"}]}, {"id": "haccp", "name": "HACCP管理", "furigana": "はさっぷかんり", "name_id": "Manajemen HACCP", "icon": "✅", "color": "#00ff88", "desc": "Bab 2 Modul OTAFF p.37-40 — Sistem HACCP 7 prinsip", "words": [{"kanji": "HACCP", "furigana": "はさっぷ", "romaji": "HACCP", "indonesia": "Hazard Analysis and Critical Control Points", "desc": "Sistem manajemen keamanan pangan — 危害要因分析重要管理点 (p.37)"}, {"kanji": "HACCPプラン", "furigana": "はさっぷぷらん", "romaji": "HACCP puran", "indonesia": "rencana HACCP", "desc": "Kombinasi 一般衛生管理 + manajemen CCP untuk produk tertentu (p.5)"}, {"kanji": "危害要因分析", "furigana": "きがいよういんぶんせき", "romaji": "kigai youin bunseki", "indonesia": "analisis bahaya (Hazard Analysis)", "desc": "Prinsip 1 HACCP: menentukan manajemen apa yang diperlukan agar makanan bebas bahaya (p.37)"}, {"kanji": "重要管理点", "furigana": "じゅうようかんりてん", "romaji": "juuyou kanriten", "indonesia": "Critical Control Point (CCP)", "desc": "Prinsip 2 HACCP: proses paling kritis yang harus dikontrol untuk keamanan pangan (p.38)"}, {"kanji": "管理基準", "furigana": "かんりきじゅん", "romaji": "kanri kijun", "indonesia": "standar manajemen / batas kritis", "desc": "Prinsip 3 HACCP: standar yang harus dipenuhi di CCP (mis: suhu, waktu, konsentrasi) (p.38)"}, {"kanji": "モニタリング", "furigana": "もにたりんぐ", "romaji": "monitoringu", "indonesia": "pemantauan CCP", "desc": "Prinsip 4 HACCP: metode untuk memantau apakah CCP sesuai standar manajemen (p.38)"}, {"kanji": "改善措置", "furigana": "かいぜんそち", "romaji": "kaizen sochi", "indonesia": "tindakan perbaikan (corrective action)", "desc": "Prinsip 5 HACCP: tindakan jika CCP menyimpang dari standar — 2 langkah penting (p.40)"}, {"kanji": "検証", "furigana": "けんしょう", "romaji": "kenshou", "indonesia": "verifikasi", "desc": "Prinsip 6 HACCP: konfirmasi metode yang ditetapkan efektif menghilangkan bahaya (p.38)"}, {"kanji": "記録", "furigana": "きろく", "romaji": "kiroku", "indonesia": "pencatatan / dokumentasi", "desc": "Prinsip 7 HACCP: mencatat semua keputusan dan hasil konfirmasi secara tertulis (p.38, p.40)"}, {"kanji": "管理基準からの逸脱", "furigana": "かんりきじゅんからのいつだつ", "romaji": "kanri kijun kara no itsudatsu", "indonesia": "penyimpangan dari standar manajemen", "desc": "Kondisi yang tidak memenuhi standar CCP — contoh: suhu inti hanya 70°C bukan 75°C (p.39)"}, {"kanji": "改善措置の２つのポイント", "furigana": "かいぜんそちのふたつのぽいんと", "romaji": "kaizen sochi no futatsu no pointo", "indonesia": "2 poin penting tindakan perbaikan", "desc": "① Mencegah penyimpangan serupa tidak terulang ② Memutuskan tindakan terhadap produk (p.40)"}, {"kanji": "記録の改ざん", "furigana": "きろくのかいざん", "romaji": "kiroku no kaizan", "indonesia": "pemalsuan catatan (DILARANG KERAS)", "desc": "Mencatat hal yang tidak sesuai kenyataan — DILARANG. Harus dicatat saat pengukuran (p.40)"}, {"kanji": "金属探知機", "furigana": "きんぞくたんちき", "romaji": "kinzoku tanchi ki", "indonesia": "metal detector / detektor logam", "desc": "Salah satu CCP umum dalam produksi makanan — deteksi logam dalam produk (p.39)"}, {"kanji": "Ｘ線異物検出機", "furigana": "えっくすせんいぶつけんしゅつき", "romaji": "X-sen ibutsu kenshutsuki", "indonesia": "mesin detektor sinar-X", "desc": "Salah satu CCP — dapat mendeteksi benda asing keras (batu, kaca) selain logam (p.36)"}, {"kanji": "テストピース", "furigana": "てすとぴーす", "romaji": "tesuto piisu", "indonesia": "test piece / benda uji", "desc": "Digunakan untuk konfirmasi metal detector berfungsi sebelum mulai dan setelah selesai (p.35)"}]}, {"id": "hozon_kanri", "name": "原材料・保存管理", "furigana": "げんざいりょう・ほぞんかんり", "name_id": "Manajemen Bahan Baku & Penyimpanan", "icon": "📦", "color": "#ffdd00", "desc": "Bab 2 Modul OTAFF p.27-36 — Penyimpanan bahan baku", "words": [{"kanji": "原材料", "furigana": "げんざいりょう", "romaji": "genzairyou", "indonesia": "bahan baku / bahan mentah", "desc": "Bahan yang digunakan sebagai input produksi makanan"}, {"kanji": "保管温度", "furigana": "ほかんおんど", "romaji": "hokan ondo", "indonesia": "suhu penyimpanan", "desc": "Suhu yang ditetapkan untuk masing-masing jenis bahan baku (OTAFF tabel p.29)"}, {"kanji": "冷蔵庫", "furigana": "れいぞうこ", "romaji": "reizouko", "indonesia": "lemari es / kulkas", "desc": "Penyimpanan pada 10°C ke bawah — pintu tidak boleh dibiarkan terbuka (p.30)"}, {"kanji": "冷凍庫", "furigana": "れいとうこ", "romaji": "reitou ko", "indonesia": "freezer", "desc": "Penyimpanan pada -15°C ke bawah — isi 80-90% kapasitas untuk hemat energi (p.30)"}, {"kanji": "食肉", "furigana": "しょくにく", "romaji": "shoku niku", "indonesia": "daging — simpan di bawah 10°C", "desc": "Daging segar disimpan pada 10°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "生鮮魚介類", "furigana": "せいせんぎょかいるい", "romaji": "seisen gyokai rui", "indonesia": "ikan segar — simpan di bawah 5°C", "desc": "Ikan/seafood segar disimpan pada 5°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "冷凍水産物", "furigana": "れいとうすいさんぶつ", "romaji": "reitou suisan butsu", "indonesia": "produk laut beku — simpan di bawah -18°C", "desc": "Ikan/seafood beku disimpan pada -18°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "液卵", "furigana": "えきらん", "romaji": "ekiran", "indonesia": "telur cair (liquid egg) — simpan di bawah 8°C", "desc": "Telur yang sudah dikocok/dipisah — disimpan pada 8°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "殻付き卵", "furigana": "からつきたまご", "romaji": "karauki tamago", "indonesia": "telur berkulit — simpan di bawah 10°C", "desc": "Telur dengan cangkang disimpan pada 10°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "冷凍食肉", "furigana": "れいとうしょくにく", "romaji": "reitou shoku niku", "indonesia": "daging beku — simpan di bawah -15°C", "desc": "Daging beku disimpan pada -15°C ke bawah (tabel OTAFF p.29)"}, {"kanji": "生鮮果実・野菜", "furigana": "せいせんかじつ・やさい", "romaji": "seisen kajitsu yasai", "indonesia": "buah/sayuran segar — simpan sekitar 10°C", "desc": "Buah dan sayuran segar disimpan sekitar 10°C (tabel OTAFF p.29)"}, {"kanji": "段ボール箱", "furigana": "だんぼーるばこ", "romaji": "danbooru bako", "indonesia": "kardus / kotak karton", "desc": "DILARANG dibawa ke area bersih/semi-bersih — mungkin mengandung tanah, debu, serangga (p.17)"}, {"kanji": "サンプルの保存", "furigana": "さんぷるのほぞん", "romaji": "sanpuru no hozon", "indonesia": "penyimpanan sampel produk", "desc": "Menyimpan sebagian produk yang akan dikirim untuk investigasi jika ada komplain (p.36)"}]}, {"id": "hyouji_housouu", "name": "食品表示・包装", "furigana": "しょくひんひょうじ・ほうそう", "name_id": "Pelabelan & Pengemasan Pangan", "icon": "🏷️", "color": "#ff4da6", "desc": "Bab 2 Modul OTAFF p.35 — Pelabelan dan pengemasan", "words": [{"kanji": "食品表示", "furigana": "しょくひんひょうじ", "romaji": "shokuhin hyouji", "indonesia": "pelabelan pangan", "desc": "Informasi yang wajib dicantumkan pada kemasan produk makanan"}, {"kanji": "包装", "furigana": "ほうそう", "romaji": "housou", "indonesia": "pengemasan", "desc": "Proses memasukkan produk ke dalam kemasan setelah dipastikan bebas bahaya (p.34)"}, {"kanji": "充填", "furigana": "じゅうてん", "romaji": "juuten", "indonesia": "pengisian produk ke kemasan", "desc": "Memasukkan produk ke dalam botol, kantong, atau wadah lainnya (p.34)"}, {"kanji": "表示の義務", "furigana": "ひょうじのぎむ", "romaji": "hyouji no gimu", "indonesia": "kewajiban pelabelan", "desc": "Makanan olahan yang mengandung alergen harus diberi label — diatur hukum Jepang (p.8)"}, {"kanji": "表示の推奨", "furigana": "ひょうじのすいしょう", "romaji": "hyouji no suishou", "indonesia": "pelabelan yang dianjurkan", "desc": "Pelabelan yang 'lebih baik dilakukan' untuk 特定原材料に準ずるもの 20 item (p.8)"}, {"kanji": "消費期限の表示", "furigana": "しょうひきげんのひょうじ", "romaji": "shouhi kigen no hyouji", "indonesia": "pencantuman tanggal kadaluarsa pada kemasan", "desc": "消費期限 dan 賞味期限 harus ditampilkan dengan benar pada kemasan produk jadi (p.35)"}]}, {"id": "roudou_anzen", "name": "労働安全", "furigana": "ろうどうあんぜん", "name_id": "Keselamatan Kerja", "icon": "🦺", "color": "#b24bff", "desc": "Bab 3 Modul OTAFF p.42-62 — Keselamatan kerja di industri makanan", "words": [{"kanji": "労働安全", "furigana": "ろうどうあんぜん", "romaji": "roudou anzen", "indonesia": "keselamatan kerja", "desc": "Melindungi keselamatan dan kesehatan para pekerja di tempat kerja (OTAFF p.3)"}, {"kanji": "労働災害", "furigana": "ろうどうさいがい", "romaji": "roudou saigai", "indonesia": "kecelakaan kerja", "desc": "Cedera atau kematian yang terjadi akibat pekerjaan di pabrik (p.42)"}, {"kanji": "未熟練労働者", "furigana": "みじゅくれんろうどうしゃ", "romaji": "mijukuren roudousha", "indonesia": "pekerja tidak terampil (<3 tahun)", "desc": "Pekerja dengan pengalaman kurang dari 3 tahun — paling banyak mengalami kecelakaan (p.42)"}, {"kanji": "転倒", "furigana": "てんとう", "romaji": "tentou", "indonesia": "terpeleset / tersandung", "desc": "Jenis kecelakaan PALING BANYAK (31.3%) di industri makanan — lantai basah, berlari, dll (p.43)"}, {"kanji": "はさまれ・巻き込まれ", "furigana": "はさまれ・まきこまれ", "romaji": "hasamare, makikomare", "indonesia": "terjepit / terjerat mesin", "desc": "Jenis kecelakaan ke-2 (19.2%) — tangan masuk mesin bergerak atau membersihkan konveyor (p.43)"}, {"kanji": "切れ・こすれ", "furigana": "きれ・こすれ", "romaji": "kire, kosure", "indonesia": "terpotong / teriris", "desc": "Jenis kecelakaan ke-3 (10.8%) — menggunakan pisau/slicer atau mesin tersumbat (p.43)"}, {"kanji": "転落", "furigana": "てんらく", "romaji": "tenraku", "indonesia": "terjatuh dari ketinggian", "desc": "Kecelakaan saat menuruni tangga atau bekerja di ketinggian dengan tangga (p.44)"}, {"kanji": "やけど", "furigana": "やけど", "romaji": "yakedo", "indonesia": "luka bakar", "desc": "Kecelakaan saat menggunakan oven atau menangani air/makanan panas (p.44)"}, {"kanji": "腰痛", "furigana": "ようつう", "romaji": "youtsuu", "indonesia": "sakit pinggang", "desc": "Terjadi saat mengangkat atau membawa benda berat berulang kali (p.44)"}, {"kanji": "熱中症", "furigana": "ねっちゅうしょう", "romaji": "netchuu shou", "indonesia": "heat stroke / serangan panas", "desc": "Terjadi saat bekerja lama di tempat suhu dan kelembapan tinggi — bisa menyebabkan kematian (p.44)"}, {"kanji": "激突", "furigana": "げきとつ", "romaji": "gekitotsu", "indonesia": "benturan (dengan forklift)", "desc": "Kecelakaan saat pekerja bergerak dan bertabrakan dengan forklift (p.44)"}, {"kanji": "安全保護具", "furigana": "あんぜんほごぐ", "romaji": "anzen hogogu", "indonesia": "alat pelindung diri (APD)", "desc": "Pakaian kerja, helm, dan perlengkapan keselamatan yang harus dipakai dengan benar (p.3, p.46)"}, {"kanji": "ヘルメット", "furigana": "へるめっと", "romaji": "herumetto", "indonesia": "helm keselamatan", "desc": "Pelindung kepala — dipakai saat bekerja di ketinggian 2 meter ke atas (p.46)"}, {"kanji": "高所作業", "furigana": "こうしょさぎょう", "romaji": "kousho sagyou", "indonesia": "kerja di ketinggian (2 meter ke atas)", "desc": "Bekerja pada ketinggian 2 meter atau lebih — wajib memakai helm (p.46)"}, {"kanji": "作業手順書", "furigana": "さぎょうてじゅんしょ", "romaji": "sagyou tejunsho", "indonesia": "prosedur kerja / manual / SOP", "desc": "Dokumen yang menjelaskan langkah-langkah pekerjaan untuk mencegah kecelakaan (p.3, p.48)"}, {"kanji": "非常停止ボタン", "furigana": "ひじょうていしぼたん", "romaji": "hijou teishi botan", "indonesia": "tombol stop darurat", "desc": "Tombol untuk menghentikan mesin segera saat terjadi kelainan (p.50)"}, {"kanji": "フェールセーフ", "furigana": "ふぇーるせーふ", "romaji": "feel seefu", "indonesia": "fail-safe — berhenti otomatis saat rusak", "desc": "Sistem yang menghentikan mesin otomatis ketika ada bagian rusak atau produk tersumbat (p.51)"}, {"kanji": "フールプルーフ", "furigana": "ふーるぷるーふ", "romaji": "fuur puruufu", "indonesia": "fool-proof — mencegah kesalahan manusia", "desc": "Mekanisme yang mencegah kecelakaan meski ada kesalahan operator — mis: penutup pengaman (p.51)"}, {"kanji": "作業前点検", "furigana": "さぎょうまえてんけん", "romaji": "sagyou mae tenken", "indonesia": "inspeksi sebelum bekerja", "desc": "Memeriksa kondisi mesin/fasilitas sebelum mulai — tidak ada kotoran, suara aneh, kerusakan (p.48)"}, {"kanji": "指差呼称", "furigana": "ゆびさしこしょう", "romaji": "yubisashi koshou", "indonesia": "tunjuk sebut — konfirmasi verbal sambil menunjuk", "desc": "Menunjuk dengan jari sambil menyebut nama dan kondisi — mencegah kesalahan operasional (p.48)"}]}, {"id": "kiken_yochi", "name": "危険予知・異常対応", "furigana": "きけんよち・いじょうたいおう", "name_id": "Prediksi Bahaya & Penanganan Darurat", "icon": "🚨", "color": "#ff6b35", "desc": "Bab 3 Modul OTAFF p.52-55 — KYT dan penanganan darurat", "words": [{"kanji": "異常事態", "furigana": "いじょうじたい", "romaji": "ijou jitai", "indonesia": "situasi tidak normal / darurat", "desc": "Kondisi tidak biasa yang harus segera dilaporkan ke penanggung jawab (p.52)"}, {"kanji": "二次災害", "furigana": "にじさいがい", "romaji": "niji saigai", "indonesia": "kecelakaan sekunder", "desc": "Kecelakaan yang dialami orang yang mencoba menolong korban — jangan buru-buru mendekati (p.52)"}, {"kanji": "ヒヤリ・ハット", "furigana": "ひやりはっと", "romaji": "hiyari hatto", "indonesia": "kejadian nyaris celaka (near miss)", "desc": "Pengalaman hampir celaka tapi tidak mengakibatkan cedera (p.54)"}, {"kanji": "ヒヤリ・ハット活動", "furigana": "ひやりはっとかつどう", "romaji": "hiyari hatto katsudou", "indonesia": "kegiatan pencegahan near miss", "desc": "Melaporkan dan berbagi kejadian nyaris celaka untuk mencegah kecelakaan serius (p.54)"}, {"kanji": "ハインリッヒの法則", "furigana": "はいんりっひのほうそく", "romaji": "Heinrichi no housoku", "indonesia": "hukum / piramida Heinrich", "desc": "1 kecelakaan besar : 29 kecelakaan ringan : 300 kejadian nyaris celaka (p.54)"}, {"kanji": "危険予知訓練", "furigana": "きけんよちくんれん", "romaji": "kiken yochi kunren", "indonesia": "latihan prediksi bahaya", "desc": "Pelatihan menyadari di mana dan jenis bahaya apa yang ada di tempat kerja (p.55)"}, {"kanji": "KYT", "furigana": "けいわいてぃ", "romaji": "KYT", "indonesia": "Kiken Yochi Training (latihan prediksi bahaya)", "desc": "Singkatan dari 危険予知訓練 — pelatihan mengidentifikasi potensi bahaya sebelum terjadi (p.55)"}, {"kanji": "安全標識", "furigana": "あんぜんひょうしき", "romaji": "anzen hyoushiki", "indonesia": "rambu keselamatan", "desc": "Petunjuk visual tentang bahaya dan tindakan keselamatan di tempat kerja (p.63)"}, {"kanji": "責任者", "furigana": "せきにんしゃ", "romaji": "sekinin sha", "indonesia": "penanggung jawab / supervisor", "desc": "Orang yang bertanggung jawab atas area atau proses — harus segera diberitahu saat masalah"}, {"kanji": "報告", "furigana": "ほうこく", "romaji": "houkoku", "indonesia": "pelaporan", "desc": "Menyampaikan informasi masalah/anomali kepada penanggung jawab — prinsip dasar keselamatan"}, {"kanji": "避難訓練", "furigana": "ひなんくんれん", "romaji": "hinan kunren", "indonesia": "latihan evakuasi", "desc": "Latihan evakuasi kebakaran dan bencana secara rutin (p.52)"}, {"kanji": "洗剤・薬剤の取り扱い", "furigana": "せんざい・やくざいのとりあつかい", "romaji": "senzai yakuzai no toriatsukai", "indonesia": "penanganan deterjen dan bahan kimia", "desc": "Memakai APD, simpan di tempat tepat, jangan campur klorin dengan asam (p.52)"}]}, {"id": "seizou_gyoumu", "name": "製造業務・工場用語", "furigana": "せいぞうぎょうむ・こうじょうようご", "name_id": "Operasi Produksi & Istilah Pabrik", "icon": "🏭", "color": "#00d4ff", "desc": "Bab 1 & 2 Modul OTAFF — Istilah umum operasi pabrik makanan", "words": [{"kanji": "飲食料品製造業", "furigana": "いんしょくりょうひんせいぞうぎょう", "romaji": "inshoku ryouhin seizou gyou", "indonesia": "industri pengolahan makanan dan minuman", "desc": "Pekerjaan memproduksi minuman dan makanan di pabrik (OTAFF p.2)"}, {"kanji": "食品製造工場", "furigana": "しょくひんせいぞうこうじょう", "romaji": "shokuhin seizou koujou", "indonesia": "pabrik pengolahan makanan", "desc": "Fasilitas produksi makanan — tempat bekerja SSW No.1 bidang makanan"}, {"kanji": "特定技能１号", "furigana": "とくていぎのういちごう", "romaji": "tokutei ginou ichi gou", "indonesia": "Specified Skilled Worker No.1 (SSW-1)", "desc": "Status izin tinggal untuk bekerja di industri makanan Jepang — memerlukan ujian OTAFF"}, {"kanji": "作業者", "furigana": "さぎょうしゃ", "romaji": "sagyousha", "indonesia": "pekerja / operator produksi", "desc": "Orang yang bekerja di area produksi makanan"}, {"kanji": "作業場", "furigana": "さぎょうじょう", "romaji": "sagyoujou", "indonesia": "area kerja / tempat produksi", "desc": "Area di dalam pabrik tempat dilakukan proses produksi"}, {"kanji": "施設", "furigana": "しせつ", "romaji": "shisetsu", "indonesia": "fasilitas / bangunan", "desc": "Bangunan dan infrastruktur pabrik makanan"}, {"kanji": "設備", "furigana": "せつび", "romaji": "setsubi", "indonesia": "peralatan / instalasi", "desc": "Mesin dan peralatan yang dipasang di pabrik"}, {"kanji": "器具", "furigana": "きぐ", "romaji": "kigu", "indonesia": "alat / perkakas", "desc": "Peralatan yang digunakan dalam proses produksi — harus dibersihkan setelah dipakai"}, {"kanji": "洗浄", "furigana": "せんじょう", "romaji": "senjou", "indonesia": "pencucian / pembersihan", "desc": "Proses membersihkan mesin, peralatan, dan fasilitas dari kotoran"}, {"kanji": "消毒", "furigana": "しょうどく", "romaji": "shoudoku", "indonesia": "desinfeksi / sterilisasi kimia", "desc": "Proses membunuh mikroorganisme pada permukaan peralatan setelah dicuci"}, {"kanji": "殺菌", "furigana": "さっきん", "romaji": "sakkin", "indonesia": "sterilisasi / membunuh bakteri", "desc": "Proses membunuh bakteri — bisa dengan panas atau bahan kimia"}, {"kanji": "製造工程", "furigana": "せいぞうこうてい", "romaji": "seizou koutei", "indonesia": "proses produksi", "desc": "Rangkaian tahapan dalam memproduksi makanan di pabrik"}, {"kanji": "選別", "furigana": "せんべつ", "romaji": "senbetsu", "indonesia": "sortasi / seleksi bahan", "desc": "Memilah bahan baku berdasarkan kualitas — menyingkirkan yang tidak memenuhi syarat (p.32)"}, {"kanji": "品温", "furigana": "ひんおん", "romaji": "hinnon", "indonesia": "suhu produk", "desc": "Suhu aktual dari produk makanan — harus dipantau dan dicatat secara berkala"}, {"kanji": "出荷", "furigana": "しゅっか", "romaji": "shukka", "indonesia": "pengiriman produk", "desc": "Proses mengirimkan produk jadi — menggunakan prinsip FIFO (p.36)"}, {"kanji": "信用", "furigana": "しんよう", "romaji": "shinyou", "indonesia": "kepercayaan / kredibilitas perusahaan", "desc": "Perusahaan kehilangan kepercayaan jika produk membuat konsumen sakit (p.3)"}, {"kanji": "食品衛生法", "furigana": "しょくひんえいせいほう", "romaji": "shokuhin eisei hou", "indonesia": "UU Sanitasi Pangan Jepang", "desc": "Hukum yang menetapkan standar suhu freezer (-15°C) dan kulkas (10°C) (p.30)"}]}]};

async function init() {
  loadState();
  // Use embedded data — no fetch needed, works on GitHub Pages
  vocab = VOCAB_DATA;
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
