"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Crown, Loader2, Clock } from "lucide-react";
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
  createBooking,
  uploadBookingProof,
  type PaymentSettings,
} from "@/lib/actions/booking";
import { PaymentScreen } from "@/components/booking/payment-screen";
import type { ServiceOption, BranchOption, StaffOption } from "@/lib/catalog";

type Props = {
  services: ServiceOption[];
  timeSlots: string[];
  branches: BranchOption[];
  staff: StaffOption[];
  bookingFee: number;
};

type Summary = {
  service: string;
  date: string;
  slot: string;
  staff: string;
  branch: string;
};

/** Persisted across reloads so the customer never loses an in-flight payment. */
type PendingPayment = {
  appointmentId: string;
  amount: number;
  settings: PaymentSettings;
  summary: Summary;
};

const PENDING_KEY = "rashi:pending-booking";

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
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [submitted, setSubmitted] = useState<Summary | null>(null);

  // Restore an in-flight payment after a refresh/navigation so details aren't lost.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) setPending(JSON.parse(raw) as PendingPayment);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const persistPending = useCallback((p: PendingPayment | null) => {
    setPending(p);
    try {
      if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const phone = watch("phone");
  const branch = watch("branch");
  const staffName = watch("staff_name");
  const apptDate = watch("appointment_date");
  const serviceName = watch("service");

  // Auto-detect membership by phone (debounced). Only active members match.
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
    setSubmitting(true);
    const dateStr = format(values.appointment_date, "yyyy-MM-dd");
    try {
      const res = await createBooking({
        client_name: values.client_name,
        phone: values.phone,
        branch: values.branch,
        appointment_date: dateStr,
        time_slot: values.time_slot,
        service: values.service,
        staff_name: values.staff_name,
        special_requests: values.special_requests || null,
      });

      if (!res.ok) {
        toast.error(res.error);
        const r = await getBookedSlots({
          branch: values.branch,
          staff_name: values.staff_name,
          appointment_date: dateStr,
        });
        setBookedSlots(r.slots);
        return;
      }

      // Slot is held. Move to the payment screen with details preserved.
      persistPending({
        appointmentId: res.appointmentId,
        amount: res.amount,
        settings: res.settings,
        summary: {
          service: values.service,
          date: format(values.appointment_date, "PPP"),
          slot: values.time_slot,
          staff: values.staff_name,
          branch: values.branch,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function onProofUploaded() {
    if (pending) setSubmitted(pending.summary);
    persistPending(null);
    reset();
    setIsMember(false);
    setBookedSlots([]);
    toast.success("Payment proof received ✨");
  }

  // Awaiting-verification confirmation.
  if (submitted) {
    return (
      <Card className="p-8 md:p-10 text-center shadow-elegant border-border/60">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-amber-500/15 text-amber-600 grid place-items-center">
          <Clock className="h-7 w-7" />
        </div>
        <h3 className="font-display text-2xl font-semibold">Payment proof received</h3>
        <p className="mt-2 text-muted-foreground">
          {submitted.service} with {submitted.staff} at {submitted.branch}
        </p>
        <p className="text-muted-foreground">
          {submitted.date} · {submitted.slot}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Your booking is <span className="font-medium text-foreground">pending verification</span>.
          You&apos;ll be notified once it&apos;s confirmed.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => setSubmitted(null)}>
          Book another appointment
        </Button>
      </Card>
    );
  }

  // Payment screen — held booking awaiting the UPI screenshot.
  if (pending) {
    return (
      <div className="space-y-4">
        <PaymentScreen
          id={pending.appointmentId}
          idField="appointmentId"
          amount={pending.amount}
          settings={pending.settings}
          uploadAction={uploadBookingProof}
          forLabel="booking fee"
          onUploaded={onProofUploaded}
        />
        <button
          type="button"
          className="mx-auto block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => persistPending(null)}
        >
          Cancel and edit booking details
        </button>
      </div>
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
          disabled={submitting}
          className="w-full bg-gradient-hero hover:opacity-95 text-primary-foreground shadow-soft h-12"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Holding your slot…
            </>
          ) : (
            <>Continue to payment · ₹{bookingFee}</>
          )}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          We&apos;ll hold your slot, then you pay the ₹{bookingFee} booking fee over UPI and upload a
          screenshot. This ₹{bookingFee} will be deducted from total fees. Confirmed after we verify the payment.
        </p>
      </form>
    </Card>
  );
}
