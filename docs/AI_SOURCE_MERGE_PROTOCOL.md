# AI source merge protocol — TOEIC to PaceLingo

Tài liệu này khóa cách AI ghép **đề**, **listening transcript**, **answer key** và
**lời giải**. Dùng cùng `AI_PDF_TO_IMPORT_PROMPT.md`, `IMPORT_SCHEMA_V1.md` và
`AI_PASSAGE_AND_MEDIA_GUIDE.md`.

Không yêu cầu AI xử lý cả 200 câu từ nhiều file hỗn hợp trong một lượt. Mỗi lượt
chỉ xử lý một phạm vi nhỏ, sau đó chạy audit trước khi ghép các fragment JSON.

## Vai trò cố định của từng nguồn

| Nguồn            | Được phép ghi vào                                                      | Tuyệt đối không được chép sang         |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| PDF đề           | `promptHtml`, `options[].contentHtml`, passage/stimuli                 | `correctOption`, `explanationHtml`     |
| Listening script | `transcriptHtml`; câu/response tiếng Anh của Part 1–2 khi PDF không in | passage Reading, đáp án đúng, bản dịch |
| Answer key       | chỉ `correctOption`                                                    | option text, transcript, explanation   |
| File lời giải    | chỉ `explanationHtml`, map theo số câu                                 | prompt, option, transcript, stimulus   |

AI phải tạo index theo **question number**. Không được nối nguyên văn các block
từ nhiều file, không được lấy “dòng kế tiếp” làm dữ liệu cho câu hiện tại và
không được nhét phần dư vào option cuối.

## Ranh giới field — zero tolerance

- `promptHtml` chỉ chứa question stem. Không chép số câu, range của group hay
  nhãn `Question`: câu 44 phải là `Where does the woman work?`, không phải
  `44–46 44. Where does the woman work?`.
- `options[i].contentHtml` chỉ chứa nội dung của đúng một option. Không chép lại
  `(A)/(B)/(C)/(D)` vì label đã nằm ở field `label`.
- Option cuối tuyệt đối không được chứa câu kế tiếp. Ví dụ
  `At a real estate agency 45. What does...` là dữ liệu hỏng và phải dừng output.
- Mỗi object câu hỏi phải được đóng hoàn chỉnh trước khi đọc câu tiếp theo.
- Part 1 luôn có chính xác bốn option, labels lần lượt `A`, `B`, `C`, `D`, không
  thiếu D và không dùng cấu trúc ba option của Part 2.
- Part 2 luôn có chính xác ba option, labels lần lượt `A`, `B`, `C`.

## Hợp đồng lời giải

Nếu file key/lời giải có mục giải thích cho một số câu, AI bắt buộc:

1. lập index `questionNumber -> explanation source block`;
2. chép/biên soạn đúng block đó vào `explanationHtml` của cùng số câu;
3. không để trống `explanationHtml` cho câu đã tìm thấy lời giải;
4. không đưa lời giải, bản dịch hay đáp án sang prompt/option/transcript;
5. báo rõ danh sách số câu trong phạm vi không có lời giải ở nguồn.

Trước khi xuất JSON, AI phải báo trong manifest hai con số
`explanationsFound` và `explanationsInserted`; chúng phải bằng nhau. Nếu không
bằng nhau thì không được xuất JSON.

## Chính sách ngôn ngữ

Các field thí sinh nhìn/nghe trong lúc thi chỉ chứa tiếng Anh gốc:

- `promptHtml`;
- `options[].contentHtml`;
- `questionGroup.transcriptHtml`;
- `stimuli[].contentHtml`.

Tiếng Việt chỉ được xuất hiện trong `explanationHtml` khi file lời giải có tiếng
Việt. Không đưa bản dịch tiếng Việt vào transcript hoặc option. Không đưa các
nhãn `Đáp án`, `Dịch nghĩa`, `Giải thích`, `STT`, header/footer hay số trang của
PDF vào bất kỳ field nội dung nào.

## Dữ liệu lưu và nội dung thí sinh nhìn thấy

Không được nhầm hai lớp này:

| Part     | Import draft/private review lưu                               | Candidate lúc đang thi hiển thị                               |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Part 1   | bốn câu mô tả tiếng Anh trong options/transcript              | ảnh và nút `(A) (B) (C) (D)`; không hiện câu mô tả            |
| Part 2   | câu hỏi đọc và ba response tiếng Anh trong transcript/options | chỉ số câu và nút `(A) (B) (C)`; không hiện question/response |
| Part 3–4 | transcript private; prompt/options in từ đề                   | prompt và nội dung lựa chọn; không hiện transcript            |

AI vẫn phải điền text tiếng Anh của option Part 1–2 vào **import draft** để hệ
thống có dữ liệu review sau khi nộp. Khi publish, PaceLingo tự loại text Part
1–2 khỏi candidate snapshot public và chỉ giữ `id`, `label`, `order`. Không được
tự xóa option text trong file import và cũng không được yêu cầu UI hiển thị text
đó trong lúc thi.

## Mapping bắt buộc theo Part

### Part 1

- Một group chứa đúng một câu và một IMAGE placeholder.
- `promptHtml`: một nhãn trung tính, ví dụ `<p>Question</p>`; candidate UI chỉ
  hiện số câu.
- Bốn option A–D: chỉ bốn câu mô tả tiếng Anh từ listening script.
- `transcriptHtml`: chỉ bốn câu mô tả tiếng Anh, có thể dùng `<p>(A) ...</p>`.
- Answer key chỉ đi vào `correctOption`.
- Bản dịch/lời giải chỉ đi vào `explanationHtml`.

### Part 2

- Một group chứa đúng một câu và ba option A–C.
- `promptHtml`: một nhãn trung tính, ví dụ `<p>Question</p>`; candidate UI không
  hiện câu hỏi được đọc.
- `transcriptHtml`: câu hỏi được đọc và ba response tiếng Anh.
- `options`: chỉ ba response tiếng Anh, không chứa câu hỏi, đáp án hoặc bản dịch.

### Part 3–4

- Một conversation/talk là một group, thường có đúng ba câu.
- `transcriptHtml`: chỉ hội thoại/bài nói tiếng Anh; không chứa câu hỏi, option,
  answer key hay bản dịch.
- `promptHtml` và options lấy từ PDF đề, map đúng số câu.
- Graphic đi kèm phải là IMAGE placeholder hoặc HTML stimulus phù hợp.

### Part 5–7

- Prompt, option và passage chỉ lấy từ PDF đề.
- Answer key chỉ đặt `correctOption` theo số câu.
- Lời giải đặt `explanationHtml` theo đúng số câu.
- Part 6 giữ bốn câu trong cùng passage group.
- Part 7 giữ toàn bộ single/double/triple passage trong cùng group.

## Quy trình hai lượt

### Lượt 1 — lập bảng đối chiếu, chưa xuất JSON

Yêu cầu AI trả một bảng cho phạm vi nhỏ:

```text
questionNumber | source question found | transcript found | answer found |
explanation found | group range | uncertainty
```

Nếu có số câu thiếu, trùng, lệch group hoặc không đọc được, dừng và sửa nguồn.
Không cho AI đoán.

### Lượt 2 — xuất JSON

Chỉ sau khi bảng đối chiếu đúng mới yêu cầu AI xuất JSON cho đúng phạm vi đó.
Kích thước mỗi lượt:

- Part 1: tối đa 6 câu;
- Part 2: 5–10 câu;
- Part 3–4: 1–3 conversation/talk;
- Part 5: 10–20 câu;
- Part 6: 1–3 passage hoàn chỉnh;
- Part 7: 1–3 group hoàn chỉnh.

## Prompt lập bảng đối chiếu

```text
Read the supplied TOEIC question PDF, listening script, answer key, and
explanation file as four separate sources. Follow AI_SOURCE_MERGE_PROTOCOL.md.

Do not produce PaceLingo JSON yet. Build a source manifest only for questions
<QUESTION RANGE> with these columns:
questionNumber | questionSource | transcriptSource | answer | explanationSource
| groupRange | uncertainty

Match exclusively by the printed question number, never by physical adjacency.
Report missing, duplicate, ambiguous, or shifted entries. Do not infer them.
```

## Prompt xuất JSON sau khi đối chiếu

```text
Convert only questions <QUESTION RANGE> to PaceLingo schemaVersion 1 JSON.
Follow AI_PDF_TO_IMPORT_PROMPT.md, IMPORT_SCHEMA_V1.md,
AI_PASSAGE_AND_MEDIA_GUIDE.md, and AI_SOURCE_MERGE_PROTOCOL.md as strict
contracts.

SOURCE OWNERSHIP
- Question PDF -> English prompts, English options, passages and visual placeholders.
- Listening script -> English transcript only; Part 1/2 English spoken choices.
- Answer key -> correctOption only, matched by question number.
- Explanation file -> explanationHtml only, matched by question number.

LANGUAGE FIREWALL
- promptHtml, option contentHtml, transcriptHtml and stimulus contentHtml must
  contain English source content only.
- Vietnamese is allowed only in explanationHtml.
- Never copy labels such as Đáp án, Dịch nghĩa, Giải thích or STT, page headers,
  page numbers, answer letters, or adjacent source blocks into content fields.

ATOMIC QUESTION RULE
Finish and validate one question object before starting the next. Never append
unconsumed source text to the final option. If any source cannot be matched by
question number, stop and report the unmatched number instead of guessing.

FINAL AUDIT
1. Output contains exactly the requested question numbers, once each.
2. Every correctOption exists among that question's labels.
3. Every supplied explanation is present on the same numbered question.
4. No Vietnamese occurs outside explanationHtml.
5. No transcript contains answer keys, translations, explanations or printed
   question/options for Part 3–4.
6. No option contains another question number, PDF header, Part heading or raw
   source block.
7. Return one strict JSON object only, without Markdown or commentary.
8. Part 1 has exactly labels A/B/C/D; Part 2 has exactly A/B/C.
9. No prompt starts with a question number or group range.
10. explanationsInserted equals explanationsFound from the source manifest.
```

## Ghép fragment và audit trước khi import

Sau khi từng fragment đã sạch, ghép chúng bằng code thay vì yêu cầu AI đọc và
viết lại toàn bộ nội dung:

```powershell
npm run merge:imports --workspace pace-lingo-server -- --out "merged.json" "part1-a.json" "part1-b.json" "part2-a.json"
```

Lệnh ghép sẽ sắp xếp Part/group/câu hỏi, tạo lại `order` và dừng nếu số câu hoặc
`externalId` của group bị trùng.

Sau đó chạy audit trên file đã ghép:

```powershell
npm run audit:import --workspace pace-lingo-server -- "C:\path\to\file.json"
```

Khi phạm vi nguồn chắc chắn có lời giải cho mọi câu, bật chế độ bắt buộc:

```powershell
npm run audit:import --workspace pace-lingo-server -- "C:\path\to\file.json" --require-explanations
```

Không import/publish khi audit còn `ERROR`. Warning thiếu explanation hoặc
transcript phải được đối chiếu với nguồn trước khi bỏ qua.
