# Review, History and Retry Quiz

Phase 12 biến kết quả của Attempt thành dữ liệu học lại nhưng vẫn giữ nguyên tắc
không lộ đáp án trước khi nộp bài.

## API

```http
GET  /attempts
GET  /attempts/:id/review
POST /attempts/:id/retry
GET  /practice-sessions/:id
POST /practice-sessions/:id/submit
```

Tất cả endpoint yêu cầu JWT và kiểm tra ownership theo `userId`.

## Review snapshot

Backend chỉ mở review khi Attempt không còn `IN_PROGRESS`. Dữ liệu được ghép từ:

- `candidate.json`: câu hỏi, lựa chọn, passage, ảnh và audio group;
- `answer-key.enc`: đáp án đúng;
- `review.enc`: giải thích, transcript, topic, vocabulary và audio segment;
- PostgreSQL: đáp án, flag và timing của người dùng.

Ba snapshot đều thuộc đúng `TestVersion` của Attempt và được kiểm tra SHA-256
trước khi trả về. Việc publish version mới không làm thay đổi review cũ.

## Pinpoint audio

Nếu câu có `QuestionAudioSegment`, client seek đến `startMs`, phát đến `endMs`
và có thể lặp đoạn. Nếu không có segment, audio stimulus của group vẫn được hiển
thị với player đầy đủ trong Review.

## Retry quiz

Retry chỉ lấy các câu đã trả lời sai, đổi thứ tự câu và tạo `PracticeSession`
riêng. Trong lúc làm, API không trả `isCorrect`, `correctOptionId` hoặc
`explanationHtml`. Những dữ liệu này chỉ xuất hiện sau `submit`.

MVP giữ nguyên thứ tự A/B/C/D, cho phép bỏ trống và lưu lựa chọn cùng thời điểm
hoàn thành để so sánh với Attempt nguồn.
