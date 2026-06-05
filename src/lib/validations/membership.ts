import { z } from "zod";
import { phoneSchema } from "./booking";

export const membershipSchema = z.object({
  client_name: z.string().trim().min(1, "Please enter your name").max(100),
  phone: phoneSchema,
});

export type MembershipValues = z.infer<typeof membershipSchema>;
