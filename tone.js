/* tone.js —— 语气 / 身份推断（本地规则，不发网络请求）
 *
 * 原则（照需求说明）：
 *   · 只用固定词表：语气 12 个、身份 8 个，不许自由发挥
 *   · 证据不足就不标，宁缺勿滥
 *   · 只揣测语气，不揣测动机和强度（不写"他很生气"，只写"不满"）
 *   · 身份不确定就写「未知」，不硬猜「领导」
 *   · 语气只属于原文层，绝不进入关键信息 / 待办正文（由提示词与渲染共同保证）
 */

(function () {
  'use strict';

  var TONES = ['催促', '无奈', '调侃', '敷衍', '确认', '疑问', '不满', '客气', '急迫', '犹豫', '兴奋', '正式'];
  var ROLES = ['领导', '同事', '客户', '下属', '家人', '朋友', '陌生人', '未知'];

  function inferTone(content) {
    var s = String(content || '').trim();
    if (!s) return null;

    // ① 标点 + 语气词（最高优先级）
    var hasQ = /[?？]/.test(s);
    if (hasQ && (/[?？]{2,}/.test(s) || /(吗|呢|怎么|为什么|多少|几号|谁|能不能|行不行|是不是)/.test(s))) return '疑问';
    if (/!!|！！/.test(s) || /(急|来不及|马上|立刻|赶紧)/.test(s)) return '急迫';
    if (/(快点|尽快|催|什么时候给|还没|几时能|之前给我|今天之内|下班前|拖了|等半天)/.test(s)) return '催促';
    if (/(怎么回事|搞什么|又出错|还是没|不是说了|失望|投诉|搞错|凭什么)/.test(s)) return '不满';
    if (/(算了|没办法|无语|唉|难搞|尴尬|服了)/.test(s) || /。。{2,}|\.{4,}/.test(s)) return '无奈';

    // ② 表情语义（保留原名的表情才有这个语义）
    if (/(\[旺柴\]|\[狗头\]|\[耶\]|\[呲牙\]|哈哈|hhh|233|笑死|开玩笑|乐死)/i.test(s)) return '调侃';

    // ③ 固定套语
    if (/(请|麻烦|谢谢|感谢|辛苦|拜托|您好)/.test(s)) return '客气';
    if (/(应该|可能|好像|我再问问|问问看|看情况|不确定|也许|再说吧)/.test(s)) return '犹豫';
    if (/(太好了|太棒|期待|激动|牛啊|厉害|👍|🎉)/.test(s)) return '兴奋';
    if (/(通知|根据|按照|特此|请于|经研究|关于)/.test(s) && s.length >= 20) return '正式';

    // ④ 句式与长度（短句才敢判定程度轻的）
    if (s.length <= 10 && /^(收到|好的|好|嗯+|行|ok|OK|明白|可以|是的)[。.!！]?$/.test(s)) return '确认';
    if (s.length <= 10 && /^(嗯+|哦+|好吧|随便|都行|知道了|行吧)[吧了呢。.!！]*$/.test(s)) return '敷衍';

    return null; // 证据不足：不标
  }

  // 这条算不算「关键消息」（仅关键消息模式用）
  function isKeyMessage(m) {
    var c = String((m && m.content) || '');
    if (/(你负责|记得|别忘|尽快|之前|今天|明天|后天|下周|周[一二三四五六日天]|点|号|元|决定|定了|风险|问题|确认|回复)/.test(c)) return true;
    if (/[?？!！]/.test(c)) return true;
    return false;
  }

  // 身份：保守推断，证据不够就是「未知」
  // 注意：合并过的消息里有多行，每行都单独算一次证据，否则合并会把证据吃掉
  function inferRoles(messages) {
    var stat = {};

    (messages || []).forEach(function (m) {
      var who = m.sender;
      if (!who) return;
      var st = stat[who] || (stat[who] = { assign: 0, ack: 0, ask: 0, polite: 0, total: 0 });

      String(m.content || '').split('\n').forEach(function (line) {
        var c = line.trim();
        if (!c) return;
        st.total++;

        if (/(你|您)们?.{0,10}(准备|做|跟|看|查|处理|对接|确认|发|出|整理|改|定|安排)/.test(c) &&
            /(前|之前|尽快|今天|明天|本周|下周)/.test(c)) st.assign++;
        if (/^(收到|好的|好|嗯+|行|ok|OK|明白|可以|是的)[。.!！]?$/.test(c)) st.ack++;
        if (/[?？]/.test(c)) st.ask++;
        if (/(请|麻烦|谢谢|感谢|辛苦|拜托|您好)/.test(c)) st.polite++;
      });
    });

    var roles = {};
    Object.keys(stat).forEach(function (who) {
      var st = stat[who];
      if (st.assign >= 2 && st.assign > st.ack) roles[who] = '领导';
      else if (st.ack >= 2 && st.assign === 0) roles[who] = '下属';
      else if (st.polite >= 2 && st.ask >= 1 && st.assign === 0) roles[who] = '客户';
      else if (st.ask >= 2 && st.assign === 0) roles[who] = '同事';
      else roles[who] = '未知';
    });
    return roles;
  }

  function hash(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  function toneId(m) {
    return (m.sender || '') + '|' + (m.time || m.timeRaw || '') + '|' + hash(m.content);
  }

  // 一次性推断整段对话
  function inferAll(messages, opts) {
    var scope = (opts && opts.scope) === 'all' ? 'all' : 'key';
    var deleted = (opts && opts.deleted) || {};
    var list = messages || [];
    var tones = {};
    var ids = {};
    var roles = inferRoles(list);

    list.forEach(function (m, i) {
      var label = inferTone(m.content);
      if (!label) return;
      if (scope === 'key' && !isKeyMessage(m)) return;

      var id = toneId(m);
      ids[i] = id;
      if (deleted[id]) return;   // 用户删掉过的，别再冒出来
      tones[i] = label;
    });

    return { tones: tones, ids: ids, roles: roles, scope: scope };
  }

  window.TONE = {
    TONES: TONES,
    ROLES: ROLES,
    inferTone: inferTone,
    inferRoles: inferRoles,
    inferAll: inferAll,
    isKeyMessage: isKeyMessage,
    toneId: toneId,
    hash: hash
  };
})();
