import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { ENGINE_VERSION } from "@rootward/content-schema";
import {
  ActionRequest,
  ChallengeListResponse,
  ChooseRequest,
  CreateProfileRequest,
  DebriefResponse,
  EnterRoomRequest,
  ErrorResponse,
  HealthResponse,
  InspectRequest,
  LearnerResponse,
  MoveWorldRequest,
  MoveWorldResponse,
  ProfileListResponse,
  ProfileResponse,
  ResolveMarkerRequest,
  RunResponse,
  ShardrunCommandRequest,
  ShardrunPreviewsResponse,
  ShardrunResponse,
  ShardrunStatusResponse,
  StartEncounterRequest,
  StartExpeditionRequest,
  StartShardrunRequest,
  StartWorldRequest,
  TalkRequest,
  TravelRequest,
  WorldActionResponse,
  WorldResponse,
  WorldStatusResponse,
} from "@rootward/shared";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import type { GameContent } from "./content.ts";
import { ServiceError } from "./errors.ts";
import type { ProfileService } from "./profiles/service.ts";
import { classCards, profileSummary, startingClass } from "./profiles/summary.ts";
import type { RunServiceRegistry } from "./runs/registry.ts";
import { DEFAULT_CLASS_ID, type RunService } from "./runs/service.ts";
import type { Sandbox } from "./sandbox.ts";
import type { ShardrunService } from "./shardrun/service.ts";
import type { WorldService } from "./world/service.ts";

export interface AppDeps {
  service: RunService;
  sandbox: Sandbox;
  /** Built client (apps/client/dist). Served when it exists, so `pnpm start` is one process. */
  clientDir?: string;
  logger?: boolean;
  /** Characters (ADR-0010): profile-scoped run routes and the world (ADR-0011), mirroring the unscoped routes above
   * without changing them. Optional so every existing caller of `buildApp` keeps compiling untouched. */
  profiles?: {
    profileService: ProfileService;
    registry: RunServiceRegistry;
    world: WorldService;
    content: GameContent;
    /** Shardrun, the roguelite mode (ADR-0012). */
    shardrun?: ShardrunService;
  };
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
    const { profileService, registry, world, content, shardrun } = deps.profiles;

    // The title screen's list: every character with a summary of what they have done, and the class new ones start as.
    app.get("/api/profiles", async () => {
      const profiles = await profileService.list();
      const summaries = await Promise.all(
        profiles.map(async (profile) => [profile.id, await profileSummary(profile, { content, registry, world })] as const),
      );
      const starting = startingClass(content, DEFAULT_CLASS_ID);
      return ProfileListResponse.parse({
        profiles,
        summaries: Object.fromEntries(summaries),
        ...(starting ? { startingClass: starting } : {}),
        classes: classCards(content),
      });
    });

    app.post("/api/profiles", async (request) => {
      const body = parseBody(CreateProfileRequest, request.body);
      const classId = body.classId ?? DEFAULT_CLASS_ID;
      const def = content.index.classes.get(classId)?.def;
      if (!def) throw new ServiceError(400, "unknown-class", `There is no class called ${classId}.`);
      if (def.status !== "playable") throw new ServiceError(400, "class-not-playable", `The ${def.name} cannot be played yet.`);
      return ProfileResponse.parse({ profile: await profileService.create(body.name, classId) });
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

    // Shardrun (ADR-0012): the roguelite mode. One run at a time per character; every change is a command.
    if (shardrun) {
      app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId/shardrun", async (request) =>
        ShardrunStatusResponse.parse({
          run: await shardrun.latest(request.params.profileId),
          languages: await shardrun.languages(),
          difficulties: shardrun.difficulties(),
        }),
      );

      app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/shardrun/start", async (request) =>
        ShardrunResponse.parse({
          run: await (async () => {
            const body = parseBody(StartShardrunRequest, request.body);
            return shardrun.start(request.params.profileId, body.language, body.difficulty);
          })(),
        }),
      );

      // A command answers as soon as its rules are applied; the next spell previews run in the sandbox afterwards, and this
      // waits for them (ADR-0013), so a cast never waits on previews it does not need.
      app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId/shardrun/previews", async (request) =>
        ShardrunPreviewsResponse.parse(await shardrun.previews(request.params.profileId)),
      );

      app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/shardrun/command", async (request) =>
        ShardrunResponse.parse({
          run: await shardrun.command(request.params.profileId, parseBody(ShardrunCommandRequest, request.body)),
        }),
      );
    }

    // The world (ADR-0010, ADR-0011): towns and wilds walked between expeditions, with people, quests, and fights.
    app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId/world", async (request) =>
      WorldStatusResponse.parse({ world: (await world.world(request.params.profileId)) ?? null }),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/start", async (request) =>
      WorldResponse.parse({
        world: await world.start(request.params.profileId, parseBody(StartWorldRequest, request.body).language),
      }),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/move", async (request) =>
      MoveWorldResponse.parse({ position: await world.move(request.params.profileId, parseBody(MoveWorldRequest, request.body)) }),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/travel", async (request) =>
      WorldActionResponse.parse(await world.travel(request.params.profileId, parseBody(TravelRequest, request.body).portalId)),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/talk", async (request) =>
      WorldActionResponse.parse(await world.talk(request.params.profileId, parseBody(TalkRequest, request.body).npcId)),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/choose", async (request) =>
      WorldActionResponse.parse(await world.choose(request.params.profileId, parseBody(ChooseRequest, request.body))),
    );

    app.post<{ Params: { profileId: string } }>("/api/profiles/:profileId/world/inspect", async (request) =>
      WorldActionResponse.parse(await world.inspect(request.params.profileId, parseBody(InspectRequest, request.body).featureId)),
    );

    app.post<{ Params: { profileId: string; markerId: string } }>(
      "/api/profiles/:profileId/world/markers/:markerId/start",
      async (request) => RunResponse.parse(await world.startMarkerEncounter(request.params.profileId, request.params.markerId)),
    );

    app.post<{ Params: { profileId: string; markerId: string } }>(
      "/api/profiles/:profileId/world/markers/:markerId/resolve",
      async (request) => {
        const { runId } = parseBody(ResolveMarkerRequest, request.body);
        return WorldResponse.parse({
          world: await world.resolveMarkerEncounter(request.params.profileId, request.params.markerId, runId),
        });
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
