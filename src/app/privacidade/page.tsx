import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Política de Privacidade — MC Advogados Portal",
  description: "Como o MC Advogados Portal trata dados pessoais e as informações obtidas do Google Drive.",
};

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="25 de setembro de 2026">
      <p>
        Esta política explica como o <strong>MC Advogados Portal</strong> (&quot;portal&quot;) trata dados pessoais, em
        conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com o sigilo profissional da advocacia.
      </p>

      <LegalSection title="1. Quem é o responsável">
        <p>
          O responsável pelo tratamento dos dados é <strong>Maurício Oliveira Cardoso Filho</strong>, advogado (OAB-BA
          76.770), com escritório na Av. Padre Anchieta, nº 126, 2º andar, São Lourenço, Teixeira de Freitas/BA, CEP 45.992-090.
          Contato: mauriciocardosof.adv@gmail.com.
        </p>
      </LegalSection>

      <LegalSection title="2. Quais dados tratamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Dados de cadastro:</strong> nome, e-mail, telefone e número de documento (CPF ou CNPJ) dos clientes e da
            equipe.
          </li>
          <li>
            <strong>Dados do atendimento jurídico:</strong> atividades, processos, contratos, relatórios, informações
            financeiras do atendimento e os documentos enviados ao portal.
          </li>
          <li>
            <strong>Dados de acesso:</strong> e-mail e senha (armazenada de forma protegida) e registros técnicos de acesso.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para que usamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Prestar os serviços advocatícios contratados e permitir que o cliente acompanhe o seu caso.</li>
          <li>Organizar o trabalho da equipe e a comunicação com o cliente.</li>
          <li>Cumprir obrigações legais e regulatórias e exercer direitos em processos judiciais ou administrativos.</li>
        </ul>
        <p>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>
      </LegalSection>

      <LegalSection title="4. Integração com o Google Drive">
        <p>
          O escritório pode conectar o portal a uma conta do Google Drive para guardar os documentos dos clientes. Essa conexão
          é feita por uma autorização única da pessoa responsável pela conta, que pode ser revogada a qualquer momento.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Permissões solicitadas:</strong> <code>drive.readonly</code> (leitura dos arquivos do Drive, usada para
            importar e sincronizar os documentos que a equipe coloca nas pastas dos clientes), <code>drive.file</code>
            (criação e alteração apenas dos arquivos e pastas criados pelo próprio portal) e <code>userinfo.email</code>{" "}
            (para identificar qual conta foi conectada).
          </li>
          <li>
            <strong>O que o portal faz:</strong> cria a pasta &quot;Clientes MC&quot; e uma subpasta por cliente, envia os
            documentos enviados pelo portal para essas pastas, lista os arquivos dessas pastas para que a equipe os importe
            ou sincronize com o cadastro do cliente e os entrega ao cliente e à equipe quando solicitados. A sincronização também acontece automaticamente, uma vez por noite, e os relatórios e onboardings em PDF gerados pelo portal são copiados para a pasta do cliente. A equipe
            (administradores) também pode escolher outras pastas já existentes no Drive para importá-las e ligá-las a um
            cliente. O portal lê apenas o conteúdo das pastas dos clientes e das pastas que a equipe escolher, somente quando
            esses recursos são usados, e <strong>nunca altera nem apaga</strong> arquivos que ele não tenha criado.
          </li>
          <li>
            <strong>Como a autorização é guardada:</strong> o token de acesso fica armazenado apenas no servidor do portal, sem
            exposição ao navegador e sem acesso direto pelos usuários.
          </li>
          <li>
            <strong>Uso limitado:</strong> os dados obtidos do Google são usados somente para oferecer essa funcionalidade
            (guardar e recuperar os documentos), não são vendidos, não são usados para publicidade e não são transferidos a
            terceiros, salvo quando necessário para a prestação do serviço, por exigência legal ou com autorização do titular.
          </li>
        </ul>
        <p>
          O uso e a transferência, para qualquer outro aplicativo, das informações recebidas das APIs do Google pelo MC
          Advogados Portal seguirão a{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="font-medium text-navy underline"
            target="_blank"
            rel="noreferrer"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado.
        </p>
        <p>
          Para revogar o acesso, desconecte a integração em <em>Integrações</em> no portal ou remova o acesso em{" "}
          <a href="https://myaccount.google.com/permissions" className="font-medium text-navy underline" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="5. Com quem compartilhamos">
        <p>
          Os dados ficam acessíveis apenas ao próprio cliente e à equipe do escritório. Para funcionar, o portal usa
          prestadores de tecnologia que tratam dados em nosso nome: hospedagem (Vercel), banco de dados e armazenamento de
          arquivos (Supabase), envio de e-mails (Resend) e, quando conectado, o Google Drive. Também podemos compartilhar dados
          quando exigido por lei ou por ordem de autoridade competente.
        </p>
      </LegalSection>

      <LegalSection title="6. Segurança e sigilo">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados: acesso por login, separação entre o que cada
          cliente pode ver, comunicação criptografada (HTTPS) e armazenamento de credenciais apenas no servidor. Os dados dos
          clientes estão protegidos, além disso, pelo sigilo profissional da advocacia.
        </p>
      </LegalSection>

      <LegalSection title="7. Por quanto tempo guardamos">
        <p>
          Guardamos os dados enquanto durar a relação com o cliente e pelo prazo necessário para cumprir obrigações legais e
          exercer direitos em processos. Depois disso, os dados são eliminados ou anonimizados, respeitadas as exigências legais
          de guarda.
        </p>
      </LegalSection>

      <LegalSection title="8. Seus direitos">
        <p>
          Nos termos da LGPD, o titular pode solicitar confirmação do tratamento, acesso, correção, anonimização, portabilidade
          ou eliminação de dados, informação sobre compartilhamento e a revogação de consentimento, quando aplicável. Para
          exercer esses direitos, escreva para mauriciocardosof.adv@gmail.com.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações desta política">
        <p>
          Esta política pode ser atualizada. A data da última atualização está indicada no topo desta página.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
