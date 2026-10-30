import { ehSuperAdmin, requireProfile } from "@/lib/dal";
import { NotificacoesForm } from "./notificacoes-form";
import { preferenciasDaPessoa } from "@/lib/notificacoes";
import { TIPOS_AVISO } from "@/lib/notificacoes-tipos";
import { AccountForm } from "./account-form";
import { BackButton } from "@/components/nav/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { FotoPerfil } from "@/components/ui/foto-perfil";

export default async function AccountPage() {
  const profile = await requireProfile();
  const backHref = profile.role === "client" ? "/dashboard" : "/admin";
  // foto de perfil: só a equipe (aparece no ranking, nas atividades e na agenda)
  const { data: eu } =
    profile.role === "client"
      ? { data: null }
      : await createAdminClient().from("responsaveis").select("id, foto_url").eq("profile_id", profile.id).maybeSingle();

  return (
    <div className="mx-auto max-w-xl py-8">
      <BackButton fallback={backHref} />

      <h1 className="mt-3 mb-6 page-title">Minha conta</h1>
      <div className="mb-6 flex items-center gap-4">
        {eu && <FotoPerfil responsavelId={eu.id} nome={profile.full_name} foto={eu.foto_url} tamanho={64} />}
        <div className="min-w-0">
          <p className="font-medium text-foreground">{profile.full_name}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          {eu && <p className="mt-1 text-xs text-muted">Toque na foto para trocar.</p>}
        </div>
      </div>

      <div className="max-w-md">
        <AccountForm />
      </div>

      {profile.role !== "client" && (
        <div className="mt-10">
          <NotificacoesForm tipos={TIPOS_AVISO.filter((t) => !t.soSuper || ehSuperAdmin(profile))} inicial={Object.fromEntries(await preferenciasDaPessoa(profile.id))} />
        </div>
      )}
    </div>
  );
}
