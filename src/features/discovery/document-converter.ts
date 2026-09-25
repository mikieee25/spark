export const MAX_CONVERTED_PREVIEW_BYTES = 64 * 1024 * 1024;
export const CONVERTER_TIMEOUT_MS = 30_000;

export type DocumentConverter = Readonly<{
  convert(name: string, bytes: Buffer): Promise<Buffer>;
}>;

export function createDocumentConverter(url: URL): DocumentConverter {
  return {
    async convert(name, bytes) {
      const form = new FormData();
      form.append("files", new Blob([new Uint8Array(bytes)]), name);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(CONVERTER_TIMEOUT_MS),
        });
      } catch {
        throw new Error("PREVIEW_CONVERTER_UNAVAILABLE");
      }
      if (
        !response.ok ||
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/pdf")
      ) {
        throw new Error("PREVIEW_CONVERTER_INVALID_RESPONSE");
      }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > MAX_CONVERTED_PREVIEW_BYTES)
        throw new Error("PREVIEW_TOO_LARGE");
      const body = Buffer.from(await response.arrayBuffer());
      if (
        body.byteLength > MAX_CONVERTED_PREVIEW_BYTES ||
        body.byteLength < 5 ||
        body.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error("PREVIEW_CONVERTER_INVALID_RESPONSE");
      return body;
    },
  };
}
