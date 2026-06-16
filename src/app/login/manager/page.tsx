import type { Metadata } from "next";
import { PortalLogin } from "@/components/portal-login";

export const metadata: Metadata = {
  title: "Manager login",
  robots: { index: false, follow: false },
};

export default function ManagerLoginPage() {
  return <PortalLogin role="manager" />;
}
