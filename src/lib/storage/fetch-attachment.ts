import { lookup } from "node:dns/promises";
import { get } from "node:https";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import { HttpError } from "@/lib/http";
import {
  type AttachmentType,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from "./attachments";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");

const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

function privateAddressError() {
  return new HttpError(400, "INVALID_URL", "禁止请求本地、私有或保留网络地址");
}

export async function fetchAttachmentFromUrl(rawUrl: string, expectedType?: AttachmentType) {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "INVALID_URL", "附件 URL 格式无效");
  }
  const signal = AbortSignal.timeout(15_000);
  let retriesLeft = 1;
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (target.protocol !== "https:" || target.username || target.password) {
        throw new HttpError(400, "INVALID_URL", "附件 URL 必须为不含用户凭证的 HTTPS 地址");
      }
      const hostname = target.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
      if (/(^|\.)(localhost|local|internal)$/.test(hostname) || (isIP(hostname) && !isPublicAddress(hostname))) {
        throw privateAddressError();
      }
      signal.throwIfAborted();
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = get(target, {
          agent: false,
          signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; TravelCardsBot/1.0; +https://travel.keyi.win)",
            "Accept": "application/pdf,application/gpx+xml,application/vnd.google-earth.kml+xml,text/xml,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
          lookup(host, options, callback) {
            lookup(host, { all: true }).then((addresses) => {
              if (signal.aborted) return callback(signal.reason, "", 4);
              if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
                return callback(privateAddressError(), "", 4);
              }
              const address = addresses[0];
              if (options.all) callback(null, [address]);
              else callback(null, address.address, address.family);
            }, () => callback(new HttpError(400, "ATTACHMENT_FETCH_FAILED", "无法解析附件地址"), "", 4));
          },
        }, resolve);
        request.on("error", reject);
      });
      try {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          if (!response.headers.location) throw new HttpError(400, "ATTACHMENT_FETCH_FAILED", "重定向未包含目标地址");
          try {
            target = new URL(response.headers.location, target);
          } catch {
            throw new HttpError(400, "INVALID_URL", "重定向目标地址无效");
          }
          continue;
        }
        if ((status === 429 || status === 503) && retriesLeft > 0) {
          retriesLeft--;
          hop--;
          let delayMs = 1000;
          const retryAfterHeader = response.headers["retry-after"];
          if (retryAfterHeader) {
            const seconds = Number.parseInt(retryAfterHeader, 10);
            if (Number.isFinite(seconds) && seconds > 0) {
              if (seconds > 5) {
                throw new HttpError(400, "ATTACHMENT_FETCH_FAILED", `获取附件失败 (HTTP ${status})`);
              }
              delayMs = seconds * 1000;
            }
          }
          signal.throwIfAborted();
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", onAbort);
              resolve();
            }, delayMs);
            const onAbort = () => {
              clearTimeout(timer);
              reject(signal.reason);
            };
            signal.addEventListener("abort", onAbort, { once: true });
          });
          continue;
        }
        if (status < 200 || status >= 300) throw new HttpError(400, "ATTACHMENT_FETCH_FAILED", `获取附件失败 (HTTP ${status})`);
        if (Number(response.headers["content-length"]) > MAX_ATTACHMENT_BYTES) {
          throw new HttpError(413, "FILE_TOO_LARGE", "附件文件不能超过 20 MiB");
        }
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of response) {
          total += chunk.length;
          if (total > MAX_ATTACHMENT_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "附件文件不能超过 20 MiB");
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks, total);
        const filename = target.pathname.split("/").pop() || "";
        const validated = validateAttachment(bytes, expectedType, filename);
        return { bytes, ...validated };
      } finally {
        response.destroy();
      }
    }
    throw new HttpError(400, "ATTACHMENT_FETCH_FAILED", "重定向次数过多");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "ATTACHMENT_FETCH_FAILED", signal.aborted ? "获取附件超时，请重试" : "无法下载附件，请检查地址或稍后重试");
  }
}
