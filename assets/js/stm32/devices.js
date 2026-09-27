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
      i.i2cAddr = function () { return parseInt(i.prop('addr'), 16); };
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
      i.i2cAddr = function () { return parseInt(i.prop('addr'), 16) & 0x7F; };
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
