# CDP 테스트 문서

이 문서는 Markdown → Notion 변환을 테스트하기 위한 복잡한 예제입니다.

## 텍스트 서식

일반 텍스트와 **굵은 글씨**, *기울임*, ~~취소선~~, `인라인 코드`를 포함합니다.

**굵은 *기울임* 혼합**도 가능합니다.

링크 테스트: [Google](https://www.google.com), [Notion](https://www.notion.so)

## 목록

### 순서 없는 목록

- 항목 1
- 항목 2
  - 중첩 항목 2-1
  - 중첩 항목 2-2
    - 깊은 중첩 2-2-1
- 항목 3

### 순서 있는 목록

1. 첫 번째
2. 두 번째
   1. 중첩 2-1
   2. 중첩 2-2
3. 세 번째

### 체크리스트

- [x] 완료된 작업
- [ ] 미완료 작업
- [x] 또 다른 완료 작업
- [ ] 해야 할 일

## 코드 블록

### JavaScript

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(`Result: ${result}`); // 55
```

### Python

```python
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))
```

### Bash

```bash
#!/bin/bash
for i in {1..5}; do
  echo "Iteration $i"
done
```

## 테이블

| 이름 | 언어 | 용도 | 인기도 |
|------|------|------|--------|
| React | JavaScript | UI 라이브러리 | ★★★★★ |
| Django | Python | 웹 프레임워크 | ★★★★☆ |
| Spring | Java | 엔터프라이즈 | ★★★★☆ |
| Rails | Ruby | 웹 프레임워크 | ★★★☆☆ |

### 정렬된 테이블

| 항목 | 수량 | 가격 |
|:-----|:----:|-----:|
| 사과 | 10 | ₩3,000 |
| 바나나 | 5 | ₩2,500 |
| 체리 | 20 | ₩8,000 |

## 인용문

> 이것은 인용문입니다.
> 여러 줄로 구성될 수 있습니다.

> "The only way to do great work is to love what you do."
> — Steve Jobs

## 구분선

위의 내용

---

아래의 내용

## 이미지

### 단일 이미지

![Octocat](https://github.githubassets.com/images/icons/emoji/octocat.png)

### 캡션이 있는 이미지

![Node.js 로고](https://nodejs.org/static/logos/nodejsLight.svg)

*Node.js 공식 로고*

### 링크가 포함된 이미지

[![GitHub](https://github.githubassets.com/favicons/favicon.svg)](https://github.com)

### 이미지 사이에 텍스트

첫 번째 이미지:

![Image 1](https://picsum.photos/400/200)

위 이미지와 아래 이미지 사이의 설명 텍스트입니다.

![Image 2](https://picsum.photos/400/150)

## 복합 콘텐츠

### 코드와 설명이 혼합된 섹션

아래 함수는 배열에서 중복을 제거합니다:

```javascript
const unique = (arr) => [...new Set(arr)];
console.log(unique([1, 2, 2, 3, 3, 4])); // [1, 2, 3, 4]
```

이 방법은 `Set` 자료구조를 활용하여 **O(n)** 시간복잡도로 동작합니다.

### 중첩 목록과 서식

1. **프론트엔드** 기술
   - React / Vue / Angular
   - CSS 프레임워크
     - Tailwind CSS
     - Bootstrap
2. **백엔드** 기술
   - Node.js / Python / Java
   - 데이터베이스
     - PostgreSQL
     - MongoDB

---

*문서 끝*
