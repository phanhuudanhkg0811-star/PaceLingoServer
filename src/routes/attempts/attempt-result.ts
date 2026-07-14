export const TOEIC_PARTS = [
  'PART_1',
  'PART_2',
  'PART_3',
  'PART_4',
  'PART_5',
  'PART_6',
  'PART_7',
] as const;

export type ToeicPart = (typeof TOEIC_PARTS)[number];

export interface ResultQuestion {
  questionId: string;
  correctOptionId: string | null;
  kind: 'LISTENING' | 'READING';
  part: ToeicPart | null;
  number: number;
}

export interface ResultAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface ResultTiming {
  questionId: string;
  activeTimeMs: number;
  visitCount: number;
}

export interface ScoreConversionSnapshot {
  name: string;
  source: string | null;
  version: number;
  isOfficial: boolean;
  listeningMappingJson: unknown;
  readingMappingJson: unknown;
}

export interface AttemptResultSnapshot {
  schemaVersion: 1;
  questionCount: number;
  answeredCount: number;
  unansweredCount: number;
  correctCount: number;
  wrongCount: number;
  durationMs: number;
  score: {
    hasConversion: boolean;
    profile: {
      name: string;
      source: string | null;
      version: number;
      isOfficial: boolean;
    } | null;
    listening: { correct: number; total: number; scaled: number | null };
    reading: { correct: number; total: number; scaled: number | null };
    totalScaled: number | null;
  };
  analytics: {
    totalActiveTimeMs: number;
    tooLongCount: number;
    finalUnansweredCount: number;
    revisitCount: number;
    revisitedQuestionCount: number;
  };
  parts: PartResult[];
}

export interface PartResult {
  part: ToeicPart;
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  activeTimeMs: number;
  averageTimeMs: number;
  tooLongCount: number;
  revisitCount: number;
  revisitedQuestionCount: number;
  thresholdMs: number;
  performance: {
    fastCorrect: number;
    fastWrong: number;
    slowCorrect: number;
    slowWrong: number;
  };
}

const TIME_THRESHOLD_MS: Record<ToeicPart, number> = {
  PART_1: 30_000,
  PART_2: 20_000,
  PART_3: 45_000,
  PART_4: 45_000,
  PART_5: 30_000,
  PART_6: 60_000,
  PART_7: 75_000,
};

export function buildAttemptResult(input: {
  questions: ResultQuestion[];
  answers: ResultAnswer[];
  timings: ResultTiming[];
  durationMs: number;
  conversion: ScoreConversionSnapshot | null;
}): AttemptResultSnapshot {
  const answers = new Map(
    input.answers.map((answer) => [answer.questionId, answer.selectedOptionId]),
  );
  const timings = new Map(
    input.timings.map((timing) => [timing.questionId, timing]),
  );
  const state = input.questions.map((question) => {
    const selectedOptionId = answers.get(question.questionId) ?? null;
    const timing = timings.get(question.questionId);
    return {
      ...question,
      selectedOptionId,
      answered: selectedOptionId !== null,
      correct:
        question.correctOptionId !== null &&
        selectedOptionId === question.correctOptionId,
      activeTimeMs: timing?.activeTimeMs ?? 0,
      visitCount: timing?.visitCount ?? 0,
    };
  });

  const listening = state.filter((item) => item.kind === 'LISTENING');
  const reading = state.filter((item) => item.kind === 'READING');
  const listeningCorrect = listening.filter((item) => item.correct).length;
  const readingCorrect = reading.filter((item) => item.correct).length;
  const listeningScaled = input.conversion
    ? mappedScore(
        input.conversion.listeningMappingJson,
        listeningCorrect,
        listening.length,
      )
    : null;
  const readingScaled = input.conversion
    ? mappedScore(
        input.conversion.readingMappingJson,
        readingCorrect,
        reading.length,
      )
    : null;
  const hasListeningConversion =
    listening.length === 0 ||
    (listening.length === 100 && listeningScaled !== null);
  const hasReadingConversion =
    reading.length === 0 || (reading.length === 100 && readingScaled !== null);
  const hasConversion =
    input.conversion !== null && hasListeningConversion && hasReadingConversion;
  const scaledValues = [
    listening.length > 0 ? listeningScaled : null,
    reading.length > 0 ? readingScaled : null,
  ].filter((value): value is number => value !== null);

  const parts = TOEIC_PARTS.map((part) => {
    const questions = state.filter((item) => item.part === part);
    if (!questions.length) return null;
    const thresholdMs = TIME_THRESHOLD_MS[part];
    const answered = questions.filter((item) => item.answered);
    const activeTimeMs = questions.reduce(
      (sum, item) => sum + item.activeTimeMs,
      0,
    );
    const revisitCount = questions.reduce(
      (sum, item) => sum + Math.max(0, item.visitCount - 1),
      0,
    );
    const performance = {
      fastCorrect: 0,
      fastWrong: 0,
      slowCorrect: 0,
      slowWrong: 0,
    };
    for (const question of answered) {
      const speed = question.activeTimeMs > thresholdMs ? 'slow' : 'fast';
      const accuracy = question.correct ? 'Correct' : 'Wrong';
      const key = `${speed}${accuracy}`;
      performance[key] += 1;
    }
    const correct = questions.filter((item) => item.correct).length;
    return {
      part,
      total: questions.length,
      answered: answered.length,
      correct,
      wrong: answered.length - correct,
      unanswered: questions.length - answered.length,
      activeTimeMs,
      averageTimeMs:
        questions.length > 0 ? Math.round(activeTimeMs / questions.length) : 0,
      tooLongCount: questions.filter(
        (item) => item.answered && item.activeTimeMs > thresholdMs,
      ).length,
      revisitCount,
      revisitedQuestionCount: questions.filter((item) => item.visitCount > 1)
        .length,
      thresholdMs,
      performance,
    } satisfies PartResult;
  }).filter((part): part is PartResult => part !== null);

  const sorted = [...state].sort((a, b) => a.number - b.number);
  let finalUnansweredCount = 0;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].answered) break;
    finalUnansweredCount += 1;
  }
  const answeredCount = state.filter((item) => item.answered).length;
  const correctCount = state.filter((item) => item.correct).length;

  return {
    schemaVersion: 1,
    questionCount: state.length,
    answeredCount,
    unansweredCount: state.length - answeredCount,
    correctCount,
    wrongCount: answeredCount - correctCount,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    score: {
      hasConversion,
      profile:
        input.conversion === null
          ? null
          : {
              name: input.conversion.name,
              source: input.conversion.source,
              version: input.conversion.version,
              isOfficial: input.conversion.isOfficial,
            },
      listening: {
        correct: listeningCorrect,
        total: listening.length,
        scaled: hasConversion ? listeningScaled : null,
      },
      reading: {
        correct: readingCorrect,
        total: reading.length,
        scaled: hasConversion ? readingScaled : null,
      },
      totalScaled:
        hasConversion && scaledValues.length > 0
          ? scaledValues.reduce((sum, value) => sum + value, 0)
          : null,
    },
    analytics: {
      totalActiveTimeMs: parts.reduce(
        (sum, part) => sum + part.activeTimeMs,
        0,
      ),
      tooLongCount: parts.reduce((sum, part) => sum + part.tooLongCount, 0),
      finalUnansweredCount,
      revisitCount: parts.reduce((sum, part) => sum + part.revisitCount, 0),
      revisitedQuestionCount: parts.reduce(
        (sum, part) => sum + part.revisitedQuestionCount,
        0,
      ),
    },
    parts,
  };
}

export function mappedScore(mapping: unknown, correct: number, total: number) {
  if (correct < 0 || correct > total) return null;
  if (Array.isArray(mapping)) {
    const value: unknown = (mapping as unknown[])[correct];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (mapping && typeof mapping === 'object') {
    const value = (mapping as Record<string, unknown>)[String(correct)];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
}
