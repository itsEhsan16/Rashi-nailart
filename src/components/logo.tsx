import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Brand logo (Rashi Nail Art Studio wordmark).
 * Served unoptimized so the static SVG renders without enabling
 * `images.dangerouslyAllowSVG`. Size via `className` (defaults to a header height).
 */
export function Logo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/RashiLogo.svg"
      alt="Rashi Nail Art Studio"
      width={1018}
      height={499}
      priority={priority}
      unoptimized
      className={cn("h-10 w-auto", className)}
    />
  );
}
