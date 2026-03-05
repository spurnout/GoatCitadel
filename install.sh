#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/spurnout/GoatCitadel.git"
BASE_DIR="${HOME}/.GoatCitadel"
APP_DIR="${BASE_DIR}/app"
BIN_DIR="${BASE_DIR}/bin"
INSTALL_METHOD="git"
NO_PATH_UPDATE="0"
PNPM_VERSION="10.29.3"

print_help() {
  cat <<'EOF'
GoatCitadel installer

Usage:
  install.sh [options]

Options:
  --repo <url>              Repository URL (default: https://github.com/spurnout/GoatCitadel.git)
  --install-dir <path>      Base install directory (default: ~/.GoatCitadel)
  --install-method <name>   Install method (supported: git)
  --no-path-update          Do not modify shell profile PATH
  --help                    Show this help

Examples:
  curl -fsSL https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.sh | bash -s -- --install-method git
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_URL="${2:-}"
      shift 2
      ;;
    --install-dir)
      BASE_DIR="${2:-}"
      APP_DIR="${BASE_DIR}/app"
      BIN_DIR="${BASE_DIR}/bin"
      shift 2
      ;;
    --install-method)
      INSTALL_METHOD="${2:-}"
      shift 2
      ;;
    --no-path-update)
      NO_PATH_UPDATE="1"
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

if [[ "${INSTALL_METHOD}" != "git" ]]; then
  echo "Unsupported --install-method '${INSTALL_METHOD}'. Only 'git' is currently supported." >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd node
require_cmd corepack

mkdir -p "${BASE_DIR}" "${BIN_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "Updating existing GoatCitadel install in ${APP_DIR}..."
  git -C "${APP_DIR}" fetch --all --prune
  git -C "${APP_DIR}" pull --ff-only
else
  if [[ -d "${APP_DIR}" ]]; then
    echo "Removing non-git directory at ${APP_DIR}..."
    rm -rf "${APP_DIR}"
  fi
  echo "Cloning GoatCitadel from ${REPO_URL}..."
  git clone "${REPO_URL}" "${APP_DIR}"
fi

echo "Preparing pnpm (${PNPM_VERSION})..."
corepack enable >/dev/null 2>&1 || true
corepack prepare "pnpm@${PNPM_VERSION}" --activate

echo "Installing workspace dependencies..."
pnpm --dir "${APP_DIR}" install --frozen-lockfile

cat > "${BIN_DIR}/goatcitadel" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export GOATCITADEL_HOME="${BASE_DIR}"
exec node "${APP_DIR}/bin/goatcitadel.mjs" "\$@"
EOF

chmod +x "${BIN_DIR}/goatcitadel"
cp "${BIN_DIR}/goatcitadel" "${BIN_DIR}/gc"
chmod +x "${BIN_DIR}/gc"

if [[ "${NO_PATH_UPDATE}" == "0" ]]; then
  SHELL_NAME="$(basename "${SHELL:-}")"
  PROFILE_FILE=""
  if [[ "${SHELL_NAME}" == "zsh" ]]; then
    PROFILE_FILE="${HOME}/.zshrc"
  elif [[ "${SHELL_NAME}" == "bash" ]]; then
    PROFILE_FILE="${HOME}/.bashrc"
  else
    PROFILE_FILE="${HOME}/.profile"
  fi

  PATH_LINE="export PATH=\"${BIN_DIR}:\$PATH\""
  if [[ -f "${PROFILE_FILE}" ]]; then
    if ! grep -F "${BIN_DIR}" "${PROFILE_FILE}" >/dev/null 2>&1; then
      printf "\n# GoatCitadel\n%s\n" "${PATH_LINE}" >> "${PROFILE_FILE}"
    fi
  else
    printf "# GoatCitadel\n%s\n" "${PATH_LINE}" > "${PROFILE_FILE}"
  fi
fi

echo ""
echo "GoatCitadel install complete."
echo "Install directory: ${APP_DIR}"
echo "Launcher: ${BIN_DIR}/goatcitadel"
echo ""
echo "Run:"
echo "  ${BIN_DIR}/goatcitadel onboard"
echo "  ${BIN_DIR}/goatcitadel up"
echo "  ${BIN_DIR}/goatcitadel doctor --deep"
echo "  ${BIN_DIR}/gc onboard"
echo "  ${BIN_DIR}/gc up"
