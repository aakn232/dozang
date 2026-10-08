# 도장 · dozang

로그인이나 회원가입 없이 잘한 일마다 “잘했어요!” 도장을 찍고 모아 보는 칭찬 수첩입니다.

- 사이트: https://dozang-aakn232.foggygiant.chatgpt.site
- GitHub: https://github.com/aakn232/dozang

## 기능
- 잘한 일마다 하루에 여러 개의 칭찬 도장 적립
- 월별 달력과 전체 도장 목록, 날짜별 도장 보기
- 모은 도장 수 및 오늘의 칭찬 도장 수 집계
- 도장별 삭제: 서버에서 오늘의 날짜 비밀번호를 확인한 후 선택한 한 개만 삭제
- 동일 요청 재시도 시 도장 ID로 중복 적립 방지
- 모바일 지원, 저장 오류 및 재시도 처리
- 별도 서버 없이 Sites / Cloudflare Workers + D1에서 상시 서비스

쿠폰과 보상은 없습니다. 도장 기록은 방문자별로 구분하며 다른 방문자에게 공개하지 않습니다.

## 도장 없애기 비밀번호
한국 시간 기준 **삭제하는 오늘의 일자**에 대해, `(일자의 각 자리 숫자 합) × 일자`를 계산한 값을 사용합니다. 21일은 `63`, 3일은 `9`, 31일은 `124`입니다. 도장을 찍은 날짜나 클라이언트가 보낸 날짜는 비밀번호 계산에 사용하지 않습니다. 서버에서 검증하며 잘못된 비밀번호는 도장을 삭제하지 않습니다. 방문자는 자신의 쿠키에 속한 도장만 삭제할 수 있습니다.

기존 하루 1회 출석 기록은 호환 조회로 칭찬 도장에 포함됩니다. 기존 운영 마이그레이션이나 데이터를 덮어쓰지 않고, 새 `praise_stamps` 테이블을 추가했습니다.

## 로그인 없는 기록 보관
첫 방문 시 서버에서 256비트 무작위 방문자 쿠키를 발급합니다. HTTPS에서는 `__Host-` 접두사, Secure, HttpOnly, SameSite=Lax 속성을 사용합니다. 데이터베이스에는 쿠키 원문 대신 SHA-256 식별자와 도장을 찍은 날짜·시간을 저장합니다. API는 쿠키에 해당하는 기록만 조회·추가할 수 있으며, 외부 출처의 쓰기 요청을 거부합니다.

같은 브라우저에서는 새로고침·재접속 후에도 기록을 볼 수 있습니다. 쿠키를 삭제하거나 다른 브라우저·기기로 접속하면 새 수첩이 만들어집니다. 쿠키 유효기간은 마지막 사용부터 최대 1년이며, 브라우저 정책에 따라 먼저 삭제될 수 있습니다. 쿠키 차단 시 도장을 저장할 수 없습니다. 로그인 없는 특성상 쿠키를 지우고 새 방문자로 시작하는 행위까지 방지하지는 않습니다.

기존 ChatGPT 계정 출석 데이터는 삭제하지 않습니다. 새 익명 수첩에는 자동으로 합쳐지지 않습니다. 공개 버전은 ChatGPT 로그인이나 신원 헤더에 의존하지 않습니다.

## 실행 및 검증
Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run dev
npx tsc --noEmit
npx eslint app db lib/stamps.ts lib/visitor.ts
node --experimental-strip-types --test tests/*.test.mjs
```

로컬 D1 검증은 최초 빌드 후 다음 명령으로 마이그레이션을 적용합니다. 이미 적용된 마이그레이션은 다시 실행하지 않습니다.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slow_sally_floyd.sql
npm start
```

실행된 로컬 서버에서 익명 방문, 여러 도장 적립, 동일 요청 재시도, 기록 분리, 비밀번호 삭제, 기존 기록 유지 및 외부 출처 거부를 검증합니다.

```sh
python3 tests/anonymous_integration.py
```

로컬 서버 실행 전 새 마이그레이션 `drizzle/0001_elite_shen.sql`도 같은 D1 실행 명령으로 적용합니다.

스키마 수정 후 `npm run db:generate`로 추가 마이그레이션을 생성합니다. 운영에 적용된 마이그레이션은 수정하지 않습니다.

## 배포
`.openai/hosting.json`의 기존 project_id 및 D1 바인딩을 유지합니다. Sites 배포 도구로 빌드·소스 동기화·게시하고 배포 성공을 확인합니다. GitHub는 코드 저장소이며 push만으로 자동 배포되도록 설정된 상태는 아닙니다. 작업 환경이나 개인 컴퓨터를 종료해도 게시된 서비스는 동작합니다. 제공자의 장애 및 사용량 정책은 적용됩니다.
