import { FileWorkspace } from "@/features/files/file-workspace";
import { getCurrentUser } from "@/features/auth/request-auth";
import {
  listFavorites,
  listRecentItems,
} from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";

export const dynamic = "force-dynamic";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; preview?: string }>;
}) {
  const { path = "", preview } = await searchParams;
  const user = await getCurrentUser();
  const database = getDatabase();
  return (
    <FileWorkspace
      initialPath={path}
      initialEntries={null}
      initialPreview={preview}
      initialFavorites={user ? listFavorites(database, user.id) : []}
      initialRecent={user ? listRecentItems(database, user.id, 12) : []}
    />
  );
}
