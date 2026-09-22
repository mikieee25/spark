const MIME_BY_EXTENSION: Record<string, string> = {
  ".c": "text/x-c", ".css": "text/css", ".csv": "text/csv", ".go": "text/x-go",
  ".html": "text/html", ".java": "text/x-java-source", ".js": "text/javascript",
  ".json": "application/json", ".jsx": "text/javascript", ".md": "text/markdown",
  ".avif": "image/avif", ".bmp": "image/bmp", ".gif": "image/gif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".tif": "image/tiff", ".tiff": "image/tiff", ".webp": "image/webp",
  ".py": "text/x-python", ".rs": "text/x-rust", ".sh": "text/x-shellscript",
  ".sql": "application/sql", ".svg": "image/svg+xml", ".toml": "application/toml",
  ".ts": "text/typescript", ".tsx": "text/typescript", ".txt": "text/plain",
  ".xml": "application/xml", ".yaml": "application/yaml", ".yml": "application/yaml",
};

const TEXT_EXTENSIONS = new Set([
  ".c", ".css", ".csv", ".go", ".html", ".java", ".js", ".json", ".jsx", ".md", ".py",
  ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);

export type ContentClassification = Readonly<{ extension: string; mimeType: string; text: boolean }>;

export function classifyContent(name: string, mimeType?: string): ContentClassification {
  const match = /\.[^./]+$/.exec(name);
  const extension = match ? match[0].toLowerCase() : "";
  const knownMime = MIME_BY_EXTENSION[extension];
  const safeMime = knownMime ?? (mimeType?.split(";", 1)[0].trim().toLowerCase() || "application/octet-stream");
  return { extension, mimeType: safeMime, text: TEXT_EXTENSIONS.has(extension) };
}
