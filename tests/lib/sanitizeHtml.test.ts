import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../../app/lib/sanitizeHtml";

describe("sanitizeHtml — chặn XSS khi render transcript (bug 5.5)", () => {
  it("loại bỏ thẻ <script>", () => {
    const malicious = `<p>Xin chào</p><script>alert('xss')</script>`;
    expect(sanitizeHtml(malicious)).not.toContain("<script");
    expect(sanitizeHtml(malicious)).not.toContain("alert('xss')");
  });

  it("loại bỏ thẻ <iframe>", () => {
    const html = `<iframe src="https://evil.com"></iframe>`;
    expect(sanitizeHtml(html)).not.toContain("<iframe");
  });

  it("loại bỏ thẻ <object>", () => {
    const html = `<object data="evil.swf"></object>`;
    expect(sanitizeHtml(html)).not.toContain("<object");
  });

  it("loại bỏ thẻ <embed>", () => {
    const html = `<embed src="evil.swf" />`;
    expect(sanitizeHtml(html)).not.toContain("<embed");
  });

  it("loại bỏ event handler onclick", () => {
    const html = `<a href="#" onclick="alert('xss')">click</a>`;
    expect(sanitizeHtml(html)).not.toContain("onclick=");
  });

  it("loại bỏ event handler onerror", () => {
    const html = `<img src="x" onerror="alert('xss')" />`;
    expect(sanitizeHtml(html)).not.toContain("onerror=");
  });

  it("loại bỏ event handler onload", () => {
    const html = `<body onload="alert('xss')">`;
    expect(sanitizeHtml(html)).not.toContain("onload=");
  });

  it("loại bỏ nhiều event handler cùng lúc", () => {
    const html = `<div onclick="bad()" onmouseover="bad2()">Xin chào</div>`;
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onclick=");
    expect(result).not.toContain("onmouseover=");
  });

  it("loại bỏ javascript: protocol", () => {
    const html = `<a href="javascript:alert('xss')">click</a>`;
    expect(sanitizeHtml(html)).not.toContain("javascript:");
  });

  it("loại bỏ thẻ <link>", () => {
    const html = `<link rel="stylesheet" href="evil.css">`;
    expect(sanitizeHtml(html)).not.toContain("<link");
  });

  it("loại bỏ thẻ <style>", () => {
    const html = `<style>body { background: url('javascript:alert(1)') }</style>`;
    expect(sanitizeHtml(html)).not.toContain("<style");
  });

  it("giữ lại HTML an toàn (bold, italic, list)", () => {
    const safe = `<p><b>Xin chào</b> <i>mọi người</i></p><ul><li>Mục 1</li></ul>`;
    expect(sanitizeHtml(safe)).toContain("<b>Xin chào</b>");
    expect(sanitizeHtml(safe)).toContain("<i>mọi người</i>");
    expect(sanitizeHtml(safe)).toContain("<li>Mục 1</li>");
  });

  it("xử lý nested script tag", () => {
    const html = `<script><script>alert('nested')</script></script>`;
    expect(sanitizeHtml(html)).not.toContain("alert('nested')");
  });

  it("xử lý uppercase tag", () => {
    const html = `<SCRIPT>alert('xss')</SCRIPT>`;
    expect(sanitizeHtml(html)).not.toContain("alert('xss')");
  });
});
