import path from 'node:path';
import { appkitServerConfig } from '@databricks/appkit/tsdown';

// AppKit's defaults assume POSIX paths: on Windows the `external` test treats
// drive-letter paths as bare package ids, and unbundle mode fails on paths with
// spaces. Bundle local modules and only externalize real packages.
export default appkitServerConfig((base) => ({
  ...base,
  unbundle: false,
  external: (id: string) =>
    (!path.isAbsolute(id) && /^[^./]/.test(id)) || id.includes('node_modules'),
}));
