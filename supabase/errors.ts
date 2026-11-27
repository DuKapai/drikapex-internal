export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Supabase public configuration is missing or invalid.");
    this.name = "SupabaseConfigurationError";
  }
}

type SupabaseErrorLike = {
  code?: unknown;
  status?: unknown;
};

export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof SupabaseConfigurationError) {
    return "Supabase is not configured. Add the public project URL and publishable/anon key, then rebuild the app.";
  }

  if (typeof error !== "object" || error === null) {
    return "The request could not be completed. Please try again.";
  }

  const candidate = error as SupabaseErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;

  if (code === "invalid_credentials") {
    return "The email or password is incorrect.";
  }

  if (code === "42501") {
    return "Your account does not have permission to access this information.";
  }

  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") {
    return "A required Supabase table or API is unavailable. Check the existing database schema and API setup.";
  }

  if (status === 429) {
    return "Too many requests. Wait a moment and try again.";
  }

  if (status === 0 || code === "NETWORK_ERROR") {
    return "Supabase could not be reached. Check the project URL and your connection.";
  }

  return "The request could not be completed. Check your access and try again.";
}
