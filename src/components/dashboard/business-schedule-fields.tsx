"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/input";

export type ScheduleEntry = {
  day: string;
  enabled: boolean;
  opens: string;
  closes: string;
};

export const defaultBusinessSchedule: ScheduleEntry[] = [
  ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
    day,
    enabled: true,
    opens: "08:00",
    closes: "17:00",
  })),
  { day: "Saturday", enabled: false, opens: "08:00", closes: "13:00" },
  { day: "Sunday", enabled: false, opens: "08:00", closes: "13:00" },
];

const timezones = [
  "Africa/Harare",
  "Africa/Johannesburg",
  "Africa/Lusaka",
  "Africa/Maputo",
  "Africa/Gaborone",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function BusinessScheduleFields({
  initialSchedule = defaultBusinessSchedule,
  initialTimezone = "Africa/Harare",
}: {
  initialSchedule?: ScheduleEntry[];
  initialTimezone?: string;
}) {
  const [schedule, setSchedule] = useState(
    initialSchedule.length ? initialSchedule : defaultBusinessSchedule
  );
  const hours = useMemo(
    () =>
      schedule
        .map((entry) =>
          entry.enabled
            ? `${entry.day} ${entry.opens}–${entry.closes}`
            : `${entry.day} closed`
        )
        .join(", "),
    [schedule]
  );

  return (
    <div className="space-y-4">
      <input type="hidden" name="businessHours" value={hours} />
      <input type="hidden" name="businessSchedule" value={JSON.stringify(schedule)} />
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Business timezone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={initialTimezone}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {!timezones.includes(initialTimezone) && (
            <option value={initialTimezone}>{initialTimezone}</option>
          )}
          {timezones.map((timezone) => (
            <option key={timezone} value={timezone}>{timezone}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Appointment times are offered and saved in this timezone.
        </p>
      </div>
      <div className="space-y-3">
        <Label>Business days and hours</Label>
        <div className="divide-y rounded-lg border">
          {schedule.map((entry, index) => (
            <div
              key={entry.day}
              className="grid grid-cols-[minmax(100px,1fr)_1fr_1fr] items-center gap-3 p-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(event) =>
                    setSchedule((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, enabled: event.target.checked }
                          : item
                      )
                    )
                  }
                />
                {entry.day}
              </label>
              <input
                type="time"
                value={entry.opens}
                disabled={!entry.enabled}
                aria-label={`${entry.day} opening time`}
                onChange={(event) =>
                  setSchedule((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, opens: event.target.value } : item
                    )
                  )
                }
                className="min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <input
                type="time"
                value={entry.closes}
                disabled={!entry.enabled}
                aria-label={`${entry.day} closing time`}
                onChange={(event) =>
                  setSchedule((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, closes: event.target.value } : item
                    )
                  )
                }
                className="min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
