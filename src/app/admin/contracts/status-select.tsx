"use client";

import { useRef } from "react";
import { updateContractStatusAction } from "./actions";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract-status";

export function StatusSelect({ id, status }: { id: string; status: ContractStatus }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateContractStatusAction}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
      >
        {CONTRACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CONTRACT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
