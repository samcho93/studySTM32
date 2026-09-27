/*
 * ui-pinout.js — CubeMX 식 핀아웃 뷰 + 주변장치 목록
 * -------------------------------------------------------------------------
 * 왼쪽: 칩 그림(LQFP). 핀을 클릭하면 Properties 에 신호 선택이 뜬다.
 * 오른쪽: 주변장치(USART/I2C/SPI/TIM/ADC/NVIC) 목록. 클릭하면 Properties 에서 설정.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  function Pinout(root, app) {
    this.root = root; this.app = app;
    root.innerHTML = '<div class="pinout-chip"><svg class="chipsvg"></svg></div><div class="pinout-side">' +
      '<div class="pinout-legend"><span><i style="background:#cdeccd"></i>출력</span><span><i style="background:#cfe3f7"></i>입력</span><span><i style="background:#f8e3c0"></i>EXTI</span>' +
      '<span><i style="background:#e2d8f8"></i>대체기능</span><span><i style="background:#f7d6d6"></i>아날로그</span><span><i style="background:#e9e9e9"></i>예약</span></div>' +
      '<div class="periph-list" id="periph-list"></div></div>';
    this.svg = root.querySelector('.chipsvg'); this.list = root.querySelector('#periph-list');
  }
  Pinout.prototype.cls = function (pin) {
    var cfg = this.app.project.pins[pin], C = global.STM32Chips;
    if (!C.isGpio(pin)) return 'pwr';
    if (C.reserved(this.app.chip, pin)) return 'res';
    if (!cfg || !cfg.signal || cfg.signal === 'Reset_State') return '';
    if (cfg.signal === 'GPIO_Output') return 'out used'; if (cfg.signal === 'GPIO_Input') return 'in used';
    if (cfg.signal === 'GPIO_EXTI') return 'exti used'; if (cfg.signal === 'GPIO_Analog' || /^ADC/.test(cfg.signal)) return 'analog used';
    return 'af used';
  };
  Pinout.prototype.render = function () {
    var app = this.app, chip = app.chip, pins = chip.pins, n = pins.length, side = n / 4, self = this;
    var PW = 22, PL = 74, body = side * PW + 30, W = body + PL * 2 + 20, H = W;
    this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); this.svg.setAttribute('width', Math.min(640, W)); this.svg.innerHTML = '';
    var ox = PL + 10, oy = PL + 10;
    el('rect', { class: 'chipbody', x: ox, y: oy, width: body, height: body, rx: 10 }, this.svg);
    el('circle', { cx: ox + 18, cy: oy + 18, r: 6, fill: 'var(--bg-elev)', stroke: 'var(--text-faint)' }, this.svg);
    el('text', { class: 'chiptxt', x: ox + body / 2, y: oy + body / 2 - 6, 'text-anchor': 'middle' }, this.svg).textContent = chip.name;
    el('text', { class: 'chipsub', x: ox + body / 2, y: oy + body / 2 + 12, 'text-anchor': 'middle' }, this.svg).textContent = chip.pkg + ' · ' + (app.board ? app.board.title : chip.core) + (chip.pinsApprox ? ' · 핀 번호 개략' : '');
    el('text', { class: 'chipsub', x: ox + body / 2, y: oy + body / 2 + 28, 'text-anchor': 'middle' }, this.svg).textContent = '핀을 클릭해 신호를 고르세요';
    pins.forEach(function (name, i) {
      var s = Math.floor(i / side), j = i % side, x, y, w = PL - 6, h = PW - 4, rot = 0, tx, ty, anchor;
      if (s === 0) { x = ox - PL + 2; y = oy + 15 + j * PW; tx = x + w - 4; ty = y + h - 6; anchor = 'end'; }           // 왼쪽 위→아래
      else if (s === 1) { x = ox + 15 + j * PW; y = oy + body + 4; rot = 90; }                                            // 아래 왼→오
      else if (s === 2) { x = ox + body + 4; y = oy + body - 15 - (j + 1) * PW; tx = x + 4; ty = y + h - 6; anchor = 'start'; } // 오른쪽 아래→위
      else { x = ox + body - 15 - (j + 1) * PW; y = oy - PL + 2; rot = -90; }                                              // 위 오→왼
      var g = el('g', { class: 'pn ' + self.cls(name) + (app.selPin === name ? ' sel' : ''), 'data-pin': name }, self.svg);
      if (rot) {
        var cx = x + h / 2, cy = y + w / 2;
        g.setAttribute('transform', 'rotate(' + rot + ' ' + cx + ' ' + cy + ')');
        el('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, g);
        el('text', { x: rot > 0 ? cx - w / 2 + 4 : cx + w / 2 - 4, y: cy + 3.5, 'text-anchor': rot > 0 ? 'start' : 'end' }, g).textContent = name;
        var cfg = app.project.pins[name]; if (cfg && cfg.label) el('text', { class: 'lab', x: rot > 0 ? cx + w / 2 - 4 : cx - w / 2 + 4, y: cy + 3.5, 'text-anchor': rot > 0 ? 'end' : 'start' }, g).textContent = cfg.label.slice(0, 7);
      } else {
        el('rect', { x: x, y: y, width: w, height: h }, g);
        el('text', { x: tx, y: ty, 'text-anchor': anchor }, g).textContent = name;
        var cfg2 = app.project.pins[name]; if (cfg2 && cfg2.label) el('text', { class: 'lab', x: anchor === 'end' ? x + 4 : x + w - 4, y: ty, 'text-anchor': anchor === 'end' ? 'start' : 'end' }, g).textContent = cfg2.label.slice(0, 7);
      }
      el('text', { x: 0, y: 0, 'font-size': 0 }, g);
      g.addEventListener('click', function () { app.selectPin(name); });
    });
    this.renderList();
  };
  Pinout.prototype.renderList = function () {
    var app = this.app, P = app.project, chip = app.chip, self = this, html = '';
    var groups = [['통신', /^(LPUART|USART|I2C|SPI)/], ['타이머', /^TIM/], ['아날로그', /^ADC/]];
    groups.forEach(function (gr) {
      html += '<div class="periph-h">' + gr[0] + '</div>';
      Object.keys(chip.periph).filter(function (k) { return gr[1].test(k); }).forEach(function (k) {
        var on = global.STM32Codegen.activePeriph(P).indexOf(k) >= 0;
        html += '<div class="periph-item' + (on ? ' on' : '') + (app.selPeriph === k ? ' sel' : '') + '" data-p="' + k + '">' + k + '<span class="st">' + (on ? self.stateOf(k) : '꺼짐') + '</span></div>';
      });
    });
    html += '<div class="periph-h">시스템</div><div class="periph-item' + (app.selPeriph === 'NVIC' ? ' sel' : '') + '" data-p="NVIC">NVIC 인터럽트<span class="st">' + Object.keys(P.nvic).filter(function (k) { return P.nvic[k]; }).length + '개 켜짐</span></div>' +
      '<div class="periph-item' + (app.selPeriph === 'GPIO' ? ' sel' : '') + '" data-p="GPIO">GPIO 요약<span class="st">' + Object.keys(P.pins).filter(function (k) { return /^GPIO_/.test(P.pins[k].signal || ''); }).length + '핀</span></div>';
    this.list.innerHTML = html;
    this.list.querySelectorAll('.periph-item').forEach(function (it) { it.onclick = function () { app.selectPeriph(it.dataset.p); }; });
  };
  Pinout.prototype.stateOf = function (k) {
    var c = this.app.project.periph[k] || {};
    if (/^(LPUART|USART)/.test(k)) return c.baud + ' bps';
    if (/^I2C/.test(k)) return (c.speed || 100000) / 1000 + ' kHz';
    if (/^SPI/.test(k)) return '/' + (c.prescaler || 16);
    if (/^TIM/.test(k)) { var pw = Object.keys(c.ch || {}).filter(function (x) { return c.ch[x] === 'pwm'; }); return (pw.length ? 'PWM ch' + pw.join(',') : '기본') ; }
    if (/^ADC/.test(k)) return 'IN' + (c.channels || []).join(',');
    return '켜짐';
  };
  global.SimPinout = Pinout;
})(window);
