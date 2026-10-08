# 도장 · dozang

하루 한 번 출석체크를 하고 날짜별 도장을 모아 보는 웹사이트입니다.

## 기능
- 한국 시간(Asia/Seoul) 기준 하루 1회 출석
- 월별 달력과 전체 출석 기록
- 누적 출석 및 연속 출석 집계
- 계정별 D1 영구 저장, 기기 간 기록 공유
- 데이터베이스 복합 기본키로 동시 요청·중복 적립 방지
- ChatGPT 로그인, 서버에서 계정별 접근 확인
- 모바일 화면, 로딩·오류·재시도 처리

쿠폰과 보상 기능은 없습니다. 개인 기록만 조회합니다.

## 실행 및 검증
Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run dev
npx tsc --noEmit
npx eslint app db lib/attendance.ts
node --experimental-strip-types --test tests/attendance.test.ts
```

DB 스키마 변경 후 `npm run db:generate`로 마이그레이션을 생성합니다.
사이트는 Sites/Cloudflare Workers + D1에 배포하며 사용자 소유 서버가 필요하지 않습니다. 작업 환경이나 컴퓨터를 종료해도 배포된 사이트는 계속 서비스됩니다. 서비스 제공자의 장애·사용량 정책은 적용됩니다.

로컬 DB 검증은 빌드 후 다음 명령으로 마이그레이션을 적용합니다.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slow_sally_floyd.sql
npm start
```

실서비스 사용자 신원은 Sites가 검증하고 전달합니다. 로컬 개발 환경에는 로그인 기능이 자동으로 제공되지 않습니다. 애플리케이션을 다른 호스팅으로 옮길 경우, 신원 헤더를 신뢰할 수 있는 인증 계층을 별도로 구성해야 합니다.

## GitHub 상태
요청된 저장소: `aakn232/dozang`. 2026-10-08 현재 연결된 GitHub integration이 `createRepository`를 거부하여 생성하지 못했습니다. 빈 저장소가 생성되고 연결 권한이 부여되면 이 소스를 push할 수 있습니다.
