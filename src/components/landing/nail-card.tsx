"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

type NailCardProps = {
  name: string;
  images: string[];
};

export function NailCard({ name, images }: NailCardProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 15000);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-soft group">
      <Image
        src={images[index]}
        alt={name}
        fill
        className="object-cover transition-opacity duration-500"
        sizes="(max-width: 768px) 50vw, 33vw"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
      <span className="absolute bottom-3 left-3 text-sm font-medium text-white drop-shadow-md">
        {name}
      </span>
    </div>
  );
}
