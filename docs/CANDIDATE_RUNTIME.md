# Candidate Runtime — Phase 8

Phase 8 tải immutable candidate snapshot của một `TestVersion` đã publish và
dùng full audio làm đồng hồ chuẩn cho Listening.

## API

Tất cả endpoint yêu cầu JWT của user.

```http
GET  /tests
GET  /tests/:testId/runtime
POST /tests/:testId/runtime
```

`GET /tests` chỉ trả các test có current version ở trạng thái `PUBLISHED`.

`GET /tests/:testId/runtime` trả manifest:

```json
{
  "testVersion": {
    "id": "version-id",
    "version": 1,
    "schemaVersion": 1,
    "candidatePayloadHash": "sha256"
  },
  "candidateUrl": "https://cdn.example/tests/id/v1/candidate.json",
  "serverNow": "2026-07-14T05:00:00.000Z"
}
```

Client tải JSON trực tiếp từ CDN, kiểm tra SHA-256, validate schema version rồi
cache snapshot theo version/hash trong IndexedDB.

`POST /tests/:testId/runtime` không có token sẽ tạo một runtime token có chữ ký.
Gửi lại token khi reload để server trả:

```text
expectedAudioPositionMs = serverNow - listeningStartedAt
```

Runtime token chỉ là cơ chế resume tạm của Phase 8. Phase 9 sẽ thay bằng
`Attempt` lưu trong PostgreSQL.

## Listening runtime

- Chỉ phát `test.fullListeningAudio`; không phát chồng Direction audio.
- Không render audio controls, không cho tua lại.
- `audio.currentTime` là nguồn thời gian chuẩn.
- Derive lại event khi `playing`, `waiting`, `timeupdate`, `seeking`,
  `visibilitychange` và bằng `requestAnimationFrame` khi tab visible.
- `DIRECTION` hiện direction text; `QUESTION` hiện một câu;
  `QUESTION_GROUP` hiện group; `LISTENING_END` chuyển Reading.
- Reload phải gọi server lấy position mới, chờ `loadedmetadata`, seek rồi mới
  play.

## Reading runtime

- Part 5: một câu mỗi trang.
- Part 6–7: một question group mỗi trang.
- Passage và Questions là hai panel cuộn riêng.
- Flag, danh mục câu và nút tới/lui chỉ có ở Reading.
- Answer/flag hiện mới là state runtime. Persist, autosave, submit và scoring là
  Phase 9.

## R2/CDN

Domain `R2_PUBLIC_URL` phải cho phép client origin đọc `candidate.json` và
media. Cấu hình CORS tối thiểu cho production domain và localhost development:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.example"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Candidate snapshot là public nhưng không chứa đáp án, explanation hay
transcript. Answer key và review snapshot vẫn được mã hóa riêng.
