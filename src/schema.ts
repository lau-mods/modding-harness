import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';

export const harnessRoot = fileURLToPath(new URL('../', import.meta.url));
export function schema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
}
const ajv = new Ajv({ allErrors: true, strict: true });
export function validateSchema<T>(name: string, value: unknown): T {
  const validate = ajv.getSchema(name) ?? ajv.addSchema(schema(name), name).getSchema(name)!;
  if (!validate(value)) throw new Error(`Invalid ${name}: ${ajv.errorsText(validate.errors)}`);
  return value as T;
}
