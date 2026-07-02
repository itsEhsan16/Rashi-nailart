import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { slotStartLabel } from "@/lib/utils";

/**
 * Client-side receipt generation (jsPDF). Fed ONLY with server-verified data from
 * the confirmation pages — never client-supplied — so a downloaded receipt always
 * reflects a real, confirmed payment.
 */

export type BookingReceiptData = {
  kind: "booking";
  clientName: string;
  phone: string;
  branch: string;
  date: string; // yyyy-MM-dd
  timeSlot: string;
  service: string;
  staffName: string;
  amount: number;
  orderId: string;
  cfPaymentId: string | null;
  paymentMethod: string | null;
};

export type MembershipReceiptData = {
  kind: "membership";
  clientName: string;
  phone: string;
  amount: number;
  orderId: string;
  cfPaymentId: string | null;
  paymentMethod: string | null;
  startDate: string | null;
  expiresAt: string | null;
};

export type ReceiptData = BookingReceiptData | MembershipReceiptData;

export function receiptFileName(data: ReceiptData): string {
  const safe = data.orderId.replace(/[^A-Za-z0-9_-]/g, "");
  return `rashi-receipt-${safe}.pdf`;
}

/** Format a yyyy-MM-dd (or null) as "2 Jul 2026"; falls back to the raw value. */
function niceDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : format(d, "d MMM yyyy");
}

export function buildReceiptPdf(data: ReceiptData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  let y = 54;

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Rashi Nail Art Studio", left, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text("Payment Receipt", left, y);
  doc.setTextColor(0);
  y += 10;

  doc.setDrawColor(210);
  doc.line(left, y, right, y);
  y += 24;

  // ── Rows ──
  const rows: [string, string][] =
    data.kind === "booking"
      ? [
          ["Status", "Confirmed"],
          ["Client", data.clientName],
          ["Phone", data.phone],
          ["Branch", data.branch],
          ["Date", niceDate(data.date)],
          ["Time", slotStartLabel(data.timeSlot)],
          ["Service", data.service],
          ["Artist", data.staffName],
          ["Amount paid", `INR ${data.amount}`],
          ["Payment method", (data.paymentMethod ?? "online").toUpperCase()],
          ["Order ID", data.orderId],
          ["Payment ID", data.cfPaymentId ?? "—"],
        ]
      : [
          ["Status", "Confirmed"],
          ["Plan", "1-Year Membership"],
          ["Member", data.clientName],
          ["Phone", data.phone],
          ["Valid from", niceDate(data.startDate)],
          ["Valid until", niceDate(data.expiresAt)],
          ["Amount paid", `INR ${data.amount}`],
          ["Payment method", (data.paymentMethod ?? "online").toUpperCase()],
          ["Order ID", data.orderId],
          ["Payment ID", data.cfPaymentId ?? "—"],
        ];

  const labelX = left;
  const valueX = left + 120;
  const valueWidth = right - valueX;
  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(90);
    doc.text(label, labelX, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(String(value), valueWidth);
    doc.text(lines, valueX, y);
    y += 18 * lines.length;
  }

  y += 8;
  doc.setDrawColor(210);
  doc.line(left, y, right, y);
  y += 22;

  // ── Footer ──
  doc.setFontSize(10);
  doc.setTextColor(120);
  const note =
    data.kind === "booking"
      ? "This confirms your booking fee. Please pay any remaining balance at the studio. Thank you!"
      : "Welcome to the Rashi membership — enjoy 50% off nail art for a year. Thank you!";
  doc.text(doc.splitTextToSize(note, right - left), left, y);
  y += 34;
  doc.setTextColor(150);
  doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "d MMM yyyy, h:mm a")}`, left, y);

  return doc;
}
