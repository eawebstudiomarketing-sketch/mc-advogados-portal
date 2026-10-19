import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/dal";

export default async function Home() {
  const profile = await getProfile();

  if (!profile) redirect((await getUser()) ? "/api/sair?motivo=sem-perfil" : "/login");
  redirect(profile.role === "client" ? "/dashboard" : "/admin");
}
