import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const expectedIds = ["simulator", "tumorCanvas", "runMcBtn", "riskSvg", "downloadJsonBtn"];

test("模拟器资源、关键控件与响应式样式保持完整", () => {
  assert.match(html, /<meta[^>]+name=["']viewport["']/i);
  assert.ok(existsSync(resolve(root, "_headers")));
  for (const id of expectedIds) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const reference of [...html.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/gi)].map((match) => match[1])) {
    if (!/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(reference)) assert.ok(existsSync(resolve(root, reference)), reference);
  }
  assert.equal(spawnSync(process.execPath, ["--check", resolve(root, "assets", "app.js")]).status, 0);
  assert.match(readFileSync(resolve(root, "assets", "app.css"), "utf8"), /@media/i);
});

test("静态页面不声明重复的固定 ID", () => {
  const ids = [...html.matchAll(/\bid=["']([A-Za-z][\w:-]*)["']/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
