// Cloudflare Worker for paradoxdynamics.co.uk. Cloudflare serves the files in
// site/ directly; only videos come through here (run_worker_first in
// wrangler.jsonc). iPhones and iPads won't play a <video> unless the server can
// send it in pieces ("range requests", answered with 206 Partial Content), and
// static assets always send the whole file, so this answers range requests
// itself by sending just the bytes asked for.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (!response.ok || !response.body) return response;

    const headers = new Headers(response.headers);
    headers.set("Accept-Ranges", "bytes");
    const rangeHeader = request.headers.get("Range");
    if (!rangeHeader) return new Response(response.body, { status: response.status, headers });

    // The asset response doesn't say how long it is, so read it to find out.
    // The videos are a few megabytes, well within a Worker's memory.
    const bytes = await response.arrayBuffer();
    const size = bytes.byteLength;
    const range = parseRange(rangeHeader, size);
    if (!range) return new Response(bytes, { status: response.status, headers });
    if (range === "unsatisfiable") {
      headers.delete("Content-Length");
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.delete("Content-Length");
    return new Response(bytes.slice(range.start, range.end + 1), { status: 206, headers });
  },
};

// "bytes=start-end", "bytes=start-" or "bytes=-suffix". Anything else (no
// header, several ranges, unknown size) gets the whole file.
export function parseRange(header, size) {
  if (!header || !Number.isFinite(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}
