import {
  type ActionRequest,
  ChallengeListResponse,
  type CreateProfileRequest,
  DebriefResponse,
  type EnterOverworldRequest,
  type EnterRoomRequest,
  ErrorResponse,
  LearnerResponse,
  type MoveOverworldRequest,
  OverworldRealmsResponse,
  OverworldResponse,
  ProfileListResponse,
  ProfileResponse,
  type ResolveOverworldEncounterRequest,
  RunResponse,
  type StartEncounterRequest,
  type StartExpeditionRequest,
} from "@rootward/shared";
import type { z } from "zod";

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
      headers: body === undefined ? {} : { "content-type": "application/json" },
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
const overworldUrl = (profileId: string, realmId: string, suffix = "") =>
  `${profileUrl(profileId)}/overworld/${encodeURIComponent(realmId)}${suffix}`;

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

  // The overworld (ADR-0010): a free-roam zone alongside the expedition above.
  overworldRealms: (profileId: string) => request("GET", profileUrl(profileId, "/overworld"), OverworldRealmsResponse),
  enterOverworld: (profileId: string, realmId: string, body: EnterOverworldRequest) =>
    request("POST", overworldUrl(profileId, realmId, "/enter"), OverworldResponse, body),
  getOverworld: (profileId: string, realmId: string) => request("GET", overworldUrl(profileId, realmId), OverworldResponse),
  moveOverworld: (profileId: string, realmId: string, body: MoveOverworldRequest) =>
    request("POST", overworldUrl(profileId, realmId, "/move"), OverworldResponse, body),
  startMarkerEncounter: (profileId: string, realmId: string, markerId: string) =>
    request("POST", overworldUrl(profileId, realmId, `/markers/${encodeURIComponent(markerId)}/start`), RunResponse),
  resolveMarkerEncounter: (profileId: string, realmId: string, markerId: string, body: ResolveOverworldEncounterRequest) =>
    request("POST", overworldUrl(profileId, realmId, `/markers/${encodeURIComponent(markerId)}/resolve`), OverworldResponse, body),
};
