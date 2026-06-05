"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserRole } from "@/lib/auth";
import { BRANCHES } from "@/lib/salon-data";
import { OverviewPanel } from "./overview-panel";
import { BookingsPanel } from "./bookings-panel";
import { MembersPanel } from "./members-panel";
import { ManagePanel } from "./manage-panel";
import { TeamPanel } from "./team-panel";
import { StaffManager } from "./staff-manager";

type BranchName = (typeof BRANCHES)[number];

export function DashboardTabs({ role, branch }: { role: UserRole; branch: string | null }) {
  if (role === "admin") {
    return (
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <OverviewPanel />
        </TabsContent>
        <TabsContent value="bookings" className="mt-6">
          <BookingsPanel role="admin" />
        </TabsContent>
        <TabsContent value="members" className="mt-6">
          <MembersPanel />
        </TabsContent>
        <TabsContent value="manage" className="mt-6">
          <ManagePanel />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <TeamPanel role="admin" branch={null} />
        </TabsContent>
      </Tabs>
    );
  }

  // manager
  return (
    <Tabs defaultValue="bookings">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="bookings">Bookings</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="staff">Stylists</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="bookings" className="mt-6">
        <BookingsPanel role="manager" />
      </TabsContent>
      <TabsContent value="members" className="mt-6">
        <MembersPanel />
      </TabsContent>
      <TabsContent value="staff" className="mt-6">
        <StaffManager lockedBranch={(branch ?? undefined) as BranchName | undefined} />
      </TabsContent>
      <TabsContent value="team" className="mt-6">
        <TeamPanel role="manager" branch={branch} />
      </TabsContent>
    </Tabs>
  );
}
