// Create the first internal user (admin/manager/staff) via the Supabase admin API.
// The auth trigger (handle_new_user) creates the matching profile row from metadata.
//
// Usage (Node 20.6+ can load env from a file):
//   node --env-file=.env.local scripts/seed-admin.mjs <email> <password> [role] [branch] [staffName]
//
// Examples:
//   node --env-file=.env.local scripts/seed-admin.mjs admin@rashi.studio 'StrongPass#123'
//   node --env-file=.env.local scripts/seed-admin.mjs divya@rashi.studio 'Pass#123' staff 'Vile Parle' Divya
import { createClient } from "@supabase/supabase-js";

const [, , email, password, role = "admin", branch, staffName] = process.argv;

if (!email || !password) {
  console.error(
    "Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <password> [role] [branch] [staffName]",
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    role,
    full_name: staffName ?? (role === "admin" ? "Administrator" : email),
    staff_name: staffName ?? null,
    branch: branch ?? null,
  },
});

if (error) {
  console.error("Failed to create user:", error.message);
  process.exit(1);
}

console.log(`✓ Created ${role} user ${email} (id: ${data.user.id})`);
console.log("  A matching profile row was created by the on_auth_user_created trigger.");
