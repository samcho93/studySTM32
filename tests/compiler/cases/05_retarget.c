#include "main.h"
#include <stdio.h>

UART_HandleTypeDef huart2;

int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}

void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }

int gval = 3;

int main(void)
{
  int x = 5;
  int *px = &x;
  *px += 10;
  printf("x=%d\n", x);
  printf("%s %c%c\n", "hello", 'O', 'K');
  int y = 1;
  swap(&x, &y);
  swap(&gval, &x);
  printf("x=%d y=%d g=%d same=%d null=%d\n", x, y, gval, px == &x, px != NULL);
  return 0;
}
