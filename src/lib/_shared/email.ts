const ATEXT = "[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]";
const DOT_STRING = new RegExp(`^${ATEXT}+(?:\\.${ATEXT}+)*$`);
const QUOTED_STRING = /^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/;
const SUB_DOMAIN = "[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?";
const DOMAIN = new RegExp(`^(?:${SUB_DOMAIN}\\.)+${SUB_DOMAIN}$`);
const LOCAL_PART_MAX_LENGTH = 64;
const DOMAIN_MAX_LENGTH = 255;
const LABEL_MAX_LENGTH = 63;
const IPV6_GROUP_COUNT = 8;

function isIpv4Address(value: string): boolean {
  const groups = value.split(".");
  return groups.length === 4 && groups.every((group) => /^(0|[1-9]\d{0,2})$/.test(group) && Number(group) <= 255);
}

function isIpv6Address(value: string): boolean {
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  let count = groups.length;
  if (groups.at(-1)?.includes(".")) {
    if (!isIpv4Address(groups.pop() ?? "")) return false;
    count += 1;
  }
  if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  // RFC 5321 では "::" が省略するのは 2 グループ以上。
  return halves.length === 2 ? count <= IPV6_GROUP_COUNT - 2 : count === IPV6_GROUP_COUNT;
}

function isAddressLiteral(value: string): boolean {
  if (value.startsWith("IPv6:")) return isIpv6Address(value.slice("IPv6:".length));
  return isIpv4Address(value);
}

function isDomain(value: string): boolean {
  if (value.length > DOMAIN_MAX_LENGTH || !DOMAIN.test(value)) return false;
  const labels = value.split(".");
  return labels.every((label) => label.length <= LABEL_MAX_LENGTH) && !/^\d+$/.test(labels.at(-1) ?? "");
}

/**
 * RFC 5321 の Mailbox 文法で判定する。
 */
export function isEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (localPart.length > LOCAL_PART_MAX_LENGTH) return false;
  if (!DOT_STRING.test(localPart) && !QUOTED_STRING.test(localPart)) return false;
  if (domain.startsWith("[") && domain.endsWith("]")) return isAddressLiteral(domain.slice(1, -1));
  return isDomain(domain);
}
