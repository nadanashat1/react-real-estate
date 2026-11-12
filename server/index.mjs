import http from "node:http";
import sharp from "sharp";
import { promisify } from "node:util";
const derivePassword = promisify(scrypt);
import { createDatabase } from "./database.mjs";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
if (process.env.VERCEL && !process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL must be configured server-side before deployment.",
  );
const db = await createDatabase({
  directory: dataDir,
  url: process.env.DATABASE_URL,
  pglite: process.env.TEST_POSTGRES === "1",
});
await db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'buyer' CHECK(role IN ('buyer','seller')));
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS homes(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),title TEXT NOT NULL,city TEXT NOT NULL,neighborhood TEXT NOT NULL,price INTEGER NOT NULL,kind TEXT NOT NULL,type TEXT NOT NULL,beds INTEGER NOT NULL,baths INTEGER NOT NULL,area INTEGER NOT NULL,photo TEXT NOT NULL,description TEXT NOT NULL,demo INTEGER NOT NULL DEFAULT 0,latitude REAL,longitude REAL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,owner_id INTEGER REFERENCES users(id),photo_data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS favorites(user_id INTEGER REFERENCES users(id),home_id INTEGER REFERENCES homes(id) ON DELETE CASCADE,PRIMARY KEY(user_id,home_id));
CREATE TABLE IF NOT EXISTS inquiries(id INTEGER PRIMARY KEY,home_id INTEGER REFERENCES homes(id) ON DELETE CASCADE,sender_id INTEGER REFERENCES users(id),message TEXT NOT NULL,viewing_at TEXT,viewing_status TEXT NOT NULL DEFAULT 'requested',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY,inquiry_id INTEGER REFERENCES inquiries(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id),message TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
if (!(await db.prepare("SELECT id FROM homes LIMIT 1").get())) {
  const seed = [
    [
      "Sunlit courtyard residence",
      "Los Angeles",
      "Silver Lake",
      865000,
      "sale",
      "House",
      3,
      2,
      185,
      "nice-home-1.jpg",
    ],
    [
      "A quiet corner above the city",
      "Chicago",
      "Lincoln Park",
      2450,
      "rent",
      "Apartment",
      2,
      2,
      112,
      "nice-home-2.jpg",
    ],
    [
      "Modern living, naturally",
      "Austin",
      "East Austin",
      625000,
      "sale",
      "House",
      3,
      2,
      168,
      "nice-home-6.jpg",
    ],
    [
      "The garden apartment",
      "Portland",
      "Pearl District",
      1850,
      "rent",
      "Apartment",
      1,
      1,
      78,
      "nice-home-4.jpg",
    ],
    [
      "Room to make your own",
      "Denver",
      "Highland",
      745000,
      "sale",
      "House",
      4,
      3,
      224,
      "nice-home-10.jpg",
    ],
    [
      "A brighter everyday",
      "Los Angeles",
      "Echo Park",
      3200,
      "rent",
      "Apartment",
      2,
      2,
      126,
      "nice-home-12.jpg",
    ],
  ];
  const insert = db.prepare(
    "INSERT INTO homes(title,city,neighborhood,price,kind,type,beds,baths,area,photo,description,demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)",
  );
  for (const h of seed) {
    h[9] = "/property-images/" + h[9];
    await insert.run(
      ...h,
      "A thoughtfully planned home with generous natural light, comfortable living spaces, and room for your everyday rituals. This is a fictional portfolio demonstration listing, not a property offered for sale or rent.",
    );
  }
}
const hash = (t) => createHash("sha256").update(t).digest("hex");
const publicUser = (u) =>
  u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
const port = Number(process.env.PORT || 4174),
  production =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const origin =
  process.env.APP_ORIGIN ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : `http://localhost:${port}`);
// Persisted, atomic counters are shared by all app instances and survive restarts.
async function consumeLimit(key, limit, windowMs = 600000) {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits(key,hits,reset_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET
    hits=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.hits+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<=? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING hits`,
    )
    .get(key, now + windowMs, now, now);
  return Number(row.hits) <= limit;
}
await db.exec(
  "CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at BIGINT NOT NULL)",
);
await db.prepare("DELETE FROM rate_limits WHERE reset_at<?").run(Date.now());
await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};
const listeners = new Map();
async function notify(ids) {
  for (const id of new Set(ids.filter(Boolean)))
    await db
      .prepare(
        "INSERT INTO user_signals(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=user_signals.version+1",
      )
      .run(id);
  for (const id of new Set(ids.filter(Boolean)))
    for (const res of listeners.get(id) || []) res.write("data: changed\n\n");
}
await db.exec(
  "CREATE TABLE IF NOT EXISTS user_signals(user_id INTEGER PRIMARY KEY,version BIGINT NOT NULL)",
);
export async function handler(req, res) {
  const url = new URL(req.url, "http://localhost"),
    p = url.pathname,
    method = req.method;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  if (production)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  const send = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const fail = (status, message) => {
    const e = new Error(message);
    e.status = status;
    throw e;
  };
  try {
    if (p.startsWith("/uploads/")) {
      const id = p.slice(9);
      if (!/^[a-f0-9]{64}\.jpg$/.test(id))
        return send(404, { error: "Image not found." });
      const photo = await db
        .prepare("SELECT photo_data FROM photos WHERE id=?")
        .get(id);
      if (!photo) return send(404, { error: "Image not found." });
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      });
      return res.end(Buffer.from(photo.photo_data));
    }
    if (!p.startsWith("/api/")) {
      const base = p.startsWith("/property-images/")
        ? path.join(root, "public/property-images")
        : path.join(root, "dist");
      const rel = p.startsWith("/property-images/")
        ? p.slice(17)
        : decodeURIComponent(p);
      let f = path.resolve(base, "." + (rel.startsWith("/") ? rel : "/" + rel));
      if (!f.startsWith(base + path.sep) && f !== base)
        return send(403, { error: "Not allowed" });
      if (!existsSync(f) || !statSync(f).isFile())
        f = path.join(root, "dist/index.html");
      if (!existsSync(f))
        return send(404, {
          error: "Build the frontend first with npm run build.",
        });
      res.writeHead(200, {
        "Content-Type": mime[path.extname(f)] || "application/octet-stream",
      });
      return res.end(readFileSync(f));
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    )
      fail(403, "This request origin is not allowed.");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !(await consumeLimit("global-write", 1000))
    )
      fail(429, "This demo is busy. Try again in 10 minutes.");
    let body = {};
    if (["POST", "PUT", "PATCH"].includes(method)) {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        fail(415, "Use application/json.");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > (p === "/api/photos" ? 3000000 : 30000))
          fail(413, "Request is too large.");
      }
      try {
        // Vercel may supply a parsed body after consuming the request stream.
        body = raw ? JSON.parse(raw) : req.body || {};
        if (
          Buffer.byteLength(JSON.stringify(body)) >
          (p === "/api/photos" ? 3000000 : 30000)
        )
          fail(413, "Request is too large.");
      } catch {
        fail(400, "Invalid JSON.");
      }
    }
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("estate_session="))
      ?.slice(15);
    const session = token
      ? await db
          .prepare(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?",
          )
          .get(hash(token), Date.now())
      : null;
    const auth = () => {
      if (!session) fail(401, "Please sign in to continue.");
      return session;
    };
    const text = (key, min = 1, max = 200) => {
      const val = body[key];
      if (
        typeof val !== "string" ||
        val.trim().length < min ||
        val.trim().length > max
      )
        fail(400, `Please enter a valid ${key.replaceAll("_", " ")}.`);
      return val.trim();
    };
    const number = (key, min, max) => {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max)
        fail(400, `Please enter a valid ${key}.`);
      return n;
    };
    const cookie = (t, max) =>
      res.setHeader(
        "Set-Cookie",
        `estate_session=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${max}${production ? "; Secure" : ""}`,
      );
    if (p === "/api/health") {
      await db.prepare("SELECT 1 AS connected").get();
      return send(200, { status: "ok", database: "connected" });
    }
    if (p === "/api/events" && method === "GET") {
      auth();
      if (
        !(await consumeLimit("events-global", 300)) ||
        !(await consumeLimit("events-user-" + session.id, 60))
      )
        fail(429, "Too many live connections. Try again in 10 minutes.");
      const active = [...listeners.values()].reduce(
        (n, set) => n + set.size,
        0,
      );
      if ((listeners.get(session.id)?.size || 0) >= 3 || active >= 50)
        fail(429, "Too many live connections. Close another tab and retry.");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      if (!listeners.has(session.id)) listeners.set(session.id, new Set());
      listeners.get(session.id).add(res);
      const opened = Date.now();
      let version = Number(
        (
          await db
            .prepare("SELECT version FROM user_signals WHERE user_id=?")
            .get(session.id)
        )?.version || 0,
      );
      res.write("data: changed\n\n");
      let busy = false;
      return await new Promise((resolve) => {
        const timer = setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            if (
              Date.now() - opened > 55000 ||
              !(await db
                .prepare("SELECT hash FROM sessions WHERE hash=? AND expires>?")
                .get(hash(token), Date.now()))
            )
              return res.end();
            const next = Number(
              (
                await db
                  .prepare("SELECT version FROM user_signals WHERE user_id=?")
                  .get(session.id)
              )?.version || 0,
            );
            if (next !== version) {
              version = next;
              res.write("data: changed\n\n");
            } else res.write(": keepalive\n\n");
          } catch {
            res.end();
          } finally {
            busy = false;
          }
        }, 5000);
        res.on("close", () => {
          clearInterval(timer);
          listeners.get(session.id)?.delete(res);
          resolve();
        });
      });
      return;
    }
    if (p === "/api/auth/me") return send(200, { user: publicUser(session) });
    if (p === "/api/auth/logout" && method === "POST") {
      if (token)
        await db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(token));
      cookie("", 0);
      return send(200, { ok: true });
    }
    if (
      ["/api/auth/register", "/api/auth/login"].includes(p) &&
      method === "POST"
    ) {
      if (!(await consumeLimit("global-auth", 120)))
        fail(429, "Too many sign-in attempts. Try again in 10 minutes.");
      const email = text("email", 3, 254).toLowerCase(),
        password = text("password", 10, 128);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "Please enter a valid email.");
      if (!(await consumeLimit("auth-" + hash(email), 20)))
        fail(
          429,
          "Too many attempts for this account. Try again in 10 minutes.",
        );
      let u;
      if (p.endsWith("register")) {
        if (
          Number(
            (await db.prepare("SELECT count(*) AS n FROM users").get()).n,
          ) >= 200
        )
          fail(409, "This demo has reached its test-account limit.");
        const name = text("name", 2, 80);
        const role = body.role || "buyer";
        if (!["buyer", "seller"].includes(role))
          fail(400, "Choose a valid account type.");
        if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
          fail(409, "An account with that email already exists.");
        const salt = randomBytes(16).toString("hex");
        const id = (
          await db
            .prepare(
              "INSERT INTO users(name,email,password_hash,salt,role) VALUES(?,?,?,?,?)",
            )
            .run(
              name,
              email,
              (await derivePassword(password, salt, 64)).toString("hex"),
              salt,
              role,
            )
        ).lastInsertRowid;
        u = await db.prepare("SELECT * FROM users WHERE id=?").get(id);
      } else {
        u = await db.prepare("SELECT * FROM users WHERE email=?").get(email);
        const derived = await derivePassword(
          password,
          u?.salt || "no-user-salt",
          64,
        );
        if (
          !u ||
          !timingSafeEqual(derived, Buffer.from(u.password_hash, "hex"))
        )
          fail(401, "Email or password is incorrect.");
      }
      const t = randomBytes(32).toString("hex");
      await db
        .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)")
        .run(hash(t), u.id, Date.now() + 604800000);
      cookie(t, 604800);
      return send(200, { user: publicUser(u) });
    }
    if (p === "/api/homes" && method === "GET") {
      const clauses = [],
        args = [];
      if (url.searchParams.get("kind")) {
        clauses.push("kind=?");
        args.push(url.searchParams.get("kind"));
      }
      const location = url.searchParams.get("location");
      if (location) {
        clauses.push("(city LIKE ? OR neighborhood LIKE ? OR title LIKE ?)");
        args.push(...Array(3).fill("%" + location + "%"));
      }
      for (const [key, clause] of [
        ["max", "price<=?"],
        ["beds", "beds>=?"],
      ])
        if (url.searchParams.get(key)) {
          const n = Number(url.searchParams.get(key));
          if (!Number.isFinite(n)) fail(400, "Invalid filter.");
          clauses.push(clause);
          args.push(n);
        }
      if (url.searchParams.get("type")) {
        clauses.push("type=?");
        args.push(url.searchParams.get("type"));
      }
      if (url.searchParams.get("mine")) {
        auth();
        clauses.push("owner_id=?");
        args.push(session.id);
      }
      if (url.searchParams.get("saved")) {
        auth();
        clauses.push("id IN(SELECT home_id FROM favorites WHERE user_id=?)");
        args.push(session.id);
      }
      const order =
        { "price-asc": "price ASC", "price-desc": "price DESC" }[
          url.searchParams.get("sort")
        ] || "id DESC";
      const homes = await db
        .prepare(
          `SELECT * FROM homes ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY ${order} LIMIT 100`,
        )
        .all(...args);
      const saved = session
        ? (
            await db
              .prepare("SELECT home_id FROM favorites WHERE user_id=?")
              .all(session.id)
          ).map((x) => x.home_id)
        : [];
      return send(200, {
        homes: homes.map((h) => ({ ...h, saved: saved.includes(h.id) })),
        total: homes.length,
      });
    }
    if (
      session &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !(await consumeLimit("user-write-" + session.id, 100))
    )
      fail(429, "Too many changes. Try again in 10 minutes.");
    const hm = p.match(/^\/api\/homes\/(\d+)$/);
    if (p === "/api/photos" && method === "POST") {
      auth();
      if (session.role !== "seller")
        fail(403, "A seller account is required to upload photos.");
      if (
        Number(
          (
            await db
              .prepare("SELECT count(*) AS n FROM photos WHERE owner_id=?")
              .get(session.id)
          ).n,
        ) >= 10
      )
        fail(409, "Each demo seller can upload up to 10 images.");
      const encoded = text("image", 20, 2800000);
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(encoded))
        fail(400, "Upload a JPEG image.");
      let bytes = Buffer.from(encoded.split(",")[1], "base64");
      if (
        bytes.length > 2000000 ||
        bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        bytes[2] !== 255
      )
        fail(400, "Upload a valid JPEG up to 2MB.");
      try {
        const image = sharp(bytes, {
          limitInputPixels: 16000000,
          failOn: "warning",
        });
        const metadata = await image.metadata();
        if (
          !metadata.width ||
          !metadata.height ||
          metadata.width > 4096 ||
          metadata.height > 4096
        )
          fail(400, "Image dimensions must be at most 4096 pixels.");
        bytes = await image.rotate().jpeg({ quality: 85 }).toBuffer();
      } catch {
        fail(400, "Upload a complete JPEG up to 4096 pixels and 2MB.");
      }
      const count = await db
        .prepare("SELECT COUNT(*) AS total FROM photos")
        .get();
      if (Number(count.total) >= 100)
        fail(409, "This demo has reached its image limit.");
      const id =
        hash(Buffer.concat([bytes, Buffer.from(String(session.id))])) + ".jpg";
      await db
        .prepare(
          "INSERT OR IGNORE INTO photos(id,owner_id,photo_data) VALUES(?,?,?)",
        )
        .run(id, session.id, bytes);
      return send(201, { photo: "/uploads/" + id });
    }
    const fields = async () => {
      const kind = text("kind");
      if (!["sale", "rent"].includes(kind)) fail(400, "Choose sale or rent.");
      const type = text("type");
      if (!["House", "Apartment", "Townhouse"].includes(type))
        fail(400, "Choose a valid property type.");
      const photo = text("photo");
      const bundled =
        /^\/property-images\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(photo) &&
        [
          "nice-home-1.jpg",
          "nice-home-2.jpg",
          "nice-home-4.jpg",
          "nice-home-6.jpg",
          "nice-home-9.jpg",
          "nice-home-10.jpg",
          "nice-home-12.jpg",
        ].includes(path.basename(photo));
      const uploaded =
        /^\/uploads\/[a-f0-9]{64}\.jpg$/.test(photo) &&
        (await db
          .prepare("SELECT id FROM photos WHERE id=? AND owner_id=?")
          .get(path.basename(photo), session.id));
      if (!bundled && !uploaded)
        fail(400, "Choose a sample image or upload your own photo.");
      return [
        text("title", 5, 100),
        text("city", 2, 80),
        text("neighborhood", 2, 80),
        number("price", 1, 1000000000),
        kind,
        type,
        number("beds", 0, 30),
        number("baths", 1, 30),
        number("area", 1, 100000),
        photo,
        text("description", 20, 3000),
      ];
    };
    const coordinates = () => {
      const lat =
          body.latitude === "" || body.latitude == null
            ? null
            : Number(body.latitude),
        lon =
          body.longitude === "" || body.longitude == null
            ? null
            : Number(body.longitude);
      if (
        (lat === null) !== (lon === null) ||
        (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) ||
        (lon !== null && (!Number.isFinite(lon) || Math.abs(lon) > 180))
      )
        fail(400, "Choose a valid map location.");
      return [lat, lon];
    };
    if (p === "/api/homes" && method === "POST") {
      auth();
      if (session.role !== "seller")
        fail(403, "A seller account is required to list properties.");
      if (
        Number(
          (
            await db
              .prepare("SELECT count(*) AS n FROM homes WHERE demo=0")
              .get()
          ).n,
        ) >= 100 ||
        Number(
          (
            await db
              .prepare("SELECT count(*) AS n FROM homes WHERE owner_id=?")
              .get(session.id)
          ).n,
        ) >= 10
      )
        fail(409, "This demo has reached its listing limit.");
      const id = (
        await db
          .prepare(
            "INSERT INTO homes(title,city,neighborhood,price,kind,type,beds,baths,area,photo,description,owner_id,latitude,longitude) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(...(await fields()), session.id, ...coordinates())
      ).lastInsertRowid;
      return send(201, { id: Number(id) });
    }
    if (hm) {
      const h = await db
        .prepare(
          "SELECT h.*, u.name AS owner_name FROM homes h LEFT JOIN users u ON u.id=h.owner_id WHERE h.id=?",
        )
        .get(hm[1]);
      if (!h) fail(404, "This property could not be found.");
      if (method === "GET") return send(200, { home: h });
      auth();
      if (h.owner_id !== session.id)
        fail(403, "You can only change your own properties.");
      if (method === "PUT") {
        await db
          .prepare(
            "UPDATE homes SET title=?,city=?,neighborhood=?,price=?,kind=?,type=?,beds=?,baths=?,area=?,photo=?,description=?,latitude=?,longitude=? WHERE id=?",
          )
          .run(...(await fields()), ...coordinates(), h.id);
        return send(200, { ok: true });
      }
      if (method === "DELETE") {
        await db.prepare("DELETE FROM homes WHERE id=?").run(h.id);
        return send(200, { ok: true });
      }
    }
    const fav = p.match(/^\/api\/favorites\/(\d+)$/);
    if (fav && ["POST", "DELETE"].includes(method)) {
      auth();
      if (!(await db.prepare("SELECT id FROM homes WHERE id=?").get(fav[1])))
        fail(404, "Property not found.");
      if (method === "POST")
        await db
          .prepare("INSERT OR IGNORE INTO favorites VALUES(?,?)")
          .run(session.id, fav[1]);
      else
        await db
          .prepare("DELETE FROM favorites WHERE user_id=? AND home_id=?")
          .run(session.id, fav[1]);
      return send(200, { saved: method === "POST" });
    }
    if (p === "/api/inquiries" && method === "POST") {
      auth();
      const homeId = number("home_id", 1, 1000000000),
        home = await db.prepare("SELECT * FROM homes WHERE id=?").get(homeId);
      if (!home) fail(404, "Property not found.");
      if (home.demo)
        fail(
          400,
          "Sample properties cannot receive inquiries. Create a listing with another test account to try this flow.",
        );
      if (home.owner_id === session.id) fail(400, "This is your own listing.");
      if (
        Number(
          (await db.prepare("SELECT count(*) AS n FROM inquiries").get()).n,
        ) >= 1000 ||
        Number(
          (
            await db
              .prepare("SELECT count(*) AS n FROM inquiries WHERE sender_id=?")
              .get(session.id)
          ).n,
        ) >= 30
      )
        fail(409, "This demo has reached its inquiry limit.");
      const message = text("message", 5, 2000);
      const date = body.viewing_at || null;
      if (
        date &&
        (!Number.isFinite(Date.parse(date)) || Date.parse(date) <= Date.now())
      )
        fail(400, "Please choose a future viewing time.");
      const id = (
        await db
          .prepare(
            "INSERT INTO inquiries(home_id,sender_id,message,viewing_at) VALUES(?,?,?,?)",
          )
          .run(homeId, session.id, message, date)
      ).lastInsertRowid;
      await notify([session.id, home.owner_id]);
      return send(201, { id: Number(id) });
    }
    if (p === "/api/inquiries" && method === "GET") {
      auth();
      const threads = await db
        .prepare(
          "SELECT i.*,h.title,h.owner_id,u.name AS sender_name,o.name AS owner_name FROM inquiries i JOIN homes h ON h.id=i.home_id JOIN users u ON u.id=i.sender_id LEFT JOIN users o ON o.id=h.owner_id WHERE i.sender_id=? OR h.owner_id=? ORDER BY i.id DESC",
        )
        .all(session.id, session.id);
      return send(200, {
        threads: await Promise.all(
          threads.map(async (t) => ({
            ...t,
            replies: await db
              .prepare(
                "SELECT r.*,u.name FROM replies r JOIN users u ON u.id=r.user_id WHERE inquiry_id=? ORDER BY id",
              )
              .all(t.id),
          })),
        ),
      });
    }
    const viewing = p.match(/^\/api\/inquiries\/(\d+)\/viewing$/);
    if (viewing && method === "PATCH") {
      auth();
      const i = await db
        .prepare(
          "SELECT i.*,h.owner_id FROM inquiries i JOIN homes h ON h.id=i.home_id WHERE i.id=?",
        )
        .get(viewing[1]);
      if (!i || ![i.sender_id, i.owner_id].includes(session.id))
        fail(403, "You cannot access this viewing.");
      if (!i.viewing_at) fail(400, "This inquiry has no viewing request.");
      const status = text("status");
      if (!["confirmed", "cancelled", "requested"].includes(status))
        fail(400, "Choose a valid viewing status.");
      if (status === "confirmed" && i.owner_id !== session.id)
        fail(403, "Only the property owner can confirm a viewing.");
      let at = body.viewing_at || i.viewing_at;
      if (
        status !== "cancelled" &&
        (!Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now())
      )
        fail(400, "Choose a future viewing time.");
      if (body.viewing_at && status !== "requested")
        fail(
          400,
          "A changed time must be requested again before confirmation.",
        );
      await db
        .prepare(
          "UPDATE inquiries SET viewing_at=?,viewing_status=? WHERE id=?",
        )
        .run(at, status, i.id);
      await notify([i.sender_id, i.owner_id]);
      return send(200, { ok: true });
    }
    const reply = p.match(/^\/api\/inquiries\/(\d+)\/replies$/);
    if (reply && method === "POST") {
      auth();
      const i = await db
        .prepare(
          "SELECT i.*,h.owner_id FROM inquiries i JOIN homes h ON h.id=i.home_id WHERE i.id=?",
        )
        .get(reply[1]);
      if (!i || ![i.sender_id, i.owner_id].includes(session.id))
        fail(403, "You cannot access this conversation.");
      if (
        Number(
          (
            await db
              .prepare("SELECT count(*) AS n FROM replies WHERE inquiry_id=?")
              .get(i.id)
          ).n,
        ) >= 100
      )
        fail(409, "This demo conversation has reached its reply limit.");
      await db
        .prepare(
          "INSERT INTO replies(inquiry_id,user_id,message) VALUES(?,?,?)",
        )
        .run(i.id, session.id, text("message", 1, 2000));
      await notify([i.sender_id, i.owner_id]);
      return send(201, { ok: true });
    }
    send(404, { error: "This API route does not exist." });
  } catch (e) {
    send(e.status || 500, {
      error: e.status ? e.message : "Something went wrong. Please try again.",
    });
    if (!e.status) console.error(e);
  }
}
export default handler;
if (!process.env.VERCEL) {
  const server = http.createServer(handler);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.maxRequestsPerSocket = 100;
  server.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Real Estate is ready on http://localhost:${port}`),
  );
}
