import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { FileBrowseCapability, FilePickerAdapter, FileUploadCapability } from '../src';

describe('file picker service contract', () => {
  it('uses the shared browse contract with optional upload and no management requirement', () => {
    const browse: FileBrowseCapability = { list: vi.fn() };
    const picker: FilePickerAdapter = browse;

    expectTypeOf<FilePickerAdapter>().toMatchTypeOf<FileBrowseCapability>();
    expect(picker.list).toBeTypeOf('function');
    expect(picker.upload).toBeUndefined();
  });

  it('accepts upload as an independently composable capability', () => {
    const upload: FileUploadCapability = { upload: vi.fn() };
    const picker: FilePickerAdapter = { list: vi.fn(), ...upload };

    expect(picker.upload).toBeTypeOf('function');
    expectTypeOf(picker).not.toHaveProperty('remove');
    expectTypeOf(picker).not.toHaveProperty('move');
  });
});
