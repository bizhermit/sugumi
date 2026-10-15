/** HTML の本文と、引用符で囲んだ属性値のどちらにも埋め込める形にする。 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
