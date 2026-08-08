# TACTICS realtime server

Render에서 저장소의 `render.yaml` Blueprint를 생성하면 웹 화면과 단일 방 WebSocket 서버가 하나의 Web Service로 배포됩니다.

운영 웹은 접속한 Render 도메인의 `/ws`를 자동 사용하므로 별도 서버 주소 환경변수가 필요 없습니다.

지원 흐름:

- 닉네임으로 빈 좌석 참가
- 방장이 8~13명 포메이션 선택
- 부족한 좌석을 AI로 채운 뒤 직업 무작위 배정
- 게임 중 연결이 끊긴 인간 좌석을 AI가 임시 인계
- 브라우저에 보관한 재접속 토큰으로 원래 사용자가 같은 좌석 회수
- 서버 권위형 마나 보급, 쿨다운, 스킬 판정, 사망 공개와 승리 판정
- 공개 채팅, 동맹 채팅과 수신자 전용 귓말
- 서버 AI가 연결이 끊긴 인간 좌석과 빈 좌석을 동일한 규칙으로 조작
- 게임 종료 후 방장이 같은 단일 방을 새 로비로 초기화

## LLM 대화 해석

운영 기본값은 비용이 발생하지 않는 규칙형 AI입니다. `OPENAI_API_KEY`가 있고 `OPENAI_AI_ENABLED=true`를 명시한 경우에만 인간의 메시지를 GPT로 해석하고 전략 계획을 요청합니다. 키가 없거나 기능이 꺼져 있거나 API가 실패하면 규칙형 AI만 사용합니다.

- `OPENAI_AI_ENABLED`: `false`로 설정하면 LLM 비활성화
- `OPENAI_MODEL_DIALOGUE`: 기본값 `gpt-5.6-luna`
- `OPENAI_MODEL_STRATEGY`: AI별 주관적 사실과 합법 행동 후보를 판단하는 모델, 기본값 `gpt-5.6-terra`
- `OPENAI_TIMEOUT_MS`: 기본값 `3500`
- `OPENAI_STRATEGY_MIN_INTERVAL_MS`: 전략 LLM 호출 사이의 최소 간격, 기본값 `30000`
- `OPENAI_STRATEGY_MAX_CALLS_PER_GAME`: 게임당 전략 LLM 호출 상한, 기본값 `12` (이후 규칙형 AI로 계속 진행)

API 키는 Render Secret 환경변수로만 설정하고 저장소에 커밋하지 마세요.
