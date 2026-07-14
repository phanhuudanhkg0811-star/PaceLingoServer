# Full Test Runner

Candidate runner vận hành ở chế độ `MOCK`: mô phỏng một lượt thi có thời gian và
không trả đáp án đúng trong lúc làm bài.

## Trước khi thi

Màn hình chuẩn bị hiển thị tên đề, số câu, thời lượng, loại bài và hướng dẫn.
Audio test dùng Web Audio API phát tone stereo từ trái sang phải để kiểm tra tai
nghe mà không làm thay đổi vị trí full Listening audio.

## Listening

- Full audio tự phát sau thao tác bắt đầu của user.
- Không render audio controls, không pause, tua hoặc nghe lại.
- UI derive từ `audio.currentTime` và immutable timeline.
- Reload lấy lại Attempt và khôi phục vị trí bằng thời gian server.
- `Space` bị chặn trong mock Listening.
- `A/B/C/D` hoặc `1/2/3/4` chọn đáp án đang hiển thị.

## Reading

- Part 5 là một câu mỗi trang; Part 6–7 là một group mỗi trang.
- Passage và questions có vùng cuộn độc lập.
- `A/B/C/D` hoặc `1/2/3/4`: chọn đáp án của câu active.
- `ArrowLeft` / `ArrowRight`: chuyển trang trước/sau.
- `F`: flag hoặc bỏ flag câu active.
- Shortcut không chạy khi focus đang ở input, textarea, select, button, link
  hoặc contenteditable; cũng không chạy khi question modal đang mở.

## Nộp bài

Nút Submit mở màn hình xác nhận, hiển thị số câu chưa trả lời và navigator theo
Part. Nộp bài khóa UI, flush pending autosave rồi gọi Attempt submit. Hết thời
gian tự nộp theo deadline server.

## Fullscreen

Nút fullscreen dùng Browser Fullscreen API. Trạng thái đồng bộ qua sự kiện
`fullscreenchange`; user vẫn có thể nhấn `Escape` để thoát theo hành vi chuẩn của
trình duyệt.
