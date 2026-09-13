import { z } from "zod";

// LEARN: languages are a closed list on purpose. Each one needs engine support (a runner, a test adapter, an editor
// mode), so adding a language is an engine change; adding challenges in an existing language is not.
export const LANGUAGE_IDS = ["python", "javascript", "typescript", "bash", "sql", "go", "rust", "c", "cpp"] as const;

export const Language = z.enum(LANGUAGE_IDS);
export type Language = z.infer<typeof Language>;
