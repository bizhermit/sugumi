# 更新するときはダイジェストを取得して置き換える。
# > docker buildx imagetools inspect ubuntu:26.04
FROM ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Tokyo \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    openssh-client \
    less \
    procps \
    unzip \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Deno
# install.sh（curl|sh）は改竄を検知できないので、zipをダウンロードしてチェックサムを確かめる。
ARG DENO_VERSION=2.9.7
RUN case "$(dpkg --print-architecture)" in \
        amd64) target=x86_64-unknown-linux-gnu ;; \
        arm64) target=aarch64-unknown-linux-gnu ;; \
        *) echo "未対応のアーキテクチャです: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
    && cd /tmp \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${target}.zip" -o "deno-${target}.zip" \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${target}.zip.sha256sum" -o "deno-${target}.zip.sha256sum" \
    && sha256sum --check "deno-${target}.zip.sha256sum" \
    && unzip -o "deno-${target}.zip" -d /usr/local/bin \
    && chmod 0755 /usr/local/bin/deno \
    && rm -f "deno-${target}.zip" "deno-${target}.zip.sha256sum"

# 開発用ユーザー
# ubuntuユーザーはsudoグループに入っているので消し、最小限の権限で作り直す。
ARG UID=1000
ARG GID=1000
RUN userdel -r ubuntu \
    && if getent group ubuntu > /dev/null; then groupdel ubuntu; fi \
    && groupadd -g "${GID}" dev \
    && useradd -m -s /bin/bash -u "${UID}" -g "${GID}" dev \
    # 初回マウントでボリュームのマウント先がroot所有になるのを避けるため、dev所有で作成しておく。
    && mkdir -p /home/dev/.claude /home/dev/.config/gh \
    && chown -R "${UID}:${GID}" /home/dev

USER dev

# Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/dev/.local/bin:${PATH}"

WORKDIR /workspace
