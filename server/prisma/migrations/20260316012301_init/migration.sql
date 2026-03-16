-- CreateEnum
CREATE TYPE "Role" AS ENUM ('student', 'admin');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "TargetExam" AS ENUM ('PANCE', 'PANRE');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('adaptive', 'exam_simulation', 'weak_spot_sprint');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single_best_answer', 'case_based');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'audio', 'video_embed', 'pdf', 'ecg_12lead', 'ecg_rhythm_strip', 'ecg_right_sided', 'ecg_posterior', 'ecg_single_lead', 'algorithm_diagram', 'clinical_image', 'video');

-- CreateEnum
CREATE TYPE "MediaTiming" AS ENUM ('initial', 'post_treatment', 'serial', 'comparison');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('top_150_ecg', 'ecg_exigency', 'clinical_case', 'ecg_library');

-- CreateEnum
CREATE TYPE "PrimaryTopic" AS ENUM ('normal_ecg', 'sinus_rhythms', 'atrial_arrhythmias', 'junctional_rhythms', 'ventricular_arrhythmias', 'heart_blocks', 'bundle_branch_blocks', 'fascicular_blocks', 'pre_excitation', 'acute_coronary_syndromes', 'stemi_equivalents', 'st_segment_changes', 't_wave_abnormalities', 'axis_deviation', 'chamber_enlargement', 'electrolyte_disturbances', 'drug_effects', 'pericardial_disease', 'cardiomyopathy', 'pacemaker_ecg', 'pediatric_ecg', 'pulmonary_embolism', 'intervals_and_segments', 'ecg_artifacts', 'diagnostic_algorithms');

-- CreateEnum
CREATE TYPE "LitflCategory" AS ENUM ('ECG', 'Cardiology', 'ICE', 'Toxicology', 'Metabolic', 'Resus', 'Pulmonary', 'Neurology', 'Other');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "BoardRelevance" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "ClinicalUrgency" AS ENUM ('emergent', 'urgent', 'routine');

-- CreateEnum
CREATE TYPE "QuestionFormat" AS ENUM ('describe_and_interpret', 'what_is_diagnosis', 'identify_features', 'clinical_decision', 'differential_diagnosis', 'algorithm_application', 'compare_ecgs');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'student',
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "target_exam" "TargetExam",
    "exam_date" TIMESTAMP(3),
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nccpa_task_area" TEXT NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "nccpa_task_area" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_vector" tsvector,
    "sub_case_id" TEXT,
    "sequence" INTEGER,
    "question_format" "QuestionFormat",
    "answer_summary" TEXT,
    "interpretation_text" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_media" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "caption" TEXT,
    "media_ref_id" TEXT,
    "local_filename" TEXT,
    "timing" "MediaTiming",
    "sub_case_id" TEXT,

    CONSTRAINT "question_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ai_plan" JSONB,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "selected_option_id" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "confidence_rating" INTEGER,
    "answer_format" TEXT,
    "raw_response_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_scores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "elo_score" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "decay_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "last_reviewed_at" TIMESTAMP(3),

    CONSTRAINT "topic_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT[],
    "last_updated" TIMESTAMP(3),
    "keywords" TEXT[],
    "clinical_context" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_cases" (
    "id" TEXT NOT NULL,
    "sub_case_id" TEXT NOT NULL,
    "case_db_id" TEXT NOT NULL,
    "sub_case_label" TEXT,
    "sub_case_context" TEXT,

    CONSTRAINT "sub_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecg_findings" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "findings" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ecg_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_links" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "answer_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_media_refs" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,

    CONSTRAINT "question_media_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_pearls" (
    "id" TEXT NOT NULL,
    "case_db_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "clinical_pearls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_references" (
    "id" TEXT NOT NULL,
    "case_db_id" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "url" TEXT,

    CONSTRAINT "case_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_tags" (
    "id" TEXT NOT NULL,
    "case_db_id" TEXT NOT NULL,
    "primary_topic" "PrimaryTopic" NOT NULL,
    "secondary_topics" TEXT[],
    "litfl_category" "LitflCategory" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "board_relevance" "BoardRelevance" NOT NULL,
    "clinical_urgency" "ClinicalUrgency",

    CONSTRAINT "case_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "questions_category_id_difficulty_is_active_idx" ON "questions"("category_id", "difficulty", "is_active");

-- CreateIndex
CREATE INDEX "questions_sub_case_id_sequence_idx" ON "questions"("sub_case_id", "sequence");

-- CreateIndex
CREATE INDEX "attempts_user_id_created_at_idx" ON "attempts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "attempts_user_id_question_id_idx" ON "attempts"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_scores_user_id_category_id_key" ON "topic_scores"("user_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_question_id_key" ON "bookmarks"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_id_key" ON "cases"("case_id");

-- CreateIndex
CREATE INDEX "cases_source_type_idx" ON "cases"("source_type");

-- CreateIndex
CREATE UNIQUE INDEX "sub_cases_sub_case_id_key" ON "sub_cases"("sub_case_id");

-- CreateIndex
CREATE INDEX "sub_cases_case_db_id_idx" ON "sub_cases"("case_db_id");

-- CreateIndex
CREATE INDEX "ecg_findings_question_id_idx" ON "ecg_findings"("question_id");

-- CreateIndex
CREATE INDEX "answer_links_question_id_idx" ON "answer_links"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_media_refs_question_id_media_id_key" ON "question_media_refs"("question_id", "media_id");

-- CreateIndex
CREATE INDEX "clinical_pearls_case_db_id_idx" ON "clinical_pearls"("case_db_id");

-- CreateIndex
CREATE INDEX "case_references_case_db_id_idx" ON "case_references"("case_db_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_tags_case_db_id_key" ON "case_tags"("case_db_id");

-- CreateIndex
CREATE INDEX "case_tags_primary_topic_idx" ON "case_tags"("primary_topic");

-- CreateIndex
CREATE INDEX "case_tags_difficulty_board_relevance_idx" ON "case_tags"("difficulty", "board_relevance");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_scores" ADD CONSTRAINT "topic_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_scores" ADD CONSTRAINT "topic_scores_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cases" ADD CONSTRAINT "sub_cases_case_db_id_fkey" FOREIGN KEY ("case_db_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecg_findings" ADD CONSTRAINT "ecg_findings_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_links" ADD CONSTRAINT "answer_links_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media_refs" ADD CONSTRAINT "question_media_refs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media_refs" ADD CONSTRAINT "question_media_refs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "question_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_pearls" ADD CONSTRAINT "clinical_pearls_case_db_id_fkey" FOREIGN KEY ("case_db_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_references" ADD CONSTRAINT "case_references_case_db_id_fkey" FOREIGN KEY ("case_db_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tags" ADD CONSTRAINT "case_tags_case_db_id_fkey" FOREIGN KEY ("case_db_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
