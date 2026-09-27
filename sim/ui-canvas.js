/*
 * ui-canvas.js — 회로 노드 편집기 (SVG)
 * -------------------------------------------------------------------------
 * 왼쪽에 MCU(핀 목록), 오른쪽에 장치 노드. 장치 포트(점)에서 MCU 핀으로 끌어 배선한다.
 * 데이터는 app.project.nodes / app.project.wires 를 직접 다룬다.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ROW = 16, MCU_W = 170, MCU_X = 30, MCU_Y = 30;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function Canvas(svg, app) {
    var self = this;
    this.svg = svg; this.app = app;
    this.view = { x: 0, y: 0, k: 1 };
    this.sel = null;          // { kind:'node', id } | { kind:'wire', i }
    this.drag = null;
    this.g = el('g', { class: 'view' }, svg);
    this.gWires = el('g', {}, this.g); this.gNodes = el('g', {}, this.g); this.gTemp = el('g', {}, this.g);
    this.pinPos = {};         // 핀 이름 → {x,y}
    this.portPos = {};        // 'node.port' → {x,y}

    svg.addEventListener('mousedown', function (e) { self.down(e); });
    window.addEventListener('mousemove', function (e) { self.move(e); });
    window.addEventListener('mouseup', function (e) { self.up(e); });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = self.pt(e), k = Math.max(.4, Math.min(2.5, self.view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
      self.view.x = p.sx - (p.x) * k; self.view.y = p.sy - (p.y) * k; self.view.k = k; self.applyView();
    }, { passive: false });
    svg.addEventListener('keydown', function (e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && self.sel) { e.preventDefault(); self.deleteSel(); }
    });
    svg.addEventListener('dragover', function (e) { e.preventDefault(); });
    svg.addEventListener('drop', function (e) {
      e.preventDefault(); var type = e.dataTransfer.getData('text/x-device'); if (!type) return;
      var p = self.pt(e); app.addNode(type, p.x - 20, p.y - 20);
    });
    svg.addEventListener('dblclick', function (e) {
      var t = e.target.closest('.mcu .pin'); if (t) { app.selectPin(t.dataset.pin); app.showTab('design', 'pinout'); }
    });
  }
  Canvas.prototype.pt = function (e) {
    var r = this.svg.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx: sx, sy: sy, x: (sx - this.view.x) / this.view.k, y: (sy - this.view.y) / this.view.k };
  };
  Canvas.prototype.applyView = function () { this.g.setAttribute('transform', 'translate(' + this.view.x + ',' + this.view.y + ') scale(' + this.view.k + ')'); };
  Canvas.prototype.fit = function () {
    var box = this.g.getBBox(), r = this.svg.getBoundingClientRect();
    if (!box.width) return;
    var k = Math.min(1, (r.width - 40) / box.width, (r.height - 40) / box.height);
    this.view = { k: k, x: 20 - box.x * k, y: 20 - box.y * k }; this.applyView();
  };

  // ---------------------------------------------------------------- 그리기
  Canvas.prototype.render = function () {
    var app = this.app, P = app.project, chip = app.chip, self = this;
    this.gNodes.innerHTML = ''; this.gWires.innerHTML = ''; this.pinPos = {}; this.portPos = {};
    // MCU
    var gp = chip.pins.filter(function (p, i) { return global.STM32Chips.isGpio(p) && chip.pins.indexOf(p) === i; });
    var left = gp.filter(function (p) { return p[1] === 'A' || p[1] === 'B'; }), right = gp.filter(function (p) { return p[1] !== 'A' && p[1] !== 'B'; });
    var rows = Math.max(left.length, right.length), h = rows * ROW + 52;
    var mcu = el('g', { class: 'mcu', transform: 'translate(' + MCU_X + ',' + MCU_Y + ')' }, this.gNodes);
    el('rect', { class: 'body', x: 0, y: 0, width: MCU_W, height: h }, mcu);
    el('text', { class: 'chip-name', x: MCU_W / 2, y: 20, 'text-anchor': 'middle' }, mcu).textContent = chip.name.replace(/Tx$/, '');
    el('text', { class: 'sub', x: MCU_W / 2, y: 34, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'var(--text-faint)', 'font-family': 'var(--mono)' }, mcu).textContent = app.board.title;
    function pinRow(name, i, side) {
      var y = 44 + i * ROW, cfg = P.pins[name], used = cfg && cfg.signal && cfg.signal !== 'Reset_State';
      var g = el('g', { class: 'pin' + (used ? ' used' : ''), 'data-pin': name, transform: 'translate(' + (side === 'L' ? 6 : MCU_W / 2 + 2) + ',' + y + ')' }, mcu);
      el('rect', { x: 0, y: 1, width: MCU_W / 2 - 8, height: ROW - 3 }, g);
      el('text', { x: side === 'L' ? 4 : MCU_W / 2 - 12, y: 12, 'text-anchor': side === 'L' ? 'start' : 'end' }, g).textContent = name;
      if (used) { var s = cfg.label || cfg.signal.replace('GPIO_', ''); el('text', { class: 'sig', x: side === 'L' ? MCU_W / 2 - 12 : 4, y: 12, 'text-anchor': side === 'L' ? 'end' : 'start' }, g).textContent = s.length > 10 ? s.slice(0, 10) : s; }
      self.pinPos[name] = { x: MCU_X + (side === 'L' ? 0 : MCU_W), y: MCU_Y + y + ROW / 2 - 1 };
    }
    left.forEach(function (p, i) { pinRow(p, i, 'L'); });
    right.forEach(function (p, i) { pinRow(p, i, 'R'); });
    // 장치 노드
    P.nodes.forEach(function (n) { self.drawNode(n); });
    // 배선
    P.wires.forEach(function (w, i) { self.drawWire(w, i); });
    if (!P.nodes.length) {
      el('text', { class: 'canvas-empty', x: MCU_X + MCU_W + 60, y: MCU_Y + 60 }, this.gNodes).textContent = '왼쪽 팔레트에서 장치를 끌어다 놓고, 장치 포트(점)를 MCU 핀으로 끌어 연결하세요.';
      el('text', { class: 'canvas-empty', x: MCU_X + MCU_W + 60, y: MCU_Y + 82 }, this.gNodes).textContent = '휠: 확대 · 빈 곳 드래그: 이동 · Delete: 선택 삭제 · 핀 더블클릭: 핀 설정';
    }
    this.updateLive();
  };
  Canvas.prototype.drawNode = function (n) {
    var d = global.STM32Devices.DEVICES[n.type]; if (!d) return;
    var self = this, ports = d.ports, h = Math.max(d.h, 30 + ports.length * 16), w = d.w;
    var g = el('g', { class: 'node' + (this.sel && this.sel.kind === 'node' && this.sel.id === n.id ? ' selected' : ''), 'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')' }, this.gNodes);
    el('rect', { class: 'body', x: 0, y: 0, width: w, height: h }, g);
    el('rect', { x: 0, y: 0, width: w, height: 22, rx: 10, fill: this.catColor(d.cat), opacity: .18 }, g);
    el('text', { class: 'title', x: 10, y: 15 }, g).textContent = (n.props && n.props.label) || (n.props && n.props.name) || d.name;
    el('text', { class: 'sub', x: w - 8, y: 15, 'text-anchor': 'end' }, g).textContent = n.id;
    ports.forEach(function (p, i) {
      var y = 34 + i * 16, x = 0;
      el('circle', { class: 'port-dot ' + p.dir, cx: x, cy: y, r: 5, 'data-node': n.id, 'data-port': p.id }, g);
      el('text', { class: 'port-lbl', x: 10, y: y + 3.5 }, g).textContent = p.label || p.id;
      var pin = n.conn && n.conn[p.id];
      if (pin) el('text', { class: 'port-pin', x: w - 8, y: y + 3.5, 'text-anchor': 'end' }, g).textContent = pin;
      self.portPos[n.id + '.' + p.id] = { x: n.x + x, y: n.y + y };
    });
    // 상태 요약
    el('text', { class: 'sub node-live', x: 10, y: h - 8, 'data-live': n.id }, g);
  };
  Canvas.prototype.catColor = function (cat) {
    return { '출력': '#4f46e5', '입력': '#1f9d55', '표시': '#0e7490', '구동': '#be123c', '통신': '#a16207', '계측': '#9333ea', '보드': '#6b7587' }[cat] || '#6b7587';
  };
  Canvas.prototype.wirePath = function (a, b) {
    var dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
  };
  Canvas.prototype.drawWire = function (w, i) {
    var a = this.pinPos[w[0]], b = this.portPos[w[1]]; if (!a || !b) return;
    var sel = this.sel && this.sel.kind === 'wire' && this.sel.i === i;
    var d = this.wirePath(a, b);
    el('path', { class: 'wire-hit', d: d, 'data-wire': i }, this.gWires);
    el('path', { class: 'wire' + (sel ? ' selected' : ''), d: d, 'data-wire': i, 'data-pin': w[0] }, this.gWires);
  };
  /** 실행 중 핀 레벨에 따라 배선 색, 노드 상태 글 갱신 */
  Canvas.prototype.updateLive = function () {
    var m = this.app.machine, self = this;
    this.gWires.querySelectorAll('path.wire').forEach(function (p) {
      var lv = m ? m.level(p.dataset.pin) : 0; p.classList.toggle('hi', !!lv);
    });
    this.gNodes.querySelectorAll('[data-live]').forEach(function (t) {
      var inst = self.app.deviceById(t.dataset.live); t.textContent = inst ? self.app.summary(inst) : '';
    });
  };

  // ---------------------------------------------------------------- 상호작용
  Canvas.prototype.down = function (e) {
    var t = e.target, p = this.pt(e);
    this.svg.focus();
    if (t.classList.contains('port-dot')) {
      this.drag = { kind: 'wire', from: { node: t.dataset.node, port: t.dataset.port }, start: this.portPos[t.dataset.node + '.' + t.dataset.port] };
      this.temp = el('path', { class: 'wire temp' }, this.gTemp); return;
    }
    var pin = t.closest && t.closest('.mcu .pin');
    if (pin) { this.drag = { kind: 'wire', fromPin: pin.dataset.pin, start: this.pinPos[pin.dataset.pin] }; this.temp = el('path', { class: 'wire temp' }, this.gTemp); return; }
    var node = t.closest && t.closest('.node');
    if (node) {
      var n = this.app.nodeById(node.dataset.id);
      this.select({ kind: 'node', id: n.id });
      this.drag = { kind: 'node', n: n, ox: p.x - n.x, oy: p.y - n.y, moved: false }; return;
    }
    var wire = t.dataset && t.dataset.wire != null ? +t.dataset.wire : null;
    if (wire != null) { this.select({ kind: 'wire', i: wire }); return; }
    this.select(null);
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
  };
  Canvas.prototype.move = function (e) {
    if (!this.drag) return;
    var d = this.drag, p = this.pt(e);
    if (d.kind === 'pan') { this.view.x = d.vx + e.clientX - d.sx; this.view.y = d.vy + e.clientY - d.sy; this.applyView(); }
    else if (d.kind === 'node') {
      d.n.x = Math.round((p.x - d.ox) / 6) * 6; d.n.y = Math.round((p.y - d.oy) / 6) * 6; d.moved = true;
      this.render();
    } else if (d.kind === 'wire') {
      this.temp.setAttribute('d', d.fromPin ? this.wirePath(d.start, p) : this.wirePath(p, d.start));
      this.svg.querySelectorAll('.hot').forEach(function (x) { x.classList.remove('hot'); });
      var t = document.elementFromPoint(e.clientX, e.clientY);
      var tgt = t && (d.fromPin ? (t.classList.contains('port-dot') && t) : (t.closest && t.closest('.mcu .pin')));
      if (tgt) tgt.classList.add('hot');
    }
  };
  Canvas.prototype.up = function (e) {
    var d = this.drag; if (!d) return; this.drag = null;
    if (d.kind === 'wire') {
      this.gTemp.innerHTML = '';
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (d.fromPin) { if (t && t.classList.contains('port-dot')) this.app.connect(d.fromPin, t.dataset.node, t.dataset.port); }
      else { var pin = t && t.closest && t.closest('.mcu .pin'); if (pin) this.app.connect(pin.dataset.pin, d.from.node, d.from.port); }
      this.render();
    } else if (d.kind === 'node' && d.moved) this.app.dirty();
  };
  Canvas.prototype.select = function (s) {
    this.sel = s; this.render();
    if (s && s.kind === 'node') this.app.selectNode(s.id);
    else if (s && s.kind === 'wire') this.app.selectWire(s.i);
    else this.app.selectNone();
  };
  Canvas.prototype.deleteSel = function () {
    var s = this.sel; if (!s) return;
    if (s.kind === 'node') this.app.removeNode(s.id);
    else this.app.removeWire(s.i);
    this.sel = null; this.render(); this.app.selectNone();
  };

  global.SimCanvas = Canvas;
})(window);
