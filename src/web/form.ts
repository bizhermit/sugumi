import { HttpError } from "./http-error.ts";
import { slot } from "./slot.ts";

/**
 * readForm() の上限の既定値
 * ファイルを受け取るフォームは options.maxBytes で広げる。
 */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const FORM_TYPE = /^(?:application\/x-www-form-urlencoded|multipart\/form-data)\b/i;

export const formSlot = slot<FormData>("form");

export type ReadFormOptions = {
  readonly maxBytes?: number;
};

async function readBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (req.body == null) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  // write() で投げると pipeTo() がその例外で失敗し、読み込みも中断される。
  await req.body.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.byteLength;
        if (size > maxBytes) {
          throw new HttpError(413, "リクエストボディが上限を超えています。");
        }
        chunks.push(chunk);
      },
    }),
  );
  return Buffer.concat(chunks);
}

export async function readForm(req: Request, options: ReadFormOptions = {}): Promise<FormData> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const contentType = req.headers.get("content-type") ?? "";
  if (!FORM_TYPE.test(contentType)) {
    throw new HttpError(415, `フォームではないContent-Typeです: ${contentType}`);
  }
  if (Number(req.headers.get("content-length")) > maxBytes) {
    throw new HttpError(413, "リクエストボディが上限を超えています。");
  }
  const body = await readBody(req, maxBytes);
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (err) {
    throw new HttpError(400, "フォームを解析できません。", { cause: err });
  }
}
