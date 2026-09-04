"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Crown, Loader2 } from "lucide-react";
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
import { StaffAvatar } from "@/components/staff-avatar";
import { cn, isSlotInPast, slotCutoffLabel, slotStartLabel } from "@/lib/utils";

import { bookingFormSchema, type BookingFormValues } from "@/lib/validations/booking";
import {
  checkMembership,
  getBookedSlots,
  createBooking,
  createBookingOrder,
  cancelPendingBooking,
} from "@/lib/actions/booking";
import { PaySecureScreen } from "@/components/booking/pay-secure-screen";
import { redirectToCheckout } from "@/lib/cashfree-checkout";
import { BookingSteps } from "@/components/booking/booking-steps";
import type { ServiceOption, BranchOption, StaffOption } from "@/lib/catalog";
import { PAYING_HOLD_MINUTES, PENDING_HOLD_MINUTES } from "@/lib/salon-data";

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
 *  discarding the tab when the customer leaves for Cashfree's hosted page. The
 *  confirmation itself happens on /booking/confirm; this only lets a customer who
 *  returns without paying resume the "Pay" step while the hold lasts. */
type PendingPayment = {
  appointmentId: string;
  amount: number;
  /** Cashfree order id, set once payment is started (fallback reconcile key). */
  orderId?: string;
  summary: Summary;
  /** ms epoch when the slot was held — used to drop a stale hold on restore. */
  createdAt: number;
  /**
   * ms epoch when the hold actually expires, as told to us by the server after
   * the Cashfree order was created. Starting payment moves the row onto the much
   * longer PAYING_HOLD_MINUTES window, so without this the countdown would keep
   * ticking down from `createdAt` and tell the customer their slot had gone while
   * the server was still holding it.
   */
  holdExpiresAt?: number;
};

const PENDING_KEY = "rashi:pending-booking";

export function BookingForm({ services, timeSlots, branches, staff, bookingFee }: Props) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
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
  const [restoring, setRestoring] = useState(true);

  // On mount, restore an in-flight payment hold so a refresh / return from the
  // payment page doesn't lose it (the customer can resume "Pay" within the hold
  // window). A hold older than the window was reclaimed server-side — drop it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PendingPayment;
      // Once an order exists the server holds the slot for the longer window, so
      // honour the expiry it gave us rather than the short pre-order one.
      const expiresAt =
        saved.holdExpiresAt ?? (saved.createdAt ?? 0) + PENDING_HOLD_MINUTES * 60 * 1000;
      const fresh = Date.now() < expiresAt;
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
   * is never confirmed without a completed payment. We only release on this
   * deliberate action (not on tab-hide / app-switch): paying means leaving the
   * browser for Cashfree/UPI, so auto-releasing on visibility/unload would wrongly
   * cancel a payment in progress. True abandonment is reclaimed server-side by
   * sweepStalePendingHolds and meanwhile hidden from dashboards.
   */
  const releasePending = useCallback(() => {
    if (pending) void cancelPendingBooking({ appointmentId: pending.appointmentId });
    persistPending(null);
  }, [pending, persistPending]);

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
  const apptDateStr = useMemo(
    () => (apptDate ? format(apptDate, "yyyy-MM-dd") : null),
    [apptDate],
  );
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

  /** Create the Cashfree order and hand off to the hosted checkout (redirect). */
  const payNow = useCallback(async () => {
    if (!pending) return;
    const res = await createBookingOrder({ appointmentId: pending.appointmentId });
    if (!res.ok) throw new Error(res.error);
    // Remember the order id so a return can reconcile even without the URL param,
    // and the server's real hold expiry so the countdown stops under-reporting.
    persistPending({
      ...pending,
      orderId: res.orderId,
      holdExpiresAt: new Date(res.holdExpiresAt).getTime(),
    });
    await redirectToCheckout(res.paymentSessionId);
  }, [pending, persistPending]);

  // While we read localStorage on mount, hold a neutral placeholder so a saved
  // payment screen restores without flashing the empty form first.
  if (restoring) {
    return (
      <Card className="grid min-h-55 place-items-center rounded-xl border-border/60 p-8 shadow-elegant md:p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // Payment screen — held booking awaiting the Cashfree payment.
  if (pending) {
    return (
      <div className="space-y-6">
        <BookingSteps current={1} />
        <PaySecureScreen
          amount={pending.amount}
          forLabel="booking fee"
          holdExpiresAt={
            pending.holdExpiresAt ?? pending.createdAt + PENDING_HOLD_MINUTES * 60 * 1000
          }
          summaryLine={`${pending.summary.service} · ${pending.summary.date} · ${slotStartLabel(pending.summary.slot)}`}
          onPay={payNow}
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
            {PAYING_HOLD_MINUTES} minutes while you pay the ₹{bookingFee} fee to confirm.
          </p>
        </div>
        {isMember && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
            <Crown className="h-4 w-4 text-primary" />
            <span>
              Member detected — any membership discount is settled{" "}
              <span className="font-medium">in-store</span> by our team.
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
                    <SelectItem
                      key={s.name}
                      value={s.name}
                      icon={<StaffAvatar name={s.name} photoUrl={s.photoUrl} className="mr-2 h-13.5 w-13.5" />}
                    >
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
                      const cutoffLabel = apptDateStr ? slotCutoffLabel(apptDateStr, t) : null;
                      const past = apptDateStr ? isSlotInPast(apptDateStr, t) : false;
                      return (
                        <SelectItem key={t} value={t} disabled={taken || past || Boolean(cutoffLabel)}>
                          {slotStartLabel(t)}
                          {taken ? " · booked" : past ? " · passed" : cutoffLabel ? ` · ${cutoffLabel}` : ""}
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
                    {services.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name} — ₹{s.price}
                      </SelectItem>
                    ))}
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
                <span className="font-medium text-foreground">₹{selectedService.price}</span>
                {" "}· + ₹{bookingFee} booking fee charged now.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              One service per booking. To book another service, please make a separate appointment
              (₹{bookingFee} booking fee applies to each).
            </p>
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
          We&apos;ll hold your slot for {PAYING_HOLD_MINUTES} minutes while you pay the ₹{bookingFee}{" "}
          booking fee securely online to confirm. This ₹{bookingFee} is deducted from your total.
        </p>
        </form>
      </Card>
    </div>
  );
}
