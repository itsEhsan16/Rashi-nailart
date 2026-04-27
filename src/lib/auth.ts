// Simple client-side session for username/password auth.
// The login server function validates credentials; we just store the resulting session locally.

export type Session = {
  id: string;
  username: string;
  role: "admin" | "manager" | "staff";
  branch: "Vile Parle" | "Bandra" | null;
  staffName: string | null;
};

const KEY = "salon_session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
