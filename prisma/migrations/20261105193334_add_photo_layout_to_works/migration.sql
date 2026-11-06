-- CreateEnum
CREATE TYPE "PhotoLayout" AS ENUM ('GRID', 'MASONRY', 'FEATURED', 'CAROUSEL', 'MOSAIC', 'LIST');

-- AlterTable
ALTER TABLE "works" ADD COLUMN     "photo_layout" "PhotoLayout" NOT NULL DEFAULT 'GRID';
