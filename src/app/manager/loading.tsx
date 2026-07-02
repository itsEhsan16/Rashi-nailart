import {
  NavSidebarSkeleton,
  OverviewPageSkeleton,
  PageHeaderSkeleton,
} from "@/components/dashboard/skeletons";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-5">
        <NavSidebarSkeleton count={5} />
        <div className="min-w-0">
          <OverviewPageSkeleton />
        </div>
      </div>
    </div>
  );
}
