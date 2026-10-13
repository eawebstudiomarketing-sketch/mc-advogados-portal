import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Sobre o MC Advogados Portal",
  description: "Portal do escritório Maurício Cardoso Advocacia para acompanhamento de atividades, processos e documentos.",
};

export default function SobrePage() {
  return (
    <LegalPage title="MC Advogados Portal">
      <p>
        O <strong>MC Advogados Portal</strong> é o sistema do escritório <strong>Maurício Cardoso Advocacia</strong> (OAB-BA
        76.770), sediado em Teixeira de Freitas/BA. Ele reúne, em um só lugar, o atendimento e o acompanhamento dos clientes
        do escritório.
      </p>

      <LegalSection title="O que o portal faz">
        <ul className="list-disc space-y-1 pl-5">
          <li>Permite que o cliente acompanhe as atividades, os processos, os relatórios e os documentos do seu caso.</li>
          <li>Permite que a equipe do escritório organize atividades, processos, contratos e o atendimento de cada cliente.</li>
          <li>Guarda os documentos de cada cliente de forma organizada, com acesso restrito ao próprio cliente e à equipe.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Integração com o Google Drive">
        <p>
          O escritório pode conectar o portal ao seu Google Drive. Quando conectado, os documentos enviados pelo portal são
          guardados em uma pasta chamada <strong>&quot;Clientes MC&quot;</strong>, com uma subpasta para cada cliente. O portal
          pode importar e sincronizar os arquivos dessas pastas, mas só cria e altera o que ele mesmo criou. Os detalhes
          estão na{" "}
          <Link href="/privacidade" className="font-medium text-navy underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Acesso">
        <p>
          O portal é de uso restrito. O acesso é feito por convite do escritório, com e-mail e senha.{" "}
          <Link href="/login" className="font-medium text-navy underline">
            Entrar no portal
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Contato">
        <p>
          Maurício Cardoso Advocacia — Av. Padre Anchieta, nº 126, 2º andar, São Lourenço, Teixeira de Freitas/BA, CEP
          45.992-090. E-mail: mauriciocardosof.adv@gmail.com.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
