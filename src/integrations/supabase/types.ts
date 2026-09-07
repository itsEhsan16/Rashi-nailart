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
          amount: number
          appointment_date: string
          branch: Database["public"]["Enums"]["branch"]
          cashfree_order_id: string | null
          cf_payment_id: string | null
          client_name: string
          completed: boolean
          completed_at: string | null
          created_at: string
          discount_applied: number
          id: string
          is_member: boolean
          original_staff_name: string | null
          paid_at: string | null
          payment_method: string | null
          payment_mode: string | null
          payment_status: string
          phone: string
          price: number
          rejection_reason: string | null
          service: string
          special_requests: string | null
          staff_name: string
          time_slot: string
          upi_screenshot_url: string | null
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number
          appointment_date: string
          branch: Database["public"]["Enums"]["branch"]
          cashfree_order_id?: string | null
          cf_payment_id?: string | null
          client_name: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          discount_applied?: number
          id?: string
          is_member?: boolean
          original_staff_name?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_mode?: string | null
          payment_status?: string
          phone: string
          price: number
          rejection_reason?: string | null
          service: string
          special_requests?: string | null
          staff_name: string
          time_slot: string
          upi_screenshot_url?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          appointment_date?: string
          branch?: Database["public"]["Enums"]["branch"]
          cashfree_order_id?: string | null
          cf_payment_id?: string | null
          client_name?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          discount_applied?: number
          id?: string
          is_member?: boolean
          original_staff_name?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_mode?: string | null
          payment_status?: string
          phone?: string
          price?: number
          rejection_reason?: string | null
          service?: string
          special_requests?: string | null
          staff_name?: string
          time_slot?: string
          upi_screenshot_url?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      appointment_extras: {
        Row: {
          addon_id: string | null
          amount: number
          appointment_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          quantity: number
          unit_amount: number
          unit_label: string | null
        }
        Insert: {
          addon_id?: string | null
          amount: number
          appointment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          quantity?: number
          unit_amount: number
          unit_label?: string | null
        }
        Update: {
          addon_id?: string | null
          amount?: number
          appointment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          quantity?: number
          unit_amount?: number
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_extras_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_extras_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "service_addons"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          payee_name: string
          updated_at: string
          upi_id: string
          upi_qr_url: string
        }
        Insert: {
          id?: string
          payee_name?: string
          updated_at?: string
          upi_id?: string
          upi_qr_url?: string
        }
        Update: {
          id?: string
          payee_name?: string
          updated_at?: string
          upi_id?: string
          upi_qr_url?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          activation_date: string | null
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
          activation_date?: string | null
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
          activation_date?: string | null
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
          cashfree_order_id: string | null
          cf_payment_id: string | null
          client_name: string | null
          created_at: string
          currency: string
          id: string
          membership_id: string | null
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          phone: string | null
          purpose: string
          rejection_reason: string | null
          status: string
          updated_at: string
          upi_screenshot_url: string | null
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          cashfree_order_id?: string | null
          cf_payment_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          phone?: string | null
          purpose: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          upi_screenshot_url?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          cashfree_order_id?: string | null
          cf_payment_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          phone?: string | null
          purpose?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          upi_screenshot_url?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
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
      payment_events: {
        Row: {
          cf_payment_id: string | null
          event_type: string
          id: string
          kind: string | null
          order_id: string | null
          processed: boolean
          raw: Json
          received_at: string
          source: string
        }
        Insert: {
          cf_payment_id?: string | null
          event_type: string
          id?: string
          kind?: string | null
          order_id?: string | null
          processed?: boolean
          raw: Json
          received_at?: string
          source?: string
        }
        Update: {
          cf_payment_id?: string | null
          event_type?: string
          id?: string
          kind?: string | null
          order_id?: string | null
          processed?: boolean
          raw?: Json
          received_at?: string
          source?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          map_url: string | null
          name: Database["public"]["Enums"]["branch"]
          phone: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          map_url?: string | null
          name: Database["public"]["Enums"]["branch"]
          phone?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          map_url?: string | null
          name?: Database["public"]["Enums"]["branch"]
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          branch: Database["public"]["Enums"]["branch"] | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          staff_name: string | null
          updated_at: string
        }
        Insert: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          staff_name?: string | null
          updated_at?: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          staff_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_addons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          per_unit: boolean
          rate: number
          sort_order: number
          unit_label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          per_unit?: boolean
          rate: number
          sort_order?: number
          unit_label?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          per_unit?: boolean
          rate?: number
          sort_order?: number
          unit_label?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          is_nail_art: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_nail_art?: boolean
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_nail_art?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      staff: {
        Row: {
          branch: Database["public"]["Enums"]["branch"]
          created_at: string
          id: string
          name: string
          photo_url: string | null
          store_number: string | null
        }
        Insert: {
          branch: Database["public"]["Enums"]["branch"]
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
          store_number?: string | null
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"]
          created_at?: string
          id?: string
          name?: string
          photo_url?: string | null
          store_number?: string | null
        }
        Relationships: []
      }
      staff_salaries: {
        Row: {
          absent_days: number
          base_salary: number
          created_at: string
          id: string
          month: string
          per_day_deduction: number
          staff_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absent_days?: number
          base_salary?: number
          created_at?: string
          id?: string
          month: string
          per_day_deduction?: number
          staff_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absent_days?: number
          base_salary?: number
          created_at?: string
          id?: string
          month?: string
          per_day_deduction?: number
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_salaries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          staff_id: string
          time_slot: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          staff_id: string
          time_slot: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          staff_id?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          off_date: string
          reason: string | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          off_date: string
          reason?: string | null
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          off_date?: string
          reason?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      branch: "Vile Parle" | "Bandra"
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
      branch: ["Vile Parle", "Bandra"],
      user_role: ["admin", "manager", "staff"],
    },
  },
} as const
