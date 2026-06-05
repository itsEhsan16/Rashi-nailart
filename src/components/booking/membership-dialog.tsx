"use client";

import { useState } from "react";
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
import { createMembershipOrder } from "@/lib/actions/membership";
import { verifyPayment } from "@/lib/actions/payments";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";

export function MembershipDialog({ price }: { price: number }) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { client_name: "", phone: "" },
  });

  async function onSubmit(values: MembershipValues) {
    setPaying(true);
    try {
      const order = await createMembershipOrder(values);
      if (!order.ok) {
        toast.error(order.error);
        return;
      }
      if (!order.keyId) {
        toast.error("Online payments aren’t configured yet. Please contact the studio.");
        return;
      }

      await loadRazorpay();
      let result;
      try {
        result = await openRazorpayCheckout({
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: "Rashi Nail Art Studio",
          description: "1-Year Membership",
          prefill: { name: values.client_name, contact: values.phone },
        });
      } catch (err) {
        toast.message(err instanceof Error ? err.message : "Payment cancelled");
        return;
      }

      const verified = await verifyPayment({
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      if (!verified.ok) {
        toast.error("Payment received — we’ll activate your membership shortly.");
        return;
      }

      toast.success("Membership purchased! Benefits activate in 10 days ✨");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPaying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-hero text-primary-foreground shadow-soft h-11 px-5">
          <Crown className="mr-2 h-4 w-4" /> Buy membership · ₹{price}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" /> One Year Membership
          </DialogTitle>
          <DialogDescription>
            ₹{price} for the year — 50% off all nail art services. Benefits activate 10 days
            after purchase. We use your phone to recognise you at booking.
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
            <Button type="submit" disabled={paying} className="bg-gradient-hero text-primary-foreground">
              {paying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>Pay ₹{price}</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
