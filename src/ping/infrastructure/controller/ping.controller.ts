import { HandleExecution } from '@gpkit/core';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PingUseCase } from '../../application/use-cases/ping.usecase';
import type { PingOutput } from '../../domain/types/ping-output.types';

@Controller('ping')
export class PingController {
  constructor(private readonly ping: PingUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @HandleExecution('Ping')
  pong(@Body() body: unknown): PingOutput {
    return this.ping.execute(body);
  }
}
