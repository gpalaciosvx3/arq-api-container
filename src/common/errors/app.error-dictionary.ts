import type { InputError } from '@gpkit/core';

export class AppErrorDictionary {
  static readonly PING_NOT_AVAILABLE: InputError = {
    code: 'ARQ-001',
    description: 'El servicio de ping no está disponible',
    statusCode: 503,
  };
}
