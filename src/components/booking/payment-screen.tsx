"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  Loader2,
  Upload,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Download,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_PROOF_BYTES, isAcceptedProofFile } from "@/lib/salon-data";
import type { PaymentSettings } from "@/lib/actions/booking";

type UploadResult = { ok: true } | { ok: false; error?: string };

/** Turn an upload exception into a specific, actionable message for the customer. */
function describeUploadError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (
    msg.includes("body exceeded") ||
    msg.includes("content too large") ||
    msg.includes("payload too large") ||
    msg.includes("413")
  ) {
    return "That image is too large to upload. Please choose one under 10 MB.";
  }
  if (
    err instanceof TypeError ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  ) {
    return "Network problem — please check your connection and try again.";
  }
  return "Something went wrong uploading your screenshot. Please try again.";
}

type Props = {
  /** The record id this proof belongs to (appointment id or payment id). */
  id: string;
  /** FormData key the upload action expects the id under. */
  idField: "appointmentId" | "paymentId";
  amount: number;
  settings: PaymentSettings;
  /** Server action that takes FormData and stores the screenshot. */
  uploadAction: (formData: FormData) => Promise<UploadResult>;
  /** What the customer is paying for, e.g. "booking fee" / "membership". */
  forLabel: string;
  /** Epoch ms when the held slot expires — shows a live countdown (bookings only). */
  holdExpiresAt?: number;
  /** One-line summary of what's being paid for, shown for reassurance. */
  summaryLine?: string;
  onUploaded: () => void;
};

/** mm:ss from a millisecond duration (never negative). */
function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PaymentScreen({
  id,
  idField,
  amount,
  settings,
  uploadAction,
  forLabel,
  holdExpiresAt,
  summaryLine,
  onUploaded,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live countdown so the customer can see exactly how long their slot is held.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!holdExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);
  const remaining = holdExpiresAt ? holdExpiresAt - now : null;
  const expired = remaining !== null && remaining <= 0;
  const urgent = remaining !== null && remaining > 0 && remaining < 60_000;

  async function copyUpi() {
    if (!settings.upiId) return;
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopied(true);
      toast.success("UPI ID copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — please copy it manually.");
    }
  }

  /** Save the QR image so the customer can scan it from their gallery in any UPI app. */
  async function downloadQr() {
    try {
      const res = await fetch(settings.qrUrl);
      const blob = await res.blob();
      const ext = blob.type.includes("svg") ? "svg" : blob.type.includes("jpeg") ? "jpg" : "png";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rashi-upi-qr.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin/CORS or network issue — open the image so they can save it manually.
      window.open(settings.qrUrl, "_blank", "noopener,noreferrer");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!isAcceptedProofFile(f)) {
      toast.error("Please choose a JPG, PNG, WebP or HEIC image.");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_PROOF_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      toast.error(`That image is ${mb} MB — please choose one under 10 MB.`);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) {
      toast.error("Please attach your payment screenshot first.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set(idField, id);
      fd.set("screenshot", file);
      const res = await uploadAction(fd);
      if (!res.ok) {
        toast.error(res.error ?? "Upload failed. Please try again.");
        return;
      }
      onUploaded();
    } catch (err) {
      toast.error(describeUploadError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="rounded-xl p-6 md:p-8 shadow-elegant border-border/60 space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
          <QrCode className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl font-semibold">Pay ₹{amount} to confirm</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings.upiId
            ? `Pay the ${forLabel} with the QR or your UPI ID, then upload your screenshot below.`
            : `Scan the QR to pay the ${forLabel}, then upload your screenshot below.`}
        </p>
        {summaryLine && (
          <p className="mt-2 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
            {summaryLine}
          </p>
        )}
      </div>

      {idField === "appointmentId" && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
            expired
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/15 text-amber-600",
          )}
        >
          {expired ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {remaining !== null && !expired && (
              <span className="block">
                Slot held —{" "}
                <span className={cn("font-semibold tabular-nums", urgent && "text-destructive")}>
                  {fmt(remaining)} left
                </span>{" "}
                to confirm.
              </span>
            )}
            {expired ? (
              <>
                Your <span className="font-semibold">5-minute hold has ended</span>. You can still
                upload your screenshot — if the slot was taken we&apos;ll let you know and refund the
                fee. Otherwise, please book again.
              </>
            ) : (
              <>
                Your booking is <span className="font-semibold">not confirmed yet</span> — upload
                your payment screenshot below to keep this slot. Leaving without uploading releases
                it for other customers.
              </>
            )}
          </span>
        </div>
      )}

      {/* QR is shown open; pay by scanning it (or downloading it to scan from gallery) or via the UPI ID. */}
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl border border-border/60 bg-white p-4">
            <Image
              src={settings.qrUrl}
              alt="UPI QR code"
              width={320}
              height={320}
              className="h-56 w-56 object-contain sm:h-64 sm:w-64"
              unoptimized
            />
          </div>
          <span className="text-xs text-muted-foreground">Paying {settings.payeeName}</span>
          <Button type="button" variant="outline" size="sm" onClick={downloadQr}>
            <Download className="mr-2 h-4 w-4" /> Download QR
          </Button>
        </div>

        {settings.upiId && (
          <div className="space-y-1.5">
            <Label className="text-xs">Or pay to this UPI ID</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                {settings.upiId}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyUpi}
                title="Copy UPI ID"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How to pay</p>
          <p>
            1. Open any UPI app (GPay, PhonePe, Paytm…) and scan the QR — or copy the UPI ID to pay.
          </p>
          <p>2. Enter and pay exactly ₹{amount}.</p>
          <p>3. Screenshot the success page and upload it below.</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-5">
        <Label htmlFor="screenshot">Upload payment screenshot</Label>
        <input
          ref={inputRef}
          id="screenshot"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Choose image
          </Button>
          <span className="text-sm text-muted-foreground">
            {file ? file.name : "JPG, PNG, WebP or HEIC · max 10 MB"}
          </span>
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={submitting || !file}
          className="w-full bg-gradient-hero hover:opacity-95 text-primary-foreground shadow-soft h-12"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>Submit payment proof</>
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Upload your payment screenshot to confirm your
          booking.
        </p>
      </div>
    </Card>
  );
}
