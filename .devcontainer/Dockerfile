# 更新時は `docker buildx imagetools inspect ubuntu:26.04` で manifest list のダイジェストを取得して置き換える。
FROM ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Tokyo \
    LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8

# 基本ツール
RUN apt-get update && apt-get install -y --no-install-recommends \
        # --no-install-recommends では curl と一緒に入らないので、明示する。
        ca-certificates \
        curl \
        git \
        # postStart.sh が案内する gh auth login --git-protocol ssh で使用
        openssh-client \
        # git / gh のページャ
        less \
        # VS Code Server が使用
        procps \
        unzip \
        locales \
        tzdata \
        # deno task migrate・migrate:test が docker/db/bin/db-migrate で使用。DB のイメージ（docker/db/Dockerfile）とメジャーバージョンを揃える。
        postgresql-client-18 \
        # postCreate.sh が使用
        python3 \
        python3-openpyxl \
        python3-pil \
    && locale-gen ja_JP.UTF-8 \
    && ln -fs /usr/share/zoneinfo/Asia/Tokyo /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN GH_VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/cli/cli/releases/latest | grep -oP 'v\K[\d.]+') \
    && ARCH=$(dpkg --print-architecture) \
    && cd /tmp \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${ARCH}.tar.gz" -o "gh_${GH_VERSION}_linux_${ARCH}.tar.gz" \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_checksums.txt" -o gh_checksums.txt \
    && sha256sum --check --ignore-missing gh_checksums.txt \
    && tar -xzf "gh_${GH_VERSION}_linux_${ARCH}.tar.gz" \
    && mv "gh_${GH_VERSION}_linux_${ARCH}/bin/gh" /usr/local/bin/ \
    && rm -rf "gh_${GH_VERSION}_linux_${ARCH}.tar.gz" gh_checksums.txt "gh_${GH_VERSION}_linux_${ARCH}"

# Deno
# 公式の install.sh (curl | sh) は改ざんを検知できないので使わず、チェックサムを検証して配置する。
# docker/app/Dockerfile のイメージ・.github/workflows/ci.yml の deno-version と揃える。
ARG DENO_VERSION=2.9.7
RUN if [ "${DENO_VERSION}" = "latest" ]; then \
        DENO_VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/denoland/deno/releases/latest | grep -oP 'v\K[\d.]+'); \
    fi \
    && DENO_VERSION="${DENO_VERSION#v}" \
    && case "$(dpkg --print-architecture)" in \
        amd64) DENO_TARGET=x86_64-unknown-linux-gnu ;; \
        arm64) DENO_TARGET=aarch64-unknown-linux-gnu ;; \
        *) echo "未対応のアーキテクチャです: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
    && cd /tmp \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${DENO_TARGET}.zip" -o "deno-${DENO_TARGET}.zip" \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${DENO_TARGET}.zip.sha256sum" -o deno_checksum.txt \
    && sha256sum --check deno_checksum.txt \
    && unzip -o "deno-${DENO_TARGET}.zip" -d /usr/local/bin \
    && chmod 0755 /usr/local/bin/deno \
    && rm -f "deno-${DENO_TARGET}.zip" deno_checksum.txt

# Playwright
# - e2e/deno.json の imports のバージョンを、e2e/deno.lock でハッシュを確かめて入れる（--frozen）。
#   e2e/deno.json を変えたら Rebuild する。しないと、入れたものと別のリビジョンのブラウザを探して、起動できなくなる。
# - --with-deps は apt で OS のパッケージを入れるので、root で実行できるビルド時に入れる。
# - ブラウザは dev ユーザーからも参照できるよう、共有のパスに置く。
# - fonts-noto-cjk はスクリーンショットで日本語を表示するため。
# - root の Deno のキャッシュは dev ユーザーが使わないので消す。
# - playwright コマンド（screenshot など）は、同じものを Deno で実行するラッパーにする。
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/ms-playwright
COPY e2e/deno.json e2e/deno.lock /tmp/playwright/
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && cd /tmp/playwright \
    && spec=$(deno eval --no-config "console.log(JSON.parse(Deno.readTextFileSync('deno.json')).imports.playwright)") \
    && DENO_DIR=/tmp/deno-playwright deno run -A --frozen "${spec}" install --with-deps chromium \
    && chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}" \
    && cd / \
    && rm -rf /tmp/playwright /tmp/deno-playwright /var/lib/apt/lists/*
COPY --chmod=0755 .devcontainer/playwright /usr/local/bin/playwright

# 開発用ユーザー
# - ubuntu ユーザーは最初から sudo グループなどに入っているので、削除して最小権限で作り直す。
# - UID / GID は .devcontainer/.env でホスト側に合わせる。
ARG UID=1000
ARG GID=1000
RUN userdel -r ubuntu \
    && if getent group ubuntu > /dev/null; then groupdel ubuntu; fi \
    && groupadd -g "${GID}" dev \
    && useradd -m -s /bin/bash -u "${UID}" -g "${GID}" dev \
    # ボリュームのマウントポイント。dev の所有で作っておかないと、初回のマウントで root の所有になる。
    && mkdir -p /home/dev/.claude /home/dev/.config/gh /workspace/data \
    && chown -R "${UID}:${GID}" /home/dev /workspace/data

# sudo の権限は与えない。必要なときだけ、次の行を有効にして Rebuild する。
# RUN echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev \
#     && chmod 0440 /etc/sudoers.d/dev

USER dev

# Claude Code
ARG CLAUDE_CODE_VERSION=stable
RUN curl -fsSL https://claude.ai/install.sh | bash -s -- "${CLAUDE_CODE_VERSION}"
ENV PATH="/home/dev/.local/bin:${PATH}"

WORKDIR /workspace
