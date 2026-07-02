"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Crown,
  SlidersHorizontal,
  Settings,
  Users,
  Menu,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Admin sidebar items, one per route. Same order/labels/icons as the old
 * tabbed dashboard so nothing changes visually — only navigation now happens
 * via real URLs (/admin/overview, /admin/team, …) instead of internal state.
 */
const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/members", label: "Members", icon: Crown },
  { href: "/admin/manage", label: "Manage", icon: SlidersHorizontal },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/team", label: "Team", icon: Users },
];

/**
 * Route-aware admin navigation. Renders a vertical sidebar on md+ and a
 * hamburger Sheet on mobile. The active item is derived from the current
 * pathname, so it stays in sync no matter how the user navigates.
 */
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const active = ADMIN_NAV.find((i) => isItemActive(i.href)) ?? ADMIN_NAV[0];

  const Row = ({ item, onClick }: { item: AdminNavItem; onClick?: () => void }) => {
    const Icon = item.icon;
    const isActive = isItemActive(item.href);
    return (
      <Link
        href={item.href}
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
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:sticky md:top-24 md:flex md:h-fit md:flex-col md:gap-1 md:rounded-xl md:border md:bg-card/60 md:p-2 md:shadow-soft">
        {ADMIN_NAV.map((item) => (
          <Row key={item.href} item={item} />
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
              {ADMIN_NAV.map((item) => (
                <Row key={item.href} item={item} onClick={() => setOpen(false)} />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
