# Claude AI Integration Guide — ECG Quiz App for PA Students

## Architecture Overview

Claude serves five roles in the app, each mapped to a specific API pattern:

1. **Answer Evaluator** — scores free-text student interpretations against the structured rubric
2. **Adaptive Tutor** — generates personalized follow-up questions based on what the student missed
3. **ECG Vision Analyzer** — reads the actual ECG image to validate findings and catch things the rubric may not cover
4. **Question Generator** — creates new quiz questions from the LITFL content bank
5. **Progress Coach** — synthesizes performance data into study recommendations

---

## 1. Answer Evaluator

This is the core interaction loop. The student sees an ECG image, reads the clinical vignette, and types their interpretation. Claude scores it against the structured `ecg_findings` from the database.

### API Pattern: Tool Use for Structured Scoring

Use Claude's tool use (function calling) to force structured output. Define a `score_answer` tool that Claude must call with its evaluation.

```json
{
  "model": "claude-sonnet-4-6",
  "system": "You are an ECG interpretation examiner for Physician Assistant board prep. You evaluate student answers against a scoring rubric of expected ECG findings. Be encouraging but rigorous. Never invent findings that aren't in the rubric or visible on the ECG.",
  "tools": [
    {
      "name": "score_answer",
      "description": "Score the student's ECG interpretation against the expected findings rubric.",
      "input_schema": {
        "type": "object",
        "properties": {
          "findings_identified": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "expected_finding": { "type": "string" },
                "student_identified": { "type": "boolean" },
                "student_wording": { "type": "string", "description": "What the student actually wrote that matches this finding, or null if missed." },
                "partial_credit": { "type": "boolean", "description": "True if student got the concept but used imprecise language." }
              },
              "required": ["expected_finding", "student_identified"]
            }
          },
          "extra_findings": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Valid findings the student identified that were NOT in the rubric. Give credit for these."
          },
          "incorrect_findings": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "student_claim": { "type": "string" },
                "correction": { "type": "string" }
              }
            }
          },
          "score": {
            "type": "object",
            "properties": {
              "findings_hit": { "type": "integer" },
              "findings_total": { "type": "integer" },
              "percentage": { "type": "number" },
              "grade": { "type": "string", "enum": ["excellent", "good", "needs_improvement", "review_required"] }
            }
          },
          "feedback_summary": {
            "type": "string",
            "description": "2-3 sentence personalized feedback. Acknowledge what they got right first, then address gaps."
          },
          "missed_critical": {
            "type": "boolean",
            "description": "True if the student missed a finding that would change clinical management (e.g., missed STEMI, missed hyperkalemia)."
          }
        },
        "required": ["findings_identified", "score", "feedback_summary", "missed_critical"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "RUBRIC (expected findings):\n{paste the ecg_findings array from your JSON database}\n\nCLINICAL CONTEXT:\n{paste clinical_context}\n\nQUESTION:\n{paste question_stem}\n\nSTUDENT ANSWER:\n{paste student's free-text response}\n\nScore this answer against the rubric. Call the score_answer tool."
        }
      ]
    }
  ]
}
```

### Why This Pattern Works

- **Tool use forces structured output** — you always get a parseable JSON score, never free-form text that's hard to process.
- **`extra_findings` rewards students who go beyond the rubric** — a student might notice a subtle finding that LITFL didn't list. Claude can validate it.
- **`missed_critical` is a safety flag** — your app can surface these prominently ("You missed a STEMI — in practice, this delay could be fatal").
- **Sonnet is the right model here** — fast, cheap, and accurate enough for rubric comparison. Save Opus for the harder tasks.

### Cost Optimization: Prompt Caching

Your system prompt and tool definition are identical across every scoring request. Use prompt caching to avoid re-processing them:

```json
{
  "system": [
    {
      "type": "text",
      "text": "You are an ECG interpretation examiner...",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}
```

This cuts input token costs by ~90% on the cached portion after the first request in a session.

---

## 2. Adaptive Tutor — Follow-Up Question Generation

When a student misses key findings, Claude generates a targeted follow-up question that specifically addresses the gap. This is where the learning happens.

### API Pattern: Chained Calls with Conversation Context

After the scoring call returns, make a second call with the score results to generate a follow-up:

```json
{
  "model": "claude-sonnet-4-6",
  "system": "You are a PA board prep tutor specializing in ECG interpretation. You generate targeted follow-up questions that address specific gaps in a student's knowledge. Questions should be clinically grounded and reference the ECG the student just reviewed. Use the Socratic method — guide them to the answer, don't just tell them.",
  "messages": [
    {
      "role": "user",
      "content": "The student just reviewed this ECG case:\n\nCLINICAL CONTEXT: {context}\nEXPECTED FINDINGS: {rubric}\n\nThey scored {percentage}%. Here's what they missed:\n{list of missed findings}\n\nHere's what they got wrong:\n{list of incorrect findings with corrections}\n\nGenerate a follow-up question that:\n1. Targets their weakest area from this attempt\n2. References the same ECG they just looked at\n3. Is answerable by looking more carefully at specific leads\n4. Includes a hint that nudges without giving the answer away"
    }
  ],
  "tools": [
    {
      "name": "generate_followup",
      "description": "Generate a targeted follow-up question for the student.",
      "input_schema": {
        "type": "object",
        "properties": {
          "followup_question": { "type": "string" },
          "target_skill": { "type": "string", "description": "The specific ECG skill this question targets." },
          "hint": { "type": "string" },
          "leads_to_focus": { "type": "array", "items": { "type": "string" } },
          "expected_answer": { "type": "string", "description": "What a correct response would include." }
        },
        "required": ["followup_question", "target_skill", "hint", "expected_answer"]
      }
    }
  ]
}
```


### Example Flow

1. Student sees inferior STEMI ECG, writes "ST elevation in II, III, aVF"
2. Scoring identifies they missed: RV involvement (STE in III > II, STE in V1-2)
3. Follow-up generated: "Good catch on the inferior ST elevation. Now look more carefully at V1 and V2 — and compare the height of ST elevation in lead II versus lead III. What additional diagnosis should you consider, and why does this change your management of nitrates?"

---

## 3. ECG Vision Analyzer

This is Claude's superpower for this app. Claude can look at the actual ECG image and identify findings — meaning you can validate the database rubric AND catch student answers that are correct but not in the rubric.

### API Pattern: Vision + Tool Use

```json
{
  "model": "claude-sonnet-4-6",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "url",
            "url": "https://litfl.com/wp-content/uploads/2018/09/TOP-100-ECQ-QUIZ-LITFL-001.jpg"
          }
        },
        {
          "type": "text",
          "text": "Analyze this 12-lead ECG. Identify all abnormal findings. For each finding, specify which leads show it."
        }
      ]
    }
  ],
  "tools": [
    {
      "name": "ecg_analysis",
      "description": "Structured ECG analysis from image.",
      "input_schema": {
        "type": "object",
        "properties": {
          "rate": { "type": "object", "properties": { "value": { "type": "integer" }, "classification": { "type": "string" } } },
          "rhythm": { "type": "string" },
          "axis": { "type": "string" },
          "intervals": {
            "type": "object",
            "properties": {
              "pr": { "type": "string" },
              "qrs": { "type": "string" },
              "qt_qtc": { "type": "string" }
            }
          },
          "findings": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "finding": { "type": "string" },
                "leads": { "type": "array", "items": { "type": "string" } },
                "severity": { "type": "string", "enum": ["normal_variant", "abnormal", "critical"] }
              }
            }
          },
          "interpretation": { "type": "string" }
        }
      }
    }
  ]
}
```

### When to Use Vision

- **Rubric enrichment at build time** — run vision analysis on every ECG image in your database to generate or verify the `alt_text` and `ecg_findings` fields.
- **Runtime validation** — when a student claims something not in the rubric, send the image + student claim to Claude to check if it's actually visible on the ECG.
- **"Explain this ECG" mode** — let students upload any ECG and get an interactive teaching session.

### Important Caveats

- Claude's ECG interpretation is good but not perfect. It's reliable for major findings (STEMI, BBB, AF, hyperkalaemia) but can miss subtle findings on low-resolution images. **Always treat the LITFL rubric as the source of truth** and use vision as a supplement.
- Image quality matters. The LITFL images are generally high quality 12-lead scans. Low-res phone photos of ECG screens will degrade accuracy.
- For high-stakes scoring, consider using Opus for vision analysis and Sonnet for rubric comparison.

---

## 4. Question Generator — Scaling Beyond LITFL's 150 Cases

You can use Claude to generate new quiz questions from the LITFL content, transforming their open-ended "describe and interpret" format into multiple-choice or targeted questions.

### API Pattern: Batch Generation with Structured Output

```json
{
  "model": "claude-opus-4-6",
  "system": "You are a medical education content creator specializing in ECG interpretation for PA board preparation. Generate high-quality multiple-choice questions from the provided ECG case data. Every question must be answerable by examining the ECG image — no trick questions. Distractors must be plausible but clearly distinguishable from the correct answer by a competent student.",
  "messages": [
    {
      "role": "user",
      "content": "Given this ECG case data, generate 5 multiple-choice questions at varying difficulty levels.\n\nCASE DATA:\n{paste the full case JSON object from your database}\n\nRequirements:\n- 2 beginner questions (identify the obvious primary finding)\n- 2 intermediate questions (differentiate from similar conditions)\n- 1 advanced question (subtle finding or management implication)\n- Each question needs 4 choices, a correct answer, and explanations for every distractor\n- Tag each question with the appropriate question_format from the schema"
    }
  ],
  "tools": [
    {
      "name": "create_questions",
      "description": "Generate quiz questions from case data.",
      "input_schema": {
        "type": "object",
        "properties": {
          "questions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "question_stem": { "type": "string" },
                "question_format": { "type": "string" },
                "difficulty": { "type": "string", "enum": ["beginner", "intermediate", "advanced"] },
                "choices": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "key": { "type": "string" },
                      "text": { "type": "string" },
                      "is_correct": { "type": "boolean" },
                      "explanation": { "type": "string" }
                    }
                  }
                },
                "related_media_ids": { "type": "array", "items": { "type": "string" } },
                "clinical_pearl": { "type": "string" }
              }
            }
          }
        }
      }
    }
  ]
}
```

### Use Opus for Generation, Sonnet for Delivery

- **Opus** is better for creating questions because it reasons more carefully about medical accuracy and distractor plausibility. Run this as a batch job.
- **Sonnet** handles the real-time scoring and follow-up in production. It's 5-10x cheaper and fast enough for interactive use.

---

## 5. Progress Coach — Study Recommendations

Aggregate a student's scoring history and have Claude synthesize it into actionable study guidance.

```json
{
  "model": "claude-sonnet-4-6",
  "system": "You are a PA board prep study coach. Analyze a student's ECG quiz performance data and provide specific, actionable study recommendations. Reference LITFL library pages for further reading. Be motivating but honest about weak areas.",
  "messages": [
    {
      "role": "user",
      "content": "Student performance summary (last 30 days):\n\n{JSON array of scores by topic, difficulty, and clinical_urgency}\n\nTotal questions attempted: {n}\nOverall accuracy: {pct}%\n\nWorst topics:\n{list}\n\nMissed critical findings:\n{list}\n\nGenerate study recommendations."
    }
  ]
}
```

---

## Model Selection Matrix

| Use Case | Model | Why | Est. Cost/Call |
|---|---|---|---|
| Answer scoring | Sonnet 4.6 | Fast, cheap, structured output | ~$0.01-0.03 |
| Follow-up generation | Sonnet 4.6 | Conversational, fast turnaround | ~$0.01-0.02 |
| ECG image analysis | Sonnet 4.6 (standard) / Opus 4.6 (complex) | Vision accuracy | ~$0.02-0.10 |
| Question generation (batch) | Opus 4.6 | Medical accuracy, better distractors | ~$0.10-0.30 |
| Progress coaching | Sonnet 4.6 | Summarization task | ~$0.01-0.03 |
| Rubric enrichment (build time) | Opus 4.6 | One-time, accuracy matters | ~$0.10-0.30 |

---

## Cost Optimization Strategies

### 1. Prompt Caching (Biggest Win)

Your system prompts, tool definitions, and the ECG scoring rubric are repeated across every request. Cache them:

```python
# Python SDK example
response = client.messages.create(
    model="claude-sonnet-4-6",
    system=[{
        "type": "text",
        "text": SYSTEM_PROMPT,       # ~500 tokens, identical every call
        "cache_control": {"type": "ephemeral"}
    }],
    tools=SCORING_TOOLS,                  # identical every call
    messages=[...]                        # dynamic per-student
)
```

Cached tokens cost 90% less on reads. For a quiz app with thousands of scoring requests per day, this is significant.

### 2. Haiku for Triage

Before sending a student answer to Sonnet for full scoring, use Haiku to check if the answer is blank, off-topic, or too short to score. This avoids wasting Sonnet calls on garbage input.

### 3. Pre-compute Vision Analysis

Don't analyze ECG images at runtime for every student. Run Opus vision analysis once per image at build time, store the structured findings in your database, and use those for scoring. Only invoke runtime vision when a student claims a finding not in the rubric.

### 4. Batch API for Question Generation

Use Claude's Batch API for generating new questions from the LITFL database. It's 50% cheaper than real-time API calls and you don't need instant responses for content generation.

---

## App Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    STUDENT APP                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ ECG Image│  │ Clinical  │  │  Answer Input     │  │
│  │ Display  │  │ Vignette  │  │  (free text)      │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
└───────┼──────────────┼─────────────────┼──────────────┘
        │              │                 │
        ▼              ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                  APP BACKEND                         │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │           Quiz Session Manager              │     │
│  │  • Loads case from DB (JSON schema v2)      │     │
│  │  • Tracks attempt history                   │     │
│  │  • Manages question sequencing              │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐     │
│  │         Claude Integration Layer            │     │
│  │                                             │     │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │     │
│  │  │ Answer  │ │ Adaptive │ │  Progress   │  │     │
│  │  │ Scorer  │ │ Tutor    │ │  Coach      │  │     │
│  │  │(Sonnet) │ │(Sonnet)  │ │ (Sonnet)    │  │     │
│  │  └────┬────┘ └─────┬────┘ └──────┬──────┘  │     │
│  │       │            │             │          │     │
│  │  ┌────▼────────────▼─────────────▼──────┐   │     │
│  │  │      Anthropic API Client            │   │     │
│  │  │  • Prompt caching enabled            │   │     │
│  │  │  • Tool use for structured output    │   │     │
│  │  │  • Vision for image analysis         │   │     │
│  │  └──────────────────────────────────────┘   │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │              Database                       │     │
│  │  • Cases (JSON schema v2)                   │     │
│  │  • Student scores & history                 │     │
│  │  • Generated questions cache                │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │         Batch Jobs (Offline)                │     │
│  │  • Question generation (Opus, Batch API)    │     │
│  │  • ECG vision pre-analysis (Opus)           │     │
│  │  • Rubric enrichment                        │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1 — Core Quiz Loop (MVP)

1. Load case from database, display ECG + vignette
2. Accept free-text answer
3. Score with Claude Sonnet + tool use
4. Show structured feedback

### Phase 2 — Adaptive Learning

4. Add follow-up question generation for missed findings
5. Track scores by topic/difficulty
6. Build progress dashboard

### Phase 3 — Content Expansion

7. Batch-generate MCQ questions from LITFL cases using Opus
8. Pre-compute vision analysis for all ECG images
9. Add "Upload Your Own ECG" freeform mode

### Phase 4 — Intelligence

10. Progress coach with study recommendations
11. Spaced repetition scheduling (resurface weak topics)
12. Simulated PANCE exam mode with timed sections
