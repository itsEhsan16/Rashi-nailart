import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Your details", "Pay & confirm", "Booked"] as const;

/** Lightweight progress indicator so the customer always knows where they are. */
export function BookingSteps({ current }: { current: 0 | 1 | 2 }) {
  const last = STEPS.length - 1;
  return (
    <ol className="flex items-center" aria-label="Booking progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={label}>
            <li className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                      : "bg-muted text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                  !active && "hidden sm:inline",
                )}
              >
                {label}
              </span>
            </li>
            {i < last && (
              <span className={cn("mx-3 h-px flex-1", done ? "bg-primary" : "bg-border")} aria-hidden />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
