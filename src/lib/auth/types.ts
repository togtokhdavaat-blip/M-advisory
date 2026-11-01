export interface SessionUser {
  id: string;
  email: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export type AuthResult =
  | { ok: true; user: SessionUser; needsEmailConfirmation?: boolean }
  | { ok: false; error: "invalid_credentials" | "email_taken" | "weak_password" | "rate_limited" | "unknown" };

export interface AuthProvider {
  getUser(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  signOut(): Promise<void>;
}
