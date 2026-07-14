# AI prompt — TOEIC PDF to PaceLingo JSON

Đưa tài liệu này, `IMPORT_SCHEMA_V1.md`,
[`AI_PASSAGE_AND_MEDIA_GUIDE.md`](./AI_PASSAGE_AND_MEDIA_GUIDE.md), file PDF đề
và answer key cho AI. Tài liệu passage/media là hợp đồng chi tiết bắt buộc cho
việc dựng email, table, passage HTML và đánh dấu ảnh cần admin chèn. Nên
xử lý từng Part hoặc từng nhóm passage thay vì yêu cầu xuất cả 200 câu một lần.

## Prompt sẵn để sao chép

```text
You are converting a TOEIC Listening and Reading PDF into PaceLingo import
JSON. Follow IMPORT_SCHEMA_V1.md exactly and return schemaVersion 1 JSON.

SCOPE
- Convert only the Part/pages specified by me.
- Preserve the original English. Do not translate, rewrite, simplify, or
  improve the source material.
- Preserve question numbers, option order, passage grouping, external IDs when
  available, transcripts, explanations, grammar topics, and vocabulary tags.
- Use the supplied answer key for correctOption. Never infer or invent a
  correct answer when the answer key is missing or unreadable.
- Return one valid JSON object only. Do not wrap it in Markdown and do not add
  commentary before or after it.

PART AND GROUP MAPPING
- Part 1: PHOTO
- Part 2: QUESTION_RESPONSE
- Part 3: CONVERSATION
- Part 4: TALK
- Part 5: INCOMPLETE_SENTENCE
- Part 6: TEXT_COMPLETION; keep each passage with its four questions
- Part 7 one document: SINGLE_PASSAGE
- Part 7 two or three related documents: MULTIPLE_PASSAGE; keep every related
  document in the same questionGroup as separate ordered stimuli

HTML OR IMAGE DECISION
For every photograph, passage, document, table, chart, form, advertisement,
menu, map, schedule, invoice, email, message chain, or article, decide whether
it can be represented faithfully as semantic HTML.

Use an HTML stimulus when:
- all relevant text is readable with high confidence;
- reading order is unambiguous;
- layout can be preserved with article, header, p, table, ul, ol, dl, strong,
  em, and br elements;
- converting it does not remove information needed to answer a question.

HTML requirements:
- use semantic HTML only;
- do not add CSS, script, iframe, external resources, or event attributes;
- preserve headings, sender/recipient fields, dates, prices, rows, columns, and
  paragraph boundaries;
- escape literal HTML special characters;
- do not add facts that are not visible in the PDF.

Use an unresolved IMAGE stimulus when:
- it is a Part 1 photograph;
- visual composition, branding, icons, arrows, relative position, or graphical
  styling is relevant;
- it is a complex advertisement, map, chart, invoice, form, menu, schedule, or
  infographic that cannot be reconstructed without information loss;
- OCR confidence is low or reading order is ambiguous.

IMAGE placeholder format:
{
  "type": "IMAGE",
  "altText": "[MEDIA_REQUIRED] type=<TYPE>; page=<PAGE>; questions=<NUMBERS>; crop=<REGION>; preserve=<DETAILS>; reason=<WHY_HTML_IS_UNSAFE>",
  "order": <zero-based stimulus order>
}

For an unresolved IMAGE:
- omit mediaAssetId;
- never invent a URL, local path, storage ID, or base64 value;
- state the PDF page, crop target, question numbers, and reason in altText;
- do not duplicate the same document as invented HTML.

LISTENING MEDIA
- If the PDF shows a Part 1 photograph, create an IMAGE placeholder.
- If audio files are not supplied, create no fake AUDIO stimulus and no fake
  mediaAssetId. Keep transcriptHtml only when a transcript exists in the
  source.
- Audio will be attached by the admin later.

OCR AND UNCERTAINTY
- Never silently guess unreadable text.
- For a small unreadable fragment inside otherwise reliable HTML, preserve the
  position as [OCR_UNCLEAR: short description].
- If unreadable text or layout could affect an answer, use IMAGE instead of
  HTML and explain the issue in altText.
- If a question number, option, grouping, or answer-key entry is uncertain,
  keep the source value when visible and add [OCR_UNCLEAR] to the affected text.
  Do not manufacture missing content.

VALIDATION BEFORE OUTPUT
- Ensure every section has part, kind, order, directionMode, and
  questionGroups.
- Ensure each question has a positive number, non-empty promptHtml, order, and
  1-4 non-empty options.
- Ensure option labels and order are unique within a question.
- Ensure section, group, stimulus, question, and option order values are
  zero-based and unique among siblings.
- Ensure question numbers match the PDF and are unique in the output scope.
- Ensure correctOption matches an existing option label when an answer key was
  provided.
- Ensure the final response parses as strict JSON: no comments, trailing
  commas, Markdown fences, or unescaped newlines inside strings.

Now convert: <INSERT PART/PAGE RANGE HERE>.
Answer key location: <INSERT PAGE/FILE OR "NOT PROVIDED">.
```

## Quy trình đề xuất

1. Part 1: chia theo từng cụm ảnh; AI đánh dấu toàn bộ ảnh bằng
   `[MEDIA_REQUIRED]`.
2. Part 2–5: chia khoảng 20–30 câu mỗi lượt.
3. Part 6: mỗi lượt vài passage, không tách bốn câu khỏi passage.
4. Part 7: chia theo group; giữ double/triple passage trong cùng group.
5. Import kết quả tại `/admin/imports`.
6. Tìm `MEDIA_REQUIRED` trong normalized JSON để lập danh sách ảnh cần crop,
   upload và gắn ở Phase 7.

## Ví dụ quyết định

Email thuần chữ có sender, recipient và ba đoạn văn:

```json
{
  "type": "HTML",
  "contentHtml": "<article><header><p><strong>To:</strong> Staff</p><p><strong>From:</strong> Mina Cole</p></header><p>...</p></article>",
  "order": 0
}
```

Quảng cáo nhà hàng có logo, coupon và bố cục hai cột:

```json
{
  "type": "IMAGE",
  "altText": "[MEDIA_REQUIRED] type=ADVERTISEMENT; page=18; questions=153-154; crop=full restaurant advertisement; preserve=logo, coupon code, prices and two-column layout; reason=visual layout affects interpretation",
  "order": 0
}
```
