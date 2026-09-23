import { getLogger } from '@gpkit/core';
import { Injectable } from '@nestjs/common';
import { PingConstants } from '../constants/ping.constants';
import type { PingInput } from '../types/ping-input.types';
import type { PingOutput } from '../types/ping-output.types';

@Injectable()
export class PingService {
  pong(input: PingInput): PingOutput {
    getLogger().step(1, 'Generando respuesta pong', { echo: input.message });

    return {
      message: PingConstants.PONG_MESSAGE,
      echo: input.message,
      receivedAt: new Date().toISOString(),
    };
  }
}
