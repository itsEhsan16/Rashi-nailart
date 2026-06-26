import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BOOKING_STATUS_META, bookingStatusKey } from "@/lib/booking-status";

/**
 * Consistent booking-status badge used across admin, manager and staff views.
 * Colors mirror the previous inline StatusBadge exactly.
 */
export function StatusPill({
  row,
  className,
}: {
  row: { completed: boolean; payment_status: string };
  className?: string;
}) {
  const meta = BOOKING_STATUS_META[bookingStatusKey(row)];
  const Icon = meta.Icon;
  return (
    <Badge variant={meta.variant} className={cn("gap-1", meta.className, className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
}
