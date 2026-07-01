import { redirect } from "next/navigation";

/** /admin lands on the Overview tab, the default admin view. */
export default function AdminPage() {
  redirect("/admin/overview");
}
