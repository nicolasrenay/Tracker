import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(process.env.PAGE_URL ?? "http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Habit Tracker" }).waitFor();
const run = page.getByLabel("Nom de Run");
if ((await run.inputValue()) !== "Run") {
  throw new Error(`Expected starter habit Run, got ${await run.inputValue()}`);
}
await page.getByPlaceholder("Nouvelle habitude").fill("Lecture");
await page.getByRole("button", { name: "Ajouter" }).click();
await page.getByLabel("Nom de Lecture").waitFor();
const addValue = await page.getByPlaceholder("Nouvelle habitude").inputValue();
if (addValue !== "") {
  throw new Error(`Add field was not cleared: ${addValue}`);
}
const past = page.getByRole("button", { name: "Run le 2 oct" });
await past.click();
if ((await past.getAttribute("aria-pressed")) !== "true") {
  throw new Error("Checkbox did not toggle");
}
const rateAfterCheck = await page.locator(".stat-value").first().innerText();
if (rateAfterCheck === "0 %") {
  throw new Error("Past check did not change the score");
}
await page.reload({ waitUntil: "networkidle" });
await page.getByLabel("Nom de Lecture").waitFor();
const restored = page.getByRole("button", { name: "Run le 2 oct" });
if ((await restored.getAttribute("aria-pressed")) !== "true") {
  throw new Error("Check did not persist after reload");
}
await mkdir("/tmp/tracker-ui", { recursive: true });
await page.screenshot({ path: "/tmp/tracker-ui/desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "/tmp/tracker-ui/mobile.png", fullPage: true });
const rate = await page.locator(".stat-value").first().innerText();
if (!rate.includes("%")) {
  throw new Error(`Missing score: ${rate}`);
}
await browser.close();
console.log("ui flow ok", rate);
