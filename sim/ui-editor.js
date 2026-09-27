/*
 * ui-editor.js — 간단한 코드 편집기 (textarea + 색칠 레이어)
 * -------------------------------------------------------------------------
 * 파일 탭, 줄 번호, C 구문 색칠, USER CODE 구역 표시, 오류 줄·현재 실행 줄 표시.
 */
(function (global) {
  'use strict';

  var KW = /\b(if|else|for|while|do|switch|case|default|break|continue|return|goto|sizeof|typedef|struct|union|enum|static|const|volatile|extern|register|inline)\b/g;
  var TY = /\b(void|char|short|int|long|float|double|signed|unsigned|bool|u?int(8|16|32|64)_t|size_t|[A-Z][A-Za-z0-9]*_(TypeDef|HandleTypeDef|InitTypeDef)|FILE)\b/g;
  var HAL = /\b(HAL_[A-Za-z0-9_]+|__HAL_[A-Za-z0-9_]+|MX_[A-Za-z0-9_]+|SystemClock_Config|Error_Handler|__disable_irq|__enable_irq|__NOP|__WFI)\b/g;
  var CON = /\b([A-Z][A-Z0-9]*_[A-Z0-9_]+|GPIO[A-H]|TIM\d+|USART\d|I2C\d|SPI\d|ADC\d|RCC|NULL|true|false|HAL_OK|HAL_ERROR)\b/g;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /** 한 줄 색칠 (블록 주석 상태를 넘겨받아 이어간다) */
  function hlLine(line, st) {
    var out = '', i = 0;
    while (i < line.length) {
      if (st.inComment) {
        var e = line.indexOf('*/', i);
        if (e < 0) { out += '<span class="tk-c">' + esc(line.slice(i)) + '</span>'; i = line.length; break; }
        out += '<span class="tk-c">' + esc(line.slice(i, e + 2)) + '</span>'; i = e + 2; st.inComment = false; continue;
      }
      var rest = line.slice(i), m;
      if (i === 0 && /^\s*#/.test(rest)) { out += '<span class="tk-p">' + esc(rest.replace(/(\/\/.*)$/, '')) + '</span>'; var cm = /(\/\/.*)$/.exec(rest); if (cm) out += '<span class="tk-c">' + esc(cm[1]) + '</span>'; i = line.length; break; }
      if (rest.indexOf('//') === 0) { out += '<span class="tk-c">' + esc(rest) + '</span>'; i = line.length; break; }
      if (rest.indexOf('/*') === 0) { st.inComment = true; continue; }
      if ((m = /^"(?:[^"\\]|\\.)*"?/.exec(rest)) || (m = /^'(?:[^'\\]|\\.)*'?/.exec(rest))) { out += '<span class="tk-s">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
      if ((m = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][-+]?\d+)?[uUlLfF]*)/.exec(rest))) { out += '<span class="tk-n">' + m[0] + '</span>'; i += m[0].length; continue; }
      if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
        var w = m[0], cls = '';
        if (w.match(KW) && w.replace(KW, '') === '') cls = 'tk-k';
        else if (w.replace(TY, '') === '') cls = 'tk-t';
        else if (w.replace(HAL, '') === '') cls = 'tk-h';
        else if (w.replace(CON, '') === '') cls = 'tk-n';
        else if (/^\s*\(/.test(rest.slice(w.length))) cls = 'tk-f';
        KW.lastIndex = TY.lastIndex = HAL.lastIndex = CON.lastIndex = 0;
        out += cls ? '<span class="' + cls + '">' + w + '</span>' : w; i += w.length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out;
  }

  function Editor(root, opts) {
    var self = this;
    this.opts = opts || {};
    this.files = {};        // name → { text, ro }
    this.order = [];
    this.cur = null;
    this.errLine = 0; this.curLine = 0;
    root.innerHTML = '<div class="editor-tabs"></div><div class="editor-body"><div class="ed-scroll"><div class="ed-inner"><div class="ed-gutter"></div>' +
      '<div class="ed-layer"><pre class="ed-pre"></pre><textarea class="ed-ta" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div></div></div></div>' +
      '<div class="editor-status"><span class="pos">Ln 1, Col 1</span><span class="fname"></span><span class="ro-note"></span><span class="grow"></span><span class="note">USER CODE 구역(초록 표시)에 코드를 쓰면 코드 생성 후에도 남습니다</span></div>';
    this.tabs = root.querySelector('.editor-tabs');
    this.gutter = root.querySelector('.ed-gutter');
    this.pre = root.querySelector('.ed-pre');
    this.ta = root.querySelector('.ed-ta');
    this.scroll = root.querySelector('.ed-scroll');
    this.status = root.querySelector('.editor-status');
    this.ta.addEventListener('input', function () { self.files[self.cur].text = self.ta.value; self.render(); self.opts.onChange && self.opts.onChange(self.cur, self.ta.value); });
    this.ta.addEventListener('keydown', function (e) { self.key(e); });
    this.ta.addEventListener('keyup', function () { self.pos(); });
    this.ta.addEventListener('click', function () { self.pos(); });
    this.ta.addEventListener('scroll', function () { self.scroll.scrollTop = self.ta.scrollTop; });
  }
  Editor.prototype.open = function (name, text, ro) {
    if (!this.files[name]) this.order.push(name);
    this.files[name] = { text: text, ro: !!ro };
    if (!this.cur) this.show(name);
    else if (this.cur === name) { this.ta.value = text; this.render(); }
    this.renderTabs();
  };
  Editor.prototype.close = function (name) { delete this.files[name]; this.order = this.order.filter(function (n) { return n !== name; }); if (this.cur === name) { this.cur = null; if (this.order.length) this.show(this.order[0]); } this.renderTabs(); };
  Editor.prototype.get = function (name) { return this.files[name] ? this.files[name].text : ''; };
  Editor.prototype.show = function (name) {
    if (!this.files[name]) return;
    this.cur = name; this.ta.value = this.files[name].text; this.ta.readOnly = this.files[name].ro;
    this.status.querySelector('.fname').textContent = name;
    this.status.querySelector('.ro-note').textContent = this.files[name].ro ? '읽기 전용 (드라이버 파일)' : '';
    this.renderTabs(); this.render(); this.pos();
  };
  Editor.prototype.renderTabs = function () {
    var self = this;
    this.tabs.innerHTML = this.order.map(function (n) {
      return '<span class="etab' + (n === self.cur ? ' active' : '') + (self.files[n].ro ? ' ro' : '') + '" data-f="' + n + '">' + n.split('/').pop() + '</span>';
    }).join('');
    this.tabs.querySelectorAll('.etab').forEach(function (t) { t.onclick = function () { self.show(t.dataset.f); }; });
  };
  Editor.prototype.render = function () {
    var lines = this.ta.value.split('\n'), st = { inComment: false }, html = [], gut = [], inUser = false, self = this;
    lines.forEach(function (l, i) {
      var n = i + 1, cls = '';
      if (/USER CODE END/.test(l)) inUser = false;
      if (inUser) cls = 'l-user';
      if (n === self.errLine) cls = 'l-err'; else if (n === self.curLine) cls = 'l-cur';
      var h = hlLine(l, st) || ' ';
      html.push(cls ? '<span class="' + cls + '">' + h + '</span>' : h);
      gut.push('<div class="' + (n === self.errLine ? 'err' : n === self.curLine ? 'cur' : inUser ? 'user' : '') + '">' + n + '</div>');
      if (/USER CODE BEGIN/.test(l)) inUser = true;
    });
    this.pre.innerHTML = html.join('\n') + '\n';
    this.gutter.innerHTML = gut.join('');
    this.ta.style.height = this.pre.offsetHeight + 'px';
  };
  Editor.prototype.pos = function () {
    var v = this.ta.value.slice(0, this.ta.selectionStart), ln = v.split('\n');
    this.status.querySelector('.pos').textContent = 'Ln ' + ln.length + ', Col ' + (ln[ln.length - 1].length + 1);
  };
  Editor.prototype.key = function (e) {
    var ta = this.ta;
    if (e.key === 'Tab') {
      e.preventDefault(); var s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2;
      ta.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter') {
      e.preventDefault(); var st = ta.selectionStart, line = ta.value.slice(0, st).split('\n').pop(), ind = /^\s*/.exec(line)[0];
      if (/\{\s*$/.test(line)) ind += '  ';
      ta.value = ta.value.slice(0, st) + '\n' + ind + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = st + 1 + ind.length;
      ta.dispatchEvent(new Event('input'));
    } else if (e.key === '}' ) {
      var st2 = ta.selectionStart, ln2 = ta.value.slice(0, st2).split('\n').pop();
      if (/^\s{2,}$/.test(ln2)) { ta.value = ta.value.slice(0, st2 - 2) + ta.value.slice(st2); ta.selectionStart = ta.selectionEnd = st2 - 2; }
    }
  };
  Editor.prototype.markError = function (file, line) {
    this.errLine = line || 0; if (file && this.files[file]) this.show(file); else this.render();
    if (line) this.gotoLine(line);
  };
  Editor.prototype.markCurrent = function (line) { if (line === this.curLine) return; this.curLine = line || 0; this.render(); };
  Editor.prototype.gotoLine = function (line) {
    var lines = this.ta.value.split('\n'), off = 0; for (var i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
    this.ta.focus(); this.ta.setSelectionRange(off, off + (lines[line - 1] || '').length);
    this.scroll.scrollTop = Math.max(0, (line - 6) * 20);
  };

  global.SimEditor = Editor;
  global.SimHighlight = function (src) { var st = { inComment: false }; return src.split('\n').map(function (l) { return hlLine(l, st); }).join('\n'); };
})(window);
