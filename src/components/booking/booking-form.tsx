"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Crown, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { bookingFormSchema, type BookingFormValues } from "@/lib/validations/booking";
import {
  checkMembership,
  getBookedSlots,
  createBookingOrder,
  cancelPendingBooking,
} from "@/lib/actions/booking";
import { verifyPayment } from "@/lib/actions/payments";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import type { ServiceOption, BranchOption, StaffOption } from "@/lib/catalog";

type Props = {
  services: ServiceOption[];
  timeSlots: string[];
  branches: BranchOption[];
  staff: StaffOption[];
  bookingFee: number;
};

type Confirmation = {
  service: string;
  date: string;
  slot: string;
  staff: string;
  branch: string;
};

export function BookingForm({ services, timeSlots, branches, staff, bookingFee }: Props) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      client_name: "",
      phone: "",
      branch: undefined,
      appointment_date: undefined,
      time_slot: "",
      service: "",
      staff_name: "",
      special_requests: "",
    },
  });

  const [isMember, setIsMember] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);

  const phone = watch("phone");
  const branch = watch("branch");
  const staffName = watch("staff_name");
  const apptDate = watch("appointment_date");
  const serviceName = watch("service");

  // Auto-detect membership by phone (debounced). Only active (10-day) members match.
  useEffect(() => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits.length < 10) {
      setIsMember(false);
      return;
    }
    const t = setTimeout(async () => {
      const res = await checkMembership({ phone });
      setIsMember(res.isMember);
    }, 450);
    return () => clearTimeout(t);
  }, [phone]);

  // Live availability for the chosen stylist + date.
  useEffect(() => {
    if (!branch || !staffName || !apptDate) {
      setBookedSlots([]);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    getBookedSlots({
      branch,
      staff_name: staffName,
      appointment_date: format(apptDate, "yyyy-MM-dd"),
    })
      .then((res) => {
        if (active) setBookedSlots(res.slots);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [branch, staffName, apptDate]);

  const filteredStaff = useMemo(
    () => (branch ? staff.filter((s) => s.branch === branch) : []),
    [branch, staff],
  );
  const selectedService = useMemo(
    () => services.find((s) => s.name === serviceName),
    [services, serviceName],
  );
  const memberPrice =
    selectedService && isMember && selectedService.isNailArt
      ? Math.round(selectedService.price * 0.5)
      : null;

  const slotsReady = Boolean(branch && staffName && apptDate);

  async function onSubmit(values: BookingFormValues) {
    setPaying(true);
    const dateStr = format(values.appointment_date, "yyyy-MM-dd");
    try {
      const order = await createBookingOrder({
        client_name: values.client_name,
        phone: values.phone,
        branch: values.branch,
        appointment_date: dateStr,
        time_slot: values.time_slot,
        service: values.service,
        staff_name: values.staff_name,
        special_requests: values.special_requests || null,
      });

      if (!order.ok) {
        toast.error(order.error);
        const r = await getBookedSlots({
          branch: values.branch,
          staff_name: values.staff_name,
          appointment_date: dateStr,
        });
        setBookedSlots(r.slots);
        return;
      }

      if (!order.keyId) {
        toast.error("Online payments aren’t configured yet. Please contact the studio.");
        if (order.appointmentId) await cancelPendingBooking({ appointmentId: order.appointmentId });
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
          description: `Booking fee · ${values.service}`,
          prefill: { name: values.client_name, contact: values.phone },
        });
      } catch (err) {
        if (order.appointmentId) await cancelPendingBooking({ appointmentId: order.appointmentId });
        toast.message(err instanceof Error ? err.message : "Payment cancelled");
        return;
      }

      const verified = await verifyPayment({
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      if (!verified.ok) {
        toast.error("Payment received — we’ll confirm your booking shortly.");
        return;
      }

      toast.success("Your appointment is confirmed ✨");
      setConfirmed({
        service: values.service,
        date: format(values.appointment_date, "PPP"),
        slot: values.time_slot,
        staff: values.staff_name,
        branch: values.branch,
      });
      reset();
      setIsMember(false);
      setBookedSlots([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPaying(false);
    }
  }

  if (confirmed) {
    return (
      <Card className="p-8 md:p-10 text-center shadow-elegant border-border/60">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="font-display text-2xl font-semibold">Booking confirmed ✨</h3>
        <p className="mt-2 text-muted-foreground">
          {confirmed.service} with {confirmed.staff} at {confirmed.branch}
        </p>
        <p className="text-muted-foreground">
          {confirmed.date} · {confirmed.slot}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          A confirmation will be sent to your phone. See you soon!
        </p>
        <Button className="mt-6" variant="outline" onClick={() => setConfirmed(null)}>
          Book another appointment
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-10 shadow-elegant border-border/60">
      {isMember && (
        <div className="mb-5 flex items-center gap-2 rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
          <Crown className="h-4 w-4 text-primary" />
          <span>
            Member detected — <span className="font-medium">50% off nail art</span> applied
            automatically.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name</Label>
            <Input
              id="client_name"
              placeholder="Your full name"
              aria-invalid={!!errors.client_name}
              {...register("client_name")}
            />
            {errors.client_name && (
              <p className="text-xs text-destructive">{errors.client_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              inputMode="tel"
              placeholder="+91 XXXXXXXXXX"
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Controller
              control={control}
              name="branch"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("staff_name", "");
                    setValue("time_slot", "");
                  }}
                >
                  <SelectTrigger aria-invalid={!!errors.branch}>
                    <SelectValue placeholder="Choose branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.branch && <p className="text-xs text-destructive">{errors.branch.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Appointment Date</Label>
            <Controller
              control={control}
              name="appointment_date"
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !field.value && "text-muted-foreground",
                      )}
                      aria-invalid={!!errors.appointment_date}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? format(field.value, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(d) => {
                        field.onChange(d);
                        setValue("time_slot", "");
                      }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.appointment_date && (
              <p className="text-xs text-destructive">{errors.appointment_date.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Stylist</Label>
          <Controller
            control={control}
            name="staff_name"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  setValue("time_slot", "");
                }}
                disabled={!branch}
              >
                <SelectTrigger aria-invalid={!!errors.staff_name}>
                  <SelectValue placeholder={branch ? "Choose stylist" : "Pick a branch first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredStaff.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No stylists for this branch
                    </div>
                  )}
                  {filteredStaff.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.staff_name && (
            <p className="text-xs text-destructive">{errors.staff_name.message}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Time Slot
              {loadingSlots && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </Label>
            <Controller
              control={control}
              name="time_slot"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!slotsReady}>
                  <SelectTrigger aria-invalid={!!errors.time_slot}>
                    <SelectValue
                      placeholder={slotsReady ? "Choose time" : "Pick stylist & date first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((t) => {
                      const taken = bookedSlots.includes(t);
                      return (
                        <SelectItem key={t} value={t} disabled={taken}>
                          {t}
                          {taken ? " · booked" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.time_slot && (
              <p className="text-xs text-destructive">{errors.time_slot.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Service</Label>
            <Controller
              control={control}
              name="service"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.service}>
                    <SelectValue placeholder="Choose service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => {
                      const mp =
                        isMember && s.isNailArt ? Math.round(s.price * 0.5) : null;
                      return (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} —{" "}
                          {mp !== null ? (
                            <>
                              <span className="line-through text-muted-foreground mr-1">
                                ₹{s.price}
                              </span>
                              ₹{mp}
                            </>
                          ) : (
                            <>₹{s.price}</>
                          )}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.service && (
              <p className="text-xs text-destructive">{errors.service.message}</p>
            )}
            {selectedService && (
              <p className="text-xs text-muted-foreground">
                Service price:{" "}
                <span className="font-medium text-foreground">
                  ₹{memberPrice ?? selectedService.price}
                </span>
                {memberPrice !== null && <> (member 50% off)</>} · + ₹{bookingFee} booking fee
                charged now.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="special_requests">Special Requests</Label>
          <Textarea
            id="special_requests"
            placeholder="Any preferences, allergies, or notes…"
            rows={3}
            {...register("special_requests")}
          />
        </div>

        <Button
          type="submit"
          disabled={paying}
          className="w-full bg-gradient-hero hover:opacity-95 text-primary-foreground shadow-soft h-12"
        >
          {paying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
            </>
          ) : (
            <>Pay ₹{bookingFee} &amp; Confirm Booking</>
          )}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Your booking is confirmed only after the ₹{bookingFee} fee is paid. Secured by Razorpay.
        </p>
      </form>
    </Card>
  );
}
