import type { FolderUploadItem } from "./file-api";

type Entry = Readonly<{
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (
    success: (file: File) => void,
    failure?: (error: DOMException) => void
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: Entry[]) => void,
      failure?: (error: DOMException) => void
    ) => void;
  };
}>;

type EntryDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => Entry | null;
};

function readFile(entry: Entry): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) return reject(new Error("UNSUPPORTED_DROP_ITEM"));
    entry.file(resolve, reject);
  });
}

async function readDirectory(entry: Entry): Promise<Entry[]> {
  if (!entry.createReader) throw new Error("UNSUPPORTED_DROP_ITEM");
  const reader = entry.createReader();
  const children: Entry[] = [];
  while (true) {
    const batch = await new Promise<Entry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (!batch.length) return children;
    children.push(...batch);
  }
}

async function collect(entry: Entry): Promise<FolderUploadItem[]> {
  if (entry.isFile) {
    const relativePath = entry.fullPath.replace(/^\/+/, "") || entry.name;
    return [{ file: await readFile(entry), relativePath }];
  }
  if (!entry.isDirectory) throw new Error("UNSUPPORTED_DROP_ITEM");
  const children = await readDirectory(entry);
  return (await Promise.all(children.map(collect))).flat();
}

export async function filesFromDropItems(
  items: readonly DataTransferItem[]
): Promise<FolderUploadItem[]> {
  const files: FolderUploadItem[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = (item as EntryDataTransferItem).webkitGetAsEntry?.();
    if (entry) {
      files.push(...(await collect(entry)));
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push({ file, relativePath: file.name });
  }
  return files;
}
