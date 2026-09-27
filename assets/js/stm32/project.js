/*
 * project.js — 프로젝트 객체 만들기·정규화 (시뮬레이터 앱과 테스트가 함께 쓴다)
 * -------------------------------------------------------------------------
 * project = { v, name, mcu, board|null, clock:{sysclk}, pins, periph, nvic, settings, nodes, wires, user, mainc, lesson, example }
 *   mcu   : CHIPS 의 키 (프로젝트의 중심)
 *   board : BOARDS 의 키 또는 null (MCU 만 쓰는 맨 칩). 보드가 있으면 내장 장치 노드와 기본 핀이 채워진다.
 */
(function (global) {
  'use strict';
  var C = global.STM32Chips;
  function clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }

  function create(mcu, board) {
    if (board && C.BOARDS[board]) mcu = C.BOARDS[board].chip;
    if (!C.CHIPS[mcu]) { mcu = 'STM32F411RE'; }
    var b = board && C.BOARDS[board] && C.BOARDS[board].chip === mcu ? C.BOARDS[board] : null;
    return { v: 2, name: 'stm32_project', mcu: mcu, board: b ? board : null, clock: {},
      pins: b ? clone(b.defaults.pins) : {}, periph: b ? clone(b.defaults.periph) : {}, nvic: b ? clone(b.defaults.nvic) : {},
      settings: { printfFloat: true }, nodes: [], wires: [], user: null, mainc: null, lesson: null, example: null };
  }

  function isBuiltinNode(n) { var d = global.STM32Devices && global.STM32Devices.DEVICES[n.type]; return !!(d && d.builtin); }

  /** 옛 형식(board 만 있음) 보정, 보드 내장 노드 재구성, 장치 기본 props 채우기 */
  function normalize(P) {
    if (!P.mcu) P.mcu = C.chipOf(P.board || 'NUCLEO-F411RE').part;
    if (P.board && (!C.BOARDS[P.board] || C.BOARDS[P.board].chip !== P.mcu)) P.board = null;
    P.pins = P.pins || {}; P.periph = P.periph || {}; P.nvic = P.nvic || {}; P.nodes = P.nodes || []; P.wires = P.wires || []; P.settings = P.settings || {}; P.clock = P.clock || {};
    var chip = C.CHIPS[P.mcu];
    // 이 칩에 없는 핀 설정·배선 제거
    Object.keys(P.pins).forEach(function (p) { if (chip.pins.indexOf(p) < 0) delete P.pins[p]; });
    P.wires = P.wires.filter(function (w) { return chip.pins.indexOf(w[0]) >= 0; });
    // 보드 내장 노드는 항상 보드 정의대로
    var builtinIds = {};
    P.nodes = P.nodes.filter(function (n) { return !isBuiltinNode(n); });
    P.wires = P.wires.filter(function (w) { var id = w[1].split('.')[0]; return P.nodes.some(function (n) { return n.id === id; }); });
    if (P.board) {
      var y = 40;
      C.BOARDS[P.board].builtin.forEach(function (bi) {
        var node = { id: bi.id, type: bi.type, x: 260, y: y, props: clone(bi.props) }; y += 95;
        P.nodes.push(node); builtinIds[bi.id] = 1;
        if (bi.pin) P.wires.push([bi.pin, bi.id + '.' + (bi.type === 'board-led' ? 'in' : 'out')]);
        if (bi.pins) { P.wires.push([bi.pins.rx, bi.id + '.rx']); P.wires.push([bi.pins.tx, bi.id + '.tx']); }
      });
    }
    if (global.STM32Devices) P.nodes.forEach(function (n) {
      var d = global.STM32Devices.DEVICES[n.type]; if (!d) return; n.props = n.props || {};
      d.props.forEach(function (p) { if (n.props[p.key] == null) n.props[p.key] = p.default; });
    });
    fillDefaultPins(P);
    return P;
  }

  /** 켜진 주변장치의 기본 핀, ADC 채널 핀, PWM 채널 핀이 비어 있으면 채운다 */
  function fillDefaultPins(P) {
    var chip = C.CHIPS[P.mcu];
    Object.keys(P.periph).forEach(function (k) {
      var info = chip.periph[k]; if (!info) { if (!/^(IWDG|RTC|FREERTOS)$/.test(k)) delete P.periph[k]; return; }
      if (info.pins) Object.keys(info.pins).forEach(function (s) {
        if (!Object.keys(P.pins).some(function (p) { return P.pins[p].signal === k + '_' + s; })) { var pin = info.pins[s]; if (chip.pins.indexOf(pin) >= 0 && (!P.pins[pin] || !P.pins[pin].signal || P.pins[pin].signal === 'Reset_State')) P.pins[pin] = { signal: k + '_' + s }; }
      });
      var c = P.periph[k];
      if (/^TIM/.test(k) && c && c.ch) Object.keys(c.ch).forEach(function (ch) {
        if (c.ch[ch] !== 'pwm') return; var sig = k + '_CH' + ch;
        if (!Object.keys(P.pins).some(function (p) { return P.pins[p].signal === sig; })) { var pin = info.chPins && info.chPins[ch]; if (pin && (!P.pins[pin] || !P.pins[pin].signal)) P.pins[pin] = { signal: sig }; }
      });
    });
    (P.periph.ADC1 && P.periph.ADC1.channels || []).forEach(function (ch) { var pin = C.adcPin(chip, ch); if (pin && !P.pins[pin]) P.pins[pin] = { signal: 'ADC1_IN' + ch }; });
  }

  /** 예제 정의 → 프로젝트 */
  function fromExample(id, ex) {
    var P = create(ex.mcu || (ex.board ? C.BOARDS[ex.board] && C.BOARDS[ex.board].chip : null) || 'STM32F411RE', ex.board || null);
    P.name = id.replace(/[^\w-]/g, '_'); P.example = id; P.lesson = ex.lesson || null; P.title = ex.title;
    Object.assign(P.pins, clone(ex.pins)); Object.assign(P.periph, clone(ex.periph)); Object.assign(P.nvic, clone(ex.nvic)); Object.assign(P.settings, ex.settings || {});
    if (ex.clock) P.clock = clone(ex.clock);
    P.nodes = clone(ex.nodes || []); P.wires = clone(ex.wires || []); P.user = ex.user || {};
    return normalize(P);
  }

  global.STM32Project = { create: create, normalize: normalize, fromExample: fromExample, fillDefaultPins: fillDefaultPins, clone: clone };
})(typeof window !== 'undefined' ? window : globalThis);
