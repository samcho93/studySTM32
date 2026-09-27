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
    '#include "stm32xx_hal_adc.h"', '#include "stm32xx_hal_i2c.h"', '#include "stm32xx_hal_spi.h"',
    '#include "stm32xx_hal_iwdg.h"', '#include "stm32xx_hal_rtc.h"', '#include "stm32xx_hal_pwr.h"', '',
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
    'void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc);  void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc);',
    'void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size);',
    'void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim);',
    'void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc);', '',
    '/* 리셋 */',
    'void NVIC_SystemReset(void);                   /* 소프트웨어 리셋 (돌아오지 않음, RCC_FLAG_SFTRST) */',
    '#define __HAL_RCC_GET_FLAG(__FLAG__)            /* RCC_FLAG_IWDGRST / WWDGRST / SFTRST / PORRST / BORRST / PINRST / LPWRRST → 1/0 */',
    '#define __HAL_RCC_CLEAR_RESET_FLAGS()          /* 리셋 원인 플래그 모두 지우기 (RMVF) */'
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
    'HAL_StatusTypeDef HAL_UART_Transmit_DMA(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size);  /* 끝나면 HAL_UART_TxCpltCallback. 끝날 때까지 버퍼 유지 */',
    'HAL_StatusTypeDef HAL_UART_Receive_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);',
    'HAL_StatusTypeDef HAL_UART_DMAStop(UART_HandleTypeDef *huart);', '',
    '/* 가변 길이 수신 (stm32xx_hal_uart_ex.h): 수신선이 1문자 시간 조용하면(IDLE) 또는 Size 가 차면 콜백 */',
    'HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);',
    'HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);  /* DMA 절반 완료 때도 콜백 */',
    'void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size);   /* Size = 받은 바이트 수. NVIC USARTx 필요 */',
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
    '/* 입력 캡처: 에지 순간의 CNT 가 CCRx 에 복사됨. 폭/주기 = 캡처 값 차이 x (PSC+1)/TIMCLK */',
    'typedef struct { uint32_t ICPolarity; uint32_t ICSelection; uint32_t ICPrescaler; uint32_t ICFilter; } TIM_IC_InitTypeDef;',
    '/* ICPolarity: TIM_INPUTCHANNELPOLARITY_RISING / _FALLING / _BOTHEDGE (F1 은 BOTHEDGE 미지원)  ICSelection: TIM_ICSELECTION_DIRECTTI */',
    'HAL_StatusTypeDef HAL_TIM_IC_Init(TIM_HandleTypeDef *htim);',
    'HAL_StatusTypeDef HAL_TIM_IC_ConfigChannel(TIM_HandleTypeDef *htim, TIM_IC_InitTypeDef *sConfig, uint32_t Channel);',
    'HAL_StatusTypeDef HAL_TIM_IC_Start(TIM_HandleTypeDef *htim, uint32_t Channel);',
    'HAL_StatusTypeDef HAL_TIM_IC_Start_IT(TIM_HandleTypeDef *htim, uint32_t Channel);   /* 에지마다 HAL_TIM_IC_CaptureCallback */',
    'HAL_StatusTypeDef HAL_TIM_IC_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);  HAL_StatusTypeDef HAL_TIM_IC_Stop_IT(TIM_HandleTypeDef *htim, uint32_t Channel);',
    'uint32_t HAL_TIM_ReadCapturedValue(TIM_HandleTypeDef *htim, uint32_t Channel);    /* CCRx */',
    '#define __HAL_TIM_SET_CAPTUREPOLARITY(__HANDLE__, __CHANNEL__, __POLARITY__)',
    '/* 콜백에서 채널 구분: htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1 (TIM_CHANNEL_1 과 값이 다름) */', '',
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
    'HAL_StatusTypeDef HAL_ADC_Start_DMA(ADC_HandleTypeDef *hadc, uint32_t *pData, uint32_t Length);  /* rank 순서로 배열을 계속 채움 */',
    'HAL_StatusTypeDef HAL_ADC_Stop_DMA(ADC_HandleTypeDef *hadc);',
    '/* 원형 DMA: 배열 앞 절반이 차면 HAL_ADC_ConvHalfCpltCallback, 끝까지 차면 HAL_ADC_ConvCpltCallback (DMA 인터럽트 필요) */'
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
  H['stm32xx_hal_iwdg.h'] = [
    '/* 독립 워치독: LSI(F4 약 32 kHz, F1 약 40 kHz)로 도는 12비트 다운카운터. 시작하면 리셋 전까지 멈출 수 없음 */',
    '/* 제한 시간 = 4 x 2^PR x (Reload + 1) / LSI    예) PRESCALER_32, Reload 999 → 1.0 s */',
    'typedef struct { uint32_t Prescaler; uint32_t Reload; uint32_t Window; } IWDG_InitTypeDef;   /* Prescaler: IWDG_PRESCALER_4 .. 256, Reload: 0..4095 */',
    'typedef struct { IWDG_TypeDef *Instance; IWDG_InitTypeDef Init; } IWDG_HandleTypeDef;', '',
    'HAL_StatusTypeDef HAL_IWDG_Init(IWDG_HandleTypeDef *hiwdg);      /* MX_IWDG_Init() 이 호출 — 이때부터 카운트 */',
    'HAL_StatusTypeDef HAL_IWDG_Refresh(IWDG_HandleTypeDef *hiwdg);   /* 카운터 다시 채우기. 제한 시간 안에 계속 불러야 함 */', '',
    '/* 창 워치독 WWDG (HAL_WWDG_Init / HAL_WWDG_Refresh) 는 시뮬레이터 미지원 */'
  ].join('\n');
  H['stm32xx_hal_rtc.h'] = [
    '/* RTC: LSE 32.768 kHz / (AsynchPrediv+1 = 128) / (SynchPrediv+1 = 256) = 1 Hz */',
    'typedef struct { uint8_t Hours; uint8_t Minutes; uint8_t Seconds; uint32_t SubSeconds; uint32_t DayLightSaving; uint32_t StoreOperation; } RTC_TimeTypeDef;',
    'typedef struct { uint8_t WeekDay; uint8_t Month; uint8_t Date; uint8_t Year; } RTC_DateTypeDef;   /* WeekDay 1=월..7=일, Year 0..99 */',
    'typedef struct { RTC_TypeDef *Instance; /* Init: HourFormat, AsynchPrediv, SynchPrediv ... */ } RTC_HandleTypeDef;', '',
    '/* Format: RTC_FORMAT_BIN (23) / RTC_FORMAT_BCD (0x23) */',
    'HAL_StatusTypeDef HAL_RTC_Init(RTC_HandleTypeDef *hrtc);',
    'HAL_StatusTypeDef HAL_RTC_SetTime(RTC_HandleTypeDef *hrtc, RTC_TimeTypeDef *sTime, uint32_t Format);',
    'HAL_StatusTypeDef HAL_RTC_SetDate(RTC_HandleTypeDef *hrtc, RTC_DateTypeDef *sDate, uint32_t Format);',
    'HAL_StatusTypeDef HAL_RTC_GetTime(RTC_HandleTypeDef *hrtc, RTC_TimeTypeDef *sTime, uint32_t Format);   /* 이 다음에 반드시 GetDate */',
    'HAL_StatusTypeDef HAL_RTC_GetDate(RTC_HandleTypeDef *hrtc, RTC_DateTypeDef *sDate, uint32_t Format);   /* 그림자 레지스터 잠금 해제 */', '',
    '/* 웨이크업 타이머 (stm32xx_hal_rtc_ex.h). CK_SPRE_16BITS: (WakeUpCounter + 1) 초마다, NVIC RTC_WKUP 필요 */',
    'HAL_StatusTypeDef HAL_RTCEx_SetWakeUpTimer_IT(RTC_HandleTypeDef *hrtc, uint32_t WakeUpCounter, uint32_t WakeUpClock);',
    'HAL_StatusTypeDef HAL_RTCEx_DeactivateWakeUpTimer(RTC_HandleTypeDef *hrtc);',
    'void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc);   /* 사용자 정의 */',
    '/* WakeUpClock: RTC_WAKEUPCLOCK_RTCCLK_DIV16/8/4/2, RTC_WAKEUPCLOCK_CK_SPRE_16BITS, RTC_WAKEUPCLOCK_CK_SPRE_17BITS */',
    '/* 알람(HAL_RTC_SetAlarm_IT), 백업 레지스터(HAL_RTCEx_BKUPRead/Write)는 시뮬레이터 미지원 */'
  ].join('\n');
  H['stm32xx_hal_pwr.h'] = [
    '/* 저전력 모드. 대표 소비 전류는 데이터시트의 Supply current 표 확인 */',
    'void HAL_PWR_EnterSLEEPMode(uint32_t Regulator, uint8_t SLEEPEntry);   /* PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI — 아무 인터럽트로 깨어남 */',
    'void HAL_PWR_EnterSTOPMode(uint32_t Regulator, uint8_t STOPEntry);     /* PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI — EXTI/RTC 로 깨어남 */',
    '                                                                         /* 깨어나면 클럭 = HSI → SystemClock_Config() 다시 호출 */',
    'void HAL_PWR_EnterSTANDBYMode(void);                                     /* 깨어나면 리셋 → main() 처음부터, PWR_FLAG_SB */',
    'void HAL_PWR_EnableWakeUpPin(uint32_t WakeUpPinx);                       /* PWR_WAKEUP_PIN1 = PA0 (F4) */',
    'void HAL_PWR_DisableWakeUpPin(uint32_t WakeUpPinx);',
    'void HAL_SuspendTick(void);   /* SysTick 인터럽트 멈춤 — SLEEP/STOP 전에 */',
    'void HAL_ResumeTick(void);    /* 깨어난 뒤 */',
    '#define __HAL_PWR_GET_FLAG(__FLAG__)     /* PWR_FLAG_SB (STANDBY 에서 깨어남), PWR_FLAG_WU (웨이크업 이벤트) */',
    '#define __HAL_PWR_CLEAR_FLAG(__FLAG__)'
  ].join('\n');
  H['cmsis_os2.h'] = [
    '/* CMSIS-RTOS2 (FreeRTOS 위) — CubeMX FREERTOS, Interface CMSIS_V2. #include "cmsis_os.h" */',
    '/* timeout: 틱(1 ms) 단위, osWaitForever = 무한. ISR 에서는 timeout 0 만 허용 */',
    'typedef enum { osOK = 0, osError = -1, osErrorTimeout = -2, osErrorResource = -3, osErrorParameter = -4, osErrorNoMemory = -5, osErrorISR = -6 } osStatus_t;',
    'typedef enum { osPriorityIdle = 1, osPriorityLow = 8, osPriorityBelowNormal = 16, osPriorityNormal = 24,',
    '               osPriorityAboveNormal = 32, osPriorityHigh = 40, osPriorityRealtime = 48 } osPriority_t;',
    'typedef struct { const char *name; uint32_t attr_bits; void *cb_mem; uint32_t cb_size; void *stack_mem; uint32_t stack_size; osPriority_t priority; } osThreadAttr_t;', '',
    '/* 커널 */',
    'osStatus_t osKernelInitialize(void);',
    'osStatus_t osKernelStart(void);                     /* 스케줄러 시작 — 돌아오지 않음 */',
    'uint32_t   osKernelGetTickCount(void);', '',
    '/* 태스크 (스레드). 태스크 함수: void Name(void *argument) { for(;;) { ... } } — return 금지 */',
    'osThreadId_t osThreadNew(osThreadFunc_t func, void *argument, const osThreadAttr_t *attr);   /* stack_size 는 바이트 */',
    'osThreadId_t osThreadGetId(void);    const char *osThreadGetName(osThreadId_t thread_id);',
    'osStatus_t osThreadYield(void);      osStatus_t osThreadSuspend(osThreadId_t thread_id);   osStatus_t osThreadResume(osThreadId_t thread_id);',
    'osStatus_t osThreadTerminate(osThreadId_t thread_id);   void osThreadExit(void);',
    'osStatus_t osDelay(uint32_t ticks);             /* Blocked — 다른 태스크 실행. 태스크 안에서는 HAL_Delay 대신 */',
    'osStatus_t osDelayUntil(uint32_t ticks);        /* 절대 틱까지 — 주기 작업 */', '',
    '/* 뮤텍스 (ISR 불가, 우선순위 상속) */',
    'osMutexId_t osMutexNew(const osMutexAttr_t *attr);',
    'osStatus_t  osMutexAcquire(osMutexId_t mutex_id, uint32_t timeout);   osStatus_t osMutexRelease(osMutexId_t mutex_id);', '',
    '/* 세마포어 (ISR 에서 Release 가능) */',
    'osSemaphoreId_t osSemaphoreNew(uint32_t max_count, uint32_t initial_count, const osSemaphoreAttr_t *attr);',
    'osStatus_t osSemaphoreAcquire(osSemaphoreId_t semaphore_id, uint32_t timeout);   osStatus_t osSemaphoreRelease(osSemaphoreId_t semaphore_id);',
    'uint32_t   osSemaphoreGetCount(osSemaphoreId_t semaphore_id);', '',
    '/* 메시지 큐 (값 복사, ISR 에서 timeout 0 으로 Put/Get) */',
    'osMessageQueueId_t osMessageQueueNew(uint32_t msg_count, uint32_t msg_size, const osMessageQueueAttr_t *attr);',
    'osStatus_t osMessageQueuePut(osMessageQueueId_t mq_id, const void *msg_ptr, uint8_t msg_prio, uint32_t timeout);',
    'osStatus_t osMessageQueueGet(osMessageQueueId_t mq_id, void *msg_ptr, uint8_t *msg_prio, uint32_t timeout);',
    'uint32_t   osMessageQueueGetCount(osMessageQueueId_t mq_id);', '',
    '/* 스레드 플래그 · 이벤트 플래그. options: osFlagsWaitAny / osFlagsWaitAll / osFlagsNoClear */',
    'uint32_t osThreadFlagsSet(osThreadId_t thread_id, uint32_t flags);   /* ISR 가능 */',
    'uint32_t osThreadFlagsWait(uint32_t flags, uint32_t options, uint32_t timeout);   uint32_t osThreadFlagsClear(uint32_t flags);',
    'osEventFlagsId_t osEventFlagsNew(const osEventFlagsAttr_t *attr);',
    'uint32_t osEventFlagsSet(osEventFlagsId_t ef_id, uint32_t flags);   uint32_t osEventFlagsClear(osEventFlagsId_t ef_id, uint32_t flags);',
    'uint32_t osEventFlagsWait(osEventFlagsId_t ef_id, uint32_t flags, uint32_t options, uint32_t timeout);', '',
    '/* 소프트웨어 타이머: 콜백은 타이머 서비스 태스크에서 실행 — 짧게, 대기 금지. type: osTimerOnce / osTimerPeriodic */',
    'osTimerId_t osTimerNew(osTimerFunc_t func, osTimerType_t type, void *argument, const osTimerAttr_t *attr);',
    'osStatus_t  osTimerStart(osTimerId_t timer_id, uint32_t ticks);   osStatus_t osTimerStop(osTimerId_t timer_id);', '',
    '/* RTOS 함수를 부르는 인터럽트는 NVIC 우선순위 5 이상(숫자) — LIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY */'
  ].join('\n');
  global.STM32_HAL_HEADERS = H;
})(window);
