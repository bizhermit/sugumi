import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jsx, withAssets, type Html } from "#jsx/jsx-runtime";

// withAssets のテスト用の部品。
const FORM = { styles: ["/_assets/form.css"], scripts: ["/_assets/form.js"] };
const FIELD = { styles: ["/_assets/field.css"] };

function Form(): Html {
  return withAssets(<form></form>, FORM);
}

function Field(): Html {
  return withAssets(<input />, FIELD);
}

function Outer(): Html {
  return withAssets(
    <div>
      <Field />
    </div>,
    FORM,
  );
}

function maybeForm(showForm: boolean): Html {
  return <div>{showForm ? <Form /> : <p>なし</p>}</div>;
}

describe("jsx", () => {
  it("要素と属性", () => {
    assert.equal((<p id="x">a</p>).value, '<p id="x">a</p>');
  });

  it("空要素は閉じタグを出さない", () => {
    assert.equal((<input name="x" />).value, '<input name="x">');
  });

  it("子の文字列と属性値をエスケープする", () => {
    assert.equal((<p title={'<"&>'}>{"<a&b>"}</p>).value, '<p title="&lt;&quot;&amp;&gt;">&lt;a&amp;b&gt;</p>');
  });

  it("Htmlはエスケープせずそのまま埋め込む", () => {
    const inner = <b>x</b>;
    assert.equal((<p>{inner}</p>).value, "<p><b>x</b></p>");
  });

  it("真偽値の属性", () => {
    assert.equal((<input required={true} disabled={false} />).value, "<input required>");
    assert.equal((<p aria-busy={true} aria-hidden={false}></p>).value, '<p aria-busy="true" aria-hidden="false"></p>');
  });

  it("null/undefinedの属性は出さない", () => {
    // 型では null を許していないので、ランタイムを直接呼ぶ。
    assert.equal(jsx("p", { id: null, title: undefined }).value, "<p></p>");
  });

  it("配列・null・真偽値の子", () => {
    assert.equal((<ul>{[<li>a</li>, null, false, <li>b</li>]}</ul>).value, "<ul><li>a</li><li>b</li></ul>");
  });

  it("コンポーネントの戻り値が文字列ならエスケープする", () => {
    // 型では Html 以外を返すコンポーネントを許していないので、ランタイムを直接呼ぶ。
    assert.equal(jsx(() => "<b>x</b>", {}).value, "&lt;b&gt;x&lt;/b&gt;");
  });

  it("フラグメント", () => {
    assert.equal(
      (
        <>
          <p>a</p>
          <p>b</p>
        </>
      ).value,
      "<p>a</p><p>b</p>",
    );
  });
});

describe("className", () => {
  it("文字列はそのままclassにする", () => {
    assert.equal((<p className="hoge fuga"></p>).value, '<p class="hoge fuga"></p>');
  });

  it("配列は空白でつなぎ、false・null・undefinedは含まれない", () => {
    assert.equal((<p className={["hoge", false, null, undefined, "fuga"]}></p>).value, '<p class="hoge fuga"></p>');
  });

  it("空なら属性ごと設定しない", () => {
    assert.equal((<p className=""></p>).value, "<p></p>");
    assert.equal((<p className={[false, undefined]}></p>).value, "<p></p>");
    assert.equal(jsx("p", { className: undefined }).value, "<p></p>");
  });

  it("値をエスケープする", () => {
    assert.equal((<p className={['a"b']}></p>).value, '<p class="a&quot;b"></p>');
  });

  it("classNameは入れ子配列に対応する", () => {
    assert.equal(
      (<p className={["a", ["b", false, "c", ["d", "e"]], undefined]}></p>).value,
      '<p class="a b c d e"></p>',
    );
  });

  it("文字列以外は例外", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const bad = [1] as unknown as string[];
    assert.throws(() => <p className={bad}></p>, TypeError);
  });
});

describe("withAssets", () => {
  it("使用しているコンポーネントのアセットが設定される", () => {
    const html = (
      <div>
        <Form />
      </div>
    );
    assert.deepEqual(html.assets, [FORM]);
  });

  it("使用しないコンポーネントのアセットは設定されない", () => {
    assert.deepEqual(maybeForm(false).assets, []);
    assert.deepEqual(maybeForm(true).assets, [FORM]);
  });

  it("同一コンポーネントのアセットの重複設定を防ぐ", () => {
    const html = (
      <div>
        <Form />
        <Form />
      </div>
    );
    assert.deepEqual(html.assets, [FORM]);
  });

  it("親コンポーネントと子コンポーネントのアセットの順番（親→子の順）", () => {
    assert.deepEqual((<Outer />).assets, [FORM, FIELD]);
  });

  it("フラグメントと配列を通してもアセットが設定される", () => {
    const html = (
      <>
        {[<Field />]}
        <Form />
      </>
    );
    assert.deepEqual(html.assets, [FIELD, FORM]);
  });
});
