"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconCalendarTime, IconClockHour9 } from "@tabler/icons-react";
import { MIN_SCHEDULE_LEAD_MS } from "@postline/core";
import { dayjs, isoToPicker, nextPostingTime, nowInTz, pickerToIso, tomorrowAt, PICKER_FORMAT } from "@/components/posts/tz";

interface Props {
  opened: boolean;
  onClose: () => void;
  timezone: string;
  initialIso: string | null;
  onConfirm: (iso: string) => Promise<void> | void;
  busy?: boolean;
}

/** Schedule picker. Values are wall-clock times in the brand timezone. */
export function ScheduleModal({ opened, onClose, timezone, initialIso, onConfirm, busy }: Props) {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      const init = initialIso && new Date(initialIso).getTime() > Date.now() + MIN_SCHEDULE_LEAD_MS ? isoToPicker(initialIso, timezone) : nextPostingTime(timezone);
      setValue(init);
    }
  }, [opened, initialIso, timezone]);

  const iso = pickerToIso(value, timezone);
  const tooSoon = !!iso && new Date(iso).getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS;
  const minDate = nowInTz(timezone).format("YYYY-MM-DD");
  const local = iso ? dayjs(iso).format("ddd, MMM D · h:mm A") : null;
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;

  return (
    <Modal opened={opened} onClose={onClose} title="Schedule post" centered>
      <Stack gap="md">
        <DateTimePicker
          label={`Date and time (${timezone})`}
          placeholder="Pick a date and time"
          value={value}
          onChange={(v) => setValue(v)}
          minDate={minDate}
          valueFormat="ddd, MMM D YYYY · h:mm A"
          timePickerProps={{ format: "12h", withDropdown: true }}
          leftSection={<IconCalendarTime size={16} />}
          error={tooSoon ? "Choose a schedule time at least 2 minutes from now" : undefined}
          data-autofocus
        />
        <Group gap="xs">
          <Button size="xs" variant="light" leftSection={<IconClockHour9 size={14} />} onClick={() => setValue(nextPostingTime(timezone))}>
            Next posting time
          </Button>
          <Button size="xs" variant="light" onClick={() => setValue(tomorrowAt(timezone, 9))}>
            Tomorrow 9:00 AM
          </Button>
          <Button size="xs" variant="subtle" onClick={() => setValue(nowInTz(timezone).add(1, "hour").startOf("hour").format(PICKER_FORMAT))}>
            In about an hour
          </Button>
        </Group>
        {local && browserTz !== timezone && (
          <Text size="xs" c="dimmed">
            That&apos;s {local} in your local time ({browserTz}).
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!iso || tooSoon} loading={busy} onClick={() => iso && onConfirm(iso)}>
            Schedule
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
