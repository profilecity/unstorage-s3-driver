/**
 * This code is taken from https://github.com/unjs/unstorage/pull/361
 * Credits: https://github.com/becem-gharbi
 */

import { AwsClient } from "aws4fetch";
import { $fetch } from "ofetch";
import { joinURL, withQuery } from "ufo";
import crypto from "uncrypto";
import { defineDriver } from "unstorage";
import xml2js from "xml2js";
import { createRequiredError } from "./utils";

// @ts-expect-error `File '/node_modules/jstoxml/dist/jstoxml.js' is not a module.  ts(2306)`
import js2xml from "jstoxml";

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = crypto;
}

export interface S3DriverOptions {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
  accountId?: string;
}

type GetItemOptions =
  | undefined
  | {
      headers?: Record<string, string>;
    };

type SetItemOptions =
  | undefined
  | {
      headers?: Record<string, string>;
      meta?: Record<string, string>;
    };

const DRIVER_NAME = "s3";

export const s3Driver = defineDriver((options: S3DriverOptions) => {
  if (!options.accessKeyId) {
    throw createRequiredError("accessKeyId");
  }
  if (!options.secretAccessKey) {
    throw createRequiredError("secretAccessKey");
  }
  if (!options.bucket) {
    throw createRequiredError("bucket");
  }
  if (!options.endpoint) {
    throw createRequiredError("endpoint");
  }
  if (!options.region) {
    throw createRequiredError("region");
  }

  let awsClient: AwsClient;

  function getAwsClient() {
    if (!awsClient) {
      awsClient = new AwsClient({
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        region: options.region,
        service: DRIVER_NAME,
      });
    }
    return awsClient;
  }

  const normalizedKey = (key: string) =>
    key.replace(/:/g, "/").replace(/\/+$/, "");

  const awsUrlWithoutKey = joinURL(options.endpoint, options.bucket);

  const awsUrlWithKey = (key: string) =>
    joinURL(options.endpoint, options.bucket, normalizedKey(key));

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
  async function _getMeta(key: string) {
    const request = await getAwsClient().sign(awsUrlWithKey(key), {
      method: "HEAD",
    });

    return $fetch.raw(request).then((res) => {
      const metaHeaders: HeadersInit = {};
      for (const [key, value] of res.headers.entries()) {
        const match = /x-amz-meta-(.*)/.exec(key);
        if (match) {
          metaHeaders[match[1]] = value;
        }
      }
      return metaHeaders;
    });
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
  async function _getKeys(base?: string) {
    const url = withQuery(awsUrlWithoutKey, {
      prefix: base && normalizedKey(base),
    });

    const request = await getAwsClient().sign(url, {
      method: "GET",
    });

    return $fetch(request)
      .then((res) => {
        let keys: Array<string> = [];
        xml2js.parseString(res, (error, result) => {
          if (error === null) {
            const contents = result["ListBucketResult"][
              "Contents"
            ] as Array<any>;
            keys = contents.map((item) => item["Key"][0]);
          }
        });
        return keys;
      })
      .catch(() => []);
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
  async function _getItemRaw(key: string, opts: GetItemOptions = {}) {
    const request = await getAwsClient().sign(awsUrlWithKey(key), {
      method: "GET",
    });

    return $fetch
      .raw(request)
      .then((res) => {
        opts.headers ||= {};

        for (const [key, value] of res.headers.entries()) {
          opts.headers[key] = value;
        }

        return res._data;
      })
      .catch(() => undefined);
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
  async function _setItemRaw(
    key: string,
    value: any,
    opts: SetItemOptions = {},
  ) {
    const metaHeaders: HeadersInit = {};

    if (typeof opts.meta === "object") {
      for (const [key, value] of Object.entries(opts.meta)) {
        metaHeaders[`x-amz-meta-${key}`] = value;
      }
    }

    const request = await getAwsClient().sign(awsUrlWithKey(key), {
      method: "PUT",
      body: value,
      headers: {
        ...opts.headers,
        ...metaHeaders,
      },
    });

    return $fetch(request);
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
  async function _removeItem(key: string) {
    const request = await getAwsClient().sign(awsUrlWithKey(key), {
      method: "DELETE",
    });

    return $fetch(request);
  }

  return {
    name: DRIVER_NAME,
    options,

    getItemRaw: _getItemRaw,
    setItemRaw: _setItemRaw,
    getKeys: _getKeys,
    removeItem: _removeItem,

    getMeta: (key) => _getMeta(key).catch(() => ({})),

    getItem(key, opts: GetItemOptions) {
      return _getItemRaw(key, opts);
    },

    setItem(key, value, opts: SetItemOptions = {}) {
      let contentType: string;

      try {
        JSON.parse(value);
        contentType = "application/json";
      } catch {
        contentType = "text/plain";
      }

      opts.headers = {
        "Content-Type": contentType,
        "Content-Length": value.length.toString(),
        ...opts.headers,
      };

      return _setItemRaw(key, value, opts);
    },

    // https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
    async clear(base) {
      const keys = await _getKeys(base);

      if (options.accountId) {
        const body = js2xml.toXML({
          Delete: keys.map((key) => ({ Object: { Key: key } })),
        });

        const request = await getAwsClient().sign(awsUrlWithoutKey, {
          method: "DELETE",
          body,
          headers: {
            "x-amz-expected-bucket-owner": options.accountId,
          },
        });

        await $fetch(request);
      }

      await Promise.all(keys.map((key) => _removeItem(key)));
    },

    async hasItem(key) {
      return _getMeta(key)
        .then(() => true)
        .catch(() => false);
    },
  };
});