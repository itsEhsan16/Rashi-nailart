"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildReceiptPdf, receiptFileName, type ReceiptData } from "@/lib/receipt";

// Pending-payment resume state is no longer valid once payment is confirmed.
const PENDING_KEYS = ["rashi:pending-booking", "rashi:pending-membership"];

/**
 * Auto-downloads the receipt once on mount and offers a manual re-download.
 * Receives only server-verified data (from the confirmation page), and clears any
 * lingering "resume payment" localStorage state so the form doesn't reoffer it.
 */
export function ReceiptDownload({ data }: { data: ReceiptData }) {
  const downloaded = useRef(false);

  useEffect(() => {
    try {
      PENDING_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* storage may be unavailable */
    }
    if (downloaded.current) return;
    downloaded.current = true;
    try {
      buildReceiptPdf(data).save(receiptFileName(data));
    } catch {
      /* auto-download is best-effort; the manual button remains */
    }
  }, [data]);

  return (
    <Button
      variant="outline"
      onClick={() => buildReceiptPdf(data).save(receiptFileName(data))}
    >
      <Download className="mr-2 h-4 w-4" /> Download receipt
    </Button>
  );
}
