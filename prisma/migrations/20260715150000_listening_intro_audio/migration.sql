-- AlterTable
ALTER TABLE "Test" ADD COLUMN "listeningIntroAudioId" TEXT;

-- CreateIndex
CREATE INDEX "Test_listeningIntroAudioId_idx" ON "Test"("listeningIntroAudioId");

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_listeningIntroAudioId_fkey" FOREIGN KEY ("listeningIntroAudioId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
