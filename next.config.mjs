import withSerwistInit from "@serwist/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // heic-convert bundles a large WASM HEIF decoder; keep it as a runtime
  // require instead of bundling it into the Server Action.
  serverExternalPackages: ["heic-convert"],
  experimental: {
    // Payment-proof screenshots are validated up to 10 MB (MAX_PROOF_BYTES);
    // the Server Action default body limit is 1 MB, which silently throws on
    // larger phone screenshots. Headroom above 10 MB covers the multipart framing.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev" },
    ],
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Skip generating/registering the service worker in dev — it makes hot
  // reload unreliable and there's no offline/precache story worth testing
  // against a dev server that's already rebuilding constantly.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

export default withSerwist(nextConfig);
