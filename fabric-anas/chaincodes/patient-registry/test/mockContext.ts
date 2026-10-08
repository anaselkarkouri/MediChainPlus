export function createMockContext() {
  const state = new Map<string, Buffer>();
  const events: { name: string; payload: Buffer }[] = [];
  const history = new Map<string, any[]>();

  const ctx: any = {
    clientIdentity: { getID: () => 'x509::/CN=appUser', getAttributeValue: () => 'patient,doctor,pharmacy,insurer,admin' },
    stub: {
      getTxTimestamp: () => ({ seconds: '1778493600', nanos: 123000000 }),
      getTxID: () => 'test-transaction-0001',
      getState: jest.fn(async (key: string) => state.get(key) ?? Buffer.alloc(0)),
      putState: jest.fn(async (key: string, value: Buffer) => {
        state.set(key, value);
        const list = history.get(key) ?? [];
        list.push({ txId: `tx-${list.length}`, timestamp: new Date(), isDelete: false, value });
        history.set(key, list);
      }),
      setEvent: jest.fn((name: string, payload: Buffer) => events.push({ name, payload })),
      getQueryResult: jest.fn(async (queryString: string) => {
        const query = JSON.parse(queryString);
        const selector = query.selector ?? {};
        const values = [...state.values()]
          .map((b) => JSON.parse(b.toString()))
          .filter((item) => Object.entries(selector).every(([k, v]) => item[k] === v));
        let i = 0;
        return {
          next: jest.fn(async () => {
            if (i < values.length) {
              const value = Buffer.from(JSON.stringify(values[i++]));
              return { value: { value }, done: false };
            }
            return { done: true };
          }),
          close: jest.fn(async () => undefined)
        };
      }),
      getHistoryForKey: jest.fn(async (key: string) => {
        const values = history.get(key) ?? [];
        let i = 0;
        return {
          next: jest.fn(async () => {
            if (i < values.length) return { value: values[i++], done: false };
            return { done: true };
          }),
          close: jest.fn(async () => undefined)
        };
      })
    },
    __state: state,
    __events: events
  };
  return ctx;
}
