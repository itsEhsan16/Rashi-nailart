"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle, ImageIcon, Crown, RefreshCw, PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listPendingVerifications,
  getProofUrl,
  verifyBookingPayment,
  rejectBookingPayment,
  verifyMembershipPayment,
  rejectMembershipPayment,
  type VerificationRow,
} from "@/lib/actions/admin";

export function PaymentsPanel() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<VerificationRow | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<VerificationRow | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listPendingVerifications();
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function viewProof(row: VerificationRow) {
    setProofFor(row);
    setProofUrl(null);
    setProofLoading(true);
    const res = await getProofUrl({ kind: row.kind, id: row.id });
    setProofLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not open screenshot");
      setProofFor(null);
      return;
    }
    setProofUrl(res.url);
  }

  async function onVerify(row: VerificationRow) {
    setBusyId(row.id);
    const res =
      row.kind === "booking"
        ? await verifyBookingPayment({ id: row.id })
        : await verifyMembershipPayment({ id: row.id });
    setBusyId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(row.kind === "booking" ? "Booking confirmed ✨" : "Membership confirmed ✨");
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (reason.trim().length === 0) return toast.error("Please give a reason.");
    setBusyId(rejectTarget.id);
    const res =
      rejectTarget.kind === "booking"
        ? await rejectBookingPayment({ id: rejectTarget.id, reason: reason.trim() })
        : await rejectMembershipPayment({ id: rejectTarget.id, reason: reason.trim() });
    setBusyId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Payment rejected — slot released");
    setRows((prev) => prev.filter((r) => r.id !== rejectTarget.id));
    setRejectTarget(null);
    setReason("");
  }

  const verifyButtons = (r: VerificationRow) => (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      <Button
        size="sm"
        className="bg-emerald-600 text-white hover:bg-emerald-700"
        onClick={() => onVerify(r)}
        disabled={busyId === r.id}
      >
        {busyId === r.id ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        <span className="ml-1">Verify</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          setRejectTarget(r);
          setReason("");
        }}
        disabled={busyId === r.id}
      >
        <XCircle className="h-4 w-4" />
        <span className="ml-1">Reject</span>
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Payment verification"
        description={
          loading
            ? "Loading…"
            : `${rows.length} payment${rows.length === 1 ? "" : "s"} awaiting verification`
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {rows.length === 0 && !loading && (
        <Card className="shadow-soft">
          <EmptyState
            icon={<PartyPopper className="h-6 w-6" />}
            title="All caught up"
            description="Nothing awaiting verification right now."
          />
        </Card>
      )}

      {/* Desktop table */}
      <Card className={rows.length === 0 ? "hidden" : "hidden shadow-soft md:block"}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 border-b border-border bg-muted/40 backdrop-blur hover:bg-muted/40 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.client_name}
                      {r.kind === "membership" && (
                        <Badge className="bg-primary text-primary-foreground gap-1">
                          <Crown className="h-3 w-3" /> Membership
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>
                    {r.kind === "booking" ? (
                      <div className="text-sm">
                        <div>{r.service}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.branch} · {r.appointment_date} · {r.time_slot} · {r.staff_name}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm">{r.service}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">₹{r.amount}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {r.uploaded_at ? format(new Date(r.uploaded_at), "dd MMM, HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewProof(r)}
                      disabled={!r.has_proof}
                    >
                      <ImageIcon className="mr-1 h-4 w-4" /> View
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">{verifyButtons(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <Card key={`m-${r.kind}-${r.id}`} className="p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <span className="truncate">{r.client_name}</span>
                {r.kind === "membership" && (
                  <Badge className="gap-1 bg-primary text-primary-foreground">
                    <Crown className="h-3 w-3" /> Membership
                  </Badge>
                )}
              </div>
              <span className="whitespace-nowrap font-semibold">₹{r.amount}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{r.phone}</div>
            <div className="mt-2 text-sm">
              {r.kind === "booking" ? (
                <>
                  <div>{r.service}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.branch} · {r.appointment_date} · {r.time_slot} · {r.staff_name}
                  </div>
                </>
              ) : (
                <span>{r.service}</span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <Button size="sm" variant="outline" onClick={() => viewProof(r)} disabled={!r.has_proof}>
                <ImageIcon className="mr-1 h-4 w-4" /> View
              </Button>
              {verifyButtons(r)}
            </div>
          </Card>
        ))}
      </div>

      {/* Screenshot preview */}
      <Dialog open={!!proofFor} onOpenChange={(o) => !o && setProofFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment proof — {proofFor?.client_name}</DialogTitle>
            <DialogDescription>₹{proofFor?.amount} · {proofFor?.phone}</DialogDescription>
          </DialogHeader>
          <div className="min-h-[200px] grid place-items-center">
            {proofLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                <Image
                  src={proofUrl}
                  alt="Payment screenshot"
                  width={400}
                  height={600}
                  className="max-h-[60vh] w-auto rounded-md border border-border/60"
                  unoptimized
                />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No screenshot.</p>
            )}
          </div>
          {proofUrl && (
            <p className="text-center text-xs text-muted-foreground">Tap the image to open full size.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>
              The held slot will be released and {rejectTarget?.client_name} will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Screenshot doesn't match the amount, payment not received…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReject}
              disabled={busyId === rejectTarget?.id}
            >
              {busyId === rejectTarget?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reject payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
