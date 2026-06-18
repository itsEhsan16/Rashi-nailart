"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Crown, Loader2, Clock } from "lucide-react";
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
import { createMembership, uploadMembershipProof } from "@/lib/actions/membership";
import { PaymentScreen } from "@/components/booking/payment-screen";
import type { PaymentSettings } from "@/lib/actions/booking";

type Pending = { paymentId: string; amount: number; settings: PaymentSettings };

export function MembershipDialog({ price }: { price: number }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { client_name: "", phone: "" },
  });

  function resetAll() {
    reset();
    setPending(null);
    setDone(false);
  }

  async function onSubmit(values: MembershipValues) {
    setSubmitting(true);
    try {
      const res = await createMembership(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPending({ paymentId: res.paymentId, amount: res.amount, settings: res.settings });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

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
        {done ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-amber-500/15 text-amber-600 grid place-items-center">
              <Clock className="h-7 w-7" />
            </div>
            <DialogTitle className="font-display text-xl">Payment proof received</DialogTitle>
            <DialogDescription className="mt-2">
              Your membership is pending verification. Once we confirm your payment, your benefits
              are active right away. You&apos;ll be notified.
            </DialogDescription>
            <Button className="mt-6" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : pending ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" /> Pay for your membership
              </DialogTitle>
            </DialogHeader>
            <PaymentScreen
              id={pending.paymentId}
              idField="paymentId"
              amount={pending.amount}
              settings={pending.settings}
              uploadAction={uploadMembershipProof}
              forLabel="membership fee"
              onUploaded={() => setDone(true)}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" /> One Year Membership
              </DialogTitle>
              <DialogDescription>
                ₹{price} for the year — 50% off all nail art services. Benefits start the day you
                join. We use your phone to recognise you at booking.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
