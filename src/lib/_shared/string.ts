const segmenter = new Intl.Segmenter();

export function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

/**
 * ダッシュに見える文字（‐〜―、−、ー）をハイフン（-）に変換する。
 */
export function toHyphen(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212\u30fc]/g, "-");
}

/**
 * 全角の英数字と記号（！〜～）と全角スペースを半角に変換する。
 */
export function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}
