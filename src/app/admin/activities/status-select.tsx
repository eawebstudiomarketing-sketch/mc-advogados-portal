"use client";

import { useRef, useState } from "react";
import { updateActivityStatusAction } from "./actions";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";

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
