import { useMemo, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';

type PluginCapability = 'Connector' | 'MCP' | 'Skill';
type PluginSource = 'Official' | 'Workspace' | 'Personal';
type MarketplaceMode = 'plugins' | 'skills';

type PluginDemo = {
  id: string;
  name: string;
  icon: string;
  accent: string;
  description: string;
  source: PluginSource;
  category: string;
  status: 'installed' | 'available' | 'connected';
  capabilities: PluginCapability[];
  connector?: string[];
  mcp?: string[];
  skills?: string[];
};

type SkillDemo = {
  id: string;
  name: string;
  icon: string;
  accent: string;
  description: string;
  source: PluginSource;
  category: string;
  status: 'enabled' | 'available';
};

type PluginMarketplaceDemoProps = {
  onTryPlugin?: (plugin: PluginDemo | SkillDemo) => void;
};

const PLUGIN_DEMOS: PluginDemo[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'GH',
    accent: '#111111',
    description: 'Review PRs, triage issues, inspect CI, and publish release notes.',
    source: 'Official',
    category: 'Featured',
    status: 'available',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['GitHub OAuth', 'Repository permissions', 'Organization access'],
    mcp: ['search_issues', 'read_pull_request', 'comment_on_pr', 'inspect_checks'],
    skills: ['PR review', 'CI fixer', 'Release notes'],
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: 'Fi',
    accent: '#7c3aed',
    description: 'Read design files and sync visual context into Open Design projects.',
    source: 'Official',
    category: 'Featured',
    status: 'connected',
    capabilities: ['Connector', 'MCP'],
    connector: ['Figma OAuth', 'Team file access', 'Design token scope'],
    mcp: ['read_file', 'export_frame', 'inspect_components'],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'No',
    accent: '#0f172a',
    description: 'Bring workspace docs, product notes, and databases into agent workflows.',
    source: 'Workspace',
    category: 'Productivity',
    status: 'installed',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['Workspace connection', 'Page permissions', 'Database scopes'],
    mcp: ['search_pages', 'read_page', 'query_database', 'create_page'],
    skills: ['Summarize docs', 'Turn notes into specs', 'Sync roadmap context'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    icon: 'G',
    accent: '#16a34a',
    description: 'Use Docs, Sheets, Slides, and shared folders as project context.',
    source: 'Official',
    category: 'Productivity',
    status: 'connected',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['Google OAuth', 'Drive scopes', 'Shared folder access'],
    mcp: ['search_files', 'read_doc', 'read_sheet', 'export_slide'],
    skills: ['Document brief', 'Spreadsheet analysis', 'Slide rewrite'],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'Sl',
    accent: '#e11d48',
    description: 'Summarize discussions and turn team decisions into project actions.',
    source: 'Workspace',
    category: 'Communication',
    status: 'installed',
    capabilities: ['Connector', 'MCP'],
    connector: ['Workspace OAuth', 'Channel permissions'],
    mcp: ['search_messages', 'read_thread', 'post_update'],
  },
  {
    id: 'brand-audit',
    name: 'Brand Audit',
    icon: 'BA',
    accent: '#d46a3c',
    description: 'Evaluate generated work against brand voice, layout, and craft rules.',
    source: 'Personal',
    category: 'Design',
    status: 'installed',
    capabilities: ['Skill'],
    skills: ['Brand consistency audit', 'Anti-AI polish pass', 'Design-system checklist'],
  },
];

const SKILL_DEMOS: SkillDemo[] = [
  {
    id: 'brand-audit-skill',
    name: 'Brand Audit',
    icon: 'BA',
    accent: '#d46a3c',
    description: 'Review visual output against brand voice, layout, tokens, and craft rules.',
    source: 'Official',
    category: 'Featured',
    status: 'enabled',
  },
  {
    id: 'template-creator',
    name: 'Template Creator',
    icon: 'TC',
    accent: '#0ea5e9',
    description: 'Turn a repeatable artifact pattern into a reusable template workflow.',
    source: 'Official',
    category: 'Featured',
    status: 'available',
  },
  {
    id: 'prd-to-prototype',
    name: 'PRD to Prototype',
    icon: 'PP',
    accent: '#7c3aed',
    description: 'Convert a product requirement doc into a first-pass editable HTML project.',
    source: 'Workspace',
    category: 'Productivity',
    status: 'enabled',
  },
  {
    id: 'anti-ai-polish',
    name: 'Anti-AI Polish',
    icon: 'AI',
    accent: '#16a34a',
    description: 'Remove generic layout tells and tighten copy, spacing, and hierarchy.',
    source: 'Personal',
    category: 'Design',
    status: 'enabled',
  },
];

const SOURCE_FILTERS: Array<PluginSource | 'All'> = ['Official', 'Workspace', 'Personal'];
const ALL_CATEGORY = 'All';

function sourceLabel(source: PluginSource | 'All') {
  if (source === 'Official') return '由 Open Design 提供';
  if (source === 'Workspace') return '由你的工作空间提供';
  if (source === 'Personal') return '个人';
  return '全部';
}

function capabilityList(plugin: PluginDemo, capability: PluginCapability): string[] {
  if (capability === 'Connector') return plugin.connector ?? [];
  if (capability === 'MCP') return plugin.mcp ?? [];
  return plugin.skills ?? [];
}

function capabilityDescription(capability: PluginCapability): string {
  if (capability === 'Connector') return '账号授权、权限范围和外部数据连接。';
  if (capability === 'MCP') return '暴露给 Agent 调用的工具与上下文能力。';
  return '可复用的任务流程、审查规则和生成策略。';
}

function isPluginReady(status: PluginDemo['status'] | SkillDemo['status']) {
  return status === 'installed' || status === 'connected' || status === 'enabled';
}

function PluginLogo({ plugin }: { plugin: Pick<PluginDemo | SkillDemo, 'id' | 'name' | 'icon' | 'accent'> }) {
  const style = { '--plugin-accent': plugin.accent } as CSSProperties;

  if (plugin.id === 'github') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--github" style={style} aria-hidden>
        <Icon name="github-filled" size={22} />
      </span>
    );
  }

  if (plugin.id === 'figma') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--figma" style={style} aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'google-drive') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--drive" style={style} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'slack') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--slack" style={style} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'brand-audit' || plugin.id === 'brand-audit-skill') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--brand-audit" style={style} aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
    );
  }

  if (plugin.id === 'template-creator') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--template" style={style} aria-hidden>
        <Icon name="layout" size={18} />
      </span>
    );
  }

  if (plugin.id === 'prd-to-prototype') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--prototype" style={style} aria-hidden>
        <Icon name="file-code" size={18} />
      </span>
    );
  }

  if (plugin.id === 'anti-ai-polish') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--polish" style={style} aria-hidden>
        <Icon name="tweaks" size={18} />
      </span>
    );
  }

  if (plugin.id === 'notion') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--notion" style={style} aria-hidden>
        N
      </span>
    );
  }

  return (
    <span className="plugin-marketplace__icon" style={style} aria-hidden>
      {plugin.icon}
    </span>
  );
}

export function PluginMarketplaceDemo({ onTryPlugin }: PluginMarketplaceDemoProps = {}) {
  const [mode, setMode] = useState<MarketplaceMode>('plugins');
  const [source, setSource] = useState<PluginSource | 'All'>('Official');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'plugin' | 'skill'>('plugin');

  const pluginsForSource = useMemo(() => {
    return PLUGIN_DEMOS.filter((plugin) => source === 'All' || plugin.source === source);
  }, [source]);

  const categoryTags = useMemo(() => {
    return [ALL_CATEGORY, ...Array.from(new Set(pluginsForSource.map((plugin) => plugin.category)))];
  }, [pluginsForSource]);

  const filteredPlugins = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pluginsForSource.filter((plugin) => {
      if (categoryFilter !== ALL_CATEGORY && plugin.category !== categoryFilter) return false;
      if (!q) return true;
      return `${plugin.name} ${plugin.description} ${plugin.category}`.toLowerCase().includes(q);
    });
  }, [categoryFilter, pluginsForSource, query]);

  const installed = PLUGIN_DEMOS.filter((plugin) => plugin.status !== 'available');
  const categories = Array.from(new Set(filteredPlugins.map((plugin) => plugin.category)));
  const pluginGroups = categoryFilter === ALL_CATEGORY
    ? [{ id: 'all', label: null as string | null, plugins: filteredPlugins }]
    : categories.map((category) => ({
        id: category,
        label: category,
        plugins: filteredPlugins.filter((plugin) => plugin.category === category),
      }));

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SKILL_DEMOS.filter((skill) => {
      if (source !== 'All' && skill.source !== source) return false;
      if (categoryFilter !== ALL_CATEGORY && skill.category !== categoryFilter) return false;
      if (!q) return true;
      return `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(q);
    });
  }, [categoryFilter, query, source]);

  const skillCategories = Array.from(new Set(filteredSkills.map((skill) => skill.category)));

  return (
    <section className="plugin-marketplace" aria-labelledby="plugin-marketplace-title">
      <header className="plugin-marketplace__hero">
        <div>
          <h1 id="plugin-marketplace-title" className="entry-section__title">
            {mode === 'plugins' ? '插件' : '技能'}
          </h1>
          <p>
            {mode === 'plugins'
              ? '在常用工具中使用 Open Design。每个 Plugin 可以同时包含 Connector、MCP 和 Skill 能力。'
              : '技能是可复用的任务流程和审查规则。它可以被插件携带，也可以作为独立能力直接使用。'}
          </p>
        </div>
        <div className="plugin-marketplace__hero-actions">
          <button
            type="button"
            className="plugin-marketplace__create"
            onClick={() => {
              setCreateKind(mode === 'skills' ? 'skill' : 'plugin');
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={15} />
            新增
          </button>
          <button type="button" className="plugin-marketplace__refresh" aria-label="Refresh marketplace">
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </header>

      <div className="plugin-marketplace__toolbar">
        <div className="plugin-marketplace__switch" aria-label="Marketplace mode">
          <button
            type="button"
            className={mode === 'plugins' ? 'is-active' : ''}
            onClick={() => {
              setMode('plugins');
              setCategoryFilter(ALL_CATEGORY);
              setExpandedId(null);
            }}
          >
            插件
          </button>
          <button
            type="button"
            className={mode === 'skills' ? 'is-active' : ''}
            onClick={() => {
              setMode('skills');
              setCategoryFilter(ALL_CATEGORY);
              setExpandedId(null);
            }}
          >
            技能
          </button>
        </div>

        <label className="plugin-marketplace__search">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === 'plugins' ? 'Search plugins' : 'Search skills'}
            aria-label={mode === 'plugins' ? 'Search plugins' : 'Search skills'}
          />
        </label>
      </div>

      {mode === 'plugins' ? (
      <section className="plugin-marketplace__installed" aria-labelledby="plugins-installed-title">
        <div className="plugin-marketplace__section-title">
          <h2 id="plugins-installed-title">Installed</h2>
          <button type="button" aria-label="Plugin settings">
            <Icon name="settings" size={15} />
          </button>
        </div>
        <div className="plugin-marketplace__installed-icons">
          {installed.map((plugin) => (
            <button
              key={plugin.id}
              type="button"
              style={{ '--plugin-accent': plugin.accent } as CSSProperties}
              onClick={() => {
                setSource(plugin.source);
                setCategoryFilter(plugin.category);
                setExpandedId(null);
                setMenuId(null);
              }}
              aria-label={plugin.name}
            >
              <PluginLogo plugin={plugin} />
            </button>
          ))}
        </div>
      </section>
      ) : null}

      <div className="plugin-marketplace__filter-block">
        <div className="plugin-marketplace__filters" aria-label="Marketplace source filters">
          {SOURCE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={source === item ? 'is-active' : ''}
              onClick={() => {
                setSource(item);
                setCategoryFilter(ALL_CATEGORY);
                setExpandedId(null);
              }}
            >
              {sourceLabel(item)}
            </button>
          ))}
        </div>
        <div className="plugin-marketplace__category-tags" aria-label={`${sourceLabel(source)} categories`}>
          {categoryTags.map((category) => (
            <button
              key={category}
              type="button"
              className={categoryFilter === category ? 'is-active' : ''}
              onClick={() => {
                setCategoryFilter(category);
                setExpandedId(null);
              }}
            >
              {category === ALL_CATEGORY ? 'All' : category}
            </button>
          ))}
        </div>
      </div>

      {mode === 'plugins' ? (
      <div className="plugin-marketplace__catalog">
        {pluginGroups.map((group) => (
          <section
            key={group.id}
            className={`plugin-marketplace__category${group.label ? '' : ' plugin-marketplace__category--flat'}`}
            aria-labelledby={group.label ? `plugin-category-${group.id}` : undefined}
          >
            {group.label ? <h2 id={`plugin-category-${group.id}`}>{group.label}</h2> : null}
            <div className="plugin-marketplace__rows">
              {group.plugins
                .map((plugin) => {
                  const isExpanded = expandedId === plugin.id;
                  const isReady = isPluginReady(plugin.status);
                  return (
                    <article
                      key={plugin.id}
                      className={`plugin-marketplace__item${isExpanded ? ' is-expanded' : ''}${!isReady ? ' is-clickable' : ''}`}
                      role={!isReady ? 'button' : undefined}
                      tabIndex={!isReady ? 0 : undefined}
                      onClick={() => {
                        if (isReady) return;
                        setExpandedId(isExpanded ? null : plugin.id);
                        setMenuId(null);
                      }}
                      onKeyDown={(event) => {
                        if (isReady || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        setExpandedId(isExpanded ? null : plugin.id);
                        setMenuId(null);
                      }}
                    >
                      <div className="plugin-marketplace__row">
                        <PluginLogo plugin={plugin} />
                        <span className="plugin-marketplace__row-main">
                          <strong>{plugin.name}</strong>
                          <small>{plugin.description}</small>
                        </span>
                        <button
                          type="button"
                          className="plugin-marketplace__row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isReady) {
                              onTryPlugin?.(plugin);
                            }
                          }}
                        >
                          {isReady ? 'Try it' : '安装'}
                        </button>
                        {isReady ? (
                          <span className="plugin-marketplace__menu-wrap">
                            <button
                              type="button"
                              className="plugin-marketplace__more"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(menuId === plugin.id ? null : plugin.id);
                                setExpandedId(null);
                              }}
                              aria-expanded={menuId === plugin.id}
                              aria-label={`${plugin.name} more actions`}
                            >
                              <Icon name="more-horizontal" size={16} />
                            </button>
                            {menuId === plugin.id ? (
                              <span className="plugin-marketplace__menu" role="menu">
                                <button type="button" role="menuitem">
                                  <Icon name="trash" size={14} />
                                  卸载
                                </button>
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      {isExpanded ? (
                        <div className="plugin-marketplace__inline-detail">
                          <div className="plugin-marketplace__detail-meta">
                            <span>{plugin.source}</span>
                            <span>{plugin.status === 'connected' ? 'Ready' : plugin.status}</span>
                            {plugin.capabilities.map((capability) => (
                              <span key={capability}>{capability}</span>
                            ))}
                          </div>
                          <div className="plugin-marketplace__detail-capabilities">
                            {plugin.capabilities.map((capability) => {
                              const rows = capabilityList(plugin, capability);
                              return (
                                <section key={capability}>
                                  <h3>{capability}</h3>
                                  <p>{capabilityDescription(capability)}</p>
                                  <ul>
                                    {rows.length > 0
                                      ? rows.map((row) => <li key={row}>{row}</li>)
                                      : <li>Capability configured by this plugin.</li>}
                                  </ul>
                                </section>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
        {filteredPlugins.length === 0 ? (
          <div className="plugin-marketplace__empty">
            <Icon name="search" size={18} />
            <strong>No plugins found</strong>
            <span>Try a different keyword or source filter.</span>
          </div>
        ) : null}
      </div>
      ) : (
        <div className="plugin-marketplace__catalog">
          {skillCategories.map((category) => (
            <section key={category} className="plugin-marketplace__category" aria-labelledby={`skill-category-${category}`}>
              <h2 id={`skill-category-${category}`}>{category}</h2>
              <div className="plugin-marketplace__rows">
                {filteredSkills
                  .filter((skill) => skill.category === category)
                  .map((skill) => (
                    <article key={skill.id} className="plugin-marketplace__item plugin-marketplace__item--skill">
                      <div className="plugin-marketplace__row">
                        <PluginLogo plugin={skill} />
                        <span className="plugin-marketplace__row-main">
                          <strong>{skill.name}</strong>
                          <small>{skill.description}</small>
                        </span>
                        <button
                          type="button"
                          className="plugin-marketplace__row-action"
                          onClick={() => {
                            if (isPluginReady(skill.status)) {
                              onTryPlugin?.(skill);
                            }
                          }}
                        >
                          {isPluginReady(skill.status) ? 'Try it' : '安装'}
                        </button>
                        {isPluginReady(skill.status) ? (
                          <span className="plugin-marketplace__menu-wrap">
                            <button
                              type="button"
                              className="plugin-marketplace__more"
                              onClick={() => setMenuId(menuId === skill.id ? null : skill.id)}
                              aria-expanded={menuId === skill.id}
                              aria-label={`${skill.name} more actions`}
                            >
                              <Icon name="more-horizontal" size={16} />
                            </button>
                            {menuId === skill.id ? (
                              <span className="plugin-marketplace__menu" role="menu">
                                <button type="button" role="menuitem">
                                  <Icon name="trash" size={14} />
                                  卸载
                                </button>
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
          {filteredSkills.length === 0 ? (
            <div className="plugin-marketplace__empty">
              <Icon name="search" size={18} />
              <strong>No skills found</strong>
              <span>Try a different keyword or source filter.</span>
            </div>
          ) : null}
        </div>
      )}

      {createOpen ? (
        <div className="plugin-marketplace__modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <section
            className="plugin-marketplace__create-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="plugin-marketplace__create-head">
              <div>
                <h2 id="plugin-create-title">新增 {createKind === 'plugin' ? 'Plugin' : 'Skill'}</h2>
                <p>
                  {createKind === 'plugin'
                    ? '从 GitHub 或本地文件夹导入一个插件，上传后即可在团队内使用。'
                    : '创建一个可复用的任务流程或审查规则，之后可以被 Plugin 复用。'}
                </p>
              </div>
              <button type="button" aria-label="关闭新增面板" onClick={() => setCreateOpen(false)}>
                <Icon name="close" size={15} />
              </button>
            </header>
            <div className="plugin-marketplace__create-tabs" aria-label="Create type">
              <button
                type="button"
                className={createKind === 'plugin' ? 'is-active' : ''}
                onClick={() => setCreateKind('plugin')}
              >
                Plugin
              </button>
              <button
                type="button"
                className={createKind === 'skill' ? 'is-active' : ''}
                onClick={() => setCreateKind('skill')}
              >
                Skill
              </button>
            </div>
            {createKind === 'plugin' ? (
              <div className="plugin-marketplace__create-options">
                <article>
                  <span className="plugin-marketplace__create-option-icon" aria-hidden>
                    <Icon name="github-filled" size={20} />
                  </span>
                  <div>
                    <h3>从 GitHub 链接导入</h3>
                    <p>粘贴 plugin repo 链接，Open Design 会拉取清单、校验能力并上传到团队空间。</p>
                    <label>
                      <span>GitHub URL</span>
                      <input placeholder="https://github.com/org/open-design-plugin" />
                    </label>
                  </div>
                  <button type="button">导入并上传</button>
                </article>
                <article>
                  <span className="plugin-marketplace__create-option-icon" aria-hidden>
                    <Icon name="folder" size={20} />
                  </span>
                  <div>
                    <h3>导入本地文件夹</h3>
                    <p>选择包含 open-design.json / SKILL.md 的本地目录，校验通过后上传为团队 Plugin。</p>
                    <button type="button" className="plugin-marketplace__folder-pick">
                      <Icon name="folder" size={15} />
                      选择文件夹
                    </button>
                  </div>
                  <button type="button">上传 Plugin</button>
                </article>
              </div>
            ) : (
              <div className="plugin-marketplace__skill-form">
                <label>
                  <span>Skill 名称</span>
                  <input placeholder="例如 Brand QA Reviewer" />
                </label>
                <label>
                  <span>用途说明</span>
                  <textarea placeholder="描述它适合在什么任务中使用，以及它会检查或产出什么。" />
                </label>
                <button type="button">创建 Skill</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
