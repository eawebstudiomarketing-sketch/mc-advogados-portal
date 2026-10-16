"use client";

import { useRef, useState } from "react";
import { updateActivityStatusAction } from "./actions";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";

const COR: Record<ActivityStatus, string> = {
  aberta: "border-status-pending/30 bg-status-pending-bg text-status-pending",
  em_andamento: "border-status-info/30 bg-status-info-bg text-status-info",
  concluida: "border-status-success/30 bg-status-success-bg text-status-success",
  cancelada: "border-border bg-surface-2 text-muted",
};

export function StatusSelect({ id, status }: { id: string; status: ActivityStatus }) {
  const formRef = useRef<HTMLFormElement>(null);
  // Select controlado: `defaultValue` só se aplica na primeira montagem, então
  // o revalidatePath do Server Action não refletia na tela (o banco salvava
  // certo, a UI é que ficava com o valor antigo até um reload manual).
  const [value, setValue] = useState(status);

  return (
    <form ref={formRef} action={updateActivityStatusAction}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        value={value}
        onChange={(e) => {
          setValue(e.target.value as ActivityStatus);
          formRef.current?.requestSubmit();
        }}
        aria-label="Status"
        className={`h-7 cursor-pointer appearance-none rounded-full border px-3 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-navy ${COR[value]}`}
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
