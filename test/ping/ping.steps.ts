import { ValidationException } from '@gpkit/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { PingUseCase } from '../../src/ping/application/use-cases/ping.usecase';
import { PingService } from '../../src/ping/domain/service/ping.service';
import { PingModule } from '../../src/ping/infrastructure/bootstrap/ping.module';
import type { PingOutput } from '../../src/ping/domain/types/ping-output.types';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const feature = loadFeature('./test/ping/features/ping.feature');

const buildApp = async (): Promise<NestFastifyApplication> => {
  const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
};

defineFeature(feature, (test) => {
  let useCase: PingUseCase;
  let rawInput: unknown;
  let result: PingOutput;
  let caughtError: unknown;
  let app: NestFastifyApplication;
  let httpResponse: { statusCode: number; body: string };

  beforeEach(() => {
    useCase = new PingUseCase(new PingService());
    caughtError = undefined;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('Retorna pong con el mensaje recibido', ({ given, when, then, and }) => {
    given(/^un mensaje de entrada "(.*)"$/, (mensaje: string) => {
      rawInput = { message: mensaje };
    });

    when('se ejecuta el use case', () => {
      result = useCase.execute(rawInput);
    });

    then(/^la respuesta contiene message "(.*)"$/, (esperado: string) => {
      expect(result.message).toBe(esperado);
    });

    and(/^la respuesta contiene echo "(.*)"$/, (esperado: string) => {
      expect(result.echo).toBe(esperado);
    });

    and('la respuesta contiene receivedAt con formato ISO', () => {
      expect(new Date(result.receivedAt).toISOString()).toBe(result.receivedAt);
    });
  });

  test('Falla con mensaje vacío', ({ given, when, then }) => {
    given(/^un mensaje de entrada "(.*)"$/, (mensaje: string) => {
      rawInput = { message: mensaje };
    });

    when('se ejecuta el use case', () => {
      try {
        result = useCase.execute(rawInput);
      } catch (error) {
        caughtError = error;
      }
    });

    then('se lanza una ValidationException', () => {
      expect(caughtError).toBeInstanceOf(ValidationException);
    });
  });

  test('Expone el endpoint HTTP de ping', ({ given, when, then, and }) => {
    given('la aplicacion levantada', async () => {
      app = await buildApp();
    });

    when(
      /^se envia un POST a "(.*)" con el mensaje "(.*)"$/,
      async (ruta: string, mensaje: string) => {
        httpResponse = await app.inject({
          method: 'POST',
          url: ruta,
          payload: { message: mensaje },
        });
      },
    );

    then(/^el status code es (\d+)$/, (esperado: string) => {
      expect(httpResponse.statusCode).toBe(Number(esperado));
    });

    and(/^el cuerpo contiene echo "(.*)"$/, (esperado: string) => {
      expect(JSON.parse(httpResponse.body).data.echo).toBe(esperado);
    });
  });

  test('Rechaza un mensaje vacio por HTTP', ({ given, when, then, and }) => {
    given('la aplicacion levantada', async () => {
      app = await buildApp();
    });

    when(
      /^se envia un POST a "(.*)" con el mensaje "(.*)"$/,
      async (ruta: string, mensaje: string) => {
        httpResponse = await app.inject({
          method: 'POST',
          url: ruta,
          payload: { message: mensaje },
        });
      },
    );

    then(/^el status code es (\d+)$/, (esperado: string) => {
      expect(httpResponse.statusCode).toBe(Number(esperado));
    });

    and(/^el cuerpo contiene el code "(.*)"$/, (esperado: string) => {
      expect(JSON.parse(httpResponse.body).code).toBe(esperado);
    });
  });
});
