# RIDE AI — 스키·스노보드 라이딩 분석

AI가 라이딩 영상을 분석하고 자세 코칭을 제공하는 웹앱입니다.

---

## 배포 방법 (Vercel — 무료, 5분)

### 1단계: GitHub에 올리기

```bash
# 이 폴더에서 실행
git init
git add .
git commit -m "RIDE AI 초기 배포"
```

GitHub에서 새 저장소 만들고:
```bash
git remote add origin https://github.com/[내아이디]/rideai.git
git push -u origin main
```

### 2단계: Vercel 연결

1. [vercel.com](https://vercel.com) 접속 → GitHub로 로그인
2. **"Add New Project"** 클릭
3. 방금 만든 `rideai` 저장소 선택
4. **"Deploy"** 클릭 (설정 변경 없이)
5. 1~2분 후 URL 생성 완료! (예: `rideai.vercel.app`)

### 3단계: Anthropic API 키 설정

배포된 URL로 접속하면 우측 상단에 **"🔑 API 키 필요"** 버튼이 있습니다.
- [console.anthropic.com](https://console.anthropic.com) 에서 API 키 발급
- 앱에서 키 입력 후 저장 (브라우저 로컬에만 저장, 서버 전송 없음)

---

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

---

## 기능

- 🎿 스키 / 🏂 스노보드 종목 선택
- 영상 업로드 → 자동 프레임 캡처 (4장)
- Claude AI가 실제 영상 장면을 분석
- 3D 인체 일러스트로 자세 시각화
- 전문 용어 + 괄호 설명으로 쉬운 피드백
- 종합 점수, 잘된 장면/개선 장면 분류
