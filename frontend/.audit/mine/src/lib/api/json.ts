/** Minimal JSON value typing shared by parse/validation helpers. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Parse JSON safely; returns undefined instead of throwing on malformed input. */
export function parseJsonSafe(text: string): JsonValue | undefined {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}
