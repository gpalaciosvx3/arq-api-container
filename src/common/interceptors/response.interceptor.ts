import { Injectable } from '@nestjs/common';
import { map } from 'rxjs/operators';
import type { ApiSuccessBody } from '@gpkit/core';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessBody<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessBody<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
