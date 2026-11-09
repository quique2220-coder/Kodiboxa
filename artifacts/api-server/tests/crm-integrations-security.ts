import assert from "node:assert/strict";
import { validateNeonConnectionString, validateZapierHookUrl } from "../src/lib/crm-integrations";

assert.equal(
  new URL(validateNeonConnectionString("postgresql://crm:pass@ep-sample.us-east-1.aws.neon.tech/kodiboxa?sslmode=require")).searchParams.get("sslmode"),
  "verify-full",
);
for (const unsafe of [
  "postgresql://u:p@127.0.0.1/private",
  "postgresql://u:p@attacker.example.com/db",
  "postgresql://u:p@ep-test.neon.tech/db?sslmode=disable",
  "http://ep-test.neon.tech/db",
]) assert.throws(() => validateNeonConnectionString(unsafe));

assert.equal(
  validateZapierHookUrl("https://hooks.zapier.com/hooks/catch/1234567/abcdefg/"),
  "https://hooks.zapier.com/hooks/catch/1234567/abcdefg/",
);
for (const unsafe of [
  "http://hooks.zapier.com/hooks/catch/123/a/",
  "https://evil.example.com/hooks/catch/123/a/",
  "https://hooks.zapier.com/arbitrary/path",
  "https://user:pass@hooks.zapier.com/hooks/catch/123/a/",
]) assert.throws(() => validateZapierHookUrl(unsafe));
console.log("PASS: Neon endpoints require TLS and approved Neon hosts; Zapier URLs only allow HTTPS Catch Hooks.");
