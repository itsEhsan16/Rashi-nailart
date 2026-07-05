import Link from "next/link";
import {
  Sparkles,
  Crown,
  MapPin,
  LogIn,
  Instagram,
  Facebook,
  Star,
  Quote,
  CheckCircle2,
  CalendarHeart,
  CreditCard,
  ArrowRight,
  Clock,
} from "lucide-react";
import fs from "fs";
import path from "path";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { BookingForm } from "@/components/booking/booking-form";
import { MembershipDialog } from "@/components/booking/membership-dialog";
import { Reveal } from "@/components/landing/reveal";
import { Faq } from "@/components/landing/faq";
import { NailCard } from "@/components/landing/nail-card";
import { HeroCollage } from "@/components/landing/hero-collage";
import { getCatalog } from "@/lib/catalog";
import { MEMBERSHIP_PRICE, BOOKING_FEE, PENDING_HOLD_MINUTES } from "@/lib/salon-data";

function getNailCategories() {
  const dir = path.join(process.cwd(), "public", "nail-categories");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const files = fs.readdirSync(path.join(dir, e.name))
        .filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f));
      return {
        name: e.name,
        images: files.map((f) =>
          `/nail-categories/${encodeURIComponent(e.name)}/${encodeURIComponent(f)}`
        ),
      };
    })
    .filter((c) => c.images.length > 0);
}

const TESTIMONIALS = [
  { name: "Aanya S.", branch: "Bandra", text: "Booked in under a minute and my acrylics lasted weeks. The membership pays for itself!" },
  { name: "Priya M.", branch: "Vile Parle", text: "The loveliest studio — the artists are so detailed and the space is gorgeous." },
  { name: "Rehana K.", branch: "Vile Parle", text: "Quick, clean, and the gel polish is flawless every single time. Highly recommend." },
];

const HOW_IT_WORKS = [
  {
    icon: CalendarHeart,
    title: "Choose your look & slot",
    text: "Pick a branch, artist, date and service. See real-time availability as you go.",
  },
  {
    icon: CreditCard,
    title: `Pay ₹${BOOKING_FEE} to lock it in`,
    text: `A small booking fee holds your slot for ${PENDING_HOLD_MINUTES} minutes — pay securely online to confirm.`,
  },
  {
    icon: Sparkles,
    title: "Get pampered",
    text: "Arrive at your appointment and settle the balance at the studio. That's it!",
  },
];

export default async function HomePage() {
  const { services, timeSlots, branches, staff } = await getCatalog();
  const nailCategories = getNailCategories();
  const heroImages = nailCategories.slice(0, 3).map((c) => c.images[0]);
  const galleryCategories = nailCategories.slice(0, 9);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: "Rashi Nail Art Studio",
    description:
      "Premium nail art, gel polish and extensions across Vile Parle and Bandra, Mumbai.",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    image: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/og.png`,
    areaServed: "Mumbai",
    address: branches.map((b) => ({
      "@type": "PostalAddress",
      streetAddress: b.address ?? `${b.name}, Mumbai`,
      addressLocality: "Mumbai",
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    })),
    makesOffer: services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name },
      price: s.price,
      priceCurrency: "INR",
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
          <Link href="/" className="flex items-center gap-2">
            <Logo priority className="h-12 w-auto" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#services" className="transition-colors hover:text-foreground">Services</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#work" className="transition-colors hover:text-foreground">Our work</a>
            <a href="#membership" className="transition-colors hover:text-foreground">Membership</a>
            <a href="#branches" className="transition-colors hover:text-foreground">Branches</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild className="bg-gradient-hero text-primary-foreground shadow-soft">
              <a href="#book">Book now</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* decorative background */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-soft" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-20 top-40 -z-10 h-72 w-72 rounded-full bg-gold/20 blur-3xl" aria-hidden />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Now open in {branches.map((b) => b.name).join(" & ")}
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Nail art that
              <br />
              <span className="bg-gradient-hero bg-clip-text text-transparent">turns heads.</span>
            </h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
              Premium gel, extensions & hand-painted art by expert artists — reserved in under a
              minute and held with a small ₹{BOOKING_FEE} fee.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 bg-gradient-hero px-7 text-primary-foreground shadow-soft">
                <a href="#book">
                  Book your appointment <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7">
                <a href="#membership">
                  <Crown className="mr-2 h-4 w-4" /> Become a member
                </a>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" /> Book in 60 seconds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Secure UPI payments
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" /> {branches.length} Mumbai studios
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:pl-6">
            <HeroCollage images={heroImages} />
          </Reveal>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16">
        <Reveal className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Services</p>
          <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Crafted, not rushed</h2>
          <p className="mt-2 text-muted-foreground">Expert artists, premium products, finished to perfection.</p>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.05}>
              <Card className="group flex h-full flex-col p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                <p className="mt-auto pt-4 text-2xl font-semibold text-primary">₹{s.price}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-gradient-soft">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-10 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Booked in three easy steps</h2>
            <p className="mt-2 text-muted-foreground">No phone calls, no guesswork — you always know what&apos;s next.</p>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.07}>
                <Card className="relative h-full p-6 shadow-soft">
                  <span className="absolute right-5 top-5 font-display text-3xl font-semibold text-primary/15">
                    {i + 1}
                  </span>
                  <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8 text-center">
            <Button asChild size="lg" className="h-12 bg-gradient-hero px-7 text-primary-foreground shadow-soft">
              <a href="#book">Start booking <ArrowRight className="ml-1.5 h-4 w-4" /></a>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* Gallery */}
      <section id="work" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16">
        <Reveal className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Our work</p>
          <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Real sets, real studios</h2>
          <p className="mt-2 text-muted-foreground">A glimpse of recent looks from our artists.</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {galleryCategories.map((cat, i) => (
            <Reveal key={cat.name} delay={(i % 3) * 0.05}>
              <NailCard name={cat.name} images={cat.images} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Membership */}
      <section id="membership" className="mx-auto max-w-4xl scroll-mt-20 px-6 py-16">
        <Reveal>
          <Card className="relative overflow-hidden border-primary/30 p-7 shadow-elegant md:p-9">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary/10 blur-2xl" aria-hidden />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 text-left">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-hero text-primary-foreground shadow-soft">
                  <Crown className="h-7 w-7" />
                </div>
                <div>
                  <Badge variant="secondary" className="mb-1.5">Best value</Badge>
                  <div className="font-display text-2xl font-semibold">
                    One-year membership · ₹{MEMBERSHIP_PRICE}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">A member discount</span>{" "}
                    redeemed in-store, for a full year. Benefits start the day you join.
                  </p>
                </div>
              </div>
              <MembershipDialog price={MEMBERSHIP_PRICE} />
            </div>
          </Card>
        </Reveal>
      </section>

      {/* Branches */}
      <section id="branches" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16">
        <Reveal className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Visit us</p>
          <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Find your nearest studio</h2>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2">
          {branches.map((b, i) => (
            <Reveal key={b.name} delay={i * 0.05}>
              <Card className="flex h-full items-start gap-4 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{b.address ?? "Mumbai, Maharashtra"}</p>
                  <Badge variant="secondary" className="mt-3">Open today</Badge>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gradient-soft">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-10 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">Reviews</p>
            <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Loved by our clients</h2>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.05}>
                <Card className="flex h-full flex-col p-6 shadow-soft">
                  <div className="mb-3 flex items-center gap-1 text-amber-400">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <Quote className="h-6 w-6 text-primary/30" />
                  <p className="mt-2 text-sm">{t.text}</p>
                  <div className="mt-4 text-sm font-medium">
                    {t.name} <span className="font-normal text-muted-foreground">· {t.branch}</span>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <div className="lg:sticky lg:top-24">
              <p className="text-sm font-medium uppercase tracking-widest text-primary">Book now</p>
              <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Reserve your spot</h2>
              <p className="mt-3 text-muted-foreground">
                Pick a branch, artist, date &amp; service — confirm with a ₹{BOOKING_FEE} fee that&apos;s
                deducted from your total.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Live availability — no double bookings",
                  `Slot held for ${PENDING_HOLD_MINUTES} minutes while you pay`,
                  "Members get a discount, redeemed in-store",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <BookingForm
              services={services}
              timeSlots={timeSlots}
              branches={branches}
              staff={staff}
              bookingFee={BOOKING_FEE}
            />
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-16">
        <Reveal className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Questions</p>
          <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Frequently asked</h2>
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo className="h-9 w-auto" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
              <a
                href="https://www.instagram.com/rashinailartstudio_vileparle"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram — Vile Parle"
                className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
              >
                <Instagram className="h-5 w-5" /> Vile Parle
              </a>
              <a
                href="https://www.instagram.com/rashinailartstudio_bandra"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram — Bandra"
                className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
              >
                <Instagram className="h-5 w-5" /> Bandra
              </a>
              <a href="#" aria-label="Facebook" className="transition-colors hover:text-primary">
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Simple, secure UPI payments
            </p>
            <div className="flex items-center gap-4">
              <Link href="/login" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <LogIn className="h-3.5 w-3.5" /> Staff &amp; admin login
              </Link>
              <p>© {new Date().getFullYear()} Rashi Nail Art Studio. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
