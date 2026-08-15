/**
 * Shared class-transformer @Transform helpers.
 *
 * Why these exist: `value?.trim()` / `value?.toLowerCase().trim()` only
 * guards against null/undefined. If a client sends a non-string type for
 * the field (an object, array, or number — e.g. `{"$ne": null}` in an
 * injection probe, or just a malformed client bug), `value` is truthy but
 * has no `.trim()`/`.toLowerCase()` method. That throws an uncaught
 * TypeError during class-transformer's plainToInstance step, which runs
 * BEFORE class-validator's decorators. The result is an unhandled 500
 * instead of the intended clean 400 validation error — and it happens on
 * every field using the old pattern, across every DTO in the codebase.
 *
 * These helpers no-op (return the value unchanged) for any non-string
 * input, so class-validator's own decorators (@IsString, @IsEmail, etc.)
 * are the ones that reject it correctly, with a proper 400 response.
 */

export function safeTrim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function safeEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.toLowerCase().trim() : value;
}
