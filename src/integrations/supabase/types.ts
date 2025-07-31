export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          fingerprint_visitor_id: string | null
          id: string
          ip_address: unknown | null
          ip_location: Json | null
          issued_at: string | null
          last_accessed: string | null
          precise_location: Json | null
          session_id: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          token: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          fingerprint_visitor_id?: string | null
          id?: string
          ip_address?: unknown | null
          ip_location?: Json | null
          issued_at?: string | null
          last_accessed?: string | null
          precise_location?: Json | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          token?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          fingerprint_visitor_id?: string | null
          id?: string
          ip_address?: unknown | null
          ip_location?: Json | null
          issued_at?: string | null
          last_accessed?: string | null
          precise_location?: Json | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          token?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_verifications: {
        Row: {
          auth_flow_type: Database["public"]["Enums"]["auth_flow_type"]
          created_at: string | null
          current_step: Database["public"]["Enums"]["verification_step"]
          expected_otp: string | null
          expires_at: string | null
          fingerprint_data_at_credentials: Json | null
          fingerprint_data_at_otp_request: Json | null
          id: string
          ip_address_at_credentials: unknown | null
          ip_address_at_otp_request: unknown | null
          phone_number: string
          precise_location_at_credentials: Json | null
          precise_location_at_otp_request: Json | null
          user_id: string | null
          username: string | null
          verification_token: string | null
        }
        Insert: {
          auth_flow_type: Database["public"]["Enums"]["auth_flow_type"]
          created_at?: string | null
          current_step: Database["public"]["Enums"]["verification_step"]
          expected_otp?: string | null
          expires_at?: string | null
          fingerprint_data_at_credentials?: Json | null
          fingerprint_data_at_otp_request?: Json | null
          id?: string
          ip_address_at_credentials?: unknown | null
          ip_address_at_otp_request?: unknown | null
          phone_number: string
          precise_location_at_credentials?: Json | null
          precise_location_at_otp_request?: Json | null
          user_id?: string | null
          username?: string | null
          verification_token?: string | null
        }
        Update: {
          auth_flow_type?: Database["public"]["Enums"]["auth_flow_type"]
          created_at?: string | null
          current_step?: Database["public"]["Enums"]["verification_step"]
          expected_otp?: string | null
          expires_at?: string | null
          fingerprint_data_at_credentials?: Json | null
          fingerprint_data_at_otp_request?: Json | null
          id?: string
          ip_address_at_credentials?: unknown | null
          ip_address_at_otp_request?: unknown | null
          phone_number?: string
          precise_location_at_credentials?: Json | null
          precise_location_at_otp_request?: Json | null
          user_id?: string | null
          username?: string | null
          verification_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          enrolled_face_template: string | null
          id: string
          phone_number: string
          trusted_visitor_ids: string[] | null
          updated_at: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          enrolled_face_template?: string | null
          id?: string
          phone_number: string
          trusted_visitor_ids?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          enrolled_face_template?: string | null
          id?: string
          phone_number?: string
          trusted_visitor_ids?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_expired_verifications: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      auth_flow_type: "login" | "signup"
      session_status: "active" | "revoked"
      verification_step: "credentials" | "signupDetails" | "otp" | "face"
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
      auth_flow_type: ["login", "signup"],
      session_status: ["active", "revoked"],
      verification_step: ["credentials", "signupDetails", "otp", "face"],
    },
  },
} as const
