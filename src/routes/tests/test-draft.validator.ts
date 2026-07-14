type ToeicPart =
  'PART_1' | 'PART_2' | 'PART_3' | 'PART_4' | 'PART_5' | 'PART_6' | 'PART_7';

type GroupType =
  | 'PHOTO'
  | 'QUESTION_RESPONSE'
  | 'CONVERSATION'
  | 'TALK'
  | 'INCOMPLETE_SENTENCE'
  | 'TEXT_COMPLETION'
  | 'SINGLE_PASSAGE'
  | 'MULTIPLE_PASSAGE';

export interface DraftTree {
  type: 'FULL_TEST' | 'MINI_TEST' | 'PART_PRACTICE';
  totalQuestions: number;
  durationMinutes: number;
  fullListeningAudioId: string | null;
  sections: Array<{
    kind: 'LISTENING' | 'READING';
    part: ToeicPart | null;
    questionGroups: Array<{
      type: GroupType;
      transcriptHtml: string | null;
      stimuli: Array<{
        type: 'HTML' | 'IMAGE' | 'AUDIO';
        contentHtml: string | null;
        mediaAssetId: string | null;
      }>;
      questions: Array<{
        number: number;
        options: Array<{ isCorrect: boolean }>;
      }>;
    }>;
  }>;
}

export interface DraftValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface DraftValidationResult {
  valid: boolean;
  errors: DraftValidationIssue[];
  warnings: DraftValidationIssue[];
  stats: {
    totalQuestions: number;
    questionsByPart: Partial<Record<ToeicPart, number>>;
  };
}

const fullTestQuestionCounts: Record<ToeicPart, number> = {
  PART_1: 6,
  PART_2: 25,
  PART_3: 39,
  PART_4: 30,
  PART_5: 30,
  PART_6: 16,
  PART_7: 54,
};

const expectedGroupTypes: Record<ToeicPart, GroupType[]> = {
  PART_1: ['PHOTO'],
  PART_2: ['QUESTION_RESPONSE'],
  PART_3: ['CONVERSATION'],
  PART_4: ['TALK'],
  PART_5: ['INCOMPLETE_SENTENCE'],
  PART_6: ['TEXT_COMPLETION'],
  PART_7: ['SINGLE_PASSAGE', 'MULTIPLE_PASSAGE'],
};

export function validateTestDraft(test: DraftTree): DraftValidationResult {
  const errors: DraftValidationIssue[] = [];
  const warnings: DraftValidationIssue[] = [];
  const questionsByPart: Partial<Record<ToeicPart, number>> = {};
  const questionNumbers: number[] = [];

  if (test.durationMinutes <= 0) {
    add(
      errors,
      'INVALID_DURATION',
      'durationMinutes',
      'Duration must be positive.',
    );
  }

  for (const [sectionIndex, section] of test.sections.entries()) {
    const sectionPath = `sections.${sectionIndex}`;
    if (!section.part) {
      add(
        errors,
        'MISSING_PART',
        `${sectionPath}.part`,
        'Every TOEIC section must identify its part.',
      );
      continue;
    }

    const expectedKind = isListeningPart(section.part)
      ? 'LISTENING'
      : 'READING';
    if (section.kind !== expectedKind) {
      add(
        errors,
        'INVALID_SECTION_KIND',
        `${sectionPath}.kind`,
        `${section.part} must belong to ${expectedKind}.`,
      );
    }

    let sectionQuestionCount = 0;
    for (const [groupIndex, group] of section.questionGroups.entries()) {
      const groupPath = `${sectionPath}.questionGroups.${groupIndex}`;
      if (!expectedGroupTypes[section.part].includes(group.type)) {
        add(
          errors,
          'INVALID_GROUP_TYPE',
          `${groupPath}.type`,
          `${group.type} is not valid for ${section.part}.`,
        );
      }

      validateGroupMedia(section.part, group, groupPath, errors);
      validateGroupSize(
        section.part,
        group.questions.length,
        groupPath,
        errors,
      );

      if (
        (section.part === 'PART_3' || section.part === 'PART_4') &&
        !group.transcriptHtml
      ) {
        add(
          warnings,
          'MISSING_TRANSCRIPT',
          `${groupPath}.transcriptHtml`,
          'Listening group has no transcript.',
        );
      }

      for (const [questionIndex, question] of group.questions.entries()) {
        const questionPath = `${groupPath}.questions.${questionIndex}`;
        questionNumbers.push(question.number);
        sectionQuestionCount += 1;
        const expectedOptionCount = section.part === 'PART_2' ? 3 : 4;
        if (question.options.length !== expectedOptionCount) {
          add(
            errors,
            'INVALID_OPTION_COUNT',
            `${questionPath}.options`,
            `${section.part} question must have ${expectedOptionCount} options.`,
          );
        }
        if (
          question.options.filter((option) => option.isCorrect).length !== 1
        ) {
          add(
            errors,
            'INVALID_CORRECT_OPTION',
            `${questionPath}.options`,
            'Question must have exactly one correct option.',
          );
        }
      }
    }
    questionsByPart[section.part] =
      (questionsByPart[section.part] ?? 0) + sectionQuestionCount;
  }

  const totalQuestions = questionNumbers.length;
  if (test.totalQuestions !== totalQuestions) {
    add(
      errors,
      'QUESTION_TOTAL_MISMATCH',
      'totalQuestions',
      `Stored total is ${test.totalQuestions}, but the draft contains ${totalQuestions}.`,
    );
  }

  if (new Set(questionNumbers).size !== questionNumbers.length) {
    add(
      errors,
      'DUPLICATE_QUESTION_NUMBER',
      'sections',
      'Question numbers must be unique.',
    );
  }

  if (test.type === 'FULL_TEST') {
    validateFullTest(test, questionsByPart, questionNumbers, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { totalQuestions, questionsByPart },
  };
}

function validateFullTest(
  test: DraftTree,
  questionsByPart: Partial<Record<ToeicPart, number>>,
  questionNumbers: number[],
  errors: DraftValidationIssue[],
) {
  for (const [part, expectedCount] of Object.entries(
    fullTestQuestionCounts,
  ) as Array<[ToeicPart, number]>) {
    const actualCount = questionsByPart[part] ?? 0;
    if (actualCount !== expectedCount) {
      add(
        errors,
        'INVALID_PART_QUESTION_COUNT',
        `parts.${part}`,
        `${part} must contain ${expectedCount} questions; found ${actualCount}.`,
      );
    }
  }

  if (test.totalQuestions !== 200) {
    add(
      errors,
      'INVALID_FULL_TEST_TOTAL',
      'totalQuestions',
      'Full test must contain 200 questions.',
    );
  }
  if (!test.fullListeningAudioId) {
    add(
      errors,
      'MISSING_FULL_LISTENING_AUDIO',
      'fullListeningAudioId',
      'Full test requires a full Listening audio asset.',
    );
  }
  const sortedNumbers = [...questionNumbers].sort(
    (left, right) => left - right,
  );
  if (
    sortedNumbers.length !== 200 ||
    sortedNumbers.some((number, index) => number !== index + 1)
  ) {
    add(
      errors,
      'INVALID_QUESTION_SEQUENCE',
      'sections',
      'Full-test question numbers must cover 1 through 200 exactly once.',
    );
  }
}

function validateGroupMedia(
  part: ToeicPart,
  group: DraftTree['sections'][number]['questionGroups'][number],
  path: string,
  errors: DraftValidationIssue[],
) {
  const hasAudio = group.stimuli.some(
    (stimulus) => stimulus.type === 'AUDIO' && stimulus.mediaAssetId,
  );
  const hasImage = group.stimuli.some(
    (stimulus) => stimulus.type === 'IMAGE' && stimulus.mediaAssetId,
  );
  const hasPassage = group.stimuli.some(
    (stimulus) =>
      (stimulus.type === 'HTML' && stimulus.contentHtml) ||
      (stimulus.type === 'IMAGE' && stimulus.mediaAssetId),
  );

  if (isListeningPart(part) && !hasAudio) {
    add(
      errors,
      'MISSING_GROUP_AUDIO',
      `${path}.stimuli`,
      `${part} group requires audio.`,
    );
  }
  if (part === 'PART_1' && !hasImage) {
    add(
      errors,
      'MISSING_PHOTO',
      `${path}.stimuli`,
      'Part 1 group requires an image.',
    );
  }
  if ((part === 'PART_6' || part === 'PART_7') && !hasPassage) {
    add(
      errors,
      'MISSING_PASSAGE',
      `${path}.stimuli`,
      `${part} group requires a passage.`,
    );
  }
}

function validateGroupSize(
  part: ToeicPart,
  count: number,
  path: string,
  errors: DraftValidationIssue[],
) {
  const exactCount =
    part === 'PART_3' || part === 'PART_4' ? 3 : part === 'PART_6' ? 4 : null;
  if (exactCount !== null && count !== exactCount) {
    add(
      errors,
      'INVALID_GROUP_QUESTION_COUNT',
      `${path}.questions`,
      `${part} group must contain ${exactCount} questions.`,
    );
  }
  if (
    (part === 'PART_1' || part === 'PART_2' || part === 'PART_5') &&
    count !== 1
  ) {
    add(
      errors,
      'INVALID_GROUP_QUESTION_COUNT',
      `${path}.questions`,
      `${part} group must contain one question.`,
    );
  }
}

function isListeningPart(part: ToeicPart) {
  return ['PART_1', 'PART_2', 'PART_3', 'PART_4'].includes(part);
}

function add(
  issues: DraftValidationIssue[],
  code: string,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}
