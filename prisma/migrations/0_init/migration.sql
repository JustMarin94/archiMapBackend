-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";



-- CreateTable
CREATE TABLE "author_awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_group_members" (
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "role" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_group_members_pkey" PRIMARY KEY ("group_id","author_id")
);

-- CreateTable
CREATE TABLE "author_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(255) NOT NULL,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "education" TEXT,
    "description" TEXT,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "alt_text" TEXT,
    "position" INTEGER DEFAULT 0,
    "author_id" UUID,
    "work_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "group_id" UUID,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_authors" (
    "work_id" UUID NOT NULL,
    "author_id" UUID,
    "role" VARCHAR(100),
    "group_id" UUID,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "work_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "typology" VARCHAR(100),
    "city" VARCHAR(100),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "region" VARCHAR(100),
    "awards" TEXT,
    "year_start" INTEGER,
    "year_end" INTEGER,
    "postal_code" VARCHAR(20),
    "investor" TEXT,
    "protection_status" TEXT,
    "address" TEXT,
    "status" TEXT,
    "intervention_type" TEXT,
    "legacy_category" VARCHAR(50),

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_author_groups_name" ON "author_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_author" ON "work_authors"("work_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_group" ON "work_authors"("work_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- AddForeignKey
ALTER TABLE "author_awards" ADD CONSTRAINT "author_awards_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "author_group_members" ADD CONSTRAINT "fk_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "author_group_members" ADD CONSTRAINT "fk_group" FOREIGN KEY ("group_id") REFERENCES "author_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "author_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_authors" ADD CONSTRAINT "work_authors_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_authors" ADD CONSTRAINT "work_authors_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "author_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_authors" ADD CONSTRAINT "work_authors_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
