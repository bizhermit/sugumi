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
    xz-utils \
    libatomic1 \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Node.js
# 公式のtar.xzをダウンロードし、SHASUMS256.txtでチェックサムを確かめてから/usr/localに展開する。
ARG NODE_VERSION=26.13.0
RUN case "$(dpkg --print-architecture)" in \
        amd64) target=linux-x64 ;; \
        arm64) target=linux-arm64 ;; \
        *) echo "未対応のアーキテクチャです: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
    && cd /tmp \
    && file="node-v${NODE_VERSION}-${target}.tar.xz" \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${file}" -o "${file}" \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt \
    && grep " ${file}\$" SHASUMS256.txt | sha256sum --check \
    && tar -xJf "${file}" -C /usr/local --strip-components=1 --no-same-owner \
    && rm -f "${file}" SHASUMS256.txt /usr/local/CHANGELOG.md /usr/local/LICENSE /usr/local/README.md

# npm install -g の先を開発用ユーザーのホームにする（/usr/localはroot所有のため）。
ENV NPM_CONFIG_PREFIX=/home/dev/.local

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
