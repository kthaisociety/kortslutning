import QRCode from "qrcode";

export const QR_FORMATS = ["svg", "png"] as const;
export type QrFormat = (typeof QR_FORMATS)[number];
export const QR_PNG_WIDTH = 1024;

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 4 } as const;

export function isQrFormat(value: string): value is QrFormat {
  return (QR_FORMATS as readonly string[]).includes(value);
}

export function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...QR_OPTIONS, type: "svg" });
}

export async function renderQrPng(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await QRCode.toBuffer(text, { ...QR_OPTIONS, type: "png", width: QR_PNG_WIDTH });
  return new Uint8Array(buffer);
}

/** Download filename, e.g. "ktha.is-apply.svg". */
export function qrFilename(shortUrl: string, slug: string, format: QrFormat): string {
  return `${new URL(shortUrl).hostname}-${slug}.${format}`;
}
