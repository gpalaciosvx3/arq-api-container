# arq-api-container

Arquetipo de **API contenerizada** con NestJS + Fastify, Clean Architecture y pruebas BDD. El artefacto es la imagen Docker, que corre igual en cualquier destino de contenedores. Incluye la feature de referencia `ping/pong` y un módulo `health`.

| Ficha | |
|---|---|
| Destino | Cualquier runtime de contenedores: ECS, EKS, EC2, Railway, DigitalOcean, VPS |
| Runtime | Node.js 22 · TypeScript 5.7 strict |
| Framework | NestJS 11 + Fastify 5 |
| Plataforma | `@gpkit/core` · `@gpkit/arch-rules` |
| Artefacto | Imagen Docker multi-stage (`docker/Dockerfile`) |
| Despliegue | `aws-ecr-publish` |
| Contrato IaC | Nomenclatura `{REGION}{PROYECTO}{SERVICIO}{NNN}` |

---

## Índice

1. [Alcance](#1-alcance)
2. [Arquitectura](#2-arquitectura)
3. [Plataforma](#3-plataforma)
4. [Feature de referencia](#4-feature-de-referencia)
5. [Desarrollo local](#5-desarrollo-local)
6. [Calidad](#6-calidad)
7. [Despliegue](#7-despliegue)
8. [Contrato con IaC](#8-contrato-con-iac)
9. [Anexos](#9-anexos)

---

## 1. Alcance

| Recurso | Dónde vive |
|---|---|
| Código de la API y su especificación OpenAPI | **Aquí** (`src/`, `specs/`) |
| Imagen Docker | **Aquí** (`docker/`) |
| Registro de imágenes (ECR u otro) | IaC |
| Cluster, red, balanceador, dominio, certificados | IaC |
| Prefijo de versión (`/v1`) y exposición pública | El recurso que expone la API (API Gateway, ingress, reverse proxy) |

---

## 2. Arquitectura

### Estructura

```
arq-api-container/
  src/
    main.ts                           # Bootstrap: NestFactory + FastifyAdapter + globales
    app.module.ts                     # Importa los módulos de feature
    common/
      config/env.config.ts            # Configuración tipada desde env
      constants/server.constants.ts
      errors/app.error-dictionary.ts  # Errores de negocio propios (prefijo ARQ-)
      filters/                        # HttpExceptionFilter — excepciones a HTTP
      interceptors/                   # ResponseInterceptor — envuelve la respuesta en { data }
    health/                           # Módulo de salud — mismo layering que cualquier feature
    ping/
      domain/                         # constants/  service/  types/
      application/                    # dtos/  use-cases/
      infrastructure/
        bootstrap/                    # PingModule (wiring con useFactory)
        controller/                   # PingController + @HandleExecution
  test/
    health/  ping/                    # features/*.feature + *.steps.ts
  specs/                              # OpenAPI modular
  docker/                             # Dockerfile + docker-compose
```

### Stack técnico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22, TypeScript 5.7 strict |
| Framework | NestJS 11 + `@nestjs/platform-fastify` (Fastify 5) |
| Validación | Zod 3.x |
| Tests | jest-cucumber 4.x |
| Arquitectura | dependency-cruiser + `@gpkit/arch-rules` |
| Documentación | OpenAPI 3.0.3 modular + Redocly CLI |
| Contenedor | Dockerfile multi-stage (Node 22 alpine) |
| Calidad | ESLint + Prettier + Husky |

### Capas

`domain/` y `application/` importan únicamente `@gpkit/core`. El controller declara la ruta, delega al use-case y devuelve el tipo de dominio; los globales de `main.ts` arman la respuesta y traducen los errores (ver [9.1](#91-cómo-se-escribe-un-controller)).

---

## 3. Plataforma

| Paquete | Qué aporta |
|---|---|
| `@gpkit/core` | `CustomException`, `ValidationException`, `ErrorDictionary`, `getLogger()` con sink de consola, `@HandleExecution`, tipos `ApiSuccessBody` / `ApiErrorBody` |
| `@gpkit/arch-rules` | Perfil de dependency-cruiser con las fronteras entre capas |

**No instalado:** `@gpkit/aws` (clientes de DynamoDB, S3, SQS, SNS, SES, Step Functions, SSM). `ping` no toca ningún servicio. Al añadir el primero: `npm i @gpkit/aws` + el peer del SDK que uses. Las librerías de funciones (`@gpkit/aws-lambda`, `@gpkit/azure-functions`) no aplican: su papel lo cumplen el filtro y el interceptor globales de NestJS.

**Regla dura:** si una librería resuelve lo que necesitas, se usa. Si no cubre un caso real, se agrega en `pt-npm-packages`, no aquí.

---

## 4. Feature de referencia

Las rutas no llevan prefijo de versión: el `/v1` lo antepone el recurso que expone la API.

```
POST /ping
Content-Type: application/json

{ "message": "hello" }
```

**`200`**

```json
{ "data": { "message": "pong", "echo": "hello", "receivedAt": "2026-05-27T10:00:00.000Z" } }
```

**`400`** — mensaje vacío

```json
{
  "code": "CORE-001",
  "description": "El cuerpo de la solicitud no es válido",
  "issues": [{ "path": ["message"], "message": "String must contain at least 1 character(s)" }]
}
```

`GET /health` devuelve el estado y el uptime del proceso; es el destino del `HEALTHCHECK` de la imagen.

| Código | HTTP | Descripción |
|---|---|---|
| `CORE-001` | 400 | El cuerpo de la solicitud no es válido |
| `CORE-002` | 500 | Ocurrió un error inesperado |
| `CORE-003` | 500 | Variable de entorno requerida no encontrada |
| `CORE-004` | 403 | No tiene autorización para acceder a este recurso |

Los `CORE-*` vienen de `@gpkit/core`. Los errores de negocio van en `src/common/errors/app.error-dictionary.ts` con prefijo propio.

---

## 5. Desarrollo local

```bash
npm install
npm run start:dev     # Nest CLI en watch
```

En contenedor:

```bash
docker compose -f docker/docker-compose.yml up --build

curl http://localhost:3000/health
curl -X POST http://localhost:3000/ping -H "Content-Type: application/json" -d '{"message":"hola"}'
```

Variables en `.env.example`: `PORT`, `HOST`.

---

## 6. Calidad

| Script | Qué verifica |
|---|---|
| `npm run typecheck` | Tipos de `src/` y `test/` |
| `npm run lint` | ESLint sobre el código + Redocly sobre `specs/` |
| `npm run arch:check` | Fronteras de capas sobre `src/` |
| `npm test` | Escenarios BDD (jest-cucumber); los HTTP levantan la app real con `app.inject` |
| `npm run format` | Prettier |

Reglas de `arch:check`: ninguna feature importa internos de otra; `domain/` no conoce `application/` ni `infrastructure/`; `application/` no conoce `infrastructure/`; `src/common/` no depende de features; `src/` nunca importa de `infra/`. Si algún día se agrega IaC, la carpeta **debe** llamarse `infra/`.

Hooks: `lint-staged` en `pre-commit`, `arch:check` en `pre-push`.

---

## 7. Despliegue

| Workflow | Disparador | Acción |
|---|---|---|
| `publish.yml` | `pull_request` a `master` | `node-validate`: tipos, lint, `arch:check`, tests y `docker build` |
| `publish.yml` | `push` a `master` | `aws-ecr-publish` |
| `publish-manual.yml` | Manual | Publica cualquier rama, tag o SHA |

Las plantillas viven en `pt-ci-pipelines` y autentican por OIDC.

**Variables del environment `deployer`**

| Variable | Uso |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Rol que asume el pipeline |
| `AWS_ACCOUNT_ID` | Cuenta del registro |
| `AWS_REGION` | Región del registro |

**Qué despliega:** la imagen, con el tag del commit, en el repositorio de ECR del mismo nombre que el repo. La imagen es multi-stage, corre como usuario `node`, sin dev-dependencies, con `HEALTHCHECK` a `/health` y apagado limpio ante `SIGTERM`.

| Destino | Cómo |
|---|---|
| AWS ECS / EKS / EC2 | Imagen publicada en ECR por este repo |
| Railway / DigitalOcean / VPS | Construyen `docker/Dockerfile` desde el repo; el workflow se cambia por el de su plataforma |

---

## 8. Contrato con IaC

**Nomenclatura, sin SSM.** Ambos lados construyen el mismo nombre con `{REGION}{PROYECTO}{SERVICIO}{NNN}`.

| Dirección | Qué | Cómo |
|---|---|---|
| IaC → API | Registro de imágenes | Lo crea IaC con el nombre del repo; este repo solo publica |
| IaC → API | Cluster, red, balanceador | Los crea IaC; el servicio que corre la imagen se declara en el destino |

- **Orden del primer despliegue:** IaC primero, este repo después.

---

## 9. Anexos

### 9.1 Cómo se escribe un controller

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
| `@HandleExecution('Ping')` | Registra inicio, fin y duración. Sin `onError`: el filtro ya maneja el error |

El wiring del módulo es explícito, con `useFactory` e `inject` provider por provider.

### 9.2 Documentación OpenAPI

```
specs/
  openapi.yaml                        # Entry point — tags + $ref a cada path
  paths/<feature>/<operacion>.yaml
  components/
    schemas/                          # Contratos de entrada y salida
    responses/shared.yaml             # Respuestas de error reutilizables
    examples/core-errors.yaml
```

`npm run spec` empaqueta todo en `local-docs/openapi.yaml`. Al añadir un endpoint se agrega su archivo en `paths/` y se referencia desde `openapi.yaml`.
