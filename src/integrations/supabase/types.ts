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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          branch: Database["public"]["Enums"]["branch"] | null
          created_at: string
          id: string
          password_hash: string
          role: Database["public"]["Enums"]["user_role"]
          staff_name: string | null
          username: string
        }
        Insert: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          id?: string
          password_hash: string
          role: Database["public"]["Enums"]["user_role"]
          staff_name?: string | null
          username: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          id?: string
          password_hash?: string
          role?: Database["public"]["Enums"]["user_role"]
          staff_name?: string | null
          username?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          branch: Database["public"]["Enums"]["branch"]
          client_name: string
          created_at: string
          discount_applied: number
          id: string
          is_member: boolean
          payment_status: string
          phone: string
          price: number
          razorpay_order_id: string | null
          service: string
          special_requests: string | null
          staff_name: string
          time_slot: string
        }
        Insert: {
          appointment_date: string
          branch: Database["public"]["Enums"]["branch"]
          client_name: string
          created_at?: string
          discount_applied?: number
          id?: string
          is_member?: boolean
          payment_status?: string
          phone: string
          price: number
          razorpay_order_id?: string | null
          service: string
          special_requests?: string | null
          staff_name: string
          time_slot: string
        }
        Update: {
          appointment_date?: string
          branch?: Database["public"]["Enums"]["branch"]
          client_name?: string
          created_at?: string
          discount_applied?: number
          id?: string
          is_member?: boolean
          payment_status?: string
          phone?: string
          price?: number
          razorpay_order_id?: string | null
          service?: string
          special_requests?: string | null
          staff_name?: string
          time_slot?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          active: boolean
          amount_paid: number
          client_name: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          start_date: string
        }
        Insert: {
          active?: boolean
          amount_paid?: number
          client_name: string
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          start_date?: string
        }
        Update: {
          active?: boolean
          amount_paid?: number
          client_name?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          start_date?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          client_name: string | null
          created_at: string
          currency: string
          id: string
          membership_id: string | null
          metadata: Json | null
          phone: string | null
          purpose: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          phone?: string | null
          purpose: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          phone?: string | null
          purpose?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          branch: Database["public"]["Enums"]["branch"]
          created_at: string
          id: string
          name: string
        }
        Insert: {
          branch: Database["public"]["Enums"]["branch"]
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"]
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      branch: "Vile Parle" | "Bandra" | "Kandivali"
      user_role: "admin" | "manager" | "staff"
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
      branch: ["Vile Parle", "Bandra", "Kandivali"],
      user_role: ["admin", "manager", "staff"],
    },
  },
} as const
