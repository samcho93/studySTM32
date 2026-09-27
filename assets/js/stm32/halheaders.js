/*
 * halheaders.js — 프로젝트 탐색기에 보여 주는 HAL 드라이버 헤더(읽기 전용)
 * 시뮬레이터가 지원하는 함수 원형과 한국어 설명만 담는다. 컴파일러는 이 파일을 참조하지 않는다.
 */
(function (global) {
  'use strict';
  var H = {};
  H['stm32xx_hal.h'] = [
    '/* HAL 공통 — 시뮬레이터가 지원하는 API 요약. 실물 HAL 과 이름·인자가 같습니다. */',
    '#include "stm32xx_hal_gpio.h"', '#include "stm32xx_hal_uart.h"', '#include "stm32xx_hal_tim.h"',
    '#include "stm32xx_hal_adc.h"', '#include "stm32xx_hal_i2c.h"', '#include "stm32xx_hal_spi.h"', '',
    'typedef enum { HAL_OK = 0x00U, HAL_ERROR = 0x01U, HAL_BUSY = 0x02U, HAL_TIMEOUT = 0x03U } HAL_StatusTypeDef;', '#define HAL_MAX_DELAY 0xFFFFFFFFU', '',
    'HAL_StatusTypeDef HAL_Init(void);              /* SysTick 1 ms 시작, 인터럽트 우선순위 그룹 설정 */',
    'void     HAL_Delay(uint32_t Delay);            /* Delay ms 동안 대기 (SysTick 기준, 최소 Delay+1 ms) */',
    'uint32_t HAL_GetTick(void);                    /* 부팅 후 경과 ms (32비트, 약 49일마다 0 으로) */',
    'void HAL_NVIC_SetPriority(IRQn_Type IRQn, uint32_t PreemptPriority, uint32_t SubPriority);',
    'void HAL_NVIC_EnableIRQ(IRQn_Type IRQn);       /* 인터럽트 허용 — 이게 없으면 콜백이 불리지 않음 */',
    'void HAL_NVIC_DisableIRQ(IRQn_Type IRQn);', '',
    'uint32_t HAL_RCC_GetSysClockFreq(void);  uint32_t HAL_RCC_GetHCLKFreq(void);',
    'uint32_t HAL_RCC_GetPCLK1Freq(void);     uint32_t HAL_RCC_GetPCLK2Freq(void);', '',
    '/* 콜백(약한 심볼) — 사용자가 같은 이름으로 정의하면 그 함수가 불립니다 */',
    'void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin);',
    'void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim);',
    'void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart);  void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart);',
    'void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc);'
  ].join('\n');
  H['stm32xx_hal_gpio.h'] = [
    'typedef struct {', '  uint32_t Pin;        /* GPIO_PIN_0 .. GPIO_PIN_15 (비트마스크, | 로 여러 개) */',
    '  uint32_t Mode;       /* GPIO_MODE_INPUT / OUTPUT_PP / OUTPUT_OD / AF_PP / ANALOG / IT_RISING / IT_FALLING / IT_RISING_FALLING */',
    '  uint32_t Pull;       /* GPIO_NOPULL / GPIO_PULLUP / GPIO_PULLDOWN */', '  uint32_t Speed;      /* GPIO_SPEED_FREQ_LOW .. VERY_HIGH */',
    '  uint32_t Alternate;  /* (F4) GPIO_AF7_USART2 등 */', '} GPIO_InitTypeDef;', '',
    'typedef enum { GPIO_PIN_RESET = 0U, GPIO_PIN_SET } GPIO_PinState;', '',
    'void HAL_GPIO_Init(GPIO_TypeDef *GPIOx, GPIO_InitTypeDef *GPIO_Init);   /* CubeMX 가 MX_GPIO_Init() 에서 호출 */',
    'GPIO_PinState HAL_GPIO_ReadPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);  /* 입력 레벨 읽기 (0/1) */',
    'void HAL_GPIO_WritePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState);',
    'void HAL_GPIO_TogglePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);', '',
    '/* 레지스터 직접 접근도 가능: GPIOA->ODR, GPIOA->IDR, GPIOA->BSRR (F1: GPIOA->BRR) */'
  ].join('\n');
  H['stm32xx_hal_uart.h'] = [
    'typedef struct { uint32_t BaudRate; uint32_t WordLength; uint32_t StopBits; uint32_t Parity; uint32_t Mode; uint32_t HwFlowCtl; uint32_t OverSampling; } UART_InitTypeDef;',
    'typedef struct { USART_TypeDef *Instance; UART_InitTypeDef Init; /* ... */ uint32_t ErrorCode; } UART_HandleTypeDef;', '',
    'HAL_StatusTypeDef HAL_UART_Init(UART_HandleTypeDef *huart);',
    'HAL_StatusTypeDef HAL_UART_Transmit(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size, uint32_t Timeout);  /* 블로킹 송신 */',
    'HAL_StatusTypeDef HAL_UART_Receive(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size, uint32_t Timeout);        /* 블로킹 수신 (Timeout ms) */',
    'HAL_StatusTypeDef HAL_UART_Transmit_IT(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size);',
    'HAL_StatusTypeDef HAL_UART_Receive_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);   /* Size 바이트가 차면 HAL_UART_RxCpltCallback */',
    '', '/* printf 를 UART 로 보내려면 둘 중 하나를 정의: */',
    'int __io_putchar(int ch);                    /* syscalls.c 가 _write() 에서 호출 */',
    'int _write(int file, char *ptr, int len);   /* 직접 재정의 */'
  ].join('\n');
  H['stm32xx_hal_tim.h'] = [
    'typedef struct { uint32_t Prescaler; uint32_t CounterMode; uint32_t Period; uint32_t ClockDivision; uint32_t RepetitionCounter; uint32_t AutoReloadPreload; } TIM_Base_InitTypeDef;',
    'typedef struct { TIM_TypeDef *Instance; TIM_Base_InitTypeDef Init; /* ... */ } TIM_HandleTypeDef;', '',
    '/* 업데이트 주기 = (PSC+1) * (ARR+1) / TIMCLK      예) 84 MHz, PSC=8399, ARR=9999 → 1 s */',
    'HAL_StatusTypeDef HAL_TIM_Base_Start(TIM_HandleTypeDef *htim);',
    'HAL_StatusTypeDef HAL_TIM_Base_Start_IT(TIM_HandleTypeDef *htim);      /* 주기마다 HAL_TIM_PeriodElapsedCallback */',
    'HAL_StatusTypeDef HAL_TIM_Base_Stop(TIM_HandleTypeDef *htim);  HAL_StatusTypeDef HAL_TIM_Base_Stop_IT(TIM_HandleTypeDef *htim);',
    'HAL_StatusTypeDef HAL_TIM_PWM_Start(TIM_HandleTypeDef *htim, uint32_t Channel);   /* TIM_CHANNEL_1..4 */',
    'HAL_StatusTypeDef HAL_TIM_PWM_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);', '',
    '#define __HAL_TIM_SET_COMPARE(__HANDLE__, __CHANNEL__, __COMPARE__)   /* 듀티: CCR = __COMPARE__ (0..ARR) */',
    '#define __HAL_TIM_GET_COMPARE(__HANDLE__, __CHANNEL__)',
    '#define __HAL_TIM_SET_AUTORELOAD(__HANDLE__, __AUTORELOAD__)   #define __HAL_TIM_GET_AUTORELOAD(__HANDLE__)',
    '#define __HAL_TIM_SET_COUNTER(__HANDLE__, __COUNTER__)         #define __HAL_TIM_GET_COUNTER(__HANDLE__)',
    '#define __HAL_TIM_SET_PRESCALER(__HANDLE__, __PRESC__)', '',
    '/* 레지스터: TIM2->CCR1, TIM2->ARR, TIM2->PSC, TIM2->CNT  또는 htim2.Instance->CCR1 */'
  ].join('\n');
  H['stm32xx_hal_adc.h'] = [
    'typedef struct { uint32_t Channel; uint32_t Rank; uint32_t SamplingTime; } ADC_ChannelConfTypeDef;',
    'typedef struct { ADC_TypeDef *Instance; /* Init ... */ } ADC_HandleTypeDef;', '',
    'HAL_StatusTypeDef HAL_ADC_ConfigChannel(ADC_HandleTypeDef *hadc, ADC_ChannelConfTypeDef *sConfig);',
    'HAL_StatusTypeDef HAL_ADC_Start(ADC_HandleTypeDef *hadc);',
    'HAL_StatusTypeDef HAL_ADC_PollForConversion(ADC_HandleTypeDef *hadc, uint32_t Timeout);   /* 변환 끝날 때까지 대기 */',
    'uint32_t          HAL_ADC_GetValue(ADC_HandleTypeDef *hadc);      /* 12비트: 0..4095 (3.3 V 기준) */',
    'HAL_StatusTypeDef HAL_ADC_Stop(ADC_HandleTypeDef *hadc);',
    'HAL_StatusTypeDef HAL_ADC_Start_IT(ADC_HandleTypeDef *hadc);     /* 완료 시 HAL_ADC_ConvCpltCallback */',
    'HAL_StatusTypeDef HAL_ADC_Start_DMA(ADC_HandleTypeDef *hadc, uint32_t *pData, uint32_t Length);  /* rank 순서로 배열을 계속 채움 */'
  ].join('\n');
  H['stm32xx_hal_i2c.h'] = [
    'typedef struct { I2C_TypeDef *Instance; /* Init ... */ uint32_t ErrorCode; } I2C_HandleTypeDef;',
    '#define I2C_MEMADD_SIZE_8BIT 1U   #define I2C_MEMADD_SIZE_16BIT 0x10U', '',
    '/* DevAddress 는 7비트 주소를 왼쪽으로 1비트 민 값 (0x27 → 0x4E, 즉 0x27<<1) */',
    'HAL_StatusTypeDef HAL_I2C_Master_Transmit(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_I2C_Master_Receive(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_I2C_Mem_Write(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_I2C_Mem_Read(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_I2C_IsDeviceReady(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint32_t Trials, uint32_t Timeout);  /* ACK 있으면 HAL_OK */'
  ].join('\n');
  H['stm32xx_hal_spi.h'] = [
    'typedef struct { SPI_TypeDef *Instance; /* Init ... */ } SPI_HandleTypeDef;', '',
    '/* CS(NSS) 는 GPIO 출력으로 직접 LOW/HIGH — 전송 전에 LOW, 끝나면 HIGH */',
    'HAL_StatusTypeDef HAL_SPI_Transmit(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_SPI_Receive(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);',
    'HAL_StatusTypeDef HAL_SPI_TransmitReceive(SPI_HandleTypeDef *hspi, uint8_t *pTxData, uint8_t *pRxData, uint16_t Size, uint32_t Timeout);'
  ].join('\n');
  global.STM32_HAL_HEADERS = H;
})(window);
