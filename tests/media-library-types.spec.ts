import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  Admin9UIPluginOptions,
  Admin9UIOptions,
  CreateMediaGroupOptions,
  MediaGroupCapability,
  MediaLibraryAdapter,
  MediaLibraryService,
  MediaMoveCapability,
  MoveMediaOptions,
  RemoveMediaGroupOptions,
  RenameMediaGroupOptions,
} from '../src';

describe('media library service contract', () => {
  it('keeps group mutations scoped to one media type', () => {
    const create: CreateMediaGroupOptions = { mediaType: 'image', name: 'Campaign' };
    const rename: RenameMediaGroupOptions = { mediaType: 'video', groupId: 'campaign', name: 'Launch' };
    const remove: RemoveMediaGroupOptions = { mediaType: 'audio', groupId: 'voice' };

    expect(create).toEqual({ mediaType: 'image', name: 'Campaign' });
    expect(rename.groupId).toBe('campaign');
    expect(remove.mediaType).toBe('audio');
  });

  it('uses null as the explicit ungrouped move target', () => {
    const options: MoveMediaOptions = {
      mediaType: 'image',
      ids: ['media-1', 'media-2'],
      groupId: null,
    };

    expect(options.groupId).toBeNull();
  });

  it('requires the management extension without widening MediaService', () => {
    const service: MediaLibraryService = {
      list: vi.fn(),
      listGroups: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
      createGroup: vi.fn(),
      renameGroup: vi.fn(),
      removeGroup: vi.fn(),
      move: vi.fn(),
    };

    expectTypeOf(service.listGroups).toBeFunction();
    expectTypeOf(service.createGroup).toBeFunction();
    expectTypeOf(service.renameGroup).toBeFunction();
    expectTypeOf(service.removeGroup).toBeFunction();
    expectTypeOf(service.move).toBeFunction();

    const pluginOptions: Admin9UIPluginOptions = { mediaService: service };
    const legacyPluginOptions: Admin9UIOptions = pluginOptions;
    expect(pluginOptions.mediaService).toBe(service);
    expect(legacyPluginOptions).toBe(pluginOptions);
  });

  it('composes optional library capabilities around the browse contract', () => {
    const readOnlyLibrary: MediaLibraryAdapter = { list: vi.fn() };
    const groups: MediaGroupCapability = {
      listGroups: vi.fn(),
      createGroup: vi.fn(),
      renameGroup: vi.fn(),
      removeGroup: vi.fn(),
    };
    const movement: MediaMoveCapability = { move: vi.fn() };

    expect(readOnlyLibrary.list).toBeTypeOf('function');
    expect(readOnlyLibrary.remove).toBeUndefined();
    expect(groups.createGroup).toBeTypeOf('function');
    expect(movement.move).toBeTypeOf('function');
  });
});
