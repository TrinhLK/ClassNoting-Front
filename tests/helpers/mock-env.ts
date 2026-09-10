export const setEnv = (overrides: Record<string, string> = {}) => {
  const baseEnv: Record<string, string> = {
    EMAIL_USER: "test@example.com",
    EMAIL_PASS: "test-password",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    FIREBASE_SERVICE_ACCOUNT_KEY: "fake-key",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/drive/callback",
    MEETINGBAAS_API_KEY: "test-meetingbaas-key",
    MEETINGBAAS_WEBHOOK_SECRET: "test-webhook-secret",
    OPEN_CODE_GO_API_KEY: "test-gemini-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  };

  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    process.env[key] = value;
  }
};

export const clearEnv = (keys: string[] = []) => {
  for (const key of keys) {
    delete process.env[key];
  }
};
