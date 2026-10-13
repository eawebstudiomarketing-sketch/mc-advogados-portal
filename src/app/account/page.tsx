import { requireProfile } from "@/lib/dal";
import { AccountForm } from "./account-form";
import { BackButton } from "@/components/nav/back-button";

export default async function AccountPage() {
  const profile = await requireProfile();
  const backHref = profile.role === "client" ? "/dashboard" : "/admin";

  return (
    <div className="mx-auto max-w-md py-8">
      <BackButton fallback={backHref} />

      <h1 className="mt-3 mb-6 page-title">Minha conta</h1>
      <p className="mb-4 text-sm text-muted">
        {profile.full_name} · {profile.email}
      </p>

      <AccountForm />
    </div>
  );
}
