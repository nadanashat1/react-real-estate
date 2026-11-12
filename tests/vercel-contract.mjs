// Exercise the exported Node function with Vercel-style parsed request bodies.
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync("/tmp/estate-function-");
process.env.VERCEL = "1";
process.env.DATABASE_URL = "test-adapter-only";
process.env.TEST_POSTGRES = "1";
process.env.DATA_DIR = dir;
process.env.PORT = "4180";
const { default: handler } = await import("../api/index.mjs");
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  req.body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : undefined;
  await handler(req, res);
});
try {
  await new Promise((r) => server.listen(4180, "127.0.0.1", r));
  const r = await fetch("http://localhost:4180/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Function Tester",
      email: "function@example.test",
      role: "seller",
      password: randomBytes(24).toString("hex"),
    }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user.role, "seller");
  const h = await fetch("http://localhost:4180/api/homes?kind=rent");
  assert.equal((await h.json()).homes.length, 3);
  console.log(
    "PASS exported Vercel Node handler and pre-parsed JSON request body",
  );
} finally {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
}
// PGlite's engine can keep worker handles alive; this one-shot contract is done.
process.exit(0);
