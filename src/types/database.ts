/**
 * Typed shape of the SeaDock public schema.
 * Keep this aligned with supabase/migrations.
 * Replace with `supabase gen types` once a linked project is available.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DatabaseRole =
  | "super_admin"
  | "manager"
  | "data_entry"
  | "warehouse_staff"
  | "warehouse_manager";

export type VendorStatus = "active" | "inactive" | "archived";
export type PurchaseOrderDbStatus =
  | "draft"
  | "awaiting_verification"
  | "confirmed"
  | "issued"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";
export type GoodsReceiptStatus =
  | "draft"
  | "pending_qaqc"
  | "accepted"
  | "rejected"
  | "received"
  | "cancelled";
export type BatchDbStatus =
  | "active"
  | "fresh"
  | "frozen"
  | "in_processing"
  | "processed"
  | "dispatched"
  | "archived";
export type ProcessingRunDbStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type InventoryType = "raw" | "processed" | "frozen" | "wastage";
export type InventoryItemStatus = "available" | "reserved" | "dispatched" | "archived";
export type InventoryMovementType =
  | "receipt"
  | "transfer"
  | "processing_input"
  | "processing_output"
  | "processing_consumption"
  | "processing_yield"
  | "processing_wastage"
  | "wastage"
  | "dispatch"
  | "adjustment"
  | "reservation"
  | "release"
  | "fresh_to_frozen";
export type CustomerStatus = "active" | "inactive";
export type CustomerPoDbStatus =
  | "received"
  | "under_review"
  | "action_required"
  | "approved"
  | "partially_allocated"
  | "ready_for_fulfillment"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled"
  | "awaiting_verification"
  | "verified"
  | "pending_fulfilment";
export type CustomerPoPriority = "normal" | "high" | "urgent";
export type CustomerPoSource = "manual" | "email" | "api" | "import";
export type CustomerPoItemStatus = "open" | "partially_fulfilled" | "fulfilled" | "cancelled";
export type EmailMessageProvider = "gmail" | "microsoft365" | "imap" | "other" | "mock";
export type EmailMessageProcessingStatus =
  | "received"
  | "processing"
  | "processed"
  | "ignored"
  | "failed"
  | "action_required";
export type EmailDetectionLabelDb = "likely_po" | "not_po" | "needs_review";
export type EmailConnectionStatusDb =
  | "not_connected"
  | "connected"
  | "connection_error"
  | "disconnected";
export type EmailPoCandidateReviewStatusDb =
  | "new"
  | "needs_review"
  | "ready_to_confirm"
  | "confirmed"
  | "ignored"
  | "failed";
export type EmailAttachmentExtractionStatusDb =
  | "pending"
  | "unsupported"
  | "extracted"
  | "failed"
  | "skipped";
export type FulfilmentStatus =
  | "draft"
  | "ready"
  | "partially_dispatched"
  | "dispatched"
  | "fulfilled"
  | "cancelled";
export type InventoryAllocationStatus = "active" | "released" | "fulfilled";
export type QaqcRecordStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type QaqcResult = "passed" | "failed" | "conditional" | "on_hold";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: DatabaseRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          role: DatabaseRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          vendor_code: string;
          vendor_name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          status: VendorStatus;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          vendor_code: string;
          vendor_name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          status?: VendorStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          po_number: string;
          vendor_id: string;
          po_date: string;
          expected_date: string | null;
          status: PurchaseOrderDbStatus;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          po_number: string;
          vendor_id: string;
          po_date?: string;
          expected_date?: string | null;
          status?: PurchaseOrderDbStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_orders"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          product_species: string;
          ordered_quantity: number;
          unit: string;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          purchase_order_id: string;
          product_species: string;
          ordered_quantity: number;
          unit?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_order_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipts: {
        Row: {
          id: string;
          receipt_number: string;
          purchase_order_id: string;
          received_at: string;
          received_by: string | null;
          driver_name: string | null;
          vehicle_number: string | null;
          notes: string | null;
          status: GoodsReceiptStatus;
        } & Timestamps;
        Insert: {
          id?: string;
          receipt_number: string;
          purchase_order_id: string;
          received_at?: string;
          received_by?: string | null;
          driver_name?: string | null;
          vehicle_number?: string | null;
          notes?: string | null;
          status?: GoodsReceiptStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["goods_receipts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipt_items: {
        Row: {
          id: string;
          goods_receipt_id: string;
          purchase_order_item_id: string;
          received_quantity: number;
          unit: string;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          goods_receipt_id: string;
          purchase_order_item_id: string;
          received_quantity: number;
          unit?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["goods_receipt_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey";
            columns: ["goods_receipt_id"];
            isOneToOne: false;
            referencedRelation: "goods_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      batches: {
        Row: {
          id: string;
          batch_number: string;
          goods_receipt_id: string;
          goods_receipt_item_id: string | null;
          product_species: string;
          received_quantity: number;
          remaining_quantity: number;
          unit: string;
          received_at: string;
          status: BatchDbStatus;
        } & Timestamps;
        Insert: {
          id?: string;
          batch_number: string;
          goods_receipt_id: string;
          goods_receipt_item_id?: string | null;
          product_species: string;
          received_quantity: number;
          remaining_quantity: number;
          unit?: string;
          received_at?: string;
          status?: BatchDbStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["batches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "batches_goods_receipt_id_fkey";
            columns: ["goods_receipt_id"];
            isOneToOne: false;
            referencedRelation: "goods_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      processing_runs: {
        Row: {
          id: string;
          processing_run_number: string;
          parent_batch_id: string;
          processing_date: string;
          input_quantity: number;
          input_unit: string;
          processed_quantity: number;
          wastage_quantity: number;
          status: ProcessingRunDbStatus;
          processed_by: string | null;
          operator_name: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          processing_run_number: string;
          parent_batch_id: string;
          processing_date?: string;
          input_quantity: number;
          input_unit?: string;
          processed_quantity?: number;
          wastage_quantity?: number;
          status?: ProcessingRunDbStatus;
          processed_by?: string | null;
          operator_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_runs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "processing_runs_parent_batch_id_fkey";
            columns: ["parent_batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          id: string;
          batch_id: string;
          processing_run_id: string | null;
          inventory_type: InventoryType;
          product_species: string;
          quantity: number;
          reserved_quantity: number;
          unit: string;
          status: InventoryItemStatus;
          storage_location: string | null;
          frozen_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          batch_id: string;
          processing_run_id?: string | null;
          inventory_type: InventoryType;
          product_species: string;
          quantity: number;
          reserved_quantity?: number;
          unit?: string;
          status?: InventoryItemStatus;
          storage_location?: string | null;
          frozen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: string;
          inventory_item_id: string;
          movement_type: InventoryMovementType;
          quantity: number;
          unit: string;
          reference_type: string | null;
          reference_id: string | null;
          previous_quantity: number;
          new_quantity: number;
          performed_by: string | null;
          performed_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          inventory_item_id: string;
          movement_type: InventoryMovementType;
          quantity: number;
          unit?: string;
          reference_type?: string | null;
          reference_id?: string | null;
          previous_quantity: number;
          new_quantity: number;
          performed_by?: string | null;
          performed_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_movements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          customer_code: string;
          name: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          contact_person: string | null;
          status: CustomerStatus;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          customer_code: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          contact_person?: string | null;
          status?: CustomerStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      customer_purchase_orders: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_name: string;
          customer_reference: string | null;
          po_number: string;
          po_date: string | null;
          required_date: string | null;
          status: CustomerPoDbStatus;
          source: CustomerPoSource;
          priority: CustomerPoPriority;
          action_required: boolean;
          action_required_reason: string | null;
          action_required_at: string | null;
          action_required_by: string | null;
          received_at: string;
          verified_at: string | null;
          verified_by: string | null;
          created_by: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          customer_id?: string | null;
          customer_name: string;
          customer_reference?: string | null;
          po_number: string;
          po_date?: string | null;
          required_date?: string | null;
          status?: CustomerPoDbStatus;
          source?: CustomerPoSource;
          priority?: CustomerPoPriority;
          action_required?: boolean;
          action_required_reason?: string | null;
          action_required_at?: string | null;
          action_required_by?: string | null;
          received_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          created_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_purchase_orders"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customer_purchase_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_purchase_order_items: {
        Row: {
          id: string;
          customer_purchase_order_id: string;
          line_number: number;
          product_name: string | null;
          product_species: string;
          product_code: string | null;
          requested_quantity: number;
          unit: string;
          required_delivery_date: string | null;
          specifications: string | null;
          fulfilled_quantity: number;
          status: CustomerPoItemStatus;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          customer_purchase_order_id: string;
          line_number?: number;
          product_name?: string | null;
          product_species: string;
          product_code?: string | null;
          requested_quantity: number;
          unit?: string;
          required_delivery_date?: string | null;
          specifications?: string | null;
          fulfilled_quantity?: number;
          status?: CustomerPoItemStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_purchase_order_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customer_purchase_order_items_customer_purchase_order_id_fkey";
            columns: ["customer_purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "customer_purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_purchase_order_status_history: {
        Row: {
          id: string;
          customer_po_id: string;
          from_status: string | null;
          to_status: string;
          changed_by: string | null;
          changed_by_name: string | null;
          changed_at: string;
          reason: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_po_id: string;
          from_status?: string | null;
          to_status: string;
          changed_by?: string | null;
          changed_by_name?: string | null;
          changed_at?: string;
          reason?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_purchase_order_status_history"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customer_purchase_order_status_history_customer_po_id_fkey";
            columns: ["customer_po_id"];
            isOneToOne: false;
            referencedRelation: "customer_purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      email_messages: {
        Row: {
          id: string;
          provider: EmailMessageProvider;
          external_message_id: string;
          sender: string | null;
          recipient: string | null;
          subject: string | null;
          received_at: string | null;
          thread_id: string | null;
          snippet: string | null;
          has_attachments: boolean;
          body_text: string | null;
          processing_status: EmailMessageProcessingStatus;
          detection_label: EmailDetectionLabelDb | null;
          detection_score: number | null;
          action_required_reason: string | null;
          linked_customer_po_id: string | null;
          processed_at: string | null;
          error_message: string | null;
          metadata: Json;
        } & Timestamps;
        Insert: {
          id?: string;
          provider: EmailMessageProvider;
          external_message_id: string;
          sender?: string | null;
          recipient?: string | null;
          subject?: string | null;
          received_at?: string | null;
          thread_id?: string | null;
          snippet?: string | null;
          has_attachments?: boolean;
          body_text?: string | null;
          processing_status?: EmailMessageProcessingStatus;
          detection_label?: EmailDetectionLabelDb | null;
          detection_score?: number | null;
          action_required_reason?: string | null;
          linked_customer_po_id?: string | null;
          processed_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_messages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "email_messages_linked_customer_po_id_fkey";
            columns: ["linked_customer_po_id"];
            isOneToOne: false;
            referencedRelation: "customer_purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      email_provider_connections: {
        Row: {
          id: string;
          provider: EmailMessageProvider;
          account_email: string | null;
          status: EmailConnectionStatusDb;
          scopes: string[];
          refresh_token_ciphertext: string | null;
          access_token_ciphertext: string | null;
          access_token_expires_at: string | null;
          token_metadata: Json;
          last_sync_at: string | null;
          last_sync_result: Json;
          last_error: string | null;
          connected_by: string | null;
          connected_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          provider: EmailMessageProvider;
          account_email?: string | null;
          status?: EmailConnectionStatusDb;
          scopes?: string[];
          refresh_token_ciphertext?: string | null;
          access_token_ciphertext?: string | null;
          access_token_expires_at?: string | null;
          token_metadata?: Json;
          last_sync_at?: string | null;
          last_sync_result?: Json;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_provider_connections"]["Insert"]>;
        Relationships: [];
      };
      email_attachments: {
        Row: {
          id: string;
          email_message_id: string;
          external_attachment_id: string | null;
          filename: string;
          mime_type: string | null;
          size_bytes: number | null;
          storage_reference: string | null;
          document_id: string | null;
          extraction_status: EmailAttachmentExtractionStatusDb;
          extraction_error: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          email_message_id: string;
          external_attachment_id?: string | null;
          filename: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_reference?: string | null;
          document_id?: string | null;
          extraction_status?: EmailAttachmentExtractionStatusDb;
          extraction_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_attachments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_message_id_fkey";
            columns: ["email_message_id"];
            isOneToOne: false;
            referencedRelation: "email_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      email_po_candidates: {
        Row: {
          id: string;
          email_message_id: string;
          review_status: EmailPoCandidateReviewStatusDb;
          detection_label: EmailDetectionLabelDb | null;
          detection_score: number | null;
          customer_match_status: "matched" | "multiple_matches" | "no_match" | null;
          matched_customer_id: string | null;
          extracted_payload: Json;
          edited_payload: Json | null;
          warnings: Json;
          action_required_reasons: string[];
          linked_customer_po_id: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          ignored_reason: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          email_message_id: string;
          review_status?: EmailPoCandidateReviewStatusDb;
          detection_label?: EmailDetectionLabelDb | null;
          detection_score?: number | null;
          customer_match_status?: "matched" | "multiple_matches" | "no_match" | null;
          matched_customer_id?: string | null;
          extracted_payload?: Json;
          edited_payload?: Json | null;
          warnings?: Json;
          action_required_reasons?: string[];
          linked_customer_po_id?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          ignored_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_po_candidates"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "email_po_candidates_email_message_id_fkey";
            columns: ["email_message_id"];
            isOneToOne: true;
            referencedRelation: "email_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      fulfilments: {
        Row: {
          id: string;
          fulfilment_number: string;
          customer_purchase_order_id: string;
          fulfilled_at: string | null;
          fulfilled_by: string | null;
          status: FulfilmentStatus;
          planned_date: string | null;
          vehicle_number: string | null;
          driver_name: string | null;
          dispatched_at: string | null;
          created_by: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          fulfilment_number: string;
          customer_purchase_order_id: string;
          fulfilled_at?: string | null;
          fulfilled_by?: string | null;
          status?: FulfilmentStatus;
          planned_date?: string | null;
          vehicle_number?: string | null;
          driver_name?: string | null;
          dispatched_at?: string | null;
          created_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["fulfilments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "fulfilments_customer_purchase_order_id_fkey";
            columns: ["customer_purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "customer_purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      fulfilment_items: {
        Row: {
          id: string;
          fulfilment_id: string;
          customer_purchase_order_item_id: string;
          inventory_item_id: string;
          batch_id: string;
          quantity: number;
          dispatched_quantity: number;
          allocation_id: string | null;
          unit: string;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          fulfilment_id: string;
          customer_purchase_order_item_id: string;
          inventory_item_id: string;
          batch_id: string;
          quantity: number;
          dispatched_quantity?: number;
          allocation_id?: string | null;
          unit?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["fulfilment_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "fulfilment_items_fulfilment_id_fkey";
            columns: ["fulfilment_id"];
            isOneToOne: false;
            referencedRelation: "fulfilments";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_allocations: {
        Row: {
          id: string;
          customer_purchase_order_item_id: string;
          fulfilment_id: string | null;
          inventory_item_id: string;
          batch_id: string;
          allocated_quantity: number;
          fulfilled_quantity: number;
          unit: string;
          status: InventoryAllocationStatus;
          allocated_at: string;
          allocated_by: string | null;
          released_at: string | null;
          release_reason: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          customer_purchase_order_item_id: string;
          fulfilment_id?: string | null;
          inventory_item_id: string;
          batch_id: string;
          allocated_quantity: number;
          fulfilled_quantity?: number;
          unit?: string;
          status?: InventoryAllocationStatus;
          allocated_at?: string;
          allocated_by?: string | null;
          released_at?: string | null;
          release_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_allocations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_allocations_customer_purchase_order_item_id_fkey";
            columns: ["customer_purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "customer_purchase_order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_allocations_fulfilment_id_fkey";
            columns: ["fulfilment_id"];
            isOneToOne: false;
            referencedRelation: "fulfilments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_allocations_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_allocations_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ];
      };
      incoming_qaqc: {
        Row: {
          id: string;
          goods_receipt_id: string;
          batch_id: string | null;
          inspection_date: string;
          inspector_id: string | null;
          status: QaqcRecordStatus;
          result: QaqcResult | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          goods_receipt_id: string;
          batch_id?: string | null;
          inspection_date?: string;
          inspector_id?: string | null;
          status?: QaqcRecordStatus;
          result?: QaqcResult | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["incoming_qaqc"]["Insert"]>;
        Relationships: [];
      };
      processing_qaqc: {
        Row: {
          id: string;
          processing_run_id: string;
          batch_id: string;
          inspection_date: string;
          inspector_id: string | null;
          status: QaqcRecordStatus;
          result: QaqcResult | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          processing_run_id: string;
          batch_id: string;
          inspection_date?: string;
          inspector_id?: string | null;
          status?: QaqcRecordStatus;
          result?: QaqcResult | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_qaqc"]["Insert"]>;
        Relationships: [];
      };
      final_qaqc: {
        Row: {
          id: string;
          customer_purchase_order_id: string;
          fulfilment_id: string | null;
          batch_id: string | null;
          inspection_date: string;
          inspector_id: string | null;
          status: QaqcRecordStatus;
          result: QaqcResult | null;
          quantity_checked: number | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          customer_purchase_order_id: string;
          fulfilment_id?: string | null;
          batch_id?: string | null;
          inspection_date?: string;
          inspector_id?: string | null;
          status?: QaqcRecordStatus;
          result?: QaqcResult | null;
          quantity_checked?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["final_qaqc"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          actor_name: string;
          action: string;
          entity_type: string;
          entity_id: string;
          entity_label: string | null;
          field_name: string | null;
          previous_value: string | null;
          new_value: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          actor_name: string;
          action: string;
          entity_type: string;
          entity_id: string;
          entity_label?: string | null;
          field_name?: string | null;
          previous_value?: string | null;
          new_value?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          file_size: number | null;
          entity_type: string;
          entity_id: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          file_size?: number | null;
          entity_type: string;
          entity_id: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_authenticated: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      next_batch_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      po_item_received_quantity: {
        Args: { p_item_id: string };
        Returns: number;
      };
      complete_receiving_workflow: {
        Args: {
          p_purchase_order_id: string;
          p_receipt_number: string;
          p_received_at: string;
          p_driver_name: string;
          p_vehicle_number: string;
          p_notes: string;
          p_received_by: string | null;
          p_actor_name: string;
          p_items: Json;
          p_qaqc_inspection_date: string;
          p_qaqc_inspector_id: string | null;
          p_qaqc_result: string;
          p_qaqc_notes: string;
          p_allow_over_receive?: boolean;
        };
        Returns: Json;
      };
      next_processing_run_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_processing_run_draft: {
        Args: {
          p_parent_batch_id: string;
          p_processing_date: string;
          p_operator_name: string;
          p_input_quantity: number;
          p_input_unit: string;
          p_notes: string;
          p_processed_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      complete_processing_workflow: {
        Args: {
          p_parent_batch_id: string;
          p_processing_date: string;
          p_operator_name: string;
          p_input_quantity: number;
          p_input_unit: string;
          p_yield_quantity: number;
          p_wastage_quantity: number;
          p_notes: string;
          p_processed_by: string | null;
          p_actor_name: string;
          p_qaqc_inspection_date: string;
          p_qaqc_inspector_id: string | null;
          p_qaqc_result: string;
          p_qaqc_notes: string;
          p_processing_run_id?: string | null;
        };
        Returns: Json;
      };
      next_customer_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_customer_purchase_order: {
        Args: {
          p_customer_id: string;
          p_po_number: string;
          p_po_date: string | null;
          p_received_at: string;
          p_required_delivery_date: string | null;
          p_priority: string;
          p_notes: string;
          p_source: string;
          p_created_by: string | null;
          p_actor_name: string;
          p_items: Json;
        };
        Returns: Json;
      };
      change_customer_purchase_order_status: {
        Args: {
          p_customer_po_id: string;
          p_to_status: string;
          p_reason: string;
          p_notes: string;
          p_changed_by: string | null;
          p_actor_name: string;
          p_mark_action_required?: boolean | null;
          p_action_required_reason?: string | null;
        };
        Returns: Json;
      };
      next_fulfilment_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      allocate_inventory_to_customer_po: {
        Args: {
          p_customer_po_item_id: string;
          p_lines: Json;
          p_allocated_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      release_inventory_allocation: {
        Args: {
          p_allocation_id: string;
          p_reason: string;
          p_released_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      create_fulfilment_from_allocations: {
        Args: {
          p_customer_po_id: string;
          p_allocation_ids: string[];
          p_planned_date: string | null;
          p_notes: string;
          p_created_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      record_final_qaqc: {
        Args: {
          p_fulfilment_id: string;
          p_inspection_date: string;
          p_inspector_id: string | null;
          p_result: string;
          p_quantity_checked: number | null;
          p_notes: string;
          p_actor_name: string;
        };
        Returns: Json;
      };
      dispatch_fulfilment: {
        Args: {
          p_fulfilment_id: string;
          p_dispatch_quantity_lines: Json;
          p_vehicle_number: string;
          p_driver_name: string;
          p_notes: string;
          p_dispatched_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      cancel_customer_po_release_allocations: {
        Args: {
          p_customer_po_id: string;
          p_reason: string;
          p_cancelled_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      cancel_fulfilment: {
        Args: {
          p_fulfilment_id: string;
          p_reason: string;
          p_cancelled_by: string | null;
          p_actor_name: string;
        };
        Returns: Json;
      };
      freeze_eligible_inventory: {
        Args: {
          p_actor: string;
          p_now?: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PublicTableName = keyof Database["public"]["Tables"];
export type PublicRow<T extends PublicTableName> = Database["public"]["Tables"][T]["Row"];
export type PublicInsert<T extends PublicTableName> = Database["public"]["Tables"][T]["Insert"];
