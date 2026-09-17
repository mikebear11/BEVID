let n = 0;
export const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}`;
export const stripKeys = (rows) => rows.map(({ _k, ...r }) => r);
