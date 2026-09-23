import { CustomException, ErrorDictionary, type ApiErrorBody } from '@gpkit/core';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof CustomException) {
      void reply.code(exception.statusCode).send(exception.toResponseBody());
      return;
    }

    if (exception instanceof HttpException) {
      const body: ApiErrorBody = new CustomException(
        ErrorDictionary.INTERNAL_ERROR,
        exception.message,
      ).toResponseBody();
      void reply.code(exception.getStatus()).send(body);
      return;
    }

    const detail = exception instanceof Error ? exception.message : String(exception);
    const body: ApiErrorBody = new CustomException(
      ErrorDictionary.INTERNAL_ERROR,
      detail,
    ).toResponseBody();
    void reply.code(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
  }
}
