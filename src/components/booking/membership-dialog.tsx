"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { membershipSchema, type MembershipValues } from "@/lib/validations/membership";
import { createMembership, createMembershipOrder } from "@/lib/actions/membership";
import { PaySecureScreen } from "@/components/booking/pay-secure-screen";
import { redirectToCheckout } from "@/lib/cashfree-checkout";

type Pending = { paymentId: string; amount: number; orderId?: string };
type StoredPending = Pending & { createdAt: number };

const PENDING_KEY = "rashi:pending-membership";
// Memberships have no slot to hold, so we keep the in-flight payment around for a
// generous window — long enough to leave for the payment page (where a mobile
// browser may discard the backgrounded tab) and return to complete it.
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

export function MembershipDialog({ price }: { price: number }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { client_name: "", phone: "" },
  });

  // Persist the in-flight payment so it survives leaving for the payment page —
  // and restore it on return, reopening straight to the pay step.
  const persistPending = useCallback((p: Pending | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, createdAt: Date.now() }));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredPending;
      if (Date.now() - (saved.createdAt ?? 0) < PENDING_TTL_MS) {
        setPending({ paymentId: saved.paymentId, amount: saved.amount, orderId: saved.orderId });
        setOpen(true);
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  function resetAll() {
    reset();
    persistPending(null);
  }

  async function onSubmit(values: MembershipValues) {
    setSubmitting(true);
    try {
      const res = await createMembership(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      persistPending({ paymentId: res.paymentId, amount: res.amount });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  /** Create the Cashfree order and hand off to the hosted checkout (redirect). */
  const payNow = useCallback(async () => {
    if (!pending) return;
    const res = await createMembershipOrder({ paymentId: pending.paymentId });
    if (!res.ok) throw new Error(res.error);
    persistPending({ ...pending, orderId: res.orderId });
    await redirectToCheckout(res.paymentSessionId);
  }, [pending, persistPending]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-gradient-hero text-primary-foreground shadow-soft h-11 px-5">
          <Crown className="mr-2 h-4 w-4" /> Buy membership · ₹{price}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {pending ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" /> Pay for your membership
              </DialogTitle>
            </DialogHeader>
            <PaySecureScreen
              amount={pending.amount}
              forLabel="membership fee"
              summaryLine="1-Year Membership · in-store member discount"
              onPay={payNow}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" /> One Year Membership
              </DialogTitle>
              <DialogDescription>
                ₹{price} for the year — unlocks a member discount, redeemed in-store by our team.
                Benefits start the day you join. We use your phone to recognise you at booking.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="m_name">Your Name</Label>
                <Input
                  id="m_name"
                  placeholder="Full name"
                  aria-invalid={!!errors.client_name}
                  {...register("client_name")}
                />
                {errors.client_name && (
                  <p className="text-xs text-destructive">{errors.client_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="m_phone">Phone Number</Label>
                <Input
                  id="m_phone"
                  inputMode="tel"
                  placeholder="+91 XXXXXXXXXX"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-hero text-primary-foreground"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                    </>
                  ) : (
                    <>Continue to payment · ₹{price}</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
