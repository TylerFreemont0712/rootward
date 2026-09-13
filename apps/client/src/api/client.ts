import {
  type ActionRequest,
  ChallengeListResponse,
  EncounterResponse,
  ErrorResponse,
  type StartEncounterRequest,
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

export const api = {
  challenges: () => request("GET", "/api/challenges", ChallengeListResponse),
  startEncounter: (body: StartEncounterRequest) => request("POST", "/api/encounters", EncounterResponse, body),
  getRun: (runId: string) => request("GET", `/api/runs/${encodeURIComponent(runId)}`, EncounterResponse),
  act: (runId: string, action: ActionRequest) =>
    request("POST", `/api/runs/${encodeURIComponent(runId)}/actions`, EncounterResponse, action),
};
