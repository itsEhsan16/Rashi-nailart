"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Square avatar for a stylist: their photo cropped to fill (no distortion), or
 * their initials when there's no photo. Default size is h-9 w-9 — pass a size in
 * `className` to override (tailwind-merge wins on the later class).
 */
export function StaffAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl: string | null;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar className={cn("h-9 w-9 rounded-md", className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={name} className="object-cover" />}
      <AvatarFallback className="rounded-md text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
}
