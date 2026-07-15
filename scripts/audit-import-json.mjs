import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const requireExplanations = args.includes('--require-explanations');
const input = args.find((value) => !value.startsWith('--'));

if (!input) {
  console.error(
    'Usage: npm run audit:import --workspace pace-lingo-server -- "C:\\path\\to\\import.json" [--require-explanations]',
  );
  process.exit(2);
}

const resolved = path.resolve(input);
let payload;

try {
  payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
} catch (error) {
  console.error(`Cannot parse ${resolved}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const errors = [];
const warnings = [];
const questionNumbers = new Map();

const sourceNoise =
  /(?:Đáp\s*án|Dịch\s*nghĩa|Giải\s*thích|\bSTT\b|ETS\s+\d{4}\s+(?:LISTENING|READING)\s+TEST|PART\s*[1-7]\s+STT\s+Transcript)/iu;
const vietnamese =
  /[ăâđêôơưĂÂĐÊÔƠƯ]|\b(?:người|phụ\s*nữ|đàn\s*ông|đáp\s*án|dịch\s*nghĩa|giải\s*thích|câu\s*hỏi|không|được|đang|những|một|của|với|trong|chúng\s*ta)\b/iu;
const embeddedQuestion =
  /(?:^|\s)\d{1,3}[.)]\s+(?:What|Where|When|Why|Who|How|Which|According|Does|Do|Is|Are|Will|Would|Has|Have|Look|Choose)\b/iu;
const embeddedAnswerLetter = /(?:^|\n)\s*[A-D]\s*(?:\n|$)/u;
const numberedPromptPrefix =
  /^\s*(?:(?:\d{1,3}\s*[-–—]\s*\d{1,3})|(?:[-–—]\s*)?(?:\d{1,3}\s+){0,2}\d{1,3}[.)])\s+/u;

function add(target, code, issuePath, message) {
  target.push({ code, path: issuePath, message });
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function plain(value) {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditCandidateText(value, issuePath, kind) {
  const content = text(value);
  if (!content) return;

  if (vietnamese.test(content)) {
    add(
      errors,
      'VIETNAMESE_LEAK',
      issuePath,
      `Vietnamese is only allowed in explanationHtml, not ${kind}.`,
    );
  }
  if (sourceNoise.test(content)) {
    add(
      errors,
      'SOURCE_NOISE',
      issuePath,
      'Raw answer/explanation labels or PDF headers were copied into candidate content.',
    );
  }
}

function auditOption(value, issuePath) {
  const content = text(value);
  auditCandidateText(content, issuePath, 'option content');

  if (!plain(content)) {
    add(
      errors,
      'EMPTY_OPTION',
      issuePath,
      'Import options must retain their source text for private review.',
    );
  }

  if (embeddedQuestion.test(content)) {
    add(
      errors,
      'QUESTION_BLOCK_IN_OPTION',
      issuePath,
      'The option appears to contain the start of another numbered question.',
    );
  }
  if (embeddedAnswerLetter.test(content)) {
    add(
      errors,
      'ANSWER_KEY_IN_OPTION',
      issuePath,
      'A standalone answer-key letter appears inside the option text.',
    );
  }
  if (plain(content).length > 700) {
    add(
      errors,
      'OVERSIZED_OPTION',
      issuePath,
      'Option text is unusually long and likely contains concatenated source blocks.',
    );
  }
}

const sections = Array.isArray(payload?.sections) ? payload.sections : [];
if (payload?.schemaVersion !== 1) {
  add(errors, 'SCHEMA_VERSION', 'schemaVersion', 'Expected schemaVersion 1.');
}
if (!sections.length) {
  add(errors, 'NO_SECTIONS', 'sections', 'No test sections were found.');
}

let questionCount = 0;
let explanationCount = 0;
let transcriptCount = 0;

sections.forEach((section, sectionIndex) => {
  const sectionPath = `sections.${sectionIndex}`;
  const part = text(section?.part)
    .toUpperCase()
    .replace(/PART(\d)/, 'PART_$1');
  const groups = Array.isArray(section?.questionGroups)
    ? section.questionGroups
    : Array.isArray(section?.groups)
      ? section.groups
      : [];

  if (!groups.length) {
    add(
      warnings,
      'EMPTY_SECTION',
      `${sectionPath}.questionGroups`,
      'Section has no groups.',
    );
  }

  groups.forEach((group, groupIndex) => {
    const groupPath = `${sectionPath}.questionGroups.${groupIndex}`;
    const transcript = text(group?.transcriptHtml ?? group?.transcript);
    const questions = Array.isArray(group?.questions) ? group.questions : [];
    const stimuli = Array.isArray(group?.stimuli) ? group.stimuli : [];

    if (transcript.trim()) {
      transcriptCount += 1;
      auditCandidateText(
        transcript,
        `${groupPath}.transcriptHtml`,
        'transcript',
      );
      if (embeddedAnswerLetter.test(transcript)) {
        add(
          errors,
          'ANSWER_KEY_IN_TRANSCRIPT',
          `${groupPath}.transcriptHtml`,
          'A standalone answer-key letter appears in the transcript.',
        );
      }
    } else if (['PART_1', 'PART_2', 'PART_3', 'PART_4'].includes(part)) {
      add(
        warnings,
        'MISSING_TRANSCRIPT',
        `${groupPath}.transcriptHtml`,
        'Listening group has no transcript for review.',
      );
    }

    stimuli.forEach((stimulus, stimulusIndex) => {
      if (text(stimulus?.type).toUpperCase() === 'HTML') {
        auditCandidateText(
          stimulus?.contentHtml,
          `${groupPath}.stimuli.${stimulusIndex}.contentHtml`,
          'stimulus HTML',
        );
      }
    });

    if (part === 'PART_1') {
      const hasImage = stimuli.some(
        (stimulus) => text(stimulus?.type).toUpperCase() === 'IMAGE',
      );
      if (!hasImage) {
        add(
          errors,
          'MISSING_PART_1_IMAGE',
          `${groupPath}.stimuli`,
          'Part 1 group needs an IMAGE stimulus.',
        );
      }
    }
    if (
      ['PART_1', 'PART_2', 'PART_5'].includes(part) &&
      questions.length !== 1
    ) {
      add(
        errors,
        'GROUP_SIZE',
        `${groupPath}.questions`,
        `${part} group must contain exactly one question.`,
      );
    }
    if (['PART_3', 'PART_4'].includes(part) && questions.length !== 3) {
      add(
        warnings,
        'GROUP_SIZE',
        `${groupPath}.questions`,
        `${part} normally contains three questions per group.`,
      );
    }
    if (part === 'PART_6' && questions.length !== 4) {
      add(
        warnings,
        'GROUP_SIZE',
        `${groupPath}.questions`,
        'Part 6 normally contains four questions per passage.',
      );
    }

    questions.forEach((question, questionIndex) => {
      questionCount += 1;
      const questionPath = `${groupPath}.questions.${questionIndex}`;
      const number = Number(question?.number);
      const prompt = text(question?.promptHtml ?? question?.prompt);
      const explanation = text(
        question?.explanationHtml ?? question?.explanation,
      );
      const options = Array.isArray(question?.options) ? question.options : [];

      if (!Number.isInteger(number) || number <= 0) {
        add(
          errors,
          'INVALID_NUMBER',
          `${questionPath}.number`,
          'Question number must be a positive integer.',
        );
      } else if (questionNumbers.has(number)) {
        add(
          errors,
          'DUPLICATE_NUMBER',
          `${questionPath}.number`,
          `Question ${number} already exists at ${questionNumbers.get(number)}.`,
        );
      } else {
        questionNumbers.set(number, `${questionPath}.number`);
      }

      if (!plain(prompt)) {
        add(
          errors,
          'EMPTY_PROMPT',
          `${questionPath}.promptHtml`,
          'promptHtml must not be empty.',
        );
      } else {
        auditCandidateText(
          prompt,
          `${questionPath}.promptHtml`,
          'question prompt',
        );
        if (numberedPromptPrefix.test(plain(prompt))) {
          add(
            errors,
            'NUMBER_PREFIX_IN_PROMPT',
            `${questionPath}.promptHtml`,
            'promptHtml must contain only the question stem, without question number or group range.',
          );
        }
        if (
          embeddedQuestion.test(plain(prompt).replace(numberedPromptPrefix, ''))
        ) {
          add(
            errors,
            'QUESTION_BLOCK_IN_PROMPT',
            `${questionPath}.promptHtml`,
            'The prompt appears to contain another numbered question.',
          );
        }
      }

      if (plain(explanation)) {
        explanationCount += 1;
      } else {
        add(
          requireExplanations ? errors : warnings,
          'MISSING_EXPLANATION',
          `${questionPath}.explanationHtml`,
          `Question ${number || '?'} has no explanation${requireExplanations ? ' although --require-explanations is enabled' : ''}.`,
        );
      }

      const expectedOptions = part === 'PART_2' ? 3 : 4;
      if (options.length !== expectedOptions) {
        add(
          errors,
          'OPTION_COUNT',
          `${questionPath}.options`,
          `${part || 'This part'} expects ${expectedOptions} options, found ${options.length}.`,
        );
      }

      const labels = options.map((option, optionIndex) => {
        const isObject = option && typeof option === 'object';
        const label =
          text(isObject ? option.label : '').toUpperCase() ||
          String.fromCharCode(65 + optionIndex);
        const content = isObject
          ? (option.contentHtml ?? option.content ?? '')
          : option;
        auditOption(
          content,
          `${questionPath}.options.${optionIndex}.contentHtml`,
        );
        return label;
      });
      const expectedLabels =
        part === 'PART_2' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
      if (labels.join(',') !== expectedLabels.join(',')) {
        add(
          errors,
          'OPTION_LABELS',
          `${questionPath}.options`,
          `${part || 'This part'} requires labels ${expectedLabels.join(', ')} exactly once and in order; found ${labels.join(', ') || 'none'}.`,
        );
      }
      const correctOption = text(question?.correctOption).toUpperCase();
      if (!correctOption) {
        add(
          errors,
          'MISSING_ANSWER',
          `${questionPath}.correctOption`,
          `Question ${number || '?'} has no correctOption.`,
        );
      } else if (!labels.includes(correctOption)) {
        add(
          errors,
          'INVALID_ANSWER',
          `${questionPath}.correctOption`,
          `Answer ${correctOption} does not match option labels ${labels.join(', ')}.`,
        );
      }
    });
  });
});

const sortedNumbers = [...questionNumbers.keys()].sort((a, b) => a - b);
if (payload?.test?.type === 'FULL_TEST') {
  if (questionCount !== 200) {
    add(
      errors,
      'FULL_TEST_COUNT',
      'sections',
      `FULL_TEST must contain 200 questions, found ${questionCount}.`,
    );
  }
  const missing = Array.from({ length: 200 }, (_, index) => index + 1).filter(
    (number) => !questionNumbers.has(number),
  );
  if (missing.length) {
    add(
      errors,
      'MISSING_NUMBERS',
      'sections',
      `Missing full-test question numbers: ${missing.join(', ')}.`,
    );
  }
}

console.log(`\nPaceLingo import audit: ${resolved}`);
console.log(
  `Sections ${sections.length} | Questions ${questionCount} | Range ${sortedNumbers[0] ?? '-'}-${sortedNumbers.at(-1) ?? '-'} | Explanations ${explanationCount} | Transcripts ${transcriptCount}`,
);
console.log(
  `Explanation policy: ${requireExplanations ? 'required for every question' : 'missing explanations are warnings'}`,
);
console.log(`Errors ${errors.length} | Warnings ${warnings.length}\n`);

function printIssues(title, issues) {
  if (!issues.length) return;
  console.log(`${title}:`);
  issues.slice(0, 100).forEach((issue, index) => {
    console.log(`${index + 1}. [${issue.code}] ${issue.path}`);
    console.log(`   ${issue.message}`);
  });
  if (issues.length > 100) {
    console.log(`... ${issues.length - 100} more issue(s) omitted.`);
  }
  console.log();
}

printIssues('ERROR', errors);
printIssues('WARNING', warnings);

if (errors.length) {
  console.error('Audit failed. Do not import or publish this JSON.');
  process.exit(1);
}

console.log('Audit passed. Review warnings before importing.');
