#include "main.h"

#define VERSION 2
#if defined(VERSION) && VERSION > 1
#define MODE_NAME "new"
#elif VERSION == 1
#define MODE_NAME "old"
#else
#define MODE_NAME "none"
#endif
#ifndef MISSING
#define HAS_MISSING 0
#endif
#define STR(x) #x
#define CAT(a, b) a##b
#define LED_ON() HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET)
#define TEMP 1
#undef TEMP
#define TEMP 7
#define MAX(a, b) ((a) > (b) ? (a) : (b))

typedef enum { STATE_IDLE = 0, STATE_RUN, STATE_STOP = 10 } State;

extern int shared;
int shared = 5;
const int limits[] = { 10, 20, 30 };
int m[][2] = { {1, 2}, {3, 4}, {5, 6} };
struct Item { char code; uint16_t qty; } items[] = { {'A', 1}, {'B', 300}, [3] = {'D', 4} };
uint8_t sparse[5] = { [2] = 5, [4] = 9 };
volatile uint32_t isr_count;

const char *state_name(State s)
{
  switch (s)
  {
    case STATE_IDLE: return "idle";
    case STATE_RUN: return "run";
    case STATE_STOP: return "stop";
    default: return "?";
  }
}

int main(void)
{
  int CAT(my, var) = TEMP;
  printf("%s %s %d %d\n", MODE_NAME, STR(hello), myvar, HAS_MISSING);
  LED_ON();
  printf("odr=%lX max=%d\n", GPIOA->ODR, MAX(3 + 1, 2));

  int odd = 0;
  for (int i = 0; i < 6; i++)
  {
    switch (i % 3)
    {
      case 0: continue;
      case 1: odd++; break;
      default: odd += 10;
    }
    odd += 100;
  }
  printf("odd=%d\n", odd);

  printf("%s %s %s\n", state_name(STATE_RUN), state_name(STATE_STOP), state_name((State)3));
  printf("m=%d %d %d n=%d\n", m[2][1], m[1][0], limits[2], (int)(sizeof(m) / sizeof(m[0])));
  printf("items=%c%d %c%d %c%d n=%d sp=%d%d%d%d%d\n", items[0].code, items[0].qty, items[1].code, items[1].qty,
         items[3].code, items[3].qty, (int)(sizeof(items) / sizeof(items[0])),
         sparse[0], sparse[1], sparse[2], sparse[3], sparse[4]);
  printf("%c%c%c%c %d %d\n", '\x41', '\102', 'C', '\'', '\0', "ab\0cd"[3]);
  float f = shared > 3 ? 1.5f : 2;
  isr_count += 3;
  shared *= 2;
  printf("f=%.1f shared=%d isr=%lu\n", f, shared, isr_count);
  return 0;
}
