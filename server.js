// Минимальный HTTP-сервер без единой зависимости.
//
// Зависимостей нет намеренно: `npm install` нечего скачивать, поэтому сборка в
// Prichal занимает секунды, а не минуты. Это приложение-образец — его смысл в
// том, чтобы человек нажал «Deploy» и почти сразу увидел свою страницу в сети.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prichal не подставляет PORT сам: контейнер обязан слушать тот порт, который
// указан в настройках сервиса (по умолчанию 8080). PORT поддержан на случай,
// если приложение запускают где-то ещё.
const PORT = Number(process.env.PORT) || 8080;

const STARTED_AT = Date.now();
const PAGE = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');

let requests = 0;

const info = () => ({
  status: 'ok',
  // hostname внутри Kubernetes — это имя пода. Видно, что страницу отдаёт
  // реальный контейнер в кластере, а не что-то закэшированное по дороге.
  instance: hostname(),
  node: process.version,
  startedAt: new Date(STARTED_AT).toISOString(),
  uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
  requests,
  // Заполняются, только если заданы в переменных окружения — выдумывать
  // значения нельзя, иначе страница будет врать о том, что задеплоено.
  commit: process.env.GIT_COMMIT || process.env.SOURCE_COMMIT || null,
  environment: process.env.APP_ENV || process.env.NODE_ENV || null,
});

const send = (res, code, type, body) => {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const server = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  // Health-пробы не должны накручивать счётчик запросов: иначе он показывает
  // активность кластера, а не живых посетителей.
  if (path === '/health' || path === '/healthz') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
  }

  if (path === '/api/info') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(info(), null, 2));
  }

  if (path === '/') {
    requests += 1;
    return send(res, 200, 'text/html; charset=utf-8', PAGE);
  }

  return send(res, 404, 'text/plain; charset=utf-8', 'Not Found\n');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`prichal-sample слушает 0.0.0.0:${PORT}`);
});

// Kubernetes гасит под через SIGTERM. Без обработчика Node умирает мгновенно и
// обрывает открытые соединения — при выкате это видно как ошибки в браузере.
const shutdown = (signal) => {
  console.log(`${signal} — закрываю сервер`);
  server.close(() => process.exit(0));
  // Страховка на случай зависших keep-alive соединений.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
