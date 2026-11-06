/*
  Warnings:

  - The values [MASONRY,FEATURED,CAROUSEL] on the enum `PhotoLayout` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PhotoLayout_new" AS ENUM ('GRID', 'MOSAIC', 'LIST');
ALTER TABLE "public"."works" ALTER COLUMN "photo_layout" DROP DEFAULT;
ALTER TABLE "works" ALTER COLUMN "photo_layout" TYPE "PhotoLayout_new" USING ("photo_layout"::text::"PhotoLayout_new");
ALTER TYPE "PhotoLayout" RENAME TO "PhotoLayout_old";
ALTER TYPE "PhotoLayout_new" RENAME TO "PhotoLayout";
DROP TYPE "public"."PhotoLayout_old";
ALTER TABLE "works" ALTER COLUMN "photo_layout" SET DEFAULT 'GRID';
COMMIT;
