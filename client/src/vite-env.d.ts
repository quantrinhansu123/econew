/// <reference types="vite/client" />

declare const __ECO_DEV_API_PORT__: number;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_URL_DIRECT?: string;
  readonly VITE_DEV_API_PORT?: string;
  readonly VITE_HRM_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
