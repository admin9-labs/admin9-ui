import { describe, expect, it, vi } from 'vitest';
import createImageCropSession, { type CropSessionState } from '../src/internal/image-crop-session';
import type { FileItem, FilePickerAdapter } from '../src/services/types';

const image = (id: string): FileItem => ({
  id,
  name: `${id}.png`,
  type: 'image',
  groupId: null,
  url: `/${id}.png`,
  status: 'ready',
});
const file = (name = 'source.png') => new File(['source bytes'], name, { type: 'image/png' });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};
const service = (upload = vi.fn().mockResolvedValue(image('uploaded'))): FilePickerAdapter => ({
  list: vi.fn(),
  upload,
  readOriginal: vi.fn().mockResolvedValue(file()),
});

describe('native crop session', () => {
  it('reads one original, crops it and uploads the resulting file', async () => {
    const adapter = service();
    const processor = vi.fn().mockResolvedValue(file('processed.png'));
    const session = createImageCropSession(vi.fn());
    const original = image('original');
    expect(await session.run(original, adapter, processor)).toEqual(image('uploaded'));
    expect(adapter.readOriginal).toHaveBeenCalledWith({ item: original, signal: expect.any(AbortSignal) });
    expect(adapter.upload).toHaveBeenCalledWith(expect.objectContaining({ file: await processor.mock.results[0].value }));
  });

  it('cancels before uploading when the crop dialog is dismissed', async () => {
    const adapter = service();
    const session = createImageCropSession(vi.fn());
    expect(await session.run(image('original'), adapter, async () => null)).toBeNull();
    expect(adapter.upload).not.toHaveBeenCalled();
  });

  it('retries an upload using the same prepared file without reopening the cropper', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(image('ready'));
    const adapter = service(upload);
    const processor = vi.fn().mockResolvedValue(file('cropped'));
    const states: CropSessionState[] = [];
    const session = createImageCropSession((state) => states.push(state));
    const result = session.run(image('original'), adapter, processor);
    await tick();
    expect(states.at(-1)).toMatchObject({ stage: 'error', error: 'upload' });
    const failedFile = upload.mock.calls[0][0].file;
    session.retry();
    expect(await result).toEqual(image('ready'));
    expect(processor).toHaveBeenCalledTimes(1);
    expect(adapter.readOriginal).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0].file).toBe(failedFile);
  });

  it('ignores a late upload and progress after cancellation and a new selection', async () => {
    const late = deferred<FileItem>();
    const upload = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce(image('new'));
    const states = vi.fn();
    const session = createImageCropSession(states);
    const adapter = service(upload);
    const old = session.run(image('old'), adapter, async (source) => source);
    await tick();
    const request = upload.mock.calls[0][0];
    session.cancel();
    expect(request.signal.aborted).toBe(true);
    expect(await old).toBeNull();
    const next = session.run(image('new'), adapter, async (source) => source);
    expect(await next).toEqual(image('new'));
    const callCount = states.mock.calls.length;
    late.resolve(image('old'));
    request.onProgress(90);
    await tick();
    expect(states).toHaveBeenCalledTimes(callCount);
  });

  it('does not accept a pending or unsafe upload result and can retry it', async () => {
    const adapter = service(
      vi
        .fn()
        .mockResolvedValueOnce({ ...image('pending'), status: 'pending' })
        .mockResolvedValueOnce(image('ready'))
    );
    const session = createImageCropSession(vi.fn());
    const result = session.run(image('original'), adapter, async (source) => source);
    await tick();
    session.retry();
    expect(await result).toEqual(image('ready'));
  });

  it('retries original reads, and cancelled reads never open a cropper', async () => {
    const late = deferred<File>();
    const adapter = service();
    adapter.readOriginal = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockReturnValueOnce(late.promise);
    const processor = vi.fn();
    const session = createImageCropSession(vi.fn());
    const result = session.run(image('original'), adapter, processor);
    await tick();
    session.retry();
    session.cancel();
    late.resolve(file());
    await tick();
    expect(await result).toBeNull();
    expect(processor).not.toHaveBeenCalled();
    expect(adapter.upload).not.toHaveBeenCalled();
  });
  it('ignores progress after an upload attempt fails or finishes, including during retry', async () => {
    const next = deferred<FileItem>();
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(next.promise);
    const states = vi.fn();
    const session = createImageCropSession(states);
    const result = session.run(image('original'), service(upload), async (source) => source);
    await tick();
    const oldProgress = upload.mock.calls[0][0].onProgress;
    oldProgress(90);
    expect(states.mock.calls.at(-1)?.[0].stage).toBe('error');
    session.retry();
    await tick();
    const count = states.mock.calls.length;
    oldProgress(99);
    expect(states).toHaveBeenCalledTimes(count);
    next.resolve(image('ready'));
    await result;
    const doneCount = states.mock.calls.length;
    upload.mock.calls[1][0].onProgress(100);
    expect(states).toHaveBeenCalledTimes(doneCount);
    expect(states.mock.calls.at(-1)?.[0].stage).toBe('idle');
  });
});
