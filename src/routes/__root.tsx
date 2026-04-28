import { Link, Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Rashi Nail Art Studio — Salon Appointment Booking" },
      {
        name: "description",
        content:
          "Book your salon appointment at Rashi Nail Art Studio — Vile Parle & Bandra. Premium nail extensions, gel polish & more.",
      },
      {
        name: "author",
        content: "Rashi Nail Art Studio",
      },
      { property: "og:title", content: "Rashi Nail Art Studio — Salon Appointment Booking" },
      {
        property: "og:description",
        content: "Book your salon appointment online — premium nail care.",
      },
      { property: "og:type", content: "website" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      { name: "twitter:title", content: "Rashi Nail Art Studio — Salon Appointment Booking" },
      { name: "description", content: "SalonBook Pro is a modern, responsive web app for salon appointment booking." },
      { property: "og:description", content: "SalonBook Pro is a modern, responsive web app for salon appointment booking." },
      { name: "twitter:description", content: "SalonBook Pro is a modern, responsive web app for salon appointment booking." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/28a85d53-fbe8-4103-a660-a36a1247f546/id-preview-76db7079--654b65da-335c-4288-ac16-44f0723a1c9b.lovable.app-1777357177599.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/28a85d53-fbe8-4103-a660-a36a1247f546/id-preview-76db7079--654b65da-335c-4288-ac16-44f0723a1c9b.lovable.app-1777357177599.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
