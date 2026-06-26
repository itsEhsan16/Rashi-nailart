import Image from "next/image";
import { Star } from "lucide-react";

/**
 * Editorial image collage for the hero — one tall feature image plus two stacked
 * supporting shots, with a floating rating chip. Server component (plain next/image
 * so the largest hero image gets priority). Expects up to 3 image srcs.
 */
export function HeroCollage({ images }: { images: string[] }) {
  const [a, b, c] = images;
  if (!a) return null;

  return (
    <div className="relative">
      {/* soft glow behind the collage */}
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-hero opacity-15 blur-2xl" aria-hidden />

      <div className="grid grid-cols-2 grid-rows-2 gap-3 sm:gap-4">
        <div className="relative col-span-1 row-span-2 overflow-hidden rounded-3xl shadow-elegant ring-1 ring-border/50">
          <Image
            src={a}
            alt="Nail art by Rashi Nail Art Studio"
            fill
            priority
            sizes="(max-width: 1024px) 45vw, 280px"
            className="object-cover"
          />
        </div>
        {b && (
          <div className="relative aspect-square overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/50">
            <Image src={b} alt="Nail art set" fill sizes="(max-width: 1024px) 45vw, 240px" className="object-cover" />
          </div>
        )}
        {c && (
          <div className="relative aspect-square overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/50">
            <Image src={c} alt="Nail art set" fill sizes="(max-width: 1024px) 45vw, 240px" className="object-cover" />
          </div>
        )}
      </div>

      {/* Floating rating chip */}
      <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-4 py-2.5 shadow-elegant backdrop-blur sm:flex">
        <div className="flex text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-current" />
          ))}
        </div>
        <div className="text-xs leading-tight">
          <div className="font-semibold">Loved by clients</div>
          <div className="text-muted-foreground">across Mumbai</div>
        </div>
      </div>
    </div>
  );
}
