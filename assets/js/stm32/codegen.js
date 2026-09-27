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
  var EX_KEY = { includes: 'Includes', pv: 'PV', pfp: 'PFP', u0: '0', u1: '1', u2: '2', loop: '3', u4: '4', ptd: 'PTD', pd: 'PD', pm: 'PM' };

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
      if (/^USART/.test(k) && c.mode === 'async') list.push(k);
      else if (/^I2C/.test(k) && c.mode === 'i2c') list.push(k);
      else if (/^SPI/.test(k) && c.mode === 'master') list.push(k);
      else if (/^TIM/.test(k) && c.enabled !== false && (c.psc != null || c.arr != null || c.ch)) list.push(k);
      else if (k === 'ADC1' && c.channels && c.channels.length) list.push(k);
    });
    var order = ['ADC1', 'I2C1', 'I2C2', 'SPI1', 'SPI2', 'TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'USART1', 'USART2', 'USART3', 'USART6'];
    list.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return list;
  }

  function handleName(p) {
    if (/^USART(\d)/.test(p)) return 'huart' + p.slice(5);
    if (/^I2C/.test(p)) return 'hi2c' + p.slice(3);
    if (/^SPI/.test(p)) return 'hspi' + p.slice(3);
    if (/^TIM/.test(p)) return 'htim' + p.slice(3);
    if (/^ADC/.test(p)) return 'hadc' + p.slice(3);
  }
  function handleType(p) {
    if (/^USART/.test(p)) return 'UART_HandleTypeDef';
    if (/^I2C/.test(p)) return 'I2C_HandleTypeDef';
    if (/^SPI/.test(p)) return 'SPI_HandleTypeDef';
    if (/^TIM/.test(p)) return 'TIM_HandleTypeDef';
    if (/^ADC/.test(p)) return 'ADC_HandleTypeDef';
  }
  function initName(p) { return /^USART/.test(p) ? 'MX_' + p + '_UART_Init' : 'MX_' + p + '_Init'; }

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
    out.push('/* Includes ------------------------------------------------------------------*/\n#include "main.h"\n\n' +
      '/* Private includes ----------------------------------------------------------*/\n' + sec(user, 'Includes') + '/* USER CODE END Includes */\n');
    out.push('/* Private typedef -----------------------------------------------------------*/\n' + sec(user, 'PTD') + '/* USER CODE END PTD */\n');
    out.push('/* Private define ------------------------------------------------------------*/\n' + sec(user, 'PD') + '/* USER CODE END PD */\n');
    out.push('/* Private macro -------------------------------------------------------------*/\n' + sec(user, 'PM') + '/* USER CODE END PM */\n');
    var pv = '/* Private variables ---------------------------------------------------------*/\n';
    act.forEach(function (p) { pv += handleType(p) + ' ' + handleName(p) + ';\n'; });
    if (act.length) pv += '\n';
    out.push(pv + sec(user, 'PV') + '/* USER CODE END PV */\n');
    var dma = !!(P.ADC1 && P.ADC1.dma);
    var pfp = '/* Private function prototypes -----------------------------------------------*/\nvoid SystemClock_Config(void);\nstatic void MX_GPIO_Init(void);\n' + (dma ? 'static void MX_DMA_Init(void);\n' : '');
    act.forEach(function (p) { pfp += 'static void ' + initName(p) + '(void);\n'; });
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
    m += secIndented(user, '2', '  ') + '\n' +
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
    out.push('/**\n  * @brief  This function is executed in case of error occurrence.\n  * @retval None\n  */\n' +
      'void Error_Handler(void)\n{\n' + secIndented(user, 'Error_Handler_Debug', '  ',
        '  /* User can add his own implementation to report the HAL error return state */\n  __disable_irq();\n  while (1)\n  {\n  }\n') + '}\n');
    return out.join('\n');
  }

  function genClock(project, chip) {
    var mhz = (project.clock && project.clock.sysclk) || chip.defClk, fam = chip.series, ck = C.clocks(chip, mhz), hsi = chip.hsi, pll = mhz !== hsi;
    var s = '/**\n  * @brief System Clock Configuration (SYSCLK = ' + mhz + ' MHz, ' + chip.family + ')\n  * @retval None\n  */\nvoid SystemClock_Config(void)\n{\n' +
      '  RCC_OscInitTypeDef RCC_OscInitStruct = {0};\n  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};\n\n';
    var lat, useHse = false;
    if (fam === 'F4') {
      s += '  /** Configure the main internal regulator output voltage\n  */\n  __HAL_RCC_PWR_CLK_ENABLE();\n  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE' + (mhz > 84 ? 1 : mhz > 64 ? 2 : 3) + ');\n\n';
      lat = mhz > 150 ? 5 : mhz > 120 ? 4 : mhz > 90 ? 3 : mhz > 60 ? 2 : mhz > 30 ? 1 : 0;
    } else if (fam === 'F1') { useHse = mhz > 64; lat = mhz > 48 ? 2 : mhz > 24 ? 1 : 0; }
    else if (fam === 'F0') lat = mhz > 24 ? 1 : 0;
    else if (fam === 'G0') lat = mhz > 48 ? 2 : mhz > 24 ? 1 : 0;
    else if (fam === 'L4') {
      s += '  /** Configure the main internal regulator output voltage\n  */\n  if (HAL_PWREx_ControlVoltageScaling(PWR_REGULATOR_VOLTAGE_SCALE1) != HAL_OK)\n  {\n    Error_Handler();\n  }\n\n';
      lat = mhz > 64 ? 4 : mhz > 48 ? 3 : mhz > 32 ? 2 : mhz > 16 ? 1 : 0;
    }
    s += '  /** Initializes the RCC Oscillators according to the specified parameters\n  * in the RCC_OscInitTypeDef structure.\n  */\n';
    if (useHse) {
      var bypass = !!(project.board && /NUCLEO/.test(project.board));
      s += '  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;\n  RCC_OscInitStruct.HSEState = ' + (bypass ? 'RCC_HSE_BYPASS' : 'RCC_HSE_ON') + ';   /* 8 MHz ' + (bypass ? 'ST-Link MCO' : '크리스털') + ' */\n' +
        '  RCC_OscInitStruct.HSEPredivValue = RCC_HSE_PREDIV_DIV1;\n  RCC_OscInitStruct.HSIState = RCC_HSI_ON;\n  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;\n' +
        '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;\n  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL' + Math.round(mhz / 8) + ';\n';
    } else {
      s += '  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;\n  RCC_OscInitStruct.HSIState = RCC_HSI_ON;\n' +
        (fam === 'G0' ? '  RCC_OscInitStruct.HSIDiv = RCC_HSI_DIV1;\n' : '') +
        '  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;\n';
      if (!pll) s += '  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;\n';
      else {
        s += '  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;\n';
        if (fam === 'F4') {
          var plln = mhz * 2, pllq = Math.max(2, Math.min(15, Math.round(plln / 48)));
          s += '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;\n  RCC_OscInitStruct.PLL.PLLM = 16;\n  RCC_OscInitStruct.PLL.PLLN = ' + plln + ';\n  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;\n  RCC_OscInitStruct.PLL.PLLQ = ' + pllq + ';\n';
        } else if (fam === 'F1') {
          s += '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;\n  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL' + Math.round(mhz / 4) + ';\n';
        } else if (fam === 'F0') {
          s += '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;\n  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL' + Math.round(mhz / 4) + ';\n  RCC_OscInitStruct.PLL.PREDIV = RCC_PREDIV_DIV2;\n';
        } else if (fam === 'G0') {
          s += '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;\n  RCC_OscInitStruct.PLL.PLLM = RCC_PLLM_DIV1;\n  RCC_OscInitStruct.PLL.PLLN = 8;\n  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;\n  RCC_OscInitStruct.PLL.PLLQ = RCC_PLLQ_DIV2;\n  RCC_OscInitStruct.PLL.PLLR = RCC_PLLR_DIV' + (mhz >= 64 ? 2 : 4) + ';\n';
        } else if (fam === 'L4') {
          s += '  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;\n  RCC_OscInitStruct.PLL.PLLM = 1;\n  RCC_OscInitStruct.PLL.PLLN = 10;\n  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV7;\n  RCC_OscInitStruct.PLL.PLLQ = RCC_PLLQ_DIV2;\n  RCC_OscInitStruct.PLL.PLLR = RCC_PLLR_DIV' + (mhz >= 80 ? 2 : 4) + ';\n';
        }
      }
    }
    s += '  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)\n  {\n    Error_Handler();\n  }\n';
    if (fam === 'F4' && mhz > 168) s += '\n  /** Activate the Over-Drive mode\n  */\n  if (HAL_PWREx_EnableOverDrive() != HAL_OK)\n  {\n    Error_Handler();\n  }\n';
    var noApb2 = fam === 'F0' || fam === 'G0';
    s += '\n  /** Initializes the CPU, AHB and APB buses clocks\n  */\n' +
      '  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK\n                              |RCC_CLOCKTYPE_PCLK1' + (noApb2 ? '' : '|RCC_CLOCKTYPE_PCLK2') + ';\n' +
      '  RCC_ClkInitStruct.SYSCLKSource = ' + (pll ? 'RCC_SYSCLKSOURCE_PLLCLK' : 'RCC_SYSCLKSOURCE_HSI') + ';\n' +
      '  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;\n  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV' + ck.div1 + ';\n' +
      (noApb2 ? '' : '  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV' + ck.div2 + ';\n') +
      '\n  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_' + lat + ') != HAL_OK)\n  {\n    Error_Handler();\n  }\n}\n';
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
    var c = project.periph[p] || {}, h = handleName(p), f4 = chip.series === 'F4';
    var info = chip.periph[p] || {}, N = project.nvic || {};
    var s;
    if (/^USART/.test(p)) {
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
      var chs = c.ch || {}, pwm = Object.keys(chs).filter(function (k) { return chs[k] === 'pwm'; }).sort();
      s = head(p, '  TIM_ClockConfigTypeDef sClockSourceConfig = {0};\n  TIM_MasterConfigTypeDef sMasterConfig = {0};\n' +
        (pwm.length ? '  TIM_OC_InitTypeDef sConfigOC = {0};\n' : '') + '\n');
      s += '  ' + h + '.Instance = ' + p + ';\n  ' + h + '.Init.Prescaler = ' + (c.psc != null ? c.psc : 0) + ';\n' +
        '  ' + h + '.Init.CounterMode = TIM_COUNTERMODE_UP;\n  ' + h + '.Init.Period = ' + (c.arr != null ? c.arr : 65535) + ';\n' +
        '  ' + h + '.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;\n' +
        (p === 'TIM1' ? '  ' + h + '.Init.RepetitionCounter = 0;\n' : '') +
        '  ' + h + '.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;\n' +
        errChk('HAL_TIM_Base_Init(&' + h + ')') +
        '  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;\n' + errChk('HAL_TIM_ConfigClockSource(&' + h + ', &sClockSourceConfig)');
      if (pwm.length) s += errChk('HAL_TIM_PWM_Init(&' + h + ')');
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
      if (N[info.irq] || N[p]) s += '  /* ' + p + ' interrupt Init (MSP) */\n' + nvicLines(info.irq);
      return s + tail(p);
    }
    if (p === 'ADC1') {
      var chans = c.channels || [0], m0 = chip.series === 'F0' || chip.series === 'G0', l4 = chip.series === 'L4', f1 = chip.series === 'F1', g0 = chip.series === 'G0';
      s = head(p, '  ADC_ChannelConfTypeDef sConfig = {0};\n\n') +
        '  /** Configure the global features of the ADC (Clock, Resolution, Data Alignment and number of conversion)\n  */\n' +
        '  hadc1.Instance = ADC1;\n';
      if (f4) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;\n  hadc1.Init.Resolution = ADC_RESOLUTION_12B;\n';
      else if (l4) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_ASYNC_DIV1;\n  hadc1.Init.Resolution = ADC_RESOLUTION_12B;\n  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n';
      else if (m0) s += '  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;\n  hadc1.Init.Resolution = ADC_RESOLUTION_12B;\n  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n';
      s += '  hadc1.Init.ScanConvMode = ' + (m0 ? 'ADC_SCAN_DIRECTION_FORWARD' : l4 ? (chans.length > 1 ? 'ADC_SCAN_ENABLE' : 'ADC_SCAN_DISABLE') : (chans.length > 1 ? 'ENABLE' : 'DISABLE')) + ';\n' +
        ((f4 || l4 || m0) ? '  hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;\n' : '') +
        ((l4 || m0) ? '  hadc1.Init.LowPowerAutoWait = DISABLE;\n' : '') + (m0 ? '  hadc1.Init.LowPowerAutoPowerOff = DISABLE;\n' : '') +
        '  hadc1.Init.ContinuousConvMode = ' + (c.continuous ? 'ENABLE' : 'DISABLE') + ';\n' +
        (m0 ? '' : '  hadc1.Init.NbrOfConversion = ' + chans.length + ';\n') +
        '  hadc1.Init.DiscontinuousConvMode = DISABLE;\n' +
        (f1 ? '' : '  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;\n') +
        '  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;\n' + ((f4 || f1) ? '  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n' : '') +
        ((f4 || l4 || m0) ? '  hadc1.Init.DMAContinuousRequests = ' + (c.dma ? 'ENABLE' : 'DISABLE') + ';\n' : '') +
        ((l4 || m0) ? '  hadc1.Init.Overrun = ADC_OVR_DATA_PRESERVED;\n' : '') + (l4 ? '  hadc1.Init.OversamplingMode = DISABLE;\n' : '') +
        (g0 ? '  hadc1.Init.SamplingTimeCommon1 = ADC_SAMPLINGTIME_COMMON_1;\n  hadc1.Init.TriggerFrequencyMode = ADC_TRIGGER_FREQ_HIGH;\n' : '') +
        errChk('HAL_ADC_Init(&hadc1)') + '\n';
      chans.forEach(function (ch, i) {
        s += '  /** Configure for the selected ADC regular channel its corresponding rank in the sequencer and its sample time.\n  */\n' +
          '  sConfig.Channel = ADC_CHANNEL_' + ch + ';\n  sConfig.Rank = ' + (f4 ? (i + 1) : m0 ? 'ADC_RANK_CHANNEL_NUMBER' : 'ADC_REGULAR_RANK_' + (i + 1)) + ';\n' +
          (i === 0 || m0 ? '  sConfig.SamplingTime = ' + (f4 ? 'ADC_SAMPLETIME_84CYCLES' : f1 ? 'ADC_SAMPLETIME_55CYCLES_5' : l4 ? 'ADC_SAMPLETIME_47CYCLES_5' : g0 ? 'ADC_SAMPLINGTIME_COMMON_1' : 'ADC_SAMPLETIME_239CYCLES_5') + ';\n' : '') +
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
    var allPorts = ['E', 'C', 'H', 'F', 'D', 'A', 'B'].filter(function (x) {
      return ports[x] || (x === 'A') || ((x === 'H' || x === 'D' || x === 'F') && chip.pins.indexOf('P' + x + '0') >= 0 && C.reserved(chip, 'P' + x + '0'));
    });
    allPorts.forEach(function (x) { s += '  __HAL_RCC_GPIO' + x + '_CLK_ENABLE();\n'; });
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
    SECTIONS: SECTIONS, extractUser: extractUser, userFromExample: userFromExample,
    genMainC: genMainC, genMainH: genMainH, genIoc: genIoc, activePeriph: activePeriph,
    handleName: handleName, handleType: handleType, initName: initName, exti: exti, portOf: portOf, numOf: numOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
