"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getAppSettings, saveAppSettings, type AppSettings } from "@/lib/actions/admin";

export function SettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AppSettings>({
    upi_id: "",
    payee_name: "",
    upi_qr_url: "",
  });

  useEffect(() => {
    getAppSettings()
      .then((res) => {
        if (res.ok && res.settings) setForm(res.settings);
        else if (!res.ok) toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    setSaving(true);
    const res = await saveAppSettings(form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Payment settings saved");
  }

  if (loading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <Card className="p-6 max-w-2xl space-y-5">
      <div>
        <h3 className="font-display text-lg font-semibold">UPI payment settings</h3>
        <p className="text-sm text-muted-foreground">
          Shown to customers on the payment screen. Changes take effect immediately — no redeploy.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upi_id">UPI ID</Label>
        <Input
          id="upi_id"
          placeholder="yourstudio@okhdfcbank"
          value={form.upi_id}
          onChange={(e) => setForm((f) => ({ ...f, upi_id: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payee_name">Payee name</Label>
        <Input
          id="payee_name"
          placeholder="Rashi Nail Art Studio"
          value={form.payee_name}
          onChange={(e) => setForm((f) => ({ ...f, payee_name: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upi_qr_url">QR image URL</Label>
        <Input
          id="upi_qr_url"
          placeholder="/QR.png or https://…"
          value={form.upi_qr_url}
          onChange={(e) => setForm((f) => ({ ...f, upi_qr_url: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Use a path under <code>/public</code> (e.g. <code>/QR.png</code>) or a full https URL.
        </p>
      </div>

      {form.upi_qr_url && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Preview:</span>
          <div className="rounded-md border border-border/60 bg-white p-2">
            <Image
              src={form.upi_qr_url}
              alt="QR preview"
              width={96}
              height={96}
              className="h-24 w-24 object-contain"
              unoptimized
            />
          </div>
        </div>
      )}

      <Button onClick={onSave} disabled={saving} className="bg-gradient-hero text-primary-foreground">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save settings
      </Button>
    </Card>
  );
}
