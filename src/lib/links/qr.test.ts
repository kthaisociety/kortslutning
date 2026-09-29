import { describe, expect, it } from "vitest";
import { isQrFormat, QR_PNG_WIDTH, qrFilename, renderQrPng, renderQrSvg } from "./qr";

describe("renderQrSvg", () => {
  it("renders a standalone SVG document", async () => {
    const svg = await renderQrSvg("https://ktha.is/apply");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("encodes different URLs differently", async () => {
    expect(await renderQrSvg("https://ktha.is/a")).not.toBe(await renderQrSvg("https://ktha.is/b"));
  });
});

describe("renderQrPng", () => {
  it("renders a square PNG of the configured width", async () => {
    const png = await renderQrPng("https://ktha.is/apply");
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(QR_PNG_WIDTH); // IHDR width
    expect(view.getUint32(20)).toBe(QR_PNG_WIDTH); // IHDR height
  });
});

describe("isQrFormat", () => {
  it.each(["svg", "png"])("accepts %s", (format) => {
    expect(isQrFormat(format)).toBe(true);
  });

  it.each(["jpg", "SVG", ""])("rejects %j", (format) => {
    expect(isQrFormat(format)).toBe(false);
  });
});

describe("qrFilename", () => {
  it("names the file after the short link", () => {
    expect(qrFilename("https://ktha.is", "apply", "svg")).toBe("ktha.is-apply.svg");
    expect(qrFilename("http://short.localhost:3000", "apply", "png")).toBe("short.localhost-apply.png");
  });
});
