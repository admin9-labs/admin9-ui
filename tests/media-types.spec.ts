import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { MediaGroup, MediaItem, MediaListParams, MediaService, MediaType, MediaUploadOptions } from '../src';

describe('public media contracts', () => {
  it('exports the reusable media type and group contracts', () => {
    expectTypeOf<MediaType>().toEqualTypeOf<'image' | 'video' | 'audio'>();
    expectTypeOf<MediaGroup>().toMatchTypeOf<{ id: string; name: string; count?: number }>();

    const item: MediaItem = {
      id: 'audio-1',
      name: 'intro.mp3',
      type: 'audio',
      groupId: null,
      url: '/media/intro.mp3',
      duration: 32,
      status: 'ready',
    };
    expect(item.type).toBe('audio');
  });

  it('keeps filters and upload placement in the backend adapter contract', () => {
    const params: MediaListParams = {
      page: 1,
      pageSize: 24,
      keyword: 'intro',
      mediaType: 'audio',
      groupId: null,
    };
    const upload: MediaUploadOptions = {
      file: new File(['audio'], 'intro.mp3'),
      mediaType: 'audio',
      groupId: 'voice',
    };
    const service: MediaService = {
      list: vi.fn(),
      listGroups: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
    };

    expect(params.groupId).toBeNull();
    expect(upload.groupId).toBe('voice');
    expect(service.listGroups).toBeTypeOf('function');
  });
});
