"use client";

import { useState } from "react";
import { Menu, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type NavItem = { value: string; label: string; icon: LucideIcon };

/**
 * Controlled dashboard navigation. Renders a vertical sidebar on md+ and a
 * hamburger Sheet on mobile. State is owned by the parent (the controlled
 * <Tabs>), so every panel keeps working unchanged.
 */
export function DashboardNav({
  items,
  value,
  onValueChange,
}: {
  items: NavItem[];
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = items.find((i) => i.value === value) ?? items[0];

  const Row = ({ item, onClick }: { item: NavItem; onClick: () => void }) => {
    const Icon = item.icon;
    const isActive = item.value === value;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {isActive && (
          <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary" aria-hidden />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "")} />
        {item.label}
      </button>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:sticky md:top-24 md:flex md:h-fit md:flex-col md:gap-1 md:rounded-xl md:border md:bg-card/60 md:p-2 md:shadow-soft">
        {items.map((item) => (
          <Row key={item.value} item={item} onClick={() => onValueChange(item.value)} />
        ))}
      </nav>

      {/* Mobile top bar + sheet */}
      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 shadow-soft md:hidden">
        <span className="flex items-center gap-2 text-sm font-medium">
          {active && <active.icon className="h-4 w-4 text-primary" />}
          {active?.label}
        </span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetTitle className="mb-4 font-display">Menu</SheetTitle>
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <Row
                  key={item.value}
                  item={item}
                  onClick={() => {
                    onValueChange(item.value);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
