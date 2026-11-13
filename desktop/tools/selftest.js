'use strict';
/*
 * 内置自检脚本（在渲染进程里跑）：用假数据点一遍主要按钮，不消耗 API 额度。
 * 由 main.js 的「帮助 → 运行自检」调用；跑完会把用户原有的 localStorage 原样恢复。
 * 只依赖页面自己的 DOM，不 require 任何东西，方便打进 asar。
 */

const CHECK_SOURCE = `(async () => {
  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const setVal = (el, v) => {
    const proto = (el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ---- 备份用户数据 ----
  const backup = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      backup[k] = localStorage.getItem(k);
    }
  } catch (e) { /* 忽略 */ }
  const realFetch = window.fetch;
  const realPicker = window.showSaveFilePicker;

  const restore = () => {
    try {
      const now = [];
      for (let i = 0; i < localStorage.length; i++) now.push(localStorage.key(i));
      now.forEach(k => localStorage.removeItem(k));
      Object.keys(backup).forEach(k => localStorage.setItem(k, backup[k]));
    } catch (e) { /* 忽略 */ }
    window.fetch = realFetch;
    window.showSaveFilePicker = realPicker;
  };

  try {
    const env = {
      protocol: location.protocol,
      secureContext: window.isSecureContext,
      clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
      saveFilePicker: typeof window.showSaveFilePicker,
      zoom: window.devicePixelRatio,
      list: navigator.userAgent.slice(0, 80),
    };

    step('页面骨架', !!($('run') && $('input') && $('petSvg')), JSON.stringify({ run: !!$('run'), input: !!$('input') }));

    const idb = await new Promise(res => {
      try {
        const req = indexedDB.open('__selftest', 1);
        req.onsuccess = () => { req.result.close(); res('ok'); };
        req.onerror = () => res('err:' + (req.error && req.error.name));
        setTimeout(() => res('timeout'), 3000);
      } catch (e) { res('throw:' + e.message); }
    });
    step('本地数据库（桌宠形象用）', idb === 'ok', idb);

    // 假 API
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        conclusion: '自检：链路正常。',
        points: [{ text: '接口联调周三前完成', evidence: '张伟：周三前搞定' }],
        todos: [{ owner: '张伟', task: '接口联调', deadline: '周三' }],
        risks: [{ text: '设计稿没定稿', evidence: '还在改' }]
      }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 130, total_tokens: 1030 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    try { localStorage.removeItem('msgcard.apikey'); } catch (e) {}
    if ($('keyInput')) { setVal($('keyInput'), 'sk-selftest-000000000000'); }
    if ($('keySave')) $('keySave').click();
    step('保存 Key', !!localStorage.getItem('msgcard.apikey'));
    setVal($('input'), '张伟：接口周三前搞定。李娜：设计稿还在改。');
    step('输入原文', $('input').value.length > 10);

    $('run').click();
    await sleep(2500);
    const body = document.body.innerText;
    step('提炼出四块卡片', body.indexOf('自检：链路正常') >= 0 && body.indexOf('接口联调') >= 0, 'bodyLen=' + body.length);
    step('写入历史', (() => { try { return (JSON.parse(localStorage.getItem('msgcard.history') || '[]') || []).length > 0; } catch (e) { return false; } })());

    // 复制卡片
    try {
      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => /复制卡片/.test(b.textContent || ''));
      step('复制卡片按钮', !!copyBtn);
      if (copyBtn) { copyBtn.click(); await sleep(500); }
    } catch (e) { step('复制卡片按钮', false, e.message); }

    // 导出（禁用另存为对话框，走下载兜底，避免弹窗）
    try {
      window.showSaveFilePicker = undefined;
      const mdBtn = $('petTools') && $('petTools').querySelector('[data-tool="md"]');
      step('导出按钮存在', !!mdBtn);
      if (mdBtn) { mdBtn.click(); await sleep(1200); }
    } catch (e) { step('导出按钮存在', false, e.message); }

    // 拖文件
    try {
      const clearBtn = $('clear');
      if (clearBtn) clearBtn.click();
      await sleep(200);
      const dt = new DataTransfer();
      dt.items.add(new File(['2026-11-12 14:30:27 张三(10001)\\n三点开会，带报价单。'], 'a.txt', { type: 'text/plain' }));
      ['dragenter', 'dragover', 'drop'].forEach(t => window.dispatchEvent(new DragEvent(t, { bubbles: true, dataTransfer: dt })));
      await sleep(1200);
      step('拖文件载入', $('input').value.length > 5, 'len=' + $('input').value.length);
    } catch (e) { step('拖文件载入', false, e.message); }

    // 微信 CSV
    try {
      if ($('clear')) $('clear').click();
      await sleep(200);
      const dt2 = new DataTransfer();
      dt2.items.add(new File(['StrTime,StrContent,NickName\\n2026-11-12 14:30:27,接口周三前搞定,张伟\\n'], 'w.csv', { type: 'text/csv' }));
      ['dragenter', 'dragover', 'drop'].forEach(t => window.dispatchEvent(new DragEvent(t, { bubbles: true, dataTransfer: dt2 })));
      await sleep(1400);
      step('识别微信 CSV', /微信/.test(document.body.innerText));
    } catch (e) { step('识别微信 CSV', false, e.message); }

    // 主题 / 桌宠
    try {
      const t1 = document.documentElement.dataset.theme;
      $('themeToggle').click();
      await sleep(250);
      step('深浅色切换', document.documentElement.dataset.theme !== t1);
      $('themeToggle').click();
      await sleep(200);
    } catch (e) { step('深浅色切换', false, e.message); }

    try {
      const layer = $('petLayer') || $('pet');
      const d1 = getComputedStyle(layer).display;
      $('petToggle').click();
      await sleep(250);
      step('桌宠显隐', getComputedStyle(layer).display !== d1);
      $('petToggle').click();
      await sleep(200);
    } catch (e) { step('桌宠显隐', false, e.message); }

    // 新建
    try {
      $('newBtn').click();
      await sleep(300);
      step('新建提炼清空', $('input').value.length === 0);
    } catch (e) { step('新建提炼清空', false, e.message); }

    // Ctrl+Enter
    try {
      const ta = $('input');
      setVal(ta, '王五：预算 12 万，下周一前报。');
      await sleep(150);
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true }));
      await sleep(2200);
      step('Ctrl+Enter 提炼', document.body.innerText.indexOf('自检：链路正常') >= 0);
    } catch (e) { step('Ctrl+Enter 提炼', false, e.message); }

    return { steps, env };
  } finally {
    try { $('newBtn') && $('newBtn').click(); } catch (e) {}
    restore();
  }
})()`;

module.exports = { CHECK_SOURCE };
