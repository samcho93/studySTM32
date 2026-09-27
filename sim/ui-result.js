/*
 * ui-result.js — 실습 결과 영역: 장치 · 시리얼 터미널 · 파형 · 변수 · 콘솔
 */
(function (global) {
  'use strict';
  var DEV = global.STM32Devices;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  var LED_RGB = { red: '255,59,48', green: '52,199,89', yellow: '255,204,0', blue: '10,132,255', white: '240,240,240' };
  var FONT5x8 = null;

  function Result(app) {
    this.app = app;
    this.devRoot = document.getElementById('devices'); this.termRoot = document.getElementById('terminals');
    this.waveRoot = document.getElementById('wave'); this.varsRoot = document.getElementById('vars'); this.conRoot = document.getElementById('console');
    this.cards = {}; this.terms = {}; this.conCount = 0;
    this.waveRoot.innerHTML = '<div class="wave-ctl"><span>핀:</span><span id="wave-pins"></span><label>표시 폭 <select id="wave-span"><option value="5">5 ms</option><option value="20">20 ms</option><option value="100">100 ms</option><option value="500" selected>500 ms</option><option value="2000">2 s</option><option value="5000">5 s</option></select></label>' +
      '<label><input type="checkbox" id="wave-freeze"> 멈춤</label></div><canvas id="wave-canvas"></canvas>';
    this.waveCanvas = document.getElementById('wave-canvas');
    this.wavePins = [];
  }

  // ---------------------------------------------------------------- 장치 카드
  Result.prototype.build = function () {
    var self = this, app = this.app; this.devRoot.innerHTML = ''; this.cards = {}; this.termRoot.innerHTML = ''; this.terms = {};
    var list = app.devices || [];
    if (!list.length) { this.devRoot.innerHTML = '<div class="dev-empty">회로에 장치가 없습니다.<br>디자인 영역 → 회로 탭에서 장치를 추가하세요.</div>'; }
    list.forEach(function (inst) {
      var n = inst.node, d = inst.def, card = document.createElement('div');
      card.className = 'dev'; card.dataset.id = n.id;
      var pins = d.ports.map(function (p) { return n.conn && n.conn[p.id] ? p.id + ':' + n.conn[p.id] : null; }).filter(Boolean).join(' ');
      card.innerHTML = '<div class="dev-h"><span>' + esc((n.props && (n.props.label || n.props.name)) || d.name) + '</span><span class="pins">' + esc(pins) + '</span></div><div class="dev-b"></div>';
      card.querySelector('.dev-h').onclick = function () { app.canvas.select({ kind: 'node', id: n.id }); };
      var body = card.querySelector('.dev-b'), r = self['b_' + (d.type === 'board-led' ? 'led' : d.type === 'board-button' ? 'button' : d.type === 'vcp' ? 'uart' : d.type)];
      if (r) r.call(self, body, inst);
      self.devRoot.appendChild(card); self.cards[n.id] = { el: card, body: body, inst: inst };
    });
    this.buildWavePins();
  };
  Result.prototype.update = function () {
    var self = this;
    Object.keys(this.cards).forEach(function (id) {
      var c = self.cards[id], t = c.inst.def.type; t = t === 'board-led' ? 'led' : t === 'board-button' ? 'button' : t === 'vcp' ? 'uart' : t;
      var u = self['u_' + t]; if (u) u.call(self, c.body, c.inst, c.inst.state());
    });
  };

  Result.prototype.b_led = function (b, inst) { b.innerHTML = '<div class="led-dot"></div><div class="dev-v"></div>'; };
  Result.prototype.u_led = function (b, inst, s) {
    var rgb = LED_RGB[s.color] || LED_RGB.red, on = Math.max(0, Math.min(1, s.on)), dot = b.firstChild;
    dot.style.background = 'rgba(' + rgb + ',' + (0.18 + 0.82 * on) + ')'; dot.style.boxShadow = on > .05 ? '0 0 ' + (6 + 16 * on) + 'px rgba(' + rgb + ',' + (0.9 * on) + ')' : 'none';
    b.lastChild.textContent = on >= .995 ? 'ON' : on <= .005 ? 'OFF' : (on * 100).toFixed(0) + '%';
  };
  Result.prototype.b_rgb = function (b) { b.innerHTML = '<div class="rgb-dot"></div><div class="dev-v"></div>'; };
  Result.prototype.u_rgb = function (b, inst, s) {
    var r = Math.round(s.r * 255), g = Math.round(s.g * 255), bl = Math.round(s.b * 255), mx = Math.max(s.r, s.g, s.b);
    b.firstChild.style.background = 'rgb(' + r + ',' + g + ',' + bl + ')'; b.firstChild.style.boxShadow = mx > .05 ? '0 0 18px rgba(' + r + ',' + g + ',' + bl + ',.8)' : 'none';
    b.lastChild.textContent = 'R' + r + ' G' + g + ' B' + bl;
  };
  Result.prototype.b_button = function (b, inst) {
    b.innerHTML = '<button class="btn-cap" type="button"><span></span></button><div class="dev-v"></div>';
    var cap = b.firstChild, down = function (e) { e.preventDefault(); inst.press(true); }, up = function (e) { e.preventDefault(); inst.press(false); };
    cap.addEventListener('mousedown', down); cap.addEventListener('mouseup', up); cap.addEventListener('mouseleave', function () { if (inst.prop('mode') !== 'toggle' && inst.pressed) inst.press(false); });
    cap.addEventListener('touchstart', down, { passive: false }); cap.addEventListener('touchend', up);
    cap.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!inst.pressed) inst.press(true); } });
    cap.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') inst.press(false); });
  };
  Result.prototype.u_button = function (b, inst, s) { b.firstChild.classList.toggle('down', s.pressed); b.lastChild.textContent = (s.pressed ? '누름' : '뗌') + ' · 핀 ' + (s.level ? 'HIGH' : 'LOW'); };
  Result.prototype.b_pot = function (b, inst) {
    b.innerHTML = '<input type="range" class="dev-range knob" min="0" max="4095"><div class="dev-v"></div>';
    b.firstChild.value = inst.prop('value'); b.firstChild.oninput = function () { inst.set(+this.value); };
  };
  Result.prototype.u_pot = function (b, inst, s) { if (document.activeElement !== b.firstChild) b.firstChild.value = s.value; b.lastChild.textContent = s.value + ' / 4095 · ' + s.volt.toFixed(2) + ' V'; };
  Result.prototype.b_ldr = function (b, inst) {
    b.innerHTML = '<input type="range" class="dev-range knob" min="0" max="1000"><div class="dev-v"></div>';
    b.firstChild.value = inst.prop('lux'); b.firstChild.oninput = function () { inst.set(+this.value); };
  };
  Result.prototype.u_ldr = function (b, inst, s) { if (document.activeElement !== b.firstChild) b.firstChild.value = s.lux; b.lastChild.textContent = s.lux + ' lux'; };
  Result.prototype.b_buzzer = function (b) { b.innerHTML = '<div class="buzz">🔔</div><div class="dev-v"></div>'; };
  Result.prototype.u_buzzer = function (b, inst, s) {
    b.firstChild.classList.toggle('on', s.on); b.lastChild.textContent = s.on ? (s.freq ? Math.round(s.freq) + ' Hz' : '삐—') : '조용';
    this.app.audio(inst.node.id, s.on && inst.prop('sound') ? s.freq : 0);
  };
  Result.prototype.b_fnd = function (b) {
    b.innerHTML = '<svg class="fnd" viewBox="0 0 70 110">' +
      '<polygon data-s="a" points="14,8 56,8 50,14 20,14"/><polygon data-s="b" points="58,10 58,52 52,46 52,16"/><polygon data-s="c" points="58,58 58,100 52,94 52,64"/>' +
      '<polygon data-s="d" points="14,102 56,102 50,96 20,96"/><polygon data-s="e" points="12,58 12,100 18,94 18,64"/><polygon data-s="f" points="12,10 12,52 18,46 18,16"/>' +
      '<polygon data-s="g" points="16,55 20,51 50,51 54,55 50,59 20,59"/><circle data-s="dp" cx="65" cy="100" r="4"/></svg><div class="dev-v"></div>';
  };
  Result.prototype.u_fnd = function (b, inst, s) {
    var on = '';
    b.querySelectorAll('[data-s]').forEach(function (p) { var v = s.seg[p.dataset.s] > .5; p.classList.toggle('on', v); if (v && p.dataset.s !== 'dp') on += p.dataset.s; });
    var DIG = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9', abcefg: 'A', cdefg: 'b', adef: 'C', bcdeg: 'd', adefg: 'E', aefg: 'F' };
    b.lastChild.textContent = DIG[on] != null ? '"' + DIG[on] + '"' + (s.seg.dp > .5 ? '.' : '') : (on ? on : '꺼짐');
  };
  Result.prototype.b_lcd1602 = function (b, inst) {
    var html = '<div class="lcd">';
    for (var r = 0; r < 2; r++) { html += '<div class="lcd-row">'; for (var c = 0; c < 16; c++) { html += '<div class="lcd-cell">'; for (var k = 0; k < 40; k++) html += '<i></i>'; html += '</div>'; } html += '</div>'; }
    b.innerHTML = html + '</div><div class="dev-v"></div>';
  };
  Result.prototype.u_lcd1602 = function (b, inst, s) {
    var lcd = b.firstChild; lcd.className = 'lcd ' + s.color + (s.backlight && s.display ? '' : ' off');
    var rows = lcd.querySelectorAll('.lcd-row'), blinkOn = (Date.now() >> 9) & 1;
    for (var r = 0; r < 2; r++) {
      var cells = rows[r].children;
      for (var c = 0; c < 16; c++) {
        var code = s.display ? s.rows[r][c] : 32, glyph = code < 8 ? cgGlyph(s.cgram, code) : font(code);
        var addr = (r ? 0x40 : 0) + c, isCur = s.cursor === addr, dots = cells[c].children;
        cells[c].classList.toggle('cur', isCur);
        for (var k = 0; k < 40; k++) {
          var on = (glyph[k >> 3 >> 0] || 0) & 0; // placeholder
          var row = Math.floor(k / 5), col = k % 5; on = (glyph[row] >> (4 - col)) & 1;
          if (isCur && s.blink && blinkOn) on = 1; if (isCur && !s.blink && row === 7) on = 1;
          dots[k].className = on ? 'on' : '';
        }
      }
    }
    b.lastChild.textContent = '주소 0x' + inst.i2cAddr().toString(16).toUpperCase() + (s.backlight ? ' · 백라이트' : ' · 백라이트 꺼짐');
  };
  function cgGlyph(cg, code) { var o = []; for (var i = 0; i < 8; i++) o.push(cg[code * 8 + i] & 31); return o; }
  function font(code) {
    if (!FONT5x8) FONT5x8 = buildFont();
    return FONT5x8[code] || FONT5x8[63];
  }
  function buildFont() {
    // 5x8 글리프 (각 행 5비트, MSB = 왼쪽). 기본 ASCII 32–126.
    var F = {}, D = {
      32: '00000 00000 00000 00000 00000 00000 00000', 33: '00100 00100 00100 00100 00000 00000 00100', 34: '01010 01010 01010 00000 00000 00000 00000',
      35: '01010 01010 11111 01010 11111 01010 01010', 36: '00100 01111 10100 01110 00101 11110 00100', 37: '11000 11001 00010 00100 01000 10011 00011',
      38: '01100 10010 10100 01000 10101 10010 01101', 39: '01100 00100 01000 00000 00000 00000 00000', 40: '00010 00100 01000 01000 01000 00100 00010',
      41: '01000 00100 00010 00010 00010 00100 01000', 42: '00000 00100 10101 01110 10101 00100 00000', 43: '00000 00100 00100 11111 00100 00100 00000',
      44: '00000 00000 00000 00000 01100 00100 01000', 45: '00000 00000 00000 11111 00000 00000 00000', 46: '00000 00000 00000 00000 00000 01100 01100',
      47: '00000 00001 00010 00100 01000 10000 00000', 48: '01110 10001 10011 10101 11001 10001 01110', 49: '00100 01100 00100 00100 00100 00100 01110',
      50: '01110 10001 00001 00010 00100 01000 11111', 51: '11111 00010 00100 00010 00001 10001 01110', 52: '00010 00110 01010 10010 11111 00010 00010',
      53: '11111 10000 11110 00001 00001 10001 01110', 54: '00110 01000 10000 11110 10001 10001 01110', 55: '11111 00001 00010 00100 01000 01000 01000',
      56: '01110 10001 10001 01110 10001 10001 01110', 57: '01110 10001 10001 01111 00001 00010 01100', 58: '00000 01100 01100 00000 01100 01100 00000',
      59: '00000 01100 01100 00000 01100 00100 01000', 60: '00010 00100 01000 10000 01000 00100 00010', 61: '00000 00000 11111 00000 11111 00000 00000',
      62: '01000 00100 00010 00001 00010 00100 01000', 63: '01110 10001 00001 00010 00100 00000 00100', 64: '01110 10001 00001 01101 10101 10101 01110',
      65: '01110 10001 10001 10001 11111 10001 10001', 66: '11110 10001 10001 11110 10001 10001 11110', 67: '01110 10001 10000 10000 10000 10001 01110',
      68: '11100 10010 10001 10001 10001 10010 11100', 69: '11111 10000 10000 11110 10000 10000 11111', 70: '11111 10000 10000 11110 10000 10000 10000',
      71: '01110 10001 10000 10111 10001 10001 01111', 72: '10001 10001 10001 11111 10001 10001 10001', 73: '01110 00100 00100 00100 00100 00100 01110',
      74: '00111 00010 00010 00010 00010 10010 01100', 75: '10001 10010 10100 11000 10100 10010 10001', 76: '10000 10000 10000 10000 10000 10000 11111',
      77: '10001 11011 10101 10101 10001 10001 10001', 78: '10001 10001 11001 10101 10011 10001 10001', 79: '01110 10001 10001 10001 10001 10001 01110',
      80: '11110 10001 10001 11110 10000 10000 10000', 81: '01110 10001 10001 10001 10101 10010 01101', 82: '11110 10001 10001 11110 10100 10010 10001',
      83: '01111 10000 10000 01110 00001 00001 11110', 84: '11111 00100 00100 00100 00100 00100 00100', 85: '10001 10001 10001 10001 10001 10001 01110',
      86: '10001 10001 10001 10001 10001 01010 00100', 87: '10001 10001 10001 10101 10101 10101 01010', 88: '10001 10001 01010 00100 01010 10001 10001',
      89: '10001 10001 10001 01010 00100 00100 00100', 90: '11111 00001 00010 00100 01000 10000 11111', 91: '01110 01000 01000 01000 01000 01000 01110',
      92: '10001 01010 11111 00100 11111 00100 00100', 93: '01110 00010 00010 00010 00010 00010 01110', 94: '00100 01010 10001 00000 00000 00000 00000',
      95: '00000 00000 00000 00000 00000 00000 11111', 96: '01000 00100 00010 00000 00000 00000 00000', 97: '00000 00000 01110 00001 01111 10001 01111',
      98: '10000 10000 10110 11001 10001 10001 11110', 99: '00000 00000 01110 10000 10000 10001 01110', 100: '00001 00001 01101 10011 10001 10001 01111',
      101: '00000 00000 01110 10001 11111 10000 01110', 102: '00110 01001 01000 11100 01000 01000 01000', 103: '00000 01111 10001 10001 01111 00001 01110',
      104: '10000 10000 10110 11001 10001 10001 10001', 105: '00100 00000 01100 00100 00100 00100 01110', 106: '00010 00000 00110 00010 00010 10010 01100',
      107: '10000 10000 10010 10100 11000 10100 10010', 108: '01100 00100 00100 00100 00100 00100 01110', 109: '00000 00000 11010 10101 10101 10001 10001',
      110: '00000 00000 10110 11001 10001 10001 10001', 111: '00000 00000 01110 10001 10001 10001 01110', 112: '00000 00000 11110 10001 11110 10000 10000',
      113: '00000 00000 01101 10011 01111 00001 00001', 114: '00000 00000 10110 11001 10000 10000 10000', 115: '00000 00000 01110 10000 01110 00001 11110',
      116: '01000 01000 11100 01000 01000 01001 00110', 117: '00000 00000 10001 10001 10001 10011 01101', 118: '00000 00000 10001 10001 10001 01010 00100',
      119: '00000 00000 10001 10001 10101 10101 01010', 120: '00000 00000 10001 01010 00100 01010 10001', 121: '00000 00000 10001 10001 01111 00001 01110',
      122: '00000 00000 11111 00010 00100 01000 11111', 123: '00010 00100 00100 01000 00100 00100 00010', 124: '00100 00100 00100 00100 00100 00100 00100',
      125: '01000 00100 00100 00010 00100 00100 01000', 126: '00000 00100 00010 11111 00010 00100 00000', 223: '11100 10100 11100 00000 00000 00000 00000', 255: '11111 11111 11111 11111 11111 11111 11111'
    };
    Object.keys(D).forEach(function (k) { F[k] = D[k].split(' ').map(function (r) { return parseInt(r, 2); }); F[k].push(0); });
    return F;
  }
  Result.prototype.b_motor = function (b) {
    b.innerHTML = '<svg class="motor-vis" viewBox="0 0 90 90"><circle cx="45" cy="45" r="36" fill="var(--bg-elev-2)" stroke="var(--border)" stroke-width="3"/>' +
      '<g class="rotor"><circle cx="45" cy="45" r="26" fill="none" stroke="var(--text-faint)" stroke-width="6" stroke-dasharray="14 12"/><circle cx="45" cy="45" r="6" fill="var(--text-dim)"/><path d="M45 19v14" stroke="var(--danger)" stroke-width="4" stroke-linecap="round"/></g></svg><div class="dev-v"></div>';
  };
  Result.prototype.u_motor = function (b, inst, s) {
    b.querySelector('.rotor').style.transform = 'rotate(' + s.angle + 'deg)';
    b.lastChild.textContent = (s.brake ? '브레이크' : Math.abs(s.rpm) < 1 ? '정지' : (s.rpm > 0 ? '정방향 ' : '역방향 ') + Math.abs(s.rpm).toFixed(0) + ' rpm');
  };
  Result.prototype.b_servo = function (b) {
    b.innerHTML = '<svg class="servo-vis" viewBox="0 0 120 80"><rect x="30" y="50" width="60" height="26" rx="4" fill="var(--bg-elev-2)" stroke="var(--border)"/>' +
      '<path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--border)" stroke-dasharray="3 3"/><g class="arm"><rect x="57" y="18" width="6" height="44" rx="3" fill="var(--accent)"/><circle cx="60" cy="60" r="7" fill="var(--text-dim)"/></g></svg><div class="dev-v"></div>';
  };
  Result.prototype.u_servo = function (b, inst, s) {
    b.querySelector('.arm').style.transform = 'rotate(' + (s.angle - 90) + 'deg)';
    b.lastChild.textContent = s.valid ? s.angle.toFixed(0) + '° · ' + Math.round(s.us) + ' µs @ ' + s.freq.toFixed(0) + ' Hz' : (s.freq ? '주파수 ' + s.freq.toFixed(0) + ' Hz (50 Hz 필요)' : 'PWM 없음');
  };
  Result.prototype.b_stepper = function (b) {
    b.innerHTML = '<svg class="stepper-vis" viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" fill="var(--bg-elev-2)" stroke="var(--border)" stroke-width="3"/>' +
      '<g class="rotor"><circle cx="45" cy="45" r="22" fill="none" stroke="var(--text-faint)" stroke-width="4"/><path d="M45 23v22" stroke="var(--danger)" stroke-width="4" stroke-linecap="round"/></g></svg>' +
      '<div class="coils"><i></i><i></i><i></i><i></i></div><div class="dev-v"></div>';
  };
  Result.prototype.u_stepper = function (b, inst, s) {
    b.querySelector('.rotor').style.transform = 'rotate(' + s.angle + 'deg)';
    b.querySelectorAll('.coils i').forEach(function (c, k) { c.classList.toggle('on', !!(s.pattern >> k & 1)); });
    b.lastChild.textContent = s.angle.toFixed(1) + '° · ' + s.steps + ' step · ' + s.rate.toFixed(0) + ' step/s' + (s.err ? ' · 순서 오류 ' + s.err : '');
  };
  Result.prototype.b_uart = function (b, inst) {
    var t = document.createElement('div'); t.className = 'terminal';
    t.innerHTML = '<div class="terminal-h"><span>' + esc(inst.prop('name')) + '</span><span class="type"></span><span class="mm"></span><button class="tb" data-a="clear">지우기</button></div><div class="terminal-out"></div>' +
      '<div class="terminal-in"><input type="text" placeholder="MCU 로 보낼 문자열 (Enter)"><button class="tb">전송</button></div>';
    var out = t.querySelector('.terminal-out'), inp = t.querySelector('input');
    t.querySelector('[data-a=clear]').onclick = function () { out.textContent = ''; };
    function send() { if (!inp.value.length) return; var s = document.createElement('span'); s.className = 'rx'; s.textContent = '⇐ ' + inp.value + '\n'; out.appendChild(s); out.scrollTop = out.scrollHeight; inst.send(inp.value); inp.value = ''; }
    inp.onkeydown = function (e) { if (e.key === 'Enter') send(); }; t.querySelector('.terminal-in .tb').onclick = send;
    this.termRoot.appendChild(t); this.terms[inst.node.id] = { el: t, out: out, inst: inst, dec: new TextDecoder('utf-8', { fatal: false }), pend: [] };
    b.innerHTML = '<div class="dev-v">시리얼 터미널 탭에서 확인</div><div class="pcode" style="width:180px;max-height:60px;overflow:hidden;font-size:10px"></div>';
  };
  Result.prototype.u_uart = function (b, inst, s) {
    var t = this.terms[inst.node.id]; if (!t) return;
    t.el.querySelector('.type').textContent = s.baud + ' bps'; t.el.querySelector('.mm').textContent = s.mismatch ? '보레이트 불일치 — 글자가 깨집니다' : '';
    b.lastChild.textContent = t.out.textContent.slice(-120);
  };
  Result.prototype.termWrite = function (inst, bytes) {
    var t = this.terms[inst.node.id]; if (!t) return;
    var txt = t.dec.decode(new Uint8Array(bytes), { stream: true }).replace(/\r/g, '');
    t.out.appendChild(document.createTextNode(txt));
    if (t.out.textContent.length > 20000) t.out.textContent = t.out.textContent.slice(-12000);
    t.out.scrollTop = t.out.scrollHeight;
  };
  Result.prototype.b_i2cdev = function (b) { b.innerHTML = '<div class="dev-v"></div><div class="dev-log"></div>'; };
  Result.prototype.u_i2cdev = function (b, inst, s) { b.firstChild.textContent = s.name + ' @0x' + s.addr.toString(16).toUpperCase() + ' · ptr 0x' + s.ptr.toString(16); b.lastChild.textContent = s.log.slice(-6).join('\n') || '(통신 없음)'; };
  Result.prototype.b_spidev = function (b) { b.innerHTML = '<div class="dev-v"></div><div class="dev-log"></div>'; };
  Result.prototype.u_spidev = function (b, inst, s) { b.firstChild.textContent = s.name + (s.selected ? ' · 선택됨(CS=L)' : ' · CS=H'); b.lastChild.textContent = 'MOSI→MISO\n' + (s.log.slice(-8).join('\n') || '(통신 없음)'); };
  Result.prototype.b_logic = function (b, inst) { b.innerHTML = '<canvas class="mini-wave" width="400" height="140"></canvas><div class="dev-v">파형 탭에서 크게 보기</div>'; };
  Result.prototype.u_logic = function (b, inst, s) {
    var pins = s.chans.map(function (c) { return c.pin; }).filter(Boolean);
    this.drawWave(b.firstChild, pins, s.span, 400, 140);
  };

  // ---------------------------------------------------------------- 확장 장치
  function holdable(el, down, up) {
    var on = false;
    function d(e) { e.preventDefault(); if (!on) { on = true; down(); } }
    function u(e) { if (e) e.preventDefault(); if (on) { on = false; up(); } }
    el.addEventListener('mousedown', d); el.addEventListener('mouseup', u); el.addEventListener('mouseleave', function () { u(); });
    el.addEventListener('touchstart', d, { passive: false }); el.addEventListener('touchend', u); el.addEventListener('touchcancel', u);
    el.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') d(e); });
    el.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') u(e); });
  }
  // SSD1306 OLED
  var OLED_COL = { white: [235, 242, 255], blue: [110, 200, 255], yellow: [255, 214, 70] };
  Result.prototype.b_oled = function (b) {
    b.innerHTML = '<div class="oled"><canvas width="128" height="64"></canvas></div><div class="dev-v"></div>';
    b._ver = -1;
  };
  Result.prototype.u_oled = function (b, inst, s) {
    var cv = b.querySelector('canvas'), key = s.ver + '|' + s.on + '|' + s.color + '|' + s.contrast;
    if (b._ver !== key) {
      b._ver = key;
      var ctx = cv.getContext('2d'), img = ctx.createImageData(128, 64), d = img.data, a = 0.45 + 0.55 * (s.contrast / 255);
      for (var y = 0; y < 64; y++) {
        var c = s.color === 'white' ? OLED_COL.white : s.color === 'yb' && y < 16 ? OLED_COL.yellow : OLED_COL.blue;
        for (var x = 0; x < 128; x++) {
          var k = (y * 128 + x) * 4, px = s.on && inst.pixel(x, y);
          d[k] = px ? c[0] * a : 6; d[k + 1] = px ? c[1] * a : 8; d[k + 2] = px ? c[2] * a : 12; d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    b.firstChild.classList.toggle('off', !s.on);
    var addr = '0x' + inst.i2cAddr().toString(16).toUpperCase();
    b.lastChild.textContent = !s.cmds && !s.bytes ? addr + ' · 수신 없음 (초기화 명령을 보내세요)'
      : !s.disp ? addr + ' · 디스플레이 꺼짐 (0xAF 필요)'
      : !s.pump ? addr + ' · 차지 펌프 꺼짐 (0x8D, 0x14 필요)'
      : addr + ' · ' + { H: '수평', V: '수직', P: '페이지' }[s.mode] + ' 주소 모드 · 켜진 픽셀 ' + s.lit + (s.invert ? ' · 반전' : '');
  };
  // HC-SR04
  Result.prototype.b_ultrasonic = function (b, inst) {
    b.innerHTML = '<svg class="us-vis" viewBox="0 0 200 60"><rect x="2" y="10" width="62" height="40" rx="5" fill="#1d5fa8"/>' +
      '<circle cx="18" cy="30" r="12" fill="#c9ced6" stroke="#6b7587" stroke-width="2"/><circle cx="48" cy="30" r="12" fill="#c9ced6" stroke="#6b7587" stroke-width="2"/>' +
      '<g class="us-wave" fill="none" stroke="var(--accent)" stroke-width="1.6"><path d="M72 20 q6 10 0 20"/><path d="M80 15 q9 15 0 30"/><path d="M88 10 q12 20 0 40"/></g>' +
      '<rect class="us-obj" x="180" y="6" width="10" height="48" rx="2" fill="var(--text-dim)"/><line class="us-line" x1="66" y1="56" x2="180" y2="56" stroke="var(--border)" stroke-dasharray="3 3"/></svg>' +
      '<input type="range" class="dev-range knob" min="2" max="400"><div class="dev-v"></div>';
    var r = b.querySelector('input'); r.value = inst.prop('distance'); r.oninput = function () { inst.set(+this.value); };
  };
  Result.prototype.u_ultrasonic = function (b, inst, s) {
    var r = b.querySelector('input'); if (document.activeElement !== r) r.value = s.cm;
    var x = 74 + (s.cm - 2) / 398 * 106; b.querySelector('.us-obj').setAttribute('x', x); b.querySelector('.us-line').setAttribute('x2', x);
    b.querySelector('.us-wave').style.opacity = s.echo ? 1 : .25;
    b.lastChild.textContent = s.cm + ' cm · ECHO ' + (s.echoUs ? Math.round(s.echoUs) + ' µs' : '—') + ' · 측정 ' + s.pings + '회';
  };
  // 4x4 키패드
  Result.prototype.b_keypad = function (b, inst) {
    var html = '<div class="kp">';
    inst.keys.forEach(function (row) { row.split('').forEach(function (k) { html += '<button type="button" class="kp-k' + (/[A-D]/.test(k) ? ' fn' : '') + '" data-k="' + k + '">' + k + '</button>'; }); });
    b.innerHTML = html + '</div><div class="dev-v"></div>';
    b.querySelectorAll('.kp-k').forEach(function (el) { holdable(el, function () { inst.press(el.dataset.k, true); }, function () { inst.press(el.dataset.k, false); }); });
  };
  Result.prototype.u_keypad = function (b, inst, s) {
    b.querySelectorAll('.kp-k').forEach(function (el) { el.classList.toggle('down', s.held.indexOf(el.dataset.k) >= 0); });
    b.lastChild.textContent = s.held ? '누름: ' + s.held : s.last ? '마지막 키: ' + s.last : '키를 누르고 있으세요';
  };
  // 4자리 FND
  var FND_RGB = { red: '255,59,48', green: '52,199,89', blue: '64,156,255', yellow: '255,204,0' };
  var SEG_SHAPES = '<polygon data-s="0" points="14,8 56,8 50,14 20,14"/><polygon data-s="1" points="58,10 58,52 52,46 52,16"/><polygon data-s="2" points="58,58 58,100 52,94 52,64"/>' +
    '<polygon data-s="3" points="14,102 56,102 50,96 20,96"/><polygon data-s="4" points="12,58 12,100 18,94 18,64"/><polygon data-s="5" points="12,10 12,52 18,46 18,16"/>' +
    '<polygon data-s="6" points="16,55 20,51 50,51 54,55 50,59 20,59"/><circle data-s="7" cx="65" cy="100" r="4"/>';
  Result.prototype.b_fnd4 = function (b) {
    var g = ''; for (var d = 0; d < 4; d++) g += '<g data-d="' + d + '" transform="translate(' + (4 + d * 76) + ',4) skewX(-6)">' + SEG_SHAPES + '</g>';
    b.innerHTML = '<svg class="fnd4" viewBox="0 0 316 116">' + g + '</svg><div class="dev-v"></div>';
  };
  Result.prototype.u_fnd4 = function (b, inst, s) {
    var rgb = FND_RGB[s.color] || FND_RGB.red;
    b.querySelectorAll('.fnd4 g').forEach(function (g) {
      var row = s.digits[+g.dataset.d];
      g.querySelectorAll('[data-s]').forEach(function (p) {
        var v = row[+p.dataset.s];
        p.style.fill = v > .03 ? 'rgba(' + rgb + ',' + (0.25 + 0.75 * v).toFixed(2) + ')' : '';
        p.style.filter = v > .5 ? 'drop-shadow(0 0 3px rgba(' + rgb + ',.8))' : '';
      });
    });
    b.lastChild.textContent = '"' + s.text + '"';
  };
  // DHT11
  Result.prototype.b_dht11 = function (b, inst) {
    b.innerHTML = '<div class="dht"><div class="dht-body"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="dht-ctl"><label>온도 <b data-v="temp"></b><input type="range" class="dev-range" min="0" max="50" data-k="temp"></label>' +
      '<label>습도 <b data-v="hum"></b><input type="range" class="dev-range" min="20" max="90" data-k="hum"></label></div></div><div class="dev-v"></div>';
    b.querySelectorAll('input').forEach(function (r) { r.value = inst.prop(r.dataset.k); r.oninput = function () { inst.set(r.dataset.k, +r.value); }; });
  };
  Result.prototype.u_dht11 = function (b, inst, s) {
    b.querySelectorAll('input').forEach(function (r) { if (document.activeElement !== r) r.value = s[r.dataset.k]; });
    b.querySelector('[data-v=temp]').textContent = s.temp + ' °C'; b.querySelector('[data-v=hum]').textContent = s.hum + ' %';
    b.querySelector('.dht-body').classList.toggle('busy', s.busy);
    b.lastChild.textContent = s.reads ? '응답 ' + s.reads + '회 · 마지막 ' + s.bytes.map(DEV.hex).join(' ') : '시작 신호 대기 (LOW 18 ms 이상)';
  };
  // 릴레이
  Result.prototype.b_relay = function (b) {
    b.innerHTML = '<svg class="relay-vis" viewBox="0 0 170 80"><rect x="4" y="14" width="56" height="52" rx="4" fill="#1d4fa0"/><text x="32" y="44" text-anchor="middle" font-size="9" fill="#dce6f5" font-family="var(--mono)">RELAY</text>' +
      '<circle class="relay-led" cx="12" cy="22" r="3.5" fill="#3a1414"/>' +
      '<text x="70" y="18" font-size="8" fill="var(--text-faint)" font-family="var(--mono)">NC</text><text x="70" y="66" font-size="8" fill="var(--text-faint)" font-family="var(--mono)">NO</text>' +
      '<circle cx="90" cy="16" r="3" fill="var(--text-dim)"/><circle cx="90" cy="64" r="3" fill="var(--text-dim)"/><circle cx="70" cy="40" r="3" fill="var(--text-dim)"/>' +
      '<line class="relay-arm" x1="70" y1="40" x2="90" y2="16" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M93 64 H130 V52" fill="none" stroke="var(--border)" stroke-width="2"/><circle class="relay-lamp" cx="130" cy="40" r="12" fill="var(--bg-elev-2)" stroke="var(--border)" stroke-width="2"/>' +
      '<path d="M130 28 V10 H40 V14" fill="none" stroke="var(--border)" stroke-width="2"/></svg><div class="dev-v"></div>';
  };
  Result.prototype.u_relay = function (b, inst, s) {
    var arm = b.querySelector('.relay-arm'); arm.setAttribute('y2', s.on ? 64 : 16);
    b.querySelector('.relay-led').setAttribute('fill', s.on ? '#ff3b30' : '#3a1414');
    var lamp = b.querySelector('.relay-lamp'); lamp.style.fill = s.on ? '#ffd23f' : ''; lamp.style.filter = s.on ? 'drop-shadow(0 0 8px #ffd23f)' : '';
    b.lastChild.textContent = (s.on ? '켜짐 · COM–NO 닫힘' : '꺼짐 · COM–NC 닫힘') + ' · IN ' + (s.level ? 'HIGH' : 'LOW') + ' · ' + s.load;
  };
  // 로터리 엔코더
  Result.prototype.b_encoder = function (b, inst) {
    b.innerHTML = '<div class="enc"><button type="button" class="tb" data-r="-1" title="반시계 한 칸">◀</button>' +
      '<svg class="enc-knob" viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" fill="var(--bg-elev-2)" stroke="var(--border)" stroke-width="2"/><g class="enc-rot"><circle cx="30" cy="30" r="18" fill="#2b2f36"/><rect x="28" y="12" width="4" height="12" rx="2" fill="#e5e7eb"/></g></svg>' +
      '<button type="button" class="tb" data-r="1" title="시계 방향 한 칸">▶</button></div>' +
      '<button type="button" class="tb enc-sw">SW 누르기</button><div class="dev-v"></div>';
    b.querySelectorAll('[data-r]').forEach(function (el) { el.onclick = function () { inst.rotate(+el.dataset.r); }; });
    b.querySelector('.enc-knob').addEventListener('wheel', function (e) { e.preventDefault(); inst.rotate(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    var sw = b.querySelector('.enc-sw'); holdable(sw, function () { inst.press(true); }, function () { inst.press(false); });
  };
  Result.prototype.u_encoder = function (b, inst, s) {
    b.querySelector('.enc-rot').style.transform = 'rotate(' + (s.pos * 18) + 'deg)';
    b.querySelector('.enc-sw').classList.toggle('down', s.sw);
    b.lastChild.textContent = '위치 ' + s.pos + ' · CLK ' + s.clk + ' DT ' + s.dt + ' · SW ' + (s.sw ? '누름' : '뗌');
  };
  // 조이스틱
  Result.prototype.b_joystick = function (b, inst) {
    b.innerHTML = '<div class="joy"><div class="joy-pad"><i class="joy-knob"></i></div><button type="button" class="tb joy-sw">SW</button></div><div class="dev-v"></div>';
    var pad = b.querySelector('.joy-pad'), drag = false;
    function mv(e) {
      var r = pad.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
      inst.set((p.clientX - r.left) / r.width * 4095, (p.clientY - r.top) / r.height * 4095);
    }
    function up() { drag = false; inst.set(2048, 2048); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }   // 손을 떼면 스프링으로 가운데 복귀
    pad.addEventListener('mousedown', function (e) { drag = true; mv(e); e.preventDefault(); window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
    pad.addEventListener('touchstart', function (e) { drag = true; mv(e); e.preventDefault(); }, { passive: false });
    pad.addEventListener('touchmove', function (e) { if (drag) { mv(e); e.preventDefault(); } }, { passive: false });
    pad.addEventListener('touchend', function () { drag = false; inst.set(2048, 2048); });
    var sw = b.querySelector('.joy-sw'); holdable(sw, function () { inst.press(true); }, function () { inst.press(false); });
  };
  Result.prototype.u_joystick = function (b, inst, s) {
    var k = b.querySelector('.joy-knob'); k.style.left = (s.x / 4095 * 100) + '%'; k.style.top = (s.y / 4095 * 100) + '%';
    b.querySelector('.joy-sw').classList.toggle('down', s.sw);
    b.lastChild.textContent = 'X ' + s.x + ' · Y ' + s.y + ' · SW ' + (s.sw ? '누름' : '뗌');
  };

  // ---------------------------------------------------------------- 파형
  Result.prototype.buildWavePins = function () {
    var app = this.app, self = this, box = document.getElementById('wave-pins'), used = Object.keys(app.project.pins).filter(function (p) { var s = app.project.pins[p].signal; return s && s !== 'Reset_State' && !/^ADC/.test(s); }).sort();
    app.project.wires.forEach(function (w) { if (used.indexOf(w[0]) < 0) used.push(w[0]); });
    if (!this.wavePins.length) this.wavePins = used.slice(0, 4);
    box.innerHTML = used.map(function (p) { return '<label><input type="checkbox" value="' + p + '"' + (self.wavePins.indexOf(p) >= 0 ? ' checked' : '') + '>' + p + '</label>'; }).join(' ');
    box.querySelectorAll('input').forEach(function (i) { i.onchange = function () { self.wavePins = Array.prototype.map.call(box.querySelectorAll('input:checked'), function (x) { return x.value; }); }; });
  };
  Result.prototype.updateWave = function () {
    if (document.getElementById('wave-freeze').checked) return;
    var c = this.waveCanvas, r = c.getBoundingClientRect(); if (!r.width) return;
    if (c.width !== Math.round(r.width * devicePixelRatio)) { c.width = Math.round(r.width * devicePixelRatio); c.height = Math.round(260 * devicePixelRatio); }
    this.drawWave(c, this.wavePins, +document.getElementById('wave-span').value, c.width, c.height);
  };
  Result.prototype.drawWave = function (canvas, pins, span, W, H) {
    var m = this.app.machine, ctx = canvas.getContext('2d'), now = m ? m.now() : 0, t0 = now - span, css = getComputedStyle(document.documentElement);
    var col = { fg: css.getPropertyValue('--text-dim').trim() || '#666', grid: css.getPropertyValue('--border').trim() || '#ddd', sig: css.getPropertyValue('--ok').trim() || '#1f9d55', pwm: css.getPropertyValue('--accent').trim() || '#4f46e5', faint: css.getPropertyValue('--text-faint').trim() || '#999' };
    ctx.clearRect(0, 0, W, H); ctx.font = (11 * (W / (canvas.getBoundingClientRect().width || W))) + 'px JetBrains Mono, monospace';
    var n = Math.max(1, pins.length), rowH = H / n, sx = W / span;
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    for (var g = 0; g <= 10; g++) { var x = W * g / 10; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = col.faint; ctx.fillText((span >= 1000 ? (span / 1000) + ' s' : span + ' ms') + ' / 화면 · 눈금 ' + (span / 10 >= 1000 ? span / 10000 + ' s' : span / 10 + ' ms'), 6, H - 6);
    if (!m) return;
    pins.forEach(function (pin, i) {
      var p = m.pins[pin]; if (!p) return;
      var y0 = rowH * i + rowH * 0.8, y1 = rowH * i + rowH * 0.2, hist = p.hist;
      ctx.fillStyle = col.fg; ctx.fillText(pin + (p.af ? ' ' + p.af : ''), 6, rowH * i + 13);
      ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo(0, rowH * (i + 1)); ctx.lineTo(W, rowH * (i + 1)); ctx.stroke();
      // 시작 레벨: 창 시작 시각 이전의 마지막 값
      var k = 0, lv = 0, obj = null;
      for (k = 0; k < hist.length && hist[k][0] <= t0; k++) { if (typeof hist[k][1] === 'object') { obj = hist[k][1]; lv = null; } else { lv = hist[k][1]; obj = null; } }
      var x = 0;
      ctx.lineWidth = 1.6;
      function segPwm(o, xa, xb) {
        // PWM 구간: 주기 단위로 그림 (너무 촘촘하면 채워진 띠)
        var per = 1000 / o.freq * sx;
        if (per < 3) { ctx.fillStyle = col.pwm; ctx.globalAlpha = .25 + .6 * o.duty; ctx.fillRect(xa, y1, xb - xa, y0 - y1); ctx.globalAlpha = 1; ctx.fillStyle = col.pwm; ctx.fillText(Math.round(o.freq) + 'Hz ' + Math.round(o.duty * 100) + '%', xa + 4, y1 + 12); return; }
        ctx.strokeStyle = col.pwm; ctx.beginPath();
        var ph = ((t0 + xa / sx) % (1000 / o.freq)) * sx, xx = xa - ph;
        while (xx < xb) { var hiEnd = xx + per * o.duty; ctx.moveTo(Math.max(xa, xx), o.duty > 0 ? y1 : y0); ctx.lineTo(Math.min(xb, Math.max(xa, hiEnd)), y1); ctx.lineTo(Math.min(xb, Math.max(xa, hiEnd)), y0); ctx.lineTo(Math.min(xb, xx + per), y0); xx += per; }
        ctx.stroke();
      }
      function segLv(l, xa, xb) { ctx.strokeStyle = col.sig; ctx.beginPath(); var y = l ? y1 : y0; ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke(); }
      var prevY = null;
      for (; k < hist.length; k++) {
        var xe = Math.min(W, (hist[k][0] - t0) * sx);
        if (obj) segPwm(obj, x, xe); else if (lv != null) { segLv(lv, x, xe); }
        var nv = hist[k][1];
        if (typeof nv === 'object') { obj = nv; lv = null; } else { if (lv != null && lv !== nv) { ctx.strokeStyle = col.sig; ctx.beginPath(); ctx.moveTo(xe, y0); ctx.lineTo(xe, y1); ctx.stroke(); } obj = null; lv = nv; }
        x = xe;
      }
      if (obj) segPwm(obj, x, W); else if (lv != null) segLv(lv, x, W);
    });
  };

  // ---------------------------------------------------------------- 변수
  Result.prototype.updateVars = function () {
    var m = this.app.machine, root = this.varsRoot;
    if (!m || !m.mod) { root.innerHTML = '<div class="dev-empty">실행 중에 전역 변수 값이 표시됩니다 (Live Expressions).</div>'; return; }
    var g; try { g = m.mod.globals(); } catch (e) { g = {}; }
    var keys = Object.keys(g); if (!keys.length) { root.innerHTML = '<div class="dev-empty">전역 변수가 없습니다.</div>'; return; }
    var html = '<table><tr><th>이름</th><th>값</th></tr>';
    keys.forEach(function (k) {
      var v = g[k], s;
      if (v && v.BYTES_PER_ELEMENT) { s = (v.constructor.name) + '[' + v.length + '] {' + Array.prototype.slice.call(v, 0, 12).join(', ') + (v.length > 12 ? ', …' : '') + '}'; if (v.BYTES_PER_ELEMENT === 1) { var str = ''; for (var i = 0; i < v.length && v[i]; i++) str += String.fromCharCode(v[i]); if (/^[\x20-\x7e]*$/.test(str) && str) s += '  "' + str + '"'; } }
      else if (v && v.a) s = 'ptr → [' + v.o + ']';
      else if (Array.isArray(v)) s = '[' + v.length + ']';
      else if (typeof v === 'object' && v) s = v.__hname ? v.__hname + ' (' + v.__type + ')' : JSON.stringify(v).slice(0, 80);
      else s = String(v);
      html += '<tr><td>' + esc(k) + '</td><td class="v">' + esc(s) + '</td></tr>';
    });
    root.innerHTML = html + '</table>';
  };

  // ---------------------------------------------------------------- 콘솔
  Result.prototype.log = function (level, msg, line) {
    var d = document.createElement('div'); d.className = 'ln ' + level;
    var t = this.app.machine ? (this.app.machine.now() / 1000).toFixed(3) + 's' : '';
    d.innerHTML = '<span class="t">' + t + '</span>' + esc(msg).replace(/main\.c (\d+)번째 줄/g, function (_, l) { return '<a data-line="' + l + '">main.c ' + l + '번째 줄</a>'; });
    if (line) { var a = document.createElement('a'); a.dataset.line = line; a.textContent = ' [main.c:' + line + ']'; d.appendChild(a); }
    var self = this; d.querySelectorAll('a[data-line]').forEach(function (a) { a.onclick = function () { self.app.showTab('design', 'code'); self.app.editor.markError('Core/Src/main.c', +a.dataset.line); }; });
    this.conRoot.appendChild(d); this.conRoot.scrollTop = this.conRoot.scrollHeight;
    if (this.conRoot.children.length > 400) this.conRoot.removeChild(this.conRoot.firstChild);
    if (level === 'warn' || level === 'error') { this.conCount++; var b = document.getElementById('console-badge'); b.hidden = false; b.textContent = this.conCount; }
  };
  Result.prototype.clearLog = function () { this.conRoot.innerHTML = ''; this.conCount = 0; document.getElementById('console-badge').hidden = true; };

  global.SimResult = Result;
})(window);
