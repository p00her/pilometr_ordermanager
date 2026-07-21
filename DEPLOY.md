# Деплой order-manager

## 1. Сборка фронтенда

На компьютере с проектом:

```bash
cd order-manager
npm run build
```

Готовая сборка появится в папке `dist/`.

## 2. Загрузка на сервер

Загрузить содержимое `dist/` на сервер в директорию, к которой привязан домен `orders.pilometr.ru`:

```
/var/www/orders.pilometr.ru/  (или путь вашего хостинга)
├── index.html
├── assets/
│   ├── index-xxx.js
│   └── index-xxx.css
└── ...
```

## 3. Настройка Nginx (или Apache)

SPA должна отдавать `index.html` для всех маршрутов, а запросы к `/endpoint.php` — проксироваться на основной домен (там лежит PHP).

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name orders.pilometr.ru;

    root /var/www/orders.pilometr.ru;
    index index.html;

    # SPA — все маршруты на index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Прокси PHP-бэкенда на pilometr.ru
    location /endpoint.php {
        proxy_pass https://pilometr.ru/endpoint.php;
        proxy_set_header Host pilometr.ru;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache

```apache
<VirtualHost *:443>
    ServerName orders.pilometr.ru
    DocumentRoot /var/www/orders.pilometr.ru

    # SPA — все маршруты на index.html
    <Directory /var/www/orders.pilometr.ru>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    FallbackResource /index.html

    # Прокси PHP
    ProxyPass /endpoint.php https://pilometr.ru/endpoint.php
    ProxyPassReverse /endpoint.php https://pilometr.ru/endpoint.php
</VirtualHost>
```

Если нет `FallbackResource`, создайте `.htaccess` в корне:

```
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ /index.html [L]
```

## 4. Сессии

PHP-бэкенд на `pilometr.ru/endpoint.php` использует сессии. Браузер будет стучаться на `orders.pilometr.ru/endpoint.php`, Nginx проксирует на `pilometr.ru/endpoint.php`. Чтобы cookie сессии работала на обоих поддоменах, в самом начале `endpoint.php` (до `session_start()`) нужно указать общий домен:

```php
ini_set('session.cookie_domain', '.pilometr.ru');
@session_start();
```

## 5. Обновление

При каждом изменении кода:

```bash
npm run build
# заменить dist/ на сервере
# перезагружать Nginx не нужно — статика обновится сразу
```
