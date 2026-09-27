/*
 * devices.js — 주변기기 모델
 * -------------------------------------------------------------------------
 * 각 장치는 노드(회로 캔버스의 상자)이며 포트를 갖는다. 포트는 MCU 핀에 연결된다.
 * 장치는 Machine 의 핀 레벨/듀티/버스를 읽고, 입력 장치는 Machine.drive() 로 핀을 구동한다.
 *
 * 정의: DEVICES[type] = { name, cat, ports:[{id, dir:'in'|'out'|'io'|'analog', label}], props:[{key,label,type,options,min,max,default}],
 *                        w, h, create(machine, node) → instance }
 * 인스턴스: { pinOf(port), tick(dt) (선택), state() → 화면에 그릴 값, i2cAddr/i2cWrite/i2cRead, spiXfer, uartRx, dispose }
 */
(function (global) {
  'use strict';

  var DEVICES = {};
  function def(type, d) { d.type = type; DEVICES[type] = d; }

  function base(machine, node) {
    var inst = { node: node, m: machine };
    inst.pinOf = function (port) { return node.conn && node.conn[port] || null; };
    inst.prop = function (k) { var d = DEVICES[node.type].props.filter(function (p) { return p.key === k; })[0]; return node.props && node.props[k] != null ? node.props[k] : d ? d.default : undefined; };
    return inst;
  }
  function level(inst, port) { var p = inst.pinOf(port); return p ? inst.m.level(p) : 0; }
  function duty(inst, port) { var p = inst.pinOf(port); return p ? inst.m.outDuty(p) : 0; }
  function drive(inst, port, v) { var p = inst.pinOf(port); if (p) inst.m.drive(p, v); }

  // ---------------------------------------------------------------- LED
  def('led', {
    name: 'LED', cat: '출력', w: 90, h: 70,
    ports: [{ id: 'in', dir: 'in', label: '+' }],
    props: [{ key: 'color', label: '색', type: 'select', options: ['red', 'green', 'yellow', 'blue', 'white'], default: 'red' },
      { key: 'active', label: '켜지는 레벨', type: 'select', options: [['high', 'HIGH (핀→저항→LED→GND)'], ['low', 'LOW (3.3V→LED→저항→핀)']], default: 'high' }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () { var d = duty(i, 'in'); if (i.prop('active') === 'low') d = 1 - d; return { on: d, color: i.prop('color') }; };
      return i;
    }
  });
  def('rgb', {
    name: 'RGB LED', cat: '출력', w: 100, h: 90,
    ports: [{ id: 'r', dir: 'in', label: 'R' }, { id: 'g', dir: 'in', label: 'G' }, { id: 'b', dir: 'in', label: 'B' }],
    props: [{ key: 'common', label: '공통 단자', type: 'select', options: [['cathode', '공통 캐소드(HIGH 켜짐)'], ['anode', '공통 애노드(LOW 켜짐)']], default: 'cathode' }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () {
        var inv = i.prop('common') === 'anode';
        function d(p) { var v = duty(i, p); return inv ? 1 - v : v; }
        return { r: d('r'), g: d('g'), b: d('b') };
      };
      return i;
    }
  });
  // ---------------------------------------------------------------- 버튼
  def('button', {
    name: '푸시 버튼', cat: '입력', w: 100, h: 80,
    ports: [{ id: 'out', dir: 'out', label: 'OUT' }],
    props: [{ key: 'wiring', label: '배선', type: 'select', options: [['gnd', '핀–버튼–GND (풀업 필요, 누르면 LOW)'], ['vcc', '핀–버튼–3.3V (풀다운 필요, 누르면 HIGH)'], ['module', '모듈(내장 풀업): 평소 HIGH, 누르면 LOW']], default: 'module' },
      { key: 'mode', label: '동작', type: 'select', options: [['push', '누르는 동안'], ['toggle', '토글 스위치']], default: 'push' },
      { key: 'bounce', label: '채터링 시뮬레이션', type: 'bool', default: true },
      { key: 'label', label: '이름', type: 'text', default: 'SW1' }],
    create: function (m, n) {
      var i = base(m, n); i.pressed = false;
      i.apply = function () {
        var w = i.prop('wiring');
        if (w === 'module') drive(i, 'out', i.pressed ? 0 : 1);
        else if (w === 'gnd') drive(i, 'out', i.pressed ? 0 : null);
        else drive(i, 'out', i.pressed ? 1 : null);
      };
      i.press = function (down) {
        if (i.prop('mode') === 'toggle') { if (!down) return; i.pressed = !i.pressed; }
        else i.pressed = down;
        if (i.prop('bounce')) {
          // 8 ms 동안 3–5회 튐
          var target = i.pressed, t = m.now(), k = 3 + (Math.random() * 3 | 0);
          for (var j = 0; j < k; j++) (function (jj) {
            m.at(t + 0.8 * (jj + 1), function () { i.pressed = (jj % 2 === 0) ? !target : target; i.apply(); });
          })(j);
          m.at(t + 0.8 * (k + 1) + 0.5, function () { i.pressed = target; i.apply(); });
          i.pressed = !target; i.apply(); i.pressed = target;
        } else i.apply();
      };
      i.state = function () { return { pressed: i.pressed, label: i.prop('label'), level: level(i, 'out') }; };
      i.apply();
      return i;
    }
  });
  // ---------------------------------------------------------------- 아날로그 입력
  def('pot', {
    name: '가변저항', cat: '입력', w: 100, h: 90,
    ports: [{ id: 'out', dir: 'analog', label: 'W' }],
    props: [{ key: 'value', label: '값 (0–4095)', type: 'range', min: 0, max: 4095, default: 2048 }],
    create: function (m, n) {
      var i = base(m, n);
      i.apply = function () { var p = i.pinOf('out'); if (p) m.setAnalog(p, +i.prop('value')); };
      i.set = function (v) { n.props = n.props || {}; n.props.value = Math.max(0, Math.min(4095, Math.round(v))); i.apply(); };
      i.state = function () { return { value: +i.prop('value'), volt: +i.prop('value') / 4095 * 3.3 }; };
      i.apply(); return i;
    }
  });
  def('ldr', {
    name: '조도 센서(CDS)', cat: '입력', w: 100, h: 90,
    ports: [{ id: 'out', dir: 'analog', label: 'AO' }],
    props: [{ key: 'lux', label: '밝기 (lux)', type: 'range', min: 0, max: 1000, default: 300 },
      { key: 'invert', label: '어두울수록 전압 높음', type: 'bool', default: false }],
    create: function (m, n) {
      var i = base(m, n);
      i.apply = function () {
        var p = i.pinOf('out'); if (!p) return;
        var lux = +i.prop('lux'), v = Math.round(4095 * Math.log(1 + lux) / Math.log(1001));
        m.setAnalog(p, i.prop('invert') ? 4095 - v : v);
      };
      i.set = function (v) { n.props = n.props || {}; n.props.lux = Math.max(0, Math.min(1000, Math.round(v))); i.apply(); };
      i.state = function () { return { lux: +i.prop('lux') }; };
      i.apply(); return i;
    }
  });
  // ---------------------------------------------------------------- 부저
  def('buzzer', {
    name: '부저', cat: '출력', w: 90, h: 70,
    ports: [{ id: 'in', dir: 'in', label: 'S' }],
    props: [{ key: 'kind', label: '종류', type: 'select', options: [['active', '액티브(HIGH=소리)'], ['passive', '패시브(PWM 주파수=음높이)']], default: 'active' },
      { key: 'sound', label: '소리 재생', type: 'bool', default: false }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () {
        var p = i.pinOf('in'), w = p && m.pwmOf(p);
        if (i.prop('kind') === 'passive') return { on: !!(w && w.duty > 0 && w.duty < 1), freq: w ? w.freq : 0 };
        return { on: duty(i, 'in') > 0.5, freq: 2400 };
      };
      return i;
    }
  });
  // ---------------------------------------------------------------- FND
  def('fnd', {
    name: '7세그먼트', cat: '출력', w: 120, h: 150,
    ports: 'abcdefg'.split('').map(function (c) { return { id: c, dir: 'in', label: c }; }).concat([{ id: 'dp', dir: 'in', label: 'dp' }]),
    props: [{ key: 'common', label: '공통 단자', type: 'select', options: [['cathode', '공통 캐소드(HIGH 켜짐)'], ['anode', '공통 애노드(LOW 켜짐)']], default: 'cathode' }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () {
        var inv = i.prop('common') === 'anode', seg = {};
        'abcdefg'.split('').concat(['dp']).forEach(function (s) { var d = duty(i, s); seg[s] = inv ? 1 - d : d; });
        return { seg: seg };
      };
      return i;
    }
  });
  // ---------------------------------------------------------------- I2C LCD1602 (PCF8574)
  def('lcd1602', {
    name: 'I2C LCD 16x2', cat: '표시', w: 230, h: 110,
    ports: [{ id: 'scl', dir: 'io', label: 'SCL' }, { id: 'sda', dir: 'io', label: 'SDA' }],
    props: [{ key: 'addr', label: 'I2C 주소', type: 'select', options: [['0x27', '0x27 (PCF8574)'], ['0x3F', '0x3F (PCF8574A)'], ['0x20', '0x20']], default: '0x27' },
      { key: 'backlightColor', label: '백라이트', type: 'select', options: ['blue', 'green', 'yellow'], default: 'blue' }],
    create: function (m, n) {
      var i = base(m, n);
      var ddram = new Uint8Array(128), cursor = 0, entryInc = true, display = true, cursorOn = false, blink = false, backlight = true;
      var nib = null, fourbit = false, initCount = 0, shift = 0;
      var cgram = new Uint8Array(64), cgMode = false, cgAddr = 0;
      for (var k = 0; k < 128; k++) ddram[k] = 0x20;
      function cmd(c) {
        if (c === 0x01) { for (var k = 0; k < 128; k++) ddram[k] = 0x20; cursor = 0; shift = 0; cgMode = false; }
        else if ((c & 0xFE) === 0x02) { cursor = 0; shift = 0; cgMode = false; }
        else if ((c & 0xFC) === 0x04) entryInc = !!(c & 2);
        else if ((c & 0xF8) === 0x08) { display = !!(c & 4); cursorOn = !!(c & 2); blink = !!(c & 1); }
        else if ((c & 0xF0) === 0x10) { if (c & 8) shift += (c & 4) ? 1 : -1; else cursor += (c & 4) ? 1 : -1; }
        else if ((c & 0xE0) === 0x20) fourbit = !(c & 0x10);
        else if ((c & 0xC0) === 0x40) { cgMode = true; cgAddr = c & 0x3F; }
        else if (c & 0x80) { cursor = c & 0x7F; cgMode = false; }
      }
      function data(d) {
        if (cgMode) { cgram[cgAddr & 63] = d; cgAddr++; return; }
        ddram[cursor & 0x7F] = d; cursor += entryInc ? 1 : -1;
        if (cursor === 0x28) cursor = 0x40; else if (cursor === 0x68) cursor = 0x00;
        if (cursor < 0) cursor = 0x67; cursor &= 0x7F;
      }
      i.i2cAddr = function () { var a = i.prop('addr'); return (typeof a === 'number' ? a : parseInt(a, 16)) & 0x7F; };
      i.i2cWrite = function (bytes) {
        bytes.forEach(function (b) {
          backlight = !!(b & 8);
          var en = b & 4, rs = b & 1, hi = b & 0xF0;
          if (!en) {
            // EN 하강: 래치
            if (i._en) {
              i._en = false;
              if (initCount < 3 && hi === 0x30 && !rs) { initCount++; return; }
              if (initCount === 3 && hi === 0x20 && !rs && nib === null) { fourbit = true; initCount = 4; return; }
              if (!fourbit && initCount < 4) { if (hi === 0x20) { fourbit = true; initCount = 4; } return; }
              if (nib === null) { nib = { hi: hi, rs: rs }; }
              else { var v = nib.hi | (hi >> 4); var r = nib.rs; nib = null; if (r) data(v); else cmd(v); }
            }
          } else i._en = true;
        });
      };
      i.i2cRead = function (n) { var o = []; for (var j = 0; j < n; j++) o.push(0x80); return o; };
      i.state = function () {
        var rows = [];
        for (var r = 0; r < 2; r++) {
          var s = [];
          for (var c = 0; c < 16; c++) { var a = (r ? 0x40 : 0) + ((c + shift) % 40 + 40) % 40; s.push(ddram[a]); }
          rows.push(s);
        }
        return { rows: rows, display: display, backlight: backlight, cursor: cursorOn ? cursor : -1, blink: blink, color: i.prop('backlightColor'), cgram: cgram };
      };
      return i;
    }
  });
  // ---------------------------------------------------------------- 모터
  def('motor', {
    name: 'DC 모터 + L298N', cat: '구동', w: 130, h: 110,
    ports: [{ id: 'in1', dir: 'in', label: 'IN1' }, { id: 'in2', dir: 'in', label: 'IN2' }, { id: 'en', dir: 'in', label: 'ENA' }],
    props: [{ key: 'maxRpm', label: '최대 RPM', type: 'number', min: 10, max: 20000, default: 200 },
      { key: 'enPulled', label: 'ENA 점퍼(항상 켜짐)', type: 'bool', default: false }],
    create: function (m, n) {
      var i = base(m, n); i.angle = 0; i.rpm = 0;
      i.tick = function (dt) {
        var a = duty(i, 'in1'), b = duty(i, 'in2');
        var en = i.prop('enPulled') || !i.pinOf('en') ? 1 : duty(i, 'en');
        var dir = a > 0.5 && b < 0.5 ? 1 : b > 0.5 && a < 0.5 ? -1 : 0;
        var target = dir * en * +i.prop('maxRpm');
        i.rpm += (target - i.rpm) * Math.min(1, dt / 150);   // 관성
        i.angle = (i.angle + i.rpm * 6 * dt / 1000) % 360;
      };
      i.state = function () { return { rpm: i.rpm, angle: i.angle, brake: duty(i, 'in1') > 0.5 && duty(i, 'in2') > 0.5 }; };
      return i;
    }
  });
  def('servo', {
    name: '서보 (SG90)', cat: '구동', w: 120, h: 100,
    ports: [{ id: 'sig', dir: 'in', label: 'SIG' }],
    props: [{ key: 'minUs', label: '0° 펄스(µs)', type: 'number', min: 300, max: 1500, default: 500 },
      { key: 'maxUs', label: '180° 펄스(µs)', type: 'number', min: 1500, max: 3000, default: 2500 }],
    create: function (m, n) {
      var i = base(m, n); i.angle = 90; i.target = null;
      i.tick = function (dt) {
        var p = i.pinOf('sig'), w = p && m.pwmOf(p);
        if (w && w.freq > 30 && w.freq < 400) {
          var us = w.duty / w.freq * 1e6, a = (us - i.prop('minUs')) / (i.prop('maxUs') - i.prop('minUs')) * 180;
          i.target = Math.max(0, Math.min(180, a)); i.us = us; i.freq = w.freq;
        } else { i.target = null; i.us = 0; i.freq = w ? w.freq : 0; }
        if (i.target != null) { var d = i.target - i.angle, step = 0.6 * dt; i.angle += Math.abs(d) < step ? d : Math.sign(d) * step; }
      };
      i.state = function () { return { angle: i.angle, us: i.us || 0, freq: i.freq || 0, valid: i.target != null }; };
      return i;
    }
  });
  def('stepper', {
    name: '스텝모터 28BYJ-48 + ULN2003', cat: '구동', w: 140, h: 120,
    ports: [1, 2, 3, 4].map(function (k) { return { id: 'in' + k, dir: 'in', label: 'IN' + k }; }),
    props: [{ key: 'stepsPerRev', label: '한 바퀴 스텝(하프스텝)', type: 'number', min: 8, max: 10000, default: 4096 }],
    create: function (m, n) {
      var i = base(m, n); i.pos = 0; i.angle = 0; i.lastPat = 0; i.err = 0; i.rate = 0; i._cnt = 0;
      var SEQ = [1, 3, 2, 6, 4, 12, 8, 9];   // 하프스텝 (IN1=bit0)
      i.state = function () { return { angle: i.angle, pattern: i.lastPat, steps: i.pos, rate: i.rate, err: i.err }; };
      i.onChange = function () {
        var pat = 0; [1, 2, 3, 4].forEach(function (k) { if (level(i, 'in' + k)) pat |= 1 << (k - 1); });
        if (pat === i.lastPat) return;
        var a = SEQ.indexOf(i.lastPat), b = SEQ.indexOf(pat);
        if (a >= 0 && b >= 0 && pat) {
          var d = ((b - a) % 8 + 8) % 8;
          if (d === 1 || d === 2) i.pos += d === 1 ? 1 : 2; else if (d === 7 || d === 6) i.pos -= d === 7 ? 1 : 2; else i.err++;
          i._cnt++;
        } else if (pat) i.err++;
        i.lastPat = pat;
        i.angle = (i.pos / +i.prop('stepsPerRev') * 360) % 360;
      };
      i.tick = function (dt) { i.rate += ((i._cnt / dt * 1000) - i.rate) * 0.3; i._cnt = 0; };
      [1, 2, 3, 4].forEach(function (k) { var p = i.pinOf('in' + k); if (p) m.watch(p, i.onChange); });
      return i;
    }
  });
  // ---------------------------------------------------------------- UART 터미널
  def('uart', {
    name: 'UART 터미널', cat: '통신', w: 130, h: 80,
    ports: [{ id: 'rx', dir: 'in', label: 'RX ← MCU TX' }, { id: 'tx', dir: 'out', label: 'TX → MCU RX' }],
    props: [{ key: 'baud', label: '보레이트', type: 'select', options: ['9600', '19200', '38400', '57600', '115200', '230400'], default: '115200' },
      { key: 'name', label: '이름', type: 'text', default: 'Serial' },
      { key: 'eol', label: '전송 시 줄끝', type: 'select', options: [['\n', 'LF (\\n)'], ['\r\n', 'CR+LF'], ['', '없음']], default: '\n' }],
    create: function (m, n) {
      var i = base(m, n); i.lines = ''; i.mismatch = false;
      i.uartRx = function (bytes, baud) {
        var mine = +i.prop('baud');
        if (Math.abs(baud - mine) / mine > 0.03) { i.mismatch = true; bytes = bytes.map(function (b) { return (b * 7 + 0x5A) & 0x7F | 0x80; }); }
        else i.mismatch = false;
        m.emit('terminal', i, bytes);
      };
      i.send = function (text) {
        var b = Array.prototype.slice.call(new TextEncoder().encode(text + i.prop('eol')));
        var p = i.pinOf('tx'); if (!p) { m.log('warn', i.prop('name') + ': TX 포트가 MCU RX 핀에 연결되지 않았습니다.'); return; }
        m.uartIn(p, b, +i.prop('baud'));
      };
      i.state = function () { return { name: i.prop('name'), baud: +i.prop('baud'), mismatch: i.mismatch }; };
      return i;
    }
  });
  def('vcp', {
    name: 'ST-Link 가상 COM', cat: '통신', w: 130, h: 80, builtin: true,
    ports: [{ id: 'rx', dir: 'in', label: 'RX' }, { id: 'tx', dir: 'out', label: 'TX' }],
    props: [{ key: 'baud', label: '보레이트', type: 'select', options: ['9600', '19200', '38400', '57600', '115200', '230400'], default: '115200' },
      { key: 'eol', label: '전송 시 줄끝', type: 'select', options: [['\n', 'LF (\\n)'], ['\r\n', 'CR+LF'], ['', '없음']], default: '\n' }],
    create: function (m, n) { var d = DEVICES.uart.create(m, n); d.prop = base(m, n).prop; n.props = n.props || {}; if (!n.props.name) n.props.name = 'ST-Link VCP'; return d; }
  });
  def('board-led', {
    name: '보드 LED', cat: '보드', w: 90, h: 70, builtin: true,
    ports: [{ id: 'in', dir: 'in', label: '' }],
    props: [{ key: 'color', label: '색', type: 'select', options: ['green', 'red', 'blue'], default: 'green' },
      { key: 'active', label: '켜지는 레벨', type: 'select', options: [['high', 'HIGH'], ['low', 'LOW']], default: 'high' }],
    create: function (m, n) { return DEVICES.led.create(m, n); }
  });
  def('board-button', {
    name: '보드 버튼', cat: '보드', w: 100, h: 80, builtin: true,
    ports: [{ id: 'out', dir: 'out', label: '' }],
    props: [{ key: 'wiring', label: '배선', type: 'select', options: [['module', '외부 풀업 (누르면 LOW)']], default: 'module' },
      { key: 'mode', label: '동작', type: 'select', options: [['push', '누르는 동안'], ['toggle', '토글']], default: 'push' },
      { key: 'bounce', label: '채터링 시뮬레이션', type: 'bool', default: true },
      { key: 'label', label: '이름', type: 'text', default: 'B1' }],
    create: function (m, n) { return DEVICES.button.create(m, n); }
  });
  // ---------------------------------------------------------------- 범용 I2C / SPI
  def('i2cdev', {
    name: '범용 I2C 장치', cat: '통신', w: 150, h: 100,
    ports: [{ id: 'scl', dir: 'io', label: 'SCL' }, { id: 'sda', dir: 'io', label: 'SDA' }],
    props: [{ key: 'addr', label: '7비트 주소 (hex)', type: 'text', default: '0x48' },
      { key: 'regs', label: '레지스터 0x00~ (hex 바이트)', type: 'textarea', default: '19 80 00 00 00 00 00 00 00 00 00 00 00 00 00 A5' },
      { key: 'name', label: '이름', type: 'text', default: 'LM75 (온도)' }],
    create: function (m, n) {
      var i = base(m, n); i.ptr = 0; i.log = [];
      function regs() { return (i.prop('regs') || '').trim().split(/[\s,]+/).filter(Boolean).map(function (h) { return parseInt(h, 16) & 255; }); }
      i.i2cAddr = function () { var a = i.prop('addr'); return (typeof a === 'number' ? a : parseInt(a, 16)) & 0x7F; };
      i.i2cWrite = function (bytes) {
        if (!bytes.length) return;
        var r = regs(); i.ptr = bytes[0];
        for (var k = 1; k < bytes.length; k++) { r[(i.ptr + k - 1) & 255] = bytes[k]; }
        if (bytes.length > 1) { n.props = n.props || {}; n.props.regs = r.map(function (b) { return ('0' + b.toString(16)).slice(-2).toUpperCase(); }).join(' '); }
        i.log.push('W ' + bytes.map(hex).join(' ')); if (i.log.length > 20) i.log.shift();
      };
      i.i2cRead = function (cnt) { var r = regs(), o = []; for (var k = 0; k < cnt; k++) o.push(r[(i.ptr + k) % Math.max(1, r.length)] || 0); i.ptr = (i.ptr + cnt) & 255; i.log.push('R ' + o.map(hex).join(' ')); if (i.log.length > 20) i.log.shift(); return o; };
      i.state = function () { return { name: i.prop('name'), addr: i.i2cAddr(), ptr: i.ptr, log: i.log, regs: regs() }; };
      return i;
    }
  });
  def('spidev', {
    name: '범용 SPI 장치', cat: '통신', w: 150, h: 110,
    ports: [{ id: 'sck', dir: 'in', label: 'SCK' }, { id: 'mosi', dir: 'in', label: 'MOSI' }, { id: 'miso', dir: 'out', label: 'MISO' }, { id: 'cs', dir: 'in', label: 'CS' }],
    props: [{ key: 'reply', label: '응답 바이트 (hex, 순서대로)', type: 'text', default: '9F 00 EF 40 18' },
      { key: 'name', label: '이름', type: 'text', default: 'SPI Flash (W25Q)' }],
    create: function (m, n) {
      var i = base(m, n); i.idx = 0; i.log = [];
      i.spiXfer = function (b) {
        var r = (i.prop('reply') || '').trim().split(/[\s,]+/).filter(Boolean).map(function (h) { return parseInt(h, 16) & 255; });
        var out = r.length ? r[i.idx % r.length] : 0xFF; i.idx++;
        i.log.push(hex(b) + '→' + hex(out)); if (i.log.length > 24) i.log.shift();
        return out;
      };
      var cs = i.pinOf('cs'); if (cs) m.watch(cs, function (lv) { if (lv) i.idx = 0; });
      i.state = function () { return { name: i.prop('name'), log: i.log, selected: cs ? m.level(cs) === 0 : true }; };
      return i;
    }
  });
  def('logic', {
    name: '로직 분석기', cat: '계측', w: 130, h: 110,
    ports: [0, 1, 2, 3].map(function (k) { return { id: 'ch' + k, dir: 'in', label: 'CH' + k }; }),
    props: [{ key: 'span', label: '표시 폭 (ms)', type: 'select', options: ['5', '20', '100', '500', '2000', '5000'], default: '500' }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () {
        return { span: +i.prop('span'), chans: [0, 1, 2, 3].map(function (k) { var p = i.pinOf('ch' + k); return { pin: p, hist: p ? m.pins[p].hist : null, level: p ? m.level(p) : 0, pwm: p ? m.pwmOf(p) : null }; }) };
      };
      return i;
    }
  });

  // ======================================================================== 확장 장치
  /*
   * µs 정밀 타이밍은 런타임이 맡는다: Machine.step() 이 다음 m.at() 이벤트 직전에 양보하도록 quantum 을 줄인다.
   * (예전에는 장치가 m.$.q 를 직접 줄였다. 호출 자리는 남겨 두고 아무것도 하지 않는다.)
   */
  function precise() { }
  function setProp(n, k, v) { n.props = n.props || {}; n.props[k] = v; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------------- SSD1306 OLED 128x64 (I2C)
  def('oled', {
    name: 'OLED 128x64 (SSD1306)', cat: '표시', w: 170, h: 90,
    ports: [{ id: 'scl', dir: 'io', label: 'SCL' }, { id: 'sda', dir: 'io', label: 'SDA' }],
    props: [{ key: 'addr', label: 'I2C 주소', type: 'select', options: [['0x3C', '0x3C (SA0=L, 기본)'], ['0x3D', '0x3D (SA0=H)']], default: '0x3C' },
      { key: 'color', label: '화면 색', type: 'select', options: [['white', '흰색'], ['blue', '파랑'], ['yb', '노랑(위 16줄)+파랑']], default: 'blue' }],
    create: function (m, n) {
      var i = base(m, n);
      var ram = new Uint8Array(1024);
      var st = { on: false, invert: false, contrast: 0x7F, remap: false, comDec: false, startLine: 0, offset: 0, pump: false, allOn: false, mode: 2,
        col: 0, page: 0, c0: 0, c1: 127, p0: 0, p1: 7, mux: 63 };
      var pend = null, ver = 0, litVer = -1, lit = 0, ncmd = 0, ndata = 0;
      var ARGS = { 0x20: 1, 0x21: 2, 0x22: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2A: 5, 0xA3: 2, 0x81: 1, 0x8D: 1, 0xA8: 1, 0xD3: 1, 0xD5: 1, 0xD8: 1, 0xD9: 1, 0xDA: 1, 0xDB: 1 };
      function exec(c, a) {
        switch (c) {
          case 0x20: st.mode = a[0] & 3; if (st.mode === 3) st.mode = 2; break;
          case 0x21: st.c0 = a[0] & 127; st.c1 = a[1] & 127; st.col = st.c0; break;
          case 0x22: st.p0 = a[0] & 7; st.p1 = a[1] & 7; st.page = st.p0; break;
          case 0x81: st.contrast = a[0]; break;
          case 0x8D: st.pump = !!(a[0] & 4); break;
          case 0xA8: st.mux = a[0] & 63; break;
          case 0xD3: st.offset = a[0] & 63; break;
        }
      }
      function cmd(c) {
        ncmd++;
        if (pend) { pend.a.push(c); if (pend.a.length >= pend.n) { exec(pend.c, pend.a); pend = null; } return; }
        if (ARGS[c]) { pend = { c: c, n: ARGS[c], a: [] }; return; }
        if (c === 0xAE || c === 0xAF) st.on = c === 0xAF;
        else if (c === 0xA6 || c === 0xA7) st.invert = c === 0xA7;
        else if (c === 0xA4 || c === 0xA5) st.allOn = c === 0xA5;
        else if (c === 0xA0 || c === 0xA1) st.remap = c === 0xA1;
        else if (c === 0xC0 || c === 0xC8) st.comDec = c === 0xC8;
        else if (c >= 0x40 && c <= 0x7F) st.startLine = c & 63;
        else if (c >= 0xB0 && c <= 0xB7) st.page = c & 7;
        else if (c <= 0x0F) { st.col = (st.col & 0xF0) | c; st.c0 = st.mode === 2 ? st.col : st.c0; }
        else if (c >= 0x10 && c <= 0x1F) { st.col = ((c & 0x07) << 4) | (st.col & 0x0F); st.c0 = st.mode === 2 ? st.col : st.c0; }
        // 0x2E/0x2F(스크롤), 0xE3(NOP) 등은 받아들이고 무시
        ver++;
      }
      function data(d) {
        ndata++;
        ram[st.page * 128 + (st.col & 127)] = d; ver++;
        if (st.mode === 0) {            // 수평: 열 → 끝나면 다음 페이지
          if (++st.col > st.c1) { st.col = st.c0; if (++st.page > st.p1) st.page = st.p0; }
        } else if (st.mode === 1) {     // 수직: 페이지 → 끝나면 다음 열
          if (++st.page > st.p1) { st.page = st.p0; if (++st.col > st.c1) st.col = st.c0; }
        } else {                        // 페이지 모드: 열만 증가, 127 다음은 0
          st.col = (st.col + 1) & 127;
        }
      }
      i.i2cAddr = function () { var a = i.prop('addr'); return (typeof a === 'number' ? a : parseInt(a, 16)) & 0x7F; };
      i.i2cWrite = function (bytes) {
        var k = 0;
        while (k < bytes.length) {
          var ctrl = bytes[k++], dc = ctrl & 0x40;
          if (ctrl & 0x80) { if (k < bytes.length) { if (dc) data(bytes[k]); else cmd(bytes[k]); k++; } }
          else { for (; k < bytes.length; k++) { if (dc) data(bytes[k]); else cmd(bytes[k]); } }
        }
      };
      i.i2cRead = function (cnt) { var o = []; for (var j = 0; j < cnt; j++) o.push(st.on ? 0x00 : 0x40); return o; };   // 상태 바이트: D6 = 디스플레이 꺼짐
      i.pixel = function (x, y) {    // 화면 좌표 → 켜짐 여부 (재매핑·스캔 방향·시작줄 반영)
        var col = st.remap ? x : 127 - x, row = st.comDec ? y : 63 - y;
        row = (row + st.startLine + st.offset) & 63;
        var v = (ram[(row >> 3) * 128 + col] >> (row & 7)) & 1;
        if (st.allOn) v = 1;
        return st.invert ? v ^ 1 : v;
      };
      i.state = function () {
        if (litVer !== ver) { lit = 0; for (var k = 0; k < 1024; k++) { var b = ram[k]; while (b) { lit += b & 1; b >>= 1; } } litVer = ver; }
        return { on: st.on && st.pump, disp: st.on, pump: st.pump, lit: lit, mode: ['H', 'V', 'P'][st.mode], invert: st.invert, contrast: st.contrast,
          cmds: ncmd, bytes: ndata, ver: ver, color: i.prop('color') };
      };
      return i;
    }
  });

  // ---------------------------------------------------------------- HC-SR04 초음파
  def('ultrasonic', {
    name: '초음파 센서 (HC-SR04)', cat: '입력', w: 150, h: 80,
    ports: [{ id: 'trig', dir: 'in', label: 'TRIG' }, { id: 'echo', dir: 'out', label: 'ECHO' }],
    props: [{ key: 'distance', label: '거리 (cm)', type: 'range', min: 2, max: 400, default: 25 }],
    create: function (m, n) {
      var i = base(m, n), rise = null, busy = false; i.pings = 0; i.lastUs = 0; i.short = 0;
      drive(i, 'echo', 0);
      i.set = function (v) { setProp(n, 'distance', clamp(Math.round(v), 2, 400)); };
      var tp = i.pinOf('trig');
      if (tp) m.watch(tp, function (lv, t, pwm) {
        if (pwm) return;
        if (lv) { rise = t; return; }
        if (rise == null) return;
        var w = (t - rise) * 1000; rise = null;       // µs
        if (busy) return;
        if (w < 9.5) { i.short++; m.warnOnce('us-short' + n.id, n.id + ': TRIG 펄스가 ' + w.toFixed(1) + ' µs 입니다. HC-SR04 는 10 µs 이상이어야 측정을 시작합니다.'); return; }
        busy = true; i.pings++;
        var echoUs = +i.prop('distance') * 58, t1 = t + 0.25;   // 40 kHz 버스트 8회 후 ECHO 상승
        precise(m, true);
        m.at(t1, function () { drive(i, 'echo', 1); });
        m.at(t1 + echoUs / 1000, function () { drive(i, 'echo', 0); i.lastUs = echoUs; precise(m, false); });
        m.at(t1 + Math.max(echoUs / 1000, 0) + 10, function () { busy = false; });   // 다음 측정까지 최소 간격
      });
      i.state = function () { return { cm: +i.prop('distance'), echoUs: i.lastUs, pings: i.pings, echo: level(i, 'echo') }; };
      return i;
    }
  });

  // ---------------------------------------------------------------- 4x4 매트릭스 키패드
  var KP_KEYS = ['123A', '456B', '789C', '*0#D'];
  def('keypad', {
    name: '4x4 키패드', cat: '입력', w: 130, h: 160,
    ports: [1, 2, 3, 4].map(function (k) { return { id: 'r' + k, dir: 'in', label: 'R' + k }; })
      .concat([1, 2, 3, 4].map(function (k) { return { id: 'c' + k, dir: 'out', label: 'C' + k }; })),
    props: [{ key: 'label', label: '이름', type: 'text', default: 'KEYPAD' }],
    create: function (m, n) {
      var i = base(m, n); i.held = {}; i.last = '';
      i.keys = KP_KEYS;
      i.eval = function () {
        for (var c = 0; c < 4; c++) {
          var low = false;
          for (var r = 0; r < 4; r++) if (i.held[KP_KEYS[r][c]] && i.pinOf('r' + (r + 1)) && level(i, 'r' + (r + 1)) === 0) low = true;
          drive(i, 'c' + (c + 1), low ? 0 : null);    // 안 눌리면 놓음 → MCU 풀업이 HIGH 로
        }
      };
      i.press = function (key, down) {
        if (down) { i.held[key] = true; i.last = key; } else delete i.held[key];
        i.eval();
      };
      [1, 2, 3, 4].forEach(function (k) { var p = i.pinOf('r' + k); if (p) m.watch(p, function () { i.eval(); }); });
      i.state = function () { return { held: Object.keys(i.held).join(''), last: i.last, label: i.prop('label') }; };
      return i;
    }
  });

  // ---------------------------------------------------------------- 4자리 7세그먼트 (다이내믹 구동)
  var SEGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
  var SEG_CHAR = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9', abcefg: 'A', cdefg: 'b', adef: 'C', bcdeg: 'd', adefg: 'E', aefg: 'F', g: '-', '': ' ' };
  def('fnd4', {
    name: '7세그먼트 4자리', cat: '표시', w: 150, h: 230,
    ports: SEGS.map(function (c) { return { id: c, dir: 'in', label: c }; })
      .concat([1, 2, 3, 4].map(function (k) { return { id: 'd' + k, dir: 'in', label: 'D' + k }; })),
    props: [{ key: 'common', label: '공통 단자', type: 'select', options: [['cathode', '공통 캐소드 (세그먼트 HIGH, 자리 LOW 켜짐)'], ['anode', '공통 애노드 (세그먼트 LOW, 자리 HIGH 켜짐)']], default: 'cathode' },
      { key: 'color', label: '색', type: 'select', options: ['red', 'green', 'blue', 'yellow'], default: 'red' }],
    create: function (m, n) {
      var i = base(m, n), acc = [], cur = {}, last = m.now(), from = m.now();
      i.bright = [0, 1, 2, 3].map(function () { return SEGS.map(function () { return 0; }); });
      function reset() { acc = [0, 1, 2, 3].map(function () { return [0, 0, 0, 0, 0, 0, 0, 0]; }); }
      function snap() { SEGS.concat(['d1', 'd2', 'd3', 'd4']).forEach(function (p) { cur[p] = i.pinOf(p) ? level(i, p) : null; }); }
      function flush(t) {
        var dt = t - last; last = t; if (dt <= 0) return;
        var an = i.prop('common') === 'anode';
        for (var d = 0; d < 4; d++) {
          var dv = cur['d' + (d + 1)];
          var on = dv == null ? false : an ? dv === 1 : dv === 0;
          if (!on) continue;
          for (var s = 0; s < 8; s++) { var sv = cur[SEGS[s]]; if (sv != null && (an ? sv === 0 : sv === 1)) acc[d][s] += dt; }
        }
      }
      reset(); snap();
      SEGS.concat(['d1', 'd2', 'd3', 'd4']).forEach(function (p) {
        var pin = i.pinOf(p); if (pin) m.watch(pin, function () { flush(m.now()); snap(); });
      });
      i.tick = function () {
        var t = m.now(); flush(t); snap();
        var span = t - from; if (span <= 0) return;
        for (var d = 0; d < 4; d++) for (var s = 0; s < 8; s++) i.bright[d][s] += (acc[d][s] / span - i.bright[d][s]) * 0.5;   // 프레임 주기와 스캔 주기가 어긋나 생기는 깜빡임 완화
        reset(); from = t;
      };
      i.state = function () {
        var mx = 0; i.bright.forEach(function (row) { row.forEach(function (v) { if (v > mx) mx = v; }); });
        var th = Math.max(0.02, mx * 0.3), text = '';
        var digits = i.bright.map(function (row) {
          var on = ''; for (var s = 0; s < 7; s++) if (row[s] > th) on += SEGS[s];
          text += (SEG_CHAR[on] != null ? SEG_CHAR[on] : '?') + (row[7] > th ? '.' : '');
          return row.map(function (v) { return Math.min(1, v * 4); });   // 4자리 다이내믹 구동(듀티 25%)을 최대 밝기로
        });
        return { text: text, digits: digits, color: i.prop('color') };
      };
      return i;
    }
  });

  // ---------------------------------------------------------------- DHT11 온습도
  def('dht11', {
    name: '온습도 센서 (DHT11)', cat: '입력', w: 140, h: 80,
    ports: [{ id: 'data', dir: 'io', label: 'DATA' }],
    props: [{ key: 'temp', label: '온도 (°C)', type: 'range', min: 0, max: 50, default: 24 },
      { key: 'hum', label: '습도 (%)', type: 'range', min: 20, max: 90, default: 55 }],
    create: function (m, n) {
      /*
       * 단일 선 프로토콜. 선은 풀업되어 있다고 가정한다 — MCU 핀을 GPIO_PULLUP 입력으로 바꾸거나 HIGH 로 쓰면 '놓음'으로 본다.
       * MCU 가 LOW 를 18 ms 이상 유지한 뒤 선이 HIGH 가 되면 35 µs 뒤 응답(80 µs LOW, 80 µs HIGH) + 40비트 + 끝 50 µs LOW.
       * 응답하는 동안만 drive(0/1), 끝나면 drive(null) 로 선을 놓는다.
       */
      var i = base(m, n), lowAt = null, busy = false; i.reads = 0; i.lastBytes = null;
      i.set = function (k, v) { setProp(n, k, k === 'temp' ? clamp(Math.round(v), 0, 50) : clamp(Math.round(v), 20, 90)); };
      function frame() {
        var h = +i.prop('hum'), t = +i.prop('temp');
        var b = [Math.floor(h) & 255, 0, Math.floor(t) & 255, Math.round((t - Math.floor(t)) * 10) & 255];
        b.push((b[0] + b[1] + b[2] + b[3]) & 255);
        return b;
      }
      function respond(t0) {
        busy = true; i.reads++;
        var bytes = frame(), t = t0 + 0.035;
        i.lastBytes = bytes;
        precise(m, true);
        function at(dt, v) { var tt = t; m.at(tt, function () { drive(i, 'data', v); }); t += dt / 1000; }
        at(80, 0); at(80, 1);
        for (var k = 0; k < 40; k++) { var bit = (bytes[k >> 3] >> (7 - (k & 7))) & 1; at(50, 0); at(bit ? 70 : 27, 1); }
        at(50, 0);
        m.at(t, function () { drive(i, 'data', null); busy = false; lowAt = null; precise(m, false); });
      }
      var p = i.pinOf('data');
      if (p) m.watch(p, function (lv, t, pwm) {
        if (busy || pwm) return;
        if (lv === 0) { if (m.pins[p].mode === 'output') lowAt = t; return; }
        if (lowAt == null) return;
        var w = t - lowAt; lowAt = null;
        if (w >= 17.5) respond(t);
        else if (w > 0.5) m.warnOnce('dht-short' + n.id, n.id + ': 시작 신호 LOW 가 ' + w.toFixed(1) + ' ms 입니다. DHT11 은 18 ms 이상 LOW 를 유지해야 응답합니다.');
      });
      i.state = function () { return { temp: +i.prop('temp'), hum: +i.prop('hum'), reads: i.reads, busy: busy, bytes: i.lastBytes }; };
      return i;
    }
  });

  // ---------------------------------------------------------------- 릴레이 모듈
  def('relay', {
    name: '릴레이 모듈 (1채널)', cat: '구동', w: 130, h: 70,
    ports: [{ id: 'in', dir: 'in', label: 'IN' }],
    props: [{ key: 'active', label: '동작 레벨', type: 'select', options: [['low', 'LOW 에서 켜짐 (대부분의 모듈)'], ['high', 'HIGH 에서 켜짐']], default: 'low' },
      { key: 'load', label: '부하 이름', type: 'text', default: '전등 (AC 220V)' }],
    create: function (m, n) {
      var i = base(m, n);
      i.state = function () {
        var d = duty(i, 'in'), on = i.pinOf('in') ? (i.prop('active') === 'low' ? d < 0.5 : d > 0.5) : false;
        return { on: on, level: level(i, 'in'), load: i.prop('load'), active: i.prop('active') };
      };
      return i;
    }
  });

  // ---------------------------------------------------------------- 로터리 엔코더 (KY-040)
  def('encoder', {
    name: '로터리 엔코더 (KY-040)', cat: '입력', w: 140, h: 90,
    ports: [{ id: 'clk', dir: 'out', label: 'CLK' }, { id: 'dt', dir: 'out', label: 'DT' }, { id: 'sw', dir: 'out', label: 'SW' }],
    props: [{ key: 'stepMs', label: '에지 간격 (ms)', type: 'number', min: 0.2, max: 50, default: 2 }],
    create: function (m, n) {
      var i = base(m, n), free = 0; i.pos = 0; i.clk = 1; i.dt = 1; i.sw = false;
      function out() { drive(i, 'clk', i.clk); drive(i, 'dt', i.dt); drive(i, 'sw', i.sw ? 0 : 1); }
      /** dir: +1 시계 방향(CLK 가 먼저 떨어짐), -1 반시계. 한 칸 = 직교 신호 한 주기 */
      i.rotate = function (dir) {
        var gap = Math.max(0.2, +i.prop('stepMs') || 2), t = Math.max(m.now(), free) + gap;
        var seq = dir > 0 ? [[0, 1], [0, 0], [1, 0], [1, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];
        seq.forEach(function (s, k) { m.at(t + k * gap, function () { i.clk = s[0]; i.dt = s[1]; out(); if (k === 3) i.pos += dir > 0 ? 1 : -1; }); });
        free = t + 3 * gap;
      };
      i.press = function (down) { i.sw = !!down; out(); };
      out();
      i.state = function () { return { pos: i.pos, clk: i.clk, dt: i.dt, sw: i.sw }; };
      return i;
    }
  });

  // ---------------------------------------------------------------- 2축 조이스틱
  def('joystick', {
    name: '조이스틱 (2축)', cat: '입력', w: 130, h: 90,
    ports: [{ id: 'vrx', dir: 'analog', label: 'VRx' }, { id: 'vry', dir: 'analog', label: 'VRy' }, { id: 'sw', dir: 'out', label: 'SW' }],
    props: [{ key: 'x', label: 'X (0–4095)', type: 'range', min: 0, max: 4095, default: 2048 },
      { key: 'y', label: 'Y (0–4095)', type: 'range', min: 0, max: 4095, default: 2048 }],
    create: function (m, n) {
      var i = base(m, n); i.sw = false;
      i.apply = function () {
        var px = i.pinOf('vrx'), py = i.pinOf('vry');
        if (px) m.setAnalog(px, +i.prop('x')); if (py) m.setAnalog(py, +i.prop('y'));
        drive(i, 'sw', i.sw ? 0 : 1);
      };
      i.set = function (x, y) { setProp(n, 'x', clamp(Math.round(x), 0, 4095)); setProp(n, 'y', clamp(Math.round(y), 0, 4095)); i.apply(); };
      i.press = function (down) { i.sw = !!down; i.apply(); };
      i.state = function () { return { x: +i.prop('x'), y: +i.prop('y'), sw: i.sw }; };
      i.apply(); return i;
    }
  });

  function hex(b) { return ('0' + (b & 255).toString(16)).slice(-2).toUpperCase(); }

  /** 노드 배열 + 배선 → 장치 인스턴스 배열 (machine.devices 에 붙임) */
  function instantiate(machine, nodes, wires) {
    nodes.forEach(function (n) { n.conn = {}; });
    (wires || []).forEach(function (w) {
      var pin = w[0], parts = String(w[1]).split('.'), node = nodes.filter(function (n) { return n.id === parts[0]; })[0];
      if (node) node.conn[parts[1]] = pin;
    });
    var list = [];
    nodes.forEach(function (n) {
      var d = DEVICES[n.type]; if (!d) return;
      var inst = d.create(machine, n); inst.def = d; list.push(inst);
    });
    machine.devices = list;
    return list;
  }

  global.STM32Devices = { DEVICES: DEVICES, instantiate: instantiate, hex: hex };
})(typeof window !== 'undefined' ? window : globalThis);
