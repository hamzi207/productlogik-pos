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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          message: string
          starts_at: string
          target_tenant_ids: string[] | null
          tone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          message: string
          starts_at?: string
          target_tenant_ids?: string[] | null
          tone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          message?: string
          starts_at?: string
          target_tenant_ids?: string[] | null
          tone?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          image_path: string | null
          industry_id: string | null
          is_archived: boolean
          name: string
          parent_id: string | null
          sku_prefix: string | null
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_path?: string | null
          industry_id?: string | null
          is_archived?: boolean
          name: string
          parent_id?: string | null
          sku_prefix?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_path?: string | null
          industry_id?: string | null
          is_archived?: boolean
          name?: string
          parent_id?: string | null
          sku_prefix?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      category_attributes: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          industry_id: string | null
          is_archived: boolean
          is_required: boolean
          key: string
          label: string
          options: string[]
          show_on_documents: boolean
          sort_order: number
          tenant_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          industry_id?: string | null
          is_archived?: boolean
          is_required?: boolean
          key: string
          label: string
          options?: string[]
          show_on_documents?: boolean
          sort_order?: number
          tenant_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          industry_id?: string | null
          is_archived?: boolean
          is_required?: boolean
          key?: string
          label?: string
          options?: string[]
          show_on_documents?: boolean
          sort_order?: number
          tenant_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attributes_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attributes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      category_requests: {
        Row: {
          created_at: string
          created_category_id: string | null
          id: string
          name: string
          note: string | null
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_parent_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_category_id?: string | null
          id?: string
          name: string
          note?: string | null
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_parent_id?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_category_id?: string | null
          id?: string
          name?: string
          note?: string | null
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_requests_created_category_id_fkey"
            columns: ["created_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_requests_suggested_parent_id_fkey"
            columns: ["suggested_parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_links: {
        Row: {
          created_at: string
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_links_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_tag_links_tenant_id_tag_id_fkey"
            columns: ["tenant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_types: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_default: boolean
          name: string
          requires_tax_details: boolean
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name: string
          requires_tax_details?: boolean
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name?: string
          requires_tax_details?: boolean
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: string | null
          cnic_or_ntn: string | null
          contact_person: string | null
          created_at: string
          credit_days: number
          customer_type: string
          default_discount_percentage: number
          email: string | null
          id: string
          is_walk_in: boolean
          name: string
          notes: string | null
          phone: string | null
          strn: string | null
          tax_registration_status: string
          tenant_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          billing_address?: string | null
          cnic_or_ntn?: string | null
          contact_person?: string | null
          created_at?: string
          credit_days?: number
          customer_type: string
          default_discount_percentage?: number
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          strn?: string | null
          tax_registration_status?: string
          tenant_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          billing_address?: string | null
          cnic_or_ntn?: string | null
          contact_person?: string | null
          created_at?: string
          credit_days?: number
          customer_type?: string
          default_discount_percentage?: number
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          strn?: string | null
          tax_registration_status?: string
          tenant_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_customer_type_fkey"
            columns: ["tenant_id", "customer_type"]
            isOneToOne: false
            referencedRelation: "customer_types"
            referencedColumns: ["tenant_id", "name"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          metadata: Json
          recipient: string
          resend_id: string | null
          sent_by: string | null
          status: string
          subject: string
          template: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient: string
          resend_id?: string | null
          sent_by?: string | null
          status: string
          subject: string
          template: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient?: string
          resend_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          admin_id: string
          ended_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          mode: string
          started_at: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          mode?: string
          started_at?: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          mode?: string
          started_at?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          created_at: string
          default_customer_types: Json
          default_modules: string[]
          default_settings: Json
          default_uoms: string[]
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          onboarding_steps: string[]
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_customer_types?: Json
          default_modules?: string[]
          default_settings?: Json
          default_uoms?: string[]
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          onboarding_steps?: string[]
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_customer_types?: Json
          default_modules?: string[]
          default_settings?: Json
          default_uoms?: string[]
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          onboarding_steps?: string[]
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          attributes: Json
          available_quantity: number | null
          barcode: string | null
          base_uom_id: string
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          is_archived: boolean
          is_kit: boolean
          is_low_stock: boolean | null
          is_universal: boolean
          low_stock_threshold: number
          name: string
          option_values: Json | null
          own_cost: boolean
          own_price: boolean
          price_includes_tax: boolean
          purchase_uom_id: string | null
          quantity_on_hand: number
          reserved_quantity: number
          sale_uom_id: string | null
          selling_price: number
          sku: string
          tenant_id: string
          updated_at: string
          variant_label: string | null
          vendor_name: string | null
        }
        Insert: {
          attributes?: Json
          available_quantity?: number | null
          barcode?: string | null
          base_uom_id: string
          category_id: string
          cost_price: number
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_archived?: boolean
          is_kit?: boolean
          is_low_stock?: boolean | null
          is_universal?: boolean
          low_stock_threshold?: number
          name: string
          option_values?: Json | null
          own_cost?: boolean
          own_price?: boolean
          price_includes_tax?: boolean
          purchase_uom_id?: string | null
          quantity_on_hand?: number
          reserved_quantity?: number
          sale_uom_id?: string | null
          selling_price: number
          sku: string
          tenant_id: string
          updated_at?: string
          variant_label?: string | null
          vendor_name?: string | null
        }
        Update: {
          attributes?: Json
          available_quantity?: number | null
          barcode?: string | null
          base_uom_id?: string
          category_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_archived?: boolean
          is_kit?: boolean
          is_low_stock?: boolean | null
          is_universal?: boolean
          low_stock_threshold?: number
          name?: string
          option_values?: Json | null
          own_cost?: boolean
          own_price?: boolean
          price_includes_tax?: boolean
          purchase_uom_id?: string | null
          quantity_on_hand?: number
          reserved_quantity?: number
          sale_uom_id?: string | null
          selling_price?: number
          sku?: string
          tenant_id?: string
          updated_at?: string
          variant_label?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_base_uom_fkey"
            columns: ["tenant_id", "base_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_category_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_group_fkey"
            columns: ["tenant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_purchase_uom_fkey"
            columns: ["tenant_id", "purchase_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_sale_uom_fkey"
            columns: ["tenant_id", "sale_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          payment_id: string
          quantity: number | null
          quote_id: string
          quote_item_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          payment_id: string
          quantity?: number | null
          quote_id: string
          quote_item_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          payment_id?: string
          quantity?: number | null
          quote_id?: string
          quote_item_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_on: string
          payment_method: string
          quote_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_on?: string
          payment_method: string
          quote_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_on?: string
          payment_method?: string
          quote_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_uom_conversions: {
        Row: {
          barcode: string | null
          created_at: string
          factor: number
          id: string
          item_id: string
          selling_price: number | null
          sort_order: number
          tenant_id: string
          uom_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          factor: number
          id?: string
          item_id: string
          selling_price?: number | null
          sort_order?: number
          tenant_id: string
          uom_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          factor?: number
          id?: string
          item_id?: string
          selling_price?: number | null
          sort_order?: number
          tenant_id?: string
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_uom_conversions_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "item_uom_conversions_tenant_id_uom_id_fkey"
            columns: ["tenant_id", "uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      item_vehicle_compatibility: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          tenant_id: string
          vehicle_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          tenant_id: string
          vehicle_id: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          tenant_id?: string
          vehicle_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_vehicle_compatibility_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_vehicle_compatibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_vehicle_compatibility_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_components: {
        Row: {
          component_id: string
          kit_id: string
          position: number
          quantity: number
          tenant_id: string
        }
        Insert: {
          component_id: string
          kit_id: string
          position?: number
          quantity: number
          tenant_id: string
        }
        Update: {
          component_id?: string
          kit_id?: string
          position?: number
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_components_component_fkey"
            columns: ["tenant_id", "component_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "kit_components_kit_fkey"
            columns: ["tenant_id", "kit_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          business_address: string | null
          business_email: string | null
          business_name: string
          business_ntn: string | null
          business_phone: string | null
          default_grace_days: number
          default_plan_id: string | null
          email_hourly_limit: number
          email_reply_to: string | null
          email_sender_name: string
          id: boolean
          impersonation_ttl_minutes: number
          invoice_lead_days: number
          payment_banks: Json
          payment_note: string | null
          payment_wallets: Json
          reminder_days: number[]
          signup_default_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_ntn?: string | null
          business_phone?: string | null
          default_grace_days?: number
          default_plan_id?: string | null
          email_hourly_limit?: number
          email_reply_to?: string | null
          email_sender_name?: string
          id?: boolean
          impersonation_ttl_minutes?: number
          invoice_lead_days?: number
          payment_banks?: Json
          payment_note?: string | null
          payment_wallets?: Json
          reminder_days?: number[]
          signup_default_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_ntn?: string | null
          business_phone?: string | null
          default_grace_days?: number
          default_plan_id?: string | null
          email_hourly_limit?: number
          email_reply_to?: string | null
          email_sender_name?: string
          id?: boolean
          impersonation_ttl_minutes?: number
          invoice_lead_days?: number
          payment_banks?: Json
          payment_note?: string | null
          payment_wallets?: Json
          reminder_days?: number[]
          signup_default_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_default_plan_id_fkey"
            columns: ["default_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          attributes: Json
          base_uom_id: string
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_archived: boolean
          is_universal: boolean
          low_stock_threshold: number
          name: string
          price_includes_tax: boolean
          selling_price: number
          sku_prefix: string
          tenant_id: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          attributes?: Json
          base_uom_id: string
          category_id: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          is_universal?: boolean
          low_stock_threshold?: number
          name: string
          price_includes_tax?: boolean
          selling_price?: number
          sku_prefix: string
          tenant_id: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          attributes?: Json
          base_uom_id?: string
          category_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          is_universal?: boolean
          low_stock_threshold?: number
          name?: string
          price_includes_tax?: boolean
          selling_price?: number
          sku_prefix?: string
          tenant_id?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_base_uom_fkey"
            columns: ["tenant_id", "base_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          item_id: string | null
          path: string
          position: number
          tenant_id: string
          url: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          item_id?: string | null
          path: string
          position?: number
          tenant_id: string
          url: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          item_id?: string | null
          path?: string
          position?: number
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_group_fkey"
            columns: ["tenant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_images_item_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_types: {
        Row: {
          group_id: string
          id: string
          name: string
          position: number
          tenant_id: string
        }
        Insert: {
          group_id: string
          id?: string
          name: string
          position: number
          tenant_id: string
        }
        Update: {
          group_id?: string
          id?: string
          name?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_types_group_fkey"
            columns: ["tenant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          id: string
          option_type_id: string
          position: number
          price_delta: number
          tenant_id: string
          value: string
        }
        Insert: {
          id?: string
          option_type_id: string
          position?: number
          price_delta?: number
          tenant_id: string
          value: string
        }
        Update: {
          id?: string
          option_type_id?: string
          position?: number
          price_delta?: number
          tenant_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_type_fkey"
            columns: ["tenant_id", "option_type_id"]
            isOneToOne: false
            referencedRelation: "product_option_types"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      profile_stores: {
        Row: {
          created_at: string
          profile_id: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          store_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_stores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_stores_tenant_id_store_id_fkey"
            columns: ["tenant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dashboard_prefs: Json
          deactivated_at: string | null
          default_store_id: string | null
          email: string
          full_name: string
          id: string
          role: string
          tenant_id: string
          updated_at: string
          whats_new_seen: string | null
        }
        Insert: {
          created_at?: string
          dashboard_prefs?: Json
          deactivated_at?: string | null
          default_store_id?: string | null
          email: string
          full_name: string
          id: string
          role?: string
          tenant_id: string
          updated_at?: string
          whats_new_seen?: string | null
        }
        Update: {
          created_at?: string
          dashboard_prefs?: Json
          deactivated_at?: string | null
          default_store_id?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
          tenant_id?: string
          updated_at?: string
          whats_new_seen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_store_id_fkey"
            columns: ["default_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          deducted_qty: number
          description: string
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          is_labor: boolean
          item_id: string | null
          kit_components: Json | null
          price_includes_tax: boolean
          quantity: number
          quote_id: string
          reserved_qty: number
          sale_price: number
          sort_order: number
          source_store_id: string | null
          tenant_id: string
          total_price: number
          unit_cost: number
          unit_price: number
          uom_factor: number
          uom_id: string | null
          uom_label: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          deducted_qty?: number
          description: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_labor?: boolean
          item_id?: string | null
          kit_components?: Json | null
          price_includes_tax?: boolean
          quantity?: number
          quote_id: string
          reserved_qty?: number
          sale_price?: number
          sort_order?: number
          source_store_id?: string | null
          tenant_id: string
          total_price?: number
          unit_cost?: number
          unit_price?: number
          uom_factor?: number
          uom_id?: string | null
          uom_label?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          deducted_qty?: number
          description?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_labor?: boolean
          item_id?: string | null
          kit_components?: Json | null
          price_includes_tax?: boolean
          quantity?: number
          quote_id?: string
          reserved_qty?: number
          sale_price?: number
          sort_order?: number
          source_store_id?: string | null
          tenant_id?: string
          total_price?: number
          unit_cost?: number
          unit_price?: number
          uom_factor?: number
          uom_id?: string | null
          uom_label?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_source_store_fkey"
            columns: ["tenant_id", "source_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          custom_vehicle_notes?: string | null
          customer_id: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string
          discount_value?: number
          draft_number?: string | null
          due_date?: string | null
          id?: string
          inventory_deducted?: boolean
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quotation_number?: string | null
          quote_number?: string
          quoted_at?: string | null
          share_token?: string
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: number | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          custom_vehicle_notes?: string | null
          customer_id?: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string
          discount_value?: number
          draft_number?: string | null
          due_date?: string | null
          id?: string
          inventory_deducted?: boolean
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quotation_number?: string | null
          quote_number?: string
          quoted_at?: string | null
          share_token?: string
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: number | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_store_fkey"
            columns: ["tenant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          item_id: string
          low_stock_threshold: number | null
          on_hand: number
          reserved: number
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          item_id: string
          low_stock_threshold?: number | null
          on_hand?: number
          reserved?: number
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          item_id?: string
          low_stock_threshold?: number | null
          on_hand?: number
          reserved?: number
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "stock_levels_tenant_id_store_id_fkey"
            columns: ["tenant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          item_id: string
          note: string | null
          on_hand_after: number
          quantity: number
          quote_id: string | null
          reserved: number
          reserved_after: number
          store_id: string
          tenant_id: string
          type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          item_id: string
          note?: string | null
          on_hand_after: number
          quantity?: number
          quote_id?: string | null
          reserved?: number
          reserved_after: number
          store_id: string
          tenant_id: string
          type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          item_id?: string
          note?: string | null
          on_hand_after?: number
          quantity?: number
          quote_id?: string | null
          reserved?: number
          reserved_after?: number
          store_id?: string
          tenant_id?: string
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_store_id_fkey"
            columns: ["tenant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      store_item_prices: {
        Row: {
          item_id: string
          selling_price: number
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          item_id: string
          selling_price: number
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          item_id?: string
          selling_price?: number
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_item_prices_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "store_item_prices_tenant_id_store_id_fkey"
            columns: ["tenant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_main: boolean
          name: string
          ntn: string | null
          phone: string | null
          sort_order: number
          strn: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          name: string
          ntn?: string | null
          phone?: string | null
          sort_order?: number
          strn?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          name?: string
          ntn?: string | null
          phone?: string | null
          sort_order?: number
          strn?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_adjustments_invoice_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          days: number | null
          email_status: string | null
          for_date: string
          id: string
          invoice_id: string | null
          kind: string
          message: string | null
          payment_id: string | null
          sent_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          days?: number | null
          email_status?: string | null
          for_date?: string
          id?: string
          invoice_id?: string | null
          kind: string
          message?: string | null
          payment_id?: string | null
          sent_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          days?: number | null
          email_status?: string | null
          for_date?: string
          id?: string
          invoice_id?: string | null
          kind?: string
          message?: string | null
          payment_id?: string | null
          sent_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoice_lines: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          kind: string
          sort_order: number
        }
        Insert: {
          amount: number
          description: string
          id?: string
          invoice_id: string
          kind: string
          sort_order?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          kind?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          adjustments: number
          amount_paid: number
          billing_cycle: string
          created_at: string
          created_by: string | null
          discount: number
          due_date: string
          emailed_at: string | null
          id: string
          issue_date: string
          number: string
          period_end: string
          period_start: string
          plan_id: string | null
          plan_name: string
          status: string
          subtotal: number
          tenant_id: string
          total: number
          void_reason: string | null
        }
        Insert: {
          adjustments?: number
          amount_paid?: number
          billing_cycle: string
          created_at?: string
          created_by?: string | null
          discount?: number
          due_date: string
          emailed_at?: string | null
          id?: string
          issue_date?: string
          number: string
          period_end: string
          period_start: string
          plan_id?: string | null
          plan_name: string
          status?: string
          subtotal: number
          tenant_id: string
          total: number
          void_reason?: string | null
        }
        Update: {
          adjustments?: number
          amount_paid?: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          due_date?: string
          emailed_at?: string | null
          id?: string
          issue_date?: string
          number?: string
          period_end?: string
          period_start?: string
          plan_id?: string | null
          plan_name?: string
          status?: string
          subtotal?: number
          tenant_id?: string
          total?: number
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          paid_on: string
          payer_name: string | null
          proof_path: string | null
          reason: string | null
          reference: string | null
          status: string
          submitted_by: string | null
          tenant_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method: string
          note?: string | null
          paid_on: string
          payer_name?: string | null
          proof_path?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          paid_on?: string
          payer_name?: string | null
          proof_path?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          allowed_modules: string[] | null
          code: string
          created_at: string
          description: string | null
          id: string
          max_products: number | null
          max_stores: number | null
          max_users: number | null
          name: string
          price_monthly: number | null
          price_yearly: number | null
          retired_at: string | null
          sort_order: number
          trial_days: number
          updated_at: string
          visibility: string
        }
        Insert: {
          allowed_modules?: string[] | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          retired_at?: string | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          allowed_modules?: string[] | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          retired_at?: string | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      superadmin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          reason: string | null
          target_tenant_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          reason?: string | null
          target_tenant_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          reason?: string | null
          target_tenant_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_follow_ups: {
        Row: {
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          due_on: string
          id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on: string
          id?: string
          reason: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on?: string
          id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_health_snapshots: {
        Row: {
          band: string
          parts: Json
          score: number
          taken_on: string
          tenant_id: string
        }
        Insert: {
          band: string
          parts: Json
          score: number
          taken_on: string
          tenant_id: string
        }
        Update: {
          band?: string
          parts?: Json
          score?: number
          taken_on?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_health_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_hidden_categories: {
        Row: {
          category_id: string
          created_at: string
          tenant_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          tenant_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_hidden_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_hidden_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          edited_at: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          edited_at?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          edited_at?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscription_history: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          changed_at: string
          changed_by: string | null
          id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          agreed_price: number | null
          allowed_modules: string[] | null
          auto_suspend: boolean
          billing_cycle: string
          cancel_at: string | null
          change_reason: string | null
          created_at: string
          discount_type: string
          discount_value: number
          extended_until: string | null
          grace_days: number
          max_products: number | null
          max_stores: number | null
          max_users: number | null
          next_due_date: string | null
          paid_until: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string
          price_note: string | null
          started_at: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agreed_price?: number | null
          allowed_modules?: string[] | null
          auto_suspend?: boolean
          billing_cycle?: string
          cancel_at?: string | null
          change_reason?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number
          extended_until?: string | null
          grace_days?: number
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          next_due_date?: string | null
          paid_until?: string | null
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          plan_id: string
          price_note?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agreed_price?: number | null
          allowed_modules?: string[] | null
          auto_suspend?: boolean
          billing_cycle?: string
          cancel_at?: string | null
          change_reason?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number
          extended_until?: string | null
          grace_days?: number
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          next_due_date?: string | null
          paid_until?: string | null
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          plan_id?: string
          price_note?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tags: {
        Row: {
          created_at: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "admin_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          address: string | null
          allow_cross_store_invoicing: boolean
          allow_international_phones: boolean
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          bank_account_number: string | null
          bank_account_title: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_raast_id: string | null
          bank_wallets: Json
          clock_24_hour: boolean
          clock_style: string
          created_at: string
          cross_store_invoicing_roles: string
          currency: string
          draft_prefix: string
          draft_start_number: number
          email: string | null
          id: string
          images_on_drafts: boolean
          images_on_invoices: boolean
          images_on_pdf: boolean
          images_on_share: boolean
          images_on_quotations: boolean
          industry_id: string
          invoice_prefix: string
          invoice_start_number: number
          invoice_terms: string | null
          logo_url: string | null
          modules: string[]
          name: string
          ntn: string | null
          number_per_store: boolean
          onboarding_dismissed_at: string | null
          owner_id: string | null
          packs_enabled: boolean
          phone: string | null
          prices_include_tax: boolean
          print_format: string
          quote_footer_notes: string | null
          quote_prefix: string
          quote_start_number: number
          quote_validity_days: number
          show_clock: boolean
          show_overview_logo: boolean
          show_paisa: boolean
          slug: string
          status: string
          status_reason: string | null
          strn: string | null
          tax_rate: number
          timezone: string
          updated_at: string
          week_start: number
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          allow_cross_store_invoicing?: boolean
          allow_international_phones?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_raast_id?: string | null
          bank_wallets?: Json
          clock_24_hour?: boolean
          clock_style?: string
          created_at?: string
          cross_store_invoicing_roles?: string
          currency?: string
          draft_prefix?: string
          draft_start_number?: number
          email?: string | null
          id?: string
          images_on_drafts?: boolean
          images_on_invoices?: boolean
          images_on_pdf?: boolean
          images_on_share?: boolean
          images_on_quotations?: boolean
          industry_id: string
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_terms?: string | null
          logo_url?: string | null
          modules?: string[]
          name: string
          ntn?: string | null
          number_per_store?: boolean
          onboarding_dismissed_at?: string | null
          owner_id?: string | null
          packs_enabled?: boolean
          phone?: string | null
          prices_include_tax?: boolean
          print_format?: string
          quote_footer_notes?: string | null
          quote_prefix?: string
          quote_start_number?: number
          quote_validity_days?: number
          show_clock?: boolean
          show_overview_logo?: boolean
          show_paisa?: boolean
          slug: string
          status?: string
          status_reason?: string | null
          strn?: string | null
          tax_rate?: number
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          allow_cross_store_invoicing?: boolean
          allow_international_phones?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_raast_id?: string | null
          bank_wallets?: Json
          clock_24_hour?: boolean
          clock_style?: string
          created_at?: string
          cross_store_invoicing_roles?: string
          currency?: string
          draft_prefix?: string
          draft_start_number?: number
          email?: string | null
          id?: string
          images_on_drafts?: boolean
          images_on_invoices?: boolean
          images_on_pdf?: boolean
          images_on_share?: boolean
          images_on_quotations?: boolean
          industry_id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_terms?: string | null
          logo_url?: string | null
          modules?: string[]
          name?: string
          ntn?: string | null
          number_per_store?: boolean
          onboarding_dismissed_at?: string | null
          owner_id?: string | null
          packs_enabled?: boolean
          phone?: string | null
          prices_include_tax?: boolean
          print_format?: string
          quote_footer_notes?: string | null
          quote_prefix?: string
          quote_start_number?: number
          quote_validity_days?: number
          show_clock?: boolean
          show_overview_logo?: boolean
          show_paisa?: boolean
          slug?: string
          status?: string
          status_reason?: string | null
          strn?: string | null
          tax_rate?: number
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenants_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          code: string
          created_at: string
          decimals: number
          id: string
          is_archived: boolean
          is_pack: boolean
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          decimals?: number
          id?: string
          is_archived?: boolean
          is_pack?: boolean
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          decimals?: number
          id?: string
          is_archived?: boolean
          is_pack?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_presets: {
        Row: {
          code: string
          decimals: number
          is_pack: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          decimals?: number
          is_pack?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          decimals?: number
          is_pack?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          id: number
          make: string
          model: string
          tenant_id: string | null
          trim: string | null
          year: number
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          id?: number
          make: string
          model: string
          tenant_id?: string | null
          trim?: string | null
          year: number
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          id?: number
          make?: string
          model?: string
          tenant_id?: string | null
          trim?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_vehicle: {
        Args: { p_make: string; p_model: string; p_year: number }
        Returns: {
          id: number
          make: string
          model: string
          trim: string
          year: number
        }[]
      }
      admin_category_usage: {
        Args: { p_industry: string }
        Returns: {
          category_id: string
          items: number
          tenants: number
        }[]
      }
      admin_create_organization: {
        Args: {
          p_full_name: string
          p_industry: string
          p_shop_name: string
          p_user: string
        }
        Returns: string
      }
      admin_create_subscription_invoice: {
        Args: {
          p_by: string
          p_issue_date: string
          p_period_start: string
          p_tenant: string
        }
        Returns: string
      }
      admin_document_number_floors: {
        Args: { p_tenant: string }
        Returns: Json
      }
      admin_force_sign_out: { Args: { p_user: string }; Returns: number }
      admin_merge_vehicles: {
        Args: { p_keep: number; p_merge: number[] }
        Returns: number
      }
      admin_near_limits: {
        Args: { p_ratio?: number }
        Returns: {
          kind: string
          max: number
          name: string
          tenant_id: string
          used: number
        }[]
      }
      admin_onboarding: {
        Args: { p_tenant: string }
        Returns: {
          done: boolean
          step: string
        }[]
      }
      admin_onboarding_summary: {
        Args: never
        Returns: {
          done: number
          tenant_id: string
          total: number
        }[]
      }
      admin_platform_metrics: { Args: never; Returns: Json }
      admin_reconcile_tenant: { Args: { p_tenant: string }; Returns: Json }
      admin_refresh_health: { Args: { p_date: string }; Returns: number }
      admin_remap_tenant_industry: {
        Args: { p_mapping: Json; p_new_industry: string; p_tenant: string }
        Returns: number
      }
      admin_set_platform_admin: {
        Args: {
          p_active: boolean
          p_by: string
          p_email?: string
          p_full_name?: string
          p_user: string
        }
        Returns: boolean
      }
      admin_set_store_stock: {
        Args: {
          p_item: string
          p_on_hand: number
          p_store: string
          p_tenant: string
        }
        Returns: {
          item_id: string
          low_stock_threshold: number | null
          on_hand: number
          reserved: number
          store_id: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_levels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_tenant_health: { Args: { p_tenant: string }; Returns: Json }
      admin_tenants: {
        Args: {
          p_archived?: boolean
          p_band?: string
          p_limit: number
          p_offset: number
          p_search: string
          p_sort?: string
          p_status: string
          p_tag?: string
        }
        Returns: {
          archived_at: string
          billing_cycle: string
          created_at: string
          currency: string
          email: string
          health_band: string
          health_score: number
          id: string
          invoices: number
          last_sign_in_at: string
          logo_url: string
          name: string
          next_due_date: string
          next_follow_up: string
          open_follow_ups: number
          owner_email: string
          owner_name: string
          paid_until: string
          phone: string
          plan_name: string
          sales: number
          slug: string
          status: string
          status_reason: string
          subscription_status: string
          tags: Json
          total: number
          users: number
        }[]
      }
      admin_users: {
        Args: { p_limit: number; p_offset: number; p_search: string }
        Returns: {
          created_at: string
          deactivated_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          role: string
          tenant_archived_at: string
          tenant_id: string
          tenant_name: string
          tenant_status: string
          total: number
        }[]
      }
      admin_vehicles: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query: string
          p_scope?: string
          p_year?: number
        }
        Returns: {
          deactivated_at: string
          documents: number
          id: number
          items: number
          make: string
          model: string
          tenant_id: string
          tenant_name: string
          total: number
          trim: string
          year: number
        }[]
      }
      convert_quote: {
        Args: { p_quote_id: string; p_target: string }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      customer_directory_stats: {
        Args: never
        Returns: {
          b2b: number
          outstanding: number
          total: number
        }[]
      }
      dashboard_metrics: {
        Args: {
          p_from?: string
          p_range?: string
          p_store_id?: string
          p_to?: string
        }
        Returns: Json
      }
      delete_product_group: { Args: { p_group: string }; Returns: string }
      document_list_totals: {
        Args: {
          p_search: string
          p_status_key: string
          p_statuses: string[]
          p_store_id?: string
          p_today: string
        }
        Returns: {
          owed: number
          total: number
        }[]
      }
      document_number_floors: { Args: never; Returns: Json }
      filter_documents: {
        Args: {
          p_search: string
          p_status_key: string
          p_statuses: string[]
          p_store_id?: string
          p_today: string
        }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      inventory_items_at_store: {
        Args: { p_query?: string; p_stock?: string; p_store_id: string }
        Returns: {
          attributes: Json
          available_quantity: number | null
          barcode: string | null
          base_uom_id: string
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          is_archived: boolean
          is_kit: boolean
          is_low_stock: boolean | null
          is_universal: boolean
          low_stock_threshold: number
          name: string
          option_values: Json | null
          own_cost: boolean
          own_price: boolean
          price_includes_tax: boolean
          purchase_uom_id: string | null
          quantity_on_hand: number
          reserved_quantity: number
          sale_uom_id: string | null
          selling_price: number
          sku: string
          tenant_id: string
          updated_at: string
          variant_label: string | null
          vendor_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      inventory_list: {
        Args: { p_grouped?: boolean; p_query?: string; p_store_id?: string }
        Returns: Database["public"]["CompositeTypes"]["inventory_list_row"][]
        SetofOptions: {
          from: "*"
          to: "inventory_list_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_valid_timezone: { Args: { p_tz: string }; Returns: boolean }
      kit_available: {
        Args: { p_kit: string; p_store?: string }
        Returns: number
      }
      match_vehicles: {
        Args: { p_specs: Json }
        Returns: {
          spec_index: number
          vehicle_id: number
        }[]
      }
      my_modules: { Args: never; Returns: string[] }
      my_onboarding: { Args: never; Returns: Json }
      my_shop_status: { Args: never; Returns: string }
      my_status_reason: { Args: never; Returns: string }
      my_subscription: { Args: never; Returns: Json }
      my_subscription_invoice: { Args: { p_invoice: string }; Returns: Json }
      my_unpaid_notice: { Args: never; Returns: Json }
      my_work_stores: { Args: never; Returns: string[] }
      next_document_number: {
        Args: { p_prefix: string; p_store_id?: string }
        Returns: string
      }
      record_payment: {
        Args: {
          p_amount: number
          p_items?: Json
          p_method: string
          p_notes?: string
          p_paid_on: string
          p_quote_id: string
        }
        Returns: string
      }
      report_data: {
        Args: {
          p_from?: string
          p_range?: string
          p_store_id?: string
          p_tag?: string
          p_to?: string
        }
        Returns: Json
      }
      run_subscription_cycle: { Args: { p_date: string }; Returns: Json }
      save_inventory_item: {
        Args: {
          p_attributes?: Json
          p_barcode?: string
          p_base_uom_id?: string
          p_category_id: string
          p_conversions?: Json
          p_cost_price: number
          p_description?: string
          p_is_kit?: boolean
          p_is_universal: boolean
          p_item_id?: string
          p_kit_components?: Json
          p_low_stock_threshold: number
          p_name: string
          p_price_includes_tax?: boolean
          p_purchase_uom_id?: string
          p_quantity_on_hand: number
          p_sale_uom_id?: string
          p_selling_price: number
          p_sku: string
          p_store_id?: string
          p_store_settings?: Json
          p_vehicle_ids?: number[]
          p_vendor_name?: string
        }
        Returns: string
      }
      save_product_group: { Args: { p_group: Json }; Returns: string }
      save_quote: {
        Args: {
          p_custom_vehicle_notes?: string
          p_customer_id: string
          p_discount_reason?: string
          p_discount_type?: string
          p_discount_value?: number
          p_due_date?: string
          p_items: Json
          p_notes?: string
          p_quote_id?: string
          p_stage?: string
          p_store_id?: string
          p_vehicle_id?: number
          p_walk_in_name?: string
          p_walk_in_phone?: string
        }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_customers: {
        Args: { p_query: string }
        Returns: {
          billing_address: string | null
          cnic_or_ntn: string | null
          contact_person: string | null
          created_at: string
          credit_days: number
          customer_type: string
          default_discount_percentage: number
          email: string | null
          id: string
          is_walk_in: boolean
          name: string
          notes: string | null
          phone: string | null
          strn: string | null
          tax_registration_status: string
          tenant_id: string
          updated_at: string
          whatsapp_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_inventory_items: {
        Args: { p_query: string }
        Returns: {
          attributes: Json
          available_quantity: number | null
          barcode: string | null
          base_uom_id: string
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          is_archived: boolean
          is_kit: boolean
          is_low_stock: boolean | null
          is_universal: boolean
          low_stock_threshold: number
          name: string
          option_values: Json | null
          own_cost: boolean
          own_price: boolean
          price_includes_tax: boolean
          purchase_uom_id: string | null
          quantity_on_hand: number
          reserved_quantity: number
          sale_uom_id: string | null
          selling_price: number
          sku: string
          tenant_id: string
          updated_at: string
          variant_label: string | null
          vendor_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_customer_tags: {
        Args: { p_customer_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      set_default_customer_type: {
        Args: { p_type_id: string }
        Returns: undefined
      }
      shop_alerts: { Args: { p_store_id?: string }; Returns: Json }
      submit_subscription_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_method: string
          p_note: string
          p_paid_on: string
          p_payer_name: string
          p_proof_path: string
          p_reference: string
        }
        Returns: string
      }
      vehicle_makes: {
        Args: { p_year: number }
        Returns: {
          make: string
        }[]
      }
      vehicle_models: {
        Args: { p_make: string; p_year: number }
        Returns: {
          id: number
          model: string
          trim: string
        }[]
      }
      vehicle_years: {
        Args: never
        Returns: {
          year: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      inventory_list_row: {
        id: string | null
        kind: string | null
        group_id: string | null
        name: string | null
        sku: string | null
        category_id: string | null
        is_universal: boolean | null
        attributes: Json | null
        selling_price: number | null
        max_price: number | null
        cost_price: number | null
        quantity_on_hand: number | null
        reserved_quantity: number | null
        available_quantity: number | null
        low_stock_threshold: number | null
        is_low_stock: boolean | null
        variant_count: number | null
        created_at: string | null
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
