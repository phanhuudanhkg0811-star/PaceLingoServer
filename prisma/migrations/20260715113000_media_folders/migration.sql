-- Organize reusable media without changing existing R2 object keys.
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MediaAsset" ADD COLUMN "folderId" TEXT;

CREATE UNIQUE INDEX "MediaFolder_name_key" ON "MediaFolder"("name");
CREATE INDEX "MediaFolder_createdById_createdAt_idx" ON "MediaFolder"("createdById", "createdAt");
CREATE INDEX "MediaAsset_folderId_createdAt_idx" ON "MediaAsset"("folderId", "createdAt");

ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
