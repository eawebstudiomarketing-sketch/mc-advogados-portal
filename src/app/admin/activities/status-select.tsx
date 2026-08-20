"use client";

import { useRef } from "react";
import { updateActivityStatusAction } from "./actions";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";

export function StatusSelect({ id, status }: { id: string; status: ActivityStatus }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateActivityStatusAction}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
      >
        {ACTIVITY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ACTIVITY_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
