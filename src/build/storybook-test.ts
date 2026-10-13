/** A permissive stand-in for `storybook/test`: play functions never run in the docs front. */
export const STORYBOOK_TEST_STUB = `
const chainable = (impl) => {
  const callable = (...args) => (typeof impl === 'function' ? impl(...args) : undefined);
  const chain = () => callable;
  for (const name of [
    'mockName', 'mockImplementation', 'mockImplementationOnce', 'mockResolvedValue',
    'mockResolvedValueOnce', 'mockRejectedValue', 'mockReturnValue', 'mockReturnThis',
    'mockReset', 'mockClear', 'mockRestore',
  ]) callable[name] = chain;
  callable.mock = { calls: [], results: [] };
  return callable;
};
export const fn = (impl) => chainable(impl);
export const spyOn = () => chainable();
export const mocked = (value) => value;
export const expect = () => new Proxy({}, { get: () => () => undefined });
export const within = () => new Proxy({}, { get: () => () => ({}) });
export const waitFor = (callback) => Promise.resolve(typeof callback === 'function' ? callback() : undefined);
export const userEvent = new Proxy({}, { get: () => () => Promise.resolve() });
export const fireEvent = () => true;
export const cleanup = () => {};
`;
