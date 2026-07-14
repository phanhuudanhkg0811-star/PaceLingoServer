# Grading and Basic Time Analytics

Kết quả được tạo một lần khi Attempt chuyển khỏi `IN_PROGRESS` và được lưu trong
`Attempt.resultJson`. Snapshot này giữ nguyên raw score, scaled score và analytics
của lượt thi, kể cả khi draft hoặc bảng quy đổi của đề được chỉnh sửa về sau.

## Chấm điểm

- Answer key mã hóa của đúng `TestVersion` là nguồn đáp án chuẩn.
- Candidate payload không chứa đáp án đúng.
- Backend phân biệt câu đúng, sai và bỏ trống.
- Kết quả gồm tổng số đúng, Listening, Reading và Part 1–7.
- `UserAnswer.isCorrect` chỉ được điền sau khi nộp bài để chuẩn bị cho Review.

## Quy đổi điểm

`ScoreConversionProfile` được chụp vào answer-key snapshot lúc publish. Scaled
score chỉ được trả khi phần thi tương ứng có đủ 100 câu và mapping có đúng raw
score cần tra. Mini test hoặc đề thiếu mapping chỉ hiển thị raw score.

Hệ thống không nội suy bằng phần trăm. Điểm quy đổi luôn được ghi là tham khảo,
không phải chứng chỉ TOEIC chính thức.

## Time analytics

Frontend chỉ cộng `activeTimeMs` khi tab visible và câu hỏi đang active. Backend
tổng hợp theo Part:

- tổng thời gian và trung bình mỗi câu;
- số câu vượt ngưỡng;
- lượt quay lại và số câu được quay lại;
- số câu cuối liên tiếp bị bỏ trống;
- nhanh/chậm kết hợp đúng/sai.

Ngưỡng MVP: Part 1 là 30 giây, Part 2 là 20 giây, Part 3–4 là 45 giây,
Part 5 là 30 giây, Part 6 là 60 giây và Part 7 là 75 giây. Đây là rule sản phẩm,
không phải benchmark độ khó; có thể hiệu chỉnh sau khi có dữ liệu thật.
