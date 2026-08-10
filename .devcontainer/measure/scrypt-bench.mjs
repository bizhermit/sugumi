#!/usr/bin/env node
// T1-13: scrypt N パラメータ実測スクリプト（sec-appsec, 2026-08-10）
//
// 目的: 規約 docs/conventions.md §9.3 が「N はフェーズ1で実機のハッシュ時間を実測し、
// 目標 100〜250ms に収まる値を確定して ADR に記録する」と名指ししているため、
// node:crypto の scrypt/scryptSync で N 候補ごとのハッシュ時間・メモリ消費を実測する。
//
// 【重要】本スクリプトは実測専用であり、納品物（src/ public/ db/ docs/ やリポジトリ直下）には置かない。
// .devcontainer/ 配下にのみ存在させること（fork 利用者が同一手順で再測できるようにするための資材）。
//
// 使い方:
//   node .devcontainer/measure/scrypt-bench.mjs timing     # N候補ごとの時間測定（本測定・n=15）
//   node .devcontainer/measure/scrypt-bench.mjs concurrency # 採用N候補での同時実行メモリ実測
//
// 実装方針:
//   - r=8 / p=1 / keylen=32 は規約 §9.3 の暫定値のまま固定し、変更しない（Nのみが実測対象）。
//   - maxmem は候補ごとに「128*N*r*1.5」（既定32MiBの3〜6倍の安全域）で算出する。
//     この式は規約 §9.3 が N=2^17 に対して明示している maxmem=192*1024*1024 と厳密に一致することを確認済み
//     （128*131072*8*1.5 = 201326592 = 192*1024*1024）。式の妥当性の裏付けとして記録する。
//   - timing 測定は scryptSync を使う（アルゴリズム自体の計算コストを測るのが目的であり、
//     イベントループを塞ぐか否かは測定対象ではない。本番コードでの scryptSync 使用は規約で禁止されている。§9.3）。
//   - concurrency 測定は promisify(scrypt)（非同期版）を Promise.all で並列実行し、
//     実行中の RSS を100ms間隔でサンプリングしてピークを記録する。

import { scryptSync, scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import os from "node:os";

const scryptAsync = promisify(scryptCb);

const R = 8;
const P = 1;
const KEYLEN = 32;

function maxmemFor(n) {
  // 128*N*r*1.5 を MiB単位に切り上げてから byte に戻す（安全域を保ちつつ丸めを見える形にする）
  const raw = 128 * n * R * 1.5;
  const mib = Math.ceil(raw / (1024 * 1024));
  return mib * 1024 * 1024;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, idx)];
}

function fmtMs(ms) {
  return ms.toFixed(2);
}

function fmtMiB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function timingBench(candidates, n, warmup) {
  console.log(
    `# timing bench: n=${n} warmup=${warmup} r=${R} p=${P} keylen=${KEYLEN}`,
  );
  console.log(
    `# host: ${os.cpus()[0]?.model} x${os.cpus().length} / node ${process.version} / ${new Date().toISOString()}`,
  );
  const results = [];
  for (const N of candidates) {
    const maxmem = maxmemFor(N);
    const password = "bench-password-not-real";
    const salt = randomBytes(16);

    // warmup（初回実行のJITブレをここで吸収し、本測定には混ぜない）
    for (let i = 0; i < warmup; i++) {
      scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem });
    }

    const samples = [];
    for (let i = 0; i < n; i++) {
      const t0 = process.hrtime.bigint();
      scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem });
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6); // ms
    }

    const med = median(samples);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const p95 = percentile(samples, 95);

    console.log(
      `N=2^${Math.log2(N)}(${N}) maxmem=${fmtMiB(maxmem)}MiB(${maxmem}) ` +
        `median=${fmtMs(med)}ms min=${fmtMs(min)}ms max=${fmtMs(max)}ms p95=${fmtMs(p95)}ms ` +
        `samples_ms=[${samples.map(fmtMs).join(",")}]`,
    );
    results.push({ N, maxmem, samples, median: med, min, max, p95 });
  }
  return results;
}

async function concurrencyBench(N, concurrencyLevels, trialsPerLevel) {
  const maxmem = maxmemFor(N);
  console.log(
    `\n# concurrency bench: N=2^${Math.log2(N)}(${N}) maxmem=${fmtMiB(maxmem)}MiB r=${R} p=${P} keylen=${KEYLEN}`,
  );
  console.log(
    `# host: ${os.cpus()[0]?.model} x${os.cpus().length} / node ${process.version} / ${new Date().toISOString()}`,
  );

  for (const c of concurrencyLevels) {
    for (let trial = 1; trial <= trialsPerLevel; trial++) {
      let peakRss = process.memoryUsage().rss;
      const sampler = setInterval(() => {
        const rss = process.memoryUsage().rss;
        if (rss > peakRss) peakRss = rss;
      }, 20);

      const t0 = process.hrtime.bigint();
      const jobs = [];
      for (let i = 0; i < c; i++) {
        const salt = randomBytes(16);
        jobs.push(
          scryptAsync(`bench-password-${i}`, salt, KEYLEN, {
            N,
            r: R,
            p: P,
            maxmem,
          }),
        );
      }
      await Promise.all(jobs);
      const t1 = process.hrtime.bigint();

      clearInterval(sampler);
      const wallMs = Number(t1 - t0) / 1e6;
      console.log(
        `concurrency=${c} trial=${trial} wall=${fmtMs(wallMs)}ms peakRSS=${fmtMiB(peakRss)}MiB(${peakRss}) ` +
          `theoreticalScryptBuffers=${fmtMiB(c * 128 * N * R)}MiB`,
      );
    }
  }
}

const mode = process.argv[2];

if (mode === "timing") {
  const n = process.argv[3] ? Number(process.argv[3]) : 15;
  const candidates = process.argv[4]
    ? process.argv[4].split(",").map(Number)
    : [2 ** 14, 2 ** 15, 2 ** 16, 2 ** 17, 2 ** 18];
  timingBench(candidates, n, 3);
} else if (mode === "concurrency") {
  const N = process.argv[3] ? Number(process.argv[3]) : 2 ** 17;
  await concurrencyBench(N, [1, 2, 4, 8, 16], 3);
} else {
  console.log("usage: node scrypt-bench.mjs <timing|concurrency> [N]");
  process.exit(1);
}
