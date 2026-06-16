import type { Metadata } from "next";
import { PortalLogin } from "@/components/portal-login";

export const metadata: Metadata = {
  title: "Staff login",
  robots: { index: false, follow: false },
};

export default function StaffLoginPage() {
  return <PortalLogin role="staff" />;
}
