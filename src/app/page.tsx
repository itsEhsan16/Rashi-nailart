import Link from "next/link";
import { Sparkles, Crown, MapPin, LogIn, Instagram, Facebook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingForm } from "@/components/booking/booking-form";
import { getCatalog } from "@/lib/catalog";
import { MEMBERSHIP_PRICE, BOOKING_FEE } from "@/lib/salon-data";

export default async function HomePage() {
  const { services, timeSlots, branches, staff } = await getCatalog();

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-gradient-hero grid place-items-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold flex flex-col leading-tight">
              <span className="text-xl">Rashi</span>
              <span className="text-sm">Nail Art Studio</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#services" className="hover:text-foreground transition-colors">Services</a>
            <a href="#membership" className="hover:text-foreground transition-colors">Membership</a>
            <a href="#branches" className="hover:text-foreground transition-colors">Branches</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">
                <LogIn className="mr-2 h-4 w-4" /> Staff Login
              </Link>
            </Button>
            <Button asChild className="bg-gradient-hero text-primary-foreground shadow-soft">
              <a href="#book">Book now</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-10 text-center">
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
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Our services</h2>
          <p className="mt-2 text-muted-foreground">Crafted by expert stylists, finished to perfection.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((s) => (
            <Card key={s.name} className="p-6 shadow-soft hover:shadow-elegant transition-shadow">
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
          ))}
        </div>
      </section>

      {/* Membership */}
      <section id="membership" className="mx-auto max-w-3xl px-6 py-10 scroll-mt-20">
        <Card className="p-6 md:p-8 border-primary/40 bg-gradient-to-r from-primary/10 via-background to-primary/5 flex flex-col sm:flex-row items-center gap-5 justify-between">
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
                Note: membership benefits activate 10 days after purchase.
              </p>
            </div>
          </div>
          <Button asChild className="bg-gradient-hero text-primary-foreground shadow-soft h-11 px-5">
            <a href="#book">Buy membership · ₹{MEMBERSHIP_PRICE}</a>
          </Button>
        </Card>
      </section>

      {/* Branches */}
      <section id="branches" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Visit us</h2>
          <p className="mt-2 text-muted-foreground">Three studios across Mumbai.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {branches.map((b) => (
            <Card key={b.name} className="p-6 shadow-soft">
              <div className="flex items-center gap-2 text-primary">
                <MapPin className="h-5 w-5" />
                <h3 className="font-display text-lg font-semibold text-foreground">{b.name}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {b.address ?? "Mumbai, Maharashtra"}
              </p>
              <Badge variant="secondary" className="mt-4">Open today</Badge>
            </Card>
          ))}
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="mx-auto max-w-3xl px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Book your appointment</h2>
          <p className="mt-2 text-muted-foreground">
            Pick a branch, stylist, date &amp; service — confirm with a ₹{BOOKING_FEE} fee.
          </p>
        </div>
        <BookingForm
          services={services}
          timeSlots={timeSlots}
          branches={branches}
          staff={staff}
          bookingFee={BOOKING_FEE}
        />
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/60">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-hero grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold">Rashi Nail Art Studio</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <a href="#" aria-label="Instagram" className="hover:text-primary transition-colors">
              <Instagram className="h-5 w-5" />
            </a>
            <a href="#" aria-label="Facebook" className="hover:text-primary transition-colors">
              <Facebook className="h-5 w-5" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Rashi Nail Art Studio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
