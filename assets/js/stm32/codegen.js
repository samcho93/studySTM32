/*
 * codegen.js — CubeMX 식 코드 생성
 * -------------------------------------------------------------------------
 * 프로젝트 설정(핀·주변장치·NVIC·클럭)으로 main.c / main.h 를 만든다.
 * main.c 의 USER CODE BEGIN/END 구역은 다시 생성해도 보존된다 (CubeMX 와 같은 규칙).
 * HAL 드라이버 헤더(읽기 전용)와 .ioc 텍스트도 여기서 만든다.
 */
(function (global) {
  'use strict';
  var C = global.STM32Chips;

  var SECTIONS = ['Header', 'Includes', 'PTD', 'PD', 'PM', 'PV', 'PFP', '0', '1', 'Init', 'SysInit', '2', 'WHILE', '3', '4', 'Error_Handler_Debug'];
  var EX_KEY = { includes: 'Includes', pv: 'PV', pfp: 'PFP', u0: '0', u1: '1', u2: '2', loop: '3', u4: '4', ptd: 'PTD', pd: 'PD', pm: 'PM',
    rtos_mutex: 'RTOS_MUTEX', rtos_sem: 'RTOS_SEMAPHORES', rtos_timers: 'RTOS_TIMERS', rtos_queues: 'RTOS_QUEUES', rtos_threads: 'RTOS_THREADS', rtos_events: 'RTOS_EVENTS' };

  /** main.c 에서 USER CODE 구역 뽑기 → { name: text } */
  function extractUser(src) {
    var out = {};
    if (!src) return out;
    var re = /\/\*\s*USER CODE BEGIN ([\w]+)\s*\*\/[^\n]*\n?([\s\S]*?)[ \t]*\/\*\s*USER CODE END \1\s*\*\//g, m;
    while ((m = re.exec(src))) out[m[1]] = m[2];
    return out;
  }

  /** 예제의 user{} 를 구역 이름으로 */
  function userFromExample(u) {
    var out = {};
    Object.keys(u || {}).forEach(function (k) {
      if (!EX_KEY[k]) return;
      var v = u[k] || '';
      if (v && !/\n$/.test(v)) v += '\n';
      out[EX_KEY[k]] = k === 'loop' ? v + '  }\n' : v;
    });
    if (out['3'] == null) out['3'] = '  }\n';
    // tasks: { 함수이름: 본문 } → 첫 태스크(기본)는 USER CODE 5, 나머지는 함수 이름 구역 (CubeMX 규칙)
    if (u && u.tasks) Object.keys(u.tasks).forEach(function (fn, i) { var v = u.tasks[fn] || ''; if (v && !/\n$/.test(v)) v += '\n'; out[i === 0 ? '5' : fn] = v; });
    return out;
  }

  function portOf(pin) { return 'GPIO' + pin[1]; }
  function numOf(pin) { return parseInt(pin.slice(2), 10); }
  function exti(n, chip) { return C.extiLine(chip, n); }

  function pinDefName(pin, cfg) {
    return cfg.label ? cfg.label.replace(/[^\w]/g, '_') : null;
  }

  /** 켜진 주변장치 목록 (정렬: CubeMX 생성 순서와 비슷하게) */
  function activePeriph(project) {
    var P = project.periph || {}, list = [];
    Object.keys(P).forEach(function (k) {
      var c = P[k] || {};
      if (/^(LPUART|USART)/.test(k) && c.mode === 'async') list.push(k);
      else if (/^I2C/.test(k) && c.mode === 'i2c') list.push(k);
      else if (/^SPI/.test(k) && c.mode === 'master') list.push(k);
      else if (/^TIM/.test(k) && c.enabled !== false && (c.psc != null || c.arr != null || c.ch)) list.push(k);
      else if (k === 'ADC1' && c.channels && c.channels.length) list.push(k);
      else if (k === 'IWDG' && c.enabled !== false) list.push(k);
      else if (k === 'RTC' && c.enabled !== false) list.push(k);
    });
    var order = ['ADC1', 'I2C1', 'I2C2', 'IWDG', 'RTC', 'SPI1', 'SPI2', 'TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'TIM21', 'TIM22', 'LPUART1', 'USART1', 'USART2', 'USART3', 'USART6'];
    list.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return list;
  }

  function handleName(p) {
    if (p === 'IWDG') return 'hiwdg';
    if (p === 'RTC') return 'hrtc';
    if (/^USART(\d)/.test(p)) return 'huart' + p.slice(5);
    if (/^LPUART(\d)/.test(p)) return 'hlpuart' + p.slice(6);
    if (/^I2C/.test(p)) return 'hi2c' + p.slice(3);
    if (/^SPI/.test(p)) return 'hspi' + p.slice(3);
    if (/^TIM/.test(p)) return 'htim' + p.slice(3);
    if (/^ADC/.test(p)) return 'hadc' + p.slice(3);
  }
  function handleType(p) {
    if (p === 'IWDG') return 'IWDG_HandleTypeDef';
    if (p === 'RTC') return 'RTC_HandleTypeDef';
    if (/^(LPUART|USART)/.test(p)) return 'UART_HandleTypeDef';
    if (/^I2C/.test(p)) return 'I2C_HandleTypeDef';
    if (/^SPI/.test(p)) return 'SPI_HandleTypeDef';
    if (/^TIM/.test(p)) return 'TIM_HandleTypeDef';
    if (/^ADC/.test(p)) return 'ADC_HandleTypeDef';
  }
  function initName(p) { return /^(LPUART|USART)/.test(p) ? 'MX_' + p + '_UART_Init' : 'MX_' + p + '_Init'; }

  function sec(user, name, def) {
    var body = user[name] != null ? user[name] : (def || '');
    return '/* USER CODE BEGIN ' + name + ' */\n' + body + (body && !/\n$/.test(body) ? '\n' : '');
  }
  function secIndented(user, name, ind, def) {
    var body = user[name] != null ? user[name] : (def || '');
    return ind + '/* USER CODE BEGIN ' + name + ' */\n' + body + (body && !/\n$/.test(body) ? '\n' : '') + ind + '/* USER CODE END ' + name + ' */\n';
  }

  // ------------------------------------------------------------ main.h
  function genMainH(project) {
    var chip = C.chipOf(project);
    var s = '/* USER CODE BEGIN Header */\n/**\n  ******************************************************************************\n' +
      '  * @file           : main.h\n  * @brief          : Header for main.c file.\n' +
      '  *                   This file contains the common defines of the application.\n' +
      '  ******************************************************************************\n  */\n/* USER CODE END Header */\n\n' +
      '#ifndef __MAIN_H\n#define __MAIN_H\n\n#ifdef __cplusplus\nextern "C" {\n#endif\n\n' +
      '/* Includes ------------------------------------------------------------------*/\n' +
      '#include "' + chip.halPrefix + '_hal.h"\n\n' +
      '/* Exported functions prototypes ---------------------------------------------*/\nvoid Error_Handler(void);\n\n' +
      '/* Private defines -----------------------------------------------------------*/\n';
    var pins = project.pins || {};
    chip.pins.forEach(function (pin, i) {
      var cfg = pins[pin];
      if (!cfg || !cfg.label || !C.isGpio(pin)) return;
      if (chip.pins.indexOf(pin) !== i) return;
      var n = pinDefName(pin, cfg);
      s += '#define ' + n + '_Pin GPIO_PIN_' + numOf(pin) + '\n';
      s += '#define ' + n + '_GPIO_Port ' + portOf(pin) + '\n';
      if (cfg.signal === 'GPIO_EXTI') s += '#define ' + n + '_EXTI_IRQn ' + exti(numOf(pin), chip) + '_IRQn\n';
    });
    s += '\n#ifdef __cplusplus\n}\n#endif\n\n#endif /* __MAIN_H */\n';
    return s;
  }

  // ------------------------------------------------------------ main.c
  function genMainC(project, user) {
    user = user || {};
    var chip = C.chipOf(project), f4 = chip.series === 'F4';
    var act = activePeriph(project);
    var P = project.periph || {}, N = project.nvic || {};
    var out = [];
    out.push('/* USER CODE BEGIN Header */\n' + (user.Header != null ? user.Header :
      '/**\n  ******************************************************************************\n' +
      '  * @file           : main.c\n  * @brief          : Main program body\n' +
      '  ******************************************************************************\n' +
      '  * 이 파일은 STM32CubeMX 방식으로 생성되었습니다 (studySTM32 시뮬레이터).\n' +
      '  * 사용자 코드는 USER CODE BEGIN / END 사이에만 작성하세요.\n' +
      '  * 그 밖의 부분은 [코드 생성]을 누르면 다시 만들어집니다.\n' +
      '  ******************************************************************************\n  */\n') +
      '/* USER CODE END Header */\n');
    var rt = rtosTasks(project);
    out.push('/* Includes ------------------------------------------------------------------*/\n#include "main.h"\n' + (rt ? '#include "cmsis_os.h"\n' : '') + '\n' +
      '/* Private includes ----------------------------------------------------------*/\n' + sec(user, 'Includes') + '/* USER CODE END Includes */\n');
    out.push('/* Private typedef -----------------------------------------------------------*/\n' + sec(user, 'PTD') + '/* USER CODE END PTD */\n');
    out.push('/* Private define ------------------------------------------------------------*/\n' + sec(user, 'PD') + '/* USER CODE END PD */\n');
    out.push('/* Private macro -------------------------------------------------------------*/\n' + sec(user, 'PM') + '/* USER CODE END PM */\n');
    var pv = '/* Private variables ---------------------------------------------------------*/\n';
    act.forEach(function (p) { pv += handleType(p) + ' ' + handleName(p) + ';\n'; });
    if (act.length) pv += '\n';
    if (rt) rt.forEach(function (t) {
      pv += '/* Definitions for ' + t.name + ' */\nosThreadId_t ' + t.name + 'Handle;\nconst osThreadAttr_t ' + t.name + '_attributes = {\n' +
        '  .name = "' + t.name + '",\n  .stack_size = ' + (t.stack || 128) + ' * 4,\n  .priority = (osPriority_t) ' + (t.prio || 'osPriorityNormal') + ',\n};\n';
    });
    if (rt) pv += '\n';
    out.push(pv + sec(user, 'PV') + '/* USER CODE END PV */\n');
    var dma = !!(P.ADC1 && P.ADC1.dma);
    var pfp = '/* Private function prototypes -----------------------------------------------*/\nvoid SystemClock_Config(void);\nstatic void MX_GPIO_Init(void);\n' + (dma ? 'static void MX_DMA_Init(void);\n' : '');
    act.forEach(function (p) { pfp += 'static void ' + initName(p) + '(void);\n'; });
    if (rt) rt.forEach(function (t) { pfp += 'void ' + t.fn + '(void *argument);\n'; });
    out.push(pfp + sec(user, 'PFP') + '/* USER CODE END PFP */\n');
    out.push('/* Private user code ---------------------------------------------------------*/\n' + sec(user, '0') + '/* USER CODE END 0 */\n');

    var m = '/**\n  * @brief  The application entry point.\n  * @retval int\n  */\nint main(void)\n{\n\n' +
      secIndented(user, '1', '  ') + '\n' +
      '  /* MCU Configuration--------------------------------------------------------*/\n\n' +
      '  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */\n  HAL_Init();\n\n' +
      secIndented(user, 'Init', '  ') + '\n' +
      '  /* Configure the system clock */\n  SystemClock_Config();\n\n' +
      secIndented(user, 'SysInit', '  ') + '\n' +
      '  /* Initialize all configured peripherals */\n  MX_GPIO_Init();\n' + (dma ? '  MX_DMA_Init();\n' : '');
    act.forEach(function (p) { m += '  ' + initName(p) + '();\n'; });
    m += secIndented(user, '2', '  ') + '\n' + (rt ? rtosMain(user, rt) : '') +
      '  /* Infinite loop */\n  /* USER CODE BEGIN WHILE */\n' + (user.WHILE != null ? user.WHILE : '  while (1)\n  {\n') +
      '    /* USER CODE END WHILE */\n\n' +
      '    /* USER CODE BEGIN 3 */\n' + (user['3'] != null ? user['3'] : '  }\n') +
      '  /* USER CODE END 3 */\n}\n';
    out.push(m);

    out.push(genClock(project, chip));
    if (dma) out.push(['/**', '  * Enable DMA controller clock', '  */', 'static void MX_DMA_Init(void)', '{', '',
      '  /* DMA controller clock enable */', (chip.series === 'F4' ? '  __HAL_RCC_DMA2_CLK_ENABLE();' : '  __HAL_RCC_DMA1_CLK_ENABLE();'), '', '  /* DMA interrupt init */',
      '  /* DMA interrupt configuration */', '  HAL_NVIC_SetPriority(' + (chip.series === 'F4' ? 'DMA2_Stream0' : 'DMA1_Channel1') + '_IRQn, 0, 0);',
      '  HAL_NVIC_EnableIRQ(' + (chip.series === 'F4' ? 'DMA2_Stream0' : 'DMA1_Channel1') + '_IRQn);', '', '}', ''].join('\n'));
    act.forEach(function (p) { out.push(genInit(p, project, chip)); });
    out.push(genGpio(project, chip));
    out.push(sec(user, '4') + '/* USER CODE END 4 */\n');
    if (rt) rt.forEach(function (t, i) {
      var secName = i === 0 ? '5' : t.fn;
      out.push('/* USER CODE BEGIN Header_' + t.fn + ' */\n/**\n  * @brief  Function implementing the ' + t.name + ' thread.\n  * @param  argument: Not used\n  * @retval None\n  */\n/* USER CODE END Header_' + t.fn + ' */\n' +
        'void ' + t.fn + '(void *argument)\n{\n' + secIndented(user, secName, '  ', '  /* Infinite loop */\n  for(;;)\n  {\n    osDelay(1);\n  }\n') + '}\n');
    });
    out.push('/**\n  * @brief  This function is executed in case of error occurrence.\n  * @retval None\n  */\n' +
      'void Error_Handler(void)\n{\n' + secIndented(user, 'Error_Handler_Debug', '  ',
        '  /* User can add his own implementation to report the HAL error return state */\n  __disable_irq();\n  while (1)\n  {\n  }\n') + '}\n');
    return out.join('\n');
  }

  function genClock(project, chip) {
    var mhz = (project.clock && project.clock.sysclk) || chip.defClk, fam = chip.series, ck = C.clocks(chip, mhz), hsi = chip.hsi, pll = mhz !== hsi;
    var s = '/**\n  * @brief System Clock Configuration (SYSCLK = ' + mhz + ' MHz, ' + chip.family + ')\n  * @retval None\n  */\nvoid SystemClock_Config(void)\n{\n' +
      '  RCC_OscInitTypeDef RCC_OscInitStruct = {0};\n  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};\n\n';
    var lat = 0, useHse = false, bypass = !!(project.board && /NUCLEO/.test(project.board)), osc = '', clk = '';
    var ERR = '  {\n    Error_Handler();\n  }\n';
    function lineOsc(k, v) { osc += '  RCC_OscInitStruct.' + k + ' = ' + v + ';\n'; }
    function lineClk(k, v) { clk += '  RCC_ClkInitStruct.' + k + ' = ' + v + ';\n'; }
    var pre = '';
    if (fam === 'F4' || fam === 'F7') {
      pre = '  /** Configure the main internal regulator output voltage\n  */\n  __HAL_RCC_PWR_CLK_ENABLE();\n  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE' + (mhz > 144 ? 1 : mhz > 84 ? 2 : 3) + ');\n\n';
      lat = fam === 'F7' ? Math.max(0, Math.ceil(mhz / 30) - 1) : (mhz > 150 ? 5 : mhz > 120 ? 4 : mhz > 90 ? 3 : mhz > 60 ? 2 : mhz > 30 ? 1 : 0);
    } else if (fam === 'F1' || fam === 'F3') { useHse = mhz > 64; lat = mhz > 48 ? 2 : mhz > 24 ? 1 : 0; }
    else if (fam === 'F0' || fam === 'C0') lat = mhz > 24 ? 1 : 0;
    else if (fam === 'G0') lat = mhz > 48 ? 2 : mhz > 24 ? 1 : 0;
    else if (fam === 'L0') { pre = '  /** Configure the main internal regulator output voltage\n  */\n  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);\n\n'; lat = mhz > 16 ? 1 : 0; }
    else if (fam === 'L4' || fam === 'U5' || fam === 'G4' || fam === 'WB') {
      pre = '  /** Configure the main internal regulator output voltage\n  */\n  if (HAL_PWREx_ControlVoltageScaling(' + (fam === 'G4' && mhz > 150 ? 'PWR_REGULATOR_VOLTAGE_SCALE1_BOOST' : 'PWR_REGULATOR_VOLTAGE_SCALE1') + ') != HAL_OK)\n' + ERR + '\n';
      lat = fam === 'G4' ? Math.min(8, Math.floor(mhz / 34)) : fam === 'U5' ? (mhz > 128 ? 4 : mhz > 96 ? 3 : mhz > 64 ? 2 : mhz > 32 ? 1 : 0) : fam === 'WB' ? (mhz > 54 ? 3 : mhz > 36 ? 2 : mhz > 18 ? 1 : 0) : (mhz > 64 ? 4 : mhz > 48 ? 3 : mhz > 32 ? 2 : mhz > 16 ? 1 : 0);
    } else if (fam === 'H7') {
      pre = '  /** Supply configuration update enable\n  */\n  HAL_PWREx_ConfigSupply(PWR_LDO_SUPPLY);\n\n  /** Configure the main internal regulator output voltage\n  */\n' +
        '  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE' + (mhz > 400 ? 0 : 1) + ');\n\n  while(!__HAL_PWR_GET_FLAG(PWR_FLAG_VOSRDY)) {}\n\n';
      lat = mhz > 400 ? 4 : mhz > 200 ? 2 : 1;
    }
    // ---- 오실레이터 + PLL
    if (useHse) {
      lineOsc('OscillatorType', 'RCC_OSCILLATORTYPE_HSE');
      osc += '  RCC_OscInitStruct.HSEState = ' + (bypass ? 'RCC_HSE_BYPASS' : 'RCC_HSE_ON') + ';   /* 8 MHz ' + (bypass ? 'ST-Link MCO' : '크리스털') + ' */\n';
      lineOsc('HSEPredivValue', 'RCC_HSE_PREDIV_DIV1'); lineOsc('HSIState', 'RCC_HSI_ON'); lineOsc('PLL.PLLState', 'RCC_PLL_ON');
      lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSE'); lineOsc('PLL.PLLMUL', 'RCC_PLL_MUL' + Math.round(mhz / 8));
    } else if (fam === 'C0') {
      lineOsc('OscillatorType', 'RCC_OSCILLATORTYPE_HSI'); lineOsc('HSIState', 'RCC_HSI_ON');
      lineOsc('HSIDiv', 'RCC_HSI_DIV' + Math.round(48 / mhz)); lineOsc('HSICalibrationValue', 'RCC_HSICALIBRATION_DEFAULT');
      pll = false;
    } else {
      lineOsc('OscillatorType', 'RCC_OSCILLATORTYPE_HSI');
      lineOsc('HSIState', fam === 'H7' ? 'RCC_HSI_DIV1' : 'RCC_HSI_ON');
      if (fam === 'G0') lineOsc('HSIDiv', 'RCC_HSI_DIV1');
      lineOsc('HSICalibrationValue', 'RCC_HSICALIBRATION_DEFAULT');
      if (!pll) lineOsc('PLL.PLLState', 'RCC_PLL_NONE');
      else {
        lineOsc('PLL.PLLState', 'RCC_PLL_ON');
        if (fam === 'F4' || fam === 'F7') {
          var plln = mhz * 2;
          lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 16); lineOsc('PLL.PLLN', plln); lineOsc('PLL.PLLP', 'RCC_PLLP_DIV2');
          lineOsc('PLL.PLLQ', Math.max(2, Math.min(15, Math.round(plln / 48))));
          if (fam === 'F7') lineOsc('PLL.PLLR', 2);
        } else if (fam === 'F1') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI_DIV2'); lineOsc('PLL.PLLMUL', 'RCC_PLL_MUL' + Math.round(mhz / 4)); }
        else if (fam === 'F3') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLMUL', 'RCC_PLL_MUL' + Math.round(mhz / 4)); }
        else if (fam === 'F0') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLMUL', 'RCC_PLL_MUL' + Math.round(mhz / 4)); lineOsc('PLL.PREDIV', 'RCC_PREDIV_DIV2'); }
        else if (fam === 'G0') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 'RCC_PLLM_DIV1'); lineOsc('PLL.PLLN', 8); lineOsc('PLL.PLLP', 'RCC_PLLP_DIV2'); lineOsc('PLL.PLLQ', 'RCC_PLLQ_DIV2'); lineOsc('PLL.PLLR', 'RCC_PLLR_DIV' + (mhz >= 64 ? 2 : 4)); }
        else if (fam === 'L0') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLMUL', 'RCC_PLLMUL_4'); lineOsc('PLL.PLLDIV', 'RCC_PLLDIV_' + Math.round(64 / mhz)); }
        else if (fam === 'L4') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 1); lineOsc('PLL.PLLN', 10); lineOsc('PLL.PLLP', 'RCC_PLLP_DIV7'); lineOsc('PLL.PLLQ', 'RCC_PLLQ_DIV2'); lineOsc('PLL.PLLR', 'RCC_PLLR_DIV' + (mhz >= 80 ? 2 : 4)); }
        else if (fam === 'G4') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 'RCC_PLLM_DIV4'); lineOsc('PLL.PLLN', Math.round(mhz / 2)); lineOsc('PLL.PLLP', 'RCC_PLLP_DIV2'); lineOsc('PLL.PLLQ', 'RCC_PLLQ_DIV2'); lineOsc('PLL.PLLR', 'RCC_PLLR_DIV2'); }
        else if (fam === 'WB') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 'RCC_PLLM_DIV1'); lineOsc('PLL.PLLN', Math.round(mhz / 8)); lineOsc('PLL.PLLP', 'RCC_PLLP_DIV2'); lineOsc('PLL.PLLQ', 'RCC_PLLQ_DIV2'); lineOsc('PLL.PLLR', 'RCC_PLLR_DIV2'); }
        else if (fam === 'U5') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLMBOOST', 'RCC_PLLMBOOST_DIV1'); lineOsc('PLL.PLLM', 1); lineOsc('PLL.PLLN', Math.round(mhz / 16)); lineOsc('PLL.PLLP', 2); lineOsc('PLL.PLLQ', 2); lineOsc('PLL.PLLR', 1); lineOsc('PLL.PLLRGE', 'RCC_PLLVCIRANGE_1'); lineOsc('PLL.PLLFRACN', 0); }
        else if (fam === 'H7') { lineOsc('PLL.PLLSource', 'RCC_PLLSOURCE_HSI'); lineOsc('PLL.PLLM', 4); lineOsc('PLL.PLLN', Math.round(mhz / 8)); lineOsc('PLL.PLLP', 2); lineOsc('PLL.PLLQ', 4); lineOsc('PLL.PLLR', 2); lineOsc('PLL.PLLRGE', 'RCC_PLL1VCIRANGE_3'); lineOsc('PLL.PLLVCOSEL', 'RCC_PLL1VCOWIDE'); lineOsc('PLL.PLLFRACN', 0); }
      }
    }
    s += pre + '  /** Initializes the RCC Oscillators according to the specified parameters\n  * in the RCC_OscInitTypeDef structure.\n  */\n' + osc +
      '  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)\n' + ERR;
    if ((fam === 'F4' || fam === 'F7') && mhz > 180 - (fam === 'F7' ? 0 : 12)) s += '\n  /** Activate the Over-Drive mode\n  */\n  if (HAL_PWREx_EnableOverDrive() != HAL_OK)\n' + ERR;
    // ---- 버스 분주
    var src = pll ? 'RCC_SYSCLKSOURCE_PLLCLK' : 'RCC_SYSCLKSOURCE_HSI';
    if (fam === 'H7') {
      lineClk('ClockType', 'RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK\n                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2\n                              |RCC_CLOCKTYPE_D3PCLK1|RCC_CLOCKTYPE_D1PCLK1');
      lineClk('SYSCLKSource', src); lineClk('SYSCLKDivider', 'RCC_SYSCLK_DIV1'); lineClk('AHBCLKDivider', 'RCC_HCLK_DIV' + ck.ahbDiv);
      lineClk('APB3CLKDivider', 'RCC_APB3_DIV' + ck.div1); lineClk('APB1CLKDivider', 'RCC_APB1_DIV' + ck.div1);
      lineClk('APB2CLKDivider', 'RCC_APB2_DIV' + ck.div2); lineClk('APB4CLKDivider', 'RCC_APB4_DIV' + ck.div1);
    } else if (fam === 'F0' || fam === 'G0' || fam === 'C0' ) {
      lineClk('ClockType', 'RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK\n                              |RCC_CLOCKTYPE_PCLK1'); lineClk('SYSCLKSource', src);
      if (fam === 'C0') lineClk('SYSCLKDivider', 'RCC_SYSCLK_DIV1');
      lineClk('AHBCLKDivider', 'RCC_SYSCLK_DIV1'); lineClk('APB1CLKDivider', (fam === 'F0' ? 'RCC_HCLK_DIV' : 'RCC_APB1_DIV') + ck.div1);
    } else {
      var extra = fam === 'U5' ? '|RCC_CLOCKTYPE_PCLK3' : fam === 'WB' ? '\n                              |RCC_CLOCKTYPE_HCLK2|RCC_CLOCKTYPE_HCLK4' : '';
      lineClk('ClockType', 'RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK\n                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2' + extra);
      lineClk('SYSCLKSource', src); lineClk('AHBCLKDivider', 'RCC_SYSCLK_DIV1');
      lineClk('APB1CLKDivider', 'RCC_HCLK_DIV' + ck.div1); lineClk('APB2CLKDivider', 'RCC_HCLK_DIV' + ck.div2);
      if (fam === 'U5') lineClk('APB3CLKDivider', 'RCC_HCLK_DIV1');
      if (fam === 'WB') { lineClk('AHBCLK2Divider', 'RCC_SYSCLK_DIV2'); lineClk('AHBCLK4Divider', 'RCC_SYSCLK_DIV1'); }
    }
    s += '\n  /** Initializes the CPU, AHB and APB buses clocks\n  */\n' + clk +
      '\n  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_' + lat + ') != HAL_OK)\n' + ERR + '}\n';
    return s;
  }

  /** FreeRTOS(CMSIS_V2) 태스크 목록 또는 null */
  function rtosTasks(project) {
    var r = project.periph && project.periph.FREERTOS;
    if (!r || r.enabled === false) return null;
    var t = (r.tasks && r.tasks.length) ? r.tasks : [{ name: 'defaultTask', fn: 'StartDefaultTask', prio: 'osPriorityNormal', stack: 128 }];
    return t.map(function (x, i) { return { name: x.name || ('task' + (i + 1)), fn: x.fn || ('StartTask' + (i + 1)), prio: x.prio || 'osPriorityNormal', stack: x.stack || 128 }; });
  }
  function rtosMain(user, rt) {
    function blk(n) { return secIndented(user, n, '  ') + '\n'; }
    var s = '  /* Init scheduler */\n  osKernelInitialize();\n\n' + blk('RTOS_MUTEX') + blk('RTOS_SEMAPHORES') + blk('RTOS_TIMERS') + blk('RTOS_QUEUES') +
      '  /* Create the thread(s) */\n';
    rt.forEach(function (t) { s += '  /* creation of ' + t.name + ' */\n  ' + t.name + 'Handle = osThreadNew(' + t.fn + ', NULL, &' + t.name + '_attributes);\n\n'; });
    s += blk('RTOS_THREADS') + blk('RTOS_EVENTS') + '  /* Start scheduler */\n  osKernelStart();\n\n  /* We should never get here as control is now taken by the scheduler */\n';
    return s;
  }
  function nvicLines(irq, ind) {
    ind = ind || '  ';
    return ind + 'HAL_NVIC_SetPriority(' + irq + '_IRQn, 0, 0);\n' + ind + 'HAL_NVIC_EnableIRQ(' + irq + '_IRQn);\n';
  }
  function head(p, what) {
    return '/**\n  * @brief ' + p + ' Initialization Function\n  * @param None\n  * @retval None\n  */\nstatic void ' + initName(p) + '(void)\n{\n\n' +
      '  /* USER CODE BEGIN ' + p + '_Init 0 */\n\n  /* USER CODE END ' + p + '_Init 0 */\n\n' + (what || '');
  }
  function tail(p) {
    return '  /* USER CODE BEGIN ' + p + '_Init 2 */\n\n  /* USER CODE END ' + p + '_Init 2 */\n\n}\n';
  }
  function errChk(call) { return '  if (' + call + ' != HAL_OK)\n  {\n    Error_Handler();\n  }\n'; }

  function genInit(p, project, chip) {
    var c = project.periph[p] || {}, h = handleName(p), f4 = /^(F4|F7)$/.test(chip.series);
    var info = chip.periph[p] || {}, N = project.nvic || {};
    var s;
    if (/^(LPUART|USART)/.test(p)) {
      s = head(p) + '  ' + h + '.Instance = ' + p + ';\n' +
        '  ' + h + '.Init.BaudRate = ' + (c.baud || 115200) + ';\n' +
        '  ' + h + '.Init.WordLength = UART_WORDLENGTH_8B;\n  ' + h + '.Init.StopBits = UART_STOPBITS_1;\n' +
        '  ' + h + '.Init.Parity = UART_PARITY_NONE;\n  ' + h + '.Init.Mode = UART_MODE_TX_RX;\n' +
        '  ' + h + '.Init.HwFlowCtl = UART_HWCONTROL_NONE;\n  ' + h + '.Init.OverSampling = UART_OVERSAMPLING_16;\n' +
        errChk('HAL_UART_Init(&' + h + ')');
      if (N[info.irq]) s += '  /* ' + p + ' interrupt Init (MSP) */\n' + nvicLines(info.irq);
      return s + tail(p);
    }
    if (/^I2C/.test(p)) {
      s = head(p) + '  ' + h + '.Instance = ' + p + ';\n  ' + h + '.Init.ClockSpeed = ' + (c.speed || 100000) + ';\n' +
        '  ' + h + '.Init.DutyCycle = I2C_DUTYCYCLE_2;\n  ' + h + '.Init.OwnAddress1 = 0;\n' +
        '  ' + h + '.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;\n  ' + h + '.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;\n' +
        '  ' + h + '.Init.OwnAddress2 = 0;\n  ' + h + '.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;\n' +
        '  ' + h + '.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;\n' + errChk('HAL_I2C_Init(&' + h + ')');
      return s + tail(p);
    }
    if (/^SPI/.test(p)) {
      s = head(p) + '  /* ' + p + ' parameter configuration*/\n  ' + h + '.Instance = ' + p + ';\n  ' + h + '.Init.Mode = SPI_MODE_MASTER;\n' +
        '  ' + h + '.Init.Direction = SPI_DIRECTION_2LINES;\n  ' + h + '.Init.DataSize = SPI_DATASIZE_8BIT;\n' +
        '  ' + h + '.Init.CLKPolarity = SPI_POLARITY_LOW;\n  ' + h + '.Init.CLKPhase = SPI_PHASE_1EDGE;\n' +
        '  ' + h + '.Init.NSS = SPI_NSS_SOFT;\n  ' + h + '.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_' + (c.prescaler || 16) + ';\n' +
        '  ' + h + '.Init.FirstBit = SPI_FIRSTBIT_MSB;\n  ' + h + '.Init.TIMode = SPI_TIMODE_DISABLE;\n' +
        '  ' + h + '.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;\n  ' + h + '.Init.CRCPolynomial = 10;\n' +
        errChk('HAL_SPI_Init(&' + h + ')');
      return s + tail(p);
    }
    if (/^TIM/.test(p)) {
      var chs = c.ch || {}, pwm = Object.keys(chs).filter(function (k) { return chs[k] === 'pwm'; }).sort(), ics = Object.keys(chs).filter(function (k) { return chs[k] === 'ic'; }).sort();
      s = head(p, '  TIM_ClockConfigTypeDef sClockSourceConfig = {0};\n  TIM_MasterConfigTypeDef sMasterConfig = {0};\n' +
        (pwm.length ? '  TIM_OC_InitTypeDef sConfigOC = {0};\n' : '') + (ics.length ? '  TIM_IC_InitTypeDef sConfigIC = {0};\n' : '') + '\n');
      s += '  ' + h + '.Instance = ' + p + ';\n  ' + h + '.Init.Prescaler = ' + (c.psc != null ? c.psc : 0) + ';\n' +
        '  ' + h + '.Init.CounterMode = TIM_COUNTERMODE_UP;\n  ' + h + '.Init.Period = ' + (c.arr != null ? c.arr : 65535) + ';\n' +
        '  ' + h + '.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;\n' +
        (p === 'TIM1' ? '  ' + h + '.Init.RepetitionCounter = 0;\n' : '') +
        '  ' + h + '.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;\n' +
        errChk('HAL_TIM_Base_Init(&' + h + ')') +
        '  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;\n' + errChk('HAL_TIM_ConfigClockSource(&' + h + ', &sClockSourceConfig)');
      if (pwm.length) s += errChk('HAL_TIM_PWM_Init(&' + h + ')');
      if (ics.length) s += errChk('HAL_TIM_IC_Init(&' + h + ')');
      s += '  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;\n  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;\n' +
        errChk('HAL_TIMEx_MasterConfigSynchronization(&' + h + ', &sMasterConfig)');
      if (pwm.length) {
        s += '  sConfigOC.OCMode = TIM_OCMODE_PWM1;\n';
        pwm.forEach(function (ch, i) {
          s += '  sConfigOC.Pulse = ' + ((c.pulse && c.pulse[ch]) || 0) + ';\n';
          if (i === 0) s += '  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;\n  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;\n';
          s += errChk('HAL_TIM_PWM_ConfigChannel(&' + h + ', &sConfigOC, TIM_CHANNEL_' + ch + ')');
        });
      }
      ics.forEach(function (ch) {
        var pol = (c.icPol && c.icPol[ch]) || 'rising';
        s += '  sConfigIC.ICPolarity = TIM_INPUTCHANNELPOLARITY_' + (pol === 'both' ? 'BOTHEDGE' : pol.toUpperCase()) + ';\n  sConfigIC.ICSelection = TIM_ICSELECTION_DIRECTTI;\n' +
          '  sConfigIC.ICPrescaler = TIM_ICPSC_DIV1;\n  sConfigIC.ICFilter = 0;\n' + errChk('HAL_TIM_IC_ConfigChannel(&' + h + ', &sConfigIC, TIM_CHANNEL_' + ch + ')');
      });
      if (N[info.irq] || N[p]) s += '  /* ' + p + ' interrupt Init (MSP) */\n' + nvicLines(info.irq);
      return s + tail(p);
    }
    if (p === 'IWDG') {
      var win = !/^(F1|F4)$/.test(chip.series);
      s = head(p) + '  hiwdg.Instance = IWDG;\n  hiwdg.Init.Prescaler = IWDG_PRESCALER_' + (c.prescaler || 32) + ';\n' +
        (win ? '  hiwdg.Init.Window = 4095;\n' : '') + '  hiwdg.Init.Reload = ' + (c.reload != null ? c.reload : 4095) + ';\n' + errChk('HAL_IWDG_Init(&hiwdg)');
      return s + tail(p);
    }
    if (p === 'RTC') {
      var bcd = function (v) { return '0x' + ((((v / 10) | 0) << 4) | (v % 10)).toString(16); };
      var MON = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
      s = head(p, '  RTC_TimeTypeDef sTime = {0};\n  RTC_DateTypeDef sDate = {0};\n\n') +
        '  /** Initialize RTC Only\n  */\n  hrtc.Instance = RTC;\n' +
        (chip.series === 'F1' ? '  hrtc.Init.AsynchPrediv = RTC_AUTO_1_SECOND;\n  hrtc.Init.OutPut = RTC_OUTPUTSOURCE_ALARM;\n' :
          '  hrtc.Init.HourFormat = RTC_HOURFORMAT_24;\n  hrtc.Init.AsynchPrediv = 127;\n  hrtc.Init.SynchPrediv = 255;\n  hrtc.Init.OutPut = RTC_OUTPUT_DISABLE;\n' +
          '  hrtc.Init.OutPutPolarity = RTC_OUTPUT_POLARITY_HIGH;\n  hrtc.Init.OutPutType = RTC_OUTPUT_TYPE_OPENDRAIN;\n') +
        errChk('HAL_RTC_Init(&hrtc)') + '\n  /* USER CODE BEGIN Check_RTC_BKUP */\n\n  /* USER CODE END Check_RTC_BKUP */\n\n' +
        '  /** Initialize RTC and set the Time and Date\n  */\n' +
        '  sTime.Hours = ' + bcd(c.hours || 0) + ';\n  sTime.Minutes = ' + bcd(c.minutes || 0) + ';\n  sTime.Seconds = ' + bcd(c.seconds || 0) + ';\n' +
        (chip.series === 'F1' ? '' : '  sTime.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;\n  sTime.StoreOperation = RTC_STOREOPERATION_RESET;\n') +
        errChk('HAL_RTC_SetTime(&hrtc, &sTime, RTC_FORMAT_BCD)') +
        '  sDate.WeekDay = RTC_WEEKDAY_MONDAY;\n  sDate.Month = RTC_MONTH_' + MON[((c.month || 1) - 1) % 12] + ';\n  sDate.Date = ' + bcd(c.date || 1) + ';\n  sDate.Year = ' + bcd(c.year != null ? c.year : 26) + ';\n\n' +
        errChk('HAL_RTC_SetDate(&hrtc, &sDate, RTC_FORMAT_BCD)');
      if (c.wakeup) s += '\n  /** Enable the WakeUp\n  */\n' + errChk('HAL_RTCEx_SetWakeUpTimer_IT(&hrtc, ' + (c.wakeup - 1) + ', RTC_WAKEUPCLOCK_CK_SPRE_16BITS)');
      if (N.RTC_WKUP) s += '  /* RTC interrupt Init (MSP) */\n' + nvicLines('RTC_WKUP');
      return s + tail(p);
    }
    if (p === 'ADC1') {
      var chans = c.channels || [0], fam = chip.series, m0 = /^(F0|G0|L0|C0)$/.test(fam), l4 = /^(L4|F3|G4|WB|U5|H7)$/.test(fam), f1 = fam === 'F1', g0 = /^(G0|C0)$/.test(fam), f4 = /^(F4|F7)$/.test(fam);
      var res = 'ADC_RESOLUTION_' + (chip.adcBits || 12) + 'B';
      s = head(p, '  ADC_ChannelConfTypeDef sConfig = {0};\n\n') +
        '  /** Configure the global features of the ADC (Clock, Resolution, Data Alignment and number of conversion)\n  */\n' +
        '  hadc1.Instance = ADC1;\n';
      if (f4) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;\n  hadc1.Init.Resolution = ADC_RESOLUTION_12B;\n';
      else if (l4) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_ASYNC_DIV' + (fam === 'H7' ? 2 : 1) + ';\n  hadc1.Init.Resolution = ' + res + ';\n' + (fam === 'H7' ? '' : '  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n');
      else if (m0) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;\n  hadc1.Init.Resolution = ADC_RESOLUTION_12B;\n  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n';
      s += '  hadc1.Init.ScanConvMode = ' + (m0 ? 'ADC_SCAN_DIRECTION_FORWARD' : l4 ? (chans.length > 1 ? 'ADC_SCAN_ENABLE' : 'ADC_SCAN_DISABLE') : (chans.length > 1 ? 'ENABLE' : 'DISABLE')) + ';\n' +
        ((f4 || l4 || m0) ? '  hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;\n' : '') +
        ((l4 || m0) ? '  hadc1.Init.LowPowerAutoWait = DISABLE;\n' : '') + (m0 ? '  hadc1.Init.LowPowerAutoPowerOff = DISABLE;\n' : '') +
        '  hadc1.Init.ContinuousConvMode = ' + (c.continuous ? 'ENABLE' : 'DISABLE') + ';\n' +
        (m0 ? '' : '  hadc1.Init.NbrOfConversion = ' + chans.length + ';\n') +
        '  hadc1.Init.DiscontinuousConvMode = DISABLE;\n' +
        (f1 ? '' : '  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;\n') +
        '  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;\n' + ((f4 || f1) ? '  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n' : '') +
        ((f4 || l4 || m0) && fam !== 'H7' ? '  hadc1.Init.DMAContinuousRequests = ' + (c.dma ? 'ENABLE' : 'DISABLE') + ';\n' : '') +
        (fam === 'H7' ? '  hadc1.Init.ConversionDataManagement = ' + (c.dma ? 'ADC_CONVERSIONDATA_DMA_CIRCULAR' : 'ADC_CONVERSIONDATA_DR') + ';\n  hadc1.Init.LeftBitShift = ADC_LEFTBITSHIFT_NONE;\n' : '') +
        ((l4 || m0) ? '  hadc1.Init.Overrun = ADC_OVR_DATA_PRESERVED;\n' : '') + (l4 ? '  hadc1.Init.OversamplingMode = DISABLE;\n' : '') +
        (g0 ? '  hadc1.Init.SamplingTimeCommon1 = ADC_SAMPLINGTIME_COMMON_1;\n  hadc1.Init.TriggerFrequencyMode = ADC_TRIGGER_FREQ_HIGH;\n' : '') +
        errChk('HAL_ADC_Init(&hadc1)') + '\n';
      chans.forEach(function (ch, i) {
        s += '  /** Configure for the selected ADC regular channel its corresponding rank in the sequencer and its sample time.\n  */\n' +
          '  sConfig.Channel = ADC_CHANNEL_' + ch + ';\n  sConfig.Rank = ' + (f4 ? (i + 1) : m0 ? 'ADC_RANK_CHANNEL_NUMBER' : 'ADC_REGULAR_RANK_' + (i + 1)) + ';\n' +
          (i === 0 || m0 ? '  sConfig.SamplingTime = ' + (f4 ? 'ADC_SAMPLETIME_84CYCLES' : f1 ? 'ADC_SAMPLETIME_55CYCLES_5' : fam === 'H7' ? 'ADC_SAMPLETIME_64CYCLES_5' : fam === 'U5' ? 'ADC_SAMPLETIME_68CYCLES' : l4 ? 'ADC_SAMPLETIME_47CYCLES_5' : g0 ? 'ADC_SAMPLINGTIME_COMMON_1' : fam === 'L0' ? 'ADC_SAMPLETIME_79CYCLES_5' : 'ADC_SAMPLETIME_239CYCLES_5') + ';\n' : '') +
          (l4 && i === 0 ? '  sConfig.SingleDiff = ADC_SINGLE_ENDED;\n  sConfig.OffsetNumber = ADC_OFFSET_NONE;\n  sConfig.Offset = 0;\n' : '') +
          errChk('HAL_ADC_ConfigChannel(&hadc1, &sConfig)');
      });
      if (N[info.irq] || N.ADC1) s += '  /* ADC1 interrupt Init (MSP) */\n' + nvicLines(info.irq);
      return s + tail(p);
    }
    return '';
  }

  function genGpio(project, chip) {
    var pins = project.pins || {}, N = project.nvic || {};
    var gp = chip.pins.filter(function (p, i) {
      var c = pins[p]; return c && chip.pins.indexOf(p) === i && /^GPIO_(Output|Input|EXTI|Analog)$/.test(c.signal);
    });
    var ports = {};
    gp.forEach(function (p) { ports[p[1]] = 1; });
    var s = '/**\n  * @brief GPIO Initialization Function\n  * @param None\n  * @retval None\n  */\nstatic void MX_GPIO_Init(void)\n{\n' +
      (gp.length ? '  GPIO_InitTypeDef GPIO_InitStruct = {0};\n' : '') +
      '/* USER CODE BEGIN MX_GPIO_Init_1 */\n\n/* USER CODE END MX_GPIO_Init_1 */\n\n  /* GPIO Ports Clock Enable */\n';
    var allPorts = ['E', 'C', 'H', 'F', 'G', 'D', 'A', 'B'].filter(function (x) {
      return ports[x] || (x === 'A') || ((x === 'H' || x === 'D' || x === 'F') && chip.pins.indexOf('P' + x + '0') >= 0 && C.reserved(chip, 'P' + x + '0'));
    });
    allPorts.forEach(function (x) { s += '  __HAL_RCC_GPIO' + x + '_CLK_ENABLE();\n'; });
    if (chip.series === 'U5' && ports.G) s += '  HAL_PWREx_EnableVddIO2();   /* U5: 포트 G 는 VDDIO2 전원 */\n';
    s += '\n';
    function ref(p) {
      var c = pins[p], n = c.label ? pinDefName(p, c) : null;
      return { pin: n ? n + '_Pin' : 'GPIO_PIN_' + numOf(p), port: n ? n + '_GPIO_Port' : portOf(p) };
    }
    // 출력 초기 레벨
    var outs = gp.filter(function (p) { return pins[p].signal === 'GPIO_Output'; });
    var byPortLevel = {};
    outs.forEach(function (p) {
      var k = portOf(p) + ':' + (pins[p].level ? 'SET' : 'RESET');
      (byPortLevel[k] = byPortLevel[k] || []).push(p);
    });
    Object.keys(byPortLevel).forEach(function (k) {
      var ps = byPortLevel[k], r = ref(ps[0]);
      s += '  /*Configure GPIO pin Output Level */\n  HAL_GPIO_WritePin(' + r.port + ', ' +
        ps.map(function (p) { return ref(p).pin; }).join('|') + ', GPIO_PIN_' + k.split(':')[1] + ');\n\n';
    });
    // 같은 설정끼리 묶기
    var groups = {};
    gp.forEach(function (p) {
      var c = pins[p], mode;
      if (c.signal === 'GPIO_Output') mode = c.od ? 'GPIO_MODE_OUTPUT_OD' : 'GPIO_MODE_OUTPUT_PP';
      else if (c.signal === 'GPIO_Input') mode = 'GPIO_MODE_INPUT';
      else if (c.signal === 'GPIO_Analog') mode = 'GPIO_MODE_ANALOG';
      else mode = c.trigger === 'rising' ? 'GPIO_MODE_IT_RISING' : c.trigger === 'both' ? 'GPIO_MODE_IT_RISING_FALLING' : 'GPIO_MODE_IT_FALLING';
      var pull = c.pull === 'up' ? 'GPIO_PULLUP' : c.pull === 'down' ? 'GPIO_PULLDOWN' : 'GPIO_NOPULL';
      var key = portOf(p) + '|' + mode + '|' + (mode === 'GPIO_MODE_ANALOG' ? '' : pull) + '|' + (c.signal === 'GPIO_Output' ? 'LOW' : '');
      (groups[key] = groups[key] || []).push(p);
    });
    Object.keys(groups).forEach(function (k) {
      var ps = groups[k], parts = k.split('|'), r = ref(ps[0]);
      var names = ps.map(function (p) { return ref(p).pin; });
      s += '  /*Configure GPIO pin' + (ps.length > 1 ? 's' : '') + ' : ' + names.join(' ') + ' */\n' +
        '  GPIO_InitStruct.Pin = ' + names.join('|') + ';\n  GPIO_InitStruct.Mode = ' + parts[1] + ';\n' +
        (parts[2] ? '  GPIO_InitStruct.Pull = ' + parts[2] + ';\n' : '  GPIO_InitStruct.Pull = GPIO_NOPULL;\n') +
        (parts[3] ? '  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;\n' : '') +
        '  HAL_GPIO_Init(' + r.port + ', &GPIO_InitStruct);\n\n';
    });
    // EXTI NVIC
    var lines = {};
    gp.forEach(function (p) { if (pins[p].signal === 'GPIO_EXTI') lines[exti(numOf(p), chip)] = 1; });
    var en = Object.keys(lines).filter(function (l) { return N[l]; });
    if (en.length) {
      s += '  /* EXTI interrupt init*/\n';
      en.forEach(function (l) { s += nvicLines(l); s += '\n'; });
    }
    s += '/* USER CODE BEGIN MX_GPIO_Init_2 */\n\n/* USER CODE END MX_GPIO_Init_2 */\n}\n';
    return s;
  }

  // ------------------------------------------------------------ .ioc (보기용)
  function genIoc(project) {
    var chip = C.chipOf(project);
    var L = ['#MicroXplorer Configuration settings - do not modify', 'File.Version=6',
      'Mcu.Family=' + chip.family + 'xx', 'Mcu.Name=' + chip.name, 'Mcu.Package=' + chip.pkg,
      'Mcu.UserName=' + chip.name, 'board=' + (project.board || 'custom'), 'ProjectManager.ProjectName=' + (project.name || 'stm32_project'),
      'ProjectManager.TargetToolchain=STM32CubeIDE', 'RCC.SYSCLKFreq_VALUE=' + (((project.clock && project.clock.sysclk) || chip.defClk) * 1e6)];
    var ip = activePeriph(project);
    ip.forEach(function (p, i) { L.push('Mcu.IP' + i + '=' + p); });
    Object.keys(project.pins || {}).sort().forEach(function (p) {
      var c = project.pins[p];
      L.push(p + '.Signal=' + (c.signal === 'GPIO_EXTI' ? 'GPXTI' + numOf(p) : c.signal));
      if (c.label) L.push(p + '.GPIO_Label=' + c.label);
      if (c.pull && c.pull !== 'none') L.push(p + '.GPIO_PuPd=GPIO_PULL' + c.pull.toUpperCase());
    });
    Object.keys(project.periph || {}).forEach(function (p) {
      var c = project.periph[p];
      Object.keys(c).forEach(function (k) { L.push(p + '.' + k + '=' + JSON.stringify(c[k])); });
    });
    Object.keys(project.nvic || {}).forEach(function (k) { if (project.nvic[k]) L.push('NVIC.' + k + '_IRQn=true\\:0\\:0\\:false\\:false\\:true\\:true\\:true'); });
    return L.join('\n') + '\n';
  }

  global.STM32Codegen = {
    rtosTasks: rtosTasks,
    SECTIONS: SECTIONS, extractUser: extractUser, userFromExample: userFromExample,
    genMainC: genMainC, genMainH: genMainH, genIoc: genIoc, activePeriph: activePeriph,
    handleName: handleName, handleType: handleType, initName: initName, exti: exti, portOf: portOf, numOf: numOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
