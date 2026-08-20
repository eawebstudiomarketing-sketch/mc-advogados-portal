import Link from "next/link";
import { requireProfile } from "@/lib/dal";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const profile = await requireProfile();
  const backHref = profile.role === "client" ? "/dashboard" : "/admin";

  return (
    <div className="mx-auto max-w-md py-8">
      <Link href={backHref} className="text-xs font-medium text-navy hover:underline">
        ← Voltar
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Minha conta</h1>
      <p className="mb-4 text-sm text-foreground/50">
        {profile.full_name} · {profile.email}
      </p>

      <AccountForm />
    </div>
  );
}
