export function normalizeKey(key: string | undefined): string {
  if (!key) {
    return "";
  }
  return key.replace(/[/\\]/g, ":").replace(/^:|:$/g, "");
}

export function joinKeys(...keys: string[]) {
  /* eslint-disable-next-line unicorn/no-array-callback-reference */
  return keys.map(normalizeKey).filter(Boolean).join(":");
}

export function createError(message: string) {
  const err = new Error(`[unstorage] [s3] ${message}`);
  return err;
}

export function createRequiredError(name: string | string[]) {
  if (Array.isArray(name)) {
    return createError(
      `Missing some of the required options ${name
        .map((n) => "`" + n + "`")
        .join(", ")}`,
    );
  }
  return createError(`Missing required option \`${name}\`.`);
}
