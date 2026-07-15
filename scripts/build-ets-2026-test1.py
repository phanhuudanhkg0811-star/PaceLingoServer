"""Build an import-ready PaceLingo Test 1 JSON from the supplied ETS PDFs.

The answer/script PDFs have a text layer and are treated as the source of truth.
The scanned question PDFs are OCR'ed only for printed passages. Layout-sensitive
documents are emitted as explicit MEDIA_REQUIRED placeholders.
"""

from __future__ import annotations

import html
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / ".tools" / "pdf"
sys.path.insert(0, str(TOOLS))

import fitz  # type: ignore
import numpy as np  # type: ignore
from rapidocr_onnxruntime import RapidOCR  # type: ignore


DOWNLOADS = Path.home() / "Downloads"
LC_KEY = DOWNLOADS / "ETS 2026 LISTENING TEST 1 (SCRIPT AND KEY).pdf"
RC_KEY = DOWNLOADS / "ETS 2026 READING TEST 1- KEY.pdf"
RC_SCAN = DOWNLOADS / "1_PDFsam_ETS 2026- RC.pdf"
OUTPUT = ROOT / "artifacts" / "ets-2026-test-1-pacelingo.json"
CACHE = ROOT / "artifacts" / "ets-2026-test1-ocr-cache.json"

LABELS = ["A", "B", "C", "D"]

PART6_HTML = {
    (131, 134): """<article><h3>Look to Riessler Landscaping for your Garden Needs</h3><p>Riessler Landscaping has everything you need to create your dream garden. We will listen to your ideas and offer suggestions that match your gardening desires. <strong>[131]</strong> The nursery here at Riessler Landscaping includes plants of many varieties and sizes that burst with eye-catching colors year-round. You are guaranteed to find something that will add <strong>[132]</strong> to your garden. We are <strong>[133]</strong> equipped to construct small ponds or other water features. And as our name suggests, we can take on more ambitious landscaping projects—whatever you need! With more than 40 years in the landscape-design business, <strong>[134]</strong> expertise is unmatched.</p></article>""",
    (135, 138): """<article><p>10 January</p><p>Cindy Mulligan<br>88 Manchester Road<br>HARROGATE<br>HG82 2MJ</p><p>Dear Ms. Mulligan,</p><p>We are delighted to celebrate your 30th anniversary with Brandrix Distribution Centre. <strong>[135]</strong> Your dedication, loyalty, and hard work have contributed greatly to our success over the years. We appreciate your commitment to excellence. Over the years, you <strong>[136]</strong> great initiative, creativity, and leadership.</p><p>You will <strong>[137]</strong> be receiving a commemorative plaque by post. We hope this token of our gratitude reminds you how much you mean to us.</p><p>Congratulations on reaching this <strong>[138]</strong>. Thank you for being part of our Brandrix family.</p><p>Sincerely,<br>Lance Powar, Vice President of Human Resources<br>Brandrix Distribution Centre</p></article>""",
    (139, 142): """<article><p><strong>To:</strong> Kay Berman &lt;kberman@xmail.com&gt;<br><strong>From:</strong> Ali Chaleby &lt;achaleby@ralenciadesign.com&gt;<br><strong>Date:</strong> August 21<br><strong>Subject:</strong> Plans for living room<br><strong>Attachment:</strong> Samples</p><p>Dear Ms. Berman,</p><p>My design team is in the process of <strong>[139]</strong> the plans for your living room. Based on our last conversation, I have chosen different paints for the walls and borders. Please review the attached file and decide whether you like those new <strong>[140]</strong>. If not, it is not too late to make a change. <strong>[141]</strong> Your review will help us refine the design before we start.</p><p>Please let <strong>[142]</strong> know if you have any questions. I look forward to hearing from you.</p><p>Kind regards,<br>Ali Chaleby, Ralencia Design</p></article>""",
    (143, 146): """<article><p><strong>To:</strong> Marsha Zalen &lt;mzalen@mansfield.com&gt;<br><strong>From:</strong> Kaymar PCP &lt;info@kaymarpcp.com&gt;<br><strong>Date:</strong> September 8<br><strong>Subject:</strong> Your recent office visit</p><p>Dear Ms. Zalen,</p><p>Thank you for your recent visit to Kaymar Primary Care Practice. We hope you found our services <strong>[143]</strong>, and we welcome suggestions for improvement.</p><p>We have posted a <strong>[144]</strong> of your consultation on our portal. Please take a moment to go through it and let us know if you have any questions.</p><p>As a reminder, you can log in to the portal for various activities. <strong>[145]</strong>, you can make appointments and payments, view your medical history, review lab results, and request medication refills. <strong>[146]</strong> Rest assured that your personal information is safe and secure.</p><p>We thank you for your business and look forward to serving you again.</p><p>Kaymar Primary Care Practice</p></article>""",
}

PART7_HTML_OVERRIDES = {
    (161, 163): """<article><h3>Vimalo Brands Enters a New Era</h3><p><em>By Yvette Maurer</em></p><p>VANCOUVER (2 August)—Vimalo Brands, the large consumer goods company that markets popular nutritional-support and personal-care products, including Powerburst breakfast drinks and Honeysoft soaps and lotions, will soon offer something new for its customers: frozen foods. “Our new Nutridinna line is not just about convenience,” CEO Danitza Martens said during a press conference earlier today. “Frozen foods are not a new concept, but our method of flash-freezing fresh produce and meats ensures that our products retain their texture and flavour as well as their healthy vitamins and minerals. Now our customers can enjoy the convenience of frozen food without sacrificing quality.”</p><p>Vimalo Brands has partnered with Vancouver-area farms to obtain produce and meat for the Nutridinna line. “By keeping our operations local, we avoid shipping delays and can flash-freeze freshly harvested vegetables at their peak of ripeness,” Martens said. “Our customers benefit further, since our products can be kept in the freezer for up to six months.” Nutridinna foods will be available in supermarkets beginning in November. Frozen fish and other seafood will be added early next year.</p></article>""",
}


def clean(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text.replace("​", " ")).strip()
    return text.replace("98-10 0", "98-100").replace("98- 10 0", "98-100")


def paragraphs(text: str) -> str:
    text = clean(text)
    return "" if not text else f"<p>{html.escape(text)}</p>"


def option_parts(text: str, count: int = 4) -> tuple[str, list[str]]:
    text = clean(text)
    text = re.sub(r"(?<!\()\b([A-D])\)\s*", r"(\1) ", text)
    hits = list(re.finditer(r"\(([A-D])\)\s*", text))
    by_label: dict[str, re.Match[str]] = {}
    for hit in hits:
        by_label.setdefault(hit.group(1), hit)
    wanted = LABELS[:count]
    if any(label not in by_label for label in wanted):
        raise ValueError(f"Missing option in: {text[:240]}")
    ordered = [by_label[label] for label in wanted]
    prompt = text[: ordered[0].start()].strip(" -")
    values: list[str] = []
    for index, hit in enumerate(ordered):
        end = ordered[index + 1].start() if index + 1 < len(ordered) else len(text)
        values.append(text[hit.end() : end].strip())
    return prompt, values


def question(number: int, prompt: str, options: list[str], answer: str, explanation: str) -> dict:
    prompt = re.sub(r"^[.:\-]+\s*", "", clean(prompt))
    return {
        "externalId": f"ets-2026-t1-q{number}",
        "number": number,
        "promptHtml": paragraphs(prompt or "Question"),
        "correctOption": answer,
        "explanationHtml": explanation,
        "grammarTopic": None,
        "vocabularyTags": [],
        "difficulty": None,
        "order": 0,
        "options": [
            {"label": label, "contentHtml": html.escape(clean(value)), "order": index}
            for index, (label, value) in enumerate(zip(LABELS, options))
        ],
    }


def key_blocks(doc: fitz.Document, page_index: int) -> list[dict]:
    result = []
    for raw in doc[page_index].get_text("blocks"):
        x0, y0, x1, y1, text, *_ = raw
        text = clean(text)
        if text:
            result.append({"page": page_index, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": text})
    return result


def parse_listening_1_2(doc: fitz.Document) -> dict[int, dict]:
    parsed: dict[int, dict] = {}
    for page_index in range(7):
        blocks = key_blocks(doc, page_index)
        left = [b for b in blocks if b["x0"] < 300]
        right = [b for b in blocks if b["x0"] >= 300 and b["x1"] - b["x0"] > 120]
        for block in left:
            match = re.match(r"^(\d{1,2})\s+(?!-)(.+)$", block["text"])
            if not match:
                continue
            number = int(match.group(1))
            if not 1 <= number <= 31:
                continue
            overlap = lambda other: max(0.0, min(block["y1"], other["y1"]) - max(block["y0"], other["y0"]))
            candidates = sorted(right, key=lambda other: overlap(other), reverse=True)
            if not candidates or overlap(candidates[0]) <= 0:
                raise ValueError(f"No Vietnamese pair for listening question {number}")
            translated = candidates[0]["text"]
            answer_match = re.match(r"^([A-D])\s+", translated)
            if not answer_match:
                raise ValueError(f"No answer for listening question {number}: {translated[:80]}")
            body = match.group(2)
            count = 4 if number <= 6 else 3
            prompt, options = option_parts(body, count)
            transcript = body
            explanation = (
                f"<p><strong>Đáp án: {answer_match.group(1)}</strong></p>"
                + paragraphs(translated[answer_match.end() :])
            )
            parsed[number] = {
                "question": question(number, "Question" if number <= 6 else prompt, options, answer_match.group(1), explanation),
                "transcript": paragraphs(transcript),
            }
    return parsed


def parse_listening_3_4(doc: fitz.Document) -> dict[tuple[int, int], dict]:
    groups: list[dict] = []
    current: dict | None = None
    phase = ""
    answers: dict[int, str] = {}

    for page_index in range(6, len(doc)):
        blocks = key_blocks(doc, page_index)
        for block in blocks:
            text = block["text"]
            if 300 <= block["x0"] < 350 and block["x1"] - block["x0"] < 90:
                for number, label in re.findall(r"\b(\d{2,3})\.\s*([A-D])\b", text):
                    answers[int(number)] = label

            if block["x0"] >= 300 or block["x1"] - block["x0"] > 290:
                continue
            if any(noise in text for noise in ("PART 3", "PART 4", "STT Transcript", "ETS 2026", "Dịch nghĩa")):
                continue

            range_match = re.match(r"^(\d{2,3})\s*-\s*(\d{2,3})\s+(.+)$", text)
            if range_match:
                start, end = int(range_match.group(1)), int(range_match.group(2))
                rest = range_match.group(3)
                if not 32 <= start <= 100:
                    continue
                if re.match(rf"^{start}\.\s+", rest):
                    target = next((g for g in reversed(groups) if g["start"] == start), None)
                    if target is None:
                        raise ValueError(f"Question block without transcript: {start}-{end}")
                    target["question_text"] += " " + rest
                    current, phase = target, "questions"
                else:
                    embedded_question = re.search(rf"\b{start}\.\s+", rest)
                    transcript = rest[: embedded_question.start()] if embedded_question else rest
                    question_text = rest[embedded_question.start() :] if embedded_question else ""
                    current = {"start": start, "end": end, "transcript": transcript, "question_text": question_text, "vi_transcript": "", "vi_questions": ""}
                    groups.append(current)
                    phase = "questions" if embedded_question else "transcript"
                continue

            if current is None:
                continue
            if re.match(rf"^{current['start']}\.\s+", text):
                current["question_text"] += " " + text
                phase = "questions"
            elif phase == "questions" and (re.match(r"^\([A-D]\)", text) or re.search(r"\b\d{2,3}\.\s+", text)):
                current["question_text"] += " " + text
            elif phase == "transcript" and not re.match(r"^\d+$", text):
                current["transcript"] += " " + text

    # Pair translated blocks with their left-side counterpart by vertical overlap.
    group_by_start = {g["start"]: g for g in groups}
    active_group: dict | None = None
    active_kind = ""
    for page_index in range(6, len(doc)):
        blocks = key_blocks(doc, page_index)
        left = [b for b in blocks if b["x0"] < 300 and b["x1"] - b["x0"] < 290]
        wide_right = [b for b in blocks if b["x0"] >= 300 and b["x1"] - b["x0"] >= 120]
        for right in wide_right:
            overlaps = []
            for lb in left:
                overlap = max(0.0, min(lb["y1"], right["y1"]) - max(lb["y0"], right["y0"]))
                overlaps.append((overlap, lb))
            best_overlap = max(overlaps, key=lambda pair: pair[0]) if overlaps else None
            counterpart = best_overlap[1] if best_overlap and best_overlap[0] > 0 else None
            left_text = counterpart["text"] if counterpart else ""
            rm = re.match(r"^(\d{2,3})\s*-\s*(\d{2,3})\s+(.+)$", left_text)
            qm = re.search(r"\b(\d{2,3})\.\s+", left_text)
            if rm and not re.match(rf"^{rm.group(1)}\.\s+", rm.group(3)):
                active_group = group_by_start.get(int(rm.group(1)))
                embedded_vi = re.search(rf"\b{rm.group(1)}\.\s+", right["text"])
                if active_group is not None and embedded_vi:
                    active_group["vi_transcript"] += " " + right["text"][: embedded_vi.start()]
                    active_group["vi_questions"] += " " + right["text"][embedded_vi.start() :]
                    active_kind = "vi_questions"
                    continue
                active_kind = "vi_transcript"
            elif (rm and re.match(rf"^{rm.group(1)}\.\s+", rm.group(3))) or qm:
                number = int(rm.group(1)) if rm else int(qm.group(1))
                active_group = next((g for g in groups if g["start"] <= number <= g["end"]), active_group)
                active_kind = "vi_questions"
            if active_group is not None and active_kind:
                active_group[active_kind] += " " + right["text"]

    result: dict[tuple[int, int], dict] = {}
    for group in groups:
        start, end = group["start"], group["end"]
        if not group["question_text"]:
            raise ValueError(f"Missing question text for listening {start}-{end}")
        questions = []
        blob = clean(group["question_text"])
        for number in range(start, end + 1):
            marker = re.search(rf"\b{number}\.\s+", blob)
            if not marker:
                raise ValueError(f"Missing printed listening question {number}: {blob[:200]}")
            next_marker = re.search(rf"\b{number + 1}\.\s+", blob[marker.end() :]) if number < end else None
            stop = marker.end() + next_marker.start() if next_marker else len(blob)
            piece = blob[marker.end() : stop]
            prompt, options = option_parts(piece, 4)
            answer = answers.get(number)
            if not answer:
                raise ValueError(f"Missing listening answer {number}")
            explanation = f"<p><strong>Đáp án: {answer}</strong></p>"
            explanation += paragraphs(group["vi_transcript"])
            explanation += paragraphs(group["vi_questions"])
            questions.append(question(number, prompt, options, answer, explanation))
        result[(start, end)] = {
            "questions": questions,
            "transcript": paragraphs(group["transcript"]),
        }
    return result


def collect_reading_questions(doc: fitz.Document) -> dict[int, tuple[str, list[str]]]:
    by_part: dict[int, list[str]] = {5: [], 6: [], 7: []}
    for page_index in range(len(doc)):
        part = 5 if page_index < 14 else 6 if page_index < 26 else 7
        for block in key_blocks(doc, page_index):
            width = block["x1"] - block["x0"]
            threshold = 310 if part == 5 else 280 if part == 6 else 200
            text = block["text"]
            if block["x0"] >= threshold:
                continue
            if re.match(r"^Questions?\s*\d", text, re.I):
                continue
            if width > (300 if part == 6 else 340) and not re.match(r"^\([A-D]\)", text):
                continue
            if part == 7:
                vietnamese = re.search(r"[À-ỹĐđ]", text)
                if vietnamese:
                    english_prefix = text[: vietnamese.start()].strip()
                    if re.search(r"\([A-D]\)", english_prefix):
                        text = english_prefix
                    else:
                        continue
                next_heading = re.search(r"\s+Questions?\s*\d{3}\s*[-–]", text, re.I)
                if next_heading:
                    text = text[: next_heading.start()].strip()
                if re.match(r"^\(D\)", text):
                    duplicate = re.search(r"\s+\([A-D]\)", text[3:])
                    if duplicate:
                        text = text[: 3 + duplicate.start()].strip()
            if "ETS 2036 READING TEST" not in text and not re.fullmatch(r"\d+", text):
                by_part[part].append(text)

    parsed: dict[int, tuple[str, list[str]]] = {}
    for part, pieces in by_part.items():
        blob = clean(" ".join(pieces))
        start, end = {5: (101, 130), 6: (131, 146), 7: (147, 200)}[part]
        for number in range(start, end + 1):
            marker = re.search(rf"(?<!\d){number}[.:]?(?:\s+)", blob)
            if not marker:
                raise ValueError(f"Missing reading question {number}")
            next_marker = re.search(rf"(?<!\d){number + 1}[.:]?(?:\s+)", blob[marker.end() :]) if number < end else None
            stop = marker.end() + next_marker.start() if next_marker else len(blob)
            piece = blob[marker.end() : stop]
            piece = re.sub(rf"^\s*{number}[.:]?\s+", "", piece)
            try:
                prompt, options = option_parts(piece, 4)
            except ValueError as error:
                raise ValueError(f"Reading question {number}: {error}") from error
            parsed[number] = (prompt, options)
    return parsed


def collect_reading_explanations(doc: fitz.Document) -> dict[int, tuple[str, str]]:
    result: dict[int, tuple[str, str]] = {}
    sequences: dict[int, list[str]] = {5: [], 6: [], 7: []}
    for page_index in range(len(doc)):
        part = 5 if page_index < 14 else 6 if page_index < 26 else 7
        threshold = 310 if part == 5 else 280 if part == 6 else 300
        for block in key_blocks(doc, page_index):
            if block["x0"] >= threshold and block["x1"] - block["x0"] > 20 and not re.fullmatch(r"\d+", block["text"]):
                sequences[part].append(block["text"])

    # Part 5: some long explanations continue in another block/page.
    groups5: list[str] = []
    answers5: list[str] = []
    for text in sequences[5]:
        match = re.search(r"(?:=>\s*)?Ch.n\s*\(?([A-D])\)?", text, re.I)
        if match:
            groups5.append(text)
            answers5.append(match.group(1).upper())
        elif groups5:
            groups5[-1] += " " + text
    if len(groups5) != 30:
        raise ValueError(f"Expected 30 Part 5 explanations, found {len(groups5)}")
    for number, text, answer in zip(range(101, 131), groups5, answers5):
        result[number] = (answer, text)

    # Part 6: a new explanation starts with 'Chọn'; continuation blocks are appended.
    groups: list[str] = []
    for text in sequences[6]:
        if re.match(r"^(?:=>\s*)?Ch.n\s*\(?[A-D]\)?", text):
            groups.append(text)
        elif groups:
            groups[-1] += " " + text
    if len(groups) != 16:
        raise ValueError(f"Expected 16 Part 6 explanations, found {len(groups)}")
    for number, text in zip(range(131, 147), groups):
        match = re.match(r"^(?:=>\s*)?Ch.n\s*\(?([A-D])\)?", text)
        assert match
        result[number] = (match.group(1).upper(), text)

    # Part 7: pair each printed question with the translated block beside it.
    # Three source blocks visually omit/separate the answer letter, so use the
    # answer explicitly supported by their accompanying passage/key content.
    fallback_answers = {150: "C", 151: "D", 193: "B"}
    for page_index in range(26, len(doc)):
        page_blocks = key_blocks(doc, page_index)
        english_blocks = [
            block for block in page_blocks
            if block["x0"] < 300 and re.match(r"^(1(?:4[7-9]|[5-9]\d)|200)[.:]?\s+", block["text"])
        ]
        translated_blocks = [block for block in page_blocks if block["x0"] >= 300 and block["x1"] - block["x0"] > 20]
        for english_block in english_blocks:
            number = int(re.match(r"^(\d+)", english_block["text"]).group(1))
            if not translated_blocks:
                raise ValueError(f"Missing Part 7 translation for {number}")
            def overlap(other: dict) -> float:
                return max(0.0, min(english_block["y1"], other["y1"]) - max(english_block["y0"], other["y0"]))
            translated = max(translated_blocks, key=overlap)["text"]
            answer_match = re.match(r"^([A-D])\s+", translated)
            answer = answer_match.group(1) if answer_match else fallback_answers.get(number)
            if not answer:
                raise ValueError(f"Missing Part 7 answer for {number}: {translated[:100]}")
            result[number] = (answer, translated)
    if any(number not in result for number in range(147, 201)):
        missing = [number for number in range(147, 201) if number not in result]
        raise ValueError(f"Missing Part 7 explanation pairs: {missing}")
    return result


def ocr_pages(page_indices: set[int]) -> dict[str, list[dict]]:
    cache: dict[str, list[dict]] = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    missing = [page for page in sorted(page_indices) if str(page) not in cache]
    if not missing:
        return cache
    engine = RapidOCR()
    doc = fitz.open(RC_SCAN)
    for page_index in missing:
        print(f"OCR reading page {page_index + 1}/{len(doc)}...", flush=True)
        pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        raw, _ = engine(image)
        lines = []
        for box, text, score in raw or []:
            x0 = min(point[0] for point in box)
            y0 = min(point[1] for point in box)
            x1 = max(point[0] for point in box)
            y1 = max(point[1] for point in box)
            lines.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": clean(text), "score": float(score)})
        cache[str(page_index)] = sorted(lines, key=lambda line: (line["y0"], line["x0"]))
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return cache


def reading_html_stimulus(cache: dict[str, list[dict]], page_index: int, start: int, end: int, part: int) -> dict:
    lines = cache[str(page_index)]
    heading_index = next(
        (i for i, line in enumerate(lines) if re.search(rf"Questions?\s*{start}\s*[-–]\s*{end}", line["text"], re.I)),
        None,
    )
    if heading_index is None:
        raise ValueError(f"OCR could not locate heading {start}-{end} on RC page {page_index + 1}")
    selected: list[str] = []
    for line in lines[heading_index + 1 :]:
        text = line["text"]
        if part == 6 and re.match(rf"^{start}\.\s*\(A\)", text):
            break
        if part == 7 and re.match(rf"^{start}\.?\s+(?:What|Why|Where|Who|When|How|Which|According)", text, re.I):
            break
        if any(noise in text.upper() for noise in ("HIEN NHUNG TOEIC", "TEACH BY HEART", "GO ON TO THE NEXT PAGE")):
            continue
        if re.fullmatch(r"TEST(?:\s+1)?(?:\s+\d+)?", text, re.I):
            continue
        selected.append(text)
    body = clean(" ".join(selected))
    number_pattern = "|".join(str(number) for number in range(start, end + 1))
    if part == 6:
        answer_block = re.search(rf"(?<!\d)(?:{number_pattern})\s*\.?\s*\(A\)", body)
        if answer_block:
            body = body[: answer_block.start()].strip()
    else:
        printed_question = re.search(
            rf"(?<!\d)(?:{number_pattern})\s*[.:]?\s*(?:What|Why|Where|Who|When|How|Which|According|In\s*which)",
            body,
            re.I,
        )
        if printed_question:
            body = body[: printed_question.start()].strip()
        generic_question = re.search(
            r"(?:What|Why|Where|Who|When|How|Which|According|In\s*which)[^?]{0,260}\?\s*\(A\)",
            body,
            re.I,
        )
        if generic_question:
            body = body[: generic_question.start()].strip()
    body = re.sub(rf"(?<!\d)({'|'.join(str(n) for n in range(start, end + 1))})\.", r"[\1]", body)
    if len(body) < 80:
        raise ValueError(f"OCR passage {start}-{end} is suspiciously short: {body}")
    return {
        "type": "HTML",
        "contentHtml": f"<article><p>{html.escape(body)}</p></article>",
        "order": 0,
    }


def media_placeholder(page: int, start: int, end: int, media_type: str, order: int = 0) -> dict:
    return {
        "type": "IMAGE",
        "altText": (
            f"[MEDIA_REQUIRED] type={media_type}; page={page}; questions={start}-{end}; "
            "crop=complete source document; preserve=all text, graphics, labels and spatial layout; "
            "reason=layout-sensitive scanned source cannot be represented faithfully as plain HTML"
        ),
        "order": order,
    }


def build() -> dict:
    for path in (LC_KEY, RC_KEY, RC_SCAN):
        if not path.exists():
            raise FileNotFoundError(path)
    lc_doc = fitz.open(LC_KEY)
    rc_doc = fitz.open(RC_KEY)
    lc12 = parse_listening_1_2(lc_doc)
    lc34 = parse_listening_3_4(lc_doc)
    reading_questions = collect_reading_questions(rc_doc)
    reading_explanations = collect_reading_explanations(rc_doc)

    ocr_map = {
        (131, 134): 4, (135, 138): 5, (139, 142): 6, (143, 146): 7,
        (147, 148): 8, (149, 150): 9, (151, 152): 10, (153, 154): 11,
        (155, 157): 12, (158, 160): 13, (161, 163): 14, (164, 167): 15,
        (168, 171): 16, (172, 175): 17,
    }
    cache = ocr_pages(set(ocr_map.values()))

    sections = []

    def section(title: str, kind: str, part: str, order: int, groups: list[dict]) -> None:
        sections.append({"title": title, "kind": kind, "part": part, "order": order, "directionMode": "DEFAULT", "questionGroups": groups})

    p1_groups = []
    for number in range(1, 7):
        entry = lc12[number]
        entry["question"]["order"] = 0
        p1_groups.append({
            "externalId": f"ets-2026-t1-p1-g{number}", "type": "PHOTO", "order": number - 1,
            "transcriptHtml": entry["transcript"],
            "stimuli": [media_placeholder(3 + (number - 1) // 2, number, number, "PHOTO")],
            "questions": [entry["question"]],
        })
    section("Photographs", "LISTENING", "PART_1", 0, p1_groups)

    p2_groups = []
    for number in range(7, 32):
        entry = lc12[number]
        p2_groups.append({
            "externalId": f"ets-2026-t1-p2-g{number}", "type": "QUESTION_RESPONSE", "order": number - 7,
            "transcriptHtml": entry["transcript"], "stimuli": [], "questions": [entry["question"]],
        })
    section("Question-Response", "LISTENING", "PART_2", 1, p2_groups)

    for part, ranges, group_type, order in (
        (3, [(n, n + 2) for n in range(32, 71, 3)], "CONVERSATION", 2),
        (4, [(n, min(n + 2, 100)) for n in range(71, 101, 3)], "TALK", 3),
    ):
        groups = []
        for group_order, key in enumerate(ranges):
            entry = lc34[key]
            for q_order, q in enumerate(entry["questions"]):
                q["order"] = q_order
            graphic = any("look at the graphic" in re.sub(r"<[^>]+>", "", q["promptHtml"]).lower() for q in entry["questions"])
            scan_page = 7 if key[0] <= 43 else 8 if key[0] <= 55 else 9 if key[0] <= 64 else 10 if key[0] <= 70 else 11 if key[0] <= 82 else 12 if key[0] <= 94 else 13
            stimuli = [media_placeholder(scan_page, key[0], key[1], "GRAPHIC")] if graphic else []
            groups.append({
                "externalId": f"ets-2026-t1-p{part}-g{key[0]}-{key[1]}", "type": group_type, "order": group_order,
                "transcriptHtml": entry["transcript"], "stimuli": stimuli, "questions": entry["questions"],
            })
        section("Conversations" if part == 3 else "Talks", "LISTENING", f"PART_{part}", order, groups)

    p5_groups = []
    for number in range(101, 131):
        prompt, options = reading_questions[number]
        answer, explanation = reading_explanations[number]
        q = question(number, prompt, options, answer, paragraphs(explanation))
        p5_groups.append({
            "externalId": f"ets-2026-t1-p5-g{number}", "type": "INCOMPLETE_SENTENCE", "order": number - 101,
            "stimuli": [], "questions": [q],
        })
    section("Incomplete Sentences", "READING", "PART_5", 4, p5_groups)

    reading_ranges = {
        6: [(131, 134), (135, 138), (139, 142), (143, 146)],
        7: [(147, 148), (149, 150), (151, 152), (153, 154), (155, 157), (158, 160), (161, 163), (164, 167), (168, 171), (172, 175), (176, 180), (181, 185), (186, 190), (191, 195), (196, 200)],
    }
    multi_pages = {
        (176, 180): [20], (181, 185): [22], (186, 190): [24, 25],
        (191, 195): [26, 27], (196, 200): [28, 29],
    }
    for part in (6, 7):
        groups = []
        for group_order, bounds in enumerate(reading_ranges[part]):
            start, end = bounds
            qs = []
            for q_order, number in enumerate(range(start, end + 1)):
                prompt, options = reading_questions[number]
                answer, explanation = reading_explanations[number]
                display_prompt = prompt or (f"Choose the best answer for blank [{number}]." if part == 6 else "Question")
                q = question(number, display_prompt, options, answer, paragraphs(explanation))
                q["order"] = q_order
                qs.append(q)
            if part == 6:
                stimuli = [{"type": "HTML", "contentHtml": PART6_HTML[bounds], "order": 0}]
            elif bounds in PART7_HTML_OVERRIDES:
                stimuli = [{"type": "HTML", "contentHtml": PART7_HTML_OVERRIDES[bounds], "order": 0}]
            elif bounds in ocr_map:
                stimuli = [reading_html_stimulus(cache, ocr_map[bounds], start, end, part)]
            else:
                stimuli = [media_placeholder(page, start, end, "MULTIPLE_PASSAGE", index) for index, page in enumerate(multi_pages[bounds])]
            groups.append({
                "externalId": f"ets-2026-t1-p{part}-g{start}-{end}",
                "type": "TEXT_COMPLETION" if part == 6 else ("MULTIPLE_PASSAGE" if bounds in multi_pages else "SINGLE_PASSAGE"),
                "order": group_order, "stimuli": stimuli, "questions": qs,
            })
        section("Text Completion" if part == 6 else "Reading Comprehension", "READING", f"PART_{part}", 5 if part == 6 else 6, groups)

    payload = {
        "schemaVersion": 1,
        "externalId": "ets-2026-test-1",
        "test": {
            "title": "ETS 2026 Test 1",
            "description": "TOEIC Listening & Reading practice test converted from the supplied Test 1 PDFs.",
            "type": "FULL_TEST",
            "durationMinutes": 120,
        },
        "sections": sections,
    }
    return payload


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    result = build()
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    count = sum(len(group["questions"]) for section in result["sections"] for group in section["questionGroups"])
    print(f"Wrote {OUTPUT} with {count} questions")
