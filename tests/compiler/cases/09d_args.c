#include "main.h"
int add(int a, int b) { return a + b; }
int main(void)
{
  int x = add(1, 2);
  x = add(1);
  return x;
}
