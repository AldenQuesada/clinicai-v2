/**
 * Database types · auto-gerado via supabase Management API.
 *
 * NAO EDITAR MANUALMENTE. Pra regenerar:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:types
 *
 * Ultima geracao: 2026-04-29T14:14:50.213Z
 * Project ref: oqboitkpcvuaudouwvkl
 */

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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _ai_budget: {
        Row: {
          call_count: number
          clinic_id: string
          cost_usd: number
          day_bucket: string
          input_tokens: number
          model: string
          output_tokens: number
          source: string
          updated_at: string
        }
        Insert: {
          call_count?: number
          clinic_id?: string
          cost_usd?: number
          day_bucket?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          source: string
          updated_at?: string
        }
        Update: {
          call_count?: number
          clinic_id?: string
          cost_usd?: number
          day_bucket?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      _b2bv_id_remap_audit: {
        Row: {
          lead_name: string | null
          new_id: string
          old_id: string
          remapped_at: string
        }
        Insert: {
          lead_name?: string | null
          new_id?: string
          old_id: string
          remapped_at?: string
        }
        Update: {
          lead_name?: string | null
          new_id?: string
          old_id?: string
          remapped_at?: string
        }
        Relationships: []
      }
      _trigger_error_log: {
        Row: {
          created_at: string
          err_detail: string | null
          err_message: string | null
          id: number
          row_data: Json | null
          table_name: string | null
          trigger_name: string
        }
        Insert: {
          created_at?: string
          err_detail?: string | null
          err_message?: string | null
          id?: number
          row_data?: Json | null
          table_name?: string | null
          trigger_name: string
        }
        Update: {
          created_at?: string
          err_detail?: string | null
          err_message?: string | null
          id?: number
          row_data?: Json | null
          table_name?: string | null
          trigger_name?: string
        }
        Relationships: []
      }
      agenda_alerts_log: {
        Row: {
          alert_kind: string
          appt_id: string | null
          clinic_id: string
          fired_at: string
          id: string
          lead_id: string | null
          outbox_id: number | null
          recipient: string | null
          rule_id: string | null
        }
        Insert: {
          alert_kind: string
          appt_id?: string | null
          clinic_id: string
          fired_at?: string
          id?: string
          lead_id?: string | null
          outbox_id?: number | null
          recipient?: string | null
          rule_id?: string | null
        }
        Update: {
          alert_kind?: string
          appt_id?: string | null
          clinic_id?: string
          fired_at?: string
          id?: string
          lead_id?: string | null
          outbox_id?: number | null
          recipient?: string | null
          rule_id?: string | null
        }
        Relationships: []
      }
      agenda_visibility: {
        Row: {
          clinic_id: string
          created_at: string
          granted_by: string | null
          id: string
          owner_id: string
          permission: string
          viewer_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          owner_id: string
          permission?: string
          viewer_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          owner_id?: string
          permission?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_visibility_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_visibility_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_visibility_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interactions: {
        Row: {
          conversationId: string
          costUsd: number
          createdAt: string
          id: string
          inputTokens: number
          latencyMs: number
          messageId: string
          model: string
          outputTokens: number
          promptSnapshot: string
          responseSnapshot: string
        }
        Insert: {
          conversationId: string
          costUsd: number
          createdAt?: string
          id: string
          inputTokens: number
          latencyMs: number
          messageId: string
          model: string
          outputTokens: number
          promptSnapshot: string
          responseSnapshot: string
        }
        Update: {
          conversationId?: string
          costUsd?: number
          createdAt?: string
          id?: string
          inputTokens?: number
          latencyMs?: number
          messageId?: string
          model?: string
          outputTokens?: number
          promptSnapshot?: string
          responseSnapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_personas: {
        Row: {
          active: boolean
          activeFlows: Json
          createdAt: string
          escalationRules: Json
          id: string
          name: string
          productFocus: string
          systemPrompt: string
          tenantId: string
          tone: string
          updatedAt: string
        }
        Insert: {
          active?: boolean
          activeFlows?: Json
          createdAt?: string
          escalationRules?: Json
          id: string
          name: string
          productFocus?: string
          systemPrompt: string
          tenantId: string
          tone?: string
          updatedAt: string
        }
        Update: {
          active?: boolean
          activeFlows?: Json
          createdAt?: string
          escalationRules?: Json
          id?: string
          name?: string
          productFocus?: string
          systemPrompt?: string
          tenantId?: string
          tone?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_personas_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_answers: {
        Row: {
          clinic_id: string
          created_at: string
          field_id: string
          field_key: string
          id: string
          normalized_text: string | null
          response_id: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          clinic_id: string
          created_at?: string
          field_id: string
          field_key: string
          id?: string
          normalized_text?: string | null
          response_id: string
          updated_at?: string
          value_json: Json
        }
        Update: {
          clinic_id?: string
          created_at?: string
          field_id?: string
          field_key?: string
          id?: string
          normalized_text?: string | null
          response_id?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_answers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_field_options: {
        Row: {
          created_at: string
          field_id: string
          id: string
          image_url: string | null
          is_active: boolean
          label: string
          order_index: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          label: string
          order_index: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          label?: string
          order_index?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_field_options_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_fields: {
        Row: {
          conditional_rules_json: Json
          created_at: string
          default_value: Json | null
          deleted_at: string | null
          description: string | null
          field_key: string
          field_type: Database["public"]["Enums"]["anamnesis_field_type_enum"]
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          is_visible: boolean
          label: string
          order_index: number
          placeholder: string | null
          session_id: string
          settings_json: Json
          template_id: string
          updated_at: string
          validation_rules: Json
        }
        Insert: {
          conditional_rules_json?: Json
          created_at?: string
          default_value?: Json | null
          deleted_at?: string | null
          description?: string | null
          field_key: string
          field_type: Database["public"]["Enums"]["anamnesis_field_type_enum"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          is_visible?: boolean
          label: string
          order_index: number
          placeholder?: string | null
          session_id: string
          settings_json?: Json
          template_id: string
          updated_at?: string
          validation_rules?: Json
        }
        Update: {
          conditional_rules_json?: Json
          created_at?: string
          default_value?: Json | null
          deleted_at?: string | null
          description?: string | null
          field_key?: string
          field_type?: Database["public"]["Enums"]["anamnesis_field_type_enum"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          is_visible?: boolean
          label?: string
          order_index?: number
          placeholder?: string | null
          session_id?: string
          settings_json?: Json
          template_id?: string
          updated_at?: string
          validation_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_fields_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_template_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_links: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          slug: string
          template_id: string | null
          token: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          slug: string
          template_id?: string | null
          token: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          slug?: string
          template_id?: string | null
          token?: string
        }
        Relationships: []
      }
      anamnesis_request_access_logs: {
        Row: {
          accessed_at: string
          event_name: string
          id: string
          ip_address: unknown
          request_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          event_name: string
          id?: string
          ip_address?: unknown
          request_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          event_name?: string
          id?: string
          ip_address?: unknown
          request_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_request_access_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_requests: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          patient_id: string
          public_slug: string
          revoked_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["anamnesis_request_status_enum"]
          template_id: string
          template_snapshot_json: Json | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          patient_id: string
          public_slug: string
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["anamnesis_request_status_enum"]
          template_id: string
          template_snapshot_json?: Json | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          patient_id?: string
          public_slug?: string
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["anamnesis_request_status_enum"]
          template_id?: string
          template_snapshot_json?: Json | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_response_flags: {
        Row: {
          created_at: string
          flag_code: string
          flag_type: Database["public"]["Enums"]["anamnesis_flag_type_enum"]
          id: string
          message: string
          metadata: Json
          response_id: string
          severity: Database["public"]["Enums"]["anamnesis_flag_severity_enum"]
        }
        Insert: {
          created_at?: string
          flag_code: string
          flag_type: Database["public"]["Enums"]["anamnesis_flag_type_enum"]
          id?: string
          message: string
          metadata?: Json
          response_id: string
          severity?: Database["public"]["Enums"]["anamnesis_flag_severity_enum"]
        }
        Update: {
          created_at?: string
          flag_code?: string
          flag_type?: Database["public"]["Enums"]["anamnesis_flag_type_enum"]
          id?: string
          message?: string
          metadata?: Json
          response_id?: string
          severity?: Database["public"]["Enums"]["anamnesis_flag_severity_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_response_flags_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_response_protocol_suggestions: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          priority: number
          protocol_code: string
          protocol_name: string
          reason: string | null
          response_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          protocol_code: string
          protocol_name: string
          reason?: string | null
          response_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          protocol_code?: string
          protocol_name?: string
          reason?: string | null
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_response_protocol_suggestions_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_responses: {
        Row: {
          clinic_id: string
          completed_at: string | null
          created_at: string
          current_session_id: string | null
          id: string
          lgpd_consent: Json | null
          patient_id: string
          progress_percent: number
          request_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["anamnesis_response_status_enum"]
          template_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          current_session_id?: string | null
          id?: string
          lgpd_consent?: Json | null
          patient_id: string
          progress_percent?: number
          request_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["anamnesis_response_status_enum"]
          template_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          current_session_id?: string | null
          id?: string
          lgpd_consent?: Json | null
          patient_id?: string
          progress_percent?: number
          request_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["anamnesis_response_status_enum"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_responses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_template_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "anamnesis_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_template_sessions: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          order_index: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          order_index: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          order_index?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_template_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_templates: {
        Row: {
          category: Database["public"]["Enums"]["anamnesis_template_category_enum"]
          clinic_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          has_general_session: boolean
          id: string
          is_active: boolean
          is_default: boolean
          is_pre_appointment_form: boolean
          name: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["anamnesis_template_category_enum"]
          clinic_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          has_general_session?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_pre_appointment_form?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["anamnesis_template_category_enum"]
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          has_general_session?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_pre_appointment_form?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_token_failures: {
        Row: {
          failed_at: string
          id: string
          ip_hash: string | null
          slug: string
        }
        Insert: {
          failed_at?: string
          id?: string
          ip_hash?: string | null
          slug: string
        }
        Update: {
          failed_at?: string
          id?: string
          ip_hash?: string | null
          slug?: string
        }
        Relationships: []
      }
      anatomy_quiz_lara_dispatch: {
        Row: {
          anthropic_response: Json | null
          attempts: number
          context: Json
          created_at: string
          dispatched_at: string | null
          error_message: string | null
          evolution_response: Json | null
          id: string
          lifecycle: string
          lp_lead_id: string | null
          message_text: string | null
          name: string | null
          next_send_at: string | null
          phone: string
          phone_raw: string | null
          queixas: Json
          sequence_step: number | null
          status: string
          template_id: string | null
          template_key: string
          template_variant: string | null
          template_version: number | null
        }
        Insert: {
          anthropic_response?: Json | null
          attempts?: number
          context: Json
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          evolution_response?: Json | null
          id?: string
          lifecycle: string
          lp_lead_id?: string | null
          message_text?: string | null
          name?: string | null
          next_send_at?: string | null
          phone: string
          phone_raw?: string | null
          queixas: Json
          sequence_step?: number | null
          status?: string
          template_id?: string | null
          template_key: string
          template_variant?: string | null
          template_version?: number | null
        }
        Update: {
          anthropic_response?: Json | null
          attempts?: number
          context?: Json
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          evolution_response?: Json | null
          id?: string
          lifecycle?: string
          lp_lead_id?: string | null
          message_text?: string | null
          name?: string | null
          next_send_at?: string | null
          phone?: string
          phone_raw?: string | null
          queixas?: Json
          sequence_step?: number | null
          status?: string
          template_id?: string | null
          template_key?: string
          template_variant?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anatomy_quiz_lara_dispatch_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "lara_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      anatomy_quiz_proof_photos: {
        Row: {
          active: boolean
          area_key: string
          caption: string | null
          created_at: string
          days_after: number | null
          id: string
          patient_age: number | null
          photo_url: string
        }
        Insert: {
          active?: boolean
          area_key: string
          caption?: string | null
          created_at?: string
          days_after?: number | null
          id?: string
          patient_age?: number | null
          photo_url: string
        }
        Update: {
          active?: boolean
          area_key?: string
          caption?: string | null
          created_at?: string
          days_after?: number | null
          id?: string
          patient_age?: number | null
          photo_url?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          clinic_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancelado_em: string | null
          chegada_em: string | null
          clinic_id: string
          consentimento_img: string
          consult_type: string | null
          created_at: string
          deleted_at: string | null
          end_time: string
          eval_type: string | null
          id: string
          lead_id: string | null
          motivo_cancelamento: string | null
          motivo_no_show: string | null
          no_show_em: string | null
          obs: string | null
          origem: string | null
          patient_id: string | null
          payment_method: string | null
          payment_status: string
          procedure_name: string
          professional_id: string | null
          professional_name: string
          recurrence_group_id: string | null
          recurrence_index: number | null
          recurrence_interval_days: number | null
          recurrence_procedure: string | null
          recurrence_total: number | null
          room_idx: number | null
          scheduled_date: string
          start_time: string
          status: string
          subject_name: string
          subject_phone: string | null
          updated_at: string
          value: number
        }
        Insert: {
          cancelado_em?: string | null
          chegada_em?: string | null
          clinic_id?: string
          consentimento_img?: string
          consult_type?: string | null
          created_at?: string
          deleted_at?: string | null
          end_time: string
          eval_type?: string | null
          id?: string
          lead_id?: string | null
          motivo_cancelamento?: string | null
          motivo_no_show?: string | null
          no_show_em?: string | null
          obs?: string | null
          origem?: string | null
          patient_id?: string | null
          payment_method?: string | null
          payment_status?: string
          procedure_name?: string
          professional_id?: string | null
          professional_name?: string
          recurrence_group_id?: string | null
          recurrence_index?: number | null
          recurrence_interval_days?: number | null
          recurrence_procedure?: string | null
          recurrence_total?: number | null
          room_idx?: number | null
          scheduled_date: string
          start_time: string
          status?: string
          subject_name?: string
          subject_phone?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          cancelado_em?: string | null
          chegada_em?: string | null
          clinic_id?: string
          consentimento_img?: string
          consult_type?: string | null
          created_at?: string
          deleted_at?: string | null
          end_time?: string
          eval_type?: string | null
          id?: string
          lead_id?: string | null
          motivo_cancelamento?: string | null
          motivo_no_show?: string | null
          no_show_em?: string | null
          obs?: string | null
          origem?: string | null
          patient_id?: string | null
          payment_method?: string | null
          payment_status?: string
          procedure_name?: string
          professional_id?: string | null
          professional_name?: string
          recurrence_group_id?: string | null
          recurrence_index?: number | null
          recurrence_interval_days?: number | null
          recurrence_procedure?: string | null
          recurrence_total?: number | null
          room_idx?: number | null
          scheduled_date?: string
          start_time?: string
          status?: string
          subject_name?: string
          subject_phone?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments_backup_pre_wipe_2026_04_24: {
        Row: {
          cancelado_em: string | null
          chegada_em: string | null
          clinic_id: string | null
          confirmacao_enviada: boolean | null
          consentimento_img: string | null
          consult_type: string | null
          created_at: string | null
          d1_response: string | null
          d1_response_at: string | null
          deleted_at: string | null
          end_time: string | null
          eval_type: string | null
          historico_alteracoes: Json | null
          historico_status: Json | null
          id: string | null
          motivo_cancelamento: string | null
          motivo_cortesia: string | null
          motivo_no_show: string | null
          no_show_em: string | null
          obs: string | null
          origem: string | null
          pagamentos: Json | null
          patient_id: string | null
          patient_name: string | null
          patient_phone: string | null
          payment_method: string | null
          payment_status: string | null
          presenca: string | null
          procedimentos: Json | null
          procedure_name: string | null
          professional_id: string | null
          professional_idx: number | null
          professional_name: string | null
          qtd_procs_cortesia: number | null
          recurrence_group_id: string | null
          recurrence_index: number | null
          recurrence_interval_days: number | null
          recurrence_procedure: string | null
          recurrence_total: number | null
          room_idx: number | null
          scheduled_date: string | null
          start_time: string | null
          status: string | null
          updated_at: string | null
          valor_cortesia: number | null
          value: number | null
        }
        Insert: {
          cancelado_em?: string | null
          chegada_em?: string | null
          clinic_id?: string | null
          confirmacao_enviada?: boolean | null
          consentimento_img?: string | null
          consult_type?: string | null
          created_at?: string | null
          d1_response?: string | null
          d1_response_at?: string | null
          deleted_at?: string | null
          end_time?: string | null
          eval_type?: string | null
          historico_alteracoes?: Json | null
          historico_status?: Json | null
          id?: string | null
          motivo_cancelamento?: string | null
          motivo_cortesia?: string | null
          motivo_no_show?: string | null
          no_show_em?: string | null
          obs?: string | null
          origem?: string | null
          pagamentos?: Json | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          payment_method?: string | null
          payment_status?: string | null
          presenca?: string | null
          procedimentos?: Json | null
          procedure_name?: string | null
          professional_id?: string | null
          professional_idx?: number | null
          professional_name?: string | null
          qtd_procs_cortesia?: number | null
          recurrence_group_id?: string | null
          recurrence_index?: number | null
          recurrence_interval_days?: number | null
          recurrence_procedure?: string | null
          recurrence_total?: number | null
          room_idx?: number | null
          scheduled_date?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
          valor_cortesia?: number | null
          value?: number | null
        }
        Update: {
          cancelado_em?: string | null
          chegada_em?: string | null
          clinic_id?: string | null
          confirmacao_enviada?: boolean | null
          consentimento_img?: string | null
          consult_type?: string | null
          created_at?: string | null
          d1_response?: string | null
          d1_response_at?: string | null
          deleted_at?: string | null
          end_time?: string | null
          eval_type?: string | null
          historico_alteracoes?: Json | null
          historico_status?: Json | null
          id?: string | null
          motivo_cancelamento?: string | null
          motivo_cortesia?: string | null
          motivo_no_show?: string | null
          no_show_em?: string | null
          obs?: string | null
          origem?: string | null
          pagamentos?: Json | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          payment_method?: string | null
          payment_status?: string | null
          presenca?: string | null
          procedimentos?: Json | null
          procedure_name?: string | null
          professional_id?: string | null
          professional_idx?: number | null
          professional_name?: string | null
          qtd_procs_cortesia?: number | null
          recurrence_group_id?: string | null
          recurrence_index?: number | null
          recurrence_interval_days?: number | null
          recurrence_procedure?: string | null
          recurrence_total?: number | null
          room_idx?: number | null
          scheduled_date?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
          valor_cortesia?: number | null
          value?: number | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action_enum"]
          clinic_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action_enum"]
          clinic_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action_enum"]
          clinic_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          actions: Json
          active: boolean
          createdAt: string
          id: string
          name: string
          tenantId: string
          triggerConfig: Json
          triggerType: string
          updatedAt: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          createdAt?: string
          id: string
          name: string
          tenantId: string
          triggerConfig?: Json
          triggerType: string
          updatedAt: string
        }
        Update: {
          actions?: Json
          active?: boolean
          createdAt?: string
          id?: string
          name?: string
          tenantId?: string
          triggerConfig?: Json
          triggerType?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          actionsExecuted: Json
          error: string | null
          flowId: string
          id: string
          lead_id: string | null
          status: string
          tenantId: string
          triggeredAt: string
        }
        Insert: {
          actionsExecuted?: Json
          error?: string | null
          flowId: string
          id: string
          lead_id?: string | null
          status: string
          tenantId: string
          triggeredAt?: string
        }
        Update: {
          actionsExecuted?: Json
          error?: string | null
          flowId?: string
          id?: string
          lead_id?: string | null
          status?: string
          tenantId?: string
          triggeredAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_flowId_fkey"
            columns: ["flowId"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          clinic_id: string
          conditions: Json
          cooldown_hours: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          max_executions: number | null
          name: string
          priority: number
          run_count: number
          slug: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          clinic_id: string
          conditions?: Json
          cooldown_hours?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_executions?: number | null
          name: string
          priority?: number
          run_count?: number
          slug: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          clinic_id?: string
          conditions?: Json
          cooldown_hours?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_executions?: number | null
          name?: string
          priority?: number
          run_count?: number
          slug?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_admin_phones: {
        Row: {
          can_approve: boolean
          can_create: boolean
          created_at: string
          created_by: string | null
          is_active: boolean
          name: string
          notes: string | null
          phone_full: string | null
          phone_last8: string
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          name: string
          notes?: string | null
          phone_full?: string | null
          phone_last8: string
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          name?: string
          notes?: string | null
          phone_full?: string | null
          phone_last8?: string
          updated_at?: string
        }
        Relationships: []
      }
      b2b_analytics_alerts: {
        Row: {
          clinic_id: string
          created_at: string
          data: Json | null
          detail: string | null
          dismissed_at: string | null
          id: string
          kind: string
          metric_delta: number | null
          metric_value: number | null
          partnership_id: string | null
          recommendation: string | null
          severity: string
          title: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          kind: string
          metric_delta?: number | null
          metric_value?: number | null
          partnership_id?: string | null
          recommendation?: string | null
          severity?: string
          title: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          kind?: string
          metric_delta?: number | null
          metric_value?: number | null
          partnership_id?: string | null
          recommendation?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_analytics_alerts_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_attributions: {
        Row: {
          attended_at: string | null
          clinic_id: string
          converted_amount_brl: number | null
          converted_appointment_id: string | null
          converted_appointment_ids: string[] | null
          converted_at: string | null
          converted_procedure_name: string | null
          created_at: string
          first_appointment_at: string | null
          first_appointment_id: string | null
          first_budget_at: string | null
          first_budget_id: string | null
          id: string
          last_scan_at: string | null
          lead_name: string | null
          lead_phone: string | null
          lead_phone_last8: string | null
          notified_attended: boolean | null
          notified_converted: boolean | null
          notified_patient: boolean | null
          notified_scheduled: boolean | null
          partnership_id: string
          revenue_brl: number
          scheduled_at: string | null
          source: string
          status: string
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          attended_at?: string | null
          clinic_id?: string
          converted_amount_brl?: number | null
          converted_appointment_id?: string | null
          converted_appointment_ids?: string[] | null
          converted_at?: string | null
          converted_procedure_name?: string | null
          created_at?: string
          first_appointment_at?: string | null
          first_appointment_id?: string | null
          first_budget_at?: string | null
          first_budget_id?: string | null
          id?: string
          last_scan_at?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          lead_phone_last8?: string | null
          notified_attended?: boolean | null
          notified_converted?: boolean | null
          notified_patient?: boolean | null
          notified_scheduled?: boolean | null
          partnership_id: string
          revenue_brl?: number
          scheduled_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          attended_at?: string | null
          clinic_id?: string
          converted_amount_brl?: number | null
          converted_appointment_id?: string | null
          converted_appointment_ids?: string[] | null
          converted_at?: string | null
          converted_procedure_name?: string | null
          created_at?: string
          first_appointment_at?: string | null
          first_appointment_id?: string | null
          first_budget_at?: string | null
          first_budget_id?: string | null
          id?: string
          last_scan_at?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          lead_phone_last8?: string | null
          notified_attended?: boolean | null
          notified_converted?: boolean | null
          notified_patient?: boolean | null
          notified_scheduled?: boolean | null
          partnership_id?: string
          revenue_brl?: number
          scheduled_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_attributions_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_attributions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "b2b_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_audit_log: {
        Row: {
          action: string
          author: string | null
          clinic_id: string
          created_at: string
          from_value: string | null
          id: string
          meta: Json | null
          notes: string | null
          partnership_id: string
          to_value: string | null
        }
        Insert: {
          action: string
          author?: string | null
          clinic_id?: string
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          notes?: string | null
          partnership_id: string
          to_value?: string | null
        }
        Update: {
          action?: string
          author?: string | null
          clinic_id?: string
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          notes?: string | null
          partnership_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_audit_log_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_audit_log_archive: {
        Row: {
          action: string
          author: string | null
          clinic_id: string
          created_at: string
          from_value: string | null
          id: string
          meta: Json | null
          notes: string | null
          partnership_id: string
          to_value: string | null
        }
        Insert: {
          action: string
          author?: string | null
          clinic_id?: string
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          notes?: string | null
          partnership_id: string
          to_value?: string | null
        }
        Update: {
          action?: string
          author?: string | null
          clinic_id?: string
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          notes?: string | null
          partnership_id?: string
          to_value?: string | null
        }
        Relationships: []
      }
      b2b_bulk_jobs: {
        Row: {
          author: string | null
          clinic_id: string
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          kind: string
          meta: Json | null
          processed: number
          started_at: string
          status: string
          total: number
        }
        Insert: {
          author?: string | null
          clinic_id: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          kind: string
          meta?: Json | null
          processed?: number
          started_at?: string
          status?: string
          total?: number
        }
        Update: {
          author?: string | null
          clinic_id?: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          kind?: string
          meta?: Json | null
          processed?: number
          started_at?: string
          status?: string
          total?: number
        }
        Relationships: []
      }
      b2b_candidates: {
        Row: {
          address: string | null
          approach_message: string | null
          category: string
          clinic_id: string
          contact_status: string
          created_at: string
          dedup_key: string | null
          dna_justification: string | null
          dna_score: number | null
          email: string | null
          fit_reasons: string[] | null
          google_rating: number | null
          google_reviews: number | null
          id: string
          instagram_handle: string | null
          last_contact_at: string | null
          name: string
          notes: string | null
          partnership_id: string | null
          phone: string | null
          phone_digits: string | null
          raw_data: Json | null
          referred_by: string | null
          referred_by_contact: string | null
          referred_by_reason: string | null
          risk_flags: string[] | null
          search_key: string | null
          source: string
          tier_target: number | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          approach_message?: string | null
          category: string
          clinic_id?: string
          contact_status?: string
          created_at?: string
          dedup_key?: string | null
          dna_justification?: string | null
          dna_score?: number | null
          email?: string | null
          fit_reasons?: string[] | null
          google_rating?: number | null
          google_reviews?: number | null
          id?: string
          instagram_handle?: string | null
          last_contact_at?: string | null
          name: string
          notes?: string | null
          partnership_id?: string | null
          phone?: string | null
          phone_digits?: string | null
          raw_data?: Json | null
          referred_by?: string | null
          referred_by_contact?: string | null
          referred_by_reason?: string | null
          risk_flags?: string[] | null
          search_key?: string | null
          source?: string
          tier_target?: number | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          approach_message?: string | null
          category?: string
          clinic_id?: string
          contact_status?: string
          created_at?: string
          dedup_key?: string | null
          dna_justification?: string | null
          dna_score?: number | null
          email?: string | null
          fit_reasons?: string[] | null
          google_rating?: number | null
          google_reviews?: number | null
          id?: string
          instagram_handle?: string | null
          last_contact_at?: string | null
          name?: string
          notes?: string | null
          partnership_id?: string | null
          phone?: string | null
          phone_digits?: string | null
          raw_data?: Json | null
          referred_by?: string | null
          referred_by_contact?: string | null
          referred_by_reason?: string | null
          risk_flags?: string[] | null
          search_key?: string | null
          source?: string
          tier_target?: number | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_candidates_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_comm_dispatch_log: {
        Row: {
          audio_url: string | null
          channel: string | null
          clinic_id: string
          created_at: string
          error_message: string | null
          event_key: string
          id: string
          meta: Json | null
          partnership_id: string | null
          recipient_phone: string | null
          recipient_role: string | null
          sender_instance: string | null
          status: string
          template_id: string | null
          text_content: string | null
          wa_message_id: string | null
        }
        Insert: {
          audio_url?: string | null
          channel?: string | null
          clinic_id: string
          created_at?: string
          error_message?: string | null
          event_key: string
          id?: string
          meta?: Json | null
          partnership_id?: string | null
          recipient_phone?: string | null
          recipient_role?: string | null
          sender_instance?: string | null
          status?: string
          template_id?: string | null
          text_content?: string | null
          wa_message_id?: string | null
        }
        Update: {
          audio_url?: string | null
          channel?: string | null
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          event_key?: string
          id?: string
          meta?: Json | null
          partnership_id?: string | null
          recipient_phone?: string | null
          recipient_role?: string | null
          sender_instance?: string | null
          status?: string
          template_id?: string | null
          text_content?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_comm_dispatch_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_comm_dispatch_log_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_comm_dispatch_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "b2b_comm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_comm_event_keys: {
        Row: {
          bucket: string
          clinic_id: string
          created_at: string
          group_label: string
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          recipient_role: string
          sort_order: number
          trigger_desc: string | null
          updated_at: string
        }
        Insert: {
          bucket?: string
          clinic_id?: string
          created_at?: string
          group_label?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          recipient_role?: string
          sort_order?: number
          trigger_desc?: string | null
          updated_at?: string
        }
        Update: {
          bucket?: string
          clinic_id?: string
          created_at?: string
          group_label?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          recipient_role?: string
          sort_order?: number
          trigger_desc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      b2b_comm_templates: {
        Row: {
          audio_script: string | null
          channel: string
          clinic_id: string
          created_at: string
          cron_expr: string | null
          delay_minutes: number
          event_key: string
          id: string
          is_active: boolean
          notes: string | null
          partnership_id: string | null
          priority: number
          recipient_role: string
          sender_instance: string
          sequence_name: string | null
          sequence_order: number
          text_template: string | null
          tts_instructions: string | null
          tts_voice: string | null
          updated_at: string
        }
        Insert: {
          audio_script?: string | null
          channel: string
          clinic_id?: string
          created_at?: string
          cron_expr?: string | null
          delay_minutes?: number
          event_key: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partnership_id?: string | null
          priority?: number
          recipient_role: string
          sender_instance?: string
          sequence_name?: string | null
          sequence_order?: number
          text_template?: string | null
          tts_instructions?: string | null
          tts_voice?: string | null
          updated_at?: string
        }
        Update: {
          audio_script?: string | null
          channel?: string
          clinic_id?: string
          created_at?: string
          cron_expr?: string | null
          delay_minutes?: number
          event_key?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partnership_id?: string | null
          priority?: number
          recipient_role?: string
          sender_instance?: string
          sequence_name?: string | null
          sequence_order?: number
          text_template?: string | null
          tts_instructions?: string | null
          tts_voice?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_comm_templates_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_consent_log: {
        Row: {
          clinic_id: string
          consent_type: string
          created_at: string
          granted: boolean
          id: string
          notes: string | null
          partnership_id: string
          source: string | null
        }
        Insert: {
          clinic_id: string
          consent_type: string
          created_at?: string
          granted: boolean
          id?: string
          notes?: string | null
          partnership_id: string
          source?: string | null
        }
        Update: {
          clinic_id?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          notes?: string | null
          partnership_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_consent_log_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_funnel_benchmarks: {
        Row: {
          clinic_id: string
          created_at: string
          label: string
          sort_order: number
          stage: string
          target_pct: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          label: string
          sort_order?: number
          stage: string
          target_pct: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          label?: string
          sort_order?: number
          stage?: string
          target_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      b2b_group_exposures: {
        Row: {
          clinic_id: string
          conversions: number | null
          cost_estimate_brl: number | null
          created_at: string
          date_occurred: string
          event_type: string
          id: string
          leads_count: number
          notes: string | null
          partnership_id: string
          reach_count: number
          title: string
        }
        Insert: {
          clinic_id?: string
          conversions?: number | null
          cost_estimate_brl?: number | null
          created_at?: string
          date_occurred?: string
          event_type: string
          id?: string
          leads_count?: number
          notes?: string | null
          partnership_id: string
          reach_count?: number
          title: string
        }
        Update: {
          clinic_id?: string
          conversions?: number | null
          cost_estimate_brl?: number | null
          created_at?: string
          date_occurred?: string
          event_type?: string
          id?: string
          leads_count?: number
          notes?: string | null
          partnership_id?: string
          reach_count?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_group_exposures_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_health_history: {
        Row: {
          clinic_id: string
          health_color: string
          id: string
          partnership_id: string
          previous_color: string | null
          recorded_at: string
        }
        Insert: {
          clinic_id?: string
          health_color: string
          id?: string
          partnership_id: string
          previous_color?: string | null
          recorded_at?: string
        }
        Update: {
          clinic_id?: string
          health_color?: string
          id?: string
          partnership_id?: string
          previous_color?: string | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_health_history_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_insight_dismissals: {
        Row: {
          clinic_id: string
          dismissed_at: string
          dismissed_by: string | null
          expires_at: string
          kind: string
          partnership_id: string
        }
        Insert: {
          clinic_id: string
          dismissed_at?: string
          dismissed_by?: string | null
          expires_at?: string
          kind: string
          partnership_id: string
        }
        Update: {
          clinic_id?: string
          dismissed_at?: string
          dismissed_by?: string | null
          expires_at?: string
          kind?: string
          partnership_id?: string
        }
        Relationships: []
      }
      b2b_insights: {
        Row: {
          acted_upon_at: string | null
          acted_upon_by: string | null
          clinic_id: string
          content: string | null
          created_at: string
          data: Json | null
          detail: string | null
          dismissed_at: string | null
          headline: string | null
          id: string
          insight_type: string | null
          metadata: Json | null
          model_used: string | null
          partnership_id: string | null
          score: number | null
          seen_at: string | null
          severity: string | null
          source_period: unknown
          suggested_action: string | null
          week_ref: string | null
        }
        Insert: {
          acted_upon_at?: string | null
          acted_upon_by?: string | null
          clinic_id?: string
          content?: string | null
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          headline?: string | null
          id?: string
          insight_type?: string | null
          metadata?: Json | null
          model_used?: string | null
          partnership_id?: string | null
          score?: number | null
          seen_at?: string | null
          severity?: string | null
          source_period?: unknown
          suggested_action?: string | null
          week_ref?: string | null
        }
        Update: {
          acted_upon_at?: string | null
          acted_upon_by?: string | null
          clinic_id?: string
          content?: string | null
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          headline?: string | null
          id?: string
          insight_type?: string | null
          metadata?: Json | null
          model_used?: string | null
          partnership_id?: string | null
          score?: number | null
          seen_at?: string | null
          severity?: string | null
          source_period?: unknown
          suggested_action?: string | null
          week_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_insights_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_monthly_targets: {
        Row: {
          actual_count: number
          clinic_id: string
          created_at: string
          id: string
          month: string
          notes: string | null
          status: string | null
          target_count: number
          target_partnerships: number | null
          target_vouchers: number | null
          tier_focus: number[] | null
          updated_at: string
        }
        Insert: {
          actual_count?: number
          clinic_id?: string
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          status?: string | null
          target_count?: number
          target_partnerships?: number | null
          target_vouchers?: number | null
          tier_focus?: number[] | null
          updated_at?: string
        }
        Update: {
          actual_count?: number
          clinic_id?: string
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          status?: string | null
          target_count?: number
          target_partnerships?: number | null
          target_vouchers?: number | null
          tier_focus?: number[] | null
          updated_at?: string
        }
        Relationships: []
      }
      b2b_nps_responses: {
        Row: {
          clinic_id: string
          comment: string | null
          created_at: string
          id: string
          opened_at: string | null
          partnership_id: string
          quarter_ref: string
          responded_at: string | null
          score: number | null
          token: string
        }
        Insert: {
          clinic_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          partnership_id: string
          quarter_ref?: string
          responded_at?: string | null
          score?: number | null
          token: string
        }
        Update: {
          clinic_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          partnership_id?: string
          quarter_ref?: string
          responded_at?: string | null
          score?: number | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_nps_responses_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_panel_rate_limits: {
        Row: {
          client_ip: string
          id: number
          request_at: string
          token: string
        }
        Insert: {
          client_ip: string
          id?: number
          request_at?: string
          token: string
        }
        Update: {
          client_ip?: string
          id?: number
          request_at?: string
          token?: string
        }
        Relationships: []
      }
      b2b_partnership_activities: {
        Row: {
          clinic_id: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          kind: string
          notes: string | null
          partnership_id: string
          responsible: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          partnership_id: string
          responsible?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          partnership_id?: string
          responsible?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_activities_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_alerts: {
        Row: {
          alert_kind: string
          clinic_id: string
          created_at: string
          id: string
          message: string
          partnership_id: string
          resolved: boolean
          resolved_at: string | null
          severity: string
        }
        Insert: {
          alert_kind: string
          clinic_id: string
          created_at?: string
          id?: string
          message: string
          partnership_id: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          alert_kind?: string
          clinic_id?: string
          created_at?: string
          id?: string
          message?: string
          partnership_id?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_alerts_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_applications: {
        Row: {
          address: string | null
          approval_note: string | null
          category: string | null
          clinic_id: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          follow_up_count: number
          id: string
          instagram: string | null
          last_follow_up_at: string | null
          name: string
          notes: string | null
          partnership_id: string | null
          rejection_reason: string | null
          requested_by_phone: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          approval_note?: string | null
          category?: string | null
          clinic_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          follow_up_count?: number
          id?: string
          instagram?: string | null
          last_follow_up_at?: string | null
          name: string
          notes?: string | null
          partnership_id?: string | null
          rejection_reason?: string | null
          requested_by_phone: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          approval_note?: string | null
          category?: string | null
          clinic_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          follow_up_count?: number
          id?: string
          instagram?: string | null
          last_follow_up_at?: string | null
          name?: string
          notes?: string | null
          partnership_id?: string | null
          rejection_reason?: string | null
          requested_by_phone?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_applications_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_comments: {
        Row: {
          author_name: string | null
          body: string
          clinic_id: string
          created_at: string
          id: string
          partnership_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          clinic_id?: string
          created_at?: string
          id?: string
          partnership_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          clinic_id?: string
          created_at?: string
          id?: string
          partnership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_comments_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_content: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          label: string | null
          meta: Json | null
          partnership_id: string
          sort_order: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          meta?: Json | null
          partnership_id: string
          sort_order?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          meta?: Json | null
          partnership_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_content_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_contents: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          kind: string
          partnership_id: string
          schedule: string | null
          source: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          kind?: string
          partnership_id: string
          schedule?: string | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          kind?: string
          partnership_id?: string
          schedule?: string | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_contents_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_contracts: {
        Row: {
          clinic_id: string
          created_at: string
          expiry_date: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          notes: string | null
          partnership_id: string
          sent_at: string | null
          signature_data: Json | null
          signed_at: string | null
          status: string
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          expiry_date?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          partnership_id: string
          sent_at?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          status?: string
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          expiry_date?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          partnership_id?: string
          sent_at?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          status?: string
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_contracts_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: true
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_events: {
        Row: {
          created_at: string
          date_or_cadence: string
          deliverables: string[] | null
          description: string | null
          event_type: string
          format: string | null
          id: string
          next_occurrence: string | null
          partnership_id: string
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string
          date_or_cadence: string
          deliverables?: string[] | null
          description?: string | null
          event_type: string
          format?: string | null
          id?: string
          next_occurrence?: string | null
          partnership_id: string
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string
          date_or_cadence?: string
          deliverables?: string[] | null
          description?: string | null
          event_type?: string
          format?: string | null
          id?: string
          next_occurrence?: string | null
          partnership_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_events_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_metas: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          kind: string
          partnership_id: string
          source: string | null
          target: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          kind: string
          partnership_id: string
          source?: string | null
          target: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          kind?: string
          partnership_id?: string
          source?: string | null
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_metas_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_targets: {
        Row: {
          benefit_label: string | null
          cadence: string
          created_at: string
          horizon_days: number | null
          id: string
          indicator: string
          partnership_id: string
          sort_order: number | null
          target_value: number
        }
        Insert: {
          benefit_label?: string | null
          cadence: string
          created_at?: string
          horizon_days?: number | null
          id?: string
          indicator: string
          partnership_id: string
          sort_order?: number | null
          target_value: number
        }
        Update: {
          benefit_label?: string | null
          cadence?: string
          created_at?: string
          horizon_days?: number | null
          id?: string
          indicator?: string
          partnership_id?: string
          sort_order?: number | null
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_targets_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_tasks: {
        Row: {
          clinic_id: string
          created_at: string
          due_at: string | null
          id: string
          owner_role: string | null
          partnership_id: string
          source: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          owner_role?: string | null
          partnership_id: string
          source?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          owner_role?: string | null
          partnership_id?: string
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_tasks_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnership_wa_senders: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          partnership_id: string
          phone: string
          phone_last8: string | null
          role: string
        }
        Insert: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          partnership_id: string
          phone: string
          phone_last8?: string | null
          role?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          partnership_id?: string
          phone?: string
          phone_last8?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnership_wa_senders_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partnerships: {
        Row: {
          account_manager: string | null
          assigned_at: string | null
          auto_playbook_enabled: boolean | null
          auto_playbook_last_at: string | null
          category: string | null
          clinic_id: string
          closure_letter: string | null
          closure_reason: string | null
          closure_suggested_at: string | null
          contact_email: string | null
          contact_instagram: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_website: string | null
          contract_duration_months: number | null
          contract_expiry_date: string | null
          contract_signed_date: string | null
          contrapartida: string[] | null
          contrapartida_cadence: string | null
          created_at: string
          created_by: string | null
          demo_voucher_id: string | null
          dna_estetica: number | null
          dna_excelencia: number | null
          dna_proposito: number | null
          dna_score: number | null
          emotional_trigger: string | null
          estimated_monthly_reach: number | null
          health_color: string | null
          id: string
          involved_professionals: string[] | null
          is_collective: boolean
          is_image_partner: boolean
          lat: number | null
          lng: number | null
          member_count: number | null
          monthly_value_cap_brl: number | null
          name: string
          narrative_author: string | null
          narrative_quote: string | null
          pillar: string
          public_token: string | null
          public_token_expires_at: string | null
          renewal_notice_days: number | null
          review_cadence_months: number | null
          sazonais: string[] | null
          slogans: string[] | null
          slug: string
          status: string
          status_reason: string | null
          tier: number | null
          type: string
          updated_at: string
          voucher_combo: string | null
          voucher_delivery: string[] | null
          voucher_min_notice_days: number | null
          voucher_monthly_cap: number | null
          voucher_unit_cost_brl: number | null
          voucher_validity_days: number | null
          welcome_dispatched_at: string | null
          welcome_mira_message_ids: Json | null
          welcome_mira_sent_at: string | null
        }
        Insert: {
          account_manager?: string | null
          assigned_at?: string | null
          auto_playbook_enabled?: boolean | null
          auto_playbook_last_at?: string | null
          category?: string | null
          clinic_id?: string
          closure_letter?: string | null
          closure_reason?: string | null
          closure_suggested_at?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          contract_duration_months?: number | null
          contract_expiry_date?: string | null
          contract_signed_date?: string | null
          contrapartida?: string[] | null
          contrapartida_cadence?: string | null
          created_at?: string
          created_by?: string | null
          demo_voucher_id?: string | null
          dna_estetica?: number | null
          dna_excelencia?: number | null
          dna_proposito?: number | null
          dna_score?: number | null
          emotional_trigger?: string | null
          estimated_monthly_reach?: number | null
          health_color?: string | null
          id?: string
          involved_professionals?: string[] | null
          is_collective?: boolean
          is_image_partner?: boolean
          lat?: number | null
          lng?: number | null
          member_count?: number | null
          monthly_value_cap_brl?: number | null
          name: string
          narrative_author?: string | null
          narrative_quote?: string | null
          pillar: string
          public_token?: string | null
          public_token_expires_at?: string | null
          renewal_notice_days?: number | null
          review_cadence_months?: number | null
          sazonais?: string[] | null
          slogans?: string[] | null
          slug: string
          status?: string
          status_reason?: string | null
          tier?: number | null
          type: string
          updated_at?: string
          voucher_combo?: string | null
          voucher_delivery?: string[] | null
          voucher_min_notice_days?: number | null
          voucher_monthly_cap?: number | null
          voucher_unit_cost_brl?: number | null
          voucher_validity_days?: number | null
          welcome_dispatched_at?: string | null
          welcome_mira_message_ids?: Json | null
          welcome_mira_sent_at?: string | null
        }
        Update: {
          account_manager?: string | null
          assigned_at?: string | null
          auto_playbook_enabled?: boolean | null
          auto_playbook_last_at?: string | null
          category?: string | null
          clinic_id?: string
          closure_letter?: string | null
          closure_reason?: string | null
          closure_suggested_at?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          contract_duration_months?: number | null
          contract_expiry_date?: string | null
          contract_signed_date?: string | null
          contrapartida?: string[] | null
          contrapartida_cadence?: string | null
          created_at?: string
          created_by?: string | null
          demo_voucher_id?: string | null
          dna_estetica?: number | null
          dna_excelencia?: number | null
          dna_proposito?: number | null
          dna_score?: number | null
          emotional_trigger?: string | null
          estimated_monthly_reach?: number | null
          health_color?: string | null
          id?: string
          involved_professionals?: string[] | null
          is_collective?: boolean
          is_image_partner?: boolean
          lat?: number | null
          lng?: number | null
          member_count?: number | null
          monthly_value_cap_brl?: number | null
          name?: string
          narrative_author?: string | null
          narrative_quote?: string | null
          pillar?: string
          public_token?: string | null
          public_token_expires_at?: string | null
          renewal_notice_days?: number | null
          review_cadence_months?: number | null
          sazonais?: string[] | null
          slogans?: string[] | null
          slug?: string
          status?: string
          status_reason?: string | null
          tier?: number | null
          type?: string
          updated_at?: string
          voucher_combo?: string | null
          voucher_delivery?: string[] | null
          voucher_min_notice_days?: number | null
          voucher_monthly_cap?: number | null
          voucher_unit_cost_brl?: number | null
          voucher_validity_days?: number | null
          welcome_dispatched_at?: string | null
          welcome_mira_message_ids?: Json | null
          welcome_mira_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partnerships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_plan_categories: {
        Row: {
          created_at: string
          is_active: boolean
          label: string
          notes: string | null
          pillar: string
          priority: number
          slug: string
          suggested_query: string | null
          tier: number
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          label: string
          notes?: string | null
          pillar: string
          priority?: number
          slug: string
          suggested_query?: string | null
          tier: number
        }
        Update: {
          created_at?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          pillar?: string
          priority?: number
          slug?: string
          suggested_query?: string | null
          tier?: number
        }
        Relationships: []
      }
      b2b_playbook_applications: {
        Row: {
          applied_at: string
          applied_by: string | null
          clinic_id: string
          id: string
          partnership_id: string
          summary: Json
          template_kind: string
          template_name: string | null
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          clinic_id: string
          id?: string
          partnership_id: string
          summary?: Json
          template_kind: string
          template_name?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          clinic_id?: string
          id?: string
          partnership_id?: string
          summary?: Json
          template_kind?: string
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_playbook_applications_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_playbook_ia_runs: {
        Row: {
          clinic_id: string
          cost_usd: number | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_tokens: number | null
          items_created: number
          output_tokens: number | null
          partnership_id: string
          requested_by: string | null
          scope: string
          status: string
        }
        Insert: {
          clinic_id?: string
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          items_created?: number
          output_tokens?: number | null
          partnership_id: string
          requested_by?: string | null
          scope: string
          status?: string
        }
        Update: {
          clinic_id?: string
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          items_created?: number
          output_tokens?: number | null
          partnership_id?: string
          requested_by?: string | null
          scope?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_playbook_ia_runs_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_playbook_templates: {
        Row: {
          clinic_id: string
          contents: Json
          created_at: string
          description: string | null
          is_default: boolean
          kind: string
          metas: Json
          name: string
          tasks: Json
        }
        Insert: {
          clinic_id: string
          contents?: Json
          created_at?: string
          description?: string | null
          is_default?: boolean
          kind: string
          metas?: Json
          name: string
          tasks?: Json
        }
        Update: {
          clinic_id?: string
          contents?: Json
          created_at?: string
          description?: string | null
          is_default?: boolean
          kind?: string
          metas?: Json
          name?: string
          tasks?: Json
        }
        Relationships: []
      }
      b2b_scout_config: {
        Row: {
          alert_threshold_pct: number
          budget_cap_monthly: number
          clinic_id: string
          dedup_window_days: number
          rate_limit_per_day: number
          scout_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_threshold_pct?: number
          budget_cap_monthly?: number
          clinic_id?: string
          dedup_window_days?: number
          rate_limit_per_day?: number
          scout_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_threshold_pct?: number
          budget_cap_monthly?: number
          clinic_id?: string
          dedup_window_days?: number
          rate_limit_per_day?: number
          scout_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      b2b_scout_jobs: {
        Row: {
          attempts: number
          candidates_created: number | null
          category: string
          city: string
          clinic_id: string
          completed_at: string | null
          cost_brl: number | null
          created_at: string
          error_message: string | null
          id: string
          limit_n: number
          max_attempts: number
          partnership_id: string | null
          priority: number
          requested_by: string | null
          started_at: string | null
          status: string
          tier_target: number | null
        }
        Insert: {
          attempts?: number
          candidates_created?: number | null
          category: string
          city: string
          clinic_id: string
          completed_at?: string | null
          cost_brl?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          limit_n?: number
          max_attempts?: number
          partnership_id?: string | null
          priority?: number
          requested_by?: string | null
          started_at?: string | null
          status?: string
          tier_target?: number | null
        }
        Update: {
          attempts?: number
          candidates_created?: number | null
          category?: string
          city?: string
          clinic_id?: string
          completed_at?: string | null
          cost_brl?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          limit_n?: number
          max_attempts?: number
          partnership_id?: string | null
          priority?: number
          requested_by?: string | null
          started_at?: string | null
          status?: string
          tier_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_scout_jobs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_scout_jobs_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_scout_usage: {
        Row: {
          candidate_id: string | null
          category: string | null
          clinic_id: string
          cost_brl: number
          created_at: string
          event_type: string
          id: string
          meta: Json | null
        }
        Insert: {
          candidate_id?: string | null
          category?: string | null
          clinic_id?: string
          cost_brl: number
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
        }
        Update: {
          candidate_id?: string | null
          category?: string | null
          clinic_id?: string
          cost_brl?: number
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_scout_usage_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "b2b_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_seasonal_calendar: {
        Row: {
          accent_hex: string
          bg_hex: string
          copy_flavor: string | null
          ink_hex: string
          key: string
          label: string
          month: number
          ornament_variant: string
          updated_at: string
        }
        Insert: {
          accent_hex: string
          bg_hex: string
          copy_flavor?: string | null
          ink_hex: string
          key: string
          label: string
          month: number
          ornament_variant?: string
          updated_at?: string
        }
        Update: {
          accent_hex?: string
          bg_hex?: string
          copy_flavor?: string | null
          ink_hex?: string
          key?: string
          label?: string
          month?: number
          ornament_variant?: string
          updated_at?: string
        }
        Relationships: []
      }
      b2b_tasks: {
        Row: {
          clinic_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          kind: string
          owner: string | null
          partnership_id: string | null
          payload: Json | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          kind: string
          owner?: string | null
          partnership_id?: string | null
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          owner?: string | null
          partnership_id?: string | null
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_tasks_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_tier_configs: {
        Row: {
          clinic_id: string
          color_hex: string
          created_at: string
          default_monthly_cap_brl: number | null
          default_voucher_combo: string | null
          default_voucher_monthly_cap: number | null
          default_voucher_validity_days: number
          description: string | null
          label: string
          sort_order: number
          tier: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          color_hex?: string
          created_at?: string
          default_monthly_cap_brl?: number | null
          default_voucher_combo?: string | null
          default_voucher_monthly_cap?: number | null
          default_voucher_validity_days?: number
          description?: string | null
          label: string
          sort_order?: number
          tier: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          color_hex?: string
          created_at?: string
          default_monthly_cap_brl?: number | null
          default_voucher_combo?: string | null
          default_voucher_monthly_cap?: number | null
          default_voucher_validity_days?: number
          description?: string | null
          label?: string
          sort_order?: number
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      b2b_voucher_combos: {
        Row: {
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_voucher_combos_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_voucher_dispatch_queue: {
        Row: {
          attempts: number
          batch_id: string | null
          clinic_id: string
          combo: string | null
          created_at: string
          error_message: string | null
          id: string
          last_attempt_at: string | null
          notes: string | null
          partnership_id: string
          processing_started_at: string | null
          recipient_cpf: string | null
          recipient_name: string
          recipient_phone: string
          scheduled_at: string
          status: string
          submitted_by: string | null
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          attempts?: number
          batch_id?: string | null
          clinic_id?: string
          combo?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          partnership_id: string
          processing_started_at?: string | null
          recipient_cpf?: string | null
          recipient_name: string
          recipient_phone: string
          scheduled_at?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          attempts?: number
          batch_id?: string | null
          clinic_id?: string
          combo?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          partnership_id?: string
          processing_started_at?: string | null
          recipient_cpf?: string | null
          recipient_name?: string
          recipient_phone?: string
          scheduled_at?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_voucher_dispatch_queue_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_voucher_dispatch_queue_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "b2b_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_vouchers: {
        Row: {
          audio_sent_at: string | null
          audio_storage_path: string | null
          audio_wa_message_id: string | null
          clinic_id: string
          combo: string
          created_at: string
          delivered_at: string | null
          id: string
          is_demo: boolean
          issued_at: string
          lara_engaged_at: string | null
          lara_followup_picking_at: string | null
          lara_followup_sent_24h_at: string | null
          lara_followup_sent_48h_at: string | null
          lara_followup_sent_72h_at: string | null
          lara_followup_state: string
          notes: string | null
          opened_at: string | null
          partnership_id: string
          recipient_cpf: string | null
          recipient_name: string | null
          recipient_phone: string | null
          redeemed_at: string | null
          redeemed_by_appointment_id: string | null
          redeemed_by_operator: string | null
          seasonal_theme_key: string | null
          status: string
          theme: string
          token: string
          updated_at: string
          valid_until: string
          wa_message_custom: string | null
          wa_template_id: string | null
        }
        Insert: {
          audio_sent_at?: string | null
          audio_storage_path?: string | null
          audio_wa_message_id?: string | null
          clinic_id?: string
          combo: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_demo?: boolean
          issued_at?: string
          lara_engaged_at?: string | null
          lara_followup_picking_at?: string | null
          lara_followup_sent_24h_at?: string | null
          lara_followup_sent_48h_at?: string | null
          lara_followup_sent_72h_at?: string | null
          lara_followup_state?: string
          notes?: string | null
          opened_at?: string | null
          partnership_id: string
          recipient_cpf?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          redeemed_at?: string | null
          redeemed_by_appointment_id?: string | null
          redeemed_by_operator?: string | null
          seasonal_theme_key?: string | null
          status?: string
          theme?: string
          token: string
          updated_at?: string
          valid_until: string
          wa_message_custom?: string | null
          wa_template_id?: string | null
        }
        Update: {
          audio_sent_at?: string | null
          audio_storage_path?: string | null
          audio_wa_message_id?: string | null
          clinic_id?: string
          combo?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_demo?: boolean
          issued_at?: string
          lara_engaged_at?: string | null
          lara_followup_picking_at?: string | null
          lara_followup_sent_24h_at?: string | null
          lara_followup_sent_48h_at?: string | null
          lara_followup_sent_72h_at?: string | null
          lara_followup_state?: string
          notes?: string | null
          opened_at?: string | null
          partnership_id?: string
          recipient_cpf?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          redeemed_at?: string | null
          redeemed_by_appointment_id?: string | null
          redeemed_by_operator?: string | null
          seasonal_theme_key?: string | null
          status?: string
          theme?: string
          token?: string
          updated_at?: string
          valid_until?: string
          wa_message_custom?: string | null
          wa_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_vouchers_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "b2b_partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcastId: string
          errorMessage: string | null
          id: string
          lead_id: string
          sentAt: string | null
          status: string
        }
        Insert: {
          broadcastId: string
          errorMessage?: string | null
          id: string
          lead_id: string
          sentAt?: string | null
          status?: string
        }
        Update: {
          broadcastId?: string
          errorMessage?: string | null
          id?: string
          lead_id?: string
          sentAt?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcastId_fkey"
            columns: ["broadcastId"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          completedAt: string | null
          createdAt: string
          delivered: number
          failed: number
          id: string
          instanceId: string
          message: string
          name: string
          read: number
          scheduledAt: string | null
          sent: number
          startedAt: string | null
          status: string
          targetFilter: Json
          templateId: string | null
          tenantId: string
          totalRecipients: number
          updatedAt: string
        }
        Insert: {
          completedAt?: string | null
          createdAt?: string
          delivered?: number
          failed?: number
          id: string
          instanceId: string
          message: string
          name: string
          read?: number
          scheduledAt?: string | null
          sent?: number
          startedAt?: string | null
          status?: string
          targetFilter?: Json
          templateId?: string | null
          tenantId: string
          totalRecipients?: number
          updatedAt: string
        }
        Update: {
          completedAt?: string | null
          createdAt?: string
          delivered?: number
          failed?: number
          id?: string
          instanceId?: string
          message?: string
          name?: string
          read?: number
          scheduledAt?: string | null
          sent?: number
          startedAt?: string | null
          status?: string
          targetFilter?: Json
          templateId?: string | null
          tenantId?: string
          totalRecipients?: number
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_instanceId_fkey"
            columns: ["instanceId"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_templateId_fkey"
            columns: ["templateId"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          budget_id: string
          description: string
          id: string
          quantity: number
          sort_order: number
          total_price: number
          unit_price: number
        }
        Insert: {
          budget_id: string
          description: string
          id?: string
          quantity?: number
          sort_order?: number
          total_price: number
          unit_price: number
        }
        Update: {
          budget_id?: string
          description?: string
          id?: string
          quantity?: number
          sort_order?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      case_gallery: {
        Row: {
          clinic_id: string
          consent_acknowledged_at: string
          consent_snapshot: string | null
          created_at: string
          created_by_user_id: string | null
          display_order: number
          focus_area: string
          focus_label: string
          id: string
          is_active: boolean
          months_since_procedure: number
          patient_age: number | null
          patient_gender: string | null
          patient_initials: string
          photo_after_path: string
          photo_before_path: string
          procedure_date: string | null
          summary: string | null
          tags: Json
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          consent_acknowledged_at?: string
          consent_snapshot?: string | null
          created_at?: string
          created_by_user_id?: string | null
          display_order?: number
          focus_area: string
          focus_label: string
          id?: string
          is_active?: boolean
          months_since_procedure: number
          patient_age?: number | null
          patient_gender?: string | null
          patient_initials: string
          photo_after_path: string
          photo_before_path: string
          procedure_date?: string | null
          summary?: string | null
          tags?: Json
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          consent_acknowledged_at?: string
          consent_snapshot?: string | null
          created_at?: string
          created_by_user_id?: string | null
          display_order?: number
          focus_area?: string
          focus_label?: string
          id?: string
          is_active?: boolean
          months_since_procedure?: number
          patient_age?: number | null
          patient_gender?: string | null
          patient_initials?: string
          photo_after_path?: string
          photo_before_path?: string
          procedure_date?: string | null
          summary?: string | null
          tags?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_config: {
        Row: {
          clinic_id: string
          commissions: Json
          fees: Json
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          commissions?: Json
          fees?: Json
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          commissions?: Json
          fees?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          direction: string
          external_id: string | null
          id: string
          installment_number: number | null
          installment_total: number | null
          is_cortesia: boolean
          match_confidence: string | null
          match_reasons: Json | null
          original_amount: number | null
          parent_entry_id: string | null
          patient_id: string | null
          payment_method: string
          procedure_name: string | null
          professional_id: string | null
          raw_data: Json | null
          reconciled_at: string | null
          reconciled_by: string | null
          signature: string | null
          source: string
          transaction_date: string
          transaction_datetime: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          direction: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_cortesia?: boolean
          match_confidence?: string | null
          match_reasons?: Json | null
          original_amount?: number | null
          parent_entry_id?: string | null
          patient_id?: string | null
          payment_method: string
          procedure_name?: string | null
          professional_id?: string | null
          raw_data?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          signature?: string | null
          source?: string
          transaction_date: string
          transaction_datetime?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_cortesia?: boolean
          match_confidence?: string | null
          match_reasons?: Json | null
          original_amount?: number | null
          parent_entry_id?: string | null
          patient_id?: string | null
          payment_method?: string
          procedure_name?: string | null
          professional_id?: string | null
          raw_data?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          signature?: string | null
          source?: string
          transaction_date?: string
          transaction_datetime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "cashflow_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "cashflow_entries_paid_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_alexa_config: {
        Row: {
          auth_token: string | null
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          reception_device_name: string
          room_template: string
          updated_at: string
          webhook_url: string
          welcome_template: string
        }
        Insert: {
          auth_token?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          reception_device_name?: string
          room_template?: string
          updated_at?: string
          webhook_url: string
          welcome_template?: string
        }
        Update: {
          auth_token?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          reception_device_name?: string
          room_template?: string
          updated_at?: string
          webhook_url?: string
          welcome_template?: string
        }
        Relationships: []
      }
      clinic_alexa_devices: {
        Row: {
          clinic_id: string
          created_at: string
          device_name: string
          id: string
          is_active: boolean
          location_label: string | null
          professional_id: string | null
          room_id: string | null
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          device_name: string
          id?: string
          is_active?: boolean
          location_label?: string | null
          professional_id?: string | null
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          device_name?: string
          id?: string
          is_active?: boolean
          location_label?: string | null
          professional_id?: string | null
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_alexa_devices_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_alexa_devices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_alexa_log: {
        Row: {
          attempts: number
          clinic_id: string
          created_at: string
          device: string
          error: string | null
          id: string
          message: string
          patient: string | null
          rule_name: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          device: string
          error?: string | null
          id?: string
          message: string
          patient?: string | null
          rule_name?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          device?: string
          error?: string | null
          id?: string
          message?: string
          patient?: string | null
          rule_name?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      clinic_backup_log: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_backup_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_data: {
        Row: {
          clinic_id: string
          data: Json
          key: string
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string
          data?: Json
          key: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          data?: Json
          key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clinic_injetaveis: {
        Row: {
          apresentacao: string | null
          areas: Json
          ativo: boolean
          categoria: string | null
          clinic_id: string
          contraindicacoes: Json
          created_at: string
          cuidados_pos: Json
          cuidados_pre: Json
          custo_unit: number | null
          downtime: string | null
          duracao: string | null
          estoque_alerta: number
          estoque_qtd: number
          fabricante: string | null
          id: string
          indicacoes: Json
          margem: number | null
          nome: string
          observacoes: string | null
          preco: number | null
          riscos_complicacoes: Json
          texto_consentimento: string | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          apresentacao?: string | null
          areas?: Json
          ativo?: boolean
          categoria?: string | null
          clinic_id: string
          contraindicacoes?: Json
          created_at?: string
          cuidados_pos?: Json
          cuidados_pre?: Json
          custo_unit?: number | null
          downtime?: string | null
          duracao?: string | null
          estoque_alerta?: number
          estoque_qtd?: number
          fabricante?: string | null
          id?: string
          indicacoes?: Json
          margem?: number | null
          nome: string
          observacoes?: string | null
          preco?: number | null
          riscos_complicacoes?: Json
          texto_consentimento?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          apresentacao?: string | null
          areas?: Json
          ativo?: boolean
          categoria?: string | null
          clinic_id?: string
          contraindicacoes?: Json
          created_at?: string
          cuidados_pos?: Json
          cuidados_pre?: Json
          custo_unit?: number | null
          downtime?: string | null
          duracao?: string | null
          estoque_alerta?: number
          estoque_qtd?: number
          fabricante?: string | null
          id?: string
          indicacoes?: Json
          margem?: number | null
          nome?: string
          observacoes?: string | null
          preco?: number | null
          riscos_complicacoes?: Json
          texto_consentimento?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinic_invitations: {
        Row: {
          accepted_at: string | null
          clinic_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          module_permissions: Json | null
          professional_id: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          clinic_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          module_permissions?: Json | null
          professional_id?: string | null
          role: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          clinic_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          module_permissions?: Json | null
          professional_id?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invitations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_module_permissions: {
        Row: {
          allowed: boolean
          clinic_id: string
          id: string
          module_id: string
          page_id: string | null
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          clinic_id?: string
          id?: string
          module_id: string
          page_id?: string | null
          role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          clinic_id?: string
          id?: string
          module_id?: string
          page_id?: string | null
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      clinic_procedimentos: {
        Row: {
          ativo: boolean
          categoria: string | null
          clinic_id: string
          combo_bonus: string | null
          combo_desconto_pct: number | null
          combo_descricao: string | null
          combo_sessoes: number | null
          combo_valor_final: number | null
          contraindicacoes: Json
          created_at: string
          cuidados_pos: Json
          cuidados_pre: Json
          custo_estimado: number | null
          descricao: string | null
          duracao_min: number
          fases: Json | null
          id: string
          intervalo_sessoes_dias: number | null
          margem: number | null
          nome: string
          observacoes: string | null
          partner_pricing_json: Json | null
          preco: number | null
          preco_promo: number | null
          riscos_complicacoes: Json
          sessoes: number
          tecnologia_custo: number | null
          tecnologia_protocolo: string | null
          tecnologia_sessoes: number | null
          texto_consentimento: string | null
          tipo: string
          updated_at: string
          usa_tecnologia: boolean
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          clinic_id: string
          combo_bonus?: string | null
          combo_desconto_pct?: number | null
          combo_descricao?: string | null
          combo_sessoes?: number | null
          combo_valor_final?: number | null
          contraindicacoes?: Json
          created_at?: string
          cuidados_pos?: Json
          cuidados_pre?: Json
          custo_estimado?: number | null
          descricao?: string | null
          duracao_min?: number
          fases?: Json | null
          id?: string
          intervalo_sessoes_dias?: number | null
          margem?: number | null
          nome: string
          observacoes?: string | null
          partner_pricing_json?: Json | null
          preco?: number | null
          preco_promo?: number | null
          riscos_complicacoes?: Json
          sessoes?: number
          tecnologia_custo?: number | null
          tecnologia_protocolo?: string | null
          tecnologia_sessoes?: number | null
          texto_consentimento?: string | null
          tipo?: string
          updated_at?: string
          usa_tecnologia?: boolean
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          clinic_id?: string
          combo_bonus?: string | null
          combo_desconto_pct?: number | null
          combo_descricao?: string | null
          combo_sessoes?: number | null
          combo_valor_final?: number | null
          contraindicacoes?: Json
          created_at?: string
          cuidados_pos?: Json
          cuidados_pre?: Json
          custo_estimado?: number | null
          descricao?: string | null
          duracao_min?: number
          fases?: Json | null
          id?: string
          intervalo_sessoes_dias?: number | null
          margem?: number | null
          nome?: string
          observacoes?: string | null
          partner_pricing_json?: Json | null
          preco?: number | null
          preco_promo?: number | null
          riscos_complicacoes?: Json
          sessoes?: number
          tecnologia_custo?: number | null
          tecnologia_protocolo?: string | null
          tecnologia_sessoes?: number | null
          texto_consentimento?: string | null
          tipo?: string
          updated_at?: string
          usa_tecnologia?: boolean
        }
        Relationships: []
      }
      clinic_rooms: {
        Row: {
          alexa_device_name: string | null
          ativo: boolean
          clinic_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          alexa_device_name?: string | null
          ativo?: boolean
          clinic_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          alexa_device_name?: string | null
          ativo?: boolean
          clinic_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_secrets: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          key: string
          notes: string | null
          updated_at: string
          value: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          id?: string
          key: string
          notes?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          key?: string
          notes?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      clinic_technologies: {
        Row: {
          ano: number | null
          ativo: boolean
          categoria: string | null
          clinic_id: string
          created_at: string
          descricao: string | null
          fabricante: string | null
          id: string
          investimento: number | null
          modelo: string | null
          nome: string
          ponteiras: string | null
          sala_id: string | null
          updated_at: string
        }
        Insert: {
          ano?: number | null
          ativo?: boolean
          categoria?: string | null
          clinic_id: string
          created_at?: string
          descricao?: string | null
          fabricante?: string | null
          id?: string
          investimento?: number | null
          modelo?: string | null
          nome: string
          ponteiras?: string | null
          sala_id?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number | null
          ativo?: boolean
          categoria?: string | null
          clinic_id?: string
          created_at?: string
          descricao?: string | null
          fabricante?: string | null
          id?: string
          investimento?: number | null
          modelo?: string | null
          nome?: string
          ponteiras?: string | null
          sala_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_technologies_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: Json | null
          created_at: string
          description: string | null
          email: string | null
          fiscal: Json | null
          id: string
          name: string
          operating_hours: Json | null
          phone: string | null
          settings: Json | null
          social: Json | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: Json | null
          created_at?: string
          description?: string | null
          email?: string | null
          fiscal?: Json | null
          id?: string
          name: string
          operating_hours?: Json | null
          phone?: string | null
          settings?: Json | null
          social?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: Json | null
          created_at?: string
          description?: string | null
          email?: string | null
          fiscal?: Json | null
          id?: string
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          settings?: Json | null
          social?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          aiControl: boolean
          closedAt: string | null
          createdAt: string
          humanTakeoverAt: string | null
          id: string
          instanceId: string
          lead_id: string
          status: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          aiControl?: boolean
          closedAt?: string | null
          createdAt?: string
          humanTakeoverAt?: string | null
          id: string
          instanceId: string
          lead_id: string
          status?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          aiControl?: boolean
          closedAt?: string | null
          createdAt?: string
          humanTakeoverAt?: string | null
          id?: string
          instanceId?: string
          lead_id?: string
          status?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_instanceId_fkey"
            columns: ["instanceId"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_analyses: {
        Row: {
          analysisResult: Json
          clinic_id: string | null
          createdAt: string
          id: string
          imageUrl: string
          lead_id: string
          recommendation: string | null
          reportUrl: string | null
          tenantId: string
        }
        Insert: {
          analysisResult?: Json
          clinic_id?: string | null
          createdAt?: string
          id: string
          imageUrl: string
          lead_id: string
          recommendation?: string | null
          reportUrl?: string | null
          tenantId: string
        }
        Update: {
          analysisResult?: Json
          clinic_id?: string | null
          createdAt?: string
          id?: string
          imageUrl?: string
          lead_id?: string
          recommendation?: string | null
          reportUrl?: string | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "facial_analyses_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_complaints: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: number
          label: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: number
          label: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: number
          label?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      facial_photos: {
        Row: {
          angle: string
          clinic_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          original_hash: string
          photo_b64: string
        }
        Insert: {
          angle: string
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          original_hash: string
          photo_b64: string
        }
        Update: {
          angle?: string
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          original_hash?: string
          photo_b64?: string
        }
        Relationships: []
      }
      facial_sessions: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          gpt_analysis: Json | null
          id: string
          lead_id: string
          session_data: Json
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          gpt_analysis?: Json | null
          id?: string
          lead_id: string
          session_data: Json
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          gpt_analysis?: Json | null
          id?: string
          lead_id?: string
          session_data?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      facial_share_access_log: {
        Row: {
          accessed_at: string
          id: string
          ip_hash: string | null
          share_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          id?: string
          ip_hash?: string | null
          share_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          id?: string
          ip_hash?: string | null
          share_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facial_share_access_log_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "facial_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_shares: {
        Row: {
          access_count: number
          after_photo_path: string | null
          analysis_text: string | null
          before_photo_path: string | null
          clinic_id: string
          clinic_name_snapshot: string | null
          consent_acknowledged_at: string
          consent_text_snapshot: string | null
          created_at: string
          created_by_user_id: string | null
          cta_phone: string | null
          expires_at: string
          id: string
          last_accessed_at: string | null
          lead_id: string
          lead_name_snapshot: string | null
          metrics: Json
          procedure_label_snapshot: string | null
          professional_name_snapshot: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_reason: string | null
          source_appointment_id: string | null
          status: string
          token: string
        }
        Insert: {
          access_count?: number
          after_photo_path?: string | null
          analysis_text?: string | null
          before_photo_path?: string | null
          clinic_id?: string
          clinic_name_snapshot?: string | null
          consent_acknowledged_at?: string
          consent_text_snapshot?: string | null
          created_at?: string
          created_by_user_id?: string | null
          cta_phone?: string | null
          expires_at: string
          id?: string
          last_accessed_at?: string | null
          lead_id: string
          lead_name_snapshot?: string | null
          metrics?: Json
          procedure_label_snapshot?: string | null
          professional_name_snapshot?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          source_appointment_id?: string | null
          status?: string
          token: string
        }
        Update: {
          access_count?: number
          after_photo_path?: string | null
          analysis_text?: string | null
          before_photo_path?: string | null
          clinic_id?: string
          clinic_name_snapshot?: string | null
          consent_acknowledged_at?: string
          consent_text_snapshot?: string | null
          created_at?: string
          created_by_user_id?: string | null
          cta_phone?: string | null
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          lead_id?: string
          lead_name_snapshot?: string | null
          metrics?: Json
          procedure_label_snapshot?: string | null
          professional_name_snapshot?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          source_appointment_id?: string | null
          status?: string
          token?: string
        }
        Relationships: []
      }
      fin_annual_plan: {
        Row: {
          clinic_id: string
          plan_data: Json
          updated_at: string | null
          year: number
        }
        Insert: {
          clinic_id: string
          plan_data?: Json
          updated_at?: string | null
          year: number
        }
        Update: {
          clinic_id?: string
          plan_data?: Json
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_annual_plan_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_config: {
        Row: {
          clinic_id: string
          demo: Json
          gastos: Json
          procs: Json
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          demo?: Json
          gastos?: Json
          procs?: Json
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          demo?: Json
          gastos?: Json
          procs?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_config_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_goals: {
        Row: {
          clinic_id: string
          meta_data: Json
          month: number
          updated_at: string | null
          year: number
        }
        Insert: {
          clinic_id: string
          meta_data?: Json
          month: number
          updated_at?: string | null
          year: number
        }
        Update: {
          clinic_id?: string
          meta_data?: Json
          month?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_goals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          clinic_id: string
          field_name: string
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          record_id: string
          source_action: string | null
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          clinic_id: string
          field_name: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          record_id: string
          source_action?: string | null
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          clinic_id?: string
          field_name?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          source_action?: string | null
          table_name?: string
        }
        Relationships: []
      }
      flipbook_access_grants: {
        Row: {
          access_token: string
          buyer_email: string | null
          buyer_phone: string
          created_at: string
          expires_at: string | null
          flipbook_id: string | null
          id: string
          metadata: Json
          purchase_id: string | null
          revoked_at: string | null
          subscription_id: string | null
        }
        Insert: {
          access_token: string
          buyer_email?: string | null
          buyer_phone: string
          created_at?: string
          expires_at?: string | null
          flipbook_id?: string | null
          id?: string
          metadata?: Json
          purchase_id?: string | null
          revoked_at?: string | null
          subscription_id?: string | null
        }
        Update: {
          access_token?: string
          buyer_email?: string | null
          buyer_phone?: string
          created_at?: string
          expires_at?: string | null
          flipbook_id?: string | null
          id?: string
          metadata?: Json
          purchase_id?: string | null
          revoked_at?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_access_grants_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_access_grants_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "flipbook_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_access_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "flipbook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_buyers: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          last_touch_at: string
          name: string
          offer_id: string
          phone: string
          product_id: string
          status: string
          updated_at: string
          utm: Json
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_touch_at?: string
          name: string
          offer_id: string
          phone: string
          product_id: string
          status?: string
          updated_at?: string
          utm?: Json
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_touch_at?: string
          name?: string
          offer_id?: string
          phone?: string
          product_id?: string
          status?: string
          updated_at?: string
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_buyers_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_buyers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "flipbook_products"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_comm_dispatches: {
        Row: {
          buyer_id: string
          channel: string
          created_at: string
          error_text: string | null
          event_key: string
          id: string
          provider_id: string | null
          provider_status: string | null
          rendered_body: string | null
          scheduled_for: string
          sent_at: string | null
          sequence_id: string | null
          status: string
          step_id: string | null
          updated_at: string
          variables_used: Json
        }
        Insert: {
          buyer_id: string
          channel?: string
          created_at?: string
          error_text?: string | null
          event_key: string
          id?: string
          provider_id?: string | null
          provider_status?: string | null
          rendered_body?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sequence_id?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string
          variables_used?: Json
        }
        Update: {
          buyer_id?: string
          channel?: string
          created_at?: string
          error_text?: string | null
          event_key?: string
          id?: string
          provider_id?: string | null
          provider_status?: string | null
          rendered_body?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sequence_id?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string
          variables_used?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_comm_dispatches_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_comm_dispatches_event_key_fkey"
            columns: ["event_key"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_event_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "flipbook_comm_dispatches_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_comm_dispatches_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_comm_event_keys: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          trigger_desc: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          trigger_desc?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          trigger_desc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      flipbook_comm_sequence_steps: {
        Row: {
          created_at: string
          delay_minutes: number
          event_key: string
          exit_condition: string | null
          id: string
          is_active: boolean
          position: number
          sequence_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_minutes: number
          event_key: string
          exit_condition?: string | null
          id?: string
          is_active?: boolean
          position: number
          sequence_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          event_key?: string
          exit_condition?: string | null
          id?: string
          is_active?: boolean
          position?: number
          sequence_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_comm_sequence_steps_event_key_fkey"
            columns: ["event_key"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_event_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "flipbook_comm_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_comm_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      flipbook_comm_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          event_key: string
          id: string
          is_active: boolean
          language: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          language?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          language?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_comm_templates_event_key_fkey"
            columns: ["event_key"]
            isOneToOne: false
            referencedRelation: "flipbook_comm_event_keys"
            referencedColumns: ["key"]
          },
        ]
      }
      flipbook_conversion_events: {
        Row: {
          created_at: string
          flipbook_id: string
          id: string
          kind: string
          metadata: Json
          page_number: number | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          flipbook_id: string
          id?: string
          kind: string
          metadata?: Json
          page_number?: number | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          flipbook_id?: string
          id?: string
          kind?: string
          metadata?: Json
          page_number?: number | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_conversion_events_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_interactions: {
        Row: {
          created_at: string
          flipbook_id: string
          height_pct: number
          id: string
          label: string | null
          page_number: number
          payload: Json
          type: string
          updated_at: string
          width_pct: number
          x_pct: number
          y_pct: number
        }
        Insert: {
          created_at?: string
          flipbook_id: string
          height_pct: number
          id?: string
          label?: string | null
          page_number: number
          payload?: Json
          type: string
          updated_at?: string
          width_pct: number
          x_pct: number
          y_pct: number
        }
        Update: {
          created_at?: string
          flipbook_id?: string
          height_pct?: number
          id?: string
          label?: string | null
          page_number?: number
          payload?: Json
          type?: string
          updated_at?: string
          width_pct?: number
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_interactions_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_leads: {
        Row: {
          captured_at: string
          email: string
          flipbook_id: string
          id: string
          opt_in_marketing: boolean
          source_page: number | null
          user_agent: string | null
          whatsapp: string | null
        }
        Insert: {
          captured_at?: string
          email: string
          flipbook_id: string
          id?: string
          opt_in_marketing?: boolean
          source_page?: number | null
          user_agent?: string | null
          whatsapp?: string | null
        }
        Update: {
          captured_at?: string
          email?: string
          flipbook_id?: string
          id?: string
          opt_in_marketing?: boolean
          source_page?: number | null
          user_agent?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_leads_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_offers: {
        Row: {
          active: boolean
          billing: string
          coupon_code: string | null
          created_at: string
          currency: string
          current_purchases: number
          id: string
          max_purchases: number | null
          metadata: Json
          name: string
          price_cents: number
          priority: number
          product_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          billing: string
          coupon_code?: string | null
          created_at?: string
          currency?: string
          current_purchases?: number
          id?: string
          max_purchases?: number | null
          metadata?: Json
          name: string
          price_cents: number
          priority?: number
          product_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          billing?: string
          coupon_code?: string | null
          created_at?: string
          currency?: string
          current_purchases?: number
          id?: string
          max_purchases?: number | null
          metadata?: Json
          name?: string
          price_cents?: number
          priority?: number
          product_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "flipbook_products"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_pdf_versions: {
        Row: {
          flipbook_id: string
          id: string
          label: string | null
          page_count: number | null
          pdf_size_bytes: number | null
          pdf_url: string
          replaced_at: string
          replaced_by: string | null
          version: number
        }
        Insert: {
          flipbook_id: string
          id?: string
          label?: string | null
          page_count?: number | null
          pdf_size_bytes?: number | null
          pdf_url: string
          replaced_at?: string
          replaced_by?: string | null
          version: number
        }
        Update: {
          flipbook_id?: string
          id?: string
          label?: string | null
          page_count?: number | null
          pdf_size_bytes?: number | null
          pdf_url?: string
          replaced_at?: string
          replaced_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_pdf_versions_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          flipbook_id: string | null
          id: string
          kind: string
          metadata: Json
          name: string
          sku: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          flipbook_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          name: string
          sku: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          flipbook_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_products_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_progress: {
        Row: {
          flipbook_id: string
          id: string
          last_page: number
          total_pages: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          flipbook_id: string
          id?: string
          last_page?: number
          total_pages?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          flipbook_id?: string
          id?: string
          last_page?: number
          total_pages?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_progress_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_purchases: {
        Row: {
          amount_cents: number
          buyer_cpf: string | null
          buyer_email: string | null
          buyer_id: string
          buyer_name: string
          buyer_phone: string
          created_at: string
          currency: string
          gateway: string
          gateway_charge_id: string
          gateway_invoice_url: string | null
          id: string
          metadata: Json
          offer_id: string
          paid_at: string | null
          product_id: string
          refunded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          buyer_cpf?: string | null
          buyer_email?: string | null
          buyer_id: string
          buyer_name: string
          buyer_phone: string
          created_at?: string
          currency?: string
          gateway?: string
          gateway_charge_id: string
          gateway_invoice_url?: string | null
          id?: string
          metadata?: Json
          offer_id: string
          paid_at?: string | null
          product_id: string
          refunded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          buyer_cpf?: string | null
          buyer_email?: string | null
          buyer_id?: string
          buyer_name?: string
          buyer_phone?: string
          created_at?: string
          currency?: string
          gateway?: string
          gateway_charge_id?: string
          gateway_invoice_url?: string | null
          id?: string
          metadata?: Json
          offer_id?: string
          paid_at?: string | null
          product_id?: string
          refunded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_purchases_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "flipbook_products"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_subscriptions: {
        Row: {
          amount_cents: number
          billing_cycle: string
          buyer_id: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          ended_at: string | null
          gateway: string
          gateway_customer_id: string | null
          gateway_subscription_id: string
          id: string
          metadata: Json
          offer_id: string
          product_id: string
          status: string
          subscriber_cpf: string | null
          subscriber_email: string | null
          subscriber_name: string
          subscriber_phone: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          billing_cycle: string
          buyer_id: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end: string
          current_period_start?: string
          ended_at?: string | null
          gateway?: string
          gateway_customer_id?: string | null
          gateway_subscription_id: string
          id?: string
          metadata?: Json
          offer_id: string
          product_id: string
          status?: string
          subscriber_cpf?: string | null
          subscriber_email?: string | null
          subscriber_name: string
          subscriber_phone: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_cycle?: string
          buyer_id?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          gateway?: string
          gateway_customer_id?: string | null
          gateway_subscription_id?: string
          id?: string
          metadata?: Json
          offer_id?: string
          product_id?: string
          status?: string
          subscriber_cpf?: string | null
          subscriber_email?: string | null
          subscriber_name?: string
          subscriber_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_subscriptions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_subscriptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipbook_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "flipbook_products"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbook_views: {
        Row: {
          created_at: string
          duration_ms: number | null
          flipbook_id: string
          id: string
          page_number: number | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          flipbook_id: string
          id?: string
          page_number?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          flipbook_id?: string
          id?: string
          page_number?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flipbook_views_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      flipbooks: {
        Row: {
          access_password_hash: string | null
          amazon_asin: string | null
          author: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          edition: string | null
          format: string
          id: string
          language: string
          metadata: Json
          page_count: number | null
          pdf_url: string
          preview_count: number
          published_at: string | null
          settings: Json
          slug: string
          status: string
          subtitle: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          access_password_hash?: string | null
          amazon_asin?: string | null
          author?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          edition?: string | null
          format?: string
          id?: string
          language?: string
          metadata?: Json
          page_count?: number | null
          pdf_url: string
          preview_count?: number
          published_at?: string | null
          settings?: Json
          slug: string
          status?: string
          subtitle?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          access_password_hash?: string | null
          amazon_asin?: string | null
          author?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          edition?: string | null
          format?: string
          id?: string
          language?: string
          metadata?: Json
          page_count?: number | null
          pdf_url?: string
          preview_count?: number
          published_at?: string | null
          settings?: Json
          slug?: string
          status?: string
          subtitle?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      fm_share_rate_log: {
        Row: {
          attempts: number
          ip_hash: string
          token_hash: string
          window_start: string
        }
        Insert: {
          attempts?: number
          ip_hash?: string
          token_hash: string
          window_start?: string
        }
        Update: {
          attempts?: number
          ip_hash?: string
          token_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      fm_storage_cleanup_queue: {
        Row: {
          attempts: number
          bucket: string
          enqueued_at: string
          id: number
          last_attempt_at: string | null
          last_error: string | null
          processed_at: string | null
          reason: string
          source_share_id: string | null
          storage_path: string
        }
        Insert: {
          attempts?: number
          bucket: string
          enqueued_at?: string
          id?: never
          last_attempt_at?: string | null
          last_error?: string | null
          processed_at?: string | null
          reason?: string
          source_share_id?: string | null
          storage_path: string
        }
        Update: {
          attempts?: number
          bucket?: string
          enqueued_at?: string
          id?: never
          last_attempt_at?: string | null
          last_error?: string | null
          processed_at?: string | null
          reason?: string
          source_share_id?: string | null
          storage_path?: string
        }
        Relationships: []
      }
      growth_tracker_items: {
        Row: {
          checked: boolean
          clinic_id: string
          due_date: string | null
          item_id: string
          notes: string | null
          owner: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checked?: boolean
          clinic_id?: string
          due_date?: string | null
          item_id: string
          notes?: string | null
          owner?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checked?: boolean
          clinic_id?: string
          due_date?: string | null
          item_id?: string
          notes?: string | null
          owner?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inbox_notifications: {
        Row: {
          clinic_id: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          payload: Json
          read_at: string | null
          read_by: string | null
          reason: string
          source: string
        }
        Insert: {
          clinic_id?: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          read_at?: string | null
          read_by?: string | null
          reason: string
          source: string
        }
        Update: {
          clinic_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          read_at?: string | null
          read_by?: string | null
          reason?: string
          source?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          content: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          duration_sec: number | null
          id: string
          lead_id: string
          metadata: Json | null
          outcome: string | null
          type: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_sec?: number | null
          id?: string
          lead_id: string
          metadata?: Json | null
          outcome?: string | null
          type: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_sec?: number | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          outcome?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_alerts: {
        Row: {
          clinic_id: string
          corpo: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          lido: boolean
          lido_at: string | null
          para: string
          template_slug: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          clinic_id: string
          corpo?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          lido?: boolean
          lido_at?: string | null
          para?: string
          template_slug?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          clinic_id?: string
          corpo?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          lido?: boolean
          lido_at?: string | null
          para?: string
          template_slug?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_alerts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      lara_templates: {
        Row: {
          active: boolean
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          system_prompt: string | null
          template_key: string
          user_template: string
          variant: string | null
          version: number
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          system_prompt?: string | null
          template_key: string
          user_template: string
          variant?: string | null
          version?: number
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          system_prompt?: string | null
          template_key?: string
          user_template?: string
          variant?: string | null
          version?: number
          weight?: number
        }
        Relationships: []
      }
      lead_pipeline_positions: {
        Row: {
          entered_at: string
          id: string
          lead_id: string
          moved_by: string | null
          origin: string
          pipeline_id: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          entered_at?: string
          id?: string
          lead_id: string
          moved_by?: string | null
          origin?: string
          pipeline_id: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          entered_at?: string
          id?: string
          lead_id?: string
          moved_by?: string | null
          origin?: string
          pipeline_id?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_pipeline_positions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_pipeline_positions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          createdAt: string
          lead_id: string
          tagId: string
        }
        Insert: {
          createdAt?: string
          lead_id: string
          tagId: string
        }
        Update: {
          createdAt?: string
          lead_id?: string
          tagId?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_persona: string
          assigned_to: string | null
          birth_date: string | null
          channel_mode: string
          clinic_id: string
          cpf: string | null
          created_at: string
          day_bucket: number | null
          deleted_at: string | null
          email: string | null
          funnel: string
          id: string
          idade: number | null
          is_in_recovery: boolean
          last_contacted_at: string | null
          last_response_at: string | null
          lead_score: number
          lost_at: string | null
          lost_by: string | null
          lost_reason: string | null
          metadata: Json
          name: string
          phase: string
          phase_origin: string | null
          phase_updated_at: string | null
          phase_updated_by: string | null
          phone: string
          priority: string
          queixas_faciais: Json
          rg: string | null
          source: string
          source_quiz_id: string | null
          source_type: string
          temperature: string
          updated_at: string
          wa_opt_in: boolean
        }
        Insert: {
          ai_persona?: string
          assigned_to?: string | null
          birth_date?: string | null
          channel_mode?: string
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          day_bucket?: number | null
          deleted_at?: string | null
          email?: string | null
          funnel?: string
          id?: string
          idade?: number | null
          is_in_recovery?: boolean
          last_contacted_at?: string | null
          last_response_at?: string | null
          lead_score?: number
          lost_at?: string | null
          lost_by?: string | null
          lost_reason?: string | null
          metadata?: Json
          name?: string
          phase?: string
          phase_origin?: string | null
          phase_updated_at?: string | null
          phase_updated_by?: string | null
          phone?: string
          priority?: string
          queixas_faciais?: Json
          rg?: string | null
          source?: string
          source_quiz_id?: string | null
          source_type?: string
          temperature?: string
          updated_at?: string
          wa_opt_in?: boolean
        }
        Update: {
          ai_persona?: string
          assigned_to?: string | null
          birth_date?: string | null
          channel_mode?: string
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          day_bucket?: number | null
          deleted_at?: string | null
          email?: string | null
          funnel?: string
          id?: string
          idade?: number | null
          is_in_recovery?: boolean
          last_contacted_at?: string | null
          last_response_at?: string | null
          lead_score?: number
          lost_at?: string | null
          lost_by?: string | null
          lost_reason?: string | null
          metadata?: Json
          name?: string
          phase?: string
          phase_origin?: string | null
          phase_updated_at?: string | null
          phase_updated_by?: string | null
          phone?: string
          priority?: string
          queixas_faciais?: Json
          rg?: string | null
          source?: string
          source_quiz_id?: string | null
          source_type?: string
          temperature?: string
          updated_at?: string
          wa_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "leads_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_audit: {
        Row: {
          action: string
          changed_by: string | null
          clinic_id: string | null
          created_at: string | null
          id: string
          lead_id: string
          old_data: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          lead_id: string
          old_data?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string
          old_data?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      leads_backup_pre_refactor: {
        Row: {
          ai_persona: string | null
          assigned_to: string | null
          birth_date: string | null
          channel_mode: string | null
          clinic_id: string | null
          cnpj: string | null
          convenio: string | null
          conversation_status: string | null
          cor: string | null
          cpf: string | null
          created_at: string | null
          data: Json | null
          day_bucket: number | null
          deleted_at: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          funnel: string | null
          id: string | null
          idade: number | null
          is_active: boolean | null
          is_in_recovery: boolean | null
          last_contacted_at: string | null
          last_response_at: string | null
          lead_score: number | null
          lost_at: string | null
          lost_by: string | null
          lost_reason: string | null
          name: string | null
          origem: string | null
          phase: string | null
          phase_origin: string | null
          phase_updated_at: string | null
          phase_updated_by: string | null
          phone: string | null
          priority: string | null
          profissao: string | null
          queixas_corporais: Json | null
          queixas_faciais: Json | null
          rg: string | null
          sexo: string | null
          source_quiz_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          tags_clinica: string[] | null
          temperature: string | null
          tipo: string | null
          updated_at: string | null
          wa_opt_in: boolean | null
        }
        Insert: {
          ai_persona?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          channel_mode?: string | null
          clinic_id?: string | null
          cnpj?: string | null
          convenio?: string | null
          conversation_status?: string | null
          cor?: string | null
          cpf?: string | null
          created_at?: string | null
          data?: Json | null
          day_bucket?: number | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          funnel?: string | null
          id?: string | null
          idade?: number | null
          is_active?: boolean | null
          is_in_recovery?: boolean | null
          last_contacted_at?: string | null
          last_response_at?: string | null
          lead_score?: number | null
          lost_at?: string | null
          lost_by?: string | null
          lost_reason?: string | null
          name?: string | null
          origem?: string | null
          phase?: string | null
          phase_origin?: string | null
          phase_updated_at?: string | null
          phase_updated_by?: string | null
          phone?: string | null
          priority?: string | null
          profissao?: string | null
          queixas_corporais?: Json | null
          queixas_faciais?: Json | null
          rg?: string | null
          sexo?: string | null
          source_quiz_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          tags_clinica?: string[] | null
          temperature?: string | null
          tipo?: string | null
          updated_at?: string | null
          wa_opt_in?: boolean | null
        }
        Update: {
          ai_persona?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          channel_mode?: string | null
          clinic_id?: string | null
          cnpj?: string | null
          convenio?: string | null
          conversation_status?: string | null
          cor?: string | null
          cpf?: string | null
          created_at?: string | null
          data?: Json | null
          day_bucket?: number | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          funnel?: string | null
          id?: string | null
          idade?: number | null
          is_active?: boolean | null
          is_in_recovery?: boolean | null
          last_contacted_at?: string | null
          last_response_at?: string | null
          lead_score?: number | null
          lost_at?: string | null
          lost_by?: string | null
          lost_reason?: string | null
          name?: string | null
          origem?: string | null
          phase?: string | null
          phase_origin?: string | null
          phase_updated_at?: string | null
          phase_updated_by?: string | null
          phone?: string | null
          priority?: string | null
          profissao?: string | null
          queixas_corporais?: Json | null
          queixas_faciais?: Json | null
          rg?: string | null
          sexo?: string | null
          source_quiz_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          tags_clinica?: string[] | null
          temperature?: string | null
          tipo?: string | null
          updated_at?: string | null
          wa_opt_in?: boolean | null
        }
        Relationships: []
      }
      legal_doc_procedure_blocks: {
        Row: {
          alternativas: string | null
          beneficios: string | null
          clinic_id: string
          conforto: string | null
          contraindicacoes: string | null
          created_at: string
          cuidados_pos: string | null
          cuidados_pre: string | null
          descricao: string | null
          finalidade: string | null
          id: string
          is_active: boolean
          procedure_keys: Json
          procedure_name: string
          resultados: string | null
          riscos: string | null
          updated_at: string
        }
        Insert: {
          alternativas?: string | null
          beneficios?: string | null
          clinic_id?: string
          conforto?: string | null
          contraindicacoes?: string | null
          created_at?: string
          cuidados_pos?: string | null
          cuidados_pre?: string | null
          descricao?: string | null
          finalidade?: string | null
          id?: string
          is_active?: boolean
          procedure_keys?: Json
          procedure_name: string
          resultados?: string | null
          riscos?: string | null
          updated_at?: string
        }
        Update: {
          alternativas?: string | null
          beneficios?: string | null
          clinic_id?: string
          conforto?: string | null
          contraindicacoes?: string | null
          created_at?: string
          cuidados_pos?: string | null
          cuidados_pre?: string | null
          descricao?: string | null
          finalidade?: string | null
          id?: string
          is_active?: boolean
          procedure_keys?: Json
          procedure_name?: string
          resultados?: string | null
          riscos?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      legal_doc_requests: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          content_snapshot: string
          created_at: string
          document_hash: string | null
          expires_at: string
          id: string
          patient_cpf: string | null
          patient_id: string | null
          patient_name: string
          patient_phone: string | null
          professional_name: string | null
          professional_reg: string | null
          professional_spec: string | null
          public_slug: string
          revoked_at: string | null
          signed_at: string | null
          status: string
          template_id: string
          token_hash: string
          viewed_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string
          content_snapshot: string
          created_at?: string
          document_hash?: string | null
          expires_at?: string
          id?: string
          patient_cpf?: string | null
          patient_id?: string | null
          patient_name: string
          patient_phone?: string | null
          professional_name?: string | null
          professional_reg?: string | null
          professional_spec?: string | null
          public_slug: string
          revoked_at?: string | null
          signed_at?: string | null
          status?: string
          template_id: string
          token_hash: string
          viewed_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          content_snapshot?: string
          created_at?: string
          document_hash?: string | null
          expires_at?: string
          id?: string
          patient_cpf?: string | null
          patient_id?: string | null
          patient_name?: string
          patient_phone?: string | null
          professional_name?: string | null
          professional_reg?: string | null
          professional_spec?: string | null
          public_slug?: string
          revoked_at?: string | null
          signed_at?: string | null
          status?: string
          template_id?: string
          token_hash?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_doc_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "legal_doc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_doc_signatures: {
        Row: {
          acceptance_text: string
          document_hash: string
          geolocation: Json | null
          id: string
          ip_address: string | null
          request_id: string
          signature_data_url: string
          signed_at: string
          signer_cpf: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          acceptance_text?: string
          document_hash: string
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          request_id: string
          signature_data_url: string
          signed_at?: string
          signer_cpf?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          acceptance_text?: string
          document_hash?: string
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          request_id?: string
          signature_data_url?: string
          signed_at?: string
          signer_cpf?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_doc_signatures_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "legal_doc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_doc_templates: {
        Row: {
          clinic_id: string
          content: string
          created_at: string
          deleted_at: string | null
          doc_type: string
          id: string
          is_active: boolean
          name: string
          professional_id: string | null
          redirect_url: string | null
          slug: string
          tracking_scripts: string | null
          trigger_procedures: Json | null
          trigger_status: string | null
          updated_at: string
          updated_by: string | null
          variables: Json
          version: number
        }
        Insert: {
          clinic_id?: string
          content: string
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          id?: string
          is_active?: boolean
          name: string
          professional_id?: string | null
          redirect_url?: string | null
          slug: string
          tracking_scripts?: string | null
          trigger_procedures?: Json | null
          trigger_status?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Update: {
          clinic_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          id?: string
          is_active?: boolean
          name?: string
          professional_id?: string | null
          redirect_url?: string | null
          slug?: string
          tracking_scripts?: string | null
          trigger_procedures?: Json | null
          trigger_status?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "legal_doc_templates_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_doc_token_failures: {
        Row: {
          failed_at: string
          id: number
          ip_address: string | null
          slug: string
        }
        Insert: {
          failed_at?: string
          id?: never
          ip_address?: string | null
          slug: string
        }
        Update: {
          failed_at?: string
          id?: never
          ip_address?: string | null
          slug?: string
        }
        Relationships: []
      }
      lp_book_orders: {
        Row: {
          block_id: string | null
          buy_button_variant: string | null
          buyer_status_snapshot: string | null
          created_at: string
          flipbook_buyer_id: string | null
          flipbook_id: string | null
          id: number
          invoice_url: string | null
          lp_id: string
          offer_id: string | null
          product_id: string | null
        }
        Insert: {
          block_id?: string | null
          buy_button_variant?: string | null
          buyer_status_snapshot?: string | null
          created_at?: string
          flipbook_buyer_id?: string | null
          flipbook_id?: string | null
          id?: number
          invoice_url?: string | null
          lp_id: string
          offer_id?: string | null
          product_id?: string | null
        }
        Update: {
          block_id?: string | null
          buy_button_variant?: string | null
          buyer_status_snapshot?: string | null
          created_at?: string
          flipbook_buyer_id?: string | null
          flipbook_id?: string | null
          id?: number
          invoice_url?: string | null
          lp_id?: string
          offer_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lp_book_orders_flipbook_buyer_id_fkey"
            columns: ["flipbook_buyer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_book_orders_flipbook_id_fkey"
            columns: ["flipbook_id"]
            isOneToOne: false
            referencedRelation: "flipbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_book_orders_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: false
            referencedRelation: "lp_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_book_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "flipbook_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_book_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "flipbook_products"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_consents: {
        Row: {
          clinic_id: string
          consents: Json
          created_at: string
          id: string
          ip_hash: string | null
          page_slug: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          clinic_id?: string
          consents?: Json
          created_at?: string
          id?: string
          ip_hash?: string | null
          page_slug: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          clinic_id?: string
          consents?: Json
          created_at?: string
          id?: string
          ip_hash?: string | null
          page_slug?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      lp_engagement_events: {
        Row: {
          clinic_id: string
          created_at: string
          event_type: string
          id: number
          page_slug: string
          payload: Json
          visitor_id: string | null
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          event_type: string
          id?: number
          page_slug: string
          payload?: Json
          visitor_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          event_type?: string
          id?: number
          page_slug?: string
          payload?: Json
          visitor_id?: string | null
        }
        Relationships: []
      }
      lp_interactions: {
        Row: {
          block_idx: number | null
          clinic_id: string
          created_at: string
          event_type: string
          id: number
          page_slug: string
          scroll_pct: number | null
          viewport_h: number | null
          viewport_w: number | null
          visitor_id: string | null
          x_pct: number | null
          y_pct: number | null
        }
        Insert: {
          block_idx?: number | null
          clinic_id?: string
          created_at?: string
          event_type: string
          id?: number
          page_slug: string
          scroll_pct?: number | null
          viewport_h?: number | null
          viewport_w?: number | null
          visitor_id?: string | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Update: {
          block_idx?: number | null
          clinic_id?: string
          created_at?: string
          event_type?: string
          id?: number
          page_slug?: string
          scroll_pct?: number | null
          viewport_h?: number | null
          viewport_w?: number | null
          visitor_id?: string | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Relationships: []
      }
      lp_journey_events: {
        Row: {
          clinic_id: string
          created_at: string
          from_slug: string | null
          id: string
          meta: Json
          to_slug: string
          visitor_id: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          from_slug?: string | null
          id?: string
          meta?: Json
          to_slug: string
          visitor_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          from_slug?: string | null
          id?: string
          meta?: Json
          to_slug?: string
          visitor_id?: string
        }
        Relationships: []
      }
      lp_leads: {
        Row: {
          clinic_id: string
          created_at: string
          data: Json
          id: string
          ip: string | null
          page_slug: string
          status: string
          ua: string | null
          utm: Json | null
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          data?: Json
          id?: string
          ip?: string | null
          page_slug: string
          status?: string
          ua?: string | null
          utm?: Json | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          data?: Json
          id?: string
          ip?: string | null
          page_slug?: string
          status?: string
          ua?: string | null
          utm?: Json | null
        }
        Relationships: []
      }
      lp_pages: {
        Row: {
          ab_variant_slug: string | null
          blocks: Json
          clinic_id: string
          conversions: number
          created_at: string
          current_revision_id: string | null
          id: string
          lgpd_config: Json
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          publish_at: string | null
          published_at: string | null
          schema_org: Json
          slug: string
          status: string
          title: string
          tokens_override: Json
          tracking: Json
          unpublish_at: string | null
          updated_at: string
          views: number
        }
        Insert: {
          ab_variant_slug?: string | null
          blocks?: Json
          clinic_id?: string
          conversions?: number
          created_at?: string
          current_revision_id?: string | null
          id?: string
          lgpd_config?: Json
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          publish_at?: string | null
          published_at?: string | null
          schema_org?: Json
          slug: string
          status?: string
          title: string
          tokens_override?: Json
          tracking?: Json
          unpublish_at?: string | null
          updated_at?: string
          views?: number
        }
        Update: {
          ab_variant_slug?: string | null
          blocks?: Json
          clinic_id?: string
          conversions?: number
          created_at?: string
          current_revision_id?: string | null
          id?: string
          lgpd_config?: Json
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          publish_at?: string | null
          published_at?: string | null
          schema_org?: Json
          slug?: string
          status?: string
          title?: string
          tokens_override?: Json
          tracking?: Json
          unpublish_at?: string | null
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "lp_pages_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "lp_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_rate_limit_whitelist: {
        Row: {
          created_at: string
          ip_hash: string
          note: string | null
        }
        Insert: {
          created_at?: string
          ip_hash: string
          note?: string | null
        }
        Update: {
          created_at?: string
          ip_hash?: string
          note?: string | null
        }
        Relationships: []
      }
      lp_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          ip_hash?: string
        }
        Relationships: []
      }
      lp_revisions: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          page_id: string
          snapshot: Json
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          page_id: string
          snapshot: Json
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          page_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lp_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "lp_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_templates: {
        Row: {
          blocks: Json
          category: string
          clinic_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          tokens_override: Json | null
        }
        Insert: {
          blocks?: Json
          category?: string
          clinic_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          tokens_override?: Json | null
        }
        Update: {
          blocks?: Json
          category?: string
          clinic_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          tokens_override?: Json | null
        }
        Relationships: []
      }
      lp_webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event: string
          id: number
          lead_id: string | null
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event: string
          id?: number
          lead_id?: string | null
          payload: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event?: string
          id?: number
          lead_id?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lp_webhook_deliveries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lp_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "lp_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_webhooks: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          events: string[]
          headers: Json
          id: string
          label: string | null
          page_slug: string | null
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          events?: string[]
          headers?: Json
          id?: string
          label?: string | null
          page_slug?: string | null
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          events?: string[]
          headers?: Json
          id?: string
          label?: string | null
          page_slug?: string | null
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      magazine_assets: {
        Row: {
          alt: string | null
          clinic_id: string
          created_at: string
          edition_id: string | null
          height: number | null
          id: string
          meta: Json
          size_kb: number | null
          srcset: Json | null
          type: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          clinic_id: string
          created_at?: string
          edition_id?: string | null
          height?: number | null
          id?: string
          meta?: Json
          size_kb?: number | null
          srcset?: Json | null
          type: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          clinic_id?: string
          created_at?: string
          edition_id?: string | null
          height?: number | null
          id?: string
          meta?: Json
          size_kb?: number | null
          srcset?: Json | null
          type?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "magazine_assets_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_assets_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_audit_log: {
        Row: {
          action: string
          actor: string | null
          clinic_id: string
          created_at: string
          id: string
          meta: Json
          subject: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          meta?: Json
          subject?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          meta?: Json
          subject?: string | null
        }
        Relationships: []
      }
      magazine_block_events: {
        Row: {
          block_idx: number
          block_type: string
          clinic_id: string
          created_at: string
          edition_id: string
          event_type: string
          id: string
          lead_id: string | null
          meta: Json
          page_id: string
        }
        Insert: {
          block_idx: number
          block_type: string
          clinic_id: string
          created_at?: string
          edition_id: string
          event_type: string
          id?: string
          lead_id?: string | null
          meta?: Json
          page_id: string
        }
        Update: {
          block_idx?: number
          block_type?: string
          clinic_id?: string
          created_at?: string
          edition_id?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          meta?: Json
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_block_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_block_events_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_block_events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "magazine_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_briefs: {
        Row: {
          asset_ids: string[] | null
          clinic_id: string
          created_at: string
          created_by: string | null
          edition_id: string | null
          error_message: string | null
          id: string
          month_year: string | null
          objective: string | null
          processed_at: string | null
          references_text: string | null
          sections: Json
          status: string
          submitted_at: string | null
          theme: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          asset_ids?: string[] | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          edition_id?: string | null
          error_message?: string | null
          id?: string
          month_year?: string | null
          objective?: string | null
          processed_at?: string | null
          references_text?: string | null
          sections?: Json
          status?: string
          submitted_at?: string | null
          theme?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          asset_ids?: string[] | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          edition_id?: string | null
          error_message?: string | null
          id?: string
          month_year?: string | null
          objective?: string | null
          processed_at?: string | null
          references_text?: string | null
          sections?: Json
          status?: string
          submitted_at?: string | null
          theme?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_briefs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_briefs_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      magazine_dispatches: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          edition_id: string
          error_message: string | null
          executed_at: string | null
          id: string
          message_template: string
          parent_dispatch_id: string | null
          scheduled_at: string
          segment: Json
          stats: Json
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          edition_id: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          message_template: string
          parent_dispatch_id?: string | null
          scheduled_at: string
          segment?: Json
          stats?: Json
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          edition_id?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          message_template?: string
          parent_dispatch_id?: string | null
          scheduled_at?: string
          segment?: Json
          stats?: Json
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_dispatches_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_dispatches_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_dispatches_parent_dispatch_id_fkey"
            columns: ["parent_dispatch_id"]
            isOneToOne: false
            referencedRelation: "magazine_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_editions: {
        Row: {
          archived_at: string | null
          clinic_id: string
          cover_template_slug: string | null
          created_at: string
          created_by: string | null
          edition_number: number | null
          expires_at: string | null
          hero_asset_id: string | null
          hidden_icon_page_id: string | null
          id: string
          personalization_config: Json
          published_at: string | null
          segment_versions: Json
          slug: string
          status: string
          subtitle: string | null
          theme: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          cover_template_slug?: string | null
          created_at?: string
          created_by?: string | null
          edition_number?: number | null
          expires_at?: string | null
          hero_asset_id?: string | null
          hidden_icon_page_id?: string | null
          id?: string
          personalization_config?: Json
          published_at?: string | null
          segment_versions?: Json
          slug: string
          status?: string
          subtitle?: string | null
          theme?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          cover_template_slug?: string | null
          created_at?: string
          created_by?: string | null
          edition_number?: number | null
          expires_at?: string | null
          hero_asset_id?: string | null
          hidden_icon_page_id?: string | null
          id?: string
          personalization_config?: Json
          published_at?: string | null
          segment_versions?: Json
          slug?: string
          status?: string
          subtitle?: string | null
          theme?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_editions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_editions_cover_template_slug_fkey"
            columns: ["cover_template_slug"]
            isOneToOne: false
            referencedRelation: "magazine_templates"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "magazine_editions_hero_asset_fk"
            columns: ["hero_asset_id"]
            isOneToOne: false
            referencedRelation: "magazine_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_editions_hidden_icon_page_id_fkey"
            columns: ["hidden_icon_page_id"]
            isOneToOne: false
            referencedRelation: "magazine_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_pages: {
        Row: {
          created_at: string
          edition_id: string
          hidden_icon_pos: Json | null
          id: string
          is_hidden_icon_page: boolean
          order_index: number
          segment_scope: string[]
          slots: Json
          tcle_consent_given_at: string | null
          template_slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          edition_id: string
          hidden_icon_pos?: Json | null
          id?: string
          is_hidden_icon_page?: boolean
          order_index: number
          segment_scope?: string[]
          slots?: Json
          tcle_consent_given_at?: string | null
          template_slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          edition_id?: string
          hidden_icon_pos?: Json | null
          id?: string
          is_hidden_icon_page?: boolean
          order_index?: number
          segment_scope?: string[]
          slots?: Json
          tcle_consent_given_at?: string | null
          template_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_pages_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_pages_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "magazine_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      magazine_pending_invites: {
        Row: {
          claimed_appt_id: string | null
          claimed_at: string | null
          clinic_id: string
          created_at: string
          edition_id: string
          expires_at: string
          id: string
          invited_name: string | null
          invited_phone: string
          referrer_lead_id: string
          status: string
        }
        Insert: {
          claimed_appt_id?: string | null
          claimed_at?: string | null
          clinic_id: string
          created_at?: string
          edition_id: string
          expires_at?: string
          id?: string
          invited_name?: string | null
          invited_phone: string
          referrer_lead_id: string
          status?: string
        }
        Update: {
          claimed_appt_id?: string | null
          claimed_at?: string | null
          clinic_id?: string
          created_at?: string
          edition_id?: string
          expires_at?: string
          id?: string
          invited_name?: string | null
          invited_phone?: string
          referrer_lead_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_pending_invites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_pending_invites_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_prompt_library: {
        Row: {
          aplicavel_a: string[] | null
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          prompt_text: string
          updated_at: string
          usado_n: number
        }
        Insert: {
          aplicavel_a?: string[] | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          prompt_text: string
          updated_at?: string
          usado_n?: number
        }
        Update: {
          aplicavel_a?: string[] | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          prompt_text?: string
          updated_at?: string
          usado_n?: number
        }
        Relationships: [
          {
            foreignKeyName: "magazine_prompt_library_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_reactions: {
        Row: {
          clinic_id: string
          created_at: string
          edition_id: string
          id: string
          lead_id: string
          page_id: string | null
          reaction_type: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          edition_id: string
          id?: string
          lead_id: string
          page_id?: string | null
          reaction_type: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          edition_id?: string
          id?: string
          lead_id?: string
          page_id?: string | null
          reaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_reactions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_reactions_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_reactions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "magazine_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_reads: {
        Row: {
          clinic_id: string
          completed: boolean
          created_at: string
          edition_id: string
          first_open_ip_hash: string | null
          hidden_icon_found: boolean
          id: string
          last_page_index: number
          lead_id: string
          opened_at: string | null
          page_metrics: Json
          pages_completed: number[]
          personalizations: Json
          quiz_completed: boolean
          quiz_started: boolean
          segment: string | null
          shared: boolean
          time_spent_sec: number
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          clinic_id: string
          completed?: boolean
          created_at?: string
          edition_id: string
          first_open_ip_hash?: string | null
          hidden_icon_found?: boolean
          id?: string
          last_page_index?: number
          lead_id: string
          opened_at?: string | null
          page_metrics?: Json
          pages_completed?: number[]
          personalizations?: Json
          quiz_completed?: boolean
          quiz_started?: boolean
          segment?: string | null
          shared?: boolean
          time_spent_sec?: number
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          clinic_id?: string
          completed?: boolean
          created_at?: string
          edition_id?: string
          first_open_ip_hash?: string | null
          hidden_icon_found?: boolean
          id?: string
          last_page_index?: number
          lead_id?: string
          opened_at?: string | null
          page_metrics?: Json
          pages_completed?: number[]
          personalizations?: Json
          quiz_completed?: boolean
          quiz_started?: boolean
          segment?: string | null
          shared?: boolean
          time_spent_sec?: number
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "magazine_reads_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_reads_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_rewards: {
        Row: {
          amount: number
          cashback_tx_id: string | null
          claimed_at: string
          clinic_id: string
          edition_id: string
          id: string
          lead_id: string
          meta: Json
          reward_type: string
        }
        Insert: {
          amount?: number
          cashback_tx_id?: string | null
          claimed_at?: string
          clinic_id: string
          edition_id: string
          id?: string
          lead_id: string
          meta?: Json
          reward_type: string
        }
        Update: {
          amount?: number
          cashback_tx_id?: string | null
          claimed_at?: string
          clinic_id?: string
          edition_id?: string
          id?: string
          lead_id?: string
          meta?: Json
          reward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_rewards_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_rewards_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "magazine_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_templates: {
        Row: {
          active: boolean
          category: string
          created_at: string
          css_scoped: string | null
          html_template: string
          id: string
          name: string
          preview_svg: string | null
          slots_schema: Json
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          css_scoped?: string | null
          html_template: string
          id?: string
          name: string
          preview_svg?: string | null
          slots_schema?: Json
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          css_scoped?: string | null
          html_template?: string
          id?: string
          name?: string
          preview_svg?: string | null
          slots_schema?: Json
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      medical_record_attachments: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          patient_id: string
          record_id: string | null
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          patient_id: string
          record_id?: string | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          patient_id?: string
          record_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_attachments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_attachments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          content: string
          created_at: string | null
          deleted_at: string | null
          id: string
          is_confidential: boolean
          patient_id: string
          professional_id: string | null
          record_type: string
          source: string
          source_ref_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_confidential?: boolean
          patient_id: string
          professional_id?: string | null
          record_type?: string
          source?: string
          source_ref_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_confidential?: boolean
          patient_id?: string
          professional_id?: string | null
          record_type?: string
          source?: string
          source_ref_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          category: string
          content: string
          createdAt: string
          id: string
          name: string
          performanceScore: number
          tenantId: string
          tone: string
          updatedAt: string
          useCount: number
          variables: string[] | null
        }
        Insert: {
          active?: boolean
          category: string
          content: string
          createdAt?: string
          id: string
          name: string
          performanceScore?: number
          tenantId: string
          tone?: string
          updatedAt: string
          useCount?: number
          variables?: string[] | null
        }
        Update: {
          active?: boolean
          category?: string
          content?: string
          createdAt?: string
          id?: string
          name?: string
          performanceScore?: number
          tenantId?: string
          tone?: string
          updatedAt?: string
          useCount?: number
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          aiTokensUsed: number
          content: string | null
          conversationId: string
          createdAt: string
          direction: string
          id: string
          lead_id: string
          mediaUrl: string | null
          sentBy: string
          sentByUserId: string | null
          status: string
          tenantId: string
          type: string
          whatsappMessageId: string | null
        }
        Insert: {
          aiTokensUsed?: number
          content?: string | null
          conversationId: string
          createdAt?: string
          direction: string
          id: string
          lead_id: string
          mediaUrl?: string | null
          sentBy: string
          sentByUserId?: string | null
          status?: string
          tenantId: string
          type?: string
          whatsappMessageId?: string | null
        }
        Update: {
          aiTokensUsed?: number
          content?: string | null
          conversationId?: string
          createdAt?: string
          direction?: string
          id?: string
          lead_id?: string
          mediaUrl?: string | null
          sentBy?: string
          sentByUserId?: string | null
          status?: string
          tenantId?: string
          type?: string
          whatsappMessageId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversationId_fkey"
            columns: ["conversationId"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sentByUserId_fkey"
            columns: ["sentByUserId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mira_channels: {
        Row: {
          clinic_id: string
          created_at: string
          function_key: string
          id: string
          is_active: boolean
          label: string | null
          notes: string | null
          updated_at: string
          wa_number_id: string | null
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          function_key: string
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          updated_at?: string
          wa_number_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          function_key?: string
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          updated_at?: string
          wa_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mira_channels_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mira_channels_wa_number_id_fkey"
            columns: ["wa_number_id"]
            isOneToOne: false
            referencedRelation: "wa_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      mira_conversation_state: {
        Row: {
          context: string | null
          expires_at: string
          phone: string
          state: Json | null
          state_key: string
          state_value: Json
          updated_at: string
        }
        Insert: {
          context?: string | null
          expires_at?: string
          phone: string
          state?: Json | null
          state_key?: string
          state_value?: Json
          updated_at?: string
        }
        Update: {
          context?: string | null
          expires_at?: string
          phone?: string
          state?: Json | null
          state_key?: string
          state_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mira_cron_jobs: {
        Row: {
          category: string
          clinic_id: string
          created_at: string
          cron_expr: string | null
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          job_name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          clinic_id?: string
          created_at?: string
          cron_expr?: string | null
          description?: string | null
          display_name: string
          enabled?: boolean
          id?: string
          job_name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          clinic_id?: string
          created_at?: string
          cron_expr?: string | null
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          job_name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mira_cron_runs: {
        Row: {
          clinic_id: string
          error_message: string | null
          finished_at: string | null
          id: string
          items_processed: number
          job_name: string
          meta: Json
          started_at: string
          status: string
        }
        Insert: {
          clinic_id?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_processed?: number
          job_name: string
          meta?: Json
          started_at?: string
          status?: string
        }
        Update: {
          clinic_id?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_processed?: number
          job_name?: string
          meta?: Json
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          clinic_id: string
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          read_at: string | null
          recipient_id: string
          sender_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          clinic_id: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id: string
          sender_id?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          clinic_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id?: string
          sender_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          appt_id: string | null
          category: string
          clinic_id: string
          created_at: string
          follow_up_task_id: string | null
          id: string
          instagram_posted_at: string | null
          instagram_url: string | null
          lead_id: string | null
          magazine_page_id: string | null
          phone_suffix: string
          raw_message: string | null
          score: number
          testimonial_consent: boolean | null
          testimonial_consent_at: string | null
          testimonial_photo_url: string | null
          testimonial_text: string | null
        }
        Insert: {
          appt_id?: string | null
          category: string
          clinic_id?: string
          created_at?: string
          follow_up_task_id?: string | null
          id?: string
          instagram_posted_at?: string | null
          instagram_url?: string | null
          lead_id?: string | null
          magazine_page_id?: string | null
          phone_suffix: string
          raw_message?: string | null
          score: number
          testimonial_consent?: boolean | null
          testimonial_consent_at?: string | null
          testimonial_photo_url?: string | null
          testimonial_text?: string | null
        }
        Update: {
          appt_id?: string | null
          category?: string
          clinic_id?: string
          created_at?: string
          follow_up_task_id?: string | null
          id?: string
          instagram_posted_at?: string | null
          instagram_url?: string | null
          lead_id?: string | null
          magazine_page_id?: string | null
          phone_suffix?: string
          raw_message?: string | null
          score?: number
          testimonial_consent?: boolean | null
          testimonial_consent_at?: string | null
          testimonial_photo_url?: string | null
          testimonial_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_magazine_page_id_fkey"
            columns: ["magazine_page_id"]
            isOneToOne: false
            referencedRelation: "magazine_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      ofx_imports: {
        Row: {
          clinic_id: string
          deleted_at: string | null
          file_hash: string
          file_name: string | null
          file_size: number | null
          fingerprint: string | null
          first_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          last_date: string | null
          row_count: number | null
          total_credits: number | null
          total_debits: number | null
        }
        Insert: {
          clinic_id: string
          deleted_at?: string | null
          file_hash: string
          file_name?: string | null
          file_size?: number | null
          fingerprint?: string | null
          first_date?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          last_date?: string | null
          row_count?: number | null
          total_credits?: number | null
          total_debits?: number | null
        }
        Update: {
          clinic_id?: string
          deleted_at?: string | null
          file_hash?: string
          file_name?: string | null
          file_size?: number | null
          fingerprint?: string | null
          first_date?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          last_date?: string | null
          row_count?: number | null
          total_credits?: number | null
          total_debits?: number | null
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          approved_at: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount: number
          id: string
          items: Json
          lead_id: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          number: string | null
          patient_id: string | null
          payments: Json
          sent_at: string | null
          share_token: string | null
          status: string
          subtotal: number
          title: string | null
          total: number
          updated_at: string
          valid_until: string | null
          viewed_at: string | null
        }
        Insert: {
          approved_at?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount?: number
          id?: string
          items?: Json
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          number?: string | null
          patient_id?: string | null
          payments?: Json
          sent_at?: string | null
          share_token?: string | null
          status?: string
          subtotal?: number
          title?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          viewed_at?: string | null
        }
        Update: {
          approved_at?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount?: number
          id?: string
          items?: Json
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          number?: string | null
          patient_id?: string | null
          payments?: Json
          sent_at?: string | null
          share_token?: string | null
          status?: string
          subtotal?: number
          title?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      page_templates: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          schema: Json
          slug: string
          status: string | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          schema?: Json
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          schema?: Json
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      patient_complaints: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          complaint: string
          created_at: string
          id: string
          next_retouch_date: string | null
          notes: string | null
          patient_id: string
          professional_name: string | null
          resolved_at: string | null
          retouch_count: number
          retouch_interval_days: number | null
          source: string
          status: string
          treatment_date: string | null
          treatment_procedure: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string
          complaint: string
          created_at?: string
          id?: string
          next_retouch_date?: string | null
          notes?: string | null
          patient_id: string
          professional_name?: string | null
          resolved_at?: string | null
          retouch_count?: number
          retouch_interval_days?: number | null
          source?: string
          status?: string
          treatment_date?: string | null
          treatment_procedure?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          complaint?: string
          created_at?: string
          id?: string
          next_retouch_date?: string | null
          notes?: string | null
          patient_id?: string
          professional_name?: string | null
          resolved_at?: string | null
          retouch_count?: number
          retouch_interval_days?: number | null
          source?: string
          status?: string
          treatment_date?: string | null
          treatment_procedure?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          address_json: Json | null
          assigned_to: string | null
          birth_date: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_procedure_at: string | null
          id: string
          last_procedure_at: string | null
          name: string
          notes: string | null
          phone: string
          rg: string | null
          sex: string | null
          source_lead_meta: Json
          source_lead_phase_at: string | null
          status: string
          total_procedures: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          address_json?: Json | null
          assigned_to?: string | null
          birth_date?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_procedure_at?: string | null
          id: string
          last_procedure_at?: string | null
          name: string
          notes?: string | null
          phone: string
          rg?: string | null
          sex?: string | null
          source_lead_meta?: Json
          source_lead_phase_at?: string | null
          status?: string
          total_procedures?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          address_json?: Json | null
          assigned_to?: string | null
          birth_date?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_procedure_at?: string | null
          id?: string
          last_procedure_at?: string | null
          name?: string
          notes?: string | null
          phone?: string
          rg?: string | null
          sex?: string | null
          source_lead_meta?: Json
          source_lead_phase_at?: string | null
          status?: string
          total_procedures?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      perdidos: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_recoverable: boolean
          lead_id: string
          lost_at: string
          lost_by: string | null
          lost_reason: string
          name: string | null
          notes: string | null
          phone: string | null
          recovered_at: string | null
          recovered_to_phase: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id: string
          is_recoverable?: boolean
          lead_id: string
          lost_at?: string
          lost_by?: string | null
          lost_reason: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          recovered_at?: string | null
          recovered_to_phase?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_recoverable?: boolean
          lead_id?: string
          lost_at?: string
          lost_by?: string | null
          lost_reason?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          recovered_at?: string | null
          recovered_to_phase?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      phase_history: {
        Row: {
          actor_id: string | null
          clinic_id: string
          created_at: string
          from_phase: string | null
          from_status: string | null
          id: string
          lead_id: string | null
          origin: string
          reason: string | null
          to_phase: string
          to_status: string | null
          triggered_by: string | null
        }
        Insert: {
          actor_id?: string | null
          clinic_id?: string
          created_at?: string
          from_phase?: string | null
          from_status?: string | null
          id?: string
          lead_id?: string | null
          origin: string
          reason?: string | null
          to_phase: string
          to_status?: string | null
          triggered_by?: string | null
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          created_at?: string
          from_phase?: string | null
          from_status?: string | null
          id?: string
          lead_id?: string | null
          origin?: string
          reason?: string | null
          to_phase?: string
          to_status?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phase_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          day_number: number | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          label: string
          max_leads: number | null
          pipeline_id: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string
          day_number?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          max_leads?: number | null
          pipeline_id: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string
          day_number?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          max_leads?: number | null
          pipeline_id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          applies_to_phase: string | null
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to_phase?: string | null
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to_phase?: string | null
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_connections: {
        Row: {
          account_id: string | null
          account_name: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          item_id: string
          last_sync_at: string | null
          last_sync_error: string | null
          metadata: Json | null
          status: string
          total_synced: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          metadata?: Json | null
          status?: string
          total_synced?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          metadata?: Json | null
          status?: string
          total_synced?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimento_insumos: {
        Row: {
          id: string
          injetavel_id: string
          procedimento_id: string
          qtd_por_sessao: number
        }
        Insert: {
          id?: string
          injetavel_id: string
          procedimento_id: string
          qtd_por_sessao?: number
        }
        Update: {
          id?: string
          injetavel_id?: string
          procedimento_id?: string
          qtd_por_sessao?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_insumos_injetavel_id_fkey"
            columns: ["injetavel_id"]
            isOneToOne: false
            referencedRelation: "clinic_injetaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_insumos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "clinic_procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          active: boolean
          category: string
          createdAt: string
          description: string | null
          durationMinutes: number
          id: string
          name: string
          price: number
          promoPrice: number | null
          tenantId: string
        }
        Insert: {
          active?: boolean
          category: string
          createdAt?: string
          description?: string | null
          durationMinutes?: number
          id: string
          name: string
          price: number
          promoPrice?: number | null
          tenantId: string
        }
        Update: {
          active?: boolean
          category?: string
          createdAt?: string
          description?: string | null
          durationMinutes?: number
          id?: string
          name?: string
          price?: number
          promoPrice?: number | null
          tenantId?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_procedimentos: {
        Row: {
          clinic_id: string
          created_at: string
          is_primary: boolean
          procedimento_id: string
          professional_id: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          is_primary?: boolean
          procedimento_id: string
          professional_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          is_primary?: boolean
          procedimento_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "clinic_procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_procedimentos_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          agenda_enabled: boolean
          bio: string | null
          cargo: string | null
          clinic_id: string
          color: string
          commissions: Json
          contrato: string | null
          cpf: string | null
          created_at: string
          crm: string | null
          display_name: string
          email: string | null
          endereco: Json
          goals: Json
          horarios: Json
          id: string
          is_active: boolean
          nascimento: string | null
          nivel: string
          observacoes: string | null
          phone: string | null
          sala_id: string | null
          salario: number | null
          skills: Json
          specialty: string | null
          telefone: string | null
          updated_at: string
          user_id: string | null
          valor_consulta: number | null
          whatsapp: string | null
        }
        Insert: {
          agenda_enabled?: boolean
          bio?: string | null
          cargo?: string | null
          clinic_id: string
          color?: string
          commissions?: Json
          contrato?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          display_name: string
          email?: string | null
          endereco?: Json
          goals?: Json
          horarios?: Json
          id?: string
          is_active?: boolean
          nascimento?: string | null
          nivel?: string
          observacoes?: string | null
          phone?: string | null
          sala_id?: string | null
          salario?: number | null
          skills?: Json
          specialty?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
          valor_consulta?: number | null
          whatsapp?: string | null
        }
        Update: {
          agenda_enabled?: boolean
          bio?: string | null
          cargo?: string | null
          clinic_id?: string
          color?: string
          commissions?: Json
          contrato?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          display_name?: string
          email?: string | null
          endereco?: Json
          goals?: Json
          horarios?: Json
          id?: string
          is_active?: boolean
          nascimento?: string | null
          nivel?: string
          observacoes?: string | null
          phone?: string | null
          sala_id?: string | null
          salario?: number | null
          skills?: Json
          specialty?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
          valor_consulta?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "clinic_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_technologies: {
        Row: {
          professional_id: string
          technology_id: string
        }
        Insert: {
          professional_id: string
          technology_id: string
        }
        Update: {
          professional_id?: string
          technology_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_technologies_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_technologies_technology_id_fkey"
            columns: ["technology_id"]
            isOneToOne: false
            referencedRelation: "clinic_technologies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          clinic_id: string
          created_at: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          clinic_id: string
          created_at?: string
          first_name?: string
          id: string
          is_active?: boolean
          last_name?: string
          role: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          clinic_id?: string
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_alerts: {
        Row: {
          alert_type: string
          clinic_id: string
          created_at: string | null
          data: Json
          description: string
          done_at: string | null
          done_by: string | null
          id: string
          metric: string
          quiz_id: string
          recommendation: string
          severity: string
          status: string
          title: string
        }
        Insert: {
          alert_type: string
          clinic_id: string
          created_at?: string | null
          data?: Json
          description?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          metric: string
          quiz_id: string
          recommendation?: string
          severity: string
          status?: string
          title: string
        }
        Update: {
          alert_type?: string
          clinic_id?: string
          created_at?: string | null
          data?: Json
          description?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          metric?: string
          quiz_id?: string
          recommendation?: string
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_alerts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_events: {
        Row: {
          clinic_id: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          quiz_id: string
          session_id: string
          step_index: number | null
          step_label: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          clinic_id: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          quiz_id: string
          session_id: string
          step_index?: number | null
          step_label?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          clinic_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          quiz_id?: string
          session_id?: string
          step_index?: number | null
          step_label?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_events_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_rate_log: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
          quiz_id: string
          session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          ip_hash: string
          quiz_id: string
          session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          ip_hash?: string
          quiz_id?: string
          session_id?: string | null
        }
        Relationships: []
      }
      quiz_responses: {
        Row: {
          answers: Json
          clinic_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          id: string
          idade: number | null
          lead_id: string | null
          queixas_faciais: Json | null
          quiz_id: string
          score: number
          submitted_at: string
          temperature: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          answers?: Json
          clinic_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          id?: string
          idade?: number | null
          lead_id?: string | null
          queixas_faciais?: Json | null
          quiz_id: string
          score?: number
          submitted_at?: string
          temperature?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          answers?: Json
          clinic_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          id?: string
          idade?: number | null
          lead_id?: string | null
          queixas_faciais?: Json | null
          quiz_id?: string
          score?: number
          submitted_at?: string
          temperature?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_responses_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_templates: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          kanban_target: string
          pipeline: string
          schema: Json
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          kanban_target: string
          pipeline?: string
          schema?: Json
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          kanban_target?: string
          pipeline?: string
          schema?: Json
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_luxury_templates: {
        Row: {
          clinic_id: string
          id: string
          template_key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          clinic_id?: string
          id?: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          clinic_id?: string
          id?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      retoque_campaigns: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          lead_id: string
          lead_name: string | null
          lead_phone: string | null
          patient_responded_at: string | null
          patient_response: string | null
          procedure_label: string
          professional_id: string | null
          professional_name: string | null
          scheduled_appointment_id: string | null
          source_appointment_id: string | null
          status: string
          status_changed_at: string
          status_changed_by: string | null
          status_notes: string | null
          suggested_at: string
          suggested_by_user_id: string | null
          suggested_offset_days: number
          suggested_target_date: string
          suggestion_notes: string | null
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          id?: string
          lead_id: string
          lead_name?: string | null
          lead_phone?: string | null
          patient_responded_at?: string | null
          patient_response?: string | null
          procedure_label: string
          professional_id?: string | null
          professional_name?: string | null
          scheduled_appointment_id?: string | null
          source_appointment_id?: string | null
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          status_notes?: string | null
          suggested_at?: string
          suggested_by_user_id?: string | null
          suggested_offset_days: number
          suggested_target_date: string
          suggestion_notes?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          lead_name?: string | null
          lead_phone?: string | null
          patient_responded_at?: string | null
          patient_response?: string | null
          procedure_label?: string
          professional_id?: string | null
          professional_name?: string | null
          scheduled_appointment_id?: string | null
          source_appointment_id?: string | null
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          status_notes?: string | null
          suggested_at?: string
          suggested_by_user_id?: string | null
          suggested_offset_days?: number
          suggested_target_date?: string
          suggestion_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rule_executions: {
        Row: {
          actions_run: Json | null
          error: string | null
          executed_at: string
          id: string
          lead_id: string
          rule_id: string
          success: boolean
        }
        Insert: {
          actions_run?: Json | null
          error?: string | null
          executed_at?: string
          id?: string
          lead_id: string
          rule_id: string
          success?: boolean
        }
        Update: {
          actions_run?: Json | null
          error?: string | null
          executed_at?: string
          id?: string
          lead_id?: string
          rule_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rule_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      short_links: {
        Row: {
          clicks: number | null
          clinic_id: string
          code: string
          created_at: string | null
          id: string
          pixels: Json | null
          title: string | null
          url: string
        }
        Insert: {
          clicks?: number | null
          clinic_id?: string
          code: string
          created_at?: string | null
          id?: string
          pixels?: Json | null
          title?: string | null
          url: string
        }
        Update: {
          clicks?: number | null
          clinic_id?: string
          code?: string
          created_at?: string | null
          id?: string
          pixels?: Json | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      tag_alert_templates: {
        Row: {
          ativo: boolean
          clinic_id: string
          corpo: string
          created_at: string
          id: string
          nome: string
          para: string
          slug: string
          tipo: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          clinic_id: string
          corpo: string
          created_at?: string
          id?: string
          nome: string
          para?: string
          slug: string
          tipo?: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          clinic_id?: string
          corpo?: string
          created_at?: string
          id?: string
          nome?: string
          para?: string
          slug?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_alert_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          origin: string
          removed_at: string | null
          removed_by: string | null
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          origin?: string
          removed_at?: string | null
          removed_by?: string | null
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          origin?: string
          removed_at?: string | null
          removed_by?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_conflicts: {
        Row: {
          bidirectional: boolean
          clinic_id: string
          id: string
          tag_a_id: string
          tag_b_id: string
        }
        Insert: {
          bidirectional?: boolean
          clinic_id: string
          id?: string
          tag_a_id: string
          tag_b_id: string
        }
        Update: {
          bidirectional?: boolean
          clinic_id?: string
          id?: string
          tag_a_id?: string
          tag_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_conflicts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_conflicts_tag_a_id_fkey"
            columns: ["tag_a_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_conflicts_tag_b_id_fkey"
            columns: ["tag_b_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_groups: {
        Row: {
          ativo: boolean
          clinic_id: string
          cor: string
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinic_id: string
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinic_id?: string
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_groups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_msg_templates: {
        Row: {
          ativo: boolean
          canal: string
          clinic_id: string
          conteudo: string
          created_at: string
          id: string
          nome: string
          slug: string
          updated_at: string
          variaveis: string[]
        }
        Insert: {
          ativo?: boolean
          canal?: string
          clinic_id: string
          conteudo: string
          created_at?: string
          id?: string
          nome: string
          slug: string
          updated_at?: string
          variaveis?: string[]
        }
        Update: {
          ativo?: boolean
          canal?: string
          clinic_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
          variaveis?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tag_msg_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_task_templates: {
        Row: {
          ativo: boolean
          clinic_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          prazo_horas: number
          prioridade: string
          responsavel: string
          slug: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          clinic_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          prazo_horas?: number
          prioridade?: string
          responsavel?: string
          slug: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          clinic_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          prazo_horas?: number
          prioridade?: string
          responsavel?: string
          slug?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_task_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          alert_template_id: string | null
          category: string
          clinic_id: string
          color: string
          cor_calendario: string | null
          created_at: string
          description: string | null
          entity_type: string
          group_slug: string | null
          icon: string | null
          id: string
          incompativeis: string[]
          is_active: boolean
          is_exclusive: boolean
          is_system: boolean
          kanban_coluna: string | null
          label: string
          msg_template_id: string | null
          proxima_acao: string | null
          regras_aplicacao: string | null
          slug: string
          sort_order: number
          task_template_id: string | null
          updated_at: string
        }
        Insert: {
          alert_template_id?: string | null
          category: string
          clinic_id: string
          color?: string
          cor_calendario?: string | null
          created_at?: string
          description?: string | null
          entity_type: string
          group_slug?: string | null
          icon?: string | null
          id?: string
          incompativeis?: string[]
          is_active?: boolean
          is_exclusive?: boolean
          is_system?: boolean
          kanban_coluna?: string | null
          label: string
          msg_template_id?: string | null
          proxima_acao?: string | null
          regras_aplicacao?: string | null
          slug: string
          sort_order?: number
          task_template_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_template_id?: string | null
          category?: string
          clinic_id?: string
          color?: string
          cor_calendario?: string | null
          created_at?: string
          description?: string | null
          entity_type?: string
          group_slug?: string | null
          icon?: string | null
          id?: string
          incompativeis?: string[]
          is_active?: boolean
          is_exclusive?: boolean
          is_system?: boolean
          kanban_coluna?: string | null
          label?: string
          msg_template_id?: string | null
          proxima_acao?: string | null
          regras_aplicacao?: string | null
          slug?: string
          sort_order?: number
          task_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          description: string | null
          done_at: string | null
          due_at: string
          id: string
          lead_id: string
          snoozed_until: string | null
          status: string
          title: string
          triggered_by: string | null
          type: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_at: string
          id?: string
          lead_id: string
          snoozed_until?: string | null
          status?: string
          title: string
          triggered_by?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_at?: string
          id?: string
          lead_id?: string
          snoozed_until?: string | null
          status?: string
          title?: string
          triggered_by?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          createdAt: string
          id: string
          name: string
          plan: string
          settings: Json
          slug: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          id: string
          name: string
          plan?: string
          settings?: Json
          slug: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          id?: string
          name?: string
          plan?: string
          settings?: Json
          slug?: string
          updatedAt?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          allowed: boolean
          clinic_id: string
          id: string
          module_id: string
          page_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          allowed?: boolean
          clinic_id?: string
          id?: string
          module_id: string
          page_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          allowed?: boolean
          clinic_id?: string
          id?: string
          module_id?: string
          page_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean
          createdAt: string
          email: string
          id: string
          name: string
          passwordHash: string
          role: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          active?: boolean
          createdAt?: string
          email: string
          id: string
          name: string
          passwordHash: string
          role?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          active?: boolean
          createdAt?: string
          email?: string
          id?: string
          name?: string
          passwordHash?: string
          role?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_analytics_alerts: {
        Row: {
          clinic_id: string
          created_at: string
          data: Json | null
          detail: string | null
          dismissed_at: string | null
          id: string
          kind: string
          metric_delta: number | null
          metric_value: number | null
          partner_id: string | null
          recommendation: string | null
          severity: string
          title: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          kind: string
          metric_delta?: number | null
          metric_value?: number | null
          partner_id?: string | null
          recommendation?: string | null
          severity?: string
          title: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          kind?: string
          metric_delta?: number | null
          metric_value?: number | null
          partner_id?: string | null
          recommendation?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      vpi_audit_log: {
        Row: {
          action: string
          clinic_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          clinic_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          clinic_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      vpi_badge_catalog: {
        Row: {
          code: string
          created_at: string
          criterio_descricao: string | null
          descricao: string
          icone: string
          is_active: boolean
          nome: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          criterio_descricao?: string | null
          descricao: string
          icone?: string
          is_active?: boolean
          nome: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          criterio_descricao?: string | null
          descricao?: string
          icone?: string
          is_active?: boolean
          nome?: string
          sort_order?: number
        }
        Relationships: []
      }
      vpi_badges: {
        Row: {
          badge_code: string
          clinic_id: string
          id: string
          partner_id: string
          unlocked_at: string
        }
        Insert: {
          badge_code: string
          clinic_id?: string
          id?: string
          partner_id: string
          unlocked_at?: string
        }
        Update: {
          badge_code?: string
          clinic_id?: string
          id?: string
          partner_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpi_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "vpi_badge_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vpi_badges_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_celebrations: {
        Row: {
          clinic_id: string
          consent_asked_at: string | null
          consent_granted_at: string | null
          consent_story: boolean
          context_text: string | null
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          outbox_id: string | null
          partner_id: string | null
          posted_at: string | null
          posted_by: string | null
          reacted_at: string
          reaction: string
        }
        Insert: {
          clinic_id?: string
          consent_asked_at?: string | null
          consent_granted_at?: string | null
          consent_story?: boolean
          context_text?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          outbox_id?: string | null
          partner_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reacted_at?: string
          reaction: string
        }
        Update: {
          clinic_id?: string
          consent_asked_at?: string | null
          consent_granted_at?: string | null
          consent_story?: boolean
          context_text?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          outbox_id?: string | null
          partner_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reacted_at?: string
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpi_celebrations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_challenges: {
        Row: {
          bonus_fixo: number
          clinic_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          emoji: string | null
          id: string
          is_active: boolean
          msg_template_fim: string | null
          msg_template_inicio: string | null
          multiplier: number
          periodo_fim: string
          periodo_inicio: string
          slug: string
          sort_order: number
          titulo: string
          updated_at: string
        }
        Insert: {
          bonus_fixo?: number
          clinic_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          msg_template_fim?: string | null
          msg_template_inicio?: string | null
          multiplier?: number
          periodo_fim: string
          periodo_inicio: string
          slug: string
          sort_order?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          bonus_fixo?: number
          clinic_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          msg_template_fim?: string | null
          msg_template_inicio?: string | null
          multiplier?: number
          periodo_fim?: string
          periodo_inicio?: string
          slug?: string
          sort_order?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      vpi_easter_discoveries: {
        Row: {
          clinic_id: string
          discovered_at: string
          egg_code: string
          id: string
          partner_id: string
          triggered_count: number
        }
        Insert: {
          clinic_id?: string
          discovered_at?: string
          egg_code: string
          id?: string
          partner_id: string
          triggered_count?: number
        }
        Update: {
          clinic_id?: string
          discovered_at?: string
          egg_code?: string
          id?: string
          partner_id?: string
          triggered_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vpi_easter_discoveries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_indications: {
        Row: {
          appt_id: string | null
          beneficio: string | null
          clinic_id: string
          consent_mostrar_na_historia: boolean
          contacted_at: string | null
          created_at: string
          creditos: number
          depoimento: string | null
          fechada_em: string | null
          foto_antes_url: string | null
          foto_depois_url: string | null
          funnel_stage: string
          id: string
          indicada_nome: string | null
          invalid_reason: string | null
          lead_id: string
          lost_at: string | null
          partner_id: string
          procedimento: string | null
          recompensas_emitidas: Json
          responded_at: string | null
          scheduled_at: string | null
          showed_at: string | null
          status: string
          updated_at: string
          voucher_first_reply_at: string | null
          voucher_followup_sent_at: string | null
          voucher_msg_sent_at: string | null
        }
        Insert: {
          appt_id?: string | null
          beneficio?: string | null
          clinic_id?: string
          consent_mostrar_na_historia?: boolean
          contacted_at?: string | null
          created_at?: string
          creditos?: number
          depoimento?: string | null
          fechada_em?: string | null
          foto_antes_url?: string | null
          foto_depois_url?: string | null
          funnel_stage?: string
          id?: string
          indicada_nome?: string | null
          invalid_reason?: string | null
          lead_id: string
          lost_at?: string | null
          partner_id: string
          procedimento?: string | null
          recompensas_emitidas?: Json
          responded_at?: string | null
          scheduled_at?: string | null
          showed_at?: string | null
          status?: string
          updated_at?: string
          voucher_first_reply_at?: string | null
          voucher_followup_sent_at?: string | null
          voucher_msg_sent_at?: string | null
        }
        Update: {
          appt_id?: string | null
          beneficio?: string | null
          clinic_id?: string
          consent_mostrar_na_historia?: boolean
          contacted_at?: string | null
          created_at?: string
          creditos?: number
          depoimento?: string | null
          fechada_em?: string | null
          foto_antes_url?: string | null
          foto_depois_url?: string | null
          funnel_stage?: string
          id?: string
          indicada_nome?: string | null
          invalid_reason?: string | null
          lead_id?: string
          lost_at?: string | null
          partner_id?: string
          procedimento?: string | null
          recompensas_emitidas?: Json
          responded_at?: string | null
          scheduled_at?: string | null
          showed_at?: string | null
          status?: string
          updated_at?: string
          voucher_first_reply_at?: string | null
          voucher_followup_sent_at?: string | null
          voucher_msg_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vpi_indications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_missao_progresso: {
        Row: {
          clinic_id: string
          completed_at: string | null
          created_at: string
          id: string
          missao_id: string
          partner_id: string
          progresso_atual: number
          recompensa_emitida: boolean
          recompensa_emitida_at: string | null
          target: number
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          missao_id: string
          partner_id: string
          progresso_atual?: number
          recompensa_emitida?: boolean
          recompensa_emitida_at?: string | null
          target?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          missao_id?: string
          partner_id?: string
          progresso_atual?: number
          recompensa_emitida?: boolean
          recompensa_emitida_at?: string | null
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpi_missao_progresso_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "vpi_missoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vpi_missao_progresso_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_missoes: {
        Row: {
          clinic_id: string
          created_at: string
          criterio: Json
          descricao: string
          id: string
          is_active: boolean
          msg_template_sucesso: string | null
          recompensa_texto: string
          recompensa_valor: number
          sort_order: number
          titulo: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          criterio: Json
          descricao: string
          id?: string
          is_active?: boolean
          msg_template_sucesso?: string | null
          recompensa_texto: string
          recompensa_valor?: number
          sort_order?: number
          titulo: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          criterio?: Json
          descricao?: string
          id?: string
          is_active?: boolean
          msg_template_sucesso?: string | null
          recompensa_texto?: string
          recompensa_valor?: number
          sort_order?: number
          titulo?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      vpi_partner_attribution: {
        Row: {
          appt_id: string | null
          campaign: string | null
          clicked_at: string
          clinic_id: string
          content: string | null
          converted: boolean
          converted_at: string | null
          created_at: string
          id: string
          lead_id: string | null
          medium: string | null
          partner_id: string
          session_id: string
          source: string | null
          valor_estimado: number
        }
        Insert: {
          appt_id?: string | null
          campaign?: string | null
          clicked_at?: string
          clinic_id?: string
          content?: string | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          medium?: string | null
          partner_id: string
          session_id: string
          source?: string | null
          valor_estimado?: number
        }
        Update: {
          appt_id?: string | null
          campaign?: string | null
          clicked_at?: string
          clinic_id?: string
          content?: string | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          medium?: string | null
          partner_id?: string
          session_id?: string
          source?: string | null
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "vpi_partner_attribution_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_partners: {
        Row: {
          aberturas_count: number
          aberturas_mes_cache: number
          alertas: Json | null
          avatar_url: string | null
          bonus_double_until: string | null
          card_token: string | null
          cidade: string | null
          clinic_id: string
          convite_enviado_em: string | null
          counters_atualizados_em: string | null
          created_at: string
          creditos_cascata_ano: number
          creditos_disponiveis: number
          creditos_total: number
          criterio_entrada: boolean
          email: string | null
          estado: string | null
          fotonas_ano_ref: number | null
          fotonas_transferidas: Json
          fotonas_trocadas: Json
          fotonas_usadas_ano: number
          id: string
          indicacoes_ano_cache: number | null
          indicacoes_mes_cache: number | null
          last_perf_check_at: string | null
          lead_id: string | null
          lgpd_consent_at: string | null
          lgpd_consent_method: string | null
          nome: string
          numero_membro: number | null
          opt_out_at: string | null
          opt_out_reason: string | null
          origem: string
          palette_variant: string
          phone: string | null
          ponteiras_resgatadas_ano: number
          ponteiras_resgatadas_ano_ref: number
          profissao: string | null
          referred_by_partner_id: string | null
          score_atualizado_em: string | null
          score_cadastro: number | null
          score_classe: string | null
          score_criterio_entrada: number | null
          score_engajamento: number | null
          score_produtividade: number | null
          score_recorrencia: number | null
          score_total: number | null
          short_link_slug: string | null
          status: string
          streak_meses: number
          tier_atual: string | null
          tier_upgrade_posted_at: string | null
          tipo: string
          ultima_abertura_em: string | null
          updated_at: string
        }
        Insert: {
          aberturas_count?: number
          aberturas_mes_cache?: number
          alertas?: Json | null
          avatar_url?: string | null
          bonus_double_until?: string | null
          card_token?: string | null
          cidade?: string | null
          clinic_id?: string
          convite_enviado_em?: string | null
          counters_atualizados_em?: string | null
          created_at?: string
          creditos_cascata_ano?: number
          creditos_disponiveis?: number
          creditos_total?: number
          criterio_entrada?: boolean
          email?: string | null
          estado?: string | null
          fotonas_ano_ref?: number | null
          fotonas_transferidas?: Json
          fotonas_trocadas?: Json
          fotonas_usadas_ano?: number
          id?: string
          indicacoes_ano_cache?: number | null
          indicacoes_mes_cache?: number | null
          last_perf_check_at?: string | null
          lead_id?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_method?: string | null
          nome: string
          numero_membro?: number | null
          opt_out_at?: string | null
          opt_out_reason?: string | null
          origem?: string
          palette_variant?: string
          phone?: string | null
          ponteiras_resgatadas_ano?: number
          ponteiras_resgatadas_ano_ref?: number
          profissao?: string | null
          referred_by_partner_id?: string | null
          score_atualizado_em?: string | null
          score_cadastro?: number | null
          score_classe?: string | null
          score_criterio_entrada?: number | null
          score_engajamento?: number | null
          score_produtividade?: number | null
          score_recorrencia?: number | null
          score_total?: number | null
          short_link_slug?: string | null
          status?: string
          streak_meses?: number
          tier_atual?: string | null
          tier_upgrade_posted_at?: string | null
          tipo?: string
          ultima_abertura_em?: string | null
          updated_at?: string
        }
        Update: {
          aberturas_count?: number
          aberturas_mes_cache?: number
          alertas?: Json | null
          avatar_url?: string | null
          bonus_double_until?: string | null
          card_token?: string | null
          cidade?: string | null
          clinic_id?: string
          convite_enviado_em?: string | null
          counters_atualizados_em?: string | null
          created_at?: string
          creditos_cascata_ano?: number
          creditos_disponiveis?: number
          creditos_total?: number
          criterio_entrada?: boolean
          email?: string | null
          estado?: string | null
          fotonas_ano_ref?: number | null
          fotonas_transferidas?: Json
          fotonas_trocadas?: Json
          fotonas_usadas_ano?: number
          id?: string
          indicacoes_ano_cache?: number | null
          indicacoes_mes_cache?: number | null
          last_perf_check_at?: string | null
          lead_id?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_method?: string | null
          nome?: string
          numero_membro?: number | null
          opt_out_at?: string | null
          opt_out_reason?: string | null
          origem?: string
          palette_variant?: string
          phone?: string | null
          ponteiras_resgatadas_ano?: number
          ponteiras_resgatadas_ano_ref?: number
          profissao?: string | null
          referred_by_partner_id?: string | null
          score_atualizado_em?: string | null
          score_cadastro?: number | null
          score_classe?: string | null
          score_criterio_entrada?: number | null
          score_engajamento?: number | null
          score_produtividade?: number | null
          score_recorrencia?: number | null
          score_total?: number | null
          short_link_slug?: string | null
          status?: string
          streak_meses?: number
          tier_atual?: string | null
          tier_upgrade_posted_at?: string | null
          tipo?: string
          ultima_abertura_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpi_partners_referred_by_fk"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_ponteira_resgates: {
        Row: {
          appt_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          clinic_id: string
          created_at: string
          done_at: string | null
          id: string
          observacoes: string | null
          partner_id: string
          protocolos: Json
          quantidade: number
          scheduled_at: string | null
          status: string
        }
        Insert: {
          appt_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          clinic_id: string
          created_at?: string
          done_at?: string | null
          id?: string
          observacoes?: string | null
          partner_id: string
          protocolos?: Json
          quantidade: number
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          appt_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          clinic_id?: string
          created_at?: string
          done_at?: string | null
          id?: string
          observacoes?: string | null
          partner_id?: string
          protocolos?: Json
          quantidade?: number
          scheduled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpi_ponteira_resgates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vpi_ponteira_resgates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vpi_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vpi_reward_tiers: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          msg_template: string
          recompensa: string
          recompensa_valor: number
          required_consecutive_months: number | null
          sort_order: number
          threshold: number
          tipo: string
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          msg_template: string
          recompensa: string
          recompensa_valor?: number
          required_consecutive_months?: number | null
          sort_order?: number
          threshold: number
          tipo: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          msg_template?: string
          recompensa?: string
          recompensa_valor?: number
          required_consecutive_months?: number | null
          sort_order?: number
          threshold?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      vpi_roadmap_tasks: {
        Row: {
          clinic_id: string
          completed_at: string | null
          created_at: string
          descricao: string | null
          grupo: string
          id: string
          nota: string | null
          ordem: number
          responsavel: string | null
          slug: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          grupo: string
          id?: string
          nota?: string | null
          ordem?: number
          responsavel?: string | null
          slug: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          grupo?: string
          id?: string
          nota?: string | null
          ordem?: number
          responsavel?: string | null
          slug?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_agenda_automations: {
        Row: {
          ab_variant_template: string | null
          alert_title: string | null
          alert_type: string | null
          alexa_message: string | null
          alexa_target: string | null
          attachment_above_text: boolean | null
          attachment_url: string | null
          attachment_urls: Json | null
          category: string
          channel: string
          clinic_id: string
          content_template: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          recipient_type: string
          slug: string | null
          sort_order: number | null
          task_assignee: string | null
          task_deadline_hours: number | null
          task_priority: string | null
          task_title: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          ab_variant_template?: string | null
          alert_title?: string | null
          alert_type?: string | null
          alexa_message?: string | null
          alexa_target?: string | null
          attachment_above_text?: boolean | null
          attachment_url?: string | null
          attachment_urls?: Json | null
          category?: string
          channel?: string
          clinic_id?: string
          content_template?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          recipient_type?: string
          slug?: string | null
          sort_order?: number | null
          task_assignee?: string | null
          task_deadline_hours?: number | null
          task_priority?: string | null
          task_title?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          ab_variant_template?: string | null
          alert_title?: string | null
          alert_type?: string | null
          alexa_message?: string | null
          alexa_target?: string | null
          attachment_above_text?: boolean | null
          attachment_url?: string | null
          attachment_urls?: Json | null
          category?: string
          channel?: string
          clinic_id?: string
          content_template?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          recipient_type?: string
          slug?: string | null
          sort_order?: number | null
          task_assignee?: string | null
          task_deadline_hours?: number | null
          task_priority?: string | null
          task_title?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_auto_reply_templates: {
        Row: {
          clinic_id: string
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          media_url: string | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_automation_sent: {
        Row: {
          clinic_id: string
          id: string
          lead_id: string
          rule_id: string
          sent_at: string
          sent_date: string | null
        }
        Insert: {
          clinic_id?: string
          id?: string
          lead_id: string
          rule_id: string
          sent_at?: string
          sent_date?: string | null
        }
        Update: {
          clinic_id?: string
          id?: string
          lead_id?: string
          rule_id?: string
          sent_at?: string
          sent_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_automation_sent_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "wa_agenda_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_birthday_campaigns: {
        Row: {
          birth_date: string
          budget_id: string | null
          budget_title: string | null
          budget_total: number | null
          campaign_year: number
          clinic_id: string
          completed_at: string | null
          created_at: string | null
          exclude_reason: string | null
          excluded_at: string | null
          excluded_by: string | null
          has_open_budget: boolean | null
          id: string
          is_excluded: boolean | null
          lead_id: string
          lead_name: string | null
          lead_phone: string | null
          link_opened_at: string | null
          page_landed_at: string | null
          queixas: string | null
          responded_at: string | null
          segment: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          birth_date: string
          budget_id?: string | null
          budget_title?: string | null
          budget_total?: number | null
          campaign_year: number
          clinic_id?: string
          completed_at?: string | null
          created_at?: string | null
          exclude_reason?: string | null
          excluded_at?: string | null
          excluded_by?: string | null
          has_open_budget?: boolean | null
          id?: string
          is_excluded?: boolean | null
          lead_id: string
          lead_name?: string | null
          lead_phone?: string | null
          link_opened_at?: string | null
          page_landed_at?: string | null
          queixas?: string | null
          responded_at?: string | null
          segment?: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          birth_date?: string
          budget_id?: string | null
          budget_title?: string | null
          budget_total?: number | null
          campaign_year?: number
          clinic_id?: string
          completed_at?: string | null
          created_at?: string | null
          exclude_reason?: string | null
          excluded_at?: string | null
          excluded_by?: string | null
          has_open_budget?: boolean | null
          id?: string
          is_excluded?: boolean | null
          lead_id?: string
          lead_name?: string | null
          lead_phone?: string | null
          link_opened_at?: string | null
          page_landed_at?: string | null
          queixas?: string | null
          responded_at?: string | null
          segment?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      wa_birthday_messages: {
        Row: {
          campaign_id: string
          content: string | null
          created_at: string | null
          day_offset: number
          delivered_at: string | null
          id: string
          media_url: string | null
          outbox_id: string | null
          read_at: string | null
          scheduled_at: string
          send_hour: number
          sent_at: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          campaign_id: string
          content?: string | null
          created_at?: string | null
          day_offset: number
          delivered_at?: string | null
          id?: string
          media_url?: string | null
          outbox_id?: string | null
          read_at?: string | null
          scheduled_at: string
          send_hour?: number
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          campaign_id?: string
          content?: string | null
          created_at?: string | null
          day_offset?: number
          delivered_at?: string | null
          id?: string
          media_url?: string | null
          outbox_id?: string | null
          read_at?: string | null
          scheduled_at?: string
          send_hour?: number
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_birthday_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_birthday_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_birthday_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wa_birthday_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_birthday_templates: {
        Row: {
          clinic_id: string
          content: string
          created_at: string | null
          day_offset: number
          id: string
          is_active: boolean | null
          label: string
          media_position: string | null
          media_url: string | null
          send_hour: number
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string
          content: string
          created_at?: string | null
          day_offset: number
          id?: string
          is_active?: boolean | null
          label: string
          media_position?: string | null
          media_url?: string | null
          send_hour?: number
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          content?: string
          created_at?: string | null
          day_offset?: number
          id?: string
          is_active?: boolean | null
          label?: string
          media_position?: string | null
          media_url?: string | null
          send_hour?: number
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_broadcasts: {
        Row: {
          batch_interval_min: number | null
          batch_size: number | null
          clinic_id: string
          completed_at: string | null
          content: string
          created_at: string | null
          failed_count: number | null
          id: string
          media_caption: string | null
          media_position: string | null
          media_url: string | null
          name: string
          scheduled_at: string | null
          selected_lead_ids: string[] | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_filter: Json | null
          total_targets: number | null
        }
        Insert: {
          batch_interval_min?: number | null
          batch_size?: number | null
          clinic_id?: string
          completed_at?: string | null
          content: string
          created_at?: string | null
          failed_count?: number | null
          id?: string
          media_caption?: string | null
          media_position?: string | null
          media_url?: string | null
          name: string
          scheduled_at?: string | null
          selected_lead_ids?: string[] | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          total_targets?: number | null
        }
        Update: {
          batch_interval_min?: number | null
          batch_size?: number | null
          clinic_id?: string
          completed_at?: string | null
          content?: string
          created_at?: string | null
          failed_count?: number | null
          id?: string
          media_caption?: string | null
          media_position?: string | null
          media_url?: string | null
          name?: string
          scheduled_at?: string | null
          selected_lead_ids?: string[] | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          total_targets?: number | null
        }
        Relationships: []
      }
      wa_cadences: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          steps: Json
          trigger_phase: string | null
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          steps?: Json
          trigger_phase?: string | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json
          trigger_phase?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_consent: {
        Row: {
          consent_type: string
          created_at: string | null
          granted_at: string
          id: string
          ip_address: string | null
          lead_id: string | null
          phone: string
          revoked_at: string | null
          source: string
        }
        Insert: {
          consent_type: string
          created_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          phone: string
          revoked_at?: string | null
          source: string
        }
        Update: {
          consent_type?: string
          created_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          phone?: string
          revoked_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_consent_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          ai_enabled: boolean | null
          ai_paused_until: string | null
          ai_persona: string | null
          cadence_paused: boolean | null
          cadence_step: number | null
          clinic_id: string
          context_type: string
          created_at: string | null
          daily_ai_responses: number | null
          display_name: string | null
          funnel: string | null
          id: string
          last_ai_msg: string | null
          last_inbound_time: string | null
          last_lead_msg: string | null
          last_message_at: string | null
          last_message_text: string | null
          lead_id: string
          metadata: Json | null
          paused_by: string | null
          phone: string
          processing_lock_id: string | null
          processing_locked_at: string | null
          reactivation_sent: boolean | null
          reactivation_sent_at: string | null
          remote_jid: string | null
          status: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string | null
          wa_number_id: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          ai_paused_until?: string | null
          ai_persona?: string | null
          cadence_paused?: boolean | null
          cadence_step?: number | null
          clinic_id: string
          context_type?: string
          created_at?: string | null
          daily_ai_responses?: number | null
          display_name?: string | null
          funnel?: string | null
          id?: string
          last_ai_msg?: string | null
          last_inbound_time?: string | null
          last_lead_msg?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id: string
          metadata?: Json | null
          paused_by?: string | null
          phone: string
          processing_lock_id?: string | null
          processing_locked_at?: string | null
          reactivation_sent?: boolean | null
          reactivation_sent_at?: string | null
          remote_jid?: string | null
          status?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
          wa_number_id?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          ai_paused_until?: string | null
          ai_persona?: string | null
          cadence_paused?: boolean | null
          cadence_step?: number | null
          clinic_id?: string
          context_type?: string
          created_at?: string | null
          daily_ai_responses?: number | null
          display_name?: string | null
          funnel?: string | null
          id?: string
          last_ai_msg?: string | null
          last_inbound_time?: string | null
          last_lead_msg?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id?: string
          metadata?: Json | null
          paused_by?: string | null
          phone?: string
          processing_lock_id?: string | null
          processing_locked_at?: string | null
          reactivation_sent?: boolean | null
          reactivation_sent_at?: string | null
          remote_jid?: string | null
          status?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
          wa_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_wa_number_id_fkey"
            columns: ["wa_number_id"]
            isOneToOne: false
            referencedRelation: "wa_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_errors: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          error_msg: string | null
          error_type: string
          id: string
          payload: Json | null
          phone: string | null
          resolved: boolean | null
          source: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          error_msg?: string | null
          error_type: string
          id?: string
          payload?: Json | null
          phone?: string | null
          resolved?: boolean | null
          source: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          error_msg?: string | null
          error_type?: string
          id?: string
          payload?: Json | null
          phone?: string | null
          resolved?: boolean | null
          source?: string
        }
        Relationships: []
      }
      wa_media_bank: {
        Row: {
          caption: string | null
          category: string
          clinic_id: string
          created_at: string | null
          filename: string
          funnel: string | null
          id: string
          is_active: boolean | null
          phase: string | null
          queixas: string[] | null
          sort_order: number | null
          url: string
        }
        Insert: {
          caption?: string | null
          category?: string
          clinic_id?: string
          created_at?: string | null
          filename: string
          funnel?: string | null
          id?: string
          is_active?: boolean | null
          phase?: string | null
          queixas?: string[] | null
          sort_order?: number | null
          url: string
        }
        Update: {
          caption?: string | null
          category?: string
          clinic_id?: string
          created_at?: string | null
          filename?: string
          funnel?: string | null
          id?: string
          is_active?: boolean | null
          phase?: string | null
          queixas?: string[] | null
          sort_order?: number | null
          url?: string
        }
        Relationships: []
      }
      wa_message_templates: {
        Row: {
          active: boolean
          category: string | null
          clinic_id: string
          content: string | null
          created_at: string
          day: number | null
          delay_hours: number | null
          delay_minutes: number | null
          id: string
          is_active: boolean | null
          message: string | null
          metadata: Json | null
          name: string
          slug: string | null
          sort_order: number
          trigger_phase: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          clinic_id: string
          content?: string | null
          created_at?: string
          day?: number | null
          delay_hours?: number | null
          delay_minutes?: number | null
          id?: string
          is_active?: boolean | null
          message?: string | null
          metadata?: Json | null
          name: string
          slug?: string | null
          sort_order?: number
          trigger_phase?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          clinic_id?: string
          content?: string | null
          created_at?: string
          day?: number | null
          delay_hours?: number | null
          delay_minutes?: number | null
          id?: string
          is_active?: boolean | null
          message?: string | null
          metadata?: Json | null
          name?: string
          slug?: string | null
          sort_order?: number
          trigger_phase?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_message_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          ai_generated: boolean | null
          ai_model: string | null
          ai_tokens_used: number | null
          channel: string
          clinic_id: string
          content: string
          content_type: string | null
          conversation_id: string | null
          created_at: string | null
          debounce_processed: boolean | null
          delivered_at: string | null
          direction: string
          error_message: string | null
          id: string
          media_url: string | null
          phone: string | null
          reaction: string | null
          read_at: string | null
          sender: string
          sent_at: string | null
          status: string | null
          template_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_tokens_used?: number | null
          channel?: string
          clinic_id: string
          content: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          debounce_processed?: boolean | null
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          phone?: string | null
          reaction?: string | null
          read_at?: string | null
          sender: string
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_tokens_used?: number | null
          channel?: string
          clinic_id?: string
          content?: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          debounce_processed?: boolean | null
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          phone?: string | null
          reaction?: string | null
          read_at?: string | null
          sender?: string
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_numbers: {
        Row: {
          access_scope: string
          access_token: string | null
          api_key: string | null
          api_url: string | null
          assigned_to: string | null
          business_account_id: string | null
          clinic_id: string
          created_at: string | null
          id: string
          instance_id: string | null
          is_active: boolean | null
          label: string | null
          number_type: string
          permissions: Json
          phone: string
          phone_number_id: string | null
          professional_id: string | null
          updated_at: string | null
          verify_token: string | null
        }
        Insert: {
          access_scope?: string
          access_token?: string | null
          api_key?: string | null
          api_url?: string | null
          assigned_to?: string | null
          business_account_id?: string | null
          clinic_id: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          label?: string | null
          number_type?: string
          permissions?: Json
          phone: string
          phone_number_id?: string | null
          professional_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
        }
        Update: {
          access_scope?: string
          access_token?: string | null
          api_key?: string | null
          api_url?: string | null
          assigned_to?: string | null
          business_account_id?: string | null
          clinic_id?: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          label?: string | null
          number_type?: string
          permissions?: Json
          phone?: string
          phone_number_id?: string | null
          professional_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_numbers_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_outbox: {
        Row: {
          ab_variant: string | null
          appt_ref: string | null
          attempts: number | null
          broadcast_id: string | null
          business_hours: boolean | null
          clinic_id: string
          content: string
          content_type: string | null
          conversation_id: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          lead_id: string
          max_attempts: number | null
          media_caption: string | null
          media_url: string | null
          phone: string
          priority: number | null
          processed_at: string | null
          read_at: string | null
          rule_id: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
          vars_snapshot: Json | null
          wa_message_id: string | null
        }
        Insert: {
          ab_variant?: string | null
          appt_ref?: string | null
          attempts?: number | null
          broadcast_id?: string | null
          business_hours?: boolean | null
          clinic_id: string
          content: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          lead_id: string
          max_attempts?: number | null
          media_caption?: string | null
          media_url?: string | null
          phone: string
          priority?: number | null
          processed_at?: string | null
          read_at?: string | null
          rule_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          vars_snapshot?: Json | null
          wa_message_id?: string | null
        }
        Update: {
          ab_variant?: string | null
          appt_ref?: string | null
          attempts?: number | null
          broadcast_id?: string | null
          business_hours?: boolean | null
          clinic_id?: string
          content?: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string
          max_attempts?: number | null
          media_caption?: string | null
          media_url?: string | null
          phone?: string
          priority?: number | null
          processed_at?: string | null
          read_at?: string | null
          rule_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          vars_snapshot?: Json | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_outbox_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "wa_agenda_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_phone_blacklist: {
        Row: {
          added_by: string | null
          clinic_id: string
          created_at: string
          phone: string
          reason: string | null
        }
        Insert: {
          added_by?: string | null
          clinic_id?: string
          created_at?: string
          phone: string
          reason?: string | null
        }
        Update: {
          added_by?: string | null
          clinic_id?: string
          created_at?: string
          phone?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_phone_blacklist_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_pro_audit_log: {
        Row: {
          clinic_id: string
          cost_usd: number | null
          created_at: string
          error_message: string | null
          id: string
          intent: string | null
          ip_address: unknown
          model: string | null
          phone: string
          professional_id: string | null
          query: string
          response_ms: number | null
          result_summary: string | null
          rpc_called: string | null
          success: boolean
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          clinic_id?: string
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          intent?: string | null
          ip_address?: unknown
          model?: string | null
          phone: string
          professional_id?: string | null
          query: string
          response_ms?: number | null
          result_summary?: string | null
          rpc_called?: string | null
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          clinic_id?: string
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          intent?: string | null
          ip_address?: unknown
          model?: string | null
          phone?: string
          professional_id?: string | null
          query?: string
          response_ms?: number | null
          result_summary?: string | null
          rpc_called?: string | null
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_pro_audit_log_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_pro_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      wa_pro_context: {
        Row: {
          clinic_id: string
          expires_at: string | null
          last_entity_id: string | null
          last_entity_name: string | null
          last_entity_options: Json | null
          last_entity_type: string | null
          last_intent: string | null
          last_query: string | null
          last_response_preview: string | null
          phone: string
          professional_id: string | null
          turns: number | null
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          expires_at?: string | null
          last_entity_id?: string | null
          last_entity_name?: string | null
          last_entity_options?: Json | null
          last_entity_type?: string | null
          last_intent?: string | null
          last_query?: string | null
          last_response_preview?: string | null
          phone: string
          professional_id?: string | null
          turns?: number | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          expires_at?: string | null
          last_entity_id?: string | null
          last_entity_name?: string | null
          last_entity_options?: Json | null
          last_entity_type?: string | null
          last_intent?: string | null
          last_query?: string | null
          last_response_preview?: string | null
          phone?: string
          professional_id?: string | null
          turns?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_pro_messages: {
        Row: {
          clinic_id: string
          content: string
          created_at: string
          direction: string
          error_message: string | null
          id: string
          intent: string | null
          intent_data: Json | null
          phone: string
          professional_id: string | null
          response_ms: number | null
          status: string | null
          tokens_used: number | null
          wa_number_id: string | null
        }
        Insert: {
          clinic_id?: string
          content: string
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          intent?: string | null
          intent_data?: Json | null
          phone: string
          professional_id?: string | null
          response_ms?: number | null
          status?: string | null
          tokens_used?: number | null
          wa_number_id?: string | null
        }
        Update: {
          clinic_id?: string
          content?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          intent?: string | null
          intent_data?: Json | null
          phone?: string
          professional_id?: string | null
          response_ms?: number | null
          status?: string | null
          tokens_used?: number | null
          wa_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_pro_messages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_pro_messages_wa_number_id_fkey"
            columns: ["wa_number_id"]
            isOneToOne: false
            referencedRelation: "wa_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_pro_pending_actions: {
        Row: {
          action_type: string
          clinic_id: string
          confirmed_at: string | null
          created_at: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          payload: Json
          phone: string
          preview: string
          professional_id: string
          result: Json | null
        }
        Insert: {
          action_type: string
          clinic_id: string
          confirmed_at?: string | null
          created_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          payload: Json
          phone: string
          preview: string
          professional_id: string
          result?: Json | null
        }
        Update: {
          action_type?: string
          clinic_id?: string
          confirmed_at?: string | null
          created_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json
          phone?: string
          preview?: string
          professional_id?: string
          result?: Json | null
        }
        Relationships: []
      }
      wa_pro_rate_limit: {
        Row: {
          blocked: boolean
          clinic_id: string
          created_at: string
          date: string
          id: string
          last_query_at: string | null
          max_per_day: number
          minute_count: number | null
          minute_window_start: string | null
          professional_id: string
          query_count: number
          updated_at: string
        }
        Insert: {
          blocked?: boolean
          clinic_id?: string
          created_at?: string
          date?: string
          id?: string
          last_query_at?: string | null
          max_per_day?: number
          minute_count?: number | null
          minute_window_start?: string | null
          professional_id: string
          query_count?: number
          updated_at?: string
        }
        Update: {
          blocked?: boolean
          clinic_id?: string
          created_at?: string
          date?: string
          id?: string
          last_query_at?: string | null
          max_per_day?: number
          minute_count?: number | null
          minute_window_start?: string | null
          professional_id?: string
          query_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_pro_rate_limit_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_pro_tasks: {
        Row: {
          clinic_id: string
          created_at: string | null
          created_via: string | null
          deleted_at: string | null
          description: string | null
          dismissed_at: string | null
          done_at: string | null
          done_by: string | null
          due_at: string
          id: string
          original_query: string | null
          professional_id: string
          remind_at: string
          reminder_sent_at: string | null
          title: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          created_via?: string | null
          deleted_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at: string
          id?: string
          original_query?: string | null
          professional_id: string
          remind_at: string
          reminder_sent_at?: string | null
          title: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          created_via?: string | null
          deleted_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string
          id?: string
          original_query?: string | null
          professional_id?: string
          remind_at?: string
          reminder_sent_at?: string | null
          title?: string
        }
        Relationships: []
      }
      wa_pro_transcripts: {
        Row: {
          audio_mime: string | null
          clinic_id: string
          cost_usd: number | null
          created_at: string | null
          duration_s: number | null
          error: string | null
          id: string
          intent_resolved: string | null
          language: string | null
          message_id: string | null
          model: string | null
          phone: string
          professional_id: string | null
          provider: string | null
          status: string | null
          tokens_used: number | null
          transcript: string
        }
        Insert: {
          audio_mime?: string | null
          clinic_id: string
          cost_usd?: number | null
          created_at?: string | null
          duration_s?: number | null
          error?: string | null
          id?: string
          intent_resolved?: string | null
          language?: string | null
          message_id?: string | null
          model?: string | null
          phone: string
          professional_id?: string | null
          provider?: string | null
          status?: string | null
          tokens_used?: number | null
          transcript: string
        }
        Update: {
          audio_mime?: string | null
          clinic_id?: string
          cost_usd?: number | null
          created_at?: string | null
          duration_s?: number | null
          error?: string | null
          id?: string
          intent_resolved?: string | null
          language?: string | null
          message_id?: string | null
          model?: string | null
          phone?: string
          professional_id?: string | null
          provider?: string | null
          status?: string | null
          tokens_used?: number | null
          transcript?: string
        }
        Relationships: []
      }
      webhook_processing_queue: {
        Row: {
          attempts: number
          clinic_id: string
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          phone: string
          processed_at: string | null
          processing_started_at: string | null
          role: string | null
          source: string
          status: string
          updated_at: string
          wa_message_id: string
        }
        Insert: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload: Json
          phone: string
          processed_at?: string | null
          processing_started_at?: string | null
          role?: string | null
          source: string
          status?: string
          updated_at?: string
          wa_message_id: string
        }
        Update: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          phone?: string
          processed_at?: string | null
          processing_started_at?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          aiPersonaId: string | null
          config: Json
          createdAt: string
          evolutionInstanceId: string | null
          id: string
          name: string
          phoneNumber: string | null
          status: string
          tenantId: string
          updatedAt: string
        }
        Insert: {
          aiPersonaId?: string | null
          config?: Json
          createdAt?: string
          evolutionInstanceId?: string | null
          id: string
          name: string
          phoneNumber?: string | null
          status?: string
          tenantId: string
          updatedAt: string
        }
        Update: {
          aiPersonaId?: string | null
          config?: Json
          createdAt?: string
          evolutionInstanceId?: string | null
          id?: string
          name?: string
          phoneNumber?: string | null
          status?: string
          tenantId?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_aiPersonaId_fkey"
            columns: ["aiPersonaId"]
            isOneToOne: false
            referencedRelation: "ai_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      budgets: {
        Row: {
          approved_at: string | null
          clinic_id: string | null
          created_at: string | null
          created_by: string | null
          discount: number | null
          id: string | null
          lead_id: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          number: string | null
          patient_id: string | null
          payments: Json | null
          sent_at: string | null
          share_token: string | null
          status: string | null
          subtotal: number | null
          title: string | null
          total: number | null
          updated_at: string | null
          valid_until: string | null
          viewed_at: string | null
        }
        Insert: {
          approved_at?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          id?: string | null
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          number?: string | null
          patient_id?: string | null
          payments?: Json | null
          sent_at?: string | null
          share_token?: string | null
          status?: string | null
          subtotal?: number | null
          title?: string | null
          total?: number | null
          updated_at?: string | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Update: {
          approved_at?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          id?: string | null
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          number?: string | null
          patient_id?: string | null
          payments?: Json | null
          sent_at?: string | null
          share_token?: string | null
          status?: string | null
          subtotal?: number | null
          title?: string | null
          total?: number | null
          updated_at?: string | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Relationships: []
      }
      cashflow_entries_paid_only: {
        Row: {
          amount: number | null
          appointment_id: string | null
          category: string | null
          clinic_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          direction: string | null
          external_id: string | null
          id: string | null
          installment_number: number | null
          installment_total: number | null
          is_cortesia: boolean | null
          match_confidence: string | null
          match_reasons: Json | null
          parent_entry_id: string | null
          patient_id: string | null
          payment_method: string | null
          procedure_name: string | null
          professional_id: string | null
          raw_data: Json | null
          reconciled_at: string | null
          reconciled_by: string | null
          signature: string | null
          source: string | null
          transaction_date: string | null
          transaction_datetime: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          appointment_id?: string | null
          category?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          direction?: string | null
          external_id?: string | null
          id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_cortesia?: boolean | null
          match_confidence?: string | null
          match_reasons?: Json | null
          parent_entry_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          procedure_name?: string | null
          professional_id?: string | null
          raw_data?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          signature?: string | null
          source?: string | null
          transaction_date?: string | null
          transaction_datetime?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          appointment_id?: string | null
          category?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          direction?: string | null
          external_id?: string | null
          id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_cortesia?: boolean | null
          match_confidence?: string | null
          match_reasons?: Json | null
          parent_entry_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          procedure_name?: string | null
          professional_id?: string | null
          raw_data?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          signature?: string | null
          source?: string | null
          transaction_date?: string | null
          transaction_datetime?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "cashflow_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "cashflow_entries_paid_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_entries_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ai_budget_today: {
        Row: {
          breakdown: Json | null
          clinic_id: string | null
          day_bucket: string | null
          total_calls: number | null
          total_cost_usd: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
        }
        Relationships: []
      }
      v_wa_pro_cost_by_pro: {
        Row: {
          clinic_id: string | null
          cost_usd_total: number | null
          day_bucket: string | null
          ia_calls: number | null
          professional_id: string | null
          queries: number | null
          queries_ok: number | null
          tokens_in_total: number | null
          tokens_out_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_pro_audit_log_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_pro_voice_usage: {
        Row: {
          clinic_id: string | null
          empty_count: number | null
          failed_count: number | null
          month: string | null
          professional_id: string | null
          successful: number | null
          too_long_count: number | null
          total_cost_usd: number | null
          total_minutes: number | null
          total_seconds: number | null
          transcriptions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _agenda_alert_min_before_tick: { Args: never; Returns: number }
      _ai_budget_check: {
        Args: { p_clinic_id: string; p_daily_limit_usd?: number }
        Returns: Json
      }
      _ai_budget_record: {
        Args: {
          p_clinic_id: string
          p_cost_usd: number
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_source: string
          p_user_id: string
        }
        Returns: undefined
      }
      _analytics_clinic_id: { Args: never; Returns: string }
      _anamnese_link: {
        Args: { p_appt_id: string; p_lead_id: string }
        Returns: string
      }
      _appointment_status_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      _appt_professional_phone: {
        Args: { p_appt: Record<string, unknown> }
        Returns: string
      }
      _aq_area_label: { Args: { p_key: string }; Returns: string }
      _aq_area_protocol: { Args: { p_key: string }; Returns: string }
      _aq_area_weight: { Args: { p_key: string }; Returns: number }
      _aq_get_secret: { Args: { p_name: string }; Returns: string }
      _aq_increment_attempts: { Args: { p_id: string }; Returns: undefined }
      _aq_invoke_lara_edge_fn: { Args: never; Returns: number }
      _aq_lookup_lifecycle: { Args: { p_phone: string }; Returns: Json }
      _aq_top_complaints: { Args: { p_areas: string[] }; Returns: Json }
      _b2b_audit: {
        Args: {
          p_action: string
          p_author?: string
          p_from?: string
          p_meta?: Json
          p_notes?: string
          p_partnership_id: string
          p_to?: string
        }
        Returns: string
      }
      _b2b_audit_log_archive: { Args: never; Returns: Json }
      _b2b_gen_public_token: { Args: never; Returns: string }
      _b2b_generate_panel_token: { Args: never; Returns: string }
      _b2b_invoke_edge: {
        Args: { p_body?: Json; p_path: string }
        Returns: Json
      }
      _b2b_mira_welcome_dispatch: {
        Args: { p_partnership_id: string }
        Returns: number
      }
      _b2b_monthly_report_tick: { Args: never; Returns: Json }
      _b2b_normalize: { Args: { t: string }; Returns: string }
      _b2b_normalize_phone: { Args: { p_phone: string }; Returns: string }
      _b2b_notify_dispatch: {
        Args: {
          p_context?: Json
          p_event_key: string
          p_partnership_id: string
        }
        Returns: undefined
      }
      _b2b_panel_rate_limit_check: {
        Args: { p_client_ip: string; p_token: string }
        Returns: boolean
      }
      _b2b_partner_conv_month_stats: {
        Args: {
          p_clinic_id: string
          p_partnership_id: string
          p_year_month: string
        }
        Returns: {
          vouchers_delivered: number
          vouchers_issued: number
          vouchers_opened: number
          vouchers_purchased: number
          vouchers_redeemed: number
          vouchers_scheduled: number
        }[]
      }
      _b2b_playbook_content: {
        Args: {
          p_content: string
          p_kind: string
          p_label: string
          p_partnership_id: string
          p_sort: number
        }
        Returns: string
      }
      _b2b_playbook_target: {
        Args: {
          p_benefit: string
          p_cadence: string
          p_horizon: number
          p_indicator: string
          p_partnership_id: string
          p_sort: number
          p_target: number
        }
        Returns: string
      }
      _b2b_playbook_task: {
        Args: {
          p_desc: string
          p_due_days: number
          p_kind: string
          p_partnership_id: string
          p_title: string
        }
        Returns: string
      }
      _b2b_renewal_sweep: { Args: never; Returns: Json }
      _b2b_scout_process_next: { Args: never; Returns: Json }
      _b2b_task_create_unique: {
        Args: {
          p_description: string
          p_due_date: string
          p_kind: string
          p_partnership_id: string
          p_payload: Json
          p_title: string
        }
        Returns: string
      }
      _b2b_voucher_status_rank: { Args: { p_status: string }; Returns: number }
      _br_date: { Args: { d: string }; Returns: string }
      _clinic_display_name: { Args: { p_variant?: string }; Returns: string }
      _default_clinic_id: { Args: never; Returns: string }
      _enqueue_agenda_alert: {
        Args: {
          p_alert_kind: string
          p_appt: Record<string, unknown>
          p_clinic_id: string
          p_phone: string
          p_rule: Record<string, unknown>
        }
        Returns: number
      }
      _extract_task_title: { Args: { p_text: string }; Returns: string }
      _find_target_appointments: {
        Args: {
          p_clinic_id: string
          p_patient_id: string
          p_professional_id: string
          p_ref_date?: string
          p_scope: string
        }
        Returns: Json
      }
      _fm_share_rate_ok: {
        Args: { p_ip_hash: string; p_token: string }
        Returns: boolean
      }
      _fmt_agenda: { Args: { p: Json; p_label: string }; Returns: string }
      _fmt_day_summary: { Args: { p: Json }; Returns: string }
      _fmt_debtors: { Args: { p: Json }; Returns: string }
      _fmt_finance_commission: {
        Args: { p: Json; p_label: string }
        Returns: string
      }
      _fmt_finance_summary: {
        Args: { p: Json; p_label: string }
        Returns: string
      }
      _fmt_free_slots: { Args: { p: Json; p_label: string }; Returns: string }
      _fmt_mira_usage: { Args: { p: Json }; Returns: string }
      _fmt_next_patient: { Args: { p: Json }; Returns: string }
      _fmt_patient_balance: { Args: { p: Json }; Returns: string }
      _fmt_patient_list: { Args: { p: Json }; Returns: string }
      _fmt_patient_profile: { Args: { p: Json }; Returns: string }
      _fmt_patients_by_procedure: { Args: { p: Json }; Returns: string }
      _fmt_payments_list: {
        Args: { p: Json; p_label: string }
        Returns: string
      }
      _lead_phase_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      _lp_rate_limit_check: {
        Args: { p_endpoint: string; p_max_per_min: number }
        Returns: boolean
      }
      _mag_current_hmac_secret: { Args: never; Returns: string }
      _mag_normalize_phone: { Args: { p_phone: string }; Returns: string }
      _mag_verify_lead_hash: {
        Args: { p_edition_id: string; p_hash: string; p_lead_id: string }
        Returns: boolean
      }
      _magazine_dispatch_cron_runner: { Args: never; Returns: undefined }
      _magazine_err_field: { Args: { p_err: string }; Returns: string }
      _magazine_err_kind: { Args: { p_err: string }; Returns: string }
      _magazine_render_dispatch_msg: {
        Args: {
          p_lead_name: string
          p_link_revista: string
          p_subtitulo: string
          p_template: string
          p_titulo: string
        }
        Returns: string
      }
      _mira_proactive_dispatch: { Args: { p_kind: string }; Returns: number }
      _money: { Args: { n: number }; Returns: string }
      _now_br: { Args: never; Returns: string }
      _parse_cancel_appointment: { Args: { p_text: string }; Returns: Json }
      _parse_create_appointment: { Args: { p_text: string }; Returns: Json }
      _parse_patient_registration: { Args: { p_text: string }; Returns: Json }
      _parse_reschedule_appointment: { Args: { p_text: string }; Returns: Json }
      _parse_task_time: {
        Args: { p_now?: string; p_text: string }
        Returns: string
      }
      _phone_last8: { Args: { p_phone: string }; Returns: string }
      _quiz_event_alerts: {
        Args: {
          p_clinic_id: string
          p_contact_name: string
          p_contact_phone: string
          p_is_new_lead: boolean
          p_old_temp?: string
          p_quiz_id: string
          p_quiz_title: string
          p_temperature: string
        }
        Returns: undefined
      }
      _quiz_format_wa_message: {
        Args: { p_alert_type: string; p_alerts: Json; p_quiz_title: string }
        Returns: string
      }
      _quiz_kpis_for_period: {
        Args: {
          p_clinic_id: string
          p_from: string
          p_quiz_id: string
          p_to: string
        }
        Returns: Json
      }
      _render_appt_choices: {
        Args: { p_items: Json; p_patient_name: string }
        Returns: string
      }
      _render_appt_template: {
        Args: { p_appt: Record<string, unknown>; p_template: string }
        Returns: string
      }
      _resolve_reference: {
        Args: { p_context: Record<string, unknown>; p_text: string }
        Returns: Json
      }
      _resolve_target_professional: {
        Args: {
          p_clinic_id: string
          p_sender_prof_id: string
          p_sender_scope: string
        }
        Returns: string
      }
      _save_context: {
        Args: {
          p_clinic_id: string
          p_entity_id?: string
          p_entity_name?: string
          p_entity_type?: string
          p_intent: string
          p_options?: Json
          p_phone: string
          p_professional: string
          p_query: string
        }
        Returns: undefined
      }
      _sdr_eval_condition: {
        Args: { p_cond: Json; p_context: Json; p_lead_id: string }
        Returns: boolean
      }
      _sdr_exec_action: {
        Args: {
          p_action: Json
          p_clinic_id: string
          p_lead_id: string
          p_rule_id: string
        }
        Returns: boolean
      }
      _sdr_record_phase_change: {
        Args: {
          p_changed_by?: string
          p_lead_id: string
          p_to_phase: string
          p_triggered: string
        }
        Returns: undefined
      }
      _strip_markdown: { Args: { p_text: string }; Returns: string }
      _today_br: { Args: never; Returns: string }
      _vpi_active_challenge: {
        Args: never
        Returns: {
          bonus_fixo: number
          clinic_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          emoji: string | null
          id: string
          is_active: boolean
          msg_template_fim: string | null
          msg_template_inicio: string | null
          multiplier: number
          periodo_fim: string
          periodo_inicio: string
          slug: string
          sort_order: number
          titulo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vpi_challenges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _vpi_calc_tier: { Args: { p_creditos: number }; Returns: string }
      _vpi_card_url: { Args: { p_token: string }; Returns: string }
      _vpi_challenges_auto_activate: { Args: never; Returns: Json }
      _vpi_credit_cascade: {
        Args: { p_creditos: number; p_partner_id: string }
        Returns: Json
      }
      _vpi_enqueue_voucher_recebido: {
        Args: { p_indication_id: string }
        Returns: undefined
      }
      _vpi_first_name_from_lead: {
        Args: { p_lead_id: string }
        Returns: string
      }
      _vpi_funnel_lost_sweep: { Args: never; Returns: Json }
      _vpi_funnel_stage_rank: { Args: { p_stage: string }; Returns: number }
      _vpi_high_perf_check_partner: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      _vpi_missao_weekly_auto: { Args: never; Returns: Json }
      _vpi_palette_is_valid: {
        Args: { p_tier: string; p_variant: string }
        Returns: boolean
      }
      _vpi_refresh_aberturas_mes: {
        Args: { p_partner_id: string }
        Returns: number
      }
      _vpi_refresh_counters: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      _vpi_render: {
        Args: { p_template: string; p_vars: Json }
        Returns: string
      }
      _vpi_revista_ensure_edition: {
        Args: { p_clinic_id: string }
        Returns: string
      }
      _vpi_revista_upsert_asset: {
        Args: {
          p_alt: string
          p_clinic_id: string
          p_edition_id: string
          p_url: string
        }
        Returns: string
      }
      _vpi_send_fotona_notification: {
        Args: { p_partner_id: string; p_slug: string; p_vars: Json }
        Returns: undefined
      }
      _vpi_slugify: { Args: { p_text: string }; Returns: string }
      _vpi_streak_meses: { Args: { p_partner_id: string }; Returns: number }
      _vpi_update_funnel_stage: {
        Args: { p_lead_id: string; p_new_stage: string; p_ts_column: string }
        Returns: number
      }
      _vpi_update_missao_progress: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      _wa_outbox_content_hash: { Args: { content: string }; Returns: string }
      _wa_outbox_tick: { Args: never; Returns: number }
      _wa_pick_attachment_url: {
        Args: { p_attachment_url_single: string; p_attachment_urls: Json }
        Returns: string
      }
      _wa_render_template: {
        Args: { p_body: string; p_vars: Json }
        Returns: string
      }
      _webhook_deliveries_sanitize: { Args: { p_payload: Json }; Returns: Json }
      _webhook_secret_is_strong: {
        Args: { p_secret: string }
        Returns: boolean
      }
      _webhook_url_is_safe: { Args: { p_url: string }; Returns: boolean }
      accept_invitation: { Args: { p_raw_token: string }; Returns: Json }
      activate_staff: { Args: { p_user_id: string }; Returns: Json }
      agenda_invariants_check: {
        Args: never
        Returns: {
          detail: string
          invariant: string
          status: string
        }[]
      }
      alexa_log_announce: {
        Args: {
          p_device: string
          p_error?: string
          p_message: string
          p_patient?: string
          p_rule_name?: string
          p_status?: string
        }
        Returns: Json
      }
      alexa_log_update: {
        Args: { p_error?: string; p_id: string; p_status: string }
        Returns: Json
      }
      alexa_metrics: { Args: { p_days?: number }; Returns: Json }
      alexa_pending_queue: { Args: never; Returns: Json }
      anamnesis_purge_all: { Args: never; Returns: Json }
      app_clinic_id: { Args: never; Returns: string }
      app_role: { Args: never; Returns: string }
      appointment_attend: {
        Args: { p_appointment_id: string; p_chegada_em?: string }
        Returns: Json
      }
      appointment_change_status: {
        Args: {
          p_appointment_id: string
          p_new_status: string
          p_reason?: string
        }
        Returns: Json
      }
      appointment_finalize: {
        Args: {
          p_appointment_id: string
          p_lost_reason?: string
          p_notes?: string
          p_orcamento_discount?: number
          p_orcamento_items?: Json
          p_orcamento_subtotal?: number
          p_outcome: string
          p_payment_status?: string
          p_value?: number
        }
        Returns: Json
      }
      appt_create_series: { Args: { p_appts: Json }; Returns: Json }
      appt_delete: { Args: { p_id: string }; Returns: Json }
      appt_delete_series: { Args: { p_group_id: string }; Returns: Json }
      appt_list: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_professional_ids?: string[]
        }
        Returns: Json
      }
      appt_set_canonical: {
        Args: { p_id: string; p_pagamentos?: Json; p_procedimentos?: Json }
        Returns: Json
      }
      appt_set_cortesia: {
        Args: {
          p_id: string
          p_motivo?: string
          p_qtd_procs?: number
          p_valor_cortesia?: number
        }
        Returns: Json
      }
      appt_sync_batch: { Args: { p_appointments: Json }; Returns: Json }
      appt_upsert: { Args: { p_data: Json }; Returns: Json }
      aq_phone_recent_dispatch: {
        Args: { p_hours?: number; p_phone: string }
        Returns: boolean
      }
      b2b_activities_list: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_activity_delete: { Args: { p_id: string }; Returns: Json }
      b2b_activity_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_admin_phone_revoke: { Args: { p_phone_last8: string }; Returns: Json }
      b2b_admin_phone_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_admin_phones_list: {
        Args: never
        Returns: {
          can_approve: boolean
          can_create: boolean
          created_at: string
          created_by: string | null
          is_active: boolean
          name: string
          notes: string | null
          phone_full: string | null
          phone_last8: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "b2b_admin_phones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      b2b_alert_dismiss: { Args: { p_id: string }; Returns: Json }
      b2b_alerts_list: { Args: { p_limit?: number }; Returns: Json }
      b2b_alerts_scan: { Args: never; Returns: Json }
      b2b_anniversaries_scan: { Args: never; Returns: Json }
      b2b_application_approve: {
        Args: { p_application_id: string; p_note?: string }
        Returns: Json
      }
      b2b_application_create: { Args: { p_payload: Json }; Returns: Json }
      b2b_application_mark_followed_up: {
        Args: { p_id: string }
        Returns: Json
      }
      b2b_application_reject: {
        Args: { p_application_id: string; p_reason?: string }
        Returns: Json
      }
      b2b_applications_archive_stale: { Args: never; Returns: Json }
      b2b_applications_follow_up_queue: { Args: never; Returns: Json }
      b2b_applications_list: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      b2b_apply_playbook: {
        Args: { p_kind: string; p_partnership_id: string }
        Returns: Json
      }
      b2b_attribution_leads: {
        Args: { p_limit?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_attribution_roi: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_attribution_scan: { Args: { p_days?: number }; Returns: Json }
      b2b_audit_log_recent: {
        Args: { p_action?: string; p_limit?: number }
        Returns: {
          action: string
          author: string
          created_at: string
          from_value: string
          id: string
          notes: string
          partnership_id: string
          partnership_name: string
          to_value: string
        }[]
      }
      b2b_audit_timeline: {
        Args: { p_limit?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_brief_dispatch_to_wa: { Args: { p_task_id: string }; Returns: Json }
      b2b_brief_send: {
        Args: { p_partnership_id: string; p_task_id?: string }
        Returns: Json
      }
      b2b_brief_send_all_active: { Args: never; Returns: Json }
      b2b_broadcast_partner_ids: { Args: { p_filters?: Json }; Returns: Json }
      b2b_broadcast_preview: { Args: { p_filters?: Json }; Returns: Json }
      b2b_bulk_job_create: {
        Args: { p_kind: string; p_meta?: Json; p_total: number }
        Returns: Json
      }
      b2b_bulk_job_finish: {
        Args: { p_error?: string; p_id: string; p_status?: string }
        Returns: Json
      }
      b2b_bulk_job_get: { Args: { p_id: string }; Returns: Json }
      b2b_bulk_job_update: {
        Args: { p_failed?: number; p_id: string; p_processed?: number }
        Returns: Json
      }
      b2b_candidate_add_manual: { Args: { p_payload: Json }; Returns: Json }
      b2b_candidate_evaluate_apply: {
        Args: { p_id: string; p_result: Json }
        Returns: Json
      }
      b2b_candidate_evaluate_payload: { Args: { p_id: string }; Returns: Json }
      b2b_candidate_find_similar: {
        Args: { p_name: string; p_phone?: string }
        Returns: Json
      }
      b2b_candidate_list: {
        Args: {
          p_category?: string
          p_limit?: number
          p_min_score?: number
          p_status?: string
        }
        Returns: Json
      }
      b2b_candidate_promote: { Args: { p_id: string }; Returns: Json }
      b2b_candidate_register: { Args: { p_payload: Json }; Returns: Json }
      b2b_candidate_set_status: {
        Args: { p_id: string; p_notes?: string; p_status: string }
        Returns: Json
      }
      b2b_clinic_defaults_get: { Args: never; Returns: Json }
      b2b_clinic_defaults_update: { Args: { p_payload: Json }; Returns: Json }
      b2b_closure_approve: {
        Args: { p_id: string; p_reason?: string; p_template_key?: string }
        Returns: Json
      }
      b2b_closure_detect_inactive: { Args: never; Returns: Json }
      b2b_closure_dismiss: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      b2b_closure_list_pending: { Args: never; Returns: Json }
      b2b_cohort_retention: { Args: { p_months?: number }; Returns: Json }
      b2b_comm_event_key_delete: { Args: { p_key: string }; Returns: Json }
      b2b_comm_event_key_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_comm_events_catalog: { Args: never; Returns: Json }
      b2b_comm_history: {
        Args: {
          p_event_key?: string
          p_limit?: number
          p_partnership_id?: string
        }
        Returns: {
          channel: string
          created_at: string
          error_message: string
          event_key: string
          id: string
          partnership_id: string
          partnership_name: string
          recipient_phone: string
          recipient_role: string
          sender_instance: string
          status: string
          text_content: string
        }[]
      }
      b2b_comm_stats: { Args: never; Returns: Json }
      b2b_comm_template_assign_sequence: {
        Args: { p_id: string; p_sequence_name: string }
        Returns: Json
      }
      b2b_comm_template_delete: { Args: { p_id: string }; Returns: Json }
      b2b_comm_template_reorder: {
        Args: { p_id: string; p_new_order: number }
        Returns: Json
      }
      b2b_comm_template_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_comm_templates_list: {
        Args: { p_event_key?: string; p_partnership_id?: string }
        Returns: Json
      }
      b2b_comment_add: {
        Args: { p_author: string; p_body: string; p_partnership_id: string }
        Returns: Json
      }
      b2b_comment_delete: { Args: { p_id: string }; Returns: Json }
      b2b_comments_list: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_consent_get: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_consent_set: {
        Args: {
          p_granted: boolean
          p_notes?: string
          p_partnership_id: string
          p_source?: string
          p_type: string
        }
        Returns: Json
      }
      b2b_contract_delete: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_contract_get: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_contract_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_cost_summary: { Args: { p_limit?: number }; Returns: Json }
      b2b_critical_alerts: {
        Args: never
        Returns: {
          category: string
          is_image_partner: boolean
          message: string
          partnership_id: string
          partnership_name: string
          priority: number
          severity: string
          suggested_action: string
          value: Json
        }[]
      }
      b2b_cron_day01_briefs: { Args: never; Returns: Json }
      b2b_cron_day05_scout: { Args: never; Returns: Json }
      b2b_cron_day10_content_checkin: { Args: never; Returns: Json }
      b2b_cron_day15_midmonth: { Args: never; Returns: Json }
      b2b_cron_day25_sazonal: { Args: never; Returns: Json }
      b2b_cron_monthend_report: { Args: never; Returns: Json }
      b2b_daily_digest: { Args: never; Returns: Json }
      b2b_dispatch_queue_cancel_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      b2b_dispatch_queue_complete: {
        Args: { p_queue_id: string; p_voucher_id: string }
        Returns: Json
      }
      b2b_dispatch_queue_enqueue: { Args: { p_payload: Json }; Returns: Json }
      b2b_dispatch_queue_fail: {
        Args: { p_error: string; p_queue_id: string }
        Returns: Json
      }
      b2b_dispatch_queue_pick: { Args: { p_limit?: number }; Returns: Json }
      b2b_dispatch_queue_reset_stuck: {
        Args: { p_threshold_minutes?: number }
        Returns: Json
      }
      b2b_dropoff_vouchers: { Args: { p_days?: number }; Returns: Json }
      b2b_financial_kpis: { Args: { p_days?: number }; Returns: Json }
      b2b_forecast_month: {
        Args: { p_meta_new_partners?: number; p_meta_vouchers?: number }
        Returns: Json
      }
      b2b_funnel_benchmark_list: { Args: never; Returns: Json }
      b2b_funnel_benchmark_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_funnel_breakdown: {
        Args: { p_days?: number; p_partnership_id?: string }
        Returns: Json
      }
      b2b_get_panel_url: { Args: { p_token: string }; Returns: string }
      b2b_group_exposure_log: { Args: { p_payload: Json }; Returns: Json }
      b2b_group_exposures_list: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_group_stats: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_growth_weekly: { Args: { p_weeks?: number }; Returns: Json }
      b2b_health_snapshot: { Args: never; Returns: Json }
      b2b_health_trend: {
        Args: { p_days?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_health_trend_summary: { Args: { p_days?: number }; Returns: Json }
      b2b_heatmap_activity: { Args: { p_days?: number }; Returns: Json }
      b2b_insight_add: { Args: { p_payload: Json }; Returns: Json }
      b2b_insight_dismiss:
        | { Args: { p_id: string }; Returns: Json }
        | {
            Args: {
              p_kind: string
              p_partnership_id: string
              p_ttl_days?: number
            }
            Returns: Json
          }
      b2b_insight_mark_acted: { Args: { p_insight_id: string }; Returns: Json }
      b2b_insight_mark_seen: { Args: { p_id: string }; Returns: Json }
      b2b_insight_undo_dismiss: {
        Args: { p_kind: string; p_partnership_id: string }
        Returns: Json
      }
      b2b_insights_global: { Args: never; Returns: Json }
      b2b_insights_list: { Args: { p_limit?: number }; Returns: Json }
      b2b_insights_top: {
        Args: { p_limit?: number }
        Returns: {
          acted_upon_at: string | null
          acted_upon_by: string | null
          clinic_id: string
          content: string | null
          created_at: string
          data: Json | null
          detail: string | null
          dismissed_at: string | null
          headline: string | null
          id: string
          insight_type: string | null
          metadata: Json | null
          model_used: string | null
          partnership_id: string | null
          score: number | null
          seen_at: string | null
          severity: string | null
          source_period: unknown
          suggested_action: string | null
          week_ref: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "b2b_insights"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      b2b_is_admin_phone: {
        Args: { p_capability?: string; p_phone: string }
        Returns: boolean
      }
      b2b_mira_analytics: { Args: { p_days?: number }; Returns: Json }
      b2b_mira_invariants_check: {
        Args: never
        Returns: {
          detail: string
          invariant: string
          status: string
        }[]
      }
      b2b_mira_welcome_resend: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_monthly_target_get: { Args: { p_month?: string }; Returns: Json }
      b2b_monthly_target_set: {
        Args: {
          p_month: string
          p_target_count: number
          p_tier_focus?: number[]
        }
        Returns: Json
      }
      b2b_nps_get: { Args: { p_token: string }; Returns: Json }
      b2b_nps_issue: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_nps_quarterly_dispatch: { Args: never; Returns: Json }
      b2b_nps_responses_list: {
        Args: { p_bucket?: string; p_limit?: number; p_partnership_id?: string }
        Returns: Json
      }
      b2b_nps_submit: {
        Args: { p_comment?: string; p_score: number; p_token: string }
        Returns: Json
      }
      b2b_nps_summary: { Args: { p_partnership_id?: string }; Returns: Json }
      b2b_partner_conversion_monthly: {
        Args: { p_partnership_id: string; p_year_month: string }
        Returns: Json
      }
      b2b_partner_conversion_monthly_all: {
        Args: { p_year_month: string }
        Returns: {
          conv_total_pct: number
          conv_total_pct_prev: number
          delta_conv_pp: number
          delta_issued_pct: number
          is_image_partner: boolean
          partnership_id: string
          partnership_name: string
          pillar: string
          status: string
          vouchers_issued: number
          vouchers_issued_prev: number
          vouchers_purchased: number
        }[]
      }
      b2b_partner_growth_panel: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partner_monthly_stats: {
        Args: { p_month?: number; p_partnership_id: string; p_year?: number }
        Returns: Json
      }
      b2b_partner_panel_get: {
        Args: { p_client_ip?: string; p_token: string }
        Returns: Json
      }
      b2b_partner_panel_issue_token: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partner_panel_revoke: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partner_performance: {
        Args: { p_rolling_days?: number }
        Returns: {
          category: string
          classification: string
          conversion_pct: number
          days_since_last_voucher: number
          health_color: string
          is_image_partner: boolean
          last_voucher_at: string
          name: string
          partnership_id: string
          pillar: string
          status: string
          vouchers_attended: number
          vouchers_converted: number
          vouchers_delivered: number
          vouchers_emitted: number
          vouchers_scheduled: number
          weeks_with_voucher: number
        }[]
      }
      b2b_partner_performance_full: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_anonymize: {
        Args: { p_partnership_id: string; p_reason: string }
        Returns: Json
      }
      b2b_partnership_assign: {
        Args: { p_manager: string; p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_audit_timeline: {
        Args: { p_limit?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_content_list: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_cost: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_events_list: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_export: { Args: { p_status?: string }; Returns: Json }
      b2b_partnership_export_data: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_get: { Args: { p_id: string }; Returns: Json }
      b2b_partnership_health_recalc: { Args: { p_id: string }; Returns: Json }
      b2b_partnership_health_recalc_all: { Args: never; Returns: Json }
      b2b_partnership_health_snapshot: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_impact_score: {
        Args: { p_partnership_id?: string }
        Returns: Json
      }
      b2b_partnership_leads_history: {
        Args: { p_limit?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_list: {
        Args: { p_pillar?: string; p_status?: string; p_tier?: number }
        Returns: Json
      }
      b2b_partnership_phone_check: {
        Args: { p_exclude_id?: string; p_phone: string }
        Returns: Json
      }
      b2b_partnership_quality: { Args: { p_days?: number }; Returns: Json }
      b2b_partnership_roi: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_partnership_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      b2b_partnership_set_geo: {
        Args: { p_lat: number; p_lng: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_set_image_flag: {
        Args: { p_is_image: boolean; p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_set_status: {
        Args: { p_id: string; p_reason?: string; p_status: string }
        Returns: Json
      }
      b2b_partnership_slug_check: {
        Args: { p_exclude_id?: string; p_slug: string }
        Returns: Json
      }
      b2b_partnership_targets_list: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_partnership_upsert: {
        Args: { p_payload: Json; p_slug: string }
        Returns: Json
      }
      b2b_partnership_velocity: {
        Args: { p_days?: number; p_partnership_id?: string }
        Returns: Json
      }
      b2b_partnerships_geo_list: { Args: never; Returns: Json }
      b2b_partnerships_hall: { Args: never; Returns: Json }
      b2b_payback_analysis: {
        Args: { p_days?: number; p_partnership_id?: string }
        Returns: Json
      }
      b2b_pipeline_funnel: { Args: { p_days?: number }; Returns: Json }
      b2b_plan_category_ensure: {
        Args: { p_label?: string; p_pillar?: string; p_slug: string }
        Returns: Json
      }
      b2b_playbook_apply: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_playbook_auto_set: {
        Args: { p_enabled: boolean; p_partnership_id: string }
        Returns: Json
      }
      b2b_playbook_ia_bulk_insert_content: {
        Args: { p_items: Json; p_partnership_id: string }
        Returns: Json
      }
      b2b_playbook_ia_run_finish: {
        Args: {
          p_cost_usd?: number
          p_error?: string
          p_input_tokens?: number
          p_items_created?: number
          p_output_tokens?: number
          p_run_id: string
          p_status: string
        }
        Returns: Json
      }
      b2b_playbook_ia_run_start: {
        Args: {
          p_partnership_id: string
          p_requested_by?: string
          p_scope: string
        }
        Returns: Json
      }
      b2b_playbook_ia_runs_list: {
        Args: { p_limit?: number; p_partnership_id: string }
        Returns: Json
      }
      b2b_playbook_template_delete: {
        Args: { p_kind: string; p_name: string }
        Returns: Json
      }
      b2b_playbook_template_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_renewal_dashboard: { Args: never; Returns: Json }
      b2b_renewal_upcoming: { Args: { p_days_ahead?: number }; Returns: Json }
      b2b_scout_can_scan: { Args: { p_category: string }; Returns: Json }
      b2b_scout_config_get: { Args: never; Returns: Json }
      b2b_scout_config_update: {
        Args: { p_payload: Json; p_user?: string }
        Returns: Json
      }
      b2b_scout_consumed_current_month: { Args: never; Returns: Json }
      b2b_scout_job_complete: {
        Args: {
          p_candidates_created?: number
          p_cost_brl?: number
          p_error?: string
          p_job_id: string
          p_status: string
        }
        Returns: Json
      }
      b2b_scout_queue_scan: {
        Args: {
          p_category: string
          p_city: string
          p_limit?: number
          p_partnership_id?: string
          p_priority?: number
          p_tier?: number
        }
        Returns: Json
      }
      b2b_scout_summary: { Args: never; Returns: Json }
      b2b_scout_usage_log: {
        Args: {
          p_candidate_id?: string
          p_category?: string
          p_cost_brl: number
          p_event_type: string
          p_meta?: Json
        }
        Returns: Json
      }
      b2b_seasonal_current: { Args: never; Returns: Json }
      b2b_seasonal_get: { Args: { p_month: number }; Returns: Json }
      b2b_suggestions_snapshot: { Args: never; Returns: Json }
      b2b_system_health: { Args: never; Returns: Json }
      b2b_task_assign: {
        Args: { p_id: string; p_owner?: string }
        Returns: Json
      }
      b2b_task_resolve: {
        Args: { p_id: string; p_status?: string }
        Returns: Json
      }
      b2b_tasks_list:
        | {
            Args: { p_kind?: string; p_limit?: number; p_status?: string }
            Returns: Json
          }
        | {
            Args: {
              p_kind?: string
              p_limit?: number
              p_owner?: string
              p_status?: string
            }
            Returns: Json
          }
      b2b_team_managers_list: { Args: never; Returns: Json }
      b2b_tier_config_list: { Args: never; Returns: Json }
      b2b_tier_config_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_timeseries: {
        Args: {
          p_bucket?: string
          p_partnership_id?: string
          p_periods?: number
        }
        Returns: Json
      }
      b2b_voucher_audio_resend: {
        Args: { p_voucher_id: string }
        Returns: Json
      }
      b2b_voucher_cancel: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      b2b_voucher_combo_delete: { Args: { p_id: string }; Returns: Json }
      b2b_voucher_combo_upsert: { Args: { p_payload: Json }; Returns: Json }
      b2b_voucher_combos_list: {
        Args: never
        Returns: {
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          sort_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "b2b_voucher_combos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      b2b_voucher_compose_message: {
        Args: { p_link_base?: string; p_voucher_id: string }
        Returns: Json
      }
      b2b_voucher_funnel: { Args: { p_partnership_id: string }; Returns: Json }
      b2b_voucher_get_by_token: { Args: { p_token: string }; Returns: Json }
      b2b_voucher_issue: { Args: { p_payload: Json }; Returns: Json }
      b2b_voucher_issue_with_dedup: { Args: { p_payload: Json }; Returns: Json }
      b2b_voucher_list_by_partnership: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      b2b_voucher_mark_delivered: { Args: { p_id: string }; Returns: Json }
      b2b_voucher_recipient_check: {
        Args: { p_recipient_name?: string; p_recipient_phone: string }
        Returns: Json
      }
      b2b_voucher_redeem: {
        Args: {
          p_appointment_id?: string
          p_operator?: string
          p_token: string
        }
        Returns: Json
      }
      b2b_voucher_set_theme: {
        Args: { p_id: string; p_theme: string }
        Returns: Json
      }
      b2b_vouchers_expire_batch: { Args: never; Returns: Json }
      b2b_wa_sender_lookup: { Args: { p_phone: string }; Returns: Json }
      b2b_weekly_insight_trigger: { Args: never; Returns: Json }
      b2b_welcome_followup_batch: { Args: never; Returns: Json }
      b2b_welcome_followup_scan: { Args: never; Returns: Json }
      b2b_welcome_followup_send: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      broadcast_notification: {
        Args: {
          p_body?: string
          p_data?: Json
          p_roles?: string[]
          p_title?: string
          p_type?: string
        }
        Returns: Json
      }
      budget_ensure_share_token: {
        Args: { p_budget_id: string }
        Returns: string
      }
      budget_get_by_token: { Args: { p_token: string }; Returns: Json }
      bulk_import_leads_with_destination: {
        Args: { p_default_destination?: string; p_payload: Json }
        Returns: Json
      }
      bulk_set_module_permissions: {
        Args: { p_permissions: Json }
        Returns: Json
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      case_gallery_create: {
        Args: {
          p_consent_text: string
          p_focus_area: string
          p_focus_label: string
          p_months_since: number
          p_patient_age: number
          p_patient_gender: string
          p_patient_initials: string
          p_photo_after_path: string
          p_photo_before_path: string
          p_summary: string
          p_tags: Json
        }
        Returns: string
      }
      case_gallery_delete: { Args: { p_id: string }; Returns: Json }
      case_gallery_list: {
        Args: { p_age_max?: number; p_age_min?: number; p_focus_area?: string }
        Returns: {
          created_at: string
          display_order: number
          focus_area: string
          focus_label: string
          id: string
          months_since_procedure: number
          patient_age: number
          patient_gender: string
          patient_initials: string
          photo_after_path: string
          photo_before_path: string
          summary: string
          tags: Json
        }[]
      }
      case_gallery_update: {
        Args: {
          p_focus_area: string
          p_focus_label: string
          p_id: string
          p_is_active: boolean
          p_months_since: number
          p_patient_age: number
          p_patient_initials: string
          p_summary: string
          p_tags: Json
        }
        Returns: boolean
      }
      cashflow_auto_reconcile: {
        Args: {
          p_amount_tolerance?: number
          p_end_date?: string
          p_start_date?: string
          p_tolerance_days?: number
        }
        Returns: Json
      }
      cashflow_create_entry: { Args: { p_data: Json }; Returns: Json }
      cashflow_das_estimate: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      cashflow_delete_entry: { Args: { p_id: string }; Returns: Json }
      cashflow_dre: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      cashflow_forecast: { Args: { p_months_ahead?: number }; Returns: Json }
      cashflow_get_config: { Args: never; Returns: Json }
      cashflow_get_suggestions: {
        Args: { p_end_date?: string; p_limit?: number; p_start_date?: string }
        Returns: Json
      }
      cashflow_intelligence: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      cashflow_link_appointment: {
        Args: {
          p_appointment_id: string
          p_entry_id: string
          p_patient_id?: string
        }
        Returns: Json
      }
      cashflow_list_entries: {
        Args: {
          p_direction?: string
          p_end_date?: string
          p_limit?: number
          p_method?: string
          p_only_unreconciled?: boolean
          p_start_date?: string
        }
        Returns: Json
      }
      cashflow_patients_ltv: {
        Args: { p_limit?: number; p_only_active?: boolean }
        Returns: Json
      }
      cashflow_reject_suggestion: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      cashflow_save_config: { Args: { p_data: Json }; Returns: Json }
      cashflow_search_appointments: {
        Args: { p_amount: number; p_date: string; p_tolerance_days?: number }
        Returns: Json
      }
      cashflow_segments: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      cashflow_summary: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      cashflow_ticket_medio: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      cashflow_trends: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      cashflow_update_entry: {
        Args: { p_data: Json; p_id: string }
        Returns: Json
      }
      cashflow_vip_sumidos: {
        Args: { p_limit?: number; p_max_days?: number; p_min_days?: number }
        Returns: Json
      }
      cleanup_expired_invites: { Args: never; Returns: Json }
      cleanup_old_notifications: { Args: never; Returns: Json }
      clinic_backup_log_record: {
        Args: { p_label: string; p_size_bytes: number; p_storage_path: string }
        Returns: string
      }
      clinic_backup_snapshot: { Args: never; Returns: Json }
      complaint_list: { Args: { p_patient_id: string }; Returns: Json }
      complaint_migrate_from_leads: { Args: never; Returns: Json }
      complaint_resolve: { Args: { p_id: string }; Returns: Json }
      complaint_upsert: {
        Args: {
          p_appointment_id?: string
          p_complaint?: string
          p_id?: string
          p_notes?: string
          p_patient_id?: string
          p_professional_name?: string
          p_retouch_interval_days?: number
          p_status?: string
          p_treatment_date?: string
          p_treatment_procedure?: string
        }
        Returns: Json
      }
      complaints_by_type: { Args: never; Returns: Json }
      complaints_pending_retouch: { Args: never; Returns: Json }
      complete_anamnesis_form: {
        Args: {
          p_clinic_id: string
          p_final_answers?: Json
          p_patient_address?: Json
          p_patient_birth_date?: string
          p_patient_cpf?: string
          p_patient_first_name?: string
          p_patient_id: string
          p_patient_last_name?: string
          p_patient_phone?: string
          p_patient_rg?: string
          p_patient_sex?: string
          p_request_id: string
          p_response_id: string
        }
        Returns: undefined
      }
      create_anamnesis_request: {
        Args: {
          p_appointment_id?: string
          p_clinic_id: string
          p_created_by?: string
          p_expires_at?: string
          p_patient_id: string
          p_template_id: string
        }
        Returns: Json
      }
      create_owner_profile: {
        Args: { p_clinic_id: string; p_first_name: string; p_last_name: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dashboard_kpis: { Args: never; Returns: Json }
      deactivate_staff: { Args: { p_user_id: string }; Returns: Json }
      delete_alexa_device: { Args: { p_id: string }; Returns: Json }
      fin_get_all_data: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      fin_get_annual_plan: { Args: { p_year: number }; Returns: Json }
      fin_save_annual_plan: {
        Args: { p_plan_data: Json; p_year: number }
        Returns: Json
      }
      fin_save_config: {
        Args: { p_demo?: Json; p_gastos?: Json; p_procs?: Json }
        Returns: Json
      }
      fin_save_month_goal: {
        Args: { p_meta_data: Json; p_month: number; p_year: number }
        Returns: Json
      }
      flipbook_active_offer_for: {
        Args: { p_coupon_code?: string; p_product_id: string }
        Returns: {
          active: boolean
          billing: string
          coupon_code: string | null
          created_at: string
          currency: string
          current_purchases: number
          id: string
          max_purchases: number | null
          metadata: Json
          name: string
          price_cents: number
          priority: number
          product_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "flipbook_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flipbook_conversion_funnel: {
        Args: { book_id?: string; days_back?: number }
        Returns: {
          event_count: number
          kind: string
          unique_sessions: number
        }[]
      }
      flipbook_resolve_access_token: {
        Args: { p_access_token: string; p_flipbook_id: string }
        Returns: string
      }
      fm_get_api_key: { Args: never; Returns: string }
      fm_get_crypto_key: { Args: never; Returns: string }
      fm_share_create: {
        Args: {
          p_after_photo_path: string
          p_analysis_text: string
          p_before_photo_path: string
          p_clinic_name: string
          p_consent_text: string
          p_cta_phone: string
          p_lead_id: string
          p_lead_name: string
          p_metrics: Json
          p_procedure_label: string
          p_professional_name: string
          p_source_appointment_id: string
          p_token: string
          p_ttl_days: number
        }
        Returns: Json
      }
      fm_share_expire_old: { Args: never; Returns: number }
      fm_share_list: {
        Args: { p_lead_id?: string; p_status?: string }
        Returns: {
          access_count: number
          created_at: string
          expires_at: string
          id: string
          is_expired: boolean
          last_accessed_at: string
          lead_id: string
          lead_name: string
          procedure_label: string
          status: string
          token: string
        }[]
      }
      fm_share_resolve: {
        Args: { p_ip_hash?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      fm_share_revoke: {
        Args: { p_id: string; p_reason: string; p_user_id?: string }
        Returns: Json
      }
      fm_storage_cleanup_enqueue: {
        Args: {
          p_bucket: string
          p_paths: string[]
          p_reason?: string
          p_share_id?: string
        }
        Returns: number
      }
      fm_storage_cleanup_mark_processed: {
        Args: { p_error?: string; p_ids: number[]; p_success: boolean }
        Returns: number
      }
      generate_anamnesis_request_token: {
        Args: never
        Returns: {
          raw_token: string
          token_hash: string
        }[]
      }
      generate_public_slug: { Args: never; Returns: string }
      generate_slug: { Args: never; Returns: string }
      generate_token: { Args: never; Returns: string }
      get_alexa_config: { Args: never; Returns: Json }
      get_alexa_devices: { Args: never; Returns: Json }
      get_clinic_settings: { Args: never; Returns: Json }
      get_facial_photo: { Args: { p_hash: string }; Returns: Json }
      get_facial_session: { Args: { p_lead_id: string }; Returns: Json }
      get_financial_audit_for_record: {
        Args: { p_record_id: string; p_table: string }
        Returns: Json
      }
      get_injetaveis: { Args: { p_apenas_ativos?: boolean }; Returns: Json }
      get_lead_rfm: {
        Args: { p_lead_id: string }
        Returns: {
          current_segment: string
          frequency: number
          lead_id: string
          monetary: number
          recency_days: number
        }[]
      }
      get_module_permissions: { Args: never; Returns: Json }
      get_my_effective_permissions: { Args: never; Returns: Json }
      get_my_profile: { Args: never; Returns: Json }
      get_procedimentos: { Args: { p_apenas_ativos?: boolean }; Returns: Json }
      get_professionals: { Args: never; Returns: Json }
      get_rooms: { Args: never; Returns: Json }
      get_technologies: { Args: never; Returns: Json }
      get_unread_count: { Args: never; Returns: Json }
      get_user_permissions: { Args: { p_user_id?: string }; Returns: Json }
      growth_channel_analytics: {
        Args: { p_cost_by_channel?: Json; p_period_days?: number }
        Returns: Json
      }
      growth_content_mark_posted: {
        Args: { p_source_id: string; p_type: string; p_url?: string }
        Returns: Json
      }
      growth_content_opportunities: {
        Args: { p_limit?: number; p_period_days?: number }
        Returns: Json
      }
      growth_nsm_snapshot: { Args: never; Returns: Json }
      growth_risks_snapshot: { Args: never; Returns: Json }
      growth_tracker_read_all: { Args: never; Returns: Json }
      growth_tracker_reset_all: { Args: never; Returns: undefined }
      growth_tracker_set_field: {
        Args: {
          p_field: string
          p_item_id: string
          p_user?: string
          p_value: Json
        }
        Returns: Json
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      inbox_notification_create: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_payload?: Json
          p_reason: string
          p_source: string
        }
        Returns: string
      }
      inbox_notification_mark_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      insert_quiz_event: {
        Args: {
          p_clinic_id: string
          p_contact_name?: string
          p_contact_phone?: string
          p_event_type: string
          p_ip_hash?: string
          p_metadata?: Json
          p_quiz_id: string
          p_session_id: string
          p_step_index?: number
          p_step_label?: string
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: string
      }
      invite_professional_as_user: {
        Args: {
          p_email: string
          p_permissions?: Json
          p_professional_id: string
          p_role: string
        }
        Returns: Json
      }
      invite_staff: {
        Args: {
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_permissions?: Json
          p_professional_id?: string
          p_role: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      lara_pick_template: { Args: { p_key: string }; Returns: Json }
      lara_voucher_followup_clear_stuck: { Args: never; Returns: Json }
      lara_voucher_followup_pick: {
        Args: { p_limit?: number; p_now?: string }
        Returns: Json
      }
      lara_voucher_mark_engaged: {
        Args: { p_voucher_id: string }
        Returns: Json
      }
      lara_voucher_mark_followup_sent: {
        Args: { p_bucket: string; p_voucher_id: string }
        Returns: Json
      }
      lead_create: {
        Args: {
          p_assigned_to?: string
          p_email?: string
          p_funnel?: string
          p_metadata?: Json
          p_name?: string
          p_phone: string
          p_source?: string
          p_source_type?: string
          p_temperature?: string
        }
        Returns: Json
      }
      lead_lost: {
        Args: { p_lead_id: string; p_reason: string }
        Returns: Json
      }
      lead_to_appointment: {
        Args: {
          p_consult_type?: string
          p_end_time: string
          p_eval_type?: string
          p_lead_id: string
          p_obs?: string
          p_origem?: string
          p_procedure_name?: string
          p_professional_id?: string
          p_professional_name?: string
          p_scheduled_date: string
          p_start_time: string
          p_value?: number
        }
        Returns: Json
      }
      lead_to_orcamento: {
        Args: {
          p_discount?: number
          p_items: Json
          p_lead_id: string
          p_notes?: string
          p_subtotal: number
          p_title?: string
          p_valid_until?: string
        }
        Returns: Json
      }
      lead_to_paciente: {
        Args: {
          p_first_at?: string
          p_last_at?: string
          p_lead_id: string
          p_notes?: string
          p_total_revenue?: number
        }
        Returns: Json
      }
      lead_to_perdidos: {
        Args: {
          p_is_recoverable?: boolean
          p_lead_id: string
          p_lost_reason: string
          p_notes?: string
        }
        Returns: Json
      }
      leads_bulk_change_phase: {
        Args: { p_ids: string[]; p_phase: string }
        Returns: Json
      }
      leads_check_duplicate_doc: {
        Args: { p_cpf?: string; p_exclude_id?: string; p_rg?: string }
        Returns: Json
      }
      leads_delete: { Args: { p_id: string }; Returns: Json }
      leads_list: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      leads_sync_batch: { Args: { p_leads: Json }; Returns: Json }
      leads_upsert: { Args: { p_data: Json }; Returns: Json }
      legal_doc_create_request: {
        Args: {
          p_appointment_id?: string
          p_content_snapshot?: string
          p_expires_hours?: number
          p_patient_cpf?: string
          p_patient_id?: string
          p_patient_name?: string
          p_patient_phone?: string
          p_professional_name?: string
          p_professional_reg?: string
          p_professional_spec?: string
          p_template_id: string
        }
        Returns: Json
      }
      legal_doc_list_procedure_blocks: { Args: never; Returns: Json }
      legal_doc_list_requests: {
        Args: {
          p_appointment_id?: string
          p_limit?: number
          p_patient_id?: string
          p_status?: string
        }
        Returns: Json
      }
      legal_doc_list_templates: { Args: never; Returns: Json }
      legal_doc_metrics: { Args: never; Returns: Json }
      legal_doc_purge_all: { Args: never; Returns: Json }
      legal_doc_revoke: { Args: { p_id: string }; Returns: Json }
      legal_doc_submit_signature: {
        Args: {
          p_acceptance_text?: string
          p_geolocation?: Json
          p_ip_address?: string
          p_signature_data?: string
          p_signer_cpf?: string
          p_signer_name: string
          p_slug: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      legal_doc_upsert_template: {
        Args: {
          p_content?: string
          p_doc_type?: string
          p_id?: string
          p_is_active?: boolean
          p_name?: string
          p_professional_id?: string
          p_redirect_url?: string
          p_slug?: string
          p_tracking_scripts?: string
          p_trigger_procedures?: Json
          p_trigger_status?: string
          p_variables?: Json
        }
        Returns: Json
      }
      legal_doc_validate_token: {
        Args: { p_ip?: string; p_slug: string; p_token: string }
        Returns: Json
      }
      link_user_to_professional: {
        Args: { p_professional_id: string; p_user_id: string }
        Returns: Json
      }
      list_agenda_grants: { Args: { p_owner_id: string }; Returns: Json }
      list_all_professionals: { Args: never; Returns: Json }
      list_my_notifications: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_pending_invites: { Args: never; Returns: Json }
      list_professional_procedimentos: { Args: never; Returns: Json }
      list_staff: { Args: never; Returns: Json }
      list_unlinked_professionals: { Args: never; Returns: Json }
      list_visible_professionals: { Args: never; Returns: Json }
      lp_analytics_global: { Args: { p_period_days?: number }; Returns: Json }
      lp_book_detail: { Args: { p_slug: string }; Returns: Json }
      lp_consent_list: {
        Args: { p_limit?: number; p_slug?: string }
        Returns: Json
      }
      lp_consent_log: {
        Args: { p_consents: Json; p_meta?: Json; p_slug: string }
        Returns: Json
      }
      lp_dispatch_latency: { Args: { p_days?: number }; Returns: Json }
      lp_dispatches_by_template: { Args: { p_days?: number }; Returns: Json }
      lp_engagement_cleanup: { Args: never; Returns: Json }
      lp_engagement_log_batch: { Args: { p_events: Json }; Returns: Json }
      lp_funnel_anatomy: { Args: { p_days?: number }; Returns: Json }
      lp_interaction_clicks: {
        Args: { p_days?: number; p_slug: string }
        Returns: Json
      }
      lp_interaction_log_batch: { Args: { p_events: Json }; Returns: Json }
      lp_interaction_scroll_dist: {
        Args: { p_days?: number; p_slug: string }
        Returns: Json
      }
      lp_interactions_cleanup: { Args: never; Returns: Json }
      lp_journey_paths: { Args: { p_limit?: number }; Returns: Json }
      lp_journey_track: {
        Args: {
          p_from_slug: string
          p_meta?: Json
          p_to_slug: string
          p_visitor_id: string
        }
        Returns: Json
      }
      lp_journey_visitor: { Args: { p_visitor_id: string }; Returns: Json }
      lp_lead_delete: { Args: { p_id: string }; Returns: Json }
      lp_lead_stats: {
        Args: { p_period_days?: number; p_slug?: string }
        Returns: Json
      }
      lp_lead_submit: {
        Args: { p_data: Json; p_slug: string; p_utm?: Json }
        Returns: Json
      }
      lp_lead_submit_v2: {
        Args: { p_data: Json; p_slug: string; p_utm?: Json }
        Returns: Json
      }
      lp_lead_update_status: {
        Args: { p_id: string; p_status: string }
        Returns: Json
      }
      lp_leads_list: {
        Args: { p_limit?: number; p_slug?: string; p_status?: string }
        Returns: Json
      }
      lp_leads_timeseries: { Args: { p_days?: number }; Returns: Json }
      lp_list_books_for_carousel: {
        Args: { p_limit?: number; p_slugs?: string[] }
        Returns: {
          author: string
          billing: string
          cover_url: string
          currency: string
          edition: string
          has_offer: boolean
          id: string
          language: string
          offer_id: string
          page_count: number
          preview_count: number
          price_cents: number
          product_id: string
          slug: string
          subtitle: string
          title: string
        }[]
      }
      lp_metrics_dashboard: { Args: { p_days?: number }; Returns: Json }
      lp_page_clear_schedule: { Args: { p_id: string }; Returns: Json }
      lp_page_delete: {
        Args: { p_hard?: boolean; p_id: string }
        Returns: Json
      }
      lp_page_duplicate: {
        Args: { p_new_slug: string; p_new_title?: string; p_source_id: string }
        Returns: Json
      }
      lp_page_get: { Args: { p_id: string }; Returns: Json }
      lp_page_list: { Args: never; Returns: Json }
      lp_page_publish: { Args: { p_id: string }; Returns: Json }
      lp_page_resolve: { Args: { p_slug: string }; Returns: Json }
      lp_page_save: {
        Args: {
          p_blocks?: Json
          p_id?: string
          p_meta_description?: string
          p_meta_title?: string
          p_og_image_url?: string
          p_slug?: string
          p_status?: string
          p_title?: string
          p_tokens_override?: Json
        }
        Returns: Json
      }
      lp_page_set_ab_variant: {
        Args: { p_id: string; p_variant_slug: string }
        Returns: Json
      }
      lp_page_set_lgpd: {
        Args: { p_config: Json; p_id: string }
        Returns: Json
      }
      lp_page_set_schedule: {
        Args: { p_id: string; p_publish_at?: string; p_unpublish_at?: string }
        Returns: Json
      }
      lp_page_set_schema: {
        Args: { p_data: Json; p_id: string }
        Returns: Json
      }
      lp_page_set_tracking: {
        Args: { p_id: string; p_tracking: Json }
        Returns: Json
      }
      lp_page_track_conversion: { Args: { p_slug: string }; Returns: Json }
      lp_page_track_view: { Args: { p_slug: string }; Returns: Json }
      lp_pages_apply_schedule: { Args: never; Returns: Json }
      lp_recent_errors: { Args: { p_limit?: number }; Returns: Json }
      lp_recent_leads_count: {
        Args: { p_days?: number; p_slug?: string }
        Returns: Json
      }
      lp_revision_create: {
        Args: { p_by?: string; p_label?: string; p_page_id: string }
        Returns: Json
      }
      lp_revision_delete: { Args: { p_revision_id: string }; Returns: Json }
      lp_revision_get: { Args: { p_revision_id: string }; Returns: Json }
      lp_revision_label_set: {
        Args: { p_label: string; p_revision_id: string }
        Returns: Json
      }
      lp_revision_list: {
        Args: { p_limit?: number; p_page_id: string }
        Returns: Json
      }
      lp_revision_restore: { Args: { p_revision_id: string }; Returns: Json }
      lp_sanitize_custom_head_html: {
        Args: { p_html: string }
        Returns: string
      }
      lp_template_get: { Args: { p_id: string }; Returns: Json }
      lp_template_list: { Args: never; Returns: Json[] }
      lp_template_use: {
        Args: { p_id: string; p_new_slug: string; p_new_title?: string }
        Returns: Json
      }
      lp_top_complaints: { Args: { p_days?: number }; Returns: Json }
      lp_webhook_delete: { Args: { p_id: string }; Returns: Json }
      lp_webhook_deliveries_list: {
        Args: { p_limit?: number; p_webhook_id: string }
        Returns: Json
      }
      lp_webhook_enqueue: {
        Args: {
          p_event: string
          p_lead_id?: string
          p_payload: Json
          p_slug?: string
        }
        Returns: Json
      }
      lp_webhook_list: { Args: never; Returns: Json }
      lp_webhook_retry: { Args: { p_delivery_id: number }; Returns: Json }
      lp_webhook_set: {
        Args: {
          p_active?: boolean
          p_events: string[]
          p_headers?: Json
          p_id: string
          p_label?: string
          p_page_slug?: string
          p_secret?: string
          p_url: string
        }
        Returns: Json
      }
      magazine_add_page: {
        Args: {
          p_edition_id: string
          p_segment_scope?: string[]
          p_slots?: Json
          p_template_slug: string
        }
        Returns: string
      }
      magazine_archive_edition: {
        Args: { p_edition_id: string }
        Returns: undefined
      }
      magazine_brief_apply_plan: {
        Args: { p_brief_id: string; p_plan: Json }
        Returns: Json
      }
      magazine_brief_photos: { Args: { p_brief_id: string }; Returns: Json }
      magazine_claim_reward: {
        Args: {
          p_amount?: number
          p_edition_id: string
          p_hash: string
          p_lead_id: string
          p_reward_type: string
        }
        Returns: Json
      }
      magazine_create_edition: {
        Args: {
          p_slug: string
          p_subtitle?: string
          p_theme?: string
          p_title: string
        }
        Returns: string
      }
      magazine_dashboard: { Args: never; Returns: Json }
      magazine_dispatch_analytics: {
        Args: { p_edition_id: string }
        Returns: Json
      }
      magazine_dispatch_cancel: {
        Args: { p_dispatch_id: string }
        Returns: boolean
      }
      magazine_dispatch_estimate: {
        Args: { p_edition_id?: string; p_segment: Json }
        Returns: Json
      }
      magazine_dispatch_list: {
        Args: { p_edition_id: string; p_limit?: number }
        Returns: Json
      }
      magazine_dispatch_run: { Args: { p_dispatch_id: string }; Returns: Json }
      magazine_dispatch_schedule: {
        Args: {
          p_edition_id: string
          p_parent_id?: string
          p_scheduled_at: string
          p_segment: Json
          p_template: string
          p_tipo?: string
        }
        Returns: string
      }
      magazine_edition_report: { Args: { p_edition_id: string }; Returns: Json }
      magazine_expire_pending_invites: { Args: never; Returns: number }
      magazine_get_edition_public: {
        Args: { p_edition_slug: string; p_hash: string; p_lead_id: string }
        Returns: Json
      }
      magazine_page_get: { Args: { p_page_id: string }; Returns: Json }
      magazine_page_update_slots: {
        Args: { p_page_id: string; p_slots: Json }
        Returns: Json
      }
      magazine_prompt_library_delete: {
        Args: { p_id: string }
        Returns: boolean
      }
      magazine_prompt_library_list: {
        Args: { p_template_slug?: string }
        Returns: Json
      }
      magazine_prompt_library_touch: {
        Args: { p_id: string }
        Returns: undefined
      }
      magazine_prompt_library_upsert: {
        Args: {
          p_aplicavel_a?: string[]
          p_id: string
          p_nome: string
          p_prompt_text: string
        }
        Returns: string
      }
      magazine_publish: { Args: { p_edition_id: string }; Returns: Json }
      magazine_react: {
        Args: {
          p_edition_id: string
          p_hash: string
          p_lead_id: string
          p_page_id: string
          p_reaction: string
        }
        Returns: Json
      }
      magazine_register_asset: {
        Args: {
          p_alt?: string
          p_edition_id: string
          p_height?: number
          p_meta?: Json
          p_size_kb?: number
          p_type: string
          p_url: string
          p_width?: number
        }
        Returns: string
      }
      magazine_register_invite: {
        Args: {
          p_edition_id: string
          p_hash: string
          p_invited_name?: string
          p_invited_phone: string
          p_referrer_lead_id: string
        }
        Returns: Json
      }
      magazine_reorder_pages: {
        Args: { p_edition_id: string; p_page_ids: string[] }
        Returns: undefined
      }
      magazine_sign_lead_link: {
        Args: { p_edition_id: string; p_lead_id: string }
        Returns: string
      }
      magazine_start_reading: {
        Args: {
          p_edition_id: string
          p_hash: string
          p_ip_hash?: string
          p_lead_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      magazine_submit_brief: { Args: { p_brief_id: string }; Returns: Json }
      magazine_track_block_event: {
        Args: {
          p_block_idx: number
          p_block_type: string
          p_edition: string
          p_event: string
          p_hash: string
          p_lead: string
          p_meta?: Json
          p_page: string
        }
        Returns: Json
      }
      magazine_track_page: {
        Args: {
          p_edition_id: string
          p_hash: string
          p_lead_id: string
          p_page_index: number
          p_time_ms: number
        }
        Returns: undefined
      }
      magazine_update_progress: {
        Args: {
          p_edition_id: string
          p_hash: string
          p_lead_id: string
          p_page_index: number
          p_pages_completed: number[]
          p_time_spent_sec?: number
        }
        Returns: Json
      }
      magazine_upsert_brief: {
        Args: {
          p_asset_ids: string[]
          p_brief_id: string
          p_edition_id?: string
          p_month_year: string
          p_objective: string
          p_references_text: string
          p_sections: Json
          p_theme: string
          p_tone: string
        }
        Returns: string
      }
      magazine_validate_autofix_plan: {
        Args: { p_page_id: string }
        Returns: Json
      }
      magazine_validate_section: {
        Args: { p_slots: Json; p_template_slug: string }
        Returns: Json
      }
      mark_all_read: { Args: never; Returns: Json }
      mark_anamnesis_request_opened: {
        Args: {
          p_ip_address?: unknown
          p_request_id: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      mark_notification_read: { Args: { p_id: string }; Returns: Json }
      migrate_local_data: { Args: { p_data: Json }; Returns: Json }
      mira_channel_get_config: {
        Args: { p_function_key: string }
        Returns: Json
      }
      mira_channel_resolve: {
        Args: { p_function_key: string }
        Returns: string
      }
      mira_channel_resolve_by_event: {
        Args: { p_event_key: string; p_recipient_role?: string }
        Returns: string
      }
      mira_channels_list: { Args: never; Returns: Json }
      mira_channels_upsert: {
        Args: {
          p_function_key: string
          p_label?: string
          p_notes?: string
          p_wa_number_id: string
        }
        Returns: Json
      }
      mira_cron_jobs_list: {
        Args: never
        Returns: {
          category: string
          cron_expr: string
          description: string
          display_name: string
          enabled: boolean
          failures_24h: number
          id: string
          job_name: string
          last_run_at: string
          last_status: string
          notes: string
          runs_24h: number
          updated_at: string
        }[]
      }
      mira_cron_run_finish: {
        Args: {
          p_error?: string
          p_items?: number
          p_meta?: Json
          p_run_id: string
          p_status: string
        }
        Returns: Json
      }
      mira_cron_run_start: {
        Args: { p_clinic_id?: string; p_job_name: string }
        Returns: string
      }
      mira_cron_runs_recent: {
        Args: { p_job_name: string; p_limit?: number }
        Returns: {
          error_message: string
          finished_at: string
          id: string
          items_processed: number
          meta: Json
          started_at: string
          status: string
        }[]
      }
      mira_cron_set_enabled: {
        Args: { p_enabled: boolean; p_job_name: string; p_notes?: string }
        Returns: Json
      }
      mira_state_cleanup_expired: { Args: never; Returns: number }
      mira_state_clear: {
        Args: { p_key?: string; p_phone: string }
        Returns: Json
      }
      mira_state_get:
        | { Args: { p_phone: string }; Returns: Json }
        | { Args: { p_key: string; p_phone: string }; Returns: Json }
      mira_state_get_with_metadata: {
        Args: { p_key: string; p_phone: string }
        Returns: Json
      }
      mira_state_reminder_check: { Args: never; Returns: Json }
      mira_state_set:
        | {
            Args: {
              p_key: string
              p_phone: string
              p_ttl_minutes?: number
              p_value: Json
            }
            Returns: Json
          }
        | {
            Args: { p_context?: string; p_phone: string; p_state: Json }
            Returns: Json
          }
      mr_create: {
        Args: {
          p_appointment_id?: string
          p_content?: string
          p_is_confidential?: boolean
          p_patient_id: string
          p_record_type?: string
          p_title?: string
        }
        Returns: Json
      }
      mr_delete: { Args: { p_id: string }; Returns: Json }
      mr_get_anamnesis_link: { Args: { p_response_id: string }; Returns: Json }
      mr_get_patient_summary: { Args: { p_patient_id: string }; Returns: Json }
      mr_list_for_patient: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_patient_id: string
          p_type_filter?: string
        }
        Returns: Json
      }
      mr_search: {
        Args: { p_limit?: number; p_patient_id: string; p_query: string }
        Returns: Json
      }
      mr_update: {
        Args: {
          p_content?: string
          p_id: string
          p_is_confidential?: boolean
          p_record_type?: string
          p_title?: string
        }
        Returns: Json
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      normalize_text_from_json: { Args: { input_json: Json }; Returns: string }
      nps_kpis: { Args: { p_period_days?: number }; Returns: Json }
      nps_testimonial_to_magazine: { Args: { p_nps_id: string }; Returns: Json }
      nps_testimonials_consented: { Args: { p_limit?: number }; Returns: Json }
      ofx_check_file_hash: { Args: { p_file_hash: string }; Returns: Json }
      ofx_check_fingerprint: { Args: { p_fingerprint: string }; Returns: Json }
      ofx_register_import: { Args: { p_data: Json }; Returns: Json }
      page_delete: { Args: { p_id: string }; Returns: Json }
      page_list: { Args: never; Returns: Json }
      page_resolve: { Args: { p_slug: string }; Returns: Json }
      page_save: {
        Args: {
          p_id?: string
          p_schema?: Json
          p_slug?: string
          p_status?: string
          p_title?: string
        }
        Returns: Json
      }
      patients_get_by_lead: { Args: { p_lead_id: string }; Returns: Json }
      patients_list: { Args: { p_clinic_id?: string }; Returns: Json }
      patients_saudade_scan: { Args: { p_months?: number }; Returns: Json }
      patients_saudade_send: {
        Args: { p_meses?: number; p_name?: string; p_phone: string }
        Returns: Json
      }
      patients_saudade_send_batch: {
        Args: { p_months?: number }
        Returns: Json
      }
      patients_sync_batch: {
        Args: { p_clinic_id?: string; p_patients: Json }
        Returns: Json
      }
      patients_upsert: {
        Args: {
          p_clinic_id?: string
          p_email?: string
          p_id?: string
          p_lead_id?: string
          p_name?: string
          p_notes?: string
          p_phone?: string
          p_status?: string
          p_total_procedures?: number
          p_total_revenue?: number
        }
        Returns: Json
      }
      perdido_to_lead: {
        Args: { p_id: string; p_reason?: string; p_to_phase?: string }
        Returns: Json
      }
      pluggy_disconnect: { Args: { p_id: string }; Returns: Json }
      pluggy_list_connections: { Args: never; Returns: Json }
      pluggy_register_connection: { Args: { p_data: Json }; Returns: Json }
      pluggy_update_sync_status: {
        Args: {
          p_count?: number
          p_error?: string
          p_item_id: string
          p_success: boolean
        }
        Returns: Json
      }
      procedures_with_partner_pricing: {
        Args: { p_lead_id?: string }
        Returns: Json
      }
      process_anatomy_quiz_lead: {
        Args: { p_lp_lead_id: string }
        Returns: string
      }
      quiz_abandoned_leads: {
        Args: {
          p_clinic_id: string
          p_from?: string
          p_limit?: number
          p_quiz_id: string
          p_to?: string
        }
        Returns: Json
      }
      quiz_alert_counts: {
        Args: { p_clinic_id: string; p_quiz_id: string }
        Returns: Json
      }
      quiz_alerts_and_notify: { Args: { p_alert_type?: string }; Returns: Json }
      quiz_analytics: {
        Args: {
          p_clinic_id: string
          p_from?: string
          p_quiz_id: string
          p_to?: string
        }
        Returns: Json
      }
      quiz_check_rate_limit: {
        Args: {
          p_ip_hash?: string
          p_phone: string
          p_quiz_id: string
          p_session?: string
        }
        Returns: boolean
      }
      quiz_delete_abandoned_sessions: {
        Args: {
          p_clinic_id: string
          p_quiz_id: string
          p_session_ids: string[]
        }
        Returns: Json
      }
      quiz_dispatch_webhooks: { Args: { p_alert_type?: string }; Returns: Json }
      quiz_events_cleanup: { Args: never; Returns: number }
      quiz_generate_alerts: { Args: { p_alert_type?: string }; Returns: Json }
      quiz_get_alerts: {
        Args: {
          p_clinic_id: string
          p_limit?: number
          p_quiz_id: string
          p_status?: string
        }
        Returns: Json
      }
      quiz_mark_alert_done: {
        Args: { p_alert_id: string; p_done_by?: string }
        Returns: Json
      }
      quiz_whatsapp_summary: {
        Args: { p_alert_type?: string; p_clinic_id: string; p_quiz_id: string }
        Returns: Json
      }
      reorder_anamnesis_field_options: {
        Args: { p_field_id: string; p_ids: string[] }
        Returns: undefined
      }
      reorder_anamnesis_fields: {
        Args: { p_ids: string[]; p_session_id: string }
        Returns: undefined
      }
      reorder_anamnesis_sessions: {
        Args: { p_ids: string[]; p_template_id: string }
        Returns: undefined
      }
      report_cortesias_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      report_template_load_all: {
        Args: never
        Returns: {
          template_key: string
          updated_at: string
          value: string
        }[]
      }
      report_template_reset: { Args: { p_key: string }; Returns: boolean }
      report_template_upsert: {
        Args: { p_key: string; p_value: string }
        Returns: Json
      }
      resolve_professional_for_procedure: {
        Args: { p_procedure: string }
        Returns: Json
      }
      retoque_create: {
        Args: {
          p_lead_id: string
          p_lead_name: string
          p_lead_phone: string
          p_notes?: string
          p_offset_days: number
          p_procedure_label: string
          p_professional_id: string
          p_professional_name: string
          p_source_appointment_id: string
        }
        Returns: string
      }
      retoque_link_appointment: {
        Args: { p_appointment_id: string; p_campaign_id: string }
        Returns: boolean
      }
      retoque_list: {
        Args: {
          p_from_date?: string
          p_lead_id?: string
          p_status_filter?: string
          p_to_date?: string
        }
        Returns: {
          days_until_target: number
          id: string
          is_overdue: boolean
          lead_id: string
          lead_name: string
          lead_phone: string
          procedure_label: string
          professional_name: string
          scheduled_appointment_id: string
          source_appointment_id: string
          status: string
          status_changed_at: string
          suggested_at: string
          suggested_target_date: string
        }[]
      }
      retoque_update_status: {
        Args: { p_campaign_id: string; p_new_status: string; p_notes?: string }
        Returns: boolean
      }
      revoke_invite: { Args: { p_invite_id: string }; Returns: Json }
      sdr_add_interaction: {
        Args: {
          p_content?: string
          p_direction?: string
          p_duration_sec?: number
          p_lead_id: string
          p_outcome?: string
          p_type: string
        }
        Returns: Json
      }
      sdr_admin_reset_patient: {
        Args: { p_lead_id: string; p_reason: string; p_to_phase: string }
        Returns: Json
      }
      sdr_advance_day_buckets: { Args: never; Returns: Json }
      sdr_assign_tag: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_origin?: string
          p_tag_slug: string
        }
        Returns: Json
      }
      sdr_change_phase: {
        Args: { p_lead_id: string; p_reason?: string; p_to_phase: string }
        Returns: Json
      }
      sdr_create_internal_alert: {
        Args: {
          p_corpo?: string
          p_entity_id: string
          p_entity_type: string
          p_para?: string
          p_template_slug?: string
          p_tipo?: string
          p_titulo?: string
        }
        Returns: Json
      }
      sdr_d1_tracking_metrics: { Args: { p_days?: number }; Returns: Json }
      sdr_delete_budget: { Args: { p_budget_id: string }; Returns: Json }
      sdr_delete_rule: { Args: { p_rule_id: string }; Returns: Json }
      sdr_delete_template: {
        Args: { p_slug: string; p_type: string }
        Returns: Json
      }
      sdr_delete_wa_template: { Args: { p_id: string }; Returns: Json }
      sdr_evaluate_rules: {
        Args: { p_context?: Json; p_event: string; p_lead_id: string }
        Returns: Json
      }
      sdr_funnel_by_source: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      sdr_funnel_metrics: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      sdr_get_budgets: { Args: { p_lead_id: string }; Returns: Json }
      sdr_get_interactions: {
        Args: { p_lead_id: string; p_limit?: number }
        Returns: Json
      }
      sdr_get_internal_alerts: {
        Args: { p_limit?: number; p_unread_only?: boolean }
        Returns: Json
      }
      sdr_get_kanban_7dias: { Args: { p_phase?: string }; Returns: Json }
      sdr_get_kanban_evolution: { Args: { p_phase?: string }; Returns: Json }
      sdr_get_phase_history: { Args: { p_lead_id: string }; Returns: Json }
      sdr_get_professionals: { Args: never; Returns: Json }
      sdr_get_rules: { Args: never; Returns: Json }
      sdr_get_tag_groups: { Args: never; Returns: Json }
      sdr_get_tags: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      sdr_get_tags_bulk: {
        Args: { p_entity_ids: string[]; p_entity_type: string }
        Returns: Json
      }
      sdr_get_tags_by_group: { Args: { p_group_slug: string }; Returns: Json }
      sdr_get_tasks: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: Json
      }
      sdr_get_templates_config: { Args: { p_type: string }; Returns: Json }
      sdr_get_wa_templates: { Args: never; Returns: Json }
      sdr_init_lead_pipelines: { Args: { p_lead_id: string }; Returns: Json }
      sdr_lifecycle_metrics: {
        Args: { p_days?: number; p_funnel?: string }
        Returns: Json
      }
      sdr_mark_alert_read: { Args: { p_alert_id: string }; Returns: Json }
      sdr_mark_all_alerts_read: { Args: never; Returns: Json }
      sdr_move_lead: {
        Args: {
          p_lead_id: string
          p_origin?: string
          p_pipeline_slug: string
          p_stage_slug: string
        }
        Returns: Json
      }
      sdr_remove_tag: {
        Args: { p_entity_id: string; p_entity_type: string; p_tag_slug: string }
        Returns: Json
      }
      sdr_scan_time_elapsed: { Args: never; Returns: Json }
      sdr_toggle_rule: {
        Args: { p_active: boolean; p_rule_id: string }
        Returns: Json
      }
      sdr_update_budget_status: {
        Args: { p_budget_id: string; p_status: string }
        Returns: Json
      }
      sdr_update_task_status: {
        Args: { p_status: string; p_task_id: string }
        Returns: Json
      }
      sdr_upsert_budget: {
        Args: {
          p_discount?: number
          p_id?: string
          p_items?: Json
          p_lead_id?: string
          p_notes?: string
          p_payments?: Json
          p_status?: string
          p_title?: string
          p_valid_until?: string
        }
        Returns: Json
      }
      sdr_upsert_rule: {
        Args: {
          p_actions?: Json
          p_conditions?: Json
          p_cooldown_hours?: number
          p_description?: string
          p_id?: string
          p_is_active?: boolean
          p_max_executions?: number
          p_name?: string
          p_priority?: number
          p_slug?: string
          p_trigger_event?: string
        }
        Returns: Json
      }
      sdr_upsert_tag_group: { Args: { p_data: Json }; Returns: Json }
      sdr_upsert_tag_metadata: {
        Args: { p_data: Json; p_tag_slug: string }
        Returns: Json
      }
      sdr_upsert_template: {
        Args: { p_data: Json; p_type: string }
        Returns: Json
      }
      sdr_upsert_wa_template: {
        Args: {
          p_active?: boolean
          p_day?: number
          p_id?: string
          p_message?: string
          p_name?: string
          p_sort_order?: number
          p_type?: string
        }
        Returns: Json
      }
      send_notification: {
        Args: {
          p_body?: string
          p_data?: Json
          p_recipient_id: string
          p_title?: string
          p_type?: string
        }
        Returns: Json
      }
      set_agenda_visibility: {
        Args: { p_owner_id: string; p_permission: string; p_viewer_id: string }
        Returns: Json
      }
      set_module_permission: {
        Args: {
          p_allowed?: boolean
          p_module_id: string
          p_page_id?: string
          p_role?: string
        }
        Returns: Json
      }
      set_professional_procedimentos: {
        Args: {
          p_primary_ids?: Json
          p_procedimento_ids: Json
          p_professional_id: string
        }
        Returns: Json
      }
      set_professional_technologies: {
        Args: { p_professional_id: string; p_technology_ids: string[] }
        Returns: Json
      }
      set_technology_operators: {
        Args: { p_professional_ids: string[]; p_technology_id: string }
        Returns: Json
      }
      set_user_permissions: {
        Args: { p_permissions: Json; p_user_id: string }
        Returns: Json
      }
      short_link_create:
        | {
            Args: { p_code: string; p_title?: string; p_url: string }
            Returns: Json
          }
        | {
            Args: {
              p_code: string
              p_pixels?: Json
              p_title?: string
              p_url: string
            }
            Returns: Json
          }
      short_link_delete: { Args: { p_code: string }; Returns: Json }
      short_link_list: { Args: never; Returns: Json }
      short_link_resolve: { Args: { p_code: string }; Returns: Json }
      short_link_update_pixels: {
        Args: { p_code: string; p_pixels: Json }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_injetavel: { Args: { p_id: string }; Returns: Json }
      soft_delete_procedimento: { Args: { p_id: string }; Returns: Json }
      soft_delete_professional: { Args: { p_id: string }; Returns: Json }
      soft_delete_room: { Args: { p_id: string }; Returns: Json }
      soft_delete_technology: { Args: { p_id: string }; Returns: Json }
      submit_quiz_response: {
        Args: {
          p_answers: Json
          p_clinic_id: string
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_idade?: number
          p_kanban_target: string
          p_queixas_faciais?: Json
          p_quiz_id: string
          p_score: number
          p_temperature: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
        }
        Returns: Json
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      unlink_user_from_professional: {
        Args: { p_user_id: string }
        Returns: Json
      }
      update_clinic_settings: {
        Args: {
          p_address?: Json
          p_description?: string
          p_email?: string
          p_fiscal?: Json
          p_name?: string
          p_operating_hours?: Json
          p_phone?: string
          p_settings?: Json
          p_social?: Json
          p_website?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      update_estoque_injetavel: {
        Args: { p_id: string; p_qtd_delta: number }
        Returns: Json
      }
      update_staff_role: {
        Args: { p_new_role: string; p_user_id: string }
        Returns: Json
      }
      upsert_alexa_config: {
        Args: {
          p_auth_token?: string
          p_is_active?: boolean
          p_reception_device_name?: string
          p_room_template?: string
          p_webhook_url: string
          p_welcome_template?: string
        }
        Returns: Json
      }
      upsert_alexa_device: {
        Args: {
          p_device_name?: string
          p_id?: string
          p_is_active?: boolean
          p_location_label?: string
          p_professional_id?: string
          p_room_id?: string
        }
        Returns: Json
      }
      upsert_facial_photo: {
        Args: {
          p_angle: string
          p_clinic_id: string
          p_hash: string
          p_lead_id: string
          p_photo_b64: string
        }
        Returns: Json
      }
      upsert_facial_session: {
        Args: {
          p_clinic_id: string
          p_gpt_analysis?: Json
          p_lead_id: string
          p_session_data: Json
        }
        Returns: Json
      }
      upsert_injetavel: {
        Args: {
          p_apresentacao?: string
          p_areas?: Json
          p_ativo?: boolean
          p_categoria?: string
          p_contraindicacoes?: Json
          p_cuidados_pos?: Json
          p_cuidados_pre?: Json
          p_custo_unit?: number
          p_downtime?: string
          p_duracao?: string
          p_estoque_alerta?: number
          p_estoque_qtd?: number
          p_fabricante?: string
          p_id?: string
          p_indicacoes?: Json
          p_margem?: number
          p_nome?: string
          p_observacoes?: string
          p_preco?: number
          p_riscos_complicacoes?: Json
          p_texto_consentimento?: string
          p_unidade?: string
        }
        Returns: Json
      }
      upsert_procedimento: {
        Args: {
          p_categoria?: string
          p_combo_bonus?: string
          p_combo_desconto_pct?: number
          p_combo_descricao?: string
          p_combo_sessoes?: number
          p_combo_valor_final?: number
          p_contraindicacoes?: Json
          p_cuidados_pos?: Json
          p_cuidados_pre?: Json
          p_custo_estimado?: number
          p_descricao?: string
          p_duracao_min?: number
          p_fases?: Json
          p_id?: string
          p_insumos?: Json
          p_intervalo_sessoes_dias?: number
          p_margem?: number
          p_nome?: string
          p_observacoes?: string
          p_preco?: number
          p_preco_promo?: number
          p_sessoes?: number
          p_tecnologia_custo?: number
          p_tecnologia_protocolo?: string
          p_tecnologia_sessoes?: number
          p_tipo?: string
          p_usa_tecnologia?: boolean
        }
        Returns: Json
      }
      upsert_professional: {
        Args: {
          p_agenda_enabled?: boolean
          p_bio?: string
          p_cargo?: string
          p_color?: string
          p_commissions?: Json
          p_contrato?: string
          p_cpf?: string
          p_crm?: string
          p_display_name?: string
          p_email?: string
          p_endereco?: Json
          p_goals?: Json
          p_horarios?: Json
          p_id?: string
          p_nascimento?: string
          p_nivel?: string
          p_observacoes?: string
          p_sala_id?: string
          p_salario?: number
          p_skills?: Json
          p_specialty?: string
          p_telefone?: string
          p_user_id?: string
          p_valor_consulta?: number
          p_whatsapp?: string
        }
        Returns: Json
      }
      upsert_professional_profile: {
        Args: {
          p_bio?: string
          p_color?: string
          p_crm?: string
          p_display_name?: string
          p_is_active?: boolean
          p_specialty?: string
          p_target_id?: string
        }
        Returns: Json
      }
      upsert_room: {
        Args: {
          p_alexa_device_name?: string
          p_descricao?: string
          p_id?: string
          p_nome?: string
        }
        Returns: Json
      }
      upsert_technology: {
        Args: {
          p_ano?: number
          p_categoria?: string
          p_descricao?: string
          p_fabricante?: string
          p_id?: string
          p_investimento?: number
          p_modelo?: string
          p_nome?: string
          p_ponteiras?: string
          p_sala_id?: string
        }
        Returns: Json
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      validate_anamnesis_public_link: {
        Args: { p_public_slug: string; p_raw_token: string }
        Returns: {
          clinic_id: string
          expires_at: string
          patient_id: string
          request_id: string
          request_status: Database["public"]["Enums"]["anamnesis_request_status_enum"]
          response_id: string
          response_status: Database["public"]["Enums"]["anamnesis_response_status_enum"]
          template_id: string
        }[]
      }
      validate_anamnesis_token: {
        Args: { p_public_slug: string; p_raw_token: string }
        Returns: {
          clinic_id: string
          error_code: string
          expires_at: string
          patient_data: Json
          patient_id: string
          patient_name: string
          patient_phone: string
          request_id: string
          status: Database["public"]["Enums"]["anamnesis_request_status_enum"]
          template_id: string
          template_snapshot_json: Json
        }[]
      }
      vpi_admin_grant_consent: { Args: { p_partner_id: string }; Returns: Json }
      vpi_alert_dismiss: { Args: { p_id: string }; Returns: Json }
      vpi_alert_staff: {
        Args: { p_partner_id: string; p_tier_id: string }
        Returns: Json
      }
      vpi_alerts_list: { Args: { p_limit?: number }; Returns: Json }
      vpi_alerts_scan: { Args: never; Returns: Json }
      vpi_birthday_scan: { Args: never; Returns: Json }
      vpi_birthday_send: { Args: { p_partner_id: string }; Returns: Json }
      vpi_birthday_send_batch: { Args: never; Returns: Json }
      vpi_challenge_delete: { Args: { p_id: string }; Returns: Json }
      vpi_challenge_list: {
        Args: never
        Returns: {
          bonus_fixo: number
          clinic_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          emoji: string | null
          id: string
          is_active: boolean
          msg_template_fim: string | null
          msg_template_inicio: string | null
          multiplier: number
          periodo_fim: string
          periodo_inicio: string
          slug: string
          sort_order: number
          titulo: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "vpi_challenges"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vpi_challenge_upsert: { Args: { p_data: Json }; Returns: Json }
      vpi_check_and_unlock_badges: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      vpi_cohort_retention: { Args: { p_months?: number }; Returns: Json }
      vpi_dormant_partners_scan: { Args: never; Returns: Json }
      vpi_dormant_send_reminder: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      vpi_dormant_send_reminders_batch: { Args: never; Returns: Json }
      vpi_dropoff_leads: { Args: { p_days?: number }; Returns: Json }
      vpi_emit_missao_reward: {
        Args: { p_progresso_id: string }
        Returns: Json
      }
      vpi_emit_missao_rewards_batch: {
        Args: { p_missao_id: string }
        Returns: Json
      }
      vpi_first_purchase_revenue: { Args: { p_days?: number }; Returns: Json }
      vpi_forecast_month: { Args: { p_meta?: number }; Returns: Json }
      vpi_funnel_breakdown:
        | { Args: { p_days?: number }; Returns: Json }
        | { Args: { p_days?: number; p_partner_id?: string }; Returns: Json }
      vpi_funnel_table: { Args: { p_limit?: number }; Returns: Json }
      vpi_get_ideal_perfil: { Args: never; Returns: string }
      vpi_get_partner_name_by_lead: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      vpi_get_revista_link: { Args: never; Returns: string }
      vpi_grant_consent_by_phone: { Args: { p_phone: string }; Returns: Json }
      vpi_heatmap_activity: { Args: { p_days?: number }; Returns: Json }
      vpi_high_performance_check: { Args: never; Returns: Json }
      vpi_indication_close:
        | {
            Args: {
              p_appt_id?: string
              p_is_full_face?: boolean
              p_lead_id: string
              p_procedimento?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_appt_id: string
              p_is_full_face?: boolean
              p_lead_id: string
              p_procedimento: string
            }
            Returns: Json
          }
      vpi_indication_create: {
        Args: { p_appt_id?: string; p_lead_id: string; p_partner_id: string }
        Returns: string
      }
      vpi_indication_expire_stale: { Args: { p_days?: number }; Returns: Json }
      vpi_indication_revert_by_appt: {
        Args: { p_appt_id: string; p_reason?: string }
        Returns: Json
      }
      vpi_indication_stories_list: {
        Args: { p_limit?: number; p_partner_id?: string }
        Returns: Json
      }
      vpi_indication_story_update: {
        Args: { p_data: Json; p_indication_id: string }
        Returns: Json
      }
      vpi_is_active_partner: { Args: { p_lead_id: string }; Returns: boolean }
      vpi_kpis: { Args: never; Returns: Json }
      vpi_kpis_strategic: {
        Args: { p_period_days?: number; p_valor_medio_fallback?: number }
        Returns: Json
      }
      vpi_lead_upsert_for_referral: {
        Args: { p_name: string; p_partner_name?: string; p_phone: string }
        Returns: Json
      }
      vpi_link_attribution_to_lead: {
        Args: { p_lead_id: string; p_session_id: string }
        Returns: Json
      }
      vpi_list_all_celebrations: { Args: { p_limit?: number }; Returns: Json }
      vpi_list_pending_celebrations: {
        Args: { p_limit?: number }
        Returns: Json
      }
      vpi_mark_celebration_posted: { Args: { p_id: string }; Returns: Json }
      vpi_mark_voucher_reply: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      vpi_mini_stats: { Args: never; Returns: Json }
      vpi_missao_completions: { Args: { p_missao_id: string }; Returns: Json }
      vpi_missao_delete: { Args: { p_id: string }; Returns: Json }
      vpi_missao_list: { Args: { p_include_inactive?: boolean }; Returns: Json }
      vpi_missao_reativar: {
        Args: { p_dias?: number; p_id: string }
        Returns: Json
      }
      vpi_missao_upsert: { Args: { p_data: Json }; Returns: Json }
      vpi_missoes_expire_scan: { Args: never; Returns: Json }
      vpi_nps_indication_correlation: {
        Args: { p_days?: number }
        Returns: Json
      }
      vpi_partner_attribution_summary: {
        Args: { p_partner_id: string; p_period_days?: number }
        Returns: Json
      }
      vpi_partner_by_phone: { Args: { p_phone: string }; Returns: Json }
      vpi_partner_compute_score: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      vpi_partner_compute_scores_all: { Args: never; Returns: Json }
      vpi_partner_ensure_short_link: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      vpi_partner_get: { Args: { p_id: string }; Returns: Json }
      vpi_partner_list: {
        Args: { p_search?: string; p_sort?: string }
        Returns: Json
      }
      vpi_partner_quality: { Args: { p_days?: number }; Returns: Json }
      vpi_partner_ranking: {
        Args: { p_limit?: number; p_period?: string }
        Returns: Json
      }
      vpi_partner_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      vpi_partner_set_short_slug: {
        Args: { p_partner_id: string; p_slug: string }
        Returns: boolean
      }
      vpi_partner_upsert: { Args: { p_data: Json }; Returns: string }
      vpi_payback_analysis:
        | { Args: { p_days?: number }; Returns: Json }
        | { Args: { p_days?: number; p_partner_id?: string }; Returns: Json }
      vpi_ponteira_resgate_list: { Args: { p_status?: string }; Returns: Json }
      vpi_ponteira_resgate_update: {
        Args: {
          p_appt_id?: string
          p_cancel_reason?: string
          p_id: string
          p_observacoes?: string
          p_status: string
        }
        Returns: Json
      }
      vpi_pos_procedimento_send: {
        Args: {
          p_appointment_id?: string
          p_partner_id: string
          p_procedimento_nome?: string
        }
        Returns: Json
      }
      vpi_pub_active_challenge: { Args: never; Returns: Json }
      vpi_pub_attribution_summary: {
        Args: { p_period_days?: number; p_token: string }
        Returns: Json
      }
      vpi_pub_create_indication: {
        Args: { p_lead: Json; p_token: string }
        Returns: Json
      }
      vpi_pub_easter_triggered: {
        Args: { p_egg_code: string; p_token: string }
        Returns: Json
      }
      vpi_pub_fotona_exchange: {
        Args: { p_fotona_numero: number; p_protocolo: string; p_token: string }
        Returns: Json
      }
      vpi_pub_fotona_transfer: {
        Args: {
          p_external?: Json
          p_fotona_numero?: number
          p_to_partner_token?: string
          p_token: string
        }
        Returns: Json
      }
      vpi_pub_get_badges: { Args: { p_token: string }; Returns: Json }
      vpi_pub_get_card: { Args: { p_token: string }; Returns: Json }
      vpi_pub_get_missao_atual: { Args: { p_token: string }; Returns: Json }
      vpi_pub_get_palette: { Args: { p_token: string }; Returns: Json }
      vpi_pub_impact: { Args: { p_clinic_id?: string }; Returns: Json }
      vpi_pub_my_impact: { Args: { p_token: string }; Returns: Json }
      vpi_pub_opt_out: {
        Args: { p_motivo?: string; p_token: string }
        Returns: Json
      }
      vpi_pub_partner_lineage: { Args: { p_token: string }; Returns: Json }
      vpi_pub_ponteira_resgatar: {
        Args: { p_protocolos: Json; p_quantidade: number; p_token: string }
        Returns: Json
      }
      vpi_pub_ponteiras_resumo: { Args: { p_token: string }; Returns: Json }
      vpi_pub_set_palette: {
        Args: { p_token: string; p_variant: string }
        Returns: Json
      }
      vpi_pub_shoutout_atual: { Args: { p_token: string }; Returns: Json }
      vpi_pub_track_attribution: {
        Args: { p_session_id: string; p_token: string; p_utm_params?: Json }
        Returns: Json
      }
      vpi_pub_track_card_open: { Args: { p_token: string }; Returns: Json }
      vpi_refresh_all_counters: { Args: never; Returns: Json }
      vpi_revista_generate_full_face_spotlight: {
        Args: { p_indication_id: string }
        Returns: Json
      }
      vpi_roadmap_list: { Args: never; Returns: Json }
      vpi_roadmap_toggle: {
        Args: { p_id: string; p_nota?: string; p_status: string }
        Returns: Json
      }
      vpi_saudade_scan: { Args: { p_months?: number }; Returns: Json }
      vpi_saudade_send: { Args: { p_partner_id: string }; Returns: Json }
      vpi_saudade_send_batch: { Args: { p_months?: number }; Returns: Json }
      vpi_search_candidates: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      vpi_send_reativacao: { Args: { p_partner_id: string }; Returns: Json }
      vpi_staff_alert_config: { Args: never; Returns: Json }
      vpi_staff_alert_config_update: {
        Args: { p_enabled?: boolean; p_phone: string }
        Returns: Json
      }
      vpi_tier_delete: { Args: { p_id: string }; Returns: boolean }
      vpi_tier_list: { Args: never; Returns: Json }
      vpi_tier_upsert: { Args: { p_data: Json }; Returns: string }
      vpi_timeseries:
        | { Args: { p_bucket?: string; p_periods?: number }; Returns: Json }
        | {
            Args: {
              p_bucket?: string
              p_partner_id?: string
              p_periods?: number
            }
            Returns: Json
          }
      vpi_top_indicator_icp: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      vpi_top_trimestre_apply: {
        Args: {
          p_bonus: number
          p_indicacoes: number
          p_partner_id: string
          p_posicao: number
          p_trimestre: string
        }
        Returns: Json
      }
      vpi_top_trimestre_run: { Args: never; Returns: Json }
      vpi_track_attribution: {
        Args: {
          p_partner_id: string
          p_session_id: string
          p_utm_params?: Json
        }
        Returns: Json
      }
      vpi_tv_indoor_data: { Args: never; Returns: Json }
      vpi_velocity:
        | { Args: { p_days?: number }; Returns: Json }
        | { Args: { p_days?: number; p_partner_id?: string }; Returns: Json }
      vpi_voucher_followup_scan: { Args: never; Returns: Json }
      wa_agenda_auto_delete: { Args: { p_id: string }; Returns: boolean }
      wa_agenda_auto_list: { Args: never; Returns: Json[] }
      wa_agenda_auto_toggle: { Args: { p_id: string }; Returns: boolean }
      wa_agenda_auto_upsert: { Args: { p_data: Json }; Returns: Json }
      wa_analytics_cadence: { Args: { p_days?: number }; Returns: Json }
      wa_analytics_daily: { Args: { p_days?: number }; Returns: Json }
      wa_analytics_funnel: { Args: { p_days?: number }; Returns: Json }
      wa_analytics_overview: { Args: { p_days?: number }; Returns: Json }
      wa_analytics_top_tags: { Args: { p_days?: number }; Returns: Json }
      wa_auto_reactivate: { Args: never; Returns: Json }
      wa_automation_try_mark_sent: {
        Args: { p_lead_id: string; p_rule_id: string }
        Returns: boolean
      }
      wa_birthday_auto_exclude: { Args: never; Returns: Json }
      wa_birthday_enqueue: { Args: never; Returns: Json }
      wa_birthday_list: {
        Args: { p_month?: number; p_segment?: string; p_status?: string }
        Returns: Json
      }
      wa_birthday_pause_all: { Args: never; Returns: Json }
      wa_birthday_resume_all: { Args: never; Returns: Json }
      wa_birthday_scan: { Args: never; Returns: Json }
      wa_birthday_stats: { Args: { p_year?: number }; Returns: Json }
      wa_birthday_template_delete: { Args: { p_id: string }; Returns: Json }
      wa_birthday_template_save: {
        Args: {
          p_content?: string
          p_day_offset?: number
          p_id?: string
          p_is_active?: boolean
          p_label?: string
          p_media_position?: string
          p_media_url?: string
          p_send_hour?: number
          p_sort_order?: number
        }
        Returns: Json
      }
      wa_birthday_templates_list: { Args: never; Returns: Json }
      wa_birthday_toggle_lead: {
        Args: { p_active: boolean; p_campaign_id: string }
        Returns: Json
      }
      wa_birthday_track_link_open: { Args: { p_code: string }; Returns: Json }
      wa_birthday_track_page_land: { Args: { p_phone?: string }; Returns: Json }
      wa_birthday_upcoming: { Args: { p_days?: number }; Returns: Json }
      wa_broadcast_cancel: { Args: { p_broadcast_id: string }; Returns: Json }
      wa_broadcast_create: {
        Args: {
          p_batch_interval_min?: number
          p_batch_size?: number
          p_content: string
          p_media_caption?: string
          p_media_position?: string
          p_media_url?: string
          p_name: string
          p_scheduled_at?: string
          p_selected_lead_ids?: string[]
          p_target_filter?: Json
        }
        Returns: Json
      }
      wa_broadcast_delete: { Args: { p_broadcast_id: string }; Returns: Json }
      wa_broadcast_leads: {
        Args: { p_broadcast_id: string; p_segment?: string }
        Returns: Json
      }
      wa_broadcast_list: { Args: never; Returns: Json }
      wa_broadcast_list_with_stats: { Args: never; Returns: Json }
      wa_broadcast_reschedule: {
        Args: {
          p_batch_interval_min?: number
          p_batch_size?: number
          p_broadcast_id: string
          p_content?: string
          p_media_position?: string
          p_media_url?: string
          p_name?: string
          p_scheduled_at?: string
          p_selected_lead_ids?: string[]
          p_target_filter?: Json
        }
        Returns: Json
      }
      wa_broadcast_start: { Args: { p_broadcast_id: string }; Returns: Json }
      wa_broadcast_stats: { Args: { p_broadcast_id: string }; Returns: Json }
      wa_broadcast_update: {
        Args: {
          p_batch_interval_min?: number
          p_batch_size?: number
          p_broadcast_id: string
          p_content?: string
          p_media_caption?: string
          p_media_position?: string
          p_media_url?: string
          p_name?: string
          p_scheduled_at?: string
          p_selected_lead_ids?: string[]
          p_target_filter?: Json
        }
        Returns: Json
      }
      wa_budget_opened: {
        Args: { p_budget_id: string; p_lead_id?: string }
        Returns: Json
      }
      wa_claim_conversation: {
        Args: { p_conversation_id: string; p_ttl_sec?: number }
        Returns: string
      }
      wa_clear_stuck_locks: {
        Args: { p_older_than_sec?: number }
        Returns: number
      }
      wa_daily_summary: { Args: never; Returns: number }
      wa_deactivate_any: { Args: { p_id: string }; Returns: Json }
      wa_detect_funnel: { Args: { p_message: string }; Returns: string }
      wa_detect_funnel_from_message: {
        Args: { p_lead_id: string; p_message: string }
        Returns: string
      }
      wa_errors_list: { Args: { p_limit?: number }; Returns: Json }
      wa_evolution_webhook: {
        Args: {
          apikey?: string
          data?: Json
          date_time?: string
          destination?: string
          event?: string
          instance?: string
          sender?: string
          server_url?: string
        }
        Returns: Json
      }
      wa_find_conversation: {
        Args: { p_phone: string; p_remote_jid?: string }
        Returns: string
      }
      wa_get_lead_context: { Args: { p_phone: string }; Returns: Json }
      wa_get_media: {
        Args: { p_funnel?: string; p_phase?: string; p_queixa?: string }
        Returns: Json
      }
      wa_guard_check: {
        Args: { p_message: string; p_phone: string; p_remote_jid?: string }
        Returns: Json
      }
      wa_health_check: { Args: never; Returns: Json }
      wa_inbox_archive: { Args: { p_conversation_id: string }; Returns: Json }
      wa_inbox_assume: { Args: { p_conversation_id: string }; Returns: Json }
      wa_inbox_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      wa_inbox_list: { Args: never; Returns: Json }
      wa_inbox_release: { Args: { p_conversation_id: string }; Returns: Json }
      wa_inbox_reopen: { Args: { p_conversation_id: string }; Returns: Json }
      wa_inbox_resolve: { Args: { p_conversation_id: string }; Returns: Json }
      wa_inbox_send: {
        Args: { p_content: string; p_conversation_id: string }
        Returns: Json
      }
      wa_is_phone_blacklisted: { Args: { p_phone: string }; Returns: boolean }
      wa_log_error: {
        Args: {
          p_error_msg?: string
          p_error_type: string
          p_payload?: Json
          p_phone?: string
          p_source: string
        }
        Returns: Json
      }
      wa_log_message: {
        Args: {
          p_ai_response?: string
          p_content_type?: string
          p_lead_id?: string
          p_media_url?: string
          p_persona?: string
          p_phone: string
          p_push_name?: string
          p_remote_jid?: string
          p_tags?: string
          p_tokens_used?: number
          p_user_message?: string
        }
        Returns: Json
      }
      wa_log_message_sequential:
        | {
            Args: {
              p_ai_response?: string
              p_conversation_id?: string
              p_detected_name?: string
              p_lead_id?: string
              p_persona?: string
              p_phone: string
              p_photo_captions?: string[]
              p_photo_urls?: string[]
              p_tags?: string
              p_tokens_used?: number
              p_user_message?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_ai_response?: string
              p_conversation_id?: string
              p_detected_name?: string
              p_follow_up?: string
              p_lead_id?: string
              p_persona?: string
              p_phone: string
              p_photo_captions?: string[]
              p_photo_urls?: string[]
              p_tags?: string
              p_tokens_used?: number
              p_user_message?: string
            }
            Returns: Json
          }
      wa_log_secretary_reply:
        | { Args: { p_message: string; p_phone: string }; Returns: Json }
        | {
            Args: { p_message: string; p_phone: string; p_remote_jid?: string }
            Returns: Json
          }
      wa_nudge_inactive: { Args: never; Returns: Json }
      wa_number_upsert: { Args: { p_payload: Json }; Returns: Json }
      wa_numbers_resolve_by_phone_number_id: {
        Args: { p_phone_number_id: string }
        Returns: Json
      }
      wa_numbers_resolve_by_verify_token: {
        Args: { p_verify_token: string }
        Returns: Json
      }
      wa_outbox_cancel_by_appt: {
        Args: { p_appt_ref: string }
        Returns: number
      }
      wa_outbox_cleanup_stuck: { Args: never; Returns: number }
      wa_outbox_enqueue_appt: {
        Args: {
          p_appt_ref?: string
          p_content: string
          p_lead_id?: string
          p_lead_name?: string
          p_phone: string
        }
        Returns: Json
      }
      wa_outbox_fetch_pending: { Args: { p_limit?: number }; Returns: Json }
      wa_outbox_list_for_appt: { Args: { p_appt_ref: string }; Returns: Json }
      wa_outbox_mark_failed: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      wa_outbox_mark_sent: { Args: { p_id: string }; Returns: undefined }
      wa_outbox_on_delivered: {
        Args: { p_wa_message_id: string }
        Returns: Json
      }
      wa_outbox_on_read: { Args: { p_wa_message_id: string }; Returns: Json }
      wa_outbox_on_sent: {
        Args: { p_outbox_id: string; p_wa_message_id?: string }
        Returns: Json
      }
      wa_outbox_process_direct: { Args: { p_limit?: number }; Returns: Json }
      wa_outbox_resync_rule: {
        Args: { p_cancel_only?: boolean; p_rule_id: string }
        Returns: Json
      }
      wa_outbox_schedule_automation: {
        Args: {
          p_ab_variant?: string
          p_appt_ref?: string
          p_content: string
          p_lead_id?: string
          p_lead_name?: string
          p_phone: string
          p_rule_id?: string
          p_scheduled_at?: string
          p_vars_snapshot?: Json
        }
        Returns: string
      }
      wa_pro_active_digest_recipients: { Args: never; Returns: Json }
      wa_pro_agenda: {
        Args: { p_date: string; p_phone: string }
        Returns: Json
      }
      wa_pro_agenda_free_slots: {
        Args: { p_date: string; p_phone: string }
        Returns: Json
      }
      wa_pro_anomaly_check:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_authenticate: { Args: { p_phone: string }; Returns: Json }
      wa_pro_birthday_alerts:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_cancel_pending: { Args: { p_phone: string }; Returns: Json }
      wa_pro_check_rate_limit: {
        Args: { p_professional_id: string }
        Returns: Json
      }
      wa_pro_confirm_pending: { Args: { p_phone: string }; Returns: Json }
      wa_pro_create_task: {
        Args: { p_created_via?: string; p_phone: string; p_query: string }
        Returns: Json
      }
      wa_pro_daily_digest:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_day_summary: {
        Args: { p_date?: string; p_phone: string }
        Returns: Json
      }
      wa_pro_debtors: {
        Args: { p_min_value?: number; p_phone: string }
        Returns: Json
      }
      wa_pro_evening_digest:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_execute_and_format: {
        Args: {
          p_intent: string
          p_phone: string
          p_prof_name: string
          p_text: string
        }
        Returns: string
      }
      wa_pro_execute_tool: {
        Args: { p_args: Json; p_phone: string; p_tool_name: string }
        Returns: Json
      }
      wa_pro_finance_commission: {
        Args: { p_end_date: string; p_phone: string; p_start_date: string }
        Returns: Json
      }
      wa_pro_finance_summary: {
        Args: { p_end_date: string; p_phone: string; p_start_date: string }
        Returns: Json
      }
      wa_pro_fire_appointment_automations: {
        Args: { p_appt_id: string }
        Returns: Json
      }
      wa_pro_followup_suggestions:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_handle_message: {
        Args: { p_phone: string; p_text: string }
        Returns: Json
      }
      wa_pro_inactivity_radar:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_list_numbers: { Args: never; Returns: Json }
      wa_pro_list_tasks: {
        Args: { p_limit?: number; p_phone: string }
        Returns: Json
      }
      wa_pro_log_query: {
        Args: {
          p_error?: string
          p_intent: string
          p_phone: string
          p_professional_id: string
          p_query: string
          p_response: string
          p_response_ms?: number
          p_success?: boolean
          p_tokens_used?: number
          p_wa_number_id: string
        }
        Returns: Json
      }
      wa_pro_mark_reminder_sent: { Args: { p_task_id: string }; Returns: Json }
      wa_pro_mira_usage: { Args: { p_phone: string }; Returns: Json }
      wa_pro_my_quota: { Args: { p_phone: string }; Returns: Json }
      wa_pro_next_patient: { Args: { p_phone: string }; Returns: Json }
      wa_pro_patient_balance: {
        Args: { p_exact_id?: string; p_patient_query: string; p_phone: string }
        Returns: Json
      }
      wa_pro_patient_profile: {
        Args: { p_patient_id: string; p_phone: string }
        Returns: Json
      }
      wa_pro_patient_search: {
        Args: { p_limit?: number; p_phone: string; p_query: string }
        Returns: Json
      }
      wa_pro_patients_by_procedure: {
        Args: {
          p_end?: string
          p_phone: string
          p_procedure: string
          p_start?: string
        }
        Returns: Json
      }
      wa_pro_pending_task_reminders: { Args: never; Returns: Json }
      wa_pro_pre_consult_alerts:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_pro_process_voice: {
        Args: {
          p_audio_mime?: string
          p_cost_usd?: number
          p_duration_s?: number
          p_error?: string
          p_message_id?: string
          p_model?: string
          p_phone: string
          p_provider?: string
          p_status?: string
          p_transcript: string
        }
        Returns: Json
      }
      wa_pro_recent_payments: {
        Args: { p_end_date: string; p_phone: string; p_start_date: string }
        Returns: Json
      }
      wa_pro_register_number: {
        Args: {
          p_access_scope?: string
          p_label?: string
          p_permissions?: Json
          p_phone: string
          p_professional_id: string
        }
        Returns: Json
      }
      wa_pro_resolve_phone: { Args: { p_phone: string }; Returns: Json }
      wa_pro_stage_cancel_appointment: {
        Args: { p_phone: string; p_query: string }
        Returns: Json
      }
      wa_pro_stage_create_appointment: {
        Args: { p_phone: string; p_query: string }
        Returns: Json
      }
      wa_pro_stage_register_and_schedule: {
        Args: { p_phone: string; p_text: string }
        Returns: Json
      }
      wa_pro_stage_register_only: {
        Args: { p_phone: string; p_text: string }
        Returns: Json
      }
      wa_pro_stage_reschedule_appointment: {
        Args: { p_phone: string; p_query: string }
        Returns: Json
      }
      wa_pro_task_reminders: { Args: { p_clinic_id: string }; Returns: Json }
      wa_pro_weekly_roundup:
        | { Args: { p_clinic_id: string }; Returns: Json }
        | { Args: { p_phone: string }; Returns: Json }
      wa_quiz_recovery_scan: { Args: never; Returns: Json }
      wa_receive_inbound: {
        Args: {
          p_content: string
          p_media_url?: string
          p_phone: string
          p_sender_name?: string
          p_wa_message_id?: string
        }
        Returns: Json
      }
      wa_register_oficial: {
        Args: { p_label?: string; p_phone: string; p_phone_number_id?: string }
        Returns: Json
      }
      wa_release_conversation: {
        Args: { p_conversation_id: string; p_lock_id: string }
        Returns: boolean
      }
      wa_rule_ab_results: {
        Args: { p_days?: number; p_rule_id: string }
        Returns: {
          delivery_rate: number
          failed: number
          sent: number
          total: number
          variant: string
        }[]
      }
      wa_rule_ab_significance: { Args: { p_days?: number }; Returns: Json }
      wa_rule_deliverability: {
        Args: { p_days?: number }
        Returns: {
          channel: string
          delivery_rate: number
          failed: number
          is_active: boolean
          last_sent_at: string
          pending: number
          rule_id: string
          rule_name: string
          scheduled: number
          sent: number
          total: number
        }[]
      }
      wa_run_cadences: { Args: never; Returns: Json }
      wa_tag_counts: { Args: never; Returns: Json }
      wa_template_update: {
        Args: {
          p_category?: string
          p_content?: string
          p_day?: number
          p_delay_hours?: number
          p_delay_minutes?: number
          p_id: string
          p_is_active?: boolean
          p_metadata?: Json
          p_name?: string
          p_sort_order?: number
          p_trigger_phase?: string
          p_type?: string
        }
        Returns: Json
      }
      wa_templates_for_phase: { Args: { p_phase: string }; Returns: Json }
      wa_templates_list: { Args: never; Returns: Json }
      wa_update_meta: {
        Args: {
          p_id: string
          p_is_active?: boolean
          p_label?: string
          p_phone_number_id?: string
        }
        Returns: Json
      }
      wa_upsert_lead_from_chat: {
        Args: { p_name?: string; p_phone: string; p_source?: string }
        Returns: Json
      }
      webhook_queue_complete: { Args: { p_id: string }; Returns: Json }
      webhook_queue_enqueue: { Args: { p_payload: Json }; Returns: Json }
      webhook_queue_fail: {
        Args: { p_error: string; p_id: string }
        Returns: Json
      }
      webhook_queue_pick: { Args: { p_limit?: number }; Returns: Json }
      webhook_queue_reset_stuck: {
        Args: { p_threshold_minutes?: number }
        Returns: Json
      }
    }
    Enums: {
      anamnesis_field_type:
        | "text"
        | "textarea"
        | "number"
        | "select"
        | "multiselect"
        | "boolean"
        | "date"
      anamnesis_field_type_enum:
        | "text"
        | "textarea"
        | "rich_text"
        | "number"
        | "date"
        | "boolean"
        | "single_select"
        | "multi_select"
        | "single_select_dynamic"
        | "scale\r\n  _select"
        | "image_select"
        | "file_upload"
        | "image_upload"
        | "section_title"
        | "label"
        | "description_text"
      anamnesis_flag_severity_enum: "info" | "warning" | "high" | "critical"
      anamnesis_flag_type_enum:
        | "clinical"
        | "eligibility"
        | "commercial"
        | "document"
        | "data_quality"
      anamnesis_request_status_enum:
        | "draft"
        | "sent"
        | "opened"
        | "in_progress"
        | "completed"
        | "expired"
        | "revoked"
        | "cancelled"
      anamnesis_response_status_enum:
        | "not_started"
        | "in_progress"
        | "completed"
        | "abandoned"
        | "cancelled"
      anamnesis_template_category_enum:
        | "general"
        | "facial"
        | "body"
        | "capillary"
        | "epilation"
        | "custom"
      audit_action_enum:
        | "create"
        | "update"
        | "delete"
        | "restore"
        | "send_link"
        | "revoke_link"
        | "complete_form"
      patient_sex_enum: "male" | "female" | "other" | "not_informed"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
      anamnesis_field_type: [
        "text",
        "textarea",
        "number",
        "select",
        "multiselect",
        "boolean",
        "date",
      ],
      anamnesis_field_type_enum: [
        "text",
        "textarea",
        "rich_text",
        "number",
        "date",
        "boolean",
        "single_select",
        "multi_select",
        "single_select_dynamic",
        "scale\r\n  _select",
        "image_select",
        "file_upload",
        "image_upload",
        "section_title",
        "label",
        "description_text",
      ],
      anamnesis_flag_severity_enum: ["info", "warning", "high", "critical"],
      anamnesis_flag_type_enum: [
        "clinical",
        "eligibility",
        "commercial",
        "document",
        "data_quality",
      ],
      anamnesis_request_status_enum: [
        "draft",
        "sent",
        "opened",
        "in_progress",
        "completed",
        "expired",
        "revoked",
        "cancelled",
      ],
      anamnesis_response_status_enum: [
        "not_started",
        "in_progress",
        "completed",
        "abandoned",
        "cancelled",
      ],
      anamnesis_template_category_enum: [
        "general",
        "facial",
        "body",
        "capillary",
        "epilation",
        "custom",
      ],
      audit_action_enum: [
        "create",
        "update",
        "delete",
        "restore",
        "send_link",
        "revoke_link",
        "complete_form",
      ],
      patient_sex_enum: ["male", "female", "other", "not_informed"],
    },
  },
} as const
