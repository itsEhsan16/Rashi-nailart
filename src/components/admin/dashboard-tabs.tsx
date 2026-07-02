"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Crown,
  SlidersHorizontal,
  Settings,
  Users,
} from "lucide-react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DashboardNav, type NavItem } from "@/components/dashboard/dashboard-nav";
import type { UserRole } from "@/lib/auth";
import { BRANCHES } from "@/lib/salon-data";
import { OverviewPanel } from "./overview-panel";
import { ManagerOverviewPanel } from "./manager-overview-panel";
import { BookingsPanel } from "./bookings-panel";
import { SettingsPanel } from "./settings-panel";
import { MembersPanel } from "./members-panel";
import { ManagePanel } from "./manage-panel";
import { TeamPanel } from "./team-panel";
import { StaffManager } from "./staff-manager";

type BranchName = (typeof BRANCHES)[number];

const ADMIN_NAV: NavItem[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "bookings", label: "Bookings", icon: CalendarDays },
  { value: "members", label: "Members", icon: Crown },
  { value: "manage", label: "Manage", icon: SlidersHorizontal },
  { value: "settings", label: "Settings", icon: Settings },
  { value: "team", label: "Team", icon: Users },
];

const MANAGER_NAV: NavItem[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "bookings", label: "Bookings", icon: CalendarDays },
  { value: "members", label: "Members", icon: Crown },
  { value: "staff", label: "Artists", icon: Users },
  { value: "team", label: "Team", icon: Settings },
];

export function DashboardTabs({ role, branch }: { role: UserRole; branch: string | null }) {
  const isAdmin = role === "admin";
  const items = isAdmin ? ADMIN_NAV : MANAGER_NAV;
  const [value, setValue] = useState(items[0].value);

  return (
    <Tabs value={value} onValueChange={setValue} className="md:grid md:grid-cols-[200px_1fr] md:gap-5">
      <DashboardNav items={items} value={value} onValueChange={setValue} />

      <div className="min-w-0">
        {isAdmin ? (
          <>
            <TabsContent value="overview" className="mt-0">
              <OverviewPanel />
            </TabsContent>
            <TabsContent value="bookings" className="mt-0">
              <BookingsPanel role="admin" />
            </TabsContent>
            <TabsContent value="members" className="mt-0">
              <MembersPanel />
            </TabsContent>
            <TabsContent value="manage" className="mt-0">
              <ManagePanel />
            </TabsContent>
            <TabsContent value="settings" className="mt-0">
              <SettingsPanel />
            </TabsContent>
            <TabsContent value="team" className="mt-0">
              <TeamPanel role="admin" branch={null} />
            </TabsContent>
          </>
        ) : (
          <>
            <TabsContent value="overview" className="mt-0">
              <ManagerOverviewPanel />
            </TabsContent>
            <TabsContent value="bookings" className="mt-0">
              <BookingsPanel role="manager" />
            </TabsContent>
            <TabsContent value="members" className="mt-0">
              <MembersPanel />
            </TabsContent>
            <TabsContent value="staff" className="mt-0">
              <StaffManager lockedBranch={(branch ?? undefined) as BranchName | undefined} />
            </TabsContent>
            <TabsContent value="team" className="mt-0">
              <TeamPanel role="manager" branch={branch} />
            </TabsContent>
          </>
        )}
      </div>
    </Tabs>
  );
}
