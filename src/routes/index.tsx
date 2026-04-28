import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarIcon, Sparkles, LogIn } from "lucide-react";
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
import { cn } from "@/lib/utils";

import { BRANCHES, TIME_SLOTS, SERVICES, type Branch } from "@/lib/salon-data";
import { bookAppointmentFn, getBookedSlotsFn } from "@/lib/salon.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book Appointment — Rashi Nail Art Studio" },
      {
        name: "description",
        content:
          "Reserve your spot at Rashi Nail Art Studio. Choose branch, date, time, service and stylist — confirm in seconds.",
      },
    ],
  }),
  component: HomePage,
});

const schema = z.object({
  client_name: z.string().trim().min(1, "Required").max(100),
  phone: z.string().trim().min(7, "Enter a valid phone").max(20),
  branch: z.enum(["Vile Parle", "Bandra"]),
  appointment_date: z.date({ required_error: "Pick a date" }),
  time_slot: z.string().min(1, "Required"),
  service: z.string().min(1, "Required"),
  staff_name: z.string().min(1, "Required"),
  special_requests: z.string().max(500).optional(),
});

function HomePage() {
  const navigate = useNavigate();
  const book = useServerFn(bookAppointmentFn);
  const fetchBooked = useServerFn(getBookedSlotsFn);

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
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("staff")
      .select("name, branch")
      .order("name")
      .then(({ data }) => setStaffList(data ?? []));
  }, []);

  // Re-check taken slots whenever branch + staff + date change
  useEffect(() => {
    if (!form.branch || !form.staff_name || !form.appointment_date) {
      setBookedSlots([]);
      return;
    }
    let cancelled = false;
    fetchBooked({
      data: {
        branch: form.branch,
        staff_name: form.staff_name,
        appointment_date: format(form.appointment_date, "yyyy-MM-dd"),
      },
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setBookedSlots(res.slots);
        if (form.time_slot && res.slots.includes(form.time_slot)) {
          setForm((f) => ({ ...f, time_slot: "" }));
          toast.error("That slot was just booked. Please choose another.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.branch, form.staff_name, form.appointment_date]);

  const filteredStaff = form.branch
    ? staffList.filter((s) => s.branch === form.branch)
    : [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please fill all fields");
      return;
    }
    const service = SERVICES.find((s) => s.name === parsed.data.service);
    if (!service) {
      toast.error("Select a valid service");
      return;
    }
    setSubmitting(true);
    const res = await book({
      data: {
        client_name: parsed.data.client_name,
        phone: parsed.data.phone,
        branch: parsed.data.branch,
        appointment_date: format(parsed.data.appointment_date, "yyyy-MM-dd"),
        time_slot: parsed.data.time_slot,
        service: parsed.data.service,
        price: service.price,
        staff_name: parsed.data.staff_name,
        special_requests: parsed.data.special_requests || null,
      },
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error || "Booking failed");
      return;
    }
    toast.success("Appointment booked! We'll see you soon ✨");
    setForm({
      client_name: "",
      phone: "",
      branch: "",
      appointment_date: undefined,
      time_slot: "",
      service: "",
      staff_name: "",
      special_requests: "",
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
            <span className="font-display text-xl font-semibold">Rashi Nail Art Studio</span>
          </Link>
          <Button variant="ghost" onClick={() => navigate({ to: "/login" })}>
            <LogIn className="mr-2 h-4 w-4" />
            Staff Login
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Vile Parle  ·  Bandra
        </span>
        <h1 className="mt-6 font-display text-5xl md:text-6xl font-semibold tracking-tight">
          Book your <span className="text-primary">salon</span> moment
        </h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          Premium nails, gel polish & extensions — reserved in under a minute.
        </p>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <Card className="p-6 md:p-10 shadow-elegant border-border/60">
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 9876543210"
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
                    {TIME_SLOTS.map((t) => {
                      const taken = bookedSlots.includes(t);
                      return (
                        <SelectItem key={t} value={t} disabled={taken}>
                          {t}{taken ? " — Already booked" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {form.staff_name && form.appointment_date && bookedSlots.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {bookedSlots.length} slot{bookedSlots.length > 1 ? "s" : ""} already booked for {form.staff_name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Service</Label>
                <Select
                  value={form.service}
                  onValueChange={(v) => setForm({ ...form, service: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose service" /></SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name} — ₹{s.price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {submitting ? "Booking..." : "Submit Booking"}
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
          </form>
        </Card>
      </section>
    </div>
  );
}
