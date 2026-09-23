import 'reflect-metadata';
import { getLogger } from '@gpkit/core';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { envConfig } from './common/config/env.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  await app.listen({ port: envConfig.port, host: envConfig.host });
  getLogger().info('Servidor escuchando', { port: envConfig.port, host: envConfig.host });
};

void bootstrap();
