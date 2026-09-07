import type { MetadataRoute } from "next";

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512] as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rashi Nail Art Studio",
    short_name: "Rashi Nails",
    description:
      "Book your salon moment at Rashi Nail Art Studio — Vile Parle, Bandra & Borivali W. Premium nail art, gel polish & extensions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FEF8FC",
    theme_color: "#A727AA",
    icons: [
      ...ICON_SIZES.map((size) => ({
        src: `/icons/icon-any-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any" as const,
      })),
      ...ICON_SIZES.map((size) => ({
        src: `/icons/icon-maskable-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "maskable" as const,
      })),
    ],
  };
}
