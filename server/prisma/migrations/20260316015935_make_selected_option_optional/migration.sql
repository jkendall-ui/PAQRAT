-- DropForeignKey
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_selected_option_id_fkey";

-- AlterTable
ALTER TABLE "attempts" ALTER COLUMN "selected_option_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
