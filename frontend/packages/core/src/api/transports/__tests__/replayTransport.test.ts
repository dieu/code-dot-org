import {beforeEach, describe, expect, it, vi} from 'vitest';

import {idbGet, idbPut} from '../simpleIdb';
import {createReplayTransport} from '../replayTransport';
import type {ApiResponse, RequestOptions, Transport} from '../types';

vi.mock('../simpleIdb', () => ({
  idbGet: vi.fn(),
  idbPut: vi.fn(),
}));

const request: RequestOptions = {method: 'GET', url: '/download'};
const meta = {
  status: 200,
  headers: {'content-type': 'application/pdf'},
  url: 'https://studio.code.org/download',
};

describe('replay transport', () => {
  const recordings = new Map<string, unknown>();
  const blob = new Blob(['file contents'], {type: 'application/pdf'});

  beforeEach(() => {
    recordings.clear();
    vi.mocked(idbGet).mockImplementation(
      async key => recordings.get(key) as never,
    );
    vi.mocked(idbPut).mockImplementation(async (key, value) => {
      recordings.set(key, value);
    });
  });

  it('records and replays blob responses separately from data responses', async () => {
    const requestWithMeta = vi.fn().mockImplementation(
      async (
        _request: RequestOptions,
        asBlob?: boolean,
      ): Promise<ApiResponse<Blob | string>> => ({
        data: asBlob ? blob : 'file contents',
        meta,
      }),
    );
    const backingTransport = {
      request: vi.fn(),
      requestBlob: vi.fn(),
      requestWithMeta,
    } as unknown as Transport;

    const recorder = createReplayTransport({
      mode: 'record',
      namespace: 'test',
      backingTransport,
    });

    expect(await recorder.request<string>(request)).toBe('file contents');
    const recordedBlob = await recorder.requestBlob(request);

    expect(recordedBlob).toBeInstanceOf(Blob);
    expect(await recordedBlob.text()).toBe('file contents');
    expect(requestWithMeta).toHaveBeenNthCalledWith(2, request, true);

    const player = createReplayTransport({
      mode: 'replay',
      namespace: 'test',
      backingTransport,
    });

    expect(await player.request<string>(request)).toBe('file contents');
    const replayedBlob = await player.requestBlob(request);

    expect(replayedBlob).toBeInstanceOf(Blob);
    expect(await replayedBlob.text()).toBe('file contents');
    expect(requestWithMeta).toHaveBeenCalledTimes(2);
  });
});
