import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSupport, setSupport } from './support';

describe('support votes', () => {
  it('keeps a genuine zero distinct from an unavailable count', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({data:[{total:0,voted:false}],error:null})
      .mockResolvedValueOnce({data:null,error:new Error('Offline')})
      .mockResolvedValueOnce({data:[],error:null})
      .mockResolvedValueOnce({data:[{total:-1,voted:false}],error:null});
    const client = {rpc} as unknown as SupabaseClient;
    expect(await readSupport(client)).toEqual({total:0,voted:false});
    await expect(readSupport(client)).rejects.toThrow('Offline');
    await expect(readSupport(client)).rejects.toThrow('unavailable');
    await expect(readSupport(client)).rejects.toThrow('unavailable');
  });
  it('rejects unsigned votes and propagates write failures without claiming success', async () => {
    const upsert=vi.fn().mockResolvedValue({error:new Error('Denied')});
    const from=vi.fn(()=>({upsert}));
    const client={from} as unknown as SupabaseClient;
    await expect(setSupport(client,'local',true)).rejects.toThrow('Sign in');
    expect(from).not.toHaveBeenCalled();
    await expect(setSupport(client,crypto.randomUUID(),true)).rejects.toThrow('Denied');
  });
});
