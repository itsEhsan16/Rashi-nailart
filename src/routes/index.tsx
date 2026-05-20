import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarIcon, Sparkles, LogIn, Crown } from "lucide-react";
import { z } from "zod";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  BRANCHES, TIME_SLOTS, SERVICES, MEMBERSHIP_PRICE, BOOKING_FEE, type Branch,
} from "@/lib/salon-data";
import { supabase } from "@/integrations/supabase/client";
import { checkMembershipFn } from "@/lib/payments.functions";
import { bookAppointmentFn } from "@/lib/salon.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book Appointment — Rashi Nail Art Studio" },
      {
        name: "description",
        content:
          "Reserve your spot at Rashi Nail Art Studio. Choose branch, date, time, service and stylist — confirm in seconds. Members get 50% off nail art.",
      },
    ],
  }),
  component: HomePage,
});

const schema = z.object({
  client_name: z.string().trim().min(1, "Required").max(100),
  phone: z.string().trim().min(7, "Enter a valid phone").max(20),
  branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]),
  appointment_date: z.date({ required_error: "Pick a date" }),
  time_slot: z.string().min(1, "Required"),
  service: z.string().min(1, "Required"),
  staff_name: z.string().min(1, "Required"),
  special_requests: z.string().max(500).optional(),
});

function HomePage() {
  const navigate = useNavigate();
  const bookAppointment = useServerFn(bookAppointmentFn);
  const checkMembership = useServerFn(checkMembershipFn);

  const [form, setForm] = useState<{
    client_name: string;
    phone: string;
    branch: Branch | "";
    appointment_date: Date | undefined;
    time_slot: string;
    service: string;
    staff_name: string;
    special_requests: string;
  }>({
    client_name: "",
    phone: "",
    branch: "",
    appointment_date: undefined,
    time_slot: "",
    service: "",
    staff_name: "",
    special_requests: "",
  });

  const [staffList, setStaffList] = useState<{ name: string; branch: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [memberPaying, setMemberPaying] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [memberDialog, setMemberDialog] = useState(false);
  const [memberInfo, setMemberInfo] = useState({ name: "", phone: "" });

  useEffect(() => {
    supabase
      .from("staff")
      .select("name, branch")
      .order("name")
      .then(({ data }) => setStaffList(data ?? []));
  }, []);

  // Auto-detect member by phone (debounced)
  useEffect(() => {
    if (!form.phone || form.phone.trim().length < 7) {
      setIsMember(false);
      return;
    }
    const t = setTimeout(async () => {
      const res = await checkMembership({ data: { phone: form.phone.trim() } });
      if (res.ok) setIsMember(res.isMember);
    }, 400);
    return () => clearTimeout(t);
  }, [form.phone, checkMembership]);

  const filteredStaff = form.branch
    ? staffList.filter((s) => s.branch === form.branch)
    : [];

  const selectedService = SERVICES.find((s) => s.name === form.service);
  const isNailService = selectedService ? /nail/i.test(selectedService.name) : false;
  const previewServicePrice =
    selectedService && isMember && isNailService
      ? Math.round(selectedService.price * 0.5)
      : selectedService?.price ?? 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please fill all fields");
      return;
    }
    const service = SERVICES.find((s) => s.name === parsed.data.service);
    if (!service) { toast.error("Select a valid service"); return; }
    const finalPrice = isMember && /nail/i.test(service.name)
      ? Math.round(service.price * 0.5)
      : service.price;
    setSubmitting(true);
    try {
      const res = await bookAppointment({
        data: {
          client_name: parsed.data.client_name,
          phone: parsed.data.phone,
          branch: parsed.data.branch,
          appointment_date: format(parsed.data.appointment_date, "yyyy-MM-dd"),
          time_slot: parsed.data.time_slot,
          service: parsed.data.service,
          price: finalPrice,
          staff_name: parsed.data.staff_name,
          special_requests: parsed.data.special_requests || null,
        },
      });
      if (!res.ok) { toast.error(res.error || "Could not confirm booking"); return; }
      toast.success("Your appointment is confirmed ✨");
      setForm({
        client_name: "", phone: "", branch: "",
        appointment_date: undefined, time_slot: "",
        service: "", staff_name: "", special_requests: "",
      });
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function onBuyMembership() {
    toast.message("Integrate payment gateway", {
      description: "Connect a payment provider to enable membership purchases.",
    });
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-gradient-hero grid place-items-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold flex flex-col leading-tight">
              <span className="text-xl">Rashi</span>
              <span className="text-sm">Nail Art Studio</span>
            </span>
          </Link>
          <Button variant="ghost" onClick={() => navigate({ to: "/login" })}>
            <LogIn className="mr-2 h-4 w-4" />
            Staff Login
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Vile Parle  ·  Bandra  ·  Kandivali
        </span>
        <h1 className="mt-6 font-display text-5xl md:text-6xl font-semibold tracking-tight">
          Book your <span className="text-primary">salon</span> moment
        </h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          Premium nails, gel polish & extensions — reserved in under a minute.
        </p>
      </section>

      {/* Membership banner */}
      <section className="mx-auto max-w-3xl px-6 pb-8">
        <Card className="p-5 md:p-6 border-primary/40 bg-gradient-to-r from-primary/10 via-background to-primary/5 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-3 text-left">
            <div className="h-11 w-11 rounded-full grid place-items-center bg-primary/15 text-primary">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">
                One Year Membership · ₹{MEMBERSHIP_PRICE}
              </div>
              <p className="text-sm text-muted-foreground">
                Get <span className="font-medium text-foreground">50% off any nail art service</span> for a full year.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setMemberDialog(true)}
            className="bg-gradient-hero text-primary-foreground shadow-soft h-11 px-5"
          >
            Buy Membership · ₹{MEMBERSHIP_PRICE}
          </Button>
        </Card>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <Card className="p-6 md:p-10 shadow-elegant border-border/60">
          {isMember && (
            <div className="mb-5 flex items-center gap-2 rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
              <Crown className="h-4 w-4 text-primary" />
              <span>
                Member detected — <span className="font-medium">50% off nail art</span> applied automatically.
              </span>
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Client Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 XXXXXXXXXX"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={form.branch}
                  onValueChange={(v) =>
                    setForm({ ...form, branch: v as Branch, staff_name: "" })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Appointment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !form.appointment_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.appointment_date
                        ? format(form.appointment_date, "PPP")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.appointment_date}
                      onSelect={(d) => setForm({ ...form, appointment_date: d })}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Select
                  value={form.time_slot}
                  onValueChange={(v) => setForm({ ...form, time_slot: v })}
                  disabled={!form.branch || !form.staff_name || !form.appointment_date}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !form.staff_name || !form.appointment_date
                          ? "Pick staff & date first"
                          : "Choose time"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service</Label>
                <Select
                  value={form.service}
                  onValueChange={(v) => setForm({ ...form, service: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose service" /></SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => {
                      const memberPrice = isMember && /nail/i.test(s.name)
                        ? Math.round(s.price * 0.5) : null;
                      return (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} — {memberPrice !== null
                            ? <><span className="line-through text-muted-foreground mr-1">₹{s.price}</span>₹{memberPrice}</>
                            : <>₹{s.price}</>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedService && (
                  <p className="text-xs text-muted-foreground">
                    Service price: <span className="font-medium text-foreground">₹{previewServicePrice}</span>
                    {isMember && isNailService && selectedService.price !== previewServicePrice && (
                      <> (member 50% off)</>
                    )}
                    {" · "}+ ₹{BOOKING_FEE} booking fee charged now.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Staff Name</Label>
              <Select
                value={form.staff_name}
                onValueChange={(v) => setForm({ ...form, staff_name: v })}
                disabled={!form.branch}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={form.branch ? "Choose staff" : "Pick branch first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredStaff.map((s) => (
                    <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Special Requests</Label>
              <Textarea
                value={form.special_requests}
                onChange={(e) => setForm({ ...form, special_requests: e.target.value })}
                placeholder="Any preferences, allergies, or notes..."
                rows={3}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-gradient-hero hover:opacity-95 text-primary-foreground shadow-soft h-12"
              >
                {submitting ? "Processing..." : `Pay ₹${BOOKING_FEE} & Confirm Booking`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 sm:w-40"
                onClick={() => navigate({ to: "/login" })}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Booking is confirmed only after the ₹{BOOKING_FEE} fee is paid.
            </p>
          </form>
        </Card>
      </section>

      {/* Membership Dialog */}
      <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" /> 1 Year Membership
            </DialogTitle>
            <DialogDescription>
              ₹{MEMBERSHIP_PRICE} for the year. Unlocks 50% off all nail art services.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your Name</Label>
              <Input
                value={memberInfo.name}
                onChange={(e) => setMemberInfo({ ...memberInfo, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                value={memberInfo.phone}
                onChange={(e) => setMemberInfo({ ...memberInfo, phone: e.target.value })}
                placeholder="+91 XXXXXXXXXX"
              />
              <p className="text-xs text-muted-foreground">
                We use your phone to recognize you at booking.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={onBuyMembership}
              disabled={memberPaying}
              className="bg-gradient-hero text-primary-foreground"
            >
              {memberPaying ? "Processing..." : `Pay ₹${MEMBERSHIP_PRICE}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
