"""OneBoss B 组视觉/交互 QA（Playwright）

用法：
    python scripts/qa.py            # 若 5173 未启动则自动启动 npm run dev
    npm run qa:visual

输出：
    docs/screenshots/*.jpg          # 375 / 768 / 1280 关键页面
    docs/visual-qa-results.json     # 结构化结果（溢出、控制台错误、交互断言、PNG/ZIP 校验）
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
BASE = "http://127.0.0.1:5173"
results: dict[str, object] = {"baseUrl": BASE, "checks": [], "consoleErrors": [], "screenshots": []}


def log(message: str) -> None:
    print(message, flush=True)


def record(name: str, ok: bool, detail: object = "") -> None:
    results["checks"].append({"name": name, "ok": ok, "detail": detail})
    log(("PASS " if ok else "FAIL ") + name + (f" · {detail}" if detail else ""))


def wait_for_server(timeout: float = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(BASE, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.8)
    raise RuntimeError("Vite dev server 未在 5173 启动")


def png_size(path: Path) -> tuple[int, int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    width, height = struct.unpack(">II", data[16:24])
    return width, height, len(data)


def overflow(page: Page) -> dict:
    return page.evaluate(
        """() => {
          const doc = document.documentElement;
          const vw = window.innerWidth;
          const offenders = [];
          document.querySelectorAll('body *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            if (r.right > vw + 2 || r.left < -2) {
              const scroller = el.closest('[style*="overflow"], .studio-tabs, .segmented');
              if (scroller) return;
              offenders.push({
                tag: el.tagName,
                cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '',
                left: Math.round(r.left), right: Math.round(r.right)
              });
            }
          });
          return {scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 6)};
        }"""
    )


def settle(page: Page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(450)


def shot(page: Page, name: str, full_page: bool = True) -> None:
    path = SHOTS / f"{name}.jpg"
    page.screenshot(path=str(path), full_page=full_page, type="jpeg", quality=78)
    results["screenshots"].append(str(path.relative_to(ROOT)).replace("\\", "/"))
    log(f"SHOT {path.name}")


def attach_console(page: Page) -> None:
    def on_console(message):
        if message.type == "error":
            results["consoleErrors"].append(message.text)

    page.on("console", on_console)
    page.on("pageerror", lambda error: results["consoleErrors"].append(f"pageerror: {error}"))


def check_route(page: Page, name: str, path: str, width: int) -> None:
    page.goto(BASE + path, wait_until="networkidle")
    page.wait_for_timeout(300)
    data = overflow(page)
    ok = data["scrollWidth"] <= data["clientWidth"] + 1 and not data["offenders"]
    record(f"{width}px / {name} 无横向溢出", ok, data)


def main() -> int:
    SHOTS.mkdir(parents=True, exist_ok=True)
    server: subprocess.Popen | None = None
    try:
        with urllib.request.urlopen(BASE, timeout=2):
            pass
    except Exception:
        log("启动 Vite dev server…")
        node = shutil.which("node") or "node"
        vite = ROOT / "node_modules" / "vite" / "bin" / "vite.js"
        if not vite.exists():
            raise RuntimeError("未找到 vite，请先执行 npm install")
        kwargs = {"cwd": ROOT, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        server = subprocess.Popen([node, str(vite), "--host", "127.0.0.1", "--port", "5173"], **kwargs)

    try:
        wait_for_server()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            tmp = Path(tempfile.mkdtemp(prefix="oneboss-qa-"))

            # ---------- 桌面：默认状态 ----------
            ctx = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            attach_console(page)

            page.goto(BASE + "/", wait_until="networkidle")
            page.wait_for_timeout(500)
            shot(page, "home-1280")
            check_route(page, "首页", "/", 1280)
            check_route(page, "套餐", "/pricing", 1280)
            check_route(page, "订单", "/orders", 1280)
            check_route(page, "创意方向", "/projects/demo-chair-001/creative", 1280)
            check_route(page, "网站预览", "/projects/demo-chair-001/site", 1280)
            check_route(page, "海报", "/projects/demo-chair-001/posters", 1280)
            check_route(page, "修改", "/projects/demo-chair-001/revise", 1280)
            check_route(page, "交付中心", "/projects/demo-chair-001/delivery", 1280)
            check_route(page, "公开站点", "/p/one-living-chair", 1280)

            page.goto(BASE + "/projects/demo-chair-001/creative", wait_until="networkidle")
            page.wait_for_timeout(400)
            shot(page, "creative-1280")
            record("创意方向有 3 套", page.locator(".direction-card").count() == 3, page.locator(".direction-card").count())

            page.goto(BASE + "/projects/demo-chair-001/site", wait_until="networkidle")
            page.wait_for_timeout(500)
            shot(page, "site-chair-1280")
            record("单图项目不显示轮播按钮", page.locator(".gallery-controls button").count() == 0)

            page.goto(BASE + "/projects/demo-car-002/site", wait_until="networkidle")
            page.wait_for_timeout(500)
            record("双图项目显示轮播按钮", page.locator(".gallery-controls button").count() == 2)
            before = page.locator(".gallery-caption small").first.inner_text()
            page.locator(".gallery-controls button").nth(1).click()
            page.wait_for_timeout(250)
            after = page.locator(".gallery-caption small").first.inner_text()
            record("轮播可以切换", before != after, f"{before} -> {after}")
            page.locator(".spec-tabs button", has_text="待确认").click()
            page.wait_for_timeout(200)
            record("参数选项卡可以切换", "待客户确认" in page.locator(".spec-table").inner_text())
            shot(page, "site-car-1280")

            page.goto(BASE + "/projects/demo-multi-004/site", wait_until="networkidle")
            page.wait_for_timeout(400)
            record("多产品目录有 3 个产品", page.locator(".product-card").count() == 3, page.locator(".product-card").count())
            page.locator(".product-card").nth(1).click()
            page.wait_for_timeout(250)
            detail = page.locator(".product-detail").inner_text()
            record(
                "点击产品卡切换详情",
                "原木边几" in detail and "¥299" in detail,
                detail[:80].replace("\n", " | "),
            )

            page.goto(BASE + "/projects/demo-chair-001/posters", wait_until="networkidle")
            page.wait_for_timeout(300)
            shot(page, "posters-1280")
            with page.expect_download() as download_info:
                page.get_by_role("button", name="下载真 PNG").click()
            download = download_info.value
            poster_path = tmp / "poster.png"
            download.save_as(str(poster_path))
            width, height, size = png_size(poster_path)
            record("浏览器下载的 PNG 尺寸正确", (width, height) == (1080, 1350), f"{width}x{height}, {size} bytes")
            record("PNG 不是空文件", size > 20_000, size)
            page.get_by_role("checkbox").check()
            page.wait_for_timeout(200)
            record("安全区可以显示", page.locator(".safe-zone").count() >= 4, page.locator(".safe-zone").count())

            # 交付 ZIP（默认已发布 + 需先核验）
            page.goto(BASE + "/projects/demo-chair-001/delivery", wait_until="networkidle")
            page.get_by_role("button", name="核验并生成交付文件").click()
            page.wait_for_timeout(1600)
            shot(page, "delivery-1280")
            with page.expect_download(timeout=40_000) as zip_info:
                page.get_by_role("button", name="下载 ZIP 交付包").click()
            zip_path = tmp / "delivery.zip"
            zip_info.value.save_as(str(zip_path))
            with zipfile.ZipFile(zip_path) as archive:
                names = archive.namelist()
                pngs = [name for name in names if name.startswith("posters/") and name.endswith(".png")]
                has_manifest = "manifest.json" in names
                has_url = "site-url.txt" in names
                poster_bytes = archive.read(pngs[0])[:8] if pngs else b""
            record(
                "ZIP 包含海报 / manifest / 网址",
                len(pngs) == 2 and has_manifest and has_url and poster_bytes == b"\x89PNG\r\n\x1a\n",
                names,
            )

            page.goto(BASE + "/p/one-living-chair", wait_until="networkidle")
            page.wait_for_timeout(500)
            shot(page, "public-site-1280")
            record("公开站点可打开且含已确认价格", "¥129" in page.locator("body").inner_text())
            record("公开站点标题来自已确认事实", "原木家用椅" in page.title(), page.title())

            page.goto(BASE + "/create", wait_until="networkidle")
            page.wait_for_timeout(400)
            shot(page, "create-1280")
            page.get_by_placeholder("例如：晨雾咖啡豆").fill("自检咖啡豆")
            page.locator(".create-form textarea").fill(
                "品牌：SELF CHECK。中浅烘焙的自检咖啡豆，适合在家冲泡；已确认价格 ¥88 / 200g，产地待补充。"
            )
            page.get_by_role("button", name="生成我的宣传网站").click()
            page.wait_for_timeout(1800)
            generated_url = page.url
            generated_body = page.locator("body").inner_text()
            record(
                "描述生成网站并提取品牌/价格",
                "/projects/custom-" in generated_url
                and "自检咖啡豆" in generated_body
                and "SELF CHECK" in generated_body
                and "¥88" in generated_body,
                generated_url,
            )
            shot(page, "generated-site-1280")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(500)
            record("生成的项目刷新后仍然存在", "自检咖啡豆" in page.locator("body").inner_text(), page.url)

            page.goto(BASE + "/checkout?plan=starter", wait_until="networkidle")
            page.get_by_role("button", name="创建订单并演示支付").click()
            page.wait_for_timeout(1800)
            first_order = page.locator(".order-card").first.inner_text()
            record(
                "结算创建演示订单并完成演示支付",
                "/orders" in page.url and "已支付（演示）" in first_order and "待确认创意" in first_order,
                page.url,
            )

            page.goto(BASE + "/projects/demo-chair-001/intake", wait_until="networkidle")
            page.get_by_role("button", name="确认简报并选择创意方向").click()
            page.wait_for_timeout(700)
            record("确认简报进入创意方向", page.url.endswith("/creative"), page.url)

            ctx.close()

            # ---------- 桌面：修改 / 版本 / 价格 ----------
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page()
            attach_console(page)
            page.goto(BASE + "/projects/demo-chair-001/revise", wait_until="networkidle")
            page.get_by_role("button", name="解析修改意图").click()
            page.wait_for_timeout(250)
            page.get_by_role("button", name="生成预览版本").click()
            page.wait_for_timeout(400)
            page.add_style_tag(content=".studio-topbar,.studio-tabs{position:static!important}")
            shot(page, "revise-site-only-1280")
            scope = page.locator(".scope-proof").inner_text()
            record("只改网站时海报版本不变", "海报保持 V1" in scope, scope.replace("\n", " "))

            page.locator(".example-row .chip", has_text="价格从129改139").click()
            page.get_by_role("button", name="解析修改意图").click()
            page.wait_for_timeout(250)
            record("价格修改进入事实审核", "等待事实审核" in page.locator(".request-panel").inner_text())
            page.get_by_role("button", name="模拟事实审核通过").click()
            page.wait_for_timeout(500)
            shot(page, "revise-fact-approved-1280")
            page.goto(BASE + "/projects/demo-chair-001/site", wait_until="networkidle")
            page.wait_for_timeout(500)
            record("事实审核后网站同步新价格", "¥139" in page.locator(".site").inner_text())
            page.goto(BASE + "/projects/demo-chair-001/posters", wait_until="networkidle")
            page.wait_for_timeout(300)
            record("事实审核后海报同步新价格", "¥139" in page.locator(".copy-panel").inner_text())
            ctx.close()

            # ---------- 移动端 ----------
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, accept_downloads=True)
            page = ctx.new_page()
            attach_console(page)
            for name, path in [
                ("home", "/"),
                ("pricing", "/pricing"),
                ("create", "/create"),
                ("creative", "/projects/demo-chair-001/creative"),
                ("site", "/projects/demo-chair-001/site"),
                ("posters", "/projects/demo-chair-001/posters"),
                ("delivery", "/projects/demo-chair-001/delivery"),
                ("public", "/p/one-living-chair"),
            ]:
                check_route(page, name, path, 375)
                page.add_style_tag(content=".studio-topbar,.studio-tabs,.marketing-nav,.site-nav{position:static!important}")
                shot(page, f"mobile-{name}")

            page.goto(BASE + "/projects/demo-chair-001/site", wait_until="networkidle")
            page.wait_for_timeout(400)
            page.locator(".site-menu-toggle").click()
            page.wait_for_timeout(200)
            record("移动端站点菜单可以打开", page.locator(".site-nav nav.open").count() == 1)
            page.locator(".site-menu-toggle").click()
            ctx.close()

            # ---------- 平板 ----------
            ctx = browser.new_context(viewport={"width": 768, "height": 1024})
            page = ctx.new_page()
            for name, path in [("home", "/"), ("orders", "/orders"), ("delivery", "/projects/demo-chair-001/delivery")]:
                check_route(page, name, path, 768)
            ctx.close()

            browser.close()
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=8)
            except subprocess.TimeoutExpired:
                server.kill()

    failed = [check for check in results["checks"] if not check["ok"]]
    unique_errors = sorted(set(results["consoleErrors"]))
    results["summary"] = {
        "checks": len(results["checks"]),
        "failed": len(failed),
        "consoleErrors": len(unique_errors),
    }
    (ROOT / "docs" / "visual-qa-results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log("\n检查：%d 项，失败 %d 项；控制台错误 %d 条；截图 %d 张" % (
        results["summary"]["checks"], results["summary"]["failed"], results["summary"]["consoleErrors"], len(results["screenshots"])
    ))
    for error in unique_errors[:10]:
        log("  console error: " + error)
    return 1 if failed or unique_errors else 0


if __name__ == "__main__":
    sys.exit(main())

