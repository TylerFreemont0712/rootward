/** Why a command was refused. Codes are stable for tests and the UI; messages are for players. */
export interface DomainError {
  code: string;
  message: string;
}

// LEARN: rules that can refuse an action return a value instead of throwing. The caller must look at `ok` before it
// can reach `events`, so "the player tried to Cast with no Focus" is handled as ordinary game flow, while thrown
// exceptions stay reserved for real bugs.
export type Decision<T> = { ok: true; events: T[] } | { ok: false; error: DomainError };

export function accept<T>(...events: T[]): Decision<T> {
  return { ok: true, events };
}

export function refuse<T>(code: string, message: string): Decision<T> {
  return { ok: false, error: { code, message } };
}
