import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
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

test("首页动效回调遵守减少动态效果，普通模式离屏暂停并可恢复", () => {
  const source = readFileSync(resolve(root, "assets/app.js"), "utf8");
  const fn = source.slice(source.indexOf("  function startHeroAnimation()"), source.indexOf("  function lookupClone("));
  for (const reduced of [true, false]) {
    const callbacks = new Map();
    let observer, onVisibility, nextId = 0, frames = 0;
    const context = {
      state: { heroVisible: true },
      window: { matchMedia: () => ({ matches: reduced }), IntersectionObserver: true },
      document: { hidden: false, addEventListener: (_, callback) => { onVisibility = callback; } },
      IntersectionObserver: class { constructor(callback) { observer = callback; } observe() {} },
      requestAnimationFrame(callback) { callbacks.set(++nextId, callback); return nextId; },
      drawHeroFrame() { frames += 1; }, performance: { now: () => 100 }, $: () => ({})
    };
    vm.runInNewContext(`${fn}\nstartHeroAnimation();`, context);
    observer([{ isIntersecting: true }]);
    context.document.hidden = true; onVisibility();
    context.document.hidden = false; onVisibility();
    if (reduced) {
      assert.ok(frames >= 1, "减少动态效果仍提供静态画面");
      assert.equal(callbacks.size, 0, "滚回页面与重新显示标签不能重启动画");
    } else {
      assert.equal(callbacks.size, 1, "恢复回调不应重复创建动画链");
      observer([{ isIntersecting: false }]);
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id); callback(200);
      assert.equal(callbacks.size, 0, "离屏后不继续调度");
      observer([{ isIntersecting: true }]);
      assert.equal(callbacks.size, 1, "普通模式回到视口时恢复");
    }
  }
});
