import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@/components/markdown-content";

describe("MarkdownContent renderer", () => {
  it("renders tables properly into HTML table with wrapper", () => {
    const markdown = `
| 费用类别 | 消费明细 | 人均预估 |
| :--- | :--- | ---: |
| **自驾** | 油费过路费 | ¥150 |
| **门票** | [南宫山景区](https://example.com/ticket) | ¥0 |
`.trim();

    const html = renderToString(<MarkdownContent content={markdown} />);
    expect(html).toContain('<div class="table-wrapper">');
    expect(html).toContain('<table class="markdown-table">');
    expect(html).toContain(">费用类别</th>");
    expect(html).toContain("<strong>自驾</strong>");
    expect(html).toContain('<a class="inline-link" href="https://example.com/ticket" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain(">南宫山景区<span aria-hidden=\"true\"");
  });

  it("splits H3 sub-headings into collapsible sub-sections", () => {
    const markdown = `
前言介绍

### 1. 自驾导航规范
自驾详细说明

### 2. 核心航点汇总
| 航点 | 坐标 |
| --- | --- |
| WP1 | 34.0, 108.9 |
`.trim();

    const html = renderToString(<MarkdownContent content={markdown} />);
    expect(html).toContain("<details class=\"sub-section-accordion\" open=\"\"");
    expect(html).toContain("自驾导航规范");
    expect(html).toContain("核心航点汇总");
    expect(html).toContain("<table class=\"markdown-table\">");
  });

  it("sanitizes unsafe links and escapes raw script tags", () => {
    const malicious = `
[危险链接](javascript:alert(1))
<script>alert("xss")</script>
[正常链接](https://safe.example.com)
`.trim();

    const html = renderToString(<MarkdownContent content={malicious} />);
    // javascript: link must NOT be rendered as <a href="javascript:">
    expect(html).not.toContain('href="javascript:');
    // Raw script tag must be HTML-escaped by React
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    // Safe link is preserved
    expect(html).toContain('href="https://safe.example.com"');
  });

  it("handles unordered and ordered lists", () => {
    const markdown = `
- 重点 1: **严防失温**
- 重点 2: 保持通讯

1. 步骤一: 下载轨迹
2. 步骤二: 检查装备
`.trim();

    const html = renderToString(<MarkdownContent content={markdown} />);
    expect(html).toContain('<ul class="markdown-ul">');
    expect(html).toContain("<strong>严防失温</strong>");
    expect(html).toContain('<ol class="markdown-ol">');
    expect(html).toContain("下载轨迹");
  });
});
