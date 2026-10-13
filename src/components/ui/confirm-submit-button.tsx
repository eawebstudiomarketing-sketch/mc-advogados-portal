"use client";

import { Trash2, UserX, X } from "lucide-react";

const ICONES = { trash: Trash2, "user-x": UserX, x: X } as const;

// Botão que pede confirmação antes de enviar. Com `icon`, vira um botão só de
// ícone (o rótulo aparece como dica ao passar o mouse).
export function ConfirmSubmitButton({
  action,
  hiddenFields,
  confirmMessage,
  label,
  className,
  icon,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  confirmMessage: string;
  label: string;
  className?: string;
  icon?: keyof typeof ICONES;
}) {
  const Icone = icon ? ICONES[icon] : null;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {Object.entries(hiddenFields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {Icone ? (
        <button type="submit" aria-label={label} data-tip={label} className="icon-btn icon-btn-danger">
          <Icone aria-hidden />
        </button>
      ) : (
        <button type="submit" className={className}>
          {label}
        </button>
      )}
    </form>
  );
}
