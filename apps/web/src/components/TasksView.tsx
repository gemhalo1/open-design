// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectorDetail, Routine, RoutineSchedule } from '@open-design/contracts';

import { Icon, type IconName } from './Icon';
import { navigate } from '../router';
import type { SkillSummary } from '../types';
import {
  NewAutomationModal,
  describeScheduleSummary,
  type AutomationTemplate,
  type AutomationTemplateKind,
} from './NewAutomationModal';

type ProjectSummary = { id: string; name: string };
type TemplateFilter =
  | 'all'
  | AutomationTemplateKind
  | 'memory'
  | 'design-system'
  | 'release'
  | 'quality';

type Modal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

interface Props {
  projects?: ProjectSummary[];
  skills?: SkillSummary[];
  designTemplates?: SkillSummary[];
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
}

const STATIC_TEMPLATES: ReadonlyArray<AutomationTemplate> = [
  {
    id: 'memory-refresh',
    category: 'memory',
    kind: 'routine',
    icon: 'sparkles',
    title: 'Refresh project memory from recent work.',
    description: 'Turns repeated decisions, preferences, and feedback into reusable memory updates.',
    defaultName: 'Memory refresh',
    prompt:
      'Review recent chats, PR comments, design feedback, and project changes. Extract durable preferences, repeated decisions, and workflow lessons. Propose concise memory updates with source links and separate one-off notes from reusable guidance.',
  },
  {
    id: 'design-system-refresh',
    category: 'design-system',
    kind: 'routine',
    icon: 'sliders',
    title: 'Update design systems from shipped artifacts.',
    description: 'Finds reusable tokens, components, and rules across recent design work.',
    defaultName: 'Design system maintainer',
    prompt:
      'Inspect recent generated artifacts, review feedback, and accepted revisions. Identify patterns that should become design-system tokens, component rules, examples, or anti-patterns. Draft precise updates to DESIGN.md and call out anything that needs human approval.',
  },
  {
    id: 'live-artifact-registry',
    category: 'live-artifact',
    kind: 'routine',
    icon: 'file-code',
    title: 'Audit live artifacts and refresh stale versions.',
    description: 'Keeps persistent dashboards, reports, and previews current instead of duplicating them.',
    defaultName: 'Live artifact maintainer',
    prompt:
      'List live artifacts for this project, find stale or failed refreshes, and update the highest-value artifact in place. Preserve artifact ids, summarize what changed, and flag artifacts that need connector access or human review.',
  },
  {
    id: 'orbit-dashboard',
    category: 'orbit',
    kind: 'routine',
    icon: 'orbit',
    title: 'Build a connector activity dashboard.',
    description: 'Aggregates selected connectors into an Orbit-style live dashboard.',
    defaultName: 'Connector activity dashboard',
    prompt:
      'Use the selected connectors to build or refresh a live dashboard of recent activity. Group by people, projects, decisions, risks, and follow-ups. Prefer connected read-only tools, cite sources, and keep the dashboard refreshable.',
  },
  {
    id: 'release-notes',
    category: 'release',
    kind: 'routine',
    icon: 'present',
    title: 'Draft release notes from shipped design work.',
    description: 'Connects merged PRs, artifacts, and product-facing changes into release notes.',
    defaultName: 'Weekly release notes',
    prompt:
      "Draft user-facing release notes covering merged PRs, updated artifacts, and design-system changes from the last 7 days. Group by 'New', 'Improved', and 'Fixed'. Include links when available and keep the copy user-readable.",
  },
  {
    id: 'quality-regression-watch',
    category: 'quality',
    kind: 'routine',
    icon: 'bell',
    title: 'Watch for design and implementation regressions.',
    description: 'Compares recent changes against benchmarks, traces, and accepted references.',
    defaultName: 'Regression watch',
    prompt:
      'Compare recent project changes against accepted artifacts, design-system rules, benchmarks, and traces. Flag regressions in behavior, layout, accessibility, or product intent. Suggest the smallest fix and cite the evidence.',
  },
];

const FALLBACK_ORBIT_TEMPLATE: AutomationTemplate = {
  id: 'orbit-daily',
  category: 'orbit',
  kind: 'orbit',
  icon: 'orbit',
  title: 'Daily connector digest.',
  description: 'Refreshes a connector activity digest on a schedule.',
  defaultName: 'Daily connector digest',
  prompt:
    'Survey every connected integration and produce a daily digest of what changed in the last 24 hours. Group the result by people, projects, decisions, and follow-ups. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
};

const FALLBACK_LIVE_TEMPLATE: AutomationTemplate = {
  id: 'live-status-board',
  category: 'live-artifact',
  kind: 'live-artifact',
  icon: 'file-code',
  title: 'Keep a live status artifact fresh.',
  description: 'Updates one persistent artifact instead of creating a new report each run.',
  defaultName: 'Live status board',
  prompt:
    "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', and 'Decisions made'. Edit in place so the artifact stays stable.",
};

const TEMPLATE_FILTERS: ReadonlyArray<{ id: TemplateFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'live-artifact', label: 'Live artifacts' },
  { id: 'memory', label: 'Memory' },
  { id: 'design-system', label: 'Design systems' },
  { id: 'release', label: 'Release' },
  { id: 'quality', label: 'Quality' },
];

function scheduleStatusLabel(routine: Routine): string {
  if (!routine.enabled) return 'Paused';
  return describeScheduleSummary(routine.schedule);
}

function nextRunLabel(routine: Routine): string {
  if (!routine.enabled) return 'Manual only';
  if (!routine.nextRunAt) return 'Scheduled';
  const date = new Date(routine.nextRunAt);
  return `Next ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function describeScheduleForCard(schedule: RoutineSchedule): string {
  return describeScheduleSummary(schedule);
}

function templateFromSkill(skill: SkillSummary, kind: AutomationTemplateKind): AutomationTemplate {
  const category = kind === 'orbit' ? 'orbit' : 'live-artifact';
  return {
    id: `skill-${skill.id}`,
    category,
    kind,
    icon: kind === 'orbit' ? 'orbit' : 'file-code',
    title: skill.name,
    description: skill.description || skill.id,
    defaultName: skill.name,
    prompt: skill.examplePrompt || skill.description || `Run ${skill.name}.`,
    skillId: skill.id,
  };
}

function buildAutomationTemplates(designTemplates: SkillSummary[]): AutomationTemplate[] {
  const orbit = designTemplates
    .filter((skill) => skill.scenario === 'orbit')
    .map((skill) => templateFromSkill(skill, 'orbit'));
  const live = designTemplates
    .filter((skill) => skill.scenario === 'live')
    .map((skill) => templateFromSkill(skill, 'live-artifact'));

  return [
    ...(orbit.length > 0 ? orbit : [FALLBACK_ORBIT_TEMPLATE]),
    ...(live.length > 0 ? live : [FALLBACK_LIVE_TEMPLATE]),
    ...STATIC_TEMPLATES,
  ];
}

function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

function kindLabel(kind: AutomationTemplateKind): string {
  if (kind === 'orbit') return 'Orbit';
  if (kind === 'live-artifact') return 'Live artifact';
  return 'Automation';
}

function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

export function TasksView({ skills = [], designTemplates = [], connectors = [] }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');

  const templates = useMemo(
    () => buildAutomationTemplates(designTemplates),
    [designTemplates],
  );
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, templateFilter),
    [templates, templateFilter],
  );

  const refresh = useCallback(async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const activeCount = routines.filter((routine) => routine.enabled).length;
  const pausedCount = routines.length - activeCount;

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `run failed: ${res.status}`);
      }
      const j = await res.json().catch(() => null);
      if (j?.projectId) {
        navigate({
          kind: 'project',
          projectId: j.projectId,
          conversationId: j.conversationId ?? null,
          fileName: null,
        });
        return;
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const togglePaused = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `update failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this automation? Past runs and their projects are kept.'))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <header className="automations-hero">
        <div className="automations-hero__copy">
          <span className="automations-hero__eyebrow">Scheduled agent sessions</span>
          <h1 id="automations-title" className="automations-hero__title">
            Automations
          </h1>
          <p className="automations-hero__lede">
            Plan recurring conversations for project work, Orbit digests, and live artifacts.
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics" aria-label="Automation summary">
            <Metric label="Active" value={activeCount} />
            <Metric label="Paused" value={pausedCount} />
            <Metric label="Templates" value={templates.length} />
          </div>
          <button
            type="button"
            className="automations-view__new"
            onClick={() => setModal({ kind: 'create' })}
            data-testid="automations-new"
          >
            <Icon name="plus" size={14} />
            <span>New automation</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="automations-saved" aria-label="Your automations">
        <div className="automations-section-head">
          <h2 className="automations-section__label">Your automations</h2>
          {loading ? <span className="automations-section__meta">Loading</span> : null}
        </div>
        {!loading && routines.length === 0 ? (
          <button
            type="button"
            className="automation-empty"
            onClick={() => setModal({ kind: 'create' })}
          >
            <span className="automation-empty__icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="automation-empty__body">
              <strong>No automations yet</strong>
              <span>Create one from a template or start with a blank schedule.</span>
            </span>
          </button>
        ) : null}
        {routines.length > 0 ? (
          <ul className="automations-saved__list">
            {routines.map((r) => {
              const isBusy = busyId === r.id;
              const targetLabel =
                r.target.mode === 'reuse'
                  ? projectsById.get(r.target.projectId) ?? r.target.projectId
                  : 'New project each run';
              return (
                <li
                  key={r.id}
                  className={`automation-row${r.enabled ? '' : ' is-paused'}`}
                >
                  <button
                    type="button"
                    className="automation-row__main"
                    onClick={() => setModal({ kind: 'edit', routine: r })}
                  >
                    <span className="automation-row__icon">
                      <Icon name={r.skillId ? 'sparkles' : 'history'} size={15} />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{r.name}</span>
                      <span className="automation-row__meta">
                        <span>{scheduleStatusLabel(r)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{targetLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{nextRunLabel(r)}</span>
                      </span>
                      {r.prompt ? (
                        <span className="automation-row__prompt">{r.prompt}</span>
                      ) : null}
                    </span>
                  </button>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                      title="Run now and open the conversation"
                    >
                      <Icon name="play" size={12} />
                      <span>Run</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => togglePaused(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      aria-label="Delete automation"
                      title="Delete this automation"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="automations-templates" aria-label="Automation templates">
        <div className="automations-section-head">
          <div>
            <h2 className="automations-section__label">Templates</h2>
            <p className="automations-section__sub">
              Orbit and live artifacts are templates inside the same automation flow.
            </p>
          </div>
          <div className="automations-template-tabs" role="tablist" aria-label="Template filters">
            {TEMPLATE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={templateFilter === filter.id}
                className={`automations-template-tab${templateFilter === filter.id ? ' is-active' : ''}`}
                onClick={() => setTemplateFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="automations-templates__grid">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`automation-template-card is-${template.kind}`}
              onClick={() => setModal({ kind: 'create', template })}
            >
              <span className="automation-template-card__icon" aria-hidden="true">
                <Icon name={template.icon} size={16} />
              </span>
              <span className="automation-template-card__body">
                <span className="automation-template-card__kicker">
                  <Icon name={kindIcon(template.kind)} size={11} />
                  {kindLabel(template.kind)}
                </span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">
                  Use template
                  <Icon name="chevron-right" size={12} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <NewAutomationModal
        open={modal !== null}
        initial={
          modal?.kind === 'edit'
            ? { routine: modal.routine }
            : modal?.kind === 'create' && modal.template
              ? { template: modal.template }
              : null
        }
        templates={templates}
        projects={projects}
        skills={skills}
        connectors={connectors}
        onClose={() => setModal(null)}
        onSaved={() => {
          void refresh();
        }}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="automations-metric">
      <span className="automations-metric__value">{value}</span>
      <span className="automations-metric__label">{label}</span>
    </div>
  );
}
