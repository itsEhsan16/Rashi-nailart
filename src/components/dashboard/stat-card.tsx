import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Accent = "primary" | "emerald" | "amber" | "muted";

/** Static class maps — never build Tailwind class strings dynamically. */
const ACCENT: Record<Accent, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  muted: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  icon,
  hint,
  accent = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  accent?: Accent;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 shadow-soft transition-shadow hover:shadow-elegant", className)}>
      <div className="flex items-center gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", ACCENT[accent])}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="font-display text-xl font-semibold leading-tight tabular-nums">{value}</div>
        </div>
      </div>
      {hint && <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
