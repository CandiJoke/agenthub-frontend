const DEFAULT_API_BASE_URL = "http://localhost:8001";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimTrailingSlashes(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
);
