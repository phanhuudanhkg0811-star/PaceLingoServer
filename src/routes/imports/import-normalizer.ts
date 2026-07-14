import { createHash } from 'node:crypto';
import { createTestDraftSchema } from '../tests/test-draft.schemas';

const parts = [
  'PART_1',
  'PART_2',
  'PART_3',
  'PART_4',
  'PART_5',
  'PART_6',
  'PART_7',
] as const;
type ToeicPart = (typeof parts)[number];

const groupTypeByPart = {
  PART_1: 'PHOTO',
  PART_2: 'QUESTION_RESPONSE',
  PART_3: 'CONVERSATION',
  PART_4: 'TALK',
  PART_5: 'INCOMPLETE_SENTENCE',
  PART_6: 'TEXT_COMPLETION',
  PART_7: 'SINGLE_PASSAGE',
} as const;

export interface ImportIssue {
  code: string;
  path: string;
  message: string;
}

export interface ImportValidation {
  valid: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  stats: {
    sections: number;
    groups: number;
    questions: number;
    skippedQuestions: number;
  };
}

export interface NormalizedImportResult {
  schemaVersion: number;
  externalId?: string;
  normalized: unknown;
  validation: ImportValidation;
}

export function normalizeImport(
  source: unknown,
  skipInvalidQuestions: boolean,
): NormalizedImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const root = asRecord(source);
  if (!root) {
    return result(
      {},
      errors.concat(issue('INVALID_ROOT', '$', 'JSON root must be an object')),
      warnings,
      0,
    );
  }

  const schemaVersion = integer(root.schemaVersion) ?? 1;
  if (schemaVersion !== 1) {
    errors.push(
      issue(
        'UNSUPPORTED_SCHEMA_VERSION',
        'schemaVersion',
        `Only schemaVersion 1 is supported; received ${schemaVersion}`,
      ),
    );
  }

  const metadata = asRecord(root.test) ?? root;
  const type =
    enumValue(metadata.type, ['FULL_TEST', 'MINI_TEST', 'PART_PRACTICE']) ??
    'FULL_TEST';
  const normalized = {
    title: text(metadata.title) ?? '',
    description: text(metadata.description),
    type,
    durationMinutes:
      integer(metadata.durationMinutes) ?? (type === 'FULL_TEST' ? 120 : 30),
    scoreConversionProfileId: text(metadata.scoreConversionProfileId),
    fullListeningAudioId: text(metadata.fullListeningAudioId),
    content: {
      sections: normalizeSections(
        extractSections(root, metadata),
        errors,
        warnings,
        skipInvalidQuestions,
      ),
    },
  };

  const parsed = createTestDraftSchema.safeParse(normalized);
  if (!parsed.success) {
    for (const zodIssue of parsed.error.issues) {
      errors.push(
        issue('SCHEMA_ERROR', zodIssue.path.join('.') || '$', zodIssue.message),
      );
    }
  }

  const clean = parsed.success ? parsed.data : jsonValue(normalized);
  const questionCount = countQuestions(normalized.content.sections);
  return {
    schemaVersion,
    externalId: text(root.externalId),
    normalized: clean,
    validation: {
      valid: errors.length === 0,
      errors: deduplicateIssues(errors),
      warnings: deduplicateIssues(warnings),
      stats: {
        sections: normalized.content.sections.length,
        groups: normalized.content.sections.reduce(
          (total, section) => total + section.questionGroups.length,
          0,
        ),
        questions: questionCount,
        skippedQuestions: warnings.filter(
          (warning) => warning.code === 'SKIPPED_INVALID_QUESTION',
        ).length,
      },
    },
  };
}

function extractSections(
  root: Record<string, unknown>,
  metadata: Record<string, unknown>,
): unknown[] {
  if (Array.isArray(root.sections)) return root.sections;
  if (Array.isArray(metadata.sections)) return metadata.sections;
  if (
    root.part &&
    (Array.isArray(root.questionGroups) || Array.isArray(root.groups))
  ) {
    return [
      {
        part: root.part,
        title: root.title,
        kind: root.kind,
        order: root.order,
        directionMode: root.directionMode,
        directionTemplateId: root.directionTemplateId,
        questionGroups: root.questionGroups ?? root.groups,
      },
    ];
  }
  if (root.part && Array.isArray(root.questions)) {
    return [
      {
        part: root.part,
        title: root.sectionTitle,
        kind: root.kind,
        order: 0,
        directionMode: root.directionMode,
        questionGroups: [
          {
            externalId: root.groupExternalId,
            type: root.groupType,
            title: root.groupTitle,
            transcriptHtml: root.transcriptHtml,
            stimuli: root.stimuli,
            order: 0,
            questions: root.questions,
          },
        ],
      },
    ];
  }
  return [];
}

export function contentHash(source: unknown) {
  return createHash('sha256').update(stableStringify(source)).digest('hex');
}

function normalizeSections(
  rawSections: unknown[],
  errors: ImportIssue[],
  warnings: ImportIssue[],
  skipInvalidQuestions: boolean,
) {
  return rawSections.flatMap((rawSection, sectionIndex) => {
    const path = `sections.${sectionIndex}`;
    const section = asRecord(rawSection);
    if (!section) {
      errors.push(issue('INVALID_SECTION', path, 'Section must be an object'));
      return [];
    }
    const part = normalizePart(section.part);
    if (!part) {
      errors.push(
        issue(
          'INVALID_PART',
          `${path}.part`,
          'Part must be between PART_1 and PART_7',
        ),
      );
      return [];
    }
    const rawGroups = Array.isArray(section.questionGroups)
      ? section.questionGroups
      : Array.isArray(section.groups)
        ? section.groups
        : [];
    return [
      {
        title: text(section.title) ?? `TOEIC Part ${part.replace('PART_', '')}`,
        kind:
          enumValue(section.kind, ['LISTENING', 'READING']) ??
          (isListening(part) ? 'LISTENING' : 'READING'),
        part,
        order: integer(section.order) ?? sectionIndex,
        durationMinutes: positiveInteger(section.durationMinutes),
        directionMode:
          enumValue(section.directionMode, ['DEFAULT', 'CUSTOM', 'NONE']) ??
          'DEFAULT',
        directionTemplateId: text(section.directionTemplateId),
        questionGroups: normalizeGroups(
          rawGroups,
          part,
          path,
          errors,
          warnings,
          skipInvalidQuestions,
        ),
      },
    ];
  });
}

function normalizeGroups(
  rawGroups: unknown[],
  part: ToeicPart,
  sectionPath: string,
  errors: ImportIssue[],
  warnings: ImportIssue[],
  skipInvalidQuestions: boolean,
) {
  return rawGroups.flatMap((rawGroup, groupIndex) => {
    const path = `${sectionPath}.questionGroups.${groupIndex}`;
    const group = asRecord(rawGroup);
    if (!group) {
      errors.push(
        issue('INVALID_GROUP', path, 'Question group must be an object'),
      );
      return [];
    }
    const rawQuestions = Array.isArray(group.questions) ? group.questions : [];
    const questions = rawQuestions.flatMap((question, questionIndex) => {
      const normalized = normalizeQuestion(
        question,
        `${path}.questions.${questionIndex}`,
        questionIndex,
      );
      if (normalized.ok) return [normalized.value];
      const target = skipInvalidQuestions ? warnings : errors;
      target.push(
        issue(
          skipInvalidQuestions ? 'SKIPPED_INVALID_QUESTION' : normalized.code,
          normalized.path,
          normalized.message,
        ),
      );
      return [];
    });
    return [
      {
        externalId: text(group.externalId),
        type:
          enumValue(group.type, [
            'PHOTO',
            'QUESTION_RESPONSE',
            'CONVERSATION',
            'TALK',
            'INCOMPLETE_SENTENCE',
            'TEXT_COMPLETION',
            'SINGLE_PASSAGE',
            'MULTIPLE_PASSAGE',
          ]) ?? groupTypeByPart[part],
        title: text(group.title),
        transcriptHtml: text(group.transcriptHtml ?? group.transcript),
        order: integer(group.order) ?? groupIndex,
        stimuli: normalizeStimuli(
          Array.isArray(group.stimuli) ? group.stimuli : [],
        ),
        questions,
      },
    ];
  });
}

function normalizeQuestion(
  rawQuestion: unknown,
  path: string,
  questionIndex: number,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: string; path: string; message: string } {
  const question = asRecord(rawQuestion);
  if (!question) {
    return {
      ok: false,
      code: 'INVALID_QUESTION',
      path,
      message: 'Question must be an object',
    };
  }
  const number = positiveInteger(question.number);
  if (!number) {
    return {
      ok: false,
      code: 'INVALID_QUESTION_NUMBER',
      path: `${path}.number`,
      message: 'Question number must be a positive integer',
    };
  }
  const promptHtml = text(question.promptHtml ?? question.prompt);
  if (!promptHtml) {
    return {
      ok: false,
      code: 'MISSING_QUESTION_PROMPT',
      path: `${path}.promptHtml`,
      message: 'Question prompt is required',
    };
  }
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  if (rawOptions.length < 1 || rawOptions.length > 4) {
    return {
      ok: false,
      code: 'INVALID_OPTIONS',
      path: `${path}.options`,
      message: 'Question must contain between 1 and 4 options',
    };
  }
  const correctOption = text(question.correctOption)?.toUpperCase();
  const options = rawOptions.map((rawOption, optionIndex) => {
    const option = asRecord(rawOption);
    const label =
      text(option?.label)?.toUpperCase() ??
      String.fromCharCode(65 + optionIndex);
    return {
      label,
      contentHtml:
        typeof rawOption === 'string'
          ? rawOption.trim()
          : (text(option?.contentHtml ?? option?.content) ?? ''),
      isCorrect: boolean(option?.isCorrect) ?? label === correctOption,
      order: integer(option?.order) ?? optionIndex,
    };
  });
  if (options.some((option) => !option.contentHtml)) {
    return {
      ok: false,
      code: 'EMPTY_OPTION',
      path: `${path}.options`,
      message: 'Every option must have content',
    };
  }
  return {
    ok: true,
    value: {
      externalId: text(question.externalId),
      number,
      promptHtml,
      explanationHtml: text(question.explanationHtml ?? question.explanation),
      grammarTopic: text(question.grammarTopic),
      vocabularyTags: Array.isArray(question.vocabularyTags)
        ? question.vocabularyTags.flatMap((tag) =>
            text(tag) ? [text(tag)!] : [],
          )
        : [],
      difficulty: enumValue(question.difficulty, ['EASY', 'MEDIUM', 'HARD']),
      order: integer(question.order) ?? questionIndex,
      options,
    },
  };
}

function normalizeStimuli(rawStimuli: unknown[]) {
  return rawStimuli.flatMap((rawStimulus, index) => {
    const stimulus = asRecord(rawStimulus);
    if (!stimulus) return [];
    const type = enumValue(stimulus.type, ['HTML', 'IMAGE', 'AUDIO']);
    if (!type) return [];
    return [
      {
        type,
        contentHtml: text(stimulus.contentHtml ?? stimulus.content),
        mediaAssetId: text(stimulus.mediaAssetId),
        altText: text(stimulus.altText),
        order: integer(stimulus.order) ?? index,
      },
    ];
  });
}

function result(
  normalized: unknown,
  errors: ImportIssue[],
  warnings: ImportIssue[],
  schemaVersion: number,
): NormalizedImportResult {
  return {
    schemaVersion,
    normalized,
    validation: {
      valid: false,
      errors,
      warnings,
      stats: { sections: 0, groups: 0, questions: 0, skippedQuestions: 0 },
    },
  };
}

function countQuestions(
  sections: Array<{ questionGroups: Array<{ questions: unknown[] }> }>,
) {
  return sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.questionGroups.reduce(
        (groupTotal, group) => groupTotal + group.questions.length,
        0,
      ),
    0,
  );
}

function normalizePart(value: unknown): ToeicPart | undefined {
  const raw = (typeof value === 'number' ? String(value) : text(value))
    ?.toUpperCase()
    .replace(/\s|-/g, '_');
  if (!raw) return undefined;
  const candidate = raw.startsWith('PART_')
    ? raw
    : raw.startsWith('PART')
      ? raw.replace('PART', 'PART_')
      : `PART_${raw}`;
  return parts.find((part) => part === candidate);
}

function isListening(part: ToeicPart) {
  return ['PART_1', 'PART_2', 'PART_3', 'PART_4'].includes(part);
}

function issue(code: string, path: string, message: string): ImportIssue {
  return { code, path, message };
}

function deduplicateIssues(issues: ImportIssue[]) {
  return issues.filter(
    (current, index) =>
      issues.findIndex(
        (candidate) =>
          candidate.code === current.code &&
          candidate.path === current.path &&
          candidate.message === current.message,
      ) === index,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : typeof value === 'string' && /^-?\d+$/.test(value.trim())
      ? Number(value)
      : undefined;
}

function positiveInteger(value: unknown) {
  const parsed = integer(value);
  return parsed && parsed > 0 ? parsed : undefined;
}

function boolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  const normalized = text(value)?.toUpperCase();
  return values.find((candidate) => candidate === normalized);
}

function jsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = asRecord(value);
  if (record) {
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
