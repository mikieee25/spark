import { FileWorkspace } from "@/features/files/file-workspace";
import { getFileService } from "@/features/files/file-runtime";
import { getCurrentUser } from "@/features/auth/request-auth";
import { listFavorites, listRecentItems } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await getCurrentUser();
  const entries = await getFileService().list("");
  const database = getDatabase();
  return <FileWorkspace
    initialPath=""
    initialEntries={entries}
    initialFavorites={user ? listFavorites(database, user.id) : []}
    initialRecent={user ? listRecentItems(database, user.id, 12) : []}
  />;
}
