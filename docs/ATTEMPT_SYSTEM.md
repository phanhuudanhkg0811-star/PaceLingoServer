# Attempt System — Phase 9

Phase 9 thay runtime token tạm của Phase 8 bằng `Attempt` được lưu trong PostgreSQL.
Server là nguồn thời gian chính; reload trang không tạo lại deadline.

## API

Tất cả endpoint yêu cầu JWT của user.

```http
POST  /tests/:testId/attempts
GET   /attempts/:attemptId
PATCH /attempts/:attemptId/answers
PATCH /attempts/:attemptId/progress
POST  /attempts/:attemptId/submit
```

`POST /tests/:testId/attempts` tạo Attempt trên published `TestVersion`, hoặc trả
lại Attempt `IN_PROGRESS` của chính user. Response có `serverNow`,
`listeningEndsAt`, `readingEndsAt`, `expiresAt`, answers và timings để resume.

## Đồng hồ

- Full test: Listening kết thúc theo duration của full audio (fallback: timeline),
  sau đó Reading dùng duration section hoặc phần thời gian còn lại của test.
- Reading-only mini/part test: toàn bộ `durationMinutes` dành cho Reading.
- Client tính countdown bằng deadline cộng offset `serverNow - Date.now()`.
- Backend từ chối sửa khi hết hạn và chuyển bài sang `AUTO_SUBMITTED`.

## Autosave và offline ngắn

Mỗi thay đổi answer/flag được cập nhật UI và IndexedDB ngay. Client giữ pending
queue rồi flush khi:

- đủ 5 answer;
- mỗi 4 giây;
- tab hidden;
- trình duyệt online lại;
- trước khi submit/rời trang.

Mỗi answer và timing có `clientSequence`. Backend chỉ ghi sequence mới hơn, nên
batch cũ đến trễ không ghi đè state mới. PostgreSQL vẫn là dữ liệu chính thức.

Timing là tổng `activeTimeMs` theo câu, dừng khi tab hidden và được gửi chung với
answer batch.

## Submit và chấm điểm

Submit flush pending queue trước, sau đó server khóa Attempt và chấm bài. Server:

1. tải answer key đã mã hóa từ R2;
2. giải mã bằng secret server và kiểm tra SHA-256 của plaintext;
3. tính số câu đúng Listening/Reading;
4. áp dụng `ScoreConversionProfile` nếu test đã gắn profile;
5. lưu trạng thái `SUBMITTED` hoặc `AUTO_SUBMITTED`.

Nếu chưa có score profile, kết quả vẫn trả số câu đúng (raw score), không tự bịa
thang điểm TOEIC.
