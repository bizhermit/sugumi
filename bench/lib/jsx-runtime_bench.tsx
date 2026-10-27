// ページの大きさに比例する部分を測るので、一覧画面を想定して 1000 行の表を組み立てる。
const ROWS = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `ユーザー ${i}`,
  // エスケープが必要な値と不要な値を混ぜる。
  note: i % 10 === 0 ? `<b>"注意"</b> & 'メモ'` : "特になし",
  active: i % 2 === 0,
}));

function Row({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <tr class={row.active ? "active" : undefined}>
      <td>{row.id}</td>
      <td>
        <a href={`/users/${row.id}`}>{row.name}</a>
      </td>
      <td>{row.note}</td>
      <td>
        <input type="checkbox" name="ids" value={row.id} checked={row.active} />
      </td>
    </tr>
  );
}

Deno.bench("1000 行の表（要素を直接書く）", { group: "table", baseline: true }, () => {
  <table>
    <tbody>
      {ROWS.map((row) => (
        <tr class={row.active ? "active" : undefined}>
          <td>{row.id}</td>
          <td>
            <a href={`/users/${row.id}`}>{row.name}</a>
          </td>
          <td>{row.note}</td>
          <td>
            <input type="checkbox" name="ids" value={row.id} checked={row.active} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>;
});

Deno.bench("1000 行の表（行をコンポーネントにする）", { group: "table" }, () => {
  <table>
    <tbody>{ROWS.map((row) => <Row row={row} />)}</tbody>
  </table>;
});

Deno.bench("1000 行の表（属性を展開する）", { group: "table" }, () => {
  <table>
    <tbody>
      {ROWS.map((row) => {
        const attrs = {
          type: "checkbox" as const,
          name: "ids",
          value: row.id,
          checked: row.active,
        };
        return (
          <tr>
            <td>{row.note}</td>
            <td>
              <input {...attrs} />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>;
});
