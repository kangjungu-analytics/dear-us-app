# 둘이 — 커플 공간 웹앱

회원가입·로그인, 초대 코드로 두 계정 연결, 실시간 채팅, 비공개 사진 앨범을 갖춘 모바일 우선 웹앱 초안입니다.

## 구성

- 웹 화면: HTML, CSS, JavaScript
- 계정·데이터·실시간 메시지·사진 저장: Supabase
- 공개 웹 주소: GitHub Pages

두 사람이 서로 다른 기기에서 같은 기록을 보려면 Supabase 프로젝트 설정이 필요합니다.

## 1. Supabase 설정

1. Supabase에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에서 `schema.sql` 전체를 실행합니다. 계정 연결, 메시지·사진 테이블, 접근 정책, 비공개 사진 저장소, 실시간 업데이트가 설정됩니다.
3. **Project Settings → API**에서 Project URL과 publishable key(또는 anon public key)를 확인합니다.
4. `app.js` 맨 위의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 값을 본인 프로젝트 값으로 바꿉니다.
5. **Authentication → URL Configuration**의 Site URL을 `https://kangjungu-analytics.github.io/dear-us-app/`로 설정합니다.

브라우저 코드에는 공개 키만 사용하세요. `service_role` 키는 브라우저에 넣지 마세요. 데이터베이스 RLS와 Storage 정책은 연결된 두 계정만 대화와 사진에 접근하도록 제한합니다.

## 2. GitHub와 웹 배포

1. 이 폴더의 파일을 GitHub 저장소 루트에 올립니다.
2. 저장소 Settings → Pages에서 `main` 브랜치와 `/ (root)`를 선택해 저장합니다.
3. GitHub Actions의 `pages build and deployment` 작업이 끝나면 `https://kangjungu-analytics.github.io/dear-us-app/`에서 엽니다.

공개 링크를 직접 보내는 데 검색엔진 등록은 필요하지 않습니다. 네이버·구글 검색 결과에 표시하려면 별도 색인 신청과 사이트 정보 설정이 필요합니다.

## 첫 사용

1. 두 사람이 이메일로 회원가입하고 확인 링크를 누른 뒤 로그인합니다.
2. 한 사람이 `우리 공간 만들기`를 누릅니다. 앱이 초대 화면을 바로 열고 8자리 코드를 보여줍니다.
3. `초대 보내기` 또는 `코드 복사`를 눌러 상대에게 전달합니다.
4. 상대방은 가입 후 로그인해서 8자리 초대 코드를 입력합니다.
5. 대화 탭에서 실시간 메시지를 주고받고, 사진첩 탭에서 JPG/PNG/WEBP 사진(최대 10MB)을 저장합니다.

## 현재 범위

현재 앱에는 이메일 가입·로그인, 초대 코드로 한 쌍 연결, 실시간 채팅, 비공개 사진 업로드·열람·삭제가 포함됩니다. 실제 이메일을 프로젝트 사용자에게 보내려면 SMTP 발송 서비스를 연결해야 합니다. Supabase 기본 메일 서비스는 테스트용이며 수신 대상이 제한됩니다. SMS 전화번호 인증도 Supabase Auth에 Twilio, MessageBird 또는 Vonage 같은 SMS 제공 업체를 연결해야 하고 발송 비용이 발생할 수 있습니다. 공유 캘린더, 기념일, 알림, 비밀번호 재설정, 계정 및 공간 탈퇴는 다음 단계 기능입니다.

## 휴대폰 앱처럼 설치하기 (PWA)

HTTPS로 배포된 사이트는 홈 화면에 설치해 독립 창에서 실행할 수 있습니다. 앱 아이콘과 시작 화면은 `manifest.webmanifest`에서 관리하고, `sw.js`는 앱 화면 파일만 캐시합니다. Supabase 요청, 대화, 서명된 사진 주소는 캐시하지 않습니다.

- Android Chrome: 사이트 메뉴에서 **앱 설치** 또는 **홈 화면에 추가**를 선택합니다.
- iPhone Safari: 공유 메뉴에서 **홈 화면에 추가**를 선택합니다.

변경 사항을 GitHub Pages에 반영한 뒤 휴대폰에서 설치해야 합니다. Google Play/App Store에 올릴 네이티브 패키지는 별도 작업이며, 다음 단계에서 Capacitor로 현재 웹앱을 감싸는 방식으로 진행할 수 있습니다.
