"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BOOKING_FEE, MEMBERSHIP_PRICE, PAYING_HOLD_MINUTES } from "@/lib/salon-data";
import { PAYMENT_FAILURE_SUMMARY, REFUND_SUMMARY } from "@/lib/policy-copy";
import { listAnd } from "@/lib/utils";

/**
 * Amounts and the refund stance come from shared constants, not hardcoded text —
 * a reviewer reads the FAQ and the /refund page side by side, and the two
 * contradicting each other is exactly the kind of thing that stalls a payment
 * gateway application.
 */
function faqs(branches: readonly string[]): { q: string; a: string }[] {
  return [
    {
      q: "How do I book an appointment?",
      a: `Pick your branch, artist, date, time and service in the booking form, then pay the ₹${BOOKING_FEE} confirmation fee. Your slot is reserved the moment payment succeeds.`,
    },
    {
      q: `What is the ₹${BOOKING_FEE} booking fee?`,
      a: `It's a small confirmation fee that secures your slot and reduces no-shows. It's deducted from your total — your service is paid at the studio after your appointment.`,
    },
    {
      q: `How does the ₹${MEMBERSHIP_PRICE} membership work?`,
      a: `A one-year membership unlocks a member discount, redeemed in-store by our team. Benefits start the day you join and stay valid for a full year. We recognise you automatically by your phone number at booking.`,
    },
    {
      q: "Can I reschedule or cancel?",
      a: REFUND_SUMMARY,
    },
    {
      q: "I was charged but didn't get a booking. What now?",
      a: `${PAYMENT_FAILURE_SUMMARY} Please don't pay again — contact us first and have your order ID ready.`,
    },
    {
      q: "How long is my slot held while I pay?",
      a: `${PAYING_HOLD_MINUTES} minutes from the moment you start payment. If payment isn't completed in that time the slot is released so someone else can book it.`,
    },
    {
      q: "Where are you located?",
      // Driven by the live branch list so it can't go stale the next time a studio
      // opens. The fallback covers a getCatalog() outage, which degrades to an
      // empty list rather than throwing.
      a: branches.length
        ? `We have ${branches.length} ${branches.length === 1 ? "studio" : "studios"} across Mumbai — ${listAnd(branches)}. Full addresses and phone numbers are on our Contact page.`
        : "Our studios are across Mumbai. Full addresses and phone numbers are on our Contact page.",
    },
  ];
}

export function Faq({ branches = [] }: { branches?: readonly string[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {faqs(branches).map((f, i) => (
        <AccordionItem key={i} value={`item-${i}`}>
          <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
