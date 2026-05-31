import type { ChatSessionMode } from '@open-design/contracts';
import { Icon } from './Icon';

interface Props {
  mode: ChatSessionMode;
  onChange?: (mode: ChatSessionMode) => void;
  disabled?: boolean;
}

const MODE_META: Array<{
  mode: ChatSessionMode;
  label: string;
  icon: 'comment' | 'sparkles';
  title: string;
}> = [
  {
    mode: 'chat',
    label: 'Chat',
    icon: 'comment',
    title:
      'Chat mode: fast multi-turn answers with the same files, connectors, MCP servers, and attachments.',
  },
  {
    mode: 'design',
    label: 'Design',
    icon: 'sparkles',
    title:
      'Design mode: agent mode for generating HTML, PPT, slides, images, video, audio, and project files.',
  },
];

export function SessionModeToggle({ mode, onChange, disabled = false }: Props) {
  return (
    <div className="session-mode-toggle" role="tablist" aria-label="Conversation mode">
      {MODE_META.map((item) => {
        const active = item.mode === mode;
        return (
          <button
            key={item.mode}
            type="button"
            role="tab"
            aria-selected={active}
            className={`session-mode-toggle__option${active ? ' is-active' : ''}`}
            disabled={disabled || !onChange}
            title={item.title}
            aria-label={item.title}
            onClick={() => {
              if (!active) onChange?.(item.mode);
            }}
          >
            <Icon name={item.icon} size={13} />
            <span className="session-mode-toggle__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
