# AI prompt — TOEIC PDF to PaceLingo JSON

Đưa tài liệu này, `IMPORT_SCHEMA_V1.md`,
[`AI_PASSAGE_AND_MEDIA_GUIDE.md`](./AI_PASSAGE_AND_MEDIA_GUIDE.md),
[`AI_SOURCE_MERGE_PROTOCOL.md`](./AI_SOURCE_MERGE_PROTOCOL.md), file PDF đề,
listening script, answer key và file lời giải cho AI. Tài liệu passage/media là
hợp đồng chi tiết bắt buộc cho
việc dựng email, table, passage HTML và đánh dấu ảnh cần admin chèn. Nên
xử lý từng phạm vi nhỏ theo quy trình hai lượt trong source merge protocol,
không yêu cầu xuất cả 200 câu một lần.

## Prompt sẵn để sao chép

```text
You are converting a TOEIC Listening and Reading PDF into PaceLingo import
JSON. Follow IMPORT_SCHEMA_V1.md exactly and return schemaVersion 1 JSON.
Follow AI_SOURCE_MERGE_PROTOCOL.md when combining the question PDF, listening
script, answer key, and explanation file. Treat them as separate sources.

SCOPE
- Convert only the Part/pages specified by me.
- Preserve the original English. Do not translate, rewrite, simplify, or
  improve the source material.
- Preserve question numbers, option order, passage grouping, external IDs when
  available, transcripts, explanations, grammar topics, and vocabulary tags.
- Use the supplied answer key for correctOption. Never infer or invent a
  correct answer when the answer key is missing or unreadable.
- Match answers and explanations exclusively by printed question number. Never
  merge sources by physical adjacency or paste unconsumed source text into the
  last option/transcript.
- Return one valid JSON object only. Do not wrap it in Markdown and do not add
  commentary before or after it.

FIELD OWNERSHIP AND LANGUAGE FIREWALL
- Question PDF owns English promptHtml, English options, passages and visuals.
- Listening script owns English transcriptHtml and Part 1/2 spoken choices.
- Answer key owns correctOption only.
- Explanation file owns explanationHtml only.
- promptHtml, options[].contentHtml, transcriptHtml and stimulus contentHtml
  must contain English source content only.
- Vietnamese is allowed only in explanationHtml.
- Never copy Đáp án, Dịch nghĩa, Giải thích, STT, page headers, page numbers,
  answer-key letters or neighboring question blocks into content fields.

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

LISTENING FIELD RULES
- Part 1 import data keeps four English spoken descriptions for private review,
  but the live candidate UI displays only the photo and labels A/B/C/D. Use a
  neutral promptHtml such as <p>Question</p>. Each group has one question and
  one IMAGE placeholder. It MUST contain exactly four option objects with
  labels A, B, C, D in that order; never reuse Part 2's three-option shape.
- Part 2 import data keeps the spoken English question/responses for private
  review, but the live candidate UI displays only labels A/B/C. Use a neutral
  promptHtml such as <p>Question</p>. Each group has one question and three
  English response options in the draft.
- Part 3/4 transcriptHtml contains only the spoken English conversation/talk.
  Printed questions and options belong to question objects, not transcriptHtml.
- Never put translations or answer letters in transcriptHtml or options.
- Never design candidate-facing Part 1/2 output that prints spoken option text.
  PaceLingo redacts that text from the public candidate snapshot at publish.

FIELD BOUNDARIES
- promptHtml contains the stem only: no question number and no group range.
- option contentHtml contains one option only: no repeated label and no next
  question.
- Finish one question object before consuming source text for the next.
- If an option contains a pattern such as "45. What...", the batch is corrupt;
  stop instead of returning JSON.
- If the explanation source contains an explanation for a question, insert it
  into that exact question's explanationHtml. explanationsFound must equal
  explanationsInserted before output.

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
- Ensure every requested question number occurs exactly once and every supplied
  explanation is mapped to the same numbered question.
- Ensure Part 1 labels are exactly A/B/C/D and Part 2 labels exactly A/B/C.
- Ensure no prompt begins with a number/range and no option contains the next
  numbered question.
- Search promptHtml, options, transcripts and stimuli for Vietnamese, answer
  labels, source headings and accidentally concatenated neighboring questions;
  there must be none.
- Ensure the final response parses as strict JSON: no comments, trailing
  commas, Markdown fences, or unescaped newlines inside strings.

Now convert: <INSERT PART/PAGE RANGE HERE>.
Answer key location: <INSERT PAGE/FILE OR "NOT PROVIDED">.
```

## Quy trình đề xuất

1. Trước mỗi batch, chạy lượt lập bảng đối chiếu theo
   `AI_SOURCE_MERGE_PROTOCOL.md`; chỉ xuất JSON khi số câu/nguồn đã khớp.
2. Part 1: chia theo từng cụm ảnh; AI đánh dấu toàn bộ ảnh bằng
   `[MEDIA_REQUIRED]`.
3. Part 2: chỉ 5–10 câu mỗi lượt; Part 3–4 chỉ 1–3 group mỗi lượt.
4. Part 5: 10–20 câu mỗi lượt.
5. Part 6: mỗi lượt 1–3 passage, không tách bốn câu khỏi passage.
6. Part 7: mỗi lượt 1–3 group; giữ double/triple passage trong cùng group.
7. Chạy `audit:import` trên từng fragment, rồi dùng `merge:imports` để ghép bằng
   code thay vì nhờ AI viết lại toàn bộ JSON.
8. Chạy `audit:import` lần nữa trên file đã ghép.
9. Chỉ import kết quả sạch tại `/admin/imports`.
10. Tìm `MEDIA_REQUIRED` trong normalized JSON để lập danh sách ảnh cần crop,
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
