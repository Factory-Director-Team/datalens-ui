FROM mcr.microsoft.com/playwright:v1.48.2-noble
WORKDIR /opt/app
RUN npm install -g pnpm@10.17.1
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tests ./tests
COPY dist/public/sso-bridge.js ./dist/public/sso-bridge.js
CMD ["node", "node_modules/@playwright/test/cli.js", "test", "--config=tests/sso/playwright.config.ts"]
