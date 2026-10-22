export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      andamentos: {
        Row: {
          acao: string | null
          acao_em: string | null
          acao_por: string | null
          id: string
          process_id: string
          data: string
          descricao: string
          tipo: string
          importante: boolean
          fonte: string
          externo_id: string | null
          situacao: "novo" | "tratado" | "descartado" | "historico"
          tratado_por: string | null
          tratado_em: string | null
          activity_id: string | null
          descricao_html: string | null
          responsavel_nome: string | null
          etiquetas: Json
          bruto: Json | null
          created_at: string
        }
        Insert: {
          acao?: string | null
          acao_em?: string | null
          acao_por?: string | null
          id?: string
          process_id: string
          data: string
          descricao: string
          tipo?: string
          importante?: boolean
          fonte?: string
          externo_id?: string | null
          situacao?: "novo" | "tratado" | "descartado" | "historico"
          tratado_por?: string | null
          tratado_em?: string | null
          activity_id?: string | null
          descricao_html?: string | null
          responsavel_nome?: string | null
          etiquetas?: Json
          bruto?: Json | null
          created_at?: string
        }
        Update: {
          acao?: string | null
          acao_em?: string | null
          acao_por?: string | null
          id?: string
          process_id?: string
          data?: string
          descricao?: string
          tipo?: string
          importante?: boolean
          fonte?: string
          externo_id?: string | null
          situacao?: "novo" | "tratado" | "descartado" | "historico"
          tratado_por?: string | null
          tratado_em?: string | null
          activity_id?: string | null
          descricao_html?: string | null
          responsavel_nome?: string | null
          etiquetas?: Json
          bruto?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "andamentos_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      andamentos_sync: {
        Row: { id: string; iniciado_em: string; origem: string; processos: number; novos: number; erro: string | null }
        Insert: { id?: string; iniciado_em?: string; origem?: string; processos?: number; novos?: number; erro?: string | null }
        Update: { id?: string; iniciado_em?: string; origem?: string; processos?: number; novos?: number; erro?: string | null }
        Relationships: []
      }
      activity_comments: {
        Row: { id: string; activity_id: string; autor_id: string; texto: string; mencoes: string[]; editado_em: string | null; created_at: string }
        Insert: { id?: string; activity_id: string; autor_id: string; texto: string; mencoes?: string[]; editado_em?: string | null; created_at?: string }
        Update: { id?: string; activity_id?: string; autor_id?: string; texto?: string; mencoes?: string[]; editado_em?: string | null; created_at?: string }
        Relationships: []
      }
      chat_mensagens: {
        Row: { id: string; conversa: string; autor_id: string; texto: string; created_at: string }
        Insert: { id?: string; conversa: string; autor_id: string; texto: string; created_at?: string }
        Update: { id?: string; conversa?: string; autor_id?: string; texto?: string; created_at?: string }
        Relationships: []
      }
      chat_leituras: {
        Row: { profile_id: string; conversa: string; lido_em: string }
        Insert: { profile_id: string; conversa: string; lido_em?: string }
        Update: { profile_id?: string; conversa?: string; lido_em?: string }
        Relationships: []
      }
      escritorio_config: {
        Row: {
          id: number
          areas: string[]
          lembrete_24h: string
          lembrete_1h: string
          lembretes_ativos: boolean
          rotina_ativa: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          areas?: string[]
          lembrete_24h?: string
          lembrete_1h?: string
          lembretes_ativos?: boolean
          rotina_ativa?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          areas?: string[]
          lembrete_24h?: string
          lembrete_1h?: string
          lembretes_ativos?: boolean
          rotina_ativa?: boolean
          updated_at?: string
        }
        Relationships: [
        ]
      }
      distribuicao: {
        Row: {
          publicacao_id: string | null
          id: string
          origem: string
          client_id: string | null
          titulo: string
          descricao: string | null
          area: string | null
          tipo: string | null
          prioridade: string
          prazo_sugerido: string | null
          responsavel_sugerido: string | null
          status: string
          activity_id: string | null
          chat_jid: string | null
          trechos: Json
          tratado_por: string | null
          tratado_em: string | null
          created_at: string
        }
        Insert: {
          publicacao_id?: string | null
          id?: string
          origem?: string
          client_id?: string | null
          titulo: string
          descricao?: string | null
          area?: string | null
          tipo?: string | null
          prioridade?: string
          prazo_sugerido?: string | null
          responsavel_sugerido?: string | null
          status?: string
          activity_id?: string | null
          chat_jid?: string | null
          trechos?: Json
          tratado_por?: string | null
          tratado_em?: string | null
          created_at?: string
        }
        Update: {
          publicacao_id?: string | null
          id?: string
          origem?: string
          client_id?: string | null
          titulo?: string
          descricao?: string | null
          area?: string | null
          tipo?: string | null
          prioridade?: string
          prazo_sugerido?: string | null
          responsavel_sugerido?: string | null
          status?: string
          activity_id?: string | null
          chat_jid?: string | null
          trechos?: Json
          tratado_por?: string | null
          tratado_em?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_publicacao_id_fkey"
            columns: ["publicacao_id"]
            isOneToOne: false
            referencedRelation: "publicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_responsavel_sugerido_fkey"
            columns: ["responsavel_sugerido"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos: {
        Row: {
          id: string
          titulo: string
          tipo: string
          inicio: string
          fim: string | null
          local: string | null
          descricao: string | null
          client_id: string | null
          participantes: string[]
          lembrar_cliente: boolean
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          titulo: string
          tipo?: string
          inicio: string
          fim?: string | null
          local?: string | null
          descricao?: string | null
          client_id?: string | null
          participantes?: string[]
          lembrar_cliente?: boolean
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          titulo?: string
          tipo?: string
          inicio?: string
          fim?: string | null
          local?: string | null
          descricao?: string | null
          client_id?: string | null
          participantes?: string[]
          lembrar_cliente?: boolean
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rotina_envios: {
        Row: {
          responsavel_id: string
          dia: string
          job_id: string | null
          created_at: string
        }
        Insert: {
          responsavel_id: string
          dia: string
          job_id?: string | null
          created_at?: string
        }
        Update: {
          responsavel_id?: string
          dia?: string
          job_id?: string | null
          created_at?: string
        }
        Relationships: [
        ]
      }
      avisos: {
        Row: { id: string; profile_id: string; tipo: string; titulo: string; corpo: string | null; url: string | null; lido_em: string | null; created_at: string }
        Insert: { id?: string; profile_id: string; tipo: string; titulo: string; corpo?: string | null; url?: string | null; lido_em?: string | null; created_at?: string }
        Update: { id?: string; profile_id?: string; tipo?: string; titulo?: string; corpo?: string | null; url?: string | null; lido_em?: string | null; created_at?: string }
        Relationships: []
      }
      wa_agent: {
        Row: {
          device_id: string
          label: string | null
          online: boolean
          numero: string | null
          qr: string | null
          estado: string
          ultimo_erro: string | null
          versao: string | null
          last_heartbeat: string | null
          updated_at: string
        }
        Insert: {
          device_id: string
          label?: string | null
          online?: boolean
          numero?: string | null
          qr?: string | null
          estado?: string
          ultimo_erro?: string | null
          versao?: string | null
          last_heartbeat?: string | null
          updated_at?: string
        }
        Update: {
          device_id?: string
          label?: string | null
          online?: boolean
          numero?: string | null
          qr?: string | null
          estado?: string
          ultimo_erro?: string | null
          versao?: string | null
          last_heartbeat?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wa_chats: {
        Row: {
          vinculo_auto: boolean
          demandas_lidas_ate: string | null
          chat_jid: string
          nome: string | null
          is_group: boolean
          foto_url: string | null
          client_id: string | null
          lead_id: string | null
          ler_demandas: boolean | null
          tipo_pessoa: string | null
          responsavel: string | null
          nao_lidas: number
          fixado: boolean
          silenciado: boolean
          arquivado: boolean
          ultima_msg_em: string | null
          ultima_msg_preview: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          vinculo_auto?: boolean
          demandas_lidas_ate?: string | null
          chat_jid: string
          nome?: string | null
          is_group?: boolean
          foto_url?: string | null
          client_id?: string | null
          lead_id?: string | null
          ler_demandas?: boolean | null
          tipo_pessoa?: string | null
          responsavel?: string | null
          nao_lidas?: number
          fixado?: boolean
          silenciado?: boolean
          arquivado?: boolean
          ultima_msg_em?: string | null
          ultima_msg_preview?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          vinculo_auto?: boolean
          demandas_lidas_ate?: string | null
          chat_jid?: string
          nome?: string | null
          is_group?: boolean
          foto_url?: string | null
          client_id?: string | null
          lead_id?: string | null
          ler_demandas?: boolean | null
          tipo_pessoa?: string | null
          responsavel?: string | null
          nao_lidas?: number
          fixado?: boolean
          silenciado?: boolean
          arquivado?: boolean
          ultima_msg_em?: string | null
          ultima_msg_preview?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          id: string
          chat_jid: string
          wa_id: string | null
          from_me: boolean
          sender_jid: string | null
          quem: string
          tipo: string
          texto: string | null
          media_path: string | null
          media_mime: string | null
          media_nome: string | null
          status: string
          erro: string | null
          job_id: string | null
          raw: Json | null
          resposta_a: string | null
          resposta_texto: string | null
          resposta_de: string | null
          reacoes: Json
          encaminhada: boolean
          sender_nome: string | null
          wa_timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_jid: string
          wa_id?: string | null
          from_me?: boolean
          sender_jid?: string | null
          quem?: string
          tipo?: string
          texto?: string | null
          media_path?: string | null
          media_mime?: string | null
          media_nome?: string | null
          status?: string
          erro?: string | null
          job_id?: string | null
          raw?: Json | null
          resposta_a?: string | null
          resposta_texto?: string | null
          resposta_de?: string | null
          reacoes?: Json
          encaminhada?: boolean
          sender_nome?: string | null
          wa_timestamp?: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_jid?: string
          wa_id?: string | null
          from_me?: boolean
          sender_jid?: string | null
          quem?: string
          tipo?: string
          texto?: string | null
          media_path?: string | null
          media_mime?: string | null
          media_nome?: string | null
          status?: string
          erro?: string | null
          job_id?: string | null
          raw?: Json | null
          resposta_a?: string | null
          resposta_texto?: string | null
          resposta_de?: string | null
          reacoes?: Json
          encaminhada?: boolean
          sender_nome?: string | null
          wa_timestamp?: string
          created_at?: string
        }
        Relationships: []
      }
      wa_jobs: {
        Row: {
          origem_ref: string | null
          id: string
          tipo: string
          payload: Json
          status: string
          resultado: Json | null
          erro: string | null
          chat_jid: string | null
          criado_por: string | null
          tentativas: number
          agendado_para: string | null
          iniciado_em: string | null
          concluido_em: string | null
          created_at: string
        }
        Insert: {
          origem_ref?: string | null
          id?: string
          tipo: string
          payload?: Json
          status?: string
          resultado?: Json | null
          erro?: string | null
          chat_jid?: string | null
          criado_por?: string | null
          tentativas?: number
          agendado_para?: string | null
          iniciado_em?: string | null
          concluido_em?: string | null
          created_at?: string
        }
        Update: {
          origem_ref?: string | null
          id?: string
          tipo?: string
          payload?: Json
          status?: string
          resultado?: Json | null
          erro?: string | null
          chat_jid?: string | null
          criado_por?: string | null
          tentativas?: number
          agendado_para?: string | null
          iniciado_em?: string | null
          concluido_em?: string | null
          created_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          nome: string | null
          telefone: string | null
          chat_jid: string | null
          origem: string
          status: string
          area: string | null
          resumo: string | null
          score: number | null
          responsavel: string | null
          client_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome?: string | null
          telefone?: string | null
          chat_jid?: string | null
          origem?: string
          status?: string
          area?: string | null
          resumo?: string | null
          score?: number | null
          responsavel?: string | null
          client_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string | null
          telefone?: string | null
          chat_jid?: string | null
          origem?: string
          status?: string
          area?: string | null
          resumo?: string | null
          score?: number | null
          responsavel?: string | null
          client_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_inscricoes: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          aparelho: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          aparelho?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          aparelho?: string | null
          created_at?: string
        }
        Relationships: []
      }
      publicacoes: {
        Row: {
          alerta_descartado_em: string | null
          etiquetas: Json
          sugestao_incorreta: boolean
          id: string
          fonte: string
          astrea_id: string | null
          diario: string | null
          nome_pesquisado: string | null
          responsavel_nome: string | null
          titulo_processo: string | null
          data_publicacao: string | null
          texto_html: string | null
          bruto: Json | null
          comunicacao_id: number | null
          numero_processo: string
          numero_mascara: string | null
          tribunal: string | null
          orgao: string | null
          tipo_comunicacao: string | null
          tipo_documento: string | null
          classe: string | null
          meio: string | null
          data_disponibilizacao: string
          texto: string | null
          link: string | null
          partes: Json
          advogados: Json
          termo: string | null
          uf: string | null
          process_id: string | null
          client_id: string | null
          status: string
          tratada_por: string | null
          tratada_em: string | null
          activity_id: string | null
          avisada_em: string | null
          created_at: string
          sugestoes_tipos: string[]
          sugestao_aceita: string | null
        }
        Insert: {
          alerta_descartado_em?: string | null
          etiquetas?: Json
          sugestao_incorreta?: boolean
          id?: string
          fonte?: string
          astrea_id?: string | null
          diario?: string | null
          nome_pesquisado?: string | null
          responsavel_nome?: string | null
          titulo_processo?: string | null
          data_publicacao?: string | null
          texto_html?: string | null
          bruto?: Json | null
          comunicacao_id?: number | null
          numero_processo: string
          numero_mascara?: string | null
          tribunal?: string | null
          orgao?: string | null
          tipo_comunicacao?: string | null
          tipo_documento?: string | null
          classe?: string | null
          meio?: string | null
          data_disponibilizacao: string
          texto?: string | null
          link?: string | null
          partes?: Json
          advogados?: Json
          termo?: string | null
          uf?: string | null
          process_id?: string | null
          client_id?: string | null
          status?: string
          tratada_por?: string | null
          tratada_em?: string | null
          activity_id?: string | null
          avisada_em?: string | null
          created_at?: string
          sugestoes_tipos?: string[]
          sugestao_aceita?: string | null
        }
        Update: {
          alerta_descartado_em?: string | null
          etiquetas?: Json
          sugestao_incorreta?: boolean
          id?: string
          fonte?: string
          astrea_id?: string | null
          diario?: string | null
          nome_pesquisado?: string | null
          responsavel_nome?: string | null
          titulo_processo?: string | null
          data_publicacao?: string | null
          texto_html?: string | null
          bruto?: Json | null
          comunicacao_id?: number | null
          numero_processo?: string
          numero_mascara?: string | null
          tribunal?: string | null
          orgao?: string | null
          tipo_comunicacao?: string | null
          tipo_documento?: string | null
          classe?: string | null
          meio?: string | null
          data_disponibilizacao?: string
          texto?: string | null
          link?: string | null
          partes?: Json
          advogados?: Json
          termo?: string | null
          uf?: string | null
          process_id?: string | null
          client_id?: string | null
          status?: string
          tratada_por?: string | null
          tratada_em?: string | null
          activity_id?: string | null
          avisada_em?: string | null
          created_at?: string
          sugestoes_tipos?: string[]
          sugestao_aceita?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publicacoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicacoes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_oabs: {
        Row: {
          id: string
          numero: string
          uf: string
          nome: string | null
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          numero: string
          uf: string
          nome?: string | null
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          numero?: string
          uf?: string
          nome?: string | null
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      monitor_config: {
        Row: {
          id: number
          email_alerta: string | null
          updated_at: string
          inpi_procuradores: string[]
          inpi_ultima_revista: number | null
        }
        Insert: {
          id?: number
          email_alerta?: string | null
          updated_at?: string
          inpi_procuradores?: string[]
          inpi_ultima_revista?: number | null
        }
        Update: {
          id?: number
          email_alerta?: string | null
          updated_at?: string
          inpi_procuradores?: string[]
          inpi_ultima_revista?: number | null
        }
        Relationships: []
      }
      monitor_execucoes: {
        Row: {
          id: string
          iniciado_em: string
          origem: string
          encontradas: number
          novas: number
          erro: string | null
        }
        Insert: {
          id?: string
          iniciado_em?: string
          origem?: string
          encontradas?: number
          novas?: number
          erro?: string | null
        }
        Update: {
          id?: string
          iniciado_em?: string
          origem?: string
          encontradas?: number
          novas?: number
          erro?: string | null
        }
        Relationships: []
      }
      activity_deadline_alerts: {
        Row: {
          activity_id: string
          deadline: string
          id: string
          sent_at: string
          sent_to: string
          tipo: string
        }
        Insert: {
          activity_id: string
          deadline: string
          id?: string
          sent_at?: string
          sent_to: string
          tipo: string
        }
        Update: {
          activity_id?: string
          deadline?: string
          id?: string
          sent_at?: string
          sent_to?: string
          tipo?: string
        }
        Relationships: []
      }
      alerta_comentarios: {
        Row: { id: string; andamento_id: string | null; publicacao_id: string | null; autor_id: string | null; autor_nome: string | null; texto: string; created_at: string }
        Insert: { id?: string; andamento_id?: string | null; publicacao_id?: string | null; autor_id?: string | null; autor_nome?: string | null; texto: string; created_at?: string }
        Update: { id?: string; andamento_id?: string | null; publicacao_id?: string | null; autor_id?: string | null; autor_nome?: string | null; texto?: string; created_at?: string }
        Relationships: []
      }
      etiquetas: {
        Row: { id: string; nome: string; cor: string; created_at: string }
        Insert: { id?: string; nome: string; cor?: string; created_at?: string }
        Update: { id?: string; nome?: string; cor?: string; created_at?: string }
        Relationships: []
      }
      activities: {
        Row: {
          area: string | null
          concluida_em: string | null
          client_id: string
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          responsible_id: string
          responsavel_id: string | null
          envolvidos: string[]
          etiquetas: string[]
          status: Database["public"]["Enums"]["activity_status"]
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          archived_at: string | null
          categoria: string
          hora: string | null
        }
        Insert: {
          area?: string | null
          concluida_em?: string | null
          client_id: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          responsible_id: string
          responsavel_id?: string | null
          envolvidos?: string[]
          etiquetas?: string[]
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          archived_at?: string | null
          categoria?: string
          hora?: string | null
        }
        Update: {
          area?: string | null
          concluida_em?: string | null
          client_id?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          responsible_id?: string
          responsavel_id?: string | null
          envolvidos?: string[]
          etiquetas?: string[]
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          archived_at?: string | null
          categoria?: string
          hora?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_handoffs: {
        Row: {
          client_id: string
          handoff: Json | null
          handoff_updated_at: string | null
          triagem: string | null
          triagem_updated_at: string | null
        }
        Insert: {
          client_id: string
          handoff?: Json | null
          handoff_updated_at?: string | null
          triagem?: string | null
          triagem_updated_at?: string | null
        }
        Update: {
          client_id?: string
          handoff?: Json | null
          handoff_updated_at?: string | null
          triagem?: string | null
          triagem_updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          whatsapp_grupos: string[]
          whatsapp_numeros: string[]
          active: boolean
          drive_folder_id: string | null
          drive_import_folder_ids: string[]
          drive_last_sync_at: string | null
          created_at: string
          documento: string
          email_contact: string
          id: string
          name: string
          plan_start_date: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at: string
          triagem: string | null
          triagem_updated_at: string | null
          handoff: Json | null
          handoff_updated_at: string | null
          archived_at: string | null
        }
        Insert: {
          whatsapp_grupos?: string[]
          whatsapp_numeros?: string[]
          active?: boolean
          drive_folder_id?: string | null
          drive_import_folder_ids?: string[]
          drive_last_sync_at?: string | null
          created_at?: string
          documento: string
          email_contact: string
          id?: string
          name: string
          plan_start_date?: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
          triagem?: string | null
          triagem_updated_at?: string | null
          handoff?: Json | null
          handoff_updated_at?: string | null
          archived_at?: string | null
        }
        Update: {
          whatsapp_grupos?: string[]
          whatsapp_numeros?: string[]
          active?: boolean
          drive_folder_id?: string | null
          drive_import_folder_ids?: string[]
          drive_last_sync_at?: string | null
          created_at?: string
          documento?: string
          email_contact?: string
          id?: string
          name?: string
          plan_start_date?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
          triagem?: string | null
          triagem_updated_at?: string | null
          handoff?: Json | null
          handoff_updated_at?: string | null
          archived_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_connection: {
        Row: {
          account_email: string
          connected_at: string
          connected_by: string | null
          id: boolean
          refresh_token: string
          root_folder_id: string
        }
        Insert: {
          account_email: string
          connected_at?: string
          connected_by?: string | null
          id?: boolean
          refresh_token: string
          root_folder_id: string
        }
        Update: {
          account_email?: string
          connected_at?: string
          connected_by?: string | null
          id?: boolean
          refresh_token?: string
          root_folder_id?: string
        }
        Relationships: []
      }
      drive_sync_runs: {
        Row: {
          clients_pending: number
          clients_synced: number
          exported: number
          failed: number
          finished_at: string | null
          id: string
          imported: number
          note: string | null
          started_at: string
        }
        Insert: {
          clients_pending?: number
          clients_synced?: number
          exported?: number
          failed?: number
          finished_at?: string | null
          id?: string
          imported?: number
          note?: string | null
          started_at?: string
        }
        Update: {
          clients_pending?: number
          clients_synced?: number
          exported?: number
          failed?: number
          finished_at?: string | null
          id?: string
          imported?: number
          note?: string | null
          started_at?: string
        }
        Relationships: []
      }
      documents_trash: {
        Row: {
          batch_id: string
          client_id: string
          data: Json
          deleted_at: string
          deleted_by: string | null
          id: string
          meta: Json | null
          reason: string
          title: string
        }
        Insert: {
          batch_id: string
          client_id: string
          data: Json
          deleted_at?: string
          deleted_by?: string | null
          id: string
          meta?: Json | null
          reason: string
          title: string
        }
        Update: {
          batch_id?: string
          client_id?: string
          data?: Json
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          meta?: Json | null
          reason?: string
          title?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          activity_id: string | null
          category: Database["public"]["Enums"]["document_category"]
          client_id: string
          created_at: string
          drive_file_id: string | null
          legacy_file_path: string | null
          file_path: string
          id: string
          process_id: string | null
          title: string
          uploaded_by: string
          meeting_date: string | null
          requested_item: string | null
        }
        Insert: {
          activity_id?: string | null
          category: Database["public"]["Enums"]["document_category"]
          client_id: string
          created_at?: string
          drive_file_id?: string | null
          file_path: string
          id?: string
          process_id?: string | null
          title: string
          uploaded_by: string
          legacy_file_path?: string | null
          meeting_date?: string | null
          requested_item?: string | null
        }
        Update: {
          activity_id?: string | null
          category?: Database["public"]["Enums"]["document_category"]
          client_id?: string
          created_at?: string
          drive_file_id?: string | null
          file_path?: string
          id?: string
          process_id?: string | null
          title?: string
          uploaded_by?: string
          legacy_file_path?: string | null
          meeting_date?: string | null
          requested_item?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_notifications: {
        Row: {
          financial_record_id: string
          id: string
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          financial_record_id: string
          id?: string
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          financial_record_id?: string
          id?: string
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_notifications_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          paid_at: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["financial_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["financial_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["financial_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          client_id: string
          drive_file_id: string | null
          created_at: string
          id: string
          pdf_url: string | null
          reference_month: number
          reference_year: number
          sent_at: string | null
          sent_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          reference_month: number
          reference_year: number
          sent_at?: string | null
          sent_by?: string | null
          drive_file_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          reference_month?: number
          reference_year?: number
          sent_at?: string | null
          sent_by?: string | null
          drive_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_demand_drafts: {
        Row: {
          area: string | null
          action: string
          activity_id: string | null
          activity_type: Database["public"]["Enums"]["activity_type"]
          client_id: string
          created_at: string
          deadline: string | null
          id: string
          next_step: string
          onboarding_id: string | null
          position: number
          priority: Database["public"]["Enums"]["demand_priority"]
          reason: string
          status: Database["public"]["Enums"]["demand_draft_status"]
          title: string
          updated_at: string
          sources: Json
          instructions: string | null
          responsavel_id: string | null
        }
        Insert: {
          area?: string | null
          responsavel_id?: string | null
          action?: string
          activity_id?: string | null
          activity_type?: Database["public"]["Enums"]["activity_type"]
          client_id: string
          created_at?: string
          deadline?: string | null
          id?: string
          next_step?: string
          onboarding_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["demand_priority"]
          reason?: string
          status?: Database["public"]["Enums"]["demand_draft_status"]
          title: string
          updated_at?: string
          sources?: Json
          instructions?: string | null
        }
        Update: {
          area?: string | null
          responsavel_id?: string | null
          action?: string
          activity_id?: string | null
          activity_type?: Database["public"]["Enums"]["activity_type"]
          client_id?: string
          created_at?: string
          deadline?: string | null
          id?: string
          next_step?: string
          onboarding_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["demand_priority"]
          reason?: string
          status?: Database["public"]["Enums"]["demand_draft_status"]
          title?: string
          updated_at?: string
          sources?: Json
          instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_demand_drafts_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboardings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_demand_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_demand_drafts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      responsaveis: {
        Row: {
          foto_url: string | null
          telefone: string | null
          areas: string[]
          rotina_zap: boolean
          created_at: string
          email: string
          id: string
          nome: string
          profile_id: string | null
        }
        Insert: {
          foto_url?: string | null
          telefone?: string | null
          areas?: string[]
          rotina_zap?: boolean
          created_at?: string
          email: string
          id?: string
          nome: string
          profile_id?: string | null
        }
        Update: {
          foto_url?: string | null
          telefone?: string | null
          areas?: string[]
          rotina_zap?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          profile_id?: string | null
        }
        Relationships: []
      }
      onboarding_perguntas_modelo: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          stage_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          stage_id: string
          texto: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          stage_id?: string
          texto?: string
        }
        Relationships: []
      }
      equipe_clientes: {
        Row: {
          client_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: []
      }
      equipe_permissoes: {
        Row: {
          permissoes: Json
          profile_id: string
          updated_at: string
        }
        Insert: {
          permissoes?: Json
          profile_id: string
          updated_at?: string
        }
        Update: {
          permissoes?: Json
          profile_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboardings: {
        Row: {
          answers: Json
          client_id: string
          created_at: string
          created_by: string | null
          drive_file_id: string | null
          id: string
          pdf_url: string | null
          updated_at: string
          questions: Json | null
        }
        Insert: {
          answers?: Json
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          updated_at?: string
          drive_file_id?: string | null
          questions?: Json | null
        }
        Update: {
          answers?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          updated_at?: string
          drive_file_id?: string | null
          questions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "onboardings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          area: Database["public"]["Enums"]["process_area"]
          client_id: string | null
          created_at: string
          astrea_id: string | null
          titulo: string | null
          cliente_nome: string | null
          classe: string | null
          partes: Json
          valor_causa: number | null
          distribuido_em: string | null
          instancia: number | null
          responsavel_nome: string | null
          ultimo_andamento_em: string | null
          fonte: string
          fase: string | null
          id: string
          numero_processo: string
          numero_digitos: string | null
          responsible_id: string | null
          status: string
          updated_at: string
          vara_tribunal: string | null
        }
        Insert: {
          area: Database["public"]["Enums"]["process_area"]
          client_id?: string | null
          created_at?: string
          astrea_id?: string | null
          titulo?: string | null
          cliente_nome?: string | null
          classe?: string | null
          partes?: Json
          valor_causa?: number | null
          distribuido_em?: string | null
          instancia?: number | null
          responsavel_nome?: string | null
          ultimo_andamento_em?: string | null
          fonte?: string
          fase?: string | null
          id?: string
          numero_processo: string
          responsible_id?: string | null
          status?: string
          updated_at?: string
          vara_tribunal?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["process_area"]
          client_id?: string | null
          created_at?: string
          astrea_id?: string | null
          titulo?: string | null
          cliente_nome?: string | null
          classe?: string | null
          partes?: Json
          valor_causa?: number | null
          distribuido_em?: string | null
          instancia?: number | null
          responsavel_nome?: string | null
          ultimo_andamento_em?: string | null
          fonte?: string
          fase?: string | null
          id?: string
          numero_processo?: string
          responsible_id?: string | null
          status?: string
          updated_at?: string
          vara_tribunal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          ativo: boolean
          oculto: boolean
          super_admin: boolean
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          ativo?: boolean
          oculto?: boolean
          super_admin?: boolean
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          ativo?: boolean
          oculto?: boolean
          super_admin?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          advogado_id: string
          billable: boolean
          client_id: string
          created_at: string
          date: string
          description: string
          hours: number
          id: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          advogado_id: string
          billable?: boolean
          client_id: string
          created_at?: string
          date: string
          description: string
          hours: number
          id?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          advogado_id?: string
          billable?: boolean
          client_id?: string
          created_at?: string
          date?: string
          description?: string
          hours?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_advogado_id_fkey"
            columns: ["advogado_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      restore_documents: {
        Args: { p_batch: string }
        Returns: { restored: number; skipped: number }[]
      }
      trash_documents: {
        Args: { p_ids: string[]; p_reason: string; p_by: string | null; p_meta?: Json | null }
        Returns: { batch_id: string; removed: number }[]
      }
      current_profile_id: { Args: never; Returns: string }
      current_user_client_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      activity_status: "aberta" | "em_andamento" | "concluida" | "cancelada"
      activity_type:
        | "consultoria"
        | "processo"
        | "contrato"
        | "reuniao"
        | "pesquisa"
      contract_status: "active" | "expired" | "cancelled"
      demand_draft_status: "rascunho" | "aprovada" | "descartada"
      demand_priority: "alta" | "media" | "baixa"
      document_category:
        | "contrato"
        | "processo"
        | "financeiro"
        | "pessoal"
        | "outros"
        | "ata"
      financial_status: "pending" | "paid" | "overdue" | "cancelled"
      process_area:
        | "trabalhista"
        | "consumidor"
        | "previdenciario"
        | "civel"
        | "empresarial"
      tipo_pessoa: "PF" | "PJ"
      user_role: "client" | "advogado" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_status: ["aberta", "em_andamento", "concluida", "cancelada"],
      activity_type: [
        "consultoria",
        "processo",
        "contrato",
        "reuniao",
        "pesquisa",
      ],
      contract_status: ["active", "expired", "cancelled"],
      demand_draft_status: ["rascunho", "aprovada", "descartada"],
      demand_priority: ["alta", "media", "baixa"],
      document_category: [
        "contrato",
        "processo",
        "financeiro",
        "pessoal",
        "outros",
        "ata",
      ],
      financial_status: ["pending", "paid", "overdue", "cancelled"],
      process_area: [
        "trabalhista",
        "consumidor",
        "previdenciario",
        "civel",
        "empresarial",
      ],
      tipo_pessoa: ["PF", "PJ"],
      user_role: ["client", "advogado", "admin"],
    },
  },
} as const
