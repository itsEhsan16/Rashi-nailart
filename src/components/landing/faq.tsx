"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I book an appointment?",
    a: "Pick your branch, artist, date, time and service in the booking form, then pay the ₹50 confirmation fee. Your slot is reserved the moment payment succeeds.",
  },
  {
    q: "What is the ₹50 booking fee?",
    a: "It's a small confirmation fee that secures your slot and reduces no-shows. Your service is paid at the studio after your appointment.",
  },
  {
    q: "How does the ₹100 membership work?",
    a: "A one-year membership gives you 50% off every nail-art service. Benefits start the day you join and stay valid for a full year. We recognise you automatically by your phone number at booking.",
  },
  {
    q: "Can I reschedule or cancel?",
    a: "Rescheduling isn't possible. If you miss your appointment, the ₹50 confirmation fee won't be refunded and you'll need to book again.",
  },
  {
    q: "Where are you located?",
    a: "We have two studios across Mumbai — Vile Parle and Bandra.",
  },
];

export function Faq() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {FAQS.map((f, i) => (
        <AccordionItem key={i} value={`item-${i}`}>
          <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
