const COLUMNS = [
  { key: "pending", label: "Pending" },
  { key: "wip", label: "WIP" },
  { key: "done", label: "Done" },
];

const API_BASE_KEY = "taskctl.apiBase";
const apiFromQuery = new URLSearchParams(window.location.search).get("api");

if (apiFromQuery) {
  window.localStorage.setItem(API_BASE_KEY, apiFromQuery);
}

const API_BASE = (
  window.TASKS_API_BASE ||
  apiFromQuery ||
  window.localStorage.getItem(API_BASE_KEY) ||
  "https://projects.ashupednekar49.workers.dev"
).replace(/\/$/, "");

const state = {
  tasks: [],
  view: "wheel",
  selectedId: null,
  rotation: 0,
  drag: null,
  loading: true,
};

const els = {
  board: document.querySelector("[data-board]"),
  panels: document.querySelectorAll("[data-view]"),
  viewButtons: document.querySelectorAll("[data-view-button]"),
  spinButtons: document.querySelectorAll("[data-spin]"),
  wheel: document.querySelector(".task-wheel"),
  wheelSegments: document.querySelector("[data-wheel-segments]"),
  selectedCard: document.querySelector("[data-selected-card]"),
  selectedActions: document.querySelector("[data-selected-actions]"),
  selectedTask: document.querySelector("[data-selected-task]"),
  spinStatus: document.querySelector("[data-spin-status]"),
  createDialog: document.querySelector("[data-create-dialog]"),
  createForm: document.querySelector("[data-create-form]"),
  createOpen: document.querySelector("[data-create-open]"),
  createClose: document.querySelector("[data-create-close]"),
  createTitle: document.querySelector("[data-create-title]"),
  createDescription: document.querySelector("[data-create-description]"),
  createCompleted: document.querySelector("[data-create-completed]"),
  createSubmit: document.querySelector("[data-create-submit]"),
  createError: document.querySelector("[data-create-error]"),
  counts: {
    pending: document.querySelector('[data-count="pending"]'),
    wip: document.querySelector('[data-count="wip"]'),
    done: document.querySelector('[data-count="done"]'),
  },
};

function endpoint(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function refreshTasks() {
  state.loading = true;
  render();

  try {
    const tasks = await request("/tasks");
    state.tasks = tasks.map(normalizeTask);

    if (!selectedTask()) {
      state.selectedId = null;
    }

    els.spinStatus.textContent = state.tasks.length ? "synced" : "empty";
  } catch (error) {
    els.spinStatus.textContent = "api unavailable";
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

function normalizeTask(task) {
  const id = Number(task.id);
  return {
    id,
    title: task.title,
    description: task.description || "",
    completed: Boolean(task.completed),
    status: task.completed ? "done" : id === state.selectedId ? "wip" : "pending",
    priority: task.completed ? "done" : "open",
    tags: [],
  };
}

async function createTask(task) {
  return request("/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

async function updateTask(taskId, patch) {
  return request(`/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

function setView(view) {
  state.view = view;

  els.panels.forEach((panel) => {
    panel.classList.toggle("is-visible", panel.dataset.view === view);
  });

  els.viewButtons.forEach((button) => {
    const isActive = button.dataset.viewButton === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function updateCounts() {
  COLUMNS.forEach(({ key }) => {
    els.counts[key].textContent = state.tasks.filter((task) => task.status === key).length;
  });
}

function eligibleTasks() {
  return state.tasks.filter((task) => task.status === "pending" || task.status === "wip");
}

function selectedTask() {
  return state.tasks.find((task) => task.id === state.selectedId) || null;
}

function renderSelected() {
  const task = selectedTask();

  if (!task) {
    els.selectedTask.textContent = state.loading ? "loading" : "spin required";
    els.selectedActions.innerHTML = "";
    els.selectedCard.innerHTML = `
      <span class="eyebrow">no task selected</span>
      <h2>${state.loading ? "Loading tasks" : "Spin the wheel"}</h2>
      <p>${state.loading ? "The API task list is syncing." : "The wheel asks the Worker for a random open task."}</p>
    `;
    return;
  }

  const statusLine = task.status === "wip" ? "kept in WIP" : task.status;
  els.selectedTask.textContent = `${task.id} / ${statusLine}`;
  els.selectedCard.innerHTML = `
    <span class="eyebrow">${task.id} :: ${statusLine}</span>
    <h2>${escapeHtml(task.title)}</h2>
    <p>${escapeHtml(task.description)}</p>
  `;
  els.selectedActions.innerHTML = "";
  els.selectedActions.append(...taskActions(task));
}

function renderWheel() {
  const tasks = eligibleTasks();
  const wheelColors = ["#20c763", "#06170f", "#0c3a26", "#7cffac", "#092016", "#164d34"];

  if (!tasks.length) {
    els.wheel.style.setProperty("--wheel-bg", "conic-gradient(from -90deg, #041008, #0d261a, #041008)");
    els.wheelSegments.innerHTML = "";
    return;
  }

  const slice = 360 / tasks.length;
  const gradientStops = tasks.map((_, index) => {
    const start = index * slice;
    const end = (index + 1) * slice;
    return `${wheelColors[index % wheelColors.length]} ${start}deg ${end}deg`;
  });

  els.wheel.style.setProperty("--wheel-bg", `conic-gradient(from -90deg, ${gradientStops.join(", ")})`);
  els.wheelSegments.innerHTML = tasks.map((task, index) => {
    const angle = index * slice + slice / 2;
    return `
      <span class="wheel-segment" style="--segment-angle: ${angle}deg; --segment-upright: ${-angle}deg;">
        <span class="wheel-segment-id">${escapeHtml(task.id)}</span>
        <span class="wheel-segment-title">${escapeHtml(task.title)}</span>
      </span>
    `;
  }).join("");
}

function renderBoard() {
  const template = document.querySelector("#task-template");
  els.board.innerHTML = "";

  COLUMNS.forEach((column) => {
    const columnEl = document.createElement("section");
    columnEl.className = "kanban-column";
    columnEl.innerHTML = `
      <header class="column-header">
        <h2>${column.label}</h2>
        <span class="column-count">${state.tasks.filter((task) => task.status === column.key).length}</span>
      </header>
      <div class="task-list" data-column="${column.key}"></div>
    `;

    const list = columnEl.querySelector(".task-list");
    const tasks = state.tasks.filter((task) => task.status === column.key);

    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.loading ? "loading" : "no tasks";
      list.append(empty);
    }

    tasks.forEach((task) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.classList.toggle("is-selected", task.id === state.selectedId);
      card.dataset.taskId = String(task.id);
      card.querySelector(".task-id").textContent = task.id;
      card.querySelector(".task-priority").textContent = task.priority;
      card.querySelector("h3").textContent = task.title;
      card.querySelector("p").textContent = task.description;
      card.querySelector(".task-tags").innerHTML = task.tags.map((tag) => `<span class="task-tag">${escapeHtml(tag)}</span>`).join("");
      card.querySelector(".task-actions").append(...taskActions(task));
      list.append(card);
    });

    els.board.append(columnEl);
  });
}

function taskActions(task) {
  const actions = [];

  if (task.status === "pending") {
    actions.push(actionButton("Start", () => void moveTask(task.id, "wip")));
    actions.push(actionButton("Mark done", () => void moveTask(task.id, "done")));
  }

  if (task.status === "wip") {
    actions.push(actionButton("Mark done", () => void moveTask(task.id, "done")));
    actions.push(actionButton("Backlog", () => void moveTask(task.id, "pending")));
  }

  if (task.status === "done") {
    actions.push(actionButton("Reopen", () => void moveTask(task.id, "pending")));
  }

  return actions;
}

function actionButton(label, handler) {
  const button = document.createElement("button");
  button.className = "card-action";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

async function moveTask(taskId, status) {
  try {
    if (status === "wip") {
      state.selectedId = taskId;
      await updateTask(taskId, { completed: false });
    }

    if (status === "pending") {
      if (state.selectedId === taskId) state.selectedId = null;
      await updateTask(taskId, { completed: false });
    }

    if (status === "done") {
      if (state.selectedId === taskId) state.selectedId = null;
      await updateTask(taskId, { completed: true });
    }

    await refreshTasks();
  } catch (error) {
    els.spinStatus.textContent = "update failed";
    console.error(error);
  }
}

async function spinWheel() {
  const tasks = eligibleTasks();
  if (!tasks.length || els.wheel.classList.contains("is-spinning")) return;

  try {
    els.spinStatus.textContent = "requesting";
    const selected = await request("/tasks/random");
    const selectedIndex = tasks.findIndex((task) => task.id === Number(selected.id));
    if (selectedIndex < 0) {
      await refreshTasks();
      return;
    }

    state.selectedId = Number(selected.id);
    state.tasks = state.tasks.map(normalizeTask);

    const slice = 360 / tasks.length;
    const targetRotation = normalizeDegrees(-(selectedIndex + 0.5) * slice);
    const currentRotation = normalizeDegrees(state.rotation);
    const delta = normalizeDegrees(targetRotation - currentRotation);
    state.rotation += 720 + delta;
    els.wheel.classList.add("is-spinning");
    els.wheel.style.transform = `rotate(${state.rotation}deg)`;
    els.spinStatus.textContent = "spinning";

    window.setTimeout(() => {
      els.wheel.classList.remove("is-spinning");
      els.spinStatus.textContent = "kept in wip";
      render();
    }, 1180);
  } catch (error) {
    els.spinStatus.textContent = "spin failed";
    console.error(error);
  }
}

function openCreateDialog() {
  els.createForm.reset();
  els.createError.textContent = "";
  setCreateBusy(false);

  if (typeof els.createDialog.showModal === "function") {
    els.createDialog.showModal();
  } else {
    els.createDialog.setAttribute("open", "");
  }

  els.createTitle.focus();
}

function closeCreateDialog() {
  if (typeof els.createDialog.close === "function") {
    els.createDialog.close();
  } else {
    els.createDialog.removeAttribute("open");
  }
}

function setCreateBusy(isBusy) {
  els.createSubmit.disabled = isBusy;
  els.createForm.setAttribute("aria-busy", String(isBusy));
  els.createSubmit.textContent = isBusy ? "Creating" : "Create task";
}

async function submitCreateTask(event) {
  event.preventDefault();

  const title = els.createTitle.value.trim();
  const description = els.createDescription.value.trim();

  if (!title) {
    els.createError.textContent = "Title is required";
    els.createTitle.focus();
    return;
  }

  try {
    els.createError.textContent = "";
    els.spinStatus.textContent = "creating";
    setCreateBusy(true);
    await createTask({
      title,
      description: description || null,
      completed: els.createCompleted.checked,
    });
    state.selectedId = null;
    closeCreateDialog();
    await refreshTasks();
  } catch (error) {
    els.spinStatus.textContent = "create failed";
    els.createError.textContent = "Create failed";
    console.error(error);
  } finally {
    setCreateBusy(false);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function render() {
  updateCounts();
  renderWheel();
  renderSelected();
  renderBoard();
}

function beginDrag(event) {
  if (event.target.closest("button")) return;

  const card = event.target.closest(".task-card");
  if (!card || !els.board.contains(card)) return;

  event.preventDefault();
  state.drag = {
    taskId: Number(card.dataset.taskId),
    sourceCard: card,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    ghost: null,
    targetColumn: null,
  };

  card.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.ghost && distance < 8) return;

  if (!drag.ghost) {
    drag.ghost = drag.sourceCard.cloneNode(true);
    drag.ghost.classList.add("drag-ghost");
    drag.sourceCard.classList.add("is-drag-source");
    document.body.append(drag.ghost);
  }

  drag.ghost.style.left = `${event.clientX}px`;
  drag.ghost.style.top = `${event.clientY}px`;

  document.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => {
    column.classList.remove("is-drop-target");
  });

  const elementAtPointer = document.elementFromPoint(event.clientX, event.clientY);
  const targetList = elementAtPointer?.closest("[data-column]");
  drag.targetColumn = targetList?.dataset.column || null;

  if (targetList) {
    targetList.closest(".kanban-column")?.classList.add("is-drop-target");
  }
}

function endDrag(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  drag.sourceCard.releasePointerCapture(event.pointerId);
  document.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => {
    column.classList.remove("is-drop-target");
  });

  const targetColumn = drag.targetColumn;
  const taskId = drag.taskId;

  drag.ghost?.remove();
  drag.sourceCard.classList.remove("is-drag-source");
  state.drag = null;

  if (targetColumn) {
    void moveTask(taskId, targetColumn);
  }
}

els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewButton));
});

els.spinButtons.forEach((button) => {
  button.addEventListener("click", () => void spinWheel());
});

els.board.addEventListener("pointerdown", beginDrag);
els.board.addEventListener("pointermove", moveDrag);
els.board.addEventListener("pointerup", endDrag);
els.board.addEventListener("pointercancel", endDrag);
els.createOpen.addEventListener("click", openCreateDialog);
els.createClose.addEventListener("click", closeCreateDialog);
els.createForm.addEventListener("submit", (event) => void submitCreateTask(event));
els.createDialog.addEventListener("click", (event) => {
  if (event.target === els.createDialog) closeCreateDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "1") setView("wheel");
  if (event.key === "2") setView("kanban");
  if (event.key.toLowerCase() === "s") void spinWheel();
});

setView(state.view);
render();
void refreshTasks();
