import {
  type ActionRequest,
  ChallengeListResponse,
  type ChooseRequest,
  type CreateProfileRequest,
  DebriefResponse,
  type EnterRoomRequest,
  ErrorResponse,
  type InspectRequest,
  LearnerResponse,
  type MoveWorldRequest,
  MoveWorldResponse,
  ProfileListResponse,
  ProfileResponse,
  type ResolveMarkerRequest,
  RunResponse,
  ShardrunCodexResponse,
  type ShardrunCommandRequest,
  type ShardrunDevRequest,
  ShardrunPreviewsResponse,
  ShardrunResponse,
  ShardrunStatusResponse,
  type StartEncounterRequest,
  type StartExpeditionRequest,
  type StartShardrunRequest,
  type StartWorldRequest,
  type TalkRequest,
  type TravelRequest,
  WorldActionResponse,
  WorldResponse,
  LOCALE_HEADER,
  WorldStatusResponse,
} from "@rootward/shared";
import type { z } from "zod";
import { useLocaleStore } from "../i18n/index.ts";

/** A failed API call with the server's error code, or a client-side code such as "network" or "invalid-response". */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// LEARN: the client validates responses with the same zod schemas the server used to build them. If the two ever
// drift apart, the mismatch shows up here as a clear error instead of as `undefined` deep inside a component.
async function request<T extends z.ZodType>(
  method: "GET" | "POST",
  url: string,
  schema: T,
  body?: unknown,
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // The locale rides on every request (ADR-0018), so content comes back translated without any call site
      // knowing about it. The UI's own strings are translated in the browser; this is for what the server builds.
      headers: {
        [LOCALE_HEADER]: useLocaleStore.getState().locale,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, "network", `Cannot reach the Rootward server: ${String(error)}`);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text === "" ? undefined : JSON.parse(text);
  } catch {
    throw new ApiError(response.status, "invalid-response", `The server sent something that is not JSON (${response.status}).`);
  }

  if (!response.ok) {
    const error = ErrorResponse.safeParse(payload);
    if (error.success) throw new ApiError(response.status, error.data.error.code, error.data.error.message);
    throw new ApiError(response.status, "http-error", `Request failed with status ${response.status}.`);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(response.status, "invalid-response", "The server's response does not match this client's contract.");
  }
  return parsed.data;
}

/** Every route below is scoped to one character (ADR-0010): each has its own runs and mastery. */
const profileUrl = (profileId: string, suffix = "") => `/api/profiles/${encodeURIComponent(profileId)}${suffix}`;
const profileRunUrl = (profileId: string, runId: string, suffix = "") =>
  `${profileUrl(profileId)}/runs/${encodeURIComponent(runId)}${suffix}`;
const worldUrl = (profileId: string, suffix = "") => `${profileUrl(profileId)}/world${suffix}`;
const markerUrl = (profileId: string, markerId: string, suffix: string) =>
  worldUrl(profileId, `/markers/${encodeURIComponent(markerId)}${suffix}`);

export const api = {
  // Global content, not player data: not scoped to a character.
  challenges: () => request("GET", "/api/challenges", ChallengeListResponse),

  profiles: () => request("GET", "/api/profiles", ProfileListResponse),
  createProfile: (body: CreateProfileRequest) => request("POST", "/api/profiles", ProfileResponse, body),

  startEncounter: (profileId: string, body: StartEncounterRequest) =>
    request("POST", profileUrl(profileId, "/encounters"), RunResponse, body),
  startExpedition: (profileId: string, body: StartExpeditionRequest) =>
    request("POST", profileUrl(profileId, "/expeditions"), RunResponse, body),
  getRun: (profileId: string, runId: string) => request("GET", profileRunUrl(profileId, runId), RunResponse),
  enterRoom: (profileId: string, runId: string, body: EnterRoomRequest) =>
    request("POST", profileRunUrl(profileId, runId, "/rooms"), RunResponse, body),
  act: (profileId: string, runId: string, action: ActionRequest) =>
    request("POST", profileRunUrl(profileId, runId, "/actions"), RunResponse, action),
  debrief: (profileId: string, runId: string) => request("GET", profileRunUrl(profileId, runId, "/debrief"), DebriefResponse),
  learner: (profileId: string) => request("GET", profileUrl(profileId, "/learner"), LearnerResponse),

  // The world (ADR-0011): towns and wilds with people, quests, and fights.
  world: (profileId: string) => request("GET", worldUrl(profileId), WorldStatusResponse),
  startWorld: (profileId: string, body: StartWorldRequest) => request("POST", worldUrl(profileId, "/start"), WorldResponse, body),
  moveWorld: (profileId: string, body: MoveWorldRequest) => request("POST", worldUrl(profileId, "/move"), MoveWorldResponse, body),
  travel: (profileId: string, body: TravelRequest) => request("POST", worldUrl(profileId, "/travel"), WorldActionResponse, body),
  talk: (profileId: string, body: TalkRequest) => request("POST", worldUrl(profileId, "/talk"), WorldActionResponse, body),
  choose: (profileId: string, body: ChooseRequest) => request("POST", worldUrl(profileId, "/choose"), WorldActionResponse, body),
  inspect: (profileId: string, body: InspectRequest) => request("POST", worldUrl(profileId, "/inspect"), WorldActionResponse, body),
  startMarker: (profileId: string, markerId: string) => request("POST", markerUrl(profileId, markerId, "/start"), RunResponse),
  resolveMarker: (profileId: string, markerId: string, body: ResolveMarkerRequest) =>
    request("POST", markerUrl(profileId, markerId, "/resolve"), WorldResponse, body),

  // Shardrun (ADR-0012): the roguelite mode.
  shardrun: (profileId: string) => request("GET", profileUrl(profileId, "/shardrun"), ShardrunStatusResponse),
  startShardrun: (profileId: string, body: StartShardrunRequest) =>
    request("POST", profileUrl(profileId, "/shardrun/start"), ShardrunResponse, body),
  shardrunCommand: (profileId: string, body: ShardrunCommandRequest) =>
    request("POST", profileUrl(profileId, "/shardrun/command"), ShardrunResponse, body),
  shardrunDev: (profileId: string, body: ShardrunDevRequest) =>
    request("POST", profileUrl(profileId, "/shardrun/dev"), ShardrunResponse, body),
  shardrunPreviews: (profileId: string) => request("GET", profileUrl(profileId, "/shardrun/previews"), ShardrunPreviewsResponse),
  /** All Shardrun content, for the Codex; not scoped to a character. */
  shardrunCodex: (language: string) => request("GET", `/api/shardrun/codex?language=${encodeURIComponent(language)}`, ShardrunCodexResponse),
};
