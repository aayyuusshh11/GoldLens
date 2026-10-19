import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./errors";
import { buildQuery, HttpClient, REQUEST_TIMEOUT_MS } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("buildQuery", () => {
  it("encodes present params and skips empty/undefined", () => {
    expect(buildQuery({ symbol: "GOLDM" })).toBe("?symbol=GOLDM");
    expect(buildQuery({ a: 1, b: undefined, c: "" })).toBe("?a=1");
    expect(buildQuery({})).toBe("");
  });
});

describe("HttpClient.getJson", () => {
  const client = new HttpClient("http://test.local/api/v1");
  const fetchMock = vi.fn();
  const parse = (raw: unknown): { echo: unknown } => ({ echo: raw });

  afterEach(() => {
    fetchMock.mockReset();
  });

  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the parsed payload on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hello: "world" }));
    await expect(client.getJson("/probe", parse)).resolves.toEqual({ echo: { hello: "world" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://test.local/api/v1/probe");
    expect(init?.method).toBe("GET");
  });

  it("maps contract error bodies onto AppError verbatim", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error_code: "data_quality_rejected", message: "no tradable calendar pair for 'GOLD'", details: {} },
        409,
      ),
    );
    const error = await client.getJson("/report", parse).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    const appError = (error as ApiRequestError).appError;
    expect(appError.kind).toBe("http");
    expect(appError.code).toBe("data_quality_rejected");
    expect(appError.message).toBe("no tradable calendar pair for 'GOLD'");
    expect(appError.status).toBe(409);
  });

  it("degrades non-JSON error bodies to http_<status>", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    const error = await client.getJson("/probe", parse).catch((e: unknown) => e);
    const appError = (error as ApiRequestError).appError;
    expect(appError.kind).toBe("http");
    expect(appError.code).toBe("http_503");
    expect(appError.status).toBe(503);
  });

  it("surfaces network failures as kind=network", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = await client.getJson("/probe", parse).catch((e: unknown) => e);
    const appError = (error as ApiRequestError).appError;
    expect(appError.kind).toBe("network");
    expect(appError.status).toBeNull();
  });

  it("wraps parser failures as schema errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const error = await client
      .getJson("/probe", () => {
        throw new Error("boom");
      })
      .catch((e: unknown) => e);
    const appError = (error as ApiRequestError).appError;
    expect(appError.kind).toBe("schema");
    expect(appError.message).toBe("boom");
  });

  it("rejects immediately on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await client
      .getJson("/probe", parse, { signal: controller.signal })
      .catch((e: unknown) => e);
    const appError = (error as ApiRequestError).appError;
    expect(appError.code).toBe("cancelled");
  });

  it("throws a config error when the base URL is empty", async () => {
    const noBase = new HttpClient("");
    await expect(noBase.getJson("/probe", parse)).rejects.toMatchObject({
      appError: { code: "config_error" },
    });
  });

  it("documents the default request timeout", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});
