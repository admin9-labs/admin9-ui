import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const imagePickerSource = readFileSync(resolve(process.cwd(), 'src/components/image-picker/index.vue'), 'utf8');

describe('AImagePicker style contract', () => {
  it('defines the fixed reference sizes for every display mode', () => {
    expect(imagePickerSource).toMatch(
      /\.a9-image-picker\s*{[\s\S]*?--a9-image-picker-card-width: 80px;[\s\S]*?--a9-image-picker-card-height: 80px;/
    );
    expect(imagePickerSource).toMatch(
      /&--landscape\s*{\s*--a9-image-picker-card-width: 144px;\s*--a9-image-picker-card-height: 81px;/
    );
    expect(imagePickerSource).toMatch(
      /&--portrait\s*{\s*--a9-image-picker-card-width: 80px;\s*--a9-image-picker-card-height: 112px;/
    );
    expect(imagePickerSource).toMatch(
      /&--banner\s*{\s*--a9-image-picker-card-width: 200px;\s*--a9-image-picker-card-height: 64px;/
    );
  });

  it('shares dimensions between selected cards and the empty trigger while respecting narrow containers', () => {
    const cardRule = imagePickerSource.match(/:deep\(\.arco-upload-list-picture\)\s*{([^}]*)}/)?.[1] ?? '';
    const addRule = imagePickerSource.match(/&__add\s*{([^}]*)}/)?.[1] ?? '';

    [cardRule, addRule].forEach((rule) => {
      expect(rule).toContain('width: var(--a9-image-picker-card-width);');
      expect(rule).toContain('max-width: 100%;');
      expect(rule).toContain('height: var(--a9-image-picker-card-height);');
      expect(rule).not.toContain('min(var(--a9-image-picker-card-width), 100%)');
    });
    expect(imagePickerSource).not.toContain('@container');
    expect(imagePickerSource).not.toContain('aspect-ratio');
  });

  it('limits fit to thumbnail object-fit rules', () => {
    expect(imagePickerSource).toMatch(/:deep\(\.arco-upload-list-picture img\)\s*{\s*object-fit: contain;/);
    expect(imagePickerSource).toMatch(/&--fit-cover :deep\(\.arco-upload-list-picture img\)\s*{\s*object-fit: cover;/);
    expect(imagePickerSource).not.toMatch(/arco-image-preview[^}]*object-fit/);
  });
});
