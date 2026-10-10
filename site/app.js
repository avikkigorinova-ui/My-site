/* ============================================================
   Singleton: общий журнал действий
   ============================================================ */
class ActionLog {
  constructor() {
    if (ActionLog.instance) {
      return ActionLog.instance;
    }
    this.messages = [];
    this.listeners = [];
    ActionLog.instance = this;
  }

  static getInstance() {
    if (!ActionLog.instance) {
      ActionLog.instance = new ActionLog();
    }
    return ActionLog.instance;
  }

  add(message) {
    const time = new Date().toLocaleTimeString("ru-RU");
    this.messages.unshift(`[${time}] ${message}`);
    if (this.messages.length > 60) {
      this.messages.pop();
    }
    this.notify();
  }

  subscribe(fn) {
    this.listeners.push(fn);
    fn(this.messages);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.messages));
  }
}

/* ============================================================
   Общее хранилище книг
   ============================================================ */
class BookStore {
  constructor(books) {
    this.books = books;
    this.listeners = [];
  }

  subscribe(fn) {
    this.listeners.push(fn);
    fn(this.books);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.books));
  }

  getAll() {
    return this.books;
  }

  getById(id) {
    return this.books.find((b) => b.id === id);
  }

  add(book) {
    this.books.push(book);
    this.notify();
  }

  remove(id) {
    const index = this.books.findIndex((b) => b.id === id);
    if (index === -1) return null;
    const [removed] = this.books.splice(index, 1);
    this.notify();
    return { book: removed, index };
  }

  insert(book, index) {
    this.books.splice(index, 0, book);
    this.notify();
  }
}

/* ============================================================
   Утилита
   ============================================================ */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

/* ============================================================
   1. Observer
   ============================================================ */
function initObserver(store, log) {
  const state = {
    selectedId: null,
    views: {},
    listeners: [],
    subscribe(fn) {
      this.listeners.push(fn);
      fn(this);
    },
    notify() {
      this.listeners.forEach((fn) => fn(this));
    },
    setSelected(id) {
      if (this.selectedId === id) return;
      this.selectedId = id;
      if (id !== null) {
        this.views[id] = (this.views[id] || 0) + 1;
      }
      this.notify();
    },
  };

  const selectEl = document.getElementById("observer-select");
  const cardEl = document.getElementById("observer-card");
  const counterEl = document.getElementById("observer-counter");
  const logEl = document.getElementById("observer-log");

  // Блок «карточка» подписан на состояние
  state.subscribe((s) => {
    const book = s.selectedId ? store.getById(s.selectedId) : null;
    if (!book) {
      cardEl.innerHTML = '<p class="muted">Выберите книгу</p>';
      return;
    }
    cardEl.innerHTML = `
      <h3>${escapeHtml(book.title)}</h3>
      <p><strong>Автор:</strong> ${escapeHtml(book.author)}</p>
      <p><strong>Год:</strong> ${book.year}</p>
      <p><strong>Рейтинг:</strong> ${book.rating}</p>
      <p><strong>Жанр:</strong> ${escapeHtml(book.genre)}</p>
    `;
  });

  // Блок «счётчик просмотров» подписан на состояние
  state.subscribe((s) => {
    if (!s.selectedId) {
      counterEl.textContent = "Просмотров: 0";
      return;
    }
    counterEl.textContent = `Просмотров выбранной книги: ${s.views[s.selectedId] || 0}`;
  });

  // Блок «журнал» косвенно подписан на состояние:
  // отдельный подписчик состояния пишет в общий Singleton-журнал,
  // а сам блок журнала слушает уже ActionLog.
  let prevSelectedId = null;
  state.subscribe((s) => {
    if (s.selectedId === prevSelectedId) return;
    prevSelectedId = s.selectedId;
    if (s.selectedId) {
      const book = store.getById(s.selectedId);
      if (book) {
        log.add(`Observer: выбрана книга «${book.title}»`);
      }
    }
  });

  log.subscribe((messages) => {
    const filtered = messages.filter((m) => m.includes("Observer:"));
    logEl.innerHTML = filtered
      .map((m) => `<div class="log-item">${escapeHtml(m)}</div>`)
      .join("");
  });

  // Заполнение select и реакция на изменения в общем хранилище
  function renderSelect() {
    const books = store.getAll();
    const current = state.selectedId;
    selectEl.innerHTML =
      '<option value="">— выберите книгу —</option>' +
      books
        .map(
          (b) =>
            `<option value="${b.id}"${b.id === current ? " selected" : ""}>${escapeHtml(
              b.title
            )}</option>`
        )
        .join("");
  }

  // Если выбранную книгу удалили — сбрасываем выбор
  store.subscribe(() => {
    if (state.selectedId !== null && !store.getById(state.selectedId)) {
      state.setSelected(null);
    }
  });

  store.subscribe(renderSelect);

  selectEl.addEventListener("change", (e) => {
    const id = e.target.value ? Number(e.target.value) : null;
    state.setSelected(id);
  });
}

/* ============================================================
   2. Strategy
   ============================================================ */
function initStrategy(store) {
  const strategies = {
    title: {
      label: "По названию (А-Я)",
      fn: (a, b) => a.title.localeCompare(b.title, "ru"),
    },
    year: {
      label: "По году (сначала новые)",
      fn: (a, b) => b.year - a.year,
    },
    rating: {
      label: "По рейтингу (сначала высокий)",
      fn: (a, b) => b.rating - a.rating,
    },
    author: {
      label: "По автору (А-Я)",
      fn: (a, b) => a.author.localeCompare(b.author, "ru"),
    },
  };

  let current = "title";

  const selectEl = document.getElementById("strategy-select");
  const listEl = document.getElementById("strategy-list");

  selectEl.innerHTML = Object.entries(strategies)
    .map(([key, s]) => `<option value="${key}">${s.label}</option>`)
    .join("");
  selectEl.value = current;

  function render() {
    const books = [...store.getAll()].sort(strategies[current].fn);
    listEl.innerHTML = books
      .map(
        (b) => `
      <li>
        <span>
          <strong>${escapeHtml(b.title)}</strong> —
          ${escapeHtml(b.author)}, ${b.year},
          рейтинг ${b.rating}, ${escapeHtml(b.genre)}
        </span>
      </li>`
      )
      .join("");
  }

  selectEl.addEventListener("change", (e) => {
    current = e.target.value;
    render();
  });

  store.subscribe(render);
}

/* ============================================================
   3. Command
   ============================================================ */
function initCommand(store, log) {
  const listEl = document.getElementById("command-list");
  const undoBtn = document.getElementById("command-undo");
  const form = document.getElementById("command-form");
  const commandLogEl = document.getElementById("command-log");
  const history = [];

  class AddBookCommand {
    constructor(book) {
      this.book = book;
    }
    execute() {
      store.add(this.book);
      log.add(`Command: добавлена книга «${this.book.title}»`);
    }
    undo() {
      store.remove(this.book.id);
      log.add(`Command: отменено добавление «${this.book.title}»`);
    }
  }

  class DeleteBookCommand {
    constructor(book, index) {
      this.book = book;
      this.index = index;
    }
    execute() {
      store.remove(this.book.id);
      log.add(`Command: удалена книга «${this.book.title}»`);
    }
    undo() {
      store.insert(this.book, this.index);
      log.add(`Command: отменено удаление «${this.book.title}»`);
    }
  }

  function updateUndoButton() {
    undoBtn.disabled = history.length === 0;
  }

  function executeCommand(command) {
    command.execute();
    history.push(command);
    updateUndoButton();
  }

  function undoLast() {
    const command = history.pop();
    if (!command) return;
    command.undo();
    updateUndoButton();
  }

  undoBtn.addEventListener("click", undoLast);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("cmd-title").value.trim();
    const author = document.getElementById("cmd-author").value.trim();
    const year = Number(document.getElementById("cmd-year").value);
    const rating = Number(document.getElementById("cmd-rating").value);
    const genre = document.getElementById("cmd-genre").value.trim();

    if (!title || !author || !year || !rating || !genre) return;

    const maxId = Math.max(0, ...store.getAll().map((b) => b.id));
    const book = { id: maxId + 1, title, author, year, rating, genre };

    executeCommand(new AddBookCommand(book));
    form.reset();
  });

  function renderList() {
    const books = store.getAll();
    listEl.innerHTML = books
      .map(
        (b, index) => `
      <li>
        <span>
          <strong>${escapeHtml(b.title)}</strong> —
          ${escapeHtml(b.author)} (${b.year})
        </span>
        <button class="delete-btn" data-id="${b.id}" data-index="${index}">
          Удалить
        </button>
      </li>`
      )
      .join("");

    listEl.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const index = Number(btn.dataset.index);
        const book = store.getById(id);
        if (book) {
          executeCommand(new DeleteBookCommand(book, index));
        }
      });
    });
  }

  log.subscribe((messages) => {
    const filtered = messages.filter((m) => m.includes("Command:"));
    commandLogEl.innerHTML = filtered
      .map((m) => `<div class="log-item">${escapeHtml(m)}</div>`)
      .join("");
  });

  store.subscribe(renderList);
  updateUndoButton();
}

/* ============================================================
   4. Singleton — демонстрация
   ============================================================ */
function initSingleton() {
  const btn = document.getElementById("singleton-check");
  const out = document.getElementById("singleton-out");

  btn.addEventListener("click", () => {
    const a = ActionLog.getInstance();
    const b = ActionLog.getInstance();
    out.textContent =
      `a === b: ${a === b}. ` +
      `Сообщений в общем журнале: ${a.messages.length}`;
  });
}

/* ============================================================
   Запуск
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const books = await response.json();

    const store = new BookStore(books);
    const log = ActionLog.getInstance();

    initObserver(store, log);
    initStrategy(store);
    initCommand(store, log);
    initSingleton();
  } catch (err) {
    document.body.innerHTML = `
      <p style="color:#b91c1c; font-family:sans-serif; padding:20px;">
        Ошибка загрузки данных: ${escapeHtml(err.message)}.<br>
        Запустите страницу через локальный веб-сервер, например:
        <code>python -m http.server 8000</code>.
      </p>`;
  }
});