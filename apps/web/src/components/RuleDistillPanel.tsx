// Memory-settings surface for the rule lifecycle (THREAD 1 + THREAD 2).
//
//  - Distill rules from notes (THREAD 1): the user pastes the annotation /
//    comment / highlight notes they left on a delivered artifact (one per
//    line) and the daemon distils them into candidate rule proposals via
//    `POST /api/memory/rules/suggest`. The proposals render through the SAME
//    rule-proposal card the agent emits inline, so Keep routes through the
//    existing `POST /api/memory` (`type:'rule'`) write path — nothing is
//    saved until the user confirms.
//  - Self-verify enforcement (THREAD 2): a live list of recent enforcement
//    outcomes (`pass` / `fail` / `missing`) the daemon recorded for artifact
//    turns with active rules, fed by the `verify` SSE channel on
//    `/api/memory/events`. This is the visible proof that verify is enforced,
//    not honour-system.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MemoryVerifyRecord,
  MemoryVerificationsResponse,
  RuleProposalDraft,
  SuggestRulesFromAnnotationsResponse,
} from '@open-design/contracts';
import { Button } from '@open-design/components';
import { OdCardView } from './OdCard';
import { useT } from '../i18n';

function draftToCard(draft: RuleProposalDraft) {
  return {
    kind: 'rule-proposal' as const,
    name: draft.name,
    ...(draft.description ? { description: draft.description } : {}),
    assertion: draft.assertion,
    check: draft.check,
    ...(draft.rationale ? { rationale: draft.rationale } : {}),
  };
}

export function RuleDistillPanel() {
  const t = useT();
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SuggestRulesFromAnnotationsResponse | null>(null);
  const [verifications, setVerifications] = useState<MemoryVerifyRecord[]>([]);

  const reloadVerifications = useCallback(async () => {
    try {
      const resp = await fetch('/api/memory/verifications');
      if (!resp.ok) return;
      const json = (await resp.json()) as MemoryVerificationsResponse;
      setVerifications(json.verifications ?? []);
    } catch {
      // Best-effort; the SSE stream keeps the list fresh after the first load.
    }
  }, []);

  useEffect(() => {
    void reloadVerifications();
  }, [reloadVerifications]);

  // Live enforcement outcomes over the shared memory SSE channel. New ids are
  // unshifted; the synthetic `cleared`/`deleted` records prune the list.
  useEffect(() => {
    const es = new EventSource('/api/memory/events');
    es.addEventListener('verify', (raw) => {
      try {
        // The daemon multiplexes real records and synthetic `cleared`/`deleted`
        // prune events on the same channel, so widen `status` before narrowing.
        const ev = JSON.parse((raw as MessageEvent).data) as
          | MemoryVerifyRecord
          | { id: string; status: 'cleared' | 'deleted'; at: number };
        if (!ev || !ev.id) return;
        if (ev.status === 'cleared') {
          setVerifications([]);
          return;
        }
        if (ev.status === 'deleted') {
          setVerifications((prev) => prev.filter((r) => r.id !== ev.id));
          return;
        }
        const record = ev as MemoryVerifyRecord;
        setVerifications((prev) =>
          [record, ...prev.filter((r) => r.id !== record.id)].slice(0, 20),
        );
      } catch {
        // Malformed — ignore.
      }
    });
    return () => es.close();
  }, []);

  const distill = useCallback(async () => {
    const annotations = notes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((note) => ({ note }));
    if (annotations.length === 0) return;
    setRunning(true);
    try {
      const resp = await fetch('/api/memory/rules/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations }),
      });
      if (!resp.ok) {
        setResult({ proposals: [], attemptedLLM: false, source: 'heuristic' });
        return;
      }
      setResult((await resp.json()) as SuggestRulesFromAnnotationsResponse);
    } catch {
      setResult({ proposals: [], attemptedLLM: false, source: 'heuristic' });
    } finally {
      setRunning(false);
    }
  }, [notes]);

  const clearVerifications = useCallback(async () => {
    try {
      await fetch('/api/memory/verifications', { method: 'DELETE' });
      setVerifications([]);
    } catch {
      // Ignore; the row stays until the next reload.
    }
  }, []);

  const proposals = useMemo(() => result?.proposals ?? [], [result]);

  return (
    <div className="memory-distill-panel">
      <section className="memory-distill-section">
        <h4 className="memory-distill-heading">{t('settings.memoryDistillTitle')}</h4>
        <p className="memory-distill-hint">{t('settings.memoryDistillHint')}</p>
        <textarea
          className="memory-distill-input"
          rows={4}
          value={notes}
          placeholder={t('settings.memoryDistillPlaceholder')}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="memory-distill-actions">
          <Button
            variant="primary"
            disabled={running || notes.trim().length === 0}
            onClick={() => void distill()}
          >
            {running ? t('settings.memoryDistillRunning') : t('settings.memoryDistillRun')}
          </Button>
        </div>
        {result ? (
          proposals.length === 0 ? (
            <p className="memory-distill-empty">{t('settings.memoryDistillEmpty')}</p>
          ) : (
            <div className="memory-distill-proposals">
              {proposals.map((draft, i) => (
                <OdCardView key={`${draft.name}-${i}`} card={draftToCard(draft)} />
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="memory-verify-section">
        <div className="memory-verify-head">
          <div>
            <h4 className="memory-distill-heading">{t('settings.memoryVerifyTitle')}</h4>
            <p className="memory-distill-hint">{t('settings.memoryVerifyHint')}</p>
          </div>
          {verifications.length > 0 ? (
            <Button variant="ghost" onClick={() => void clearVerifications()}>
              {t('settings.memoryVerifyClear')}
            </Button>
          ) : null}
        </div>
        {verifications.length === 0 ? (
          <p className="memory-distill-empty">{t('settings.memoryVerifyEmpty')}</p>
        ) : (
          <ul className="memory-verify-list">
            {verifications.map((v) => (
              <li key={v.id} className={`memory-verify-row memory-verify-row--${v.status}`}>
                <span className="memory-verify-status">{v.status}</span>
                <span className="memory-verify-meta">
                  {v.rulesCovered}/{v.rulesActive} rules
                  {v.rowsFailed > 0 ? ` · ${v.rowsFailed} failed` : ''}
                </span>
                {v.uncoveredRules.length > 0 ? (
                  <span className="memory-verify-uncovered">
                    {v.uncoveredRules.join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
