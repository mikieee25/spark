import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingFiles() {
  return <div className="space-y-6" aria-label="Loading files"><Skeleton className="h-6 w-32" /><Skeleton className="h-12 w-72" /><Skeleton className="h-80 w-full" /></div>;
}
