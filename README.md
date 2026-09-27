# studySTM32 — STM32 HAL 인터랙티브 강좌

CubeMX 핀 설정 → HAL 코드 → 브라우저 시뮬레이터 → 실물 보드까지, STM32 를 한국어로 배우는 **정적 강의 사이트**입니다.

- 배포: https://samcho93.github.io/studySTM32/ (GitHub Pages, 서버·npm 빌드 체인 없음)
- 대상 보드: **NUCLEO-F411RE**(기본, 84 MHz), NUCLEO-F103RB, BluePill(STM32F103C8)
- 레슨 16개 (PART 1 시작하기 · PART 2 통신·타이머·아날로그 · PART 3 주변기기 · PART 4 프로젝트) + HAL API 레퍼런스
- 레슨 속 **[시뮬레이터에서 열기]** 버튼을 누르면 해당 예제 프로젝트가 페이지 오른쪽 실습 패널에 열립니다.

## 구조

```
studySTM32/
├── index.html                  # 홈 (build.py 산출물 — 직접 수정 금지)
├── build.py                    # content/*.md → lessons/*.html, index.html
├── content/
│   ├── curriculum.json         # 트랙(PART)·레슨 목록, 제목·요약·시간·난이도
│   ├── basics/  l01~l05.md     # PART 1 시작하기
│   ├── comm/    l06~l09.md     # PART 2 통신·타이머·아날로그
│   ├── periph/  l10~l14.md     # PART 3 주변기기
│   ├── project/ l15~l16.md     # PART 4 프로젝트
│   └── reference/hal.md        # HAL API 레퍼런스 → lessons/hal-reference.html
├── lessons/*.html              # 산출물 (직접 수정 금지)
├── sim/index.html              # STM32 시뮬레이터 (CubeIDE + CubeMX 혼합 UI)
├── assets/css/                 # main.css(레이아웃) · stm32.css(STM32 전용) · ml-theme.css(디자인 토큰)
├── assets/js/                  # theme.js(테마) · site.js(진행률·목차·실습 패널)
├── assets/js/stm32/            # 시뮬레이터 코어 (컴파일러, 칩, 런타임, 장치, 코드 생성)
│   └── examples.js             # 레슨 예제 프로젝트 (window.STM32_EXAMPLES)
└── docs/SPEC.md                # 설계 명세
```

## 빌드

Python 3 표준 라이브러리만 씁니다.

```bash
python build.py            # index.html, lessons/*.html 생성
python build.py --check    # 생성 + 검사 (문제가 있으면 exit 1)
python build.py --serve    # 생성 후 http://localhost:8000 미리보기
```

`--check` 가 확인하는 것

- 모든 레슨 원고가 있고 front matter(`id track title duration level requires tools`)가 채워져 있는지
- 필수 섹션 `## 학습 목표`, `## 자주 나는 오류와 해결`, `## 참고자료` 가 있는지, `## 실습 (실물)` 에 `:::safety` 가 있는지
- `@sim[id]` · `@code[id]` 가 가리키는 예제가 `assets/js/stm32/examples.js` 에 있는지, `tools` 에 `sim` 이 있는 레슨에 `@sim` 버튼이 있는지
- 생성된 HTML 의 상대 링크가 실제 파일을 가리키는지

## 레슨 원고 문법

front matter 뒤에 `## 학습 목표` → 본문 → `## 자주 나는 오류와 해결` → `## 과제` → `## 참고자료` 순서로 씁니다.

| 문법 | 결과 |
|---|---|
| `:::tip` `:::info` `:::warn` `:::danger` `:::safety` `:::check` `:::task` `:::mission` … `:::` | 콜아웃 상자 (제목을 뒤에 적으면 제목 대체) |
| ```` ```c 파일이름 ```` | C 코드 블록 (구문 색칠, 오른쪽에 파일 이름 표시) |
| `@sim[l03-blink] 라벨` | 시뮬레이터에서 열기 버튼 (오른쪽 실습 패널, `sim/index.html?ex=l03-blink&embed=1`) + 새 창 링크 |
| `@code[l03-blink] pv,loop` | examples.js 의 해당 USER CODE 구역을 `/* USER CODE BEGIN … */` 표시와 함께 코드 블록으로 (구역 생략 시 전부) |
| `@table[pinmap]` / `@table[regmap]` / `@table[api]` | 바로 다음 표에 핀 배치 / 레지스터 / API 표 모양 적용 |
| `@fig[name] 캡션`, `@btn[~/경로] 라벨`, `$수식$` | 그림(`content/figures/name.svg`), 버튼 링크, 수식 글꼴 |

레슨 코드는 `@code` 로 **examples.js 에서 직접 가져오므로** 레슨 본문과 시뮬레이터 예제가 항상 같습니다. 코드를 고칠 때는 examples.js 를 고치세요.

## 시뮬레이터 (요약)

`sim/index.html` 은 STM32CubeIDE 와 CubeMX 를 합친 모양의 브라우저 시뮬레이터입니다.

- **프로젝트 탐색기** — `main.c`, `main.h`, `.ioc`, 읽기 전용 HAL 헤더
- **디자인 영역** — 회로 노드(LED, 버튼, 가변저항, LCD1602, DC 모터, 서보, 스텝모터 등 15종) / 핀아웃·설정(CubeMX 식) / 코드(USER CODE 구역)
- **실습 결과 영역** — 보드 그림, 장치 상태, UART 터미널, 로직 분석기
- **Properties** — 선택한 핀·노드·주변장치 속성

C 서브셋 컴파일러가 사용자 코드를 JavaScript 로 바꾸고, 런타임이 HAL(GPIO · EXTI · UART · TIM/PWM · ADC · I2C · SPI)을 에뮬레이션합니다.
주소: `sim/index.html?ex=<예제 id>` 로 레슨 예제를 바로 엽니다. 자세한 규격은 [docs/SPEC.md](docs/SPEC.md) 를 보세요.

## 디자인

"SAM 로봇강좌" 디자인 시스템 — 인디고 강조색 + 진한 노랑 보조색, Pretendard + JetBrains Mono, 라이트 기본 / 다크 지원.
트랙 색은 `--track-basics`(인디고) · `--track-comm`(시안) · `--track-periph`(보라) · `--track-project`(노랑) · `--track-ref`(초록) 입니다.

## 라이선스와 상표

강의 자료는 교육용입니다. STM32, STM32CubeMX, STM32CubeIDE, Nucleo 는 STMicroelectronics 의 상표이며, 이 사이트는 ST 와 관계없는 비공식 자료입니다.
