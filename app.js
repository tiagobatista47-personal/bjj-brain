const DB_NAME = 'bjj-brain-db';
const DB_VERSION = 2;
const STORES = { memories: 'memories', studies: 'studies', learn: 'learnItems' };
const STAGES = ['descoberta', 'estudando', 'drillando', 'testando', 'funcional', 'incorporado'];
const STAGE_LABELS = {
  descoberta: 'Descoberta', estudando: 'Estudando', drillando: 'Drillando',
  testando: 'Testando', funcional: 'Funcional', incorporado: 'Incorporado'
};
let db;
let currentDetailMemoryId = null;

const $ = id => document.getElementById(id);
const els = {
  dialog: $('memoryDialog'), form: $('memoryForm'), dialogTitle: $('dialogTitle'), memoryId: $('memoryId'),
  title: $('title'), priority: $('priority'), notes: $('notes'), videoUrl: $('videoUrl'), stage: $('stage'),
  position: $('position'), situation: $('situation'), objectivePrimary: $('objectivePrimary'), objectiveSecondary: $('objectiveSecondary'),
  studyId: $('studyId'), deleteMemory: $('deleteMemory'), memoryList: $('memoryList'), memoryCount: $('memoryCount'),
  emptyState: $('emptyState'), template: $('memoryTemplate'), importBackup: $('importBackup'),
  detailDialog: $('memoryDetailDialog'), detailTitle: $('detailTitle'), detailMeta: $('detailMeta'), detailNotes: $('detailNotes'),
  detailContext: $('detailContext'), detailStageLabel: $('detailStageLabel'), stageStepper: $('stageStepper'),
  detailVideoLink: $('detailVideoLink'), observationList: $('observationList'), newObservation: $('newObservation'),
  learnDialog: $('learnDialog'), learnForm: $('learnForm'), learnList: $('learnList'), learnEmpty: $('learnEmpty'), learnTemplate: $('learnTemplate'),
  studyDialog: $('studyDialog'), studyForm: $('studyForm'), studiesList: $('studiesList'), studiesEmpty: $('studiesEmpty'), studyTemplate: $('studyTemplate'),
  gameList: $('gameList'), gameEmpty: $('gameEmpty'), stageSummary: $('stageSummary')
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.memories)) {
        const store = database.createObjectStore(STORES.memories, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('priority', 'priority');
      }
      if (!database.objectStoreNames.contains(STORES.studies)) {
        const store = database.createObjectStore(STORES.studies, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status');
      }
      if (!database.objectStoreNames.contains(STORES.learn)) {
        const store = database.createObjectStore(STORES.learn, { keyPath: 'id', autoIncrement: true });
        store.createIndex('priority', 'priority');
      }
      // V0.1 -> V0.2 não precisa alterar registros existentes: os novos campos são opcionais e recebem defaults ao ler.
      void event;
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(name, mode = 'readonly') { return db.transaction(name, mode).objectStore(name); }
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getAll(name) { return requestToPromise(store(name).getAll()); }
async function getById(name, id) { return requestToPromise(store(name).get(Number(id))); }
async function saveItem(name, item) {
  const s = store(name, 'readwrite');
  return requestToPromise(item.id ? s.put(item) : s.add(item));
}
async function deleteItem(name, id) { return requestToPromise(store(name, 'readwrite').delete(Number(id))); }
async function clearStore(name) { return requestToPromise(store(name, 'readwrite').clear()); }

function normalizeMemory(m) {
  return {
    stage: 'descoberta', position: '', situation: '', objectivePrimary: '', objectiveSecondary: '',
    studyId: null, observations: [], ...m,
    observations: Array.isArray(m.observations) ? m.observations : []
  };
}
async function getAllMemories() {
  const items = (await getAll(STORES.memories)).map(normalizeMemory);
  return items.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}
async function getMemory(id) { const m = await getById(STORES.memories, id); return m ? normalizeMemory(m) : null; }

function priorityLabel(p) { return p === 'alta' ? 'Alta prioridade' : p === 'baixa' ? 'Baixa prioridade' : 'Média prioridade'; }
function formatDate(iso) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso)); }
function safeLines(text = '') { return text.split('\n').map(x => x.trim()).filter(Boolean); }
function stageIndex(stage) { return Math.max(0, STAGES.indexOf(stage)); }

function setView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $(`view-${view}`).classList.add('active-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.go)));

async function refreshStudyOptions(selected = '') {
  const studies = await getAll(STORES.studies);
  els.studyId.innerHTML = '<option value="">Nenhum</option>';
  studies.sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
    const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; els.studyId.appendChild(opt);
  });
  els.studyId.value = selected ? String(selected) : '';
}

async function renderDashboardCounts() {
  const [memories, studies, learn] = await Promise.all([getAllMemories(), getAll(STORES.studies), getAll(STORES.learn)]);
  $('learnCount').textContent = learn.length;
  $('studyCount').textContent = studies.filter(s => s.status === 'ativo').length;
  $('gameCount').textContent = memories.filter(m => m.stage !== 'descoberta').length;
}

function memoryCardNode(memory, forGame = false) {
  const node = els.template.content.cloneNode(true);
  const article = node.querySelector('.memory-card');
  const pill = node.querySelector('.priority-pill');
  pill.textContent = priorityLabel(memory.priority); pill.classList.add(`priority-${memory.priority}`);
  const stageBadge = node.querySelector('.stage-badge'); stageBadge.textContent = STAGE_LABELS[memory.stage] || 'Descoberta';
  node.querySelector('.memory-title').textContent = memory.title;
  node.querySelector('.memory-notes').textContent = memory.notes;
  const chips = node.querySelector('.memory-chips');
  [memory.position, memory.objectivePrimary].filter(Boolean).forEach(text => {
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = text; chips.appendChild(c);
  });
  node.querySelector('.memory-date').textContent = forGame ? `Atualizada em ${formatDate(memory.updatedAt || memory.createdAt)}` : `Criada em ${formatDate(memory.createdAt)}`;
  const open = () => openMemoryDetail(memory.id);
  node.querySelector('.view-memory').addEventListener('click', e => { e.stopPropagation(); open(); });
  article.addEventListener('click', open);
  article.dataset.id = memory.id;
  return node;
}

async function renderMemories() {
  const memories = await getAllMemories();
  els.memoryList.innerHTML = ''; els.memoryCount.textContent = memories.length;
  els.emptyState.classList.toggle('hidden', memories.length > 0);
  memories.forEach(m => els.memoryList.appendChild(memoryCardNode(m)));
}

function resetMemoryForm() {
  els.form.reset(); els.memoryId.value = ''; els.priority.value = 'media'; els.stage.value = 'descoberta';
  els.dialogTitle.textContent = 'Novo aprendizado'; els.deleteMemory.classList.add('hidden');
}
async function openNewMemory(seed = {}) {
  resetMemoryForm(); await refreshStudyOptions();
  if (seed.title) els.title.value = seed.title;
  if (seed.priority) els.priority.value = seed.priority;
  if (seed.videoUrl) els.videoUrl.value = seed.videoUrl;
  if (seed.notes) els.notes.value = seed.notes;
  els.dialog.showModal(); setTimeout(() => els.title.focus(), 50);
}
async function openEditMemory(id) {
  const m = await getMemory(id); if (!m) return;
  els.memoryId.value = m.id; els.title.value = m.title; els.priority.value = m.priority; els.notes.value = m.notes;
  els.videoUrl.value = m.videoUrl || ''; els.stage.value = m.stage || 'descoberta'; els.position.value = m.position || '';
  els.situation.value = m.situation || ''; els.objectivePrimary.value = m.objectivePrimary || ''; els.objectiveSecondary.value = m.objectiveSecondary || '';
  await refreshStudyOptions(m.studyId || '');
  els.dialogTitle.textContent = 'Editar memória'; els.deleteMemory.classList.remove('hidden'); els.dialog.showModal();
}

els.form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = els.memoryId.value ? Number(els.memoryId.value) : null;
  const existing = id ? await getMemory(id) : null; const now = new Date().toISOString();
  const memory = {
    ...(existing || {}), ...(id ? { id } : {}),
    title: els.title.value.trim(), priority: els.priority.value, stage: els.stage.value,
    notes: els.notes.value.trim(), videoUrl: els.videoUrl.value.trim(), position: els.position.value.trim(),
    situation: els.situation.value.trim(), objectivePrimary: els.objectivePrimary.value,
    objectiveSecondary: els.objectiveSecondary.value, studyId: els.studyId.value ? Number(els.studyId.value) : null,
    observations: existing?.observations || [], createdAt: existing?.createdAt || now, updatedAt: now
  };
  await saveItem(STORES.memories, memory); els.dialog.close(); await refreshAll();
});

els.deleteMemory.addEventListener('click', async () => {
  const id = Number(els.memoryId.value); if (!id || !confirm('Excluir esta memória?')) return;
  await deleteItem(STORES.memories, id); els.dialog.close(); await refreshAll();
});

async function openMemoryDetail(id) {
  const m = await getMemory(id); if (!m) return; currentDetailMemoryId = id;
  els.detailTitle.textContent = m.title; els.detailNotes.textContent = m.notes;
  els.detailMeta.innerHTML = '';
  const meta = [priorityLabel(m.priority), STAGE_LABELS[m.stage], m.position, m.objectivePrimary].filter(Boolean);
  meta.forEach(x => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = x; els.detailMeta.appendChild(c); });
  els.detailContext.innerHTML = '';
  [['Posição', m.position], ['Situação', m.situation], ['Objetivo principal', m.objectivePrimary], ['Objetivo secundário', m.objectiveSecondary]].forEach(([k,v]) => {
    if (!v) return; const row = document.createElement('div'); row.innerHTML = `<strong>${k}</strong><span></span>`; row.querySelector('span').textContent = v; els.detailContext.appendChild(row);
  });
  els.detailContext.classList.toggle('hidden', !els.detailContext.children.length);
  els.detailVideoLink.classList.toggle('hidden', !m.videoUrl); if (m.videoUrl) els.detailVideoLink.href = m.videoUrl;
  renderStageControl(m); renderObservations(m); if (!els.detailDialog.open) els.detailDialog.showModal();
}

function renderStageControl(m) {
  const idx = stageIndex(m.stage); els.detailStageLabel.textContent = STAGE_LABELS[m.stage]; els.stageStepper.innerHTML = '';
  STAGES.forEach((s, i) => { const dot = document.createElement('span'); dot.className = `stage-dot ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}`; dot.title = STAGE_LABELS[s]; els.stageStepper.appendChild(dot); });
  $('prevStage').disabled = idx === 0; $('nextStage').disabled = idx === STAGES.length - 1;
  $('nextStage').textContent = idx === STAGES.length - 1 ? 'Incorporado ✓' : 'Avançar →';
}
async function changeStage(delta) {
  const m = await getMemory(currentDetailMemoryId); if (!m) return;
  const next = Math.min(STAGES.length - 1, Math.max(0, stageIndex(m.stage) + delta)); if (next === stageIndex(m.stage)) return;
  const old = m.stage; m.stage = STAGES[next]; m.updatedAt = new Date().toISOString();
  m.observations.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text: `Estágio alterado de ${STAGE_LABELS[old]} para ${STAGE_LABELS[m.stage]}.`, type: 'stage', createdAt: m.updatedAt });
  await saveItem(STORES.memories, m); await refreshAll(); await openMemoryDetail(m.id);
}
$('prevStage').addEventListener('click', () => changeStage(-1));
$('nextStage').addEventListener('click', () => changeStage(1));

function renderObservations(m) {
  els.observationList.innerHTML = '';
  const observations = [...m.observations].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!observations.length) { els.observationList.innerHTML = '<p class="muted-inline">Nenhuma observação ainda.</p>'; return; }
  observations.forEach(o => {
    const item = document.createElement('article'); item.className = `observation-item ${o.type === 'stage' ? 'system-observation' : ''}`;
    const p = document.createElement('p'); p.textContent = o.text; const small = document.createElement('small'); small.textContent = formatDate(o.createdAt);
    item.append(p, small); els.observationList.appendChild(item);
  });
}
$('observationForm').addEventListener('submit', async e => {
  e.preventDefault(); const text = els.newObservation.value.trim(); if (!text) return;
  const m = await getMemory(currentDetailMemoryId); if (!m) return;
  const now = new Date().toISOString(); m.observations.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, type: 'note', createdAt: now }); m.updatedAt = now;
  await saveItem(STORES.memories, m); els.newObservation.value = ''; renderObservations(m); await renderMemories(); await renderGame();
});

$('editFromDetail').addEventListener('click', async () => { const id = currentDetailMemoryId; els.detailDialog.close(); await openEditMemory(id); });
$('closeDetail').addEventListener('click', () => els.detailDialog.close());
$('closeDialog').addEventListener('click', () => els.dialog.close());
$('openNewMemory').addEventListener('click', () => openNewMemory()); $('heroNewMemory').addEventListener('click', () => openNewMemory());

// Quero Aprender
function resetLearnForm() { els.learnForm.reset(); $('learnId').value=''; $('learnPriority').value='media'; $('learnDialogTitle').textContent='Novo item'; $('deleteLearn').classList.add('hidden'); }
function openLearnDialog(item = null) {
  resetLearnForm(); if (item) { $('learnId').value=item.id; $('learnTitle').value=item.title; $('learnReason').value=item.reason||''; $('learnPriority').value=item.priority||'media'; $('learnUrl').value=item.videoUrl||''; $('learnDialogTitle').textContent='Editar item'; $('deleteLearn').classList.remove('hidden'); }
  els.learnDialog.showModal();
}
$('newLearnItem').addEventListener('click', () => openLearnDialog()); $('closeLearnDialog').addEventListener('click', () => els.learnDialog.close());
els.learnForm.addEventListener('submit', async e => {
  e.preventDefault(); const id = $('learnId').value ? Number($('learnId').value) : null; const existing = id ? await getById(STORES.learn,id) : null; const now = new Date().toISOString();
  await saveItem(STORES.learn, { ...(existing||{}), ...(id?{id}:{}), title:$('learnTitle').value.trim(), reason:$('learnReason').value.trim(), priority:$('learnPriority').value, videoUrl:$('learnUrl').value.trim(), createdAt:existing?.createdAt||now, updatedAt:now });
  els.learnDialog.close(); await refreshAll();
});
$('deleteLearn').addEventListener('click', async () => { const id=Number($('learnId').value); if (!id || !confirm('Excluir este item?')) return; await deleteItem(STORES.learn,id); els.learnDialog.close(); await refreshAll(); });
async function renderLearn() {
  const items = await getAll(STORES.learn); items.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)); els.learnList.innerHTML=''; els.learnEmpty.classList.toggle('hidden',items.length>0);
  items.forEach(item => { const node=els.learnTemplate.content.cloneNode(true); const pill=node.querySelector('.priority-pill'); pill.textContent=priorityLabel(item.priority); pill.classList.add(`priority-${item.priority}`); node.querySelector('.memory-title').textContent=item.title; node.querySelector('.learn-reason').textContent=item.reason||'Sem observação.'; const link=node.querySelector('.learn-link'); if(item.videoUrl){link.href=item.videoUrl;link.classList.remove('hidden');}
    node.querySelector('.edit-learn').addEventListener('click',()=>openLearnDialog(item)); node.querySelector('.start-learning').addEventListener('click',async()=>{ await openNewMemory({title:item.title,priority:item.priority,videoUrl:item.videoUrl,notes:item.reason||'Registrar os principais detalhes desta técnica.'}); }); els.learnList.appendChild(node); });
}

// Estudos
function resetStudyForm(){ els.studyForm.reset(); $('editStudyId').value=''; $('studyStatus').value='ativo'; $('studyDialogTitle').textContent='Novo estudo'; $('deleteStudy').classList.add('hidden'); }
function openStudyDialog(item=null){ resetStudyForm(); if(item){ $('editStudyId').value=item.id; $('studyName').value=item.name; $('studyGoal').value=item.goal; $('studyPrinciples').value=(item.principles||[]).join('\n'); $('studyProblem').value=item.problem||''; $('studyExperiment').value=item.experiment||''; $('studyStatus').value=item.status||'ativo'; $('studyDialogTitle').textContent='Editar estudo'; $('deleteStudy').classList.remove('hidden'); } els.studyDialog.showModal(); }
$('newStudy').addEventListener('click',()=>openStudyDialog()); $('closeStudyDialog').addEventListener('click',()=>els.studyDialog.close());
els.studyForm.addEventListener('submit',async e=>{ e.preventDefault(); const id=$('editStudyId').value?Number($('editStudyId').value):null; const existing=id?await getById(STORES.studies,id):null; const now=new Date().toISOString(); await saveItem(STORES.studies,{...(existing||{}),...(id?{id}:{}),name:$('studyName').value.trim(),goal:$('studyGoal').value.trim(),principles:safeLines($('studyPrinciples').value),problem:$('studyProblem').value.trim(),experiment:$('studyExperiment').value.trim(),status:$('studyStatus').value,createdAt:existing?.createdAt||now,updatedAt:now}); els.studyDialog.close(); await refreshAll(); });
$('deleteStudy').addEventListener('click',async()=>{const id=Number($('editStudyId').value);if(!id||!confirm('Excluir este estudo? As memórias vinculadas não serão excluídas.'))return; await deleteItem(STORES.studies,id); const memories=await getAllMemories(); for(const m of memories.filter(x=>Number(x.studyId)===id)){m.studyId=null;await saveItem(STORES.memories,m);} els.studyDialog.close();await refreshAll();});
async function renderStudies(){ const [studies,memories]=await Promise.all([getAll(STORES.studies),getAllMemories()]); studies.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)); els.studiesList.innerHTML=''; els.studiesEmpty.classList.toggle('hidden',studies.length>0); studies.forEach(s=>{ const node=els.studyTemplate.content.cloneNode(true); node.querySelector('.study-status').textContent=s.status==='concluido'?'Concluído':s.status==='pausado'?'Pausado':'Ativo'; node.querySelector('.study-status').className=`study-status status-${s.status}`; node.querySelector('.study-title').textContent=s.name; node.querySelector('.study-goal').textContent=s.goal; const ul=node.querySelector('.study-principles'); (s.principles||[]).forEach(p=>{const li=document.createElement('li');li.textContent=p;ul.appendChild(li);}); if(!(s.principles||[]).length)ul.parentElement.classList.add('hidden'); const problem=node.querySelector('.study-problem');problem.textContent=s.problem||'';node.querySelector('.study-problem-wrap').classList.toggle('hidden',!s.problem); const exp=node.querySelector('.study-experiment');exp.textContent=s.experiment||'';node.querySelector('.study-experiment-wrap').classList.toggle('hidden',!s.experiment); const linked=memories.filter(m=>Number(m.studyId)===Number(s.id)); node.querySelector('.study-linked').textContent=`${linked.length} memória${linked.length===1?'':'s'} vinculada${linked.length===1?'':'s'}`; node.querySelector('.edit-study').addEventListener('click',()=>openStudyDialog(s)); els.studiesList.appendChild(node); }); }

async function renderGame(){ const memories=await getAllMemories(); els.gameList.innerHTML=''; els.gameEmpty.classList.toggle('hidden',memories.length>0); const counts=Object.fromEntries(STAGES.map(s=>[s,0])); memories.forEach(m=>counts[m.stage]++); els.stageSummary.innerHTML=''; STAGES.forEach(s=>{const box=document.createElement('div');box.className='summary-chip';box.innerHTML=`<strong>${counts[s]}</strong><span>${STAGE_LABELS[s]}</span>`;els.stageSummary.appendChild(box);}); const sorted=[...memories].sort((a,b)=>stageIndex(b.stage)-stageIndex(a.stage)||new Date(b.updatedAt)-new Date(a.updatedAt)); sorted.forEach(m=>els.gameList.appendChild(memoryCardNode(m,true))); }

// Backup V0.2, retrocompatível com V0.1
$('exportBackup').addEventListener('click', async () => {
  const [memories, studies, learnItems] = await Promise.all([getAllMemories(), getAll(STORES.studies), getAll(STORES.learn)]);
  const payload = { app:'BJJ Brain', schemaVersion:2, exportedAt:new Date().toISOString(), memories, studies, learnItems };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`BJJBrain_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
els.importBackup.addEventListener('change', async () => {
  const file=els.importBackup.files?.[0]; if(!file)return;
  try { const parsed=JSON.parse(await file.text()); if(!Array.isArray(parsed.memories))throw new Error('Backup inválido'); if(!confirm('Restaurar este backup? Os dados atuais serão substituídos.'))return;
    await Promise.all([clearStore(STORES.memories),clearStore(STORES.studies),clearStore(STORES.learn)]);
    for(const m of parsed.memories) await saveItem(STORES.memories,normalizeMemory(m));
    for(const s of (parsed.studies||[])) await saveItem(STORES.studies,s);
    for(const l of (parsed.learnItems||[])) await saveItem(STORES.learn,l);
    await refreshAll(); alert('Backup restaurado com sucesso.');
  } catch(e){ console.error(e); alert('Não foi possível importar este backup.'); } finally { els.importBackup.value=''; }
});

async function refreshAll(){ await Promise.all([renderMemories(),renderLearn(),renderStudies(),renderGame(),renderDashboardCounts()]); await refreshStudyOptions(); }
async function boot(){ db=await openDB(); await refreshAll(); if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});} if(navigator.storage?.persist){navigator.storage.persist().catch(()=>{});} }
boot();
