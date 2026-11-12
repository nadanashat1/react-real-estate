import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
// Never let ordinary tests accidentally write to a configured live database.
if (process.env.DATABASE_URL && process.env.ALLOW_LIVE_DB_TESTS !== "1") {
  throw new Error(
    "Use an isolated database; live tests require explicit opt-in.",
  );
}
const dir = mkdtempSync(tmpdir() + "/estate-test-");
let server;
const base = "http://localhost:4176";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function boot() {
  server = spawn(
    process.execPath,
    ["--experimental-sqlite", "server/index.mjs"],
    { env: { ...process.env, DATA_DIR: dir, PORT: "4176" }, stdio: "pipe" },
  );
  return new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.stderr.on("data", (d) => {
      if (
        !String(d).includes("ExperimentalWarning") &&
        !String(d).includes("trace-warnings")
      )
        console.error(String(d));
    });
    server.once("error", reject);
  });
}
async function stop() {
  if (server) {
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
}
before(boot);
after(async () => {
  await stop();
  rmSync(dir, { recursive: true, force: true });
});
async function req(route, method = "GET", data, cookie = "", origin) {
  const r = await fetch(base + "/api" + route, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    headers: r.headers,
  };
}
const password = randomBytes(24).toString("base64url");
let alice, bob, aliceCookie, bobCookie, homeId, threadId;
const home = {
  title: "Test courtyard home",
  city: "Test City",
  neighborhood: "Quiet District",
  price: 250000,
  kind: "sale",
  type: "House",
  beds: 3,
  baths: 2,
  area: 150,
  photo: "/property-images/nice-home-9.jpg",
  description: "Fictional property for automated integration testing only.",
};
test("health and seeded database are available", async () => {
  assert.equal((await req("/health")).data.database, "connected");
  const x = await req("/homes");
  assert.equal(x.status, 200);
  assert.equal(x.data.homes.length, 6);
  assert.ok(x.data.homes.every((h) => h.demo === 1));
});
test("server filters do not fall back to unrelated homes", async () => {
  assert.equal((await req("/homes?location=nonexistent-place")).data.total, 0);
  assert.equal((await req("/homes?kind=rent")).data.total, 3);
  const rows = (await req("/homes?kind=sale&sort=price-asc")).data.homes;
  assert.ok(rows[0].price <= rows[1].price);
});
test("private write endpoints require authentication", async () => {
  assert.equal((await req("/homes", "POST", home)).status, 401);
  assert.equal((await req("/inquiries")).status, 401);
  assert.equal((await req("/homes?saved=1")).status, 401);
});
test("registration, session cookie, and invalid login", async () => {
  const x = await req("/auth/register", "POST", {
    name: "Alice Tester",
    email: "alice@example.test",
    password,
    role: "seller",
  });
  assert.equal(x.status, 200);
  alice = x.data.user;
  aliceCookie = x.cookie;
  assert.match(x.headers.get("set-cookie"), /HttpOnly/);
  assert.match(x.headers.get("set-cookie"), /SameSite=Strict/);
  assert.equal(
    (await req("/auth/me", "GET", null, aliceCookie)).data.user.id,
    alice.id,
  );
  assert.equal(
    (
      await req("/auth/login", "POST", {
        email: "alice@example.test",
        password: randomBytes(20).toString("hex"),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await req("/auth/register", "POST", {
        name: "Alice Tester",
        email: "alice@example.test",
        password,
        role: "seller",
      })
    ).status,
    409,
  );
  const b = await req("/auth/register", "POST", {
    name: "Bob Tester",
    email: "bob@example.test",
    password,
  });
  bob = b.data.user;
  bobCookie = b.cookie;
});
test("buyer account cannot list properties", async () => {
  assert.equal((await req("/homes", "POST", home, bobCookie)).status, 403);
});
test("same-origin check rejects cross-site mutations", async () => {
  assert.equal(
    (
      await req(
        "/homes",
        "POST",
        home,
        aliceCookie,
        "https://unrelated.example",
      )
    ).status,
    403,
  );
});
test("listing CRUD validates fields and enforces owner", async () => {
  assert.equal(
    (await req("/homes", "POST", { ...home, price: -1 }, aliceCookie)).status,
    400,
  );
  const x = await req("/homes", "POST", home, aliceCookie);
  assert.equal(x.status, 201);
  homeId = x.data.id;
  assert.equal((await req("/homes/" + homeId)).data.home.owner_id, alice.id);
  assert.equal(
    (await req("/homes/" + homeId, "PUT", home, bobCookie)).status,
    403,
  );
  assert.equal(
    (await req("/homes/" + homeId, "DELETE", null, bobCookie)).status,
    403,
  );
  assert.equal(
    (
      await req(
        "/homes/" + homeId,
        "PUT",
        { ...home, title: "Updated courtyard home" },
        aliceCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await req("/homes?mine=1", "GET", null, aliceCookie)).data.total,
    1,
  );
});
test("favorites are persisted and isolated per account", async () => {
  assert.equal(
    (await req("/favorites/" + homeId, "POST", {}, bobCookie)).status,
    200,
  );
  assert.equal(
    (await req("/homes?saved=1", "GET", null, bobCookie)).data.total,
    1,
  );
  assert.equal(
    (await req("/homes?saved=1", "GET", null, aliceCookie)).data.total,
    0,
  );
  await stop();
  await boot();
  assert.equal(
    (await req("/homes?saved=1", "GET", null, bobCookie)).data.total,
    1,
  );
});
test("inquiries reject sample homes, own homes, and past dates", async () => {
  assert.equal(
    (
      await req(
        "/inquiries",
        "POST",
        { home_id: 1, message: "Can I view this?" },
        bobCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/inquiries",
        "POST",
        { home_id: homeId, message: "Can I view this?" },
        aliceCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/inquiries",
        "POST",
        {
          home_id: homeId,
          message: "Can I view this?",
          viewing_at: "2000-01-01T12:00:00Z",
        },
        bobCookie,
      )
    ).status,
    400,
  );
});
test("owner and visitor can exchange messages, strangers cannot", async () => {
  const x = await req(
    "/inquiries",
    "POST",
    {
      home_id: homeId,
      message: "Can I view this fictional home?",
      viewing_at: new Date(Date.now() + 86400000).toISOString(),
    },
    bobCookie,
  );
  assert.equal(x.status, 201);
  threadId = x.data.id;
  assert.equal(
    (await req("/inquiries", "GET", null, aliceCookie)).data.threads[0].id,
    threadId,
  );
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/replies",
        "POST",
        { message: "Yes, this is a demo reply." },
        aliceCookie,
      )
    ).status,
    201,
  );
  const c = await req("/auth/register", "POST", {
    name: "Stranger Tester",
    email: "stranger@example.test",
    password,
  });
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/replies",
        "POST",
        { message: "Not allowed" },
        c.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await req("/inquiries", "GET", null, c.cookie)).data.threads.length,
    0,
  );
  assert.equal(
    (await req("/inquiries", "GET", null, bobCookie)).data.threads[0].replies
      .length,
    1,
  );
});
test("viewing confirmation and time changes are permission checked and persisted", async () => {
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/viewing",
        "PATCH",
        { status: "confirmed" },
        bobCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/viewing",
        "PATCH",
        { status: "confirmed" },
        aliceCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await req("/inquiries", "GET", null, bobCookie)).data.threads[0]
      .viewing_status,
    "confirmed",
  );
  const changed = new Date(Date.now() + 172800000).toISOString();
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/viewing",
        "PATCH",
        { status: "requested", viewing_at: changed },
        bobCookie,
      )
    ).status,
    200,
  );
  let t = (await req("/inquiries", "GET", null, aliceCookie)).data.threads[0];
  assert.equal(t.viewing_at, changed);
  assert.equal(t.viewing_status, "requested");
  assert.equal(
    (
      await req(
        "/inquiries/" + threadId + "/viewing",
        "PATCH",
        { status: "cancelled" },
        bobCookie,
      )
    ).status,
    200,
  );
});
test("map coordinates are validated and saved", async () => {
  assert.equal(
    (
      await req(
        "/homes/" + homeId,
        "PUT",
        { ...home, latitude: 91, longitude: 0 },
        aliceCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/homes/" + homeId,
        "PUT",
        { ...home, latitude: 30.123, longitude: 31.456 },
        aliceCookie,
      )
    ).status,
    200,
  );
  assert.equal((await req("/homes/" + homeId)).data.home.latitude, 30.123);
});
test("photo upload rejects non-images and buyers", async () => {
  assert.equal(
    (
      await req(
        "/photos",
        "POST",
        { image: "data:image/jpeg;base64,bm90YW5pbWFnZQ==" },
        aliceCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await req("/photos", "POST", { image: "invalid" }, bobCookie)).status,
    403,
  );
});
test("malformed JPEG bytes are rejected even with a JPEG header", async () => {
  const x = await req(
    "/photos",
    "POST",
    {
      image:
        "data:image/jpeg;base64," +
        Buffer.from([255, 216, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).toString(
          "base64",
        ),
    },
    aliceCookie,
  );
  assert.equal(x.status, 400);
});
test("delete cascades to saved homes and inquiries", async () => {
  assert.equal(
    (await req("/homes/" + homeId, "DELETE", null, aliceCookie)).status,
    200,
  );
  assert.equal((await req("/homes/" + homeId)).status, 404);
  assert.equal(
    (await req("/homes?saved=1", "GET", null, bobCookie)).data.total,
    0,
  );
  assert.equal(
    (await req("/inquiries", "GET", null, bobCookie)).data.threads.length,
    0,
  );
});
test("logout revokes the session", async () => {
  assert.equal(
    (await req("/auth/logout", "POST", {}, aliceCookie)).status,
    200,
  );
  assert.equal(
    (await req("/auth/me", "GET", null, aliceCookie)).data.user,
    null,
  );
});

test("browser response security policy is present", async () => {
  const r = await req("/health");
  assert.match(r.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("permissions-policy"), /camera=\(\)/);
});
test("persisted sign-in limits survive application restart", async () => {
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await req("/auth/login", "POST", {
          email: "limited@example.test",
          password,
        })
      ).status,
      401,
    );
  await stop();
  await boot();
  assert.equal(
    (
      await req("/auth/login", "POST", {
        email: "limited@example.test",
        password,
      })
    ).status,
    429,
  );
});
