import { CheckCircle2, Clock, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for a booking's display status. `completed` wins over
 * payment_status (a completed booking is necessarily verified). Keep the colors
 * identical to the old inline StatusBadge so admin/manager look unchanged.
 */
export type BookingStatusKey =
  | "completed"
  | "verified"
  | "payment_uploaded"
  | "pending_payment"
  | "rejected"
  | "cancelled";

export function bookingStatusKey(row: {
  completed: boolean;
  payment_status: string;
}): BookingStatusKey {
  if (row.completed) return "completed";
  switch (row.payment_status) {
    case "verified":
      return "verified";
    case "payment_uploaded":
      return "payment_uploaded";
    case "pending_payment":
      return "pending_payment";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    default:
      return "pending_payment";
  }
}

type StatusMeta = {
  label: string;
  /** Badge classes. `solid` overrides the default Badge background. */
  className: string;
  /** Falls back to the `variant` prop on <Badge> when no solid class is given. */
  variant?: "outline" | "destructive";
  Icon?: LucideIcon;
};

export const BOOKING_STATUS_META: Record<BookingStatusKey, StatusMeta> = {
  completed: {
    label: "Completed",
    className: "border-transparent bg-emerald-600 text-white",
    Icon: CheckCircle2,
  },
  verified: {
    label: "Confirmed",
    className: "border-transparent bg-emerald-600 text-white",
  },
  payment_uploaded: {
    label: "Awaiting verification",
    className: "border-transparent bg-amber-500 text-white",
    Icon: Clock,
  },
  pending_payment: {
    label: "Awaiting payment",
    className: "",
    variant: "outline",
  },
  rejected: {
    label: "Rejected",
    className: "",
    variant: "destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "",
    variant: "destructive",
  },
};
