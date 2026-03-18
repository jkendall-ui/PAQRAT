import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { M3SegmentedButton } from '../components/m3/M3SegmentedButton';
import { M3LinearProgress } from '../components/m3/M3LinearProgress';
import { M3Snackbar } from '../components/m3/M3Snackbar';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';

interface MediaItem { id: string; url: string; altText: string; attribution: string; type: string; timing?: string; }
interface OptionItem { id: string; label: string; }
interface Question { id: string; stem: string; type: string; options: OptionItem[]; media: MediaItem[]; }
interface SessionData { id: string; mode: string; questions: Question[]; totalQuestions: number; }
interface EcgFindingItem { category: string; findings: string[]; }
interface RelatedLink { title: string; url: string; }
interface AttemptResult {
  id: string; isCorrect: boolean; correctOptionId: string; explanation: string;
  distractorExplanations?: Record<string, string>; aiFeedback?: string; answerSummary?: string;
  interpretationText?: string; ecgFindings?: EcgFindingItem[]; relatedLinks?: RelatedLink[];
  studentResponse?: string; expectedAnswer?: string;
}
type ConfidenceLevel = '1' | '2' | '3';

function MediaTimingBadge({ timing }: { timing: string }) {
  const labels: Record<string, string> = { initial: 'Initial', post_treatment: 'Post-Treatment', serial: 'Serial', comparison: 'Comparison' };
  return <span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs">{labels[timing] ?? timing}</span>;
}

function MediaViewer({ media }: { media: MediaItem[] }) {
  const [expandedMedia, setExpandedMedia] = useState<MediaItem | null>(null);
  if (media.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-3" data-testid="media-viewer">
        {media.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <button type="button" className="rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-zoom-in"
              onClick={() => setExpandedMedia(m)} aria-label={`Expand ${m.altText || 'media'}`}>
              <img src={m.url} alt={m.altText} className="w-full max-h-64 object-contain bg-gray-50 rounded-lg" loading="lazy" />
            </button>
            <div className="flex items-center gap-2">
              {m.timing && <MediaTimingBadge timing={m.timing} />}
              {m.attribution && <p className="text-xs text-gray-400 italic">{m.attribution}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox modal */}
      {expandedMedia && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setExpandedMedia(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setExpandedMedia(null); }}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded media view"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpandedMedia(null)}
              className="absolute top-2 left-2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
            <img
              src={expandedMedia.url}
              alt={expandedMedia.altText}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2 bg-black/40 rounded-b-lg">
              {expandedMedia.timing && <MediaTimingBadge timing={expandedMedia.timing} />}
              {expandedMedia.attribution && <p className="text-xs text-white/80 italic">{expandedMedia.attribution}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const confidenceOptions = [
  { value: '1' as const, label: 'Low' },
  { value: '2' as const, label: 'Medium' },
  { value: '3' as const, label: 'High' },
];

function ConfidenceRating({ value, onChange }: { value: ConfidenceLevel | null; onChange: (v: ConfidenceLevel) => void }) {
  return (
    <div className="flex flex-col gap-1" data-testid="confidence-rating">
      <label className="text-sm font-medium text-gray-600">Confidence</label>
      <M3SegmentedButton options={confidenceOptions} value={value ?? ''} onChange={(v) => onChange(v as ConfidenceLevel)} />
    </div>
  );
}

function EcgFindingsDisplay({ findings }: { findings: EcgFindingItem[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="ecg-findings">
      <p className="text-sm font-medium text-gray-600">ECG Findings</p>
      {findings.map((group) => (
        <div key={group.category} className="flex flex-col gap-0.5">
          <span className="text-sm text-gray-900 font-medium">{group.category}</span>
          <ul className="list-disc list-inside ml-2">
            {group.findings.map((finding, i) => (<li key={i} className="text-xs text-gray-600">{finding}</li>))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AnswerFeedback({ result, question }: { result: AttemptResult; question: Question }) {
  return (
    <div className="flex flex-col gap-3" data-testid="answer-feedback">
      <M3Card variant="filled" className={result.isCorrect ? 'bg-green-50' : 'bg-red-50'}>
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{result.isCorrect ? '✓' : '✗'}</span>
          <span className="text-sm font-medium text-gray-900">{result.isCorrect ? 'Correct!' : 'Incorrect'}</span>
        </div>
      </M3Card>
      <div className="text-sm text-gray-900">{result.explanation}</div>
      {result.distractorExplanations && question.options.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-600">Option Explanations</p>
          {question.options.map((opt) => {
            const isCorrectOption = opt.id === result.correctOptionId;
            return (
              <div key={opt.id} className="flex flex-col gap-0.5">
                <span className={`text-sm ${isCorrectOption ? 'text-blue-600' : 'text-gray-900'}`}>
                  {isCorrectOption ? '✓' : '✗'} {opt.label}
                </span>
                {result.distractorExplanations?.[opt.id] && (
                  <span className="text-xs text-gray-600 ml-5">{result.distractorExplanations[opt.id]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {result.aiFeedback && <div className="text-sm text-gray-600">{result.aiFeedback}</div>}
      {result.ecgFindings && result.ecgFindings.length > 0 && <EcgFindingsDisplay findings={result.ecgFindings} />}
      {result.answerSummary && (
        <div data-testid="answer-summary">
          <p className="text-sm font-medium text-gray-600">Answer Summary</p>
          <p className="text-sm text-gray-900">{result.answerSummary}</p>
        </div>
      )}
      {result.interpretationText && (
        <div data-testid="interpretation-text">
          <p className="text-sm font-medium text-gray-600">Interpretation</p>
          <p className="text-sm text-gray-900">{result.interpretationText}</p>
        </div>
      )}
      {result.relatedLinks && result.relatedLinks.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="related-links">
          <p className="text-sm font-medium text-gray-600">Related Links</p>
          {result.relatedLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">{link.title}</a>
          ))}
        </div>
      )}
      {(result.studentResponse || result.expectedAnswer) && (
        <div className="flex flex-col gap-2" data-testid="response-comparison">
          {result.studentResponse && (<div><p className="text-sm font-medium text-gray-600">Your Answer</p><p className="text-sm text-gray-900">{result.studentResponse}</p></div>)}
          {result.expectedAnswer && (<div><p className="text-sm font-medium text-gray-600">Expected Answer</p><p className="text-sm text-gray-900">{result.expectedAnswer}</p></div>)}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, selectedOptionId, onSelectOption, freeTextValue, onFreeTextChange, answerFormat, disabled }: {
  question: Question; selectedOptionId: string | null; onSelectOption: (id: string) => void;
  freeTextValue: string; onFreeTextChange: (v: string) => void; answerFormat: string; disabled: boolean;
}) {
  return (
    <M3Card variant="elevated" data-testid="question-card">
      <div className="flex flex-col gap-4">
        <p className="text-base font-medium text-gray-900" data-testid="question-stem">{question.stem}</p>
        {question.media.length > 0 && <MediaViewer media={question.media} />}
        {answerFormat === 'multiple_choice' && question.options.length > 0 && (
          <fieldset className="flex flex-col gap-2" data-testid="answer-options">
            <legend className="sr-only">Answer options</legend>
            {question.options.map((opt) => (
              <label key={opt.id} className={`flex items-center gap-3 rounded px-3 py-2 cursor-pointer transition-colors
                ${selectedOptionId === opt.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}
                ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
                <input type="radio" name={`q-${question.id}`} value={opt.id} checked={selectedOptionId === opt.id}
                  onChange={() => onSelectOption(opt.id)} disabled={disabled} className="accent-blue-600 w-5 h-5" />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        {answerFormat === 'free_text' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`answer-${question.id}`} className="text-sm font-medium text-gray-600">
              Your interpretation
            </label>
            <textarea
              id={`answer-${question.id}`}
              value={freeTextValue}
              onChange={(e) => onFreeTextChange(e.target.value)}
              disabled={disabled}
              rows={5}
              placeholder="Describe your findings and interpretation…"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 resize-y"
              data-testid="free-text-input"
            />
          </div>
        )}
        {answerFormat === 'audio' && (
          <M3Button variant="outlined" disabled={disabled} data-testid="record-button" icon={<span>🎤</span>}>Record Answer</M3Button>
        )}
      </div>
    </M3Card>
  );
}

const ECG_STEPS = [
  { key: 'rate', label: 'Rate', prompt: 'What is the heart rate?', placeholder: 'e.g. 84 bpm, ~80 bpm' },
  { key: 'rhythm', label: 'Rhythm', prompt: 'What is the rhythm?', placeholder: 'e.g. Normal sinus rhythm, Atrial fibrillation' },
  { key: 'axis', label: 'Axis', prompt: 'What is the QRS axis?', placeholder: 'e.g. Normal axis, Left axis deviation, ~60°' },
  { key: 'p_waves', label: 'P Waves', prompt: 'Describe the P waves', placeholder: 'e.g. Upright in II, absent, flutter waves' },
  { key: 'pr_interval', label: 'PR Interval', prompt: 'What is the PR interval?', placeholder: 'e.g. 200ms, 0.20s, prolonged' },
  { key: 'qrs_complex', label: 'QRS Complex', prompt: 'Describe the QRS complex', placeholder: 'e.g. Narrow, wide at 140ms, RBBB pattern' },
  { key: 'qt_interval', label: 'QT Interval', prompt: 'What is the QT/QTc interval?', placeholder: 'e.g. 420ms, QTc 460ms, prolonged' },
  { key: 'st_segment', label: 'ST Segment', prompt: 'Describe the ST segment', placeholder: 'e.g. ST elevation in II, III, aVF' },
  { key: 't_waves', label: 'T Waves', prompt: 'Describe the T waves', placeholder: 'e.g. Inverted in V1-V4, peaked, normal' },
  { key: 'overall_impression', label: 'Overall Impression', prompt: 'What is your overall impression / diagnosis?', placeholder: 'e.g. Inferior STEMI with RV involvement' },
];

interface StepEvaluation {
  stepKey: string;
  judgment: 'correct' | 'acceptable' | 'partially_correct' | 'incorrect';
  feedback: string;
  referenceValue: string;
}

interface EcgInterpretationResult {
  id: string;
  isCorrect: boolean;
  overallScore: number;
  overallFeedback: string;
  stepEvaluations: StepEvaluation[];
  ecgFindings?: EcgFindingItem[];
  relatedLinks?: RelatedLink[];
}

const judgmentColors: Record<string, string> = {
  correct: 'bg-green-50 border-green-200 text-green-800',
  acceptable: 'bg-blue-50 border-blue-200 text-blue-800',
  partially_correct: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  incorrect: 'bg-red-50 border-red-200 text-red-800',
};

const judgmentLabels: Record<string, string> = {
  correct: '✓ Correct',
  acceptable: '≈ Acceptable',
  partially_correct: '◐ Partially Correct',
  incorrect: '✗ Incorrect',
};

function EcgInterpretationSession({ session, token }: { session: SessionData; token: string | null }) {
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EcgInterpretationResult | null>(null);
  const [resultReviewed, setResultReviewed] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const [expandedMedia, setExpandedMedia] = useState<MediaItem | null>(null);

  const question = session.questions[currentQuestionIndex];
  const totalQuestions = session.totalQuestions;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const step = ECG_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === ECG_STEPS.length - 1;
  const allStepsAnswered = ECG_STEPS.every((s) => (answers[s.key] ?? '').trim().length > 0);

  const handleStepAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [step.key]: value }));
  };

  const handleNextStep = () => {
    if (!isLastStep) setCurrentStepIndex((i) => i + 1);
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) setCurrentStepIndex((i) => i - 1);
  };

  const handleSubmitInterpretation = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/attempts/ecg-interpretation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sessionId: session.id, questionId: question.id, answers }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      const data: EcgInterpretationResult = await res.json();
      setResult(data);
      setSnackbar({ open: true, message: `Score: ${data.overallScore}%` });
    } catch {
      setSnackbar({ open: true, message: 'Failed to submit interpretation' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    if (isLastQuestion) {
      navigate(`/study/session/${session.id}/review`);
    } else {
      setCurrentQuestionIndex((i) => i + 1);
      setCurrentStepIndex(0);
      setAnswers({});
      setResult(null);
      setResultReviewed(false);
    }
  };

  const handleAutoFill = () => {
    const samples: Record<string, string[]> = {
      rate: ['72 bpm', '88 bpm', '~60 bpm', '100 bpm', '55 bpm'],
      rhythm: ['Normal sinus rhythm', 'Atrial fibrillation', 'Sinus bradycardia', 'Sinus tachycardia'],
      axis: ['Normal axis', 'Left axis deviation', '~60°', 'Right axis deviation', '-30°'],
      p_waves: ['Upright in II', 'Absent', 'Flutter waves', 'Biphasic in V1', 'Normal morphology'],
      pr_interval: ['160ms', '200ms', '0.18s', 'Prolonged at 220ms', '140ms'],
      qrs_complex: ['Narrow, normal', 'Wide at 140ms, RBBB', 'Normal duration 90ms', 'LBBB pattern', 'Narrow QRS'],
      qt_interval: ['400ms', 'QTc 440ms', '0.42s', 'Prolonged QTc 500ms', 'Normal QTc 420ms'],
      st_segment: ['No ST changes', 'ST elevation in II, III, aVF', 'ST depression V1-V3', 'Isoelectric', 'Diffuse ST elevation'],
      t_waves: ['Normal', 'Inverted in V1-V4', 'Peaked in V2-V5', 'Flattened in lateral leads', 'Biphasic in V3'],
      overall_impression: ['Normal ECG', 'Inferior STEMI', 'Atrial fibrillation with RVR', 'First degree AV block', 'Left ventricular hypertrophy'],
    };
    const filled: Record<string, string> = {};
    ECG_STEPS.forEach((s) => {
      const opts = samples[s.key] ?? ['test answer'];
      filled[s.key] = opts[Math.floor(Math.random() * opts.length)];
    });
    setAnswers(filled);
    setCurrentStepIndex(ECG_STEPS.length - 1); // jump to last step so submit is visible
  };

  if (!question) return <div className="p-4 text-center text-red-600">No questions available</div>;

  const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto pb-24" data-testid="ecg-interpretation-session">
      {/* Progress */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>ECG {currentQuestionIndex + 1} of {totalQuestions}</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <M3LinearProgress value={progressPercent} />
      </div>

      {/* Question stem */}
      <p className="text-base font-medium text-gray-900">{question.stem}</p>

      {/* ECG images — always visible */}
      {question.media.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="ecg-media">
          {question.media.map((m) => (
            <div key={m.id} className="flex flex-col gap-1">
              <button type="button" className="rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-zoom-in"
                onClick={() => setExpandedMedia(m)} aria-label={`Expand ${m.altText || 'ECG'}`}>
                <img src={m.url} alt={m.altText} className="w-full max-h-72 object-contain bg-gray-50 rounded-lg" loading="lazy" />
              </button>
              {m.attribution && <p className="text-xs text-gray-400 italic">{m.attribution}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {expandedMedia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setExpandedMedia(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setExpandedMedia(null); }}
          role="dialog" aria-modal="true" aria-label="Expanded ECG view" tabIndex={-1}
          ref={(el) => el?.focus()}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setExpandedMedia(null)}
              className="absolute top-2 left-2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              aria-label="Close">✕</button>
            <img src={expandedMedia.url} alt={expandedMedia.altText} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

      {!result ? (
        <>
          {/* Dev auto-fill button */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-gray-300 font-mono select-all">{question.id}</span>
            <button type="button" onClick={handleAutoFill}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
              data-testid="auto-fill-btn">
              🎲 Auto-fill (dev)
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex flex-wrap gap-1.5" data-testid="step-indicators">
            {ECG_STEPS.map((s, i) => {
              const answered = (answers[s.key] ?? '').trim().length > 0;
              const isCurrent = i === currentStepIndex;
              return (
                <button key={s.key} type="button" onClick={() => setCurrentStepIndex(i)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                    ${isCurrent ? 'bg-blue-600 text-white' : answered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                  aria-label={`Step ${i + 1}: ${s.label}${answered ? ' (answered)' : ''}`}>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Current step input */}
          <M3Card variant="elevated" data-testid="ecg-step-card">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">Step {currentStepIndex + 1}/10</span>
                <span className="text-sm font-semibold text-gray-900">{step.label}</span>
              </div>
              <p className="text-sm text-gray-700">{step.prompt}</p>
              <textarea
                value={answers[step.key] ?? ''}
                onChange={(e) => handleStepAnswer(e.target.value)}
                placeholder={step.placeholder}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                data-testid="ecg-step-input"
              />
              <div className="flex justify-between">
                <M3Button variant="outlined" onClick={handlePrevStep} disabled={currentStepIndex === 0} data-testid="prev-step-btn">
                  Previous
                </M3Button>
                {!isLastStep ? (
                  <M3Button variant="filled" onClick={handleNextStep}
                    disabled={!(answers[step.key] ?? '').trim()} data-testid="next-step-btn">
                    Next Step
                  </M3Button>
                ) : (
                  <M3Button variant="filled" onClick={handleSubmitInterpretation}
                    disabled={!allStepsAnswered || submitting} data-testid="submit-interpretation-btn">
                    {submitting ? 'Evaluating…' : 'Submit Interpretation'}
                  </M3Button>
                )}
              </div>
            </div>
          </M3Card>
        </>
      ) : (
        /* Results view */
        <div className="flex flex-col gap-4" data-testid="ecg-results">
          {/* Overall score */}
          <M3Card variant="filled" className={result.overallScore >= 60 ? 'bg-green-50' : 'bg-red-50'}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-900">Score: {result.overallScore}%</span>
              <span className={`text-sm font-medium ${result.overallScore >= 60 ? 'text-green-700' : 'text-red-700'}`}>
                {result.overallScore >= 80 ? 'Excellent' : result.overallScore >= 60 ? 'Passing' : 'Needs Review'}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-2">{result.overallFeedback}</p>
          </M3Card>

          {/* Per-step evaluations */}
          <div className="flex flex-col gap-2">
            {result.stepEvaluations.map((ev) => {
              const stepDef = ECG_STEPS.find((s) => s.key === ev.stepKey);
              return (
                <div key={ev.stepKey} className={`rounded-lg border p-3 ${judgmentColors[ev.judgment] ?? 'bg-gray-50 border-gray-200'}`}
                  data-testid={`eval-${ev.stepKey}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{stepDef?.label ?? ev.stepKey}</span>
                    <span className="text-xs font-medium">{judgmentLabels[ev.judgment] ?? ev.judgment}</span>
                  </div>
                  <p className="text-xs text-gray-700">{ev.feedback}</p>
                  {ev.referenceValue && (
                    <p className="text-xs text-gray-500 mt-1">Reference: {ev.referenceValue}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">Your answer: {answers[ev.stepKey] ?? '—'}</p>
                </div>
              );
            })}
          </div>

          {/* ECG findings & links */}
          {result.ecgFindings && result.ecgFindings.length > 0 && <EcgFindingsDisplay findings={result.ecgFindings} />}
          {result.relatedLinks && result.relatedLinks.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-gray-600">Related Links</p>
              {result.relatedLinks.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">{link.title}</a>
              ))}
            </div>
          )}

          {!resultReviewed ? (
            <M3Button variant="filled" onClick={() => setResultReviewed(true)} data-testid="review-confirm-btn">
              I've Reviewed My Results
            </M3Button>
          ) : (
            <M3Button variant="filled" onClick={handleNextQuestion} data-testid="next-ecg-btn">
              {isLastQuestion ? 'Finish Session' : 'Next ECG'}
            </M3Button>
          )}
        </div>
      )}

      <M3Snackbar open={snackbar.open} message={snackbar.message} onClose={() => setSnackbar({ open: false, message: '' })} />
    </div>
  );
}

export function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [freeTextValue, setFreeTextValue] = useState('');
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const questionStartRef = useRef(Date.now());

  const currentQuestion = session?.questions[currentIndex] ?? null;
  const totalQuestions = session?.totalQuestions ?? 0;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  // If the question has no multiple-choice options (e.g. case-based ECG), use free_text
  const hasOptions = (currentQuestion?.options?.length ?? 0) > 0;
  const answerFormat = session?.mode === 'audio' ? 'audio'
    : (!hasOptions || currentQuestion?.type === 'case_based') ? 'free_text'
    : 'multiple_choice';

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => { if (!res.ok) throw new Error('Failed to load session'); return res.json(); })
      .then((data: SessionData) => { setSession(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [sessionId, token]);

  useEffect(() => {
    setSelectedOptionId(null); setFreeTextValue(''); setConfidence(null); setAttemptResult(null);
    questionStartRef.current = Date.now();
  }, [currentIndex]);

  const showSnackbar = useCallback((message: string) => { setSnackbar({ open: true, message }); }, []);

  const handleToggleFlag = useCallback(() => {
    if (!currentQuestion) return;
    setFlagged((prev) => { const next = new Set(prev); if (next.has(currentQuestion.id)) next.delete(currentQuestion.id); else next.add(currentQuestion.id); return next; });
  }, [currentQuestion]);

  const handleToggleBookmark = useCallback(() => {
    if (!currentQuestion) return;
    const isBookmarked = bookmarked.has(currentQuestion.id);
    if (!isBookmarked) {
      fetch('/api/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ questionId: currentQuestion.id }) }).catch(() => {});
    }
    setBookmarked((prev) => { const next = new Set(prev); if (isBookmarked) next.delete(currentQuestion.id); else next.add(currentQuestion.id); return next; });
    showSnackbar(isBookmarked ? 'Bookmark removed' : 'Bookmark saved');
  }, [currentQuestion, bookmarked, token, showSnackbar]);

  const handleSubmit = useCallback(async () => {
    if (!currentQuestion || !session) return;
    setSubmitting(true);
    const duration = Date.now() - questionStartRef.current;
    const body: Record<string, unknown> = { questionId: currentQuestion.id, sessionId: session.id, answerFormat, duration };
    if (answerFormat === 'multiple_choice' && selectedOptionId) body.selectedOptionId = selectedOptionId;
    if (answerFormat === 'free_text') body.rawResponseText = freeTextValue;
    if (confidence) body.confidenceRating = Number(confidence);
    try {
      const res = await fetch('/api/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed to submit answer');
      const result: AttemptResult = await res.json();
      setAttemptResult(result); showSnackbar('Answer submitted');
    } catch { showSnackbar('Failed to submit answer'); }
    finally { setSubmitting(false); }
  }, [currentQuestion, session, answerFormat, selectedOptionId, freeTextValue, confidence, token, showSnackbar]);

  const handleNext = useCallback(() => {
    if (isLastQuestion) navigate(`/study/session/${sessionId}/review`);
    else setCurrentIndex((i) => i + 1);
  }, [isLastQuestion, navigate, sessionId]);

  const canSubmit = !attemptResult && !submitting &&
    ((answerFormat === 'multiple_choice' && !!selectedOptionId) || (answerFormat === 'free_text' && freeTextValue.trim().length > 0) || answerFormat === 'audio');

  if (loading) return (<div className="flex items-center justify-center min-h-[60vh]" data-testid="session-loading"><M3CircularProgress indeterminate size={48} /></div>);
  if (error || !session) return (<div className="p-4 text-center text-red-600" data-testid="session-error">{error ?? 'Session not found'}</div>);

  // ECG Interpretation mode gets its own UI
  const isEcgMode = session.mode === 'ecg_interpretation' || searchParams.get('mode') === 'ecg_interpretation';
  if (isEcgMode) return <EcgInterpretationSession session={session} token={token} />;

  if (!currentQuestion) return (<div className="p-4 text-center text-red-600" data-testid="session-error">No questions found</div>);

  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto pb-24" data-testid="session-page">
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Question {currentIndex + 1} of {totalQuestions}</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <M3LinearProgress value={progressPercent} data-testid="session-progress" />
      </div>
      <div className="flex justify-end gap-1">
        <M3Button variant="icon" onClick={handleToggleFlag} aria-label={flagged.has(currentQuestion.id) ? 'Unflag question' : 'Flag for review'} data-testid="flag-button">
          {flagged.has(currentQuestion.id) ? '🚩' : '⚑'}
        </M3Button>
        <M3Button variant="icon" onClick={handleToggleBookmark} aria-label={bookmarked.has(currentQuestion.id) ? 'Remove bookmark' : 'Bookmark question'} data-testid="bookmark-button">
          {bookmarked.has(currentQuestion.id) ? '★' : '☆'}
        </M3Button>
      </div>
      <QuestionCard question={currentQuestion} selectedOptionId={selectedOptionId} onSelectOption={setSelectedOptionId}
        freeTextValue={freeTextValue} onFreeTextChange={setFreeTextValue} answerFormat={answerFormat} disabled={!!attemptResult} />
      {!attemptResult && <ConfidenceRating value={confidence} onChange={setConfidence} />}
      {!attemptResult ? (
        <M3Button variant="filled" onClick={handleSubmit} disabled={!canSubmit} data-testid="submit-button">
          {submitting ? 'Submitting…' : 'Submit Answer'}
        </M3Button>
      ) : (
        <>
          <AnswerFeedback result={attemptResult} question={currentQuestion} />
          <M3Button variant="filled" onClick={handleNext} data-testid="next-button">
            {isLastQuestion ? 'Finish Session' : 'Next Question'}
          </M3Button>
        </>
      )}
      <M3Snackbar open={snackbar.open} message={snackbar.message} onClose={() => setSnackbar({ open: false, message: '' })} />
    </div>
  );
}
