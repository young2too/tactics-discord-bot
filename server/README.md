# TACTICS realtime server

Render에서 저장소의 `render.yaml` Blueprint를 생성하면 단일 방 WebSocket 서버가 배포됩니다.

배포 후 웹 프로젝트 환경변수 `NEXT_PUBLIC_GAME_SERVER_URL`에 `wss://<render-host>/ws`를 지정하세요.

지원 흐름:

- 닉네임으로 빈 좌석 참가
- 방장이 8~13명 포메이션 선택
- 부족한 좌석을 AI로 채운 뒤 직업 무작위 배정
- 게임 중 연결이 끊긴 인간 좌석을 AI가 임시 인계
- 브라우저에 보관한 재접속 토큰으로 원래 사용자가 같은 좌석 회수
