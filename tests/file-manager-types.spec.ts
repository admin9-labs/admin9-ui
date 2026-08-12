import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  FileBrowseCapability,
  FileGroupCapability,
  FileItem,
  FileListParams,
  FileManagerAdapter,
  FileMoveCapability,
  FileRemoveCapability,
  FileType,
  FileUploadCapability,
  FileUploadOptions,
  MoveFileOptions,
} from '../src';

describe('file manager service contract', () => {
  it('exports six real file types and never includes the all filter', () => {
    expectTypeOf<FileType>().toEqualTypeOf<'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'>();

    const item: FileItem = {
      id: 'document-1',
      name: 'specification.pdf',
      type: 'document',
      groupId: null,
      url: '/files/specification.pdf',
      extension: 'pdf',
      size: 1024,
    };
    expect(item.type).toBe('document');
  });

  it('models all and typed list filters as valid discriminated variants', () => {
    const allFiles: FileListParams = { page: 1, pageSize: 24, keyword: 'report' };
    const selectableFiles: FileListParams = {
      page: 1,
      pageSize: 12,
      fileTypes: ['image', 'document'],
    };
    const noFiles: FileListParams = { page: 1, pageSize: 12, fileTypes: [] };
    const imageGroup: FileListParams = { page: 2, pageSize: 12, fileType: 'image', groupId: 'campaign' };
    const ungroupedArchive: FileListParams = { page: 1, pageSize: 20, fileType: 'archive', groupId: null };

    expect(allFiles).not.toHaveProperty('groupId');
    expect(selectableFiles.fileTypes).toEqual(['image', 'document']);
    expect(noFiles.fileTypes).toEqual([]);
    expect(imageGroup.groupId).toBe('campaign');
    expect(ungroupedArchive.groupId).toBeNull();
  });

  it('rejects a group filter when the file type is all', () => {
    // @ts-expect-error The aggregate all filter cannot be paired with a type-owned group.
    const invalid: FileListParams = { page: 1, pageSize: 24, fileType: undefined, groupId: 'group-x' };
    expect(invalid.groupId).toBe('group-x');
  });

  it('rejects a type subset when one concrete file type is present', () => {
    // @ts-expect-error A concrete type query cannot also carry an aggregate type subset.
    const invalid: FileListParams = { page: 1, pageSize: 24, fileType: 'image', fileTypes: ['image'] };
    expect(invalid.fileType).toBe('image');
  });

  it('rejects a group filter on an aggregate type subset', () => {
    // @ts-expect-error Aggregate subset queries cannot target a group owned by one concrete type.
    const invalid: FileListParams = {
      page: 1,
      pageSize: 24,
      fileType: undefined,
      fileTypes: ['image', 'document'],
      groupId: 'group-x',
    };
    expect(invalid.fileTypes).toEqual(['image', 'document']);
  });

  it('keeps browsing and upload reusable without management capabilities', () => {
    const browse: FileBrowseCapability = { list: vi.fn() };
    const upload: FileUploadCapability = { upload: vi.fn() };
    const readOnlyManager: FileManagerAdapter = browse;
    const options: FileUploadOptions = {
      file: new File(['document'], 'guide.pdf'),
      fileType: 'document',
      groupId: null,
    };

    expect(readOnlyManager.list).toBeTypeOf('function');
    expect(readOnlyManager.remove).toBeUndefined();
    expect(upload.upload).toBeTypeOf('function');
    expect(options.fileType).toBe('document');
  });

  it('keeps each mutation capability independently composable and type-scoped', () => {
    const remove: FileRemoveCapability = { remove: vi.fn() };
    const move: FileMoveCapability = { move: vi.fn() };
    const groups: FileGroupCapability = {
      listGroups: vi.fn(),
      createGroup: vi.fn(),
      renameGroup: vi.fn(),
      removeGroup: vi.fn(),
    };
    const options: MoveFileOptions = { fileType: 'archive', ids: ['archive-1'], groupId: null };

    expect(remove.remove).toBeTypeOf('function');
    expect(move.move).toBeTypeOf('function');
    expect(groups.listGroups).toBeTypeOf('function');
    expect(options.fileType).toBe('archive');
  });
});
