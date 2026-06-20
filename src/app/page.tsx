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
import { getCatalog } from "@/lib/catalog";
import { MEMBERSHIP_PRICE, BOOKING_FEE } from "@/lib/salon-data";

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
  { name: "Priya M.", branch: "Vile Parle", text: "The loveliest studio — the stylists are so detailed and the space is gorgeous." },
  { name: "Rehana K.", branch: "Vile Parle", text: "Quick, clean, and the gel polish is flawless every single time. Highly recommend." },
];

export default async function HomePage() {
  const { services, timeSlots, branches, staff } = await getCatalog();
  const nailCategories = getNailCategories();

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
    <div className="min-h-screen bg-gradient-soft">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header */}
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo priority className="h-11 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#services" className="hover:text-foreground transition-colors">Services</a>
            <a href="#work" className="hover:text-foreground transition-colors">Our work</a>
            <a href="#membership" className="hover:text-foreground transition-colors">Membership</a>
            <a href="#branches" className="hover:text-foreground transition-colors">Branches</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild className="bg-gradient-hero text-primary-foreground shadow-soft">
              <a href="#book">Book now</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-10 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {branches.map((b) => b.name).join("  ·  ")}
          </span>
          <h1 className="mt-6 font-display text-5xl md:text-6xl font-semibold tracking-tight">
            Book your <span className="text-primary">salon</span> moment
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Premium nails, gel polish &amp; extensions — reserved in under a minute,
            confirmed with a small ₹{BOOKING_FEE} booking fee.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-gradient-hero text-primary-foreground shadow-soft h-12 px-8">
              <a href="#book">Book your appointment</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <a href="#membership">
                <Crown className="mr-2 h-4 w-4" /> Become a member
              </a>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Our services</h2>
          <p className="mt-2 text-muted-foreground">Crafted by expert stylists, finished to perfection.</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.05}>
              <Card className="p-6 h-full shadow-soft hover:shadow-elegant transition-shadow">
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center mb-4">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                <p className="mt-2 text-2xl font-semibold text-primary">₹{s.price}</p>
                {s.isNailArt && (
                  <Badge variant="secondary" className="mt-3">
                    <Crown className="h-3 w-3 mr-1" /> Member 50% off
                  </Badge>
                )}
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section id="work" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Our work</h2>
          <p className="mt-2 text-muted-foreground">A glimpse of recent sets from our studios.</p>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {nailCategories.map((cat, i) => (
            <Reveal key={cat.name} delay={(i % 3) * 0.05}>
              <NailCard name={cat.name} images={cat.images} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Membership */}
      <section id="membership" className="mx-auto max-w-3xl px-6 py-10 scroll-mt-20">
        <Reveal>
          <Card className="p-6 md:p-8 border-primary/40 bg-linear-to-r from-primary/10 via-background to-primary/5 flex flex-col sm:flex-row items-center gap-5 justify-between">
            <div className="flex items-center gap-4 text-left">
              <div className="h-12 w-12 rounded-full grid place-items-center bg-primary/15 text-primary">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <div className="font-display text-xl font-semibold">
                  One Year Membership · ₹{MEMBERSHIP_PRICE}
                </div>
                <p className="text-sm text-muted-foreground">
                  Get <span className="font-medium text-foreground">50% off any nail art service</span> for a full year.
                </p>
                <p className="text-xs text-muted-foreground mt-1 italic">
                  Note: membership benefits start the day you join.
                </p>
              </div>
            </div>
            <MembershipDialog price={MEMBERSHIP_PRICE} />
          </Card>
        </Reveal>
      </section>

      {/* Branches */}
      <section id="branches" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Visit us</h2>
          <p className="mt-2 text-muted-foreground">Three studios across Mumbai.</p>
        </Reveal>
        <div className="grid sm:grid-cols-3 gap-5">
          {branches.map((b, i) => (
            <Reveal key={b.name} delay={i * 0.05}>
              <Card className="p-6 h-full shadow-soft">
                <div className="flex items-center gap-2 text-primary">
                  <MapPin className="h-5 w-5" />
                  <h3 className="font-display text-lg font-semibold text-foreground">{b.name}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {b.address ?? "Mumbai, Maharashtra"}
                </p>
                <Badge variant="secondary" className="mt-4">Open today</Badge>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Loved by our clients</h2>
          <p className="mt-2 text-muted-foreground">Real words from real visits.</p>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.05}>
              <Card className="p-6 h-full shadow-soft">
                <Quote className="h-6 w-6 text-primary/40" />
                <p className="mt-3 text-sm">{t.text}</p>
                <div className="mt-4 flex items-center gap-1 text-gold">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mt-3 text-sm font-medium">
                  {t.name} <span className="text-muted-foreground font-normal">· {t.branch}</span>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="mx-auto max-w-3xl px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Book your appointment</h2>
          <p className="mt-2 text-muted-foreground">
            Pick a branch, stylist, date &amp; service — confirm with a ₹{BOOKING_FEE} fee.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            50 Rupees will be deducted from total fees.
          </p>
        </Reveal>
        <BookingForm
          services={services}
          timeSlots={timeSlots}
          branches={branches}
          staff={staff}
          bookingFee={BOOKING_FEE}
        />
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Frequently asked</h2>
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo className="h-9 w-auto" />
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              <a href="#" aria-label="Instagram" className="hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" aria-label="Facebook" className="hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Simple, secure UPI payments
            </p>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
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
