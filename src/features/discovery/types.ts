export type IndexEntryKind = "file" | "folder";
export type IndexStateStatus = "idle" | "running" | "error";

export type IndexEntry = {
  logicalPath: string;
  parentPath: string;
  name: string;
  kind: IndexEntryKind;
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
  mimeType: string;
  textIndexed: boolean;
  generation: number;
  indexedAt: string;
};

export type IndexText = {
  logicalPath: string;
  name: string;
  textContent: string;
};
export type IndexState = {
  generation: number;
  cursor: string | null;
  status: IndexStateStatus;
  error: string | null;
  updatedAt: string;
};
export type Favorite = {
  userId: string;
  logicalPath: string;
  createdAt: string;
};
export type RecentItem = {
  userId: string;
  logicalPath: string;
  accessedAt: string;
};
