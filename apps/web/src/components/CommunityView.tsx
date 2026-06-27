import { Icon } from './Icon';
import type { CSSProperties } from 'react';

type TemplateDemo = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  accent: string;
  meta: string;
};

const COMMUNITY_TEMPLATES: TemplateDemo[] = [
  {
    id: 'electric-studio',
    title: 'Electric Studio',
    description: 'A crisp agency deck starter with hero slide, capabilities, and brand-forward layout.',
    tags: ['Slide', 'Pitch deck', 'Brand'],
    accent: '#4164f4',
    meta: '7 slides · HTML',
  },
  {
    id: 'launch-landing',
    title: 'Product Launch Landing',
    description: 'A polished launch page template with hero, feature proof, pricing, and FAQ sections.',
    tags: ['Website', 'Landing page'],
    accent: '#d46342',
    meta: '1 page · Responsive',
  },
  {
    id: 'founder-memo',
    title: 'Founder Memo',
    description: 'A narrative investor memo layout for market, product, traction, and ask.',
    tags: ['Document', 'Narrative'],
    accent: '#111827',
    meta: 'Long form · Editorial',
  },
  {
    id: 'growth-dashboard',
    title: 'Growth Dashboard',
    description: 'A compact metrics dashboard for acquisition, activation, usage, and revenue reviews.',
    tags: ['Dashboard', 'Analytics'],
    accent: '#0f9f6e',
    meta: 'Dashboard · KPI',
  },
];

interface CommunityViewProps {
  onRemixTemplate?: (templateId: string) => void;
}

export function CommunityView({ onRemixTemplate }: CommunityViewProps) {
  return (
    <section className="community-template-view" aria-labelledby="community-template-title">
      <header className="community-template-view__hero">
        <div>
          <h1 id="community-template-title" className="entry-section__title">Community</h1>
          <p>
            Discover remixable templates. Remix opens a real project immediately — no plugin install,
            no chat setup, just files ready to edit.
          </p>
        </div>
        <div className="community-template-view__summary" aria-label="Community scope">
          <span>Templates only</span>
          <small>Remix → Project</small>
        </div>
      </header>

      <div className="community-template-view__search" role="search">
        <Icon name="search" size={16} />
        <input type="search" placeholder="Search templates" aria-label="Search templates" readOnly />
      </div>

      <div className="community-template-view__section-head">
        <h2>Featured templates</h2>
        <span>{COMMUNITY_TEMPLATES.length} remixable starters</span>
      </div>

      <div className="community-template-grid">
        {COMMUNITY_TEMPLATES.map((template) => (
          <article key={template.id} className="community-template-card">
            <div
              className="community-template-card__preview"
              style={{ '--template-accent': template.accent } as CSSProperties}
              aria-hidden
            >
              <div className="community-template-card__preview-paper">
                <span />
                <strong>{template.title.split(' ')[0]}</strong>
                <em />
              </div>
            </div>
            <div className="community-template-card__body">
              <div>
                <h3>{template.title}</h3>
                <p>{template.description}</p>
              </div>
              <div className="community-template-card__tags">
                {template.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="community-template-card__foot">
                <span>{template.meta}</span>
                <button type="button" onClick={() => onRemixTemplate?.(template.id)}>
                  Remix
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
