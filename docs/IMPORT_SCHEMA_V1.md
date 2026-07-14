# PaceLingo Import JSON — schemaVersion 1

Phase 6 accepts JSON produced manually or by an external conversion tool. Import
data is always stored in `ImportDraft` first; it never writes directly to a
published test.

## Canonical shape

```json
{
  "schemaVersion": 1,
  "externalId": "source-test-001",
  "test": {
    "title": "TOEIC Practice Test",
    "description": "Optional",
    "type": "FULL_TEST",
    "durationMinutes": 120
  },
  "sections": [
    {
      "title": "Part 5",
      "kind": "READING",
      "part": "PART_5",
      "order": 4,
      "directionMode": "DEFAULT",
      "questionGroups": [
        {
          "externalId": "group-101",
          "type": "INCOMPLETE_SENTENCE",
          "title": "Optional",
          "transcriptHtml": "<p>Optional</p>",
          "order": 0,
          "stimuli": [],
          "questions": [
            {
              "externalId": "question-101",
              "number": 101,
              "promptHtml": "<p>The question...</p>",
              "correctOption": "B",
              "explanationHtml": "<p>Explanation...</p>",
              "grammarTopic": "Adjectives",
              "vocabularyTags": ["office"],
              "difficulty": "EASY",
              "order": 0,
              "options": [
                { "label": "A", "contentHtml": "option A", "order": 0 },
                { "label": "B", "contentHtml": "option B", "order": 1 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Accepted shortcuts

- `groups` may replace `questionGroups`.
- `prompt` may replace `promptHtml`.
- `explanation` may replace `explanationHtml`.
- `transcript` may replace `transcriptHtml`.
- `passageHtml`, `passage`, `passages`, or `documents` may replace `stimuli`
  for common AI output. String values are normalized into ordered HTML stimuli.
  `stimuli` remains the recommended canonical field.
- Options may be plain strings; labels and order are generated automatically.
- `correctOption` marks the matching option label as correct.
- Part may be `5`, `PART5`, or `PART_5`.
- Missing section/group/question/option order is generated from array position.
- Missing `directionMode` becomes `DEFAULT`.
- Missing media and timeline data is allowed during Phase 6.

## Media placeholders produced from PDF

When an external AI can faithfully reconstruct a passage with semantic HTML,
it should create an `HTML` stimulus:

```json
{
  "type": "HTML",
  "contentHtml": "<article><h2>Office Notice</h2><p>...</p></article>",
  "order": 0
}
```

When the visual layout is important or OCR is uncertain, it must not invent
HTML. It should create an unresolved `IMAGE` stimulus without `mediaAssetId`:

```json
{
  "type": "IMAGE",
  "altText": "[MEDIA_REQUIRED] type=ADVERTISEMENT; page=18; questions=153-154; crop=full restaurant advertisement; preserve=prices, logo and two-column layout; reason=visual layout affects interpretation",
  "order": 0
}
```

`[MEDIA_REQUIRED]` is the Phase 6 hand-off marker. During Phase 7, the admin
uploads/crops the source image and fills `mediaAssetId`. Do not place a local
file path, base64 data, fabricated URL, or PDF URL in `mediaAssetId`.

Use `IMAGE` for Part 1 photographs and for passages where maps, charts,
invoices, forms, menus, advertisements, spatial layout, or low OCR confidence
affect the answer. Use `HTML` for ordinary emails, messages, notices, articles,
and simple tables that can be reconstructed without losing meaning.

## Importing one Part

Use the canonical shape with one section, or place `part` and `questionGroups`
at the root. Select **Thêm Part vào đề đang sửa** in the admin UI.

## Importing independent questions

The following shorthand is wrapped into one section and one question group:

```json
{
  "schemaVersion": 1,
  "title": "Part 5 questions",
  "type": "PART_PRACTICE",
  "durationMinutes": 15,
  "part": "PART_5",
  "groupType": "INCOMPLETE_SENTENCE",
  "questions": []
}
```

## Validation behavior

- Syntax and structural errors are reported with a JSON path.
- With **Bỏ qua câu lỗi** disabled, invalid questions block publishing.
- With it enabled, invalid questions are removed and reported as warnings.
- Re-importing identical JSON opens the existing import via its SHA-256 content
  hash.
- Publishing the same `ImportDraft` twice returns the existing Test Draft.

A downloadable example is available in the client at
`/samples/toeic-import-v1.json`.

For PDF/OCR conversion, use the ready-to-copy prompt in
[`AI_PDF_TO_IMPORT_PROMPT.md`](./AI_PDF_TO_IMPORT_PROMPT.md) and the strict
passage/media rules in
[`AI_PASSAGE_AND_MEDIA_GUIDE.md`](./AI_PASSAGE_AND_MEDIA_GUIDE.md).
