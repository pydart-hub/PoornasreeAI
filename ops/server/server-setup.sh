#!/bin/bash
set -e

echo "=== [1/4] Installing git and nginx ==="
apt-get install -y git nginx

echo "=== [2/4] Cloning repository ==="
if [ -d "/root/poornasree-ai/.git" ]; then
  echo "Repo already cloned — skipping."
else
  git clone https://github.com/stibe-labs/PoornasreeAI.git /root/poornasree-ai
fi

cd /root/poornasree-ai
git fetch origin
git checkout AIpoorna
git reset --hard origin/AIpoorna

echo "=== [3/4] Creating .env files ==="
cat > /root/poornasree-ai/.env << 'ENVEOF'
# Docker Compose environment
POSTGRES_USER=poorna_user
POSTGRES_PASSWORD=poorna_secure_pass_2026
POSTGRES_DB=poornasree_ai
JWT_SECRET=RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://ai.poornasreecloud.com
NEXT_PUBLIC_API_URL=
WA_PHONE_NUMBER_ID=1078437758683658
WA_ACCESS_TOKEN=EAAc5q7ImYEwBREQVxKz2qv8IlupQQh40FhfIR36WiOK4grfz6V6ZBd4j99qNZASthYpouxCUksZAAQvRLPL7RZBU9G7mdQxaA0soWnPfhaVarqfpV0p3dW4tYznpmvs1KMAtafMYcErFUuIHMn2ow1YdMstp6TJRmWChF5ICUrLfgdBLGjUEaYTfN2HZCxDziAwZDZD
WA_VERIFY_TOKEN=psr_chatbot_verify_2026
FRONTEND_URL=https://ai.poornasreecloud.com
ENVEOF

echo "=== [4/4] Enabling nginx ==="
systemctl enable nginx
systemctl start nginx || true

echo ""
echo "=== Server setup complete! ==="
echo "Repo: /root/poornasree-ai"
echo "Run deploy.ps1 from your local machine to build and start the app."
