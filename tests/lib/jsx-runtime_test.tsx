import assert from "node:assert/strict";
import { type Html, jsx, jsxAttr, jsxEscape } from "../../src/lib/jsx-runtime.ts";

const ATTACK = `<script>alert("x")</script>&'`;
const ESCAPED = "&#60;script&#62;alert(&#34;x&#34;)&#60;/script&#62;&#38;&#39;";

Deno.test("jsx: 埋め込んだ文字列は、本文でも属性でもエスケープする", () => {
  assert.equal((<p>{ATTACK}</p>).value, `<p>${ESCAPED}</p>`);
  assert.equal((<a href={ATTACK}>x</a>).value, `<a href="${ESCAPED}">x</a>`);
  assert.equal((<input value={`" onfocus="x`} />).value, `<input value="&#34; onfocus=&#34;x">`);
});

Deno.test("jsx: Html はエスケープせずに埋め込み、配列は連結する", () => {
  const tag = "<i>";
  const inner = <b>{tag}</b>;
  assert.equal((<p>{inner}</p>).value, "<p><b>&#60;i&#62;</b></p>");
  assert.equal((<ul>{[tag, <li>b</li>, 1]}</ul>).value, "<ul>&#60;i&#62;<li>b</li>1</ul>");
  assert.equal(
    (<>
      {tag}
      <br />
    </>).value,
    "&#60;i&#62;<br>",
  );
  // JSX に直接書いた文字列は、変換するときにエスケープされる
  assert.equal((<p>{"<i>"}</p>).value, "<p>&lt;i&gt;</p>");
});

Deno.test("jsx: true・false・null・undefined は本文に出さない", () => {
  assert.equal((<p>{true}{false}{null}{undefined}{0}</p>).value, "<p>0</p>");
});

Deno.test("jsx: 真偽値の属性は名前だけにし、aria-* は true・false を文字列で出す", () => {
  const off = false;
  // 出力しない属性の位置には空白が残る
  assert.equal((<input required disabled={off} />).value, "<input required >");
  assert.equal(
    (<button type="button" aria-pressed={false} aria-busy>x</button>).value,
    `<button type="button" aria-pressed="false" aria-busy="true">x</button>`,
  );
  assert.equal((<input value={undefined} maxlength={10} />).value, `<input  maxlength="10">`);
});

Deno.test("jsx: 空要素は閉じタグを付けない", () => {
  assert.equal(
    (<p>
      a<br />b<img src="/x.png" alt="" />
    </p>).value,
    `<p>a<br>b<img src="/x.png" alt=""></p>`,
  );
  const props = { name: "q" };
  assert.equal((<input {...props} />).value, `<input name="q">`);
});

Deno.test("jsx: コンポーネントが文字列を返しても、HTML としては扱わない", () => {
  const Raw = () => "<b>x</b>" as unknown as Html;
  assert.equal(
    (<p>
      <Raw />
    </p>).value,
    "<p>&#60;b&#62;x&#60;/b&#62;</p>",
  );
  const Echo = ({ children }: { children?: unknown }) => <span>{children}</span>;
  assert.equal((<Echo>{"<y>"}</Echo>).value, "<span>&#60;y&#62;</span>");
});

Deno.test("jsx: 属性を展開しても、属性名に使えない文字や埋め込めない値は例外にする", () => {
  for (const name of ["onclick=alert(1) x", `a"b`, "a>b", "a/b", "a\nb"]) {
    const props = { [name]: "1" };
    assert.throws(() => <div {...props} />, /属性名に使えません/, name);
  }
  assert.throws(() => jsxAttr("data-x", { toString: () => "x" }), /使えない値です/);
  assert.throws(() => jsxEscape({ toString: () => "<b>" }), /JSX に埋め込めない値です/);
  assert.throws(() => jsxEscape(() => "x"), /JSX に埋め込めない値です/);
});

Deno.test("jsx: 記号が先頭・末尾・連続にあっても、ほかの文字を変えずにエスケープする", () => {
  for (
    const [value, escaped] of [
      ["<", "&#60;"],
      ["&&a", "&#38;&#38;a"],
      ["a\"'", "a&#34;&#39;"],
      ["<>x<>", "&#60;&#62;x&#60;&#62;"],
      ["😀<😀", "😀&#60;😀"],
      ["", ""],
      ["日本語", "日本語"],
    ]
  ) {
    assert.equal(jsxEscape(value), escaped, value);
    assert.equal(jsxAttr("title", value), `title="${escaped}"`, value);
  }
});

Deno.test("jsx: 属性の展開では、自身のプロパティだけを書いた順に出力する", () => {
  const props = Object.create({ inherited: "x" });
  props.b = "1";
  props.a = "2";
  assert.equal((<p {...props} />).value, `<p b="1" a="2"></p>`);
  // JSX の展開は自身のプロパティだけを写すため、継承したプロパティは jsx() を直接呼んで確かめる
  assert.equal(jsx("p", props).value, `<p b="1" a="2"></p>`);
});
