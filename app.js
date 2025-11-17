const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  pages: [],
  currentPageId: null,
};

// =======================
//  🔵  API REMOTA (KV)
// =======================
async function load() {
  try {
    const res = await fetch("/api/state");
    const remote = await res.json();

    if (remote && remote.pages) {
      Object.assign(state, remote);
      console.log("🔵 Estado cargado desde KV:", state);
    } else {
      console.log("🟡 No había estado remoto. Iniciando…");
      initLocalState();
      await save();
    }
  } catch (err) {
    console.error("❌ Error cargando KV:", err);
    initLocalState();
  }
}

async function save() {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    console.log("💾 Estado guardado en KV");
  } catch (err) {
    console.error("❌ Error guardando en KV:", err);
  }
}

// =======================
// Estado inicial
// =======================
function initLocalState() {
  const rootId = crypto.randomUUID();
  state.pages = [
    {
      id: rootId,
      title: "Mi primera página",
      parentId: null,
      blocks: [
        {
          id: crypto.randomUUID(),
          type: "h1",
          text: "Bienvenido a Notion Lite 👋",
        },
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          text: "Usa Alt + ↑ o ↓ para mover bloques. Crea subpáginas desde la barra lateral.",
        },
      ],
    },
  ];
  state.currentPageId = rootId;
}

function currentPage() {
  return state.pages.find((p) => p.id === state.currentPageId);
}

// ========== Sidebar limpio ==========
function renderSidebar() {
  const nav = el("#pages");
  nav.innerHTML = "";

  const rootPages = state.pages.filter((p) => !p.parentId);
  rootPages.forEach((p) => renderPageTree(p, nav, 0));

  lucide.createIcons();
}

// Render principal que coordina la UI
function render() {
  renderSidebar();
  renderEditor();
}

function renderPageTree(page, container, depth) {
  const item = document.createElement("div");
  item.className =
    "page-item" + (page.id === state.currentPageId ? " active" : "");
  item.style.paddingLeft = `${depth * 16 + 10}px`;
  item.style.position = "relative";
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.justifyContent = "space-between";

  const span = document.createElement("span");
  span.textContent = page.title;
  span.className = "page-title";
  span.onclick = (e) => {
    e.stopPropagation();
    state.currentPageId = page.id;
    save();
    render();
  };

  const addSub = document.createElement("button");
  addSub.className = "add-subpage";
  addSub.innerHTML = '<i data-lucide="plus"></i>';
  addSub.title = "Nueva subpágina";
  addSub.onclick = (e) => {
    e.stopPropagation();
    const id = crypto.randomUUID();
    state.pages.push({
      id,
      title: "Nueva subpágina",
      parentId: page.id,
      blocks: [],
    });
    state.currentPageId = id;
    save();
    render();
    const titleInput = el("#pageTitle");
    if (titleInput) {
      titleInput.focus();
      if (titleInput.select) titleInput.select();
      else if (titleInput.setSelectionRange)
        titleInput.setSelectionRange(0, titleInput.value.length);
    }
  };

  item.appendChild(span);
  item.appendChild(addSub);

  const delBtn = document.createElement("button");
  delBtn.className = "add-subpage delete-page";
  delBtn.title = "Borrar página";
  delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (!confirm(`¿Borrar página "${page.title}" y todas sus subpáginas?`))
      return;
    deletePageAndChildren(page.id);
    if (!state.pages.find((p) => p.id === state.currentPageId)) {
      const parent = state.pages.find((p) => p.id === page.parentId);
      state.currentPageId = parent
        ? parent.id
        : state.pages[0]
        ? state.pages[0].id
        : null;
    }
    save();
    render();
  };
  item.appendChild(delBtn);
  container.appendChild(item);

  const children = state.pages.filter((p) => p.parentId === page.id);
  children.forEach((child) => renderPageTree(child, container, depth + 1));
}

function deletePageAndChildren(pageId) {
  const toDelete = new Set();
  function collect(id) {
    toDelete.add(id);
    state.pages
      .filter((p) => p.parentId === id)
      .forEach((ch) => collect(ch.id));
  }
  collect(pageId);
  state.pages = state.pages.filter((p) => !toDelete.has(p.id));
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
    current = state.pages.find((p) => p.id === current.parentId);
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

let draggedBlock = null;
let dropIndicator = null;
let slashCtx = { block: null, activeIndex: 0 };
let slashKeyHandler = null;

function renderEditor() {
  const page = currentPage();
  el("#pageTitle").value = page.title;
  renderBreadcrumb();

  const editor = el("#editor");
  editor.innerHTML = "";

  // Si no hay bloques, crear uno vacío
  if (page.blocks.length === 0) {
    page.blocks.push({ id: crypto.randomUUID(), type: "paragraph", text: "" });
    save();
  }

  // Renderizar cada bloque
  page.blocks.forEach((b, idx) => {
    const blockEl = document.createElement("div");
    blockEl.className = "block";
    blockEl.dataset.id = b.id;
    blockEl.dataset.type = b.type;

    // --- Controles laterales (mover) ---
    const controls = document.createElement("div");
    controls.className = "block-controls";
    controls.innerHTML = `<button class="move" title="Mover"><i data-lucide="move"></i></button>`;
    const moveBtn = controls.querySelector(".move");
    moveBtn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      draggedBlock = blockEl;
      draggedBlock.classList.add("dragging");
      if (!dropIndicator) dropIndicator = createDropIndicator();
    });
    blockEl.appendChild(controls);

    // --- Contenido principal ---
    const content = document.createElement("div");
    content.className = "block-content";

    // ===== Render según tipo =====
    switch (b.type) {
      case "h1":
        content.contentEditable = "true";
        content.innerText = b.text || "";
        content.style.fontSize = "28px";
        content.style.fontWeight = "800";
        break;

      case "h2":
        content.contentEditable = "true";
        content.innerText = b.text || "";
        content.style.fontSize = "22px";
        content.style.fontWeight = "700";
        break;

      case "quote":
        content.contentEditable = "true";
        content.innerText = b.text || "";
        content.style.borderLeft = "3px solid var(--vscode-accent)";
        content.style.paddingLeft = "10px";
        content.style.opacity = ".9";
        content.style.fontStyle = "italic";
        break;

      case "code":
        content.contentEditable = "true";
        content.innerText = b.text || "";
        content.style.fontFamily = "monospace";
        content.style.background = "#0e1220";
        content.style.border = "1px solid #1f2538";
        content.style.padding = "10px";
        content.style.borderRadius = "6px";
        content.style.whiteSpace = "pre-wrap";
        break;

      case "link":
        content.contentEditable = "false";
        content.style.color = "var(--vscode-accent)";
        content.style.cursor = "pointer";
        content.style.textDecoration = "underline";
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
        content.contentEditable = "false";
        content.innerHTML = `
          <div class="todo-item">
            <input type="checkbox" ${b.checked ? "checked" : ""} />
            <span class="todo-text" contenteditable="true">${b.text || ""}</span>
          </div>
        `;
        const checkbox = content.querySelector("input");
        const textEl = content.querySelector(".todo-text");

        checkbox.addEventListener("change", () => {
          b.checked = checkbox.checked;
          save();
        });

        textEl.addEventListener("input", () => {
          b.text = textEl.innerText;
          save();
        });

        textEl.addEventListener("mousedown", (ev) => ev.stopPropagation());
        textEl.addEventListener("click", (ev) => ev.stopPropagation());

        textEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            const newBlock = {
              id: crypto.randomUUID(),
              type: "todo",
              text: "",
              checked: false,
            };
            const idxInPage = currentPage().blocks.findIndex((x) => x.id === b.id);
            currentPage().blocks.splice(idxInPage + 1, 0, newBlock);
            save();
            renderEditor();
            el(`.block[data-id="${newBlock.id}"] .todo-text`)?.focus();
          }
        });
        break;

      default:
        content.contentEditable = "true";
        content.innerText = b.text || "";
        break;
    }

    // ===== Eventos generales de escritura =====
    if (content.isContentEditable) {
      content.addEventListener("input", () => {
        b.text = content.innerText;
        if (b.text.includes("/")) showSlashMenu(b, blockEl);
        else hideSlashMenu();
        save();
      });
      content.addEventListener("keydown", (e) => handleKeyNav(e, b, idx, page));
    }

    blockEl.appendChild(content);
    editor.appendChild(blockEl);
  }); // cierre forEach

  // === Permitir clic/escritura en área vacía para crear bloque nuevo ===
  const editorContainer = el("#editor-container");
  if (editorContainer) {
    editorContainer.onclick = (e) => {
      const target = e.target;
      const isInsideBlock = target.closest && target.closest(".block");
      const isMinimap = target.closest && target.closest("#minimap");
      if (!isInsideBlock && !isMinimap) {
        const page = currentPage();
        const newBlock = { id: crypto.randomUUID(), type: "paragraph", text: "" };
        page.blocks.push(newBlock);
        save();
        renderEditor();
        el(`.block[data-id="${newBlock.id}"] .block-content`)?.focus();
      }
    };
  }

  lucide.createIcons();
}

// ========== Drag & Drop ==========
function createDropIndicator() {
  const d = document.createElement("div");
  d.className = "drop-indicator";
  return d;
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".block:not(.dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset)
        return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

// ===== Minimap Trash helpers =====
function getMinimapEl() { return el('#minimap'); }

function isOverElement(x, y, element) {
  if (!element) return false;
  const r = element.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function animateMinimapTrash(state) {
  const mm = getMinimapEl();
  if (!mm) return;
  if (state === 'hover-on') mm.classList.add('trash-hover');
  if (state === 'hover-off') mm.classList.remove('trash-hover');
  if (state === 'delete') {
    mm.classList.remove('trash-hover');
    mm.classList.add('trash-delete');
    setTimeout(() => mm.classList.remove('trash-delete'), 220);
  }
}

function deleteBlockById(blockId) {
  const page = currentPage();
  const idx = page.blocks.findIndex(b => b.id === blockId);
  if (idx !== -1) {
    page.blocks.splice(idx, 1);
    save();
    renderEditor();
  }
}

// ====== Eventos drag sobre el editor (solo cuando hay drag) ======
document.addEventListener('mousemove', (e) => {
  if (!draggedBlock) return;
  const editorEl = el('#editor');

  const mm = getMinimapEl();
  const overTrash = isOverElement(e.clientX, e.clientY, mm);

  if (overTrash) {
    animateMinimapTrash('hover-on');
    if (dropIndicator && dropIndicator.parentElement) {
      dropIndicator.parentElement.removeChild(dropIndicator);
    }
    return;
  } else {
    animateMinimapTrash('hover-off');
  }

  const after = getDragAfterElement(editorEl, e.clientY);
  if (dropIndicator && dropIndicator.parentElement) {
    dropIndicator.parentElement.removeChild(dropIndicator);
  }
  if (!dropIndicator) dropIndicator = createDropIndicator();
  if (after == null) editorEl.appendChild(dropIndicator);
  else editorEl.insertBefore(dropIndicator, after);
});

document.addEventListener('mouseup', (e) => {
  if (!draggedBlock) return;

  const mm = getMinimapEl();
  const overTrash = isOverElement(e.clientX, e.clientY, mm);

  if (overTrash) {
    animateMinimapTrash('delete');
    const id = draggedBlock.dataset.id;
    if (dropIndicator && dropIndicator.parentElement) {
      dropIndicator.parentElement.removeChild(dropIndicator);
    }
    draggedBlock.classList.remove('dragging');
    draggedBlock = null;
    dropIndicator = null;
    deleteBlockById(id);
    return;
  }

  if (dropIndicator && dropIndicator.parentElement) {
    dropIndicator.parentElement.insertBefore(draggedBlock, dropIndicator);
    dropIndicator.parentElement.removeChild(dropIndicator);
  }

  const editorEl = el('#editor');
  const orderIds = els('.block', editorEl).map(n => n.dataset.id);
  const page = currentPage();
  page.blocks.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
  save();

  draggedBlock.classList.remove('dragging');
  draggedBlock = null;
  dropIndicator = null;
  animateMinimapTrash('hover-off');
});

// ========== Navegación con teclado ==========
function handleKeyNav(e, b, idx, page) {
  const editor = el("#editor");
  const content = e.target;
  const text = content.innerText.trim();

  if (
    (e.code === "Space" || e.key === "/") &&
    !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
  ) {
    const caretPos = getCaretPosition(content);
    if (caretPos === 0 && (text === "" || text === "/")) {
      e.preventDefault();
      showSlashMenu(b, content);
      return;
    }
  }

  if (e.altKey && e.key === "ArrowUp") {
    e.preventDefault();
    if (idx > 0) {
      const temp = page.blocks[idx - 1];
      page.blocks[idx - 1] = page.blocks[idx];
      page.blocks[idx] = temp;
      save();
      renderEditor();
      el(`.block[data-id="${b.id}"] .block-content`)?.focus();
    }
  }

  if (e.altKey && e.key === "ArrowDown") {
    e.preventDefault();
    if (idx < page.blocks.length - 1) {
      const temp = page.blocks[idx + 1];
      page.blocks[idx + 1] = page.blocks[idx];
      page.blocks[idx] = temp;
      save();
      renderEditor();
      el(`.block[data-id="${b.id}"] .block-content`)?.focus();
    }
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const newBlock = { id: crypto.randomUUID(), type: "paragraph", text: "" };
    page.blocks.splice(idx + 1, 0, newBlock);
    save();
    renderEditor();
    el(`.block[data-id="${newBlock.id}"] .block-content`)?.focus();
  }

  if (e.key === "Backspace" && text === "") {
    e.preventDefault();
    page.blocks.splice(idx, 1);
    save();
    renderEditor();
    const prev = editor.children[idx - 1];
    if (prev) prev.querySelector(".block-content").focus();
  }
}

// ========== Slash Menu ==========
function showSlashMenu(block, anchor) {
  const menu = el("#slashMenu");
  if (!menu) return;

  slashCtx.block = block;
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + window.scrollY + "px";
  menu.style.left = rect.left + "px";
  menu.classList.remove("hidden");

  const options = els("#slashMenu > div");
  slashCtx.activeIndex = 0;
  updateSlashActive(options);

  options.forEach((opt) => {
    opt.onclick = () => pickType(opt.dataset.type);
  });

  if (slashKeyHandler)
    document.removeEventListener("keydown", slashKeyHandler);

  slashKeyHandler = (e) => {
    if (menu.classList.contains("hidden")) return;
    const keyIsSpace =
      e.key === " " || e.key === "Spacebar" || e.code === "Space";
    if (
      !["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key) &&
      !keyIsSpace
    )
      return;

    e.preventDefault();

    if (e.key === "ArrowDown") {
      slashCtx.activeIndex = (slashCtx.activeIndex + 1) % options.length;
      updateSlashActive(options);
    } else if (e.key === "ArrowUp") {
      slashCtx.activeIndex =
        (slashCtx.activeIndex - 1 + options.length) % options.length;
      updateSlashActive(options);
    } else if (e.key === "Enter" || keyIsSpace) {
      const opt = options[slashCtx.activeIndex];
      pickType(opt.dataset.type);
    } else if (e.key === "Escape") {
      hideSlashMenu();
    }
  };

  document.addEventListener("keydown", slashKeyHandler);

  const outsideClick = (ev) => {
    if (!menu.contains(ev.target)) hideSlashMenu();
  };

  // Delete/Backspace para borrar el bloque seleccionado (cuando no escribes)
  document.addEventListener('keydown', (e) => {
    const isEditable = document.activeElement && document.activeElement.isContentEditable;
    const isDeleteKey = (e.key === 'Delete') || (e.key === 'Backspace');
    if (!isDeleteKey) return;
    if (isEditable) return;
    const sel = el('.block.selected');
    if (!sel) return;
    e.preventDefault();
    deleteBlockById(sel.dataset.id);
  });

  document.addEventListener("click", outsideClick);
  menu._outsideClick = outsideClick;
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
      blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
    };
    state.pages.push(newPage);
    b.type = "link";
    b.text = `→ ${newPage.title}`;
    b.pageId = id;
    save();
    renderSidebar();
    renderEditor();
    hideSlashMenu();
    return;
  }

  b.type = type;
  b.text = (b.text || "").replace("/", "").trim();
  save();
  renderEditor();
  el(`.block[data-id="${b.id}"] .block-content`)?.focus();
  hideSlashMenu();
}

function hideSlashMenu() {
  const menu = el("#slashMenu");
  if (!menu) return;
  menu.classList.add("hidden");
  slashCtx.block = null;

  if (slashKeyHandler) {
    document.removeEventListener("keydown", slashKeyHandler);
    slashKeyHandler = null;
  }
  if (menu._outsideClick) {
    document.removeEventListener("click", menu._outsideClick);
    menu._outsideClick = null;
  }
}

// ========== Utilidades ==========
function getCaretPosition(elm) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return 0;
  const range = selection.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(elm);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

// ========== Eventos globales ==========
function bindUI() {
  el("#addPageBtn").onclick = () => {
    const id = crypto.randomUUID();
    state.pages.unshift({
      id,
      title: "Nueva página",
      parentId: null,
      blocks: [],
    });
    state.currentPageId = id;
    save();
    render();
    const titleInput = el("#pageTitle");
    if (titleInput) {
      titleInput.focus();
      if (titleInput.select) titleInput.select();
      else if (titleInput.setSelectionRange)
        titleInput.setSelectionRange(0, titleInput.value.length);
    }
  };

  el("#pageTitle").oninput = (e) => {
    const page = currentPage();
    page.title = e.target.value;
    save();
    renderSidebar();
    renderBreadcrumb();
  };
}

// ========== Inicialización ==========
load();
bindUI();
render();