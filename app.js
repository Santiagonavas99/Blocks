// Notion Lite — ultra-MVP con páginas, bloques, slash menu y persistencia localStorage.
const el = (sel, root=document) => root.querySelector(sel);
const els = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// --- Estado ---
const state = {
  pages: [], // {id, title, blocks: [{id,type,text,checked}]}
  currentPageId: null,
};

// --- Persistencia ---
const STORAGE_KEY = "notion-lite-v1";
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Estado inicial
      const pageId = crypto.randomUUID();
      state.pages = [{
        id: pageId,
        title: "Mi primera página",
        blocks: [
          { id: crypto.randomUUID(), type: "h1", text: "Bienvenido a Notion Lite 👋" },
          { id: crypto.randomUUID(), type: "paragraph", text: "Escribe \"/\" para cambiar el tipo de bloque." },
          { id: crypto.randomUUID(), type: "todo", text: "Soporte básico de tareas", checked: false },
          { id: crypto.randomUUID(), type: "code", text: "console.log('Hola mundo');" },
        ]
      }];
      state.currentPageId = pageId;
      save();
    } else {
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    }
  } catch (e) { console.error("Error al cargar:", e); }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Utilidades ---
function currentPage() { return state.pages.find(p => p.id === state.currentPageId); }
function setCurrentPage(id) { state.currentPageId = id; save(); render(); }
function addPage() {
  const id = crypto.randomUUID();
  state.pages.unshift({ id, title: "Nueva página", blocks: [] });
  state.currentPageId = id;
  save(); render();
}
function deletePage(id) {
  const idx = state.pages.findIndex(p => p.id === id);
  if (idx === -1) return;
  state.pages.splice(idx,1);
  if (!state.pages.length) addPage();
  else state.currentPageId = state.pages[0].id;
  save(); render();
}

// --- Render Sidebar ---
function renderSidebar() {
  const list = el("#pages");
  list.innerHTML = "";
  state.pages.forEach(p => {
    const item = document.createElement("div");
    item.className = "page-item" + (p.id === state.currentPageId ? " active" : "");
    item.addEventListener("click", (e)=>{
      if (e.target.closest(".page-actions")) return;
      setCurrentPage(p.id);
    });

    const input = document.createElement("input");
    input.value = p.title;
    input.addEventListener("input", ()=> {
      p.title = input.value || "Sin título";
      if (p.id === state.currentPageId) el("#pageTitle").value = p.title;
      save();
    });

    const actions = document.createElement("div");
    actions.className = "page-actions";
    const del = document.createElement("button");
    del.textContent = "🗑";
    del.title = "Eliminar página";
    del.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (confirm("¿Eliminar esta página?")) deletePage(p.id);
    });
    actions.appendChild(del);

    item.appendChild(input);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

// --- Render Editor ---
function renderEditor() {
  const page = currentPage();
  el("#pageTitle").value = page.title;

  const editor = el("#editor");
  editor.innerHTML = "";

  if (!page.blocks.length) {
    addBlock("paragraph", "", null, true);
  }

  page.blocks.forEach((b, idx) => {
    const blockEl = document.createElement("div");
    blockEl.className = "block";
    blockEl.dataset.type = b.type;
    blockEl.dataset.id = b.id;
    blockEl.draggable = true;

    // Drag & Drop
    blockEl.addEventListener("dragstart", (e)=>{ blockEl.classList.add("dragging"); e.dataTransfer.setData("text/plain", b.id); });
    blockEl.addEventListener("dragend", ()=> blockEl.classList.remove("dragging"));
    blockEl.addEventListener("dragover", (e)=>{ e.preventDefault(); const after = getDragAfterElement(editor, e.clientY); const dragging = el(".block.dragging"); if (after == null) editor.appendChild(dragging); else editor.insertBefore(dragging, after); });
    blockEl.addEventListener("drop", (e)=>{
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      reorderBlock(draggedId, b.id);
    });

    // Content
    let content;
    if (b.type === "todo") {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "todo-check";
      check.checked = !!b.checked;
      check.addEventListener("change", ()=>{
        b.checked = check.checked; blockEl.classList.toggle("done", b.checked); save();
      });
      blockEl.appendChild(check);
      content = document.createElement("div");
    } else if (b.type === "bulleted") {
      const bullet = document.createElement("div");
      bullet.className = "bullet";
      bullet.textContent = "•";
      blockEl.appendChild(bullet);
      content = document.createElement("div");
    } else {
      content = document.createElement("div");
    }
    content.className = "block-content";
    content.contentEditable = "true";
    content.spellcheck = false;
    content.innerText = b.text || "";

    // Eventos de edición
    content.addEventListener("input", (e)=> {
      b.text = content.innerText;
      // Slash menu: si contiene "/" al final, mostrar opciones
      handleSlashDetection(content, b);
      save();
    });

    content.addEventListener("keydown", (e)=> {
      if (e.key === "Enter") {
        e.preventDefault();
        const nb = addBlock(b.type, "", b.id, true);
        focusBlock(nb.id);
      } else if (e.key === "Backspace" && content.innerText === "") {
        e.preventDefault();
        removeBlock(b.id, idx);
      } else if (e.key === "ArrowUp" && getCaretPos(content) === 0) {
        e.preventDefault(); focusPrevBlock(b.id);
      } else if (e.key === "ArrowDown" && getCaretPos(content) === content.innerText.length) {
        e.preventDefault(); focusNextBlock(b.id);
      }
    });

    blockEl.appendChild(content);
    if (b.type === "todo") blockEl.classList.toggle("done", !!b.checked);
    editor.appendChild(blockEl);
  });

  // Click fuera cierra slash
  document.addEventListener("click", (e)=>{
    if (!el("#slashMenu").contains(e.target)) hideSlash();
  }, { once:true });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll(".block:not(.dragging)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function reorderBlock(draggedId, targetId) {
  const page = currentPage();
  const from = page.blocks.findIndex(b => b.id === draggedId);
  const to = page.blocks.findIndex(b => b.id === targetId);
  if (from === -1 || to === -1) return;
  const [item] = page.blocks.splice(from,1);
  const newIndex = page.blocks.findIndex(b => b.id === targetId);
  page.blocks.splice(newIndex, 0, item);
  save(); renderEditor();
}

function addBlock(type="paragraph", text="", afterId=null, renderNow=false) {
  const page = currentPage();
  const idx = afterId ? page.blocks.findIndex(b => b.id === afterId) + 1 : page.blocks.length;
  const block = { id: crypto.randomUUID(), type, text };
  if (type === "todo") block.checked = false;
  page.blocks.splice(idx, 0, block);
  save();
  if (renderNow) renderEditor();
  return block;
}

function removeBlock(id, indexHint) {
  const page = currentPage();
  const idx = indexHint ?? page.blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  page.blocks.splice(idx,1);
  save(); renderEditor();
  const next = page.blocks[idx] || page.blocks[idx-1];
  if (next) focusBlock(next.id, true);
}

function focusBlock(id, end=false) {
  const block = el(`.block[data-id="${id}"] .block-content`);
  if (!block) return;
  block.focus();
  placeCaret(block, end ? block.innerText.length : 0);
}
function focusPrevBlock(id) {
  const blocks = els(".block");
  const i = blocks.findIndex(b => b.dataset.id === id);
  const prev = blocks[i-1]; if (prev) prev.querySelector(".block-content").focus();
}
function focusNextBlock(id) {
  const blocks = els(".block");
  const i = blocks.findIndex(b => b.dataset.id === id);
  const next = blocks[i+1]; if (next) next.querySelector(".block-content").focus();
}
function getCaretPos(elm) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(elm);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}
function placeCaret(elm, pos) {
  const range = document.createRange(); const sel = window.getSelection();
  range.selectNodeContents(elm);
  range.collapse(true);
  const walker = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT);
  let count = 0, node;
  while ((node = walker.nextNode())) {
    const nextCount = count + node.textContent.length;
    if (pos <= nextCount) {
      range.setStart(node, pos - count);
      range.setEnd(node, pos - count);
      break;
    }
    count = nextCount;
  }
  sel.removeAllRanges(); sel.addRange(range);
}

// --- Slash menu ---
let slashCtx = { blockId: null };
function handleSlashDetection(contentEl, block) {
  const text = contentEl.innerText;
  const slashIndex = text.lastIndexOf("/");
  if (slashIndex === -1) { hideSlash(); return; }
  const rect = contentEl.getBoundingClientRect();
  const menu = el("#slashMenu");
  menu.style.top = rect.bottom + 6 + "px";
  menu.style.left = rect.left + "px";
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
  slashCtx.blockId = block.id;

  els("#slashMenu > div").forEach((opt)=>{
    opt.onclick = ()=> {
      pickType(opt.dataset.type);
    };
  });
}
function pickType(type) {
  const page = currentPage();
  const b = page.blocks.find(x => x.id === slashCtx.blockId);
  if (!b) return hideSlash();
  b.type = type;
  // limpia la barra "/" sobrante al cambiar
  b.text = (b.text || "").replace("/", "");
  save(); renderEditor(); focusBlock(b.id, true); hideSlash();
}
function hideSlash() {
  const menu = el("#slashMenu");
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  slashCtx.blockId = null;
}

// --- Export / Import ---
function exportJSON() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "notion-lite-export.json";
  a.click(); URL.revokeObjectURL(url);
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.pages || !imported.currentPageId) throw new Error("Formato inválido");
      Object.assign(state, imported);
      save(); render();
    } catch (e) {
      alert("No se pudo importar el JSON");
      console.error(e);
    }
  };
  reader.readAsText(file);
}

// --- App init & eventos ---
function render() { renderSidebar(); renderEditor(); }
function bindUI() {
  el("#addPageBtn").addEventListener("click", addPage);
  el("#exportBtn").addEventListener("click", exportJSON);
  el("#importInput").addEventListener("change", (e)=>{
    const f = e.target.files?.[0]; if (f) importJSON(f);
    e.target.value = "";
  });
  el("#newBlockBtn").addEventListener("click", ()=>{
    const b = addBlock("paragraph", "", null, true);
    focusBlock(b.id);
  });
  el("#pageTitle").addEventListener("input", (e)=>{
    const page = currentPage(); page.title = e.target.value || "Sin título"; save();
    renderSidebar();
  });
}

load(); bindUI(); render();
