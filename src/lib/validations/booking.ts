import { z } from "zod";

import { BRANCHES } from "@/lib/salon-data";

/**
 * Server-side branch vocabulary. Re-exported from @/lib/salon-data rather than
 * re-declared — these were two independent literals, and a branch added to one
 * silently 400'd through the other. Keep the import direction this way:
 * salon-data has no dependencies, so importing it here is free, whereas the
 * reverse would pull zod into every client consumer of salon-data.
 */
export const BRANCHES_TUPLE = BRANCHES;

/** +91 / 10-digit Indian mobile. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(\+91[\s-]?)?[6-9]\d{9}$/,
    "Enter a valid 10-digit Indian mobile number",
  );

/** Client-side form shape (date is a Date object from the calendar). */
export const bookingFormSchema = z.object({
  client_name: z.string().trim().min(1, "Please enter your name").max(100),
  phone: phoneSchema,
  branch: z.enum(BRANCHES_TUPLE),
  appointment_date: z.date({ required_error: "Pick a date" }),
  time_slot: z.string().min(1, "Pick a time slot"),
  service: z.string().min(1, "Choose a service"),
  staff_name: z.string().min(1, "Choose an artist"),
  special_requests: z.string().max(500).optional(),
});
export type BookingFormValues = z.infer<typeof bookingFormSchema>;

/** Server action input (date already formatted yyyy-MM-dd). */
export const createBookingInputSchema = z.object({
  client_name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  branch: z.enum(BRANCHES_TUPLE),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  time_slot: z.string().min(1).max(50),
  service: z.string().min(1).max(100),
  staff_name: z.string().min(1).max(50),
  special_requests: z.string().max(500).optional().nullable(),
});
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
