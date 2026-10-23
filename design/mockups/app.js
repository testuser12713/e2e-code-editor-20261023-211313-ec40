/* Code Editor mockup behaviour. Vanilla JS, no network, no innerHTML for file content.
   Models the interactions the specification describes so the click-through works from the file set. */
(function () {
  'use strict';

  /* ---------- storage + settings (applied before first paint) ---------- */
  var mem = {};
  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v === null ? (mem[key] === undefined ? null : mem[key]) : v; }
      localStorage.setItem(key, val);
    } catch (e) { if (val === undefined) return mem[key] === undefined ? null : mem[key]; mem[key] = val; }
    return null;
  }
  var DEFAULTS = { theme: 'system', fontFamily: 'JetBrains Mono', fontSize: 13, tabSize: 2, insertSpaces: true, wordWrap: false, lineNumbers: true, trimOnSave: false, finalNewlineOnSave: false };
  var FONT_STACKS = {
    'JetBrains Mono': '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace',
    'Cascadia Mono': '"Cascadia Mono", Consolas, "Liberation Mono", monospace',
    'Consolas': 'Consolas, "Liberation Mono", monospace'
  };
  function loadSettings() {
    var s = Object.assign({}, DEFAULTS);
    try { var raw = store('ce.settings'); if (raw) Object.assign(s, JSON.parse(raw)); } catch (e) { /* corrupt -> defaults */ }
    return s;
  }
  var settings = loadSettings();
  function saveSettings() { store('ce.settings', JSON.stringify(settings)); }
  function resolvedTheme() {
    if (settings.theme === 'dark' || settings.theme === 'light') return settings.theme;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applySettings() {
    var root = document.documentElement;
    root.dataset.theme = resolvedTheme();
    root.style.setProperty('--editor-font-size', settings.fontSize + 'px');
    root.style.setProperty('--editor-font', FONT_STACKS[settings.fontFamily] || FONT_STACKS['JetBrains Mono']);
    root.style.setProperty('--tab-size', settings.tabSize);
    var w = parseInt(store('ce.sidebar'), 10);
    if (w) root.style.setProperty('--sidebar-w', w + 'px');
    if (!document.body) return;
    document.body.classList.toggle('no-line-numbers', !settings.lineNumbers);
    $$('.cm-editor').forEach(function (ed) { ed.classList.toggle('is-wrapped', settings.wordWrap); });
    var indent = (settings.insertSpaces ? 'Spaces: ' : 'Tabs: ') + settings.tabSize;
    $$('.cm-editor').forEach(function (ed) { if (!ed.dataset.indentCustom) ed.dataset.indent = indent; });
    syncStatus();
    $$('[data-setting]').forEach(function (el) {
      var v = settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  document.documentElement.dataset.theme = resolvedTheme();
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (settings.theme === 'system') applySettings(); });
  }

  /* ---------- commands ---------- */
  var COMMANDS = [
    { id: 'file.openFolder', title: 'File: Open Folder', menu: 'Open Folder…', key: 'Ctrl+K Ctrl+O', href: 'editor.html' },
    { id: 'file.openFile', title: 'File: Open File', menu: 'Open File…', href: 'editor.html' },
    { id: 'file.save', title: 'File: Save', menu: 'Save', key: 'Ctrl+S' },
    { id: 'file.saveAs', title: 'File: Save As', menu: 'Save As…', key: 'Ctrl+Shift+S', toast: 'Save As opens the Windows file dialog' },
    { id: 'file.saveAll', title: 'File: Save All', menu: 'Save All' },
    { id: 'tab.close', title: 'Tab: Close Tab', menu: 'Close Tab', key: 'Ctrl+W' },
    { id: 'tab.next', title: 'Tab: Next Tab', menu: 'Next Tab', key: 'Ctrl+Tab' },
    { id: 'tab.prev', title: 'Tab: Previous Tab', menu: 'Previous Tab', key: 'Ctrl+Shift+Tab' },
    { id: 'view.quickOpen', title: 'View: Quick Open', menu: 'Quick Open…', key: 'Ctrl+P', href: 'quick-open.html' },
    { id: 'view.palette', title: 'View: Command Palette', menu: 'Command Palette…', key: 'Ctrl+Shift+P', href: 'command-palette.html' },
    { id: 'view.goToLine', title: 'View: Go to Line', menu: 'Go to Line…', key: 'Ctrl+G', href: 'go-to-line.html' },
    { id: 'view.find', title: 'Edit: Find', menu: 'Find', key: 'Ctrl+F', href: 'find-replace.html' },
    { id: 'view.replace', title: 'Edit: Replace', menu: 'Replace', key: 'Ctrl+H', href: 'find-replace.html' },
    { id: 'view.workspaceSearch', title: 'View: Search in Workspace', menu: 'Search in Workspace', key: 'Ctrl+Shift+F', href: 'workspace-search.html' },
    { id: 'view.toggleTheme', title: 'View: Toggle Theme', menu: 'Toggle Dark/Light Theme' },
    { id: 'view.toggleWordWrap', title: 'View: Toggle Word Wrap', menu: 'Toggle Word Wrap' },
    { id: 'view.zoomIn', title: 'View: Zoom In', menu: 'Zoom In', key: 'Ctrl+Plus' },
    { id: 'view.zoomOut', title: 'View: Zoom Out', menu: 'Zoom Out', key: 'Ctrl+Minus' },
    { id: 'view.zoomReset', title: 'View: Reset Zoom', menu: 'Reset Zoom', key: 'Ctrl+0' },
    { id: 'view.settings', title: 'View: Open Settings', menu: 'Settings', href: 'settings.html' },
    { id: 'editor.changeLanguage', title: 'Editor: Change Language Mode', menu: 'Change Language Mode', status: 'language' },
    { id: 'editor.changeIndent', title: 'Editor: Change Indentation', menu: 'Change Indentation', status: 'indent' },
    { id: 'editor.toggleEol', title: 'Editor: Toggle Line Ending (LF/CRLF)', menu: 'Toggle Line Ending', status: 'eol' },
    { id: 'editor.toggleComment', title: 'Editor: Toggle Line Comment', menu: 'Toggle Line Comment', key: 'Ctrl+/', editor: true },
    { id: 'editor.moveLineUp', title: 'Editor: Move Line Up', menu: 'Move Line Up', key: 'Alt+Up', editor: true },
    { id: 'editor.moveLineDown', title: 'Editor: Move Line Down', menu: 'Move Line Down', key: 'Alt+Down', editor: true },
    { id: 'editor.duplicateLine', title: 'Editor: Duplicate Line', menu: 'Duplicate Line', editor: true },
    { id: 'editor.selectNext', title: 'Editor: Select Next Occurrence', menu: 'Select Next Occurrence', key: 'Ctrl+D', editor: true },
    { id: 'help.about', title: 'Help: About', menu: 'About Code Editor', href: 'about.html' }
  ];
  var MENU_ONLY = [
    { id: 'editor.undo', menu: 'Undo', key: 'Ctrl+Z', editor: true },
    { id: 'editor.redo', menu: 'Redo', key: 'Ctrl+Y', editor: true }
  ];
  var MENUS = {
    file: ['file.openFolder', 'file.openFile', '-', 'file.save', 'file.saveAs', 'file.saveAll', '-', 'tab.close'],
    edit: ['editor.undo', 'editor.redo', '-', 'editor.toggleComment', 'editor.moveLineUp', 'editor.moveLineDown', 'editor.duplicateLine', 'editor.selectNext', '-', 'view.find', 'view.replace'],
    view: ['view.quickOpen', 'view.palette', 'view.goToLine', 'view.workspaceSearch', '-', 'view.toggleTheme', 'view.toggleWordWrap', '-', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset', '-', 'view.settings'],
    help: ['help.about']
  };
  function findCmd(id) { return COMMANDS.concat(MENU_ONLY).filter(function (c) { return c.id === id; })[0]; }

  function toast(msg) {
    var t = $('.toast'); if (t) t.remove();
    t = el('div', 'toast', msg); t.setAttribute('role', 'status'); document.body.appendChild(t);
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.remove(); }, 2200);
  }

  function runCommand(id) {
    var c = findCmd(id); if (!c) return;
    closeMenus();
    if (c.href) { location.href = c.href; return; }
    switch (id) {
      case 'file.save': return saveTabs(false);
      case 'file.saveAll': return saveTabs(true);
      case 'tab.close': var a = activeTab(); if (a) closeTab(a); return;
      case 'tab.next': return cycleTab(1);
      case 'tab.prev': return cycleTab(-1);
      case 'view.toggleTheme': settings.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; saveSettings(); applySettings(); return toast('Theme: ' + settings.theme);
      case 'view.toggleWordWrap': settings.wordWrap = !settings.wordWrap; saveSettings(); applySettings(); return toast('Word wrap ' + (settings.wordWrap ? 'on' : 'off'));
      case 'view.zoomIn': return zoom(1);
      case 'view.zoomOut': return zoom(-1);
      case 'view.zoomReset': settings.fontSize = DEFAULTS.fontSize; saveSettings(); applySettings(); return;
    }
    if (c.status) {
      var item = $('[data-status="' + c.status + '"]');
      if (!item) { location.href = 'editor.html?menu=' + c.status; return; }
      return item.click();
    }
    if (c.toast) return toast(c.toast);
    if (c.editor) return toast((c.menu || c.title) + ' runs on the active editor');
  }
  function zoom(d) { settings.fontSize = Math.max(8, Math.min(32, settings.fontSize + d)); saveSettings(); applySettings(); toast('Editor font size ' + settings.fontSize + ' px'); }

  /* ---------- menus ---------- */
  var openMenuEl = null;
  function closeMenus() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    $$('.menubar-item[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    $$('.is-menu-target').forEach(function (n) { n.classList.remove('is-menu-target'); });
  }
  function keysNode(shortcut) {
    var wrap = el('span', 'keys');
    shortcut.split(' ').forEach(function (chord, i) {
      if (i) wrap.appendChild(el('span', 'gap'));
      chord.split('+').forEach(function (k) { wrap.appendChild(el('kbd', 'kbd', k)); });
    });
    return wrap;
  }
  function buildMenu(items, pos) {
    closeMenus();
    var app = $('.app'), m = el('div', 'menu'); m.setAttribute('role', 'menu');
    items.forEach(function (it) {
      if (it === '-') { m.appendChild(el('div', 'menu-sep')); return; }
      var b = el('button', 'menu-item' + (it.danger ? ' is-danger' : '')); b.type = 'button';
      b.setAttribute('role', it.checked !== undefined ? 'menuitemradio' : 'menuitem');
      if (it.checked) b.setAttribute('aria-checked', 'true');
      if (it.disabled) b.setAttribute('aria-disabled', 'true');
      b.appendChild(el('span', '', it.label));
      if (it.key) b.appendChild(el('span', 'menu-shortcut', it.key));
      b.addEventListener('click', function () { if (it.disabled) return; closeMenus(); it.run(); });
      m.appendChild(b);
    });
    app.appendChild(m);
    var r = app.getBoundingClientRect();
    if (pos.bottom !== undefined) m.style.bottom = (r.bottom - pos.bottom) + 'px'; else m.style.top = (pos.y - r.top) + 'px';
    var left = Math.min(pos.x - r.left, r.width - 232); m.style.left = Math.max(4, left) + 'px';
    openMenuEl = m;
    var first = $('.menu-item', m); if (first && pos.focus) first.focus();
    return m;
  }
  function initMenubar() {
    $$('.menubar-item').forEach(function (btn) {
      function open() {
        var id = btn.dataset.menu, was = btn.getAttribute('aria-expanded') === 'true';
        closeMenus(); if (was) return;
        var rect = btn.getBoundingClientRect();
        var items = MENUS[id].map(function (cid) {
          if (cid === '-') return '-';
          var c = findCmd(cid);
          return { label: c.menu, key: c.key, run: function () { runCommand(cid); } };
        });
        buildMenu(items, { x: rect.left, y: rect.bottom + 2, focus: true });
        btn.setAttribute('aria-expanded', 'true');
      }
      btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
      btn.addEventListener('mouseenter', function () { if (openMenuEl && btn.getAttribute('aria-expanded') !== 'true') open(); });
    });
    document.addEventListener('click', function (e) { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenus(); });
  }

  /* ---------- tabs + panels ---------- */
  function tabs() { return $$('.tabbar .tab'); }
  function activeTab() { return $('.tabbar .tab.is-active'); }
  function findBy(sel, p) { return $$(sel).filter(function (n) { return n.dataset.path === p; })[0] || null; }
  function panelFor(tab) { return tab ? findBy('.cm-editor', tab.dataset.path) : null; }
  function activePanel() { return $('.cm-editor:not([hidden])'); }
  function tabName(tab) { return $('.tab-name', tab).textContent; }
  function updateTitle() {
    var t = activeTab(), title = $('.titlebar-title');
    var text = t ? (t.classList.contains('is-dirty') ? '● ' : '') + tabName(t) + ' — Code Editor' : 'Code Editor';
    if (title) { title.textContent = text; }
    document.title = text;
  }
  function syncStatus() {
    var p = activePanel(); if (!p) return;
    var map = {
      cursor: 'Ln ' + p.dataset.ln + ', Col ' + p.dataset.col + (+p.dataset.sel ? ' (' + p.dataset.sel + ' selected)' : ''),
      language: p.dataset.langName, indent: p.dataset.indent, eol: p.dataset.eol
    };
    Object.keys(map).forEach(function (k) { var n = $('[data-status="' + k + '"]'); if (n && map[k]) n.textContent = map[k]; });
    var ro = $('[data-status="readonly"]'); if (ro) ro.hidden = !p.classList.contains('is-readonly');
  }
  function activateTab(tab) {
    if (!panelFor(tab) && !tab.dataset.empty) { location.href = 'editor.html'; return; }
    tabs().forEach(function (t) { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
    $$('.cm-editor').forEach(function (p) { p.hidden = true; });
    var p = panelFor(tab); if (p) p.hidden = false;
    $$('.tree-row.is-active').forEach(function (r) { r.classList.remove('is-active'); });
    var row = findBy('.tree-row', tab.dataset.path); if (row) row.classList.add('is-active');
    syncStatus(); updateTitle();
  }
  function makePermanent(tab) { tab.classList.remove('is-preview'); }
  function closeTab(tab) {
    if (tab.classList.contains('is-dirty')) { location.href = 'unsaved-changes.html'; return; }
    removeTab(tab);
  }
  function removeTab(tab) {
    var list = tabs(), i = list.indexOf(tab), wasActive = tab.classList.contains('is-active');
    var p = panelFor(tab); if (p) p.remove();
    tab.remove();
    var rest = tabs();
    if (!rest.length) { location.href = 'welcome.html'; return; }
    if (wasActive) activateTab(rest[Math.min(i, rest.length - 1)]);
  }
  function cycleTab(d) {
    var list = tabs(); if (!list.length) return;
    var i = list.indexOf(activeTab());
    activateTab(list[(i + d + list.length) % list.length]);
  }
  function saveTabs(all) {
    var targets = all ? tabs() : [activeTab()];
    var saved = targets.filter(function (t) { return t && t.classList.contains('is-dirty'); });
    saved.forEach(function (t) { t.classList.remove('is-dirty'); });
    updateTitle();
    var a = activeTab();
    if (a && a.querySelector('.tab-lock')) return toast('Read-only file');
    toast(saved.length ? (all ? 'Saved ' + saved.length + ' file(s)' : 'Saved ' + tabName(saved[0])) : 'Nothing to save');
  }
  function markDirty() { var t = activeTab(); if (t) { t.classList.add('is-dirty'); makePermanent(t); updateTitle(); } }

  var LANGS = { js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', json: 'JSON', html: 'HTML', css: 'CSS', md: 'Markdown', py: 'Python', c: 'C/C++', cpp: 'C/C++', h: 'C/C++', java: 'Java', go: 'Go', rs: 'Rust' };
  function langOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return (m && LANGS[m[1].toLowerCase()]) || 'Plain Text'; }
  function rowEl(n) {
    var r = el('div', 'cm-row cm-activeLine'); r.dataset.line = n;
    var g = el('span', 'cm-gutters'); g.appendChild(el('span', 'cm-lineNumber', String(n))); g.appendChild(el('span', 'cm-foldGutter'));
    r.appendChild(g); var l = el('div', 'cm-line'); l.appendChild(el('span', 'cm-cursor')); r.appendChild(l); return r;
  }
  function tabEl(path, name, preview) {
    var t = el('div', 'tab' + (preview ? ' is-preview' : '')); t.setAttribute('role', 'tab'); t.draggable = true; t.dataset.path = path; t.title = path;
    var lab = el('button', 'tab-label'); lab.type = 'button'; lab.appendChild(el('span', 'tab-name', name)); t.appendChild(lab);
    var cl = el('button', 'tab-close'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close ' + name);
    cl.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg><span class="tab-dot"></span>';
    t.appendChild(cl); return t;
  }
  function openFile(path, name, permanent) {
    var bar = $('.tabbar'), host = $('.editor-host');
    if (!bar || !host) { location.href = 'editor.html'; return; }
    var existing = tabs().filter(function (t) { return t.dataset.path === path; })[0];
    if (existing) { if (permanent) makePermanent(existing); return activateTab(existing); }
    tabs().filter(function (t) { return t.classList.contains('is-preview') && !t.classList.contains('is-dirty'); }).forEach(function (t) { var p = panelFor(t); if (p) p.remove(); t.remove(); });
    var tab = tabEl(path, name, !permanent); tab.dataset.empty = '1'; bar.appendChild(tab);
    var ed = el('div', 'cm-editor'); ed.hidden = true; ed.dataset.path = path; ed.dataset.ln = 1; ed.dataset.col = 1; ed.dataset.sel = 0;
    ed.dataset.langName = langOf(name); ed.dataset.indent = 'Spaces: ' + settings.tabSize; ed.dataset.eol = 'LF';
    var c = el('div', 'cm-content'); c.appendChild(rowEl(1)); ed.appendChild(c); host.appendChild(ed);
    ed.classList.toggle('is-wrapped', settings.wordWrap);
    activateTab(tab);
  }
  function initTabs() {
    var bar = $('.tabbar'); if (!bar) return;
    var drag = null;
    bar.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab'); if (!tab) return;
      if (e.target.closest('.tab-close')) { closeTab(tab); return; }
      activateTab(tab);
    });
    bar.addEventListener('dblclick', function (e) { var tab = e.target.closest('.tab'); if (tab) makePermanent(tab); });
    bar.addEventListener('auxclick', function (e) { var tab = e.target.closest('.tab'); if (tab && e.button === 1) { e.preventDefault(); closeTab(tab); } });
    bar.addEventListener('dragstart', function (e) { drag = e.target.closest('.tab'); if (drag) { drag.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.dataset.path); } });
    bar.addEventListener('dragover', function (e) {
      var over = e.target.closest('.tab'); if (!drag || !over || over === drag) return; e.preventDefault();
      $$('.is-drop-target', bar).forEach(function (t) { t.classList.remove('is-drop-target'); }); over.classList.add('is-drop-target');
    });
    bar.addEventListener('drop', function (e) {
      var over = e.target.closest('.tab'); if (!drag || !over || over === drag) return; e.preventDefault();
      var list = tabs(); bar.insertBefore(drag, list.indexOf(drag) < list.indexOf(over) ? over.nextSibling : over);
    });
    bar.addEventListener('dragend', function () { if (drag) drag.classList.remove('is-dragging'); $$('.is-drop-target', bar).forEach(function (t) { t.classList.remove('is-drop-target'); }); drag = null; });
    var a = activeTab(); if (a) { var row = findBy('.tree-row', a.dataset.path); if (row) row.classList.add('is-active'); }
    updateTitle();
  }

  /* ---------- editor: cursor, click to place caret, ?line= ---------- */
  function placeCursor(p, row, range) {
    $$('.cm-cursor', p).forEach(function (c) { c.remove(); });
    $$('.cm-activeLine', p).forEach(function (r) { r.classList.remove('cm-activeLine'); });
    row.classList.add('cm-activeLine');
    var cur = el('span', 'cm-cursor'), line = $('.cm-line', row), col;
    if (range) { range.insertNode(cur); } else line.appendChild(cur);
    var n = 0, walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { if (cur.compareDocumentPosition(walker.currentNode) & Node.DOCUMENT_POSITION_FOLLOWING) break; n += walker.currentNode.length; }
    col = n + 1;
    p.dataset.ln = row.dataset.line; p.dataset.col = col; p.dataset.sel = 0;
    $$('.cm-selectionBackground', p).forEach(function (s) { s.replaceWith(document.createTextNode(s.textContent)); });
    syncStatus();
  }
  function initEditor() {
    $$('.cm-editor').forEach(function (p) {
      p.addEventListener('click', function (e) {
        var row = e.target.closest('.cm-row');
        if (row && e.target.closest('.cm-gutters')) { if (row.querySelector('.cm-foldGutter svg')) toggleFold(p, row); return; }
        if (!row || p.classList.contains('is-readonly')) return;
        var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (range && !$('.cm-line', row).contains(range.startContainer)) range = null;
        placeCursor(p, row, range);
      });
    });
    var m = /[?&]line=(\d+)/.exec(location.search), p = activePanel();
    if (m && p) {
      var row = $('.cm-row[data-line="' + m[1] + '"]', p);
      if (row) { placeCursor(p, row); reveal(row, p); }
    }
  }
  function indentOf(row) { var t = $('.cm-line', row).textContent; return t.trim() === '' ? -1 : t.length - t.trimStart().length; }
  function toggleFold(p, row) {
    var folded = row.classList.toggle('is-folded'), base = indentOf(row), ph = $('.cm-foldPlaceholder', row);
    if (folded && !ph) { ph = el('span', 'cm-foldPlaceholder', '…'); $('.cm-line', row).appendChild(ph); }
    if (!folded && ph) ph.remove();
    for (var n = row.nextElementSibling; n; n = n.nextElementSibling) {
      var ind = indentOf(n);
      if (ind !== -1 && ind <= base && !(ind === base && $('.cm-line', n).textContent.trim().charAt(0) === '*')) break;
      n.hidden = folded;
    }
  }
  function reveal(node, scroller) {
    var a = node.getBoundingClientRect(), b = scroller.getBoundingClientRect();
    if (a.top < b.top + 40 || a.bottom > b.bottom - 40) scroller.scrollTop += a.top - b.top - b.height / 3;
  }

  /* ---------- status bar popups ---------- */
  var LANG_LIST = ['JavaScript', 'TypeScript', 'JSON', 'HTML', 'CSS', 'Markdown', 'Python', 'C/C++', 'Java', 'Go', 'Rust', 'Plain Text'];
  var INDENT_LIST = ['Spaces: 2', 'Spaces: 4', 'Spaces: 8', 'Tabs: 4'];
  function initStatus() {
    $$('button.status-item[data-status]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = activePanel(); if (!p) return;
        var kind = b.dataset.status, rect = b.getBoundingClientRect();
        if (kind === 'eol') {
          p.dataset.eol = p.dataset.eol === 'LF' ? 'CRLF' : 'LF'; syncStatus(); markDirty();
          return toast('Line endings: ' + p.dataset.eol + ' (applied on save)');
        }
        var list = kind === 'language' ? LANG_LIST : INDENT_LIST, cur = kind === 'language' ? p.dataset.langName : p.dataset.indent;
        buildMenu(list.map(function (l) {
          return { label: l, checked: l === cur, run: function () {
            if (kind === 'language') p.dataset.langName = l; else { p.dataset.indent = l; p.dataset.indentCustom = '1'; }
            syncStatus();
          } };
        }), { x: rect.left, bottom: rect.top, focus: true });
      });
    });
    var m = /[?&]menu=(language|indent)/.exec(location.search);
    if (m) { var n = $('[data-status="' + m[1] + '"]'); if (n) setTimeout(function () { n.click(); }, 0); }
  }

  /* ---------- explorer tree ---------- */
  function treeItemEl(name, isDir, depth, path) {
    var li = el('li', 'tree-item'); li.setAttribute('role', 'treeitem'); if (isDir) li.setAttribute('aria-expanded', 'false');
    var b = el('button', 'tree-row'); b.type = 'button'; b.style.setProperty('--depth', depth); b.dataset.path = path; b.dataset.kind = isDir ? 'dir' : 'file';
    if (isDir) b.innerHTML = '<svg class="icon tree-chevron" aria-hidden="true"><use href="#i-chevron-right"/></svg><svg class="icon tree-kind" aria-hidden="true"><use href="#i-folder"/></svg>';
    else b.innerHTML = '<span class="tree-spacer"></span><svg class="icon tree-kind" aria-hidden="true"><use href="#i-file"/></svg>';
    b.appendChild(el('span', 'tree-name', name)); li.appendChild(b);
    if (isDir) { var ul = el('ul', 'tree-children'); ul.setAttribute('role', 'group'); ul.hidden = true; li.appendChild(ul); }
    return li;
  }
  function depthOf(row) { return parseInt(row.style.getPropertyValue('--depth') || '0', 10); }
  function sortInto(ul, li) {
    var isDir = li.hasAttribute('aria-expanded'), name = $('.tree-name', li).textContent.toLowerCase(), ref = null;
    Array.prototype.some.call(ul.children, function (c) {
      if (c === li || !c.classList.contains('tree-item')) return false;
      var cDir = c.hasAttribute('aria-expanded'), cName = $('.tree-name', c).textContent.toLowerCase();
      if ((isDir && !cDir) || (isDir === cDir && name < cName)) { ref = c; return true; }
      return false;
    });
    ul.insertBefore(li, ref);
  }
  function parentOf(path) { return path.slice(0, path.lastIndexOf('\\')); }
  function expandItem(li) { li.setAttribute('aria-expanded', 'true'); var u = $(':scope > .tree-children', li); if (u) u.hidden = false; }
  function initTree() {
    var tree = $('.tree'); if (!tree) return;
    var clickTimer = null;
    tree.addEventListener('click', function (e) {
      var row = e.target.closest('.tree-row'); if (!row) return;
      var li = row.parentElement;
      if (row.dataset.kind === 'dir') {
        var open = li.getAttribute('aria-expanded') === 'true';
        li.setAttribute('aria-expanded', open ? 'false' : 'true'); $(':scope > .tree-children', li).hidden = open; return;
      }
      clearTimeout(clickTimer);
      var path = row.dataset.path, name = $('.tree-name', row).textContent;
      if (e.detail > 1) openFile(path, name, true); else clickTimer = setTimeout(function () { openFile(path, name, false); }, 180);
    });
    tree.addEventListener('contextmenu', function (e) {
      var row = e.target.closest('.tree-row'); if (!row) return; e.preventDefault();
      showTreeMenu(row, e.clientX, e.clientY);
    });
    tree.addEventListener('keydown', function (e) { if (e.key === 'F2' && e.target.closest('.tree-row')) renameRow(e.target.closest('.tree-row')); });
    var m = /[?&]menu=tree/.exec(location.search), pre = $('.tree-row[data-menu-open]');
    if (pre) { var r = pre.getBoundingClientRect(); setTimeout(function () { showTreeMenu(pre, r.left + 80, r.bottom - 4); if (/dialog=delete/.test(location.search)) { closeMenus(); deleteRow(pre); } }, 0); }
  }
  function showTreeMenu(row, x, y) {
    row.classList.add('is-menu-target');
    var items = [
      { label: 'New File', run: function () { newEntry(row, false); } },
      { label: 'New Folder', run: function () { newEntry(row, true); } }, '-',
      { label: 'Rename', key: 'F2', run: function () { renameRow(row); } },
      { label: 'Delete', key: 'Del', danger: true, run: function () { deleteRow(row); } }, '-',
      { label: 'Reveal in File Explorer', run: function () { toast('Revealed in File Explorer'); } },
      { label: 'Copy Path', run: function () { toast('Path copied to clipboard'); } }
    ];
    buildMenu(items, { x: x, y: y, focus: true });
    row.classList.add('is-menu-target');
  }
  function inlineInput(value, onDone, onCancel) {
    var inp = el('input', 'input'); inp.type = 'text'; inp.value = value || ''; inp.spellcheck = false; inp.setAttribute('aria-label', 'Name');
    var done = false;
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { done = true; if (inp.value.trim()) onDone(inp.value.trim()); else onCancel(); }
      if (e.key === 'Escape') { done = true; onCancel(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', function () { if (!done) onCancel(); });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
    return inp;
  }
  function newEntry(row, isDir) {
    var li = row.parentElement, folderLi = row.dataset.kind === 'dir' ? li : li.parentElement.closest('.tree-item');
    var ul = folderLi ? $(':scope > .tree-children', folderLi) : $('.tree');
    var depth = folderLi ? depthOf($(':scope > .tree-row', folderLi)) + 1 : 0, base = folderLi ? $(':scope > .tree-row', folderLi).dataset.path : $('.tree').dataset.root;
    if (folderLi) expandItem(folderLi);
    var holder = el('li', 'tree-input-row'); holder.style.setProperty('--depth', depth);
    holder.appendChild(el('span', '', ''));
    holder.firstChild.innerHTML = '<svg class="icon tree-kind" aria-hidden="true"><use href="#i-' + (isDir ? 'folder' : 'file') + '"/></svg>';
    holder.appendChild(inlineInput('', function (name) {
      holder.remove(); var item = treeItemEl(name, isDir, depth, (base ? base + '\\' : '') + name); sortInto(ul, item); toast((isDir ? 'Folder' : 'File') + ' created');
    }, function () { holder.remove(); }));
    ul.insertBefore(holder, ul.firstChild);
  }
  function renameRow(row) {
    var nameEl = $('.tree-name', row), old = nameEl.textContent, inp;
    inp = inlineInput(old, function (name) {
      var np = parentOf(row.dataset.path) + '\\' + name; row.dataset.path = np; nameEl.textContent = name; inp.replaceWith(nameEl);
      var t = tabs().filter(function (x) { return x.dataset.path === row.dataset.path; })[0]; toast('Renamed to ' + name);
    }, function () { inp.replaceWith(nameEl); });
    nameEl.replaceWith(inp);
  }
  function confirmDialog(opts, onConfirm) {
    var app = $('.app'), scrim = el('div', 'scrim'), d = el('div', 'dialog'); d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    d.appendChild(el('h2', '', opts.title)); d.appendChild(el('p', 'dialog-body', opts.body));
    var acts = el('div', 'dialog-actions'), cancel = el('button', 'btn', 'Cancel'), ok = el('button', 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), opts.confirm);
    cancel.type = ok.type = 'button'; acts.appendChild(cancel); acts.appendChild(ok); d.appendChild(acts);
    function close() { scrim.remove(); d.remove(); }
    cancel.onclick = close; scrim.onclick = close; ok.onclick = function () { close(); onConfirm(); };
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    app.appendChild(scrim); app.appendChild(d); cancel.focus();
  }
  function deleteRow(row) {
    var name = $('.tree-name', row).textContent;
    confirmDialog({ title: 'Delete ' + name + '?', body: 'It will be moved to the Recycle Bin. You can restore it from there.', confirm: 'Move to Recycle Bin', danger: true }, function () {
      var t = tabs().filter(function (x) { return x.dataset.path === row.dataset.path; })[0];
      row.parentElement.remove(); if (t) removeTab(t); toast(name + ' moved to the Recycle Bin');
    });
  }

  /* ---------- fuzzy + quick pick ---------- */
  /* file names are matched against the base name first, then against the whole path */
  function fuzzy(q, t) {
    q = q.toLowerCase();
    var base = t.lastIndexOf('\\') + 1, inName = base ? fuzzyCore(q, t, base, base) : null;
    if (inName) { inName.score += 8; return inName; }
    return fuzzyCore(q, t, 0, base);
  }
  function fuzzyCore(q, t, from, base) {
    var lt = t.toLowerCase(), ti = from, score = 0, last = -2, idx = [];
    for (var i = 0; i < q.length; i++) {
      if (q[i] === ' ') continue;
      var p = lt.indexOf(q[i], ti); if (p < 0) return null; idx.push(p);
      var s = 1; if (p === last + 1) s += 5; if (p === 0 || '\\/._- :'.indexOf(t[p - 1]) >= 0) s += 4; if (p >= base) s += 2;
      score += s; last = p; ti = p + 1;
    }
    if (idx.length) score -= (idx[idx.length - 1] - idx[0]) * 0.1;
    return { score: score - t.length * 0.02, idx: idx };
  }
  function hlNodes(text, idx, offset) {
    var frag = document.createDocumentFragment(), set = {}; idx.forEach(function (i) { set[i - offset] = 1; });
    var buf = '', on = false;
    function flush() { if (!buf) return; frag.appendChild(on ? el('span', 'hl', buf) : document.createTextNode(buf)); buf = ''; }
    for (var i = 0; i < text.length; i++) { var h = !!set[i]; if (h !== on) { flush(); on = h; } buf += text[i]; }
    flush(); return frag;
  }
  var FILES = ['.gitignore', 'package.json', 'README.md', 'tsconfig.json', 'data\\archive-2025.json', 'docs\\usage.md', 'src\\index.ts', 'src\\types.ts', 'src\\api\\cache.ts', 'src\\api\\forecast.ts', 'src\\cli\\args.ts', 'src\\cli\\commands.ts', 'src\\format\\table.ts', 'src\\format\\units.ts', 'test\\args.test.ts', 'test\\forecast.test.ts'];
  var RECENT = ['src\\api\\forecast.ts', 'src\\cli\\args.ts', 'package.json', 'README.md', 'src\\format\\table.ts'];
  function initQuickPick() {
    var root = $('[data-qp]'); if (!root) return;
    var kind = root.dataset.qp, input = $('.qp-input', root), list = $('.qp-list', root), sel = 0, rows = [];
    function pick(i) {
      var r = rows[i]; if (!r) return;
      if (kind === 'files') { var P = r.path; location.href = 'editor.html?open=' + encodeURIComponent(P); }
      else runCommand(r.id);
    }
    function render() {
      var q = input.value.trim(); list.textContent = ''; rows = [];
      if (kind === 'files') {
        var base = q ? FILES.map(function (f) { var m = fuzzy(q, f); return m && { path: f, m: m }; }).filter(Boolean).sort(function (a, b) { return b.m.score - a.m.score; })
          : RECENT.map(function (f) { return { path: f, m: { idx: [] } }; });
        rows = base;
        if (!q) list.appendChild(el('div', 'qp-heading', 'Recently opened'));
        if (!rows.length) list.appendChild(el('div', 'qp-empty', 'No matching files'));
        rows.forEach(function (r, i) {
          var b = r.path.lastIndexOf('\\') + 1, row = el('div', 'qp-row'); row.setAttribute('role', 'option');
          var t = el('span', 'qp-title'); t.appendChild(hlNodes(r.path.slice(b), r.m.idx.filter(function (x) { return x >= b; }), b)); row.appendChild(t);
          if (b) { var s = el('span', 'qp-sub'); s.appendChild(hlNodes(r.path.slice(0, b - 1), r.m.idx.filter(function (x) { return x < b - 1; }), 0)); row.appendChild(s); }
          bind(row, i); list.appendChild(row);
        });
      } else {
        rows = COMMANDS.map(function (c) { var m = q ? fuzzy(q, c.title) : { score: 0, idx: [] }; return m && { id: c.id, c: c, m: m }; }).filter(Boolean);
        if (q) rows.sort(function (a, b) { return b.m.score - a.m.score; });
        if (!rows.length) list.appendChild(el('div', 'qp-empty', 'No matching commands'));
        rows.forEach(function (r, i) {
          var row = el('div', 'qp-row'); row.setAttribute('role', 'option');
          var t = el('span', 'qp-title'); t.appendChild(hlNodes(r.c.title, r.m.idx, 0)); row.appendChild(t);
          if (r.c.key) row.appendChild(keysNode(r.c.key));
          bind(row, i); list.appendChild(row);
        });
      }
      sel = 0; mark();
    }
    function bind(row, i) { row.addEventListener('click', function () { pick(i); }); row.addEventListener('mousemove', function () { if (sel !== i) { sel = i; mark(); } }); }
    function mark() { $$('.qp-row', list).forEach(function (r, i) { r.classList.toggle('is-selected', i === sel); r.setAttribute('aria-selected', i === sel ? 'true' : 'false'); if (i === sel) { var a = r.offsetTop, h = list.clientHeight; if (a < list.scrollTop) list.scrollTop = a; else if (a + r.offsetHeight > list.scrollTop + h) list.scrollTop = a + r.offsetHeight - h; } }); }
    if (kind === 'goto') {
      var max = +root.dataset.max, cur = root.dataset.current, hint = $('.qp-hint', root), err = $('.field-error', root); err.hidden = true;
      input.addEventListener('input', function () { var v = input.value.trim(), n = +v; err.hidden = !v || (/^\d+$/.test(v) && n >= 1 && n <= max); if (v && !/^\d+$/.test(v)) { err.hidden = false; err.textContent = 'Enter a line number'; } else err.textContent = 'Line must be between 1 and ' + max; });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var n = +input.value.trim(); if (/^\d+$/.test(input.value.trim()) && n >= 1 && n <= max) location.href = 'editor.html?line=' + n; } });
    } else {
      input.addEventListener('input', render);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
        if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
      });
      render();
    }
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  }

  /* ---------- search pattern helper ---------- */
  function buildRegex(q, o) {
    var src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (o.word) src = '\\b(?:' + src + ')\\b';
    return new RegExp(src, 'g' + (o.cs ? '' : 'i'));
  }
  function toggles(root) {
    var o = { cs: false, word: false, regex: false };
    $$('.toggle[data-toggle]', root).forEach(function (b) { var k = b.dataset.toggle; o[k] = b.getAttribute('aria-pressed') === 'true'; });
    return o;
  }

  /* ---------- find / replace in the current file ---------- */
  function initFind() {
    var root = $('.findbar'); if (!root) return;
    var input = $('#find-input'), rep = $('#replace-input'), count = $('#find-count'), err = $('#find-error'), group = input.closest('.input-group');
    var touched = false, cur = 0, marks = [];
    function clear() {
      $$('mark.cm-searchMatch').forEach(function (m) { var p = m.parentNode; m.replaceWith(document.createTextNode(m.textContent)); p.normalize(); });
      marks = [];
    }
    function build(keep) {
      clear(); err.hidden = true; group.classList.remove('is-invalid'); input.removeAttribute('aria-invalid');
      var q = input.value; if (!q) { count.textContent = 'No results'; return; }
      var re; try { re = buildRegex(q, toggles(root)); } catch (e) {
        count.textContent = '—';
        if (touched) { err.hidden = false; err.textContent = 'Invalid regular expression: ' + String(e.message).replace(/^.*:\s*/, ''); group.classList.add('is-invalid'); input.setAttribute('aria-invalid', 'true'); }
        return;
      }
      var panel = activePanel(); if (!panel) return;
      $$('.cm-line', panel).forEach(function (line) {
        var nodes = [], w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(function (tn) {
          var t = tn.data, ms = Array.from(t.matchAll(re)).filter(function (m) { return m[0].length; }); if (!ms.length) return;
          var frag = document.createDocumentFragment(), pos = 0;
          ms.forEach(function (m) {
            if (m.index > pos) frag.appendChild(document.createTextNode(t.slice(pos, m.index)));
            var mk = el('mark', 'cm-searchMatch', m[0]); frag.appendChild(mk); pos = m.index + m[0].length;
          });
          if (pos < t.length) frag.appendChild(document.createTextNode(t.slice(pos)));
          tn.replaceWith(frag);
        });
      });
      marks = $$('mark.cm-searchMatch', panel); cur = keep ? Math.min(cur, Math.max(0, marks.length - 1)) : 0; show();
    }
    function show() {
      marks.forEach(function (m, i) { m.classList.toggle('cm-searchMatch-selected', i === cur); });
      count.textContent = marks.length ? (cur + 1) + ' of ' + marks.length : 'No results';
      if (marks[cur]) reveal(marks[cur], activePanel());
    }
    function step(d) { if (!marks.length) return; cur = (cur + d + marks.length) % marks.length; show(); }
    function replaceMarks(list) { if (!list.length) return; list.forEach(function (m) { var p = m.parentNode; m.replaceWith(document.createTextNode(rep.value)); p.normalize(); }); markDirty(); }
    input.addEventListener('input', function () { touched = true; build(false); });
    $$('.toggle[data-toggle]', root).forEach(function (b) { b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); build(false); }); });
    $('[data-find="next"]').addEventListener('click', function () { step(1); });
    $('[data-find="prev"]').addEventListener('click', function () { step(-1); });
    $('[data-find="replace"]').addEventListener('click', function () { if (marks[cur]) { replaceMarks([marks[cur]]); build(true); } });
    $('[data-find="replaceAll"]').addEventListener('click', function () { replaceMarks(marks.slice()); build(false); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target === input) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      if (e.key === 'Enter' && e.target === rep) { e.preventDefault(); $('[data-find="replace"]').click(); }
    });
    build(false);
  }

  /* ---------- workspace search ---------- */
  function globRe(p) {
    var s = p.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.');
    return new RegExp('(^|/)' + s + '($|/)', 'i');
  }
  function globs(v) { return v.split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(function (g) { return globRe(g.replace(/\/$/, '')); }); }
  function initSearch() {
    var root = $('#search-form'); if (!root) return;
    var q = $('#ws-query'), inc = $('#ws-include'), exc = $('#ws-exclude'), err = $('#ws-error'), sum = $('#ws-summary'), empty = $('#ws-empty'), touched = false;
    function run() {
      err.hidden = true; var query = q.value, o = toggles(root), re = null, incs = globs(inc.value), excs = globs(exc.value);
      if (query) { try { re = buildRegex(query, o); } catch (e) { if (touched) { err.hidden = false; err.textContent = 'Invalid regular expression'; } } }
      var total = 0, files = 0;
      $$('.result-group').forEach(function (g) {
        var path = g.dataset.path.replace(/\\/g, '/'), ok = re && (!incs.length || incs.some(function (r) { return r.test(path); })) && !excs.some(function (r) { return r.test(path); }), n = 0;
        $$('.result-line', g).forEach(function (ln) {
          var text = ln.dataset.text, box = $('.result-text', ln), ms = ok ? Array.from(text.matchAll(re)).filter(function (m) { return m[0].length; }) : [];
          box.textContent = ''; ln.hidden = !ms.length; if (!ms.length) return;
          var pos = 0, lead = text.length - text.trimStart().length;
          ms.forEach(function (m) {
            if (m.index > pos) box.appendChild(document.createTextNode(text.slice(Math.max(pos, lead), m.index)));
            box.appendChild(el('mark', 'hit', m[0])); pos = m.index + m[0].length; n++;
          });
          if (pos < text.length) box.appendChild(document.createTextNode(text.slice(pos)));
        });
        g.hidden = !n; $('.badge', g).textContent = n; total += n; if (n) files++;
      });
      empty.hidden = !!total || !query || !!(!err.hidden);
      sum.textContent = !query ? 'Type to search the workspace' : total ? total + ' result' + (total === 1 ? '' : 's') + ' in ' + files + ' file' + (files === 1 ? '' : 's') : '';
    }
    [q, inc, exc].forEach(function (i) { i.addEventListener('input', function () { touched = true; run(); }); });
    $$('.toggle[data-toggle]', root).forEach(function (b) { b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); run(); }); });
    $$('.result-group').forEach(function (g) {
      g.addEventListener('click', function (e) {
        var ln = e.target.closest('.result-line');
        if (ln) { $$('.result-line.is-active').forEach(function (x) { x.classList.remove('is-active'); }); ln.classList.add('is-active'); location.href = 'editor.html?line=' + ln.dataset.line; return; }
        if (e.target.closest('.result-file')) {
          var open = g.getAttribute('aria-expanded') === 'true'; g.setAttribute('aria-expanded', open ? 'false' : 'true');
          $$('.result-line', g).forEach(function (l) { l.classList.toggle('is-collapsed', open); });
          $('.result-lines', g).hidden = open;
        }
      });
    });
    run();
  }

  /* ---------- settings view ---------- */
  function initSettings() {
    $$('[data-setting]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.dataset.setting, v;
        if (inp.type === 'checkbox') v = inp.checked; else if (inp.type === 'number' || k === 'tabSize') { v = parseInt(inp.value, 10); if (isNaN(v)) return; if (k === 'fontSize') v = Math.max(8, Math.min(32, v)); } else v = inp.value;
        settings[k] = v; saveSettings(); applySettings();
      });
    });
  }

  /* ---------- dialogs + banners on the notice screens ---------- */
  function initActions() {
    $$('.activity-btn[aria-current="page"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (window.innerWidth > 720) return;
        e.preventDefault(); document.body.dataset.narrow = document.body.dataset.narrow === 'sidebar' ? 'main' : 'sidebar';
      });
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]'), c = e.target.closest('[data-cmd]');
      if (c) { runCommand(c.dataset.cmd); return; }
      if (!a) return;
      var act = a.dataset.act, dlg = a.closest('.dialog'), scrim = $('.scrim');
      function closeDlg() { if (dlg) dlg.remove(); if (scrim) scrim.remove(); }
      if (act === 'unsaved-save' || act === 'unsaved-dont') {
        var t = tabs().filter(function (x) { return x.dataset.path === dlg.dataset.path; })[0]; closeDlg();
        if (t) { var nm = tabName(t); removeTab(t); toast(act === 'unsaved-save' ? 'Saved ' + nm : 'Closed ' + nm + ' without saving'); }
      }
      if (act === 'unsaved-cancel') { closeDlg(); toast('Nothing was closed'); }
      if (act === 'conflict-reload' || act === 'conflict-keep') {
        var b = a.closest('.banner'); b.remove();
        if (act === 'conflict-reload') { var at = activeTab(); if (at) at.classList.remove('is-dirty'); updateTitle(); toast('Reloaded from disk'); } else toast('Keeping your version');
      }
      if (act === 'clear-recent') {
        var list = $('.recent-list'); list.textContent = ''; list.appendChild(el('div', 'recent-empty', 'No recent workspaces')); a.disabled = true; toast('Recent workspaces cleared');
      }
    });
    $$('.recent-item').forEach(function (r) { r.addEventListener('click', function () { location.href = 'editor.html'; }); });
  }

  /* ---------- keyboard ---------- */
  var chord = false;
  function initKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (openMenuEl) { closeMenus(); return; }
        var ov = $('body[data-overlay]'); if (ov && !$('.dialog[role="alertdialog"]')) location.href = 'editor.html';
        return;
      }
      var k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (chord) { chord = false; if (ctrl && k === 'o') { e.preventDefault(); runCommand('file.openFolder'); } return; }
      if (!ctrl) return;
      var go = null;
      if (k === 'k') { e.preventDefault(); chord = true; setTimeout(function () { chord = false; }, 1500); return; }
      if (k === 'p') go = e.shiftKey ? 'view.palette' : 'view.quickOpen';
      else if (k === 'g') go = 'view.goToLine';
      else if (k === 'f') go = e.shiftKey ? 'view.workspaceSearch' : 'view.find';
      else if (k === 'h') go = 'view.replace';
      else if (k === 's') go = e.shiftKey ? 'file.saveAs' : 'file.save';
      else if (k === 'w') go = 'tab.close';
      else if (k === 'tab') go = e.shiftKey ? 'tab.prev' : 'tab.next';
      else if (k === '=' || k === '+') go = 'view.zoomIn';
      else if (k === '-') go = 'view.zoomOut';
      else if (k === '0') go = 'view.zoomReset';
      if (go) { e.preventDefault(); runCommand(go); }
    });
  }

  /* ---------- sidebar resizer ---------- */
  function initResizer() {
    var r = $('.resizer'), sb = $('.sidebar'); if (!r || !sb) return;
    r.addEventListener('pointerdown', function (e) {
      e.preventDefault(); r.setPointerCapture(e.pointerId); r.classList.add('is-dragging');
      var left = sb.getBoundingClientRect().left;
      function move(ev) { var w = Math.max(180, Math.min(480, ev.clientX - left)); document.documentElement.style.setProperty('--sidebar-w', w + 'px'); store('ce.sidebar', String(Math.round(w))); }
      function up() { r.classList.remove('is-dragging'); r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); }
      r.addEventListener('pointermove', move); r.addEventListener('pointerup', up);
    });
    r.addEventListener('keydown', function (e) {
      var w = sb.getBoundingClientRect().width, d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0; if (!d) return;
      w = Math.max(180, Math.min(480, w + d)); document.documentElement.style.setProperty('--sidebar-w', w + 'px'); store('ce.sidebar', String(Math.round(w)));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applySettings();
    initMenubar(); initTabs(); initEditor(); initStatus(); initTree(); initQuickPick(); initFind(); initSearch(); initSettings(); initActions(); initKeys(); initResizer();
    var open = /[?&]open=([^&]+)/.exec(location.search);
    if (open) { var p = decodeURIComponent(open[1]), nm = p.slice(p.lastIndexOf('\\') + 1); openFile(p, nm, true); }
    syncStatus(); updateTitle();
  });
})();
