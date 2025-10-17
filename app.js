const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  pages: [],
  currentPageId: null,
};

const STORAGE_KEY = "notion-lite-v6";

// ========== Persistencia ==========
function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) Object.assign(state, JSON.parse(raw));
  else {
    const rootId = crypto.randomUUID();
    state.pages = [
      {
        id: rootId,
        title: "Mi primera página",
        parentId: null,
        blocks: [
          { id: crypto.randomUUID(), type: "h1", text: "Bienvenido a Notion Lite 👋" },
          { id: crypto.randomUUID(), type: "paragraph", text: "Usa Alt + ↑ o ↓ para mover bloques. Crea subpáginas desde la barra lateral." },
        ],
      },
    ];
    state.currentPageId = rootId;
    save();
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function currentPage() {
  return state.pages.find(p => p.id === state.currentPageId);
}

// ========== Sidebar limpio ==========
function renderSidebar() {
  const nav = el("#pages");
  nav.innerHTML = "";

  const rootPages = state.pages.filter(p => !p.parentId);
  rootPages.forEach(p => renderPageTree(p, nav, 0));

  lucide.createIcons();
}

// Render principal que coordina la UI
function render() {
  renderSidebar();
  renderEditor();
}

function renderPageTree(page, container, depth) {
  const item = document.createElement("div");
  item.className = "page-item" + (page.id === state.currentPageId ? " active" : "");
  item.style.paddingLeft = `${depth * 16 + 10}px`;
  item.style.position = "relative";
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.justifyContent = "space-between";

  // --- título de página ---
  const span = document.createElement("span");
  span.textContent = page.title;
  span.className = "page-title";
  span.onclick = (e) => {
    e.stopPropagation();
    state.currentPageId = page.id;
    save();
    render();
  };

  // --- botón para crear subpágina ---
  const addSub = document.createElement("button");
  addSub.className = "add-subpage";
  addSub.innerHTML = '<i data-lucide="plus"></i>';
  addSub.title = "Nueva subpágina";
  addSub.onclick = (e) => {
    e.stopPropagation();
    const id = crypto.randomUUID();
    state.pages.push({ id, title: "Nueva subpágina", parentId: page.id, blocks: [] });
    state.currentPageId = id; // navegar a la subpágina nueva
    save();
    render();
    // mejorar UX: enfocar y seleccionar el título de la nueva página
    const titleInput = el("#pageTitle");
    if (titleInput) {
      titleInput.focus();
      if (titleInput.select) titleInput.select();
      else if (titleInput.setSelectionRange) titleInput.setSelectionRange(0, titleInput.value.length);
    }
  };

  item.appendChild(span);
  item.appendChild(addSub);

  // --- botón para borrar página ---
  const delBtn = document.createElement("button");
  delBtn.className = "add-subpage delete-page";
  delBtn.title = "Borrar página";
  delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    // confirmar
    if (!confirm(`¿Borrar página "${page.title}" y todas sus subpáginas?`)) return;
    deletePageAndChildren(page.id);
    // si la página actual fue borrada, navegar al padre o a la primera página
    if (!state.pages.find(p => p.id === state.currentPageId)) {
      const parent = state.pages.find(p => p.id === page.parentId);
      state.currentPageId = parent ? parent.id : (state.pages[0] ? state.pages[0].id : null);
    }
    save(); render();
  };
  item.appendChild(delBtn);
  container.appendChild(item);

  // --- renderizar subpáginas recursivamente ---
  const children = state.pages.filter(p => p.parentId === page.id);
  children.forEach(child => renderPageTree(child, container, depth + 1));
}

// Eliminar página y todos sus descendientes recursivamente
function deletePageAndChildren(pageId) {
  // recopilar ids a borrar
  const toDelete = new Set();
  function collect(id) {
    toDelete.add(id);
    state.pages.filter(p => p.parentId === id).forEach(ch => collect(ch.id));
  }
  collect(pageId);
  state.pages = state.pages.filter(p => !toDelete.has(p.id));
}

// ========== Breadcrumb ==========
function renderBreadcrumb() {
  const breadcrumb = el("#breadcrumb");
  breadcrumb.innerHTML = "";

  const page = currentPage();
  if (!page) return;

  const trail = [];
  let current = page;
  while (current) {
    trail.unshift(current);
    current = state.pages.find(p => p.id === current.parentId);
  }

  trail.forEach((p, i) => {
    const crumb = document.createElement("span");
    crumb.textContent = p.title || "Sin título";
    crumb.className = "breadcrumb-item";
    crumb.onclick = () => {
      state.currentPageId = p.id;
      save();
      render();
    };
    breadcrumb.appendChild(crumb);

    if (i < trail.length - 1) {
      const sep = document.createElement("span");
      sep.textContent = "›";
      sep.className = "breadcrumb-separator";
      breadcrumb.appendChild(sep);
    }
  });
}

// ========== Editor principal ==========
function renderEditor() {
  const page = currentPage();
  el("#pageTitle").value = page.title;
  renderBreadcrumb();

  const editor = el("#editor");
  editor.innerHTML = "";

  if (page.blocks.length === 0) {
    page.blocks.push({ id: crypto.randomUUID(), type: "paragraph", text: "" });
    save();
  }

  page.blocks.forEach((b, idx) => {
    const blockEl = document.createElement("div");
    blockEl.className = "block";
    blockEl.dataset.id = b.id;
    blockEl.dataset.type = b.type;

    // Handle mover
    const controls = document.createElement("div");
    controls.className = "block-controls";
    controls.innerHTML = `<button class="move" title="Mover"><i data-lucide="move"></i></button>`;
    const moveBtn = controls.querySelector(".move");

    // NOTE: native drag handlers removed — we use a custom drag system below
    // ensure the move button doesn't trigger default focus/actions
    moveBtn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // actual drag start is handled by the centralized drag system below
    });

    blockEl.appendChild(controls);

    // Contenido editable
    const content = document.createElement("div");
    content.className = "block-content";
    content.contentEditable = "true";
    content.innerText = b.text;

    // Estilos y comportamientos por tipo
switch (b.type) {
  case "h1":
    content.style.fontSize = "28px";
    content.style.fontWeight = "800";
    break;
  case "h2":
    content.style.fontSize = "22px";
    content.style.fontWeight = "700";
    break;
  case "quote":
    content.style.borderLeft = "3px solid var(--accent)";
    content.style.paddingLeft = "10px";
    content.style.fontStyle = "italic";
    content.style.opacity = ".8";
    break;
  case "code":
    content.style.fontFamily = "monospace";
    content.style.background = "#0e1220";
    content.style.border = "1px solid #1f2538";
    content.style.padding = "10px";
    content.style.borderRadius = "6px";
    content.style.whiteSpace = "pre-wrap";
    break;
  case "link":
    content.style.color = "var(--vscode-accent)";
    content.style.cursor = "pointer";
    content.style.textDecoration = "underline";
    content.contentEditable = "false";
    content.innerText = b.text || "→ Página sin título";
    content.addEventListener("click", () => {
      if (b.pageId) {
        state.currentPageId = b.pageId;
        save();
        render();
      }
    });
    break;
  case "todo":
  content.innerHTML = `
    <label class="todo-item">
      <input type="checkbox" ${b.checked ? "checked" : ""}>
      <span class="todo-text" contenteditable="true">${b.text}</span>
    </label>
  `;
  content.contentEditable = false;

  const checkbox = content.querySelector("input");
  const textEl = content.querySelector(".todo-text");

  checkbox.onchange = () => {
    b.checked = checkbox.checked;
    save();
  };
  textEl.oninput = () => {
    b.text = textEl.innerText;
    save();
  };
  break;
}

    // Eventos
    content.addEventListener("input", () => {
      b.text = content.innerText;
      if (b.text.includes("/")) showSlashMenu(b, blockEl);
      else hideSlashMenu();
      save();
    });
    content.addEventListener("keydown", (e) => handleKeyNav(e, b, idx, page));

    blockEl.appendChild(content);
    editor.appendChild(blockEl);
  });

  if (b.type === "link") {
  content.style.color = "var(--vscode-accent)";
  content.style.cursor = "pointer";
  content.style.textDecoration = "underline";
  content.contentEditable = "false";
  content.onclick = () => {
    state.currentPageId = b.pageId;
    save();
    render();
  };
}

// ========== NUEVO SISTEMA DE DRAG & DROP (mejorado) ==========
let draggedBlock = null;
let dropIndicator = null;

function createDropIndicator() {
  const d = document.createElement('div');
  d.className = 'drop-indicator';
  return d;
}

// start drag when mousedown on move button
editor.querySelectorAll('.block').forEach(blockEl => {
  const moveBtn = blockEl.querySelector('.move');
  moveBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggedBlock = blockEl;
    draggedBlock.classList.add('dragging');
    // create indicator if needed
    if (!dropIndicator) dropIndicator = createDropIndicator();
  });
});

// move handler: show where the block will be dropped
editor.addEventListener('mousemove', (e) => {
  if (!draggedBlock) return;
  const after = getDragAfterElement(editor, e.clientY);
  // remove existing indicator
  if (dropIndicator && dropIndicator.parentElement) dropIndicator.parentElement.removeChild(dropIndicator);
  if (after == null) editor.appendChild(dropIndicator);
  else editor.insertBefore(dropIndicator, after);
});

// end drag: insert draggedBlock where indicator is, then cleanup + persist order
document.addEventListener('mouseup', (e) => {
  if (!draggedBlock) return;
  // if indicator present, insert before it; otherwise do nothing
  if (dropIndicator && dropIndicator.parentElement) {
    dropIndicator.parentElement.insertBefore(draggedBlock, dropIndicator);
    dropIndicator.parentElement.removeChild(dropIndicator);
  }
  // persist new order
  const orderIds = els('.block', editor).map(n => n.dataset.id);
  const page = currentPage();
  page.blocks.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
  save();
  draggedBlock.classList.remove('dragging');
  draggedBlock = null;
  dropIndicator = null;
});

  lucide.createIcons();
}

// ========== Utilidades ==========
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".block:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}
function getCaretPosition(elm) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return 0;
  const range = selection.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(elm);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

// ========== Navegación con teclado ==========
function handleKeyNav(e, b, idx, page) {
  const editor = el("#editor");
  const content = e.target;
  const text = content.innerText.trim();

  if (e.altKey && e.key === "ArrowUp") {
    e.preventDefault();
    if (idx > 0) {
      const temp = page.blocks[idx - 1];
      page.blocks[idx - 1] = page.blocks[idx];
      page.blocks[idx] = temp;
      save(); renderEditor();
      el(`.block[data-id="${b.id}"] .block-content`)?.focus();
    }
  }
  if (e.altKey && e.key === "ArrowDown") {
    e.preventDefault();
    if (idx < page.blocks.length - 1) {
      const temp = page.blocks[idx + 1];
      page.blocks[idx + 1] = page.blocks[idx];
      page.blocks[idx] = temp;
      save(); renderEditor();
      el(`.block[data-id="${b.id}"] .block-content`)?.focus();
    }
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const newBlock = { id: crypto.randomUUID(), type: "paragraph", text: "" };
    page.blocks.splice(idx + 1, 0, newBlock);
    save(); renderEditor();
    el(`.block[data-id="${newBlock.id}"] .block-content`)?.focus();
  }

  if (e.key === "Backspace" && text === "") {
    e.preventDefault();
    page.blocks.splice(idx, 1);
    save(); renderEditor();
    const prev = editor.children[idx - 1];
    if (prev) prev.querySelector(".block-content").focus();
  }
}

// ========== Slash Menu con navegación ==========
let slashCtx = { block: null, activeIndex: 0 };
let slashKeyHandler = null;

function showSlashMenu(block, anchor) {
  slashCtx.block = block;
  const menu = el("#slashMenu");
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + "px";
  menu.style.left = rect.left + "px";
  menu.classList.remove("hidden");
  const options = els("#slashMenu > div");
  slashCtx.activeIndex = 0;
  updateSlashActive(options);

  options.forEach((opt) => {
    opt.onclick = () => pickType(opt.dataset.type);
  });

  slashKeyHandler = (e) => {
    if (menu.classList.contains("hidden")) return;
    if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowDown") {
      slashCtx.activeIndex = (slashCtx.activeIndex + 1) % options.length;
      updateSlashActive(options);
    } else if (e.key === "ArrowUp") {
      slashCtx.activeIndex = (slashCtx.activeIndex - 1 + options.length) % options.length;
      updateSlashActive(options);
    } else if (e.key === "Enter") {
      const opt = options[slashCtx.activeIndex];
      pickType(opt.dataset.type);
    } else if (e.key === "Escape") {
      hideSlashMenu();
    }
  };
  document.addEventListener("keydown", slashKeyHandler);
}
function updateSlashActive(options) {
  options.forEach((o, i) => o.classList.toggle("active", i === slashCtx.activeIndex));
}
function pickType(type) {
  const page = currentPage();
  const b = slashCtx.block;
  if (!b) return hideSlashMenu();

  if (type === "page") {
    const id = crypto.randomUUID();
    const newPage = {
      id,
      title: b.text.replace("/", "").trim() || "Nueva página",
      parentId: page.id,
      blocks: [
        { id: crypto.randomUUID(), type: "paragraph", text: "" }
      ]
    };
    state.pages.push(newPage);

    // reemplazar el bloque por un link a la nueva página
    b.type = "link";
    b.text = `→ ${newPage.title}`;
    b.pageId = id;

    save();
    renderSidebar();
    renderEditor();
    return hideSlashMenu();
  }

  // comportamiento existente
  b.type = type;
  b.text = (b.text || "").replace("/", "");
  save();
  renderEditor();
  el(`.block[data-id="${b.id}"] .block-content`)?.focus();
  hideSlashMenu();
}

function hideSlashMenu() {
  const menu = el("#slashMenu");
  menu.classList.add("hidden");
  slashCtx.block = null;
  if (slashKeyHandler) {
    document.removeEventListener("keydown", slashKeyHandler);
    slashKeyHandler = null;
  }
}

// ========== Eventos globales ==========
function bindUI() {
  el("#addPageBtn").onclick = () => {
    const id = crypto.randomUUID();
    state.pages.unshift({ id, title: "Nueva página", parentId: null, blocks: [] });
    state.currentPageId = id;
    save(); render();
    const titleInput = el("#pageTitle");
    if (titleInput) {
      titleInput.focus();
      if (titleInput.select) titleInput.select();
      else if (titleInput.setSelectionRange) titleInput.setSelectionRange(0, titleInput.value.length);
    }
  };
  el("#newBlockBtn").onclick = () => {
    const page = currentPage();
    page.blocks.push({ id: crypto.randomUUID(), type: "paragraph", text: "" });
    save(); renderEditor();
  };
  el("#pageTitle").oninput = (e) => {
    const page = currentPage();
    page.title = e.target.value;
    save(); renderSidebar();
    renderBreadcrumb();
  };
}

// ========== Inicialización ==========
load();
bindUI();
render();