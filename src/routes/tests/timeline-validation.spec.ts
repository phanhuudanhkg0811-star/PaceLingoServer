import { validateTimeline } from './test-drafts.service';
import type { TestDraftsService } from './test-drafts.service';

type TestTree = Awaited<ReturnType<TestDraftsService['findTree']>>;

describe('timeline validation', () => {
  it('allows segmented full tests to publish without a full-audio timeline', () => {
    const errors: Array<{ code: string; path: string; message: string }> = [];
    const warnings: Array<{ code: string; path: string; message: string }> = [];

    validateTimeline(
      {
        type: 'FULL_TEST',
        fullListeningAudio: null,
        timelineEvents: [],
      } as unknown as TestTree,
      errors,
      warnings,
    );

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('reports overlap, important gaps and missing listening end', () => {
    const errors: Array<{ code: string; path: string; message: string }> = [];
    const warnings: Array<{ code: string; path: string; message: string }> = [];
    validateTimeline(
      {
        type: 'FULL_TEST',
        fullListeningAudio: { durationMs: 30_000 },
        timelineEvents: [
          { type: 'QUESTION', order: 0, startMs: 0, endMs: 10_000 },
          { type: 'QUESTION', order: 1, startMs: 9_000, endMs: 12_000 },
          { type: 'QUESTION', order: 2, startMs: 20_000, endMs: 25_000 },
        ],
      } as unknown as TestTree,
      errors,
      warnings,
    );

    expect(errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'TIMELINE_OVERLAP',
        'TIMELINE_GAP',
        'INVALID_LISTENING_END',
      ]),
    );
  });
});
