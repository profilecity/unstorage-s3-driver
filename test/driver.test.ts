import { describe } from "vitest";
import { s3Driver } from "../src";
import { testDriver } from "./utils";

describe("s3 driver", () => {
  testDriver({
    driver: s3Driver({
      accessKeyId: process.env.VITE_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.VITE_S3_SECRET_ACCESS_KEY!,
      accountId: process.env.VITE_S3_ACCOUNT_ID,
      bucket: process.env.VITE_S3_BUCKET!,
      endpoint: process.env.VITE_S3_ENDPOINT!,
      region: process.env.VITE_S3_REGION!,
    }),
  });
});
