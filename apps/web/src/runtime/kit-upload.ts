// useKitModuleUpload — wire the empty-module "upload" affordance in the kit view
// to a real save. We upload the file into the backing project, then patch the
// project's brand.json so the module renders the new asset on the next read.
//
// Only meaningful for editable design systems that have a writable brand.json
// (DesignKit.canUpload). Reuses the existing project file providers — no new
// daemon endpoint is required.

import { useCallback, useState } from 'react';
import type { Brand } from '@open-design/contracts';
import {
  fetchProjectFileText,
  uploadProjectFile,
  writeProjectTextFile,
} from '../providers/registry';

export type KitUploadModule = 'logo' | 'image';

export interface KitModuleUpload {
  uploading: KitUploadModule | null;
  uploadModule: (module: KitUploadModule, file: File) => Promise<void>;
}

export function useKitModuleUpload(opts: {
  projectId?: string;
  onUploaded?: () => void;
}): KitModuleUpload {
  const { projectId, onUploaded } = opts;
  const [uploading, setUploading] = useState<KitUploadModule | null>(null);

  const uploadModule = useCallback(
    async (module: KitUploadModule, file: File) => {
      if (!projectId || uploading) return;
      setUploading(module);
      try {
        const dir = module === 'logo' ? 'logos' : 'imagery';
        const safe =
          file.name.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '') || `${module}-asset`;
        const path = `${dir}/${safe}`;
        const uploaded = await uploadProjectFile(projectId, file, path);
        if (!uploaded) return;

        // Patch brand.json so the kit view picks up the new asset. Best-effort:
        // if there is no brand.json the file still lands in the project.
        const raw = await fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' });
        if (raw) {
          try {
            const brand = JSON.parse(raw) as Brand;
            if (module === 'logo') {
              const prev = brand.logo?.primary ?? null;
              brand.logo = brand.logo ?? { primary: null, alternates: [], notes: '' };
              brand.logo.alternates = brand.logo.alternates ?? [];
              if (prev && prev !== path && !brand.logo.alternates.includes(prev)) {
                brand.logo.alternates = [prev, ...brand.logo.alternates];
              }
              brand.logo.primary = path;
            } else {
              brand.imagery = brand.imagery ?? {
                style: '',
                subjects: [],
                treatment: '',
                avoid: [],
                samples: [],
              };
              brand.imagery.samples = brand.imagery.samples ?? [];
              brand.imagery.samples.push({ file: path, kind: 'upload' });
            }
            await writeProjectTextFile(projectId, 'brand.json', JSON.stringify(brand, null, 2));
          } catch {
            // Malformed brand.json — leave the uploaded file in place.
          }
        }
        onUploaded?.();
      } finally {
        setUploading(null);
      }
    },
    [projectId, uploading, onUploaded],
  );

  return { uploading, uploadModule };
}
