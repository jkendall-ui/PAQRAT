import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { litflImportSchema, getCasesQuerySchema } from '../../../src/schemas';

// Load the actual sample data file
const sampleDataPath = resolve(__dirname, '../../../../ECG-Quiz_Sample-Data_v2.json');
const sampleData = JSON.parse(readFileSync(sampleDataPath, 'utf-8'));

describe('litflImportSchema', () => {
  it('validates the ECG-Quiz_Sample-Data_v2.json sample data', () => {
    const result = litflImportSchema.safeParse(sampleData);
    expect(result.success).toBe(true);
  });

  it('parses all 3 cases from sample data', () => {
    const result = litflImportSchema.parse(sampleData);
    expect(result.cases).toHaveLength(3);
  });

  it('preserves metadata fields', () => {
    const result = litflImportSchema.parse(sampleData);
    expect(result.metadata.version).toBe('2.0.0');
    expect(result.metadata.total_cases).toBe(3);
    expect(result.metadata.total_questions).toBe(7);
  });

  it('preserves case structure', () => {
    const result = litflImportSchema.parse(sampleData);
    const firstCase = result.cases[0];
    expect(firstCase.case_id).toBe('LITFL-ECG-0001');
    expect(firstCase.source_type).toBe('top_150_ecg');
    expect(firstCase.sub_cases).toHaveLength(1);
    expect(firstCase.clinical_pearls).toHaveLength(5);
  });

  it('preserves multi-sub-case structure (Pattern 3)', () => {
    const result = litflImportSchema.parse(sampleData);
    const metabolicCase = result.cases[2];
    expect(metabolicCase.case_id).toBe('LITFL-EX-0012');
    expect(metabolicCase.sub_cases).toHaveLength(2);
    expect(metabolicCase.sub_cases[0].sub_case_label).toBe('Case 1');
    expect(metabolicCase.sub_cases[1].sub_case_label).toBe('Case 2');
  });

  it('preserves ECG findings structure', () => {
    const result = litflImportSchema.parse(sampleData);
    const answer = result.cases[0].sub_cases[0].questions[0].answer;
    expect(answer.summary).toBe('Inferior STEMI with right ventricular infarction');
    expect(answer.ecg_findings).toHaveLength(3);
    expect(answer.ecg_findings[0].category).toBe('General');
    expect(answer.ecg_findings[0].findings.length).toBeGreaterThan(0);
  });

  it('preserves related_links', () => {
    const result = litflImportSchema.parse(sampleData);
    const links = result.cases[0].sub_cases[0].questions[0].answer.related_links;
    expect(links).toBeDefined();
    expect(links!.length).toBe(3);
    expect(links![0].text).toBe('inferior STEMI');
  });

  it('preserves tags', () => {
    const result = litflImportSchema.parse(sampleData);
    const tags = result.cases[0].tags;
    expect(tags.primary_topic).toBe('acute_coronary_syndromes');
    expect(tags.litfl_category).toBe('ECG');
    expect(tags.difficulty).toBe('beginner');
    expect(tags.board_relevance).toBe('high');
    expect(tags.clinical_urgency).toBe('emergent');
  });

  it('defaults clinical_pearls and references to empty arrays', () => {
    const result = litflImportSchema.parse(sampleData);
    // Case 2 (LITFL-EX-0013) has empty clinical_pearls
    expect(result.cases[1].clinical_pearls).toEqual([]);
  });

  // ─── Rejection tests ────────────────────────────────────

  it('rejects invalid case_id pattern', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].case_id = 'INVALID-001';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing metadata', () => {
    const { metadata, ...noMeta } = sampleData;
    expect(litflImportSchema.safeParse(noMeta).success).toBe(false);
  });

  it('rejects empty cases array', () => {
    const bad = { ...sampleData, cases: [] };
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty alt_text on media (Req 15.5)', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].sub_cases[0].media[0].alt_text = '';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty attribution on media (Req 16.4)', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].sub_cases[0].media[0].attribution = '';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing alt_text on media', () => {
    const bad = structuredClone(sampleData);
    delete bad.cases[0].sub_cases[0].media[0].alt_text;
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing attribution on media', () => {
    const bad = structuredClone(sampleData);
    delete bad.cases[0].sub_cases[0].media[0].attribution;
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid source_type', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].source_type = 'unknown_source';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid primary_topic in tags', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].tags.primary_topic = 'not_a_topic';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid question_format', () => {
    const bad = structuredClone(sampleData);
    bad.cases[0].sub_cases[0].questions[0].question_format = 'essay';
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing answer summary', () => {
    const bad = structuredClone(sampleData);
    delete bad.cases[0].sub_cases[0].questions[0].answer.summary;
    expect(litflImportSchema.safeParse(bad).success).toBe(false);
  });
});

describe('getCasesQuerySchema', () => {
  it('accepts empty query with defaults', () => {
    const result = getCasesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(1);
    expect(result.data?.limit).toBe(20);
  });

  it('accepts all filter params', () => {
    const result = getCasesQuerySchema.safeParse({
      source_type: 'top_150_ecg',
      primary_topic: 'acute_coronary_syndromes',
      difficulty: 'beginner',
      board_relevance: 'high',
      clinical_urgency: 'emergent',
      search: 'STEMI',
      page: '2',
      limit: '10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source_type', () => {
    expect(getCasesQuerySchema.safeParse({ source_type: 'invalid' }).success).toBe(false);
  });

  it('rejects invalid difficulty', () => {
    expect(getCasesQuerySchema.safeParse({ difficulty: 'expert' }).success).toBe(false);
  });
});
