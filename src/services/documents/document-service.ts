import "server-only";

/**
 * Document metadata boundary.
 * Files belong in Supabase Storage; PostgreSQL keeps only document rows.
 * Upload workflows are intentionally not implemented in Step 2.
 */
export interface DocumentMetadataInput {
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  entityType: string;
  entityId: string;
  uploadedBy?: string | null;
}

export async function listDocumentsForEntity(entityType: string, entityId: string) {
  void entityType;
  void entityId;
  return [] as const;
}
