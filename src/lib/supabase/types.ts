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
      activities: {
        Row: {
          client_id: string
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          responsible_id: string
          status: Database["public"]["Enums"]["activity_status"]
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          responsible_id: string
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          responsible_id?: string
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
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
      clients: {
        Row: {
          active: boolean
          created_at: string
          documento: string
          email_contact: string
          id: string
          name: string
          plan_start_date: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          documento: string
          email_contact: string
          id?: string
          name: string
          plan_start_date?: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          documento?: string
          email_contact?: string
          id?: string
          name?: string
          plan_start_date?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
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
      documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          client_id: string
          created_at: string
          file_path: string
          id: string
          title: string
          uploaded_by: string
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          client_id: string
          created_at?: string
          file_path: string
          id?: string
          title: string
          uploaded_by: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          client_id?: string
          created_at?: string
          file_path?: string
          id?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
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
      onboardings: {
        Row: {
          answers: Json
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          pdf_url: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          updated_at?: string
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
          client_id: string
          created_at: string
          fase: string | null
          id: string
          numero_processo: string
          responsible_id: string | null
          status: string
          updated_at: string
          vara_tribunal: string | null
        }
        Insert: {
          area: Database["public"]["Enums"]["process_area"]
          client_id: string
          created_at?: string
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
          client_id?: string
          created_at?: string
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
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
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
      document_category:
        | "contrato"
        | "processo"
        | "financeiro"
        | "pessoal"
        | "outros"
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
      document_category: [
        "contrato",
        "processo",
        "financeiro",
        "pessoal",
        "outros",
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
