function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return value;
}

export const env = {
  get SAAS_JWT_SECRET(): string {
    return required("SAAS_JWT_SECRET");
  },
  get SAAS_ADMIN_API_KEY(): string {
    return required("SAAS_ADMIN_API_KEY");
  },
  get SAAS_DATABASE_URL(): string {
    return required("SAAS_DATABASE_URL");
  },
  JWT_TTL_SECONDS: 60 * 60 * 24 * 30,
};
