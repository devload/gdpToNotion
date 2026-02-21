# gdpToNotion

Markdown 파일을 Notion 페이지로 변환합니다. Notion API 대신 Chrome DevTools Protocol(CDP)을 사용하여 실제 브라우저에서 붙여넣기하므로, 서식이 Notion 네이티브 포맷으로 완벽하게 변환됩니다.

## 지원 포맷

- 제목 (H1~H6)
- 텍스트 서식 (굵게, 기울임, 취소선, 인라인 코드)
- 링크
- 순서 없는/있는 목록 (중첩 지원)
- 체크리스트
- 코드 블록 (언어별 구문 강조)
- 테이블 (정렬 지원)
- 인용문
- 구분선
- 이미지 (URL 기반)

## 사전 준비

### 1. Node.js 설치

Node.js 18+ 필요.

### 2. 의존성 설치

```bash
npm install
```

### 3. Chrome CDP 모드로 실행

일반 Chrome과 충돌하지 않도록 별도 프로필로 실행합니다:

```powershell
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--user-data-dir=C:\tmp\chrome-cdp','--no-first-run'
```

### 4. Notion 로그인

CDP 모드로 열린 Chrome에서 [notion.so](https://www.notion.so)에 로그인한 후, 대상 페이지를 열어둡니다.

## 사용법

```bash
node src/index.js <md-file> [notion-url] [options]
```

### 인자

| 인자 | 설명 |
|------|------|
| `md-file` | Markdown 파일 경로 (필수) |
| `notion-url` | Notion 페이지 URL (선택, 기본: config에 설정된 URL) |

### 옵션

| 옵션 | 설명 |
|------|------|
| `--title "제목"` | 페이지 제목 설정 |
| `--clear` | 기존 콘텐츠를 모두 지우고 새로 붙여넣기 |
| `--verify` | 붙여넣기 후 구조 검증 실행 (기본값) |
| `--no-verify` | 구조 검증 건너뛰기 |
| `--property "Key=Value"` | 데이터베이스 속성 설정 (반복 가능) |

### 예시

```bash
# 기본 사용
node src/index.js README.md

# 제목 설정 + 기존 내용 삭제
node src/index.js doc.md --clear --title "프로젝트 문서"

# 특정 Notion 페이지에 붙여넣기
node src/index.js report.md https://www.notion.so/page/abc123 --title "보고서"

# 속성 설정 (데이터베이스 페이지)
node src/index.js notes.md --property "상태=완료" --property "태그=개발"

# 검증 없이 빠르게 붙여넣기
node src/index.js draft.md --clear --no-verify
```

## 동작 과정

1. Markdown 파일을 `marked`로 HTML 변환
2. `</table>` 뒤에 구분자 삽입 (테이블 병합 방지)
3. HTML을 청크로 분할 (80블록 / 400KB 단위)
4. Chrome CDP로 연결하여 Notion 탭 탐색
5. `--clear` 시 3단계 콘텐츠 삭제 (텍스트 → 테이블 → 잔여 텍스트)
6. 제목 설정 (마우스 클릭 + 키보드 입력)
7. 클립보드 API + Ctrl+V로 HTML 붙여넣기
8. 구조 검증: MD 토큰 구조 vs Notion DOM 비교

## 설정

`src/config.js`에서 수정:

```javascript
{
  chrome: {
    cdpPort: 9222,           // Chrome CDP 포트
  },
  notion: {
    defaultUrl: '...',       // 기본 Notion 페이지 URL
  },
  chunking: {
    maxBlocks: 80,           // 청크당 최대 블록 수
    maxBytes: 400 * 1024,    // 청크당 최대 바이트
  },
}
```

## 구조 검증

붙여넣기 후 자동으로 원본 Markdown 구조와 Notion DOM을 비교합니다:

```
[verify] 기대 블록: 61개, 실제 블록: 61개
[verify] PASS - 구조 일치
```

검증 규칙:
- `table-merge`: 테이블 밖 블록이 테이블 안으로 병합됨
- `heading-lost`: 제목이 다른 타입으로 변환됨
- `code-lost`: 코드 블록이 사라짐
- `quote-flattened`: 인용문이 일반 텍스트로 변환됨

## 제한사항

- Chrome이 CDP 모드(`--remote-debugging-port`)로 실행되어야 함
- Notion에 로그인된 상태여야 함
- 이미지는 URL 참조만 지원 (로컬 파일 업로드 미지원)
- 매우 큰 문서(수백 블록)는 여러 청크로 분할되어 순차 붙여넣기됨
