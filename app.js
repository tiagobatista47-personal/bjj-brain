const DB_NAME = 'bjj-brain-db';
const DB_VERSION = 1;
const STORE = 'memories';
let db;

const els = {
  dialog: document.getElementById('memoryDialog'),
  form: document.getElementById('memoryForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  memoryId: document.getElementById('memoryId'),
  title: document.getElementById('title'),
  priority: document.getElementById('priority'),
  notes: document.getElementById('notes'),
  videoUrl: document.getElementById('videoUrl'),
  deleteMemory: document.getElementById('deleteMemory'),
  memoryList: document.getElementById('memoryList'),
  memoryCount: document.getElementById('memoryCount'),
  emptyState: document.getElementById('emptyState'),
  template: document.getElementById('memoryTemplate'),
  importBackup: document.getElementById('importBackup')
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('priority', 'priority');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeMode = 'readonly') {
  return db.transaction(STORE, storeMode).objectStore(STORE);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllMemories() {
  const memories = await requestToPromise(tx().getAll());
  return memories.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function getMemory(id) {
  return requestToPromise(tx().get(Number(id)));
}

async function saveMemory(memory) {
  const store = tx('readwrite');
  if (memory.id) return requestToPromise(store.put(memory));
  return requestToPromise(store.add(memory));
}

async function removeMemory(id) {
  return requestToPromise(tx('readwrite').delete(Number(id)));
}

function priorityLabel(priority) {
  return priority === 'alta' ? 'Alta prioridade' : priority === 'baixa' ? 'Baixa prioridade' : 'Média prioridade';
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso));
}

async function renderMemories() {
  const memories = await getAllMemories();
  els.memoryList.innerHTML = '';
  els.memoryCount.textContent = memories.length;
  els.emptyState.classList.toggle('hidden', memories.length > 0);

  for (const memory of memories) {
    const node = els.template.content.cloneNode(true);
    const article = node.querySelector('.memory-card');
    const pill = node.querySelector('.priority-pill');
    pill.textContent = priorityLabel(memory.priority);
    pill.classList.add(`priority-${memory.priority}`);
    node.querySelector('.memory-title').textContent = memory.title;
    node.querySelector('.memory-notes').textContent = memory.notes;
    node.querySelector('.memory-date').textContent = `Criada em ${formatDate(memory.createdAt)}`;

    const link = node.querySelector('.video-link');
    if (memory.videoUrl) {
      link.href = memory.videoUrl;
      link.classList.remove('hidden');
    }

    node.querySelector('.edit-button').addEventListener('click', () => openEditMemory(memory.id));
    article.dataset.id = memory.id;
    els.memoryList.appendChild(node);
  }
}

function resetForm() {
  els.form.reset();
  els.memoryId.value = '';
  els.priority.value = 'media';
  els.dialogTitle.textContent = 'Novo aprendizado';
  els.deleteMemory.classList.add('hidden');
}

function openNewMemory() {
  resetForm();
  els.dialog.showModal();
  setTimeout(() => els.title.focus(), 50);
}

async function openEditMemory(id) {
  const memory = await getMemory(id);
  if (!memory) return;
  els.memoryId.value = memory.id;
  els.title.value = memory.title;
  els.priority.value = memory.priority;
  els.notes.value = memory.notes;
  els.videoUrl.value = memory.videoUrl || '';
  els.dialogTitle.textContent = 'Editar memória';
  els.deleteMemory.classList.remove('hidden');
  els.dialog.showModal();
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = els.memoryId.value ? Number(els.memoryId.value) : null;
  const existing = id ? await getMemory(id) : null;
  const now = new Date().toISOString();
  const memory = {
    ...(existing || {}),
    ...(id ? { id } : {}),
    title: els.title.value.trim(),
    priority: els.priority.value,
    notes: els.notes.value.trim(),
    videoUrl: els.videoUrl.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await saveMemory(memory);
  els.dialog.close();
  await renderMemories();
});

els.deleteMemory.addEventListener('click', async () => {
  const id = Number(els.memoryId.value);
  if (!id) return;
  if (!confirm('Excluir esta memória?')) return;
  await removeMemory(id);
  els.dialog.close();
  await renderMemories();
});

document.getElementById('openNewMemory').addEventListener('click', openNewMemory);
document.getElementById('heroNewMemory').addEventListener('click', openNewMemory);
document.getElementById('closeDialog').addEventListener('click', () => els.dialog.close());

// Backup em JSON: simples e portátil para a V0.1.
document.getElementById('exportBackup').addEventListener('click', async () => {
  const memories = await getAllMemories();
  const payload = {
    app: 'BJJ Brain',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    memories
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BJJBrain_Backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.importBackup.addEventListener('change', async () => {
  const file = els.importBackup.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.memories)) throw new Error('Backup inválido');
    const store = tx('readwrite');
    await requestToPromise(store.clear());
    for (const memory of parsed.memories) {
      await requestToPromise(tx('readwrite').put(memory));
    }
    await renderMemories();
    alert('Backup restaurado com sucesso.');
  } catch (error) {
    alert('Não foi possível importar este backup.');
  } finally {
    els.importBackup.value = '';
  }
});

async function boot() {
  db = await openDB();
  await renderMemories();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

boot();
