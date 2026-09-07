"use client";

import { Users } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { StaffEarning } from "@/lib/actions/admin";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Per-artist completed-work rollup (count · services · extras · earnings).
 * Shared by the admin overview (all branches) and the manager branch overview.
 * Earnings exclude the ₹50 booking fee — it's the salon's, never the artist's.
 *
 * `showBranch` labels each artist with their studio. Pass it for the admin view,
 * where two branches can employ artists of the same name and the rows would
 * otherwise be indistinguishable; leave it off for a manager, whose rows are all
 * one branch already.
 */
export function StaffEarningsTable({
  rows,
  showBranch = false,
}: {
  rows: StaffEarning[];
  showBranch?: boolean;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="No completed work yet"
        description="Once artists mark bookings done, their completed count and earnings show up here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Artist</TableHead>
          <TableHead className="text-right">Done</TableHead>
          <TableHead className="text-right">Services</TableHead>
          <TableHead className="text-right">Extras</TableHead>
          <TableHead className="text-right">Earnings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          // Branch + name: the name alone is not unique across studios.
          <TableRow key={`${r.branch}|${r.staffName}`}>
            <TableCell className="font-medium">
              {r.staffName}
              {showBranch && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{r.branch}</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
            <TableCell className="text-right tabular-nums">{inr(r.serviceRevenue)}</TableCell>
            <TableCell className="text-right tabular-nums">{inr(r.extrasRevenue)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {inr(r.earnings)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
