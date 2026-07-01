"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Shared skeleton building blocks + per-page compositions.
 *
 * The same shapes are used in two places so a loading page and the panel it
 * becomes line up visually:
 *  - route-level `loading.tsx` files (shown while the next page streams in), and
 *  - a panel's own loading state (shown while it fetches its data client-side).
 */

/** Title + subtitle lines, with an optional right-aligned action pill. */
export function SectionHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      {withAction && <Skeleton className="h-8 w-24 rounded-md" />}
    </div>
  );
}

/** Page title block matching <PageHeader> (icon tile + title + subtitle). */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-5 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    </div>
  );
}

/** Vertical nav placeholder matching the dashboard sidebar (md+ only). */
export function NavSidebarSkeleton({ count = 6 }: { count?: number }) {
  return (
    <nav className="hidden md:sticky md:top-24 md:flex md:h-fit md:flex-col md:gap-1 md:rounded-xl md:border md:bg-card/60 md:p-2 md:shadow-soft">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </nav>
  );
}

/** Row of pill-shaped tab triggers. */
export function TabsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24 rounded-md" />
      ))}
    </div>
  );
}

/** Filter-bar card shown above tables (e.g. bookings). */
export function FilterBarSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card className="p-4 shadow-soft">
      <div className="flex flex-wrap items-end gap-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

/** Responsive table placeholder — real <Table> on md+, stacked cards on mobile. */
export function TableSkeleton({
  columns,
  rows = 6,
  className,
}: {
  columns: number;
  rows?: number;
  className?: string;
}) {
  return (
    <>
      {/* Desktop */}
      <Card className={cn("hidden shadow-soft md:block", className)}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                {Array.from({ length: columns }).map((_, i) => (
                  <TableHead key={i} className="h-10">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rows }).map((_, r) => (
                <TableRow key={r}>
                  {Array.from({ length: columns }).map((_, c) => (
                    <TableCell key={c}>
                      <Skeleton className={cn("h-4", c === 0 ? "w-28" : "w-16")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
          <Card key={i} className="space-y-3 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-24" />
            <div className="space-y-2 border-t border-border/60 pt-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/** Bordered list rows (services, time slots, branches …). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Grid of stat cards. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

// ───────────────────────────── Page compositions ────────────────────────────

export function BookingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <TabsSkeleton count={2} />
      <FilterBarSkeleton fields={4} />
      <TableSkeleton columns={8} />
    </div>
  );
}

export function PaymentsPageSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeaderSkeleton withAction />
      <TableSkeleton columns={7} />
    </div>
  );
}

export function MembersPageSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeaderSkeleton withAction />
      <TableSkeleton columns={7} />
    </div>
  );
}

export function OverviewPageSkeleton() {
  return (
    <div className="space-y-6">
      <StatGridSkeleton count={7} />
      <div className="flex justify-end">
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function TeamPageSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="flex items-center gap-3 rounded-xl p-3 shadow-soft">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </div>
      <SectionHeaderSkeleton withAction />
      <TableSkeleton columns={5} rows={4} />
    </div>
  );
}

export function ManagePageSkeleton() {
  return (
    <div className="space-y-6">
      <TabsSkeleton count={4} />
      <Card className="space-y-4 rounded-xl p-5 shadow-soft">
        <SectionHeaderSkeleton withAction />
        <ListSkeleton rows={5} />
      </Card>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <Card className="max-w-2xl space-y-5 rounded-xl p-5 shadow-soft">
      <SectionHeaderSkeleton />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-10 w-36 rounded-md" />
    </Card>
  );
}
