import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('should transform and validate a valid payload', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.string().email(),
        age: z.coerce.number().int(),
      }),
    );

    const result = pipe.transform({ email: 'user@example.com', age: '42' }, {
      type: 'body',
    } as never);

    expect(result).toEqual({ email: 'user@example.com', age: 42 });
  });

  it('should throw a bad request exception for invalid payload', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.string().email(),
      }),
    );

    expect(() =>
      pipe.transform({ email: 'not-an-email' }, { type: 'body' } as never),
    ).toThrow(BadRequestException);
  });
});
