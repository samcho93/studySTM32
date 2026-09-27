# CLAUDE.md — studySTM32 : STM32 HAL 인터랙티브 강좌 + 시뮬레이터

> 이 저장소에서 작업할 때 따르는 프로젝트 헌장. 자세한 계약은 `docs/SPEC.md`.

## 한 줄 요약

GitHub Pages(`https://samcho93.github.io/studySTM32/`)로 배포되는 **정적** 학습 사이트.
① STM32 HAL 강의(레슨), ② **CubeMX(핀아웃·주변장치 설정) + CubeIDE(코드·빌드·실행)를 합친 브라우저 시뮬레이터**,
③ 노드 방식 회로(LED·스위치·LCD·모터 드라이버·범용 UART/I2C/SPI 모듈 …), ④ HAL API 레퍼런스.

- 디자인: "SAM 로봇강좌" 디자인 시스템 (`assets/css/ml-theme.css` 토큰, 인디고 accent + 진한 노랑 info, Pretendard + JetBrains Mono).
- 언어: 본문·UI 한국어 존댓말, 코드·커밋 영어(주석 한국어 허용). 이모지 금지(안전 콜아웃 ⚠ 예외).

## 원칙

1. **Static-first**: npm 빌드 체인 금지. 외부 라이브러리는 버전 고정 CDN 만.
2. **사용자 코드는 실물 HAL 과 같은 API**: 시뮬레이터는 HAL 을 에뮬레이션한다(`assets/js/stm32/runtime.js`). 새 HAL 함수를 지원하면 `runtime.js` 의 `FUNCS`·`halFunctions()`, `halheaders.js`, `content/reference/hal.md` 를 함께 갱신한다.
3. **컴파일러 ↔ 런타임 계약**은 `docs/SPEC.md` 6.1. 한쪽을 바꾸면 다른 쪽과 `tests/` 를 같이 고친다.
4. **예제 = 레슨**: 레슨의 `@sim[id]` 는 `assets/js/stm32/examples.js` 의 id 와 일치해야 한다 (`python build.py --check` 가 검사).
5. `lessons/`, `index.html` 은 빌드 산출물 — 직접 수정 금지 (`content/` 를 고치고 `python build.py`).

## 구조

```
build.py · content/curriculum.json · content/<track>/*.md · content/reference/hal.md
lessons/*.html · index.html            (산출물)
sim/index.html, sim.css, app.js, ui-*.js   시뮬레이터 셸
assets/js/stm32/  chips.js codegen.js ccompiler.js runtime.js devices.js examples.js halheaders.js
tests/compiler/run.js · tests/sim/e2e.js
```

## 명령

```bash
python build.py --check        # 레슨 빌드 + 검사
python build.py --serve        # :8000 미리보기
node tests/compiler/run.js     # C 컴파일러 테스트
node tests/sim/e2e.js          # 예제 전체를 컴파일→실행 (5초 가상 시간)
```

## 하지 말 것

- 실물에서 컴파일되지 않는 "가짜 HAL" 함수를 예제에 쓰기
- 컴파일러 계약(`H.*`, `v_` 접두어, generator 규칙)을 문서 갱신 없이 바꾸기
- 카탈로그/보드 핀 값을 코드 곳곳에 하드코딩 (`chips.js` 가 단일 출처)
