"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildTime24, cn, parseTime24, type Period } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1)); // "1".."12"
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // "00".."55"

export interface TimeField12hProps {
  /** 24-hour "HH:MM", or "" when no time is chosen yet. */
  value: string;
  /** Receives a 24-hour "HH:MM", or "" while the hour is still unset. */
  onChange: (value: string) => void;
  /** Applied to the hour trigger so an external <Label htmlFor> targets it. */
  id?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Locale-independent AM/PM time picker: Hour + Minute dropdowns and an AM|PM
 * toggle. Always shows 12-hour AM/PM regardless of the device locale (unlike
 * native <input type="time">), but speaks 24-hour "HH:MM" to its parent so the
 * existing slot-label helpers (composeSlotLabel/minutesOfDay) are untouched.
 *
 * Stateless: the displayed parts are derived from `value` every render, so the
 * picker can never drift out of sync with the controlled value.
 */
export function TimeField12h({ value, onChange, id, ariaLabel, className }: TimeField12hProps) {
  // Off-step minutes can't occur here — only this component writes the value —
  // so a value like "11:07" would simply show no minute selection.
  const parsed = parseTime24(value);
  const hour = parsed ? String(parsed.h12) : "";
  const minute = parsed ? parsed.min : "";
  const period: Period = parsed ? parsed.period : "AM";

  const commit = React.useCallback(
    (h: string, m: string, p: Period) => {
      if (!h) {
        onChange(""); // incomplete until an hour is chosen
        return;
      }
      onChange(buildTime24(Number(h), m || "00", p)); // minute defaults to "00"
    },
    [onChange],
  );

  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex items-center gap-1.5", className)}>
      <Select value={hour} onValueChange={(h) => commit(h, minute, period)}>
        <SelectTrigger
          id={id}
          className="w-[68px]"
          aria-label={ariaLabel ? `${ariaLabel} hour` : "Hour"}
        >
          <SelectValue placeholder="--" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-muted-foreground">:</span>

      <Select value={minute} onValueChange={(m) => commit(hour, m, period)}>
        <SelectTrigger className="w-[72px]" aria-label={ariaLabel ? `${ariaLabel} minute` : "Minute"}>
          <SelectValue placeholder="--" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        type="single"
        variant="outline"
        value={period}
        // Radix emits "" when the active item is re-clicked; ignore it so the
        // period can never become unset.
        onValueChange={(v) => {
          if (v === "AM" || v === "PM") commit(hour, minute, v);
        }}
        aria-label={ariaLabel ? `${ariaLabel} AM or PM` : "AM or PM"}
        className="ml-1"
      >
        <ToggleGroupItem value="AM" className="px-3">
          AM
        </ToggleGroupItem>
        <ToggleGroupItem value="PM" className="px-3">
          PM
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
