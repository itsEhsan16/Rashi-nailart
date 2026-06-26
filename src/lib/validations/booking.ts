import { z } from "zod";

export const BRANCHES_TUPLE = ["Vile Parle", "Bandra"] as const;

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

/** Identifies the record a payment screenshot is being uploaded against. */
export const uploadProofSchema = z.object({
  id: z.string().uuid(),
});
export type UploadProofInput = z.infer<typeof uploadProofSchema>;
