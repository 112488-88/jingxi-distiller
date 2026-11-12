/* ══════════════════════════════════════════════════════════════════
   鲸汐提炼器 · app.js
   输入 → DeepSeek → 四区块卡片；原文可追溯；重点标色；历史；复制。
   零依赖，传统 script 顺序加载（file:// 下不能用 type="module"）。
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = window.DSH_CONFIG || {};
  var API_URL = CFG.apiUrl || 'https://api.deepseek.com/chat/completions';
  var MODEL = CFG.model || 'deepseek-chat';
  var KEY_OPTIONAL = !!CFG.keyOptional;   // 服务端代理代填 Key 时，前端可以不填
  var KEY_STORE = 'msgcard.apikey';
  var HISTORY_KEY = 'msgcard.history';
  var THEME_KEY = 'msgcard.theme';
  var MARK_STORE = 'msgcard.marks';
  var HISTORY_MAX = 20;
  var TIMEOUT_MS = 90000;
  var ASK_TIMEOUT_MS = 60000;
  var SOURCE_KEEP = 24000;

  // ---------- 基础工具 ----------

  function $(id) { return document.getElementById(id); }

  function str(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined || v === '') return [];
    return [v];
  }

  function AppError(msg, detail) {
    var e = new Error(msg);
    e.userMessage = msg;
    e.detail = detail || '';
    return e;
  }

  function fmtTime(d) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  // ---------- 图标（静态常量，不含模型输出） ----------

  var ICONS = {
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V17h5.4v-1.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    checkList: '<path d="M4 7h11M4 12h11M4 17h7"/><path d="M17 15.5l2 2 3-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.6v.4"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.6 10h4.2a1.8 1.8 0 0 1 0 3.6H9.6"/>',
    hash: '<path d="M9 4 7.5 20M16.5 4 15 20M4 9h16M3.2 15h16"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M15.5 5.5H6.5A2 2 0 0 0 4.5 7.5v9"/>',
    doc: '<path d="M8 3h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15.5 3v4.5H20"/><path d="M9.5 12h5M9.5 16h3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.4"/>',
    warn: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.6v.4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.6"/><path d="M12 16.6v.4"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7M14 8.5v7"/>'
  };

  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  // ---------- 元素 ----------

  var el = {
    keyChip: $('keyChip'),
    keyState: $('keyState'),
    keyToggle: $('keyToggle'),
    keyPanel: $('keyPanel'),
    keyInput: $('keyInput'),
    keySave: $('keySave'),
    keyClear: $('keyClear'),
    keyHint: $('keyHint'),
    themeToggle: $('themeToggle'),
    newBtn: $('newBtn'),
    searchInput: $('searchInput'),
    input: $('input'),
    inputCard: $('inputCard'),
    dropOverlay: $('dropOverlay'),
    charCount: $('charCount'),
    run: $('run'),
    runLabel: $('runLabel'),
    clear: $('clear'),
    status: $('status'),
    result: $('result'),
    emptyState: $('emptyState'),
    samplesBox: $('samplesBox'),
    samplesToggle: $('samplesToggle'),
    samplesShow: $('samplesShow'),
    historyList: $('historyList'),
    historyCount: $('historyCount'),
    histClear: $('histClear'),
    composerSummary: $('composerSummary'),
    csText: $('csText'),
    csExpand: $('csExpand'),
    refHandle: $('refHandle'),
    petLayer: $('petLayer'),
    pet: $('pet'),
    petBubble: $('petBubble'),
    petPanel: $('petPanel'),
    petLog: $('petLog'),
    petSub: $('petSub'),
    petInput: $('petInput'),
    petSend: $('petSend'),
    petAskForm: $('petAskForm'),
    petClose: $('petClose'),
    petHide: $('petHide'),
    petToggle: $('petToggle'),
    installBtn: $('installBtn'),
    reqBar: $('reqBar'),
    reqChips: $('reqChips'),
    reqInput: $('reqInput'),
    reqHint: $('reqHint'),
    reqDone: $('reqDone'),
    reqClose: $('reqClose'),
    petSvg: $('petSvg'),
    petImg: $('petImg'),
    petName: $('petName'),
    petTools: $('petTools'),
    petSkinBtn: $('petSkinBtn'),
    petSkinPanel: $('petSkinPanel'),
    petSkinList: $('petSkinList'),
    petSkinClose: $('petSkinClose'),
    petSkinUpload: $('petSkinUpload'),
    petSkinFile: $('petSkinFile'),
    petSkinReset: $('petSkinReset'),
    toastBox: $('toastBox'),
    topbar: document.querySelector('.topbar'),
    importCard: $('importCard'),
    importName: $('importName'),
    importStats: $('importStats'),
    importNotice: $('importNotice'),
    importPreviewToggle: $('importPreviewToggle'),
    importPreviewList: $('importPreviewList'),
    importConfirm: $('importConfirm'),
    importRemove: $('importRemove'),
    importRemoveBig: $('importRemoveBig'),
    kindSelect: $('kindSelect'),
    toneBox: $('toneBox'),
    toneToggle: $('toneToggle'),
    toneScope: $('toneScope'),
    diagBtn: $('diagBtn'),
    diagBox: $('diagBox'),
    diagPanel: $('diagPanel'),
    diagCopy: $('diagCopy'),
    refPane: $('refPane'),
    refTabs: $('refTabs'),
    refBody: $('refBody'),
    refHide: $('refHide')
  };

  var busy = false;
  var history = [];
  var activeId = '';
  var activeKey = '';
  var query = '';
  var marks = {};
  var attachment = null;   // { name, kind, raw, messages, stats, tone }
  var attachGen = 0;       // 每次移除附件都 +1，防止异步读完的文件又把附件"复活"
  var tone = { on: false, scope: 'key' };
  var toneDeleted = {};    // 被用户 × 掉的标注：{ id: 1 }
  var currentCard = null;  // 当前展示的卡片（右栏原文用）
  var composerCollapsed = false;
  var batchEvidence = false;   // 「展开原文」批量操作时，跳过右栏定位
  var refTab = 'full';     // 'full' | 'outline'
  var refOpen = false;

  // ---------- 右栏「原文对照」 ----------

  var REF_STORE = 'msgcard.refCollapsed';

  function refLines() {
    var out = [];

    if (attachment && attachment.messages && attachment.messages.length) {
      attachment.messages.forEach(function (m) {
        out.push({ t: m.timeRaw || m.time || '', w: m.sender || '', c: m.content });
      });
      return { lines: out, fromImport: true };
    }

    var src = (currentCard && currentCard.source) || (el.input ? el.input.value : '');
    if (!src || !String(src).trim()) return { lines: [], fromImport: false };

    String(src).split('\n').forEach(function (ln) {
      var s = ln.trim();
      if (!s) return;
      if (/^【.+】$/.test(s)) {
        out.push({ sec: s.replace(/[【】]/g, '') });
        return;
      }
      var m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+(.+?)：([\s\S]*)$/.exec(s);
      if (m) out.push({ t: m[1].slice(5), w: m[2], c: m[3] });
      else out.push({ t: '', w: '', c: s });
    });
    return { lines: out, fromImport: false };
  }

  function refEmpty(text) {
    var e = document.createElement('div');
    e.className = 'ref-empty';
    e.textContent = text;
    el.refBody.appendChild(e);
  }

  function renderRef() {
    if (!el.refBody) return;
    el.refBody.innerHTML = '';

    if (refTab === 'outline') {
      var blocks = document.querySelectorAll('.result .block');
      if (!blocks.length) {
        refEmpty('提炼一次之后，这里会列出卡片的四个区块，点标题就能跳过去。');
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'ref-outline';
      for (var i = 0; i < blocks.length; i++) {
        (function (block) {
          var h = block.querySelector('h2');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = (h ? h.textContent : '区块') + (block.querySelectorAll('li').length ? '　· ' + block.querySelectorAll('li').length + ' 条' : '');
          btn.addEventListener('click', function () {
            block.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          wrap.appendChild(btn);
        })(blocks[i]);
      }
      el.refBody.appendChild(wrap);
      return;
    }

    var data = refLines();
    if (!data.lines.length) {
      refEmpty('这里会显示本次的原文：粘或拖入聊天记录、或提炼一次之后，点卡片里的「原文」，就会在这里定位到对应那一句。');
      return;
    }

    data.lines.forEach(function (it) {
      if (it.sec) {
        var s = document.createElement('div');
        s.className = 'ref-sec';
        s.textContent = it.sec;
        el.refBody.appendChild(s);
        return;
      }
      var line = document.createElement('div');
      line.className = 'ref-line';
      line.dataset.q = it.c;

      if (it.t) {
        var t = document.createElement('span');
        t.className = 'rt';
        t.textContent = it.t;
        line.appendChild(t);
      }
      if (it.w) {
        var w = document.createElement('span');
        w.className = 'rw';
        w.textContent = it.w;
        line.appendChild(w);
      }
      var c = document.createElement('span');
      c.className = 'rc';
      c.textContent = it.c;
      line.appendChild(c);

      line.addEventListener('click', function () { line.classList.toggle('hit'); });
      el.refBody.appendChild(line);
    });
  }

  function setRefTab(tab) {
    refTab = tab === 'outline' ? 'outline' : 'full';
    if (el.refTabs) {
      var btns = el.refTabs.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-tab') === refTab);
      }
    }
    renderRef();
  }

  function setRefOpen(v) {
    refOpen = !!v;
    if (el.refPane) {
      el.refPane.classList.toggle('open', refOpen);
      el.refPane.setAttribute('aria-hidden', refOpen ? 'false' : 'true');
      document.body.classList.toggle('ref-open', refOpen);
    }
    try { localStorage.setItem(REF_STORE, refOpen ? '1' : '0'); } catch (e) {}
  }

  // 卡片里点开「原文」→ 右栏定位到那一句
  function openRefFor(q) {
    var s = String(q || '').trim();
    if (!s) return;
    if (!el.refPane) return;
    setRefOpen(true);
    setRefTab('full');

    // 容错：空白 + 标点差异都当成同一个句子
    var norm = function (t) {
      return String(t || '')
        .replace(/[\s\u3000]/g, '')
        .replace(/[\u3001\uff0c\u3002\uff1b\uff1a\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f\uff08\uff09()\u3010\u3011\u3014\u3015\u2026\u2014\u00b7,.!?\uff01\uff1f:;"']/g, '');
    };
    var lines = el.refBody.querySelectorAll('.ref-line');
    var target = null;
    for (var i = 0; i < lines.length; i++) {
      if (norm(lines[i].dataset.q).indexOf(norm(s)) >= 0) { target = lines[i]; break; }
    }
    for (var j = 0; j < lines.length; j++) lines[j].classList.remove('hit');

    if (target) {
      target.classList.add('hit');

      // 只给命中的那几个字画波浪线，不再整块高亮
      var rc = target.querySelector('.rc');
      var raw = target.dataset.q || '';
      var at = raw.indexOf(s);
      if (!rc) { /* noop */ } else if (at < 0) {
        rc.textContent = raw;
      } else {
        rc.textContent = '';
        rc.appendChild(document.createTextNode(raw.slice(0, at)));
        var mk = document.createElement('mark');
        mk.className = 'ref-mark';
        mk.textContent = raw.slice(at, at + s.length);
        rc.appendChild(mk);
        rc.appendChild(document.createTextNode(raw.slice(at + s.length)));
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (el.refBody) {
      // 原文里没有这句（模型可能改写了）——别装作定位成功
      var old = el.refBody.querySelector('.ref-nomatch');
      if (old) old.parentNode.removeChild(old);
      var warn = document.createElement('div');
      warn.className = 'ref-nomatch';
      warn.textContent = '这句在原文里没找到原样表述（可能是概括的），下面按内容最近的位置列着。';
      el.refBody.insertBefore(warn, el.refBody.firstChild);
    }
  }

  if (el.refTabs) {
    el.refTabs.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!btn) return;
      setRefTab(btn.getAttribute('data-tab'));
    });
  }

  if (el.refHide) {
    el.refHide.addEventListener('click', function () { setRefOpen(false); });
  }

  if (el.refHandle) {
    el.refHandle.addEventListener('click', function () { setRefOpen(!refOpen); });
  }

  // ---------- 主题 ----------

  function readTheme() {
    var t = '';
    try { t = localStorage.getItem(THEME_KEY) || ''; } catch (e) { t = ''; }
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if (el.themeToggle) el.themeToggle.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  // ---------- Key ----------

  function getKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }

  function saveKey(k) {
    try {
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
      return true;
    } catch (e) {
      return false;
    }
  }

  function renderKeyState() {
    var k = getKey();
    if (!k && KEY_OPTIONAL) {
      el.keyState.textContent = '服务端代填 Key';
      el.keyChip.className = 'key-chip ok';
      el.keyHint.hidden = true;
      if (el.keyPanel) el.keyPanel.hidden = true;
      return;
    }
    if (k) {
      el.keyState.textContent = 'Key 已保存';
      el.keyChip.className = 'key-chip ok';
      el.keyHint.hidden = true;
      el.keyInput.value = '';
      el.keyInput.placeholder = '已保存，粘贴新 Key 可覆盖';
    } else {
      el.keyState.textContent = '未保存 Key';
      el.keyChip.className = 'key-chip';
      el.keyHint.hidden = false;
      el.keyInput.placeholder = 'sk-...';
    }
  }

  // ---------- 勾选状态（已理解 / 做完了） ----------

  function loadMarks() {
    try {
      var raw = localStorage.getItem(MARK_STORE);
      var o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) {
      return {};
    }
  }

  function saveMarks() {
    // 只保留历史里还在的卡片 + 当前卡片，别让本地存储无限长
    var keep = {};
    var keys = [];
    history.forEach(function (r) { if (r.key) keys.push(r.key); });
    if (activeKey) keys.push(activeKey);
    keys.forEach(function (k) { if (marks[k]) keep[k] = marks[k]; });
    marks = keep;
    try { localStorage.setItem(MARK_STORE, JSON.stringify(marks)); } catch (e) {}
  }

  function isMarked(key, kind, idx) {
    var m = marks[key];
    return !!(m && m[kind] && m[kind].indexOf(idx) >= 0);
  }

  function toggleMark(key, kind, idx) {
    if (!marks[key]) marks[key] = {};
    if (!marks[key][kind]) marks[key][kind] = [];
    var arr = marks[key][kind];
    var at = arr.indexOf(idx);
    var now = false;
    if (at >= 0) arr.splice(at, 1);
    else { arr.push(idx); now = true; }
    saveMarks();
    return now;
  }

  function cardKey(card) {
    if (card && card.key) return card.key;
    return 'k' + ((card && card.ts) || Date.now());
  }

  // 历史被清掉之后，别把勾选状态留在本地存储里
  function pruneMarks() {
    var keep = {};
    var alive = {};
    history.forEach(function (r) { if (r.key) alive[r.key] = 1; });
    Object.keys(marks).forEach(function (k) {
      if (alive[k] || k === activeKey) keep[k] = marks[k];
    });
    marks = keep;
  }

  // ---------- 状态条 / toast ----------

  function statusIcon(kind) {
    if (kind === 'loading') return 'spark';
    if (kind === 'error') return 'x';
    if (kind === 'warn') return 'warn';
    if (kind === 'ok') return 'check';
    return 'info';
  }

  function showStatus(msg, kind, detail) {
    el.status.hidden = false;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
    el.status.innerHTML = '';
    el.status.appendChild(icon(statusIcon(kind)));
    var body = document.createElement('div');
    body.style.minWidth = '0';
    var text = document.createElement('div');
    text.textContent = msg;
    body.appendChild(text);
    if (detail) {
      var d = document.createElement('div');
      d.className = 'status detail';
      d.textContent = detail;
      body.appendChild(d);
    }
    el.status.appendChild(body);
  }

  function hideStatus() {
    el.status.hidden = true;
    el.status.className = 'status';
    el.status.innerHTML = '';
  }

  var TOAST_TTL = 3000;
  var TOAST_MAX = 3;   // 同屏最多 3 条，多的从最老的顶掉

  function toast(msg, kind) {
    if (!el.toastBox) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || 'ok');
    t.appendChild(icon(kind === 'error' ? 'x' : kind === 'warn' ? 'warn' : 'check'));
    var s = document.createElement('span');
    s.textContent = msg;
    t.appendChild(s);

    function kill() {
      if (!t.parentNode) return;
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }

    t.addEventListener('click', kill);
    t.title = '点一下关掉';
    el.toastBox.appendChild(t);

    var all = el.toastBox.querySelectorAll('.toast');
    for (var i = 0; i < all.length - TOAST_MAX; i++) {
      if (all[i] !== t && !all[i].classList.contains('out')) {
        all[i].classList.add('out');
        (function (node) {
          setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
        })(all[i]);
      }
    }

    setTimeout(kill, TOAST_TTL);
  }

  // ---------- 字数 / 快捷键 ----------

  function updateCount() {
    el.charCount.textContent = el.input.value.length.toLocaleString('zh-CN') + ' 字';
  }

  el.input.addEventListener('input', function () {
    updateCount();
    if (!el.input.value.trim() || currentCard) return;
    maybeAskRequirement();
    scheduleReqAuto();
  });

  el.input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      resetAll();
    }
  });

  // ---------- 提炼后把输入框收成一行摘要 ----------

  function renderComposerSummary() {
    if (!el.csText) return;
    var parts = [];
    if (attachment && attachment.messages && attachment.messages.length) {
      parts.push('附件 ' + attachment.name);
      parts.push(attachment.messages.length + ' 条消息');
    } else {
      var n = (el.input && el.input.value ? el.input.value.length : 0);
      parts.push('原文 ' + n.toLocaleString('zh-CN') + ' 字');
      var r = document.querySelector('input[name="type"]:checked');
      var lab = r ? ((window.PROMPTS && window.PROMPTS[r.value] && window.PROMPTS[r.value].label) || r.value) : '文本';
      parts.push(lab);
    }
    el.csText.textContent = parts.join(' · ');
  }

  function setComposerCollapsed(v) {
    composerCollapsed = !!v;
    if (el.inputCard) el.inputCard.classList.toggle('collapsed', composerCollapsed);
    if (el.composerSummary) el.composerSummary.hidden = !composerCollapsed;
    if (composerCollapsed) renderComposerSummary();
    anchorPet();
    setTimeout(anchorPet, 260);
  }

  if (el.csExpand) {
    el.csExpand.addEventListener('click', function () {
      setComposerCollapsed(false);
      if (attachment) { el.csExpand.blur(); }
      else if (el.input) el.input.focus();
    });
  }

  function resetAll() {
    setComposerCollapsed(false);
    reqPicked = {};
    reqCustom = '';
    reqConfirmed = false;
    reqDismissed = false;
    clearTimeout(reqAutoTimer);
    setReqOpen(false);
    if (el.reqChips) {
      Array.prototype.forEach.call(el.reqChips.querySelectorAll('button.on'), function (b) {
        b.classList.remove('on');
      });
    }
    if (el.reqInput) el.reqInput.value = '';
    if (el.pet) el.pet.classList.remove('has-ask');
    updateReqHint();
    clearAttachment();      // 附件任何时候都能清掉，不受「提炼中」影响
    if (busy) return;
    currentCard = null;
    el.input.value = '';
    updateCount();
    hideStatus();
    el.result.hidden = true;
    el.result.innerHTML = '';
    activeId = '';
    markActiveHistory();
    syncEmptyState();
    el.input.focus();
  }

  el.clear.addEventListener('click', resetAll);
  if (el.newBtn) el.newBtn.addEventListener('click', resetAll);
  el.run.addEventListener('click', run);
  if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);

  el.keyToggle.addEventListener('click', function () {
    el.keyPanel.hidden = !el.keyPanel.hidden;
    if (!el.keyPanel.hidden) {
      el.keyInput.focus();
      if (getKey()) el.keyInput.value = '';
    }
  });

  el.keySave.addEventListener('click', function () {
    var v = el.keyInput.value.trim();
    if (!v) {
      showStatus('Key 是空的，没东西可存。', 'warn');
      return;
    }
    if (!/^sk-/.test(v)) {
      showStatus('DeepSeek 的 Key 一般以 sk- 开头，你确认一下有没有粘全。', 'warn');
    }
    var ok = saveKey(v);
    el.keyInput.value = '';
    renderKeyState();
    el.keyPanel.hidden = true;
    if (ok) toast('Key 已保存', 'ok');
    showStatus(ok ? 'Key 存好了，可以开始提炼。' : '这个浏览器不让写本地存储（可能是隐私模式），Key 只能这次用。', ok ? 'ok' : 'warn');
  });

  el.keyClear.addEventListener('click', function () {
    saveKey('');
    el.keyInput.value = '';
    renderKeyState();
    hideStatus();
    if (el.keyPanel) el.keyPanel.hidden = true;
    toast('Key 已清除', 'warn');
  });

  // ---------- 样例文本 ----------

  var EXAMPLES = {
    chat: '【活动筹备群】\n' +
      '小鱼：场地确认了，就是上次那个，但是那边催押金 3000，明天下午 5 点前不打就没了\n' +
      '阿泽：收到，我等下打过去\n' +
      '老大：整体先按 2 万以内谈，超了要走流程重新批\n' +
      '小鱼：好的，那我这边方案大概周三能给初稿\n' +
      '老大：小鱼你负责方案，阿泽去问报价——周五之前给我\n' +
      '阿泽：宣传图谁做啊\n' +
      '小鱼：宣传图我还没开始做，有点来不及\n' +
      '老大：先别慌，图的事我看看能不能外包。另外注意，去年那家供应商的账还没结，这次别再用他',
    meeting: '会议主题：Q3 上新节奏\n时间：周三 14:00-15:10\n' +
      '结论：上线日定在 9 月 12 日，不再后推。\n' +
      '分工：阿泽负责渠道排期，本周五前出表；小鱼负责素材，9 月 5 日前给到；运营小周负责预热，9 月 8 日开始。\n' +
      '未决：预算追加 8 万还没批，需要财务下周给答复；海外站点是否同期上线，待定。\n' +
      '风险：素材外包合同还没签，可能卡进度。',
    email: '发件人：采购-李工\n主题：关于 XR-200 报价的第二次催办\n' +
      '你好，上周三发的询价单到现在还没收到正式报价。\n' +
      '我们这边流程要求：报价单必须在 6 月 18 日前盖章回传，否则本季度采购计划顺延到下一季。\n' +
      '另外请一并确认：是否含运费、质保期能否给到 24 个月、付款方式是 30 天还是 60 天。\n' +
      '如果 6 月 15 日前还没收到，我会把这个项目报给采购总监。\n' +
      '谢谢。'
  };

  // ---------- 空状态：样例卡（方案 A）+ 结果骨架预览（方案 C） ----------

  var SAMPLES_HIDDEN_KEY = 'msgcard.samplesHidden';

  function samplesHidden() {
    try { return localStorage.getItem(SAMPLES_HIDDEN_KEY) === '1'; } catch (e) { return false; }
  }

  function setSamplesHidden(v) {
    try { localStorage.setItem(SAMPLES_HIDDEN_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function renderSamplesState() {
    var hidden = samplesHidden();
    if (el.samplesBox) el.samplesBox.hidden = hidden;
    if (el.samplesShow) el.samplesShow.hidden = !hidden;
    if (el.samplesToggle) el.samplesToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }

  // 有结果 / 有附件 / 提炼中 → 收起空状态
  function syncEmptyState() {
    if (!el.emptyState) return;
    var show = el.result.hidden && !attachment;
    el.emptyState.hidden = !show;
  }

  if (el.samplesToggle) {
    el.samplesToggle.addEventListener('click', function () {
      setSamplesHidden(true);
      renderSamplesState();
      toast('样例卡已收起，点「显示样例卡」可以再展开', 'ok');
    });
  }

  if (el.samplesShow) {
    el.samplesShow.addEventListener('click', function () {
      setSamplesHidden(false);
      renderSamplesState();
    });
  }

  if (el.emptyState) {
    el.emptyState.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-example]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-example');
      var text = EXAMPLES[key];
      if (!text) return;
      clearAttachment();
      setComposerCollapsed(false);
      reqDismissed = false;
      el.input.value = text;
      updateCount();
      el.input.focus();
      var radio = document.querySelector('input[name="type"][value="' + (key === 'email' ? 'email' : key === 'meeting' ? 'meeting' : 'chat') + '"]');
      if (radio) radio.checked = true;
      toast('样例已填入，点「一键提炼」试试', 'ok');
    });
  }

  // ---------- 拖拽文件 ----------

  var TEXT_EXT = ['txt', 'text', 'md', 'markdown', 'log', 'json', 'csv', 'tsv', 'srt', 'xml', 'html', 'htm', 'yaml', 'yml'];
  var MAX_BYTES = 2 * 1024 * 1024;
  var dragDepth = 0;
  var internalDrag = false;

  document.addEventListener('dragstart', function () { internalDrag = true; });
  document.addEventListener('dragend', function () { internalDrag = false; });

  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function isTextFile(file) {
    if (!file) return false;
    var t = file.type || '';
    if (/^text\//.test(t)) return true;
    if (/json|csv|xml|yaml/.test(t)) return true;
    return TEXT_EXT.indexOf(extOf(file.name)) >= 0;
  }

  function hasFiles(e) {
    var dt = e && e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) {
      if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  function setDragging(on) {
    if (el.inputCard) el.inputCard.classList.toggle('dragover', !!on);
    if (el.dropOverlay) el.dropOverlay.hidden = !on;
  }

  function decodeBuffer(buf) {
    function byType(enc) {
      try { return new TextDecoder(enc, { fatal: true }).decode(buf); } catch (e) { return null; }
    }
    var s = byType('utf-8');
    if (s === null) s = byType('gbk');
    if (s === null) {
      try { s = new TextDecoder('utf-8').decode(buf); } catch (e) { s = ''; }
    }
    return String(s || '').replace(/^\uFEFF/, '');
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('读不出来（可能被占用）')); };
      fr.onload = function () { resolve(decodeBuffer(fr.result)); };
      fr.readAsArrayBuffer(file);
    });
  }

  function loadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var ok = [];
    var bad = [];

    files.forEach(function (f) {
      if (!f) return;
      if (f.size > MAX_BYTES) { bad.push(f.name + '（超过 2 MB）'); return; }
      if (!isTextFile(f)) { bad.push(f.name + '（不是纯文本）'); return; }
      ok.push(f);
    });

    if (!ok.length) {
      showStatus('拖进来的不是纯文本文件。能读：' + TEXT_EXT.join(' / ') + '；Word / PDF 先另存为 .txt 再拖。',
        'warn', bad.length ? '没载入：' + bad.join('、') : '');
      return;
    }

    showStatus('正在读取 ' + ok.length + ' 个文件…', 'loading');

    var gen = attachGen;   // 读文件期间如果用户点了「移除」，这次结果就丢掉
    var parts = [];
    var chain = Promise.resolve();
    ok.forEach(function (f) {
      chain = chain.then(function () {
        return readFile(f).then(function (t) { parts.push(t); });
      });
    });

    chain.then(function () {
      if (gen !== attachGen) return;   // 附件已被移除，别再塞回来
      var text = parts.join('\n\n').replace(/\r\n?/g, '\n').trim();
      if (!text) {
        showStatus('文件读出来是空的：' + ok.map(function (f) { return f.name; }).join('、'), 'warn');
        return;
      }
      if (ok.length === 1) {
        handleImportedText(ok[0].name, text);
        return;
      }
      insertText(text, ok);
    }).catch(function (err) {
      if (gen !== attachGen) return;
      showStatus('文件读取失败：' + ((err && err.message) || '未知原因'), 'error');
    });
  }

  function insertText(text, files) {
    var t = el.input;
    var cur = t.value;
    var appended = !!(cur && cur.trim());
    t.value = appended ? cur.replace(/\s+$/, '') + '\n\n' + text : text;
    updateCount();
    t.focus();
    if (appended) t.scrollTop = t.scrollHeight;

    var names = files && files.length ? files.map(function (f) { return f.name; }).join('、') : '文本';
    var extra = appended ? '，追加到末尾' : '';
    var note = files && files.length > 1 ? '，多份用空行隔开' : '';
    showStatus('已载入：' + names + '（' + t.value.length.toLocaleString('zh-CN') + ' 字' + extra + note + '），点「一键提炼」开炼。', 'ok');
  }

  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    setDragging(true);
  });

  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!dragDepth) setDragging(true);
  });

  window.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDragging(false);
  });

  window.addEventListener('drop', function (e) {
    var dt = e.dataTransfer;
    if (!dt) return;

    var hasFile = !!(dt.files && dt.files.length);

    // 页内拖选中的文字：交回浏览器，不然同一段会被插两遍
    if (!hasFile && internalDrag) {
      internalDrag = false;
      return;
    }

    e.preventDefault();
    dragDepth = 0;
    setDragging(false);

    if (hasFile) {
      loadFiles(dt.files);
      return;
    }
    var text = '';
    try { text = dt.getData('text/plain') || ''; } catch (err) { text = ''; }
    if (text.trim()) insertText(text.trim(), null);
  });

  // ---------- 导入导出文件（解析成结构化对话） ----------

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function buildKindOptions() {
    var P = window.CHAT_PARSE;
    if (!P || !el.kindSelect) return;
    el.kindSelect.innerHTML = '';
    P.KIND_ORDER.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = P.KIND_LABEL[k] || k;
      el.kindSelect.appendChild(o);
    });
  }

  // ---------- 语气标注（默认关闭，本地规则推断） ----------

  var TONE_STORE = 'msgcard.tone';
  var TONE_DEL_STORE = 'msgcard.toneDeleted';

  function loadTone() {
    try {
      var raw = localStorage.getItem(TONE_STORE);
      if (raw) {
        var o = JSON.parse(raw);
        tone.on = !!o.on;
        tone.scope = o.scope === 'all' ? 'all' : 'key';
      }
    } catch (e) {}
    try {
      var d = localStorage.getItem(TONE_DEL_STORE);
      toneDeleted = d ? (JSON.parse(d) || {}) : {};
    } catch (e) { toneDeleted = {}; }
  }

  function saveTone() {
    try { localStorage.setItem(TONE_STORE, JSON.stringify(tone)); } catch (e) {}
  }

  function saveToneDeleted() {
    try { localStorage.setItem(TONE_DEL_STORE, JSON.stringify(toneDeleted)); } catch (e) {}
  }

  function computeTones() {
    var T = window.TONE;
    if (!attachment || !T) return;
    attachment.tone = T.inferAll(attachment.messages || [], { scope: tone.scope, deleted: toneDeleted });
  }

  function roleTag(sender, role) {
    var span = document.createElement('span');
    span.className = 'role-tag';
    span.title = 'AI 推断，非原文内容';
    span.appendChild(document.createTextNode('（' + role + '）'));

    var id = 'role|' + sender;
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'tone-x';
    x.title = '删掉这个身份标注';
    x.setAttribute('aria-label', '删掉身份标注');
    x.textContent = '×';
    x.addEventListener('click', function (e) {
      e.stopPropagation();
      toneDeleted[id] = 1;
      saveToneDeleted();
      computeTones();
      renderImport();
    });
    span.appendChild(x);
    return span;
  }

  function toneTag(label, id) {
    var span = document.createElement('span');
    span.className = 'tone-tag';
    span.title = 'AI 推断，非原文内容';
    span.appendChild(document.createTextNode('（' + label + '）'));

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'tone-x';
    x.title = '删掉这条语气标注';
    x.setAttribute('aria-label', '删掉语气标注');
    x.textContent = '×';
    x.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!id) return;
      toneDeleted[id] = 1;
      saveToneDeleted();
      computeTones();
      renderImport();
    });
    span.appendChild(x);
    return span;
  }

  function syncToneUI() {
    if (el.toneBox) el.toneBox.hidden = !(attachment && (attachment.messages || []).length);
    if (el.toneToggle) el.toneToggle.setAttribute('aria-pressed', tone.on ? 'true' : 'false');
    if (el.toneScope) {
      el.toneScope.hidden = !tone.on;
      var btns = el.toneScope.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-scope') === tone.scope);
      }
    }
  }

  if (el.toneToggle) {
    el.toneToggle.addEventListener('click', function () {
      tone.on = !tone.on;
      saveTone();
      computeTones();
      syncToneUI();
      renderImport();
      toast(tone.on ? '已打开语气标注（AI 推断，可单条删除）' : '已关闭语气标注（数据还留着）', 'ok');
    });
  }

  if (el.toneScope) {
    el.toneScope.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-scope]') : null;
      if (!btn) return;
      tone.scope = btn.getAttribute('data-scope') === 'all' ? 'all' : 'key';
      saveTone();
      computeTones();
      syncToneUI();
      renderImport();
    });
  }

  function handleImportedText(name, text) {
    var P = window.CHAT_PARSE;
    if (!P) {
      insertText(text, [{ name: name || '文本' }]);
      return;
    }
    var kind = P.detect(name, text);
    if (kind === 'plain') {
      // 认不出 → 按普通长文本处理（和以前一样）
      insertText(text, [{ name: name || '文本' }]);
      return;
    }
    setAttachment(name, kind, text);
    hideStatus();
    var st = attachment.stats || {};
    toast('识别为 ' + P.KIND_LABEL[kind] + ' · ' + (st.count || 0) + ' 条消息' +
      (st.participantsCount ? ' · ' + st.participantsCount + ' 位参与者' : ''), 'ok');
  }

  var typePinned = false;   // 用户手动点过「邮件 / 会议纪要 / 通用」后，就不再自动改

  Array.prototype.forEach.call(document.querySelectorAll('input[name="type"]'), function (radio) {
    radio.addEventListener('change', function () { typePinned = true; });
  });

  function setAttachment(name, kind, raw, opts) {
    attachment = {
      name: String(name || '未命名').trim() || '未命名',
      kind: kind,
      raw: String(raw || '')
    };
    var isChatKind = (kind === 'wechatHtml' || kind === 'wechatCsv' || kind === 'qqTxt' ||
      kind === 'qqMht' || kind === 'wechatTxt' || kind === 'mergedForward');
    if (!typePinned && isChatKind) setType('chat');
    reparseAttachment();
  }

  function setType(v) {
    var radio = document.querySelector('input[name="type"][value="' + v + '"]');
    if (radio) radio.checked = true;
  }

  function reparseAttachment() {
    var P = window.CHAT_PARSE;
    if (!attachment || !P) return;

    var res = P.parse(attachment.raw, attachment.kind);
    attachment.kind = res.kind;
    attachment.messages = res.messages;
    attachment.stats = res.stats;
    attachment.hint = res.hint || '';
    attachment.coverage = (typeof res.coverage === 'number') ? res.coverage : 100;
    attachment.originalCoverage = (typeof res.originalCoverage === 'number') ? res.originalCoverage : attachment.coverage;
    attachment.sourceChars = res.sourceChars || 0;
    attachment.fallbackFrom = res.fallbackFrom || '';

    computeTones();
    hideStatus();
    if (res.hint) showStatus(res.hint, 'warn');
    renderImport(true);
    maybeAskRequirement();
    scheduleReqAuto();
    syncToneUI();

    renderRef();

    // 一条都没解析出来：直接把诊断铺开，方便对着实际格式查
    if (el.diagBox) {
      if (!res.messages.length) {
        el.diagBox.hidden = false;
        refreshDiag();
      } else {
        el.diagBox.hidden = true;
      }
    }

    // 不在这里改「内容类型」：用户手动选过就不再动它（原来每次换解析器都被打回「聊天记录」）
  }

  function clearAttachment(opts) {
    attachGen++;           // 让还在读的异步任务作废
    var rawBack = (opts && opts.restore && attachment) ? attachment.raw : '';
    attachment = null;
    if (el.importCard) el.importCard.hidden = true;
    if (el.importPreviewList) el.importPreviewList.hidden = true;
    if (el.diagBox) el.diagBox.hidden = true;
    if (el.input) el.input.hidden = false;
    if (rawBack && el.input) {
      el.input.value = rawBack;      // 附件期间输入框是隐藏的，回填时直接覆盖，原文不丢
    }
    syncToneUI();
    updateCount();
    syncEmptyState();
    renderRef();
  }

  function renderImport(collapsePreview) {
    var P = window.CHAT_PARSE;
    if (!attachment || !el.importCard) return;
    setTimeout(anchorPet, 60);

    setComposerCollapsed(false);
    el.importCard.hidden = false;
    if (el.input) el.input.hidden = true;
    syncEmptyState();

    el.importName.textContent = attachment.name;
    el.importName.title = attachment.name;

    if (el.kindSelect) el.kindSelect.value = attachment.kind;

    var st = attachment.stats || { text: '没解析出消息', count: 0 };
    el.importStats.textContent = st.text;

    if (el.importNotice) {
      var fb = attachment.fallbackFrom;
      if (fb) {
        el.importNotice.hidden = false;
        el.importNotice.className = 'import-notice warn';
        el.importNotice.textContent = '这段不像聊天记录：按「' +
          ((window.CHAT_PARSE && window.CHAT_PARSE.KIND_LABEL[fb]) || fb) +
          '」只认出了 ' + attachment.originalCoverage + '% 的原文，为了不少内容，已按「通用文本」整段处理（' +
          (attachment.sourceChars || 0).toLocaleString('zh-CN') + ' 字，一个字都没丢）。';
      } else if (attachment.coverage >= 100) {
        el.importNotice.hidden = false;
        el.importNotice.className = 'import-notice ok';
        el.importNotice.textContent = '原文 ' + (attachment.sourceChars || 0).toLocaleString('zh-CN') + ' 字，已全部识别（覆盖 100%）。';
      } else {
        el.importNotice.hidden = false;
        el.importNotice.className = 'import-notice';
        el.importNotice.textContent = '识别覆盖 ' + attachment.coverage + '%（原文 ' +
          (attachment.sourceChars || 0).toLocaleString('zh-CN') + ' 字）。提示里带时间/人名的行才算消息，其余内容会作为上下文一起发给模型。';
      }
    }

    if (el.charCount) {
      el.charCount.textContent = (attachment.messages || []).length.toLocaleString('zh-CN') + ' 条消息';
    }

    // 预览：全部消息、全文，方便逐条对照（语气 / 身份标注只在这里，不进卡片）
    var PREVIEW_MAX = 300;
    var list = attachment.messages || [];
    var toneOn = tone.on;
    var tones = (attachment.tone && attachment.tone.tones) || {};
    var tIds = (attachment.tone && attachment.tone.ids) || {};
    var roles = (attachment.tone && attachment.tone.roles) || {};
    var seenRole = {};

    el.importPreviewList.innerHTML = '';
    list.slice(0, PREVIEW_MAX).forEach(function (m, idx) {
      var li = document.createElement('li');

      var t = document.createElement('span');
      t.className = 'm-time';
      t.textContent = m.timeRaw || m.time || '—';

      var who = document.createElement('span');
      who.className = 'm-who';
      who.textContent = m.sender || '未署名';
      if (toneOn && m.sender && roles[m.sender] && roles[m.sender] !== '未知' && !seenRole[m.sender]) {
        seenRole[m.sender] = 1;
        who.appendChild(roleTag(m.sender, roles[m.sender]));
      }

      var body = document.createElement('span');
      body.className = 'm-text';
      body.textContent = String(m.content || '').replace(/\n/g, ' / ');
      if (toneOn && tones[idx]) body.appendChild(toneTag(tones[idx], tIds[idx]));

      li.appendChild(t);
      li.appendChild(who);
      li.appendChild(body);
      el.importPreviewList.appendChild(li);
    });

    if (list.length > PREVIEW_MAX) {
      var more = document.createElement('li');
      var moreText = document.createElement('span');
      moreText.className = 'm-text';
      moreText.style.color = 'var(--fg-3)';
      moreText.textContent = '…还有 ' + (list.length - PREVIEW_MAX) + ' 条没列出来（提炼时会全部带上，右侧「原文对照」里也是全的）';
      more.appendChild(moreText);
      el.importPreviewList.appendChild(more);
    }

    if (!list.length) {
      el.importStats.textContent = st.text + '（这个解析器没解析出消息，点上面的 chip 换一个试试）';
    }

    syncToneUI();

    if (el.importPreviewToggle) {
      el.importPreviewToggle.textContent = '展开全部 ' + list.length + ' 条原文';
    }

    // 换附件时收起预览；只是切语气开关 / 删标注时保持你当前的展开状态
    if (el.importPreviewToggle) {
      if (collapsePreview) {
        el.importPreviewList.hidden = true;
        el.importPreviewToggle.textContent = '展开看前 10 条';
        el.importPreviewToggle.setAttribute('aria-expanded', 'false');
      } else if (!el.importPreviewList.hidden) {
        el.importPreviewToggle.textContent = '收起预览';
        el.importPreviewToggle.setAttribute('aria-expanded', 'true');
      }
    }
  }

  if (el.kindSelect) {
    buildKindOptions();
    el.kindSelect.addEventListener('change', function () {
      if (!attachment) return;
      attachment.kind = el.kindSelect.value;
      reparseAttachment();
      var P = window.CHAT_PARSE;
      toast('已按 ' + ((P && P.KIND_LABEL[attachment.kind]) || attachment.kind) + ' 重新解析', 'ok');
    });
  }

  if (el.importPreviewToggle) {
    el.importPreviewToggle.addEventListener('click', function () {
      var open = el.importPreviewList.hidden;
      el.importPreviewList.hidden = !open;
      el.importPreviewToggle.textContent = open ? '收起预览' : '展开看前 10 条';
      el.importPreviewToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  if (el.importRemove) {
    el.importRemove.addEventListener('click', function () {
      clearAttachment({ restore: true });
      toast('附件已移除，原文放回输入框了', 'warn');
    });
  }

  if (el.importRemoveBig) {
    el.importRemoveBig.addEventListener('click', function () {
      clearAttachment({ restore: true });
      hideStatus();
      toast('附件已移除，原文放回输入框了', 'warn');
      if (el.input) el.input.focus();
    });
  }

  // Esc 也能移除附件（手滑点不掉时的兜底）
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && petOpen) { setPetOpen(false); return; }
    if (e.key === 'Escape' && refOpen) { setRefOpen(false); return; }
    if (e.key === 'Escape' && attachment) {
      clearAttachment({ restore: true });
      hideStatus();
      toast('附件已移除，原文放回输入框了', 'warn');
    }
  });

  if (el.importConfirm) {
    el.importConfirm.addEventListener('click', function () { run(); });
  }

  // ---------- 格式诊断：把粘贴内容按行分类，方便对着实际格式查 ----------

  var KIND_CN = { header: '头部', inline: '单行条', content: '正文', noise: '外壳', blank: '空行' };

  function buildDiagText() {
    var P = window.CHAT_PARSE;
    if (!P || !attachment) return '';
    var d = P.diagnose(attachment.raw);
    var lines = [];

    lines.push('识别结果：' + P.KIND_LABEL[attachment.kind] + '（' + attachment.kind + '）');
    lines.push('总行数：' + d.total +
      '　头部 ' + d.counts.header +
      '　单行条 ' + d.counts.inline +
      '　外壳 ' + d.counts.noise +
      '　正文 ' + d.counts.content);
    lines.push('解析出消息：' + ((attachment.messages || []).length) + ' 条');
    lines.push('──── 前 24 行分类 ────');
    d.items.forEach(function (it) {
      lines.push(pad2(it.n) + ' [' + KIND_CN[it.kind] + '] ' + it.text);
    });
    return lines.join('\n');
  }

  function refreshDiag() {
    if (!el.diagPanel) return;
    el.diagPanel.textContent = buildDiagText();
  }

  if (el.diagBtn) {
    el.diagBtn.addEventListener('click', function () {
      if (!attachment) return;
      var show = el.diagBox.hidden;
      el.diagBox.hidden = !show;
      if (show) refreshDiag();
    });
  }

  if (el.diagCopy) {
    el.diagCopy.addEventListener('click', function () {
      var text = el.diagPanel ? el.diagPanel.textContent : '';
      if (!text) return;
      copyText(text).then(function (ok) {
        toast(ok ? '诊断文本已复制，可以直接发我' : '浏览器不让复制，手动选一下', ok ? 'ok' : 'warn');
      });
    });
  }

  // 粘贴也能识别（微信「多选→复制」那种）
  // 判断这段粘贴该「转附件」还是「留在输入框」
  function pasteDecision(text) {
    var P = window.CHAT_PARSE;
    var kind = P ? P.detect('', text) : 'plain';
    var probe = (P && kind !== 'plain') ? P.parse(text, kind) : null;
    var msgs = probe ? (probe.messages || []) : [];
    var looksLikeChat = !!probe && probe.kind !== 'plain' && msgs.length >= 2;
    return {
      kind: kind,
      probeKind: probe ? probe.kind : 'plain',
      messages: msgs.length,
      looksLikeChat: looksLikeChat,
      asPlain: !looksLikeChat
    };
  }

  el.input.addEventListener('paste', function (e) {
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var text = cd.getData('text/plain') || '';
    if (!text.trim()) return;

    var P = window.CHAT_PARSE;
    var d = pasteDecision(text);

    if (d.kind === 'mergedForward') {
      // 合并转发卡片壳：一定转附件，这样才能给「双击打开再复制」的提示
      e.preventDefault();
      el.input.value = '';
      updateCount();
      setAttachment('粘贴的聊天记录', d.kind, text);
      return;
    }

    if (!d.looksLikeChat) {
      // 通知 / 公文 / 邮件正文这类：留在输入框里当普通文本，顺便切到「通用文本」（手动选过就不动）
      if (!typePinned) setType('general');
      return;
    }

    e.preventDefault();
    el.input.value = '';
    updateCount();
    reqDismissed = false;
    setAttachment('粘贴的聊天记录', d.kind, text);
    toast('识别为 ' + ((P && P.KIND_LABEL[d.kind]) || d.kind) + '，先看预览再提炼', 'ok');
  });

  // ---------- 主流程 ----------


  function currentType() {
    var r = document.querySelector('input[name="type"]:checked');
    return r ? r.value : 'general';
  }

  function setBusy(v) {
    busy = v;
    el.run.disabled = v;
    if (el.runLabel) el.runLabel.textContent = v ? '提炼中…' : '一键提炼';
    el.run.classList.toggle('is-busy', v);
  }

  function showSkeleton() {
    el.result.hidden = false;
    syncEmptyState();
    el.result.innerHTML = '';

    var card = document.createElement('article');
    card.className = 'card skeleton';
    card.setAttribute('aria-hidden', 'true');

    function row(cls, style) {
      var d = document.createElement('div');
      d.className = 'sk-row' + (cls ? ' ' + cls : '');
      card.appendChild(d);
      return d;
    }

    row('w40');
    row('h20 w90');
    card.appendChild(document.createElement('div')).className = 'sk-gap';
    row('w40');
    row('w90');
    row('w70');
    row('w90');
    card.appendChild(document.createElement('div')).className = 'sk-gap';
    row('w40');
    row('h32 w90');
    row('h32 w90');
    row('h32 w90');

    el.result.appendChild(card);
  }

  // ---------- 提炼前的「还有别的要求吗」 ----------

  var reqPicked = {};       // 勾选中的预设要求
  var reqCustom = '';       // 自己写的要求
  var reqConfirmed = false; // 已经点过「就这些 / 跳过」
  var reqOpen = false;
  var reqDismissed = false;   // 用户手动收起过：同一段原文别再自动弹
  var reqAutoTimer = null;

  function reqList() {
    var out = [];
    Object.keys(reqPicked).forEach(function (k) { if (reqPicked[k]) out.push(k); });
    if (reqCustom.trim()) out.push(reqCustom.trim());
    return out;
  }

  function reqText() {
    return reqList().join('；');
  }

  function updateReqHint() {
    var n = reqList().length;
    if (el.reqHint) el.reqHint.textContent = n ? '已加 ' + n + ' 条要求，会一起发给模型' : '没选也行，直接提炼';
    if (el.runLabel && !busy) {
      el.runLabel.textContent = n ? '一键提炼（带 ' + n + ' 条要求）' : '一键提炼';
    }
  }

  function setReqOpen(v, opts) {
    reqOpen = !!v;
    if (el.reqBar) el.reqBar.hidden = !reqOpen;
    if (el.inputCard) el.inputCard.classList.toggle('req-open', reqOpen);

    if (reqOpen) {
      updateReqHint();
      // 自动展开时不抢光标，打字的人不该被打断
      if (!(opts && opts.noFocus) && !(document.activeElement === el.input)) {
        setTimeout(function () { if (el.reqInput) el.reqInput.focus(); }, 60);
      }
    } else if (opts && opts.userClosed) {
      reqDismissed = true;
    }
    placePetPanel();
  }

  // 输入原文后自动展开要求面板（不打扰：不抢焦点、用户收起后不再弹）
  function scheduleReqAuto() {
    clearTimeout(reqAutoTimer);
    reqAutoTimer = setTimeout(function () {
      if (reqOpen || reqConfirmed || reqDismissed || currentCard || busy) return;
      var len = (el.input && el.input.value ? el.input.value.trim().length : 0);
      if (attachment && attachment.messages && attachment.messages.length) len = Math.max(len, 20);
      if (len < 12) return;          // 太短的不用问
      setReqOpen(true, { noFocus: true });
      if (!petHidden) petBubbleSay('原文够长了，顺手把要求写上？', 3200);
    }, 700);
  }

  function hasSource() {
    if (attachment && attachment.messages && attachment.messages.length) return true;
    return !!(el.input && el.input.value.trim());
  }

  // 有原文、还没结果 → 桌宠来问这句
  function maybeAskRequirement() {
    if (reqConfirmed || reqOpen || currentCard) return;
    if (!hasSource()) return;
    if (!petHidden) {
      petBubbleSay('原文有了，还有别的要求吗？点我说', 6000);
      if (el.pet) el.pet.classList.add('has-ask');
    }
  }

  if (el.reqChips) {
    el.reqChips.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-req]') : null;
      if (!btn) return;
      var req = btn.getAttribute('data-req');
      reqPicked[req] = !reqPicked[req];
      btn.classList.toggle('on', !!reqPicked[req]);
      reqConfirmed = false;
      updateReqHint();
    });
  }

  if (el.reqInput) {
    el.reqInput.addEventListener('input', function () {
      reqCustom = el.reqInput.value;
      reqConfirmed = false;
      updateReqHint();
    });
    el.reqInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); setReqOpen(false); reqConfirmed = true; updateReqHint(); }
    });
  }

  if (el.reqDone) {
    el.reqDone.addEventListener('click', function () {
      reqConfirmed = true;
      setReqOpen(false, { userClosed: true });
      updateReqHint();
      toast(reqText() ? '要求记下了，点提炼就带上' : '没加要求，直接提炼', 'ok');
    });
  }
  if (el.reqClose) el.reqClose.addEventListener('click', function () {
    setReqOpen(false, { userClosed: true });
  });

  async function run() {
    if (busy) return;

    var attach = attachment;
    if (attach && (!attach.messages || !attach.messages.length)) {
      showStatus('这个文件按「' + ((window.CHAT_PARSE && window.CHAT_PARSE.KIND_LABEL[attach.kind]) || attach.kind) +
        '」没解析出消息。点附件上的 chip 换一个解析器，或者把它当普通文本处理。', 'warn');
      return;
    }

    var text = (attach && attach.messages.length)
      ? window.CHAT_PARSE.buildPromptText(attach.messages, attach.stats, todayIso(), {
          toneOn: tone.on,
          tones: (attach.tone && attach.tone.tones) || {},
          roles: (attach.tone && attach.tone.roles) || {}
        })
      : el.input.value.trim();

    if (!text) {
      showStatus('先粘点东西进来，空的炼不出东西。点下面的样例可以先试手感。', 'warn');
      el.input.focus();
      return;
    }

    var key = getKey();
    if (!key && !KEY_OPTIONAL) {
      el.keyPanel.hidden = false;
      el.keyInput.focus();
      showStatus('还没有 Key。点右上角钥匙图标填一个 DeepSeek API Key，填一次就记住。', 'warn');
      return;
    }

    var type = currentType();
    var baseDate = (attach && attach.stats && attach.stats.lastDate) || todayIso();

    setBusy(true);
    activeId = '';
    markActiveHistory();
    hideStatus();
    showSkeleton();

    try {
      var reqNow = reqText();
      var res = await callApi(text, type, key, reqNow);
      var card = normalizeCard(parseModelJson(res.content), baseDate);
      card.type = type;
      card.time = new Date();
      var srcChars = (attach && attach.messages && attach.messages.length)
        ? attach.messages.reduce(function (n, m) { return n + String(m.content || '').length; }, 0)
        : text.length;
      card.chars = srcChars;
      card.preview = attach ? (attach.stats.text || tidyPreview(text)) : tidyPreview(text);
      card.ms = res.ms;
      card.usage = res.usage;
      card.key = 'k' + Date.now() + Math.floor(Math.random() * 1000);
      card.source = text;              // 原文全文，不截断：右侧对照、桌宠、导出都用这一份
      card.sourceFull = text.length;
      card.from = attach ? { name: attach.name, kind: attach.kind } : null;
      card.extra = reqNow || '';

      renderCard(card);
      hideStatus();
      setComposerCollapsed(true);
      pushHistory(card);
      if (el.pet) el.pet.classList.remove('has-ask');
      clearTimeout(reqAutoTimer);
      setReqOpen(false);
      anchorPet();
      petLog = [];
      if (el.petSub) el.petSub.textContent = petSourceLabel();
      if (!petHidden) renderPetLog();
      if (!el.petPanel || el.petPanel.hidden) {
        petBubbleSay('读完了，问我吧', 3200);
      } else {
        renderPetLog();
      }
      toast(attach ? '提炼完成（' + attach.stats.count + ' 条消息）' : '提炼完成', 'ok');
    } catch (err) {
      el.result.hidden = true;
      el.result.innerHTML = '';
      syncEmptyState();
      var msg = (err && err.userMessage) || '出错了，但没拿到具体原因。再点一次试试。';
      showStatus(msg, 'error', (err && err.detail) || '');
      window.__lastErr = err;
      if (window.console) console.error('[鲸汐提炼器]', err);
    } finally {
      setBusy(false);
    }
  }

  // ---------- 调 API ----------

  function networkError(err) {
    if (err && err.userMessage) return err;
    if (err && (/abort/i.test(err.name || '') || /abort/i.test(err.message || ''))) {
      return AppError('等了太久没回应。网络慢的时候会这样，再点一次或换短一点的文本。');
    }
    return AppError('连不上 DeepSeek。可能是断网、被防火墙拦了，或者浏览器挡了跨域请求。检查网络后重试。',
      (err && err.message) ? String(err.message) : '');
  }

  // 统一 POST：返回 { content, usage, finish, ms }
  function postChat(payload, key, timeoutMs) {
    var ctrl = null;
    var timer = null;
    var t0 = nowMs();
    var headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    var opts = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    };

    if (typeof AbortController === 'function') {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    }

    return fetch(API_URL, opts)
      .then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (t) {
            throw AppError(statusMessage(resp.status), extractApiMessage(t));
          });
        }
        return resp.json();
      })
      .then(function (data) {
        var choice = data && data.choices && data.choices[0];
        var content = choice && choice.message && choice.message.content;
        if (!content || !String(content).trim()) {
          throw AppError('模型返回了空内容。可能是这段文本太长被截断了，分两段再试。');
        }
        if (choice.finish_reason === 'length' && window.console) {
          console.warn('[鲸汐提炼器] 输出被 max_tokens 截断，结果可能不完整');
        }
        return {
          content: content,
          usage: (data && data.usage) || null,
          finish: choice.finish_reason || '',
          ms: Math.round(nowMs() - t0)
        };
      })
      .catch(function (err) { throw networkError(err); })
      .then(function (v) {
        if (timer) clearTimeout(timer);
        return v;
      }, function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
  }

  function callApi(text, type, key, extra) {
    var prompts = window.PROMPTS || {};
    var p = prompts[type] || prompts.general;
    if (!p) {
      return Promise.reject(AppError('提示词没加载上（prompts.js 没读到）。刷新页面试试。'));
    }

    var extraText = String(extra || '').trim();
    var sys = p.system;
    var usr = p.user(text);

    if (extraText) {
      sys += '\n\n【用户对这次输出的额外要求】（必须照做；与保真底线冲突时以保真为先，但结构、口吻、取舍按这里来）：\n' + extraText;
      usr += '\n\n【额外要求】\n' + extraText;
    }

    var payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
      stream: false
    };

    return postChat(payload, key, TIMEOUT_MS);
  }

  // 卡片里每条旁边的「问」：只依据原文回答，不许脑补
  // 给模型的原文：超长时明确告诉它只给了前面部分，别假装读全了
  function clipSource(src) {
    var s = String(src || '');
    if (s.length <= SOURCE_KEEP) return { text: s, note: '' };
    return {
      text: s.slice(0, SOURCE_KEEP),
      note: '\n\n【说明】原文共 ' + s.length + ' 字，这里只提供了前 ' + SOURCE_KEEP + ' 字；后半段没有提供，涉及后段内容请说明"我没看到后半段"。'
    };
  }

  function askApi(card, itemText, question) {
    var p = window.ASK_PROMPT;
    if (!p) {
      return Promise.reject(AppError('追问提示词没加载上（prompts.js）。刷新页面试试。'));
    }

    var source = str(card.source);
    if (!source) {
      source = '（这条记录没保存原文，只能按已有摘要回答）\n结论：' + str(card.conclusion) +
        '\n要点：' + (card.points || []).map(function (x) { return x.text; }).join('；');
    }

    var clip = clipSource(source);
    var payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user(clip.text + clip.note, '关于这一条：' + itemText + '\n我的问题：' + question) }
      ],
      temperature: 0.1,
      max_tokens: 700,
      stream: false
    };

    return postChat(payload, getKey(), ASK_TIMEOUT_MS).then(function (r) {
      return String(r.content).trim();
    });
  }


  function extractApiMessage(txt) {
    if (!txt) return '';
    try {
      var j = JSON.parse(txt);
      var m = (j && j.error && (j.error.message || j.error.type)) || (j && j.message) || '';
      return str(m).slice(0, 300);
    } catch (e) {
      return String(txt).slice(0, 300);
    }
  }

  function statusMessage(status) {
    if (status === 400) return '请求被拒（400）。多半是内容太长或参数不对，试试分成两段。';
    if (status === 401) return 'Key 无效或已过期（401）。点右上角钥匙图标换一个。';
    if (status === 402) return '账户余额不足（402）。去 platform.deepseek.com 充一点，或者换个 Key。';
    if (status === 403) return '这个 Key 没有权限（403）。检查一下 Key 是不是别的服务的。';
    if (status === 404) return '接口地址不对（404）。检查一下 prompts.js 或网络代理设置。';
    if (status === 422) return '参数不合法（422）。原文里可能有奇怪的字符，清一下再试。';
    if (status === 429) return '请求太频繁（429）。等十几秒再点，别连击。';
    if (status >= 500) return 'DeepSeek 服务端出问题了（' + status + '）。这不是你的错，等一两分钟再来。';
    return '接口返回异常（' + status + '）。';
  }

  // ---------- 解析 ----------

  function parseModelJson(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/^```(?:json|JSON)?\s*/i, '').replace(/```\s*$/, '').trim();

    var obj = tryParse(s);
    if (!obj) {
      var a = s.indexOf('{');
      var b = s.lastIndexOf('}');
      if (a >= 0 && b > a) obj = tryParse(s.slice(a, b + 1));
    }
    if (!obj) {
      throw AppError('模型返回的不是合法 JSON，没法渲染成卡片。再点一次通常就好。',
        '返回内容前 200 字：' + s.slice(0, 200));
    }
    return obj;
  }

  function tryParse(t) {
    try {
      var o = JSON.parse(t);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) {
      return null;
    }
  }

  function pickText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      return str(v.text || v.point || v.content || v.item || v.summary || v.desc);
    }
    return '';
  }

  function pickEvidence(v) {
    if (!v || typeof v !== 'object') return '';
    return str(v.evidence || v.source || v.quote || v.original || v.origin || v.from);
  }

  var PENDING_RE = /应该|可能|好像|也许|大概|我再问问|我再问一下|问问看|看情况|视情况|不确定|估计|说不准/;

  function normalizeCard(o, baseDate) {
    var P = window.CHAT_PARSE;
    var card = {
      conclusion: '', points: [], todos: [], risks: [], topics: [],
      meta: null,            // 邮件抬头 / 会议信息
      asks: [],              // 邮件：需要你回复的问题
      attachments: [],       // 邮件：提到的附件
      agenda: [],            // 会议：议题与结论
      decisions: [],         // 会议：决议
      pending: [],           // 会议：待决事项
      nextMeeting: '',       // 会议：下次会议
      unanswered: []         // 聊天：问了没人回
    };

    function abs(t) {
      var s = str(t);
      return P ? P.absolutize(s, baseDate) : s;
    }

    card.conclusion = abs(o.conclusion || o.summary || o.one_liner || o['一句话结论']);

    toArray(o.points || o.key_points || o['关键信息']).forEach(function (p) {
      var t = abs(pickText(p));
      if (t) card.points.push({ text: t, evidence: pickEvidence(p) });
    });

    toArray(o.todos || o.todo || o.actions || o['待办事项']).forEach(function (t) {
      if (!t) return;
      if (typeof t === 'string') {
        if (t.trim()) card.todos.push({ owner: '', task: abs(t.trim()), deadline: '' });
        return;
      }
      var task = abs(t.task || t.thing || t.what || t.item || t.text || t['事项']);
      var owner = str(t.owner || t.who || t.assignee || t.person || t['负责人']);
      var deadline = abs(t.deadline || t.due || t.when || t.time || t['截止时间']);
      if (task || owner) {
        card.todos.push({
          owner: owner,
          task: task,
          deadline: deadline,
          quote: str(t.quote || t.original || t['原话']),
          status: str(t.status || t['状态'])
        });
      }
    });

    toArray(o.risks || o.risk || o.conflicts || o['风险与分歧']).forEach(function (r) {
      var t = abs(pickText(r));
      if (t) card.risks.push({ text: t, evidence: pickEvidence(r) });
    });

    // 话题分块（多话题群聊才用）
    toArray(o.topics || o.topic_blocks || o['话题分块']).forEach(function (tp) {
      if (!tp || typeof tp !== 'object') return;
      var title = str(tp.title || tp.name || tp.topic || tp['小标题']);
      var pts = toArray(tp.points || tp.items || tp.bullets || tp['要点']).map(function (p) {
        return { text: abs(pickText(p)), evidence: pickEvidence(p) };
      }).filter(function (p) { return p.text; });
      if (title || pts.length) {
        card.topics.push({ title: title || '未命名话题', points: pts });
      }
    });

    // 邮件 / 会议抬头
    var metaSrc = o.meta || o.header || o.info || {};
    if (metaSrc && typeof metaSrc === 'object') {
      var meta = {};
      Object.keys(metaSrc).forEach(function (k) {
        var v = str(metaSrc[k]);
        if (v) meta[k] = v;
      });
      if (Object.keys(meta).length) card.meta = meta;
    }

    // 邮件：需要回复的问题 + 附件
    toArray(o.asks || o.questions || o['需要回复的问题']).forEach(function (q) {
      if (!q) return;
      var text = abs(typeof q === 'string' ? q : pickText(q));
      if (text) card.asks.push({ question: text, evidence: pickEvidence(q) });
    });
    toArray(o.attachments || o['附件']).forEach(function (x) {
      var t = str(x);
      if (t) card.attachments.push(t);
    });

    // 会议：议题结论 / 决议 / 待决事项 / 下次会议
    toArray(o.agenda || o.topics_decisions || o['议题']).forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var topic = str(it.topic || it.title || it.name || it['议题']);
      var concl = str(it.conclusion || it.result || it['结论']);
      var status = str(it.status || it['状态']);
      if (!topic && !concl) return;
      card.agenda.push({
        topic: topic || '未命名议题',
        status: status || '',
        conclusion: concl,
        evidence: pickEvidence(it)
      });
    });
    toArray(o.decisions || o.resolutions || o['决议']).forEach(function (d) {
      if (!d) return;
      var t = abs(typeof d === 'string' ? d : pickText(d));
      if (t) card.decisions.push({ text: t, evidence: pickEvidence(d) });
    });
    toArray(o.pending || o.open_items || o['待决事项']).forEach(function (it) {
      if (!it) return;
      if (typeof it === 'string') {
        if (it.trim()) card.pending.push({ text: abs(it.trim()), owner: '', when: '' });
        return;
      }
      var t = str(it.text || it.item || it['内容']);
      if (t) {
        card.pending.push({
          text: abs(t),
          owner: str(it.owner || it.who || it['由谁']),
          when: str(it.when || it.next || it['何时'])
        });
      }
    });
    card.nextMeeting = str(o.nextMeeting || o.next_meeting || o['下次会议']);

    // 聊天：问了没人回
    toArray(o.unanswered || o.open_questions || o['悬空']).forEach(function (it) {
      if (!it) return;
      if (typeof it === 'string') {
        if (it.trim()) card.unanswered.push({ by: '', ask: abs(it.trim()), note: '' });
        return;
      }
      var ask = str(it.ask || it.question || it.text || it['问题']);
      if (ask) {
        card.unanswered.push({
          by: str(it.by || it.who || it['谁']),
          ask: abs(ask),
          note: str(it.note || it.status || it['说明'])
        });
      }
    });

    // 「应该 / 可能 / 我再问问」这类 → 标待确认，并把结论下沉到风险
    card.points.forEach(function (p) {
      if (!PENDING_RE.test(p.text) || /^〔待确认〕/.test(p.text)) return;
      var core = p.text;
      p.text = '〔待确认〕' + core;
      var dup = card.risks.some(function (r) { return r.text.indexOf(core) >= 0 || core.indexOf(r.text) >= 0; });
      if (!dup && card.risks.length < 6) {
        card.risks.push({ text: '待确认：' + core, evidence: p.evidence || '' });
      }
    });

    if (!card.conclusion && !card.points.length && !card.todos.length && !card.risks.length &&
        !card.topics.length && !card.asks.length && !card.agenda.length && !card.decisions.length &&
        !card.unanswered.length && !card.pending.length) {
      throw AppError('模型这次啥也没提炼出来（四块全空）。这段可能太短或太碎，再点一次试试。',
        '返回内容前 200 字：' + JSON.stringify(o).slice(0, 200));
    }

    if (!card.conclusion) card.conclusion = '（这段模型没给结论，看下面几块）';

    return card;
  }

  // ---------- 重点标记 ----------

  var MARK_RE = (function () {
    try {
      new RegExp('(?<probe>x)');
    } catch (e) {
      return null;
    }
    return new RegExp(
      '(?<money>[¥￥$]\\s?\\d[\\d,]*(?:\\.\\d+)?|\\d[\\d,]*(?:\\.\\d+)?\\s*(?:万元|万|元|块|美元|欧元))' +
      '|(?<time>(?:今天|明天|后天|大后天|昨天|前天|本周|这周|下周|上周|周末|月底|月初|下个月|下月|周一|周二|周三|周四|周五|周六|周日|周天)' +
        '(?:\\s*(?:上午|下午|晚上|中午|凌晨|早上))?' +
        '(?:\\s*\\d{1,2}\\s*(?:点|时|:)\\s*\\d{0,2}\\s*分?)?' +
        '(?:\\s*(?:之前|以前|前))?' +
        '|\\d{4}\\s*[-/年.]\\s*\\d{1,2}\\s*[-/月.]\\s*\\d{1,2}\\s*日?' +
        '|\\d{1,2}\\s*(?:月|号|日)\\s*(?:\\d{1,2}\\s*(?:号|日))?\\s*(?:之前|前)?' +
        '|\\d{1,2}:\\d{2}(?::\\d{2})?' +
        '|\\d{1,2}\\s*(?:点|时)(?:\\s*\\d{1,2}\\s*分)?\\s*(?:之前|前|半)?)' +
      '|(?<num>\\d[\\d,]*(?:\\.\\d+)?%?)' +
      '|(?<risk>来不及|做不完|没定|未定|待定|再议|待确认|需要确认|风险|逾期|超支|超了|超出|冲突|分歧|催|拖延|卡住|卡在|隐患|不确定|没达成一致|没谈成|缺人|缺口' +
        '|大概|大约|左右|若干|可能|估计|差不多|视情况|看情况|暂定|待核实)',
      'g'
    );

  })();

  function markInto(container, text) {
    var s = str(text);
    if (!s) return container;
    if (!MARK_RE) {
      container.appendChild(document.createTextNode(s));
      return container;
    }

    MARK_RE.lastIndex = 0;
    var last = 0;
    var m;
    while ((m = MARK_RE.exec(s)) !== null) {
      if (!m[0]) { MARK_RE.lastIndex++; continue; }
      if (m.index > last) container.appendChild(document.createTextNode(s.slice(last, m.index)));

      var g = m.groups || {};
      var cls = g.money ? 'hl-money' : g.time ? 'hl-time' : g.risk ? 'hl-risk' : g.num ? 'hl-num' : '';
      if (cls) {
        var sp = document.createElement('span');
        sp.className = cls;
        sp.textContent = m[0];
        container.appendChild(sp);
      } else {
        container.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < s.length) container.appendChild(document.createTextNode(s.slice(last)));
    return container;
  }

  function legendEl() {
    var box = document.createElement('div');
    box.className = 'legend';
    [
      ['lg-hl', '高亮 · 结论'],
      ['lg-wavy', '波浪线 · 需确认'],
      ['lg-double', '双下划线 · 硬信息'],
      ['lg-dotted', '虚线 · 时间节点']
    ].forEach(function (pair) {
      var s = document.createElement('span');
      s.className = 'legend-item ' + pair[0];
      s.textContent = pair[1];
      box.appendChild(s);
    });
    return box;
  }

  // ---------- 渲染 ----------

  function blockEl(cls, title, iconName, no) {
    var sec = document.createElement('section');
    sec.className = 'block ' + cls;
    var h = document.createElement('h2');
    if (no) h.setAttribute('data-no', no);
    h.appendChild(icon(iconName));
    var t = document.createElement('span');
    t.textContent = title;
    h.appendChild(t);
    sec.appendChild(h);
    return sec;
  }

  function evidenceEl(text) {
    var q = str(text);
    if (!q) return null;
    var d = document.createElement('details');
    d.className = 'evidence';
    var s = document.createElement('summary');
    s.textContent = '原文';
    var bq = document.createElement('blockquote');
    bq.textContent = q;
    d.appendChild(s);
    d.appendChild(bq);
    d.addEventListener('toggle', function () {
      if (d.open && !batchEvidence) openRefFor(q);
    });
    return d;
  }

  function noneEl(txt) {
    var p = document.createElement('p');
    p.className = 'none';
    p.textContent = txt;
    return p;
  }

  function badge(text, iconName, extra) {
    var b = document.createElement('span');
    b.className = 'badge' + (extra ? ' ' + extra : '');
    if (iconName) b.appendChild(icon(iconName));
    var s = document.createElement('span');
    s.textContent = text;
    b.appendChild(s);
    return b;
  }

  // ---------- 卡片里每条的交互（打勾 / 问 / 看原文） ----------

  function askPanelEl(card, itemText) {
    var box = document.createElement('div');
    box.className = 'ask-panel';
    box.hidden = true;

    var row = document.createElement('div');
    row.className = 'ask-row';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ask-input';
    input.placeholder = '这条哪里不明白？例如「押金能不能退」';

    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn sm primary';
    send.textContent = '发送';

    row.appendChild(input);
    row.appendChild(send);

    var out = document.createElement('div');
    out.className = 'ask-answer';
    out.hidden = true;

    box.appendChild(row);
    box.appendChild(out);

    function submit() {
      var q = input.value.trim();
      if (!q) {
        input.focus();
        return;
      }
      if (!getKey()) {
        out.hidden = false;
        out.className = 'ask-answer error';
        out.textContent = '还没有 API Key，先点右上角钥匙图标填一个。';
        return;
      }

      out.hidden = false;
      out.className = 'ask-answer loading';
      out.textContent = '正在问…';
      send.disabled = true;

      askApi(card, itemText, q).then(function (ans) {
        out.className = 'ask-answer';
        out.textContent = ans;
      }).catch(function (err) {
        out.className = 'ask-answer error';
        out.textContent = (err && err.userMessage) || '追问失败了，再试一次。';
      }).then(function () {
        send.disabled = false;
      });
    }

    send.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    return box;
  }

  // 一条要点 / 一条风险：前面可打勾（我理解了），后面可看原文、可追问
  function itemEl(card, kind, idx, text, evidence) {
    var li = document.createElement('li');
    li.className = 'item';

    var key = cardKey(card);
    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'check';
    check.title = kind === 'todo' ? '做完了' : '我理解了';
    check.setAttribute('aria-label', check.title);
    var on = isMarked(key, kind, idx);
    check.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) li.classList.add(kind === 'todo' ? 'done' : 'known');

    check.addEventListener('click', function () {
      var now = toggleMark(key, kind, idx);
      check.setAttribute('aria-pressed', now ? 'true' : 'false');
      li.classList.toggle(kind === 'todo' ? 'done' : 'known', now);
      if (typeof card.__sync === 'function') card.__sync();
    });
    li.appendChild(check);

    var body = document.createElement('div');
    body.className = 'item-body';

    var t = document.createElement('div');
    t.className = 'item-text';

    var raw = String(text || '');
    if (/^〔待确认〕/.test(raw)) {
      var pendingTag = document.createElement('span');
      pendingTag.className = 'pending-tag';
      pendingTag.title = '原文只是「应该 / 可能 / 再问问」这类说法，不是定论';
      pendingTag.textContent = '待确认';
      t.appendChild(pendingTag);
      raw = raw.replace(/^〔待确认〕\s*/, '');
    }
    markInto(t, raw);
    body.appendChild(t);

    var actions = document.createElement('div');
    actions.className = 'item-actions';

    var ev = evidenceEl(evidence);
    if (ev) {
      actions.appendChild(ev);
    } else {
      var flag = document.createElement('span');
      flag.className = 'flag-note';
      flag.textContent = '未给原文摘句';
      flag.title = '模型没给出可核对的原文，这条可能是概括过的；点「问」可以追问细节';
      actions.appendChild(flag);
    }

    var askBtn = document.createElement('button');
    askBtn.type = 'button';
    askBtn.className = 'ask-btn';
    askBtn.textContent = '问';
    askBtn.title = '对这一条继续提问（只依据原文回答）';
    actions.appendChild(askBtn);
    body.appendChild(actions);

    var panel = askPanelEl(card, text);
    body.appendChild(panel);

    askBtn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        var inp = panel.querySelector('.ask-input');
        if (inp) inp.focus();
      }
    });

    li.appendChild(body);
    return li;
  }

  // 三种内容类型不是换措辞，而是三种不同的交付物：区块名、表头、额外块都不同
  var TYPE_UI = {
    chat: {
      points: '关键信息', todos: '待办事项', risks: '风险与分歧',
      cols: ['谁', '答应了什么', '截止时间']
    },
    email: {
      points: '邮件要点', todos: '需要处理', risks: '风险与提醒',
      cols: ['谁', '要做什么', '回复期限']
    },
    meeting: {
      points: '议题与结论', todos: '行动项', risks: '风险与分歧',
      cols: ['负责人', '行动项', '截止时间']
    },
    general: {
      points: '关键信息', todos: '待办事项', risks: '风险与分歧',
      cols: ['负责人', '事项', '截止时间']
    }
  };

  // 邮件抬头 / 会议信息：一行小卡，键值对
  function metaStrip(meta, order, labels) {
    if (!meta) return null;
    var keys = (order || []).filter(function (k) { return meta[k]; });
    if (!keys.length) return null;

    var box = document.createElement('div');
    box.className = 'card-meta';
    keys.forEach(function (k) {
      var item = document.createElement('span');
      item.className = 'meta-item';

      var lab = document.createElement('i');
      lab.textContent = (labels && labels[k]) || k;
      item.appendChild(lab);

      var val = document.createElement('b');
      val.textContent = meta[k];
      item.appendChild(val);

      box.appendChild(item);
    });
    return box;
  }

  function plainList(items, cls, icon, no, title, emptyText, card) {
    var sec = blockEl(cls, title, icon, no);
    if (items.length) {
      var ul = document.createElement('ul');
      items.forEach(function (it, i) {
        ul.appendChild(itemEl(card, (cls === 'b-topics' ? 'topic' : 'known'), i, it.text, it.evidence));
      });
      sec.appendChild(ul);
    } else {
      sec.appendChild(noneEl(emptyText || '无'));
    }
    return sec;
  }

  function renderCard(card) {
    card.key = cardKey(card);
    activeKey = card.key;
    currentCard = card;

    var article = document.createElement('article');
    article.className = 'card';

    var typeName = typeLabel(card.type);

    // ── 卡头：标题 + 目录 chips，右侧只留用时和一排工具 ──
    var top = document.createElement('div');
    top.className = 'card-top';

    var title = document.createElement('div');
    title.className = 'card-title';
    title.appendChild(icon('spark'));
    var tlabel = document.createElement('span');
    tlabel.textContent = '提炼结果';
    title.appendChild(tlabel);

    var toc = document.createElement('div');
    toc.className = 'toc';
    title.appendChild(toc);
    top.appendChild(title);

    var badges = document.createElement('div');
    badges.className = 'card-badges';
    if (typeof card.ms === 'number') badges.appendChild(badge((card.ms / 1000).toFixed(1) + ' 秒', 'clock'));

    var infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'mini-btn info-btn';
    infoBtn.textContent = 'ⓘ';
    infoBtn.title = '工程信息与标记说明';
    infoBtn.setAttribute('aria-label', '工程信息与标记说明');
    badges.appendChild(infoBtn);

    var expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'expand-all';
    expandBtn.textContent = '展开原文';
    expandBtn.addEventListener('click', function () {
      var open = expandBtn.getAttribute('data-open') !== '1';
      var items = article.querySelectorAll('.evidence');
      batchEvidence = true;   // 批量展开时不要把右栏拽来拽去
      for (var i = 0; i < items.length; i++) items[i].open = open;
      batchEvidence = false;
      expandBtn.setAttribute('data-open', open ? '1' : '0');
      expandBtn.textContent = open ? '收起原文' : '展开原文';
    });
    badges.appendChild(expandBtn);

    var grayBtn = document.createElement('button');
    grayBtn.type = 'button';
    grayBtn.className = 'mini-btn gray-btn';
    grayBtn.textContent = '灰度自检';
    grayBtn.title = '把卡片转成灰度，验证标记不靠颜色也能分清';
    grayBtn.addEventListener('click', function () {
      var on = article.classList.toggle('gray-check');
      grayBtn.textContent = on ? '回到彩色' : '灰度自检';
    });
    badges.appendChild(grayBtn);

    top.appendChild(badges);
    article.appendChild(top);

    // ⓘ 折叠的工程信息（类型 / 字数 / tokens / 标记说明）
    var info = document.createElement('div');
    info.className = 'card-info';
    info.hidden = true;

    var infoLine = document.createElement('div');
    infoLine.className = 'info-line';
    var bits = [typeName, '原文 ' + (card.chars || 0).toLocaleString('zh-CN') + ' 字（完整保存）'];
    if (card.extra) bits.push('按要求：' + card.extra);
    if (card.usage && card.usage.total_tokens) {
      bits.push('tokens ' + (card.usage.prompt_tokens || 0) + ' 入 / ' + (card.usage.completion_tokens || 0) + ' 出');
    }
    if (card.from && card.from.name) bits.push('来自 ' + card.from.name);
    if (typeof card.ms === 'number') bits.push('用时 ' + (card.ms / 1000).toFixed(1) + ' 秒');
    infoLine.textContent = bits.join('　·　');
    info.appendChild(infoLine);
    info.appendChild(legendEl());
    article.appendChild(info);

    infoBtn.addEventListener('click', function () {
      info.hidden = !info.hidden;
      infoBtn.classList.toggle('on', !info.hidden);
    });

    // 待办完成度
    var doneBadgeText = null;
    if (card.todos && card.todos.length) {
      var doneBadge = badge(card.todos.length + ' 项待办', 'checkList', 'brand');
      doneBadgeText = doneBadge.lastChild;
      badges.appendChild(doneBadge);
    }
    function syncDoneBadge() {
      if (!doneBadgeText) return;
      var total = (card.todos || []).length;
      var done = article.querySelectorAll('.todo-table tr.done').length;
      doneBadgeText.textContent = done ? done + '/' + total + ' 项待办' : total + ' 项待办';
    }
    card.__sync = syncDoneBadge;

    card.unanswered = card.unanswered || [];
    card.asks = card.asks || [];
    card.attachments = card.attachments || [];
    card.agenda = card.agenda || [];
    card.decisions = card.decisions || [];
    card.pending = card.pending || [];
    card.nextMeeting = card.nextMeeting || '';

    var UI = TYPE_UI[card.type] || TYPE_UI.general;
    var noSeq = 0;
    function nextNo() { noSeq += 1; return String(noSeq); }

    // 抬头：邮件 / 会议各有一套
    if (card.type === 'email') {
      var emailStrip = metaStrip(card.meta, ['subject', 'from', 'to', 'cc', 'date'],
        { subject: '主题', from: '发件人', to: '收件人', cc: '抄送', date: '时间' });
      if (emailStrip) article.appendChild(emailStrip);
    } else if (card.type === 'meeting') {
      var meetStrip = metaStrip(card.meta,
        ['title', 'time', 'place', 'host', 'recorder', 'attendees', 'absentees'],
        { title: '会议', time: '时间', place: '地点', host: '主持', recorder: '记录', attendees: '参会', absentees: '缺席' });
      if (meetStrip) article.appendChild(meetStrip);
    }

    // ① 一句话结论
    var c = blockEl('b-conclusion', card.type === 'meeting' ? '会议结论' : '一句话结论', 'target', nextNo());
    var lead = document.createElement('p');
    lead.className = 'lead';
    markInto(lead, card.conclusion);
    c.appendChild(lead);
    article.appendChild(c);

    // ② 关键信息 / 邮件要点 / 议题与结论
    var p = blockEl('b-points', UI.points, 'bulb', nextNo());
    if (card.type === 'meeting' && card.agenda.length) {
      var agUl = document.createElement('ul');
      agUl.className = 'agenda-list';
      card.agenda.forEach(function (it, i) {
        var li = document.createElement('li');
        var head = document.createElement('div');
        head.className = 'agenda-head';

        var tp = document.createElement('b');
        tp.textContent = it.topic;
        head.appendChild(tp);

        if (it.status) {
          var badgeEl = document.createElement('span');
          badgeEl.className = 'agenda-status ' +
            (/已决|同意|通过/.test(it.status) ? 'ok' : /否决|不同意/.test(it.status) ? 'no' : 'pend');
          badgeEl.textContent = it.status;
          head.appendChild(badgeEl);
        }
        li.appendChild(head);

        var body = document.createElement('div');
        body.className = 'agenda-body';
        body.textContent = it.conclusion || '（未给结论）';
        li.appendChild(body);

        if (it.evidence) li.appendChild(evidenceEl(it.evidence));
        agUl.appendChild(li);
      });
      p.appendChild(agUl);
    } else if (card.points.length) {
      var ul = document.createElement('ul');
      card.points.forEach(function (pt, i) {
        ul.appendChild(itemEl(card, 'known', i, pt.text, pt.evidence));
      });
      p.appendChild(ul);
    } else {
      p.appendChild(noneEl('无'));
    }
    article.appendChild(p);

    // ③ 待办事项
    var t = blockEl('b-todos', UI.todos, 'checkList', nextNo());
    if (card.todos.length) {
      t.appendChild(todoTable(card));
    } else {
      t.appendChild(noneEl('无明确待办'));
    }
    article.appendChild(t);

    // ③.5 各类型专属块
    if (card.type === 'chat' && card.unanswered.length) {
      var ub = blockEl('b-unanswered', '没人回 / 悬空', 'question', nextNo());
      var uul = document.createElement('ul');
      uul.className = 'unanswered-list';
      card.unanswered.forEach(function (it) {
        var li = document.createElement('li');

        var line = document.createElement('div');
        line.className = 'un-ask';
        if (it.by) {
          var who = document.createElement('b');
          who.textContent = it.by + '：';
          line.appendChild(who);
        }
        line.appendChild(document.createTextNode(it.ask));
        li.appendChild(line);

        if (it.note) {
          var note = document.createElement('span');
          note.className = 'un-note';
          note.textContent = it.note;
          li.appendChild(note);
        }
        uul.appendChild(li);
      });
      ub.appendChild(uul);
      article.appendChild(ub);
    }

    if (card.type === 'email' && (card.asks.length || card.attachments.length)) {
      var ab = blockEl('b-asks', '需要你回复的问题', 'question', nextNo());
      if (card.asks.length) {
        var aul = document.createElement('ul');
        card.asks.forEach(function (q, i) {
          aul.appendChild(itemEl(card, 'known', i, q.question, q.evidence));
        });
        ab.appendChild(aul);
      } else {
        ab.appendChild(noneEl('没有明确要你回复的问题'));
      }
      if (card.attachments.length) {
        var attLine = document.createElement('div');
        attLine.className = 'attach-line';
        attLine.textContent = '附件：' + card.attachments.join('、');
        ab.appendChild(attLine);
      }
      article.appendChild(ab);
    }

    if (card.type === 'meeting') {
      if (card.decisions.length) {
        var db = blockEl('b-decisions', '决议', 'check', nextNo());
        var dul = document.createElement('ol');
        dul.className = 'decision-list';
        card.decisions.forEach(function (d) {
          var li = document.createElement('li');
          var txt = document.createElement('div');
          txt.textContent = d.text;
          li.appendChild(txt);
          if (d.evidence) li.appendChild(evidenceEl(d.evidence));
          dul.appendChild(li);
        });
        db.appendChild(dul);
        article.appendChild(db);
      }

      if (card.pending.length) {
        var pb = blockEl('b-pending', '待决事项', 'pause', nextNo());
        var pul = document.createElement('ul');
        pul.className = 'pending-list';
        card.pending.forEach(function (it) {
          var li = document.createElement('li');
          var main = document.createElement('div');
          main.textContent = it.text;
          li.appendChild(main);

          var bits = [];
          if (it.owner) bits.push('由 ' + it.owner + '继续确认');
          if (it.when) bits.push(it.when);
          if (bits.length) {
            var s2 = document.createElement('span');
            s2.className = 'pending-note';
            s2.textContent = bits.join('，');
            li.appendChild(s2);
          }
          pul.appendChild(li);
        });
        pb.appendChild(pul);
        article.appendChild(pb);
      }

      if (card.nextMeeting) {
        var nb = document.createElement('div');
        nb.className = 'next-meeting';
        nb.textContent = '下次会议：' + card.nextMeeting;
        article.appendChild(nb);
      }
    }

    // ④ 风险（各类型标题不同）
    var r = blockEl('b-risks', UI.risks, 'alert', nextNo());
    if (card.risks.length) {
      var ul2 = document.createElement('ul');
      card.risks.forEach(function (rk, i) {
        ul2.appendChild(itemEl(card, 'known', i, rk.text, rk.evidence));
      });
      r.appendChild(ul2);
    } else {
      r.appendChild(noneEl('无'));
    }
    article.appendChild(r);

    // ⑤ 话题分块
    if (card.topics && card.topics.length) {
      var tb = blockEl('b-topics', '话题分块', 'hash', nextNo());
      card.topics.forEach(function (tp, ti) {
        var wrap = document.createElement('div');
        wrap.className = 'topic';

        var h3 = document.createElement('h3');
        h3.textContent = tp.title;
        wrap.appendChild(h3);

        var ul3 = document.createElement('ul');
        tp.points.forEach(function (pt, pi) {
          ul3.appendChild(itemEl(card, 'topic', ti * 100 + pi, pt.text, pt.evidence));
        });
        wrap.appendChild(ul3);
        tb.appendChild(wrap);
      });
      article.appendChild(tb);
    }

    // 目录 chips：带数量，点了滚过去并闪一下；空块置灰
    var tocDefs;
    if (card.type === 'meeting') {
      tocDefs = [['b-conclusion', '结论', 1, 'amber']];
      if (card.agenda.length) tocDefs.push(['b-points', '议题', card.agenda.length, 'blue']);
      tocDefs.push(['b-todos', '行动项', card.todos.length, 'green']);
      if (card.decisions.length) tocDefs.push(['b-decisions', '决议', card.decisions.length, 'green']);
      if (card.pending.length) tocDefs.push(['b-pending', '待决', card.pending.length, 'amber']);
      tocDefs.push(['b-risks', '风险', card.risks.length, 'red']);
    } else if (card.type === 'email') {
      tocDefs = [
        ['b-conclusion', '结论', 1, 'amber'],
        ['b-points', '要点', card.points.length, 'blue'],
        ['b-todos', '待办', card.todos.length, 'green']
      ];
      if (card.asks.length) tocDefs.push(['b-asks', '需回复', card.asks.length, 'blue']);
      tocDefs.push(['b-risks', '风险', card.risks.length, 'red']);
    } else {
      tocDefs = [
        ['b-conclusion', '结论', 1, 'amber'],
        ['b-points', '要点', card.points.length, 'blue'],
        ['b-todos', '待办', card.todos.length, 'green']
      ];
      if (card.unanswered.length) tocDefs.push(['b-unanswered', '悬空', card.unanswered.length, 'amber']);
      tocDefs.push(['b-risks', '风险', card.risks.length, 'red']);
      if ((card.topics || []).length) tocDefs.push(['b-topics', '话题', card.topics.length, 'blue']);
    }
    tocDefs.forEach(function (def) {
      if (def[0] === 'b-topics' && !def[2]) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toc-chip tone-' + def[3];
      btn.disabled = def[2] === 0;
      btn.title = def[2] === 0 ? '这一块是空的' : '跳到「' + def[1] + '」';
      var lab = document.createElement('span');
      lab.textContent = def[1];
      var num = document.createElement('span');
      num.className = 'toc-n';
      num.textContent = String(def[2]);
      btn.appendChild(lab);
      btn.appendChild(num);
      btn.addEventListener('click', function () {
        var target = article.querySelector('.' + def[0]);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.remove('flash');
        void target.offsetWidth;
        target.classList.add('flash');
        setTimeout(function () { target.classList.remove('flash'); }, 900);
      });
      toc.appendChild(btn);
    });

    // 页脚
    var foot = document.createElement('div');
    foot.className = 'card-foot';

    var stamp = document.createElement('span');
    stamp.className = 'stamp';
    var when = card.time instanceof Date ? card.time : new Date(card.ts || Date.now());
    var sbits = [typeName, fmtTime(when), '原文 ' + (card.chars || 0).toLocaleString('zh-CN') + ' 字'];
    if (typeof card.ms === 'number') sbits.push('用时 ' + (card.ms / 1000).toFixed(1) + ' 秒');
    if (card.usage && card.usage.total_tokens) {
      sbits.push('tokens ' + (card.usage.prompt_tokens || 0) + ' 入 / ' + (card.usage.completion_tokens || 0) + ' 出');
    }
    stamp.textContent = sbits.join(' · ');
    foot.appendChild(stamp);

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn';
    copyBtn.textContent = '复制卡片';
    copyBtn.addEventListener('click', function () { copyCard(card, copyBtn); });
    foot.appendChild(copyBtn);

    article.appendChild(foot);

    el.result.innerHTML = '';
    el.result.appendChild(article);
    el.result.hidden = false;
    syncEmptyState();
    renderRef();

    if (el.result.scrollIntoView) {
      el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function todoTable(card) {
    var todos = card.todos || [];
    var key = cardKey(card);

    var table = document.createElement('table');
    table.className = 'todo-table';

    var colgroup = document.createElement('colgroup');
    ['c1', 'c2', 'c3'].forEach(function (cn) {
      var col = document.createElement('col');
      col.className = cn;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    var cols = (TYPE_UI[card.type] || TYPE_UI.general).cols;
    cols.forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    todos.forEach(function (td, i) {
      var tr = document.createElement('tr');
      var done = isMarked(key, 'todo', i);
      if (done) tr.className = 'done';

      // 负责人格里带一个「做完了」勾（保持三列表头不变）
      var cOwner = document.createElement('td');
      cOwner.className = 'owner-cell';

      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'check todo-check';
      check.title = done ? '点一下撤销' : '做完了';
      check.setAttribute('aria-label', '做完了');
      check.setAttribute('aria-pressed', done ? 'true' : 'false');
      check.addEventListener('click', function () {
        var now = toggleMark(key, 'todo', i);
        tr.classList.toggle('done', now);
        check.setAttribute('aria-pressed', now ? 'true' : 'false');
        check.title = now ? '点一下撤销' : '做完了';
        if (typeof card.__sync === 'function') card.__sync();
      });
      cOwner.appendChild(check);

      var owner = str(td.owner);
      if (owner) {
        var chip = document.createElement('span');
        chip.className = 'owner-chip';
        chip.textContent = owner;
        cOwner.appendChild(chip);
      } else {
        var dash = document.createElement('span');
        dash.className = 'muted';
        dash.textContent = '—';
        cOwner.appendChild(dash);
      }
      tr.appendChild(cOwner);

      var cTask = document.createElement('td');
      var taskRaw = str(td.task);
      if (taskRaw) {
        var voided = /作废|取消|不做了|不搞了|done\s*no/i.test(taskRaw) || /作废|取消/.test(str(td.deadline));
        if (voided) {
          var old = document.createElement('span');
          old.className = 'is-void';
          old.textContent = taskRaw;
          cTask.appendChild(old);
          var tag = document.createElement('span');
          tag.className = 'void-tag';
          tag.textContent = '已作废';
          cTask.appendChild(tag);
        } else {
          markInto(cTask, taskRaw);
        }
      } else {
        cTask.textContent = '—';
        cTask.className = 'muted';
      }
      if (td.quote) {
        var q = document.createElement('div');
        q.className = 'todo-quote';
        q.textContent = '原话：' + td.quote;
        cTask.appendChild(q);
      }
      tr.appendChild(cTask);

      var cDue = document.createElement('td');
      cDue.className = 'due';
      var dueRaw = str(td.deadline);
      if (!dueRaw || dueRaw === '未定') {
        cDue.className = 'due none-due';
        cDue.textContent = dueRaw || '未定';
      } else {
        markInto(cDue, dueRaw);
      }
      tr.appendChild(cDue);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    return table;
  }


  // ---------- 复制 ----------

  function typeLabel(type) {
    if (window.PROMPTS && window.PROMPTS[type] && window.PROMPTS[type].label) return window.PROMPTS[type].label;
    return '文本';
  }

  function buildPlainText(card) {
    var lines = [];
    var i;

    var UI = TYPE_UI[card.type] || TYPE_UI.general;
    var asks = card.asks || [];
    var unanswered = card.unanswered || [];
    var attachments = card.attachments || [];
    var decisions = card.decisions || [];
    var pending = card.pending || [];
    var agenda = card.agenda || [];

    if (card.type === 'email' && card.meta) {
      ['subject', 'from', 'to', 'cc', 'date'].forEach(function (k) {
        var lab = { subject: '主题', from: '发件人', to: '收件人', cc: '抄送', date: '时间' }[k];
        if (card.meta[k]) lines.push(lab + '：' + card.meta[k]);
      });
      lines.push('');
    }
    if (card.type === 'meeting' && card.meta) {
      ['title', 'time', 'place', 'host', 'recorder', 'attendees', 'absentees'].forEach(function (k) {
        var lab = { title: '会议', time: '时间', place: '地点', host: '主持', recorder: '记录', attendees: '参会', absentees: '缺席' }[k];
        if (card.meta[k]) lines.push(lab + '：' + card.meta[k]);
      });
      lines.push('');
    }

    lines.push((card.type === 'meeting' ? '会议结论：' : '一句话结论：') + card.conclusion);
    lines.push('');

    lines.push(UI.points);
    if (card.type === 'meeting' && agenda.length) {
      for (i = 0; i < agenda.length; i++) {
        var ag = agenda[i];
        lines.push((i + 1) + '. 【' + ag.topic + '】' + (ag.status ? '（' + ag.status + '）' : '') + ag.conclusion);
      }
    } else if (card.points.length) {
      for (i = 0; i < card.points.length; i++) lines.push((i + 1) + '. ' + card.points[i].text);
    } else {
      lines.push('无');
    }
    lines.push('');

    lines.push(UI.todos);
    if (card.todos.length) {
      for (i = 0; i < card.todos.length; i++) {
        var td = card.todos[i];
        var owner = str(td.owner) || '未指定';
        var task = str(td.task) || '（未写事项）';
        var due = str(td.deadline);
        lines.push((i + 1) + '. ' + owner + ' — ' + task + (due ? '（截止：' + due + '）' : '') +
          (td.quote ? '　原话：' + td.quote : '') + (td.status ? '　[' + td.status + ']' : ''));
      }
    } else {
      lines.push('无明确待办');
    }
    lines.push('');

    if (card.type === 'email' && asks.length) {
      lines.push('需要你回复的问题');
      asks.forEach(function (q, k) { lines.push((k + 1) + '. ' + q.question); });
      lines.push('');
      if (attachments.length) {
        lines.push('附件：' + attachments.join('、'));
        lines.push('');
      }
    }

    if (card.type === 'chat' && unanswered.length) {
      lines.push('没人回 / 悬空');
      unanswered.forEach(function (u, k) {
        lines.push((k + 1) + '. ' + (u.by ? u.by + '：' : '') + u.ask + (u.note ? '（' + u.note + '）' : ''));
      });
      lines.push('');
    }

    if (card.type === 'meeting') {
      if (decisions.length) {
        lines.push('决议');
        decisions.forEach(function (d, k) { lines.push((k + 1) + '. ' + d.text); });
        lines.push('');
      }
      if (pending.length) {
        lines.push('待决事项');
        pending.forEach(function (d, k) {
          lines.push((k + 1) + '. ' + d.text +
            (d.owner ? '　由 ' + d.owner + '继续确认' : '') + (d.when ? '　' + d.when : ''));
        });
        lines.push('');
      }
      if (card.nextMeeting) {
        lines.push('下次会议：' + card.nextMeeting);
        lines.push('');
      }
    }

    lines.push(UI.risks);
    if (card.risks.length) {
      for (i = 0; i < card.risks.length; i++) lines.push((i + 1) + '. ' + card.risks[i].text);
    } else {
      lines.push('无');
    }

    lines.push('');
    var when = card.time instanceof Date ? card.time : new Date(card.ts || Date.now());
    lines.push('—— 鲸汐提炼器 · ' + typeLabel(card.type) + ' ' + fmtTime(when));

    return lines.join('\n');
  }

  function copyCard(card, btn) {
    var text = buildPlainText(card);
    copyText(text).then(function (ok) {
      if (ok) {
        toast('已复制到剪贴板', 'ok');
        if (btn) {
          var old = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = old; }, 1600);
        }
      } else {
        manualCopy(text);
      }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }, function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function manualCopy(text) {
    showStatus('浏览器不让自动复制。下面框里已经全选好了，按 Ctrl / ⌘ + C 拷走。', 'warn');
    var ta = document.createElement('textarea');
    ta.className = 'manual-copy';
    ta.value = text;
    ta.rows = Math.min(16, text.split('\n').length + 1);
    el.status.appendChild(ta);
    ta.focus();
    ta.select();
  }

  // ---------- 历史 ----------

  function tidyPreview(text) {
    return String(text).replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (r) {
        return r && typeof r === 'object' && r.conclusion !== undefined;
      }).slice(0, HISTORY_MAX);
    } catch (e) {
      return [];
    }
  }

  function persist(list) {
    var trimmed = list.slice(0, HISTORY_MAX);
    while (trimmed.length) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        return trimmed;
      } catch (e) {
        trimmed = trimmed.slice(0, trimmed.length - 1);
      }
    }
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    return [];
  }

  function pushHistory(card) {
    var rec = {
      id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
      key: card.key || ('k' + Date.now()),
      ts: (card.time instanceof Date ? card.time.getTime() : Date.now()),
      type: card.type,
      chars: card.chars || 0,
      preview: card.preview || '',
      conclusion: card.conclusion,
      points: card.points,
      todos: card.todos,
      risks: card.risks,
      ms: card.ms || 0,
      usage: card.usage || null,
      source: (function (s) {
        var t = String(s || '');
        return t.length > 200000 ? t.slice(0, 200000) : t;
      })(card.source),
      srcCut: String(card.source || '').length > 200000
    };

    history = [rec].concat(history.filter(function (r) { return r.id !== rec.id; }));
    var before = history.length;
    history = persist(history);
    activeId = rec.id;
    if (history.length < before) {
      showStatus('历史存满了（浏览器本地存储装不下），最旧的记录被丢掉了。', 'warn');
    }
    renderHistory();
  }

  function removeHistory(id) {
    history = history.filter(function (r) { return r.id !== id; });
    history = persist(history);
    if (activeId === id) activeId = '';
    renderHistory();
    toast('已删除这条记录', 'warn');
  }

  var HIST_COLLAPSE_KEY = 'msgcard.histCollapsed';
  var histCollapsed = {};

  function loadHistCollapsed() {
    try {
      var raw = localStorage.getItem(HIST_COLLAPSE_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) {
      return {};
    }
  }

  function saveHistCollapsed() {
    try { localStorage.setItem(HIST_COLLAPSE_KEY, JSON.stringify(histCollapsed)); } catch (e) {}
  }

  function groupOf(ts) {
    var d = new Date(ts);
    var now = new Date();
    var d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= d0) return '今天';
    if (ts >= d0 - 86400000) return '昨天';
    if (ts >= d0 - 7 * 86400000) return '本周';
    return '更早';
  }

  function renderHistory() {
    el.historyList.innerHTML = '';
    el.historyCount.textContent = history.length + ' / ' + HISTORY_MAX;
    if (el.histClear) el.histClear.hidden = history.length < HISTORY_MAX;

    var q = query.trim().toLowerCase();
    var list = history.filter(function (r) {
      if (!q) return true;
      var hay = ((r.conclusion || '') + ' ' + (r.preview || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });

    if (!history.length) {
      var empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = '还没有记录';
      el.historyList.appendChild(empty);
      return;
    }

    if (!list.length) {
      var none = document.createElement('li');
      none.className = 'history-empty';
      none.textContent = '没有匹配「' + query.trim() + '」的记录';
      el.historyList.appendChild(none);
      return;
    }

    var currentGroup = '';
    var currentWrap = null;

    list.forEach(function (rec) {
      var g = groupOf(rec.ts);
      if (g !== currentGroup) {
        currentGroup = g;

        var gh = document.createElement('li');
        gh.className = 'history-group' + (histCollapsed[g] ? ' collapsed' : '');

        var gbtn = document.createElement('button');
        gbtn.type = 'button';
        gbtn.className = 'group-toggle';
        gbtn.setAttribute('aria-expanded', histCollapsed[g] ? 'false' : 'true');

        var caret = document.createElement('span');
        caret.className = 'group-caret';
        caret.setAttribute('aria-hidden', 'true');

        var gname = document.createElement('span');
        gname.textContent = g;

        var gcount = document.createElement('span');
        gcount.className = 'group-count';

        gbtn.appendChild(caret);
        gbtn.appendChild(gname);
        gbtn.appendChild(gcount);

        var inner = document.createElement('ul');
        inner.className = 'history-items';

        gbtn.addEventListener('click', function () {
          var nowCollapsed = !gh.classList.contains('collapsed');
          gh.classList.toggle('collapsed', nowCollapsed);
          gbtn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
          histCollapsed[g] = nowCollapsed;
          saveHistCollapsed();
        });

        gh.appendChild(gbtn);
        gh.appendChild(inner);
        el.historyList.appendChild(gh);
        currentWrap = inner;
      }

      // 该组里还剩几条
      var grpCounter = currentWrap.parentNode.querySelector('.group-count');
      grpCounter.textContent = String((parseInt(grpCounter.textContent, 10) || 0) + 1);

      var li = document.createElement('li');
      li.className = 'history-item' + (rec.id === activeId ? ' active' : '');
      li.dataset.id = rec.id;
      li.title = rec.preview || '';

      var main = document.createElement('button');
      main.type = 'button';
      main.className = 'history-main';
      main.addEventListener('click', function () { openHistory(rec); });

      var top = document.createElement('span');
      top.className = 'history-top';
      var time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = fmtTime(new Date(rec.ts));
      var tag = document.createElement('span');
      tag.className = 'history-tag';
      tag.textContent = typeLabel(rec.type);
      top.appendChild(time);
      top.appendChild(tag);
      main.appendChild(top);

      var text = document.createElement('span');
      text.className = 'history-text';
      text.textContent = rec.conclusion || rec.preview || '（无内容）';
      main.appendChild(text);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-del';
      del.title = '删除这条';
      del.setAttribute('aria-label', '删除这条');
      del.textContent = '×';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        removeHistory(rec.id);
      });

      li.appendChild(main);
      li.appendChild(del);
      (currentWrap || el.historyList).appendChild(li);
    });
  }

  function openHistory(rec) {
    activeId = rec.id;
    renderCard({
      key: rec.key || ('k' + rec.ts),
      conclusion: rec.conclusion,
      points: rec.points || [],
      todos: rec.todos || [],
      risks: rec.risks || [],
      type: rec.type,
      chars: rec.chars,
      time: new Date(rec.ts),
      ms: rec.ms || 0,
      usage: rec.usage || null,
      source: rec.source || ''
    });
    hideStatus();
    markActiveHistory();
  }

  function markActiveHistory() {
    var items = el.historyList.querySelectorAll('.history-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].dataset.id === activeId) items[i].classList.add('active');
      else items[i].classList.remove('active');
    }
  }

  if (el.histClear) {
    el.histClear.addEventListener('click', function () {
      if (!history.length) return;
      if (!window.confirm('清空全部 ' + history.length + ' 条历史？（只清本地记录，不影响已复制的卡片）')) return;
      history = [];
      persist(history);
      marks = {};
      try { localStorage.removeItem(MARK_STORE); } catch (e) {}
      activeId = '';
      activeKey = '';
      renderHistory();
      toast('历史已清空', 'warn');
    });
  }

  if (el.searchInput) {
    el.searchInput.addEventListener('input', function () {
      query = el.searchInput.value || '';
      renderHistory();
    });
  }

  // 顶栏滚动时加一条分隔线
  window.addEventListener('scroll', function () {
    if (!el.topbar) return;
    if (window.scrollY > 4) el.topbar.classList.add('stuck');
    else el.topbar.classList.remove('stuck');
  }, { passive: true });

  // ---------- 启动 ----------

  // ---------- 桌宠皮肤 ----------

  var PET_SKIN_STORE = 'skin';
  var PET_SKINS = {
    whale: {
      name: '小鲸汐',
      kind: 'svg',
      vb: '0 0 132 120',
      svg: '' +
        '<ellipse class="pet-shadow" cx="66" cy="110" rx="30" ry="5"></ellipse>' +
        '<g class="pet-tail">' +
        '<path d="M101 79c8-5 12-13 11-21 0-4-5-5-7-2-4 6-5 14-4 23z" fill="#6d8fff"></path>' +
        '<path d="M101 79c8 5 12 13 11 21 0 4-5 5-7 2-4-6-5-14-4-23z" fill="#4a6ff0"></path>' +
        '</g>' +
        '<path d="M32 72c0-18 15-31 34-31s34 13 34 31c0 15-13 26-34 26S32 87 32 72z" fill="#7d9dff"></path>' +
        '<ellipse cx="66" cy="86" rx="23" ry="13" fill="#eaf0ff" opacity=".65"></ellipse>' +
        '<g class="pet-face">' +
        '<g class="pet-eye" data-eye="l"><ellipse cx="54" cy="64" rx="5" ry="5.6" fill="#25324d"></ellipse><circle class="pet-glint" cx="55.8" cy="62" r="1.6" fill="#fff"></circle></g>' +
        '<g class="pet-eye" data-eye="r"><ellipse cx="78" cy="64" rx="5" ry="5.6" fill="#25324d"></ellipse><circle class="pet-glint" cx="79.8" cy="62" r="1.6" fill="#fff"></circle></g>' +
        '<path d="M44 74h8M80 74h8" stroke="#ff9aa8" stroke-width="3.2" stroke-linecap="round" opacity=".75"></path>' +
        '<path d="M62 74c2.4 2.6 5.6 2.6 8 0" stroke="#25324d" stroke-width="2.2" stroke-linecap="round" fill="none"></path>' +
        '</g>' +
        '<g class="pet-headband">' +
        '<path d="M56 38c2-6 8-9 10-4 2 4-3 6-10 4z" fill="#ffd0dc"></path>' +
        '</g>'
    },
    cat: {
      name: '小海猫',
      kind: 'svg',
      vb: '0 0 132 120',
      svg: '' +
        '<ellipse class="pet-shadow" cx="66" cy="110" rx="28" ry="5"></ellipse>' +
        '<g class="pet-tail">' +
        '<path d="M96 90c12 2 18-6 20-16 1-6-6-8-8-2-2 6-6 12-12 18z" fill="#8fa6c8"></path>' +
        '</g>' +
        '<path d="M34 62l-6-26c-1-5 4-8 7-4l16 18z" fill="#a9bdd9"></path>' +
        '<path d="M98 62l6-26c1-5-4-8-7-4L81 50z" fill="#a9bdd9"></path>' +
        '<path d="M34 54l-3-14 10 10z" fill="#ffc9d6"></path>' +
        '<path d="M98 54l3-14-10 10z" fill="#ffc9d6"></path>' +
        '<ellipse cx="66" cy="70" rx="34" ry="30" fill="#c6d5ea"></ellipse>' +
        '<ellipse cx="66" cy="80" rx="24" ry="16" fill="#f2f6fd" opacity=".8"></ellipse>' +
        '<g class="pet-face">' +
        '<g class="pet-eye" data-eye="l"><ellipse cx="54" cy="66" rx="4.6" ry="5.4" fill="#25324d"></ellipse><circle class="pet-glint" cx="55.6" cy="64" r="1.5" fill="#fff"></circle></g>' +
        '<g class="pet-eye" data-eye="r"><ellipse cx="78" cy="66" rx="4.6" ry="5.4" fill="#25324d"></ellipse><circle class="pet-glint" cx="79.6" cy="64" r="1.5" fill="#fff"></circle></g>' +
        '<path d="M62 74l4 3 4-3" stroke="#e08b9c" stroke-width="2.2" stroke-linecap="round" fill="none"></path>' +
        '<path d="M44 74h10M78 74h10" stroke="#8fa6c8" stroke-width="1.4" stroke-linecap="round" opacity=".8"></path>' +
        '</g>'
    },
    jelly: {
      name: '小水母',
      kind: 'svg',
      vb: '0 0 132 120',
      svg: '' +
        '<ellipse class="pet-shadow" cx="66" cy="108" rx="24" ry="4.5"></ellipse>' +
        '<g class="pet-tail">' +
        '<path d="M50 84c-3 9 2 16 8 18-2-7 0-13 4-19" stroke="#9db8f0" stroke-width="4" fill="none" stroke-linecap="round"></path>' +
        '<path d="M66 86c-2 10 3 17 9 20-2-8 0-15 3-21" stroke="#b3c9f5" stroke-width="4" fill="none" stroke-linecap="round"></path>' +
        '<path d="M82 84c-2 8 2 14 7 16-1-6 0-12 3-17" stroke="#9db8f0" stroke-width="4" fill="none" stroke-linecap="round"></path>' +
        '</g>' +
        '<path d="M30 62c0-20 16-34 36-34s36 14 36 34c0 6-4 9-9 9H39c-5 0-9-3-9-9z" fill="#a8c0f5"></path>' +
        '<path d="M36 58c0-16 13-26 30-26s30 10 30 26" fill="#c9d8fb" opacity=".55"></path>' +
        '<g class="pet-face">' +
        '<g class="pet-eye" data-eye="l"><ellipse cx="55" cy="62" rx="4.4" ry="5.2" fill="#25324d"></ellipse><circle class="pet-glint" cx="56.4" cy="60" r="1.5" fill="#fff"></circle></g>' +
        '<g class="pet-eye" data-eye="r"><ellipse cx="77" cy="62" rx="4.4" ry="5.2" fill="#25324d"></ellipse><circle class="pet-glint" cx="78.4" cy="60" r="1.5" fill="#fff"></circle></g>' +
        '<path d="M44 72h8M80 72h8" stroke="#ff9aa8" stroke-width="3" stroke-linecap="round" opacity=".7"></path>' +
        '<path d="M62 72c2 2.4 6 2.4 8 0" stroke="#25324d" stroke-width="2" stroke-linecap="round" fill="none"></path>' +
        '</g>'
    }
  };

  var petSkin = { id: 'whale', custom: null };   // custom: { dataUrl, w, h, name }

  function petDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no-idb'));
      var req = indexedDB.open('jxtl-pet', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function petDBGet(key) {
    return petDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('kv', 'readonly');
        var r = tx.objectStore('kv').get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function petDBPut(key, val) {
    return petDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  var PET_SKIN_LS = 'msgcard.petSkin';

  function petSkinPut(val) {
    try { localStorage.setItem(PET_SKIN_LS, JSON.stringify(val)); } catch (e) {}
    petDBPut(PET_SKIN_STORE, val);
  }

  function petSkinGetLocal() {
    try {
      var raw = localStorage.getItem(PET_SKIN_LS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function petEyes() {
    return el.pet ? Array.prototype.slice.call(el.pet.querySelectorAll('.pet-eye')) : [];
  }

  function applySkin() {
    if (!el.pet) return;

    var custom = petSkin.custom;
    if (custom && custom.dataUrl) {
      if (el.petSvg) el.petSvg.style.display = 'none';
      if (el.petImg) {
        el.petImg.src = custom.dataUrl;
        el.petImg.hidden = false;
      }
      return;
    }

    if (el.petImg) { el.petImg.hidden = true; el.petImg.removeAttribute('src'); }
    if (el.petSvg) {
      var skin = PET_SKINS[petSkin.id] || PET_SKINS.whale;
      el.petSvg.style.display = '';
      el.petSvg.setAttribute('viewBox', skin.vb);
      el.petSvg.innerHTML = skin.svg;
    }
  }

  function setSkin(id, silent) {
    petSkin.id = PET_SKINS[id] ? id : 'whale';
    petSkin.custom = null;
    applySkin();
    savePetPrefs();
    petSkinPut({ id: petSkin.id, kind: 'builtin' });
    if (!silent) petBubbleSay('换成「' + PET_SKINS[petSkin.id].name + '」了', 2000);
    renderSkinPanel();
  }

  function setCustomSkin(file, silent) {
    return new Promise(function (resolve) {
      if (!file) return resolve(false);
      if (!/^image\//.test(file.type)) {
        toast('要图片文件（PNG / JPG / GIF / WebP）', 'warn');
        return resolve(false);
      }
      if (file.size > 3 * 1024 * 1024) {
        toast('图片太大了（上限 3 MB）', 'warn');
        return resolve(false);
      }
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var dataUrl = String(fr.result);
          var isGif = /gif/i.test(file.type);
          // 非动图就等比缩到 512 以内，省空间也省内存
          if (!isGif && Math.max(img.naturalWidth, img.naturalHeight) > 512) {
            var scale = 512 / Math.max(img.naturalWidth, img.naturalHeight);
            var cv = document.createElement('canvas');
            cv.width = Math.round(img.naturalWidth * scale);
            cv.height = Math.round(img.naturalHeight * scale);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            dataUrl = cv.toDataURL('image/png');
          }
          petSkin.custom = { dataUrl: dataUrl, w: img.naturalWidth, h: img.naturalHeight, name: file.name };
          applySkin();
          petSkinPut({ kind: 'custom', dataUrl: petSkin.custom.dataUrl, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
          renderSkinPanel();
          if (!silent) petBubbleSay('新形象收到了，好看吗', 2400);
          resolve(true);
        };
        img.onerror = function () { toast('这张图读不出来，换一张试试', 'warn'); resolve(false); };
        img.src = String(fr.result);
      };
      fr.onerror = function () { toast('读文件失败了', 'warn'); resolve(false); };
      fr.readAsDataURL(file);
    });
  }

  function renderSkinPanel() {
    if (!el.petSkinList) return;
    el.petSkinList.innerHTML = '';

    Object.keys(PET_SKINS).forEach(function (id) {
      var skin = PET_SKINS[id];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'skin-item' + (!petSkin.custom && petSkin.id === id ? ' on' : '');
      b.title = skin.name;

      var box = document.createElement('span');
      box.className = 'skin-thumb';
      box.innerHTML = '<svg viewBox="' + skin.vb + '">' + skin.svg + '</svg>';
      b.appendChild(box);

      var lab = document.createElement('span');
      lab.className = 'skin-name';
      lab.textContent = skin.name;
      b.appendChild(lab);

      b.addEventListener('click', function () { setSkin(id); });
      el.petSkinList.appendChild(b);
    });

    if (petSkin.custom) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'skin-item on';
      c.title = '当前：' + (petSkin.custom.name || '自定义');

      var cbox = document.createElement('span');
      cbox.className = 'skin-thumb';
      var cimg = document.createElement('img');
      cimg.src = petSkin.custom.dataUrl;
      cimg.alt = '';
      cbox.appendChild(cimg);
      c.appendChild(cbox);

      var clab = document.createElement('span');
      clab.className = 'skin-name';
      clab.textContent = '我的';
      c.appendChild(clab);

      c.addEventListener('click', function () { applySkin(); });
      el.petSkinList.appendChild(c);
    }
  }

  function applySkinValue(v) {
    if (!v) return false;
    if (v.kind === 'custom' && v.dataUrl) {
      petSkin.custom = { dataUrl: v.dataUrl, w: v.w, h: v.h, name: v.name };
      return true;
    }
    if (v.id && PET_SKINS[v.id]) {
      petSkin.id = v.id;
      return true;
    }
    return false;
  }

  function loadSkin() {
    // localStorage 同步读一次（file:// 下 IndexedDB 常被浏览器禁掉）
    applySkinValue(petSkinGetLocal());
    applySkin();
    renderSkinPanel();

    return petDBGet(PET_SKIN_STORE).then(function (v) {
      if (v && !petSkin.custom && petSkin.id === 'whale' && applySkinValue(v)) {
        applySkin();
        renderSkinPanel();
      }
    });
  }

  // ---------- 桌宠小工具：把内容落地成文件 ----------

  var PET_EXPORT_MIME = {
    md: 'text/markdown;charset=utf-8',
    txt: 'text/plain;charset=utf-8',
    csv: 'text/csv;charset=utf-8',
    ics: 'text/calendar;charset=utf-8',
    json: 'application/json;charset=utf-8'
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function stampName() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  function saveTextFile(name, text, ext) {
    var mime = PET_EXPORT_MIME[ext] || 'text/plain;charset=utf-8';

    // 优先走「另存为」，能选桌面/任意目录；不支持就退回收下载夹
    if (window.showSaveFilePicker) {
      var pickerPromise;
      try {
        pickerPromise = window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: ext.toUpperCase(), accept: (function () {
            var o = {}; o[mime.split(';')[0]] = ['.' + ext]; return o;
          })() }]
        });
      } catch (e) {
        return Promise.resolve(fallbackDownload(name, text, mime));
      }
      return pickerPromise.then(function (handle) {
        return handle.createWritable().then(function (w) {
          return w.write(new Blob([text], { type: mime })).then(function () { return w.close(); });
        }).then(function () { return 'saved'; });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return 'cancel';
        return fallbackDownload(name, text, mime);
      });
    }
    return Promise.resolve(fallbackDownload(name, text, mime));
  }

  function fallbackDownload(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
    return 'downloaded';
  }

  function mdFromCard(card) {
    var out = [];
    out.push('# 提炼结果 · ' + typeLabel(card.type));
    out.push('');
    out.push('> ' + (card.conclusion || '（无结论）'));
    out.push('');
    out.push('## 关键信息');
    if ((card.points || []).length) {
      card.points.forEach(function (p) { out.push('- ' + p.text + (p.evidence ? '（原文：' + p.evidence + '）' : '')); });
    } else out.push('- 无');
    out.push('');
    out.push('## 待办事项');
    if ((card.todos || []).length) {
      out.push('| 负责人 | 事项 | 截止时间 |');
      out.push('| --- | --- | --- |');
      card.todos.forEach(function (t) {
        out.push('| ' + (t.owner || '—') + ' | ' + t.task + ' | ' + (t.deadline || '—') + ' |');
      });
    } else out.push('无明确待办');
    out.push('');
    out.push('## 风险与分歧');
    if ((card.risks || []).length) {
      card.risks.forEach(function (r) { out.push('- ' + r.text); });
    } else out.push('- 无');
    if ((card.topics || []).length) {
      out.push('');
      out.push('## 话题分块');
      card.topics.forEach(function (tp) {
        out.push('### ' + tp.title);
        (tp.points || []).forEach(function (p) { out.push('- ' + p.text); });
      });
    }
    out.push('');
    out.push('---');
    out.push('由 鲸汐提炼器 生成 · ' + fmtTime(card.time instanceof Date ? card.time : new Date()));
    return out.join('\n');
  }

  function csvFromTodos(card) {
    var rows = [['负责人', '事项', '截止时间', '已完成']];
    (card.todos || []).forEach(function (t) {
      rows.push([t.owner || '', t.task || '', t.deadline || '', t.done ? '是' : '否']);
    });
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  function icsFromTodos(card) {
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//JingXi Distiller//CN',
      'CALSCALE:GREGORIAN'
    ];
    var now = new Date();
    var stamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + 'T' +
      pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + 'Z';

    (card.todos || []).forEach(function (t, i) {
      var m = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(t.deadline || '');
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
      if (m) start = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]), 9, 0, 0);
      var ymd = start.getFullYear() + pad2(start.getMonth() + 1) + pad2(start.getDate());
      lines.push('BEGIN:VEVENT');
      lines.push('UID:jxtl-' + stamp + '-' + i + '@local');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;VALUE=DATE:' + ymd);
      lines.push('SUMMARY:' + (t.task || '待办') + (t.owner ? '（' + t.owner + '）' : ''));
      if (t.deadline) lines.push('DESCRIPTION:' + t.deadline.replace(/\n/g, ' '));
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function qaToMarkdown() {
    var out = ['# 与桌宠的问答记录', ''];
    petLog.forEach(function (m) {
      out.push((m.role === 'me' ? '**我**：' : '**小鲸汐**：') + m.text);
      out.push('');
    });
    return out.join('\n');
  }

  // 「帮我导出/存文件」这类话，本地判断，不花 token
  function petExportIntent(q) {
    var s = String(q || '');

    // 「帮我写一份周报/纪要」这种：不要求出现「导出」，但要明确要一份文档
    if (/(写|整理|起草|生成|汇总|归纳).{0,10}(文档|纪要|周报|日报|通知|邮件|汇报|报告|总结)/.test(s)) {
      return { kind: 'export', target: 'write', format: 'md' };
    }

    var wantsSave = /(导出|保存|存成|存为|存到|存一份|下载|建个文档|建一个文档|创建文档|新建文档|写个文件|生成文件|生成文档|落地|存下来|做成|转成|导成|变成)/.test(s);
    if (!wantsSave) return null;

    var format = /(csv|表格|excel)/i.test(s) ? 'csv'
      : /(日历|ics|日程)/i.test(s) ? 'ics'
        : /(json)/i.test(s) ? 'json'
          : /(txt|纯文本)/i.test(s) ? 'txt'
            : 'md';

    var target = /(问答|聊天记录|对话记录)/.test(s) ? 'qa'
      : /(待办|任务|todo)/i.test(s) ? 'todos'
        : /(原文)/.test(s) ? 'source'
          : /(纪要|周报|通知|邮件|文档|报告)/.test(s) ? 'write'
            : 'card';

    if (format === 'ics' || (target === 'todos' && format === 'md')) target = 'todos';

    return { kind: 'export', target: target, format: format };
  }

  function petRunExport(target, format) {
    var card = currentCard;
    if (target === 'qa') {
      if (!petLog.length) { petLog.push({ role: 'ai', text: '还没聊过，没东西可存。' }); renderPetLog(); return; }
      var nameQa = '桌宠问答-' + stampName() + '.md';
      saveTextFile(nameQa, qaToMarkdown(), 'md').then(function (r) { afterSave(r, nameQa); });
      return;
    }

    if (!card) {
      petLog.push({ role: 'ai', text: '先提炼一次，我才知道要存什么。' });
      renderPetLog();
      return;
    }

    if (target === 'source') {
      var nameSrc = '原文-' + stampName() + '.txt';
      var src = petSource();
      if (!src.trim()) { petLog.push({ role: 'ai', text: '没有原文可存。' }); renderPetLog(); return; }
      saveTextFile(nameSrc, src, 'txt').then(function (r) { afterSave(r, nameSrc); });
      return;
    }

    if (target === 'todos') {
      if (!(card.todos || []).length) {
        petLog.push({ role: 'ai', text: '这张卡片里没有待办，没什么可存的。' });
        renderPetLog();
        return;
      }
      if (format === 'ics') {
        var nameIcs = '待办-' + stampName() + '.ics';
        saveTextFile(nameIcs, icsFromTodos(card), 'ics').then(function (r) { afterSave(r, nameIcs); });
      } else if (format === 'csv') {
        var nameCsv = '待办-' + stampName() + '.csv';
        saveTextFile(nameCsv, csvFromTodos(card), 'csv').then(function (r) { afterSave(r, nameCsv); });
      } else {
        var nameMd = '待办-' + stampName() + '.md';
        var lines = ['# 待办清单', ''];
        (card.todos || []).forEach(function (t) {
          lines.push('- [ ] ' + (t.owner ? t.owner + '：' : '') + t.task + (t.deadline ? '（' + t.deadline + '）' : ''));
        });
        saveTextFile(nameMd, lines.join('\n'), 'md').then(function (r) { afterSave(r, nameMd); });
      }
      return;
    }

    // 整张卡片
    var name = '提炼结果-' + stampName() + '.' + format;
    var body = format === 'json' ? JSON.stringify(card, null, 2) : mdFromCard(card);
    saveTextFile(name, body, format).then(function (r) { afterSave(r, name); });
  }

  function afterSave(result, name) {
    if (result === 'cancel') {
      petLog.push({ role: 'ai', text: '好，那就先不存。' });
    } else if (result === 'downloaded') {
      petLog.push({ role: 'ai', text: '存好了：' + name + '（在浏览器默认的下载文件夹里）。' });
    } else {
      petLog.push({ role: 'ai', text: '存好了：' + name });
    }
    renderPetLog();
  }

  function petWriteDoc(question) {
    var src = petSource();
    if (!src.trim()) {
      petLog.push({ role: 'ai', text: '先把原文给我，我才有东西可写。' });
      renderPetLog();
      return;
    }
    petLog.push({ role: 'me', text: question });
    petBusy = true;
    renderPetLog();

    var payload = {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一个中文写作助手。只使用给定的原文信息，不要编造。输出可以直接使用的 Markdown 正文，不要解释、不要开场白，不要用代码块包裹。'
        },
        { role: 'user', content: '【原文】\n' + clipSource(src).text + clipSource(src).note + '\n\n【要求】\n' + question }
      ],
      temperature: 0.3,
      max_tokens: 1200,
      stream: false
    };

    postChat(payload, getKey(), ASK_TIMEOUT_MS).then(function (r) {
      petBusy = false;
      var doc = String(r.content || '').trim();
      petLog.push({ role: 'ai', text: doc });
      renderPetLog();
      var name = '文档-' + stampName() + '.md';
      saveTextFile(name, doc, 'md').then(function (res) { afterSave(res, name); });
    }).catch(function (err) {
      petBusy = false;
      petLog.push({ role: 'ai', text: (err && err.userMessage) || '写的时候出错了。' });
      renderPetLog();
    });
  }

  // ---------- 桌宠：小鲸汐 ----------

  var PET_STORE = 'msgcard.pet';
  var petHidden = false;
  var petOpen = false;
  var petBusy = false;
  var petDragged = false;
  var petNapping = false;
  var petPos = { left: null, top: null };
  var petLog = [];          // { role: 'me' | 'ai', text }
  var petIdleTimer = null;
  var petBubbleTimer = null;
  var PET_NAP_MS = 90000;

  function loadPetPrefs() {
    try {
      var raw = localStorage.getItem(PET_STORE);
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === 'object') {
        petHidden = !!o.hidden;
        if (typeof o.left === 'number' && typeof o.top === 'number') {
          petPos.left = o.left;
          petPos.top = o.top;
          petPos.userMoved = !!o.userMoved;
        }
      }
    } catch (e) {}
  }

  function savePetPrefs() {
    try {
      localStorage.setItem(PET_STORE, JSON.stringify({
        hidden: petHidden,
        left: petPos.left,
        top: petPos.top,
        userMoved: !!petPos.userMoved
      }));
    } catch (e) {}
  }

  function applyPetPos() {
    if (!el.pet) return;
    if (petPos.left === null || petPos.top === null) {
      el.pet.style.left = '';
      el.pet.style.top = '';
      el.pet.classList.remove('moved');
      return;
    }
    el.pet.classList.add('moved');
    el.pet.style.left = petPos.left + 'px';
    el.pet.style.top = petPos.top + 'px';
    placePetPanel();
  }

  // 默认贴住输入框右侧（用户拖走过就不再抢位置，双击可贴回去）
  // 宽屏时给输入框让出 104px，桌宠站在那儿，不遮挡正文
  function anchorPet() {
    if (!el.pet || !el.inputCard) return;

    if (petPos.userMoved) {
      document.body.classList.remove('pet-anchored');
      return;
    }

    var wide = window.innerWidth >= 1200;
    document.body.classList.toggle('pet-anchored', wide);

    requestAnimationFrame(function () {
      if (!el.pet || !el.inputCard) return;
      var r = el.inputCard.getBoundingClientRect();
      if (!r.width) return;

      var w = el.pet.offsetWidth || 96;
      var left;
      var top;

      if (wide) {
        left = r.right + 12;
        top = r.top + 8;
      } else {
        // 窄屏：贴在输入框右下角内侧，半探出来
        left = Math.max(8, Math.round(r.right - w + 18));
        top = Math.round(r.bottom - w - 4);
      }

      petPos.left = Math.round(left);
      petPos.top = Math.round(top);
      applyPetPos();
      if (el.pet) el.pet.classList.toggle('anchored', wide);
      placePetPanel();
    });
  }

  function clampPet(left, top) {
    var w = 96, h = 96;
    var maxL = Math.max(8, window.innerWidth - w - 8);
    var maxT = Math.max(8, window.innerHeight - h - 8);
    return {
      left: Math.min(Math.max(8, left), maxL),
      top: Math.min(Math.max(8, top), maxT)
    };
  }

  function placePetPanel() {
    if (!el.petPanel || !el.pet) return;
    var r = el.pet.getBoundingClientRect();
    var pw = 330, ph = 300;
    var left = r.right - pw;
    if (left < 12) left = 12;
    if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
    var top = r.top - ph - 12;
    if (top < 68) top = r.bottom + 12;
    el.petPanel.style.left = Math.round(left) + 'px';
    el.petPanel.style.top = Math.round(Math.min(top, window.innerHeight - ph - 12)) + 'px';
    el.petPanel.style.right = 'auto';
    el.petPanel.style.bottom = 'auto';
  }

  function petBubbleSay(text, ms) {
    if (!el.petBubble) return;
    el.petBubble.textContent = text;
    el.petBubble.hidden = false;
    el.petBubble.classList.add('in');
    clearTimeout(petBubbleTimer);
    petBubbleTimer = setTimeout(function () {
      el.petBubble.classList.remove('in');
      setTimeout(function () { el.petBubble.hidden = true; }, 200);
    }, ms || 3500);
  }

  function wakePet() {
    if (petNapping) {
      petNapping = false;
      if (el.pet) el.pet.classList.remove('nap');
    }
    clearTimeout(petIdleTimer);
    petIdleTimer = setTimeout(function () {
      if (petOpen || petBusy || petHidden) return;
      petNapping = true;
      if (el.pet) el.pet.classList.add('nap');
      petBubbleSay('…呼。困了就戳我一下', 2600);
    }, PET_NAP_MS);
  }

  function setPetHidden(v) {
    petHidden = !!v;
    if (el.petLayer) el.petLayer.classList.toggle('hidden', petHidden);
    if (el.petToggle) el.petToggle.setAttribute('aria-pressed', petHidden ? 'false' : 'true');
    if (petHidden && petOpen) setPetOpen(false);
    savePetPrefs();
    if (!petHidden) {
      applyPetPos();
      wakePet();
    }
  }

  function petSource() {
    if (currentCard && currentCard.source) return String(currentCard.source);
    if (attachment && attachment.messages && attachment.messages.length) {
      return attachment.messages.map(function (m) {
        return (m.timeRaw || '') + ' ' + (m.sender || '') + '：' + m.content;
      }).join('\n');
    }
    return el.input ? String(el.input.value || '') : '';
  }

  function petSourceLabel() {
    var src = petSource();
    var n = src.replace(/\s/g, '').length;
    if (!n) return '还没读到原文';
    var parts = ['原文 ' + n.toLocaleString('zh-CN') + ' 字'];
    if (attachment && attachment.messages && attachment.messages.length) {
      parts.push(attachment.messages.length + ' 条');
    }
    return parts.join(' · ');
  }

  function renderPetLog() {
    if (!el.petLog) return;
    el.petLog.innerHTML = '';

    if (!petLog.length && !petBusy) {
      var hi = document.createElement('div');
      hi.className = 'pet-msg ai';
      hi.textContent = petSource().trim()
        ? '我读完了。问我谁要干什么、时间、金额、还差什么，都行。'
        : '先粘一段原文或者拖个文件进来，我读完再回答你。';
      el.petLog.appendChild(hi);
      return;
    }

    petLog.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'pet-msg ' + (m.role === 'me' ? 'me' : 'ai');
      d.textContent = m.text;
      el.petLog.appendChild(d);
    });

    if (petBusy) {
      var t = document.createElement('div');
      t.className = 'pet-msg ai typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      el.petLog.appendChild(t);
    }

    el.petLog.scrollTop = el.petLog.scrollHeight;
  }

  function setPetOpen(v) {
    petOpen = !!v;
    if (!el.petPanel) return;
    el.petPanel.hidden = !petOpen;
    if (petOpen) {
      if (el.petSub) el.petSub.textContent = petSourceLabel();
      placePetPanel();
      renderPetLog();
      wakePet();
      setTimeout(function () { if (el.petInput) el.petInput.focus(); }, 60);
    }
  }

  function petAsk(q) {
    var text = String(q || '').trim();
    if (!text) return;

    // 先看这是不是「存文件 / 写文档」这类本地活儿，能本地办就不花 token
    var exp = petExportIntent(text);
    if (exp) {
      if (exp.target === 'write') {
        petWriteDoc(text);
      } else {
        petLog.push({ role: 'me', text: text });
        petRunExport(exp.target, exp.format);
      }
      return;
    }

    var src = petSource();
    if (!src.trim()) {
      petLog.push({ role: 'me', text: text });
      petLog.push({ role: 'ai', text: '我手上还没有原文。先把聊天记录粘进左边输入框（或者拖个文件进来），我读一遍再回答。' });
      renderPetLog();
      return;
    }
    if (!getKey() && !KEY_OPTIONAL) {
      petLog.push({ role: 'me', text: text });
      petLog.push({ role: 'ai', text: '还没填 API Key，我问不了。右上角钥匙图标填一个。' });
      renderPetLog();
      return;
    }

    var p = window.ASK_PROMPT;
    if (!p) {
      petLog.push({ role: 'me', text: text });
      petLog.push({ role: 'ai', text: '追问提示词没加载上（prompts.js），刷新一下页面。' });
      renderPetLog();
      return;
    }

    petLog.push({ role: 'me', text: text });
    petBusy = true;
    renderPetLog();
    wakePet();

    var payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: p.system },
        {
          role: 'user',
          content: p.user(
            clipSource(src).text + clipSource(src).note,
            '我是桌宠小鲸汐，老大在核对这段原文。\n我的问题：' + text
          )
        }
      ],
      temperature: 0.15,
      max_tokens: 700,
      stream: false
    };

    postChat(payload, getKey(), ASK_TIMEOUT_MS).then(function (r) {
      petBusy = false;
      var ans = String(r.content || '').trim();
      petLog.push({ role: 'ai', text: ans || '（这次没答上来，再问一次试试）' });
      renderPetLog();
    }).catch(function (err) {
      petBusy = false;
      petLog.push({ role: 'ai', text: (err && err.userMessage) || '问的时候出错了，再试一次。' });
      renderPetLog();
    });
  }

  // 拖拽 + 点击
  (function bindPet() {
    if (!el.pet) return;

    var drag = null;
    var lastPointerTs = 0;

    el.pet.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var r = el.pet.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, moved: false };
      el.pet.setPointerCapture && el.pet.setPointerCapture(e.pointerId);
      el.pet.classList.add('dragging');
    });

    el.pet.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx;
      var dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      var pos = clampPet(drag.left + dx, drag.top + dy);
      petPos.left = pos.left;
      petPos.top = pos.top;
      applyPetPos();
    });

    el.pet.addEventListener('pointerup', function (e) {
      if (!drag) return;
      el.pet.classList.remove('dragging');
      var moved = drag.moved;
      drag = null;
      if (moved) {
        petPos.userMoved = true;
        savePetPrefs();
        placePetPanel();
      } else {
        lastPointerTs = Date.now();
        if (!currentCard && hasSource() && !reqConfirmed) {
          var willOpen = !reqOpen;
          setReqOpen(willOpen);
          if (el.pet) el.pet.classList.remove('has-ask');
          if (willOpen) petBubbleSay('要求写这儿，会一起发给模型', 3000);
          return;
        }
        setPetOpen(!petOpen);
        if (!petOpen) petBubbleSay('有事戳我', 1600);
      }
      wakePet();
    });

    el.pet.addEventListener('dblclick', function () {
      petPos.userMoved = false;
      savePetPrefs();
      anchorPet();
      petBubbleSay('贴回输入框旁边了', 1800);
    });

    // 键盘激活（Enter / 空格 / 程序触发）走 click，别和指针重复切换
    el.pet.addEventListener('click', function () {
      if (Date.now() - lastPointerTs < 900) return;
      if (!currentCard && hasSource() && !reqConfirmed) {
        setReqOpen(!reqOpen);
        if (el.pet) el.pet.classList.remove('has-ask');
        wakePet();
        return;
      }
      setPetOpen(!petOpen);
      wakePet();
    });

    el.pet.addEventListener('pointercancel', function () {
      if (!drag) return;
      drag = null;
      el.pet.classList.remove('dragging');
    });

    if (el.petToggle) {
      el.petToggle.addEventListener('click', function () {
        setPetHidden(!petHidden);
        if (!petHidden) petBubbleSay('我回来了', 1800);
      });
    }

    if (el.petClose) el.petClose.addEventListener('click', function () { setPetOpen(false); });
    if (el.petHide) el.petHide.addEventListener('click', function () {
      setPetHidden(true);
      toast('桌宠收起来了，顶栏的小鲸鱼能叫回来', 'ok');
    });

    if (el.petAskForm) {
      el.petAskForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = el.petInput ? el.petInput.value : '';
        if (el.petInput) el.petInput.value = '';
        petAsk(q);
      });
    }

    // 眼睛跟着指针转（一点点就够）
    var raf = 0;
    document.addEventListener('mousemove', function (e) {
      if (petHidden || petNapping) return;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!el.pet) return;
        var eyes = petEyes();
        if (!eyes.length) return;
        var r = el.pet.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = (e.clientX - cx) / 90;
        var dy = (e.clientY - cy) / 90;
        var mx = Math.max(-1.6, Math.min(1.6, dx));
        var my = Math.max(-1.2, Math.min(1.2, dy));
        var tf = 'translate(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px)';
        for (var k = 0; k < eyes.length; k++) eyes[k].style.transform = tf;
        wakePet();
      });
    }, { passive: true });

    document.addEventListener('keydown', function () { wakePet(); }, true);

    window.addEventListener('scroll', function () {
      if (petPos.userMoved) return;
      anchorPet();
    }, { passive: true });

    window.addEventListener('resize', function () {
      if (!petPos.userMoved) anchorPet();
      if (petPos.left !== null) {
        var pos = clampPet(petPos.left, petPos.top);
        petPos.left = pos.left;
        petPos.top = pos.top;
        applyPetPos();
      }
      placePetPanel();
    });
  })();

  // 桌宠：皮肤面板按钮 / 工具按钮 / 拖图换形象
  (function bindPetExtras() {
    function openSkinPanel(v) {
      if (!el.petSkinPanel) return;
      el.petSkinPanel.hidden = !v;
      if (v) {
        renderSkinPanel();
        if (el.petSkinPanel.scrollIntoView) el.petSkinPanel.scrollIntoView({ block: 'nearest' });
      }
    }

    if (el.petSkinBtn) {
      el.petSkinBtn.addEventListener('click', function () { openSkinPanel(el.petSkinPanel.hidden); });
    }
    if (el.petSkinClose) {
      el.petSkinClose.addEventListener('click', function () { openSkinPanel(false); });
    }
    if (el.petSkinUpload && el.petSkinFile) {
      el.petSkinUpload.addEventListener('click', function () { el.petSkinFile.click(); });
      el.petSkinFile.addEventListener('change', function () {
        var f = el.petSkinFile.files && el.petSkinFile.files[0];
        setCustomSkin(f).then(function () { el.petSkinFile.value = ''; });
      });
    }
    if (el.petSkinReset) {
      el.petSkinReset.addEventListener('click', function () {
        petSkin.custom = null;
        setSkin('whale');
        petSkinPut({ id: 'whale', kind: 'builtin' });
        toast('形象恢复成小鲸汐', 'ok');
      });
    }

    // 工具按钮：直接导出，不用打字
    if (el.petTools) {
      el.petTools.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-tool]') : null;
        if (!btn) return;
        var kind = btn.getAttribute('data-tool');
        if (!petOpen) setPetOpen(true);
        if (kind === 'md') { petRunExport('card', 'md'); return; }
        if (kind === 'csv') { petRunExport('todos', 'csv'); return; }
        if (kind === 'ics') { petRunExport('todos', 'ics'); return; }
        if (kind === 'txt') { petRunExport('source', 'txt'); return; }
      });
    }

    // 把图片拖到桌宠身上 = 换形象
    if (el.pet) {
      el.pet.addEventListener('dragover', function (e) {
        if (!e.dataTransfer) return;
        var types = e.dataTransfer.types || [];
        if (Array.prototype.indexOf.call(types, 'Files') < 0) return;
        e.preventDefault();
        el.pet.classList.add('drop-hint');
      });
      el.pet.addEventListener('dragleave', function () { el.pet.classList.remove('drop-hint'); });
      el.pet.addEventListener('drop', function (e) {
        el.pet.classList.remove('drop-hint');
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
        e.preventDefault();
        e.stopPropagation();
        setCustomSkin(e.dataTransfer.files[0]).then(function (ok) {
          if (ok) toast('形象换好了', 'ok');
        });
      });
      // 粘贴图片（Ctrl+V 时如果焦点不在输入框）
      document.addEventListener('paste', function (e) {
        if (petHidden) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image/') === 0) {
            var f = items[i].getAsFile();
            if (f) { setCustomSkin(f); }
            break;
          }
        }
      });
    }
  })();

  // ---------- PWA：注册 Service Worker + 安装提示 ----------

  var deferredInstall = null;

  function initPwa() {
    var isHttp = /^https?:$/.test(location.protocol);

    if (el.installBtn) {
      el.installBtn.addEventListener('click', function () {
        if (!deferredInstall) {
          toast('这个浏览器不弹安装框：用 Chrome/Edge 地址栏右侧的「安装」图标，或菜单里选「安装应用」', 'warn');
          return;
        }
        deferredInstall.prompt();
        deferredInstall.userChoice.then(function (r) {
          if (r && r.outcome === 'accepted') toast('装好了，桌面/开始菜单里能找到', 'ok');
          deferredInstall = null;
          el.installBtn.hidden = true;
        });
      });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      if (el.installBtn) el.installBtn.hidden = false;
      if (!petHidden) petBubbleSay('可以把我装成 App，离线也能用', 4200);
    });

    window.addEventListener('appinstalled', function () {
      deferredInstall = null;
      if (el.installBtn) el.installBtn.hidden = true;
      toast('已安装成 App', 'ok');
    });

    if (isHttp) {
      // file:// 下加载 manifest 会被 CORS 拦（控制台噪音），所以只在 http(s) 时挂上
      if (!document.querySelector('link[rel=manifest]')) {
        var link = document.createElement('link');
        link.rel = 'manifest';
        link.href = 'manifest.webmanifest';
        document.head.appendChild(link);
      }
    }

    if ('serviceWorker' in navigator && isHttp) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* file:// 或隐私模式会失败，忽略 */ });
    }
  }

  initPwa();

  applyTheme(readTheme());
  loadTone();
  history = loadHistory();
  histCollapsed = loadHistCollapsed();
  marks = loadMarks();
  pruneMarks();
  renderHistory();
  renderKeyState();
  loadPetPrefs();
  loadSkin();
  applyPetPos();
  anchorPet();
  setTimeout(anchorPet, 300);
  setPetHidden(petHidden);
  wakePet();
  renderSamplesState();
  try { refOpen = localStorage.getItem(REF_STORE) === '1'; } catch (e) { refOpen = false; }
  setRefOpen(refOpen);
  setRefTab('full');
  syncToneUI();
  syncEmptyState();
  updateCount();
  if (!getKey()) el.keyPanel.hidden = false;

  window.__jxtlPet = {
    state: function () {
      return {
        hidden: petHidden,
        open: petOpen,
        busy: petBusy,
        napping: petNapping,
        left: petPos.left,
        top: petPos.top,
        log: petLog.slice()
      };
    },
    open: function () { setPetOpen(true); },
    close: function () { setPetOpen(false); },
    hide: function (v) { setPetHidden(v); },
    nap: function () { petNapping = true; if (el.pet) el.pet.classList.add('nap'); },
    bubble: function (t, ms) { petBubbleSay(t, ms); },
    ask: function (q) { petAsk(q); },
    source: function () { return petSource(); },
    skin: function () { return { id: petSkin.id, custom: petSkin.custom ? petSkin.custom.name : null }; },
    setSkin: function (id) { setSkin(id, true); },
    uploadSkin: function (dataUrl, name) {
      petSkin.custom = { dataUrl: dataUrl, w: 64, h: 64, name: name || 'test.png' };
      applySkin();
      petSkinPut({ kind: 'custom', dataUrl: dataUrl, w: 64, h: 64, name: name || 'test.png' });
      renderSkinPanel();
    },
    exportCard: function (fmt) { petRunExport('card', fmt || 'md'); },
    exportTodos: function (fmt) { petRunExport('todos', fmt || 'csv'); },
    exportSource: function () { petRunExport('source', 'txt'); },
    intent: function (q) { return petExportIntent(q); }
  };

  window.__jxtl = {
    pasteDecision: function (t) { return pasteDecision(t); },
    req: function () { return { picked: Object.keys(reqPicked).filter(function (k) { return reqPicked[k]; }), custom: reqCustom, text: reqText(), confirmed: reqConfirmed, open: reqOpen }; },
    openReq: function (v) { setReqOpen(v === undefined ? true : v); },
    type: function () { var r = document.querySelector('input[name="type"]:checked'); return r ? r.value : ''; },
    pinned: function () { return typePinned; },
    buildPlainText: buildPlainText,
    loadHistory: loadHistory,
    loadMarks: loadMarks,
    setAttachment: setAttachment,
    clearAttachment: clearAttachment,
    getAttachment: function () { return attachment; },
    getTone: function () { return tone; },
    setTone: function (on, scope) {
      tone.on = !!on;
      if (scope) tone.scope = scope === 'all' ? 'all' : 'key';
      saveTone();
      computeTones();
      syncToneUI();
      renderImport();
    }
  };
})();
