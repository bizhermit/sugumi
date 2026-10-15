# 更新時は `docker buildx imagetools inspect ubuntu:26.04` で manifest list のダイジェストを取得して置き換える
FROM ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Tokyo \
    LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8

# 基本ツール
RUN apt-get update && apt-get install -y --no-install-recommends \
        # --no-install-recommends では curl に付随して入らないため明示が必要
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
        # Playwright の venv でも使用
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
# 公式 install.sh (curl | sh) は改ざん検知ができないため使わず、チェックサムを検証して配置する
ARG DENO_VERSION=latest
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
# - Node.js を入れないため Python 版を使う
# - システム Python には pip install できない (externally managed) ため venv に導入する
# - ブラウザは dev ユーザーからも参照できるよう共有パスに置く
# - fonts-noto-cjk はスクリーンショットの日本語表示用
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv fonts-noto-cjk \
    && python3 -m venv /opt/playwright \
    && /opt/playwright/bin/pip install --no-cache-dir playwright \
    && ln -s /opt/playwright/bin/playwright /usr/local/bin/playwright \
    && playwright install --with-deps chromium \
    && chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}" \
    && rm -rf /var/lib/apt/lists/*

# 開発用ユーザー
# - ubuntu ユーザーは最初から sudo グループ等に所属しているため削除し、最小権限で作り直す
# - UID / GID は .devcontainer/.env でホスト側に合わせる
ARG UID=1000
ARG GID=1000
RUN userdel -r ubuntu \
    && if getent group ubuntu > /dev/null; then groupdel ubuntu; fi \
    && groupadd -g "${GID}" dev \
    && useradd -m -s /bin/bash -u "${UID}" -g "${GID}" dev \
    # ボリュームのマウントポイント。dev 所有で作っておかないと初回マウント時に root 所有になる
    && mkdir -p /home/dev/.claude /home/dev/.config/gh \
    && chown -R "${UID}:${GID}" /home/dev

# sudo 権限は与えない。必要な場合のみ以下を有効にして Rebuild する
# RUN echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev \
#     && chmod 0440 /etc/sudoers.d/dev

USER dev

# Claude Code
ARG CLAUDE_CODE_VERSION=stable
RUN curl -fsSL https://claude.ai/install.sh | bash -s -- "${CLAUDE_CODE_VERSION}"
ENV PATH="/home/dev/.local/bin:${PATH}"

WORKDIR /workspace
