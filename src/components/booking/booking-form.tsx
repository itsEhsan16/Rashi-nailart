"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Crown, Loader2, CheckCircle2 } from "lucide-react";
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
import { cn, slotStartLabel } from "@/lib/utils";

import { bookingFormSchema, type BookingFormValues } from "@/lib/validations/booking";
import {
  checkMembership,
  getBookedSlots,
  createBooking,
  uploadBookingProof,
  cancelPendingBooking,
  type PaymentSettings,
} from "@/lib/actions/booking";
import { PaymentScreen } from "@/components/booking/payment-screen";
import { BookingSteps } from "@/components/booking/booking-steps";
import type { ServiceOption, BranchOption, StaffOption } from "@/lib/catalog";
import { PENDING_HOLD_MINUTES } from "@/lib/salon-data";

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
  storeNumber: string | null;
};

/** Persisted in localStorage so an in-flight payment survives the browser
 *  discarding the tab when the customer switches to their UPI app to pay. */
type PendingPayment = {
  appointmentId: string;
  amount: number;
  settings: PaymentSettings;
  summary: Summary;
  /** ms epoch when the slot was held — used to drop a stale hold on restore. */
  createdAt: number;
};

const PENDING_KEY = "rashi:pending-booking";

/** A confirmed booking stays on screen for 24h (across refreshes) until the
 *  customer explicitly books another — so they keep their appointment details
 *  handy after closing or reopening the tab. */
type ConfirmedBooking = {
  summary: Summary;
  /** ms epoch when the booking was confirmed (proof uploaded). */
  confirmedAt: number;
};

const CONFIRMED_KEY = "rashi:confirmed-booking";
const CONFIRMED_TTL_MS = 24 * 60 * 60 * 1000;

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
  const [restoring, setRestoring] = useState(true);

  // On mount, restore saved state so a refresh/navigation doesn't lose it:
  //  1. A confirmed booking stays for 24h until the customer books another, so
  //     they keep their appointment details handy after reopening the tab.
  //  2. Otherwise an in-flight payment hold is restored (e.g. after returning
  //     from the UPI app) so the customer can still upload proof and keep the
  //     slot. A hold older than the window was reclaimed server-side — drop it.
  useEffect(() => {
    try {
      const confRaw = localStorage.getItem(CONFIRMED_KEY);
      if (confRaw) {
        const savedConf = JSON.parse(confRaw) as ConfirmedBooking;
        if (Date.now() - (savedConf.confirmedAt ?? 0) < CONFIRMED_TTL_MS) {
          setSubmitted(savedConf.summary);
          return; // confirmation wins — don't also restore a payment hold
        }
        localStorage.removeItem(CONFIRMED_KEY);
      }

      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PendingPayment;
      const fresh = Date.now() - (saved.createdAt ?? 0) < PENDING_HOLD_MINUTES * 60 * 1000;
      if (fresh) setPending(saved);
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore malformed storage */
    } finally {
      setRestoring(false);
    }
  }, []);

  const persistPending = useCallback((p: PendingPayment | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  /**
   * Free the in-flight hold when the customer explicitly backs out — the booking
   * is never confirmed without an uploaded proof. We only release on this
   * deliberate action (not on tab-hide / app-switch): paying over UPI means
   * leaving the browser for the UPI app, so auto-releasing on visibility/unload
   * would wrongly cancel a payment in progress. True abandonment is reclaimed
   * server-side by sweepStalePendingHolds and meanwhile hidden from dashboards.
   */
  const releasePending = useCallback(() => {
    if (pending) void cancelPendingBooking({ appointmentId: pending.appointmentId });
    persistPending(null);
  }, [pending, persistPending]);

  // Dismiss the 24h confirmation and return to a fresh form — the only way the
  // customer leaves the "You're booked" screen short of the 24h expiry.
  const clearConfirmed = useCallback(() => {
    setSubmitted(null);
    try {
      localStorage.removeItem(CONFIRMED_KEY);
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

  const apptDow = apptDate ? apptDate.getDay() : null; // 0=Sun..6=Sat, local

  // Stylists for the branch, narrowed to those who work the chosen weekday.
  const filteredStaff = useMemo(() => {
    if (!branch) return [];
    const byBranch = staff.filter((s) => s.branch === branch);
    if (apptDow === null) return byBranch; // no date yet → all branch stylists
    return byBranch.filter((s) => (s.schedule[apptDow]?.length ?? 0) > 0);
  }, [branch, staff, apptDow]);

  // The chosen stylist (for store number, schedule, etc.).
  const selectedStaff = useMemo(
    () => filteredStaff.find((s) => s.name === staffName) ?? null,
    [filteredStaff, staffName],
  );

  // Slots the chosen stylist works on the chosen weekday (∩ active time slots).
  const scheduledSlots = useMemo(() => {
    if (apptDow === null || !staffName) return [] as string[];
    return selectedStaff?.schedule[apptDow] ?? [];
  }, [selectedStaff, staffName, apptDow]);
  const availableSlots = useMemo(
    () => timeSlots.filter((t) => scheduledSlots.includes(t)),
    [timeSlots, scheduledSlots],
  );

  // If the chosen stylist no longer matches the date's availability, reset it.
  useEffect(() => {
    if (staffName && !filteredStaff.some((s) => s.name === staffName)) {
      setValue("staff_name", "");
      setValue("time_slot", "");
    }
  }, [filteredStaff, staffName, setValue]);

  const selectedService = useMemo(
    () => services.find((s) => s.name === serviceName),
    [services, serviceName],
  );
  const memberPrice =
    selectedService && isMember && selectedService.isNailArt
      ? Math.round(selectedService.price * 0.5)
      : null;

  const slotsReady = Boolean(branch && staffName && apptDate);
  const noStylistsForDate = Boolean(branch && apptDate && filteredStaff.length === 0);

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
        createdAt: Date.now(),
        summary: {
          service: values.service,
          date: format(values.appointment_date, "PPP"),
          slot: values.time_slot,
          staff: values.staff_name,
          branch: values.branch,
          storeNumber:
            staff.find((s) => s.name === values.staff_name && s.branch === values.branch)
              ?.storeNumber ?? null,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function onProofUploaded() {
    if (pending) {
      setSubmitted(pending.summary);
      // Persist the confirmation so it survives a refresh for the next 24h.
      try {
        const payload: ConfirmedBooking = { summary: pending.summary, confirmedAt: Date.now() };
        localStorage.setItem(CONFIRMED_KEY, JSON.stringify(payload));
      } catch {
        /* storage may be unavailable */
      }
    }
    persistPending(null);
    reset();
    setIsMember(false);
    setBookedSlots([]);
    toast.success("You're booked! ✨");
  }

  // While we read localStorage on mount, hold a neutral placeholder so a saved
  // confirmation/payment screen restores without flashing the empty form first.
  if (restoring) {
    return (
      <Card className="grid min-h-55 place-items-center rounded-xl border-border/60 p-8 shadow-elegant md:p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // Booking confirmation.
  if (submitted) {
    return (
      <div className="space-y-6">
        <BookingSteps current={2} />
        <Card className="rounded-xl p-8 md:p-10 text-center shadow-elegant border-border/60">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="font-display text-2xl font-semibold">You&apos;re booked! ✨</h3>
          <p className="mt-2 text-muted-foreground">
            {submitted.service} with {submitted.staff} at {submitted.branch}
          </p>
          <p className="text-muted-foreground">
            {submitted.date} · {slotStartLabel(submitted.slot)}
          </p>
          {submitted.storeNumber && (
            <p className="text-muted-foreground">Studio number: {submitted.storeNumber}</p>
          )}
          <div className="mx-auto mt-5 max-w-sm rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-left text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What happens next</p>
            <p className="mt-1">
              We&apos;ve received your screenshot and will verify your ₹{bookingFee} payment. Nothing
              more to pay online — just arrive at your slot. Pay the balance at the studio.
            </p>
          </div>
          <Button className="mt-6" variant="outline" onClick={clearConfirmed}>
            Book another appointment
          </Button>
        </Card>
      </div>
    );
  }

  // Payment screen — held booking awaiting the UPI screenshot.
  if (pending) {
    return (
      <div className="space-y-6">
        <BookingSteps current={1} />
        <PaymentScreen
          id={pending.appointmentId}
          idField="appointmentId"
          amount={pending.amount}
          settings={pending.settings}
          uploadAction={uploadBookingProof}
          forLabel="booking fee"
          holdExpiresAt={pending.createdAt + PENDING_HOLD_MINUTES * 60 * 1000}
          summaryLine={`${pending.summary.service} · ${pending.summary.date} · ${slotStartLabel(pending.summary.slot)}`}
          onUploaded={onProofUploaded}
        />
        <button
          type="button"
          className="mx-auto block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={releasePending}
        >
          Cancel and edit booking details
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BookingSteps current={0} />
      <Card className="rounded-xl p-6 md:p-10 shadow-elegant border-border/60">
        <div className="mb-6">
          <h3 className="font-display text-xl font-semibold">Your details</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick your branch, artist, date &amp; service. We&apos;ll hold your slot for{" "}
            {PENDING_HOLD_MINUTES} minutes while you pay the ₹{bookingFee} fee to confirm.
          </p>
        </div>
        {isMember && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
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
                        setValue("staff_name", "");
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
          <Label>Artist</Label>
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
                  <SelectValue placeholder={branch ? "Choose artist" : "Pick a branch first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredStaff.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {apptDate ? "No artists available on this date" : "No artists for this branch"}
                    </div>
                  )}
                  {filteredStaff.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                      {s.storeNumber && (
                        <span className="ml-2 text-muted-foreground">· Studio {s.storeNumber}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {noStylistsForDate && (
            <p className="text-sm text-muted-foreground">No slots available for this date.</p>
          )}
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
                      placeholder={slotsReady ? "Choose time" : "Pick artist & date first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlots.map((t) => {
                      const taken = bookedSlots.includes(t);
                      return (
                        <SelectItem key={t} value={t} disabled={taken}>
                          {slotStartLabel(t)}
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
          We&apos;ll hold your slot for {PENDING_HOLD_MINUTES} minutes while you pay the ₹{bookingFee}{" "}
          booking fee over UPI and upload the screenshot to confirm. This ₹{bookingFee} is deducted
          from your total.
        </p>
        </form>
      </Card>
    </div>
  );
}
