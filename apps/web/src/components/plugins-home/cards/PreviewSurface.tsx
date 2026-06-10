// Switchboard component that renders the right preview surface
// for a plugin card based on the inferred preview kind.
//
// The surface is the visual hero of every card. It lazy-mounts
// expensive content (iframes, network images, video poll loops)
// via IntersectionObserver so a 350-plugin gallery does not
// hammer the daemon on first paint. The text-fallback variant
// short-circuits the lazy mount because it has no off-screen cost.

import { useCallback } from 'react';
import type { PluginPreviewSpec } from '../preview';
import { useInView } from '../useInView';
import { DesignSystemSurface } from './DesignSystemSurface';
import { HtmlSurface } from './HtmlSurface';
import { MediaSurface } from './MediaSurface';
import { TextSurface } from './TextSurface';

interface Props {
  pluginId: string;
  pluginTitle: string;
  preview: PluginPreviewSpec;
  // Gallery layout renders the HTML iframe eagerly (no hover gate).
  eager?: boolean;
}

export function PreviewSurface({ pluginId, pluginTitle, preview, eager = false }: Props) {
  // `inView` (a generous margin) mounts the surface so its poster / first frame
  // is ready before it scrolls in; `visible` (no margin) gates the expensive
  // part — decoding/playing a baked clip — to tiles truly on screen, so the
  // off-screen tiles inside the mount margin don't all spin up decodes + clip
  // downloads at once.
  const { ref: nearRef, inView } = useInView<HTMLDivElement>({
    rootMargin: eager ? '480px' : '120px',
    once: false,
  });
  const { ref: visibleRef, inView: visible } = useInView<HTMLDivElement>({
    rootMargin: '0px',
    once: false,
  });
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      nearRef.current = node;
      visibleRef.current = node;
    },
    [nearRef, visibleRef],
  );

  return (
    <div
      ref={setRef}
      className={`plugins-home__preview plugins-home__preview--${preview.kind}`}
      data-preview-kind={preview.kind}
    >
      {preview.kind === 'media' ? (
        <MediaSurface
          preview={preview}
          pluginTitle={pluginTitle}
          inView={inView}
          visible={visible}
        />
      ) : preview.kind === 'html' ? (
        <HtmlSurface
          preview={preview}
          pluginId={pluginId}
          pluginTitle={pluginTitle}
          inView={inView}
          eager={eager}
        />
      ) : preview.kind === 'design' ? (
        <DesignSystemSurface preview={preview} inView={inView} />
      ) : (
        <TextSurface pluginTitle={pluginTitle} />
      )}
    </div>
  );
}
