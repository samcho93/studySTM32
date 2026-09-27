#include "main.h"

typedef struct {
  GPIO_TypeDef *port;
  uint16_t pin;
  const char *name;
} Led;

Led leds[] = { {GPIOA, GPIO_PIN_5, "LD2"}, {GPIOB, GPIO_PIN_0, "EXT"} };

void led_on(const Led *l) { HAL_GPIO_WritePin(l->port, l->pin, GPIO_PIN_SET); }

int main(void)
{
  Led copy = leds[1];
  led_on(&leds[0]);
  led_on(&copy);
  copy.port->ODR |= 0x100;
  printf("%lX %lX %s %d\n", GPIOA->ODR, GPIOB->ODR, copy.name, copy.port == GPIOB);
  for (int i = 0; i < 2; i++)
  {
    Led *l = &leds[i];
    HAL_GPIO_TogglePin(l->port, l->pin);
  }
  printf("%lX %lX\n", GPIOA->ODR, GPIOB->ODR);
  return 0;
}
