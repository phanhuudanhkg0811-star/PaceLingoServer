import { buildAttemptResult } from './attempt-result';

describe('buildAttemptResult', () => {
  it('calculates raw grading, per-Part timing and trailing unanswered questions', () => {
    const result = buildAttemptResult({
      questions: [
        question('q1', 101, 'PART_5', 'a1'),
        question('q2', 102, 'PART_5', 'a2'),
        question('q3', 103, 'PART_6', 'a3'),
        question('q4', 104, 'PART_6', 'a4'),
      ],
      answers: [
        { questionId: 'q1', selectedOptionId: 'a1' },
        { questionId: 'q2', selectedOptionId: 'wrong' },
      ],
      timings: [
        { questionId: 'q1', activeTimeMs: 12_000, visitCount: 1 },
        { questionId: 'q2', activeTimeMs: 42_000, visitCount: 3 },
      ],
      durationMs: 90_000,
      conversion: null,
    });

    expect(result).toMatchObject({
      questionCount: 4,
      answeredCount: 2,
      correctCount: 1,
      wrongCount: 1,
      unansweredCount: 2,
      durationMs: 90_000,
      score: { hasConversion: false, totalScaled: null },
      analytics: {
        tooLongCount: 1,
        finalUnansweredCount: 2,
        revisitCount: 2,
        revisitedQuestionCount: 1,
      },
    });
    expect(result.parts[0]).toMatchObject({
      part: 'PART_5',
      correct: 1,
      wrong: 1,
      activeTimeMs: 54_000,
      averageTimeMs: 27_000,
      tooLongCount: 1,
      performance: { fastCorrect: 1, slowWrong: 1 },
    });
  });

  it('only exposes scaled scores for complete 100-question sections', () => {
    const questions = Array.from({ length: 100 }, (_, index) =>
      question(`q${index}`, index + 1, 'PART_1', `a${index}`, 'LISTENING'),
    );
    const result = buildAttemptResult({
      questions,
      answers: questions.slice(0, 2).map((item) => ({
        questionId: item.questionId,
        selectedOptionId: item.correctOptionId,
      })),
      timings: [],
      durationMs: 1,
      conversion: {
        name: 'Form table',
        source: 'Internal',
        version: 1,
        isOfficial: false,
        listeningMappingJson: { 2: 15 },
        readingMappingJson: {},
      },
    });

    expect(result.score).toMatchObject({
      hasConversion: true,
      listening: { correct: 2, total: 100, scaled: 15 },
      totalScaled: 15,
    });

    const mini = buildAttemptResult({
      questions: questions.slice(0, 20),
      answers: [],
      timings: [],
      durationMs: 1,
      conversion: {
        name: 'Form table',
        source: null,
        version: 1,
        isOfficial: false,
        listeningMappingJson: { 0: 5 },
        readingMappingJson: {},
      },
    });
    expect(mini.score.hasConversion).toBe(false);
    expect(mini.score.listening.scaled).toBeNull();
  });
});

function question(
  questionId: string,
  number: number,
  part: 'PART_1' | 'PART_5' | 'PART_6',
  correctOptionId: string,
  kind: 'LISTENING' | 'READING' = 'READING',
) {
  return { questionId, number, part, correctOptionId, kind } as const;
}
