import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  TabsSkeleton,
} from "@/components/dashboard/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <TabsSkeleton count={3} />
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
