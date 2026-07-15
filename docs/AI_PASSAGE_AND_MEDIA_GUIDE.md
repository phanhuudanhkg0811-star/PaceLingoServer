# Hướng dẫn AI dựng passage HTML và đánh dấu media

Tài liệu này là hợp đồng chuyển nội dung từ PDF đề TOEIC sang
`schemaVersion: 1` của PaceLingo. Đưa cho AI tài liệu này cùng
`IMPORT_SCHEMA_V1.md`, file PDF và answer key.

Mục tiêu là giữ nguyên nội dung đề. AI không được dịch, viết lại, rút gọn,
đoán chữ hoặc biến một tài liệu có thể dựng bằng HTML thành ảnh chỉ để làm
nhanh.

## Quy tắc quyết định bắt buộc

### Phải dùng `HTML`

Dùng HTML khi thông tin cần làm bài chủ yếu là chữ và có thể đọc chắc chắn:

- email, memo, letter, notice, announcement và article;
- tin nhắn, lịch hẹn và chuỗi hội thoại bằng chữ;
- bảng, lịch trình, bảng giá, danh sách và biểu mẫu đơn giản;
- passage Part 6, bao gồm đúng vị trí các ô trống;
- tài liệu Part 7 mà thứ tự đọc và quan hệ hàng/cột có thể giữ bằng semantic
  HTML.

> **Quy tắc chống lạm dụng ảnh:** cụm từ “Look at the graphic” trong câu hỏi
> không tự động có nghĩa stimulus phải là IMAGE. Nếu graphic thực chất chỉ là
> bảng, lịch trình, danh sách, website outline, bảng tenant/floor hoặc bảng số
> liệu có hàng/cột rõ ràng thì bắt buộc dựng bằng semantic HTML. Quy tắc này áp
> dụng cả Part 3 và Part 4. Chỉ giữ IMAGE khi vị trí không gian, đường đi, hình
> dạng, mũi tên hoặc quan hệ trực quan là dữ kiện cần để trả lời.

AI phải chép đủ từng chữ nhìn thấy được. Không được bỏ sender, recipient,
subject, ngày tháng, tiêu đề, chú thích, đơn vị, giá, header bảng, footer hoặc
đoạn chữ nhỏ nếu chúng có thể ảnh hưởng đáp án.

### Phải dùng placeholder `IMAGE`

Dùng IMAGE chưa gắn media khi ý nghĩa phụ thuộc vào hình ảnh hoặc không thể
dựng trung thực bằng HTML:

- ảnh Part 1;
- sơ đồ, bản đồ, floor plan, biểu đồ, infographic;
- hình có mũi tên, icon, ký hiệu hoặc vị trí tương đối mang ý nghĩa;
- quảng cáo, menu, invoice hay form có bố cục đồ họa phức tạp;
- vùng OCR không chắc chắn và việc đoán sai có thể đổi đáp án;
- logo/hình sản phẩm khi chính hình đó là dữ kiện của câu hỏi.

Không được tạo URL, đường dẫn local, base64 hoặc `mediaAssetId` giả.

### Nội dung hỗn hợp

Nếu tài liệu gồm phần chữ rõ ràng và một sơ đồ riêng, hãy tách thành các
stimulus theo đúng thứ tự xuất hiện:

1. HTML trước hình;
2. IMAGE placeholder cho sơ đồ;
3. HTML sau hình, nếu có.

Nếu tách rời làm mất quan hệ không gian cần để trả lời, dùng một IMAGE
placeholder cho toàn bộ tài liệu thay vì phát minh HTML.

## Chuẩn HTML

`contentHtml` phải là một HTML fragment, không phải một trang HTML hoàn chỉnh.

Được dùng:

- `article`, `section`, `header`, `footer`, `h1`–`h4`;
- `p`, `br`, `strong`, `em`, `small`;
- `ul`, `ol`, `li`, `dl`, `dt`, `dd`;
- `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`;
- `blockquote`, `address`, `time`, `span`, `hr`.

Không được dùng:

- `script`, `style`, `iframe`, form input hoặc event handler;
- CSS, JavaScript hoặc tài nguyên bên ngoài;
- ảnh nhúng, data URL hay link tự bịa;
- Markdown bên trong `contentHtml`.

Quy tắc độ trung thực:

- giữ nguyên chính tả, viết hoa, dấu câu và xuống đoạn;
- giữ đúng thứ tự tài liệu và thứ tự đọc;
- bảng phải giữ nguyên số hàng/cột, header và ô gộp bằng `rowspan`/`colspan`;
- email phải giữ To, From, Date, Subject và signature nếu có;
- Part 6 phải giữ vị trí blank bằng đúng số câu, ví dụ
  `<strong>[131]</strong>`;
- ký tự HTML trong nội dung phải được escape;
- không thêm thông tin không xuất hiện trong PDF.

## Chuẩn placeholder media

Mọi media chưa gắn phải có `altText` theo một định dạng thống nhất:

```text
[MEDIA_REQUIRED] type=<TYPE>; page=<PAGE>; questions=<NUMBERS>; crop=<REGION>; preserve=<DETAILS>; reason=<WHY_HTML_IS_UNSAFE>
```

`TYPE` dùng một trong:

- `PHOTO`
- `DIAGRAM`
- `MAP`
- `CHART`
- `INFOGRAPHIC`
- `COMPLEX_TABLE`
- `ADVERTISEMENT`
- `FORM`
- `PRODUCT_IMAGE`
- `OTHER`

Ví dụ:

```json
{
  "type": "IMAGE",
  "altText": "[MEDIA_REQUIRED] type=DIAGRAM; page=18; questions=153-154; crop=office floor plan at the bottom half; preserve=room labels, arrows and entrance positions; reason=spatial relationships determine the answers",
  "order": 0
}
```

Marker phải bắt đầu chính xác bằng `[MEDIA_REQUIRED]`. `altText` phải dưới 500
ký tự, đủ để admin tìm đúng trang PDF, crop đúng vùng và biết hình phục vụ câu
nào.

## Ví dụ HTML

### Email

```json
{
  "type": "HTML",
  "contentHtml": "<article><header><p><strong>To:</strong> All Staff</p><p><strong>From:</strong> Mina Cole</p><p><strong>Date:</strong> June 12</p><p><strong>Subject:</strong> Office Renovation</p></header><hr><p>The second floor will be closed on Friday.</p><p>Please use the meeting rooms on the first floor.</p><footer><p>Thank you,<br>Mina</p></footer></article>",
  "order": 0
}
```

### Bảng thuần chữ

```json
{
  "type": "HTML",
  "contentHtml": "<section><h2>Train Schedule</h2><table><thead><tr><th scope=\"col\">Destination</th><th scope=\"col\">Departure</th><th scope=\"col\">Platform</th></tr></thead><tbody><tr><th scope=\"row\">Milton</th><td>8:15 A.M.</td><td>4</td></tr><tr><th scope=\"row\">Greenville</th><td>9:30 A.M.</td><td>7</td></tr></tbody></table></section>",
  "order": 0
}
```

### Part 6 có blank

```json
{
  "type": "HTML",
  "contentHtml": "<article><p>Thank you for registering for the conference.</p><p>Your badge <strong>[131]</strong> at the front desk when you arrive.</p><p><strong>[132]</strong></p><p>Contact us if you have any questions.</p></article>",
  "order": 0
}
```

### Part 7 double passage

Mỗi tài liệu là một stimulus riêng trong cùng `questionGroup`, không gộp hai
tài liệu vào một chuỗi HTML:

```json
"stimuli": [
  {
    "type": "HTML",
    "contentHtml": "<article><h2>Customer Email</h2><p>...</p></article>",
    "order": 0
  },
  {
    "type": "HTML",
    "contentHtml": "<article><h2>Reply</h2><p>...</p></article>",
    "order": 1
  }
]
```

Quy tắc này áp dụng tương tự cho triple passage: phải có đúng ba stimulus với
`order` lần lượt là `0`, `1`, `2`. Mỗi stimulus HTML phải có đúng một phần tử
gốc `<article>`. Không đặt nhiều email/article/form/review khác nhau vào chung
một `<article>`, kể cả khi chúng xuất hiện trên cùng một trang PDF. Việc gộp
nhiều tài liệu vào một stimulus bị xem là lỗi cấu trúc import.

## OCR không chắc chắn

- Một mảnh nhỏ không đọc được nhưng không làm đổi cấu trúc: giữ đúng vị trí
  bằng `[OCR_UNCLEAR: mô tả ngắn]`.
- Nếu chữ không đọc được có thể ảnh hưởng đáp án: dùng IMAGE placeholder cho
  vùng hoặc toàn tài liệu và ghi lý do.
- Không bao giờ tự hoàn thành câu dựa trên ngữ cảnh.

## Prompt giao việc cho AI

Sao chép prompt này sau khi đã đính kèm PDF, answer key,
`IMPORT_SCHEMA_V1.md` và tài liệu hiện tại:

```text
Convert the specified TOEIC PDF pages to PaceLingo schemaVersion 1 JSON.

Follow AI_PASSAGE_AND_MEDIA_GUIDE.md as a strict contract.

HARD REQUIREMENTS
1. Transcribe every readable text-only email, memo, message, article, notice,
   schedule, price list, simple form, and table into faithful semantic HTML.
2. Preserve every visible field, heading, row, column, paragraph, date, price,
   label, signature, footnote, and Part 6 blank. Do not summarize, translate,
   rewrite, correct, or invent text.
3. Use IMAGE only when visual/spatial information cannot be represented safely
   in HTML or OCR uncertainty could affect an answer.
4. Every unresolved image must omit mediaAssetId and use this exact altText
   contract:
   [MEDIA_REQUIRED] type=<TYPE>; page=<PAGE>; questions=<NUMBERS>;
   crop=<REGION>; preserve=<DETAILS>; reason=<WHY_HTML_IS_UNSAFE>
5. Keep each Part 6 passage with its four questions. Keep each Part 7
   single/double/triple-passage set in one questionGroup. Multiple documents
   must be separate ordered stimuli.
6. Return one strict JSON object only. Do not return Markdown or commentary.

Before returning JSON, audit every source document and verify that none of its
readable text was silently omitted and every non-convertible visual has a
MEDIA_REQUIRED placeholder.

Convert scope: <PART AND PDF PAGES>
Answer key: <LOCATION OR NOT PROVIDED>
```

## Checklist trước khi import

- Mỗi group Part 6 có đúng một passage và bốn câu hỏi.
- Mỗi group Part 7 có một, hai hoặc ba stimulus đúng với nguồn.
- Mỗi tài liệu của double/triple passage là một stimulus và một `<article>`
  độc lập; không có một stimulus chứa nhiều tài liệu ghép chung.
- Không có email/table/passage thuần chữ bị thay bằng placeholder vô lý.
- Bảng/lịch trình thuần chữ trong Part 3–4 đã được dựng bằng `<table>`, kể cả
  khi đề gọi nó là “graphic”.
- Không có sơ đồ hoặc hình quan trọng bị AI đoán thành HTML.
- Tất cả placeholder bắt đầu bằng `[MEDIA_REQUIRED]` và không có
  `mediaAssetId`.
- `order` bắt đầu từ 0 và không trùng trong cùng mảng.
- JSON parse được, không có Markdown fence, comment hoặc trailing comma.
