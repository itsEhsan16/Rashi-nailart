import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export type HeaderLink = { href: string; label: string };

/**
 * Shared public-site header. The home page passes its in-page anchors; the legal
 * pages pass none and get just the logo and the booking CTA, so every page keeps
 * a route back to the booking flow.
 */
export function SiteHeader({ links = [] }: { links?: HeaderLink[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Logo priority className="h-12 w-auto" />
        </Link>
        {links.length > 0 ? (
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </a>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          <Button asChild className="bg-gradient-hero text-primary-foreground shadow-soft">
            <Link href="/#book">Book now</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
