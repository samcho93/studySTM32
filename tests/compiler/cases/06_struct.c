#include "main.h"

typedef enum { RED, GREEN = 5, BLUE } Color;
enum Mode { OFF, ON };
struct Point { int x; int y; };
typedef struct {
  struct Point pos;
  Color color;
  uint8_t tag[4];
} Sprite;
typedef struct Node { int value; char name[8]; } NodeT;

Sprite sprites[3];
struct Point origin = {1, 2};
NodeT nodes[2] = { {10, "ten"}, {20, "twenty"} };

void move(struct Point *p, int dx, int dy) { p->x += dx; p->y += dy; }

struct Point add(struct Point a, struct Point b)
{
  struct Point r;
  r.x = a.x + b.x;
  r.y = a.y + b.y;
  a.x = 999;
  return r;
}

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  static int presses = 0;
  static uint8_t wrap = 254;
  if (GPIO_Pin == B1_Pin) { presses++; wrap++; }
  printf("presses=%d wrap=%d\n", presses, wrap);
}

int main(void)
{
  Sprite s = { {3, 4}, BLUE, {1, 2, 3, 4} };
  struct Point q = origin;
  q.x = 100;
  move(&q, 1, 1);
  struct Point r = add(q, origin);
  printf("q=%d,%d origin=%d,%d r=%d,%d\n", q.x, q.y, origin.x, origin.y, r.x, r.y);
  printf("s=%d,%d c=%d tag=%d size=%u\n", s.pos.x, s.pos.y, s.color, s.tag[3], sizeof(Sprite));
  sprites[1] = s;
  sprites[1].pos.x = 7;
  sprites[2].tag[0] = 9;
  printf("sp=%d %d %d %d\n", sprites[1].pos.x, s.pos.x, sprites[2].tag[0], sprites[0].color);
  printf("%s %d %s\n", nodes[1].name, nodes[0].value, nodes[0].name);
  struct Point d = { .y = 9, .x = 8 };
  Sprite *ps = &sprites[1];
  ps->tag[1] = 42;
  printf("d=%d,%d mode=%d t=%d\n", d.x, d.y, ON, sprites[1].tag[1]);
  for (int i = 0; i < 3; i++) HAL_GPIO_EXTI_Callback(GPIO_PIN_13);
  HAL_GPIO_EXTI_Callback(GPIO_PIN_0);
  {
    int x = 1;
    {
      int x = 2;
      x++;
      printf("inner=%d\n", x);
    }
    printf("outer=%d\n", x);
  }
  return 0;
}
