import { getCurrentUser } from "@/features/auth/request-auth";
import { getFileService } from "@/features/files/file-runtime";
import { RecycleWorkspace } from "@/features/recycle/recycle-workspace";

export const dynamic = "force-dynamic";

export default async function RecyclePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <RecycleWorkspace
      entries={getFileService().listRecycleEntries()}
      userRole={user.role}
    />
  );
}
