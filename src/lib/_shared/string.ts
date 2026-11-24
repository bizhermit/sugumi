const segmenter = new Intl.Segmenter();

/** 人が数える文字数（書記素）。絵文字や結合文字を1文字に数える。 */
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

/**
 * ダッシュに見える文字（‐〜―、−、ー）をハイフン（-）にする。
 * マイナスや電話番号の区切りの入力を揃えるために使用する。
 */
export function toHyphen(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212\u30fc]/g, "-");
}

/**
 * 全角の英数字と記号（！〜～）と全角スペースを半角にする。
 * 数字や電話番号の入力を揃えるために使用する。
 */
export function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}
