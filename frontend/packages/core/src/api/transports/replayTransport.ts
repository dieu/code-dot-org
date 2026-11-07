import type {Transport, RequestOptions, ApiResponse} from './types';
import {toReplayKey} from './url';
import {idbGet, idbPut} from './simpleIdb';

type Recording = {
  key: string;
  createdAt: number;
  req: RequestOptions;
  resp: ApiResponse<unknown>;
};

export function createReplayTransport(opts: {
  mode: 'replay' | 'record' | 'auto';
  namespace?: string;
  backingTransport: Transport;
}): Transport {
  const {mode, namespace = 'default', backingTransport} = opts;

  return {
    async requestWithMeta<T>(
      req: RequestOptions,
      blob?: boolean,
    ): Promise<ApiResponse<T>> {
      const key = `${namespace}:${toReplayKey(req)}${blob ? ':blob' : ''}`;

      if (mode !== 'record') {
        const existing = await idbGet<Recording>(key);
        if (existing) return existing.resp as ApiResponse<T>;
        if (mode === 'replay')
          throw new Error(`No replay recording for ${key}`);
      }

      // record (or auto miss)
      const resp = await backingTransport.requestWithMeta<T>(req, blob);
      await idbPut<Recording>(key, {
        key,
        createdAt: Date.now(),
        req,
        resp: resp as ApiResponse<unknown>,
      });
      return resp;
    },

    async request<T>(req: RequestOptions): Promise<T> {
      const {data} = await this.requestWithMeta<T>(req);
      return data;
    },

    async requestBlob(req: RequestOptions): Promise<Blob> {
      const {data} = await this.requestWithMeta<Blob>(req, true);
      return data;
    },
  };
}
