import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { ENGINE_VERSION } from "@rootward/content-schema";
import {
  ActionRequest,
  ChallengeListResponse,
  CreateProfileRequest,
  DebriefResponse,
  EnterOverworldRequest,
  EnterRoomRequest,
  ErrorResponse,
  HealthResponse,
  LearnerResponse,
  MoveOverworldRequest,
  OverworldRealmsResponse,
  OverworldResponse,
  ProfileListResponse,
  ProfileResponse,
  ResolveOverworldEncounterRequest,
  RunResponse,
  StartEncounterRequest,
  StartExpeditionRequest,
} from "@rootward/shared";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ServiceError } from "./errors.ts";
import type { OverworldService } from "./overworld/service.ts";
import type { ProfileService } from "./profiles/service.ts";
import type { RunServiceRegistry } from "./runs/registry.ts";
import { DEFAULT_CLASS_ID, type RunService } from "./runs/service.ts";
import type { Sandbox } from "./sandbox.ts";

export interface AppDeps {
  service: RunService;
  sandbox: Sandbox;
  /** Built client (apps/client/dist). Served when it exists, so `pnpm start` is one process. */
  clientDir?: string;
  logger?: boolean;
  /** Characters (ADR-0010): profile-scoped run routes and the overworld, mirroring the unscoped routes above
   * without changing them. Optional so every existing caller of `buildApp` keeps compiling untouched. */
  profiles?: { profileService: ProfileService; registry: RunServiceRegistry; overworld: OverworldService };
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

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/debrief", async (request) =>
    DebriefResponse.parse({ debrief: await deps.service.debrief(request.params.runId) }),
  );

  app.get("/api/learner", async () => LearnerResponse.parse({ learner: await deps.service.learnerView() }));

  if (deps.profiles) {
    const { profileService, registry, overworld } = deps.profiles;

    app.get("/api/profiles", async () => ProfileListResponse.parse({ profiles: await profileService.list() }));

    app.post("/api/profiles", async (request) => {
      const body = parseBody(CreateProfileRequest, request.body);
      return ProfileResponse.parse({ profile: await profileService.create(body.name, DEFAULT_CLASS_ID) });
    });

    // Mirrors of the unscoped run routes above, one RunService per profile (ADR-0010) so each character's runs
    // and mastery stay independently scoped. The unscoped routes are untouched and keep working exactly as before.
    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/encounters", async (request) =>
      RunResponse.parse(
        await registry.forProfile(request.params.profileId).startEncounter(parseBody(StartEncounterRequest, request.body)),
      ),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/expeditions", async (request) =>
      RunResponse.parse(
        await registry.forProfile(request.params.profileId).startExpedition(parseBody(StartExpeditionRequest, request.body)),
      ),
    );

    app.get<{ Params: { profileId: string; runId: string } }>("/api/profiles/:profileId/runs/:runId", async (request) =>
      RunResponse.parse(await registry.forProfile(request.params.profileId).getRun(request.params.runId)),
    );

    app.post<{ Params: { profileId: string; runId: string } }>("/api/profiles/:profileId/runs/:runId/rooms", async (request) =>
      RunResponse.parse(
        await registry
          .forProfile(request.params.profileId)
          .enterRoom(request.params.runId, parseBody(EnterRoomRequest, request.body)),
      ),
    );

    app.post<{ Params: { profileId: string; runId: string } }>("/api/profiles/:profileId/runs/:runId/actions", async (request) =>
      RunResponse.parse(
        await registry.forProfile(request.params.profileId).act(request.params.runId, parseBody(ActionRequest, request.body)),
      ),
    );

    app.get<{ Params: { profileId: string; runId: string } }>("/api/profiles/:profileId/runs/:runId/debrief", async (request) =>
      DebriefResponse.parse({ debrief: await registry.forProfile(request.params.profileId).debrief(request.params.runId) }),
    );

    app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId/learner", async (request) =>
      LearnerResponse.parse({ learner: await registry.forProfile(request.params.profileId).learnerView() }),
    );

    // The overworld (ADR-0010): a free-roam zone alongside the expedition above.
    app.get("/api/profiles/:profileId/overworld", () => OverworldRealmsResponse.parse({ realms: overworld.realms() }));

    app.post<{ Params: { profileId: string; realmId: string } }>(
      "/api/profiles/:profileId/overworld/:realmId/enter",
      async (request) => {
        const body = parseBody(EnterOverworldRequest, request.body);
        const view = await overworld.enter(request.params.profileId, request.params.realmId, body.language);
        return OverworldResponse.parse({ overworld: view });
      },
    );

    app.get<{ Params: { profileId: string; realmId: string } }>(
      "/api/profiles/:profileId/overworld/:realmId",
      async (request) => {
        const view = await overworld.view(request.params.profileId, request.params.realmId);
        if (!view) throw new ServiceError(404, "overworld-not-entered", `Enter ${request.params.realmId} before viewing it.`);
        return OverworldResponse.parse({ overworld: view });
      },
    );

    app.post<{ Params: { profileId: string; realmId: string } }>(
      "/api/profiles/:profileId/overworld/:realmId/move",
      async (request) => {
        const body = parseBody(MoveOverworldRequest, request.body);
        await overworld.move(request.params.profileId, request.params.realmId, body.x, body.y);
        const view = await overworld.view(request.params.profileId, request.params.realmId);
        if (!view) throw new ServiceError(404, "overworld-not-entered", `Enter ${request.params.realmId} before moving in it.`);
        return OverworldResponse.parse({ overworld: view });
      },
    );

    app.post<{ Params: { profileId: string; realmId: string; markerId: string } }>(
      "/api/profiles/:profileId/overworld/:realmId/markers/:markerId/start",
      async (request) =>
        RunResponse.parse(
          await overworld.startMarkerEncounter(request.params.profileId, request.params.realmId, request.params.markerId),
        ),
    );

    app.post<{ Params: { profileId: string; realmId: string; markerId: string } }>(
      "/api/profiles/:profileId/overworld/:realmId/markers/:markerId/resolve",
      async (request) => {
        const body = parseBody(ResolveOverworldEncounterRequest, request.body);
        const view = await overworld.resolveMarkerEncounter(
          request.params.profileId,
          request.params.realmId,
          request.params.markerId,
          body.runId,
        );
        return OverworldResponse.parse({ overworld: view });
      },
    );
  }

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
