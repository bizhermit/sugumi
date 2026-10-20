# 本番

リポジトリ直下の `compose.yaml` で、アプリ（`app/`）と DB（`db/`）のコンテナを起動する。

## 手順

1. `docker/.env.example` を `docker/.env` にコピーし、値を書く（コミットしない）。
   - 書く値は「[docker/.env の値](#dockerenv-の値)」を参照。
   - AWS のパラメータストアなどから作ってもよい。

   ```sh
   cp docker/.env.example docker/.env
   chmod 600 docker/.env
   ```

2. 起動する。初回は DB にアプリ用のユーザーとスキーマが作られ、アプリの起動時にテーブルが作られる。

   ```sh
   docker compose --env-file docker/.env up -d --build
   ```

3. HTTPS を受けるリバースプロキシを同じサーバーに置き、`127.0.0.1:3000` へ転送する。
   - Cookie に Secure を付けているため、HTTP のままではログインできない。
   - 利用者のアドレスを監査ログに出すには、「[接続元の IP アドレス](#接続元の-ip-アドレス)」の設定をする。

- パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- DB の初期化は、データのボリュームが空のときにだけ行われる。
  - あとからパスワードを変えるときは、`docker/.env` を書き換える。
  - そのうえで、管理者で `ALTER ROLE` を実行する。

## docker/.env の値

- 値は単一引用符で囲む。囲まないと `$` が変数として展開される。値に `'` は使えない。
- 「必須」の値を空のままにすると起動しない。

| 名前                         | 必須 | 内容                                                                                    |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------- |
| `DB_ADMIN_PASSWORD`          | ○    | DB の管理者のパスワード                                                                 |
| `DB_APP_PASSWORD`            | ○    | アプリが DB に接続するユーザー `app` のパスワード                                       |
| `APP_NETWORK_SUBNET`         | ○    | アプリのコンテナを置くネットワークの範囲（例：`172.30.255.0/24`）                       |
| `APP_NETWORK_GATEWAY`        | ○    | そのネットワークのゲートウェイ。ふつうは範囲の最初のアドレス（例：`172.30.255.1`）      |
| `TRUSTED_PROXIES`            |      | 信頼するプロキシの IP アドレス。「[接続元の IP アドレス](#接続元の-ip-アドレス)」を参照 |
| `LOGIN_LOCKOUT_MINUTES` ほか |      | アプリの設定。書かなければ既定値を使う。意味と既定値は `src/lib/env.ts` を参照          |

### APP_NETWORK_SUBNET・APP_NETWORK_GATEWAY

- サーバーのほかのネットワーク（ほかの Docker のネットワーク、LAN、VPN）と重ならない範囲を選ぶ。
  - 使われている範囲は、`ip route` や `docker network inspect` で確かめる。
  - 重なると、起動時に `Pool overlaps` のエラーになる。
- 同じサーバーのリバースプロキシから `127.0.0.1:3000`
  へ転送すると、アプリにはゲートウェイのアドレスから接続したように見える。
  - ネットワークを作り直すたびにこのアドレスが変わらないよう、固定している。

## 接続元の IP アドレス

リバースプロキシの裏では、アプリから見た接続元はすべてプロキシ（`APP_NETWORK_GATEWAY`）になる。
利用者のアドレスを監査ログに出すには、次の 2 つを両方とも行う。

1. リバースプロキシで、X-Forwarded-For の右端に接続元を追記するか、接続元だけで上書きする。
   - nginx の例：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（追記）、
     `proxy_set_header X-Forwarded-For $remote_addr;`（上書き）
   - 利用者が送った値をそのまま転送すると、利用者がどの IP アドレスでも名乗れる。
   - nginx は `proxy_set_header` を書かないと、利用者が送った値をそのまま転送する。
   - nginx の `proxy_set_header` は、location に 1 つでも書くと、server や http
     に書いたものを引き継がない。 `proxy_pass` を書くすべての location に書く。
2. `docker/.env` の `TRUSTED_PROXIES` に、`APP_NETWORK_GATEWAY` と同じ値を書く。
   - カンマ区切りで複数書ける。CIDR（例：`10.0.1.0/24`）でも書ける。
   - IPv4 は `/8`、IPv6 は `/32` より広い範囲は書けない（起動時にエラーになる）。

設定したら、ブラウザの拡張機能などで `X-Forwarded-For: 192.0.2.1` を付けてログインする。
`docker compose logs app` の監査ログで、`remoteAddress` が自分のアドレスになることを確かめる。

- `192.0.2.1` なら、リバースプロキシが利用者の値をそのまま転送している（1 が抜けている）。
- `APP_NETWORK_GATEWAY` の値なら、`TRUSTED_PROXIES` が合っていない（2 が抜けている）。

### 注意

アプリは、`TRUSTED_PROXIES` のアドレスから届いた X-Forwarded-For
を信用する。次の場合は接続元を偽れる。

- `TRUSTED_PROXIES` にプロキシ以外のアドレスを含めたとき：その範囲の端末は、X-Forwarded-For
  を書いて送れば偽れる。 プロキシのアドレスだけを書く。
- 同じサーバーのプロセス：`127.0.0.1:3000` に直接つなぐと、どれも `APP_NETWORK_GATEWAY`
  から届くため偽れる。 信頼しない利用者やサービスを同じサーバーに置かない。
- `compose.yaml` の ports を `127.0.0.1`
  以外にも公開したとき：外からの接続もゲートウェイから届く場合があり、偽れる。 公開するなら
  `TRUSTED_PROXIES` を外す。
