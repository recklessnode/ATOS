export type StableId = string;
export type IsoDateTimeString = string;

const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]*$/;

export function isStableId(value: unknown): value is StableId {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}
