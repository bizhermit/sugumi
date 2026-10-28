# 本番のイメージ（app・log-forwarder・db・lb）を作る。docker/scripts/build-images から使う（docker/README/build.md を参照）。
# context は実行したディレクトリからの相対パスなので、リポジトリのルートで -f docker/bake.hcl を付けて実行する。
#
# 各サーバーの compose.yaml は、ここで付けた名前とタグでイメージを取得する。
# IMAGE_PREFIX にはレジストリとアプリの名前（例：registry.example.com/myapp）を入れ、ここにはアプリの名前を書かない。
# このリポジトリはテンプレートで、アプリの名前は使う側で決めるため。

variable "IMAGE_PREFIX" {
  validation {
    condition     = IMAGE_PREFIX != ""
    error_message = "IMAGE_PREFIX を指定してください"
  }
}

variable "IMAGE_TAG" {
  validation {
    condition     = IMAGE_TAG != ""
    error_message = "IMAGE_TAG を指定してください"
  }
}

group "default" {
  targets = ["app", "db", "log-forwarder", "lb"]
}

target "app" {
  # src/ などを含めるため、コンテキストはリポジトリのルートにする
  context    = "."
  dockerfile = "docker/app/Dockerfile"
  tags       = ["${IMAGE_PREFIX}/app:${IMAGE_TAG}"]
}

target "db" {
  context = "docker/db"
  tags    = ["${IMAGE_PREFIX}/db:${IMAGE_TAG}"]
}

target "log-forwarder" {
  context = "docker/log-forwarder"
  tags    = ["${IMAGE_PREFIX}/log-forwarder:${IMAGE_TAG}"]
}

target "lb" {
  context = "docker/lb"
  tags    = ["${IMAGE_PREFIX}/lb:${IMAGE_TAG}"]
}
