# arq-api-container

Arquetipo de API contenerizada NestJS + Fastify (TypeScript). Punto de partida para proyectos que se despliegan como contenedor —dentro o fuera de AWS— con Clean Architecture y pruebas BDD. Incluye una feature de referencia `ping/pong` y un módulo `health` completamente implementados.

Todo lo transversal —errores, logging, decorador de ejecución, tipos de respuesta— vive en las librerías [`@gpkit/*`](https://www.npmjs.com/package/@gpkit/core), no en este repositorio. Aquí solo queda el negocio y el cableado.

El artefacto de despliegue es **la imagen Docker**: el mismo repo sirve para Railway, DigitalOcean, cualquier VPS, EC2, ECS o EKS.

---

## Índice

- [Las librerías de la plataforma](#las-librerías-de-la-plataforma)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Stack técnico](#stack-técnico)
- [Feature de referencia: ping/pong](#feature-de-referencia-pingpong)
- [Cómo se escribe un controller](#cómo-se-escribe-un-controller)
- [Documentación OpenAPI](#documentación-openapi)
- [Fronteras de arquitectura](#fronteras-de-arquitectura)
- [Instalación y desarrollo local](#instalación-y-desarrollo-local)
- [Tests](#tests)
- [Despliegue](#despliegue)

---

## Las librerías de la plataforma

| Paquete | Qué aporta a este proyecto |
|---|---|
| `@gpkit/core` | `CustomException`, `ValidationException`, `ErrorDictionary`, `getLogger()` con sink de consola por defecto, `@HandleExecution`, tipos `ApiSuccessBody`/`ApiErrorBody` |
| `@gpkit/arch-rules` | Perfil de dependency-cruiser que verifica las fronteras entre capas |

`@gpkit/aws` (clientes de DynamoDB, S3, SQS, SNS, SES, Step Functions, SSM) **no está instalado**: la feature `ping` no toca ningún servicio. Al añadir el primero:

```bash
npm i @gpkit/aws @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb   # solo el peer que uses
```

`@gpkit/aws-lambda` **no se usa aquí**: es lambda-only (middy, Powertools, factories de handler). Su equivalente en este arquetipo son el filtro y el interceptor globales de NestJS.

**Regla dura:** si algo de una librería resuelve lo que necesitas, se usa — no se escribe una versión local ni un wrapper que la envuelva. Si la librería no cubre un caso real, se reporta a `gpalacios-platform` en vez de taparlo aquí.

---

## Estructura del proyecto

```
arq-api-container/
  docker/                          # Dockerfile + docker-compose
  specs/                           # Documentación OpenAPI modular
  src/
    main.ts                        # Bootstrap: NestFactory + FastifyAdapter + globales
    app.module.ts                  # Importa los módulos de feature
    common/                        # Solo lo específico de este proyecto
      config/env.config.ts         # Configuración tipada desde env
      constants/server.constants.ts
      errors/app.error-dictionary.ts  # Errores de negocio propios (prefijo ARQ-)
      filters/                     # HttpExceptionFilter — traduce excepciones a HTTP
      interceptors/                # ResponseInterceptor — envuelve la respuesta en { data }
    health/                        # Módulo de salud — mismo layering que cualquier feature
      domain/ application/ infrastructure/
    ping/                          # Feature de referencia
      domain/
        constants/                 # PONG_MESSAGE
        service/                   # PingService — lógica de negocio
        types/                     # PingInput, PingOutput
      application/
        dtos/                      # PingRequestSchema (Zod)
        use-cases/                 # PingUseCase
      infrastructure/
        bootstrap/                 # PingModule (wiring con useFactory)
        controller/                # PingController + @HandleExecution
  test/
    health/ ping/                  # features/*.feature + *.steps.ts
```

`src/common/` es deliberadamente mínimo. Los errores transversales, el contrato de logger y el decorador de ejecución están en las librerías.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22, TypeScript 5.7 strict |
| Framework | NestJS 11 + `@nestjs/platform-fastify` (Fastify 5) |
| Plataforma | `@gpkit/core` |
| Validación | Zod 3.x |
| Tests | jest-cucumber 4.x (BDD: `.feature` + `.steps.ts`) |
| Arquitectura | dependency-cruiser + `@gpkit/arch-rules` |
| Documentación | OpenAPI 3.0.3 modular + Redocly CLI |
| Contenedor | Dockerfile multi-stage (Node 22 alpine) |
| Calidad | Prettier 3.x + Husky 9.x (pre-commit y pre-push) |

---

## Feature de referencia: ping/pong

### Endpoint

```
POST /ping
Content-Type: application/json

{ "message": "hello" }
```

**Response `200`:**
```json
{
  "data": {
    "message": "pong",
    "echo": "hello",
    "receivedAt": "2026-05-27T10:00:00.000Z"
  }
}
```

**Response `400` — mensaje vacío:**
```json
{
  "code": "CORE-001",
  "description": "El cuerpo de la solicitud no es válido",
  "issues": [{ "path": ["message"], "message": "String must contain at least 1 character(s)" }]
}
```

El módulo `health` expone `GET /health` con el estado y el uptime del proceso. Es el destino del `HEALTHCHECK` de la imagen.

> Las rutas **no llevan prefijo de versión**. El `v1` lo antepone el recurso que expone la API (API Gateway, ingress, reverse proxy), no el contenedor.

### Códigos de error

Los transversales los aporta `ErrorDictionary` de `@gpkit/core` — no se redefinen aquí:

| Código | HTTP | Descripción |
|---|---|---|
| `CORE-001` | 400 | El cuerpo de la solicitud no es válido |
| `CORE-002` | 500 | Ocurrió un error inesperado |
| `CORE-003` | 500 | Variable de entorno requerida no encontrada |
| `CORE-004` | 403 | No tiene autorización para acceder a este recurso |

Los errores **de negocio** de cada proyecto van en `src/common/errors/app.error-dictionary.ts`, con la misma forma `InputError` y un prefijo propio. Nunca se mezclan con los `CORE-*`.

---

## Cómo se escribe un controller

El controller declara la ruta con decoradores, delega al use-case y devuelve el tipo de dominio. No arma la respuesta ni captura errores: de eso se encargan los globales de `main.ts`.

```ts
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
```

| Mecanismo | Responsabilidad |
|---|---|
| `ResponseInterceptor` | Envuelve todo retorno en `{ data }` |
| `HttpExceptionFilter` | Traduce `CustomException` / `ValidationException` a su status y cuerpo |
| `@HandleExecution('Ping')` | Registra inicio, fin y duración. **Sin `onError`** — el filtro ya maneja el error |

El wiring del módulo es explícito, con `useFactory` e `inject` provider por provider:

```ts
@Module({
  controllers: [PingController],
  providers: [
    { provide: PingService, useFactory: () => new PingService() },
    {
      provide: PingUseCase,
      useFactory: (service: PingService) => new PingUseCase(service),
      inject: [PingService],
    },
  ],
})
export class PingModule {}
```

---

## Documentación OpenAPI

La especificación vive en `specs/`, modular por recurso (mismo esquema que los proyectos de plataforma):

```
specs/
  openapi.yaml                     # Entry point — tags + $ref a cada path
  paths/<feature>/<operacion>.yaml
  components/
    schemas/                       # Contratos de entrada y salida
    responses/shared.yaml          # Respuestas de error reutilizables
    examples/core-errors.yaml
```

```bash
npm run lint         # eslint sobre el código + redocly sobre la especificación
npm run spec         # empaqueta todo en local-docs/openapi.yaml
```

Al añadir un endpoint se agrega su `paths/` y se referencia desde `openapi.yaml`.

---

## Fronteras de arquitectura

```bash
npm run arch:check
```

Aplica el perfil `@gpkit/arch-rules/serverless-nest` sobre `src/`:

- ninguna feature importa los internos de otra
- `domain/` no conoce `application/` ni `infrastructure/`
- `application/` no conoce `infrastructure/` (se inyecta al revés, con DI)
- `src/common/` no depende de ninguna feature
- el código de aplicación nunca importa de `infra/`

Corre en el hook `pre-push`. `lint-staged` corre en `pre-commit`.

---

## Instalación y desarrollo local

```bash
npm install

npm run start:dev     # Nest CLI en watch — recompila y reinicia solo
npm run typecheck     # tsc --noEmit sobre src/ y test/
npm run lint          # eslint + redocly
npm run arch:check    # Fronteras de arquitectura
npm test              # Tests BDD con cobertura
npm run format        # Formatear código
```

En contenedor:

```bash
docker compose -f docker/docker-compose.yml up --build
```

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/ping -H "Content-Type: application/json" -d '{"message":"hola"}'
```

---

## Tests

```bash
npm test
```

Los tests usan **jest-cucumber**: cada feature tiene un archivo `.feature` (Gherkin) y un `.steps.ts`. Los escenarios HTTP levantan la aplicación real con `Test.createTestingModule` + `app.inject`.

| Suite | Escenarios | Cobertura |
|---|---|---|
| `test/ping/ping.steps.ts` | 4 | 100% |
| `test/health/health.steps.ts` | 1 | 100% |

---

## Despliegue

La imagen es multi-stage, corre como usuario `node`, sin dev-dependencies, con `HEALTHCHECK` apuntando a `/health`. El apagado limpio ante `SIGTERM` lo maneja `app.enableShutdownHooks()`.

```bash
docker build -f docker/Dockerfile -t arq-api-container .
docker run -p 3000:3000 arq-api-container
```

El contexto de build es la raíz del repo, por eso el `.dockerignore` vive ahí: Docker solo lo lee desde la raíz del contexto.

| Destino | Cómo |
|---|---|
| Railway / DigitalOcean / VPS | apuntan a `docker/Dockerfile` |
| AWS ECS / EKS / EC2 | misma imagen, publicada en ECR |

### Sobre `infra/`

Este arquetipo **no trae `infra/`**. La infraestructura es específica del destino y no todos son AWS. Si el proyecto se despliega en AWS, se agrega una carpeta `infra/` con el stack CDK (ECS Fargate apuntando a esta misma imagen) siguiendo las convenciones de `gap-cdk`; si el destino no es AWS, la carpeta simplemente no existe y el repo funciona igual.

> La carpeta de IaC **debe** llamarse `infra/`: la regla `no-src-imports-infra` ancla ahí su ruta. Con otro nombre pasa en verde sin verificar nada.
