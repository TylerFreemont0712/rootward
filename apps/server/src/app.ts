import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { ENGINE_VERSION } from "@rootward/content-schema";
import {
  ActionRequest,
  ChallengeListResponse,
  EnterRoomRequest,
  ErrorResponse,
  HealthResponse,
  RunResponse,
  StartEncounterRequest,
  StartExpeditionRequest,
} from "@rootward/shared";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ServiceError } from "./errors.ts";
import type { RunService } from "./runs/service.ts";
import type { Sandbox } from "./sandbox.ts";

export interface AppDeps {
  service: RunService;
  sandbox: Sandbox;
  /** Built client (apps/client/dist). Served when it exists, so `pnpm start` is one process. */
  clientDir?: string;
  logger?: boolean;
}

/** HTTP routes. Every request body is parsed with the shared zod contract, and every response is parsed before sending. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 2 * 1024 * 1024 });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ServiceError) return sendError(reply, error.status, error.code, error.message);
    // Fastify's own errors (malformed JSON, body too large) carry a 4xx statusCode; anything else is a bug.
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return sendError(reply, 500, "internal", "Something went wrong on the server; the log has details.");
    }
    return sendError(reply, statusCode, "bad-request", error instanceof Error ? error.message : String(error));
  });

  app.get("/api/health", async () => {
    const runners = await Promise.all(
      deps.sandbox.registry.list().map(async (runner) => ({
        id: runner.id,
        languages: [...runner.languages],
        available: await runner.isAvailable(),
      })),
    );
    return HealthResponse.parse({ ok: true, engineVersion: ENGINE_VERSION, runners });
  });

  app.get("/api/challenges", async () =>
    ChallengeListResponse.parse({ challenges: await deps.service.listChallenges() }),
  );

  app.post("/api/encounters", async (request) =>
    RunResponse.parse(await deps.service.startEncounter(parseBody(StartEncounterRequest, request.body))),
  );

  app.post("/api/expeditions", async (request) =>
    RunResponse.parse(await deps.service.startExpedition(parseBody(StartExpeditionRequest, request.body))),
  );

  app.get<{ Params: { runId: string } }>("/api/runs/:runId", async (request) =>
    RunResponse.parse(await deps.service.getRun(request.params.runId)),
  );

  app.post<{ Params: { runId: string } }>("/api/runs/:runId/rooms", async (request) =>
    RunResponse.parse(await deps.service.enterRoom(request.params.runId, parseBody(EnterRoomRequest, request.body))),
  );

  app.post<{ Params: { runId: string } }>("/api/runs/:runId/actions", async (request) =>
    RunResponse.parse(await deps.service.act(request.params.runId, parseBody(ActionRequest, request.body))),
  );

  if (deps.clientDir !== undefined && existsSync(path.join(deps.clientDir, "index.html"))) {
    await app.register(fastifyStatic, { root: deps.clientDir });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/api/")
        ? sendError(reply, 404, "not-found", "No such endpoint.")
        : reply.sendFile("index.html"),
    );
  }
  return app;
}

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ServiceError(400, "invalid-request", z.prettifyError(parsed.error));
  return parsed.data;
}

function sendError(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.status(status).send(ErrorResponse.parse({ error: { code, message } }));
}
