# 도장 · dozang

로그인 없이 누구나 같은 도장판을 보는 “잘했어요!” 칭찬 사이트입니다. 도장과 칭찬 내용은 모두 서버의 Cloudflare D1 데이터베이스에 저장합니다.

- 사이트: https://dozang-aakn232.foggygiant.chatgpt.site
- 코드: https://github.com/aakn232/dozang

## 기능
- 잘한 일마다 여러 개의 칭찬 도장 적립
- 칭찬 내용 선택 입력, 최대 300자 및 줄바꿈 지원
- 같은 공용 도장판을 모든 브라우저·기기에서 조회
- 전체 도장 목록, 월별 달력 및 날짜별 보기
- 총 도장 수와 오늘 찍은 도장 수 집계
- 화면을 보는 동안 15초마다 조용히 서버 기록 갱신
- 모바일 중심 화면: 16px 입력, 44px 이상 주요 버튼, 긴 내용 줄바꿈, 스크롤 가능한 비밀번호 입력창
- 저장 실패 시 내용 유지, 동일 요청 재시도 중복 방지
- 도장 하나씩 날짜 비밀번호로 삭제

## 서버 저장과 공개 범위
모든 도장과 내용은 공용 기록입니다. 사이트는 방문자 쿠키나 브라우저 저장소를 사용하지 않으며, 저장·조회·삭제에 쿠키나 ChatGPT 로그인이 필요하지 않습니다. 기기를 바꾸거나 쿠키를 지워도 같은 도장판을 봅니다. 입력한 칭찬 내용은 모든 방문자에게 공개됩니다.

이전에 저장된 도장도 함께 표시하며 방문자 식별자는 반환하지 않습니다. 기존 운영 마이그레이션을 수정하지 않고, 칭찬 내용 컬럼을 새 마이그레이션으로 추가했습니다. 이전 내용 없는 도장은 빈 내용으로 표시합니다.

## 도장 없애기 비밀번호
한국 시간 기준 **삭제하는 오늘의 일자**로 `(일자의 각 자리 숫자 합) × 일자`를 계산합니다. 21일은 `63`, 3일은 `9`, 31일은 `124`입니다. 서버에서 오늘의 날짜로 검증하며 잘못된 비밀번호로는 삭제되지 않습니다. 선택한 도장 하나와 그 내용만 삭제합니다. 모든 방문자가 같은 판을 사용하므로 오늘의 비밀번호가 맞으면 공용 도장을 삭제할 수 있습니다.

## 실행·검증
Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run dev
npx tsc --noEmit
npx eslint app db lib/stamps.ts lib/request-origin.ts
node --experimental-strip-types --test tests/*.test.mjs
```

로컬 D1 데이터베이스는 최초 빌드 후 미적용 마이그레이션만 순서대로 적용합니다.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slow_sally_floyd.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_elite_shen.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_wealthy_lord_tyger.sql
npm start
```

실행된 로컬 서버에서 기기·쿠키와 무관한 공유, 내용 저장·재조회, 중복 방지, 길이 검증, 날짜 비밀번호 삭제 및 기존 기록 보존을 검증합니다.

```sh
python3 tests/shared_board_integration.py
```

스키마 변경 후 `npm run db:generate`로 새 마이그레이션을 생성합니다. 운영에 적용된 마이그레이션은 변경하지 않습니다.

## 호스팅
Sites / Cloudflare Workers + D1에서 운영하므로 개인 서버나 컴퓨터를 켜 둘 필요가 없습니다. 기존 `.openai/hosting.json`의 project_id와 D1 바인딩을 유지하여 배포합니다. GitHub는 코드 저장소이며 push만으로 자동 배포되는 구성은 아닙니다.
