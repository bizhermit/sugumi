/**
 * 接続元ごとに、ログインの失敗回数を数えて制限する。
 * 回数は DB に置く。アプリが複数のインスタンスで動いても同じ回数を見られ、再起動しても制限が消えないようにするため。
 */
import { db, transaction } from "../db.ts";
import {
  LOGIN_IP_LOCKOUT_MINUTES,
  LOGIN_IP_MAX_FAILED_ATTEMPTS,
  LOGIN_IP_WINDOW_MINUTES,
} from "../env.ts";
import { formatIp, parseIp } from "../ip.ts";
import { logWarning } from "../log.ts";

const WINDOW_MS = LOGIN_IP_WINDOW_MINUTES * 60 * 1000;
const LOCKOUT_MS = LOGIN_IP_LOCKOUT_MINUTES * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** reserveAttempt() で数えた 1 回を表す。ログインに成功したら refundAttempt() に渡す。 */
export type Attempt = { readonly key: string; readonly windowStartedAt: Date };

/** blocks は、この回で制限を始めたとき true。key は制限の単位で、login_throttles の address の値。 */
export type ReserveResult =
  | { status: "allowed"; attempt: Attempt | undefined }
  | { status: "blocked"; blocks: boolean; key: string };

type ThrottleRow = {
  window_started_at: Date;
  failed_attempts: number;
  blocked_until: Date | null;
};

let nextSweepAt = 0;

if (LOGIN_IP_MAX_FAILED_ATTEMPTS === 0) {
  logWarning(
    "LOGIN_IP_MAX_FAILED_ATTEMPTS が 0 なので、接続元ごとのログインの試行回数を制限していません",
  );
}

/**
 * パスワードの検証の前に失敗として 1 回数え、制限中なら blocked を返す。ログインに成功したら refundAttempt() で取り消すこと。
 * 検証の後で数えると、検証している間に同時に送られたリクエストが、上限を超えて試せてしまう。
 * remoteAddress が undefined かパースできないときと、LOGIN_IP_MAX_FAILED_ATTEMPTS が 0 のときは数えない。
 * undefined をまとめて数えると、どれか 1 つの接続元が失敗しただけで、接続元が分からない全員が制限されてしまう。
 */
export async function reserveAttempt(
  remoteAddress: string | undefined,
  now: number,
): Promise<ReserveResult> {
  const key = remoteAddress === undefined ? undefined : throttleKey(remoteAddress);
  if (key === undefined || LOGIN_IP_MAX_FAILED_ATTEMPTS === 0) {
    return { status: "allowed", attempt: undefined };
  }
  await sweep(now);
  return await transaction(async (client) => {
    // 同時に送られたリクエストが同じ回数を読んで数え漏れないよう、行をロックして読む。
    // DO NOTHING のあとで SELECT ... FOR UPDATE すると、その間に sweep() が行を消したときに読めない。
    // そのため DO UPDATE を使い、行の作成と既存の行のロックを 1 つの文で行う。
    const { rows: [row] } = await client.query<ThrottleRow>(
      `INSERT INTO login_throttles (address, window_started_at, failed_attempts)
       VALUES ($1, $2, 0) ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
       RETURNING window_started_at, failed_attempts, blocked_until`,
      [key, new Date(now)],
    );
    if (row.blocked_until !== null && row.blocked_until.getTime() > now) {
      return { status: "blocked", blocks: false, key };
    }
    const expired = row.blocked_until !== null ||
      row.window_started_at.getTime() + WINDOW_MS <= now;
    const windowStartedAt = expired ? new Date(now) : row.window_started_at;
    const attempts = (expired ? 0 : row.failed_attempts) + 1;
    const blocks = attempts > LOGIN_IP_MAX_FAILED_ATTEMPTS;
    await client.query(
      `UPDATE login_throttles SET window_started_at = $1, failed_attempts = $2, blocked_until = $3
       WHERE address = $4`,
      [windowStartedAt, attempts, blocks ? new Date(now + LOCKOUT_MS) : null, key],
    );
    return blocks
      ? { status: "blocked", blocks: true, key }
      : { status: "allowed", attempt: { key, windowStartedAt } };
  });
}

/**
 * ログインに成功した回を、失敗の回数から取り消す。期間が切れて数え直したあとなら、取り消さない。
 * 0 に戻さないのは、攻撃者が自分のアカウントでときどきログインするだけで、回数を消せないようにするため。
 */
export async function refundAttempt(attempt: Attempt | undefined): Promise<void> {
  if (!attempt) return;
  await db.query(
    `UPDATE login_throttles SET failed_attempts = failed_attempts - 1
     WHERE address = $1 AND window_started_at = $2 AND failed_attempts > 0`,
    [attempt.key, attempt.windowStartedAt],
  );
}

/**
 * IPv6 は /64 ごとに数える。1 つの回線に /64 以上が割り当てられることが多いので、
 * アドレスごとに数えると、その範囲の中でアドレスを変えながら試せてしまう。
 */
function throttleKey(remoteAddress: string): string | undefined {
  const bytes = parseIp(remoteAddress);
  if (!bytes) return undefined;
  if (bytes.length === 4) return formatIp(bytes);
  const prefix = bytes.slice();
  prefix.fill(0, 8);
  return `${formatIp(prefix)}/64`;
}

async function sweep(now: number) {
  if (now < nextSweepAt) return;
  nextSweepAt = now + SWEEP_INTERVAL_MS;
  // reserveAttempt() で数え直す条件と同じく、制限が切れた行と、制限しないまま期間が過ぎた行を消す。
  await db.query(
    `DELETE FROM login_throttles
     WHERE (blocked_until IS NOT NULL AND blocked_until <= $1)
        OR (blocked_until IS NULL AND window_started_at <= $2)`,
    [new Date(now), new Date(now - WINDOW_MS)],
  );
}
