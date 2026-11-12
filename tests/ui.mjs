import { chromium } from "playwright";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
// Never let ordinary tests accidentally write to a configured live database.
if (process.env.DATABASE_URL && process.env.ALLOW_LIVE_DB_TESTS !== "1") {
  throw new Error(
    "Use an isolated database; live tests require explicit opt-in.",
  );
}
const dir = mkdtempSync("/tmp/estate-ui-"),
  out = process.env.ARTIFACT_DIR || path.resolve("test-artifacts");
mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  ["--experimental-sqlite", "server/index.mjs"],
  { env: { ...process.env, PORT: "4177", DATA_DIR: dir }, stdio: "pipe" },
);
let browser, second;
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
try {
  await new Promise((r, j) => {
    server.stdout.once("data", r);
    server.once("error", j);
    server.once("exit", (c) => j(new Error("Server exited with " + c)));
  });
  if (process.env.TEST_SECOND_INSTANCE === "1") {
    second = spawn(
      process.execPath,
      ["--experimental-sqlite", "server/index.mjs"],
      { env: { ...process.env, PORT: "4179", DATA_DIR: dir }, stdio: "pipe" },
    );
    await new Promise((resolve, reject) => {
      second.stdout.once("data", resolve);
      second.once("error", reject);
      second.once("exit", () => reject(new Error("Second instance failed")));
    });
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const ownerContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await ownerContext.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = "http://localhost:4177";
  await page.goto(base);
  await page.waitForSelector(".explorer-scene");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.locator(".explorer-summary .summary-price>span").textContent(),
    "ASKING PRICE · USD",
  );
  check("home buy explorer loads real backend records");
  await page.screenshot({
    path: out + "/real-estate-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/real-estate-mobile.png",
    fullPage: true,
  });
  await page.screenshot({ path: out + "/real-estate-mobile-first-screen.png" });
  const firstTitle = await page.locator(".scene-title h1").textContent();
  await page
    .getByRole("button", { name: "Next property", exact: true })
    .click();
  assert.notEqual(
    await page.locator(".scene-title h1").textContent(),
    firstTitle,
  );
  check("property explorer carousel changes the selected record");
  await page.getByRole("button", { name: "Rent", exact: true }).click();
  await page.waitForURL("**kind=rent");
  await page.getByText("MONTHLY RENT · USD", { exact: true }).waitFor();
  check("rent mode loads rental records");
  await page.getByRole("button", { name: "Refine your search" }).click();
  await page.locator("input[name=location]").fill("nothing-matches-this");
  await page.getByRole("button", { name: "Find your place" }).click();
  await page.getByText("No homes match this search.").waitFor();
  assert.equal(await page.locator(".property").count(), 0);
  await page.screenshot({ path: out + "/real-estate-empty-state.png" });
  check("zero search results do not show unrelated listings");
  await page.goto(base + "/home-details/1");
  await page.getByText("Explore the demo", { exact: true }).waitFor();
  await page.screenshot({
    path: out + "/real-estate-detail.png",
    fullPage: true,
  });
  check("property details and clear sample-data notice");
  async function register(p, name, email, role = "buyer") {
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await p.getByLabel("Account type").selectOption(role);
    await p.getByLabel("Your name").fill(name);
    await p.getByLabel("Email address").fill(email);
    await p
      .getByLabel("Password", { exact: true })
      .fill(randomBytes(24).toString("base64url"));
    await p
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await p.waitForSelector("dialog", { state: "detached" });
  }
  await page.goto(base);
  await register(page, "Preview Owner", "owner@example.test", "seller");
  check("registration signs user in with a session");
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page
    .getByRole("button", { name: "List a property", exact: true })
    .click();
  const dialog = page.locator("dialog");
  await dialog
    .getByLabel("Property title")
    .fill("A courtyard made for weekends");
  await dialog.getByLabel("City", { exact: true }).fill("Austin");
  await dialog.getByLabel("Neighborhood").fill("Quiet District");
  await dialog.getByLabel("Price in USD").fill("420000");
  await dialog.getByLabel("Area (m²)").fill("155");
  await dialog.getByLabel("Bedrooms").fill("3");
  await dialog.getByLabel("Bathrooms").fill("2");
  await dialog.getByLabel("Or upload a property photo").setInputFiles({
    name: "property.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync("public/property-images/nice-home-9.jpg"),
  });
  await page.waitForSelector(".uploaded-preview img");
  await dialog.getByRole("button", { name: "Choose location on map" }).click();
  await page
    .locator(".leaflet-container")
    .click({ position: { x: 180, y: 140 } });
  await page.locator(".map-coordinates").waitFor();
  await dialog
    .getByLabel("Description")
    .fill(
      "A fictional courtyard home for end-to-end portfolio preview testing. No real offer.",
    );
  await dialog.getByRole("button", { name: "Save listing" }).click();
  await page.waitForURL("**/home-details/*");
  await page
    .getByRole("heading", { name: "A courtyard made for weekends" })
    .waitFor();
  const homeUrl = page.url();
  check("create listing persists and opens real detail record");
  assert.match(
    await page.locator(".detail-image").getAttribute("src"),
    /^\/uploads\//,
  );
  await page.getByRole("button", { name: "Show property map" }).click();
  await page.waitForSelector(".leaflet-container");
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile")).some(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  await page.screenshot({
    path: out + "/real-estate-map-upload.png",
    fullPage: true,
  });
  check("uploaded image and chosen map pin survive saving");
  await page.getByRole("button", { name: "Edit your listing" }).click();
  await page
    .locator("dialog")
    .getByLabel("Property title")
    .fill("An updated courtyard home");
  await page.getByRole("button", { name: "Save listing" }).click();
  await page
    .getByRole("heading", { name: "An updated courtyard home" })
    .waitFor();
  check("owner can edit their listing");
  const visitorContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    visitor = await visitorContext.newPage();
  visitor.on("pageerror", (e) => errors.push(e.message));
  await visitor.goto(second ? "http://localhost:4179" : base);
  await register(visitor, "Preview Visitor", "visitor@example.test");
  await visitor.goto(
    (second ? "http://localhost:4179" : base) + "/all-homes?kind=sale",
  );
  await visitor.locator(".save-button").first().click();
  await visitor.getByRole("status").filter({ hasText: "Home saved" }).waitFor();
  await visitor.reload();
  await visitor.waitForSelector(".save-button.saved");
  check("save favorite persists after reload");
  await visitor.goto(second ? homeUrl.replace(":4177", ":4179") : homeUrl);
  await visitor
    .getByLabel("Your message")
    .fill("I would like to learn more about this demo property.");
  const future = new Date(Date.now() + 86400000);
  future.setMinutes(0, 0, 0);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await visitor.locator("input[name=viewing_at]").fill(local);
  await visitor.getByRole("button", { name: "Send inquiry" }).click();
  await visitor.waitForURL("**view=inbox");
  await visitor
    .getByText("I would like to learn more about this demo property.")
    .waitFor();
  check("visitor sends a database-backed inquiry");
  await page.goto(base + "/all-homes?view=inbox");
  await page
    .getByText("I would like to learn more about this demo property.")
    .waitFor();
  await page
    .locator("input[name=message]")
    .fill("Thanks for trying this preview. This reply is saved.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByText("Thanks for trying this preview. This reply is saved.")
    .waitFor();
  await visitor
    .getByText("Thanks for trying this preview. This reply is saved.")
    .waitFor();
  check("owner reply is visible to visitor");
  await visitor.screenshot({
    path: out + "/real-estate-inbox.png",
    fullPage: true,
  });
  await page.goto(base + "/all-homes?view=viewings");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.locator(".status-pill.confirmed").waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.screenshot({
    path: out + "/real-estate-calendar-desktop.png",
    fullPage: true,
  });
  await visitor.goto(
    (second ? "http://localhost:4179" : base) + "/all-homes?view=viewings",
  );
  await visitor.locator(".status-pill.confirmed").waitFor();
  await visitor.locator(".calendar-event.confirmed").waitFor();
  await visitor.screenshot({
    path: out + "/real-estate-calendar-mobile.png",
    fullPage: true,
  });
  check(
    "viewing requested by visitor and confirmed by owner is visible to both",
  );
  const event = page.locator(".calendar-event.confirmed").first();
  const target = page.locator(".viewing-day").last();
  await event.dragTo(target);
  await page.locator(".status-pill.requested").waitFor();
  check("dragging a viewing proposes a new date and clears prior confirmation");
  const widths = [];
  for (const width of [320, 390, 768, 1280]) {
    await visitor.setViewportSize({ width, height: 900 });
    await visitor.goto(base);
    await visitor.waitForSelector(".explorer-scene");
    const scrollWidth = await visitor.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert.ok(scrollWidth <= width);
    widths.push({ width, scrollWidth });
  }
  check("no horizontal overflow at 320, 390, 768, 1280px");
  assert.equal(errors.length, 0);
  check("no client runtime errors");
  writeFileSync(
    out + "/real-estate-ui-checks.json",
    JSON.stringify({ checks, errors, widths }, null, 2),
  );
} finally {
  if (browser) await browser.close();
  if (second) {
    second.kill();
    await new Promise((r) => second.once("exit", r));
  }
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(dir, { recursive: true, force: true });
}
