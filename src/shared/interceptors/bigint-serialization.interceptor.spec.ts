import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { BigIntSerializationInterceptor } from './bigint-serialization.interceptor';

describe('BigIntSerializationInterceptor', () => {
  it('serializes nested bigint values for JSON responses', async () => {
    const interceptor = new BigIntSerializationInterceptor();
    const next = { handle: () => of({ sizeBytes: 2048n, nested: [1n] }) };

    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, next as CallHandler),
    );

    expect(result).toEqual({ sizeBytes: '2048', nested: ['1'] });
  });
});
