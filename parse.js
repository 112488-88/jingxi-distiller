/* parse.js —— 聊天记录解析器
 *
 * 只做本地解析，不发网络请求。被 app.js 调用（window.CHAT_PARSE）。
 *
 * 支持的来源（自动识别，认不出就当普通长文本）：
 *   wechatHtml  微信 HTML（MemoTrace/留痕导出，含 class="message" / chatlog）
 *   wechatCsv   微信 CSV（表头含 StrTime / StrContent / NickName / Sender）
 *   qqTxt       QQ TXT（行首 2026-11-12 14:30:27 昵称(12345)）
 *   qqMht       QQ MHT（MIME + quoted-printable，常见 gb2312）
 *   wechatTxt   微信「多选 → 复制」的纯文本（粘贴进来的那种）
 *   plain       普通文本（不做结构化）
 *
 * 输出消息结构：{ sender, senderId, time, timeRaw, content, mergedCount }
 *   time 统一成 'YYYY-MM-DD HH:mm'（缺就空字符串，不瞎补）
 *   timeRaw 保留原文写法，展示用
 */

(function () {
  'use strict';

  var KIND_LABEL = {
    wechatHtml: '微信HTML',
    wechatCsv: '微信CSV',
    qqTxt: 'QQ TXT',
    qqMht: 'QQ MHT',
    mergedForward: '合并转发',
    wechatTxt: '微信TXT',
    plain: '通用文本'
  };

  var KIND_ORDER = ['wechatHtml', 'wechatCsv', 'qqTxt', 'qqMht', 'mergedForward', 'wechatTxt', 'plain'];

  // ---------- 时间 ----------

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function isoOf(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // 把各种写法解析成 { time:'YYYY-MM-DD HH:mm', timeRaw }
  function parseTime(raw, fallbackYear) {
    var s = String(raw || '').replace(/\u00a0/g, ' ').trim();
    if (!s) return { time: '', timeRaw: '' };

    var m;
    // 2026-11-12 14:30(:27) / 2026/11/12 / 2026.11.12 / 2026年11月12日
    m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*(\d{1,2})?\s*[:：]?\s*(\d{1,2})?/.exec(s);
    if (m) {
      var y = +m[1], mo = +m[2], d = +m[3], h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0;
      return { time: isoOf(new Date(y, mo - 1, d, h, mi)), timeRaw: s };
    }

    // 11-12 14:30（没有年份 → 用 fallbackYear，仍没有就不补年份）
    m = /(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*(\d{1,2})?\s*[:：]\s*(\d{1,2})/.exec(s);
    if (m) {
      var yy = fallbackYear || new Date().getFullYear();
      return { time: isoOf(new Date(yy, +m[1] - 1, +m[2], +(m[3] || 0), +m[4])), timeRaw: s };
    }

    // 只有时间 14:30 / 下午 2:30
    m = /(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(s);
    if (m) {
      var hh = +m[2];
      if (m[1] === '下午' && hh < 12) hh += 12;
      if (m[1] === '晚上' && hh < 12) hh += 12;
      var dd = new Date();
      return { time: isoOf(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), hh, +m[3])), timeRaw: s };
    }

    return { time: '', timeRaw: s };
  }

  function toMs(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(t || '');
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  // ---------- 文本清洗 / 媒体占位 ----------

  function tidy(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  // 把各种媒体写法统一成 [图片] / [语音 3"] / [文件 xx.pdf] / [转账 200 元]
  // 注意：具名表情（[旺柴] [捂脸] [裂开] [强] [微笑] …）原样保留，不统一成 [表情]，
  //      否则语气线索全丢；[动画表情] 也保持原样。
  var GENERIC_MEDIA = {
    '图片': '图片', '照片': '图片', '相片': '图片', 'Photo': '图片', 'Image': '图片',
    '视频': '视频', 'Video': '视频',
    '位置': '位置', '定位': '位置', 'Location': '位置',
    '名片': '名片', 'Card': '名片',
    '语音': '语音', 'Voice': '语音', 'Audio': '语音',
    '表情': '表情', 'Sticker': '表情',
    '文件': '文件', 'File': '文件', '附件': '文件'
  };

  function normalizeMedia(text) {
    var s = String(text || '');

    // 语音带时长
    s = s.replace(/\[语音\s*(\d+(?:\.\d+)?)\s*[”"']?\]/g, function (m, n) {
      return '[语音 ' + Math.round(+n) + '"]';
    });

    // 文件名： [文件]报价单.pdf / [文件：报价单.pdf]
    s = s.replace(/\[(?:文件|附件|File)\s*[:：]\s*([^\[\]]+)\]/gi, function (m, name) {
      return '[文件 ' + name.trim() + ']';
    });
    s = s.replace(/\[(?:文件|附件|File)\]\s*([^\s\[\]]+)/gi, function (m, name) {
      return '[文件 ' + name + ']';
    });

    // 转账 / 红包
    s = s.replace(/\[(转账|红包)\]\s*([\d.,]+)\s*元?/g, function (m, k, n) {
      return '[转账 ' + n + ' 元]';
    });
    s = s.replace(/(^|[^[\w])转账\s*([\d.,]+)\s*元/g, function (m, pre, n) {
      return pre + '[转账 ' + n + ' 元]';
    });

    // 其余方括号 token：只把「通用名」归一，具名表情一律不动
    s = s.replace(/\[([^\[\]\n]{1,20})\]/g, function (m, token) {
      var mapped = GENERIC_MEDIA[String(token).trim()];
      return mapped ? '[' + mapped + ']' : m;
    });

    return s;
  }

  // ---------- HTML 工具 ----------

  function parseHtml(html) {
    try {
      return new DOMParser().parseFromString(String(html || ''), 'text/html');
    } catch (e) {
      return null;
    }
  }

  function classOf(node) {
    return (node && node.getAttribute && node.getAttribute('class')) || '';
  }

  function pickFirst(node, regex) {
    var all = node.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (regex.test(classOf(all[i]))) return all[i];
    }
    return null;
  }

  // HTML 节点里的媒体 → 占位文字
  function mediaFromNode(node) {
    var out = [];
    var imgs = node.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var cls = classOf(img) + ' ' + (img.getAttribute('alt') || '') + ' ' + (img.getAttribute('src') || '');
      if (/emoji|face|sticker|表情|emotion/i.test(cls)) out.push('[表情]');
      else if (/file|attach|附件/i.test(cls)) out.push('[文件 ' + (img.getAttribute('title') || img.getAttribute('alt') || '附件') + ']');
      else out.push('[图片]');
    }
    var audios = node.querySelectorAll('audio, .voice, .audio, [class*=voice]');
    for (var j = 0; j < audios.length; j++) {
      var a = audios[j];
      var sec = a.getAttribute && (a.getAttribute('duration') || a.getAttribute('data-duration') || a.getAttribute('voice-length'));
      out.push(sec ? '[语音 ' + Math.round(+sec) + '"]' : '[语音]');
    }
    var vids = node.querySelectorAll('.video, [class*=video]');
    for (var k = 0; k < vids.length; k++) out.push('[视频]');
    return out;
  }

  // ---------- 解析器：微信 HTML（MemoTrace / 留痕） ----------

  // 挑出「真正的消息容器」：优先精确类名，退而求其次再从 [class*=message] 里筛
  function collectMessageNodes(doc) {
    var exact = doc.querySelectorAll('.message, .msg, .msg-item, .chatlog-item, .chat-item, .bubble, .dialog-item');
    if (exact.length) return Array.prototype.slice.call(exact);

    var broad = doc.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"]');
    var out = [];
    for (var i = 0; i < broad.length; i++) {
      var n = broad[i];
      var cls = classOf(n);
      if (/message-(header|content|body|text|avatar|time|sender|footer)|messages|message-list|chat-header|bubble-tail/i.test(cls)) continue;
      out.push(n);
    }
    return out;
  }

  function parseWechatHtml(html) {
    var doc = parseHtml(html);
    if (!doc) return [];

    var nodes = collectMessageNodes(doc);
    if (!nodes.length) return [];

    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];

      var senderNode = pickFirst(node, /(^|\s)(sender|nickname|nick|from|user-name)(\s|$)/i);
      var timeNode = pickFirst(node, /(^|\s)(time|timestamp|date|create-time|createtime)(\s|$)/i);
      var contentNode = pickFirst(node, /(^|\s)(content|bubble|msg-content|text|body|message-text)(\s|$)/i);

      var sender = senderNode ? tidy(senderNode.textContent) : '';
      var timeRaw = timeNode ? tidy(timeNode.textContent) : '';
      var content = '';

      if (contentNode) {
        content = tidy(contentNode.textContent);
      } else {
        content = tidy(node.textContent);
        if (sender) content = tidy(content.replace(sender, ''));
        if (timeRaw) content = tidy(content.replace(timeRaw, ''));
      }

      var media = mediaFromNode(node);
      if (media.length) content = tidy((content ? content + ' ' : '') + media.join(' '));

      if (!content) continue;

      var t = parseTime(timeRaw);
      out.push({ sender: sender, senderId: '', time: t.time, timeRaw: t.timeRaw, content: normalizeMedia(content) });
    }
    return out;
  }

  // ---------- 解析器：微信 CSV（MemoTrace） ----------

  function parseCsvRows(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var s = String(text || '').replace(/^\uFEFF/, '');

    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  var WX_TYPE = {
    1: '', 3: '[图片]', 34: '[语音]', 42: '[名片]', 43: '[视频]', 47: '[表情]',
    48: '[位置]', 49: '[文件]', 50: '[通话]', 10000: '', 10002: ''
  };

  function parseWechatCsv(text) {
    var rows = parseCsvRows(text);
    if (!rows.length) return [];

    // 找表头行
    var headerIdx = -1;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var joined = rows[i].join(',');
      if (/StrTime/i.test(joined) || /StrContent|NickName|Sender/.test(joined)) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return [];

    var header = rows[headerIdx].map(function (h) { return String(h).trim(); });
    function col(name) {
      for (var j = 0; j < header.length; j++) {
        if (header[j].toLowerCase() === name.toLowerCase()) return j;
      }
      return -1;
    }

    var iTime = col('StrTime') >= 0 ? col('StrTime') : col('CreateTime');
    var iContent = col('StrContent') >= 0 ? col('StrContent') : col('Content');
    var iNick = col('NickName') >= 0 ? col('NickName') : col('Talker');
    var iSender = col('Sender') >= 0 ? col('Sender') : col('SenderId');
    var iType = col('Type') >= 0 ? col('Type') : col('MsgType');

    var out = [];
    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) continue;
      var get = function (idx) { return idx >= 0 && idx < row.length ? String(row[idx]) : ''; };

      var timeRaw = tidy(get(iTime));
      var sender = tidy(get(iNick)) || tidy(get(iSender));
      var content = tidy(get(iContent));
      var type = parseInt(get(iType), 10);

      if (!content && type && WX_TYPE[type]) content = WX_TYPE[type];
      if (!content) continue;

      content = content.replace(/^[\w.\-]+@chatroom:$/, '');
      var t = parseTime(timeRaw);
      out.push({
        sender: sender,
        senderId: tidy(get(iSender)),
        time: t.time,
        timeRaw: t.timeRaw,
        content: normalizeMedia(content)
      });
    }
    return out;
  }

  // ---------- 解析器：QQ TXT ----------

  var QQ_HEAD = /^(\d{4}-\d{2}-\d{2})[ \t]+(\d{1,2}:\d{2}(?::\d{2})?)[ \t]+(.+?)[ \t]*$/;

  function splitQqSender(rest) {
    var s = String(rest || '').trim();
    var id = '';
    var m = /\((\d{4,})\)\s*$/.exec(s);
    if (m) { id = m[1]; s = s.slice(0, m.index).trim(); }
    var m2 = /<([^>]+)>\s*$/.exec(s);
    if (m2) { id = id || m2[1]; s = s.slice(0, m2.index).trim(); }
    return { sender: s, senderId: id };
  }

  function parseQqTxt(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = QQ_HEAD.exec(line);
      if (m && /\d{1,2}:\d{2}/.test(m[2])) {
        if (cur) out.push(cur);
        var who = splitQqSender(m[3]);
        var t = parseTime(m[1] + ' ' + m[2]);
        cur = {
          sender: who.sender,
          senderId: who.senderId,
          time: t.time,
          timeRaw: m[1] + ' ' + m[2],
          content: ''
        };
        continue;
      }
      if (cur) cur.content += (cur.content ? '\n' : '') + line;
    }
    if (cur) out.push(cur);

    return out.filter(function (m) { return m.content.trim(); }).map(function (m) {
      return {
        sender: m.sender,
        senderId: m.senderId,
        time: m.time,
        timeRaw: m.timeRaw,
        content: normalizeMedia(tidy(m.content))
      };
    });
  }

  // ---------- 解析器：QQ MHT ----------

  function decodeQuotedPrintable(str) {
    var s = String(str || '').replace(/=\r?\n/g, '');
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
        bytes.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      } else {
        bytes.push(s.charCodeAt(i) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  }

  function decodeBase64ToBytes(str) {
    try {
      var bin = atob(String(str || '').replace(/\s+/g, ''));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) {
      return new Uint8Array(0);
    }
  }

  function decodeBytes(bytes, charset) {
    var enc = String(charset || 'utf-8').toLowerCase();
    if (/gb2312|gbk|gb18030|euc-cn/.test(enc)) enc = 'gbk';
    try { return new TextDecoder(enc).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function parseQqMht(text) {
    var s = String(text || '');
    var bm = /boundary="?([^";\r\n]+)"?/i.exec(s);
    var parts = bm ? s.split('--' + bm[1]) : [s];

    var htmlPart = null;
    for (var i = 0; i < parts.length; i++) {
      if (/Content-Type:\s*text\/html/i.test(parts[i])) { htmlPart = parts[i]; break; }
    }
    if (!htmlPart) htmlPart = s;

    var headEnd = htmlPart.search(/\r?\n\r?\n/);
    var head = headEnd >= 0 ? htmlPart.slice(0, headEnd) : '';
    var body = headEnd >= 0 ? htmlPart.slice(headEnd + 2) : htmlPart;

    var charset = (/charset="?([\w-]+)"?/i.exec(head) || [])[1] || 'utf-8';
    var enc = (/Content-Transfer-Encoding:\s*(\S+)/i.exec(head) || [])[1] || 'quoted-printable';

    var bytes;
    if (/base64/i.test(enc)) bytes = decodeBase64ToBytes(body);
    else bytes = decodeQuotedPrintable(body);

    var html = decodeBytes(bytes, charset);

    // 先试结构化（有的导出带 class="message"/"msg"）
    var structured = parseWechatHtml(html);
    if (structured.length >= 2) return structured;

    // 再退回：HTML → 纯文本，套 QQ TXT / 微信文本解析
    var doc = parseHtml(html);
    var plain = '';
    if (doc) {
      doc.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
      plain = doc.body ? doc.body.textContent : doc.documentElement.textContent;
      plain = String(plain || '').replace(/\u00a0/g, ' ');
      plain = plain.replace(/[ \t]+\n/g, '\n');
    }
    var byTxt = parseQqTxt(plain);
    if (byTxt.length >= 1) return byTxt;
    return parseWechatTxt(plain);
  }

  // ---------- 解析器：微信「多选→复制」/ 合并转发内层（统一行扫描） ----------
  //
  // 不同版本、手机端 PC 端复制出来的头部格式差别很大，这里一次列出所有常见形态：
  //   2026-11-12 14:30:27 老王          （时间在前）
  //   老王 2026-11-12 14:30:27          （昵称在前）
  //   老王（2026-11-12 14:30:27）        （括号包时间）
  //   [2026-11-12 14:30:27] 老王：内容   （单行一条）
  //   老王 14:30                        （只有时分）
  //   14:30 老王                        （时分在前）
  //   2026-11-12 14:30:27               （只有时间，发送人留空不瞎补）
  //   老王：内容                         （纯单行，整段都这种时启用）

  var T_DATE = '\\d{4}\\s*[-/年.]\\s*\\d{1,2}\\s*[-/月.]\\s*\\d{1,2}\\s*日?';
  var T_CLOCK = '(?:上午|下午|晚上|中午|凌晨|早上)?\\s*\\d{1,2}\\s*[:：]\\s*\\d{2}(?:\\s*[:：]\\s*\\d{2})?';
  var T_FULL = T_DATE + '\\s*' + T_CLOCK;
  var T_HM = '\\d{1,2}\\s*[:：]\\s*\\d{2}';

  var HEAD_FORMS = [
    // [时间] 昵称：内容 / 时间 昵称：内容
    { kind: 'inline', re: new RegExp('^[\\[【]?\\s*(' + T_FULL + ')\\s*[\\]】]?\\s*(.{1,40}?)\\s*[:：]\\s*(.+)$') },
    // 时间 昵称
    { kind: 'time_name', re: new RegExp('^[\\[【]?\\s*(' + T_FULL + ')\\s*[\\]】]?\\s*[-—|｜]?\\s+(.{1,40}?)\\s*$') },
    // 昵称 时间
    { kind: 'name_time', re: new RegExp('^(.{1,40}?)\\s+(' + T_FULL + ')\\s*$') },
    // 昵称（时间）
    { kind: 'name_paren', re: new RegExp('^(.{1,40}?)\\s*[（(]\\s*(' + T_FULL + ')\\s*[)）]\\s*$') },
    // 只有时间
    { kind: 'time_only', re: new RegExp('^[\\[【]?\\s*(' + T_FULL + ')\\s*[\\]】]?$') },
    // 昵称 14:30
    { kind: 'name_hm', re: new RegExp('^([^\\s:：]{1,12})\\s+(' + T_HM + ')\\s*$') },
    // 14:30 昵称
    { kind: 'hm_name', re: new RegExp('^(' + T_HM + ')\\s+([^\\s:：]{1,12})\\s*$') },
    // 昵称：（冒号独占一行，内容在下面）—— 微信「多选→复制」很常见的形态
    { kind: 'name_colon', re: /^([^\s:：\[\]【】]{1,8})\s*[:：]\s*$/ }
  ];

  // 这些是文档里的「标签」，不是人名，别当发送人
  var LABEL_WORDS = ['注意', '结论', '议题', '时间', '地点', '人物', '参会', '待办', '风险', '备注',
    '原因', '方案', '计划', '预算', '分工', '附件', '主题', '内容', '背景', '目标', '行动', '决定'];

  function cleanName(n) {
    return String(n || '')
      .replace(/[（(]\s*(?:\d{4,}|\d{5,})\s*[)）]\s*$/, '')
      .replace(/<[^>]+>\s*$/, '')
      .replace(/^[\[【]|[\]】]$/g, '')
      .trim();
  }

  function splitHeader(line) {
    var s = String(line || '').trim();
    if (!s || s.length > 160) return null;

    for (var i = 0; i < HEAD_FORMS.length; i++) {
      var h = HEAD_FORMS[i];
      var m = h.re.exec(s);
      if (!m) continue;

      if (h.kind === 'inline') return { timeRaw: m[1], name: cleanName(m[2]), inline: m[3] };
      if (h.kind === 'time_name') return { timeRaw: m[1], name: cleanName(m[2]), inline: '' };
      if (h.kind === 'name_time') return { timeRaw: m[2], name: cleanName(m[1]), inline: '' };
      if (h.kind === 'name_paren') return { timeRaw: m[2], name: cleanName(m[1]), inline: '' };
      if (h.kind === 'time_only') return { timeRaw: m[1], name: '', inline: '' };
      if (h.kind === 'name_hm') return { timeRaw: m[2], name: cleanName(m[1]), inline: '' };
      if (h.kind === 'hm_name') return { timeRaw: m[1], name: cleanName(m[2]), inline: '' };
      if (h.kind === 'name_colon') {
        var nm = cleanName(m[1]);
        if (LABEL_WORDS.indexOf(nm) >= 0) return null;   // 「注意：」这种标签不算发送人
        return { timeRaw: '', name: nm, inline: '' };
      }
    }
    return null;
  }

  // 时间行下面紧跟一行的短文本，大概率是「昵称」（有些版本名字单独占一行）
  function isLikelyName(line) {
    var s = String(line || '').trim();
    if (!s || s.length > 12) return false;
    if (/[：:，。,.!?！？、；;（）()\[\]【】]/.test(s)) return false;
    if (/^\[[^\]]+\]$/.test(s)) return false;      // [图片] 这种占位
    if (/^\d+$/.test(s)) return false;             // 纯数字多半是内容
    return true;
  }

  function countHeaders(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      if (splitHeader(lines[i])) n++;
    }
    return n;
  }

  // 带时间的头部（比「昵称：」更可信，判定聊天记录时门槛更低）
  function countTimedHeaders(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var h = splitHeader(lines[i]);
      if (h && h.timeRaw) n++;
    }
    return n;
  }

  function hasLineAfter(lines, i) {
    for (var k = i + 1; k < lines.length; k++) {
      if (lines[k].trim()) return true;
    }
    return false;
  }

  function parseChatLines(text) {
    var MF = window.MERGED_FORWARD;
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var cur = null;
    var headerMode = countHeaders(text) > 0;

    function flush() {
      if (!cur) return;
      var c = tidy(cur.content);
      if (c) {
        var t = parseTime(cur.timeRaw);
        out.push({
          sender: cur.sender,
          senderId: cur.senderId || '',
          time: t.time,
          timeRaw: t.timeRaw || cur.timeRaw || '',
          content: normalizeMedia(c)
        });
      }
      cur = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        if (cur && cur.content) cur.content += '\n';
        continue;
      }
      if (MF && (MF.isTitle(trimmed) || MF.isDivider(trimmed) || MF.isEnd(trimmed))) continue;

      var h = splitHeader(trimmed);
      if (h) {
        flush();
        if (h.inline) {
          // 单行一条：直接成形
          var t0 = parseTime(h.timeRaw);
          out.push({
            sender: h.name,
            senderId: '',
            time: t0.time,
            timeRaw: t0.timeRaw,
            content: normalizeMedia(h.inline)
          });
        } else {
          cur = { sender: h.name, timeRaw: h.timeRaw, content: '' };
          if (!h.name) cur.awaitName = true;   // 只有时间 → 下一行若是短名字就补上
        }
        continue;
      }

      if (cur && cur.awaitName) {
        cur.awaitName = false;
        // 只有「后面还有内容」时，才敢把这一行当名字，否则它可能就是这条消息本身
        if (isLikelyName(trimmed) && hasLineAfter(lines, i)) {
          cur.sender = cleanName(trimmed);
          continue;
        }
      }

      // 没有任何时间头时，退回「昵称：内容」单行形态
      if (!headerMode) {
        var mc = new RegExp('^([^\\s:：][^:：\\n]{0,19})\\s*[:：]\\s*(.+)$').exec(trimmed);
        if (mc) {
          flush();
          var c2 = tidy(mc[2]);
          if (c2) {
            out.push({ sender: cleanName(mc[1]), senderId: '', time: '', timeRaw: '', content: normalizeMedia(c2) });
          }
          continue;
        }
      }

      if (cur) cur.content += (cur.content ? '\n' : '') + line;
    }
    flush();
    return out;
  }

  function parseWechatTxt(text) {
    return parseChatLines(text);
  }

  // 格式诊断：把前若干行按「头部 / 单行条 / 噪声 / 正文」分类，用来对着实际粘贴内容查格式
  function diagnose(text) {
    var MF = window.MERGED_FORWARD;
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var counts = { header: 0, inline: 0, content: 0, noise: 0, blank: 0 };
    var items = [];

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var s = raw.trim();
      var kind;
      if (!s) kind = 'blank';
      else if (MF && (MF.isTitle(s) || MF.isDivider(s) || MF.isEnd(s))) kind = 'noise';
      else {
        var h = splitHeader(s);
        kind = h ? (h.inline ? 'inline' : 'header') : 'content';
      }
      counts[kind]++;
      if (items.length < 24 && kind !== 'blank') {
        items.push({ n: i + 1, kind: kind, text: s.slice(0, 70) });
      }
    }

    return { total: lines.length, counts: counts, items: items };
  }

  // ---------- 解析器：合并转发（先剥壳，再交给微信 / QQ 解析器） ----------

  var CARD_HINT = (window.MERGED_FORWARD && window.MERGED_FORWARD.CARD_ONLY_HINT) ||
    '这是合并转发的卡片本体（剪贴板里只有「昵称:[聊天记录]」这一行），内容没跟着复制出来。' +
    '三个办法任选：① 双击卡片打开独立窗口 → Ctrl+A → Ctrl+C 再粘；② 用 MemoTrace / 留痕 导出 HTML 或 CSV 拖进来；③ 点开卡片逐屏截图。';

  function parseMergedForward(text) {
    var MF = window.MERGED_FORWARD;
    var raw = String(text || '');
    var inner = raw;
    var depth = 0;

    if (MF) {
      var r = MF.stripDeep(inner);
      inner = r.text;
      depth = r.depth;
    }

    // 内层可能是 QQ 形态（带 QQ 号，能拿到 senderId），也可能是「昵称 + 时间」形态。
    // 两个都跑一遍，取拆得更细的那个，避免一种格式把另一种吞掉。
    function best(src) {
      var byQq = parseQqTxt(src);
      var byLines = parseChatLines(src);
      return byLines.length > byQq.length ? byLines : byQq;
    }

    var list = best(inner);
    if (!list.length && inner !== raw) list = best(raw); // 兜底：外壳没剥干净也再试一次

    return { messages: list, depth: depth };
  }

  // ---------- 识别 ----------

  function countMatches(text, re, cap) {
    var m = String(text || '').match(new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g'));
    return m ? Math.min(m.length, cap || 9999) : 0;
  }

  function detect(name, text) {
    var s = String(text || '');
    var head = s.slice(0, 4000);
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    var ext = m ? m[1].toLowerCase() : '';

    // 1) QQ MHT：MIME + quoted-printable / base64
    if (/mht|mhtml/.test(ext) ||
        (/MIME-Version/i.test(head) && /boundary=/i.test(head) && /quoted-printable|base64/i.test(head))) {
      return 'qqMht';
    }

    // 2) 微信 CSV：表头含 StrTime / StrContent / NickName / Sender
    var firstLines = s.slice(0, 2000);
    if (/StrTime/i.test(firstLines) && /StrContent|NickName|Sender/i.test(firstLines)) return 'wechatCsv';

    // 3) 微信 HTML
    if (/class=["'][^"']*(message|chatlog|bubble)[^"']*["']/i.test(head) || /chatlog/i.test(head)) {
      return 'wechatHtml';
    }

    // 3.5) 合并转发：有标题行（[聊天记录] / xx和xx的聊天记录）或 QQ 分隔符
    var MF = window.MERGED_FORWARD;
    if (MF && MF.detect(s)) return 'mergedForward';

    // 4) QQ TXT
    if (countMatches(s, /^\d{4}-\d{2}-\d{2}[ \t]+\d{1,2}:\d{2}(?::\d{2})?[ \t]+\S+/gm) >= 2) return 'qqTxt';

    // 5) 微信「多选→复制」/ 合并转发内层
    //    带时间的头部 ≥2 条就很可信；只有「昵称：」形态的要 ≥3 条才算
    var timed = countTimedHeaders(s);
    if (timed >= 2) return 'wechatTxt';
    if (countHeaders(s) - timed >= 3) return 'wechatTxt';
    var c = countMatches(s, /^[^\s:：][^:：\n]{0,19}[:：]\s*\S+/gm);
    if (c >= 3) return 'wechatTxt';

    return 'plain';
  }

  // ---------- 统一后处理：去重 → 合并 ----------

  function dedupe(list) {
    var seen = {};
    var out = [];
    list.forEach(function (m) {
      var k = (m.time || '') + '|' + (m.sender || '') + '|' + m.content;
      if (seen[k]) return;
      // 同一人短时间内一字不差的连发，也只留一条
      var prev = out[out.length - 1];
      if (prev && prev.sender === m.sender && prev.content === m.content) {
        if (!prev.time || !m.time) return;
        var d = (toMs(m.time) - toMs(prev.time)) / 1000;
        if (d >= 0 && d <= 120) return;
      }
      seen[k] = 1;
      out.push(m);
    });
    return out;
  }

  function merge(list) {
    var out = [];
    list.forEach(function (m) {
      var prev = out[out.length - 1];
      if (prev && m.sender && prev.sender === m.sender && prev.time && m.time) {
        var d = (toMs(m.time) - toMs(prev.time)) / 1000;
        if (d >= 0 && d <= 120) {
          prev.content = prev.content + '\n' + m.content;
          prev.mergedCount = (prev.mergedCount || 1) + 1;
          prev.timeEnd = m.time;
          return;
        }
      }
      out.push({
        sender: m.sender,
        senderId: m.senderId || '',
        time: m.time,
        timeRaw: m.timeRaw || '',
        content: m.content,
        mergedCount: 1
      });
    });
    return out;
  }

  // ---------- 对外：解析入口 ----------

  // 去掉空白后的字数，用来判断解析器到底吃进了多少原文
  function bareLen(t) {
    return String(t || '').replace(/\s/g, '').length;
  }

  function listChars(list) {
    return (list || []).reduce(function (n, m) { return n + bareLen(m && m.content); }, 0);
  }

  // 用「长句子有没有被吃进去」来算覆盖度：
  // 比字数更准 —— 聊天记录里的时间戳/昵称不算内容，公文段落才是内容。
  function coverageOf(text, list) {
    var joined = (list || []).map(function (m) { return String((m && m.content) || ''); })
      .join('\n').replace(/\s+/g, '');
    var lines = String(text || '').split('\n')
      .map(function (l) { return l.replace(/\s+/g, ''); })
      .filter(function (l) {
        if (l.length < 12) return false;
        // 时间戳/昵称这类「消息头」不算正文，别拿来拉低覆盖度
        if (/\d{1,2}:\d{2}/.test(l) && l.length < 40) return false;
        return true;
      });
    if (!lines.length) return 100;
    var hit = 0;
    lines.forEach(function (l) { if (joined.indexOf(l) >= 0) hit++; });
    return Math.round(hit / lines.length * 100);
  }

  function wholeTextMessage(text) {
    return [{
      sender: '',
      time: '',
      timeRaw: '',
      content: String(text || '').trim()
    }];
  }

  function parse(text, kind) {
    var k = kind || detect('', text);
    var list = [];
    var hint = '';
    var depth = 0;
    var fallbackFrom = '';

    if (k === 'wechatHtml') list = parseWechatHtml(text);
    else if (k === 'wechatCsv') list = parseWechatCsv(text);
    else if (k === 'qqTxt') list = parseQqTxt(text);
    else if (k === 'qqMht') list = parseQqMht(text);
    else if (k === 'wechatTxt') list = parseWechatTxt(text);
    else if (k === 'mergedForward') {
      var mf = parseMergedForward(text);
      list = mf.messages;
      depth = mf.depth;
      if (!list.length) hint = CARD_HINT;
    } else if (k === 'plain') {
      list = wholeTextMessage(text);
    } else list = [];

    list = (list || []).filter(function (m) { return m && String(m.content || '').trim(); });

    // 覆盖度守卫：只对「逐行文本」的两类解析器生效。
    // HTML/CSV/MHT 的原文里混着标签和分隔符，用它们算覆盖度没意义。
    var GUARD_KINDS = { wechatTxt: 1, qqTxt: 1 };
    var cov = coverageOf(text, list);
    var covRaw = cov;
    var srcLen = bareLen(text);
    // 只有在「确实认出了一部分、却把大段正文漏掉」时才整段吞；
    // 一条都没认出来（比如拿 HTML 当 QQ TXT）保持 0 条，让用户去换解析器
    if (GUARD_KINDS[k] && list.length > 0 && srcLen > 300 && cov < 60) {
      fallbackFrom = k;
      list = wholeTextMessage(text);
      k = 'plain';
      hint = '';
      depth = 0;
      cov = 100;
    }

    list = dedupe(list);
    list = merge(list);
    if (!list.length && k === 'mergedForward' && !hint) hint = CARD_HINT;

    return {
      kind: k,
      label: KIND_LABEL[k] || '通用文本',
      messages: list,
      stats: summarize(list),
      hint: hint,
      depth: depth,
      coverage: cov,
      originalCoverage: covRaw,
      sourceChars: srcLen,
      fallbackFrom: fallbackFrom
    };
  }

  // ---------- 概览 ----------

  function summarize(messages) {
    var list = messages || [];
    var senders = [];
    var times = [];

    list.forEach(function (m) {
      if (m.sender && senders.indexOf(m.sender) < 0) senders.push(m.sender);
      if (m.time) times.push(m.time);
    });

    times.sort();
    var first = times[0] || '';
    var last = times[times.length - 1] || '';
    var range = '';
    if (first && last) {
      var f = first.slice(5, 10);
      var l = last.slice(5, 10);
      range = (f === l) ? f : (f + ' 至 ' + l);
    }

    return {
      count: list.length,
      participants: senders,
      participantsCount: senders.length,
      firstTime: first,
      lastTime: last,
      lastDate: last ? last.slice(0, 10) : '',
      range: range,
      text: '识别到 ' + list.length + ' 条消息 · ' + senders.length + ' 位参与者' + (range ? ' · ' + range : '')
    };
  }

  // ---------- 给提示词用的结构化文本 ----------

  function buildPromptText(messages, stats, todayIso, opts) {
    var list = messages || [];
    var st = stats || summarize(list);
    var lines = [];
    var toneOn = !!(opts && opts.toneOn);
    var tones = (opts && opts.tones) || {};
    var roles = (opts && opts.roles) || {};
    var seen = {};

    lines.push('【类型】聊天记录（结构化导入）');
    if (todayIso) lines.push('【今天】' + todayIso);
    if (st.participants.length) lines.push('【参与者】' + st.participants.join('、'));
    if (st.firstTime) lines.push('【时间范围】' + st.firstTime + ' 至 ' + st.lastTime);
    if (toneOn) {
      lines.push('【说明】行尾〔AI 推断语气：X〕是程序按语气词/标点/表情推断的，不是原文；正文里没有这个括号。');
    }
    lines.push('【消息】');

    list.forEach(function (m, i) {
      var who = m.sender || '未署名';
      var head = who;

      if (toneOn && roles[who] && !seen[who]) {
        head = who + '（身份推断：' + roles[who] + '）';
        seen[who] = 1;
      }

      var line = (m.time ? m.time + ' ' : '') + head + '：' + m.content.replace(/\n/g, ' / ');
      if (toneOn && tones[i]) line += '　〔AI 推断语气：' + tones[i] + '〕';
      lines.push(line);
    });

    return lines.join('\n');
  }

  // ---------- 相对时间 → 绝对日期 ----------

  var WD_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

  function baseDate(base) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(base || ''));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    return new Date(d.getTime() + n * 86400000);
  }

  function mmdd(d) {
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function mondayOf(d) {
    var dow = d.getDay();
    return addDays(d, -((dow + 6) % 7));
  }

  function absolutize(text, base) {
    var s = String(text || '');
    if (!s) return s;

    var b = baseDate(base);

    // 今天/明天/后天/昨天…
    var REL = { '大后天': 3, '后天': 2, '明天': 1, '今天': 0, '昨天': -1, '前天': -2 };
    Object.keys(REL).forEach(function (k) {
      s = s.replace(new RegExp(k + '(?!（)', 'g'), k + '（' + mmdd(addDays(b, REL[k])) + '）');
    });

    // 周X / 星期X / 礼拜X（含 本周/这周/下周/下下周）
    s = s.replace(/(下下下周|下下周|下周|本周|这周)?(周|星期|礼拜)([一二三四五六日天])(?!（)/g, function (m, pre, wk, w) {
      var idx = WD_MAP[w];
      var d;
      if (pre === '下周') d = addDays(mondayOf(b), 7 + ((idx + 6) % 7));
      else if (pre === '下下周') d = addDays(mondayOf(b), 14 + ((idx + 6) % 7));
      else if (pre === '下下下周') d = addDays(mondayOf(b), 21 + ((idx + 6) % 7));
      else if (pre === '本周' || pre === '这周') d = addDays(mondayOf(b), ((idx + 6) % 7));
      else {
        var delta = (idx - b.getDay() + 7) % 7;
        d = addDays(b, delta);
      }
      return (pre || '') + wk + w + '（' + mmdd(d) + '）';
    });

    // X号 / X日（没写月份 → 用基准月，过了就顺延到下个月）
    s = s.replace(/(\d{1,2})\s*([号日])(?!（)/g, function (m, n, u) {
      var day = +n;
      if (day < 1 || day > 31) return m;
      var d = new Date(b.getFullYear(), b.getMonth(), day);
      if (day < b.getDate()) d = new Date(b.getFullYear(), b.getMonth() + 1, day);
      return m + '（' + mmdd(d) + '）';
    });

    // 月底 / 月初
    s = s.replace(/月底(?!（)/g, function () {
      var d = new Date(b.getFullYear(), b.getMonth() + 1, 0);
      return '月底（' + mmdd(d) + '）';
    });
    s = s.replace(/月初(?!（)/g, function () {
      var d = new Date(b.getFullYear(), b.getMonth(), 1);
      return '月初（' + mmdd(d) + '）';
    });

    return s;
  }

  window.CHAT_PARSE = {
    KIND_LABEL: KIND_LABEL,
    KIND_ORDER: KIND_ORDER,
    detect: detect,
    parse: parse,
    summarize: summarize,
    buildPromptText: buildPromptText,
    absolutize: absolutize,
    normalizeMedia: normalizeMedia,
    diagnose: diagnose,
    splitHeader: splitHeader,
    countHeaders: countHeaders,
    countTimedHeaders: countTimedHeaders,
    _internal: {
      parseTime: parseTime,
      parseWechatHtml: parseWechatHtml,
      parseWechatCsv: parseWechatCsv,
      parseQqTxt: parseQqTxt,
      parseQqMht: parseQqMht,
      parseWechatTxt: parseWechatTxt,
      parseChatLines: parseChatLines,
      dedupe: dedupe,
      merge: merge
    }
  };
})();
