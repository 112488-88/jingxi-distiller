/* parsers/merged-forward.js —— 合并转发外壳识别与剥离
 *
 * 微信 PC 端的「合并转发」是卡片消息，剪贴板里拿不到内容；
 * 但双击卡片打开后 Ctrl+A / Ctrl+C 能拿到纯文本，形态大致是：
 *
 *   群聊的聊天记录
 *   [聊天记录]
 *   老王  2026-11-12 14:30:27
 *   周六九点前到
 *   小李  2026-11-12 14:31:00
 *   好的
 *
 * QQ 复制出来则常带 -----原始消息----- 这种分隔符。
 * 这里只负责：认出来 → 剥壳（标题/说明/分隔符/结尾/引号/缩进）→ 递归最多 3 层。
 * 真正的消息拆分交给 parse.js（复用微信 / QQ 的解析器）。
 */

(function () {
  'use strict';

  var MAX_DEPTH = 3;

  // 标题行：[聊天记录] / 聊天记录 / [合并转发] / 群聊的聊天记录 / 老王和小李的聊天记录
  var TITLE_RE = /^\s*[\[【（(]?\s*(?:聊天记录|合并转发|群聊的聊天记录|转发的聊天记录|聊天内容|转发内容)\s*[\]】）)]?\s*$/;
  var OWNER_TITLE_RE = /^\s*.{1,40}?\s*(?:和|与)\s*.{1,40}?\s*的聊天记录\s*$/;
  // 卡片本体：微信把合并转发卡片复制到剪贴板时，只有这一行「昵称:[聊天记录]」
  var CARD_SHELL_RE = /^\s*.{0,40}?[:：]\s*[\[【]?\s*(?:聊天记录|合并转发|聊天内容|转发内容)\s*[\]】]?\s*$/;

  // QQ / 微信分隔符：-----原始消息----- / ---------- / ====== / ——— 2026-11-12 ——— / ─────
  var DIVIDER_RE = /^\s*(?:[-—─━＝=*+·]{3,}.*[-—─━＝=*+·]{3,}|[-—─━＝=*+·]{6,})\s*$/;

  // 结尾噪声
  var END_RE = /^\s*[\[【]?\s*(?:完|以上是全部消息|以上为全部内容|查看更多|查看更多消息|展开|收起|以下为新消息)\s*[\]】]?\s*$/;

  // 引号包裹
  var QUOTE_EDGE = /^[\s"'“”「」『』]+|[\s"'“”「」『』]+$/g;

  function lines(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n');
  }

  function isTitle(line) {
    return TITLE_RE.test(line) || OWNER_TITLE_RE.test(line) || CARD_SHELL_RE.test(line);
  }

  // 是不是「只有卡片壳」——微信剪贴板里就只有「昵称:[聊天记录]」这么一行
  function isCardShell(text) {
    var ls = lines(text).filter(function (l) { return l.trim(); });
    if (!ls.length) return false;
    if (ls.length > 2) return false;
    return ls.every(function (l) { return CARD_SHELL_RE.test(l) || TITLE_RE.test(l) || isEnd(l); });
  }

  function isDivider(line) {
    return DIVIDER_RE.test(line);
  }

  function isEnd(line) {
    return END_RE.test(line);
  }

  function isNoise(line) {
    return isTitle(line) || isDivider(line) || isEnd(line);
  }

  // 外壳特征：标题 / 分隔符 —— 出现任一就算合并转发
  function detect(text) {
    var ls = lines(text);
    var limit = Math.min(ls.length, 12);
    for (var i = 0; i < limit; i++) {
      if (isTitle(ls[i]) || isDivider(ls[i])) return true;
    }
    // 分隔符出现在中间也算（QQ 常把原始消息分隔符放中间）
    for (var j = 0; j < ls.length; j++) {
      if (isDivider(ls[j])) return true;
    }
    return false;
  }

  // 剥壳：去掉标题/说明/分隔符/结尾语，去掉每行首尾引号和行首缩进
  function stripShell(text) {
    var ls = lines(text);
    var out = [];
    var changed = false;

    for (var i = 0; i < ls.length; i++) {
      var line = ls[i];
      if (isNoise(line)) { changed = true; continue; }
      var cleaned = line.replace(/^[ \t]+/, '').replace(/\s+$/, '');
      var dequoted = cleaned.replace(QUOTE_EDGE, '');
      if (dequoted !== cleaned) changed = true;
      out.push(dequoted);
    }

    // 收尾的空行
    while (out.length && !out[out.length - 1].trim()) { out.pop(); changed = true; }
    while (out.length && !out[0].trim()) { out.shift(); changed = true; }

    return { text: out.join('\n'), changed: changed };
  }

  // 递归剥壳（最多 MAX_DEPTH 层），返回最内层文本 + 剥了几层
  function stripDeep(text) {
    var cur = String(text || '');
    var depth = 0;
    while (depth < MAX_DEPTH) {
      var r = stripShell(cur);
      if (!r.changed || r.text === cur) break;
      cur = r.text;
      depth++;
    }
    return { text: cur, depth: depth, capped: depth >= MAX_DEPTH };
  }

  var CARD_ONLY_HINT = '这是合并转发的卡片本体（剪贴板里只有「昵称:[聊天记录]」这一行），内容没跟着复制出来。' +
    '三个办法任选：① 双击卡片打开独立窗口 → Ctrl+A → Ctrl+C 再粘；' +
    '② 用 MemoTrace / 留痕 导出 HTML 或 CSV，直接把文件拖进来；' +
    '③ 点开卡片逐屏截图，把文字发我。';

  window.MERGED_FORWARD = {
    MAX_DEPTH: MAX_DEPTH,
    CARD_ONLY_HINT: CARD_ONLY_HINT,
    detect: detect,
    isTitle: isTitle,
    isDivider: isDivider,
    isEnd: isEnd,
    isCardShell: isCardShell,
    stripShell: stripShell,
    stripDeep: stripDeep
  };
})();
